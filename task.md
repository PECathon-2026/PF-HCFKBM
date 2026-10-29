Skills: backend-security-coder, upstash-ratelimit-js, safe-refactor, surgical-patch, performance-optimization, security-and-hardening, code-review-and-quality

# Task 4 (Assigned to User): Backend Proxy, Turso Database & Advanced Anonymous Discovery Engine

Refer to `tasks/task_person4_backend_discovery.md` for full requirements and specifications adhering strictly to `tasks/referenceproject.md`.

## Summary of Upgraded Responsibilities
1. `src/routes/fetch.ts`: Stateless CORS fetch proxy with strict SSRF defenses, conditional caching (`ETag`/`If-Modified-Since`), and robots.txt checking.
2. `src/db/turso.ts` & `src/db/seed_turso.ts`: `@libsql/client` setup (Singapore `sin` region), automated migrations, and auto-seeding 12 blogs & batches for demo day.
3. `src/routes/discovery.ts`: Anonymous subscription batch submission with URL normalization, co-subscription recommendations with reasons, popular feeds, and blogroll edge graph API.
4. `src/middleware/rateLimit.ts`: Multi-tier abuse resistance (Upstash sliding window + Turso fallback + salted hourly IP hashing).
5. `src/middleware/robots.ts`: Robots.txt parser and upstream politeness cache.
6. `scripts/detect_trap.py`: Python CLI utility to detect duplicate redirect loops, XML parse traps, and canonical duplicates in mentor seed lists.
