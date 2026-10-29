"use client";

import { useState } from "react";
import { Sparkles, TrendingUp, Share2, Plus, ExternalLink, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

interface Recommendation {
  id: string;
  title: string;
  url: string;
  category: string;
  reason: string;
  score: number;
}

interface PopularFeed {
  id: string;
  title: string;
  url: string;
  subscribers: number;
  trendingRank: number;
  tags: string[];
}

const MOCK_RECOMMENDATIONS: Recommendation[] = [
  {
    id: "rec-1",
    title: "Changelog Weekly",
    url: "https://changelog.com/weekly/feed",
    category: "Software Engineering",
    reason: "Frequently co-subscribed by readers following Rust and Linux kernel topics",
    score: 94,
  },
  {
    id: "rec-2",
    title: "TypeScript Weekly",
    url: "https://typescript-weekly.com/rss",
    category: "Languages & Frameworks",
    reason: "High similarity score with your recent Frontend and Vercel article reads",
    score: 88,
  },
  {
    id: "rec-3",
    title: "Latent Space AI",
    url: "https://www.latent.space/feed",
    category: "Artificial Intelligence",
    reason: "Top trending publication in developer tools and agentic coding",
    score: 82,
  },
];

const MOCK_POPULAR: PopularFeed[] = [
  {
    id: "pop-1",
    title: "Hacker News Frontpage",
    url: "https://news.ycombinator.com/rss",
    subscribers: 28400,
    trendingRank: 1,
    tags: ["tech", "startups", "code"],
  },
  {
    id: "pop-2",
    title: "BBC News Tech",
    url: "http://feeds.bbci.co.uk/news/technology/rss.xml",
    subscribers: 19800,
    trendingRank: 2,
    tags: ["world", "general", "cyber"],
  },
  {
    id: "pop-3",
    title: "Smashing Magazine",
    url: "https://www.smashingmagazine.com/feed/",
    subscribers: 12500,
    trendingRank: 3,
    tags: ["css", "ux", "accessibility"],
  },
];

export default function DiscoverPage() {
  const [activeTab, setActiveTab] = useState<"recommendations" | "popular" | "graph">("recommendations");

  return (
    <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Discover</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Explore curated feeds, community favorites, and topic correlation graphs.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-lg border border-border/60">
          <button
            onClick={() => setActiveTab("recommendations")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md btn-press flex items-center gap-1.5 transition-colors",
              activeTab === "recommendations"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Recommended</span>
          </button>
          <button
            onClick={() => setActiveTab("popular")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md btn-press flex items-center gap-1.5 transition-colors",
              activeTab === "popular"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span>Popular</span>
          </button>
          <button
            onClick={() => setActiveTab("graph")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md btn-press flex items-center gap-1.5 transition-colors",
              activeTab === "graph"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Share2 className="h-3.5 w-3.5 text-purple-500" />
            <span>Feed Graph</span>
          </button>
        </div>
      </header>

      {/* Recommendations View */}
      {activeTab === "recommendations" && (
        <div className="flex flex-col gap-4">
          <div className="text-xs text-muted-foreground">
            Personalized based on reading frequency and tag clustering.
          </div>
          <div className="grid grid-cols-1 gap-3.5">
            {MOCK_RECOMMENDATIONS.map((rec) => (
              <div
                key={rec.id}
                className="p-5 rounded-xl border border-border bg-card card-hover flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex flex-col gap-1.5 max-w-2xl">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-foreground px-2 py-0.5 rounded bg-secondary">
                      {rec.category}
                    </span>
                    <span className="text-emerald-500 font-medium">{rec.score}% Match</span>
                  </div>
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    {rec.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    💡 <span className="font-medium text-foreground/90">Reason:</span> {rec.reason}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={rec.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent btn-press"
                    title="View Source"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 btn-press inline-flex items-center gap-1.5 shadow-xs">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Follow</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Popular Feeds View */}
      {activeTab === "popular" && (
        <div className="flex flex-col gap-4">
          <div className="text-xs text-muted-foreground">
            Top global feeds ranked by subscriber momentum in the last 7 days.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MOCK_POPULAR.map((pop) => (
              <div
                key={pop.id}
                className="p-5 rounded-xl border border-border bg-card card-hover flex flex-col justify-between gap-4 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span className="h-7 w-7 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-xs flex items-center justify-center">
                    #{pop.trendingRank}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {pop.subscribers.toLocaleString()} subscribers
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold text-base tracking-tight text-foreground">
                    {pop.title}
                  </h3>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {pop.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>

                <button className="w-full mt-2 py-1.5 rounded-lg border border-border hover:bg-accent text-xs font-medium text-foreground btn-press inline-flex items-center justify-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Subscribe</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discovery Graph Container */}
      {activeTab === "graph" && (
        <div className="flex flex-col gap-3">
          <div className="text-xs text-muted-foreground">
            Co-occurrence network mapping shared topics and subscriber intersections.
          </div>

          <div className="w-full h-96 rounded-xl border border-border bg-card/80 backdrop-blur flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
            {/* Visual Graph Mock / Canvas Container */}
            <div className="absolute inset-0 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />

            <div className="relative z-10 flex flex-col items-center gap-3 max-w-sm">
              <div className="p-3.5 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-lg shadow-primary/10">
                <Share2 className="h-8 w-8 animate-pulse" />
              </div>
              <h3 className="font-semibold text-base text-foreground">
                Interactive Graph Visualizer
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connects with <code className="px-1 py-0.5 rounded bg-muted text-foreground">GET /api/discovery/graph</code> to render nodes (feeds, authors, tags) and edge weights using D3 / Canvas.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground font-medium">
                  3 Nodes
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground font-medium">
                  3 Edges
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
