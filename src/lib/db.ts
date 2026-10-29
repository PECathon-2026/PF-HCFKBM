import Dexie, { type EntityTable } from "dexie";

export type SubscriptionStatus = "active" | "stale" | "error";

export interface Subscription {
  id: string; // Deterministic URL hash or UUID
  url: string;
  title: string;
  description?: string;
  siteUrl?: string;
  iconUrl?: string;
  category?: string;
  createdAt: number;
  lastFetchedAt?: number;
  etag?: string;
  lastModified?: string;
  status: SubscriptionStatus;
  errorCount: number;
  nextRetryAt?: number;
}

export interface Article {
  id: string; // Unique article identifier (e.g. hash of URL or GUID)
  subscriptionId: string;
  title: string;
  url: string;
  author?: string;
  publishedAt: number;
  summary?: string;
  content?: string;
  isRead: boolean;
  isBookmarked: boolean;
  readingTimeMinutes?: number;
  isSample?: boolean; // Explicit label for seed/demo sample data
}

export interface DiscoveryCacheItem<T = unknown> {
  key: string;
  data: T;
  cachedAt: number;
  ttl: number; // TTL in milliseconds
}

/**
 * Dexie.js IndexedDB schema for OnlyDevs Reader Client
 * Handles dead-feed recovery, compound indexes for fast query filtering,
 * and persistent article reading state.
 */
export class OnlyDevsDB extends Dexie {
  subscriptions!: EntityTable<Subscription, "id">;
  articles!: EntityTable<Article, "id">;
  discovery_cache!: EntityTable<DiscoveryCacheItem, "key">;

  get discoveryCache(): EntityTable<DiscoveryCacheItem, "key"> {
    return this.discovery_cache;
  }

  constructor() {
    super("OnlyDevsClientDB");
    this.version(1).stores({
      subscriptions: "id, url, category, status, errorCount, nextRetryAt, createdAt, lastFetchedAt",
      articles:
        "id, subscriptionId, url, publishedAt, isRead, isBookmarked, [subscriptionId+publishedAt], [isRead+publishedAt], [isBookmarked+publishedAt]",
      discovery_cache: "key, cachedAt",
    });
  }
}

// Singleton database instance
export const db = new OnlyDevsDB();

// ---------------------------------------------------------------------------
// Subscription Operations
// ---------------------------------------------------------------------------

export async function getSubscriptions(): Promise<Subscription[]> {
  try {
    return await db.subscriptions.toArray();
  } catch (err) {
    console.error("Failed to load subscriptions from IndexedDB:", err);
    return [];
  }
}

export async function getSubscription(id: string): Promise<Subscription | undefined> {
  try {
    return await db.subscriptions.get(id);
  } catch (err) {
    console.error(`Failed to get subscription ${id}:`, err);
    return undefined;
  }
}

export async function getSubscriptionByUrl(url: string): Promise<Subscription | undefined> {
  try {
    return await db.subscriptions.where("url").equals(url).first();
  } catch (err) {
    console.error(`Failed to find subscription by URL ${url}:`, err);
    return undefined;
  }
}

export async function addSubscription(
  sub: Omit<Subscription, "createdAt" | "status" | "errorCount"> & Partial<Subscription>
): Promise<string> {
  const record: Subscription = {
    ...sub,
    createdAt: sub.createdAt ?? Date.now(),
    status: sub.status ?? "active",
    errorCount: sub.errorCount ?? 0,
  };

  try {
    await db.subscriptions.put(record);
    return record.id;
  } catch (err) {
    console.error("Failed to add subscription:", err);
    throw err;
  }
}

export async function updateSubscription(
  id: string,
  changes: Partial<Omit<Subscription, "id">>
): Promise<void> {
  try {
    await db.subscriptions.update(id, changes);
  } catch (err) {
    console.error(`Failed to update subscription ${id}:`, err);
    throw err;
  }
}

export async function updateSubscriptionStatus(
  id: string,
  updates: Partial<Pick<Subscription, "status" | "errorCount" | "nextRetryAt" | "lastFetchedAt" | "etag" | "lastModified">>
): Promise<void> {
  try {
    await db.subscriptions.update(id, updates);
  } catch (err) {
    console.error(`Failed to update subscription status ${id}:`, err);
    throw err;
  }
}

