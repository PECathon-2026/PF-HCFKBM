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
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Share2,
  FileText,
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

interface ParsedSummary {
  overview: string;
  findings: string[];
  implications: string;
}

function parseGeminiSummary(text: string): ParsedSummary {
  const result: ParsedSummary = {
    overview: "",
    findings: [],
    implications: "",
  };

  if (!text) return result;

  // Match Executive Overview / Executive Summary / TL;DR
  const overviewMatch = text.match(
    /###\s*(?:⚡\s*)?(?:Executive\s+)?(?:Overview|Summary|TL;?DR)\s*\n+([\s\S]*?)(?=###|$)/i
  );
  // Match Key Findings & Analysis / Key Takeaways
  const findingsMatch = text.match(
    /###\s*(?:📌\s*)?(?:Key\s+)?(?:Findings|Analysis|Takeaways)[\s\S]*?\n+([\s\S]*?)(?=###|$)/i
  );
  // Match Strategic Implications & Conclusion / Core Takeaway
  const implicationsMatch = text.match(
    /###\s*(?:💡\s*)?(?:Strategic\s+)?(?:Implications|Conclusion|Core\s+Takeaway)[\s\S]*?\n+([\s\S]*?)(?=###|$)/i
  );

  if (overviewMatch) {
    result.overview = overviewMatch[1].trim();
  }
  if (findingsMatch) {
    const rawFindings = findingsMatch[1].trim();
    const lines = rawFindings
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l))
      .map((l) => l.replace(/^[-*•]\s*|^\d+\.\s*/, "").trim());
    result.findings = lines.length > 0 ? lines : [rawFindings];
  }
  if (implicationsMatch) {
    result.implications = implicationsMatch[1].trim();
  }

  // Graceful fallback if unstructured
  if (!result.overview && !result.implications && result.findings.length === 0) {
    result.overview = text.trim();
  }

  return result;
}

function renderFormattedTakeaway(text: string) {
  const match = text.match(/^\*\*([^*]+)\*\*[:\s-]*(.*)$/);
  if (match) {
    return (
      <span className="leading-relaxed">
        <strong className="font-semibold text-foreground tracking-tight">{match[1]}: </strong>
        <span className="text-foreground/85 leading-relaxed">{match[2]}</span>
      </span>
    );
  }
  return <span className="text-foreground/85 leading-relaxed">{text}</span>;
}

const EMPTY_ARTICLE: ArticleDetail = {
  id: "",
  feedTitle: "Feed Source",
  title: "Loading Story...",
  summary: "",
  content: "",
  publishedDate: "",
  readingTimeMinutes: 1,
  originalUrl: "",
  isSummaryFallback: false,
};

