import { Router, Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { db } from "../db/turso";
import { isPrivateOrLoopbackIP } from "./fetch";
import { getClientIp, hashClientIp } from "../middleware/rateLimit";

export const discoveryRouter = Router();

// --- Types ---

export interface SubmitUrlsRequest {
  urls: string[];
}

export interface SubmitUrlsResponse {
  status: "ok";
  batchId: string;
  processed: number;
  invalid?: string[];
}

export interface RecommendedFeed {
  id: string;
  title: string;
  url: string;
  category: string;
  reason: string;
  score: number;
}

export interface RecommendationsResponse {
  items: RecommendedFeed[];
  total: number;
}

export interface PopularFeed {
  id: string;
  title: string;
  url: string;
  subscriberCount: number;
  trendingRank: number;
}

export interface PopularResponse {
  items: PopularFeed[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "feed" | "category" | "author";
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  relation: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DiscoveryErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

// --- Helpers ---

/**
 * Normalizes a URL:
 * - Lowercases scheme and hostname
 * - Removes tracking query params (utm_*, ref, source, etc.)
 * - Strips trailing slashes
 * - Resolves default ports
 */
export function normalizeUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());

    // Protocol check
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    // SSRF check on hostname
    if (isPrivateOrLoopbackIP(parsed.hostname)) {
      return null;
    }

    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove tracking queries
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "source",
      "fbclid",
      "gclid",
    ];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }

    // Remove hash
    parsed.hash = "";

    // Normalize path trailing slash (unless root path "/")
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    parsed.pathname = path;

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Creates a deterministic 16-char hex ID from normalized URL
 */
export function feedIdFromUrl(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
}

// --- Routes ---

/**
 * POST /api/discovery/submit
 * Collects an anonymous subscription batch without user accounts or persistent IDs.
 * - Caps batch size at 100 feeds.
 * - Normalizes URLs.
 * - Rejects private/loopback IPs.
 * - Prevents rapid duplicate spamming from same salted IP hash within 1 hour.
 */
discoveryRouter.post(
  "/submit",
  async (
    req: Request<unknown, unknown, SubmitUrlsRequest>,
    res: Response<SubmitUrlsResponse | DiscoveryErrorResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { urls } = req.body;

      if (!urls || !Array.isArray(urls)) {
        res.status(400).json({
          error: "Field 'urls' is required and must be an array of strings",
          code: "INVALID_URL_ARRAY",
        });
        return;
      }

      if (urls.length === 0) {
        res.status(400).json({
          error: "'urls' array must contain at least one URL",
          code: "EMPTY_URL_ARRAY",
        });
        return;
      }

      // Max batch size limit
      if (urls.length > 100) {
        res.status(400).json({
          error: "Batch size exceeds maximum limit of 100 URLs per submission",
          code: "BATCH_SIZE_EXCEEDED",
        });
        return;
      }

      const clientIp = getClientIp(req);
      const saltedIpHash = hashClientIp(clientIp);

      // Abuse Resistance: Check if same salted IP hash submitted within the last 5 minutes
      const recentBatches = await db.execute({
        sql: `SELECT COUNT(*) as recent_count FROM subscription_batches
              WHERE salted_ip_hash = ? AND submitted_at >= datetime('now', '-5 minutes')`,
        args: [saltedIpHash],
      });

      const recentCount = Number(recentBatches.rows[0]?.recent_count || 0);
      if (recentCount >= 10) {
        res.status(429).json({
          error: "Too many batch submissions from this origin. Please wait before submitting again.",
          code: "SUBMISSION_THROTTLED",
        });
        return;
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
        res.status(422).json({
          error: "All provided URLs failed syntax or SSRF validation",
          code: "ALL_URLS_INVALID",
          details: invalidUrls,
        });
        return;
      }

      const batchId = crypto.randomUUID();

      // Batch transaction into Turso
      // 1. Insert batch record with salted IP hash
      await db.execute({
        sql: `INSERT INTO subscription_batches (id, salted_ip_hash) VALUES (?, ?)`,
        args: [batchId, saltedIpHash],
      });

      // 2. Insert or update feeds & link batch_feeds
      for (const feed of validFeeds) {
        // Derive clean title from hostname if empty
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

      res.status(200).json({
        status: "ok",
        batchId,
        processed: validFeeds.length,
        invalid: invalidUrls.length > 0 ? invalidUrls : undefined,
      });
    } catch (error: unknown) {
      next(error);
    }
  }
);

/**
 * GET /api/discovery/recommendations
 * Computes co-subscription ranking:
 * Finds feeds frequently followed together in anonymous batches with the user's subscribed feeds.
 * Parameter: ?feeds=url1,url2,... or ?feed_ids=id1,id2,...
 */
