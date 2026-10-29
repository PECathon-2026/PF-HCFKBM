import DOMPurify from "dompurify";

export interface SanitizeOptions {
  baseUrl?: string;
  stripImages?: boolean;
}

const ALLOWED_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "code",
  "img",
  "a",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "b",
  "i",
  "em",
  "strong",
  "u",
  "s",
  "strike",
  "del",
  "ins",
  "mark",
  "small",
  "sub",
  "sup",
  "hr",
  "br",
  "span",
  "div",
  "figure",
  "figcaption",
  "caption",
  "section",
  "article",
  "aside",
  "details",
  "summary",
  "dd",
  "dt",
  "dl",
  "abbr",
  "cite",
  "time",
];

const FORBID_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "base",
  "meta",
  "link",
  "applet",
  "frame",
  "frameset",
  "input",
  "button",
  "select",
  "textarea",
  "style",
  "canvas",
  "svg",
  "math",
  "audio",
  "video",
  "source",
];

const ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "title",
  "width",
  "height",
  "target",
  "rel",
  "class",
  "id",
  "aria-label",
  "aria-hidden",
  "role",
];

const FORBID_ATTR = [
  "onload",
  "onerror",
  "onclick",
  "onmouseover",
  "onmouseout",
  "onmouseenter",
  "onmouseleave",
  "onfocus",
  "onblur",
  "onchange",
  "onsubmit",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "ontoggle",
  "formaction",
  "action",
  "data",
  "srcset",
];

export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let activeBaseUrl: string | undefined = undefined;

function getPurify(): typeof DOMPurify | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (typeof DOMPurify.sanitize === "function") {
    return DOMPurify;
  }
  if (typeof (DOMPurify as unknown as (w: Window) => typeof DOMPurify) === "function") {
    return (DOMPurify as unknown as (w: Window) => typeof DOMPurify)(window);
  }
  return DOMPurify;
}

let hooksRegistered = false;

function setupPurifyHooks(purify: typeof DOMPurify) {
  if (hooksRegistered) return;
  hooksRegistered = true;

  // 1. Element level: eliminate 1x1 tracking pixels, hidden beacons, and invalid image sources
  purify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "img") {
      const el = node as HTMLImageElement;

      // Hidden attribute check
      if (el.hasAttribute("hidden")) {
        el.remove();
        return;
      }

      // Check dimensions (both attribute and style)
      const widthAttr = el.getAttribute("width");
      const heightAttr = el.getAttribute("height");
      const width = widthAttr !== null ? parseInt(widthAttr, 10) : NaN;
      const height = heightAttr !== null ? parseInt(heightAttr, 10) : NaN;

      const hasZeroArea = width === 0 || height === 0;
      const hasTinyDimension = (!Number.isNaN(width) && width <= 1) || (!Number.isNaN(height) && height <= 1);

      const style = (el.getAttribute("style") || "").toLowerCase();
      const isTinyStyle =
        /(?:width|height)\s*:\s*(?:0(?:\.\d+)?|1)(?:px|em|rem|%|pt)?\b/i.test(style) ||
        /display\s*:\s*none/i.test(style) ||
        /visibility\s*:\s*hidden/i.test(style) ||
        /opacity\s*:\s*0(?![.\d])/i.test(style);

      if (hasZeroArea || hasTinyDimension || isTinyStyle) {
        el.remove();
        return;
      }

      // Sanitize and resolve image src
      let rawSrc = (el.getAttribute("src") || "").trim();
      if (!rawSrc) {
        el.remove();
        return;
      }

      // Disallow non-http(s) schemes immediately
      if (/^(?:javascript|data|vbscript|file|blob):/i.test(rawSrc)) {
        el.remove();
        return;
      }

      // Resolve relative or protocol-relative src using activeBaseUrl
      if (activeBaseUrl && !/^https?:\/\//i.test(rawSrc)) {
        try {
          rawSrc = new URL(rawSrc, activeBaseUrl).toString();
        } catch {
          el.remove();
          return;
        }
      }

      if (!isSafeUrl(rawSrc)) {
        el.remove();
        return;
      }

      el.setAttribute("src", rawSrc);
    }
  });

  // 2. Attribute level: harden external links while preserving in-article navigation
  purify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.hasAttribute("href")) {
      let href = (node.getAttribute("href") || "").trim();

      // Disallow dangerous schemes
      if (/^(?:javascript|data|vbscript|file):/i.test(href)) {
        node.removeAttribute("href");
        return;
      }

      // Preserve internal document anchor navigation
      if (href.startsWith("#") || href.startsWith("mailto:")) {
        node.removeAttribute("target");
        return;
      }

      // Resolve relative URLs using activeBaseUrl
      if (activeBaseUrl && !/^https?:\/\//i.test(href)) {
        try {
          href = new URL(href, activeBaseUrl).toString();
          node.setAttribute("href", href);
        } catch {
          node.removeAttribute("href");
          return;
        }
      }

      if (!isSafeUrl(href)) {
        node.removeAttribute("href");
        return;
      }

      // External link hardening
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });
}

/**
 * Sanitizes untrusted HTML content using strict zero-trust rules.
 * Neutralizes XSS, strips dangerous tags, eliminates tracking pixels,
 * and hardens external links.
 */
export function sanitizeHtml(rawHtml: string, options?: SanitizeOptions): string {
  if (!rawHtml || typeof rawHtml !== "string") {
    return "";
  }

  const purify = getPurify();
  if (!purify) {
    // Zero-trust SSR/Node fallback: strictly strip all tags and escape to prevent script execution
    const safeText = rawHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<[^>]+>/g, "");
    return escapeHtml(safeText);
  }

  setupPurifyHooks(purify);

  activeBaseUrl = options?.baseUrl && isSafeUrl(options.baseUrl) ? options.baseUrl : undefined;
  try {
    return purify.sanitize(rawHtml, {
      ALLOWED_TAGS: options?.stripImages
        ? ALLOWED_TAGS.filter((t) => t !== "img")
        : ALLOWED_TAGS,
      ALLOWED_ATTR,
      FORBID_TAGS,
      FORBID_ATTR,
      ALLOW_DATA_ATTR: false,
      USE_PROFILES: { html: true },
    });
  } finally {
    activeBaseUrl = undefined;
  }
}
