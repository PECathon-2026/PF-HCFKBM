"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ExternalLink,
  BookOpen,
  AlertCircle,
  Clock,
  Calendar,
  CheckCircle2,
  Bookmark,
  BookmarkCheck,
  X,
  ArrowRight,
  List,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractArticle } from "@/lib/parser";
import { sanitizeHtml } from "@/lib/sanitizer";
import {
  ReadingControls,
  type ReaderFontSize,
  type ReaderColumnWidth,
  type ReaderFontFamily,
  type ReaderTheme,
  type ReadingSpotData,
} from "@/components/ReadingControls";
import {
  db,
  getArticles,
  markArticleRead,
  toggleArticleBookmark,
  type Article,
} from "@/lib/db";

interface ReaderProps {
  params: {
    id: string;
  };
}

interface ArticleDetail {
  id: string;
  feedTitle: string;
  feedCategory?: string;
  title: string;
  summary?: string;
  content?: string;
  author?: string;
  publishedDate: string;
  readingTimeMinutes: number;
  originalUrl: string;
  isSummaryFallback: boolean;
}

const SAMPLE_ARTICLES: ArticleDetail[] = [
  {
    id: "art-1",
    feedTitle: "Changelog Weekly",
    feedCategory: "Systems & Architecture",
    title: "Rust in Linux: What 2 Years of Production Kernel Drivers Taught Us",
    summary:
      "A retrospective on memory safety guarantees in Linux subsystems, C interoperability hurdles, and real-world performance benchmarks across storage drivers.",
    author: "Elena Rostova",
    publishedDate: "October 28, 2026",
    readingTimeMinutes: 6,
    originalUrl: "https://changelog.com/weekly/rust-in-linux",
    isSummaryFallback: false,
    content: `
      <p class="lead">
        Two years after the Rust infrastructure was first merged into the mainline Linux kernel tree, production drivers are quietly serving critical I/O across modern hyperscale storage fleets. Here is what two years of production telemetry, unsafe FFI wrappers, and cross-language stack unwinding taught our engineering group.
      </p>

      <h2>The Eradication of UAF and Lock-Drop Hazards</h2>
      <p>
        In low-level kernel C development, the vast majority of severe security advisories trace back to subtle lifecycle hazards: Use-After-Free (UAF), double-frees in obscure error unwinding branches, and race conditions resulting from missed mutex unlock sequences.
      </p>
      <p>
        By implementing Rust's strict Resource Acquisition Is Initialization (RAII) pattern across kernel subsystem lock wrappers, our team eliminated lock-drop hazards entirely. Once a <code>Guard&lt;'a, Mutex&gt;</code> goes out of scope—whether through nominal completion or early branch returns—the lock handle drops with zero runtime latency.
      </p>

      <blockquote>
        "Memory safety is not just an academic guarantee; in production storage tiers, eliminating silent memory corruptions translates directly into hundreds of hours saved in root-cause crash triage."
      </blockquote>

      <h2>Zero-Cost Abstractions at the FFI Boundary</h2>
      <p>
        A frequent concern voiced by systems engineers during early RFC discussions was potential binary bloat and latency penalties introduced by mapping native kernel C primitives into Rust abstractions.
      </p>
      <p>
        In extensive benchmarks measuring random 4K NVMe read requests over 10 million transactions, the Rust driver achieved parity with the battle-tested C driver, clocking within a 0.38% margin of error. The compiler optimizations performed by LLVM across inline C-FFI thunks effectively erased the boundary overhead in hot execution loops.
      </p>

      <h2>Cognitive Friction and Toolchain Evolution</h2>
      <p>
        The primary bottleneck was never runtime performance; it was ergonomic integration with Linux's existing build harness (Kbuild) and internal patch verification workflows. Writing sound abstractions over C macro-heavy dispatch tables required meticulous use of unsafe blocks and custom bindgen generators.
      </p>
      <p>
        As the ecosystem matured, community tooling like <code>kernel-bindgen</code> and pinned LLVM compiler targets reduced friction significantly. Today, our engineering team ships storage feature updates with significantly greater confidence and dramatically fewer defensive code assertions.
      </p>
    `,
  },
  {
    id: "art-2",
    feedTitle: "Vercel Engineering",
    feedCategory: "Frontend",
    title: "Next-gen Edge Middleware: Sub-5ms Geo Routing with WebAssembly",
    summary:
      "Deep dive into compiling native C++ routing rules into WASM running directly on edge PoPs, avoiding origin roundtrips entirely.",
    author: "Malik Chen",
    publishedDate: "October 27, 2026",
    readingTimeMinutes: 4,
    originalUrl: "https://vercel.com/blog",
    isSummaryFallback: false,
    content: `
      <p class="lead">
        Routing user traffic across distributed edge Points of Presence requires lightning fast execution. By compiling routing policies into WebAssembly, we eliminated origin roundtrips while preserving full programmability.
      </p>
      <h2>Sub-5 Millisecond Execution Budgets</h2>
      <p>
        Traditional serverless cold starts introduce noticeable latency penalties. WASM micro-sandboxes instantiate in sub-millisecond windows with strict memory caps.
      </p>
      <p>
        By moving path rewrites, header validations, and tenant routing rules into ahead-of-time compiled WASM modules, edge nodes resolve incoming client requests without waking centralized origin clusters.
      </p>
      <h2>Memory Sandboxing at Cloudflare &amp; Fastly Edges</h2>
      <p>
        Each edge request executes inside an isolated linear memory buffer. Even if a third-party plugin encounters a fatal trap, neighboring requests in the same process remain uncompromised.
      </p>
    `,
  },
  {
    id: "art-3",
    feedTitle: "Simon Willison's Weblog",
    feedCategory: "AI / Dev",
    title: "Sandboxing Agent Code Execution with SQLite WASM and Content Security Policies",
    summary:
      "Patterns for safely executing untrusted SQL and data transformations generated by LLMs in isolated browser-side virtual tables.",
    author: "Simon Willison",
    publishedDate: "October 26, 2026",
    readingTimeMinutes: 8,
    originalUrl: "https://simonwillison.net",
    isSummaryFallback: false,
    content: `
      <p class="lead">
        Executing untrusted code generated by AI models requires multi-layer defense. Running SQLite entirely in WASM with strict origin policies provides a robust sandbox directly in the client.
      </p>
      <h2>Virtual Filesystems in IndexedDB</h2>
      <p>
        SQLite's VFS (Virtual File System) maps directly into browser-side IndexedDB persistence, enabling complete offline queries without exposing server assets.
      </p>
      <p>
        When an AI agent writes an exploratory SQL aggregation over personal feeds, executing that query in an in-memory WASM table ensures prompt injections can never exfiltrate tokens or reach private API backends.
      </p>
      <blockquote>
        "The best security boundary for untrusted code execution is the user's own device with zero network privileges."
      </blockquote>
    `,
  },
  {
    id: "art-4",
    feedTitle: "Hacker News",
    feedCategory: "Tech & Society",
    title: "Show HN: OnlyDevs – Offline-First RSS Reader with Turso Edge Synchronization",
    summary:
      "Scaffolded with Dexie.js in the browser and edge proxy SSRF defense to reliably digest thousands of tech feeds without server bloat.",
    author: "samarrv",
    publishedDate: "October 25, 2026",
    readingTimeMinutes: 3,
    originalUrl: "https://news.ycombinator.com",
    isSummaryFallback: false,
    content: `
      <p class="lead">
        OnlyDevs was born from a simple frustration: modern feed readers have become bloated social networks that track your clicks, sell your reading habits, and paywall basic offline features.
      </p>
      <h2>Zero Tracking by Architectural Invariant</h2>
      <p>
        By delegating all feed parsing, article sanitization, and reading progress tracking to browser-side IndexedDB (via Dexie.js), the server operates purely as a stateless, non-logging CORS stream proxy.
      </p>
      <h2>Anonymous Co-Subscription Graph Discovery</h2>
      <p>
        Instead of collaborative filtering based on user profiling, discovery recommendations leverage mathematical co-occurrence batches submitted with rotating, salted IP hashes. Readers discover handcrafted indie developer blogs without trading their privacy.
      </p>
    `,
  },
  {
    id: "art-5",
    feedTitle: "Overreacted",
    feedCategory: "Frontend",
    title: "A Thorough Farewell to Layout Thrashing and Manual Cache Busting",
    summary:
      "Understanding compiler-optimized memoization and how React 19 transforms fine-grained component re-renders into predictable micro-tasks.",
    author: "Dan Abramov",
    publishedDate: "October 24, 2026",
    readingTimeMinutes: 5,
    originalUrl: "https://overreacted.io",
    isSummaryFallback: false,
    content: `
      <p class="lead">
        For years, optimizing React applications felt like walking a tightrope between layout thrashing and premature memoization. We peppered our components with <code>useMemo</code>, <code>useCallback</code>, and manual dependency arrays, hoping the runtime wouldn't drop frames during burst renders.
      </p>

      <h2>The False Promise of Manual Memoization</h2>
      <p>
        Every React developer knows the ritual: a table slows down, you pull up the React DevTools Profiler, spot unnecessary re-renders, and wrap three handlers in <code>useCallback</code>. Two weeks later, another teammate edits a closure, forgets an argument in the dependency array, and either causes a stale closure bug or breaks memoization entirely.
      </p>
      <p>
        Manual memoization was always a compiler problem masquerading as a developer responsibility. Human developers shouldn't be human linter-compilers verifying referential equality.
      </p>

      <blockquote>
        "Premature memoization doesn't just clutter your codebase with boilerplate; it actively introduces subtle concurrency and lifecycle bugs that are notoriously difficult to reproduce in CI."
      </blockquote>

      <h2>How the React Compiler Changes the Game</h2>
      <p>
        Instead of asking developers to manually memorize values, the compiler performs static semantic analysis across your component tree. It identifies which values actually depend on reactive state and automatically generates fine-grained memoization boundaries at the AST level.
      </p>
      <p>
        Here is what a typical component looks like before and after compilation:
      </p>

      <pre><code>// What you write today:
function FeedStream({ feeds, filter }) {
  const visibleFeeds = feeds.filter(f =&gt; f.category === filter);
  return &lt;FeedList items={visibleFeeds} /&gt;;
}

// What the compiler outputs under the hood:
function FeedStream({ feeds, filter }) {
  const $ = useMemoCache(2);
  let visibleFeeds;
  if ($[0] !== feeds || $[1] !== filter) {
    visibleFeeds = feeds.filter(f =&gt; f.category === filter);
    $[0] = feeds;
    $[1] = filter;
  } else {
    visibleFeeds = $[0];
  }
  return &lt;FeedList items={visibleFeeds} /&gt;;
}</code></pre>

      <h2>Eliminating Layout Thrashing in Feed Readers</h2>
      <p>
        When building high-density feed readers, DOM layout thrashing—interleaving reads of <code>offsetHeight</code> or <code>scrollTop</code> with writes to <code>style.transform</code>—triggers forced synchronous reflows. By offloading layout calculations into CSS transforms and leveraging React 19's asynchronous transitions, rendering 500+ timeline entries remains locked at a consistent 60 FPS.
      </p>
    `,
  },
];