export default function ReaderPage({ params }: ReaderProps) {
  const [article, setArticle] = useState<ArticleDetail>(EMPTY_ARTICLE);
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
  const [availableArticles, setAvailableArticles] = useState<ArticleDetail[]>([]);
  const [savedReadingSpot, setSavedReadingSpot] = useState<ReadingSpotData | null>(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [markerNotice, setMarkerNotice] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Gemini AI Executive Briefing State
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [copiedSummary, setCopiedSummary] = useState(false);

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

        // Load cached Gemini executive summary
        const cachedSummary = localStorage.getItem(`onlydevs_summary_${params.id}`);
        if (cachedSummary) {
          setSummary(cachedSummary);
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
      .then(async (record) => {
        if (mounted && record) {
          const parentSub = await db.subscriptions.get(record.subscriptionId).catch(() => undefined);
          const friendlyFeedTitle = parentSub?.title || record.subscriptionId || "Feed Source";

          const hasRealContent =
            record.content &&
            record.content.length > 250 &&
            record.content !== record.summary;

          const chosenContent = hasRealContent
            ? record.content
            : record.content || record.summary;

          const isFallback =
            !chosenContent ||
            (chosenContent === record.summary && chosenContent.length < 250);

          setArticle({
            id: record.id,
            feedTitle: friendlyFeedTitle,
            feedCategory: parentSub?.category,
            title: record.title,
            summary: record.summary,
            content: chosenContent,
            author: record.author || friendlyFeedTitle || "Staff",
            publishedDate: new Date(record.publishedAt).toLocaleDateString(),
            readingTimeMinutes: record.readingTimeMinutes || 4,
            originalUrl: record.url || "",
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
        }
      })
      .catch(() => {});

    // Load available articles for Library / Bookmarks drawer
    Promise.all([
      getArticles().catch(() => []),
      db.subscriptions.toArray().catch(() => []),
    ])
      .then(([stored, subs]) => {
        if (mounted && stored && stored.length > 0) {
          const subMap = new Map(subs.map((s) => [s.id, s]));
          const mapped: ArticleDetail[] = stored.map((r) => {
            const parent = subMap.get(r.subscriptionId);
            return {
              id: r.id,
              feedTitle: parent?.title || r.subscriptionId || "Feed Source",
              feedCategory: parent?.category,
              title: r.title,
              summary: r.summary,
              content: r.content,
              author: r.author,
              publishedDate: new Date(r.publishedAt).toLocaleDateString(),
              readingTimeMinutes: r.readingTimeMinutes || 4,
              originalUrl: r.url,
              isSummaryFallback: !r.content,
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

  // Trigger Gemini AI Summarizer
  const handleTriggerSummary = async (forceRefresh = false) => {
    // If summary is already cached and not forcing refresh, just expand and scroll
    if (summary && !forceRefresh) {
      setIsSummaryExpanded(true);
      const el = document.getElementById("ai-summary-card");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    const textContent = article.content || article.summary;
    if (!textContent || textContent.trim().length < 40) {
      setMarkerNotice("No article content available yet to summarize");
      setTimeout(() => setMarkerNotice(null), 3000);
      return;
    }

    setIsSummarizing(true);
    setSummaryError(null);
    setIsSummaryExpanded(true);
    setMarkerNotice("Synthesizing executive briefing with Gemini...");

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: textContent,
          title: article.title,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSummaryError(data.error || data.details || "Failed to generate executive briefing.");
        return;
      }

      if (data.summary) {
        setSummary(data.summary);
        try {
          localStorage.setItem(`onlydevs_summary_${params.id}`, data.summary);
        } catch (_) {}
        setMarkerNotice("Executive briefing ready");
        setTimeout(() => setMarkerNotice(null), 3000);

        // Smooth scroll to summary card
        setTimeout(() => {
          const el = document.getElementById("ai-summary-card");
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }, 100);
      } else {
        setSummaryError("Received empty summary from Gemini.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSummaryError(`Network error while contacting Gemini: ${msg}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCopySummary = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
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

  // Parse Gemini AI Summary into structured sections
  const parsedSummary = useMemo(() => {
    if (!summary) return null;
    return parseGeminiSummary(summary);
  }, [summary]);

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
        onTriggerSummary={() => handleTriggerSummary(false)}
        isSummarizing={isSummarizing}
        hasSummary={!!summary}
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

          {/* Reader Top Action Bar: Apple Glassy Button & Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleTriggerSummary(false)}
                disabled={isSummarizing}
                className={cn(
                  "apple-glass-btn px-4 py-2 rounded-full text-xs font-medium inline-flex items-center gap-2 cursor-pointer transition-all",
                  summary
                    ? "font-semibold border-primary/30"
                    : "opacity-95 hover:opacity-100"
                )}
                title="Generate comprehensive executive briefing"
              >
                {isSummarizing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <FileText className="h-3.5 w-3.5 opacity-80" />
                )}
                <span className="tracking-tight">
                  {isSummarizing
                    ? "Synthesizing Briefing..."
                    : summary
                    ? "Executive Briefing"
                    : "Executive Briefing"}
                </span>
                {summary && !isSummarizing && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-xs" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={handleToggleBookmark}
                className={cn(
                  "p-2 rounded-full border text-xs btn-press inline-flex items-center gap-1 transition-colors",
                  isBookmarked
                    ? "badge-amber font-semibold"
                    : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
                title={isBookmarked ? "Starred" : "Star article"}
              >
                <Bookmark className={cn("h-3.5 w-3.5", isBookmarked && "fill-current")} />
              </button>

              <button
                onClick={handleShare}
                className="p-2 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 text-xs btn-press"
                title="Share article link"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* Gemini AI Executive Briefing Card / States */}
        {isSummarizing && (
          <div
            id="ai-summary-card"
            className={cn(
              "p-6 rounded-2xl border text-xs flex flex-col gap-4 animate-in fade-in duration-200 card-linear backdrop-blur-2xl shadow-2xl",
              theme === "sepia"
                ? "bg-[#fbf0d9]/85 border-[#e7d5b5] text-[#433422] shadow-[0_12px_40px_rgba(67,52,34,0.08)]"
                : "bg-card/85 border-border/80 text-foreground shadow-[0_12px_40px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.08)]"
            )}
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-1 rounded-md border border-border/60 bg-background/80 text-foreground">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-mono font-bold tracking-wider uppercase text-foreground">
                  Synthesizing Executive Briefing
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-border/60 bg-muted/40 text-muted-foreground font-medium">
                  Gemini 2.5 Flash
                </span>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span>Reading full text...</span>
              </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Synthesizing foundational thesis, technical methodology, trade-offs, and strategic conclusions...
            </p>

            <div className="space-y-2.5 pt-1">
              <div className="h-3 bg-muted/60 rounded-full w-full animate-pulse" />
              <div className="h-3 bg-muted/60 rounded-full w-5/6 animate-pulse" />
              <div className="h-3 bg-muted/60 rounded-full w-3/4 animate-pulse" />
            </div>
          </div>
        )}

        {summaryError && !isSummarizing && (
          <div className="p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-xs text-destructive flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">Executive Briefing Error</span>
                <span className="leading-relaxed opacity-90">{summaryError}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleTriggerSummary(true)}
                className="px-3 py-1.5 rounded-lg bg-foreground text-background font-medium text-xs btn-press inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Retry Synthesis</span>
              </button>
            </div>
          </div>
        )}

        {summary && !isSummarizing && (
          <section
            id="ai-summary-card"
            className={cn(
              "rounded-2xl border text-xs flex flex-col overflow-hidden transition-all duration-200 shadow-2xl backdrop-blur-2xl card-linear",
              theme === "sepia"
                ? "bg-[#fbf0d9]/85 border-[#e7d5b5] text-[#433422] shadow-[0_16px_48px_rgba(67,52,34,0.08)]"
                : theme === "bone"
                ? "bg-[#f7f4ed]/85 border-[#e6e0d3] text-[#292524] shadow-[0_16px_48px_rgba(41,37,36,0.06)]"
                : theme === "sage"
                ? "bg-[#edf2ec]/85 border-[#d8e2d6] text-[#1c2e24] shadow-[0_16px_48px_rgba(28,46,36,0.06)]"
                : theme === "light"
                ? "bg-white/85 border-neutral-200/90 text-neutral-900 shadow-[0_16px_48px_rgba(0,0,0,0.06)]"
                : "bg-card/85 border-border/80 text-foreground shadow-[0_16px_48px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.08)]"
            )}
            aria-label="Executive Briefing"
          >
            {/* Professional Executive Briefing Header */}
            <div className="p-4 sm:px-6 flex items-center justify-between gap-3 border-b border-border/60 bg-card/60 backdrop-blur-md">
              <div className="flex items-center gap-3 min-w-0">
                <span className="p-1.5 rounded-lg border border-border/70 bg-card/80 text-foreground shrink-0 shadow-2xs">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                  <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-foreground">
                    Executive Briefing
                  </h2>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-border/60 bg-muted/40 text-muted-foreground font-medium shrink-0">
                    Gemini 2.5 Flash
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="px-2.5 py-1 rounded-lg border border-border/70 bg-card/70 hover:bg-card text-foreground text-xs font-medium btn-press inline-flex items-center gap-1.5 shadow-2xs cursor-pointer backdrop-blur-sm"
                  title="Copy full briefing to clipboard"
                >
                  {copiedSummary ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleTriggerSummary(true)}
                  disabled={isSummarizing}
                  className="p-1.5 rounded-lg border border-border/70 bg-card/70 hover:bg-card text-muted-foreground hover:text-foreground btn-press cursor-pointer backdrop-blur-sm"
                  title="Regenerate executive briefing"
                  aria-label="Regenerate executive briefing"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isSummarizing && "animate-spin")} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                  className="p-1.5 rounded-lg border border-border/70 bg-card/70 hover:bg-card text-muted-foreground hover:text-foreground btn-press cursor-pointer backdrop-blur-sm"
                  title={isSummaryExpanded ? "Collapse briefing" : "Expand briefing"}
                  aria-label={isSummaryExpanded ? "Collapse briefing" : "Expand briefing"}
                >
                  {isSummaryExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Executive Briefing Content */}
            {isSummaryExpanded && parsedSummary && (
              <div className="p-6 sm:p-8 flex flex-col gap-6 leading-relaxed animate-in fade-in duration-150 bg-card/30 backdrop-blur-md">
                {/* 1. Executive Overview */}
                {parsedSummary.overview && (
                  <div className="flex flex-col gap-2.5 p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-2xs card-linear">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-border/40">
                      <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-muted-foreground">
                        Overview
                      </span>
                    </div>
                    <div className="text-sm sm:text-[15px] leading-relaxed text-foreground/90 whitespace-pre-line font-serif sm:leading-relaxed">
                      {parsedSummary.overview}
                    </div>
                  </div>
                )}

                {/* 2. Key Findings & Technical Analysis */}
                {parsedSummary.findings.length > 0 && (
                  <div className="flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-2xs card-linear">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-border/40">
                      <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-muted-foreground">
                        Key Analysis & Findings
                      </span>
                    </div>
                    <ul className="flex flex-col gap-3.5 pl-0.5">
                      {parsedSummary.findings.map((point, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-3 text-sm text-foreground/90 leading-relaxed"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-foreground/60 mt-2 shrink-0" />
                          <div className="flex-1">{renderFormattedTakeaway(point)}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 3. Strategic Implications & Conclusion */}
                {parsedSummary.implications && (
                  <div className="flex flex-col gap-2.5 p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm shadow-2xs card-linear">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-border/40">
                      <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-muted-foreground">
                        Strategic Implications & Conclusion
                      </span>
                    </div>
                    <div className="text-sm sm:text-[15px] leading-relaxed text-foreground/90 whitespace-pre-line font-serif sm:leading-relaxed">
                      {parsedSummary.implications}
                    </div>
                  </div>
                )}

                {/* Professional Footer */}
                <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground font-mono">
                  <span>Independent Research Synthesis</span>
                  <span>Synthesized via Gemini 2.5 Flash • Stored in Local Cache</span>
                </div>
              </div>
            )}
          </section>
        )}

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
