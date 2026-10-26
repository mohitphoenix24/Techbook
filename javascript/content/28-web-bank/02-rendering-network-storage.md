---
title: "Web bank: rendering, loading, caching and storage"
level: medium
time: 35
summary: Fourteen answers on the critical rendering path, reflow and repaint, Core Web Vitals, resource loading, HTTP caching, service workers, cookies versus storage, CORS and fetch.
---

## Rendering and loading

:::qa What happens when you type a URL and press Enter? {level=medium}
**Say this:** "DNS lookup, TCP connection and TLS handshake (or QUIC for HTTP/3), the HTTP request, the server response, then the browser parses HTML into the DOM, fetches CSS and JavaScript, builds the CSSOM, combines them into a render tree, runs layout, paint and compositing. JavaScript may change the DOM and trigger more work."

**In simple words:** Find the address, connect safely, ask for the page, then build and draw it.
:::

:::qa What is the critical rendering path? {level=hard}
**Say this:** "The steps from bytes to pixels: HTML → DOM, CSS → CSSOM, both → render tree, then layout (sizes and positions), paint (pixels), and composite (layers). CSS blocks rendering, and synchronous JavaScript blocks parsing, so keep critical CSS small, defer scripts, and avoid blocking resources."

**In simple words:** The pipeline that turns code into what you see; anything blocking it delays the first view.
:::

:::qa What is the difference between reflow (layout) and repaint? {level=medium}
**Say this:** "Reflow recalculates sizes and positions when geometry changes (width, content, adding elements) and is expensive. Repaint redraws pixels when only appearance changes (colour) and is cheaper. `transform` and `opacity` changes can be handled by the compositor without layout or paint, which is why animations should use them."

**In simple words:** Moving walls is expensive; repainting a wall is cheaper; sliding a picture frame is cheapest.
:::

:::qa What are the Core Web Vitals? {level=medium}
**Say this:** "LCP (Largest Contentful Paint: loading speed, good under 2.5 s), INP (Interaction to Next Paint: responsiveness, good under 200 ms) and CLS (Cumulative Layout Shift: visual stability, good under 0.1). They are measured on real users and affect search ranking."

**In simple words:** How fast it shows, how fast it reacts, and how little it jumps.
:::

:::qa How do you load resources faster? {level=medium}
**Say this:** "Compress (Brotli/gzip), use a CDN, HTTP/2 or HTTP/3, cache well, split code and lazy-load routes, `defer` scripts, preload critical assets (`<link rel=preload>`), use responsive and modern images (`srcset`, AVIF/WebP, `loading='lazy'`), and inline critical CSS."

**In simple words:** Send less, send it closer, and send only what is needed first.
:::

## Caching and service workers

:::qa How does HTTP caching work? {level=medium}
**Say this:** "`Cache-Control: max-age=…` lets the browser reuse a response without asking; `no-cache` means revalidate every time; `no-store` means never store. `ETag`/`Last-Modified` allow conditional requests that return `304 Not Modified`. Fingerprinted assets (`app.3f2a.js`) get long cache times; HTML gets short or revalidation."

**In simple words:** Keep a copy for a while, and ask 'has it changed?' when it gets old.
:::

:::qa What is a service worker, and what can it do? {level=hard}
**Say this:** "A script running in the background, separate from the page, that intercepts network requests through the `fetch` event. It enables offline support, caching strategies (cache-first, network-first, stale-while-revalidate), push notifications and background sync. It needs HTTPS, has its own lifecycle (install, activate, update) and no DOM access."

**In simple words:** A helper between the page and the network that can answer from its own shelf.
:::

## Storage and network

:::qa Cookies, `localStorage`, `sessionStorage`, IndexedDB: when to use which? {level=medium}
**Say this:** "Cookies are sent with every request, small (about 4 KB) and can be `HttpOnly`: best for session IDs. `localStorage` is synchronous, string-only, about 5 MB, persistent, readable by any script on the origin (XSS risk). `sessionStorage` is the same but per tab. IndexedDB is asynchronous, large and structured: use it for offline data and big caches."

**In simple words:** Small automatic notes, small persistent notes, per-tab notes, and a proper database.
:::

:::qa What is CORS? {level=medium}
**Say this:** "Cross-Origin Resource Sharing is how a server tells the browser which other origins may read its responses. By default the same-origin policy blocks scripts from reading cross-origin responses. For 'non-simple' requests the browser sends a preflight `OPTIONS` request; the server answers with headers like `Access-Control-Allow-Origin`, `-Methods` and `-Headers`."

**In simple words:** The server says who may read its answers. It protects users, not the server.
:::

:::qa Why do I get a CORS error even though the server works in Postman? {level=medium}
**Say this:** "Postman is not a browser and does not enforce the same-origin policy. The browser requires the server to send the right CORS headers. Fix it on the server (allow the exact origin, handle `OPTIONS`, and with credentials use a specific origin, not `*`), not in the front-end code."

**In simple words:** Only browsers enforce this rule, so the fix belongs on the server.
:::

:::qa What is the difference between `fetch` and `XMLHttpRequest`, and what does `fetch` not do? {level=medium}
**Say this:** "`fetch` is promise-based and streams the body, and works with `AbortController`. It does **not** reject on HTTP error statuses (404, 500): check `response.ok`. It rejects only on network failure. It does not send cookies cross-origin unless `credentials: 'include'`."

**In simple words:** A 404 is still an answer, so you must check it yourself.
:::

:::qa HTTP/1.1 versus HTTP/2 versus HTTP/3? {level=hard}
**Say this:** "HTTP/1.1 needs several connections for parallel requests and suffers head-of-line blocking. HTTP/2 multiplexes many streams over one TCP connection with header compression, but one lost packet still stalls all streams. HTTP/3 runs over QUIC (UDP), so streams are independent and connection set-up is faster."

**In simple words:** One road with many lanes, then removing the shared traffic jam.
:::

:::qa WebSocket, Server-Sent Events or polling? {level=medium}
**Say this:** "Polling is simplest but wasteful. SSE is a one-way server-to-client stream over HTTP with automatic reconnect: good for feeds and notifications. WebSocket is a two-way persistent connection: chat, games, collaboration. Check proxies, scaling (sticky sessions or a pub/sub backplane), and reconnection."

**In simple words:** Keep asking, listen to a radio, or hold a phone call.
:::

:::keypoints
- Rendering: **DOM + CSSOM → render tree → layout → paint → composite**; animate with **transform/opacity**.
- **LCP, INP, CLS** are the Core Web Vitals.
- Caching: **fingerprint assets + long max-age**, HTML revalidates; **service workers** give offline.
- Storage: cookies (HttpOnly sessions), localStorage (small, XSS-readable), IndexedDB (large).
- **CORS is enforced by browsers**; fix it on the server. `fetch` does not reject on 404/500.
:::
