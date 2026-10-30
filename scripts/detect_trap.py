#!/usr/bin/env python3
"""Audit feed URLs for the reference project's deliberate trap bonus.

Checks every input for:
- SSRF-sensitive destinations and redirect targets
- redirect loops and excessive redirect chains
- bounded, allowlisted HTTP responses
- RSS 2.0, RSS 1.0/RDF, Atom, and JSON Feed validity
- canonical duplicates across a batch
- duplicate feeds hidden behind different URL forms

Examples:
    python scripts/detect_trap.py https://example.com/feed.xml
    python scripts/detect_trap.py --file urls.txt --json report.json
    type urls.txt | python scripts/detect_trap.py --stdin --json report.json

Exit codes:
    0: every URL was reachable and safe, with no duplicates
    1: a trap, malformed feed, duplicate, or unsafe URL was found
    2: one or more URLs could not be tested due to network/input errors
    64: invalid command-line arguments

The script intentionally makes direct network requests, so it applies its own
SSRF policy rather than assuming it is running behind the application's proxy.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import ipaddress
import json
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

try:
    from defusedxml import ElementTree as SafeET  # type: ignore
except ImportError:  # pragma: no cover - optional local hardening dependency
    import xml.etree.ElementTree as SafeET  # type: ignore


DEFAULT_TIMEOUT = 10.0
DEFAULT_MAX_BYTES = 512 * 1024
DEFAULT_MAX_REDIRECTS = 10
DEFAULT_CONCURRENCY = 4
ALLOWED_SCHEMES = {"http", "https"}
ALLOWED_PORTS = {None, 80, 443}
ALLOWED_CONTENT_TYPES = {
    "application/atom+xml",
    "application/feed+json",
    "application/json",
    "application/rss+xml",
    "application/xml",
    "text/html",
    "text/xml",
}


@dataclass
class TrapCheckResult:
    url: str
    canonical_url: str = ""
    is_safe: bool = False
    error_kind: Optional[str] = None
    details: Optional[str] = None
    status_code: Optional[int] = None
    content_type: Optional[str] = None
    bytes_read: int = 0
    redirect_count: int = 0
    redirect_chain: List[str] = field(default_factory=list)
    has_duplicate_redirect: bool = False
    xml_parse_error: Optional[str] = None
    feed_type: Optional[str] = None
    feed_title: Optional[str] = None
    feed_canonical_url: Optional[str] = None


class TrapError(Exception):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Return redirect responses so every Location can be checked manually."""

    def http_error_301(self, req, fp, code, msg, headers):
        return fp

    http_error_302 = http_error_301
    http_error_303 = http_error_301
    http_error_307 = http_error_301
    http_error_308 = http_error_301


def normalize_url(raw_url: str) -> str:
    value = raw_url.strip()
    if not value:
        raise TrapError("input", "empty URL")
    if not re_scheme(value):
        value = "https://" + value

    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise TrapError("unsafe_url", f"disallowed URL scheme: {parsed.scheme}")
    if parsed.username or parsed.password:
        raise TrapError("unsafe_url", "URLs containing credentials are rejected")
    if not parsed.hostname:
        raise TrapError("input", "URL has no hostname")
    if parsed.port not in ALLOWED_PORTS:
        raise TrapError("unsafe_url", "only HTTP and HTTPS default ports are allowed")

    hostname = parsed.hostname.rstrip(".").lower()
    return urllib.parse.urlunsplit(
        (
            parsed.scheme.lower(),
            hostname if parsed.port is None else f"{hostname}:{parsed.port}",
            parsed.path or "/",
            parsed.query,
            "",
        )
    )


def re_scheme(value: str) -> bool:
    return "://" in value[:16]


