---
title: Cookies, localStorage, sessionStorage and IndexedDB
level: intermediate
time: 30
summary: The browser storage options compared (size, lifetime, who can read them, sent to server or not), cookie attributes (HttpOnly, Secure, SameSite), how to use Web Storage safely, IndexedDB and the Cache API, and what to store where (never tokens in localStorage).
---

## The options at a glance

| | **Cookie** | **localStorage** | **sessionStorage** | **IndexedDB** | **Cache API** |
|---|---|---|---|---|---|
| Size | about **4 KB** each (about 50 per domain) | about **5 to 10 MB** | about 5 to 10 MB | **hundreds of MB to GBs** (quota) | quota (large) |
| Lifetime | until `Expires`/`Max-Age`, or session | **until cleared** (permanent) | until the **tab** closes | until cleared | until cleared |
| Sent to the server? | **Yes, automatically with every request** to its domain | No | No | No | No |
| Readable by JavaScript? | Yes, unless **`HttpOnly`** | Yes | Yes | Yes | Yes (and Service Workers) |
| API | `document.cookie` (awkward), `Set-Cookie` header, Cookie Store API | sync, key/value **strings** | sync, key/value strings | **async**, transactional, structured data, indexes | async, `Request` → `Response` |
| Shared between tabs | Yes | **Yes** (`storage` event) | **No** (per tab) | Yes | Yes |
| Typical use | **sessions**, auth, server-readable preferences | UI settings, small caches, drafts | wizard step state, per-tab data | offline apps, big data, files/blobs | offline assets for PWAs |

:::warn Never store sensitive data in localStorage or sessionStorage
Any JavaScript running on your page, including **XSS** payloads and compromised third-party scripts, can read them. **Do not store authentication tokens (JWTs), personal data or secrets there.** Use **`HttpOnly` cookies** for session credentials.
:::

## Cookies

A cookie is a small piece of data the **server sets** (`Set-Cookie` header) and the **browser sends back** on every request to that site.

```
HTTP/1.1 200 OK
Set-Cookie: sid=abc123; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax
```

| Attribute | Meaning | Why it matters |
|---|---|---|
| **`HttpOnly`** | JavaScript **cannot read** it (`document.cookie` does not show it) | protects the session cookie from **XSS theft** |
| **`Secure`** | sent **only over HTTPS** | prevents sniffing on plain HTTP |
| **`SameSite=Strict`** | only sent for requests from **the same site** | strongest **CSRF** defence; breaks links from other sites logging you in |
| **`SameSite=Lax`** (browser default) | also sent on **top-level navigations** (clicking a link) with safe methods, but **not** on cross-site POST/iframes/fetch | good default CSRF protection |
| **`SameSite=None; Secure`** | sent on **all** cross-site requests | needed for embeds and third-party contexts (must be `Secure`) |
| **`Domain`** | which hosts get it (`Domain=example.com` includes subdomains) | omit it to restrict to the exact host |
| **`Path`** | URL prefix | |
| **`Max-Age` / `Expires`** | lifetime; without it: a **session cookie** (deleted when the browser closes) | |
| **`__Host-` prefix** | requires `Secure`, `Path=/`, no `Domain`: locked to the exact host | strongest binding |
| **`Partitioned`** (CHIPS) | third-party cookie isolated per top-level site | the future of cross-site embeds |

```js run title="Parse and build cookie strings (what document.cookie / Cookie header look like)"
function parseCookies(header) {
  return Object.fromEntries(header.split(/;\s*/).filter(Boolean).map((pair) => {
    const i = pair.indexOf("=");
    return [decodeURIComponent(pair.slice(0, i)), decodeURIComponent(pair.slice(i + 1))];
  }));
}

function serializeCookie(name, value, { maxAge, path = "/", httpOnly, secure, sameSite = "Lax", domain } = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, `Path=${path}`];
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  if (domain) parts.push(`Domain=${domain}`);
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  parts.push(`SameSite=${sameSite}`);
  return parts.join("; ");
}

console.log(parseCookies("theme=dark; lang=en%2DIN; cart=%7B%22items%22%3A2%7D"));
console.log(serializeCookie("sid", "abc 123", { maxAge: 3600, httpOnly: true, secure: true }));
```

In the browser: `document.cookie = "theme=dark; Max-Age=31536000; Path=/; SameSite=Lax"`. Setting one cookie at a time; reading gives **all non-HttpOnly cookies as one string**. The newer **Cookie Store API** (`await cookieStore.set(...)`) is cleaner.

