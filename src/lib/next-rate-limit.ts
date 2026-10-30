import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { db } from "@/db/turso";

const WINDOW_MS = 10_000;
const LIMIT = 30;
let limiter: Ratelimit | null | undefined;

function clientKey(request: NextRequest): string {
  // Vercel's trusted runtime header is preferred. Do not trust arbitrary forwarded
  // values unless the deployment explicitly configures a trusted proxy.
  const address = request.headers.get("x-real-ip") || request.headers.get("x-vercel-forwarded-for") || "anonymous";
  const salt = process.env.IP_SALT;
  if (!salt && process.env.NODE_ENV === "production") throw new Error("IP_SALT is required in production");
  return crypto.createHmac("sha256", salt || "development-only-salt").update(address).digest("hex").slice(0, 32);
}

function getLimiter(): Ratelimit | null {
  if (limiter !== undefined) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    limiter = null;
    return limiter;
  }
  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(LIMIT, "10 s"),
    analytics: false,
    prefix: "onlydevs:next-rate-limit",
  });
  return limiter;
}

export async function enforceNextRateLimit(request: NextRequest, route: string): Promise<Response | null> {
  const key = `${route}:${clientKey(request)}`;
  const upstash = getLimiter();
  if (upstash) {
    const result = await upstash.limit(key);
    if (!result.success) return new Response(JSON.stringify({ error: "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "10" } });
    return null;
  }

  const now = Date.now();
  const existing = await db.execute({ sql: "SELECT count, reset_at FROM rate_limits WHERE key = ?", args: [`next:${key}`] });
  if (!existing.rows.length || Number(existing.rows[0].reset_at) <= now) {
    await db.execute({ sql: "INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)", args: [`next:${key}`, now + WINDOW_MS] });
    return null;
  }

  const count = Number(existing.rows[0].count);
  if (count >= LIMIT) return new Response(JSON.stringify({ error: "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "10" } });
  await db.execute({ sql: "UPDATE rate_limits SET count = count + 1 WHERE key = ?", args: [`next:${key}`] });
  return null;
}
