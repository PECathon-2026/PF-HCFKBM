import Dexie, { type EntityTable } from "dexie";

export interface Subscription {
  id: string; // URL hash or UUID
  url: string;
  title: string;
  description?: string;
  siteUrl?: string;
  iconUrl?: string;
  category?: string;
  lastFetchedAt?: number;
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
  readingTimeMinutes?: number;
}

/**
 * Dexie.js IndexedDB schema for OnlyDevs Reader Client
 */
export class OnlyDevsDB extends Dexie {
  subscriptions!: EntityTable<Subscription, "id">;
  articles!: EntityTable<Article, "id">;

  constructor() {
    super("OnlyDevsClientDB");
    this.version(1).stores({
      subscriptions: "id, url, category, createdAt, lastFetchedAt",
      articles: "id, subscriptionId, url, publishedAt, isRead, isBookmarked",
    });
  }
}

// Singleton database instance
export const db = new OnlyDevsDB();

// Database CRUD helper stubs for team members
export async function getSubscriptions(): Promise<Subscription[]> {
  return db.subscriptions.toArray();
}

export async function addSubscription(sub: Omit<Subscription, "createdAt">): Promise<string> {
  const record: Subscription = {
    ...sub,
    createdAt: Date.now(),
  };
  await db.subscriptions.put(record);
  return record.id;
}

export async function getArticles(limit = 50): Promise<Article[]> {
  return db.articles.orderBy("publishedAt").reverse().limit(limit).toArray();
}

export async function markArticleRead(id: string, isRead = true): Promise<void> {
  await db.articles.update(id, { isRead });
}

export async function toggleArticleBookmark(id: string, isBookmarked: boolean): Promise<void> {
  await db.articles.update(id, { isBookmarked });
}
