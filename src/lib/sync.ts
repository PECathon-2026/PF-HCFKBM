import {
  db,
  type Subscription,
  type Article,
  type SubscriptionStatus,
  getSubscriptions,
  updateSubscription,
} from "./db";
import { parseFeed } from "./parser";

const API_BASE_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || ""
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const DEFAULT_TIMEOUT_MS = 10000; // 10s request timeout
const BASE_BACKOFF_MS = 60 * 1000; // 1 minute base
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24 hours max backoff

export interface FeedRefreshResult {
  subscriptionId: string;
  url: string;
  success: boolean;
  notModified?: boolean;
  newArticlesCount?: number;
  skipped?: boolean;
  error?: string;
}

export interface SyncSummary {
  totalFeeds: number;
  refreshed: number;
  notModified: number;
  skipped: number;
  failed: number;
  results: FeedRefreshResult[];
}

/**
 * Deterministic hash generator for stable article IDs.
 */
export function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function generateArticleId(subscriptionId: string, itemKey: string): string {
  return `art_${hashString(`${subscriptionId}:${itemKey}`)}`;
}

/**
 * Checks if the browser environment currently has internet connectivity.
 */
export function isOnline(): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    return navigator.onLine;
  }
  return true;
}

/**
 * Calculates exponential backoff delay based on error count.
 */
export function calculateBackoff(errorCount: number): number {
  if (errorCount <= 0) return 0;
  const exp = Math.min(errorCount - 1, 15);
  const delay = BASE_BACKOFF_MS * Math.pow(2, exp);
  return Math.min(delay, MAX_BACKOFF_MS);
}

/**
 * Saves articles in IndexedDB while preserving user's read and bookmarked state.
 */
export async function saveArticlesPreservingState(articles: Article[]): Promise<number> {
  if (!articles.length) return 0;

  try {
    let savedCount = 0;
    await db.transaction("rw", db.articles, async () => {
      const articleIds = articles.map((a) => a.id);
      const existing = await db.articles.where("id").anyOf(articleIds).toArray();
      const existingMap = new Map(existing.map((a) => [a.id, a]));

      const toSave: Article[] = articles.map((incoming) => {
        const prev = existingMap.get(incoming.id);
        if (prev) {
          // Preserve user read and bookmark progress
          return {
            ...incoming,
            isRead: prev.isRead,
            isBookmarked: prev.isBookmarked,
          };
        }
        return incoming;
      });

      await db.articles.bulkPut(toSave);
      savedCount = toSave.length;
    });
    return savedCount;
  } catch (err) {
    console.error("Failed to save articles preserving state:", err);
    throw err;
  }
}

/**
 * Refreshes an individual subscription via proxy, strictly parsing feeds on the client.
 */
