---
title: Implement a TTL cache and async memoization
level: medium
time: 30
summary: A cache whose entries expire, with an injectable clock for tests, plus an async loader cache that shares in-flight requests, does not cache failures and can serve stale data while refreshing.
---

:::problem Implement a TTL cache and an async loader cache {level=medium tags="cache,promises,ttl,design"}
**Part 1.** `TTLCache({ ttl, now })`: `set(key, value, ttl?)`, `get(key)`, `has(key)`, `delete(key)`, `size`. Entries expire after `ttl` ms. Use a **clock function** `now()` that can be replaced in tests (no real waiting).

**Part 2.** `cachedLoader(load, { ttl, now })` returns `get(key)`:

- A fresh cached value is returned at once.
- Concurrent calls for the same key share **one** call to `load`.
- A **rejected** load is not cached.
- Bonus: `staleWhileRevalidate`: after the TTL, return the old value at once and refresh in the background.

:::hint Hint
Part 1: store `{ value, expiresAt }`; check on `get` (lazy expiry) and delete if expired. Part 2: store the **promise** in a map while loading, then store the value with its expiry.
:::
:::

## Solution and tests

```js run title="TTLCache and cachedLoader, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

class TTLCache {
  #map = new Map(); #ttl; #now;
  constructor({ ttl = 1000, now = Date.now } = {}) { this.#ttl = ttl; this.#now = now; }

  set(key, value, ttl = this.#ttl) {
    this.#map.set(key, { value, expiresAt: this.#now() + ttl });
    return this;
  }
  #entry(key) {
    const e = this.#map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.#now()) { this.#map.delete(key); return undefined; }    // lazy expiry: removed when someone asks
    return e;
  }
  get(key) { return this.#entry(key)?.value; }
  has(key) { return this.#entry(key) !== undefined; }
  delete(key) { return this.#map.delete(key); }
  sweep() { for (const key of [...this.#map.keys()]) this.#entry(key); }            // call from a timer to free memory of unread keys
  get size() { this.sweep(); return this.#map.size; }
}

function cachedLoader(load, { ttl = 1000, now = Date.now, staleWhileRevalidate = false } = {}) {
  const store = new Map();                                   // key -> { value, expiresAt }
  const inflight = new Map();                                // key -> Promise

  function fetchFresh(key) {
    if (inflight.has(key)) return inflight.get(key);         // share the running request
    const p = Promise.resolve()
      .then(() => load(key))
      .then((value) => { store.set(key, { value, expiresAt: now() + ttl }); return value; })
      .finally(() => inflight.delete(key));                  // success or failure: no longer in flight (failures are not stored)
    inflight.set(key, p);
    return p;
  }

  return async function get(key) {
    const hit = store.get(key);
    if (hit && hit.expiresAt > now()) return hit.value;
    if (hit && staleWhileRevalidate) {
      fetchFresh(key).catch(() => {});                       // refresh in the background; ignore its failure
      return hit.value;                                      // answer now with the old value
    }
    return fetchFresh(key);
  };
}

// ---------------- tests ----------------
const clock = () => { let t = 0; const now = () => t; now.advance = (ms) => (t += ms); return now; };

await test("a value lives until its TTL", () => {
  const now = clock(), c = new TTLCache({ ttl: 100, now });
  c.set("a", 1);
  now.advance(99);
  assert.equal(c.get("a"), 1);
  now.advance(1);
  assert.equal(c.get("a"), undefined);                       // exactly at the TTL: expired
});

await test("per-key ttl and has/delete", () => {
  const now = clock(), c = new TTLCache({ ttl: 100, now });
  c.set("short", 1, 10).set("long", 2);
  now.advance(50);
  assert.equal(c.has("short"), false);
  assert.equal(c.has("long"), true);
  assert.equal(c.delete("long"), true);
  assert.equal(c.has("long"), false);
});

await test("falsy values are cached", () => {
  const now = clock(), c = new TTLCache({ ttl: 100, now });
  c.set("zero", 0).set("empty", "").set("no", false);
  assert.equal(c.has("zero") && c.has("empty") && c.has("no"), true);
  assert.equal(c.get("zero"), 0);
});

await test("size sweeps expired entries", () => {
  const now = clock(), c = new TTLCache({ ttl: 10, now });
  c.set("a", 1).set("b", 2);
  now.advance(11);
  assert.equal(c.size, 0);
});

await test("loader: caches the value", async () => {
  const now = clock();
  let calls = 0;
  const get = cachedLoader(async (k) => { calls++; return k.toUpperCase(); }, { ttl: 100, now });
  assert.equal(await get("a"), "A");
  assert.equal(await get("a"), "A");
  assert.equal(calls, 1);
  now.advance(100);
  assert.equal(await get("a"), "A");
  assert.equal(calls, 2);                                    // expired: loaded again
});

await test("loader: concurrent calls share one request", async () => {
  let calls = 0;
  const get = cachedLoader(async (k) => { calls++; await new Promise((r) => setTimeout(r, 10)); return k; });
  const all = await Promise.all([get("x"), get("x"), get("x"), get("y")]);
  assert.deepEqual(all, ["x", "x", "x", "y"]);
  assert.equal(calls, 2);                                    // one for x, one for y
});

await test("loader: failures are not cached", async () => {
  let calls = 0;
  const get = cachedLoader(async () => { calls++; if (calls === 1) throw new Error("first fails"); return "ok"; });
  await assert.rejects(get("k"), /first fails/);
  assert.equal(await get("k"), "ok");
  assert.equal(calls, 2);
});

await test("loader: stale-while-revalidate answers at once and refreshes", async () => {
  const now = clock();
  let version = 1;
  const get = cachedLoader(async () => `v${version}`, { ttl: 100, now, staleWhileRevalidate: true });
  assert.equal(await get("k"), "v1");
  version = 2; now.advance(150);
  assert.equal(await get("k"), "v1");                        // stale value returned immediately
  await new Promise((r) => setTimeout(r, 5));                // let the background refresh finish
  assert.equal(await get("k"), "v2");                        // now fresh
});

await test("loader: a failing background refresh keeps serving the stale value", async () => {
  const now = clock();
  let fail = false;
  const get = cachedLoader(async () => { if (fail) throw new Error("down"); return "good"; }, { ttl: 10, now, staleWhileRevalidate: true });
  await get("k");
  fail = true; now.advance(20);
  assert.equal(await get("k"), "good");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await get("k"), "good");
});
```

