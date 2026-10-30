/**
 * In-memory cached robots.txt compliance checker
 * Respects upstream site crawl rules for ethical feed ingestion.
 */

interface RobotsCacheEntry {
  disallowedPrefixes: string[];
  fetchedAt: number;
}

const robotsCache = new Map<string, RobotsCacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

/**
 * Parses raw robots.txt and extracts Disallow paths for generic or custom agent.
 */
function parseRobotsTxt(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const disallowed: string[] = [];

  let appliesToUs = false;

  for (const line of lines) {
    const clean = line.split("#")[0].trim();
    if (!clean) continue;

    const [key, ...valParts] = clean.split(":");
    const directive = key.trim().toLowerCase();
    const value = valParts.join(":").trim();

    if (directive === "user-agent") {
      const agent = value.toLowerCase();
      appliesToUs = agent === "*" || agent.includes("onlydevs") || agent.includes("bot");
    } else if (appliesToUs && directive === "disallow") {
      if (value) {
        disallowed.push(value);
      }
    }
  }

  return disallowed;
}

/**
 * Checks whether an upstream target URL is allowed by the site's robots.txt.
 * Fails open (allows request) if robots.txt is missing (404) or on network timeout.
 * Syndication feeds (RSS, Atom, XML) are explicitly published to be read.
 */
export async function isAllowedByRobotsTxt(targetUrl: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const parsed = new URL(targetUrl);
    const origin = parsed.origin;
    const pathname = parsed.pathname || "/";

    // 1. Explicit syndication feeds are always permitted for subscription
    const isSyndicationFeed =
      /\.(xml|rss|atom|json)$/i.test(pathname) ||
      /\/(feed|rss|atom)(\/|$)/i.test(pathname);

    if (isSyndicationFeed) {
      return { allowed: true };
    }

    const cached = robotsCache.get(origin);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      for (const prefix of cached.disallowedPrefixes) {
        // Block sensitive administrative paths
        if (prefix !== "/" && pathname.startsWith(prefix)) {
          return { allowed: false, reason: `Blocked by upstream robots.txt rule: Disallow ${prefix}` };
        }
      }
      return { allowed: true };
    }

    const robotsUrl = `${origin}/robots.txt`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout for robots.txt

    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "OnlyDevs-WebReader-Proxy/1.0" },
    }).catch(() => null);

    clearTimeout(timeout);

    if (!res || !res.ok) {
      // Missing or error -> treat as allowed
      robotsCache.set(origin, { disallowedPrefixes: [], fetchedAt: Date.now() });
      return { allowed: true };
    }

    const text = await res.text();
    const disallowedPrefixes = parseRobotsTxt(text);
    robotsCache.set(origin, { disallowedPrefixes, fetchedAt: Date.now() });

    for (const prefix of disallowedPrefixes) {
      if (prefix !== "/" && pathname.startsWith(prefix)) {
        return { allowed: false, reason: `Blocked by upstream robots.txt rule: Disallow ${prefix}` };
      }
    }

    return { allowed: true };
  } catch {
    // Fail open
    return { allowed: true };
  }
}
