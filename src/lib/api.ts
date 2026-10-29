/**
 * API client wrappers for OnlyDevs Server
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export interface SubmitUrlsPayload {
  urls: string[];
}

export interface SubmitUrlsResult {
  status: "ok";
  processed?: number;
  invalid?: string[];
}

export interface RecommendedFeedItem {
  id: string;
  title: string;
  url: string;
  category: string;
  reason: string;
  score: number;
}

export interface RecommendationsResult {
  items: RecommendedFeedItem[];
  total: number;
}

export interface PopularFeedItem {
  id: string;
  title: string;
  url: string;
  subscriberCount: number;
  trendingRank: number;
}

export interface PopularResult {
  items: PopularFeedItem[];
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

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Calls server proxy endpoint (/fetch or /api/fetch) to fetch upstream feed or article content
 * with SSRF protection and CORS bypass.
 */
export async function fetchProxy(targetUrl: string): Promise<string> {
  const endpoint = `${API_BASE_URL}/fetch?url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "*/*",
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error || `Proxy fetch failed with status: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

/**
 * Submits an array of URLs to /api/discovery/submit
 */
export async function submitDiscoveryUrls(urls: string[]): Promise<SubmitUrlsResult> {
  const response = await fetch(`${API_BASE_URL}/api/discovery/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ urls }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || "Failed to submit discovery URLs");
  }

  return response.json();
}

/**
 * Fetches feed recommendations from /api/discovery/recommendations
 */
export async function getDiscoveryRecommendations(): Promise<RecommendationsResult> {
  const response = await fetch(`${API_BASE_URL}/api/discovery/recommendations`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch recommendations: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetches popular/trending feeds from /api/discovery/popular
 */
export async function getPopularFeeds(): Promise<PopularResult> {
  const response = await fetch(`${API_BASE_URL}/api/discovery/popular`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch popular feeds: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetches discovery graph network from /api/discovery/graph
 */
export async function getDiscoveryGraph(): Promise<GraphResult> {
  const response = await fetch(`${API_BASE_URL}/api/discovery/graph`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch discovery graph: ${response.statusText}`);
  }

  return response.json();
}
