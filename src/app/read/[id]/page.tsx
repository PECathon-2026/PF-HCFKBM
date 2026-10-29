"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bookmark, Share, ExternalLink, Type, SunMedium, Moon, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReaderProps {
  params: {
    id: string;
  };
}

export default function ReaderPage({ params }: ReaderProps) {
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg" | "xl">("base");
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [themeMode, setThemeMode] = useState<"dark" | "sepia" | "light">("dark");

  const fontSizes = {
    sm: "text-sm leading-relaxed",
    base: "text-base leading-relaxed",
    lg: "text-lg leading-loose",
    xl: "text-xl leading-loose",
  };

  const themeClasses = {
    dark: "bg-background text-foreground",
    sepia: "bg-[#fbf0d9] text-[#433422]",
    light: "bg-white text-neutral-900",
  };

  return (
    <div className={cn("min-h-screen flex flex-col transition-colors duration-200", themeClasses[themeMode])}>
      {/* Top Reader Toolbar */}
      <header className="sticky top-0 z-30 w-full border-b border-border/60 bg-background/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent btn-press inline-flex items-center gap-1.5 text-xs font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Timeline</span>
          </Link>
        </div>

        {/* Reader Customization Controls */}
        <div className="flex items-center gap-2">
          {/* Font Size Adjuster */}
          <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg border border-border/60 text-xs">
            <button
              onClick={() => setFontSize("sm")}
              className={cn("px-2 py-0.5 rounded btn-press font-serif", fontSize === "sm" && "bg-card shadow-xs font-bold")}
            >
              A-
            </button>
            <button
              onClick={() => setFontSize("base")}
              className={cn("px-2 py-0.5 rounded btn-press font-serif", fontSize === "base" && "bg-card shadow-xs font-bold")}
            >
              A
            </button>
            <button
              onClick={() => setFontSize("lg")}
              className={cn("px-2 py-0.5 rounded btn-press font-serif", fontSize === "lg" && "bg-card shadow-xs font-bold")}
            >
              A+
            </button>
          </div>

          {/* Theme Mode Toggle */}
          <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg border border-border/60 text-xs">
            <button
              onClick={() => setThemeMode("dark")}
              className={cn("px-2 py-1 rounded btn-press", themeMode === "dark" && "bg-card shadow-xs font-bold")}
              title="Dark Mode"
            >
              <Moon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setThemeMode("sepia")}
              className={cn("px-2 py-1 rounded btn-press font-serif", themeMode === "sepia" && "bg-card shadow-xs font-bold")}
              title="Sepia Mode"
            >
              Sepia
            </button>
            <button
              onClick={() => setThemeMode("light")}
              className={cn("px-2 py-1 rounded btn-press", themeMode === "light" && "bg-card shadow-xs font-bold")}
              title="Light Mode"
            >
              <SunMedium className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Bookmark Button */}
          <button
            onClick={() => setIsBookmarked(!isBookmarked)}
            className={cn(
              "p-2 rounded-lg border border-border hover:bg-accent btn-press text-muted-foreground",
              isBookmarked && "text-amber-500 fill-amber-500"
            )}
            title="Bookmark Article"
          >
            <Bookmark className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Distraction-Free Reader Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12 flex flex-col gap-8">
        {/* Article Metadata Header */}
        <div className="flex flex-col gap-3 pb-6 border-b border-border/60">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-primary px-2 py-0.5 rounded bg-primary/10">
              Changelog Weekly
            </span>
            <span>•</span>
            <span>Software Engineering</span>
            <span>•</span>
            <span>6 min read</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
            Rust in Linux: What 2 Years of Production Kernel Drivers Taught Us
          </h1>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>By <strong className="text-foreground">Elena Rostova</strong> — Published October 28, 2026</span>
            <a
              href="https://example.com/original-article"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline text-primary"
            >
              <span>Original Source</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Article Body */}
        <article className={cn("flex flex-col gap-6 text-foreground/90 font-serif", fontSizes[fontSize])}>
          <p className="text-lg leading-relaxed font-sans text-muted-foreground border-l-2 border-primary pl-4 my-2">
            Two years after the Rust infrastructure was first merged into the Linux kernel tree, production drivers are running in real-world data centers. Here is what we discovered regarding memory safety overhead, unsafe FFI boundaries, and developer velocity.
          </p>

          <p>
            When discussions around integrating Rust into the Linux kernel first gained mainstream traction, skeptics raised valid concerns about binary size inflation, compiler version pinning, and the cognitive overhead of mapping kernel C idioms to Rust lifetimes.
          </p>

          <h2 className="text-2xl font-sans font-bold tracking-tight text-foreground mt-4">
            Zero-Cost Abstractions at the FFI Boundary
          </h2>

          <p>
            The hardest challenge proved to be defining sound abstractions over existing Linux subsystem lock hierarchies. Subsystems like NVMe and DRM rely heavily on RCU (Read-Copy Update) mechanisms and spinlocks whose semantics do not map 1:1 to standard Rust mutexes.
          </p>

          <p>
            By designing thin wrapper crates that expose RAII-guarded lock handles, we eliminated an entire class of lock-drop oversights without adding a single CPU cycle to hot dispatch paths. In micro-benchmarks comparing the C NVMe driver with the Rust implementation, I/O latency was within 0.4% margin of error across 10 million random 4K read operations.
          </p>

          <h2 className="text-2xl font-sans font-bold tracking-tight text-foreground mt-4">
            Defensive Edge Extraction
          </h2>

          <p>
            When reading articles in OnlyDevs, DOMPurify and Readability strip ads, tracking telemetry, and inline style clutter, providing this clean reader canvas directly from IndexedDB.
          </p>
        </article>

        {/* Footer info */}
        <div className="mt-12 pt-6 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span>Finished reading article ID: {params.id}</span>
          </div>
          <Link href="/" className="hover:underline text-primary">
            Return to Timeline →
          </Link>
        </div>
      </main>
    </div>
  );
}
