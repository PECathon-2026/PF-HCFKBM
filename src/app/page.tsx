"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Sparkles,
  CheckCheck,
  SlidersHorizontal,
  X,
  Command,
  TrendingUp,
  Rss,
  ChevronUp,
  ChevronDown,
  Layers,
  Eye,
  EyeOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ArticleCard, type ArticleCardData } from "@/components/ArticleCard";
import { LandingHero } from "@/components/LandingHero";
import { getArticles, getSubscriptions, markArticleRead, toggleArticleBookmark } from "@/lib/db";
import { syncAllFeeds } from "@/lib/sync";
import { initializeSeedData } from "@/lib/seed";

const INITIAL_ARTICLES: ArticleCardData[] = [];

const QUICK_SEARCH_SUGGESTIONS = [
  "Rust",
  "WASM",
  "SQLite",
  "Linux",
  "Frontend",
  "Vercel",
  "Simon",
];

// Interleaves articles to ensure feed diversity across the stream
function interleaveFeedDiversity(articles: ArticleCardData[]): ArticleCardData[] {
  if (articles.length <= 4) return articles;

  const result: ArticleCardData[] = [];
  const feedBuckets = new Map<string, ArticleCardData[]>();

  for (const a of articles) {
    const list = feedBuckets.get(a.feedTitle) || [];
    list.push(a);
    feedBuckets.set(a.feedTitle, list);
  }

  let hasMore = true;
  while (hasMore) {
    hasMore = false;
    for (const [_, list] of feedBuckets) {
      if (list.length > 0) {
        result.push(list.shift()!);
        hasMore = true;
      }
    }
  }

  return result;
}

