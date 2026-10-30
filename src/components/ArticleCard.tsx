"use client";

import React, { forwardRef } from "react";
import Link from "next/link";
import {
  Bookmark,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ArticleCardData {
  id: string;
  feedTitle: string;
  feedCategory?: string;
  title: string;
  summary?: string;
  author?: string;
  published: string;
  readingTimeMinutes?: number;
  isRead: boolean;
  isBookmarked: boolean;
  originalUrl?: string;
}

interface ArticleCardProps {
  article: ArticleCardData;
  isSelected?: boolean;
  isFocused?: boolean;
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  onFocusCard?: () => void;
}

export const ArticleCard = forwardRef<HTMLDivElement, ArticleCardProps>(
  function ArticleCard(
    {
      article,
      isSelected,
      isFocused = true,
      onToggleRead,
      onToggleBookmark,
      onFocusCard,
    },
    ref
  ) {
    const readTime = article.readingTimeMinutes ?? 4;

    return (
      <div
        ref={ref}
        onClick={() => {
          if (!isFocused && onFocusCard) {
            onFocusCard();
          }
        }}
        className={cn(
          "group relative rounded-3xl border transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] bg-card overflow-hidden scroll-mt-28",
          // Carousel focus & blur physics
          isFocused
            ? "opacity-100 scale-100 blur-0 shadow-2xl border-border ring-1 ring-border/80 z-10 pointer-events-auto"
            : "opacity-25 hover:opacity-60 scale-[0.96] blur-[5px] hover:blur-[2px] border-border/30 shadow-none z-0 cursor-pointer select-none",
          isSelected && isFocused && "ring-2 ring-primary/40 border-primary/50",
          article.isRead && isFocused && "opacity-75 hover:opacity-100 border-border/50"
        )}
      >
        {/* Subtle Reading Elevation Glow when focused */}
        {isFocused && (
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none" />
        )}

        {/* Primary Clickable Reading Container */}
        <Link
          href={`/read/${article.id}`}
          className="flex flex-col gap-5 p-7 sm:p-10 md:p-12 block select-none cursor-pointer"
        >
          {/* Top Metadata: Quiet, spacious, and dignified */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2.5 flex-wrap">
              {!article.isRead ? (
                <span
                  className="status-dot-primary shrink-0"
                  title="Unread story"
                />
              ) : (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 shrink-0"
                  title="Read story"
                />
              )}

              <span className="font-semibold text-foreground tracking-tight text-xs sm:text-[13px]">
                {article.feedTitle}
              </span>

              {article.feedCategory && (
                <>
                  <span className="text-border/70">/</span>
                  <span className="text-muted-foreground text-xs font-normal">
                    {article.feedCategory}
                  </span>
                </>
              )}

              {article.author && (
                <>
                  <span className="text-border/70">·</span>
                  <span className="text-muted-foreground/90 text-xs truncate max-w-[180px]">
                    {article.author}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground/75">
              <Clock className="h-3 w-3 shrink-0 opacity-70" />
              <span>{readTime}m read</span>
              <span className="text-border/70">·</span>
              <span>{article.published}</span>
            </div>
          </div>

          {/* Large, Authoritative Headline */}
          <h2
            className={cn(
              "font-serif text-2xl sm:text-3xl md:text-[34px] font-medium tracking-tight text-foreground group-hover:text-primary transition-colors leading-[1.22] my-1",
              !article.isRead ? "font-semibold text-foreground" : "text-foreground/85"
            )}
          >
            {article.title}
          </h2>

          {/* Concise 1-2 line teaser that starts and cleanly cuts off */}
          {article.summary && (
            <p className="font-serif text-sm sm:text-base text-muted-foreground/90 line-clamp-2 leading-relaxed font-normal">
              {article.summary}
            </p>
          )}
        </Link>

        {/* Floating Bottom Action Rail */}
        <div className="flex items-center justify-between px-7 sm:px-10 md:px-12 py-3.5 border-t border-border/40 bg-muted/20 text-xs">
          <div>
            {article.originalUrl && (
              <a
                href={article.originalUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                title="Open publication website"
              >
                <ExternalLink className="h-3 w-3 opacity-70" />
                <span>Original Source</span>
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleRead(article.id);
              }}
              type="button"
              title={article.isRead ? "Mark as unread (M)" : "Mark as read (M)"}
              className={cn(
                "p-2 rounded-lg hover:bg-accent/80 text-muted-foreground hover:text-foreground btn-press transition-colors",
                article.isRead && "text-emerald-500 font-medium"
              )}
              aria-label={article.isRead ? "Mark as unread" : "Mark as read"}
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleBookmark(article.id);
              }}
              type="button"
              title={article.isBookmarked ? "Remove bookmark (S)" : "Bookmark article (S)"}
              className={cn(
                "p-2 rounded-lg hover:bg-accent/80 text-muted-foreground hover:text-foreground btn-press transition-colors",
                article.isBookmarked && "text-amber-500 font-medium"
              )}
              aria-label={article.isBookmarked ? "Remove bookmark" : "Bookmark article"}
            >
              <Bookmark className={cn("h-4 w-4", article.isBookmarked && "fill-current text-amber-500")} />
            </button>
          </div>
        </div>
      </div>
    );
  }
);
