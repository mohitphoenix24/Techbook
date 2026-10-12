---
title: Build a URL Shortener Service
level: intermediate
time: 55
icon: route
cover: #9333ea,#f43f5e
tags: REST API, key generation, LRU cache, rate limiting, analytics pipeline
summary: Turn the most-asked design question into working code — a router with create and redirect handlers, then a two-instance service with key ranges from a key-generation service, scrambled keys, an LRU cache and a negative cache, per-IP token buckets, custom aliases with conflicts, expiring links, and an asynchronous click-analytics worker, driven by realistic traffic.
---

You've designed a URL shortener on a whiteboard; now build it and **measure** it. With a simulated workload you'll see how much the cache saves the database, what a scanning bot costs without a negative cache, and how rate limiting stops a spammer without affecting real users.

:::flow What you'll build
Router | POST /api/urls, GET /:key
Key generation | ID ranges per instance, scrambled to base62
Read path | LRU cache → DB; negative cache for unknown keys
Protection | token bucket per IP for link creation
Features | custom aliases (409 on conflict), expiry (410)
Analytics | click events queued, drained in batches
:::

## Step 1: the skeleton

A web framework is mostly a **router**: match the method and path, extract parameters, call a handler. Two handlers make the whole product: create a link, and redirect.

```js run title="A router with create and redirect"
// Step 1: the service skeleton — a tiny router, two handlers, an in-memory store
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const base62 = (n) => { let s = ""; do { s = ALPHABET[n % 62] + s; n = Math.floor(n / 62); } while (n > 0); return s.padStart(6, "0"); };

const db = new Map();                                   // key → { url, createdAt }
let counter = 916_132_832;                              // start at 62^5 so keys look less trivial

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`), handler });
function handle(method, path, body = {}) {             // what a web framework does for us
  for (const r of routes) {
    const m = r.method === method && path.match(r.re);
    if (m) return r.handler({ params: m.groups || {}, body });
  }
  return { status: 404, body: "no route" };
}

