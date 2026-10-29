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
    <article
      className={cn(
        "group p-5 sm:p-6 rounded-xl border transition-all duration-200 card-interactive flex flex-col justify-between gap-3 relative bg-card",
        isSelected && "ring-2 ring-primary/40 border-primary/50",
        article.isRead
          ? "opacity-65 hover:opacity-90 border-border/40"
          : "border-border/60 hover:border-border"
      )}
    >
      {/* Top Meta Header: Quiet, editorial, zero noise */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 flex-wrap">
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

          <span className="font-medium text-foreground tracking-tight text-[12px]">
            {article.feedTitle}
          </span>

          {article.feedCategory && (
            <>
              <span className="text-border/80">·</span>
              <span className="text-muted-foreground text-[11px] font-normal">
                {article.feedCategory}
              </span>
            </>
          )}

          {article.author && (
            <>
              <span className="text-border/80">·</span>
              <span className="text-muted-foreground/90 text-[11px] truncate max-w-[150px]">
                {article.author}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/75">
          <Clock className="h-3 w-3 shrink-0 opacity-70" />
          <span>{readTime}m read</span>
          <span className="text-border/80">·</span>
          <span>{article.published}</span>
        </div>
      </div>

      {/* Title & Excerpt - True Editorial Serif Typography */}
      <div className="flex flex-col gap-2 my-0.5">
        <Link
          href={`/read/${article.id}`}
          className={cn(
            "font-serif text-xl sm:text-[22px] tracking-tight text-foreground hover:text-primary transition-colors leading-snug",
            !article.isRead ? "font-semibold" : "font-normal text-foreground/80"
          )}
        >
          {article.title}
        </Link>
        {article.summary && (
          <p className="text-xs sm:text-[13px] text-muted-foreground line-clamp-2 leading-relaxed font-normal">
            {article.summary}
          </p>
        )}
      </div>

      {/* Footer Actions: Clean, non-redundant controls */}
      <div className="flex items-center justify-between pt-2.5 border-t border-border/40 mt-0.5">
        <div className="flex items-center gap-2">
          {article.originalUrl && (
            <a
              href={article.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 py-1 px-1.5 rounded hover:bg-muted/40 transition-colors"
              title="Open publication website"
            >
              <ExternalLink className="h-3 w-3" />
              <span>Source</span>
            </a>
          )}
        </div>

        {/* Quick action buttons with tactile physics */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleRead(article.id)}
            type="button"
            title={article.isRead ? "Mark as unread (M)" : "Mark as read (M)"}
            className={cn(
              "p-1.5 rounded-lg hover:bg-accent/80 text-muted-foreground hover:text-foreground btn-press transition-colors",
              article.isRead && "text-emerald-500 font-medium"
            )}
            aria-label={article.isRead ? "Mark as unread" : "Mark as read"}
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>

          <button
            onClick={() => onToggleBookmark(article.id)}
            type="button"
            title={article.isBookmarked ? "Remove bookmark (S)" : "Bookmark article (S)"}
            className={cn(
              "p-1.5 rounded-lg hover:bg-accent/80 text-muted-foreground hover:text-foreground btn-press transition-colors",
              article.isBookmarked && "text-amber-500 font-medium"
            )}
            aria-label={article.isBookmarked ? "Remove bookmark" : "Bookmark article"}
          >
            <Bookmark className={cn("h-4 w-4", article.isBookmarked && "fill-current text-amber-500")} />
          </button>
        </div>
      </div>
    </article>
  );
}
