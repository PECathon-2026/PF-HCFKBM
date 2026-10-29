import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fetchRouter } from "./routes/fetch";
import { discoveryRouter } from "./routes/discovery";
import { runMigrations } from "./db/turso";
import { seedTursoIfEmpty } from "./db/seed_turso";
import { rateLimitMiddleware } from "./middleware/rateLimit";

dotenv.config();

export const app = express();
const port = process.env.PORT || 3000;

// Security & utility middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(rateLimitMiddleware);

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Mounted Routes
// 1. Fetch proxy route: GET /fetch?url=...
app.use("/fetch", fetchRouter);

// 2. Discovery routes:
// POST /api/discovery/submit
// GET  /api/discovery/recommendations
// GET  /api/discovery/popular
// GET  /api/discovery/graph
app.use("/api/discovery", discoveryRouter);

// Global Error Handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[Unhandled Server Error]:", err);
  res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    details: process.env.NODE_ENV === "development" ? message : undefined,
  });
});

// Server bootstrap with automated DB migration
export async function startServer() {
  try {
    console.log("[Bootstrap] Initializing database tables...");
    const migrationResult = await runMigrations();
    console.log(`[Bootstrap] Database ready. Tables: ${migrationResult.appliedTables.join(", ")}`);

    // Auto-seed discovery dataset on initial setup
    await seedTursoIfEmpty();

    return app.listen(port, () => {
      console.log(`[Server] OnlyDevs lightweight server running on port ${port}`);
    });
  } catch (error) {
    console.error("[Bootstrap Error] Failed to start server:", error);
    process.exit(1);
  }
}

// Only auto-start if executed directly
if (process.env.NODE_ENV !== "test") {
  startServer();
}
