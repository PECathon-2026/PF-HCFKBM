"use client";

import { useState, useMemo } from "react";
import { Sparkles, ZoomIn, ZoomOut, RotateCcw, Filter, Info, Share2, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphNode, GraphEdge } from "@/lib/api";

interface VisualizerNode extends GraphNode {
  x: number;
  y: number;
  color?: string;
  radius?: number;
}

const DEFAULT_NODES: VisualizerNode[] = [
  { id: "changelog", label: "Changelog Weekly", type: "feed", x: 220, y: 160 },
  { id: "vercel", label: "Vercel Engineering", type: "feed", x: 440, y: 130 },
  { id: "simon", label: "Simon Willison", type: "feed", x: 620, y: 220 },
  { id: "hn", label: "Hacker News", type: "feed", x: 380, y: 270 },
  { id: "rust", label: "Rust & Systems", type: "category", x: 200, y: 320 },
  { id: "frontend", label: "Frontend & UI", type: "category", x: 500, y: 350 },
  { id: "ai", label: "AI & Agents", type: "category", x: 680, y: 120 },
  { id: "latentspace", label: "Latent Space", type: "feed", x: 700, y: 300 },
];

const DEFAULT_EDGES: GraphEdge[] = [
  { source: "changelog", target: "rust", weight: 3, relation: "covers" },
  { source: "changelog", target: "hn", weight: 4, relation: "co-read" },
  { source: "vercel", target: "frontend", weight: 5, relation: "covers" },
  { source: "vercel", target: "hn", weight: 3, relation: "co-read" },
  { source: "simon", target: "ai", weight: 5, relation: "author" },
  { source: "simon", target: "hn", weight: 4, relation: "co-read" },
  { source: "latentspace", target: "ai", weight: 4, relation: "covers" },
  { source: "latentspace", target: "simon", weight: 3, relation: "co-read" },
  { source: "changelog", target: "vercel", weight: 2, relation: "co-read" },
];

interface FeedGraphVisualizerProps {
  initialNodes?: GraphNode[];
  initialEdges?: GraphEdge[];
  className?: string;
}