route("POST", "/api/urls", ({ body }) => {
  try { const u = new URL(body.url); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { return { status: 400, body: "invalid url" }; }
  const key = base62(counter++);
  db.set(key, { url: body.url, createdAt: Date.UTC(2026, 9, 12) });
  return { status: 201, body: { key, short: `https://sho.rt/${key}` } };
});
route("GET", "/:key", ({ params }) => {
  const rec = db.get(params.key);
  return rec ? { status: 302, headers: { Location: rec.url } } : { status: 404, body: "unknown link" };
});

const show = (m, p, b) => console.log(`${m} ${p}`.padEnd(24), JSON.stringify(handle(m, p, b)));
show("POST", "/api/urls", { url: "https://example.com/a/very/long/path?with=params" });
show("POST", "/api/urls", { url: "javascript:alert(1)" });
show("GET", "/100000");
show("GET", "/nope42");
```

Validate input at the edge: only `http(s)` URLs, never `javascript:` links (a shortener that redirects to scripts is an attack vector).

## Step 2: the complete service

Now two stateless instances behind a round-robin load balancer, sharing one database. Each instance takes **ID ranges** of 100 from the database (a key-generation service in production) and scrambles them into non-sequential keys. Redirects go through an **LRU cache**; unknown keys go into a **negative cache** so a bot scanning random keys doesn't hit the database every time. Click events go to an in-memory queue that an **analytics worker** drains in batches.

```js run title="The full service under 60,000 redirects, a spammer and a scanning bot"
// Step 2: the complete service — KGS ranges, LRU cache, negative cache, rate limits, aliases, expiry, async analytics
let seed = 77;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SPACE = 62 ** 6, MULT = 1_580_030_173;            // scramble ids so keys don't look sequential
const keyFor = (id) => { let n = Number((BigInt(id) * BigInt(MULT)) % BigInt(SPACE)), s = ""; for (let i = 0; i < 6; i++) { s = ALPHABET[n % 62] + s; n = Math.floor(n / 62); } return s; };
const clock = { now: 0 };

class Database {                                        // the source of truth (count calls = load on it)
  rows = new Map(); reads = 0; writes = 0; nextRange = 1;
  get(k) { this.reads++; return this.rows.get(k); }
  insertIfAbsent(k, row) { this.writes++; if (this.rows.has(k)) return false; this.rows.set(k, row); return true; }
  takeRange(n) { const start = this.nextRange; this.nextRange += n; return start; }   // UPDATE … RETURNING
}
class LRU {
  constructor(cap) { this.cap = cap; this.m = new Map(); this.hits = 0; this.misses = 0; }
  get(k) { if (!this.m.has(k)) { this.misses++; return undefined; } const v = this.m.get(k); this.m.delete(k); this.m.set(k, v); this.hits++; return v; }
  set(k, v) { this.m.delete(k); this.m.set(k, v); if (this.m.size > this.cap) this.m.delete(this.m.keys().next().value); }
}
class TokenBucket {                                     // per client: `rate` tokens per minute, burst `burst`
  constructor(rate, burst) { this.rate = rate; this.burst = burst; this.b = new Map(); }
  allow(id) {
    const s = this.b.get(id) || { tokens: this.burst, t: clock.now };
    s.tokens = Math.min(this.burst, s.tokens + ((clock.now - s.t) / 60_000) * this.rate); s.t = clock.now;
    this.b.set(id, s);
    if (s.tokens < 1) return false;
    s.tokens -= 1; return true;
  }
}

const db = new Database(), clicks = [], stats = { created: 0, conflicts: 0, limited: 0, gone: 0, notFound: 0, negHits: 0 };
class AppServer {                                       // stateless apart from caches and its key range
  constructor(name) { this.name = name; this.cache = new LRU(300); this.missing = new LRU(1000); this.range = null; }
  nextId() { if (!this.range || this.range.next === this.range.end) { const s = db.takeRange(100); this.range = { next: s, end: s + 100 }; } return this.range.next++; }
  create(ip, url, { alias, ttlMs } = {}) {
    if (!limiter.allow(ip)) { stats.limited++; return { status: 429 }; }
    const key = alias ?? keyFor(this.nextId());
    const row = { url, expiresAt: ttlMs ? clock.now + ttlMs : null };
    if (!db.insertIfAbsent(key, row)) { stats.conflicts++; return { status: 409 }; }
    this.missing.m.delete(key); stats.created++;
    return { status: 201, key };
  }
  redirect(key, visitor) {
    if (this.missing.get(key)) { stats.negHits++; stats.notFound++; return { status: 404 }; }   // known-bad key: skip the DB
    let row = this.cache.get(key);
    if (!row) {
      row = db.get(key);
      if (!row) { this.missing.set(key, true); stats.notFound++; return { status: 404 }; }
      this.cache.set(key, row);
    }
    if (row.expiresAt !== null && row.expiresAt <= clock.now) { stats.gone++; return { status: 410 }; }
    clicks.push({ key, visitor, t: clock.now });        // fire-and-forget; never blocks the redirect
    return { status: 302, location: row.url };
  }
}
const limiter = new TokenBucket(10, 10);                // 10 creations per minute per IP
const servers = [new AppServer("app-1"), new AppServer("app-2")];
let rr = 0;
const lb = () => servers[rr++ % servers.length];

// Analytics worker: drains click events in batches into per-link counters and unique-visitor sets
const analytics = new Map();
function drainClicks() {
  for (const c of clicks.splice(0, clicks.length)) {
    const a = analytics.get(c.key) || { clicks: 0, visitors: new Set() };
    a.clicks++; a.visitors.add(c.visitor); analytics.set(c.key, a);
  }
}

// 1) creation: 600 users create links; one spammer hammers the API
const keys = [];
for (let i = 0; i < 600; i++) { clock.now += 100; const r = lb().create(`10.0.${i % 200}.1`, `https://site${i}.example/page`); if (r.status === 201) keys.push(r.key); }
for (let i = 0; i < 200; i++) lb().create("6.6.6.6", "https://spam.example/" + i);
console.log("custom alias 'launch':", lb().create("10.9.9.9", "https://example.com/launch", { alias: "launch" }).status,
  "| again:", lb().create("10.9.9.8", "https://evil.example", { alias: "launch" }).status);
const promo = lb().create("10.9.9.7", "https://example.com/flash-sale", { ttlMs: 60_000 }).key;

// 2) traffic: 60,000 redirects with Zipf-like popularity, plus a bot scanning random keys
for (let i = 0; i < 60_000; i++) {
  clock.now += 2;
  const s = lb();
  if (i % 20 === 0) s.redirect(keyFor(5_000_000 + Math.floor(rand() * 300)), "bot");     // bot scanning a small key space
  else s.redirect(keys[Math.floor(Math.pow(rand(), 3) * keys.length)], `visitor${Math.floor(rand() * 5000)}`);
  if (i === 30_000) s.redirect(promo, "late-visitor");                                  // the promo has expired by now
  if (i % 1000 === 0) drainClicks();
}
drainClicks();

const hits = servers.reduce((s, x) => s + x.cache.hits, 0), misses = servers.reduce((s, x) => s + x.cache.misses, 0);
console.log(`links created ${stats.created}, alias conflicts ${stats.conflicts}, rate-limited creations ${stats.limited}`);
console.log(`redirect cache hit rate ${(100 * hits / (hits + misses)).toFixed(1)}%, DB reads ${db.reads} for ~60,000 redirects`);
console.log(`404s ${stats.notFound} (${stats.negHits} answered by the negative cache without touching the DB), 410 expired: ${stats.gone}`);
const top = [...analytics].sort((a, b) => b[1].clicks - a[1].clicks).slice(0, 3);
console.log("top links:", top.map(([k, a]) => `${k} ${a.clicks} clicks / ${a.visitors.size} unique`).join(" · "));
console.log(`key ranges handed out: ${db.nextRange - 1} ids in blocks of 100 (no per-request coordination)`);
```

## How it works

| Component | Here | In production |
|---|---|---|
| Router + handlers | regex routes | Express/Fastify/Spring; behind a load balancer |
| Key generation | ID ranges of 100 per instance, scrambled with a modular multiplier | a KGS or DB sequence handing out ranges; Snowflake-like IDs |
| Store | `Map` with conditional insert | DynamoDB/Cassandra conditional put, or SQL `INSERT … ON CONFLICT DO NOTHING` |
| Read cache | per-instance LRU (300 links) | Redis cluster (shared) + small in-process caches for viral links |
| Negative cache | per-instance LRU of unknown keys | the same, or a Bloom filter of existing keys |
| Rate limiting | token bucket per IP, in memory | Redis-backed limiter at the gateway |
| Analytics | array queue drained every 1,000 requests | Kafka → stream processor → OLAP store; HyperLogLog for uniques |

:::exercise Extend it
1. Replace the two per-instance caches with **one shared cache** and compare the hit rate and DB reads. When is a shared cache better, and what does it cost?
2. Replace the negative cache with a **Bloom filter** of all existing keys, sized for 1% false positives.
3. Count unique visitors with a small **HyperLogLog** instead of a `Set` and compare memory and error.
4. Add a `DELETE /api/urls/:key` for owners and make sure **both** caches stop serving the link (what happens on the other instance?).
5. Make the analytics worker **crash** midway through a batch and make the counts correct anyway (idempotent events with ids).
:::

:::keypoints
- The product is two handlers; the engineering is in the **read path** (cache, negative cache), **key generation** (ranges, scrambling) and **protection** (validation, rate limits).
- Range-based key generation avoids per-request coordination; conditional inserts make aliases safe (409 on conflict).
- A skewed workload makes a small cache very effective; **negative caching** stops scanners from reaching the database.
- Analytics stay off the hot path: enqueue an event and return the 302 immediately.
:::
