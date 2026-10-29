"use client";

import { useEffect, useState, useCallback } from "react";
import { Sun, Moon, Sunrise, Sunset, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThemeMode = "light" | "auto" | "dark";

interface ThemeToggleProps {
  className?: string;
  showLabels?: boolean;
}

export function ThemeToggle({ className, showLabels = false }: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("auto");
  const [isNightTime, setIsNightTime] = useState(false);
  const [currentHourText, setCurrentHourText] = useState("");

  // Determine if current local time is night (6 PM to 6 AM)
  const checkDayNight = useCallback(() => {
    const now = new Date();
    const hours = now.getHours();
    const isNight = hours < 6 || hours >= 18;
    setIsNightTime(isNight);

    // Format readable hour (e.g., "7 PM")
    const formattedHour = now.toLocaleTimeString([], {
      hour: "numeric",
      hour12: true,
    });
    setCurrentHourText(formattedHour);

    return isNight;
  }, []);

  // Apply theme to DOM
  const applyTheme = useCallback((mode: ThemeMode, isNight: boolean) => {
    const root = document.documentElement;
    if (mode === "dark") {
      root.classList.add("dark");
    } else if (mode === "light") {
      root.classList.remove("dark");
    } else {
      // Auto mode: dynamic circadian rhythm
      if (isNight) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    const stored = (localStorage.getItem("theme") as ThemeMode) || "auto";
    const validMode: ThemeMode =
      stored === "light" || stored === "dark" || stored === "auto"
        ? stored
        : "auto";

    setThemeMode(validMode);
    const night = checkDayNight();
    applyTheme(validMode, night);

    // Dynamic real-time interval: update day/night transition in real time
    const interval = setInterval(() => {
      const currentNight = checkDayNight();
      const currentMode =
        (localStorage.getItem("theme") as ThemeMode) || "auto";
      if (currentMode === "auto") {
        applyTheme("auto", currentNight);
      }
    }, 30000); // Check every 30 seconds

    // Listen for theme sync events across components
    const handleStorageChange = () => {
      const stored = (localStorage.getItem("theme") as ThemeMode) || "auto";
      if (stored === "light" || stored === "dark" || stored === "auto") {
        setThemeMode(stored);
        const night = checkDayNight();
        applyTheme(stored, night);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("themechange", handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("themechange", handleStorageChange);
    };
  }, [checkDayNight, applyTheme]);

  const selectMode = (mode: ThemeMode) => {
    setThemeMode(mode);
    localStorage.setItem("theme", mode);
    const night = checkDayNight();
    applyTheme(mode, night);
    window.dispatchEvent(new Event("themechange"));
  };

  if (!mounted) {
    return (
      <div
        className={cn(
          "h-8 w-24 rounded-lg bg-muted/40 border border-border/40",
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center p-0.5 rounded-lg border border-border/60 bg-muted/50 text-xs shadow-xs transition-colors",
        className
      )}
      role="group"
      aria-label="Theme selector"
    >
      {/* Light Mode */}
      <button
        onClick={() => selectMode("light")}
        className={cn(
          "p-1.5 rounded-md btn-press flex items-center gap-1 transition-all",
          themeMode === "light"
            ? "bg-card text-amber-500 font-semibold border border-border/60 card-linear"
            : "text-muted-foreground hover:text-foreground"
        )}
        title="Light Mode (Serene daytime canvas)"
        aria-label="Light mode"
      >
        <Sun className="h-3.5 w-3.5" />
        {showLabels && <span className="text-[11px]">Light</span>}
      </button>

      {/* Auto Day/Night Cycle Mode */}
      <button
        onClick={() => selectMode("auto")}
        className={cn(
          "px-2 py-1 rounded-md btn-press flex items-center gap-1.5 transition-all",
          themeMode === "auto"
            ? "bg-card text-foreground font-semibold border border-border/60 card-linear"
            : "text-muted-foreground hover:text-foreground"
        )}
        title={`Auto Circadian Mode (Real-time daylight transition • Currently ${currentHourText})`}
        aria-label={`Auto day-night cycle, currently ${isNightTime ? "night" : "day"}`}
      >
        {isNightTime ? (
          <Sunset className="h-3.5 w-3.5 text-indigo-400" />
        ) : (
          <Sunrise className="h-3.5 w-3.5 text-amber-500" />
        )}
        <span className="text-[11px] hidden sm:inline tracking-tight font-medium">
          Auto
        </span>
      </button>

      {/* Dark Mode */}
      <button
        onClick={() => selectMode("dark")}
        className={cn(
          "p-1.5 rounded-md btn-press flex items-center gap-1 transition-all",
          themeMode === "dark"
            ? "bg-card text-sky-400 font-semibold border border-border/60 card-linear"
            : "text-muted-foreground hover:text-foreground"
        )}
        title="Dark Mode (Deep quiet canvas: hsl(224, 71%, 4%))"
        aria-label="Dark mode"
      >
        <Moon className="h-3.5 w-3.5" />
        {showLabels && <span className="text-[11px]">Dark</span>}
      </button>
    </div>
  );
}
