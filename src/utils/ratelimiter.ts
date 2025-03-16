// import Redis from 'ioredis';

// class RateLimiter {
//     private rateLimit: number;
//     private timeFrame: number;
//     private number: number;
//     private redis: Redis.Redis;

//     constructor(rateLimit: number, timeFrame: number, redisClient: Redis.Redis) {
//         this.rateLimit = rateLimit;
//         this.timeFrame = timeFrame;
//         this.counter = 0;
//         this.redis = redisClient;
//     }

//     private getCurrentTimestamp(): number {
//         return Math.floor(Date.now() / 1000); // Return timestamp in seconds
//     }

//     public async allowRequest(ip: string): Promise<boolean> {
//         const currentTime = this.getCurrentTimestamp();
//         const key = `rate_limit:${ip}`;

//         // Start a transaction
//         const pipeline = this.redis.pipeline();

//         // Remove timestamps older than the time frame
//         pipeline.zremrangebyscore(key, 0, currentTime - this.timeFrame);
        
//         // Add the current timestamp to the sorted set
//         pipeline.zadd(key, currentTime, currentTime);
        
//         // Get the count of requests in the current time frame
//         pipeline.zcard(key);
        
//         // Execute the transaction
//         const results = await pipeline.exec();
//         const requestCount = results[2][1]; // Get the count from the results

//         // Check if the request count exceeds the rate limit
//         if (requestCount <= this.rateLimit) {
//             return true; // Request allowed
//         }

//         return false; // Request denied
//     }
// }