export async function refreshFeed(
  subscription: Subscription,
  options?: { force?: boolean; timeoutMs?: number }
): Promise<FeedRefreshResult> {
  const { force = false, timeoutMs = DEFAULT_TIMEOUT_MS } = options || {};

  // Check dead-feed backoff policy unless explicitly forced
  if (!force && subscription.nextRetryAt && Date.now() < subscription.nextRetryAt) {
    return {
      subscriptionId: subscription.id,
      url: subscription.url,
      success: false,
      skipped: true,
      error: `Feed in backoff until ${new Date(subscription.nextRetryAt).toLocaleTimeString()}`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Accept: "application/rss+xml, application/atom+xml, text/xml, application/xml, */*",
  };

  // Conditional request headers
  if (subscription.etag) {
    headers["If-None-Match"] = subscription.etag;
  }
  if (subscription.lastModified) {
    headers["If-Modified-Since"] = subscription.lastModified;
  }

  try {
    const endpoint = `${API_BASE_URL}/fetch?url=${encodeURIComponent(subscription.url)}`;
    const response = await fetch(endpoint, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timer);

    // 1. Handle HTTP 304 Not Modified
    if (response.status === 304) {
      await updateSubscription(subscription.id, {
        lastFetchedAt: Date.now(),
        status: "active",
        errorCount: 0,
        nextRetryAt: undefined,
      });

      return {
        subscriptionId: subscription.id,
        url: subscription.url,
        success: true,
        notModified: true,
        newArticlesCount: 0,
      };
    }

    // 2. Handle HTTP Errors (e.g. 404, 500, 502)
    if (!response.ok) {
      throw new Error(`Proxy returned status ${response.status} (${response.statusText})`);
    }

    // 3. Process 200 OK Response
    const rawXml = await response.text();
    const newEtag = response.headers.get("etag") || undefined;
    const newLastModified = response.headers.get("last-modified") || undefined;

    // Client-side feed parsing
    const parsedFeed = await parseFeed(rawXml);

    const articles: Article[] = parsedFeed.items.map((item, index) => {
      const pubDateParsed = item.pubDate ? Date.parse(item.pubDate) : NaN;
      // Stagger undated archival feeds backward by index so they don't flood out active feeds
      const publishedAt = !isNaN(pubDateParsed)
        ? pubDateParsed
        : Date.now() - (index + 1) * (1000 * 60 * 60 * 24);
      const text = item.content || item.summary || "";
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

      return {
        id: generateArticleId(subscription.id, item.id || item.link),
        subscriptionId: subscription.id,
        title: item.title || "Untitled Article",
        url: item.link || subscription.url,
        author: item.author || parsedFeed.title,
        publishedAt,
        summary: item.summary,
        content: item.content,
        isRead: false,
        isBookmarked: false,
        readingTimeMinutes,
        isSample: false,
      };
    });

    // Save articles atomically
    await saveArticlesPreservingState(articles);

    // Update subscription metadata
    await updateSubscription(subscription.id, {
      title: subscription.title || parsedFeed.title,
      description: subscription.description || parsedFeed.description,
      siteUrl: subscription.siteUrl || parsedFeed.link,
      lastFetchedAt: Date.now(),
      etag: newEtag || subscription.etag,
      lastModified: newLastModified || subscription.lastModified,
      status: "active",
      errorCount: 0,
      nextRetryAt: undefined,
    });

    return {
      subscriptionId: subscription.id,
      url: subscription.url,
      success: true,
      newArticlesCount: articles.length,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const errorMessage =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Request timed out after 10000ms"
          : err.message
        : String(err);

    // Increment error count & calculate exponential backoff
    const nextErrorCount = (subscription.errorCount || 0) + 1;
    const backoffDelay = calculateBackoff(nextErrorCount);
    const nextRetryAt = Date.now() + backoffDelay;
    const status: SubscriptionStatus = nextErrorCount >= 3 ? "error" : "stale";

    await updateSubscription(subscription.id, {
      status,
      errorCount: nextErrorCount,
      nextRetryAt,
    }).catch((updateErr) =>
      console.error(`Failed to update backoff for ${subscription.id}:`, updateErr)
    );

    return {
      subscriptionId: subscription.id,
      url: subscription.url,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Synchronizes all subscriptions in background without blocking UI.
 */
export async function syncAllFeeds(options?: { force?: boolean }): Promise<SyncSummary> {
  const subscriptions = await getSubscriptions();

  const summary: SyncSummary = {
    totalFeeds: subscriptions.length,
    refreshed: 0,
    notModified: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  if (!subscriptions.length || (!options?.force && !isOnline())) {
    return summary;
  }

  // Iterate over feeds sequentially or in bounded batches to avoid overloading browser/proxy
  for (const sub of subscriptions) {
    const result = await refreshFeed(sub, options);
    summary.results.push(result);

    if (result.success) {
      if (result.notModified) {
        summary.notModified++;
      } else {
        summary.refreshed++;
      }
    } else if (result.skipped) {
      summary.skipped++;
    } else {
      summary.failed++;
    }
  }

  return summary;
}

/**
 * Sets up background sync triggers:
 * 1. Synchronizes when window fires 'online' event.
 * 2. Optionally runs on a periodic interval while app is open.
 */
export function initBackgroundSync(intervalMs = 5 * 60 * 1000): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleOnline = () => {
    syncAllFeeds().catch((err) => console.error("Auto-sync on online failed:", err));
  };

  window.addEventListener("online", handleOnline);

  const intervalId = window.setInterval(() => {
    if (isOnline()) {
      syncAllFeeds().catch((err) => console.error("Periodic background sync failed:", err));
    }
  }, intervalMs);

  // Initial non-blocking refresh on startup if online
  if (isOnline()) {
    setTimeout(() => {
      syncAllFeeds().catch((err) => console.error("Initial background sync failed:", err));
    }, 1000);
  }

  // Cleanup function
  return () => {
    window.removeEventListener("online", handleOnline);
    window.clearInterval(intervalId);
  };
}

// ---------------------------------------------------------------------------
// Bonus Feature: OPML Import & Export
// ---------------------------------------------------------------------------

/**
 * Exports all local subscriptions to standard OPML 2.0 XML string.
 */
export async function exportOPML(): Promise<string> {
  const subscriptions = await getSubscriptions();

  // Group by category
  const categories = new Map<string, Subscription[]>();
  for (const sub of subscriptions) {
    const cat = sub.category || "Uncategorized";
    if (!categories.has(cat)) {
      categories.set(cat, []);
    }
    categories.get(cat)!.push(sub);
  }

  let outlinesXml = "";
  for (const [cat, subs] of categories.entries()) {
    outlinesXml += `    <outline text="${escapeXml(cat)}" title="${escapeXml(cat)}">\n`;
    for (const sub of subs) {
      outlinesXml += `      <outline type="rss" text="${escapeXml(sub.title)}" title="${escapeXml(
        sub.title
      )}" xmlUrl="${escapeXml(sub.url)}" htmlUrl="${escapeXml(sub.siteUrl || "")}"/>\n`;
    }
    outlinesXml += `    </outline>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>OnlyDevs RSS Subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlinesXml}  </body>
</opml>`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

/**
 * Imports subscriptions from an OPML XML string into IndexedDB.
 */
export async function importOPML(
  opmlXml: string
): Promise<{ importedCount: number; errors: string[] }> {
  const errors: string[] = [];
  let importedCount = 0;

  try {
    let outlines: { title: string; xmlUrl: string; htmlUrl?: string; category?: string }[] = [];

    if (typeof window !== "undefined") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(opmlXml, "text/xml");
      const nodes = doc.querySelectorAll("outline[xmlUrl]");

      nodes.forEach((node) => {
        const xmlUrl = node.getAttribute("xmlUrl") || "";
        const title =
          node.getAttribute("title") || node.getAttribute("text") || "Imported Subscription";
        const htmlUrl = node.getAttribute("htmlUrl") || undefined;
        const parentOutline = node.parentElement?.tagName.toLowerCase() === "outline"
          ? node.parentElement.getAttribute("text") || node.parentElement.getAttribute("title")
          : undefined;

        if (xmlUrl) {
          outlines.push({ title, xmlUrl, htmlUrl, category: parentOutline || undefined });
        }
      });
    } else {
      // Regex fallback for non-browser/test environments
      const regex = /<outline[^>]+xmlUrl=["']([^"']+)["'][^>]*>/gi;
      let match;
      while ((match = regex.exec(opmlXml)) !== null) {
        const fullTag = match[0];
        const xmlUrl = match[1];
        const titleMatch = fullTag.match(/(?:title|text)=["']([^"']+)["']/i);
        const title = titleMatch ? titleMatch[1] : "Imported Feed";
        outlines.push({ title, xmlUrl });
      }
    }

    for (const outline of outlines) {
      try {
        const subId = `sub_${hashString(outline.xmlUrl)}`;
        await db.subscriptions.put({
          id: subId,
          url: outline.xmlUrl,
          title: outline.title,
          siteUrl: outline.htmlUrl,
          category: outline.category || "Imported",
          createdAt: Date.now(),
          status: "active",
          errorCount: 0,
        });
        importedCount++;
      } catch (insertErr) {
        errors.push(`Failed to import ${outline.xmlUrl}: ${String(insertErr)}`);
      }
    }
  } catch (parseErr) {
    errors.push(`Failed to parse OPML: ${String(parseErr)}`);
  }

  return { importedCount, errors };
}

// ---------------------------------------------------------------------------
// Bonus Feature: Blogroll Detection (Outbound Link Extraction)
// ---------------------------------------------------------------------------

export interface BlogrollEdge {
  sourceUrl: string;
  targetUrl: string;
  targetDomain: string;
}

/**
 * Scans article content to detect outbound blog links, generating "A links to B" edges
 * that feed discovery graph and recommendation algorithms.
 */
export function extractBlogrollLinks(
  contentHtml: string,
  sourceUrl: string
): BlogrollEdge[] {
  if (!contentHtml || typeof contentHtml !== "string") return [];

  const sourceDomain = tryGetDomain(sourceUrl);
  const linkRegex = /href=["'](https?:\/\/[^"'>\s]+)["']/gi;
  const edges: BlogrollEdge[] = [];
  const seenTargets = new Set<string>();

  const IGNORED_DOMAINS = new Set([
    "twitter.com",
    "x.com",
    "github.com",
    "linkedin.com",
    "facebook.com",
    "youtube.com",
    "instagram.com",
    "reddit.com",
    "google.com",
    "t.co",
    "bit.ly",
  ]);

  let match;
  while ((match = linkRegex.exec(contentHtml)) !== null) {
    const targetUrl = match[1];
    const targetDomain = tryGetDomain(targetUrl);

    if (
      targetDomain &&
      targetDomain !== sourceDomain &&
      !IGNORED_DOMAINS.has(targetDomain) &&
      !seenTargets.has(targetDomain)
    ) {
      seenTargets.add(targetDomain);
      edges.push({
        sourceUrl,
        targetUrl,
        targetDomain,
      });
    }
  }

  return edges;
}

function tryGetDomain(urlStr: string): string | null {
  try {
    return new URL(urlStr).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

