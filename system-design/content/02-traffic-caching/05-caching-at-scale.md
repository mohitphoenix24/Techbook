---
title: Caching at Scale — Failure Modes and Redis
level: advanced
time: 45
summary: What goes wrong with caches under real traffic and how big companies fix it — stampedes (request coalescing, early refresh), penetration (negative caching, Bloom filters), avalanches (TTL jitter), hot keys, and stale-data races — plus Redis vs Memcached, Redis data structures, and running a cache cluster.
---

A cache that works in a demo can take your whole system down in production. Under heavy traffic, caches create failure modes of their own: thousands of requests stampeding the database at the same instant, attackers asking for keys that don't exist, one celebrity key melting a single cache node. These are classic interview deep dives. Each one has a name and a standard fix.

## 1. Cache stampede (thundering herd)

:::def Cache stampede
A popular key expires (or is evicted), and **every** request that arrives before it's reloaded misses at the same time and goes to the database. With 10,000 requests per second for that key and a 200 ms query, ~2,000 identical queries hit the database at once. It slows down, the reload takes longer, more requests pile up, and the database can collapse.
:::

```viz algo=seq title="A stampede: one expiry, thousands of identical queries"
participant r Requests ×2,000 [users]
participant c Cache [cache]
participant db Database [db]
note c : key "home:feed" expires at 12:00:00.000
r -> c : GET home:feed (×2,000 in 200 ms)
c --> r : miss ×2,000
r -> db : the same query ×2,000 | The database spends all its time computing the same answer.
db --> r : slow, then timeouts
```

**Fixes:**

1. **Request coalescing / single-flight.** Only the **first** request for a missing key goes to the database. Concurrent requests for the same key **wait for that one result**. Within one server this is a map of in-flight loads; across servers it's a short-lived lock in Redis (`SET lock:key 1 NX PX 5000`), while the others wait briefly or serve stale data.
2. **Serve stale while revalidating.** Keep the old value a little past its "soft" expiry. When it's soft-expired, one request refreshes it in the background while everyone else gets the slightly old value.
3. **Probabilistic early expiration.** Each reader refreshes the value slightly *before* expiry with a small probability that grows as expiry approaches, so one request refreshes it early and the herd never forms.
4. **Never expire very hot keys**; refresh them with a background job instead.

Here's single-flight. Twenty concurrent requests for the same missing key cause **one** database query:

:::tabs Request coalescing (single-flight)
```js run
let dbQueries = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function slowDbQuery(key) { dbQueries++; await sleep(50); return `value of ${key}`; }

const cache = new Map();
const inFlight = new Map();          // key → Promise of the load already running

async function get(key) {
  if (cache.has(key)) return cache.get(key);
  if (inFlight.has(key)) return inFlight.get(key);      // join the load in progress
  const p = slowDbQuery(key)
    .then((v) => { cache.set(key, v); return v; })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

// Without coalescing: every concurrent miss queries the DB
async function getNaive(key) {
  if (cache.has(key)) return cache.get(key);
  const v = await slowDbQuery(key);
  cache.set(key, v);
  return v;
}

await Promise.all(Array.from({ length: 20 }, () => getNaive("home:feed")));
console.log("naive:       ", dbQueries, "database queries for 20 concurrent requests");

cache.clear(); dbQueries = 0;
const results = await Promise.all(Array.from({ length: 20 }, () => get("home:feed")));
console.log("single-flight:", dbQueries, "database query; every caller got:", results[19]);
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

atomic<int> dbQueries{0};
string slowDbQuery(const string& key) {
    ++dbQueries;
    this_thread::sleep_for(chrono::milliseconds(50));
    return "value of " + key;
}

class SingleFlightCache {
    mutex m_;
    unordered_map<string, string> cache_;
    unordered_map<string, shared_future<string>> inFlight_;   // key → load in progress
public:
    string get(const string& key) {
        unique_lock lock(m_);
        if (auto it = cache_.find(key); it != cache_.end()) return it->second;
        if (auto it = inFlight_.find(key); it != inFlight_.end()) {
            auto f = it->second;            // join the load already running
            lock.unlock();
            return f.get();
        }
        promise<string> p;
        shared_future<string> f = p.get_future().share();
        inFlight_[key] = f;
        lock.unlock();

        string v = slowDbQuery(key);        // only this thread hits the database
        lock.lock();
        cache_[key] = v;
        inFlight_.erase(key);
        lock.unlock();
        p.set_value(v);                     // wake everyone waiting on f
        return v;
    }
};

int main() {
    SingleFlightCache cache;
    vector<thread> threads;
    vector<string> results(20);
    for (int i = 0; i < 20; i++)
        threads.emplace_back([&, i] { results[i] = cache.get("home:feed"); });
    for (auto& t : threads) t.join();
    cout << "single-flight: " << dbQueries << " database query for 20 concurrent requests\n";
    cout << "every caller got: " << results[19] << "\n";
}
```
:::

