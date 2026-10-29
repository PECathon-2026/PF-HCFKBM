"use client";

import { useState } from "react";
import { Plus, Rss, Globe, Trash2, RefreshCw, X, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriptionItem {
  id: string;
  title: string;
  url: string;
  category: string;
  articlesCount: number;
  lastSynced: string;
  status: "active" | "error" | "syncing";
}

const INITIAL_SUBSCRIPTIONS: SubscriptionItem[] = [
  {
    id: "sub-1",
    title: "Changelog Weekly",
    url: "https://changelog.com/weekly/feed",
    category: "Software Engineering",
    articlesCount: 42,
    lastSynced: "10 mins ago",
    status: "active",
  },
  {
    id: "sub-2",
    title: "Hacker News Top Stories",
    url: "https://news.ycombinator.com/rss",
    category: "Tech & Startups",
    articlesCount: 156,
    lastSynced: "2 mins ago",
    status: "active",
  },
  {
    id: "sub-3",
    title: "Vercel Blog",
    url: "https://vercel.com/atom",
    category: "Frontend",
    articlesCount: 18,
    lastSynced: "1 hour ago",
    status: "active",
  },
  {
    id: "sub-4",
    title: "Simon Willison's Weblog",
    url: "https://simonwillison.net/atom/everything/",
    category: "AI / Python",
    articlesCount: 89,
    lastSynced: "4 hours ago",
    status: "active",
  },
];

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>(INITIAL_SUBSCRIPTIONS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedCategory, setFeedCategory] = useState("Technology");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!feedUrl.trim()) {
      setFormError("Please enter a valid feed or website URL");
      return;
    }

    try {
      new URL(feedUrl);
    } catch {
      setFormError("Invalid URL format (must include http:// or https://)");
      return;
    }

    setIsSubmitting(true);

    // Simulate async feed discovery / server validation
    setTimeout(() => {
      const newSub: SubscriptionItem = {
        id: `sub-${Date.now()}`,
        title: feedUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] || "New Feed",
        url: feedUrl,
        category: feedCategory,
        articlesCount: 1,
        lastSynced: "Just now",
        status: "active",
      };

      setSubscriptions((prev) => [newSub, ...prev]);
      setIsSubmitting(false);
      setFeedUrl("");
      setIsModalOpen(false);
    }, 600);
  };

  const removeSubscription = (id: string) => {
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your RSS and Atom sources ({subscriptions.length} active feeds).
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 btn-press shadow-sm shadow-primary/20"
        >
          <Plus className="h-4 w-4" />
          <span>Add Feed</span>
        </button>
      </header>

      {/* Feed Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subscriptions.map((sub) => (
          <div
            key={sub.id}
            className="p-5 rounded-xl border border-border bg-card card-hover flex flex-col justify-between gap-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                  <Rss className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <h3 className="font-semibold text-base tracking-tight text-foreground">
                    {sub.title}
                  </h3>
                  <a
                    href={sub.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:underline truncate max-w-xs inline-flex items-center gap-1 mt-0.5"
                  >
                    <Globe className="h-3 w-3" />
                    <span>{sub.url}</span>
                  </a>
                </div>
              </div>

              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground shrink-0">
                {sub.category}
              </span>
            </div>

            {/* Footer meta & actions */}
            <div className="flex items-center justify-between pt-3 border-t border-border/50 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>{sub.articlesCount} articles</span>
                <span>•</span>
                <span>Synced {sub.lastSynced}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  title="Force re-sync"
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground btn-press"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => removeSubscription(sub.id)}
                  title="Unsubscribe"
                  className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive btn-press"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Feed Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl flex flex-col gap-5 relative animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-primary/10 text-primary">
                  <Rss className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-semibold tracking-tight">Add New Feed</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent btn-press"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddFeed} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Feed or Website URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/feed.xml or website URL"
                  value={feedUrl}
                  onChange={(e) => setFeedUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  autoFocus
                />
                <span className="text-[11px] text-muted-foreground">
                  Autodiscovery automatically detects RSS/Atom links from homepage HTML.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">Category</label>
                <select
                  value={feedCategory}
                  onChange={(e) => setFeedCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                >
                  <option value="Technology">Technology</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Frontend">Frontend</option>
                  <option value="AI / Dev">AI / Dev</option>
                  <option value="Design">Design</option>
                  <option value="General">General</option>
                </select>
              </div>

              {formError && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border mt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground btn-press"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 btn-press disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm shadow-primary/20"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Validating...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Subscribe</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