export async function deleteSubscription(id: string): Promise<void> {
  try {
    // Atomic cascade delete using transaction
    await db.transaction("rw", [db.subscriptions, db.articles], async () => {
      await db.subscriptions.delete(id);
      await db.articles.where("subscriptionId").equals(id).delete();
    });
  } catch (err) {
    console.error(`Failed to delete subscription ${id}:`, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Article Operations
// ---------------------------------------------------------------------------

export async function getArticles(
  limit = 50,
  offsetOrFilter?: number | "all" | "unread" | "bookmarked"
): Promise<Article[]> {
  try {
    if (typeof offsetOrFilter === "string") {
      if (offsetOrFilter === "unread") {
        return await db.articles
          .where("isRead")
          .equals(0)
          .reverse()
          .sortBy("publishedAt")
          .then((arr) => arr.slice(0, limit));
      }
      if (offsetOrFilter === "bookmarked") {
        return await db.articles
          .where("isBookmarked")
          .equals(1)
          .reverse()
          .sortBy("publishedAt")
          .then((arr) => arr.slice(0, limit));
      }
      return await db.articles.orderBy("publishedAt").reverse().limit(limit).toArray();
    }

    const offset = typeof offsetOrFilter === "number" ? offsetOrFilter : 0;
    return await db.articles
      .orderBy("publishedAt")
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray();
  } catch (err) {
    console.error("Failed to load articles from IndexedDB:", err);
    return [];
  }
}

export async function getArticle(id: string): Promise<Article | undefined> {
  try {
    return await db.articles.get(id);
  } catch (err) {
    console.error(`Failed to get article ${id}:`, err);
    return undefined;
  }
}

/**
 * Atomically saves batch of articles in a single Dexie transaction.
 */
export async function saveArticles(articles: Article[]): Promise<void> {
  if (!articles.length) return;
  try {
    await db.transaction("rw", db.articles, async () => {
      await db.articles.bulkPut(articles);
    });
  } catch (err) {
    console.error("Failed to save articles batch:", err);
    throw err;
  }
}

export async function markArticleRead(id: string, isRead = true): Promise<void> {
  try {
    await db.articles.update(id, { isRead });
  } catch (err) {
    console.error(`Failed to mark article ${id} read status:`, err);
    throw err;
  }
}

export async function toggleArticleBookmark(id: string, isBookmarked: boolean): Promise<void> {
  try {
    await db.articles.update(id, { isBookmarked });
  } catch (err) {
    console.error(`Failed to toggle bookmark for article ${id}:`, err);
    throw err;
  }
}

/**
 * Routine cleanup of stale articles older than maxAgeDays (default 30).
 * CRITICAL: Never deletes bookmarked articles.
 */
export async function cleanupStaleArticles(maxAgeDays = 30): Promise<number> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  try {
    let deletedCount = 0;
    await db.transaction("rw", db.articles, async () => {
      // Find unbookmarked articles published before cutoff
      const staleArticles = await db.articles
        .where("publishedAt")
        .below(cutoff)
        .filter((article) => !article.isBookmarked)
        .toArray();

      if (staleArticles.length > 0) {
        const idsToDelete = staleArticles.map((a) => a.id);
        await db.articles.bulkDelete(idsToDelete);
        deletedCount = idsToDelete.length;
      }
    });
    return deletedCount;
  } catch (err) {
    console.error("Failed to cleanup stale articles:", err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Discovery Cache Operations
// ---------------------------------------------------------------------------

export async function getDiscoveryCache<T>(key: string): Promise<T | null> {
  try {
    const entry = await db.discovery_cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() > entry.cachedAt + entry.ttl;
    if (isExpired) {
      await db.discovery_cache.delete(key);
      return null;
    }

    return entry.data as T;
  } catch (err) {
    console.error(`Failed to read discovery cache for key ${key}:`, err);
    return null;
  }
}

export async function setDiscoveryCache<T>(
  key: string,
  data: T,
  ttlMs = 1000 * 60 * 30 // 30 mins default
): Promise<void> {
  try {
    await db.discovery_cache.put({
      key,
      data,
      cachedAt: Date.now(),
      ttl: ttlMs,
    });
  } catch (err) {
    console.error(`Failed to set discovery cache for key ${key}:`, err);
  }
}
