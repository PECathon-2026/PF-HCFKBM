"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Layers,
  Rss,
  Compass,
  Feather,
  Menu,
  X,
  BookOpen,
  WifiOff,
  RefreshCw,
  CornerDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { syncAllFeeds } from "@/lib/sync";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeType?: "count" | "new";
  shortcut?: string;
}

export function Sidebar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [subCount, setSubCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Dynamically load real badge counters from IndexedDB
  useEffect(() => {
    let mounted = true;

    const loadCounts = async () => {
      try {
        const { db } = await import("@/lib/db");
        const [unread, totalSubs] = await Promise.all([
          db.articles.where("isRead").equals(0).count().catch(() => 0),
          db.subscriptions.count().catch(() => 0),
        ]);

        if (mounted) {
          setUnreadCount(unread);
          setSubCount(totalSubs);
        }
      } catch {}
    };

    loadCounts();
    const interval = setInterval(loadCounts, 2500);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [pathname]);

  const navItems: NavItem[] = [
    {
      href: "/",
      label: "Timeline",
      icon: Layers,
      badge: unreadCount > 0 ? String(unreadCount) : undefined,
      badgeType: "count",
      shortcut: "1",
    },
    {
      href: "/subscriptions",
      label: "Subscriptions",
      icon: Rss,
      badge: subCount > 0 ? String(subCount) : undefined,
      badgeType: "count",
      shortcut: "2",
    },
    {
      href: "/discover",
      label: "Discover",
      icon: Compass,
      badge: "New",
      badgeType: "new",
      shortcut: "3",
    },
    {
      href: "/read/demo-1",
      label: "Reader Mode",
      icon: BookOpen,
      shortcut: "4",
    },
  ];

  // Monitor real-time online/offline network status
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(window.navigator.onLine);

      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncAllFeeds({ force: true });
    } catch {}
    setTimeout(() => setIsSyncing(false), 1200);
  };

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          1. PERSISTENT DESKTOP & LAPTOP LEFT SIDEBAR (>= md viewports)
          ───────────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex fixed top-0 left-0 bottom-0 w-64 z-40 flex-col justify-between border-r border-border/70 bg-card/85 backdrop-blur-xl p-5 select-none transition-all duration-200">
        {/* Top: Brand Header */}
        <div className="flex flex-col gap-6">
          <Link
            href="/"
            className="flex items-center gap-3 group py-1 select-none"
          >
            <div className="h-9 w-9 rounded-xl bg-foreground text-background flex items-center justify-center font-semibold shadow-xs group-hover:scale-105 transition-all duration-200">
              <Feather className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-base tracking-tight text-foreground">
                  OnlyDevs
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted/80 text-muted-foreground font-mono">
                  v2
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground/80 font-normal tracking-wide">
                Quiet Small Web Reader
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 px-3 pb-1">
              Navigation
            </span>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : item.href.startsWith("/read/")
                    ? pathname.startsWith("/read/")
                    : pathname.startsWith(item.href);

                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-160 btn-press group",
                      isActive
                        ? "bg-foreground text-background font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={cn(
                          "h-4 w-4 transition-colors",
                          isActive
                            ? "text-background"
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      <span>{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.badge && (
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium leading-none transition-colors",
                            isActive
                              ? "bg-background/20 text-background font-semibold"
                              : item.badgeType === "new"
                              ? "bg-primary/10 text-primary font-semibold"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Quick Keyboard Shortcuts Reference */}
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-muted/30 border border-border/40 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between font-medium text-foreground/80">
              <span className="flex items-center gap-1.5">
                <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                <span>Shortcuts</span>
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/60">Help</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground/80">Next / Prev</span>
                <span className="px-1.5 py-0.5 bg-background rounded border border-border/60 text-foreground font-semibold">J / K</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground/80">Mark Read</span>
                <span className="px-1.5 py-0.5 bg-background rounded border border-border/60 text-foreground font-semibold">M</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground/80">Star Post</span>
                <span className="px-1.5 py-0.5 bg-background rounded border border-border/60 text-foreground font-semibold">S</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground/80">Search</span>
                <span className="px-1.5 py-0.5 bg-background rounded border border-border/60 text-foreground font-semibold">/</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Network Status & Theme & Quick Sync */}
        <div className="flex flex-col gap-3 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between gap-2">
            {/* Live Online / Offline Sync Badge */}
            <div
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs shadow-2xs transition-colors flex-1",
                isOnline
                  ? "bg-card/70 border-border/60 text-muted-foreground"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
              )}
              title={
                isOnline
                  ? "Connected to edge proxy service"
                  : "Offline: Reading directly from local IndexedDB cache"
              }
            >
              {isOnline ? (
                <>
                  <span className="status-dot-emerald shrink-0" />
                  <span className="text-[11px] font-medium tracking-tight truncate">
                    Edge Sync
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="text-[11px] font-medium tracking-tight truncate">
                    Offline Cache
                  </span>
                </>
              )}
            </div>

            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="p-1.5 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 btn-press transition-colors"
              title="Refresh feeds now"
              aria-label="Refresh all feeds"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isSyncing && "animate-spin text-primary")}
              />
            </button>

            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          2. MOBILE TOP NAVBAR (< md viewports)
          ───────────────────────────────────────────────────────────── */}
      <header className="md:hidden sticky top-0 z-40 w-full border-b border-border/70 glass-nav transition-all duration-200">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 group btn-press py-1 select-none"
          >
            <div className="h-8 w-8 rounded-lg bg-foreground text-background flex items-center justify-center font-semibold shadow-xs">
              <Feather className="h-4 w-4" />
            </div>
            <span className="font-semibold text-base tracking-tight text-foreground">
              OnlyDevs
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px]",
                isOnline
                  ? "bg-card/60 border-border/50 text-muted-foreground"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
              )}
            >
              {isOnline ? (
                <span className="status-dot-emerald" />
              ) : (
                <WifiOff className="h-3 w-3 text-amber-500" />
              )}
            </div>

            <ThemeToggle />

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground btn-press"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Animated Dropdown */}
        {isMobileMenuOpen && (
          <div className="border-t border-border/60 bg-card/95 backdrop-blur-md px-4 py-4 flex flex-col gap-2 animate-in slide-in-from-top-2 duration-150">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : item.href.startsWith("/read/")
                  ? pathname.startsWith("/read/")
                  : pathname.startsWith(item.href);

              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors btn-press",
                    isActive
                      ? "bg-foreground text-background font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={cn(
                        "text-[11px] px-2 py-0.5 rounded-full font-medium",
                        isActive
                          ? "bg-background/20 text-background"
                          : item.badgeType === "new"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </header>
    </>
  );
}
