import { createClient, Client, ResultSet } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

export interface FeedRecord {
  id: string; // URL hash
  url: string;
  title?: string;
  description?: string;
  status: "active" | "error" | "pending";
  created_at: string;
  updated_at: string;
}

export interface SubscriptionBatchRecord {
  id: string;
  salted_ip_hash: string;
  submitted_at: string;
}

export interface BatchFeedRecord {
  batch_id: string;
  feed_id: string;
  added_at: string;
}

export interface RateLimitRecord {
  key: string;
  count: number;
  reset_at: number;
  created_at: string;
}

/**
 * Validates environment variables and initializes the LibSQL client for Turso.
 */
export function initTursoClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    console.warn("[Turso DB] TURSO_DATABASE_URL not set. Falling back to in-memory SQLite (file::memory:).");
    return createClient({
      url: "file::memory:",
    });
  }

  return createClient({
    url,
    authToken,
  });
}

// Singleton database client instance
export const db: Client = initTursoClient();

/**
 * SQLite migration helper for Turso.
 * Creates tables:
 * - feeds
 * - subscription_batches (with salted_ip_hash)
 * - batch_feeds (junction table)
 * - rate_limits
 */
export async function runMigrations(): Promise<{ success: boolean; appliedTables: string[] }> {
  const tables = ["feeds", "subscription_batches", "batch_feeds", "rate_limits"];

  const migrationQueries = [
    // 1. feeds table
    `CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      description TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('active', 'error', 'pending')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url);`,
    `CREATE INDEX IF NOT EXISTS idx_feeds_status ON feeds(status);`,

    // 2. subscription_batches table with salted IP hash & short-term tracking
    `CREATE TABLE IF NOT EXISTS subscription_batches (
      id TEXT PRIMARY KEY,
      salted_ip_hash TEXT NOT NULL,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE INDEX IF NOT EXISTS idx_sub_batches_ip_hash ON subscription_batches(salted_ip_hash, submitted_at);`,

    // 3. batch_feeds junction table
    `CREATE TABLE IF NOT EXISTS batch_feeds (
      batch_id TEXT NOT NULL,
      feed_id TEXT NOT NULL,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (batch_id, feed_id),
      FOREIGN KEY (batch_id) REFERENCES subscription_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
    );`,

    `CREATE INDEX IF NOT EXISTS idx_batch_feeds_batch ON batch_feeds(batch_id);`,
    `CREATE INDEX IF NOT EXISTS idx_batch_feeds_feed ON batch_feeds(feed_id);`,

    // 4. feed_edges table (for blogroll and co-subscription graph linkages)
    `CREATE TABLE IF NOT EXISTS feed_edges (
      source_feed_id TEXT NOT NULL,
      target_feed_id TEXT NOT NULL,
      relation_type TEXT NOT NULL CHECK(relation_type IN ('co_subscription', 'blogroll')),
      weight INTEGER DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_feed_id, target_feed_id, relation_type),
      FOREIGN KEY (source_feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
      FOREIGN KEY (target_feed_id) REFERENCES feeds(id) ON DELETE CASCADE
    );`,

    `CREATE INDEX IF NOT EXISTS idx_feed_edges_source ON feed_edges(source_feed_id);`,
    `CREATE INDEX IF NOT EXISTS idx_feed_edges_target ON feed_edges(target_feed_id);`,

    // 5. rate_limits table
    `CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER DEFAULT 1,
      reset_at INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);`
  ];

  try {
    for (const query of migrationQueries) {
      await db.execute(query);
    }
    return { success: true, appliedTables: ["feeds", "subscription_batches", "batch_feeds", "feed_edges", "rate_limits"] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error during migrations";
    console.error("[Turso Migration Error]:", message);
    throw new Error(`Database migration failed: ${message}`);
  }
}

/**
 * Safe query execution wrapper with typed results and error handling.
 */
export async function executeQuery<T = Record<string, unknown>>(
  sql: string,
  args: Array<string | number | boolean | null> = []
): Promise<T[]> {
  try {
    const result: ResultSet = await db.execute({ sql, args });
    return result.rows as unknown as T[];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Query execution failed";
    console.error(`[DB Query Error] Query: "${sql}"`, message);
    throw new Error(`DB Error: ${message}`);
  }
}
