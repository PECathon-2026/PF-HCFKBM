# OnlyDevs

OnlyDevs is a privacy-first, offline-first RSS and Atom reader for independent publications.

## Architecture

- **Browser:** React/Next.js client, RSS/Atom parsing, Mozilla Readability extraction, DOMPurify sanitization, Dexie/IndexedDB persistence, reading state, bookmarks, OPML, and discovery consent.
- **Fetch proxy:** `src/app/fetch/route.ts` fetches raw public feed/article responses. It does not parse or persist content. URLs are checked for SSRF, redirects, response type, timeout, and response size.
- **Discovery:** `/api/discovery/*` stores only normalized feed URLs, anonymous batch relationships, and short-lived salted IP hashes. It never receives article content or reading history.
- **Offline:** `public/sw.js` caches the shell and static assets. `/offline.html` reads cached stories from IndexedDB for offline deep links.

## Local setup

```bash
npm install
npm run dev
```

Required server configuration:

```env
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
IP_SALT=<long-random-secret>
```

Optional shared rate limiting:

```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

Redis is optional. When absent, the Next.js discovery routes use the Turso rate-limit table. The standalone Express server also has a Turso fallback.

Never commit `.env` files or real credentials. Rotate any credential that has been exposed.

## Privacy and threat model

OnlyDevs has no accounts and does not need a persistent user identifier. Anonymous discovery is opt-in. A submission contains a normalized set of subscription URLs as one batch. The server does not receive article reads, bookmarks, extracted content, or browser-local IDs.

Defenses include:

- HTTP(S)-only URLs
- Private, loopback, link-local, metadata, and internal-hostname rejection
- Parameterized SQL
- Batch and body-size limits
- Per-route rate limiting
- Salted, rotating IP hashes
- Generic production error responses
- Sanitized cached and extracted article HTML
- Redirect validation and bounded proxy responses

Accepted limitations:

- Public discovery data can be queried by anyone.
- Anonymous batches can be noisy or malicious; rate limiting and normalized batch cardinality reduce abuse but do not prove identity.
- A story must be opened while online before its full extracted article is available offline.

## Offline demo

1. Open OnlyDevs over HTTPS while online.
2. Refresh once after deployment so the service worker activates.
3. Wait for the timeline to sync.
4. Open an article and wait for full extraction to finish.
5. Turn off the network.
6. Reload the timeline or open the cached article again.

The timeline, reader content, read state, bookmarks, and reading position are stored locally. New feeds and uncached article extraction require connectivity.

## Demo and edge cases

Try a valid RSS feed, Atom feed, a site URL requiring autodiscovery, malformed XML, a dead feed, duplicate feed URLs, an OPML import, and an article whose feed only contains a summary. The reader retains the summary when Readability cannot extract a full article.

## Verification

```bash
npm run typecheck
npm run test
NODE_ENV=production npm run build
```

The build must pass before deployment. Test the deployed service worker with browser DevTools in Offline mode, including a direct `/read/<cached-id>` deep link.
