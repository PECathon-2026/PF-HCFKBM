#!/usr/bin/env python3
"""
scripts/detect_trap.py

CLI tool to detect seed list traps (Bonus Quest: 10 extra points):
1. Duplicate / circular redirects (infinite redirect loops or duplicate hops).
2. XML parse errors (malformed XML, unclosed tags, entity bombs, HTML disguised as feeds).
3. Canonical duplicates (two different URLs pointing to the exact same blog or landing at identical final URLs).

Usage:
    python scripts/detect_trap.py https://example.com/rss https://example.com/atom
    python scripts/detect_trap.py --file urls.txt
"""

import sys
import argparse
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from typing import List, Dict, Set, Optional
from dataclasses import dataclass, field


@dataclass
class TrapCheckResult:
    url: str
    canonical_url: str = ""
    is_safe: bool = True
    redirect_count: int = 0
    redirect_chain: List[str] = field(default_factory=list)
    has_duplicate_redirect: bool = False
    xml_parse_error: Optional[str] = None
    status_code: Optional[int] = None
    feed_title: Optional[str] = None
    details: Optional[str] = None


def check_redirects_and_fetch(url: str, timeout: int = 10) -> tuple[int, List[str], bytes, Optional[str]]:
    """
    Fetches the URL, records redirect chain, and checks for circular redirect traps.
    Returns (status_code, redirect_chain, content_bytes, error_message).
    """
    chain = [url]
    visited = {url.rstrip("/")}
    current_url = url

    for _ in range(10):
        try:
            req = urllib.request.Request(
                current_url,
                headers={"User-Agent": "OnlyDevs-TrapDetector/1.0 (+https://github.com/OnlyDevs)"}
            )

            class StopRedirectHandler(urllib.request.HTTPRedirectHandler):
                def http_error_301(self, req, fp, code, msg, headers):
                    return fp
                def http_error_302(self, req, fp, code, msg, headers):
                    return fp
                def http_error_303(self, req, fp, code, msg, headers):
                    return fp
                def http_error_307(self, req, fp, code, msg, headers):
                    return fp
                def http_error_308(self, req, fp, code, msg, headers):
                    return fp

            opener = urllib.request.build_opener(StopRedirectHandler)
            with opener.open(req, timeout=timeout) as response:
                status = response.getcode()
                headers = response.info()

                if status in (301, 302, 303, 307, 308):
                    location = headers.get("Location")
                    if not location:
                        return status, chain, b"", "Redirect response missing Location header"

                    next_url = urllib.parse.urljoin(current_url, location)
                    normalized_next = next_url.rstrip("/")

                    if normalized_next in visited:
                        chain.append(next_url)
                        return status, chain, b"", f"Circular redirect loop detected: {next_url}"

                    visited.add(normalized_next)
                    chain.append(next_url)
                    current_url = next_url
                    continue

                content = response.read(1024 * 512) # 512KB max inspection
                return status, chain, content, None

        except urllib.error.HTTPError as e:
            return e.code, chain, b"", f"HTTP Error {e.code}: {e.reason}"
        except urllib.error.URLError as e:
            return 0, chain, b"", f"Network connection error: {e.reason}"
        except Exception as e:
            return 0, chain, b"", f"Failed: {str(e)}"

    return 0, chain, b"", "Exceeded maximum redirect hops (10)"


def validate_xml_feed(content: bytes) -> tuple[Optional[str], Optional[str]]:
    """
    Parses XML content and extracts title.
    Returns (error_message, feed_title).
    """
    if not content or len(content.strip()) == 0:
        return "Empty response payload; cannot parse XML", None

    try:
        root = ET.fromstring(content)
        tag = root.tag.lower()

        # Check RSS or Atom
        if tag.endswith("rss"):
            channel = root.find("channel")
            title = channel.findtext("title") if channel is not None else None
            return None, title or "Untitled RSS"

        if tag.endswith("feed"):
            title = root.findtext("{http://www.w3.org/2005/Atom}title") or root.findtext("title")
            return None, title or "Untitled Atom"

        if tag.endswith("rdf"):
            title = root.findtext("{http://purl.org/rss/1.0/}title") or root.findtext("title")
            return None, title or "Untitled RDF"

        return f"Malformed feed: root element is <{root.tag}>, expected <rss> or <feed>", None

    except ET.ParseError as pe:
        return f"XML Parse Trap: {str(pe)}", None
    except Exception as e:
        return f"Parse exception: {str(e)}", None


