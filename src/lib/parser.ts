import { Readability } from "@mozilla/readability";
import { sanitizeHtml } from "./sanitizer";

export type FeedErrorCode = "MALFORMED_XML" | "UNSUPPORTED_FORMAT" | "EMPTY_FEED";

export class FeedParseError extends Error {
  code: FeedErrorCode;

  constructor(code: FeedErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "FeedParseError";
  }
}

export interface ParsedItem {
  id: string; // guid or link
  title: string;
  url: string;
  publishedAt: number; // Unix timestamp in milliseconds
  author?: string;
  summary?: string;
  content?: string;
  // Aliases for compatibility
  link: string;
  pubDate?: string;
}

export type ParsedFeedItem = ParsedItem;

export interface ParsedFeedResult {
  title: string;
  link?: string;
  description?: string;
  items: ParsedItem[];
}

export interface ExtractedArticleResult {
  title: string;
  byline?: string;
  excerpt?: string;
  content: string; // Sanitized HTML
  textContent: string;
  length?: number;
  readingTimeMinutes: number;
}

export interface ParseFeedOptions {
  allowEmpty?: boolean;
}

/**
 * Pre-processes raw XML to repair common authoring defects:
 * - Strips leading BOM & control characters
 * - Converts HTML named entities to standard XML numeric character references
 * - Fixes unescaped ampersands
 */
function preCleanXml(raw: string): string {
  if (!raw) return "";

  // 1. Remove UTF-8 BOM and leading/trailing whitespace
  let cleaned = raw.replace(/^[﻿\xEF\xBB\xBF]+/, "").trim();

  // 2. Strip invalid XML 1.0 control characters
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  // 3. Map common HTML named entities to XML numeric entities to avoid XML parsererror
  const htmlEntityMap: Record<string, string> = {
    "&nbsp;": "&#160;",
    "&copy;": "&#169;",
    "&reg;": "&#174;",
    "&trade;": "&#8482;",
    "&mdash;": "&#8212;",
    "&ndash;": "&#8211;",
    "&hellip;": "&#8230;",
    "&lsquo;": "&#8216;",
    "&rsquo;": "&#8217;",
    "&ldquo;": "&#8220;",
    "&rdquo;": "&#8221;",
    "&bull;": "&#8226;",
    "&middot;": "&#183;",
    "&laquo;": "&#171;",
    "&raquo;": "&#187;",
  };

  cleaned = cleaned.replace(
    /&(?:nbsp|copy|reg|trade|mdash|ndash|hellip|lsquo|rsquo|ldquo|rdquo|bull|middot|laquo|raquo);/g,
    (m) => htmlEntityMap[m] || m
  );

  // 4. Fix bare unescaped ampersands: & not followed by a valid entity or decimal/hex char ref
  cleaned = cleaned.replace(/&(?!([a-zA-Z0-9]+|#\d+|#x[a-fA-F0-9]+);)/g, "&amp;");

  return cleaned;
}

/**
 * Extracts inner text or attribute from child elements across multiple tag names/namespaces.
 * Crucial fix: Never passes colons directly into querySelector to prevent DOMException on namespaced tags.
 */
function getTagText(parent: Element, tagNames: string[]): string | undefined {
  for (const tag of tagNames) {
    const colonIdx = tag.indexOf(":");
    const local = (colonIdx > -1 ? tag.slice(colonIdx + 1) : tag).toLowerCase();

    // 1. Direct children inspection matching localName or tagName
    const children = parent.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childLocal = (child.localName || "").toLowerCase();
      const childTag = (child.tagName || "").toLowerCase();

      if (childLocal === local || childTag === tag.toLowerCase() || childTag === local) {
        const text = child.textContent?.trim();
        if (text) return text;
      }
    }

    // 2. Safe querySelector for non-colon tags only
    if (!tag.includes(":")) {
      try {
        const el = parent.querySelector(tag);
        if (el && el.textContent?.trim()) {
          return el.textContent.trim();
        }
      } catch {
        // Suppress any invalid CSS selector syntax errors
      }
    }

    // 3. Fallback search across all descendants by localName
    const elements = parent.getElementsByTagName("*");
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if ((el.localName || "").toLowerCase() === local) {
        const text = el.textContent?.trim();
        if (text) return text;
      }
    }
  }
  return undefined;
}

/**
 * Parses date string (RFC 822, ISO 8601) to Unix timestamp (ms).
 * Falls back to Date.now() if invalid.
 */
function parseDateToTimestamp(rawDate?: string): { timestamp: number; dateStr?: string } {
  if (!rawDate) {
    return { timestamp: Date.now() };
  }

  const parsed = Date.parse(rawDate);
  if (!Number.isNaN(parsed)) {
    return { timestamp: parsed, dateStr: rawDate };
  }

  return { timestamp: Date.now(), dateStr: rawDate };
}

/**
 * Strips HTML tags and normalizes spaces for summaries
 */
function stripHtmlToText(html?: string): string | undefined {
  if (!html) return undefined;
  const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.length > 0 ? stripped : undefined;
}

/**
 * Decodes XML entities into characters
 */
function unescapeXml(str?: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(Number(dec));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return "";
      }
    });
}

