"use client";

import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  X,
  Type,
  Bookmark,
  Share2,
  BookOpen,
  ArrowLeft,
  Check,
  Palette,
  Minus,
  Plus,
  Maximize2,
  List,
  Sparkles,
  MapPin,
  BookmarkCheck,
  CornerDownRight,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type ReaderFontSize = "sm" | "base" | "lg" | "xl";
export type ReaderColumnWidth = "compact" | "default" | "wide";
export type ReaderFontFamily =
  | "serif"
  | "sans"
  | "newsreader"
  | "georgia"
  | "merriweather"
  | "mono";
export type ReaderTheme =
  | "light"
  | "sepia"
  | "bone"
  | "sage"
  | "slate"
  | "dark";

export interface ReadingSpotData {
  scrollProgress: number;
  scrollY: number;
  timestamp: number;
}

export interface ReadingControlsProps {
  articleTitle?: string;
  readingProgress: number;
  fontSize: ReaderFontSize;
  numericFontSize: number;
  onNumericFontSizeChange: (size: number) => void;
  onFontSizeChange: (size: ReaderFontSize) => void;
  columnWidth: ReaderColumnWidth;
  onColumnWidthChange: (width: ReaderColumnWidth) => void;
  lineHeight?: number;
  onLineHeightChange?: (lh: number) => void;
  fontFamily: ReaderFontFamily;
  onFontFamilyChange: (font: ReaderFontFamily) => void;
  theme: ReaderTheme;
  onThemeChange: (theme: ReaderTheme) => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  savedReadingSpot?: ReadingSpotData | null;
  onSaveReadingSpot?: () => void;
  onJumpToReadingSpot?: () => void;
  onClearReadingSpot?: () => void;
  onToggleLibraryDrawer?: () => void;
  onShare?: () => void;
  className?: string;
}

const FONT_OPTIONS: { id: ReaderFontFamily; label: string; description: string }[] = [
  { id: "serif", label: "Lora", description: "Literary Serif" },
  { id: "newsreader", label: "Newsreader", description: "Classic Editorial" },
  { id: "sans", label: "Inter", description: "Modern Clean Sans" },
  { id: "georgia", label: "Georgia", description: "Print Traditional" },
  { id: "merriweather", label: "Merriweather", description: "Warm Book" },
  { id: "mono", label: "JetBrains Mono", description: "Monospace Code" },
];

const THEME_OPTIONS: { id: ReaderTheme; label: string; bgHex: string; fgHex: string; borderHex: string }[] = [
  { id: "light", label: "Pure Light", bgHex: "#ffffff", fgHex: "#171717", borderHex: "#e5e5e5" },
  { id: "sepia", label: "Warm Sepia", bgHex: "#fbf0d9", fgHex: "#433422", borderHex: "#e7d5b5" },
  { id: "bone", label: "Quiet Bone", bgHex: "#f7f4ed", fgHex: "#292524", borderHex: "#e6e0d3" },
  { id: "sage", label: "Muted Sage", bgHex: "#edf2ec", fgHex: "#1c2e24", borderHex: "#d8e2d6" },
  { id: "slate", label: "Slate Dark", bgHex: "#18181b", fgHex: "#f4f4f5", borderHex: "#27272a" },
  { id: "dark", label: "Obsidian", bgHex: "hsl(224, 71%, 4%)", fgHex: "hsl(213, 25%, 92%)", borderHex: "rgba(255,255,255,0.15)" },
];

