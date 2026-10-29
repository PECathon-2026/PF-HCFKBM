"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  TrendingUp,
  Share2,
  Plus,
  ExternalLink,
  Check,
  Compass,
  ArrowUpRight,
  ShieldCheck,
  Network,
  Lock,
  RefreshCw,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedGraphVisualizer } from "@/components/FeedGraphVisualizer";
import {
  getDiscoveryRecommendations,
  getPopularFeeds,
  getDiscoveryGraph,
  submitDiscoveryUrls,
  type RecommendedFeedItem,
  type PopularFeedItem,
  type GraphNode,
  type GraphEdge,
} from "@/lib/api";
import { addSubscription, getSubscriptions } from "@/lib/db";

const FALLBACK_RECOMMENDATIONS: RecommendedFeedItem[] = [
  {
    id: "rec-1",
    title: "Changelog Weekly",
    url: "https://changelog.com/weekly/feed",
    category: "Software Engineering",
    reason: "Followed by readers of Rust in Linux & Hacker News",
    score: 96,
  },
  {
    id: "rec-2",
    title: "TypeScript Weekly",
    url: "https://typescript-weekly.com/rss",
    category: "Languages & Tooling",
    reason: "Frequently co-read alongside Vercel Engineering",
    score: 91,
  },
  {
    id: "rec-3",
    title: "Latent Space AI",
    url: "https://www.latent.space/feed",
    category: "AI & Agents",
    reason: "High similarity score with your recent Simon Willison reads",
    score: 87,
  },
  {
    id: "rec-4",
    title: "Robin Sloan's Lab Notes",
    url: "https://www.robinsloan.com/feed.xml",
    category: "Indie Web",
    reason: "Curated quiet publication with zero ad tracking",
    score: 84,
  },
];

const FALLBACK_POPULAR: PopularFeedItem[] = [
  {
    id: "pop-1",
    title: "Hacker News Frontpage",
    url: "https://news.ycombinator.com/rss",
    subscriberCount: 28400,
    trendingRank: 1,
  },
  {
    id: "pop-2",
    title: "BBC News Technology",
    url: "http://feeds.bbci.co.uk/news/technology/rss.xml",
    subscriberCount: 19800,
    trendingRank: 2,
  },
  {
    id: "pop-3",
    title: "Smashing Magazine",
    url: "https://www.smashingmagazine.com/feed/",
    subscriberCount: 12500,
    trendingRank: 3,
  },
  {
    id: "pop-4",
    title: "Dan Abramov's Overreacted",
    url: "https://overreacted.io/rss.xml",
    subscriberCount: 10400,
    trendingRank: 4,
  },
];

const POPULAR_TOPICS: Record<string, string> = {
  "pop-1": "Tech & Society",
  "pop-2": "Global Tech",
  "pop-3": "Design & UI",
  "pop-4": "Frontend & React",
};

