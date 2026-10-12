---
title: Caching Strategies
level: intermediate
time: 45
summary: Where caches live (browser, CDN, application, database), the read patterns (cache-aside, read-through) and write patterns (write-through, write-back, write-around), TTLs, eviction policies (LRU, LFU, FIFO) with a step-by-step simulator, and how to estimate hit ratios.
---

Caching is the single most powerful performance tool in system design. A cache stores the result of expensive work (a database query, a computation, a remote call) in fast storage, so the next request can reuse it. Done well, it cuts latency from tens of milliseconds to under one and shields your database from most of the load. Done badly, it serves wrong data. This lesson covers how caches are used; the next covers what goes wrong at scale.

:::def Cache
A fast, usually in-memory store holding **copies** of data whose source of truth lives elsewhere. A request that finds its data in the cache is a **hit**; one that doesn't is a **miss**.
:::

:::def Hit ratio
hits ÷ (hits + misses). A 95% hit ratio means only 5% of reads reach the slow backend: 20× less load on it.
:::

## Caches at every layer

```viz algo=arch title="A request meets many caches"
browser  Browser cache | HTTP cache, localStorage [browser]
cdn      CDN edge [cdn]
lb       Reverse proxy cache [gateway]
app      App server | in-process cache [service]
redis    Distributed cache | Redis / Memcached [cache]
db       Database | buffer pool [db]
--
browser -> cdn
cdn -> lb
lb -> app
app -> redis
app -> db
```

