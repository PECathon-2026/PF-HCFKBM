import { NextRequest, NextResponse } from "next/server";
import { validateUrlAgainstSSRF } from "@/routes/fetch";
import { isAllowedByRobotsTxt } from "@/middleware/robots";

export const dynamic = "force-dynamic";

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  "application/atom+xml",
  "application/rss+xml",
  "application/xml",
  "text/xml",
  "text/html",
];

function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.includes(mediaType) || mediaType.endsWith("+xml");
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("Upstream response exceeds the maximum allowed size");
  }

  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Upstream response exceeds the maximum allowed size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function validateTarget(url: string) {
  const ssrfResult = await validateUrlAgainstSSRF(url);
  if (!ssrfResult.valid) {
    return { allowed: false, response: NextResponse.json({ error: "SSRF check failed", code: "SSRF_BLOCKED" }, { status: 403 }) };
  }

  const robotsResult = await isAllowedByRobotsTxt(url);
  if (!robotsResult.allowed) {
    return { allowed: false, response: NextResponse.json({ error: "Blocked by robots.txt", code: "ROBOTS_TXT_DISALLOWED" }, { status: 403 }) };
  }

  return { allowed: true as const };
}

export async function GET(request: NextRequest) {
  const initialUrl = request.nextUrl.searchParams.get("url");

  if (!initialUrl) {
    return NextResponse.json(
      { error: "Query parameter 'url' is required", code: "MISSING_URL_PARAM" },
      { status: 400 }
    );
  }

  try {
    let currentUrl = initialUrl;
    let upstreamRes: Response | null = null;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      const validation = await validateTarget(currentUrl);
      if (!validation.allowed) return validation.response;

      const upstreamHeaders: HeadersInit = {
        "User-Agent": "OnlyDevs-WebReader/1.0",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html",
      };
      const ifNoneMatch = request.headers.get("if-none-match");
      const ifModifiedSince = request.headers.get("if-modified-since");
      if (ifNoneMatch) upstreamHeaders["If-None-Match"] = ifNoneMatch;
      if (ifModifiedSince) upstreamHeaders["If-Modified-Since"] = ifModifiedSince;

      upstreamRes = await fetch(currentUrl, {
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(10000),
        redirect: "manual",
      });

      if (![301, 302, 303, 307, 308].includes(upstreamRes.status)) break;
      const location = upstreamRes.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        return NextResponse.json({ error: "Too many upstream redirects", code: "REDIRECT_LIMIT" }, { status: 502 });
      }
      currentUrl = new URL(location, currentUrl).toString();
    }

    if (!upstreamRes) throw new Error("No upstream response");
    if (!isAllowedContentType(upstreamRes.headers.get("content-type"))) {
      return NextResponse.json({ error: "Upstream content type is not supported", code: "CONTENT_TYPE_BLOCKED" }, { status: 415 });
    }

    const body = await readBoundedBody(upstreamRes);
    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Content-Type", upstreamRes.headers.get("content-type") || "application/octet-stream");
    responseHeaders.set("Cache-Control", "no-store");
    const etag = upstreamRes.headers.get("etag");
    if (etag) responseHeaders.set("ETag", etag);
    const lastModified = upstreamRes.headers.get("last-modified");
    if (lastModified) responseHeaders.set("Last-Modified", lastModified);

    return new Response(body.buffer as ArrayBuffer, { status: upstreamRes.status, headers: responseHeaders });
  } catch {
    return NextResponse.json(
      { error: "Failed to proxy upstream request", code: "PROXY_ERROR" },
      { status: 502 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, If-None-Match, If-Modified-Since",
    },
  });
}
