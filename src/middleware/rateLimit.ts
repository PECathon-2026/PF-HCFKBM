import { Request, Response, NextFunction } from "express";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import crypto from "node:crypto";
import { db } from "../db/turso";

let ratelimitInstance: Ratelimit | null = null;

/**
 * Creates a salted hash of an IP address with daily rotation.
 * Ensures the server never stores plain IP addresses.
 */
export function hashClientIp(ip: string): string {
  const salt = process.env.IP_SALT || "onlydevs_secure_discovery_salt_v1";
  const dateBucket = new Date().toISOString().slice(0, 13); // Rotates every hour
  return crypto
    .createHmac("sha256", salt)
    .update(`${dateBucket}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Extracts client IP from request headers or socket.
 */
export function getClientIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.socket.remoteAddress || "127.0.0.1";
}

/**
 * Initializes Upstash Ratelimit if credentials are provided in env.
 * Follows upstash-ratelimit-js best practices (sliding window algorithm).
 */
export function getUpstashRateLimiter(): Ratelimit | null {
  if (ratelimitInstance) return ratelimitInstance;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  const redis = new Redis({ url, token });
  ratelimitInstance = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "10s"), // 30 requests per 10s sliding window
    analytics: true,
    prefix: "onlydevs:ratelimit",
  });

  return ratelimitInstance;
}

/**
 * SQLite-backed rate limiter fallback using Turso 'rate_limits' table.
 * Used when Upstash credentials are not configured.
 */
async function checkSqliteRateLimit(
  key: string,
  limit = 30,
  windowMs = 10000
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const now = Date.now();
  const resetAt = now + windowMs;

  try {
    // Delete expired records
    await db.execute({
      sql: "DELETE FROM rate_limits WHERE reset_at < ?",
      args: [now],
    });

    // Check existing
    const existing = await db.execute({
      sql: "SELECT count, reset_at FROM rate_limits WHERE key = ?",
      args: [key],
    });

    if (existing.rows.length === 0) {
      await db.execute({
        sql: "INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)",
        args: [key, resetAt],
      });
      return { success: true, limit, remaining: limit - 1, reset: resetAt };
    }

    const currentCount = Number(existing.rows[0].count);
    const currentReset = Number(existing.rows[0].reset_at);

    if (currentCount >= limit) {
      return { success: false, limit, remaining: 0, reset: currentReset };
    }

    await db.execute({
      sql: "UPDATE rate_limits SET count = count + 1 WHERE key = ?",
      args: [key],
    });

    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - (currentCount + 1)),
      reset: currentReset,
    };
  } catch (error) {
    console.error("[RateLimit Fallback Error]:", error);
    // Fail-open on DB rate limit errors so traffic isn't dropped unexpectedly
    return { success: true, limit, remaining: 1, reset: resetAt };
  }
}

/**
 * Express middleware for rate limiting using Upstash or SQLite fallback.
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip = getClientIp(req);
  const identifier = hashClientIp(ip);
  const upstashLimiter = getUpstashRateLimiter();

  try {
    let result: { success: boolean; limit: number; remaining: number; reset: number };

    if (upstashLimiter) {
      result = await upstashLimiter.limit(identifier);
    } else {
      result = await checkSqliteRateLimit(`rl:${identifier}`);
    }

    res.setHeader("X-RateLimit-Limit", result.limit.toString());
    res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
    res.setHeader("X-RateLimit-Reset", result.reset.toString());

    if (!result.success) {
      res.status(429).json({
        error: "Rate limit exceeded. Please throttle requests.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfterMs: Math.max(0, result.reset - Date.now()),
      });
      return;
    }

    next();
  } catch (error) {
    console.error("[RateLimit Middleware Unhandled Error]:", error);
    next();
  }
}
