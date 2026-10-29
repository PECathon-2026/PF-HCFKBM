"use client";

import Link from "next/link";
import {
  Bookmark,
  CheckCircle2,
  Clock,
  ExternalLink,
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
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
}

export function ArticleCard({
  article,
  isSelected,
  onToggleRead,
  onToggleBookmark,
}: ArticleCardProps) {
  const readTime = article.readingTimeMinutes ?? 4;

  return (
    <div
      className={cn(
        "group relative rounded-2xl border transition-all duration-200 card-interactive bg-card overflow-hidden",
        isSelected && "ring-2 ring-primary/40 border-primary/50",
        article.isRead
          ? "opacity-60 hover:opacity-90 border-border/40"
          : "border-border/60 hover:border-border"
      )}
    >
      {/* Primary Clickable Reading Container */}
      <Link
        href={`/read/${article.id}`}
        className="flex flex-col gap-4 p-7 sm:p-9 md:p-11 block select-none cursor-pointer"
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
            "font-serif text-2xl sm:text-3xl md:text-[32px] font-medium tracking-tight text-foreground group-hover:text-primary transition-colors leading-[1.22] my-1",
            !article.isRead ? "font-semibold text-foreground" : "text-foreground/80"
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
      <div className="flex items-center justify-between px-7 sm:px-9 md:px-11 py-3.5 border-t border-border/30 bg-muted/10 text-xs">
        <div>
          {article.originalUrl && (
            <a
              href={article.originalUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-muted/40 transition-colors"
              title="Open publication website"
            >
              <ExternalLink className="h-3 w-3 opacity-70" />
              <span>Original Source</span>
            </a>
          )}
        </div>

        <div className="flex items-center gap-1.5">
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
