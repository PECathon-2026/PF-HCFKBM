import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db, ensureDbBootstrapped } from "@/db/turso";
import { normalizeUrl, feedIdFromUrl } from "@/routes/discovery";
import { getClientIp, hashClientIp } from "@/middleware/rateLimit";
import { enforceNextRateLimit } from "@/lib/next-rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await enforceNextRateLimit(request, "discovery-submit");
    if (rateLimitResponse) return rateLimitResponse;
    await ensureDbBootstrapped();
    const body = await request.json().catch(() => ({}));
    const { urls } = body;

    if (!urls || !Array.isArray(urls)) {
      return NextResponse.json(
        { error: "Field 'urls' is required and must be an array of strings", code: "INVALID_URL_ARRAY" },
        { status: 400 }
      );
    }

    if (urls.length === 0) {
      return NextResponse.json(
        { error: "'urls' array must contain at least one URL", code: "EMPTY_URL_ARRAY" },
        { status: 400 }
      );
    }

    if (urls.length > 100) {
      return NextResponse.json(
        { error: "Batch size exceeds maximum limit of 100 URLs per submission", code: "BATCH_SIZE_EXCEEDED" },
        { status: 400 }
      );
    }

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";
    const saltedIpHash = hashClientIp(clientIp);

    // Abuse Resistance: Check if same salted IP hash submitted within last 5 minutes
    const recentBatches = await db.execute({
      sql: `SELECT COUNT(*) as recent_count FROM subscription_batches
            WHERE salted_ip_hash = ? AND submitted_at >= datetime('now', '-5 minutes')`,
      args: [saltedIpHash],
    });

    const recentCount = Number(recentBatches.rows[0]?.recent_count || 0);
    if (recentCount >= 10) {
      return NextResponse.json(
        { error: "Too many batch submissions from this origin. Please wait before submitting again.", code: "SUBMISSION_THROTTLED" },
        { status: 429 }
      );
    }

    const validFeeds: { id: string; url: string }[] = [];
    const invalidUrls: string[] = [];

    for (const raw of urls) {
      if (typeof raw !== "string") {
        invalidUrls.push(String(raw));
        continue;
      }

      const normalized = normalizeUrl(raw);
      if (!normalized) {
        invalidUrls.push(raw);
        continue;
      }

      const feedId = feedIdFromUrl(normalized);
      if (!validFeeds.some((f) => f.id === feedId)) {
        validFeeds.push({ id: feedId, url: normalized });
      }
    }

    if (validFeeds.length === 0) {
      return NextResponse.json(
        { error: "All provided URLs failed syntax or SSRF validation", code: "ALL_URLS_INVALID", details: invalidUrls },
        { status: 422 }
      );
    }

    const batchId = crypto.randomUUID();

    await db.execute({
      sql: `INSERT INTO subscription_batches (id, salted_ip_hash) VALUES (?, ?)`,
      args: [batchId, saltedIpHash],
    });

    for (const feed of validFeeds) {
      const titleCandidate = new URL(feed.url).hostname.replace(/^www\./, "");

      await db.execute({
        sql: `INSERT INTO feeds (id, url, title, status)
              VALUES (?, ?, ?, 'active')
              ON CONFLICT(id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
        args: [feed.id, feed.url, titleCandidate],
      });

      await db.execute({
        sql: `INSERT OR IGNORE INTO batch_feeds (batch_id, feed_id) VALUES (?, ?)`,
        args: [batchId, feed.id],
      });
    }

    return NextResponse.json({
      status: "ok",
      batchId,
      processed: validFeeds.length,
      invalid: invalidUrls.length > 0 ? invalidUrls : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: "Batch submission failed", code: "INTERNAL_ERROR", details: message },
      { status: 500 }
    );
  }
}
