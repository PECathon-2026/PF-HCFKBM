import { Request, Response, NextFunction } from "express";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimitInstance: Ratelimit | null = null;

/**
 * Initializes Upstash Ratelimit if credentials are provided in env.
 * Follows upstash-ratelimit-js best practices (sliding window algorithm).
 */
export function getRateLimiter(): Ratelimit | null {
  if (ratelimitInstance) return ratelimitInstance;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // In development or when Upstash is not configured, warn and return null (rate limiting pass-through)
    return null;
  }

  const redis = new Redis({ url, token });
  ratelimitInstance = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "10s"), // 20 requests per 10s sliding window
    analytics: true,
    prefix: "onlydevs:ratelimit",
  });

  return ratelimitInstance;
}

/**
 * Express middleware for rate limiting using Upstash or falling back safely.
 */
export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const limiter = getRateLimiter();

  // If no Upstash credentials configured, pass through (or team members can plug in Turso rate_limits table)
  if (!limiter) {
    // TODO: Team members can implement fallback rate limiting using SQLite 'rate_limits' table
    return next();
  }

  try {
    const identifier = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "anonymous";
    const { success, limit, remaining, reset } = await limiter.limit(identifier);

    res.setHeader("X-RateLimit-Limit", limit.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", reset.toString());

    if (!success) {
      res.status(429).json({
        error: "Too many requests. Please slow down.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfterMs: Math.max(0, reset - Date.now()),
      });
      return;
    }

    next();
  } catch (error) {
    // Fail open or closed based on security policy; default to fail-open with log
    console.error("[RateLimit Middleware Error]:", error);
    next();
  }
}
