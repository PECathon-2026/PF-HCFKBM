import { Router, Request, Response, NextFunction } from "express";

export const discoveryRouter = Router();

// --- Type Signatures ---

export interface SubmitUrlsRequest {
  urls: string[];
}

export interface SubmitUrlsResponse {
  status: "ok";
  processed?: number;
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
  weight?: number;
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

// --- Routes ---

/**
 * POST /api/discovery/submit
 * Validates array of URLs, returns { status: "ok" }
 */
discoveryRouter.post("/submit", async (
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

    // Input sanitization & validation
    const invalidUrls: string[] = [];
    const validUrls: string[] = [];

    for (const rawUrl of urls) {
      if (typeof rawUrl !== "string") {
        invalidUrls.push(String(rawUrl));
        continue;
      }
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          validUrls.push(parsed.toString());
        } else {
          invalidUrls.push(rawUrl);
        }
      } catch {
        invalidUrls.push(rawUrl);
      }
    }

    if (invalidUrls.length > 0 && validUrls.length === 0) {
      res.status(422).json({
        error: "All provided URLs failed syntax validation",
        code: "VALIDATION_FAILED",
        details: invalidUrls,
      });
      return;
    }

    // TODO: Team members: Store validated feeds in Turso database ('feeds' and 'batch_feeds' tables)
    // TODO: Team members: Enqueue async discovery crawler jobs for valid URLs

    res.status(200).json({
      status: "ok",
      processed: validUrls.length,
      invalid: invalidUrls.length > 0 ? invalidUrls : undefined,
    });
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * GET /api/discovery/recommendations
 * Returns mock recommended feeds with reason string
 */
discoveryRouter.get("/recommendations", async (
  req: Request,
  res: Response<RecommendationsResponse | DiscoveryErrorResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    // TODO: Team members: Query user reading history, cluster preferences, and pull cosine similarity feeds from vector store / Turso
    const mockRecommendations: RecommendedFeed[] = [
      {
        id: "feed_rec_01",
        title: "Changelog Weekly",
        url: "https://changelog.com/weekly/feed",
        category: "Software Engineering",
        reason: "Frequently read by developers subscribed to your active tech tags",
        score: 0.94,
      },
      {
        id: "feed_rec_02",
        title: "Hacker News Top Stories",
        url: "https://news.ycombinator.com/rss",
        category: "Tech & Startups",
        reason: "High subscriber intersection with your library feeds",
        score: 0.88,
      },
      {
        id: "feed_rec_03",
        title: "TypeScript Weekly",
        url: "https://typescript-weekly.com/rss",
        category: "Languages",
        reason: "Matches your recent TypeScript discovery queries",
        score: 0.82,
      },
    ];

    res.status(200).json({
      items: mockRecommendations,
      total: mockRecommendations.length,
    });
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * GET /api/discovery/popular
 * Returns top feeds array
 */
discoveryRouter.get("/popular", async (
  req: Request,
  res: Response<PopularResponse | DiscoveryErrorResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    // TODO: Team members: Aggregate subscriber batches from Turso 'batch_feeds' & compute 7-day velocity
    const mockPopularFeeds: PopularFeed[] = [
      {
        id: "feed_pop_01",
        title: "BBC News World",
        url: "http://feeds.bbci.co.uk/news/world/rss.xml",
        subscriberCount: 14250,
        trendingRank: 1,
      },
      {
        id: "feed_pop_02",
        title: "Ars Technica",
        url: "https://feeds.arstechnica.com/arstechnica/index",
        subscriberCount: 9820,
        trendingRank: 2,
      },
      {
        id: "feed_pop_03",
        title: "Smashing Magazine",
        url: "https://www.smashingmagazine.com/feed/",
        subscriberCount: 6510,
        trendingRank: 3,
      },
    ];

    res.status(200).json({
      items: mockPopularFeeds,
    });
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * GET /api/discovery/graph
 * Returns { nodes: [], edges: [] }
 */
discoveryRouter.get("/graph", async (
  req: Request,
  res: Response<GraphResponse | DiscoveryErrorResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    // TODO: Team members: Generate graph representation of feed-to-feed co-occurrence and shared topics
    const mockGraphData: GraphResponse = {
      nodes: [
        { id: "node_1", label: "Tech News", type: "category" },
        { id: "node_2", label: "Hacker News", type: "feed" },
        { id: "node_3", label: "Ars Technica", type: "feed" },
      ],
      edges: [
        { source: "node_2", target: "node_1", relation: "belongs_to", weight: 1.0 },
        { source: "node_3", target: "node_1", relation: "belongs_to", weight: 0.9 },
        { source: "node_2", target: "node_3", relation: "co_subscribed", weight: 0.75 },
      ],
    };

    res.status(200).json(mockGraphData);
  } catch (error: unknown) {
    next(error);
  }
});
