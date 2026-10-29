"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Rss, Compass, BookOpen, Layers, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Timeline",
    icon: Layers,
    badge: "12",
  },
  {
    href: "/subscriptions",
    label: "Subscriptions",
    icon: Rss,
    badge: "8",
  },
  {
    href: "/discover",
    label: "Discover",
    icon: Compass,
    badge: "New",
  },
  {
    href: "/read/demo-1",
    label: "Reader",
    icon: BookOpen,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border bg-card/60 backdrop-blur-md flex flex-col justify-between shrink-0 min-h-screen sticky top-0">
      <div className="p-4 flex flex-col gap-6">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-semibold shadow-sm shadow-primary/25">
            <Newspaper className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm tracking-tight">OnlyDevs</span>
            <span className="text-xs text-muted-foreground">Reader & Feeds</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex flex-col gap-1">
          <div className="px-2 pb-2 text-[11px] font-medium tracking-wider uppercase text-muted-foreground/80">
            Navigation
          </div>
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href.replace("/demo-1", ""));

            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors btn-press",
                  isActive
                    ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-none",
                      item.badge === "New"
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
        </nav>
      </div>

      {/* Footer Info / Sync status */}
      <div className="p-4 border-t border-border/80 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Local Sync Online</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
          <Sparkles className="h-3 w-3" />
          <span>v0.1</span>
        </div>
      </div>
    </aside>
  );
}
