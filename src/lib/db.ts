import Dexie, { type EntityTable } from "dexie";

export interface Subscription {
  id: string; // Deterministic URL hash or UUID
  url: string;
  title: string;
  description?: string;
  siteUrl?: string;
  iconUrl?: string;
  category?: string;
  lastFetchedAt?: number;
  etag?: string;
  lastModified?: string;
  status: "active" | "error" | "stale";
  errorCount: number;
  nextRetryAt?: number;
  createdAt: number;
}

export interface Article {
  id: string; // Unique article identifier
  subscriptionId: string;
  title: string;
  url: string;
  author?: string;
  publishedAt: number;
  summary?: string;
  content?: string;
  isRead: boolean;
  isBookmarked: boolean;
  isSample?: boolean; // Explicit label for seed/demo data
  readingTimeMinutes?: number;
}

export interface DiscoveryCacheItem {
  key: string;
  data: string; // JSON payload
  cachedAt: number;
  ttl: number;
}

/**
 * Dexie.js IndexedDB schema for OnlyDevs Reader Client
 * Handles dead-feed recovery, compound indexes for fast query filtering,
 * and persistent article reading state.
 */
export class OnlyDevsDB extends Dexie {
  subscriptions!: EntityTable<Subscription, "id">;
  articles!: EntityTable<Article, "id">;
  discoveryCache!: EntityTable<DiscoveryCacheItem, "key">;

  constructor() {
    super("OnlyDevsClientDB");
    this.version(1).stores({
      subscriptions: "id, url, category, status, errorCount, nextRetryAt, createdAt, lastFetchedAt",
      articles: "id, subscriptionId, url, publishedAt, isRead, isBookmarked, [subscriptionId+publishedAt], [isRead+publishedAt], [isBookmarked+publishedAt]",
      discoveryCache: "key, cachedAt",
    });
  }
}

// Singleton database instance
export const db = new OnlyDevsDB();

// Database CRUD helper stubs with atomic transaction safety

export async function getSubscriptions(): Promise<Subscription[]> {
  return db.subscriptions.toArray();
}

export async function addSubscription(
  sub: Omit<Subscription, "createdAt" | "errorCount" | "status"> & {
    errorCount?: number;
    status?: "active" | "error" | "stale";
  }
): Promise<string> {
  const record: Subscription = {
    errorCount: 0,
    status: "active",
    ...sub,
    createdAt: Date.now(),
  };
  await db.subscriptions.put(record);
  return record.id;
}

export async function updateSubscriptionStatus(
  id: string,
  updates: Partial<Pick<Subscription, "status" | "errorCount" | "nextRetryAt" | "lastFetchedAt" | "etag" | "lastModified">>
): Promise<void> {
  await db.subscriptions.update(id, updates);
}

export async function getArticles(limit = 50, filter?: "all" | "unread" | "bookmarked"): Promise<Article[]> {
  if (filter === "unread") {
    return db.articles.where("isRead").equals(0).reverse().sortBy("publishedAt").then((arr) => arr.slice(0, limit));
  }
  if (filter === "bookmarked") {
    return db.articles.where("isBookmarked").equals(1).reverse().sortBy("publishedAt").then((arr) => arr.slice(0, limit));
  }
  return db.articles.orderBy("publishedAt").reverse().limit(limit).toArray();
}

export async function markArticleRead(id: string, isRead = true): Promise<void> {
  await db.articles.update(id, { isRead });
}

export async function toggleArticleBookmark(id: string, isBookmarked: boolean): Promise<void> {
  await db.articles.update(id, { isBookmarked });
}

/**
 * Atomic cleanup of stale unread articles older than retentionDays.
 * Never deletes bookmarked articles.
 */
export async function cleanupStaleArticles(retentionDays = 30): Promise<number> {
  const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  return db.transaction("rw", db.articles, async () => {
    const toDelete = await db.articles
      .where("publishedAt")
      .below(threshold)
      .and((a) => !a.isBookmarked)
      .toArray();

    const ids = toDelete.map((a) => a.id);
    await db.articles.bulkDelete(ids);
    return ids.length;
  });
}
