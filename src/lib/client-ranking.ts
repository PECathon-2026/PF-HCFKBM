import { db, getSubscriptions, getDiscoveryCache, setDiscoveryCache } from "./db";
import {
  getDiscoveryRecommendations,
  submitDiscoveryUrls,
  type RecommendedFeedItem,
} from "./api";

const CONSENT_STORAGE_KEY = "anonymous_discovery_enabled";
const DISCOVERY_CACHE_KEY = "client_ranked_recommendations";
const DISCOVERY_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour TTL

export interface RankedRecommendation extends RecommendedFeedItem {
  jaccardSimilarity: number;
  finalScore: number;
  isCached?: boolean;
}

/**
 * Checks if user has explicitly opted into anonymous discovery sharing.
 */
export function isDiscoveryOptedIn(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CONSENT_STORAGE_KEY) === "true";
}

/**
 * Sets user consent for anonymous discovery sharing.
 */
export function setDiscoveryOptIn(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_STORAGE_KEY, enabled ? "true" : "false");
}

/**
 * Consistently normalizes URLs across client and server:
 * - Lowercases hostname.
 * - Strips standard ports (:80, :443).
 * - Removes common tracking query parameters.
 * - Trims trailing slashes on sub-paths.
 * - Drops fragments.
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    url.hostname = url.hostname.toLowerCase();

    // Remove default ports
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }

    // Strip known marketing / analytics tracking query parameters
    const TRACKING_PARAMS = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "source",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
      "_ga",
      "_gl",
    ]);

    const params = new URLSearchParams(url.search);
    const toDelete: string[] = [];
    params.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower) || lower.startsWith("utm_")) {
        toDelete.push(key);
      }
    });

    for (const key of toDelete) {
      params.delete(key);
    }

    url.search = params.toString() ? `?${params.toString()}` : "";
    url.hash = "";

    let result = url.toString();
    // Remove trailing slash only if path is longer than "/"
    if (result.endsWith("/") && url.pathname.length > 1) {
      result = result.slice(0, -1);
    }

    return result;
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Submits local subscriptions as an anonymous batch to /api/discovery/submit.
 * STRICT PRIVACY: Only submits normalized URLs if opt-in consent is enabled.
 * Never transmits reading history, bookmarks, or personal identifiers.
 */
export async function submitAnonymousSubscriptions(): Promise<{
  success: boolean;
  submittedCount?: number;
  message?: string;
}> {
  if (!isDiscoveryOptedIn()) {
    return {
      success: false,
      message: "Anonymous discovery sharing is disabled by user preference.",
    };
  }

  try {
    const subs = await getSubscriptions();
    if (!subs.length) {
      return { success: true, submittedCount: 0, message: "No subscriptions to submit." };
    }

    // Normalize and deduplicate URLs
    const normalizedUrls = Array.from(
      new Set(subs.map((s) => normalizeUrl(s.url)).filter((url) => url.length > 0))
    );

    await submitDiscoveryUrls(normalizedUrls);

    return {
      success: true,
      submittedCount: normalizedUrls.length,
      message: "Subscriptions submitted anonymously.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Anonymous subscription submission failed:", message);
    return {
      success: false,
      message,
    };
  }
}

/**
 * Computes Jaccard similarity coefficient between two sets of strings.
 * J(A, B) = |A ∩ B| / |A ∪ B|
 */
export function computeJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount++;
    }
  }

  const unionCount = setA.size + setB.size - intersectionCount;
  return unionCount > 0 ? intersectionCount / unionCount : 0;
}

/**
 * Fetches discovery recommendations, filters out already subscribed feeds,
 * applies client-side Jaccard ranking adjustment, and provides offline caching.
 */
export async function getClientRankedRecommendations(options?: {
  forceRefresh?: boolean;
}): Promise<RankedRecommendation[]> {
  const { forceRefresh = false } = options || {};

  // 1. Fetch user's local subscriptions to check categories and filter duplicates
  const localSubscriptions = await getSubscriptions();
  const subscribedUrlSet = new Set(localSubscriptions.map((s) => normalizeUrl(s.url)));

  // Extract user's category tags for Jaccard similarity adjustment
  const userCategorySet = new Set(
    localSubscriptions
      .map((s) => (s.category || "").toLowerCase().trim())
      .filter((c) => c.length > 0)
  );

  // 2. Check offline discovery cache unless forced
  if (!forceRefresh) {
    const cached = await getDiscoveryCache<RankedRecommendation[]>(DISCOVERY_CACHE_KEY);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      // Re-filter cached candidates against current subscriptions
      return cached
        .filter((rec) => !subscribedUrlSet.has(normalizeUrl(rec.url)))
        .map((rec) => ({ ...rec, isCached: true }));
    }
  }

  // 3. Fetch fresh recommendations from server discovery API
  let candidates: RecommendedFeedItem[] = [];
  try {
    const response = await getDiscoveryRecommendations();
    candidates = response.items || [];
  } catch (apiErr) {
    console.warn("Failed to fetch fresh recommendations, attempting cache fallback:", apiErr);

    const fallbackCache = await getDiscoveryCache<RankedRecommendation[]>(DISCOVERY_CACHE_KEY);
    if (fallbackCache && Array.isArray(fallbackCache)) {
      return fallbackCache
        .filter((rec) => !subscribedUrlSet.has(normalizeUrl(rec.url)))
        .map((rec) => ({ ...rec, isCached: true }));
    }
    return [];
  }

  // 4. Strict requirement: filter out feeds the user already subscribes to
  const unseenCandidates = candidates.filter((item) => {
    const normalizedCandidateUrl = normalizeUrl(item.url);
    return !subscribedUrlSet.has(normalizedCandidateUrl);
  });

  // 5. Client-side ranking: apply Jaccard similarity as an optional local score adjustment
  const ranked: RankedRecommendation[] = unseenCandidates.map((cand) => {
    const candCategories = new Set(
      (cand.category || "")
        .toLowerCase()
        .split(/[,/&]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    );

    const jaccard = computeJaccardSimilarity(userCategorySet, candCategories);

    // Keep local similarity available for sorting without presenting invented precision in the UI.
    const finalScore = Math.round(jaccard * 100);

    return {
      ...cand,
      reason:
        cand.reason ||
        (jaccard > 0
          ? `Matches topics from your subscriptions (${cand.category})`
          : "Popular in the independent web community"),
      jaccardSimilarity: Number(jaccard.toFixed(3)),
      finalScore,
      isCached: false,
    };
  });

  // Sort descending by final adjusted score
  ranked.sort((a, b) => b.finalScore - a.finalScore);

  // 6. Cache results in IndexedDB for offline resilience
  await setDiscoveryCache(DISCOVERY_CACHE_KEY, ranked, DISCOVERY_CACHE_TTL_MS);

  return ranked;
}