## 2. Cache penetration

:::def Cache penetration
Requests for keys that **don't exist** in the database either. They're never cached (there's nothing to cache), so every one goes straight to the database. It happens with bugs, scrapers enumerating ids, and deliberate attacks (`GET /users/99999999`, `/users/99999998`, …).
:::

**Fixes:**

1. **Negative caching**: cache the "not found" result too (`user:99999999 → NULL`, short TTL like 60 s).
2. **A Bloom filter** in front of the database: a compact probabilistic set of all keys that exist. If the filter says "definitely not present", reject the request without touching the cache or the database. (Bloom filters get a full lesson in the Distributed Systems module.)
3. **Validate inputs** and **rate-limit** clients that generate lots of misses.

## 3. Cache avalanche

:::def Cache avalanche
Many keys **expire at the same moment** (for example, all were loaded together at startup with the same TTL), or the whole cache cluster restarts. The database suddenly receives the full read traffic it was never sized for.
:::

**Fixes:**

1. **TTL jitter**: add randomness to every TTL (`ttl = 600 s ± 10%`), so expiries spread out.
2. **Warm the cache** before sending traffic to a new or restarted cache (replay recent hot keys).
3. **High availability** for the cache itself (replicas, failover), so it doesn't vanish all at once.
4. **Protect the database**: rate limiting, circuit breakers, and request coalescing as a last line of defence.

```js run title="TTL jitter spreads expiries out"
let seed = 5;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const keys = 10_000, baseTtl = 600;     // all loaded at t = 0

const bucket = (ttls) => {              // how many keys expire in each 30-second slot
  const counts = {};
  for (const t of ttls) { const slot = Math.floor(t / 30) * 30; counts[slot] = (counts[slot] || 0) + 1; }
  return Object.entries(counts).map(([s, n]) => `${s}s:${n}`).join("  ");
};

const fixed = Array.from({ length: keys }, () => baseTtl);
const jittered = Array.from({ length: keys }, () => baseTtl * (0.9 + rand() * 0.2));   // ±10%
console.log("same TTL  ->", bucket(fixed));
console.log("±10% TTL  ->", bucket(jittered));
```

## 4. Hot keys

:::def Hot key
A single key that receives a huge share of traffic: a celebrity's profile, a viral post, a flash-sale product. In a distributed cache, each key lives on **one** node, so that node is overwhelmed (CPU or network) while the others idle.
:::

**Fixes:**

1. **Local (in-process) caching** of hot keys on every app server for a few seconds. The distributed cache then sees one request per server per few seconds instead of every request.
2. **Replicate the hot key**: store copies under `post:123#1`, `post:123#2`, … `#N` on different nodes, and read a random copy. Writes must update or invalidate all copies.
3. **Read replicas** of the cache node holding it.
4. **Detect hot keys** automatically (sampling, Redis `--hotkeys`, client-side counters) so you can apply these dynamically.

A related problem is the **big key**: a single value of many megabytes (a huge list or hash). Reading it blocks a Redis thread and saturates the network. Split big values into chunks or smaller keys.

## 5. Stale data and invalidation races

There are only two hard things in Computer Science, goes the old joke: cache invalidation and naming things. Here is why. Even "update the DB, then delete the cache key" has a race:

```viz algo=seq title="The read/write race that leaves a stale value"
participant r Reader [service]
participant w Writer [service]
participant c Cache [cache]
participant db Database [db]
r -> c : GET user:42 → miss
r -> db : SELECT → plan = "free" (old value) | The reader is slow (GC pause, network)…
w -> db : UPDATE plan = "pro"
w -> c : DEL user:42 | …the writer deletes the key, but it's already empty.
r -> c : SET user:42 = "free" | The reader stores the OLD value after the delete.
note c : stale until the TTL expires
```

It needs an unlucky interleaving, but at millions of requests per second, unlucky things happen every day. Fixes, in increasing strength:

1. **A TTL** bounds the damage (always have one).
2. **Delayed double delete**: delete the key again a short time (e.g. 500 ms) after the write.
3. **Leases / versions** (Facebook's memcache paper): on a miss, the cache hands out a **lease token**; a `SET` is only accepted if no delete happened since the lease was issued. Or store a **version number** with each value and refuse to overwrite a newer version with an older one.
4. **Invalidate from the database's change log**: a CDC (change data capture) consumer reads the DB's replication log and deletes cache keys for every committed change, so invalidation can't be skipped by any code path.

:::interview How fresh does it need to be?
When an interviewer asks about cache consistency, don't jump to complicated protocols. First ask: **how stale can this data be?** For a like count, "a few seconds behind, bounded by TTL" is fine. For a price at checkout, **read from the database** and use the cache only for browsing. Matching the mechanism to the requirement is the senior answer.
:::

## Redis vs Memcached

Both are in-memory key-value stores used as distributed caches.

| | Memcached | Redis |
|---|---|---|
| Data model | strings (opaque blobs) | strings, hashes, lists, sets, **sorted sets**, streams, bitmaps, HyperLogLog, geo |
| Threads | multi-threaded | command execution is single-threaded per node (I/O can be threaded): every command is atomic |
| Persistence | none | optional snapshots (RDB) and append-only log (AOF) |
| Replication / failover | none built in | replicas, Sentinel, Redis Cluster (sharding) |
| Extras | | pub/sub, Lua scripts, transactions, TTL per key, streams |
| Pick it when | a simple, very fast, multi-threaded blob cache | almost everything else: the default today |

### Redis data structures and what they're for

| Structure | Example use | Commands |
|---|---|---|
| String | cached objects, counters, distributed locks | `GET/SET`, `INCR`, `SET … NX PX` |
| Hash | an object's fields (`user:42 → {name, plan}`) | `HGET/HSET/HINCRBY` |
| List | queues, recent activity | `LPUSH/RPOP`, `LRANGE` |
| Set | unique visitors today, tags, "who liked this" | `SADD/SISMEMBER/SCARD` |
| Sorted set | **leaderboards**, rate-limit windows, timelines sorted by time, priority queues | `ZADD/ZRANGE/ZREVRANK` |
| HyperLogLog | approximate unique counts in 12 KB | `PFADD/PFCOUNT` |
| Geo | nearby drivers / restaurants | `GEOADD/GEOSEARCH` |
| Stream | an append-only log with consumer groups | `XADD/XREADGROUP` |

You'll meet these again in the rate limiter, leaderboard, and proximity case studies.

## Running a cache cluster

One Redis node holds tens of GB and serves ~100K+ operations per second. Beyond that you need a **cluster**:

- **Sharding**: keys are spread across nodes. Redis Cluster uses 16,384 **hash slots** (`CRC16(key) mod 16384`), each owned by one primary. Client-side sharding typically uses **consistent hashing**, so adding a node moves only a small fraction of keys (lesson in the next module).
- **Replication**: each primary has replicas for failover and read scaling.
- **Clients handle failures**: if the cache is unreachable, fall back to the database **with protection** (timeouts, circuit breaker, coalescing), or the database collapses.

```viz algo=arch title="A sharded, replicated cache cluster"
app     App servers [service*4]
p1      Primary 1 | slots 0–5460 [cache]
p2      Primary 2 | slots 5461–10922 [cache]
p3      Primary 3 | slots 10923–16383 [cache]
r1      Replica 1 [cache]
r2      Replica 2 [cache]
r3      Replica 3 [cache]
db      Database [db]
--
app -> p1
app -> p2
app -> p3
p1 ~> r1
p2 ~> r2
p3 ~> r3
app -> db : misses
```

:::problem Cache for a flash sale {level=medium tags="caching,hot keys,stampede"}
An e-commerce site runs a flash sale: at 12:00 exactly, a phone goes on sale at a huge discount. 2 million users are refreshing the product page, which shows the price and "items left". The product page is cached in Redis with a 60 s TTL. Last year, the database fell over at 12:00:01. What went wrong, and how would you design the caching this time?

:::hint Hint
Several failure modes combine here: one extremely hot key, an expiry right at the busiest moment, and a number ("items left") that changes with every purchase.
:::

:::solution
**What went wrong:** the product key was **hot** (one Redis node took all the traffic), it **expired** (or was invalidated by the price change at 12:00) at peak, and every request **stampeded** to the database. "Items left" changing on every purchase meant constant invalidations, so the cache barely helped.

**This time:**
1. **Separate static from dynamic data.** The page (name, images, description, sale price) is static for the event: pre-render it, **pre-warm** it in the CDN and Redis before 12:00, no expiry during the sale.
2. **Hot key protection**: an in-process cache on every app server (1–2 s TTL) in front of Redis, plus replicated copies of the key across Redis nodes.
3. **"Items left" is approximate for display**: refresh it every second from a counter (a Redis `DECR` per order), and show "Only a few left!" rather than an exact live number. Exact accuracy only matters at checkout.
4. **The real inventory check happens at purchase time**, against an atomic counter or the database with a conditional update (`UPDATE … SET stock = stock - 1 WHERE stock > 0`). The cache is never trusted for that.
5. **Single-flight + serve-stale** for any remaining cache misses, and **rate limiting / a virtual waiting room** to cap the purchase traffic that reaches the order service.
:::
:::

```quiz
? Attackers request /users/<random id> for ids that don't exist, and your database load spikes. What's this, and what helps?
- A cache stampede; add TTL jitter
+ Cache penetration; cache "not found" results briefly and/or put a Bloom filter of existing ids in front
- A hot key; replicate the key
> Keys that don't exist are never cached, so every request reaches the database. Negative caching and Bloom filters stop them early.

? All cache keys were loaded at deploy time with a 1-hour TTL, and exactly one hour later the database is overwhelmed. The fix is…
+ Add random jitter to TTLs so expiries spread over time
- Use an LFU eviction policy
- Increase the TTL to 2 hours
> That's a cache avalanche. A longer TTL just moves the cliff; jitter removes it.

? A celebrity's profile key overloads one Redis node while others are idle. Which fix targets this directly?
- Shorter TTLs
+ Cache the key locally on app servers for a few seconds and/or replicate it under several keys on different nodes
- Switch from Redis to Memcached
> A hot key lives on one node. Local caching and replicas spread its load.

? Why are Redis commands like INCR safe under concurrency without extra locking?
+ Each Redis node executes commands one at a time, so every single command is atomic
- Redis uses database transactions for every command
- Redis copies each key to every node
> Redis runs commands sequentially per node, which makes individual commands (and Lua scripts) atomic.
```

:::keypoints
- **Stampede**: a hot key expires and the herd hits the DB → single-flight/locks, serve-stale-while-revalidate, early refresh.
- **Penetration**: requests for non-existent keys → negative caching, Bloom filters, input validation.
- **Avalanche**: many keys expire together or the cache restarts → TTL jitter, warming, cache HA, DB protection.
- **Hot keys**: one key overloads one node → local caching, key replication, detection. Split **big keys**.
- **Stale data races** exist even with delete-on-write → TTLs always, delayed double delete, leases/versions, CDC-driven invalidation. Match freshness to the requirement.
- **Redis** (rich data structures, persistence, replication, cluster) is the default distributed cache; Memcached is a simpler multi-threaded blob cache.
:::
