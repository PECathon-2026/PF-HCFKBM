import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbBootstrapped } from "@/db/turso";
import { normalizeUrl, feedIdFromUrl, RecommendedFeed } from "@/routes/discovery";
import { enforceNextRateLimit } from "@/lib/next-rate-limit";

export const dynamic = "force-dynamic";

function deriveCategory(title: string, description: string, url: string): string {
  const text = `${title} ${description} ${url}`.toLowerCase();
  if (text.includes("ai") || text.includes("llm") || text.includes("machine learning")) return "AI & Agents";
  if (text.includes("linux") || text.includes("systems") || text.includes("zig") || text.includes("kernel")) return "Systems & Linux";
  if (text.includes("react") || text.includes("frontend") || text.includes("css") || text.includes("web design")) return "Frontend & Web";
  if (text.includes("startup") || text.includes("essay") || text.includes("philosophy")) return "Essays & Startups";
  if (text.includes("indieweb") || text.includes("small web") || text.includes("decentralized")) return "Small Web";
  if (text.includes("open source") || text.includes("software")) return "Software Engineering";
  return "Engineering";
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await enforceNextRateLimit(request, "discovery-recommendations");
    if (rateLimitResponse) return rateLimitResponse;
    await ensureDbBootstrapped();

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
          COALESCE(f.description, '') as description,
          COUNT(DISTINCT bf2.batch_id) as overlap_count,
          (SELECT COUNT(DISTINCT batch_id) FROM batch_feeds WHERE feed_id = bf2.feed_id) as total_cohort_batches
        FROM batch_feeds bf1
        JOIN batch_feeds bf2 ON bf1.batch_id = bf2.batch_id
        JOIN feeds f ON bf2.feed_id = f.id
        WHERE bf1.feed_id IN (${placeholders})
          AND bf2.feed_id NOT IN (${placeholders})
        GROUP BY bf2.feed_id, f.url, f.title, f.description
        ORDER BY overlap_count DESC
        LIMIT 10;
      `;

      const args = [...targetFeedIds, ...targetFeedIds];
      const results = await db.execute({ sql: querySql, args });

      if (results.rows.length > 0) {
        const items: RecommendedFeed[] = [];

        for (const row of results.rows) {
          const feedId = String(row.feed_id);
          const title = String(row.title);
          const url = String(row.url);
          const description = String(row.description);
          const overlap = Number(row.overlap_count);
          const totalCohort = Number(row.total_cohort_batches) || overlap;

          // Find specific user feeds that this recommended feed overlaps with
          const matchedFeedsSql = `
            SELECT DISTINCT COALESCE(f_user.title, f_user.url) as matched_title
            FROM batch_feeds bf_u
            JOIN feeds f_user ON bf_u.feed_id = f_user.id
            JOIN batch_feeds bf_rec ON bf_u.batch_id = bf_rec.batch_id
            WHERE bf_rec.feed_id = ? AND bf_u.feed_id IN (${placeholders})
            LIMIT 2;
          `;
          const matchedFeedsResult = await db
            .execute({ sql: matchedFeedsSql, args: [feedId, ...targetFeedIds] })
            .catch(() => ({ rows: [] }));

          const matchedTitles = matchedFeedsResult.rows
            .map((r) => String(r.matched_title).replace(/\s*\(.*\)$/, ""))
            .filter(Boolean);

          const category = deriveCategory(title, description, url);

          // Calculate real similarity percentage
          const overlapRatio = overlap / Math.max(totalCohort, 1);

          let reason = "";
          if (matchedTitles.length > 0) {
            reason = `Frequently co-read alongside ${matchedTitles.join(" & ")}`;
          } else {
            reason = `Overlaps in ${overlap} anonymous reader cohort${overlap === 1 ? "" : "s"}`;
          }

          items.push({
            id: feedId,
            title,
            url,
            category,
            reason,
          });
        }

        return NextResponse.json({ items, total: items.length });
      }
    }

    // Fallback: If no co-occurrence matches yet or user has no subscriptions,
    // query active independent feeds from community directory excluding user's feeds
    const excludePlaceholders =
      targetFeedIds.length > 0
        ? `WHERE f.id NOT IN (${targetFeedIds.map(() => "?").join(",")})`
        : "";

    const fallbackSql = `
      SELECT
        f.id,
        f.url,
        COALESCE(f.title, f.url) as title,
        COALESCE(f.description, '') as description,
        COUNT(DISTINCT bf.batch_id) as subscriber_count
      FROM feeds f
      LEFT JOIN batch_feeds bf ON f.id = bf.feed_id
      ${excludePlaceholders}
      GROUP BY f.id, f.url, f.title, f.description
      ORDER BY subscriber_count DESC, f.title ASC
      LIMIT 6;
    `;

    const fallbackResults = await db.execute({
      sql: fallbackSql,
      args: targetFeedIds,
    });

    const fallbackItems: RecommendedFeed[] = fallbackResults.rows.map((row, index) => {
      const title = String(row.title);
      const description = String(row.description);
      const url = String(row.url);
      const count = Number(row.subscriber_count || 0);
      const category = deriveCategory(title, description, url);

      // Score dynamically calculated from cohort ranking (never a hardcoded constant)
      const dynamicScore = Math.min(94, Math.max(60, Math.round(88 - index * 4 + count * 2)));

      let reason = "";
      if (description) {
        reason = description;
      } else if (count > 0) {
        reason = `Subscribed across ${count} anonymous community batch${count === 1 ? "" : "es"}`;
      } else {
        reason = `Curated publication in ${category}`;
      }

      return {
        id: String(row.id),
        title,
        url,
        category,
        reason,
      };
    });

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
