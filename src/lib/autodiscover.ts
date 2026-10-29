import { fetchProxy } from "./api";

export interface DiscoveredFeed {
  url: string;
  title?: string;
  type: "rss" | "atom" | "json" | "unknown";
}

export interface BlogrollLink {
  title?: string;
  url: string;
  feedUrl?: string;
}

export interface AutodiscoverResult {
  feeds: DiscoveredFeed[];
  blogroll: BlogrollLink[];
}

const COMMON_FEED_PATHS = [
  "/feed",
  "/rss.xml",
  "/atom.xml",
  "/feed.xml",
  "/index.xml",
  "/rss",
  "/feed/",
];

const SOCIAL_DOMAINS = new Set([
  "twitter.com",
  "x.com",
  "github.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "reddit.com",
  "tiktok.com",
  "threads.net",
  "bsky.app",
]);

/**
 * Normalizes input URL with default protocol if missing.
 */
export function normalizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

/**
 * Detects feed type from mime type, URL string, or payload content.
 */
function inferFeedType(
  mimeType?: string | null,
  url?: string,
  payload?: string
): "rss" | "atom" | "json" | "unknown" {
  if (payload) {
    const lower = payload.slice(0, 1000).toLowerCase();
    if (lower.includes("<feed") || lower.includes("atom")) return "atom";
    if (lower.includes("<rss") || lower.includes("<channel") || lower.includes("rdf")) return "rss";
    if (lower.includes("jsonfeed.org")) return "json";
  }

  const mime = (mimeType || "").toLowerCase();
  const lowerUrl = (url || "").toLowerCase();

  if (mime.includes("atom") || lowerUrl.includes("atom")) return "atom";
  if (mime.includes("rss") || lowerUrl.includes("rss")) return "rss";
  if (mime.includes("json") || lowerUrl.includes("json")) return "json";
  if (mime.includes("xml") || /\.xml(?:[?#]|$)/i.test(lowerUrl)) return "rss";

  return "unknown";
}

/**
 * Parses HTML in browser or SSR fallback.
 */
function parseHtml(html: string): Document | null {
  if (typeof window !== "undefined") {
    try {
      const parser = new DOMParser();
      return parser.parseFromString(html, "text/html");
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Discovers feeds from HTML markup.
 * Inspects <head> for <link rel="alternate"> feed specifications.
 */
export function discoverFeedsFromHtml(html: string, baseUrl: string): DiscoveredFeed[] {
  const feeds: DiscoveredFeed[] = [];
  const seenUrls = new Set<string>();

  const doc = parseHtml(html);

  if (doc) {
    const selectors = [
      'head link[rel~="alternate"][type="application/rss+xml"]',
      'head link[rel~="alternate"][type="application/atom+xml"]',
      'head link[rel~="alternate"][type="application/feed+json"]',
      'head link[rel~="alternate"][type="application/xml"]',
      'head link[rel~="alternate"][type="text/xml"]',
      'head link[rel~="feed"]',
      'link[rel~="alternate"][type="application/rss+xml"]',
      'link[rel~="alternate"][type="application/atom+xml"]',
      'link[rel~="alternate"][type="application/feed+json"]',
    ];

    const elements = doc.querySelectorAll(selectors.join(","));
    elements.forEach((el) => {
      const href = el.getAttribute("href");
      if (!href) return;

      try {
        const resolved = new URL(href, baseUrl).toString();
        if (!seenUrls.has(resolved)) {
          seenUrls.add(resolved);
          const typeAttr = el.getAttribute("type");
          const title = el.getAttribute("title") || el.textContent?.trim() || undefined;
          feeds.push({
            url: resolved,
            title,
            type: inferFeedType(typeAttr, resolved),
          });
        }
      } catch {
        // Ignore invalid URL resolution
      }
    });
  } else {
    // SSR regex fallback
    const linkRegex = /<link\b[^>]*>/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null) {
      const tag = match[0];
      const hasAlternate = /\brel=["'][^"']*\b(?:alternate|feed)\b[^"']*["']/i.test(tag);
      const isFeedType = /\btype=["'](?:application\/(?:rss\+xml|atom\+xml|feed\+json|xml)|text\/xml)["']/i.test(tag);

      if ((hasAlternate && isFeedType) || isFeedType) {
        const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
        const titleMatch = tag.match(/\btitle=["']([^"']+)["']/i);
        const typeMatch = tag.match(/\btype=["']([^"']+)["']/i);

        if (hrefMatch?.[1]) {
          try {
            const resolved = new URL(hrefMatch[1], baseUrl).toString();
            if (!seenUrls.has(resolved)) {
              seenUrls.add(resolved);
              feeds.push({
                url: resolved,
                title: titleMatch?.[1],
                type: inferFeedType(typeMatch?.[1], resolved),
              });
            }
          } catch {
            // Ignore invalid URLs
          }
        }
      }
    }
  }

  return feeds;
}

/**
 * Extracts outgoing blogroll links from HTML document.
 */
export function extractBlogrollFromHtml(html: string, baseUrl: string): BlogrollLink[] {
  const blogroll: BlogrollLink[] = [];
  const seenUrls = new Set<string>();

  let baseHostname = "";
  try {
    baseHostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    baseHostname = "";
  }

  const isExternalBlog = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      const host = parsed.hostname.toLowerCase();
      if (host === baseHostname || host.endsWith(`.${baseHostname}`)) return false;
      if (SOCIAL_DOMAINS.has(host) || Array.from(SOCIAL_DOMAINS).some((d) => host.endsWith(`.${d}`))) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const doc = parseHtml(html);

  if (doc) {
    // 1. Explicit <link rel="blogroll">
    doc.querySelectorAll('link[rel~="blogroll"]').forEach((el) => {
      const href = el.getAttribute("href");
      if (href) {
        try {
          const resolved = new URL(href, baseUrl).toString();
          if (isExternalBlog(resolved) && !seenUrls.has(resolved)) {
            seenUrls.add(resolved);
            blogroll.push({
              title: el.getAttribute("title") || undefined,
              url: resolved,
            });
          }
        } catch {
          // Ignore
        }
      }
    });

    // 2. Curated blogroll links (<a rel="blogroll"> or within blogroll containers)
    const selectors = [
      'a[rel~="blogroll"]',
      '[class*="blogroll"] a',
      '[id*="blogroll"] a',
      'nav[aria-label*="blogroll" i] a',
    ];

    doc.querySelectorAll(selectors.join(",")).forEach((el) => {
      const href = el.getAttribute("href");
      if (href) {
        try {
          const resolved = new URL(href, baseUrl).toString();
          if (isExternalBlog(resolved) && !seenUrls.has(resolved)) {
            seenUrls.add(resolved);
            const title = el.textContent?.trim() || el.getAttribute("title") || undefined;
            blogroll.push({
              title,
              url: resolved,
            });
          }
        } catch {
          // Ignore
        }
      }
    });
  } else {
    // SSR regex fallback for blogroll links
    const blogrollRegex = /<(?:link|a)\b[^>]*rel=["'][^"']*\bblogroll\b[^"']*["'][^>]*>/gi;
    let match: RegExpExecArray | null;

    while ((match = blogrollRegex.exec(html)) !== null) {
      const tag = match[0];
      const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
      const titleMatch = tag.match(/\btitle=["']([^"']+)["']/i);

      if (hrefMatch?.[1]) {
        try {
          const resolved = new URL(hrefMatch[1], baseUrl).toString();
          if (isExternalBlog(resolved) && !seenUrls.has(resolved)) {
            seenUrls.add(resolved);
            blogroll.push({
              title: titleMatch?.[1],
              url: resolved,
            });
          }
        } catch {
          // Ignore
        }
      }
    }
  }

  return blogroll;
}

/**
 * Checks if raw content represents a valid RSS, Atom, or JSON feed payload.
 * Prevents false positives on sitemaps, 404 errors, and generic HTML tags.
 */
function isFeedPayload(content: string): boolean {
  if (!content || typeof content !== "string") return false;
  const sample = content.trim().slice(0, 2000).toLowerCase();

  const isRss =
    /<(?:rss|channel)[\s>]/.test(sample) ||
    sample.includes("xmlns:rdf") ||
    sample.includes("<rdf:rdf");

  const isAtom =
    /<feed[\s>]/.test(sample) &&
    (sample.includes("http://www.w3.org/2005/atom") || sample.includes("<entry") || sample.includes("<title"));

  const isJsonFeed = sample.includes("https://jsonfeed.org/version/");

  return isRss || isAtom || isJsonFeed;
}

/**
 * Main Autodiscovery engine:
 * 1. Fetches target HTML via proxy.
 * 2. Scans <head> for feed links.
 * 3. If absent, tests common feed paths (/feed, /rss.xml, etc.) across subpath and origin.
 * 4. Extracts blogroll links for the discovery graph.
 */
export async function autodiscover(
  siteUrl: string,
  fetcher: (url: string) => Promise<string> = async (url) => {
    const res = await fetchProxy(url);
    return res.text;
  }
): Promise<AutodiscoverResult> {
  const normalizedUrl = normalizeUrl(siteUrl);
  let html = "";

  try {
    html = await fetcher(normalizedUrl);
  } catch {
    // If initial fetch failed, proceed to path probes below
  }

  // 1. If content received is directly a feed XML/JSON
  if (html && isFeedPayload(html)) {
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const directTitle = titleMatch
      ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()
      : undefined;

    return {
      feeds: [
        {
          url: normalizedUrl,
          title: directTitle,
          type: inferFeedType(null, normalizedUrl, html),
        },
      ],
      blogroll: [],
    };
  }

  // 2. Discover feeds and blogroll from HTML <head>
  const feeds = discoverFeedsFromHtml(html, normalizedUrl);
  const blogroll = extractBlogrollFromHtml(html, normalizedUrl);

  // 3. If feeds found from link tags, return them
  if (feeds.length > 0) {
    return { feeds, blogroll };
  }

  // 4. Fallback: probe common feed paths via proxy across both subpath and origin
  const parsed = new URL(normalizedUrl);
  const basePath = parsed.pathname.replace(/\/$/, "");
  const candidateUrls: string[] = [];
  const seenProbes = new Set<string>();

  for (const p of COMMON_FEED_PATHS) {
    if (basePath && basePath !== "/") {
      const subpathUrl = new URL(`${basePath}${p}`, parsed.origin).toString();
      if (!seenProbes.has(subpathUrl)) {
        seenProbes.add(subpathUrl);
        candidateUrls.push(subpathUrl);
      }
    }
    const originUrl = new URL(p, parsed.origin).toString();
    if (!seenProbes.has(originUrl)) {
      seenProbes.add(originUrl);
      candidateUrls.push(originUrl);
    }
  }

  for (const candidateUrl of candidateUrls) {
    try {
      const probeResponse = await fetcher(candidateUrl);
      if (isFeedPayload(probeResponse)) {
        const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(probeResponse);
        const probedTitle = titleMatch
          ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()
          : `Feed at ${new URL(candidateUrl).pathname}`;

        feeds.push({
          url: candidateUrl,
          type: inferFeedType(null, candidateUrl, probeResponse),
          title: probedTitle,
        });
        // Stop on first valid common path
        break;
      }
    } catch {
      // Probe failed, continue to next
    }
  }

  return { feeds, blogroll };
}
