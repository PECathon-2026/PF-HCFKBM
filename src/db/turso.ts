import { createClient, Client, ResultSet } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

export interface FeedRecord {
  id: string;
  url: string;
  title?: string;
  description?: string;
  status: "active" | "error" | "pending";
  created_at: string;
  updated_at: string;
}

export interface SubscriptionBatchRecord {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
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
    // In local development or testing, fall back to in-memory sqlite if URL is missing
    console.warn("[Turso DB] TURSO_DATABASE_URL not set. Falling back to in-memory SQLite (file::memory:).");
    return createClient({
      url: "file::memory:",
    });
  }

  // TODO: Team members can integrate secret rotation or KMS fetching for TURSO_AUTH_TOKEN
  return createClient({
    url,
    authToken,
  });
}

// Singleton database client instance
export const db: Client = initTursoClient();

/**
 * SQLite migration helper.
 * Creates the required tables:
 * - feeds
 * - subscription_batches
 * - batch_feeds
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

    // 2. subscription_batches table
    `CREATE TABLE IF NOT EXISTS subscription_batches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

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

    // 4. rate_limits table
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
    // TODO: Team members can add migration version tracking (e.g. schema_migrations table)
    return { success: true, appliedTables: tables };
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
    // TODO: Team members can add structured error categorization (unique constraint, syntax, timeout)
    throw new Error(`DB Error: ${message}`);
  }
}