def inspect_url_for_traps(url: str) -> TrapCheckResult:
    result = TrapCheckResult(url=url)
    status_code, chain, body, redirect_error = check_redirects_and_fetch(url)

    result.status_code = status_code
    result.redirect_chain = chain
    result.redirect_count = len(chain) - 1
    result.canonical_url = chain[-1] if chain else url

    if redirect_error:
        result.is_safe = False
        result.has_duplicate_redirect = "Circular redirect" in redirect_error
        result.details = redirect_error
        return result

    xml_error, title = validate_xml_feed(body)
    result.feed_title = title

    if xml_error:
        result.is_safe = False
        result.xml_parse_error = xml_error
        result.details = xml_error
        return result

    result.is_safe = True
    return result


def find_canonical_duplicates(results: List[TrapCheckResult]) -> Dict[str, List[str]]:
    """
    Finds multiple seed URLs that resolve to the exact same final canonical URL.
    """
    url_map: Dict[str, List[str]] = {}
    for r in results:
        final_url = r.canonical_url.rstrip("/")
        if final_url not in url_map:
            url_map[final_url] = []
        url_map[final_url].append(r.url)

    return {canonical: orig for canonical, orig in url_map.items() if len(orig) > 1}


def main():
    parser = argparse.ArgumentParser(
        description="Inspect feed URLs for traps (circular redirects, malformed XML, canonical duplicates)."
    )
    parser.add_argument("urls", nargs="*", help="List of URLs to inspect")
    parser.add_argument("--file", "-f", help="File containing list of URLs (one per line)")

    args = parser.parse_args()
    urls_to_check: List[str] = list(args.urls)

    if args.file:
        try:
            with open(args.file, "r", encoding="utf-8") as f:
                urls_to_check.extend([line.strip() for line in f if line.strip() and not line.startswith("#")])
        except Exception as e:
            print(f"Error reading file {args.file}: {e}", file=sys.stderr)
            sys.exit(1)

    if not urls_to_check:
        print("Running diagnostic check against sample URLs:\n")
        urls_to_check = [
            "https://news.ycombinator.com/rss",
            "https://simonwillison.net/atom/everything/",
            "http://news.ycombinator.com/rss"  # Same blog under HTTP vs HTTPS
        ]

    print(f"Auditing {len(urls_to_check)} seed URL(s) for deliberate traps...\n")

    results: List[TrapCheckResult] = []
    for url in urls_to_check:
        res = inspect_url_for_traps(url)
        results.append(res)

        status_label = "[SAFE]" if res.is_safe else "[TRAP/ERROR]"
        print(f"{status_label} {url}")
        if res.feed_title:
            print(f"  Title: {res.feed_title}")
        print(f"  Hops: {res.redirect_count} -> {' -> '.join(res.redirect_chain)}")
        if res.has_duplicate_redirect:
            print(f"  [!] CIRCULAR REDIRECT TRAP: {res.details}")
        if res.xml_parse_error:
            print(f"  [!] XML ERROR TRAP: {res.xml_parse_error}")
        print()

    # Check for canonical duplicate traps
    duplicates = find_canonical_duplicates(results)
    if duplicates:
        print("=" * 60)
        print("[!] DELIBERATE CANONICAL DUPLICATE TRAP DETECTED:")
        for canonical, orig_list in duplicates.items():
            print(f"  Canonical URL: {canonical}")
            for u in orig_list:
                print(f"    - Input URL: {u}")
        print("=" * 60)
    else:
        print("[✓] No duplicate canonical URLs found in this batch.")


if __name__ == "__main__":
    main()
