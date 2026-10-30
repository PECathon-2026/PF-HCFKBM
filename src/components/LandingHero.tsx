"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck, Cpu, Feather } from "lucide-react";
import gsap from "gsap";

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
  // 1. VIBRANT HIGH-PERFORMANCE PROCEDURAL FLUID SHADER CANVAS
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const setCanvasDimensions = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    setCanvasDimensions();
    window.addEventListener("resize", setCanvasDimensions);

    let time = 0;
    const mouse = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        mouse.targetX = (e.clientX - rect.left) / rect.width;
        mouse.targetY = (e.clientY - rect.top) / rect.height;
      }
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Dynamic fluid shader orbs with distinct chromatic paths
    const orbs = [
      {
        baseX: 0.25,
        baseY: 0.35,
        radius: 0.65,
        speedX: 0.0009,
        speedY: 0.0011,
        colorDark: "rgba(99, 102, 241, 0.45)", // Indigo / Violet
        colorLight: "rgba(99, 102, 241, 0.32)",
      },
      {
        baseX: 0.75,
        baseY: 0.3,
        radius: 0.6,
        speedX: -0.0012,
        speedY: 0.0008,
        colorDark: "rgba(16, 185, 129, 0.42)", // Emerald / Teal
        colorLight: "rgba(16, 185, 129, 0.3)",
      },
      {
        baseX: 0.45,
        baseY: 0.75,
        radius: 0.7,
        speedX: 0.001,
        speedY: -0.0013,
        colorDark: "rgba(56, 189, 248, 0.4)", // Electric Sky Cyan
        colorLight: "rgba(56, 189, 248, 0.28)",
      },
      {
        baseX: 0.85,
        baseY: 0.8,
        radius: 0.5,
        speedX: -0.0007,
        speedY: -0.0009,
        colorDark: "rgba(236, 72, 153, 0.32)", // Pink / Rose
        colorLight: "rgba(236, 72, 153, 0.22)",
      },
      {
        baseX: 0.1,
        baseY: 0.85,
        radius: 0.55,
        speedX: 0.0008,
        speedY: 0.001,
        colorDark: "rgba(245, 158, 11, 0.3)", // Amber glow
        colorLight: "rgba(245, 158, 11, 0.2)",
      },
    ];

    const render = () => {
      time += 1;
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      if (w === 0 || h === 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      const isDark = document.documentElement.classList.contains("dark");

      // Set blending mode for luminous, glowing liquid look
      ctx.globalCompositeOperation = isDark ? "screen" : "multiply";

      orbs.forEach((orb, i) => {
        // Lissajous curve movement
        const offsetX = Math.sin(time * orb.speedX + i * 1.5) * 0.18 + (mouse.x - 0.5) * 0.12;
        const offsetY = Math.cos(time * orb.speedY + i * 2.1) * 0.18 + (mouse.y - 0.5) * 0.12;

        const cx = Math.max(0, Math.min(1, orb.baseX + offsetX)) * w;
        const cy = Math.max(0, Math.min(1, orb.baseY + offsetY)) * h;
        const radius = orb.radius * Math.max(w, h);

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        const color = isDark ? orb.colorDark : orb.colorLight;

        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, color.replace(/[\d.]+\)$/, "0.15)"));
        gradient.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Reset composite operation
      ctx.globalCompositeOperation = "source-over";

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", setCanvasDimensions);
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
            setTimeout(typeNextChar, charToResolve === " " ? 20 : 36);
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
      className="relative w-full rounded-3xl border border-border/70 overflow-hidden shadow-2xl p-8 sm:p-12 md:p-16 my-4 flex flex-col justify-between gap-10 select-none bg-background/60 backdrop-blur-2xl"
    >
      {/* Dynamic Animated Ambient CSS Mesh Fallback for Instant Radiance */}
      <div className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-50 bg-[radial-gradient(ellipse_80%_80%_at_20%_-20%,rgba(99,102,241,0.35),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_20%_-20%,rgba(99,102,241,0.45),rgba(0,0,0,0))]" />
      <div className="absolute inset-0 pointer-events-none opacity-30 dark:opacity-40 bg-[radial-gradient(ellipse_70%_70%_at_80%_120%,rgba(16,185,129,0.3),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_70%_70%_at_80%_120%,rgba(16,185,129,0.38),rgba(0,0,0,0))]" />

      {/* Luminous Interactive WebGL/Canvas Shader Layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* Top Editorial Eyebrow */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 hero-fade">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card/85 backdrop-blur-md border border-border/80 text-[11px] font-medium text-foreground tracking-wide shadow-xs">
          <Feather className="h-3.5 w-3.5 text-primary" />
          <span>Small Web Reader</span>
          <span className="text-border">•</span>
          <span className="text-muted-foreground">Version 2.0</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-foreground/80 font-mono bg-card/75 backdrop-blur-md px-3 py-1 rounded-full border border-border/70 shadow-2xs">
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
        <div className="min-h-[5.5rem] sm:min-h-[4.5rem] flex items-baseline flex-wrap font-mono text-base sm:text-xl md:text-2xl text-foreground leading-relaxed bg-card/80 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-border/70 shadow-lg">
          <span className="text-primary font-bold mr-2.5 shrink-0 select-none">
            $&gt;
          </span>
          <span className="font-semibold tracking-tight text-foreground">
            {displayText}
          </span>
          <span className="inline-block w-2.5 h-6 ml-1 bg-primary animate-pulse align-middle" />
        </div>

        <p className="font-serif text-sm sm:text-base text-foreground/80 leading-relaxed max-w-2xl bg-card/40 backdrop-blur-xs p-3 rounded-xl border border-border/30">
          A calm broadsheet stream of independent technology publications, systems essays,
          and software engineering thinkers. Completely private, offline-first via IndexedDB,
          and streamed through an edge proxy.
        </p>
      </div>

      {/* CTA Button: Apple & Linear Nested Button-in-Button Architecture */}
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 pt-4 border-t border-border/50 hero-fade">
        <div className="flex items-center gap-3">
          {/* Double-Bezel Nested CTA Pill */}
          <div className="p-1.5 rounded-full bg-card/80 backdrop-blur-md border border-border/90 shadow-md">
            <button
              onClick={handleScrollToContent}
              type="button"
              className="group pl-6 pr-2 py-2 rounded-full bg-foreground text-background hover:bg-foreground/90 font-medium text-xs sm:text-sm tracking-tight btn-press inline-flex items-center gap-3 transition-all duration-200 shadow-sm"
            >
              <span>Start Reading</span>
              <div className="w-8 h-8 rounded-full bg-background/20 flex items-center justify-center group-hover:translate-x-1.5 transition-transform duration-200">
                <ArrowRight className="h-4 w-4 text-background" />
              </div>
            </button>
          </div>

          <span className="text-xs text-muted-foreground font-mono hidden sm:inline-block">
            No signup required
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground bg-card/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-border/60">
          <span className="flex items-center gap-1.5 text-foreground/80">
            <Cpu className="h-3.5 w-3.5 text-primary" />
            <span>IndexedDB Cache</span>
          </span>
          <span className="text-border">•</span>
          <span>12 Live Feeds</span>
        </div>
      </div>
    </section>
  );
}
