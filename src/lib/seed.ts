import { db, type Subscription, type Article } from "./db";
import { isOnline, syncAllFeeds } from "./sync";

export interface SeedFeedDefinition {
  id: string;
  title: string;
  url: string;
  siteUrl: string;
  category: string;
  description: string;
}

export const SEED_FEEDS: SeedFeedDefinition[] = [
  {
    id: "sub-seed-1",
    title: "Simon Willison's Weblog",
    url: "https://simonwillison.net/atom/everything/",
    siteUrl: "https://simonwillison.net",
    category: "AI & Engineering",
    description: "General thoughts on web development, AI tooling, and data journalism.",
  },
  {
    id: "sub-seed-2",
    title: "Changelog Weekly",
    url: "https://changelog.com/weekly/feed",
    siteUrl: "https://changelog.com",
    category: "Software Development",
    description: "Editorial newsletter covering open source, developer culture, and tech news.",
  },
  {
    id: "sub-seed-3",
    title: "Dan Abramov's Overreacted",
    url: "https://overreacted.io/rss.xml",
    siteUrl: "https://overreacted.io",
    category: "Frontend & Architecture",
    description: "Personal essays on React, UI engineering, and programming mental models.",
  },
  {
    id: "sub-seed-4",
    title: "Julia Evans (jvns.ca)",
    url: "https://jvns.ca/atom.xml",
    siteUrl: "https://jvns.ca",
    category: "Systems & Linux",
    description: "Delightful zines and deep dives on Linux, networking, DNS, and debugging.",
  },
  {
    id: "sub-seed-5",
    title: "Rachel Andrew",
    url: "https://rachelandrew.co.uk/feed",
    siteUrl: "https://rachelandrew.co.uk",
    category: "CSS & Web Standards",
    description: "Web standards, CSS Grid, layout engines, and the business of web design.",
  },
  {
    id: "sub-seed-6",
    title: "Tantek Çelik",
    url: "https://tantek.com/updates.atom",
    siteUrl: "https://tantek.com",
    category: "IndieWeb & Standards",
    description: "Thoughts on POSSE, open web architecture, microformats, and web standards.",
  },
  {
    id: "sub-seed-7",
    title: "Robin Sloan",
    url: "https://www.robinsloan.com/feed.xml",
    siteUrl: "https://www.robinsloan.com",
    category: "Writing & Media",
    description: "Speculative fiction, machine learning experiments, and home-cooked software.",
  },
  {
    id: "sub-seed-8",
    title: "Jeff Atwood (Coding Horror)",
    url: "https://blog.codinghorror.com/rss/",
    siteUrl: "https://blog.codinghorror.com",
    category: "Software Culture",
    description: "Reflections on software development, human factors, and community building.",
  },
  {
    id: "sub-seed-9",
    title: "Paul Graham Essays",
    url: "http://www.aaronsw.com/2002/feeds/pgessays.rss",
    siteUrl: "http://www.paulgraham.com",
    category: "Startups & Essays",
    description: "Essays on startups, technology, programming languages, and philosophy.",
  },
  {
    id: "sub-seed-10",
    title: "Mitchell Hashimoto",
    url: "https://mitchellh.com/feed.xml",
    siteUrl: "https://mitchellh.com",
    category: "Systems & Infrastructure",
    description: "Building developer tools, Ghostty terminal, Zig development, and systems engineering.",
  },
  {
    id: "sub-seed-11",
    title: "Hacker News Frontpage",
    url: "https://news.ycombinator.com/rss",
    siteUrl: "https://news.ycombinator.com",
    category: "Aggregators & News",
    description: "Top community-voted links on technology, startups, and computing.",
  },
  {
    id: "sub-seed-12",
    title: "Drew DeVault's Blog",
    url: "https://drewdevault.com/blog/index.xml",
    siteUrl: "https://drewdevault.com",
    category: "Open Source & Systems",
    description: "Open source software, Hare programming language, Wayland, and software freedom.",
  },
];

export const SEED_DEMO_ARTICLES: Article[] = [];

const SEED_STORAGE_KEY = "onlydevs_seed_initialized_v2";

/**
 * Checks whether the seed dataset has already been initialized in this client.
 */
export function isSeedInitialized(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SEED_STORAGE_KEY) === "true";
}

/**
 * Initializes the seed dataset idempotently into IndexedDB.
 * Does not overwrite existing user changes or duplicate subscriptions.
 */
export async function initializeSeedData(options?: {
  force?: boolean;
}): Promise<{ seeded: boolean; subscriptionsCount: number; articlesCount: number }> {
  const { force = false } = options || {};

  try {
    const existingCount = await db.subscriptions.count();
    const alreadyMarked = isSeedInitialized();

    // Clean out legacy sample articles if any exist in user's Dexie
    const sampleArticles = await db.articles
      .filter((a) => a.isSample === true || a.id.startsWith("demo-") || a.id.startsWith("art-"))
      .toArray()
      .catch(() => []);
    if (sampleArticles.length > 0) {
      await db.articles.bulkDelete(sampleArticles.map((a) => a.id)).catch(() => {});
    }

    if (!force && (existingCount > 0 && alreadyMarked)) {
      return {
        seeded: false,
        subscriptionsCount: existingCount,
        articlesCount: await db.articles.count(),
      };
    }

    // Atomic transaction to seed feeds
    await db.transaction("rw", [db.subscriptions], async () => {
      // 1. Build subscription records
      const subscriptionRecords: Subscription[] = SEED_FEEDS.map((feed) => ({
        id: feed.id,
        url: feed.url,
        title: feed.title,
        description: feed.description,
        siteUrl: feed.siteUrl,
        category: feed.category,
        createdAt: Date.now(),
        status: "active",
        errorCount: 0,
      }));

      // Use bulkPut to ensure idempotency without duplicate key collisions
      await db.subscriptions.bulkPut(subscriptionRecords);
    });

    if (typeof window !== "undefined") {
      localStorage.setItem(SEED_STORAGE_KEY, "true");
    }

    // 2. If online, kick off non-blocking background refresh for real live feeds
    if (isOnline()) {
      setTimeout(() => {
        syncAllFeeds({ force: true }).catch((err) =>
          console.warn("Background feed refresh after seeding encountered issues:", err)
        );
      }, 500);
    }

    return {
      seeded: true,
      subscriptionsCount: SEED_FEEDS.length,
      articlesCount: await db.articles.count(),
    };
  } catch (err) {
    console.error("Failed to initialize seed dataset in IndexedDB:", err);
    throw err;
  }
}

/**
 * Reset helper for testing or re-seeding the demo dataset.
 */
export async function resetToSeedData(): Promise<void> {
  await db.transaction("rw", [db.subscriptions, db.articles], async () => {
    await db.subscriptions.clear();
    await db.articles.clear();
  });
  if (typeof window !== "undefined") {
    localStorage.removeItem(SEED_STORAGE_KEY);
  }
  await initializeSeedData({ force: true });
}
