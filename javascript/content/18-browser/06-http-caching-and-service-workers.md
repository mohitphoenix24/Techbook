---
title: HTTP caching and Service Workers
level: advanced
time: 40
summary: How HTTP caching works (Cache-Control, ETag, conditional requests, 304, immutable assets), cache busting with hashed file names, CDNs, and Service Workers: lifecycle, caching strategies, offline support and the pitfalls.
---

## Why caching matters

The fastest request is the one **never made**. Caching reduces latency, server load and data use. There are layers: the **browser cache**, **service worker caches**, **CDN/proxy caches**, and **server-side caches** (Redis, in-memory).

## Cache-Control: the main header

```
Cache-Control: public, max-age=31536000, immutable
Cache-Control: no-cache
Cache-Control: no-store
Cache-Control: private, max-age=0, must-revalidate
Cache-Control: public, max-age=60, stale-while-revalidate=600
```

| Directive | Meaning |
|---|---|
| **`max-age=N`** | the response is **fresh** for N seconds: use it **without asking the server** |
| **`no-cache`** | you **may store** it, but you **must revalidate** with the server before each use (confusing name!) |
| **`no-store`** | **do not store at all** (sensitive data) |
| **`private`** | only the user's browser may cache it (not shared CDNs) |
| **`public`** | CDNs/proxies may cache it too |
| **`s-maxage=N`** | like `max-age`, but for **shared** caches (CDN) only |
| **`must-revalidate`** | once stale, **must** revalidate (do not serve stale) |
| **`immutable`** | will **never change** during its freshness lifetime: do not even revalidate on reload |
| **`stale-while-revalidate=N`** | serve a **stale** copy immediately while fetching a fresh one in the background |
| **`stale-if-error=N`** | serve stale if the origin fails |

## Revalidation: ETag and 304

When a cached response is **stale** (or `no-cache`), the browser asks the server **"has it changed?"** with a **conditional request**. If not, the server replies **`304 Not Modified`** with **no body**: a tiny response.

```
First request:                             Later (stale) request:
GET /data.json                             GET /data.json
                                           If-None-Match: "v42"          ← the ETag the browser has
200 OK
ETag: "v42"                                304 Not Modified              ← no body: reuse the cached copy
Cache-Control: max-age=60
Last-Modified: Tue, 14 Jan 2025 ...        (or If-Modified-Since / Last-Modified)
```

```js run node title="ETag, If-None-Match and 304 with a real server"
const http = require("node:http");
const crypto = require("node:crypto");

const data = JSON.stringify({ items: ["tea", "coffee"] });
const etag = '"' + crypto.createHash("sha1").update(data).digest("hex").slice(0, 12) + '"';

const server = http.createServer((req, res) => {
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "no-cache");                        // always revalidate, but allow storing
  if (req.headers["if-none-match"] === etag) return res.writeHead(304).end();   // unchanged: no body
  res.writeHead(200, { "Content-Type": "application/json" }).end(data);
});

server.listen(0, async () => {
  const url = `http://127.0.0.1:${server.address().port}/`;

  const first = await fetch(url);
  const tag = first.headers.get("etag");
  console.log("1st:", first.status, tag, "| body bytes:", (await first.text()).length);

  const second = await fetch(url, { headers: { "If-None-Match": tag } });
  console.log("2nd:", second.status, "| body bytes:", (await second.text()).length, "<- 304 has no body");

  const third = await fetch(url, { headers: { "If-None-Match": '"stale"' } });
  console.log("3rd (wrong tag):", third.status);
  server.close();
});
```

## The classic strategy: hashed file names

Static assets (JS, CSS, images) change only when you deploy. So:

1. **Put a content hash in the file name**: `app.3f9a1c.js`, `styles.b72e4d.css` (bundlers do this).
2. Serve them with **`Cache-Control: public, max-age=31536000, immutable`** (one year).
3. **HTML** is served with **`no-cache`** (or a very short max-age), so the browser always gets the **newest HTML**, which points to the **newest hashed files**.

New deploy → new file names → new URLs → no stale cache problem ("**cache busting**"), and unchanged files stay cached forever.

| Resource | Typical headers |
|---|---|
| `index.html` | `Cache-Control: no-cache` (+ ETag) |
| `/assets/app.3f9a1c.js` | `public, max-age=31536000, immutable` |
| API JSON (public data) | `public, max-age=60, stale-while-revalidate=600` |
| API JSON (personal) | `private, no-cache` or `no-store` |
| Sensitive pages (banking) | `no-store` |

## How the browser decides

```
Request for URL
   │
   ├─ in cache and FRESH (age < max-age)?      → use it, no network
   │
   ├─ in cache but STALE (or no-cache)?        → conditional request (If-None-Match)
   │        ├─ 304 → use cached body (update freshness)
   │        └─ 200 → new body, replace the cache
   │
   └─ not in cache                            → normal request
