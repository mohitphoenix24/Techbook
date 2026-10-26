---
title: Implement a rate limiter
level: medium
time: 30
summary: Three classic algorithms, fixed window, sliding window log and token bucket, with an injectable clock. Know the trade-offs, the burst problem and how to do it across many servers.
---

:::problem Implement a rate limiter {level=medium tags="design,algorithms,node,api"}
An API must allow **at most `limit` requests per `windowMs` per user**.

Write three limiters with the same interface `allow(key)` → `true | false`:

1. **Fixed window**: count requests in the current clock window (for example, per minute); reset at the boundary.
2. **Sliding window log**: remember the time of each request; count those in the last `windowMs`.
3. **Token bucket**: a bucket holds up to `capacity` tokens and refills at `refillPerSec`; each request takes one token. This allows controlled bursts.

All take an injectable clock `now()`.

```js
const rl = tokenBucket({ capacity: 5, refillPerSec: 1, now });
rl.allow("asha");   // true (4 tokens left) ...
```

:::hint Hint
Fixed window: a counter per `(key, windowStart)`. Sliding log: an array of timestamps per key; drop old ones first. Token bucket: store `tokens` and `lastRefill`; on each call add `elapsed * rate` (capped), then try to take one.
:::
:::

## Solution and tests

```js run title="Three rate limiters, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

function fixedWindow({ limit, windowMs, now = Date.now }) {
  const counters = new Map();                                // key -> { start, count }
  return {
    allow(key) {
      const t = now();
      const start = Math.floor(t / windowMs) * windowMs;     // the start of the current window
      let c = counters.get(key);
      if (!c || c.start !== start) { c = { start, count: 0 }; counters.set(key, c); }
      if (c.count >= limit) return false;
      c.count++;
      return true;
    },
  };
}

function slidingWindowLog({ limit, windowMs, now = Date.now }) {
  const logs = new Map();                                    // key -> sorted array of timestamps
  return {
    allow(key) {
      const t = now();
      const log = logs.get(key) ?? [];
      while (log.length && log[0] <= t - windowMs) log.shift();   // forget requests outside the window
      if (log.length >= limit) { logs.set(key, log); return false; }
      log.push(t);
      logs.set(key, log);
      return true;
    },
  };
}

function tokenBucket({ capacity, refillPerSec, now = Date.now }) {
  const buckets = new Map();                                 // key -> { tokens, last }
  return {
    allow(key, cost = 1) {
      const t = now();
      let b = buckets.get(key);
      if (!b) { b = { tokens: capacity, last: t }; buckets.set(key, b); }
      b.tokens = Math.min(capacity, b.tokens + ((t - b.last) / 1000) * refillPerSec);   // refill for the time that passed
      b.last = t;
      if (b.tokens < cost) return false;
      b.tokens -= cost;
      return true;
    },
  };
}

// ---------------- tests ----------------
const clock = (start = 0) => { let t = start; const now = () => t; now.set = (x) => (t = x); now.advance = (ms) => (t += ms); return now; };
const results = (rl, key, n) => Array.from({ length: n }, () => rl.allow(key));

test("fixed window: allows `limit`, blocks the rest, resets at the boundary", () => {
  const now = clock(0), rl = fixedWindow({ limit: 3, windowMs: 1000, now });
  assert.deepEqual(results(rl, "a", 5), [true, true, true, false, false]);
  now.set(1000);
  assert.deepEqual(results(rl, "a", 4), [true, true, true, false]);
});

test("fixed window: users are separate", () => {
  const rl = fixedWindow({ limit: 1, windowMs: 1000, now: clock() });
  assert.equal(rl.allow("a"), true);
  assert.equal(rl.allow("b"), true);
  assert.equal(rl.allow("a"), false);
});

test("fixed window: the boundary burst problem (2x the limit in a short time)", () => {
  const now = clock(900), rl = fixedWindow({ limit: 3, windowMs: 1000, now });
  const first = results(rl, "a", 3);                         // at 900 ms: window [0, 1000)
  now.set(1000);
  const second = results(rl, "a", 3);                        // at 1000 ms: a new window [1000, 2000)
  assert.deepEqual([...first, ...second], [true, true, true, true, true, true]);   // 6 requests in 100 ms!
});

test("sliding window log: no boundary burst", () => {
  const now = clock(900), rl = slidingWindowLog({ limit: 3, windowMs: 1000, now });
  assert.deepEqual(results(rl, "a", 3), [true, true, true]);
  now.set(1000);
  assert.deepEqual(results(rl, "a", 3), [false, false, false]);   // the last 1000 ms still hold 3 requests
  now.set(1900);                                                   // at 1900, the 900 ms requests have expired (900 <= 1900 - 1000)
  assert.deepEqual(results(rl, "a", 3), [true, true, true]);
});

test("sliding window log: requests free up one by one", () => {
  const now = clock(0), rl = slidingWindowLog({ limit: 2, windowMs: 100, now });
  rl.allow("a"); now.advance(60); rl.allow("a");
  assert.equal(rl.allow("a"), false);
  now.advance(41);                                                 // t = 101: the first request (t = 0) has left the window
  assert.equal(rl.allow("a"), true);
  assert.equal(rl.allow("a"), false);
});

test("token bucket: allows a burst up to capacity, then refills steadily", () => {
  const now = clock(0), rl = tokenBucket({ capacity: 5, refillPerSec: 1, now });
  assert.deepEqual(results(rl, "a", 6), [true, true, true, true, true, false]);   // burst of 5
  now.advance(1000);
  assert.deepEqual(results(rl, "a", 2), [true, false]);                           // one token came back
  now.advance(2500);
  assert.deepEqual(results(rl, "a", 3), [true, true, false]);                     // 2.5 tokens: two requests
});

test("token bucket: never holds more than capacity", () => {
  const now = clock(0), rl = tokenBucket({ capacity: 2, refillPerSec: 10, now });
  now.advance(60000);                                              // a long idle time
  assert.deepEqual(results(rl, "a", 3), [true, true, false]);
});

test("token bucket: a request can cost more than one token", () => {
  const rl = tokenBucket({ capacity: 10, refillPerSec: 1, now: clock() });
  assert.equal(rl.allow("a", 8), true);
  assert.equal(rl.allow("a", 8), false);
  assert.equal(rl.allow("a", 2), true);
});
```

