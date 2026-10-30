/**
 * API client wrappers for OnlyDevs Server
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export interface SubmitUrlsPayload {
  urls: string[];
}

export interface SubmitUrlsResult {
  status: "ok";
  batchId: string;
  processed: number;
  invalid?: string[];
}

export interface RecommendedFeedItem {
  id: string;
  title: string;
  url: string;
  category: string;
  reason: string;
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
  weight: number;
  relation: string;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface FetchProxyOptions {
  etag?: string;
  lastModified?: string;
}

/**
 * Calls server proxy endpoint (/fetch) to fetch upstream feed or article content
 * with SSRF protection, CORS bypass, and conditional HTTP caching support.
 */
export async function fetchProxy(
  targetUrl: string,
  options?: FetchProxyOptions
): Promise<{ status: number; text: string; etag?: string; lastModified?: string }> {
  const endpoint = `${API_BASE_URL}/fetch?url=${encodeURIComponent(targetUrl)}`;
  const headers: Record<string, string> = {
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*",
  };

  if (options?.etag) {
    headers["If-None-Match"] = options.etag;
  }
  if (options?.lastModified) {
    headers["If-Modified-Since"] = options.lastModified;
  }

  const response = await fetch(endpoint, { headers });

  if (response.status === 304) {
    return {
      status: 304,
      text: "",
      etag: response.headers.get("etag") || undefined,
      lastModified: response.headers.get("last-modified") || undefined,
    };
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error || `Proxy fetch failed with status: ${response.status} ${response.statusText}`
    );
  }

  const text = await response.text();
  return {
    status: response.status,
    text,
    etag: response.headers.get("etag") || undefined,
    lastModified: response.headers.get("last-modified") || undefined,
  };
}

/**
 * Submits an anonymous array of URLs to /api/discovery/submit
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
 * Fetches feed recommendations from /api/discovery/recommendations based on user's feeds
 */
export async function getDiscoveryRecommendations(userFeedUrls: string[] = []): Promise<RecommendationsResult> {
  let endpoint = `${API_BASE_URL}/api/discovery/recommendations`;
  if (userFeedUrls.length > 0) {
    const query = encodeURIComponent(userFeedUrls.join(","));
    endpoint += `?feeds=${query}`;
  }

  const response = await fetch(endpoint, {
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
export async function getPopularFeeds(userFeedUrls: string[] = []): Promise<PopularResult> {
  let endpoint = `${API_BASE_URL}/api/discovery/popular`;
  if (userFeedUrls.length > 0) {
    const query = encodeURIComponent(userFeedUrls.join(","));
    endpoint += `?feeds=${query}`;
  }

  const response = await fetch(endpoint, {
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