## Design points to mention

| Point | Why |
|---|---|
| **Injectable clock** | tests do not sleep, and are not flaky |
| **Lazy expiry** + optional sweep | no timer per key; a timer per key does not scale and keeps Node alive |
| **Cache the promise** | stops the "thundering herd" of identical requests |
| **Do not cache errors** | a short outage must not become a long one |
| **Stale-while-revalidate** | fast responses; the same idea as the HTTP header of that name |
| **Max size** | combine with the LRU eviction, or the cache grows forever |

:::qa Why not use `setTimeout` per key to delete it? {level=medium}
**Say this:** "Thousands of timers cost memory and CPU, they keep the Node process alive unless you `unref()` them, and updating a key means clearing and recreating its timer. Checking the expiry on read is simple and cheap; add an occasional sweep to free unread keys."

**In simple words:** Look at the date when you open the milk, not set an alarm for every bottle.
:::

:::qa What is a cache stampede and how do you prevent it? {level=hard}
**Say this:** "When a popular key expires, hundreds of requests all miss and all call the backend at once. Prevent it by sharing the in-flight promise per key (single-flight), by serving stale data while one refresh runs, and by adding random jitter to TTLs so keys do not expire together."

**In simple words:** One person goes to the shop; everyone else waits for them.
:::

:::keypoints
- Store `{ value, expiresAt }`; **check on read**, delete if expired; add a **sweep**.
- Inject **`now`** so tests control time.
- Async: cache the **in-flight promise**, **never cache rejections**, optionally **serve stale** and refresh behind.
- Prevent stampedes: **single-flight**, **jitter**, **stale-while-revalidate**; bound the size.
:::