```

Reloading (F5) revalidates; hard reload (Ctrl+Shift+R) bypasses the cache. The back/forward buttons use the cache liberally (**bfcache**: whole pages kept in memory).

## CDN caching

A **CDN** (Cloudflare, CloudFront, Fastly, Akamai) caches copies close to users. Use **`s-maxage`** for the CDN and `max-age` for browsers, send **`Vary`** for headers that change the response (`Accept-Encoding`, `Accept-Language`, `Origin`), and know how to **purge/invalidate**. Avoid caching personalised responses in shared caches (`private`).

## Service Workers

A **Service Worker (SW)** is a JavaScript file that the browser runs **in the background**, in its own thread, acting as a **programmable network proxy** between your page and the network. It enables **offline support**, **caching strategies**, **push notifications** and **background sync**: the core of a **PWA (Progressive Web App)**.

Facts:

- Works only on **HTTPS** (and `localhost`).
- **No DOM access**, no `localStorage`. It is **event-driven** and can be **stopped and restarted** by the browser at any time (do not keep state in variables).
- Controls pages **within its scope** (the folder it is served from).
- Everything is **asynchronous** (promises).

### Lifecycle

```viz algo=state title="Service worker lifecycle"
state parsed "Registered / downloaded" [initial] @0,1
state installing "Installing" @1,1
state waiting "Installed (waiting)" @2,0
state activating "Activating" @3,1
state activated "Activated (controls pages)" [final] @4,1
parsed -> installing : register()
installing -> waiting : install done (old SW still in control)
installing -> activating : install done (no old SW)
waiting -> activating : old SW released / skipWaiting()
activating -> activated : activate done
play: register(), install done (no old SW), activate done
```

```js
// app.js (the page)
if ("serviceWorker" in navigator) {
  const registration = await navigator.serviceWorker.register("/sw.js");
  registration.addEventListener("updatefound", () => console.log("a new version is installing"));
}

// sw.js (the service worker)
const CACHE = "static-v3";                                    // change the name when you ship new assets
const PRECACHE = ["/", "/offline.html", "/app.3f9a1c.js", "/styles.b72e4d.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));    // pre-cache the app shell
  self.skipWaiting();                                                              // optional: activate immediately
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);   // remove old caches
    await self.clients.claim();                                                         // take control of open pages
  })());
});

self.addEventListener("fetch", (event) => {                   // intercept every request from controlled pages
  event.respondWith(handle(event.request));
});
```

### Caching strategies

| Strategy | How | Best for |
|---|---|---|
| **Cache first** (cache falling back to network) | answer from cache, else fetch and store | versioned static assets, fonts |
| **Network first** (network falling back to cache) | try the network, use cache if it fails or is slow | API data that should be fresh but work offline |
| **Stale-while-revalidate** | return cache immediately, update it in the background | avatars, semi-static content, "fast now, fresh next time" |
| **Network only** | never cache | payments, analytics |
| **Cache only** | only precached | the app shell offline |

```js
async function handle(request) {
  const url = new URL(request.url);

  if (request.mode === "navigate") {                                       // pages: network first, offline page as a fallback
    try { return await fetch(request); }
    catch { return (await caches.match("/offline.html")); }
  }
  if (url.pathname.startsWith("/api/")) {                                   // API: stale-while-revalidate
    const cache = await caches.open("api-v1");
    const cached = await cache.match(request);
    const network = fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()); return response; });
    return cached || network;                                              // serve stale now, refresh in the background
  }
  return (await caches.match(request)) || fetch(request);                   // assets: cache first
}
```

Libraries: **Workbox** (Google) provides these strategies and precaching in a few lines.

```js run title="Cache strategies as plain functions (testable without a browser)"
// a Map stands in for the Cache API, and an async function for fetch()
const cache = new Map();
let networkCalls = 0;
const network = async (url) => { networkCalls++; await new Promise((r) => setTimeout(r, 10)); return `fresh:${url}`; };