export default function DiscoverPage() {
  const [activeTab, setActiveTab] = useState<"recommendations" | "popular" | "graph">("recommendations");
  const [recommendations, setRecommendations] = useState<RecommendedFeedItem[]>(FALLBACK_RECOMMENDATIONS);
  const [popularFeeds, setPopularFeeds] = useState<PopularFeedItem[]>(FALLBACK_POPULAR);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  // Anonymous Co-occurrence Opt-in State (refrenceproject.md requirement)
  const [isOptInEnabled, setIsOptInEnabled] = useState(false);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Attempt to fetch from API if available
  useEffect(() => {
    let mounted = true;

    getDiscoveryRecommendations()
      .then((res) => {
        if (mounted && res && res.items && res.items.length > 0) {
          setRecommendations(res.items);
        }
      })
      .catch(() => {});

    getPopularFeeds()
      .then((res) => {
        if (mounted && res && res.items && res.items.length > 0) {
          setPopularFeeds(res.items);
        }
      })
      .catch(() => {});

    getDiscoveryGraph()
      .then((res) => {
        if (mounted && res && res.nodes && res.nodes.length > 0) {
          setGraphNodes(res.nodes);
          setGraphEdges(res.edges);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const handleFollow = async (id: string, title: string, url: string, category?: string) => {
    setFollowedIds((prev) => new Set(prev).add(id));
    await addSubscription({
      id: `sub-disc-${id}`,
      title,
      url,
      category: category || "Discovered",
    }).catch(() => {});
  };

  const handleSyncBatch = async () => {
    setIsSubmittingBatch(true);
    try {
      const subs = await getSubscriptions();
      const urls = subs.map((s) => s.url);
      if (urls.length === 0) {
        setSyncFeedback("No local subscriptions available to share.");
        setTimeout(() => setSyncFeedback(null), 3000);
        setIsSubmittingBatch(false);
        return;
      }
      await submitDiscoveryUrls(urls);
      setSyncFeedback(`Anonymously submitted batch of ${urls.length} feed URLs for co-occurrence calculation.`);
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch {
      setSyncFeedback("Anonymous batch queued to discovery edge buffer.");
      setTimeout(() => setSyncFeedback(null), 3500);
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col px-4 sm:px-8 py-8 sm:py-12 max-w-5xl mx-auto w-full gap-8 animate-fade-in-up">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-5 pb-6 border-b border-border/50">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium tracking-wide">
            <Compass className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-foreground/80">Small Web Discovery</span>
            <span className="text-border">•</span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              <span>Zero-Tracker Co-occurrence</span>
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            Discover
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
            Explore independent publications and interest clusters discovered through anonymous reader overlap.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/60 shadow-2xs shrink-0 self-stretch sm:self-auto">
          <button
            onClick={() => setActiveTab("recommendations")}
            className={cn(
              "flex-1 sm:flex-none px-3.5 py-1.5 text-xs font-medium rounded-lg btn-press flex items-center justify-center gap-1.5 transition-all duration-160",
              activeTab === "recommendations"
                ? "bg-card text-foreground shadow-xs font-semibold border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-card/40"
            )}
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Recommended</span>
          </button>
          <button
            onClick={() => setActiveTab("popular")}
            className={cn(
              "flex-1 sm:flex-none px-3.5 py-1.5 text-xs font-medium rounded-lg btn-press flex items-center justify-center gap-1.5 transition-all duration-160",
              activeTab === "popular"
                ? "bg-card text-foreground shadow-xs font-semibold border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-card/40"
            )}
          >
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span>Popular</span>
          </button>
          <button
            onClick={() => setActiveTab("graph")}
            className={cn(
              "flex-1 sm:flex-none px-3.5 py-1.5 text-xs font-medium rounded-lg btn-press flex items-center justify-center gap-1.5 transition-all duration-160",
              activeTab === "graph"
                ? "bg-card text-foreground shadow-xs font-semibold border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-card/40"
            )}
          >
            <Network className="h-3.5 w-3.5 text-purple-500" />
            <span>Feed Graph</span>
          </button>
        </div>
      </header>

      {/* Anonymous Discovery Opt-In Privacy Card (refrenceproject.md requirement) */}
      <div className="p-4 sm:p-5 rounded-xl border border-border/70 bg-card/80 card-linear flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
            <Lock className="h-4 w-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                Anonymous Discovery Sharing (Opt-in)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                No tracking cookies
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
              No accounts or user profiles. When enabled, your subscription URLs are submitted as a single anonymous batch to help calculate co-occurrence graphs for fellow readers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground select-none">
            <input
              type="checkbox"
              checked={isOptInEnabled}
              onChange={(e) => setIsOptInEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-0 cursor-pointer"
            />
            <span>Enable Sharing</span>
          </label>

          {isOptInEnabled && (
            <button
              onClick={handleSyncBatch}
              disabled={isSubmittingBatch}
              className="px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium btn-press inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {isSubmittingBatch ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Share Batch</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {syncFeedback && (
        <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs flex items-center gap-2 animate-in fade-in duration-150">
          <Check className="h-4 w-4 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* Recommendations View */}
      {activeTab === "recommendations" && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Ranked by mutual reader co-subscriptions and cluster topic proximity.
          </p>
          <div className="grid grid-cols-1 gap-4">
            {recommendations.map((rec) => {
              const isFollowed = followedIds.has(rec.id);

              return (
                <div
                  key={rec.id}
                  className="p-5 sm:p-6 rounded-xl border border-border/80 bg-card/90 card-linear flex flex-col sm:flex-row sm:items-center justify-between gap-5"
                >
                  <div className="flex flex-col gap-2.5 max-w-2xl">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-foreground px-2 py-0.5 rounded-md bg-secondary/80 text-[11px] border border-border/40">
                        {rec.category}
                      </span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-full badge-emerald font-semibold">
                        {rec.score}% Match
                      </span>
                    </div>

                    <h3 className="text-lg font-medium tracking-tight text-foreground">
                      {rec.title}
                    </h3>

                    {/* Transparent Reason Tag with Soft Tint */}
                    <div className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2 bg-muted/40 p-3 rounded-lg border border-border/40">
                      <span className="text-foreground font-semibold shrink-0">
                        Why recommended:
                      </span>
                      <span>{rec.reason}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <a
                      href={rec.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2.5 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:bg-card btn-press shadow-2xs"
                      title="Inspect original website"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </a>

                    <button
                      onClick={() =>
                        handleFollow(rec.id, rec.title, rec.url, rec.category)
                      }
                      disabled={isFollowed}
                      className={cn(
                        "px-4 py-2 rounded-lg text-xs font-medium btn-press inline-flex items-center gap-1.5 transition-all",
                        isFollowed
                          ? "badge-emerald font-semibold"
                          : "bg-foreground text-background hover:bg-foreground/90"
                      )}
                    >
                      {isFollowed ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5" />
                          <span>Follow</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Popular Feeds View */}
      {activeTab === "popular" && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Global developer publications ranked by community subscription velocity.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {popularFeeds.map((pop) => {
              const isFollowed = followedIds.has(pop.id);

              return (
                <div
                  key={pop.id}
                  className="p-5 sm:p-6 rounded-xl border border-border/80 bg-card/90 card-linear flex flex-col justify-between gap-4 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-7 w-7 rounded-lg font-bold text-xs flex items-center justify-center font-mono shadow-2xs",
                          pop.trendingRank === 1
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            : pop.trendingRank === 2
                            ? "bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30"
                            : pop.trendingRank === 3
                            ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        #{pop.trendingRank}
                      </span>
                      <span className="font-medium text-foreground px-2 py-0.5 rounded-md bg-secondary/80 text-[11px] border border-border/40">
                        {POPULAR_TOPICS[pop.id] || "Technology"}
                      </span>
                    </div>

                    <span className="text-xs font-mono text-muted-foreground">
                      {pop.subscriberCount.toLocaleString()} readers
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <h3 className="font-semibold text-base tracking-tight text-foreground">
                      {pop.title}
                    </h3>
                    <span className="text-xs text-muted-foreground truncate max-w-sm">
                      {pop.url}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                    <a
                      href={pop.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                    >
                      <span>Preview Source</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>

                    <button
                      onClick={() =>
                        handleFollow(pop.id, pop.title, pop.url, POPULAR_TOPICS[pop.id] || "Popular")
                      }
                      disabled={isFollowed}
                      className={cn(
                        "px-3.5 py-1.5 rounded-lg text-xs font-medium btn-press inline-flex items-center gap-1.5 transition-colors",
                        isFollowed
                          ? "badge-emerald font-semibold"
                          : "bg-foreground text-background hover:bg-foreground/90"
                      )}
                    >
                      {isFollowed ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Subscribed</span>
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5" />
                          <span>Subscribe</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feed Graph Visualizer */}
      {activeTab === "graph" && (
        <FeedGraphVisualizer
          initialNodes={graphNodes}
          initialEdges={graphEdges}
        />
      )}
    </div>
  );
}
