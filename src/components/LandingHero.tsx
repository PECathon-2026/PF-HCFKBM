"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck, Cpu, Sparkles, Feather } from "lucide-react";
import gsap from "gsap";
import { cn } from "@/lib/utils";

const PHRASES = [
  "Escape algorithmic noise. Read the small web.",
  "Curated engineering blogs and essays with zero tracking.",
  "Decentralized RSS & Atom feeds, offline-first in your browser.",
];

const GLYPHS = "01#%$*+!?/&@~^§░▒▓><[]{}";

export function LandingHero({ onStartReading }: { onStartReading?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [displayText, setDisplayText] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);

  // ─────────────────────────────────────────────────────────────
  // 1. HIGH-PERFORMANCE PROCEDURAL FLUID SHADER CANVAS
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener("resize", handleResize);

    let time = 0;
    const mouse = { x: width / 2, y: height / 2, targetX: width / 2, targetY: height / 2 };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
    };
    window.addEventListener("mousemove", handleMouseMove);

    const render = () => {
      time += 0.006;
      mouse.x += (mouse.targetX - mouse.x) * 0.04;
      mouse.y += (mouse.targetY - mouse.y) * 0.04;

      ctx.clearRect(0, 0, width, height);

      // Check current dark mode
      const isDark = document.documentElement.classList.contains("dark");

      // Multiple harmonic liquid waves
      const waves = [
        {
          frequency: 0.0018,
          amplitude: height * 0.22,
          speed: time * 1.2,
          color: isDark ? "rgba(45, 60, 90, 0.22)" : "rgba(220, 228, 240, 0.45)",
          blur: 40,
        },
        {
          frequency: 0.0025,
          amplitude: height * 0.18,
          speed: -time * 1.5,
          color: isDark ? "rgba(35, 75, 75, 0.18)" : "rgba(210, 235, 230, 0.35)",
          blur: 50,
        },
        {
          frequency: 0.003,
          amplitude: height * 0.14,
          speed: time * 0.9,
          color: isDark ? "rgba(70, 50, 95, 0.15)" : "rgba(235, 220, 245, 0.3)",
          blur: 60,
        },
      ];

      waves.forEach((wave) => {
        ctx.save();
        ctx.filter = `blur(${wave.blur}px)`;
        ctx.beginPath();
        ctx.moveTo(0, height);

        for (let x = 0; x <= width; x += 15) {
          const mouseDist = Math.hypot(x - mouse.x, height * 0.5 - mouse.y);
          const mouseDisplace = Math.sin(mouseDist * 0.01 - time * 2) * 18;

          const y =
            height * 0.52 +
            Math.sin(x * wave.frequency + wave.speed) * wave.amplitude +
            Math.cos(x * wave.frequency * 0.6 + wave.speed * 0.8) * (wave.amplitude * 0.5) +
            mouseDisplace;

          ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = wave.color;
        ctx.fill();
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 2. GLITCH / SCRAMBLED CHARACTER DECRYPT TYPEWRITER ENGINE
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let isCancelled = false;
    const targetPhrase = PHRASES[phraseIndex];
    let currentIndex = 0;
    let resolvedChars: string[] = [];

    const typeNextChar = () => {
      if (isCancelled) return;

      if (currentIndex < targetPhrase.length) {
        const charToResolve = targetPhrase[currentIndex];
        let glitchTicks = 0;
        const maxGlitchTicks = charToResolve === " " ? 0 : 3;

        const scrambleInterval = setInterval(() => {
          if (isCancelled) {
            clearInterval(scrambleInterval);
            return;
          }

          if (glitchTicks >= maxGlitchTicks) {
            clearInterval(scrambleInterval);
            resolvedChars[currentIndex] = charToResolve;
            setDisplayText(resolvedChars.join(""));
            currentIndex++;
            setTimeout(typeNextChar, charToResolve === " " ? 20 : 38);
          } else {
            const randomGlyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            resolvedChars[currentIndex] = randomGlyph;
            setDisplayText(resolvedChars.join(""));
            glitchTicks++;
          }
        }, 22);
      } else {
        // Hold full phrase for 5.5 seconds then cycle to next phrase
        setTimeout(() => {
          if (!isCancelled) {
            // Glitch backspace or cycle
            setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
          }
        }, 5500);
      }
    };

    setDisplayText("");
    resolvedChars = [];
    currentIndex = 0;
    const initialDelay = setTimeout(typeNextChar, 300);

    return () => {
      isCancelled = true;
      clearTimeout(initialDelay);
    };
  }, [phraseIndex]);

  // Entrance timeline animation with GSAP
  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".hero-fade", {
        opacity: 0,
        y: 20,
        duration: 0.8,
        stagger: 0.12,
        ease: "power3.out",
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleScrollToContent = () => {
    if (onStartReading) {
      onStartReading();
      return;
    }
    const target = document.getElementById("timeline-feed-anchor");
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollBy({ top: 480, behavior: "smooth" });
    }
  };

  return (
    <section
      ref={containerRef}
      className="relative w-full rounded-3xl border border-border/70 overflow-hidden bg-card/70 backdrop-blur-2xl shadow-xl p-8 sm:p-12 md:p-16 my-4 flex flex-col justify-between gap-10 select-none card-linear"
    >
      {/* Background Interactive Shader Wave Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-80 dark:opacity-60 z-0"
      />

      {/* Top Editorial Eyebrow */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 hero-fade">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/80 border border-border/60 text-[11px] font-medium text-foreground tracking-wide shadow-2xs">
          <Feather className="h-3.5 w-3.5 text-primary" />
          <span>Small Web Reader</span>
          <span className="text-border">•</span>
          <span className="text-muted-foreground">Version 2.0</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span>Zero Tracking & Accounts</span>
        </div>
      </div>

      {/* Main Headline & Glitch Decrypt Box */}
      <div className="relative z-10 flex flex-col gap-6 max-w-3xl my-2 hero-fade">
        <h1 className="font-serif text-3xl sm:text-5xl md:text-6xl font-medium tracking-tight text-foreground leading-[1.12]">
          OnlyDevs
        </h1>

        {/* Glitch Decrypt Terminal Output with | blinking cursor */}
        <div className="min-h-[5rem] sm:min-h-[4rem] flex items-baseline flex-wrap font-mono text-base sm:text-xl md:text-2xl text-foreground/90 leading-relaxed bg-muted/30 p-4 sm:p-5 rounded-2xl border border-border/50 backdrop-blur-sm shadow-inner">
          <span className="text-primary font-bold mr-2.5 shrink-0 select-none">
            $&gt;
          </span>
          <span className="font-semibold tracking-tight text-foreground">
            {displayText}
          </span>
          <span className="inline-block w-2.5 h-6 ml-1 bg-primary animate-pulse align-middle" />
        </div>

        <p className="font-serif text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">
          A calm broadsheet stream of independent technology publications, systems essays,
          and software engineering thinkers. Completely private, offline-first via IndexedDB,
          and streamed through an edge proxy.
        </p>
      </div>

      {/* CTA Button: Apple & Linear Nested Button-in-Button Architecture */}
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 pt-4 border-t border-border/40 hero-fade">
        <div className="flex items-center gap-3">
          {/* Double-Bezel Nested CTA Pill */}
          <div className="p-1 rounded-full bg-foreground/5 border border-border/70 shadow-sm">
            <button
              onClick={handleScrollToContent}
              type="button"
              className="group pl-6 pr-2 py-2 rounded-full bg-foreground text-background hover:bg-foreground/90 font-medium text-xs sm:text-sm tracking-tight btn-press inline-flex items-center gap-3 transition-all duration-200"
            >
              <span>Start Reading</span>
              <div className="w-8 h-8 rounded-full bg-background/15 flex items-center justify-center group-hover:translate-x-1 transition-transform duration-200">
                <ArrowRight className="h-4 w-4 text-background" />
              </div>
            </button>
          </div>

          <span className="text-xs text-muted-foreground font-mono hidden sm:inline-block">
            No signup required
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground/80">
          <span className="flex items-center gap-1.5">
            <Cpu className="h-3 w-3 text-primary" />
            <span>IndexedDB Cache</span>
          </span>
          <span className="text-border">•</span>
          <span>12 Live Feeds</span>
        </div>
      </div>
    </section>
  );
}