export function ReadingControls({
  articleTitle,
  readingProgress,
  fontSize,
  numericFontSize,
  onNumericFontSizeChange,
  onFontSizeChange,
  columnWidth,
  onColumnWidthChange,
  lineHeight = 1.85,
  onLineHeightChange,
  fontFamily,
  onFontFamilyChange,
  theme,
  onThemeChange,
  isBookmarked,
  onToggleBookmark,
  savedReadingSpot,
  onSaveReadingSpot,
  onJumpToReadingSpot,
  onClearReadingSpot,
  onToggleLibraryDrawer,
  onShare,
  className,
}: ReadingControlsProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Close with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleStepFontSize = (delta: number) => {
    const next = Math.min(Math.max(numericFontSize + delta, 13), 36);
    onNumericFontSizeChange(next);
    if (next <= 16) onFontSizeChange("sm");
    else if (next <= 19) onFontSizeChange("base");
    else if (next <= 23) onFontSizeChange("lg");
    else onFontSizeChange("xl");
  };

  const handleSliderChange = (val: number) => {
    onNumericFontSizeChange(val);
    if (val <= 16) onFontSizeChange("sm");
    else if (val <= 19) onFontSizeChange("base");
    else if (val <= 23) onFontSizeChange("lg");
    else onFontSizeChange("xl");
  };

  return (
    <>
      {/* 1. Floating Inward Arrow / Trigger Tab (Always floating on right side as screen scrolls) */}
      <aside
        className={cn(
          "fixed right-0 top-1/2 -translate-y-1/2 z-50 flex items-center select-none transition-transform duration-200",
          isOpen ? "translate-x-full pointer-events-none" : "translate-x-0",
          className
        )}
        aria-label="Reading Controls"
      >
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1 pl-2.5 pr-1.5 py-3 rounded-l-xl border border-r-0 border-border/80 bg-card/95 backdrop-blur-xl shadow-xl card-linear text-foreground hover:bg-card btn-press transition-all group focus:outline-none focus:ring-2 focus:ring-primary/20"
          title="Open Reading Toolkit (Fonts, Sizing, Colors)"
          aria-label="Open reading toolkit"
        >
          <ChevronLeft className="h-4 w-4 text-primary transition-transform group-hover:-translate-x-0.5" />
          <div className="flex flex-col items-center">
            <SlidersHorizontal className="h-3.5 w-3.5 text-foreground/80" />
            <span className="text-[8px] font-mono font-semibold tracking-tighter uppercase text-muted-foreground mt-0.5">
              Tools
            </span>
          </div>
        </button>
      </aside>

      {/* 2. Backdrop Overlay when Drawer is Open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/25 backdrop-blur-2xs transition-opacity duration-200"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 3. Sleek Narrow Slide-out Reading Toolkit Drawer on the Right */}
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 w-72 sm:w-80 max-w-[310px] z-50 bg-card/98 backdrop-blur-2xl border-l border-border/80 shadow-2xl flex flex-col justify-between overflow-y-auto transition-transform duration-250 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Reading Customization Toolkit"
      >
        {/* Drawer Header with Prominent Fixed Back / Apply Arrow */}
        <div className="p-3.5 border-b border-border/60 flex items-center justify-between gap-2 sticky top-0 bg-card/95 backdrop-blur-md z-10 shadow-2xs">
          <button
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/70 bg-secondary/80 hover:bg-secondary text-foreground text-xs font-medium btn-press transition-colors shadow-2xs"
            title="Close toolkit & apply changes"
            aria-label="Close reading toolkit"
          >
            <ChevronRight className="h-4 w-4" />
            <span>Apply & Close</span>
          </button>

          <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            <span>Toolkit</span>
          </div>
        </div>

        {/* Drawer Body - Customizable Features */}
        <div className="p-4 flex-1 flex flex-col gap-4 text-xs">
          {/* Feature 1: Different Fonts (MS Word Style Dropdown) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="font-family-select"
                className="font-semibold text-foreground flex items-center gap-1.5"
              >
                <Type className="h-3.5 w-3.5 text-primary" />
                <span>Font Family</span>
              </label>
              <span className="text-[10px] font-mono text-muted-foreground">
                Word Style
              </span>
            </div>

            <div className="relative">
              <select
                id="font-family-select"
                value={fontFamily}
                onChange={(e) =>
                  onFontFamilyChange(e.target.value as ReaderFontFamily)
                }
                className="w-full px-3 py-2 rounded-lg border border-border/70 bg-card text-foreground font-medium text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer appearance-none pr-8 card-linear shadow-2xs"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} ({f.description})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Feature 2: Different Sizes (Numbers & Fluid Steppers) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-foreground flex items-center gap-1.5">
                <span className="text-xs font-mono font-bold">123</span>
                <span>Font Size</span>
              </label>
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-secondary text-foreground border border-border/40">
                {numericFontSize} px
              </span>
            </div>

            {/* Stepper Buttons & Range Slider */}
            <div className="flex items-center gap-2.5 p-2 rounded-xl border border-border/60 bg-muted/20">
              <button
                onClick={() => handleStepFontSize(-1)}
                className="p-1 rounded-md border border-border/70 bg-card hover:bg-secondary text-foreground btn-press"
                title="Decrease font size"
                aria-label="Decrease font size"
              >
                <Minus className="h-3 w-3" />
              </button>

              <input
                type="range"
                min="13"
                max="36"
                step="1"
                value={numericFontSize}
                onChange={(e) => handleSliderChange(Number(e.target.value))}
                className="flex-1 accent-primary h-1.5 bg-border rounded-lg cursor-pointer"
                aria-label="Font size in pixels"
              />

              <button
                onClick={() => handleStepFontSize(1)}
                className="p-1 rounded-md border border-border/70 bg-card hover:bg-secondary text-foreground btn-press"
                title="Increase font size"
                aria-label="Increase font size"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* Quick numeric presets */}
            <div className="flex items-center justify-between gap-1">
              {[14, 16, 18, 22, 26].map((sz) => (
                <button
                  key={sz}
                  onClick={() => handleSliderChange(sz)}
                  className={cn(
                    "flex-1 py-0.5 rounded-md text-[11px] font-mono btn-press border transition-all",
                    numericFontSize === sz
                      ? "bg-foreground text-background font-semibold border-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* Feature 3: Page Theme Color Changing (Compact Reduced-Size Swatches) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-foreground flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-primary" />
                <span>Page Theme</span>
              </label>
              <span className="text-[10px] font-mono text-muted-foreground capitalize">
                {theme}
              </span>
            </div>

            {/* Compact single-row swatch buttons */}
            <div className="flex items-center justify-between gap-1 p-1 bg-muted/40 rounded-xl border border-border/60">
              {THEME_OPTIONS.map((t) => {
                const isSelected = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onThemeChange(t.id)}
                    className={cn(
                      "h-8 flex-1 rounded-lg border flex items-center justify-center btn-press transition-all relative shadow-2xs",
                      isSelected
                        ? "ring-2 ring-primary border-primary scale-105 z-10"
                        : "border-border/60 hover:opacity-90"
                    )}
                    style={{ backgroundColor: t.bgHex }}
                    title={`${t.label} palette`}
                    aria-label={t.label}
                  >
                    {isSelected && (
                      <Check
                        className="h-3.5 w-3.5 drop-shadow-xs"
                        style={{ color: t.fgHex }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feature 4: Reading Spot Marker (Cache Info Persistence) */}
          <div className="flex flex-col gap-2 p-2.5 rounded-xl border border-border/60 bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-amber-500" />
                <span>Reading Spot Marker</span>
              </span>
              {savedReadingSpot && (
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                  {savedReadingSpot.scrollProgress}%
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {onSaveReadingSpot && (
                <button
                  onClick={onSaveReadingSpot}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-foreground text-background text-xs font-medium btn-press flex items-center justify-center gap-1 shadow-xs"
                  title="Mark your current spot in this article to local cache"
                >
                  <BookmarkCheck className="h-3.5 w-3.5" />
                  <span>Mark My Spot</span>
                </button>
              )}

              {savedReadingSpot && onJumpToReadingSpot && (
                <button
                  onClick={onJumpToReadingSpot}
                  className="py-1.5 px-2.5 rounded-lg border border-border/70 bg-card hover:bg-secondary text-foreground text-xs font-medium btn-press flex items-center gap-1 shadow-2xs"
                  title="Jump to saved reading spot"
                >
                  <CornerDownRight className="h-3.5 w-3.5 text-primary" />
                  <span>Resume</span>
                </button>
              )}
            </div>

            {savedReadingSpot && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                <span>Saved to cache info</span>
                {onClearReadingSpot && (
                  <button
                    onClick={onClearReadingSpot}
                    className="hover:text-destructive underline"
                  >
                    Clear spot
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Feature 5: Column Width / Page Spread */}
          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-foreground flex items-center gap-1.5">
              <Maximize2 className="h-3.5 w-3.5 text-primary" />
              <span>Page Spread (Width)</span>
            </label>

            <div className="flex items-center gap-1 p-0.5 bg-muted/40 rounded-lg border border-border/60">
              {(
                [
                  { id: "compact", label: "Narrow" },
                  { id: "default", label: "Standard" },
                  { id: "wide", label: "Spread Out" },
                ] as const
              ).map((w) => (
                <button
                  key={w.id}
                  onClick={() => onColumnWidthChange(w.id)}
                  className={cn(
                    "flex-1 py-1 text-[11px] rounded-md font-medium btn-press transition-all",
                    columnWidth === w.id
                      ? "bg-card text-foreground font-semibold border border-border/70 card-linear"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={`${w.label} page spread`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Feature 6: Line Spacing */}
          {onLineHeightChange && (
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-foreground">Line Height</label>
              <div className="flex items-center gap-1 p-0.5 bg-muted/40 rounded-lg border border-border/60">
                {[
                  { val: 1.6, label: "1.6" },
                  { val: 1.85, label: "1.85" },
                  { val: 2.2, label: "2.2" },
                ].map((lh) => (
                  <button
                    key={lh.val}
                    onClick={() => onLineHeightChange(lh.val)}
                    className={cn(
                      "flex-1 py-1 text-[11px] rounded-md font-mono btn-press transition-all",
                      Math.abs(lineHeight - lh.val) < 0.05
                        ? "bg-card text-foreground font-semibold border border-border/70 card-linear"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {lh.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions (Bookmark & Library) */}
          <div className="pt-2 border-t border-border/50 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={onToggleBookmark}
                className={cn(
                  "p-2 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 btn-press transition-all",
                  isBookmarked
                    ? "badge-amber font-semibold"
                    : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                <Bookmark
                  className={cn("h-3.5 w-3.5", isBookmarked && "fill-current")}
                />
                <span>{isBookmarked ? "Starred" : "Star"}</span>
              </button>

              {onShare && (
                <button
                  onClick={onShare}
                  className="p-2 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 text-xs font-medium inline-flex items-center justify-center gap-1.5 btn-press transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share</span>
                </button>
              )}
            </div>

            {onToggleLibraryDrawer && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onToggleLibraryDrawer();
                }}
                className="w-full p-2 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 text-foreground text-xs font-medium inline-flex items-center justify-center gap-1.5 btn-press transition-colors"
              >
                <List className="h-3.5 w-3.5 text-primary" />
                <span>Reading List Drawer</span>
              </button>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-border/60 bg-card/90 flex items-center justify-between text-xs text-muted-foreground">
          <Link
            href="/"
            className="inline-flex items-center gap-1 hover:text-foreground font-medium transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Timeline</span>
          </Link>
          <span className="text-[10px] font-mono text-muted-foreground/70">
            {Math.round(readingProgress)}% scrolled
          </span>
        </div>
      </div>
    </>
  );
}