export function FeedGraphVisualizer({
  initialNodes,
  initialEdges,
  className,
}: FeedGraphVisualizerProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "feed" | "category" | "author">("all");
  const [zoomLevel, setZoomLevel] = useState(1);

  // Position nodes if not already positioned
  const nodes: VisualizerNode[] = useMemo(() => {
    if (!initialNodes || initialNodes.length === 0) {
      return DEFAULT_NODES;
    }
    const width = 800;
    const height = 450;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 170;

    return initialNodes.map((n, i) => {
      const angle = (i / initialNodes.length) * 2 * Math.PI;
      return {
        ...n,
        x: centerX + radius * Math.cos(angle) + (Math.sin(i) * 30),
        y: centerY + radius * Math.sin(angle) + (Math.cos(i) * 30),
      };
    });
  }, [initialNodes]);

  const edges: GraphEdge[] = useMemo(() => {
    return initialEdges && initialEdges.length > 0 ? initialEdges : DEFAULT_EDGES;
  }, [initialEdges]);

  // Feed nodes available for "Blogs Like This" dropdown
  const feedNodes = useMemo(() => {
    return nodes.filter((n) => n.type === "feed");
  }, [nodes]);

  // Map of connected node IDs for selection highlight
  const connectedNodeIds = useMemo(() => {
    const targetId = selectedNodeId || hoveredNodeId;
    if (!targetId) return new Set<string>();

    const set = new Set<string>([targetId]);
    edges.forEach((e) => {
      if (e.source === targetId) set.add(e.target);
      if (e.target === targetId) set.add(e.source);
    });
    return set;
  }, [selectedNodeId, hoveredNodeId, edges]);

  const filteredNodes = useMemo(() => {
    if (filterType === "all") return nodes;
    return nodes.filter((n) => n.type === filterType);
  }, [nodes, filterType]);

  const activeNode = nodes.find((n) => n.id === (hoveredNodeId || selectedNodeId));

  const getNodeColor = (type: string, isHighlighted: boolean, isDimmed: boolean) => {
    if (isDimmed) return "opacity-25";

    switch (type) {
      case "feed":
        return isHighlighted ? "fill-primary stroke-foreground" : "fill-primary/80 stroke-primary/30";
      case "category":
        return isHighlighted ? "fill-emerald-500 stroke-foreground" : "fill-emerald-500/80 stroke-emerald-500/30";
      case "author":
        return isHighlighted ? "fill-amber-500 stroke-foreground" : "fill-amber-500/80 stroke-amber-500/30";
      default:
        return "fill-primary";
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3.5 rounded-xl border border-border/80 bg-card/90 card-linear p-5 relative overflow-hidden",
        className
      )}
    >
      {/* Top Header / Visualizer Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Feed Co-occurrence Network
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Mapping shared topics, reader clusters, and co-subscription links.
            </p>
          </div>
        </div>

        {/* Filter Pills & Blogs Like This Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* "Blogs Like This" Contextual Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] text-muted-foreground hidden sm:inline">Blogs like:</span>
            <select
              value={selectedNodeId || ""}
              onChange={(e) => setSelectedNodeId(e.target.value || null)}
              className="px-2.5 py-1 text-xs rounded-lg border border-border/70 bg-card text-foreground focus:outline-none"
            >
              <option value="">Select publication...</option>
              {feedNodes.map((fn) => (
                <option key={fn.id} value={fn.id}>
                  {fn.label}
                </option>
              ))}
            </select>
          </div>

          {(
            [
              { id: "all", label: "All" },
              { id: "feed", label: "Feeds" },
              { id: "category", label: "Clusters" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md btn-press transition-colors",
                filterType === tab.id
                  ? "bg-secondary text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-border/60">
            <button
              onClick={() => setZoomLevel((z) => Math.min(z + 0.15, 1.6))}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 btn-press"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.max(z - 0.15, 0.7))}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 btn-press"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            {(selectedNodeId || zoomLevel !== 1) && (
              <button
                onClick={() => {
                  setSelectedNodeId(null);
                  setZoomLevel(1);
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 btn-press"
                title="Reset view"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="w-full h-[400px] relative rounded-xl bg-background/50 border border-border/40 overflow-hidden flex items-center justify-center select-none">
        {/* Subtle grid pattern background */}
        <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none">
          <defs>
            <pattern id="graph-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" className="fill-foreground" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#graph-grid)" />
        </svg>

        <svg
          viewBox="0 0 900 450"
          className="w-full h-full cursor-grab active:cursor-grabbing transition-transform duration-200"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {/* Connecting Edges */}
          {edges.map((edge, idx) => {
            const sourceNode = nodes.find((n) => n.id === edge.source);
            const targetNode = nodes.find((n) => n.id === edge.target);

            if (!sourceNode || !targetNode) return null;

            const isHighlighted =
              connectedNodeIds.size > 0 &&
              connectedNodeIds.has(edge.source) &&
              connectedNodeIds.has(edge.target);
            const isDimmed = connectedNodeIds.size > 0 && !isHighlighted;

            return (
              <line
                key={`edge-${idx}`}
                x1={sourceNode.x}
                y1={sourceNode.y}
                x2={targetNode.x}
                y2={targetNode.y}
                stroke={isHighlighted ? "currentColor" : "currentColor"}
                strokeWidth={isHighlighted ? 2.2 : (edge.weight ?? 1.5)}
                strokeDasharray={edge.relation === "co-read" ? "4 3" : undefined}
                className={cn(
                  "transition-all duration-200",
                  isHighlighted
                    ? "text-primary opacity-90"
                    : isDimmed
                    ? "text-muted-foreground/15 opacity-20"
                    : "text-muted-foreground/35 opacity-40"
                )}
              />
            );
          })}

          {/* Nodes */}
          {filteredNodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isHovered = hoveredNodeId === node.id;
            const isHighlighted = isSelected || isHovered || connectedNodeIds.has(node.id);
            const isDimmed = connectedNodeIds.size > 0 && !connectedNodeIds.has(node.id);

            const isCategory = node.type === "category";
            const radius = isCategory ? 18 : 14;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                onClick={() =>
                  setSelectedNodeId(selectedNodeId === node.id ? null : node.id)
                }
              >
                {/* Outer halo on highlight */}
                {isHighlighted && (
                  <circle
                    r={radius + 6}
                    className="fill-primary/10 transition-all duration-200"
                  />
                )}

                {/* Main Node Circle */}
                <circle
                  r={radius}
                  strokeWidth={2}
                  className={cn(
                    "transition-all duration-150",
                    getNodeColor(node.type, isHighlighted, isDimmed)
                  )}
                />

                {/* Node Label with crisp text halo */}
                <text
                  dy={radius + 14}
                  textAnchor="middle"
                  stroke="hsl(var(--background))"
                  strokeWidth="3.5"
                  paintOrder="stroke fill"
                  strokeLinejoin="round"
                  className={cn(
                    "text-[11px] font-medium pointer-events-none transition-all duration-150",
                    isDimmed
                      ? "fill-muted-foreground/30 opacity-40"
                      : isHighlighted
                      ? "fill-foreground font-semibold"
                      : "fill-muted-foreground"
                  )}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected/Hovered Node Tooltip Banner */}
        {activeNode && (
          <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:max-w-xs p-3.5 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md shadow-lg flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary mt-0.5 shrink-0">
              <Info className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-0.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {activeNode.label}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded uppercase bg-secondary text-muted-foreground">
                  {activeNode.type}
                </span>
              </div>
              <span className="text-muted-foreground text-[11px]">
                {connectedNodeIds.size - 1} connected publications & topics. Readers of this blog frequently co-subscribe to the highlighted cluster.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Legend Footer */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span>Feeds & Publications</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>Topic Clusters</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-muted-foreground/60" />
            <span>Co-subscription affinity</span>
          </div>
        </div>

        <span>Click any node to isolate neighborhood</span>
      </div>
    </div>
  );
}
