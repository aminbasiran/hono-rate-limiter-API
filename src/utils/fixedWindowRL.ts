import Redis from "ioredis";


export default class FixedWindowRateLimiter {
    private rateLimit: number;
    private timeFrame: number;
    private timeFrameUnit: "minute" | "hour";
    private instance: Redis;
    private windowDuration: number; // Duration in seconds
  
    constructor(rateLimit: number, timeFrame: number, timeFrameUnit: "minute" | "hour", redisClient?: Redis) {
      this.rateLimit = rateLimit;
      this.timeFrame = timeFrame;
      this.timeFrameUnit = timeFrameUnit;
      this.instance = redisClient ?? this.createRedisInstance();
      
      // Calculate window duration in seconds
      this.windowDuration = this.timeFrame * (this.timeFrameUnit === "minute" ? 60 : 3600);
    }
  
    /**
     * Creates a new Redis instance
     */
    private createRedisInstance(): Redis {
      return new Redis({
        host: "localhost",
        port: 6379,
      });
    }
  
    /**
     * Returns the current timestamp in seconds
     */
    private getCurrentTimestamp(): number {
      return Math.floor(Date.now() / 1000);
    }
    
    /**
     * Gets the key name for an IP, including the current time window identifier
     */
    private getKeyName(ip: string): string {
      const windowId = Math.floor(this.getCurrentTimestamp() / this.windowDuration);
      return `rate_limit:${ip}:${windowId}`;
    }
      
    /**
     * Increments and sets expiry for a given key
     */
    private async incrementWithExpiry(key: string): Promise<number> {
      try {
        // Use multi to ensure atomicity
        const result = await this.instance.multi()
          .incr(key)
          .expire(key, this.windowDuration)
          .exec();
        
        if (!result || !result[0] || result[0][1] === null) {
          throw new Error("Redis multi() exec() returned null");
        }
  
        return result[0][1] as number;
      } catch (err) {
        console.error("Error in incrementWithExpiry:", err);
        return 0;
      }
    }
      
    /**
     * Checks if the rate limit has been exceeded for the given IP address
     * @returns true if the request is allowed, false if it exceeds the rate limit
     */
    public async checkRateLimit(ip: string): Promise<boolean> {
      if (!ip) {
        throw new Error("IP address is required");
      }
      
      const key = this.getKeyName(ip);
      
      try {
        const count = await this.incrementWithExpiry(key);
        
        // Log new rate limit window
        if (count === 1) {
          console.log(`New rate limit window started for ${ip} (${this.timeFrame} ${this.timeFrameUnit}(s))`);
        }
        
        return count <= this.rateLimit;
      } catch (err) {
        console.error("Error checking rate limit:", err);
        return false;
      }
    }
  
    /**
     * Gets the remaining number of requests allowed for an IP in the current window
     */
    public async getRemainingRequests(ip: string): Promise<number> {
      const key = this.getKeyName(ip);
      try {
        const count = await this.instance.get(key);
        const currentCount = count ? parseInt(count) : 0;
        return Math.max(0, this.rateLimit - currentCount);
      } catch (err) {
        console.error("Error getting remaining requests:", err);
        return 0;
      }
    }
  
    /**
     * Gets the time remaining in the current window in seconds
     */
    public async getTimeToReset(ip: string): Promise<number> {
      const key = this.getKeyName(ip);
      try {
        const ttl = await this.instance.ttl(key);
        return ttl > 0 ? ttl : this.windowDuration;
      } catch (err) {
        console.error("Error getting time to reset:", err);
        return this.windowDuration;
      }
    }
  
    /**
     * Manually reset rate limit for a specific IP
     */
    public async resetLimitForIp(ip: string): Promise<void> {
      const key = this.getKeyName(ip);
      try {
        await this.instance.del(key);
        console.log(`Rate limit manually reset for ${ip}`);
      } catch (err) {
        console.error("Error resetting rate limit for IP:", err);
      }
    }
  
    /**
     * Gracefully close the Redis connection
     */
    public async close() {
      try {
        await this.instance.quit();
        console.log("Redis connection closed");
      } catch (err) {
        console.error("Error closing Redis connection:", err);
      }
    }
  }
  