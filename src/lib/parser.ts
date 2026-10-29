import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";

export interface ParsedFeedItem {
  id: string;
  title: string;
  link: string;
  pubDate?: string;
  author?: string;
  summary?: string;
  content?: string;
}

export interface ParsedFeedResult {
  title: string;
  link?: string;
  description?: string;
  items: ParsedFeedItem[];
}

export interface ExtractedArticleResult {
  title: string;
  byline?: string;
  excerpt?: string;
  content: string; // Sanitized HTML
  textContent: string;
  length?: number;
  readingTimeMinutes?: number;
}

/**
 * Discovers RSS/Atom feed links in an HTML document.
 * Looks for <link rel="alternate" type="application/rss+xml | atom+xml" href="...">
 */
export async function discoverFeed(html: string, baseUrl: string): Promise<string[]> {
  if (typeof window === "undefined") {
    // SSR fallback
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const feedLinks: string[] = [];

  const selectors = [
    'link[type="application/rss+xml"]',
    'link[type="application/atom+xml"]',
    'link[type="application/feed+json"]',
    'link[rel="alternate"][type*="xml"]',
  ];

  const elements = doc.querySelectorAll(selectors.join(","));
  elements.forEach((el) => {
    const href = el.getAttribute("href");
    if (href) {
      try {
        const absoluteUrl = new URL(href, baseUrl).toString();
        if (!feedLinks.includes(absoluteUrl)) {
          feedLinks.push(absoluteUrl);
        }
      } catch {
        // Ignore invalid URLs
      }
    }
  });

  // TODO: Team members can add fallback heuristics checking common paths like /rss, /feed, /atom.xml
  return feedLinks;
}

/**
 * Parses RSS / Atom XML string into a structured feed object.
 */
export async function parseFeed(xmlContent: string): Promise<ParsedFeedResult> {
  if (typeof window === "undefined") {
    return { title: "SSR Feed", items: [] };
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

  const parseError = xmlDoc.querySelector("parsererror");
  if (parseError) {
    throw new Error(`XML Parse Failure: ${parseError.textContent?.slice(0, 100)}`);
  }

  // Check if RSS 2.0
  const channel = xmlDoc.querySelector("channel");
  if (channel) {
    const title = channel.querySelector("title")?.textContent || "Untitled Feed";
    const description = channel.querySelector("description")?.textContent || undefined;
    const link = channel.querySelector("link")?.textContent || undefined;

    const items: ParsedFeedItem[] = [];
    const itemNodes = xmlDoc.querySelectorAll("item");

    itemNodes.forEach((node) => {
      const itemTitle = node.querySelector("title")?.textContent || "Untitled";
      const itemLink = node.querySelector("link")?.textContent || "";
      const guid = node.querySelector("guid")?.textContent || itemLink;
      const pubDate = node.querySelector("pubDate")?.textContent || undefined;
      const author = node.querySelector("creator, author")?.textContent || undefined;
      const descriptionText = node.querySelector("description")?.textContent || undefined;
      const content = node.querySelector("encoded")?.textContent || descriptionText;

      items.push({
        id: guid,
        title: itemTitle,
        link: itemLink,
        pubDate,
        author,
        summary: descriptionText?.replace(/<[^>]+>/g, "").slice(0, 200),
        content,
      });
    });

    return { title, description, link, items };
  }

  // Check if Atom Feed
  const feed = xmlDoc.querySelector("feed");
  if (feed) {
    const title = feed.querySelector("title")?.textContent || "Untitled Atom Feed";
    const link = feed.querySelector("link")?.getAttribute("href") || undefined;
    const items: ParsedFeedItem[] = [];

    const entryNodes = feed.querySelectorAll("entry");
    entryNodes.forEach((node) => {
      const itemTitle = node.querySelector("title")?.textContent || "Untitled";
      const itemLink = node.querySelector("link")?.getAttribute("href") || "";
      const id = node.querySelector("id")?.textContent || itemLink;
      const pubDate = node.querySelector("published, updated")?.textContent || undefined;
      const author = node.querySelector("author name")?.textContent || undefined;
      const summary = node.querySelector("summary")?.textContent || undefined;
      const content = node.querySelector("content")?.textContent || summary;

      items.push({
        id,
        title: itemTitle,
        link: itemLink,
        pubDate,
        author,
        summary: summary?.replace(/<[^>]+>/g, "").slice(0, 200),
        content,
      });
    });

    return { title, link, items };
  }

  // TODO: Team members can add JSON Feed spec parsing support
  throw new Error("Unrecognized feed format: document has neither <channel> nor <feed>");
}

/**
 * Extracts clean, readable article content and metadata from raw HTML.
 * Uses @mozilla/readability and DOMPurify for XSS sanitization.
 */
export async function extractArticle(html: string, docUrl?: string): Promise<ExtractedArticleResult> {
  if (typeof window === "undefined") {
    return {
      title: "Article Preview",
      content: "<p>Readability extraction runs in browser.</p>",
      textContent: "Readability extraction runs in browser.",
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  if (docUrl) {
    // Set base URI for resolving relative image and link sources
    const base = doc.createElement("base");
    base.href = docUrl;
    doc.head.appendChild(base);
  }

  const reader = new Readability(doc);
  const parsed = reader.parse();

  if (!parsed) {
    throw new Error("Readability was unable to parse main article body");
  }

  // Sanitize extracted HTML through DOMPurify to defend against stored XSS
  const cleanContent = DOMPurify.sanitize(parsed.content || "");
  const wordCount = parsed.textContent ? parsed.textContent.trim().split(/\s+/).length : 0;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  return {
    title: parsed.title || "Untitled Article",
    byline: parsed.byline || undefined,
    excerpt: parsed.excerpt || undefined,
    content: cleanContent,
    textContent: parsed.textContent || "",
    length: parsed.length,
    readingTimeMinutes,
  };
}
