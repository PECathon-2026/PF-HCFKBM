import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbBootstrapped } from "@/db/turso";
import { PopularFeed, normalizeUrl, feedIdFromUrl } from "@/routes/discovery";
import { enforceNextRateLimit } from "@/lib/next-rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await enforceNextRateLimit(request, "discovery-popular");
    if (rateLimitResponse) return rateLimitResponse;
    await ensureDbBootstrapped();

    const feedsQuery = request.nextUrl.searchParams.get("feeds");
    let excludedFeedIds: string[] = [];

    if (feedsQuery && feedsQuery.trim()) {
      const rawList = feedsQuery.split(",").map((s) => s.trim()).filter(Boolean);
      excludedFeedIds = rawList
        .map((u) => normalizeUrl(u))
        .filter((u): u is string => Boolean(u))
        .map((u) => feedIdFromUrl(u));
    }

    const whereClause =
      excludedFeedIds.length > 0
        ? `WHERE f.id NOT IN (${excludedFeedIds.map(() => "?").join(",")})`
        : "";

    const sql = `
      SELECT
        f.id,
        f.url,
        COALESCE(f.title, f.url) as title,
        COUNT(DISTINCT bf.batch_id) as subscriber_count
      FROM feeds f
      LEFT JOIN batch_feeds bf ON f.id = bf.feed_id
      ${whereClause}
      GROUP BY f.id, f.url, f.title
      ORDER BY subscriber_count DESC, f.title ASC
      LIMIT 15;
    `;

    const results = await db.execute({ sql, args: excludedFeedIds });

    const items: PopularFeed[] = results.rows.map((row, index) => ({
      id: String(row.id),
      title: String(row.title),
      url: String(row.url),
      subscriberCount: Number(row.subscriber_count || 0),
      trendingRank: index + 1,
    }));

    return NextResponse.json({ items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: "Failed to fetch popular feeds", code: "INTERNAL_ERROR", details: message },
      { status: 500 }
    );
  }
}