Cookies are **sent with every request**, including images and CSS from the same domain. Big cookies slow every request: keep them small, and serve static files from a **cookieless domain** or a CDN.

## Web Storage: localStorage and sessionStorage

```js
localStorage.setItem("theme", "dark");              // stores STRINGS only
localStorage.getItem("theme");                       // "dark" (or null)
localStorage.removeItem("theme");
localStorage.clear();
localStorage.length; localStorage.key(0);

// objects must be serialised
localStorage.setItem("prefs", JSON.stringify({ lang: "en", fontSize: 16 }));
const prefs = JSON.parse(localStorage.getItem("prefs") ?? "{}");

// other tabs are notified (not the tab that made the change):
window.addEventListener("storage", (e) => console.log(e.key, e.oldValue, e.newValue));
```

Gotchas:

- **Synchronous** and on the main thread: large reads/writes can jank the UI.
- **Strings only**: `localStorage.setItem("n", 5)` stores `"5"`. `JSON.parse(null)` is `null` and `JSON.parse(undefined)` throws.
- **Can throw**: private mode in some browsers, **quota exceeded**, or disabled storage. Always wrap in `try/catch`.
- Same-origin only (**scheme + host + port**). No expiry (store a timestamp yourself).
- **Not available** in Web Workers (use IndexedDB) and server-side rendering (`typeof window !== "undefined"`).

```js run title="A safe storage wrapper: JSON, TTL, try/catch, and a fallback in memory"
function createStore(storage, prefix = "app:") {
  const memory = new Map();                                       // fallback when storage is unavailable or full
  return {
    set(key, value, ttlMs) {
      const record = JSON.stringify({ value, expires: ttlMs ? Date.now() + ttlMs : null });
      try { storage.setItem(prefix + key, record); } catch { memory.set(prefix + key, record); }
    },
    get(key, fallback = null) {
      let raw;
      try { raw = storage.getItem(prefix + key); } catch { /* ignore */ }
      raw ??= memory.get(prefix + key) ?? null;
      if (raw === null) return fallback;
      try {
        const { value, expires } = JSON.parse(raw);
        if (expires && Date.now() > expires) { this.remove(key); return fallback; }
        return value;
      } catch { return fallback; }                                // corrupted data
    },
    remove(key) { try { storage.removeItem(prefix + key); } catch {} memory.delete(prefix + key); },
  };
}

// a stand-in for window.localStorage, so this can run anywhere (it throws like a full quota would)
const fakeStorage = (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { if (v.length > 60) throw new DOMException("quota", "QuotaExceededError"); m.set(k, String(v)); }, removeItem: (k) => m.delete(k) }; })();

const store = createStore(fakeStorage);
store.set("prefs", { theme: "dark" });
store.set("big", "x".repeat(200));                                // too big: falls back to memory instead of crashing
console.log(store.get("prefs"), store.get("big").length, store.get("missing", "default"));
store.set("short", 1, -1);                                        // already expired
console.log(store.get("short", "expired"));
```

## IndexedDB: a real database in the browser

For **large or structured data**, **offline apps**, and **Blobs**. It is **asynchronous** and available in **Web Workers**. The raw API is verbose (request objects and events), so most people use a small wrapper such as **`idb`**, **Dexie**, or **localForage**.

```js
// with the "idb" helper library
import { openDB } from "idb";

const db = await openDB("shop", 1, {
  upgrade(db) {                                              // runs when the version changes: create stores and indexes
    const orders = db.createObjectStore("orders", { keyPath: "id" });
    orders.createIndex("byStatus", "status");
  },
});

await db.put("orders", { id: 1, status: "pending", items: [{ sku: "TEA", qty: 2 }] });     // stores structured clones (objects, Dates, Blobs)
const order = await db.get("orders", 1);
const pending = await db.getAllFromIndex("orders", "byStatus", "pending");

const tx = db.transaction("orders", "readwrite");            // transactions are atomic
await Promise.all([tx.store.add({ id: 2, status: "paid" }), tx.done]);
```

Features: keys and **indexes**, **transactions**, cursors, versioned **schema migrations**, **structured-clone** values (Dates, Maps, Blobs, typed arrays), **quota** management (`navigator.storage.estimate()`, `navigator.storage.persist()` to avoid eviction).

## Cache API (with Service Workers)

Stores **`Request`/`Response`** pairs: the building block of **offline** support and PWAs (next lessons).

