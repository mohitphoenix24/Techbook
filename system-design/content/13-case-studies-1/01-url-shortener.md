---
title: Design a URL Shortener (TinyURL / Bitly)
level: intermediate
time: 50
summary: The most-asked HLD question, end to end — requirements and estimates, API, the read-heavy redirect path with cache and CDN, key generation (hashing vs counters vs pre-generated keys), 301 vs 302, custom aliases and expiry, click analytics through a queue, and scaling the key–URL store.
---

:::problem Design a URL Shortener {level=medium tags="HLD,key generation,caching,read-heavy"}
Design a service like TinyURL or Bitly: users submit a long URL and get a short link (`sho.rt/aZ3k9Q`); visiting the short link redirects to the original. Support custom aliases, optional expiry, and click analytics.

:::hint Hint
Reads (redirects) vastly outnumber writes, and each redirect is a simple key lookup: cache aggressively. The interesting decision is how to generate short, unique keys at scale without a central bottleneck.
:::
:::

## 1. Requirements

**Functional**
1. Create a short URL for a long URL (optionally with a **custom alias** and an **expiry**).
2. Redirect a short URL to the long URL.
3. Basic **click analytics** (counts per link, per day, referrer/country).

**Non-functional**
- **Very read-heavy**: ~100 redirects per created link.
- Redirect latency **< 50 ms p99** (it's on the critical path of every click); highly **available** (a dead shortener breaks links everywhere).
- Short links are **unique** and, once created, **never point somewhere else**; durable.
- Keys reasonably short (≈ 7 characters) and not trivially enumerable.
- Analytics can be **eventually consistent** (minutes of delay is fine).

## 2. Estimates

Assume **100 M new links per month**, 100:1 read/write.

:::derive Traffic and storage
\text{writes} = 10^8 / (2.5 \times 10^6 \text{ s}) \approx 40/\text{s} \;(\text{peak} \sim 200/\text{s}) || a month ≈ 2.5 × 10⁶ s
\text{redirects} \approx 4{,}000/\text{s} \;(\text{peak} \sim 20{,}000/\text{s}) || 100× writes
\text{records over 10 years} = 10^8 \times 12 \times 10 = 1.2 \times 10^{10} ||
!\text{storage} \approx 1.2 \times 10^{10} \times 500\,\text{B} = 6\,\text{TB} || fits a few sharded nodes
:::

**Key length:** with base-62 (`[0-9a-zA-Z]`), 62⁷ ≈ 3.5 × 10¹² keys, enough for 12 billion links with lots of room (and 62⁶ ≈ 5.7 × 10¹⁰ would already be tight). **7 characters.**

**Conclusions:** writes are tiny; the redirect path must be served mostly from **cache/CDN**; the data fits easily in a sharded key-value store; the core design question is **key generation**.

## 3. API

```text
POST /v1/urls            {longUrl, customAlias?, expiresAt?}      → 201 {shortUrl, key}
                         409 if the alias is taken; Idempotency-Key header supported
GET  /{key}              → 302 Location: <longUrl>     (404 if unknown, 410 if expired)
GET  /v1/urls/{key}/stats?from=…&to=…                   → {clicks, byDay[], topReferrers[]}
DELETE /v1/urls/{key}    (owner only)
```

:::tip 301 or 302?
**301 Moved Permanently** is cached by browsers: repeat clicks never reach your servers. That's cheaper, but you **lose analytics** and can never change or expire the link for those users. **302 Found** (temporary) sends every click through your service: exact analytics, expiry and takedowns work. Bitly uses 301 for some cases and 302 for others; in an interview, choose **302** if analytics matter and say why.
:::

## 4. Data model

```text
urls (key-value / wide-column store, partition key = key)
  key           char(7)  PK          "aZ3k9Q2"
  long_url      text                 "https://example.com/very/long/…"
  owner_id      bigint   nullable
  created_at    timestamp
  expires_at    timestamp nullable

clicks (event stream → analytics store, not the hot path)
  key, ts, referrer, country, device
```

The access pattern is pure **key lookup**, so a key-value store (DynamoDB, Cassandra) or a sharded SQL table keyed by `key` both work. Uniqueness of `key` is enforced by the store (conditional insert / primary key).

## 5. High-level design

```viz algo=arch title="URL shortener"
user     Users [users]
cdn      CDN / edge | caches 302s briefly [cdn]
lb       Load balancer [lb]
red      Redirect service | read path [service*3]
wr       Write service | create links [service*2]
kgs      Key generation service | pre-generated key ranges [key]
cache    Cache | key → long URL [cache]
db       URL store | sharded by key [nosql]
q        Click events [stream]
ana      Analytics pipeline | aggregates [worker]
olap     Analytics store [chart]
--
user -> cdn : GET /aZ3k9Q2
cdn -> lb
user -> lb : POST /v1/urls
lb -> red
lb -> wr
wr -> kgs : take a key range
wr -> db : insert if absent
red -> cache
red -> db : on miss
red ~> q : click event
q ~> ana
ana -> olap
--
flow Create a short link
user > lb : POST /v1/urls {longUrl}.
lb > wr : The write service validates the URL (scheme, length, blocklist of malware domains).
wr > kgs : It takes the next key from its locally cached range (refilled 1,000 at a time).
wr > db : Conditional insert {key → longUrl}; returns sho.rt/aZ3k9Q2.
flow Redirect (cache hit)
user > cdn : GET sho.rt/aZ3k9Q2: the edge may answer directly for very hot links.
cdn > lb : Otherwise forward to the origin.
lb > red : The redirect service…
red > cache : …finds the key in Redis (~1 ms)…
red > q : …emits a click event asynchronously (never blocks the redirect)…
red > lb : …and returns 302 Location: https://example.com/…
```

- **Separate read and write services**: they scale differently (20K/s vs 200/s) and have different dependencies.
- The redirect path touches only **cache → (DB on miss)**; analytics are **fire-and-forget** events to a queue.

## 6. Deep dives

### Deep dive A: generating keys

| Approach | How | Pros | Cons |
|---|---|---|---|
| **Hash the URL** | base62 of the first bits of MD5/SHA-256(longUrl) | stateless; the same URL can map to the same key (dedup) | collisions on truncation → check and retry with a salt; same URL from different users shares a key |
| **Random key** | 7 random base62 chars | unguessable, no coordination | must check uniqueness (conditional insert); collisions rise slowly as the space fills |
| **Global counter + base62** | an auto-increment id encoded in base62 | no collisions, short keys | a single counter is a bottleneck/SPOF; keys are sequential and **guessable** |
| **Pre-allocated ranges** (KGS) | a key-generation service hands each writer a block of 1,000 counter values; writers encode locally | no per-request coordination, no collisions | blocks lost on crashes (gaps are fine); still sequential unless scrambled |
| **Pre-generated key pool** | offline job generates random unique keys into a table; writers pop batches | unguessable and collision-free at write time | an extra table and job to maintain |

A solid answer: **counter ranges from a KGS** (ZooKeeper/etcd or a DB row with `UPDATE … SET next = next + 1000 RETURNING`) for zero-collision writes, then **scramble** the counter with a reversible bijection (e.g. multiply by a large odd constant modulo 62⁷, or a format-preserving cipher) so keys look random. Custom aliases go through a conditional insert and fail with `409` if taken.

```js run title="Counter ranges + a scramble → short, unique, non-sequential keys"
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SPACE = 62n ** 7n;                                   // 3.5 trillion keys
const MULT = 1_580_030_173n;                               // odd and coprime with 62^7 → a bijection on [0, SPACE)
const toBase62 = (n) => { let s = ""; for (let i = 0; i < 7; i++) { s = ALPHABET[Number(n % 62n)] + s; n /= 62n; } return s; };
const scramble = (id) => (BigInt(id) * MULT) % SPACE;      // reversible with the modular inverse

// The key generation service hands out ranges; each writer encodes locally
class KeyRangeAllocator { #next = 1; take(size) { const start = this.#next; this.#next += size; return { start, end: start + size }; } }
class Writer {
  constructor(name, kgs) { this.name = name; this.kgs = kgs; this.range = kgs.take(1000); this.cur = this.range.start; }
  nextKey() { if (this.cur >= this.range.end) { this.range = this.kgs.take(1000); this.cur = this.range.start; } return toBase62(scramble(this.cur++)); }
}

const kgs = new KeyRangeAllocator();
const w1 = new Writer("writer-1", kgs), w2 = new Writer("writer-2", kgs);
console.log("writer-1:", [w1.nextKey(), w1.nextKey(), w1.nextKey()].join(" "));
console.log("writer-2:", [w2.nextKey(), w2.nextKey(), w2.nextKey()].join(" "), " (its range starts at 1001)");
const keys = new Set(); const w3 = new Writer("w3", kgs);
for (let i = 0; i < 50_000; i++) keys.add(w3.nextKey());
console.log("50,000 keys, all unique:", keys.size === 50_000);
```

### Deep dive B: making redirects fast

- **Cache-aside in Redis**: key → long URL, TTL of hours, LRU eviction. The working set is skewed (a few links get most clicks), so a modest cache gets a very high hit rate. Links are **immutable**, so invalidation is only needed on delete/expiry (delete the key).
- **CDN / edge caching** of the 302 response for viral links (short `max-age`, e.g. 60 s, so analytics stay roughly accurate, or count at the edge).
- **Negative caching** for unknown keys (bots scanning random keys), plus a **Bloom filter** of existing keys to reject garbage without touching the DB.
- **Hot keys**: a viral link at 50K/s is one Redis key → in-process caching on redirect servers for a few seconds.

### Deep dive C: analytics without slowing redirects

The redirect service publishes a **click event** (key, timestamp, referrer, IP-derived country, user agent) to Kafka **asynchronously** and returns immediately. A stream processor aggregates counts per key per minute/day into an analytics store (ClickHouse, or counters in a wide-column table); unique visitors use **HyperLogLog**. Bot filtering happens here, not on the hot path.

### Deep dive D: scaling storage and expiry

- **Sharding** by `hash(key)`: uniform distribution, every lookup hits one shard. 6 TB over 10 years fits on a handful of shards with replication.
- **Replication**: 3 replicas; reads can come from any (links are immutable, so staleness only matters right after creation; read-your-writes for the creator, or read the leader on a cache miss within the first seconds).
- **Expiry**: check `expires_at` on read (lazy) and delete in a background sweep; DynamoDB/Cassandra TTLs can do it natively.

## 7. Wrap-up

Bottlenecks and risks: the cache tier for viral links (hot keys); abuse (spammers shortening phishing URLs: rate limit creation per user/IP, check URLs against Safe Browsing lists, allow takedowns); the KGS (make it highly available or let writers fall back to random keys with conditional inserts). Monitor redirect latency p99, cache hit rate, 404 rates (scanning), and analytics lag.

```quiz
? Why might a URL shortener return 302 instead of 301?
+ 302 isn't cached permanently by browsers, so every click reaches the service, enabling analytics, expiry and takedowns
- 302 is faster
- 301 is not supported by browsers
> 301 saves traffic but hides future clicks from you and makes the mapping effectively permanent for those users.

? What's the main drawback of encoding a global auto-increment id directly in base62?
+ Keys are sequential and guessable, and a single global counter is a bottleneck/single point of failure
- Keys are too long
- Base62 can't encode large numbers
> Counter ranges remove the bottleneck; scrambling removes the guessability.

? Redirects must stay fast even when analytics are slow. How?
+ Emit click events asynchronously to a queue and aggregate them in a separate pipeline
- Update a counter in the database before each redirect
- Skip analytics
> Keep the hot path to cache lookup + redirect; everything else is async.
```

:::keypoints
- Very read-heavy (≈100:1): redirect path = **CDN → cache → sharded KV store**; writes are tiny.
- **7 base62 characters** ≈ 3.5 trillion keys. Generate keys with **counter ranges (KGS) + a scramble**, or random keys with conditional inserts; custom aliases via conditional insert (409 on conflict).
- **302** for analytics/expiry; analytics via **async click events** → stream aggregation (HLL for uniques).
- Immutable mappings make caching easy; protect against hot keys, scanners (negative cache/Bloom filter) and abuse (rate limits, URL reputation checks).
:::
