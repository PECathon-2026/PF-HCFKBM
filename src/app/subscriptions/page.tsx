"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Rss,
  Globe,
  Trash2,
  RefreshCw,
  Upload,
  Download,
  AlertCircle,
  FolderPlus,
  CheckCircle2,
  Clock,
  Radio,
  Layers,
  Sparkles,
  LayoutGrid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal";
import {
  getSubscriptions,
  addSubscription,
  type Subscription,
  type SubscriptionStatus,
} from "@/lib/db";
import { refreshFeed } from "@/lib/sync";
import { autodiscover } from "@/lib/autodiscover";

interface SubscriptionWithMeta extends Omit<Subscription, "status"> {
  articlesCount: number;
  lastSyncedText: string;
  status: SubscriptionStatus | "syncing";
}

const INITIAL_SUBSCRIPTIONS: SubscriptionWithMeta[] = [
  {
    id: "sub-1",
    title: "Changelog Weekly",
    url: "https://changelog.com/weekly/feed",
    siteUrl: "https://changelog.com",
    category: "Software Engineering",
    articlesCount: 42,
    lastSyncedText: "10 mins ago",
    status: "active",
    errorCount: 0,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
  },
  {
    id: "sub-2",
    title: "Hacker News Top Stories",
    url: "https://news.ycombinator.com/rss",
    siteUrl: "https://news.ycombinator.com",
    category: "Tech & Startups",
    articlesCount: 156,
    lastSyncedText: "2 mins ago",
    status: "active",
    errorCount: 0,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10,
  },
  {
    id: "sub-3",
    title: "Vercel Blog",
    url: "https://vercel.com/atom",
    siteUrl: "https://vercel.com",
    category: "Frontend",
    articlesCount: 18,
    lastSyncedText: "1 hour ago",
    status: "active",
    errorCount: 0,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 14,
  },
  {
    id: "sub-4",
    title: "Simon Willison's Weblog",
    url: "https://simonwillison.net/atom/everything/",
    siteUrl: "https://simonwillison.net",
    category: "AI / Python",
    articlesCount: 89,
    lastSyncedText: "4 hours ago",
    status: "stale",
    errorCount: 0,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 20,
  },
];

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] =
    useState<SubscriptionWithMeta[]>(INITIAL_SUBSCRIPTIONS);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedCategory, setFeedCategory] = useState("Technology");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Sync with IndexedDB
  useEffect(() => {
    let mounted = true;
    getSubscriptions()
      .then((records) => {
        if (mounted && records && records.length > 0) {
          const mapped: SubscriptionWithMeta[] = records.map((r) => ({
            ...r,
            articlesCount: 12,
            lastSyncedText: "Just now",
            status: "active",
          }));
          setSubscriptions(mapped);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const totalArticles = subscriptions.reduce((sum, s) => sum + s.articlesCount, 0);

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    let trimmed = feedUrl.trim();
    if (!trimmed) {
      setFormError("Please enter a feed URL or site address");
      return;
    }

    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }

    try {
      new URL(trimmed);
    } catch {
      setFormError("Please enter a valid URL starting with http:// or https://");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. If not clearly an XML feed URL, attempt autodiscovery
      let finalFeedUrl = trimmed;
      let discoveredTitle: string | undefined;

      const isDirectFeed =
        /\.(xml|rss|atom)$/i.test(trimmed) ||
        /\/(feed|rss|atom)(\.xml|\/)?$/i.test(trimmed);

      if (!isDirectFeed) {
        try {
          const discovery = await autodiscover(trimmed);
          if (discovery.feeds && discovery.feeds.length > 0) {
            finalFeedUrl = discovery.feeds[0].url;
            discoveredTitle = discovery.feeds[0].title;
          }
        } catch {
          // Fall back to direct URL if discovery fails
        }
      }

      const hostname = new URL(finalFeedUrl).hostname.replace(/^www\./, "");
      const newSub: Omit<Subscription, "createdAt"> = {
        id: `sub-${Date.now()}`,
        url: finalFeedUrl,
        siteUrl: `https://${hostname}`,
        title: discoveredTitle || hostname.charAt(0).toUpperCase() + hostname.slice(1),
        category: feedCategory,
        status: "active",
        errorCount: 0,
      };

      await addSubscription(newSub).catch(() => {});

      const item: SubscriptionWithMeta = {
        ...newSub,
        articlesCount: 0,
        lastSyncedText: "Syncing...",
        status: "syncing",
        createdAt: Date.now(),
      };

      setSubscriptions((prev) => [item, ...prev]);
      setFeedUrl("");
      setIsAddModalOpen(false);
      setNotice(`Subscribed to ${item.title}`);
      setTimeout(() => setNotice(null), 3500);

      // 2. Trigger real background proxy fetch and client parsing
      refreshFeed({ ...newSub, createdAt: Date.now() }, { force: true })
        .then((res) => {
          setSubscriptions((prev) =>
            prev.map((s) =>
              s.id === newSub.id
                ? {
                    ...s,
                    lastSyncedText: "Just now",
                    articlesCount: res.newArticlesCount ?? s.articlesCount,
                    status: res.success ? "active" : "error",
                  }
                : s
            )
          );
        })
        .catch(() => {});
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to add subscription"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResync = async (id: string) => {
    const sub = subscriptions.find((s) => s.id === id);
    if (!sub) return;

    setSyncingId(id);
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "syncing" as const } : s))
    );

    try {
      const res = await refreshFeed(
        {
          id: sub.id,
          url: sub.url,
          title: sub.title,
          siteUrl: sub.siteUrl,
          category: sub.category,
          status: "active",
          errorCount: sub.errorCount,
          createdAt: sub.createdAt,
        },
        { force: true }
      );

      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                lastSyncedText: "Just now",
                articlesCount: res.newArticlesCount !== undefined ? res.newArticlesCount : s.articlesCount,
                status: res.success ? ("active" as const) : ("error" as const),
              }
            : s
        )
      );
      setNotice(`Refreshed ${sub.title}`);
      setTimeout(() => setNotice(null), 3000);
    } catch {
      setSubscriptions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "error" as const } : s))
      );
    } finally {
      setSyncingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    const target = deleteTargetId;
    setSubscriptions((prev) => prev.filter((s) => s.id !== target));
    setDeleteTargetId(null);
    try {
      const { db } = await import("@/lib/db");
      await db.subscriptions.delete(target);
    } catch {}
  };

  const escapeXml = (str: string) => {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  const handleExportOPML = () => {
    const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>OnlyDevs Subscriptions</title></head>
  <body>
    ${subscriptions
      .map(
        (s) =>
          `<outline text="${escapeXml(s.title)}" title="${escapeXml(s.title)}" type="rss" xmlUrl="${escapeXml(s.url)}" htmlUrl="${escapeXml(s.siteUrl || s.url)}" category="${escapeXml(s.category || 'General')}"/>`
      )
      .join("\n    ")}
  </body>
</opml>`;

    const blob = new Blob([opmlContent], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "onlydevs-subscriptions.opml";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Real OPML Import: reads and parses XML file in browser
  const handleImportOPML = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".opml,.xml";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const text = evt.target?.result as string;
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, "text/xml");
          const outlines = Array.from(doc.querySelectorAll("outline[xmlUrl], outline[url]"));

          if (outlines.length === 0) {
            setNotice("No valid RSS/Atom feed links found in the selected file.");
            setTimeout(() => setNotice(null), 3500);
            return;
          }

          const newSubs: SubscriptionWithMeta[] = [];
          for (const el of outlines) {
            const url = el.getAttribute("xmlUrl") || el.getAttribute("url");
            if (!url) continue;
            const title =
              el.getAttribute("title") ||
              el.getAttribute("text") ||
              new URL(url).hostname;
            const category = el.getAttribute("category") || "Imported";
            const siteUrl = el.getAttribute("htmlUrl") || undefined;

            const subRecord: Omit<Subscription, "createdAt"> = {
              id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              title,
              url,
              siteUrl,
              category,
              status: "active",
              errorCount: 0,
            };
            await addSubscription(subRecord).catch(() => {});

            newSubs.push({
              ...subRecord,
              articlesCount: 0,
              lastSyncedText: "Just now",
              status: "active",
              createdAt: Date.now(),
            });
          }

          setSubscriptions((prev) => [...newSubs, ...prev]);
          setNotice(`Successfully imported ${newSubs.length} feeds from "${file.name}"`);
          setTimeout(() => setNotice(null), 4000);
        } catch {
          setNotice("Failed to parse OPML file. Please ensure it is valid XML.");
          setTimeout(() => setNotice(null), 3500);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="flex-1 flex flex-col px-4 sm:px-8 py-8 sm:py-12 max-w-5xl mx-auto w-full gap-8 animate-fade-in-up">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-5 pb-6 border-b border-border/50">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium tracking-wide">
            <Radio className="h-3 w-3 text-emerald-500" />
            <span className="font-medium text-foreground/80">Feed Registry</span>
            <span className="text-border">•</span>
            <span>{subscriptions.length} registered sources</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            Subscriptions
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
            Curate and manage your RSS, Atom, and JSON feeds with quiet background synchronization.
          </p>
        </div>

        {/* Action Controls & Layout Toggle */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Grid vs List View Toggle */}
          <div className="flex items-center p-0.5 rounded-lg border border-border/60 bg-muted/50 text-xs">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-md btn-press transition-colors",
                viewMode === "grid"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded-md btn-press transition-colors",
                viewMode === "list"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="List view"
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={handleImportOPML}
            className="px-3.5 py-2 rounded-xl border border-border/70 hover:bg-card text-xs font-medium text-muted-foreground hover:text-foreground btn-press inline-flex items-center gap-1.5 shadow-2xs"
            title="Import feeds from an OPML file"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import OPML</span>
          </button>

          <button
            onClick={handleExportOPML}
            className="px-3.5 py-2 rounded-xl border border-border/70 hover:bg-card text-xs font-medium text-muted-foreground hover:text-foreground btn-press inline-flex items-center gap-1.5 shadow-2xs"
            title="Export feeds to OPML format"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export OPML</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-foreground text-background hover:bg-foreground/90 text-xs font-medium btn-press inline-flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>Add Feed</span>
          </button>
        </div>
      </header>

      {/* KPI Stats Overview Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-xl border border-border/70 bg-card/80 card-linear flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Rss className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-medium">Active Feeds</span>
            <span className="text-base font-semibold tracking-tight text-foreground font-mono">
              {subscriptions.length} Sources
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border/70 bg-card/80 card-linear flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Layers className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-medium">Cached Stories</span>
            <span className="text-base font-semibold tracking-tight text-foreground font-mono">
              {totalArticles} Articles
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border/70 bg-card/80 card-linear flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-500">
            <Clock className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-medium">Sync Engine</span>
            <span className="text-base font-semibold tracking-tight text-foreground">
              Edge Proxy Active
            </span>
          </div>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className="p-3.5 rounded-xl bg-secondary/80 border border-border/60 text-xs flex items-center gap-2.5 animate-in fade-in duration-150">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-foreground font-medium">{notice}</span>
        </div>
      )}

      {/* Subscriptions Grid vs List Layout */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subscriptions.map((sub) => {
            const isSyncing = syncingId === sub.id;

            return (
              <div
                key={sub.id}
                className="p-5 sm:p-6 rounded-xl border border-border/80 bg-card/90 card-linear flex flex-col justify-between gap-4 relative"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
                      <Rss className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <h3 className="font-semibold text-base tracking-tight text-foreground truncate">
                        {sub.title}
                      </h3>
                      <a
                        href={sub.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground truncate inline-flex items-center gap-1 mt-0.5 max-w-[240px] transition-colors"
                        title={sub.url}
                      >
                        <Globe className="h-3 w-3 shrink-0" />
                        <span className="truncate">{sub.url}</span>
                      </a>
                    </div>
                  </div>

                  {/* Status and Category */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-secondary/80 text-secondary-foreground border border-border/40">
                      {sub.category || "General"}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 transition-colors",
                        sub.status === "active"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : sub.status === "syncing"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          sub.status === "active"
                            ? "bg-emerald-500"
                            : sub.status === "syncing"
                            ? "bg-blue-500 animate-pulse"
                            : "bg-amber-500"
                        )}
                      />
                      <span className="capitalize">{sub.status}</span>
                    </span>
                  </div>
                </div>

                {/* Card Meta & Actions Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-border/50 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>{sub.articlesCount} articles</span>
                    <span className="text-border">•</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{sub.lastSyncedText}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleResync(sub.id)}
                      disabled={isSyncing}
                      title="Force re-sync feed"
                      className="p-1.5 rounded-lg hover:bg-accent/80 text-muted-foreground hover:text-foreground btn-press disabled:opacity-50 transition-colors"
                      aria-label="Re-sync feed"
                    >
                      <RefreshCw
                        className={cn("h-3.5 w-3.5", isSyncing && "animate-spin text-primary")}
                      />
                    </button>
                    <button
                      onClick={() => setDeleteTargetId(sub.id)}
                      title="Unsubscribe from feed"
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive btn-press transition-colors"
                      aria-label="Unsubscribe"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* High-Density List View */
        <div className="flex flex-col border border-border/80 rounded-xl divide-y divide-border/60 bg-card/90 overflow-hidden card-linear">
          {subscriptions.map((sub) => {
            const isSyncing = syncingId === sub.id;

            return (
              <div
                key={sub.id}
                className="p-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <Rss className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm text-foreground truncate">
                        {sub.title}
                      </h3>
                      <span className="text-[10px] px-2 py-0.2 rounded bg-secondary text-secondary-foreground">
                        {sub.category || "General"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground truncate">
                      {sub.url}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">{sub.articlesCount} articles</span>
                  <span
                    className={cn(
                      "text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1",
                      sub.status === "active"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        sub.status === "active" ? "bg-emerald-500" : "bg-amber-500"
                      )}
                    />
                    <span className="capitalize">{sub.status}</span>
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleResync(sub.id)}
                      disabled={isSyncing}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground btn-press"
                      title="Re-sync"
                    >
                      <RefreshCw
                        className={cn("h-3.5 w-3.5", isSyncing && "animate-spin text-primary")}
                      />
                    </button>
                    <button
                      onClick={() => setDeleteTargetId(sub.id)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive btn-press"
                      title="Unsubscribe"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Feed Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Subscribe to a Publication"
        description="Enter any RSS, Atom URL, or site link. Autodiscovery will resolve the XML feed."
      >
        <form onSubmit={handleAddFeed} className="flex flex-col gap-5 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">
              Feed or Website URL
            </label>
            <input
              type="url"
              placeholder="https://example.com/feed.xml or website address"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-background rounded-xl border border-border/80 focus:outline-none focus:ring-2 focus:ring-foreground/15 focus:border-foreground/30 transition-all"
              autoFocus
            />
            <span className="text-[11px] text-muted-foreground">
              Supports RSS 2.0, Atom 1.0, JSON Feed, and HTML link autodiscovery.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">
              Folder / Category Tag
            </label>
            <div className="relative">
              <select
                value={feedCategory}
                onChange={(e) => setFeedCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-background rounded-xl border border-border/80 focus:outline-none focus:ring-2 focus:ring-foreground/15 focus:border-foreground/30 transition-all text-foreground"
              >
                <option value="Technology">Technology</option>
                <option value="Software Engineering">Software Engineering</option>
                <option value="Frontend">Frontend</option>
                <option value="AI / Python">AI / Python</option>
                <option value="Design & Typography">Design & Typography</option>
                <option value="Personal Blogs">Personal Blogs</option>
              </select>
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/50">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-medium rounded-lg text-muted-foreground hover:bg-accent/60 hover:text-foreground btn-press"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 btn-press disabled:opacity-50 inline-flex items-center gap-1.5 shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Validating Feed...</span>
                </>
              ) : (
                <>
                  <FolderPlus className="h-3.5 w-3.5" />
                  <span>Subscribe</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Unsubscribe Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
        title="Unsubscribe Confirmation"
        description="Are you sure you want to remove this publication? Cached articles will remain in your offline library."
      >
        <div className="flex items-center justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={() => setDeleteTargetId(null)}
            className="px-4 py-2 text-xs font-medium rounded-lg text-muted-foreground hover:bg-accent/60 hover:text-foreground btn-press"
          >
            Keep Subscription
          </button>
          <button
            type="button"
            onClick={handleConfirmDelete}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 btn-press shadow-xs"
          >
            Confirm Unsubscribe
          </button>
        </div>
      </Modal>
    </div>
  );
}