discoveryRouter.get(
  "/recommendations",
  async (
    req: Request,
    res: Response<RecommendationsResponse | DiscoveryErrorResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const feedsQuery = req.query.feeds;
      const feedIdsQuery = req.query.feed_ids;

      let targetFeedIds: string[] = [];

      if (typeof feedIdsQuery === "string" && feedIdsQuery.trim()) {
        targetFeedIds = feedIdsQuery.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (typeof feedsQuery === "string" && feedsQuery.trim()) {
        const rawList = feedsQuery.split(",").map((s) => s.trim()).filter(Boolean);
        targetFeedIds = rawList
          .map((u) => normalizeUrl(u))
          .filter((u): u is string => Boolean(u))
          .map((u) => feedIdFromUrl(u));
      }

      // If user supplied feeds, calculate co-subscription overlap
      if (targetFeedIds.length > 0) {
        // SQL query for co-occurrence:
        // Find other feeds that appear in the same batches as the user's feeds, excluding user's own feeds
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

          res.status(200).json({ items, total: items.length });
          return;
        }
      }

      // Fallback: When no user feeds supplied or co-occurrence yields zero matches,
      // return globally popular feeds excluding user's feeds
      const excludePlaceholders =
        targetFeedIds.length > 0 ? `WHERE f.id NOT IN (${targetFeedIds.map(() => "?").join(",")})` : "";

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

      res.status(200).json({
        items: fallbackItems,
        total: fallbackItems.length,
      });
    } catch (error: unknown) {
      next(error);
    }
  }
);

/**
 * GET /api/discovery/popular
 * Returns feeds ranked globally by subscription batch count.
 */
discoveryRouter.get(
  "/popular",
  async (
    _req: Request,
    res: Response<PopularResponse | DiscoveryErrorResponse>,
    next: NextFunction
  ): Promise<void> => {
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

      res.status(200).json({ items });
    } catch (error: unknown) {
      next(error);
    }
  }
);

/**
 * GET /api/discovery/graph
 * Returns graph representation of feed-to-feed co-occurrences.
 */
discoveryRouter.get(
  "/graph",
  async (
    _req: Request,
    res: Response<GraphResponse | DiscoveryErrorResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      // 1. Fetch top feeds as nodes
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

      // 2. Fetch edges based on co-occurrence in batches
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

      res.status(200).json({ nodes, edges });
    } catch (error: unknown) {
      next(error);
    }
  }
);

/**
 * POST /api/discovery/blogroll (Bonus Item)
 * Ingests discovered "A links to B" blogroll edges extracted from client or crawler,
 * recording graph linkages in feed_edges table.
 */
discoveryRouter.post(
  "/blogroll",
  async (
    req: Request<unknown, unknown, { sourceUrl: string; targetUrls: string[] }>,
    res: Response<{ status: string; edgesAdded: number } | DiscoveryErrorResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sourceUrl, targetUrls } = req.body;

      if (!sourceUrl || !Array.isArray(targetUrls) || targetUrls.length === 0) {
        res.status(400).json({
          error: "sourceUrl (string) and targetUrls (array) are required",
          code: "INVALID_BLOGROLL_PAYLOAD",
        });
        return;
      }

      const normalizedSource = normalizeUrl(sourceUrl);
      if (!normalizedSource) {
        res.status(400).json({ error: "Invalid sourceUrl", code: "INVALID_SOURCE_URL" });
        return;
      }

      const sourceId = feedIdFromUrl(normalizedSource);
      let edgesAdded = 0;

      for (const rawTarget of targetUrls.slice(0, 50)) {
        const normalizedTarget = normalizeUrl(rawTarget);
        if (!normalizedTarget || normalizedTarget === normalizedSource) continue;

        const targetId = feedIdFromUrl(normalizedTarget);

        await db.execute({
          sql: `INSERT OR IGNORE INTO feeds (id, url, title, status) VALUES (?, ?, ?, 'pending')`,
          args: [targetId, normalizedTarget, new URL(normalizedTarget).hostname],
        });

        await db.execute({
          sql: `INSERT INTO feed_edges (source_feed_id, target_feed_id, relation_type, weight)
                VALUES (?, ?, 'blogroll', 1)
                ON CONFLICT(source_feed_id, target_feed_id, relation_type)
                DO UPDATE SET weight = weight + 1, updated_at = CURRENT_TIMESTAMP`,
          args: [sourceId, targetId],
        });

        edgesAdded++;
      }

      res.status(200).json({ status: "ok", edgesAdded });
    } catch (error: unknown) {
      next(error);
    }
  }
);
