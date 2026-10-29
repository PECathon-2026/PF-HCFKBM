import { NextRequest, NextResponse } from "next/server";
import { validateUrlAgainstSSRF } from "@/routes/fetch";
import { isAllowedByRobotsTxt } from "@/middleware/robots";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Query parameter 'url' is required", code: "MISSING_URL_PARAM" },
      { status: 400 }
    );
  }

  try {
    // 1. SSRF Validation
    const ssrfResult = await validateUrlAgainstSSRF(url);
    if (!ssrfResult.valid) {
      return NextResponse.json(
        {
          error: "SSRF check failed: target URL is not permitted",
          code: "SSRF_BLOCKED",
          details: ssrfResult.reason,
        },
        { status: 403 }
      );
    }

    // 2. Robots.txt Politeness Check
    const robotsResult = await isAllowedByRobotsTxt(url);
    if (!robotsResult.allowed) {
      return NextResponse.json(
        {
          error: "Upstream access blocked by robots.txt policy",
          code: "ROBOTS_TXT_DISALLOWED",
          details: robotsResult.reason,
        },
        { status: 403 }
      );
    }

    // 3. Forward conditional caching headers
    const upstreamHeaders: HeadersInit = {
      "User-Agent": "OnlyDevs-WebReader-Proxy/1.0 (+https://github.com/OnlyDevs)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*",
    };

    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch) {
      upstreamHeaders["If-None-Match"] = ifNoneMatch;
    }

    const ifModifiedSince = request.headers.get("if-modified-since");
    if (ifModifiedSince) {
      upstreamHeaders["If-Modified-Since"] = ifModifiedSince;
    }

    // 4. Fetch upstream
    const upstreamRes = await fetch(url, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(10000),
    });

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    responseHeaders.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, If-None-Match, If-Modified-Since"
    );

    const contentType = upstreamRes.headers.get("content-type");
    if (contentType) responseHeaders.set("Content-Type", contentType);

    const etag = upstreamRes.headers.get("etag");
    if (etag) responseHeaders.set("ETag", etag);

    const lastModified = upstreamRes.headers.get("last-modified");
    if (lastModified) responseHeaders.set("Last-Modified", lastModified);

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "Failed to proxy upstream request",
        code: "PROXY_ERROR",
        details: message,
      },
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
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, If-None-Match, If-Modified-Since",
    },
  });
}