## Comparison

| Algorithm | Memory per key | Accuracy | Burst behaviour |
|---|---|---|---|
| Fixed window | tiny (one counter) | low | up to **2×limit** across a boundary |
| Sliding log | O(limit) timestamps | exact | none |
| Sliding window counter (two counters, weighted) | tiny | close | small |
| Token bucket | tiny (two numbers) | good | **allows bursts** up to capacity, then a steady rate |
| Leaky bucket | tiny | good | smooths output to a steady rate (a queue) |

## Real systems

- Keep the counters in **Redis** (atomic `INCR` + `EXPIRE`, or a Lua script for the token bucket), because with several app servers an in-memory limiter only sees a part of the traffic.
- Return **HTTP 429** with a `Retry-After` header, and send `RateLimit-*` headers so clients can slow down.
- Choose the key carefully: user id, API key, IP (beware of shared NATs and proxy headers that can be forged).
- Old keys must be **deleted** (TTL), or memory grows with the number of users.

:::qa Which algorithm would you choose for a public API, and why? {level=medium}
**Say this:** "Token bucket. It is cheap (two numbers per key), it allows short bursts which real clients need, and it enforces a steady average rate. I would back it with Redis so all servers share it."

**In simple words:** Small bursts are fine, long floods are not.
:::

:::qa Why is the fixed window not accurate? {level=easy}
**Say this:** "A client can send the full limit at the end of one window and the full limit again at the start of the next, so twice the limit goes through in a very short time."

**In simple words:** The fence is in the same place for everyone, and people can cross at the edge.
:::

:::qa How do you rate-limit across 10 servers? {level=hard}
**Say this:** "Share the state in a fast store like Redis and make the check-and-update **atomic** (Lua script or `INCR`), otherwise two servers can both allow the last request. For very high traffic, give each server a local slice of the budget and sync periodically, accepting a small error."

**In simple words:** All servers must look at the same counter.
:::

:::keypoints
- **Fixed window**: simplest, but **2× burst** at the boundary. **Sliding log**: exact, more memory. **Token bucket**: bursts + steady rate.
- Inject the **clock**; refill by `elapsed × rate`, **cap** at capacity.
- Production: **Redis** with atomic operations, **429 + Retry-After**, careful **key** choice, **TTL** for idle keys.
:::
