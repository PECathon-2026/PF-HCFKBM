import { db } from "./turso";
import { feedIdFromUrl, normalizeUrl } from "../routes/discovery";

export interface SeedBlog {
  url: string;
  title: string;
  description: string;
  category: string;
}

export const CURATED_SEED_BLOGS: SeedBlog[] = [
  {
    url: "https://simonwillison.net/atom/everything/",
    title: "Simon Willison's Weblog",
    description: "Datasette, LLMs, prompt injection, and Python engineering",
    category: "AI & Python",
  },
  {
    url: "https://changelog.com/weekly/feed",
    title: "Changelog Weekly",
    description: "Open source software, developer culture, and tech news",
    category: "Software Engineering",
  },
  {
    url: "https://overreacted.io/rss.xml",
    title: "Overreacted by Dan Abramov",
    description: "Deep dives into React, JavaScript mental models, and software design",
    category: "Frontend",
  },
  {
    url: "https://jvns.ca/atom.xml",
    title: "Julia Evans (Bite Size Networking)",
    description: "Linux systems, DNS, Git internals, and debugging wizards",
    category: "Systems & Linux",
  },
  {
    url: "https://blog.codinghorror.com/rss/",
    title: "Coding Horror by Jeff Atwood",
    description: "Software engineering philosophy, human factors, and stack overflow lore",
    category: "Engineering",
  },
  {
    url: "https://drewdevault.com/blog/index.xml",
    title: "Drew DeVault's Blog",
    description: "SourceHut, Hare language, free software ethics, and Linux graphics",
    category: "Open Source",
  },
  {
    url: "https://rachelandrew.co.uk/feed",
    title: "Rachel Andrew",
    description: "CSS Grid, layout standards, accessibility, and web development",
    category: "Web Standards",
  },
  {
    url: "https://tantek.com/updates.atom",
    title: "Tantek Çelik",
    description: "IndieWeb pioneer, microformats, decentralized identity",
    category: "IndieWeb",
  },
  {
    url: "https://mitchellh.com/feed.xml",
    title: "Mitchell Hashimoto",
    description: "Ghostty terminal, Zig, infrastructure tooling, and systems programming",
    category: "Systems & Tools",
  },
  {
    url: "https://news.ycombinator.com/rss",
    title: "Hacker News Top Stories",
    description: "Startups, computer science, and technology community discussions",
    category: "Community",
  },
  {
    url: "https://www.robinsloan.com/feed.xml",
    title: "Robin Sloan",
    description: "Small internet philosophy, experimental writing, and handcrafted media",
    category: "Small Web",
  },
  {
    url: "http://www.aaronsw.com/2002/feeds/pgessays.rss",
    title: "Paul Graham Essays",
    description: "Startups, thinking clearly, wealth creation, and hacker culture",
    category: "Philosophy & Startups",
  },
];

// Clusters of feeds commonly read together to seed realistic co-subscriptions
const SEED_BATCH_CLUSTERS = [
  // Cluster A: Systems & Open Source
  [
    "https://jvns.ca/atom.xml",
    "https://drewdevault.com/blog/index.xml",
    "https://simonwillison.net/atom/everything/",
    "https://mitchellh.com/feed.xml",
  ],
  // Cluster B: Frontend & Web Standards
  [
    "https://overreacted.io/rss.xml",
    "https://rachelandrew.co.uk/feed",
    "https://changelog.com/weekly/feed",
    "https://tantek.com/updates.atom",
  ],
  // Cluster C: Small Web & Indie Thinkers
  [
    "https://tantek.com/updates.atom",
    "https://www.robinsloan.com/feed.xml",
    "http://www.aaronsw.com/2002/feeds/pgessays.rss",
    "https://simonwillison.net/atom/everything/",
  ],
  // Cluster D: General Engineering & News
  [
    "https://changelog.com/weekly/feed",
    "https://blog.codinghorror.com/rss/",
    "https://news.ycombinator.com/rss",
    "https://overreacted.io/rss.xml",
  ],
];

/**
 * Bootstraps initial seed feeds and anonymous co-subscription clusters into Turso.
 * Ensures the Discover page and recommendations are populated on demo day.
 */
export async function seedTursoIfEmpty(): Promise<boolean> {
  try {
    const existing = await db.execute("SELECT COUNT(*) as count FROM feeds");
    const count = Number(existing.rows[0]?.count || 0);

    if (count > 0) {
      return false; // Already seeded
    }

    console.log("[Turso Seed] Bootstrapping 12 curated tech feeds and co-subscription clusters...");

    // 1. Insert Curated Feeds
    for (const blog of CURATED_SEED_BLOGS) {
      const normalized = normalizeUrl(blog.url) || blog.url;
      const id = feedIdFromUrl(normalized);

      await db.execute({
        sql: `INSERT OR IGNORE INTO feeds (id, url, title, description, status)
              VALUES (?, ?, ?, ?, 'active')`,
        args: [id, normalized, blog.title, blog.description],
      });
    }

    // 2. Insert Simulated Anonymous Batches & Co-Subscription Clusters
    for (let i = 0; i < SEED_BATCH_CLUSTERS.length; i++) {
      const cluster = SEED_BATCH_CLUSTERS[i];
      const batchId = `seed_batch_${i + 1}`;
      const dummyIpHash = `seed_hash_${i + 1}`;

      await db.execute({
        sql: `INSERT OR IGNORE INTO subscription_batches (id, salted_ip_hash) VALUES (?, ?)`,
        args: [batchId, dummyIpHash],
      });

      for (const feedUrl of cluster) {
        const normalized = normalizeUrl(feedUrl) || feedUrl;
        const feedId = feedIdFromUrl(normalized);

        await db.execute({
          sql: `INSERT OR IGNORE INTO batch_feeds (batch_id, feed_id) VALUES (?, ?)`,
          args: [batchId, feedId],
        });
      }
    }

    console.log("[Turso Seed] Database successfully populated with initial dataset.");
    return true;
  } catch (error) {
    console.error("[Turso Seed Error] Failed to bootstrap seed data:", error);
    return false;
  }
}