export default function ReaderPage({ params }: ReaderProps) {
  const [article, setArticle] = useState<ArticleDetail>(SAMPLE_ARTICLES[0]);
  const [fontSize, setFontSize] = useState<ReaderFontSize>("base");
  const [numericFontSize, setNumericFontSize] = useState<number>(18);
  const [lineHeight, setLineHeight] = useState<number>(1.85);
  const [columnWidth, setColumnWidth] = useState<ReaderColumnWidth>("wide");
  const [fontFamily, setFontFamily] = useState<ReaderFontFamily>("serif");
  const [theme, setTheme] = useState<ReaderTheme>("dark");
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isRead, setIsRead] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [availableArticles, setAvailableArticles] = useState<ArticleDetail[]>(SAMPLE_ARTICLES);
  const [savedReadingSpot, setSavedReadingSpot] = useState<ReadingSpotData | null>(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [markerNotice, setMarkerNotice] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Initialize theme from HTML class or localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(isDark ? "dark" : "light");

      // Load saved reading spot from localStorage cache
      try {
        const cached = localStorage.getItem(`onlydevs_spot_${params.id}`);
        if (cached) {
          const parsed = JSON.parse(cached) as ReadingSpotData;
          setSavedReadingSpot(parsed);
          if (parsed.scrollY > 250) {
            setShowResumeBanner(true);
          }
        }
      } catch (_) {}
    }
  }, [params.id]);

  // Full article extractor using @mozilla/readability via CORS proxy
  const handleExtractFullArticle = async (
    url?: string,
    fallbackMeta?: { title?: string; summary?: string; content?: string }
  ) => {
    const targetUrl = url || article.originalUrl;
    if (!targetUrl || !targetUrl.startsWith("http") || isExtracting) return;

    setIsExtracting(true);
    setMarkerNotice("Extracting full article via Readability...");

    try {
      const endpoint = `/fetch?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const rawHtml = await res.text();
        const extracted = await extractArticle(
          rawHtml,
          fallbackMeta || {
            title: article.title,
            summary: article.summary,
            content: article.content,
          },
          targetUrl
        );

        if (extracted.content && extracted.content.length > 100) {
          setArticle((prev) => ({
            ...prev,
            content: extracted.content,
            isSummaryFallback: false,
            readingTimeMinutes: extracted.readingTimeMinutes || prev.readingTimeMinutes,
          }));

          // Persist full article in Dexie IndexedDB
          await db.articles
            .update(params.id, {
              content: extracted.content,
              readingTimeMinutes: extracted.readingTimeMinutes,
            })
            .catch(() => {});

          setMarkerNotice("Full article extracted with Readability");
          setTimeout(() => setMarkerNotice(null), 3000);
        } else {
          setMarkerNotice("Readability found no article body, using feed summary");
          setTimeout(() => setMarkerNotice(null), 3500);
        }
      }
    } catch (err) {
      console.error("Failed to extract full article:", err);
      setMarkerNotice("Extraction failed; showing available summary");
      setTimeout(() => setMarkerNotice(null), 3500);
    } finally {
      setIsExtracting(false);
    }
  };

  // Sync article list & current article from Dexie or fallback
  useEffect(() => {
    let mounted = true;

    // Load current article
    db.articles
      .get(params.id)
      .then((record) => {
        if (mounted && record) {
          // Check if sample fixture has full rich text
          const sampleMatch = SAMPLE_ARTICLES.find(
            (a) => a.id === params.id || a.title === record.title
          );

          const hasRealContent =
            record.content &&
            record.content.length > 250 &&
            record.content !== record.summary;

          const chosenContent = hasRealContent
            ? record.content
            : sampleMatch?.content || record.content || record.summary;

          const isFallback =
            !chosenContent ||
            (chosenContent === record.summary && chosenContent.length < 250);

          setArticle({
            id: record.id,
            feedTitle: record.subscriptionId || "Feed Source",
            title: record.title,
            summary: record.summary,
            content: chosenContent,
            author: record.author || sampleMatch?.author || "Anonymous Author",
            publishedDate: new Date(record.publishedAt).toLocaleDateString(),
            readingTimeMinutes: record.readingTimeMinutes || sampleMatch?.readingTimeMinutes || 4,
            originalUrl: record.url || sampleMatch?.originalUrl || "",
            isSummaryFallback: isFallback,
          });
          setIsBookmarked(record.isBookmarked);
          setIsRead(record.isRead);

          // If content is short or empty and URL is available, auto-extract
          if (isFallback && record.url && record.url.startsWith("http")) {
            handleExtractFullArticle(record.url, {
              title: record.title,
              summary: record.summary,
              content: record.content,
            });
          }
        } else if (mounted) {
          const match =
            SAMPLE_ARTICLES.find((a) => a.id === params.id) ||
            (params.id === "art-1" || params.id === "demo-1" ? SAMPLE_ARTICLES[0] : undefined);
          if (match) setArticle(match);
        }
      })
      .catch(() => {});

    // Load available articles for Library / Bookmarks drawer
    getArticles()
      .then((stored) => {
        if (mounted && stored && stored.length > 0) {
          const mapped: ArticleDetail[] = stored.map((r) => {
            const sample = SAMPLE_ARTICLES.find(
              (a) => a.id === r.id || a.title === r.title
            );
            return {
              id: r.id,
              feedTitle: r.subscriptionId || "Feed Source",
              title: r.title,
              summary: r.summary,
              content: r.content || sample?.content,
              author: r.author,
              publishedDate: new Date(r.publishedAt).toLocaleDateString(),
              readingTimeMinutes: r.readingTimeMinutes || 4,
              originalUrl: r.url,
              isSummaryFallback: !r.content && !sample?.content,
            };
          });
          setAvailableArticles(mapped);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [params.id]);

  // Track scroll position for reading progress bar with requestAnimationFrame throttling
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const totalScroll = document.documentElement.scrollTop;
          const windowHeight =
            document.documentElement.scrollHeight -
            document.documentElement.clientHeight;
          if (windowHeight > 0) {
            const progress = (totalScroll / windowHeight) * 100;
            setScrollProgress(Math.min(Math.max(progress, 0), 100));
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleToggleBookmark = () => {
    const next = !isBookmarked;
    setIsBookmarked(next);
    toggleArticleBookmark(article.id, next).catch(() => {});
  };

  const handleMarkRead = () => {
    const next = !isRead;
    setIsRead(next);
    markArticleRead(article.id, next).catch(() => {});
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: article.title,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Article link copied to clipboard");
    }
  };

  const handleSaveReadingSpot = () => {
    const currentScrollY =
      typeof window !== "undefined"
        ? window.scrollY || document.documentElement.scrollTop
        : 0;
    const spot: ReadingSpotData = {
      scrollProgress: Math.round(scrollProgress),
      scrollY: currentScrollY,
      timestamp: Date.now(),
    };
    setSavedReadingSpot(spot);
    try {
      localStorage.setItem(`onlydevs_spot_${params.id}`, JSON.stringify(spot));
      setMarkerNotice(`Reading spot marked at ${spot.scrollProgress}%`);
      setTimeout(() => setMarkerNotice(null), 3000);
    } catch (_) {}
  };

  const handleJumpToReadingSpot = () => {
    if (savedReadingSpot && typeof window !== "undefined") {
      window.scrollTo({
        top: savedReadingSpot.scrollY,
        behavior: "smooth",
      });
      setShowResumeBanner(false);
    }
  };

  const handleClearReadingSpot = () => {
    setSavedReadingSpot(null);
    setShowResumeBanner(false);
    try {
      localStorage.removeItem(`onlydevs_spot_${params.id}`);
    } catch (_) {}
  };

  const handleThemeChange = (newTheme: ReaderTheme) => {
    setTheme(newTheme);
    const root = document.documentElement;
    if (newTheme === "dark" || newTheme === "slate") {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
    window.dispatchEvent(new Event("themechange"));
  };

  // Crucial: Sanitize HTML content with zero-trust sanitizer (resolves relative image URLs)
  const sanitizedContent = useMemo(() => {
    if (!article.content) return "";
    return sanitizeHtml(article.content, { baseUrl: article.originalUrl });
  }, [article.content, article.originalUrl]);

  // Typography mappings
  const fontSizeClasses: Record<ReaderFontSize, string> = {
    sm: "text-base leading-relaxed",
    base: "text-lg leading-relaxed",
    lg: "text-xl leading-loose",
    xl: "text-2xl leading-loose",
  };

  const fontFamilyStyles: Record<ReaderFontFamily, string> = {
    serif: "font-serif",
    newsreader: "font-serif",
    sans: "font-sans",
    georgia: "font-serif",
    merriweather: "font-serif",
    mono: "font-mono",
  };

  const columnWidthClasses: Record<ReaderColumnWidth, string> = {
    compact: "max-w-[620px]",
    default: "max-w-[780px]",
    wide: "max-w-[1100px]",
  };

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col transition-colors duration-200 selection:bg-foreground/15 relative",
        theme === "sepia"
          ? "reader-warm"
          : theme === "bone"
          ? "reader-bone"
          : theme === "sage"
          ? "reader-sage"
          : theme === "slate"
          ? "reader-slate"
          : theme === "light"
          ? "reader-light"
          : "reader-dark"
      )}
    >
      {/* Scroll Reading Progress Bar with Sleek Hairline */}
      <div className="reading-progress-track">
        <div
          className={cn(
            "reading-progress-bar",
            theme === "sepia"
              ? "bg-[#735c42]"
              : theme === "bone"
              ? "bg-[#574c3e]"
              : theme === "sage"
              ? "bg-[#355243]"
              : theme === "light"
              ? "bg-neutral-800"
              : "bg-primary"
          )}
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Floating Right Reading Toolkit & Collapsible Drawer (Removed from top header) */}
      <ReadingControls
        articleTitle={article.title}
        readingProgress={scrollProgress}
        fontSize={fontSize}
        numericFontSize={numericFontSize}
        onNumericFontSizeChange={setNumericFontSize}
        onFontSizeChange={setFontSize}
        columnWidth={columnWidth}
        onColumnWidthChange={setColumnWidth}
        lineHeight={lineHeight}
        onLineHeightChange={setLineHeight}
        fontFamily={fontFamily}
        onFontFamilyChange={setFontFamily}
        theme={theme}
        onThemeChange={handleThemeChange}
        isBookmarked={isBookmarked}
        onToggleBookmark={handleToggleBookmark}
        savedReadingSpot={savedReadingSpot}
        onSaveReadingSpot={handleSaveReadingSpot}
        onJumpToReadingSpot={handleJumpToReadingSpot}
        onClearReadingSpot={handleClearReadingSpot}
        onToggleLibraryDrawer={() => setIsLibraryOpen(!isLibraryOpen)}
        onShare={handleShare}
      />

      {/* Floating Reading Spot Resume Prompt */}
      {showResumeBanner && savedReadingSpot && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-sm w-full px-4 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="p-3 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl flex items-center justify-between gap-3 card-linear">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                <BookmarkCheck className="h-4 w-4" />
              </span>
              <div className="flex flex-col text-xs min-w-0">
                <span className="font-semibold text-foreground truncate">Resume reading?</span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Saved at {savedReadingSpot.scrollProgress}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleJumpToReadingSpot}
                className="px-2.5 py-1 rounded-lg bg-foreground text-background text-xs font-medium btn-press shadow-xs"
              >
                Resume
              </button>
              <button
                onClick={() => setShowResumeBanner(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground btn-press"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Reading Spot Toast Notice */}
      {markerNotice && (
        <div className="fixed top-16 right-6 z-50 p-2 px-3 rounded-xl border border-emerald-500/30 bg-card/95 backdrop-blur-md shadow-lg flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 animate-in fade-in slide-in-from-top-2 duration-150">
          <BookmarkCheck className="h-3.5 w-3.5" />
          <span className="font-medium font-mono">{markerNotice}</span>
        </div>
      )}

      {/* Reading List & Bookmarks Side Drawer */}
      {isLibraryOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-background/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-md h-full bg-card border-l border-border p-6 shadow-2xl flex flex-col gap-5 overflow-y-auto animate-in slide-in-from-right duration-200"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-amber-500 fill-amber-500" />
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Reading List & Bookmarks
                </h2>
              </div>
              <button
                onClick={() => setIsLibraryOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted btn-press"
                aria-label="Close reading list"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Continue reading where you left off or pick from your saved bookmarks.
            </p>

            <div className="flex flex-col gap-3">
              {availableArticles.map((item) => (
                <Link
                  key={item.id}
                  href={`/read/${item.id}`}
                  onClick={() => setIsLibraryOpen(false)}
                  className={cn(
                    "p-4 rounded-xl border border-border/70 bg-card/60 card-hover flex flex-col gap-2 transition-all",
                    item.id === article.id && "border-primary/50 bg-secondary/50 font-semibold"
                  )}
                >
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{item.feedTitle}</span>
                    <span>{item.readingTimeMinutes} min read</span>
                  </div>
                  <h3 className="text-sm font-medium text-foreground tracking-tight leading-snug">
                    {item.title}
                  </h3>
                  {item.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Distraction-Free Article Content */}
      <main
        className={cn(
          "flex-1 mx-auto w-full px-4 sm:px-8 md:px-12 py-8 sm:py-14 flex flex-col gap-8 transition-all duration-200",
          columnWidthClasses[columnWidth]
        )}
      >
        {/* Article Metadata Header */}
        <header className="flex flex-col gap-4 pb-8 border-b border-border/50">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span
              className={cn(
                "font-medium px-2.5 py-1 rounded-md text-[11px]",
                theme === "sepia"
                  ? "bg-[#f5e6c8] text-[#433422]"
                  : "bg-secondary text-foreground"
              )}
            >
              {article.feedTitle}
            </span>
            {article.feedCategory && (
              <>
                <span className="opacity-40">•</span>
                <span className="opacity-80">{article.feedCategory}</span>
              </>
            )}
            <span className="opacity-40">•</span>
            <span className="inline-flex items-center gap-1 opacity-80">
              <Clock className="h-3 w-3" />
              <span>{article.readingTimeMinutes} min read</span>
            </span>
          </div>

          <h1
            className="font-medium tracking-tight leading-[1.18] transition-all duration-150"
            style={{ fontSize: `${Math.round(numericFontSize * 2.1)}px` }}
          >
            {article.title}
          </h1>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs opacity-75 pt-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                By <strong className="opacity-100">{article.author}</strong> on{" "}
                {article.publishedDate}
              </span>
            </div>

            <a
              href={article.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline text-xs"
            >
              <span>Original Source</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </header>

        {/* Fallback Banner if only summary extracted */}
        {article.isSummaryFallback && (
          <div
            className={cn(
              "p-4 rounded-xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3",
              theme === "sepia"
                ? "bg-[#f5e6c8]/80 border-[#ebd8b5] text-[#433422]"
                : "bg-muted/60 border-border/70 text-muted-foreground"
            )}
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-foreground">
                  Showing Feed Summary
                </span>
                <span>
                  The RSS feed provided an excerpt. Use Readability to extract the full article and images.
                </span>
              </div>
            </div>

            {article.originalUrl && (
              <button
                type="button"
                onClick={() => handleExtractFullArticle(article.originalUrl)}
                disabled={isExtracting}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium text-xs btn-press inline-flex items-center gap-1.5 shrink-0"
              >
                {isExtracting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>{isExtracting ? "Extracting..." : "Extract Full Article"}</span>
              </button>
            )}
          </div>
        )}

        {/* Sanitized Article Body */}
        <article
          className={cn(
            "reader-prose flex flex-col transition-all duration-150",
            fontFamilyStyles[fontFamily] || "font-serif",
            fontSizeClasses[fontSize]
          )}
          style={{
            fontSize: `${numericFontSize}px`,
            lineHeight: lineHeight,
          }}
        >
          {sanitizedContent ? (
            <div
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
              className="space-y-6"
            />
          ) : (
            <p className="text-lg leading-relaxed">
              {article.summary || "No readable content available for this feed entry."}
            </p>
          )}
        </article>

        {/* Reader Footer Controls */}
        <footer className="mt-20 pt-8 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs opacity-80">
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkRead}
              className={cn(
                "px-4 py-2.5 rounded-xl border btn-press inline-flex items-center gap-2 transition-colors",
                isRead
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium glow-emerald"
                  : "border-border/70 hover:bg-muted/40"
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isRead ? "Marked Finished" : "Mark as Finished"}</span>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 hover:underline font-medium"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Return to Timeline</span>
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
