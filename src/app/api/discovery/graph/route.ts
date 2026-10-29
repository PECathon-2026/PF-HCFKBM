import { NextResponse } from "next/server";
import { db } from "@/db/turso";
import { GraphNode, GraphEdge } from "@/routes/discovery";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const nodesResult = await db.execute(`
      SELECT f.id, COALESCE(f.title, f.url) as label
      FROM feeds f
      LIMIT 20;
    `);

    const nodes: GraphNode[] = nodesResult.rows.map((r) => ({
      id: String(r.id),
      label: String(r.label),
      type: "feed",
    }));

    const edgesResult = await db.execute(`
      SELECT
        bf1.feed_id as source,
        bf2.feed_id as target,
        COUNT(*) as weight
      FROM batch_feeds bf1
      JOIN batch_feeds bf2 ON bf1.batch_id = bf2.batch_id AND bf1.feed_id < bf2.feed_id
      GROUP BY bf1.feed_id, bf2.feed_id
      ORDER BY weight DESC
      LIMIT 50;
    `);

    const edges: GraphEdge[] = edgesResult.rows.map((e) => ({
      source: String(e.source),
      target: String(e.target),
      weight: Number(e.weight),
      relation: "co_subscribed",
    }));

    return NextResponse.json({ nodes, edges });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: "Failed to fetch discovery graph", code: "INTERNAL_ERROR", details: message },
      { status: 500 }
    );
  }
}