const cacheFirst = async (url) => { if (cache.has(url)) return cache.get(url); const r = await network(url); cache.set(url, r); return r; };
const networkFirst = async (url, online) => { try { if (!online) throw new Error("offline"); const r = await network(url); cache.set(url, r); return r; } catch { return cache.get(url) ?? "offline page"; } };
const staleWhileRevalidate = async (url) => { const stale = cache.get(url); const refresh = network(url).then((r) => cache.set(url, r)); return stale ?? (await refresh, cache.get(url)); };

(async () => {
  console.log(await cacheFirst("/a.js"), await cacheFirst("/a.js"), "| network calls:", networkCalls);
  console.log(await networkFirst("/api", true), await networkFirst("/api", false), await networkFirst("/other", false));
  cache.set("/img.png", "stale-image");
  console.log(await staleWhileRevalidate("/img.png"), "<- served stale at once");
  await new Promise((r) => setTimeout(r, 30));
  console.log("later:", cache.get("/img.png"), "<- updated in the background");
})();
```

### Pitfalls

- **Updates:** a new SW waits until all tabs using the old one close (unless `skipWaiting`). Show an "update available, reload" prompt.
- **A bad SW can break your site** for returning users and is hard to remove. Always ship a **kill switch** plan (an SW that unregisters itself) and version your caches.
- **Do not cache everything:** respect `Cache-Control`, avoid caching authenticated or POST responses, and **limit cache size**.
- SW scripts themselves are fetched with `Cache-Control: no-cache`-like behaviour (checked every 24 hours at most); do not give `sw.js` a long cache lifetime.
- Debug in DevTools → **Application → Service Workers** (offline toggle, update on reload, unregister) and **Cache Storage**.

:::interview How does HTTP caching work? Explain Cache-Control, ETag and how you would cache a single-page app.
"`Cache-Control: max-age` makes a response fresh so the browser reuses it without contacting the server; `no-cache` means store it but revalidate every time; `no-store` means never store; `private` and `public` control shared caches. When stale, the browser sends a conditional request with `If-None-Match` using the ETag, and the server answers `304 Not Modified` with no body if unchanged. For a SPA, I serve the JS and CSS with content hashes in their names and `max-age=31536000, immutable`, and the HTML with `no-cache`, so every deploy changes the URLs and old files stay cached; APIs get short `max-age` with `stale-while-revalidate` for public data, and `private` or `no-store` for personal data. A service worker adds offline support through strategies like cache first, network first and stale-while-revalidate, with versioned caches cleaned up in `activate`."
:::

## More interview questions on this topic

:::qa What is the difference between `no-cache` and `no-store`? {level=easy}
**Say this:** "`no-cache` allows storing but requires revalidation before reuse; `no-store` forbids storing the response at all, for sensitive data."

**In simple words:** no-cache = "check with me first". no-store = "do not keep a copy".
:::

:::qa How do you make sure users get the new JavaScript after a deploy? {level=medium}
**Say this:** "Content-hashed file names for assets with long immutable caching, and `no-cache` on the HTML that references them, so a new deploy changes the URLs. A service worker needs its own update flow."

**In simple words:** New file names mean no old copy can be reused.
:::

:::qa What does stale-while-revalidate do? {level=medium}
**Say this:** "It serves the stale cached response immediately and, in the background, fetches a fresh one to update the cache for next time, so users get speed and eventual freshness."

**In simple words:** Show the old one now, fetch the new one quietly.
:::

:::qa Why must a service worker not rely on global variables? {level=hard}
**Say this:** "The browser can terminate an idle service worker at any time and restart it for the next event, losing in-memory state. Persist state in Cache Storage or IndexedDB."

**In simple words:** It may be switched off and on between events.
:::

```quiz
? What does a 304 response mean?
- The resource moved
+ The cached copy is still valid; no body is sent
- The request failed
> A conditional request found no change.
? Which header combination suits a hashed JS bundle?
- no-store
+ public, max-age=31536000, immutable
- no-cache
> The URL changes when the content changes.
? Which strategy gives the fastest response while refreshing data in the background?
- Network first
+ Stale-while-revalidate
- Network only
> Serve cached now, update for next time.
```

:::keypoints
- **Cache-Control**: `max-age`, `no-cache` (revalidate), `no-store`, `private`/`public`, `s-maxage`, `immutable`, `stale-while-revalidate`.
- **Revalidation**: `ETag` + `If-None-Match` → **304** with no body.
- **Hashed filenames + `immutable`** for assets; **`no-cache` for HTML**. CDN: `s-maxage`, `Vary`, purge.
- **Service Worker**: HTTPS, background thread, programmable proxy; lifecycle **install → waiting → activate**; strategies **cache first / network first / stale-while-revalidate**; version caches; handle updates; Workbox.
:::
