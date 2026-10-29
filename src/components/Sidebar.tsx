"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Layers,
  Rss,
  Compass,
  Feather,
  Radio,
  Menu,
  X,
  BookOpen,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeType?: "count" | "new";
}

export function Sidebar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [subCount, setSubCount] = useState<number>(0);

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
    },
    {
      href: "/subscriptions",
      label: "Subscriptions",
      icon: Rss,
      badge: subCount > 0 ? String(subCount) : undefined,
      badgeType: "count",
    },
    {
      href: "/discover",
      label: "Discover",
      icon: Compass,
      badge: "New",
      badgeType: "new",
    },
    {
      href: "/read/demo-1",
      label: "Reader",
      icon: BookOpen,
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

  // Prominent sticky navigation bar across all routes including reader view
  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-border/70 glass-nav transition-all duration-200"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-2.5 flex items-center justify-between gap-4">
        {/* Left: Brand Identity with subtle hover transition */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 group btn-press py-1 select-none"
          >
            <div className="h-8 w-8 rounded-lg bg-foreground text-background flex items-center justify-center font-semibold shadow-xs group-hover:scale-102 transition-all duration-200">
              <Feather className="h-4 w-4" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-base tracking-tight text-foreground">
                OnlyDevs
              </span>
              <span className="hidden sm:inline-block text-[11px] text-muted-foreground/80 font-normal tracking-wide">
                Quiet Reader
              </span>
            </div>
          </Link>
        </div>

        {/* Center: Desktop Navigation Tabs with Glass Pill */}
        <nav className="hidden md:flex items-center gap-1 p-1 bg-muted/60 rounded-xl border border-border/60 shadow-xs">
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
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-160 btn-press relative",
                  isActive
                    ? "bg-card text-foreground font-semibold border border-border/70 card-linear"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium leading-none transition-colors",
                      item.badgeType === "new"
                        ? "bg-primary/10 text-primary font-semibold"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right: Network Status & Circadian Theme Toggle */}
        <div className="flex items-center gap-3">
          {/* Live Online / Offline Sync Badge with calm status ring */}
          <div
            className={cn(
              "hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs shadow-2xs transition-colors",
              isOnline
                ? "bg-card/60 border-border/50 text-muted-foreground"
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
                <span className="status-dot-emerald" />
                <span className="text-[11px] font-medium tracking-tight">
                  Edge Sync
                </span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-amber-500" />
                <span className="text-[11px] font-medium tracking-tight">
                  Offline Cache
                </span>
              </>
            )}
          </div>

          <ThemeToggle />

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground btn-press"
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
        <div className="md:hidden border-t border-border/60 bg-card/95 backdrop-blur-md px-4 py-4 flex flex-col gap-2 animate-in slide-in-from-top-2 duration-150">
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
                    ? "bg-secondary text-foreground font-semibold shadow-xs"
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
                      item.badgeType === "new"
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
  );
}
