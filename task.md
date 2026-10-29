# Project Tasks & Roles

## Task 1: UI/UX Aesthetics, Design System & Interactive View Layer
Skills: frontend-design, ui-ux-pro-max, emil-design-eng, shadcn-ui, high-end-visual-design, animate

### Objective
Lead all visual design, typography, micro-interactions, responsive layouts, and reading aesthetics for the Small Web Reader. Create an opinionated, distraction-free reading experience following Emil Kowalski's design engineering principles and shadcn/ui design standards.

### Strict File Ownership (NO CONFLICTS)
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/subscriptions/page.tsx`
- `src/app/discover/page.tsx`
- `src/app/read/[id]/page.tsx`
- `src/components/Sidebar.tsx`
- `src/components/ThemeToggle.tsx`
- `src/components/ReadingControls.tsx`
- `src/components/FeedGraphVisualizer.tsx`
- `src/components/Modal.tsx`
- `src/components/ArticleCard.tsx`

---

## Task 4: Backend Proxy, Turso Database & Advanced Anonymous Discovery Engine
Skills: backend-security-coder, upstash-ratelimit-js, safe-refactor, surgical-patch, performance-optimization, security-and-hardening, code-review-and-quality

### Summary of Responsibilities
1. `src/routes/fetch.ts`: Stateless CORS fetch proxy with strict SSRF defenses, conditional caching (`ETag`/`If-Modified-Since`), and robots.txt checking.
2. `src/db/turso.ts` & `src/db/seed_turso.ts`: `@libsql/client` setup (Singapore `sin` region), automated migrations, and auto-seeding 12 blogs & batches for demo day.
3. `src/routes/discovery.ts`: Anonymous subscription batch submission with URL normalization, co-subscription recommendations with reasons, popular feeds, and blogroll edge graph API.
4. `src/middleware/rateLimit.ts`: Multi-tier abuse resistance (Upstash sliding window + Turso fallback + salted hourly IP hashing).
5. `src/middleware/robots.ts`: Robots.txt parser and upstream politeness cache.
6. `scripts/detect_trap.py`: Python CLI utility to detect duplicate redirect loops, XML parse traps, and canonical duplicates in mentor seed lists.
