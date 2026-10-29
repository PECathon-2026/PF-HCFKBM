import { NextResponse } from "next/server";
import { db } from "@/db/turso";
import { PopularFeed } from "@/routes/discovery";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = `
      SELECT
        f.id,
        f.url,
        COALESCE(f.title, f.url) as title,
        COUNT(bf.batch_id) as subscriber_count
      FROM feeds f
      LEFT JOIN batch_feeds bf ON f.id = bf.feed_id
      GROUP BY f.id, f.url, f.title
      ORDER BY subscriber_count DESC
      LIMIT 15;
    `;

    const results = await db.execute(sql);

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
