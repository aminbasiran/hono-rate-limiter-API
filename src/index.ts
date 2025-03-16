import { Hono } from 'hono'
import { Context } from 'hono'
import data from '../data.json'
import Redis from 'ioredis';
import FixedWindowRateLimiter from './utils/fixedWindowRL';


interface CustomContext extends Context {
    rateLimiter?: FixedWindowRateLimiter; // Add the rateLimiter property
}

// Extend the HonoRequest interface to include the ip property
interface HonoRequestWithIP {
    ip?: string; // Add the ip property
}

const app = new Hono()

// Create a single Redis connection to be shared
const redisConnection = new Redis({
    host: 'localhost',
    port: 6379,
})

// Create a single rate limiter instance to be shared
const rateLimiter = new FixedWindowRateLimiter(10, 0.2, 'minute', redisConnection)

// Middleware to apply rate limiting
app.use(async (c, next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.ip || '127.0.0.1';
    
    try {
        // Make sure to await ALL Redis operations
        const isAllowed = await rateLimiter.checkRateLimit(ip);
        
        if (!isAllowed) {
            const timeToReset = await rateLimiter.getTimeToReset(ip);
            
            c.header('X-RateLimit-Limit', '10');
            c.header('X-RateLimit-Remaining', '0');
            c.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + timeToReset));
            
            return c.json({ 
                error: 'Too many requests',
                message: `Rate limit exceeded. Try again in ${timeToReset} seconds.`
            }, 429);
        }
        
        // Get remaining requests - make sure to await this
        const remaining = await rateLimiter.getRemainingRequests(ip);
        const timeToReset = await rateLimiter.getTimeToReset(ip);
        
        c.header('X-RateLimit-Limit', '10');
        c.header('X-RateLimit-Remaining', String(remaining));
        c.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + timeToReset));
        
        // Proceed to next middleware
        await next();
    } catch (error) {
        console.error("Rate limiter error:", error);
        return c.json({ error: "Internal server error" }, 500);
    }
});


app.get('/', (c) => c.text('Hono!'))

app.get('/person/:id', (c) => {
    const id = c.req.param('id');
    const personIdx = Number(id);
    
    // Check if id is a valid number
    if (isNaN(personIdx)) {
        return c.json({ error: 'Invalid ID. Must be a number.' }, 400);
    }
    
    // Check if person exists
    if (!data.person || !data.person[personIdx]) {
        return c.json({ error: 'Person not found' }, 404);
    }
    
    const foundPerson = data.person[personIdx];
    return c.json(foundPerson);
});

// Clean up Redis connection when server closes
process.on('SIGINT', async () => {
    await rateLimiter.close();
    process.exit(0);
});

export default app