/**
 * Regex-based parser fallback for SSR and test execution outside browser
 */
function parseFeedSsr(cleanedXml: string, options?: ParseFeedOptions): ParsedFeedResult {
  const isRss = /<channel\b/i.test(cleanedXml);
  const isAtom = /<feed\b/i.test(cleanedXml);

  if (!isRss && !isAtom) {
    if (/<(?:\?xml|rss|feed|channel)\b/i.test(cleanedXml)) {
      throw new FeedParseError("MALFORMED_XML", "Feed markup is malformed XML");
    }
    throw new FeedParseError("UNSUPPORTED_FORMAT", "Feed is neither RSS nor Atom");
  }

  const cleanTagVal = (val?: string): string | undefined => {
    if (!val) return undefined;
    const isCdata = val.startsWith("<![CDATA[");
    const raw = val.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
    return isCdata ? raw : unescapeXml(raw);
  };

  if (isRss) {
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(cleanedXml);
    const linkMatch = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(cleanedXml);
    const descMatch = /<description[^>]*>([\s\S]*?)<\/description>/i.exec(cleanedXml);

    const items: ParsedItem[] = [];
    const itemRegex = /<item\b[\s\S]*?>([\s\S]*?)<\/item>/gi;
    let itemMatch: RegExpExecArray | null;
    let index = 0;

    while ((itemMatch = itemRegex.exec(cleanedXml)) !== null) {
      const itemBody = itemMatch[1];
      const iTitle = cleanTagVal(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(itemBody)?.[1]) || "Untitled";
      const iLink = cleanTagVal(/<link[^>]*>([\s\S]*?)<\/link>/i.exec(itemBody)?.[1]) || "";
      const iGuid = cleanTagVal(/<guid[^>]*>([\s\S]*?)<\/guid>/i.exec(itemBody)?.[1]) || iLink || `rss-item-${index++}`;
      const iDate = cleanTagVal(/<(?:pubDate|pubdate|dc:date|date)[^>]*>([\s\S]*?)<\/(?:pubDate|pubdate|dc:date|date)>/i.exec(itemBody)?.[1]);
      const { timestamp, dateStr } = parseDateToTimestamp(iDate);
      const iAuthor = cleanTagVal(/<(?:dc:creator|creator|author)[^>]*>([\s\S]*?)<\/(?:dc:creator|creator|author)>/i.exec(itemBody)?.[1]);
      const iSummary = cleanTagVal(/<description[^>]*>([\s\S]*?)<\/description>/i.exec(itemBody)?.[1]);
      const iContent = cleanTagVal(/<(?:content:encoded|encoded|content)[^>]*>([\s\S]*?)<\/(?:content:encoded|encoded|content)>/i.exec(itemBody)?.[1]) || iSummary;

      items.push({
        id: iGuid,
        title: iTitle,
        url: iLink,
        link: iLink,
        publishedAt: timestamp,
        pubDate: dateStr,
        author: iAuthor,
        summary: stripHtmlToText(iSummary)?.slice(0, 300),
        content: iContent,
      });
    }

    if (items.length === 0 && !options?.allowEmpty) {
      throw new FeedParseError("EMPTY_FEED", "RSS feed contains no items");
    }

    return {
      title: cleanTagVal(titleMatch?.[1]) || "Untitled Feed",
      link: cleanTagVal(linkMatch?.[1]),
      description: cleanTagVal(descMatch?.[1]),
      items,
    };
  }

  // Atom SSR: Look for alternate link or non-self link
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(cleanedXml);
  const alternateLinkMatch = /<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(cleanedXml) ||
    /<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i.exec(cleanedXml);
  const genericLinkMatch = /<link\b(?![^>]*rel=["']self["'])[^>]*href=["']([^"']+)["']/i.exec(cleanedXml) ||
    /<link\b[^>]*href=["']([^"']+)["']/i.exec(cleanedXml) ||
    /<link[^>]*>([\s\S]*?)<\/link>/i.exec(cleanedXml);

  const linkVal = alternateLinkMatch?.[1] || genericLinkMatch?.[1];
  const descMatch = /<subtitle[^>]*>([\s\S]*?)<\/subtitle>/i.exec(cleanedXml);

  const items: ParsedItem[] = [];
  const entryRegex = /<entry\b[\s\S]*?>([\s\S]*?)<\/entry>/gi;
  let entryMatch: RegExpExecArray | null;
  let index = 0;

  while ((entryMatch = entryRegex.exec(cleanedXml)) !== null) {
    const entryBody = entryMatch[1];
    const eTitle = cleanTagVal(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(entryBody)?.[1]) || "Untitled";
    const eLinkMatch = /<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(entryBody) ||
      /<link\b(?![^>]*rel=["']self["'])[^>]*href=["']([^"']+)["']/i.exec(entryBody) ||
      /<link\b[^>]*href=["']([^"']+)["']/i.exec(entryBody) ||
      /<link[^>]*>([\s\S]*?)<\/link>/i.exec(entryBody);

    const eLink = cleanTagVal(eLinkMatch?.[1]) || "";
    const eId = cleanTagVal(/<id[^>]*>([\s\S]*?)<\/id>/i.exec(entryBody)?.[1]) || eLink || `atom-entry-${index++}`;
    const eDate = cleanTagVal(/<(?:published|updated|date)[^>]*>([\s\S]*?)<\/(?:published|updated|date)>/i.exec(entryBody)?.[1]);
    const { timestamp, dateStr } = parseDateToTimestamp(eDate);
    const eAuthor = cleanTagVal(/<name[^>]*>([\s\S]*?)<\/name>/i.exec(entryBody)?.[1]) || cleanTagVal(/<author[^>]*>([\s\S]*?)<\/author>/i.exec(entryBody)?.[1]);
    const eSummary = cleanTagVal(/<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(entryBody)?.[1]) || cleanTagVal(/<description[^>]*>([\s\S]*?)<\/description>/i.exec(entryBody)?.[1]);
    const eContent = cleanTagVal(/<content[^>]*>([\s\S]*?)<\/content>/i.exec(entryBody)?.[1]) || eSummary;

    items.push({
      id: eId,
      title: eTitle,
      url: eLink,
      link: eLink,
      publishedAt: timestamp,
      pubDate: dateStr,
      author: eAuthor,
      summary: stripHtmlToText(eSummary)?.slice(0, 300),
      content: eContent,
    });
  }

  if (items.length === 0 && !options?.allowEmpty) {
    throw new FeedParseError("EMPTY_FEED", "Atom feed contains no entries");
  }

  return {
    title: cleanTagVal(titleMatch?.[1]) || "Untitled Atom Feed",
    link: cleanTagVal(linkVal),
    description: cleanTagVal(descMatch?.[1]),
    items,
  };
}

/**
 * Parses RSS 0.9x, 2.0, and Atom 1.0 XML payloads in the browser.
 * Resilient against malformed XML, unclosed tags, and mismatched namespaces.
 */
export async function parseFeed(
  xmlContent: string,
  options?: ParseFeedOptions
): Promise<ParsedFeedResult> {
  if (!xmlContent || typeof xmlContent !== "string" || !xmlContent.trim()) {
    throw new FeedParseError("EMPTY_FEED", "Provided feed content is empty");
  }

  const cleanedXml = preCleanXml(xmlContent);

  if (typeof window === "undefined") {
    return parseFeedSsr(cleanedXml, options);
  }

  const parser = new DOMParser();

  let xmlDoc: Document | null = null;
  let isXmlParsed = false;
  let hadXmlParseError = false;

  // Attempt 1: Strict XML parser
  try {
    xmlDoc = parser.parseFromString(cleanedXml, "text/xml");
    const parseError = xmlDoc.querySelector("parsererror");
    if (!parseError) {
      isXmlParsed = true;
    } else {
      hadXmlParseError = true;
    }
  } catch {
    hadXmlParseError = true;
    isXmlParsed = false;
  }

  // Attempt 2: Fallback to HTML5 parser for malformed XML / unclosed tags
  if (!isXmlParsed || !xmlDoc) {
    try {
      xmlDoc = parser.parseFromString(cleanedXml, "text/html");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new FeedParseError("MALFORMED_XML", `Failed to parse feed markup: ${msg}`);
    }
  }

  // Check for RSS 0.9x / 2.0 (<channel>)
  const channel = xmlDoc.querySelector("channel");
  if (channel) {
    const title = getTagText(channel, ["title"]) || "Untitled Feed";
    const link = getTagText(channel, ["link"]) || undefined;
    const description = getTagText(channel, ["description"]) || undefined;

    const itemNodes = xmlDoc.querySelectorAll("item");
    const items: ParsedItem[] = [];

    itemNodes.forEach((node, index) => {
      const itemTitle = getTagText(node, ["title"]) || "Untitled";

      // Link resolution with fallback for HTML5 void-link parsing
      let itemLink = getTagText(node, ["link"]) || "";
      if (!itemLink && !isXmlParsed) {
        // In text/html parsing, <link> URL might have been placed as direct text in node.innerHTML
        const linkMatch = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(node.innerHTML) ||
          /<link\b[^>]*href=["']([^"']+)["']/i.exec(node.innerHTML);
        if (linkMatch) {
          itemLink = linkMatch[1]?.trim() || "";
        }
      }

      const guid = getTagText(node, ["guid"]) || itemLink || `rss-item-${index}-${Date.now()}`;
      const rawDate = getTagText(node, ["pubDate", "pubdate", "dc:date", "date"]);
      const { timestamp, dateStr } = parseDateToTimestamp(rawDate);
      const author = getTagText(node, ["dc:creator", "creator", "author"]);
      const rawSummary = getTagText(node, ["description"]);
      const rawContent = getTagText(node, ["content:encoded", "encoded", "content"]) || rawSummary;

      const summaryText = stripHtmlToText(rawSummary)?.slice(0, 300);

      items.push({
        id: guid,
        title: itemTitle,
        url: itemLink,
        link: itemLink,
        publishedAt: timestamp,
        pubDate: dateStr,
        author,
        summary: summaryText,
        content: rawContent,
      });
    });

    if (items.length === 0 && !options?.allowEmpty) {
      throw new FeedParseError("EMPTY_FEED", "RSS feed contains no items");
    }

    return { title, link, description, items };
  }

  // Check for Atom 1.0 (<feed>)
  const feed = xmlDoc.querySelector("feed");
  if (feed) {
    const title = getTagText(feed, ["title"]) || "Untitled Atom Feed";
    const feedLinkEl = feed.querySelector('link[rel="alternate"]') ||
      feed.querySelector('link:not([rel="self"])') ||
      feed.querySelector("link");
    const link = feedLinkEl?.getAttribute("href") || feedLinkEl?.textContent?.trim() || undefined;
    const description = getTagText(feed, ["subtitle", "description"]) || undefined;

    const entryNodes = feed.querySelectorAll("entry");
    const items: ParsedItem[] = [];

    entryNodes.forEach((node, index) => {
      const itemTitle = getTagText(node, ["title"]) || "Untitled";
      const linkEl = node.querySelector('link[rel="alternate"]') ||
        node.querySelector('link:not([rel="self"])') ||
        node.querySelector("link");
      const itemLink = linkEl?.getAttribute("href") || linkEl?.textContent?.trim() || "";
      const id = getTagText(node, ["id"]) || itemLink || `atom-entry-${index}-${Date.now()}`;
      const rawDate = getTagText(node, ["published", "updated", "date"]);
      const { timestamp, dateStr } = parseDateToTimestamp(rawDate);
      const author = getTagText(node, ["name", "author"]);
      const rawSummary = getTagText(node, ["summary", "description"]);
      const rawContent = getTagText(node, ["content"]) || rawSummary;

      const summaryText = stripHtmlToText(rawSummary)?.slice(0, 300);

      items.push({
        id,
        title: itemTitle,
        url: itemLink,
        link: itemLink,
        publishedAt: timestamp,
        pubDate: dateStr,
        author,
        summary: summaryText,
        content: rawContent,
      });
    });

    if (items.length === 0 && !options?.allowEmpty) {
      throw new FeedParseError("EMPTY_FEED", "Atom feed contains no entries");
    }

    return { title, link, description, items };
  }

  // Classification of failure: check if input had feed signature but failed to parse
  const hasFeedSignature = /<(?:\?xml|rss|feed|channel)\b/i.test(cleanedXml);
  if (hadXmlParseError || hasFeedSignature) {
    throw new FeedParseError("MALFORMED_XML", "XML payload is corrupted or contains unclosed tags");
  }

  // Neither <channel> nor <feed> found
  throw new FeedParseError(
    "UNSUPPORTED_FORMAT",
    "Unrecognized feed format: document has neither <channel> nor <feed>"
  );
}

/**
 * Extracts clean, readable article content from raw HTML using @mozilla/readability.
 * Falls back to feed item's original content/summary if readability returns < 100 characters.
 */
export async function extractArticle(
  html: string,
  fallback?: { title?: string; summary?: string; content?: string },
  docUrl?: string
): Promise<ExtractedArticleResult> {
  if (typeof window === "undefined") {
    const rawFallback = fallback?.content || fallback?.summary || "<p>Readability extraction runs in browser.</p>";
    const cleanContent = sanitizeHtml(rawFallback, { baseUrl: docUrl });
    const textContent = stripHtmlToText(rawFallback) || "";
    const words = textContent.split(/\s+/).filter(Boolean).length;
    return {
      title: fallback?.title || "Article Preview",
      content: cleanContent,
      textContent,
      length: textContent.length,
      readingTimeMinutes: Math.max(1, Math.ceil(words / 200)),
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html || "", "text/html");

  if (docUrl) {
    try {
      const base = doc.createElement("base");
      base.href = docUrl;
      if (doc.head) {
        if (doc.head.firstChild) {
          doc.head.insertBefore(base, doc.head.firstChild);
        } else {
          doc.head.appendChild(base);
        }
      } else if (doc.documentElement) {
        doc.documentElement.insertBefore(base, doc.documentElement.firstChild);
      }
    } catch {
      // Continue even if base tag injection fails
    }
  }

  let extractedContent: string | null = null;
  let textContent = "";
  let title = fallback?.title || "Untitled Article";
  let byline: string | undefined = undefined;
  let excerpt: string | undefined = fallback?.summary;

  try {
    const reader = new Readability(doc);
    const parsed = reader.parse();

    if (parsed && parsed.textContent && parsed.textContent.trim().length >= 100) {
      extractedContent = parsed.content;
      textContent = parsed.textContent.trim();
      title = parsed.title || title;
      byline = parsed.byline || undefined;
      excerpt = parsed.excerpt || excerpt;
    }
  } catch {
    // Readability failed, move to fallback
  }

  // Graceful Fallback: If readability failed or extracted < 100 characters
  if (!extractedContent || textContent.length < 100) {
    extractedContent = fallback?.content || fallback?.summary || "<p>No full content available.</p>";
    textContent = stripHtmlToText(extractedContent) || "";
  }

  // Sanitize all output through zero-trust sanitizer
  const cleanContent = sanitizeHtml(extractedContent, { baseUrl: docUrl });
  const wordCount = textContent ? textContent.split(/\s+/).filter(Boolean).length : 0;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  return {
    title,
    byline,
    excerpt,
    content: cleanContent,
    textContent,
    length: textContent.length,
    readingTimeMinutes,
  };
}