```js
const cache = await caches.open("static-v1");
await cache.addAll(["/", "/app.js", "/styles.css", "/offline.html"]);
const cached = await caches.match("/styles.css");            // a Response or undefined
```

## What should I store where?

| Data | Where |
|---|---|
| **Session id / auth for the server** | **`HttpOnly; Secure; SameSite` cookie** |
| Short-lived access token for an SPA calling APIs | in **memory** (a JS variable), refreshed through an `HttpOnly` refresh cookie |
| UI preferences (theme, language), non-sensitive | localStorage (or a cookie if the server needs it for SSR) |
| Per-tab temporary state | sessionStorage |
| Drafts, big caches, offline data | IndexedDB |
| Offline static assets and API responses | Cache API (Service Worker) |
| Anything secret or personal | **the server**, not the browser |

## Privacy and limits

- Browsers **block or partition third-party cookies** (Safari, Firefox; Chrome is moving to user choice and CHIPS). Do not depend on cross-site cookies; use **first-party** storage and server-side sessions.
- **Safari ITP** can delete script-written storage after 7 days without interaction.
- Storage can be **evicted** under pressure unless persisted; treat it as a **cache**, not a database of record.
- Laws (GDPR, DPDP Act in India, ePrivacy) require **consent** for non-essential cookies and tracking storage.

:::interview What are the differences between cookies, localStorage, sessionStorage and IndexedDB? Where should you store a JWT?
"Cookies are tiny, sent with every request to the domain, can be HttpOnly so scripts cannot read them, and are the standard way to keep a server session. localStorage is about 5 MB of string key-values, permanent, synchronous and readable by any script on the page. sessionStorage is the same but per tab and cleared when the tab closes. IndexedDB is an asynchronous transactional database for large structured data and offline use, also available in workers. I would not store a JWT or any secret in localStorage because XSS can steal it; I use an HttpOnly, Secure, SameSite cookie for the session or refresh token, and keep a short-lived access token in memory. I wrap Web Storage in try/catch and JSON helpers, because it can throw when full or disabled."
:::

## More interview questions on this topic

:::qa What do `HttpOnly`, `Secure` and `SameSite` do? {level=easy}
**Say this:** "`HttpOnly` hides the cookie from JavaScript (protects against XSS theft), `Secure` sends it only over HTTPS, `SameSite` limits sending it on cross-site requests (protects against CSRF)."

**In simple words:** Hide it from scripts, protect it in transit, and do not send it where it is not expected.
:::

:::qa Why is storing tokens in localStorage risky? {level=medium}
**Say this:** "Any script running in the page, such as injected XSS code or a compromised third-party library, can read localStorage and steal the token. An HttpOnly cookie cannot be read by JavaScript."

**In simple words:** localStorage is an open drawer for every script on the page.
:::

:::qa How do you share state between browser tabs? {level=medium}
**Say this:** "The `storage` event fires in other tabs when localStorage changes, or use `BroadcastChannel`, `SharedWorker`, or IndexedDB with change notification."

**In simple words:** The other tabs get a message.
:::

:::qa When would you choose IndexedDB over localStorage? {level=easy}
**Say this:** "For large amounts of data, structured objects, Blobs, indexed queries, transactions, offline use and use from workers; localStorage is synchronous, string-only and small."

**In simple words:** A database vs a sticky note.
:::

```quiz
? Which cookie attribute prevents JavaScript from reading a cookie?
- Secure
- SameSite
+ HttpOnly
> It protects the cookie from XSS theft.
? Which storage is cleared when the tab closes?
- localStorage
+ sessionStorage
- IndexedDB
> It lives for the tab's session.
? Where should a session token live?
- localStorage
+ An HttpOnly, Secure, SameSite cookie
- A global variable in every page
> Not readable by scripts.
```

:::keypoints
- **Cookie** (≈4 KB, sent to the server, `HttpOnly`/`Secure`/`SameSite`), **localStorage** (≈5 MB, permanent, sync, strings), **sessionStorage** (per tab), **IndexedDB** (large, async, structured), **Cache API** (Request/Response, offline).
- **Never store secrets or tokens in localStorage.** Use **HttpOnly + Secure + SameSite** cookies for sessions.
- Web Storage: **strings only**, **synchronous**, **can throw** (quota/private mode): wrap in `try/catch` + JSON helpers.
- Share across tabs with the **`storage` event** or `BroadcastChannel`. Treat client storage as a **cache** (it can be evicted).
- Third-party cookies are going away: design for **first-party** sessions; get **consent** where the law requires it.
:::
