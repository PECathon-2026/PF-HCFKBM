import { Router, Request, Response, NextFunction } from "express";
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";

export const fetchRouter = Router();

export interface FetchQueryParams {
  url?: string;
}

export interface FetchErrorResponse {
  error: string;
  code: string;
  details?: string;
}

/**
 * Checks if an IP address belongs to private or loopback subnets.
 * Covers:
 * - 127.0.0.0/8 (Loopback)
 * - 10.0.0.0/8 (Private Network)
 * - 172.16.0.0/12 (Private Network)
 * - 192.168.0.0/16 (Private Network)
 * - 169.254.0.0/16 (Link-local / Cloud Metadata)
 * - 0.0.0.0/8 (Current network)
 * - ::1 (IPv6 Loopback)
 * - fc00::/7 (IPv6 Unique Local)
 * - fe80::/10 (IPv6 Link-local)
 */
export function isPrivateOrLoopbackIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
      return true; // Malformed IPv4 -> treat as unsafe
    }

    const [b0, b1] = parts;

    // 127.0.0.0/8 (Loopback)
    if (b0 === 127) return true;
    // 10.0.0.0/8 (Private Class A)
    if (b0 === 10) return true;
    // 172.16.0.0/12 (Private Class B: 172.16.0.0 - 172.31.255.255)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
    // 192.168.0.0/16 (Private Class C)
    if (b0 === 192 && b1 === 168) return true;
    // 169.254.0.0/16 (Link-Local / AWS/GCP Metadata 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true;
    // 0.0.0.0/8 (Broadcast/Local)
    if (b0 === 0) return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // IPv6 loopback
    if (normalized === "::1" || normalized === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
    // IPv6 link-local (fe80::/10)
    if (normalized.startsWith("fe80:") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
    // IPv6 unique local (fc00::/7)
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

    return false;
  }

  return true; // Unknown IP format -> block by default
}

/**
 * SSRF validation stub:
 * Resolves the hostname and ensures resolved IP is not in private or loopback ranges.
 */
export async function validateUrlAgainstSSRF(rawUrl: string): Promise<{ valid: boolean; resolvedIp?: string; reason?: string }> {
  try {
    const parsed = new URL(rawUrl);

    // Protocol check: only http and https permitted
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, reason: `Disallowed protocol: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname;

    // Reject localhost aliases directly
    if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      return { valid: false, reason: "Localhost and internal hostnames are blocked" };
    }

    // Direct IP check
    if (net.isIP(hostname)) {
      if (isPrivateOrLoopbackIP(hostname)) {
        return { valid: false, reason: `Target IP ${hostname} is in private/loopback range` };
      }
      return { valid: true, resolvedIp: hostname };
    }

    // DNS lookup validation
    // TODO: Team members can enhance this with DNS pinning / custom agent to prevent DNS rebinding attacks
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateOrLoopbackIP(addr.address)) {
        return { valid: false, reason: `Resolved IP ${addr.address} is in private/loopback range` };
      }
    }

    return { valid: true, resolvedIp: addresses[0]?.address };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid URL or DNS resolution failed";
    return { valid: false, reason: message };
  }
}

/**
 * Basic GET route accepting `?url=`.
 * Pipes raw upstream response with CORS headers.
 */
fetchRouter.get("/", async (req: Request<unknown, unknown, unknown, FetchQueryParams>, res: Response, next: NextFunction): Promise<void> => {
  const targetUrl = req.query.url;

  if (!targetUrl || typeof targetUrl !== "string") {
    res.status(400).json({
      error: "Query parameter 'url' is required and must be a string",
      code: "MISSING_URL_PARAM",
    } satisfies FetchErrorResponse);
    return;
  }

  try {
    // 1. SSRF Check Stub
    const ssrfResult = await validateUrlAgainstSSRF(targetUrl);
    if (!ssrfResult.valid) {
      res.status(403).json({
        error: "SSRF check failed: target URL is not permitted",
        code: "SSRF_BLOCKED",
        details: ssrfResult.reason,
      } satisfies FetchErrorResponse);
      return;
    }

    // 2. Raw proxy pipe returning upstream response with CORS headers
    const parsedUrl = new URL(targetUrl);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const proxyReq = client.get(
      targetUrl,
      {
        headers: {
          "User-Agent": "OnlyDevs-WebReader-Proxy/1.0",
          Accept: "*/*",
        },
        timeout: 10000,
      },
      (upstreamRes) => {
        // Set standard CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

        // Forward content-type and status
        if (upstreamRes.headers["content-type"]) {
          res.setHeader("Content-Type", upstreamRes.headers["content-type"]);
        }
        res.status(upstreamRes.statusCode || 200);

        // Pipe upstream response stream directly to client
        upstreamRes.pipe(res);

        upstreamRes.on("error", (streamErr) => {
          // TODO: Log upstream streaming error to telemetry
          if (!res.headersSent) {
            res.status(502).json({
              error: "Upstream stream error occurred",
              code: "UPSTREAM_STREAM_ERROR",
              details: streamErr.message,
            } satisfies FetchErrorResponse);
          }
        });
      }
    );

    proxyReq.on("error", (reqErr) => {
      // TODO: Add retry logic or cache fallback for transient upstream network failures
      if (!res.headersSent) {
        res.status(502).json({
          error: "Failed to connect to upstream service",
          code: "UPSTREAM_FETCH_FAILED",
          details: reqErr.message,
        } satisfies FetchErrorResponse);
      }
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          error: "Upstream request timed out after 10000ms",
          code: "UPSTREAM_TIMEOUT",
        } satisfies FetchErrorResponse);
      }
    });
  } catch (error: unknown) {
    next(error);
  }
});
