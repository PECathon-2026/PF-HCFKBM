Skills: frontend-design, ui-ux-pro-max, emil-design-eng, shadcn-ui, high-end-visual-design, animate

# Task 1: UI/UX Aesthetics, Design System & Interactive View Layer

## Objective
Lead all visual design, typography, micro-interactions, responsive layouts, and reading aesthetics for the Small Web Reader. Create an opinionated, distraction-free reading experience following Emil Kowalski's design engineering principles and shadcn/ui design standards.

---

## 🔒 Strict File Ownership (NO CONFLICTS)
You are **exclusively responsible** for the following files. Do NOT touch any files outside this list:
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

## Requirements from Problem Statement (`referenceproject.md`)

### 1. Unified Timeline View (`src/app/page.tsx`, `src/components/ArticleCard.tsx`)
- Display chronological article stream with clean visual hierarchy.
- Filter pills: "All", "Unread", "Starred / Bookmarked", and per-feed tag filtering.
- Article card states: read (dimmed/opacity 75%), unread (prominent), starred (amber bookmark).
- Reading time badges ("4 min read"), source blog badge, author byline, and relative timestamp.
- Quick action buttons (Toggle Read, Toggle Bookmark, Open Full Article) with instant visual feedback.

### 2. Distraction-Free Reading Mode (`src/app/read/[id]/page.tsx`, `src/components/ReadingControls.tsx`)
- Minimalist reader interface inspired by iA Writer and Readwise Reader.
- Reading controls toolbar (sticky/floating):
  - Font size adjustment (`sm`, `base`, `lg`, `xl`).
  - Column width switch (`compact` 640px, `default` 768px, `wide` 900px).
  - Theme switcher: **Dark** (`hsl(224, 71%, 4%)`), **Sepia / Warm Paper** (`#fbf0d9` with `#433422` text), **Light** (`#ffffff`).
- Reading progress indicator: smooth top/bottom progress bar tracking scroll position.
- Graceful rendering of extracted article content and summary fallback alert banner.

### 3. Subscriptions Management View (`src/app/subscriptions/page.tsx`, `src/components/Modal.tsx`)
- Grid/list of active subscriptions showing feed title, domain, article count, and sync status badge (Active, Syncing, Stale).
- "Add Feed" modal dialog:
  - Clean URL input with auto-focus and instant format validation.
  - Category / Folder tag selector.
  - Micro-animated loading state (`animate-spin` on submit).
- Unsubscribe confirmation and re-sync trigger buttons.
- OPML import/export action buttons integrated into the header.

### 4. Anonymous Discover & Graph View (`src/app/discover/page.tsx`, `src/components/FeedGraphVisualizer.tsx`)
- Tabbed discovery experience:
  1. **Recommendations**: cards with transparent reason tags (e.g., *"Followed by readers of Changelog & Hacker News"*), match score percentages, and 1-click "Follow" action.
  2. **Popular Feeds**: ranked cards with leaderboard badges (#1, #2, #3), follower counts, and topic tags.
  3. **"Blogs Like This" Graph Visualizer**: interactive canvas/SVG container rendering feed co-occurrence nodes, category clusters, and interconnecting edges.

### 5. Design Engineering & Animation Polish (`src/app/globals.css`, `src/components/Sidebar.tsx`)
- Apply Emil Kowalski interaction rules:
  - All interactive buttons must have `:active { transform: scale(0.97); }` with `transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1)`.
  - Popovers and modals must scale from `scale(0.95)` with opacity rather than `scale(0)`.
  - Avoid layout thrashing: animate only `transform` and `opacity`.
- Collapsible responsive sidebar navigation with active route highlights and unread indicator counters.

---

## Verification Checklist
- [ ] `npm run typecheck` passes with zero type errors.
- [ ] `npm run build` succeeds without static page generation issues.
- [ ] Responsive design works across mobile (375px), tablet (768px), and desktop (1280px).
- [ ] Reading view themes (Dark, Sepia, Light) switch cleanly without flash of unstyled content.
- [ ] No file conflicts with Person 2 (Parsing) or Person 3 (Caching/Sync).
