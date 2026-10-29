import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/turso";
import { normalizeUrl, feedIdFromUrl, RecommendedFeed } from "@/routes/discovery";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const feedsQuery = request.nextUrl.searchParams.get("feeds");
    const feedIdsQuery = request.nextUrl.searchParams.get("feed_ids");

    let targetFeedIds: string[] = [];

    if (feedIdsQuery && feedIdsQuery.trim()) {
      targetFeedIds = feedIdsQuery.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (feedsQuery && feedsQuery.trim()) {
      const rawList = feedsQuery.split(",").map((s) => s.trim()).filter(Boolean);
      targetFeedIds = rawList
        .map((u) => normalizeUrl(u))
        .filter((u): u is string => Boolean(u))
        .map((u) => feedIdFromUrl(u));
    }

    if (targetFeedIds.length > 0) {
      const placeholders = targetFeedIds.map(() => "?").join(",");
      const querySql = `
        SELECT
          bf2.feed_id,
          f.url,
          COALESCE(f.title, f.url) as title,
          COUNT(DISTINCT bf2.batch_id) as overlap_count
        FROM batch_feeds bf1
        JOIN batch_feeds bf2 ON bf1.batch_id = bf2.batch_id
        JOIN feeds f ON bf2.feed_id = f.id
        WHERE bf1.feed_id IN (${placeholders})
          AND bf2.feed_id NOT IN (${placeholders})
        GROUP BY bf2.feed_id, f.url, f.title
        ORDER BY overlap_count DESC
        LIMIT 10;
      `;

      const args = [...targetFeedIds, ...targetFeedIds];
      const results = await db.execute({ sql: querySql, args });

      if (results.rows.length > 0) {
        const items: RecommendedFeed[] = results.rows.map((row) => {
          const overlap = Number(row.overlap_count);
          const score = Math.min(99, Math.round(50 + overlap * 10));
          return {
            id: String(row.feed_id),
            title: String(row.title),
            url: String(row.url),
            category: "Co-Subscribed",
            reason: `Followed by ${overlap} reader${overlap === 1 ? "" : "s"} of your active blogs`,
            score,
          };
        });

        return NextResponse.json({ items, total: items.length });
      }
    }

    const excludePlaceholders =
      targetFeedIds.length > 0
        ? `WHERE f.id NOT IN (${targetFeedIds.map(() => "?").join(",")})`
        : "";

    const fallbackSql = `
      SELECT
        f.id,
        f.url,
        COALESCE(f.title, f.url) as title,
        COUNT(bf.batch_id) as subscriber_count
      FROM feeds f
      LEFT JOIN batch_feeds bf ON f.id = bf.feed_id
      ${excludePlaceholders}
      GROUP BY f.id, f.url, f.title
      ORDER BY subscriber_count DESC
      LIMIT 6;
    `;

    const fallbackResults = await db.execute({
      sql: fallbackSql,
      args: targetFeedIds,
    });

    const fallbackItems: RecommendedFeed[] = fallbackResults.rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      url: String(row.url),
      category: "Popular Independent",
      reason: "Trending among independent small web readers",
      score: 80,
    }));

    return NextResponse.json({
      items: fallbackItems,
      total: fallbackItems.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: "Failed to fetch recommendations", code: "INTERNAL_ERROR", details: message },
      { status: 500 }
    );
  }
}
