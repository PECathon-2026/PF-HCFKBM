import { db, type Article, type Subscription } from "./db";

export type ReadFilter = "all" | "unread" | "bookmarked";

export interface TimelineFilterOptions {
  readStatus?: ReadFilter;
  subscriptionId?: string;
  category?: string;
  searchQuery?: string;
  page?: number;
  pageSize?: number;
}

export interface TimelineResult {
  articles: Article[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Normalizes search text into lowercase query tokens.
 */
export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * In-memory token matching over article fields (title, summary, author).
 * Reserved for loaded/indexed slices to prevent excessive memory overhead as database grows.
 */
export function matchesSearchTokens(article: Article, tokens: string[]): boolean {
  if (!tokens.length) return true;

  const target = `${article.title} ${article.summary || ""} ${article.author || ""}`.toLowerCase();
  return tokens.every((token) => target.includes(token));
}

/**
 * Filter an array of articles using in-memory token matching.
 */
export function filterArticlesByTokens(articles: Article[], query: string): Article[] {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return articles;
  return articles.filter((article) => matchesSearchTokens(article, tokens));
}

/**
 * Retrieves articles from IndexedDB using fast compound indexes where possible,
 * supporting pagination, status filtering, category filtering, and bounded search.
 */
export async function getTimelineArticles(
  options: TimelineFilterOptions = {}
): Promise<TimelineResult> {
  const {
    readStatus = "all",
    subscriptionId,
    category,
    searchQuery,
    page = 1,
    pageSize = 20,
  } = options;

  const validPage = Math.max(1, page);
  const validPageSize = Math.max(1, Math.min(100, pageSize));
  const offset = (validPage - 1) * validPageSize;

  try {
    // 1. If filtering by category, find relevant subscription IDs first
    let categorySubscriptionIds: Set<string> | null = null;
    if (category && category !== "all") {
      const subs = await db.subscriptions.where("category").equals(category).toArray();
      categorySubscriptionIds = new Set(subs.map((s) => s.id));
      if (categorySubscriptionIds.size === 0) {
        return {
          articles: [],
          total: 0,
          page: validPage,
          pageSize: validPageSize,
          hasMore: false,
        };
      }
    }

    // 2. Select the optimal IndexedDB compound index based on filters
    let collection;

    if (subscriptionId) {
      // Use compound index: [subscriptionId+publishedAt]
      collection = db.articles
        .where("[subscriptionId+publishedAt]")
        .between([subscriptionId, DexieMinKey], [subscriptionId, DexieMaxKey])
        .reverse();
    } else if (readStatus === "unread") {
      // Use compound index: [isRead+publishedAt]
      collection = db.articles
        .where("[isRead+publishedAt]")
        .between([0, DexieMinKey], [0, DexieMaxKey])
        .reverse();
    } else if (readStatus === "bookmarked") {
      // Use compound index: [isBookmarked+publishedAt]
      collection = db.articles
        .where("[isBookmarked+publishedAt]")
        .between([1, DexieMinKey], [1, DexieMaxKey])
        .reverse();
    } else {
      // Default: sort chronologically by publishedAt index
      collection = db.articles.orderBy("publishedAt").reverse();
    }

    // 3. Apply post-index secondary filters in IndexedDB pipeline
    const filteredCollection = collection.filter((article) => {
      // Check category match if requested
      if (categorySubscriptionIds && !categorySubscriptionIds.has(article.subscriptionId)) {
        return false;
      }

      // Check secondary read status filter if subscriptionId index was used
      if (subscriptionId) {
        if (readStatus === "unread" && article.isRead) return false;
        if (readStatus === "bookmarked" && !article.isBookmarked) return false;
      }

      return true;
    });

    const searchTokens = searchQuery ? tokenizeQuery(searchQuery) : [];

    // 4. If search query is present, perform in-memory token matching on candidate results
    if (searchTokens.length > 0) {
      // Limit search pool to avoid unbound heap growth
      const candidates = await filteredCollection.limit(500).toArray();
      const matched = candidates.filter((article) => matchesSearchTokens(article, searchTokens));
      const total = matched.length;
      const paginatedArticles = matched.slice(offset, offset + validPageSize);

      return {
        articles: paginatedArticles,
        total,
        page: validPage,
        pageSize: validPageSize,
        hasMore: offset + validPageSize < total,
      };
    }

    // 5. Standard paginated query using IndexedDB offset & limit
    const total = await filteredCollection.count();
    const articles = await filteredCollection.offset(offset).limit(validPageSize).toArray();

    return {
      articles,
      total,
      page: validPage,
      pageSize: validPageSize,
      hasMore: offset + validPageSize < total,
    };
  } catch (err) {
    console.error("Failed to query timeline articles from IndexedDB:", err);
    return {
      articles: [],
      total: 0,
      page: validPage,
      pageSize: validPageSize,
      hasMore: false,
    };
  }
}

/**
 * Gets count of unread articles across all subscriptions.
 */
export async function getUnreadCount(): Promise<number> {
  try {
    return await db.articles.where("isRead").equals(0).count();
  } catch {
    return 0;
  }
}

/**
 * Gets count of bookmarked articles.
 */
export async function getBookmarkedCount(): Promise<number> {
  try {
    return await db.articles.where("isBookmarked").equals(1).count();
  } catch {
    return 0;
  }
}

/**
 * Returns distinct category strings present in current subscriptions.
 */
export async function getCategories(): Promise<string[]> {
  try {
    const subs = await db.subscriptions.toArray();
    const categorySet = new Set<string>();
    for (const sub of subs) {
      if (sub.category) {
        categorySet.add(sub.category);
      }
    }
    return Array.from(categorySet);
  } catch {
    return [];
  }
}

// Dexie compound index boundary keys
const DexieMinKey = -Infinity;
const DexieMaxKey = Infinity;
