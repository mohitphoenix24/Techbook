---
title: "Advanced bank: frontend system design questions"
level: hard
time: 40
summary: Ten open design questions with a structure to answer them: autocomplete, infinite feed, chat, file upload, offline-first, data table, design system, micro frontends, performance plan and error monitoring.
---

**How to answer any of these.** Use the same six steps every time, and say them out loud:

1. **Requirements and scale**: users, devices, what is in and out of scope.
2. **Data and API**: shape of data, pagination, caching, real-time or polling.
3. **Components and state**: what is local, what is shared, what comes from the server.
4. **Performance**: what is slow, how you measure it, what you cache or defer.
5. **Failure and edge cases**: errors, offline, empty states, races, security.
6. **Accessibility and testing**: keyboard, screen readers, how you test and monitor.

:::qa Design an autocomplete / typeahead search box. {level=medium}
**Say this:** "Input debounced by about 150 ms. Cancel the previous request or ignore stale responses so an old answer never overwrites a new one. Cache recent queries (a Map or the HTTP cache), keep a minimum length, show loading and no-results states, and highlight matches. Accessibility: `role='combobox'`, `aria-expanded`, `aria-activedescendant`, arrow keys, Enter and Escape. On the back end, a trie or search index with ranking."

**In simple words:** Wait a moment, ask once, keep only the latest answer, and make it usable with the keyboard.
:::

:::qa Design an infinite-scroll news feed. {level=hard}
**Say this:** "Cursor-based pagination (not page numbers, since the feed changes). An `IntersectionObserver` on a sentinel loads the next page before the end. Virtualise the list so thousands of items do not stay in the DOM, with stable keys and reserved image sizes to avoid layout shift. Dedupe items, keep scroll position when navigating back, handle errors with a retry row, and prefetch images. Offer a 'new posts' banner instead of inserting at the top."

**In simple words:** Load the next batch just before the user reaches the end, and only draw what is on the screen.
:::

:::qa Design a real-time chat UI. {level=hard}
**Say this:** "WebSocket (or SSE plus POST) with reconnect and exponential backoff. Optimistic sends with a client ID, then reconcile with the server's message ID and show sent, delivered and failed states with retry. Order by server sequence number, load history with cursors upwards, keep scroll anchored at the bottom unless the user scrolled up, virtualise long lists, and show typing and presence with throttling. Handle offline queues and de-duplication."

**In simple words:** Show the message at once, confirm later, and never lose or duplicate a message.
:::

:::qa Design file upload with progress and resume. {level=hard}
**Say this:** "Split large files into chunks and upload them with a concurrency limit, with a checksum per chunk. Ask the server which chunks it already has, so a retry resumes. Use a progress bar from `XMLHttpRequest.upload.onprogress` or stream counters, allow cancel with `AbortController`, validate type and size on both sides, and consider direct-to-storage uploads with signed URLs."

**In simple words:** Cut the file into pieces, send the pieces, remember which arrived.
:::

:::qa Design an offline-first app. {level=hard}
**Say this:** "A service worker caches the app shell and assets; data goes to IndexedDB. Writes are queued locally (an outbox) and synced when online with idempotency keys, and conflicts are resolved by last-write-wins, field-level merges or CRDTs. Show clear sync status. Use stale-while-revalidate for reads and background sync where available."

**In simple words:** Save everything locally first, and sync when the network comes back.
:::

:::qa Design a data table with 100,000 rows, sorting and filtering. {level=hard}
**Say this:** "Prefer server-side sort, filter and pagination for big data, with debounced filter inputs. If it must be client-side, virtualise rows and columns, memoise row components, sort in a worker, and keep fixed row heights or measure lazily. Add column resizing, sticky headers, keyboard navigation and ARIA grid roles; keep selection state in a Set keyed by row ID."

**In simple words:** Only draw the visible rows, and let the server do the heavy filtering.
:::

:::qa Design a component library / design system. {level=hard}
**Say this:** "Design tokens for colour, spacing and type; primitive components with accessibility built in; a headless layer for behaviour and a styled layer for look. Versioned packages with semantic versioning, Storybook for documentation, visual regression and unit tests, tree-shakable exports, theming through CSS variables, and a clear contribution and deprecation process."

**In simple words:** Small, accessible building blocks that every team can trust and update.
:::

:::qa When would you choose micro frontends, and what are the risks? {level=hard}
**Say this:** "For many teams that must deploy independently on one product. Options: module federation, iframes, web components, or composition at the edge. Risks: duplicated dependencies and bundle size, inconsistent UX, shared state and routing complexity, and harder performance. For one or two teams, a well-structured monorepo is simpler."

**In simple words:** It solves team coordination problems, but adds technical cost.
:::

:::qa How would you improve the Core Web Vitals of a slow page? {level=hard}
**Say this:** "Measure first with field data (CrUX, RUM) and Lighthouse. LCP: optimise the hero image (size, format, `fetchpriority`, preload), reduce server time with caching or a CDN, inline critical CSS. INP: break up long tasks, defer non-critical JavaScript, reduce re-renders. CLS: reserve space for images, ads and fonts (`font-display`). Set a performance budget and add checks to CI."

**In simple words:** Find what is slow with real data, fix the biggest item, and prevent regressions.
:::

:::qa How would you set up error and performance monitoring for a web app? {level=medium}
**Say this:** "Capture exceptions and unhandled rejections with source maps (Sentry or similar), attach release, user session and breadcrumbs, report Web Vitals from real users, track API failures and slow endpoints, and set alerts on error rates with sampling. Redact personal data before sending."

**In simple words:** Know about problems before the users tell you.
:::

:::keypoints
- Use the **six steps**: requirements, data/API, components/state, performance, failures, accessibility/testing.
- Recurring tools: **debounce + abort**, **cursor pagination**, **virtualisation**, **optimistic UI with reconcile**, **outbox + idempotency**, **stale-while-revalidate**.
- Always mention **errors, empty states, races, accessibility and monitoring**.
:::