export default function TimelinePage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread" | "bookmarked">("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedFeed, setSelectedFeed] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [articles, setArticles] = useState<ArticleCardData[]>(INITIAL_ARTICLES);
  const [displayCount, setDisplayCount] = useState<number>(15);

  // Single-card blurred carousel stream state
  const [carouselFocusMode, setCarouselFocusMode] = useState<boolean>(true);
  const [focusedCardIndex, setFocusedCardIndex] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Focus search shortcut (/ or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputFocused =
        document.activeElement === searchInputRef.current ||
        ["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName);

      if (
        (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) &&
        !isInputFocused
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape" && isSearchFocused) {
        searchInputRef.current?.blur();
        setIsSearchFocused(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchFocused]);

  // Sync with IndexedDB if records exist, then run quiet background sync through edge proxy
  useEffect(() => {
    let isMounted = true;

    const loadLocalArticles = async () => {
      // 1. Ensure seed dataset (12 curated indie tech feeds) is initialized in Dexie
      await initializeSeedData().catch(() => {});

      const [storedArticles, storedSubs] = await Promise.all([
        getArticles().catch(() => []),
        getSubscriptions().catch(() => []),
      ]);

      const subMap = new Map(storedSubs.map((s) => [s.id, s]));

      if (isMounted && storedArticles && storedArticles.length > 0) {
        const mapped: ArticleCardData[] = storedArticles.map((item) => {
          const parentSub = subMap.get(item.subscriptionId);
          return {
            id: item.id,
            feedTitle: parentSub?.title || item.subscriptionId,
            feedCategory: parentSub?.category || (item.subscriptionId.includes("Engineering") ? "Engineering" : "Technology"),
            title: item.title,
            summary: item.summary,
            author: item.author || parentSub?.title || "Staff",
            published: new Date(item.publishedAt).toLocaleDateString(),
            readingTimeMinutes: item.readingTimeMinutes || 4,
            isRead: item.isRead,
            isBookmarked: item.isBookmarked,
            originalUrl: item.url,
          };
        });
        setArticles(interleaveFeedDiversity(mapped));
      }

      // 2. Quietly trigger real proxy background sync across all subscriptions
      syncAllFeeds({ force: true })
        .then(async (summary) => {
          if (isMounted && summary.refreshed > 0) {
            const [freshArticles, freshSubs] = await Promise.all([
              getArticles().catch(() => []),
              getSubscriptions().catch(() => []),
            ]);
            const freshSubMap = new Map(freshSubs.map((s) => [s.id, s]));
            if (isMounted && freshArticles && freshArticles.length > 0) {
              const refreshedMapped: ArticleCardData[] = freshArticles.map((item) => {
                const parentSub = freshSubMap.get(item.subscriptionId);
                return {
                  id: item.id,
                  feedTitle: parentSub?.title || item.subscriptionId,
                  feedCategory: parentSub?.category || "Technology",
                  title: item.title,
                  summary: item.summary,
                  author: item.author || parentSub?.title || "Staff",
                  published: new Date(item.publishedAt).toLocaleDateString(),
                  readingTimeMinutes: item.readingTimeMinutes || 4,
                  isRead: item.isRead,
                  isBookmarked: item.isBookmarked,
                  originalUrl: item.url,
                };
              });
              setArticles(interleaveFeedDiversity(refreshedMapped));
            }
          }
        })
        .catch(() => {});
    };

    loadLocalArticles();

    return () => {
      isMounted = false;
    };
  }, []);

  // IntersectionObserver for auto-infinite scrolling
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayCount((prev) => prev + 15);
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [articles.length]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    articles.forEach((a) => {
      if (a.feedCategory) set.add(a.feedCategory);
    });
    return Array.from(set);
  }, [articles]);

  const feeds = useMemo(() => {
    const set = new Set<string>();
    articles.forEach((a) => {
      if (a.feedTitle) set.add(a.feedTitle);
    });
    return Array.from(set);
  }, [articles]);

  const toggleBookmark = (id: string) => {
    setArticles((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const next = !a.isBookmarked;
          toggleArticleBookmark(id, next).catch(async () => {
            const { db } = await import("@/lib/db");
            await db.articles
              .put({
                id: a.id,
                subscriptionId: a.feedTitle,
                title: a.title,
                summary: a.summary,
                content: a.summary,
                author: a.author,
                url: a.originalUrl || "",
                publishedAt: Date.now(),
                readingTimeMinutes: a.readingTimeMinutes,
                isRead: a.isRead,
                isBookmarked: next,
              })
              .catch(() => {});
          });
          return { ...a, isBookmarked: next };
        }
        return a;
      })
    );
  };

  const toggleRead = (id: string) => {
    setArticles((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const next = !a.isRead;
          markArticleRead(id, next).catch(async () => {
            const { db } = await import("@/lib/db");
            await db.articles
              .put({
                id: a.id,
                subscriptionId: a.feedTitle,
                title: a.title,
                summary: a.summary,
                content: a.summary,
                author: a.author,
                url: a.originalUrl || "",
                publishedAt: Date.now(),
                readingTimeMinutes: a.readingTimeMinutes,
                isRead: next,
                isBookmarked: a.isBookmarked,
              })
              .catch(() => {});
          });
          return { ...a, isRead: next };
        }
        return a;
      })
    );
  };

  const markAllRead = () => {
    setArticles((prev) =>
      prev.map((a) => {
        if (!a.isRead) {
          markArticleRead(a.id, true).catch(() => {});
        }
        return { ...a, isRead: true };
      })
    );
  };

  const unreadCount = useMemo(
    () => articles.filter((a) => !a.isRead).length,
    [articles]
  );

  const filteredArticles = useMemo(() => {
    return articles.filter((a) => {
      if (filter === "unread" && a.isRead) return false;
      if (filter === "bookmarked" && !a.isBookmarked) return false;
      if (selectedTag && a.feedCategory !== selectedTag) return false;
      if (selectedFeed && a.feedTitle !== selectedFeed) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          a.title.toLowerCase().includes(q) ||
          (a.summary && a.summary.toLowerCase().includes(q)) ||
          a.feedTitle.toLowerCase().includes(q) ||
          (a.author && a.author.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [articles, filter, selectedTag, selectedFeed, search]);

  // Smooth scroll jump to specific card index
  const scrollToCard = (index: number) => {
    if (index < 0 || index >= filteredArticles.length) return;
    const target = cardRefs.current[index];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setFocusedCardIndex(index);
    }
  };

  // Carousel scroll detector: dynamically sets focusedCardIndex to whichever card is in center viewport
  useEffect(() => {
    if (!carouselFocusMode) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idxStr = entry.target.getAttribute("data-card-index");
            if (idxStr !== null) {
              const idx = parseInt(idxStr, 10);
              if (!isNaN(idx)) {
                setFocusedCardIndex(idx);
              }
            }
          }
        });
      },
      {
        root: null,
        rootMargin: "-25% 0px -25% 0px", // triggers when card is in vertical center
        threshold: 0.25,
      }
    );

    cardRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [filteredArticles, displayCount, carouselFocusMode]);

  // Keyboard navigation engine (j/k: carousel snap, Enter/o: open, m: mark read, s: star)
  useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      const isInputFocused =
        document.activeElement === searchInputRef.current ||
        ["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName);

      if (isInputFocused) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(focusedCardIndex + 1, filteredArticles.length - 1);
        scrollToCard(next);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(focusedCardIndex - 1, 0);
        scrollToCard(prev);
      } else if ((e.key === "Enter" || e.key === "o") && focusedCardIndex >= 0 && focusedCardIndex < filteredArticles.length) {
        e.preventDefault();
        const selected = filteredArticles[focusedCardIndex];
        if (selected) {
          router.push(`/read/${selected.id}`);
        }
      } else if (e.key === "m" && focusedCardIndex >= 0 && focusedCardIndex < filteredArticles.length) {
        e.preventDefault();
        const selected = filteredArticles[focusedCardIndex];
        if (selected) {
          toggleRead(selected.id);
        }
      } else if (e.key === "s" && focusedCardIndex >= 0 && focusedCardIndex < filteredArticles.length) {
        e.preventDefault();
        const selected = filteredArticles[focusedCardIndex];
        if (selected) {
          toggleBookmark(selected.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyNav);
    return () => window.removeEventListener("keydown", handleKeyNav);
  }, [focusedCardIndex, filteredArticles, router]);

  return (
    <div className="flex-1 flex flex-col px-4 sm:px-8 py-8 sm:py-12 max-w-[840px] mx-auto w-full gap-8 animate-fade-in-up">
      {/* 1. Minimalist Glitch Decrypt Landing Hero with Shader Canvas */}
      <LandingHero
        onStartReading={() => {
          const anchor = document.getElementById("timeline-feed-anchor");
          if (anchor) {
            anchor.scrollIntoView({ behavior: "smooth" });
          } else {
            scrollToCard(0);
          }
        }}
      />

      <div id="timeline-feed-anchor" className="scroll-mt-6" />

      {/* Spacious, Serene Page Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-5 pb-6 border-b border-border/50 relative">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium tracking-wide">
            <span className="font-medium text-foreground/85">Quiet Digest</span>
            <span className="text-border">•</span>
            <span className="font-mono text-[11px]">{unreadCount} unread stories</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            Timeline
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
            A quiet, algorithm-free stream of independent engineering blogs, essays, and notes.
          </p>
        </div>

        {/* Filter Pills & Focus Carousel Mode Toggle */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => setCarouselFocusMode(!carouselFocusMode)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg btn-press flex items-center gap-1.5 transition-all duration-160 border",
              carouselFocusMode
                ? "bg-foreground text-background font-semibold shadow-xs border-foreground"
                : "border-border/60 bg-muted/50 text-muted-foreground hover:text-foreground"
            )}
            title="Toggle Single-Card Blurred Carousel Focus"
          >
            {carouselFocusMode ? (
              <>
                <Eye className="h-3.5 w-3.5" />
                <span>Carousel Focus ON</span>
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                <span>Carousel Focus OFF</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/60 shadow-2xs shrink-0">
            {(
              [
                { id: "all", label: "All" },
                { id: "unread", label: `Unread (${unreadCount})` },
                { id: "bookmarked", label: "Starred" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-medium rounded-lg btn-press transition-all duration-160",
                  filter === tab.id
                    ? "bg-card text-foreground font-semibold border border-border/70 card-linear"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* High-End Interactive Search Bar */}
      <div className="flex flex-col gap-3 relative">
        <div
          className={cn(
            "relative flex items-center rounded-xl border transition-all duration-200 bg-card/90 card-linear",
            isSearchFocused
              ? "border-foreground/30 ring-2 ring-foreground/5 bg-card"
              : "border-border/80 hover:border-border"
          )}
        >
          <Search
            className={cn(
              "absolute left-4 h-4 w-4 transition-colors duration-200 pointer-events-none",
              isSearchFocused
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          />

          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search articles, authors, or topics... (Press '/' to focus)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
            className="w-full pl-11 pr-24 py-2.5 text-sm bg-transparent rounded-xl focus:outline-none transition-all placeholder:text-muted-foreground/60 text-foreground"
          />

          {/* Right Action: Clear Button or Keyboard Shortcut Pill */}
          <div className="absolute right-3.5 flex items-center gap-1.5">
            {search ? (
              <button
                onClick={() => {
                  setSearch("");
                  searchInputRef.current?.focus();
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted btn-press transition-colors"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-muted-foreground/70 bg-muted/60 px-2 py-0.5 rounded-md border border-border/50">
                <Command className="h-3 w-3" />
                <span>K</span>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Search Dropdown Tray (Reveals on Focus) */}
        {isSearchFocused && (
          <div className="p-3.5 rounded-xl border border-border/70 bg-card/95 backdrop-blur-md card-linear flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150 z-20">
            <div className="flex items-center justify-between text-xs text-muted-foreground pb-2 border-b border-border/40">
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span>Quick Filters & Suggestions</span>
              </span>
              <span className="font-mono text-[11px]">{filteredArticles.length} results matching</span>
            </div>

            {/* Quick Topic Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {QUICK_SEARCH_SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSearch(sug);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium btn-press transition-all",
                    search.toLowerCase() === sug.toLowerCase()
                      ? "bg-foreground text-background font-semibold"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  #{sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Topic Filters */}
        <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground/80 font-medium mr-1 flex items-center gap-1">
              <SlidersHorizontal className="h-3 w-3" />
              <span>Topics:</span>
            </span>

            <button
              onClick={() => setSelectedTag(null)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-medium btn-press transition-all duration-150",
                selectedTag === null
                  ? "bg-secondary text-foreground font-semibold shadow-2xs border border-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              All Topics
            </button>

            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() =>
                  setSelectedTag(selectedTag === tag ? null : tag)
                }
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium btn-press transition-all duration-150",
                  selectedTag === tag
                    ? "bg-secondary text-foreground font-semibold shadow-2xs border border-border/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                {tag}
              </button>
            ))}
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-muted/50 btn-press shrink-0 transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mark all read</span>
            </button>
          )}
        </div>

        {/* Dedicated Per-Feed Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-t border-border/40 pt-2.5">
          <span className="text-[11px] text-muted-foreground/80 font-medium mr-1 flex items-center gap-1 shrink-0">
            <Rss className="h-3 w-3 text-primary" />
            <span>Feeds:</span>
          </span>

          <button
            onClick={() => setSelectedFeed(null)}
            className={cn(
              "px-2.5 py-0.5 rounded-md text-[11px] font-medium btn-press shrink-0 transition-colors",
              selectedFeed === null
                ? "bg-secondary text-foreground font-semibold shadow-2xs border border-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            All Feeds
          </button>

          {feeds.map((feed) => (
            <button
              key={feed}
              onClick={() => setSelectedFeed(selectedFeed === feed ? null : feed)}
              className={cn(
                "px-2.5 py-0.5 rounded-md text-[11px] font-medium btn-press shrink-0 transition-colors",
                selectedFeed === feed
                  ? "bg-secondary text-foreground font-semibold shadow-2xs border border-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              {feed}
            </button>
          ))}
        </div>
      </div>

      {/* Floating Carousel Deck Navigator (Available when carouselFocusMode is enabled) */}
      {carouselFocusMode && filteredArticles.length > 0 && (
        <div className="sticky top-4 z-30 flex items-center justify-between p-2 rounded-2xl bg-card/90 backdrop-blur-md border border-border/70 shadow-lg text-xs font-mono card-linear">
          <div className="flex items-center gap-2 px-3 py-1">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span className="text-foreground font-medium font-sans">Carousel Deck</span>
            <span className="text-border">•</span>
            <span className="text-muted-foreground">
              Story <strong className="text-foreground">{focusedCardIndex + 1}</strong> of {filteredArticles.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => scrollToCard(Math.max(focusedCardIndex - 1, 0))}
              disabled={focusedCardIndex === 0}
              className="p-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 btn-press"
              title="Previous Story (K)"
              aria-label="Previous story"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => scrollToCard(Math.min(focusedCardIndex + 1, filteredArticles.length - 1))}
              disabled={focusedCardIndex >= filteredArticles.length - 1}
              className="p-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 btn-press"
              title="Next Story (J)"
              aria-label="Next story"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Article Stream: Single-card blurred carousel deck */}
      <div className="flex flex-col gap-12 sm:gap-16 py-4">
        {filteredArticles.length === 0 ? (
          <div className="py-20 px-6 text-center border border-border/60 rounded-xl flex flex-col items-center justify-center gap-3 bg-card/60 backdrop-blur-xs card-linear">
            <div className="p-3.5 rounded-xl bg-muted/60 text-muted-foreground shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-base font-medium text-foreground">
              No articles found
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
              {search || selectedTag || selectedFeed
                ? "No stories match your active topic, feed, or keyword filter."
                : "No articles match this filter. Take a breath, or explore new feeds in the Discover tab."}
            </p>
            {(search || selectedTag || selectedFeed) && (
              <button
                onClick={() => {
                  setSearch("");
                  setSelectedTag(null);
                  setSelectedFeed(null);
                }}
                className="mt-2 text-xs text-foreground font-medium underline underline-offset-4 hover:opacity-80 btn-press"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <>
            {filteredArticles.slice(0, displayCount).map((article, idx) => {
              const isFocused = !carouselFocusMode || idx === focusedCardIndex;

              return (
                <div
                  key={article.id}
                  data-card-index={idx}
                  ref={(el) => {
                    cardRefs.current[idx] = el;
                  }}
                  className="transition-all duration-300"
                >
                  <ArticleCard
                    article={article}
                    isSelected={idx === focusedCardIndex}
                    isFocused={isFocused}
                    onFocusCard={() => scrollToCard(idx)}
                    onToggleRead={toggleRead}
                    onToggleBookmark={toggleBookmark}
                  />
                </div>
              );
            })}

            {/* Infinite Scroll Sentinel */}
            <div ref={loadMoreRef} className="h-8 w-full" />

            {/* Load More Manual Trigger if many articles remain */}
            {filteredArticles.length > displayCount && (
              <div className="py-2 flex flex-col items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setDisplayCount((prev) => prev + 15)}
                  className="px-4 py-2 rounded-xl border border-border/70 bg-card hover:bg-muted text-xs font-medium text-foreground btn-press shadow-2xs inline-flex items-center gap-2"
                >
                  <span>Load More Stories</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    ({filteredArticles.length - displayCount} remaining)
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
