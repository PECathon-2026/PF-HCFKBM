import { Subscription } from "./db";

export interface ParsedOpmlFeed {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  category?: string;
}

/**
 * Escapes special XML characters to prevent injection and produce valid XML.
 */
function escapeXml(str?: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Decodes special XML entities and numeric character references into regular characters.
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
 * Generates a valid OPML 2.0 XML string containing subscribed feeds
 * categorized by folder tags.
 */
export function exportToOPML(subscriptions: Subscription[]): string {
  const dateStr = new Date().toUTCString();

  // Group subscriptions by category
  const groups: Record<string, Subscription[]> = {};
  for (const sub of subscriptions) {
    const category = sub.category?.trim() || "Subscriptions";
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(sub);
  }

  const categoryOutlines = Object.entries(groups)
    .map(([category, subs]) => {
      const feedOutlines = subs
        .map((sub) => {
          const title = escapeXml(sub.title || "Untitled Feed");
          const xmlUrl = escapeXml(sub.url);
          const htmlUrl = escapeXml(sub.siteUrl || "");
          const desc = sub.description ? ` description="${escapeXml(sub.description)}"` : "";

          return `      <outline type="rss" text="${title}" title="${title}" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}"${desc} />`;
        })
        .join("\n");

      return `    <outline text="${escapeXml(category)}" title="${escapeXml(category)}">\n${feedOutlines}\n    </outline>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>OnlyDevs Feed Subscriptions</title>
    <dateCreated>${dateStr}</dateCreated>
    <docs>http://opml.org/spec2.opml</docs>
  </head>
  <body>
${categoryOutlines}
  </body>
</opml>`;
}

/**
 * Case-insensitive attribute lookup across all element attributes in XML DOM
 */
function getAttributeInsensitive(el: Element, names: string[]): string | undefined {
  const targetNames = new Set(names.map((n) => n.toLowerCase()));

  // 1. Scan direct attributes case-insensitively
  if (el.attributes) {
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      if (targetNames.has(attr.name.toLowerCase())) {
        const val = attr.value;
        if (val && val.trim()) {
          return val.trim();
        }
      }
    }
  }

  // 2. Direct getAttribute fallback
  for (const name of names) {
    const val = el.getAttribute(name);
    if (val && val.trim()) {
      return val.trim();
    }
  }

  return undefined;
}

/**
 * Recursively parses outline elements to extract feeds and folder hierarchy.
 */
function extractOutlines(
  parent: Element,
  inheritedCategory?: string
): ParsedOpmlFeed[] {
  const results: ParsedOpmlFeed[] = [];
  const outlines = Array.from(parent.children).filter(
    (c) => c.tagName.toLowerCase() === "outline"
  );

  for (const outline of outlines) {
    const xmlUrl = getAttributeInsensitive(outline, ["xmlurl", "xmlUrl", "url"]);
    const textOrTitle = getAttributeInsensitive(outline, ["text", "title"]) || "Untitled Feed";
    const htmlUrl = getAttributeInsensitive(outline, ["htmlurl", "htmlUrl"]);
    const directCategory = getAttributeInsensitive(outline, ["category"]);

    const currentCategory = directCategory || inheritedCategory;

    if (xmlUrl) {
      // Leaf node: Feed subscription
      results.push({
        title: unescapeXml(textOrTitle),
        xmlUrl: unescapeXml(xmlUrl),
        htmlUrl: htmlUrl ? unescapeXml(htmlUrl) : undefined,
        category: currentCategory ? unescapeXml(currentCategory) : undefined,
      });
    }

    // Check children (folder outline)
    const childFeeds = extractOutlines(
      outline,
      xmlUrl ? inheritedCategory : textOrTitle
    );
    results.push(...childFeeds);
  }

  return results;
}

/**
 * Parses OPML XML string and extracts all feed subscriptions with category tags.
 * Resilient to malformed XML and nested outline hierarchies.
 */
export function parseOPML(opmlXml: string): ParsedOpmlFeed[] {
  if (!opmlXml || typeof opmlXml !== "string" || !opmlXml.trim()) {
    return [];
  }

  // Pre-clean BOM and invalid control chars
  let cleaned = opmlXml.trim().replace(/^[﻿\xEF\xBB\xBF]+/, "");
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  cleaned = cleaned.replace(/&(?!([a-zA-Z0-9]+|#\d+|#x[a-fA-F0-9]+);)/g, "&amp;");

  let doc: Document | null = null;

  if (typeof window !== "undefined") {
    const parser = new DOMParser();
    try {
      doc = parser.parseFromString(cleaned, "text/xml");
      if (doc.querySelector("parsererror")) {
        doc = parser.parseFromString(cleaned, "text/html");
      }
    } catch {
      doc = parser.parseFromString(cleaned, "text/html");
    }
  }

  let rawFeeds: ParsedOpmlFeed[] = [];

  if (doc) {
    // Locate <body> case-insensitively
    const children = Array.from(doc.documentElement?.children || []);
    const bodyEl =
      children.find((c) => c.tagName.toLowerCase() === "body") ||
      doc.querySelector("body, BODY") ||
      doc.documentElement;

    rawFeeds = bodyEl ? extractOutlines(bodyEl) : [];
  } else {
    // SSR regex fallback with category stack
    const categoryStack: string[] = [];
    const tagRegex = /<(\/)?outline\b([^>]*?)(\/)?>/gi;
    let tagMatch: RegExpExecArray | null;

    while ((tagMatch = tagRegex.exec(cleaned)) !== null) {
      const isClosing = Boolean(tagMatch[1]);
      const attrs = tagMatch[2] || "";
      const isSelfClosing = Boolean(tagMatch[3]) || attrs.trim().endsWith("/");

      if (isClosing) {
        categoryStack.pop();
        continue;
      }

      const xmlUrlMatch = /xmlUrl=["']([^"']+)["']/i.exec(attrs) || /url=["']([^"']+)["']/i.exec(attrs);
      const titleMatch = /title=["']([^"']+)["']/i.exec(attrs) || /text=["']([^"']+)["']/i.exec(attrs);
      const htmlUrlMatch = /htmlUrl=["']([^"']+)["']/i.exec(attrs);
      const categoryMatch = /category=["']([^"']+)["']/i.exec(attrs);

      const title = unescapeXml(titleMatch ? titleMatch[1] : "Untitled Feed");

      if (xmlUrlMatch) {
        // Feed leaf
        const currentCategory = categoryMatch
          ? unescapeXml(categoryMatch[1])
          : categoryStack[categoryStack.length - 1];

        rawFeeds.push({
          title,
          xmlUrl: unescapeXml(xmlUrlMatch[1]),
          htmlUrl: htmlUrlMatch ? unescapeXml(htmlUrlMatch[1]) : undefined,
          category: currentCategory,
        });
      } else if (!isSelfClosing) {
        // Folder opening tag
        categoryStack.push(title);
      }
    }
  }

  // Unified deduplication by xmlUrl across both DOM and SSR
  const seen = new Set<string>();
  const uniqueFeeds: ParsedOpmlFeed[] = [];

  for (const feed of rawFeeds) {
    const normalizedUrl = feed.xmlUrl.trim();
    if (normalizedUrl && !seen.has(normalizedUrl)) {
      seen.add(normalizedUrl);
      uniqueFeeds.push({
        ...feed,
        xmlUrl: normalizedUrl,
      });
    }
  }

  return uniqueFeeds;
}