| Layer | What it caches | Hit saves |
|---|---|---|
| Browser / app | static files, API responses (via `Cache-Control`) | the whole network trip |
| CDN | static and public content | a cross-continent trip + origin load |
| Reverse proxy | full responses | app server CPU |
| In-process (a map in the app's memory) | small, very hot data: config, feature flags | even the ~0.5 ms network hop to Redis |
| Distributed cache (Redis, Memcached) | query results, sessions, computed objects | database load and latency |
| Database buffer pool | recently used disk pages | disk reads |

In-process caches are fastest but each server has its own copy (they can disagree, and memory is duplicated N times). A **distributed cache** is shared by all servers. Most designs use a distributed cache as the main application cache.

## Reading: cache-aside vs read-through

### Cache-aside (lazy loading)

The application talks to both the cache and the database. It's the most common pattern by far.

```viz algo=seq title="Cache-aside read"
participant app App server [service]
participant c Cache [cache]
participant db Database [db]
app -> c : GET user:42
c --> app : (miss)
app -> db : SELECT * FROM users WHERE id = 42
db --> app : row
app -> c : SET user:42 = row, TTL 10 min | Populate the cache for the next reader.
note app : next request for user:42 → cache hit, ~1 ms
```

:::tabs Cache-aside with a TTL
```js run
// A tiny cache with TTLs, and a slow "database"
class TTLCache {
  #map = new Map();
  get(key, now) {
    const e = this.#map.get(key);
    if (!e) return undefined;
    if (now >= e.expires) { this.#map.delete(key); return undefined; }   // expired
    return e.value;
  }
  set(key, value, ttlMs, now) { this.#map.set(key, { value, expires: now + ttlMs }); }
  delete(key) { this.#map.delete(key); }
}

const db = { users: { 42: { name: "Asha", plan: "free" } }, reads: 0 };
const dbGetUser = (id) => { db.reads++; return { ...db.users[id] }; };

const cache = new TTLCache();
function getUser(id, now) {
  const key = `user:${id}`;
  let user = cache.get(key, now);
  if (user) return { user, from: "cache" };
  user = dbGetUser(id);                       // miss: read the source of truth
  cache.set(key, user, 10 * 60_000, now);     // keep it for 10 minutes
  return { user, from: "database" };
}

let t = 0;                                    // simulated clock, in ms
for (const step of [0, 1_000, 5_000, 9 * 60_000, 11 * 60_000, 11 * 60_000 + 10]) {
  t = step;
  const r = getUser(42, t);
  console.log(`t=${String(t / 1000).padStart(5)}s  ${r.from.padEnd(8)} ${JSON.stringify(r.user)}`);
}
console.log("database reads:", db.reads, "of 6 requests");
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

struct User { string name, plan; };

// A tiny cache with TTLs
template <class V>
class TTLCache {
    struct Entry { V value; long long expires; };
    unordered_map<string, Entry> map_;
public:
    optional<V> get(const string& key, long long now) {
        auto it = map_.find(key);
        if (it == map_.end()) return nullopt;
        if (now >= it->second.expires) { map_.erase(it); return nullopt; }   // expired
        return it->second.value;
    }
    void set(const string& key, V value, long long ttlMs, long long now) {
        map_[key] = {std::move(value), now + ttlMs};
    }
    void erase(const string& key) { map_.erase(key); }
};

// A slow "database"
unordered_map<int, User> usersTable = {{42, {"Asha", "free"}}};
int dbReads = 0;
User dbGetUser(int id) { ++dbReads; return usersTable.at(id); }

TTLCache<User> cache;
pair<User, string> getUser(int id, long long now) {
    string key = "user:" + to_string(id);
    if (auto u = cache.get(key, now)) return {*u, "cache"};
    User u = dbGetUser(id);                  // miss: read the source of truth
    cache.set(key, u, 10 * 60'000, now);     // keep it for 10 minutes
    return {u, "database"};
}

int main() {
    for (long long t : {0LL, 1'000LL, 5'000LL, 9 * 60'000LL, 11 * 60'000LL, 11 * 60'000LL + 10}) {
        auto [u, from] = getUser(42, t);
        cout << "t=" << setw(5) << t / 1000.0 << "s  " << left << setw(9) << from << right
             << u.name << " (" << u.plan << ")\n";
    }
    cout << "database reads: " << dbReads << " of 6 requests\n";
}
```
:::

**Pros:** only data that's actually requested gets cached; if the cache dies, the app still works (slower) from the database; the cache can store a different shape than the DB (a fully assembled profile object). **Cons:** every miss costs three trips (cache, DB, cache); the first request after expiry is slow; and the cache can go **stale** when the data changes (more below).

### Read-through

The application only talks to the cache. On a miss, the **cache itself** loads from the database (through a loader you configure). The code is simpler, and the logic lives in one place, but you need a cache library or service that supports it (e.g. Caffeine, Guava, NCache, DAX for DynamoDB).

## Writing: keeping the cache and database in sync

When data changes, what happens to the cached copy? There are four classic strategies.

### Write-through

Write to the cache **and** the database together, synchronously, before acknowledging.

- ✓ The cache is always fresh. Reads right after writes hit.
- ✗ Every write pays both latencies. The cache fills with data that may never be read.

### Write-back (write-behind)

Write to the cache only, acknowledge immediately, and flush to the database **later** (batched, asynchronously).

- ✓ Very fast writes; many writes to the same key collapse into one DB write. Great for counters, metrics, game scores.
- ✗ **Data loss risk**: if the cache node dies before flushing, acknowledged writes are gone. Needs a replicated/persistent cache to be safe.

### Write-around

Write to the database only, and **invalidate** (delete) the cached copy. The next read repopulates it via cache-aside.

- ✓ The cache isn't flooded with write-once data; simple and safe. This plus cache-aside is the most common combination.
- ✗ A read right after a write is a miss.

```viz algo=seq title="Write-around: update the DB, then delete the cache entry"
participant app App server [service]
participant db Database [db]
participant c Cache [cache]
app -> db : UPDATE users SET plan='pro' WHERE id = 42
db --> app : OK
app -> c : DEL user:42 | Delete, don't update: the next read reloads the fresh row.
note app : next GET user:42 → miss → DB → cache (fresh)
```

| Strategy | Write path | Read-after-write | Data-loss risk | Good for |
|---|---|---|---|---|
| Cache-aside + invalidate (write-around) | DB, then delete cache key | miss, then fresh | none | most read-heavy apps |
| Write-through | cache + DB synchronously | hit, fresh | none | data that is read soon after being written |
| Write-back | cache now, DB later | hit | **yes** | write-heavy counters, analytics, buffering |
| Read-through | (any) | | | simplifying the read path |

:::warn Delete the cached key, don't update it
When data changes, prefer `DEL key` over `SET key newValue`. With two concurrent writers, the cache updates can arrive in the opposite order from the database updates and leave the cache permanently wrong. Deleting is safe: the next reader loads whatever the database holds. The next lesson shows the remaining race and how to close it.
:::

## TTL: the safety net

:::def TTL (time to live) for cache entries
An expiry time on each cached entry. After it passes, the entry is treated as missing and reloaded.
:::

Even with careful invalidation, bugs and races happen. A TTL bounds **how long** wrong data can live. Choose it per type of data:

| Data | Typical TTL | Reasoning |
|---|---|---|
| Static config, country lists | hours to days | changes rarely |
| User profile | 5–60 minutes, plus invalidation on update | updates are rare and invalidated anyway |
| Product price / stock | seconds, or no cache for checkout | staleness costs money |
| Home feed | 30 s – few minutes | users tolerate slight staleness |
| Session | the session length | expiry *is* the logout |

## When the cache is full: eviction policies

Memory is limited. When the cache is full and a new item arrives, the **eviction policy** decides which item to throw out.

:::def LRU (Least Recently Used)
Evict the item that hasn't been **accessed** for the longest time. It bets that recently used data will be used again soon. The default in most caches.
:::

:::def LFU (Least Frequently Used)
Evict the item accessed the **fewest times**. Better when popularity is stable (some items are always hot), but slow to adapt when popularity shifts, and a burst of one-off accesses can be sticky.
:::

:::def FIFO (First In, First Out)
Evict the **oldest inserted** item, regardless of use. Simple, but it throws out hot items just because they're old.
:::

Step through a request sequence below and compare the policies. Then press **Skewed workload** to generate traffic where a few keys are very popular (as in real systems), and compare the hit ratios.

```viz algo=cache title="Cache eviction step by step"
capacity = 3
policy = LRU
sequence = A B C A D B A E A C F A B
```

Other policies you may hear about: **random** eviction (surprisingly decent and cheap), **TTL-based** (evict the soonest-to-expire), and modern hybrids like **W-TinyLFU** (Caffeine) and Redis's **approximated LRU/LFU** that sample a few keys instead of tracking exact order. Implementing an LRU cache in O(1) is a classic LLD interview question; you'll build it in the LLD Problems module.

:::tip Redis eviction settings
Redis uses `maxmemory` plus a `maxmemory-policy`: `allkeys-lru`, `allkeys-lfu`, `volatile-lru` (only keys with a TTL), `noeviction` (writes fail when full), and others. For a pure cache, `allkeys-lru` or `allkeys-lfu` is the usual choice.
:::

## What to cache, and how much it helps

Good candidates are **read often, change rarely, and are expensive to compute or fetch**: user profiles, product pages, rendered timelines, aggregated counts, auth/permission lookups, results of heavy queries, responses from slow third-party APIs.

Bad candidates: data that must be perfectly fresh (balances during a transfer, seat availability at the moment of booking), data read once, and huge objects that would evict everything else.

The effect on average latency is easy to estimate:

:::formula Average read latency with a cache
T_{\text{avg}} = h \cdot T_{\text{cache}} + (1 - h) \cdot (T_{\text{cache}} + T_{\text{db}})
:::

```js run title="How the hit ratio drives latency and database load"
const tCache = 1, tDb = 20;            // ms
const readsPerSec = 100_000;
for (const h of [0, 0.5, 0.8, 0.9, 0.95, 0.99]) {
  const avg = h * tCache + (1 - h) * (tCache + tDb);
  const dbQps = readsPerSec * (1 - h);
  console.log(`hit ${String(h * 100).padStart(3)}%  avg ${avg.toFixed(1).padStart(5)} ms   database reads/s ${Math.round(dbQps).toLocaleString("en-US").padStart(7)}`);
}
```

Going from 90% to 99% hits cuts database load by another **10×**. That's why big systems fight for the last few percent of hit ratio.

```quiz
? Your app uses cache-aside. A user updates their profile. What should the write path do?
- Update the cache first, then the database
+ Update the database, then delete the cache key so the next read loads fresh data
- Do nothing; the TTL will fix it eventually
> Deleting after the DB write keeps the cache from holding stale data for long, and avoids the ordering races of updating it.

? Which write strategy risks losing acknowledged writes?
- Write-through
- Write-around
+ Write-back (write-behind)
> Write-back acknowledges once the cache has the data and flushes to the database later. A cache crash in between loses those writes.

? A cache of size 3 using LRU holds [A, B, C] (A used least recently). The next request is D. What is evicted?
+ A
- C
- D
> LRU evicts the least recently used entry, which is A.

? Raising the hit ratio from 90% to 99% changes database read load by…
- about 10%
+ about 10× less
- nothing, since both are high
> Misses drop from 10% to 1% of reads: a tenfold reduction.
```

:::keypoints
- Caches exist at every layer: browser, CDN, proxy, in-process, **distributed (Redis/Memcached)**, database.
- **Cache-aside** (app checks cache, loads from DB on a miss, stores with a TTL) is the default read pattern. **Read-through** moves loading into the cache layer.
- Writes: **write-around** (DB then delete the key) is the safe default; **write-through** keeps the cache fresh at a latency cost; **write-back** is fast but can lose data.
- **Delete, don't update** cached entries on writes. **TTLs** bound how long stale data can survive.
- Eviction: **LRU** (default), **LFU** (stable popularity), FIFO (simple). Hit ratio is everything: 90% → 99% is 10× less backend load.
:::
