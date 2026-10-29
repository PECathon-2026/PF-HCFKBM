"use client";

import Link from "next/link";
import {
  Bookmark,
  CheckCircle2,
  Clock,
  ExternalLink,
  BookOpen,
  ArrowRight,
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
  onToggleRead: (id: string) => void;
  onToggleBookmark: (id: string) => void;
}

export function ArticleCard({
  article,
  onToggleRead,
  onToggleBookmark,
}: ArticleCardProps) {
  const readTime = article.readingTimeMinutes ?? 4;

  return (
    <article
      className={cn(
        "group p-5 sm:p-6 rounded-xl border transition-all duration-200 card-linear flex flex-col justify-between gap-3.5 relative bg-card/90 backdrop-blur-xs",
        article.isRead
          ? "opacity-65 hover:opacity-90 border-border/50"
          : "border-border/80 hover:border-foreground/25"
      )}
    >
      {/* Top Meta Header */}
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

          <span className="font-medium text-foreground px-2 py-0.5 rounded-md bg-secondary/80 text-[11px] tracking-tight border border-border/40">
            {article.feedTitle}
          </span>

          {article.feedCategory && (
            <>
              <span className="text-border/80">•</span>
              <span className="text-muted-foreground/80 text-[11px] font-normal">
                {article.feedCategory}
              </span>
            </>
          )}

          {article.author && (
            <>
              <span className="text-border/80">•</span>
              <span className="text-muted-foreground/90 font-medium text-[11px] truncate max-w-[150px]">
                {article.author}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/80">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{readTime} min read</span>
          <span className="text-border/80">•</span>
          <span>{article.published}</span>
        </div>
      </div>

      {/* Title & Excerpt */}
      <div className="flex flex-col gap-2 my-0.5">
        <Link
          href={`/read/${article.id}`}
          className={cn(
            "text-lg sm:text-xl font-medium tracking-tight text-foreground group-hover:text-primary transition-colors leading-snug",
            !article.isRead && "font-semibold"
          )}
        >
          {article.title}
        </Link>
        {article.summary && (
          <p className="text-xs sm:text-sm text-muted-foreground/90 line-clamp-2 leading-relaxed font-normal">
            {article.summary}
          </p>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-border/40 mt-0.5">
        <div className="flex items-center gap-2.5">
          <Link
            href={`/read/${article.id}`}
            className="group/btn text-xs font-medium text-foreground/85 hover:text-foreground inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-muted/50 hover:bg-muted btn-press transition-colors border border-border/40"
          >
            <BookOpen className="h-3.5 w-3.5 text-muted-foreground group-hover/btn:text-foreground transition-colors" />
            <span>Read Article</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground/60 transition-transform group-hover/btn:translate-x-0.5" />
          </Link>

          {article.originalUrl && (
            <a
              href={article.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 py-1 px-2 rounded-md hover:bg-muted/40 transition-colors"
              title="Open publication website"
            >
              <ExternalLink className="h-3 w-3" />
              <span className="hidden sm:inline">Source</span>
            </a>
          )}
        </div>

        {/* Quick action buttons with tactile physics */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleRead(article.id)}
            type="button"
            title={article.isRead ? "Mark as unread" : "Mark as read"}
            className={cn(
              "p-2 rounded-lg hover:bg-accent/80 text-muted-foreground hover:text-foreground btn-press transition-colors",
              article.isRead && "badge-emerald font-medium"
            )}
            aria-label={article.isRead ? "Mark as unread" : "Mark as read"}
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>

          <button
            onClick={() => onToggleBookmark(article.id)}
            type="button"
            title={article.isBookmarked ? "Remove bookmark" : "Bookmark article"}
            className={cn(
              "p-2 rounded-lg hover:bg-accent/80 text-muted-foreground hover:text-foreground btn-press transition-colors",
              article.isBookmarked && "badge-amber font-medium"
            )}
            aria-label={article.isBookmarked ? "Remove bookmark" : "Bookmark article"}
          >
            <Bookmark className={cn("h-4 w-4", article.isBookmarked && "fill-current")} />
          </button>
        </div>
      </div>
    </article>
  );
}