def is_public_ip(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        return not (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        )
    except ValueError:
        return False


def resolve_public_addresses(hostname: str, port: int) -> List[str]:
    lower = hostname.rstrip(".").lower()
    if lower in {"localhost", "localhost.localdomain"} or lower.endswith((".local", ".internal", ".lan")):
        raise TrapError("unsafe_url", f"internal hostname is blocked: {hostname}")

    try:
        literal = ipaddress.ip_address(lower)
        addresses = [str(literal)]
    except ValueError:
        try:
            infos = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        except socket.gaierror as exc:
            raise TrapError("network", f"DNS resolution failed: {exc}") from exc
        addresses = sorted({info[4][0] for info in infos})

    if not addresses:
        raise TrapError("network", "DNS returned no addresses")
    blocked = [address for address in addresses if not is_public_ip(address)]
    if blocked:
        raise TrapError("unsafe_url", f"DNS resolved to blocked address(es): {', '.join(blocked)}")
    return addresses


def canonicalize_for_duplicate(url: str) -> str:
    parsed = urllib.parse.urlsplit(normalize_url(url))
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    ignored = {"ref", "source", "fbclid", "gclid", "mc_cid", "mc_eid", "_ga", "_gl"}
    kept = sorted((key, value) for key, value in query if not key.lower().startswith("utm_") and key.lower() not in ignored)
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/") or "/", urllib.parse.urlencode(kept), ""))


def content_type_header(value: Optional[str]) -> str:
    return (value or "").split(";", 1)[0].strip().lower()


def read_bounded(response: Any, max_bytes: int) -> bytes:
    chunks: List[bytes] = []
    total = 0
    while True:
        chunk = response.read(min(64 * 1024, max_bytes - total + 1))
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise TrapError("response_limit", f"response exceeded {max_bytes} bytes")
        chunks.append(chunk)
    return b"".join(chunks)


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def find_child_text(element: Any, names: Iterable[str]) -> Optional[str]:
    wanted = {name.lower() for name in names}
    for child in list(element):
        if local_name(str(child.tag)) in wanted and child.text:
            return child.text.strip()
    return None


def parse_feed_payload(body: bytes, content_type: str) -> Tuple[str, Optional[str], Optional[str]]:
    if not body:
        raise TrapError("malformed_feed", "empty response payload")
    if b"<!doctype" in body[:4096].lower() and b"<html" in body[:4096].lower():
        raise TrapError("malformed_feed", "HTML page returned instead of a feed")
    if b"<!entity" in body[:8192].lower() or b"<!doctype" in body[:8192].lower():
        raise TrapError("malformed_feed", "DOCTYPE/entity declarations are rejected")

    if content_type == "application/feed+json" or body.lstrip().startswith(b"{"):
        try:
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise TrapError("malformed_feed", f"invalid JSON Feed: {exc}") from exc
        if payload.get("version", "").startswith("https://jsonfeed.org/version/") is False:
            raise TrapError("malformed_feed", "JSON payload is not a JSON Feed")
        title = payload.get("title") if isinstance(payload.get("title"), str) else None
        canonical = payload.get("home_page_url") if isinstance(payload.get("home_page_url"), str) else None
        return "json", title, canonical

    try:
        root = SafeET.fromstring(body)
    except Exception as exc:
        raise TrapError("malformed_feed", f"XML parse error: {exc}") from exc

    root_name = local_name(str(root.tag))
    if root_name == "rss":
        channel = next((child for child in list(root) if local_name(str(child.tag)) == "channel"), root)
        title = find_child_text(channel, {"title"})
        canonical = find_child_text(channel, {"link"})
        return "rss", title, canonical
    if root_name == "rdf":
        title = find_child_text(root, {"title"})
        return "rss1", title, None
    if root_name == "feed":
        title = find_child_text(root, {"title"})
        canonical = None
        for child in list(root):
            if local_name(str(child.tag)) == "link" and child.attrib.get("rel", "alternate") == "alternate":
                canonical = child.attrib.get("href")
                if canonical:
                    break
        return "atom", title, canonical

    raise TrapError("malformed_feed", f"unexpected root element: <{root_name}>")


def fetch_one(url: str, timeout: float, max_bytes: int, max_redirects: int, user_agent: str) -> TrapCheckResult:
    result = TrapCheckResult(url=url)
    try:
        current = normalize_url(url)
        visited: Set[str] = set()
        opener = urllib.request.build_opener(NoRedirectHandler)

        for hop in range(max_redirects + 1):
            current = normalize_url(current)
            duplicate_key = canonicalize_for_duplicate(current)
            if duplicate_key in visited:
                result.has_duplicate_redirect = True
                raise TrapError("redirect_loop", f"redirect loop detected at {current}")
            visited.add(duplicate_key)
            result.redirect_chain.append(current)
            resolve_public_addresses(urllib.parse.urlsplit(current).hostname or "", urllib.parse.urlsplit(current).port or 443)

            request = urllib.request.Request(current, headers={"User-Agent": user_agent, "Accept": ", ".join(sorted(ALLOWED_CONTENT_TYPES))})
            try:
                response = opener.open(request, timeout=timeout)
            except urllib.error.HTTPError as exc:
                response = exc

            result.status_code = getattr(response, "status", None) or response.getcode()
            if result.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("Location")
                if not location:
                    raise TrapError("redirect", "redirect response has no Location header")
                if hop == max_redirects:
                    raise TrapError("redirect_limit", f"exceeded {max_redirects} redirects")
                current = urllib.parse.urljoin(current, location)
                continue

            result.canonical_url = canonicalize_for_duplicate(current)
            result.content_type = content_type_header(response.headers.get("Content-Type"))
            if result.content_type and result.content_type not in ALLOWED_CONTENT_TYPES and not result.content_type.endswith("+xml"):
                raise TrapError("content_type", f"unsupported content type: {result.content_type}")
            length = response.headers.get("Content-Length")
            if length and int(length) > max_bytes:
                raise TrapError("response_limit", f"Content-Length exceeds {max_bytes} bytes")
            body = read_bounded(response, max_bytes)
            result.bytes_read = len(body)
            result.feed_type, result.feed_title, result.feed_canonical_url = parse_feed_payload(body, result.content_type)
            if result.feed_canonical_url:
                result.feed_canonical_url = canonicalize_for_duplicate(urllib.parse.urljoin(current, result.feed_canonical_url))
                result.canonical_url = result.feed_canonical_url
            result.redirect_count = len(result.redirect_chain) - 1
            result.is_safe = True
            return result

        raise TrapError("redirect_limit", "redirect limit exceeded")
    except TrapError as exc:
        result.error_kind = exc.kind
        result.details = str(exc)
        result.redirect_count = max(0, len(result.redirect_chain) - 1)
        return result
    except (urllib.error.URLError, socket.timeout, TimeoutError, ValueError) as exc:
        result.error_kind = "network"
        result.details = str(exc)
        result.redirect_count = max(0, len(result.redirect_chain) - 1)
        return result
    except Exception as exc:
        result.error_kind = "error"
        result.details = str(exc)
        result.redirect_count = max(0, len(result.redirect_chain) - 1)
        return result


def collect_urls(positional: Sequence[str], filename: Optional[str], use_stdin: bool) -> List[str]:
    values = list(positional)
    if filename:
        with open(filename, "r", encoding="utf-8") as handle:
            values.extend(line.strip() for line in handle if line.strip() and not line.lstrip().startswith("#"))
    if use_stdin:
        values.extend(line.strip() for line in sys.stdin if line.strip() and not line.lstrip().startswith("#"))
    if not values:
        raise TrapError("input", "provide at least one URL, --file, or --stdin")
    if len(values) > 500:
        raise TrapError("input", "maximum batch size is 500 URLs")
    return values


def find_duplicates(results: Sequence[TrapCheckResult]) -> Dict[str, List[str]]:
    groups: Dict[str, List[str]] = {}
    for result in results:
        if not result.canonical_url:
            continue
        groups.setdefault(result.canonical_url, []).append(result.url)
    return {canonical: urls for canonical, urls in groups.items() if len(urls) > 1}


def build_report(results: Sequence[TrapCheckResult], duplicates: Dict[str, List[str]]) -> Dict[str, Any]:
    unsafe = [result for result in results if not result.is_safe]
    network_errors = [result for result in unsafe if result.error_kind == "network"]
    return {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total": len(results),
        "safe": len(results) - len(unsafe),
        "unsafe_or_invalid": len(unsafe),
        "network_errors": len(network_errors),
        "canonical_duplicates": duplicates,
        "results": [asdict(result) for result in results],
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Audit feed URLs for SSRF, redirect, malformed-feed, and canonical-duplicate traps.")
    parser.add_argument("urls", nargs="*", help="feed URLs")
    parser.add_argument("--file", "-f", help="file containing one URL per line")
    parser.add_argument("--stdin", action="store_true", help="read URLs from stdin")
    parser.add_argument("--json", metavar="PATH", help="write machine-readable report to PATH, or '-' for stdout")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT)
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--max-redirects", type=int, default=DEFAULT_MAX_REDIRECTS)
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--user-agent", default="OnlyDevs-TrapDetector/2.0")
    args = parser.parse_args(argv)

    if args.timeout <= 0 or args.max_bytes <= 0 or args.max_redirects < 0 or not 1 <= args.concurrency <= 32:
        parser.error("timeout/max-bytes must be positive; concurrency must be between 1 and 32")

    try:
        urls = collect_urls(args.urls, args.file, args.stdin)
    except (OSError, TrapError) as exc:
        print(f"Input error: {exc}", file=sys.stderr)
        return 64

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [pool.submit(fetch_one, url, args.timeout, args.max_bytes, args.max_redirects, args.user_agent) for url in urls]
        results = [future.result() for future in futures]

    duplicates = find_duplicates(results)
    report = build_report(results, duplicates)

    if args.json:
        encoded = json.dumps(report, indent=2, sort_keys=True)
        if args.json == "-":
            print(encoded)
        else:
            with open(args.json, "w", encoding="utf-8") as handle:
                handle.write(encoded + "\n")

    for result in results:
        label = "SAFE" if result.is_safe else "TRAP/ERROR"
        print(f"[{label}] {result.url}")
        print(f"  Type: {result.feed_type or '-'} | Status: {result.status_code or '-'} | Bytes: {result.bytes_read}")
        print(f"  Hops: {result.redirect_count} | Canonical: {result.canonical_url or '-'}")
        if result.feed_title:
            print(f"  Title: {result.feed_title}")
        if result.details:
            print(f"  [{result.error_kind}] {result.details}")

    if duplicates:
        print("\n[!] CANONICAL DUPLICATES")
        for canonical, originals in duplicates.items():
            print(f"  {canonical}")
            for original in originals:
                print(f"    - {original}")

    if any(not result.is_safe and result.error_kind != "network" for result in results) or duplicates:
        return 1
    if any(not result.is_safe for result in results):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
