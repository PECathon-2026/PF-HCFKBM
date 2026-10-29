Skills: backend-security-coder, safe-refactor, surgical-patch, code-review-and-quality

# Task 2: Frontend Feed Parsing, Content Sanitization & Extraction Engine

## Objective
Build all browser-side feed ingestion, autodiscovery, full-text extraction, and HTML sanitization modules for the Small Web Reader. Ensure robust handling of malformed XML, dead feeds, tracking scripts, and stored XSS vectors.

---

## 🔒 Strict File Ownership (NO CONFLICTS)
You are **exclusively responsible** for the following files. Do NOT touch any files outside this list:
- `src/lib/parser.ts`
- `src/lib/sanitizer.ts`
- `src/lib/autodiscover.ts`
- `src/lib/opml.ts`

---

## Requirements from Problem Statement (`referenceproject.md`)

### 1. Robust RSS & Atom Parser (`src/lib/parser.ts`)
- Parse RSS 0.9x, 2.0, and Atom 1.0 XML payloads in the browser using `DOMParser`.
- Normalize feed items into a unified TypeScript interface:
  ```ts
  export interface ParsedItem {
    id: string; // guid or link
    title: string;
    url: string;
    publishedAt: number; // Unix timestamp
    author?: string;
    summary?: string;
    content?: string;
  }
  ```
- **Resilience**: Handle unclosed tags, mismatched namespaces (e.g., `content:encoded`, `dc:creator`), and entity traps without throwing uncaught exceptions.
- Provide descriptive error types (`MALFORMED_XML`, `UNSUPPORTED_FORMAT`, `EMPTY_FEED`) for graceful degradation in the UI.

### 2. Feed Autodiscovery Engine (`src/lib/autodiscover.ts`)
- Given any arbitrary blog URL (e.g., `https://overreacted.io`), discover its feed:
  1. Inspect HTML `<head>` for `<link rel="alternate" type="application/rss+xml">`, `application/atom+xml`, and `application/feed+json`.
  2. If link tags are absent, test common feed paths via proxy: `/feed`, `/rss.xml`, `/atom.xml`, `/feed.xml`, `/index.xml`.
- Resolve relative feed URLs against the base URL.
- Support blogroll discovery bonus: extract outgoing blog links (`<link rel="blogroll">` or curated blogroll lists) to feed the discovery graph.

### 3. Full-Text Article Extraction & Fallback (`src/lib/parser.ts`)
- Use `@mozilla/readability` to extract clean article content from raw HTML fetched via the proxy.
- Set `<base href="...">` in the virtual DOM prior to extraction so relative images and hyperlinks resolve accurately.
- Estimate word count and reading time in minutes (`Math.ceil(words / 200)`).
- **Graceful Fallback**: If `@mozilla/readability` fails (or returns less than 100 characters), automatically fall back to the feed's original `<description>` or `content:encoded` summary without error.

### 4. Zero-Trust Content Sanitization (`src/lib/sanitizer.ts`)
- **Mandatory Security Requirement**: Proxied web content is untrusted. All extracted HTML must pass through strict `DOMPurify` sanitization before rendering in the client.
- Strip dangerous tags: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<base>`.
- Strip event handler attributes: `onload`, `onerror`, `onclick`, `onmouseover`, etc.
- Allowlist safe tags for reading: `<p>`, `<h1>`-`<h6>`, `<blockquote>`, `<pre>`, `<code>`, `<img>`, `<a>`, `<ul>`, `<ol>`, `<li>`, `<table>`, `<b>`, `<i>`, `<em>`, `<strong>`.
- Force `rel="noopener noreferrer nofollow"` and `target="_blank"` on all external links.
- Block tracking pixels (`1x1` images) and non-http(s) image sources (e.g., `javascript:`, `data:` URLs).

### 5. OPML Import & Export (`src/lib/opml.ts`)
- `exportToOPML(subscriptions: Subscription[]): string`: Generates valid OPML 2.0 XML string containing all subscribed feeds categorized by folder tags.
- `parseOPML(opmlXml: string): Array<{ title: string; xmlUrl: string; htmlUrl?: string; category?: string }>`: Parses uploaded OPML files to batch-import feeds into the reader.

---

## Verification Checklist
- [ ] `npm run typecheck` passes with zero type errors.
- [ ] Successfully parses sample RSS 2.0, Atom 1.0, and malformed XML feeds without crashing.
- [ ] Autodiscovery detects feeds on major blogging platforms (Substack, Ghost, WordPress, Hugo, Jekyll).
- [ ] `DOMPurify` test suite verifies that `<script>alert(1)</script>` and `onerror=alert(1)` payloads are neutralized.
- [ ] Fallback returns summary when full article extraction fails.
- [ ] Zero file conflicts with Person 1 (UI/UX) or Person 3 (Caching/Sync).
