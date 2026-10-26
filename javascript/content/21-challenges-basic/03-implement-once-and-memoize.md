---
title: Implement once and memoize
level: easy
time: 25
summary: Write once(fn) and a general memoize(fn) with a custom key, a size limit, and correct handling of falsy results, this and async functions.
---

:::problem Implement once and memoize {level=easy tags="closures,caching"}
**Part 1.** `once(fn)` returns a function that calls `fn` the **first time only**. Later calls return the **same result** and do not call `fn` again.

**Part 2.** `memoize(fn, { key, max })` caches results by arguments.

- The default key is `JSON.stringify(args)`; a custom `key(...args)` is allowed.
- Falsy results (`0`, `""`, `false`, `undefined`) are cached too.
- `max` limits the cache size (evict the **least recently used**).
- It keeps `this`.

```js
const init = once(() => { console.log("setup"); return 42; });
init(); init();                   // "setup" printed once; both return 42
const slowSquare = memoize((n) => n * n);
```

:::hint Hint
Both need state between calls: a **closure**. For memoize use a `Map` and check with `has`, not with a truthiness test. A `Map` keeps insertion order, so deleting and re-setting a key moves it to the "most recent" end.
:::
:::

## Solution and tests

```js run title="once and memoize, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

function once(fn) {
  let called = false, result;
  return function (...args) {
    if (!called) {
      called = true;                                  // set BEFORE calling: a recursive call must not run it twice
      result = fn.apply(this, args);
    }
    return result;
  };
}

function memoize(fn, { key = (...args) => JSON.stringify(args), max = Infinity } = {}) {
  const cache = new Map();
  function memoized(...args) {
    const k = key.apply(this, args);
    if (cache.has(k)) {                               // has(), so 0 / "" / false / undefined results count as hits
      const value = cache.get(k);
      cache.delete(k); cache.set(k, value);           // mark as most recently used
      return value;
    }
    const value = fn.apply(this, args);
    cache.set(k, value);
    if (cache.size > max) cache.delete(cache.keys().next().value);      // evict the least recently used (the first key)
    return value;
  }
  memoized.cache = cache;
  return memoized;
}

// ---------------- tests ----------------
await test("once runs fn a single time and returns the first result", () => {
  let calls = 0;
  const f = once((x) => { calls++; return x * 2; });
  assert.equal(f(21), 42);
  assert.equal(f(100), 42);
  assert.equal(calls, 1);
});

await test("once keeps this", () => {
  const o = { n: 5, get: once(function () { return this.n; }) };
  assert.equal(o.get(), 5);
});

await test("memoize caches by arguments", () => {
  let calls = 0;
  const add = memoize((a, b) => { calls++; return a + b; });
  assert.equal(add(1, 2), 3);
  assert.equal(add(1, 2), 3);
  assert.equal(add(2, 1), 3);                         // different args: a different key
  assert.equal(calls, 2);
});

await test("memoize caches falsy results", () => {
  let calls = 0;
  const f = memoize((x) => { calls++; return x === 0 ? 0 : undefined; });
  f(0); f(0); f(1); f(1);
  assert.equal(calls, 2);
});

await test("custom key", () => {
  let calls = 0;
  const f = memoize((user) => { calls++; return user.name; }, { key: (user) => user.id });
  f({ id: 1, name: "Asha" }); f({ id: 1, name: "Asha again" });
  assert.equal(calls, 1);
});

await test("max size evicts the least recently used", () => {
  let calls = 0;
  const f = memoize((n) => { calls++; return n; }, { max: 2 });
  f(1); f(2); f(1);                                   // 1 is now the most recently used
  f(3);                                               // evicts 2
  f(1);                                               // still cached
  f(2);                                               // recomputed
  assert.equal(calls, 4);
});

await test("async: cache the promise so concurrent calls share one request", async () => {
  let calls = 0;
  const fetchUser = memoize(async (id) => { calls++; await new Promise((r) => setTimeout(r, 10)); return { id }; });
  const [a, b] = await Promise.all([fetchUser(1), fetchUser(1)]);
  assert.equal(a, b);
  assert.equal(calls, 1);
});
```

## Interview follow-ups

:::qa What is the bug in `if (cache[key]) return cache[key]`? {level=easy}
**Say this:** "It treats falsy results (0, empty string, false) as 'not cached' and recomputes them. Also a plain object has inherited keys like `constructor`. Use a `Map` and `has`."

**In simple words:** An answer of zero is still an answer.
:::

:::qa What are the problems of `JSON.stringify(args)` as a key? {level=medium}
**Say this:** "It is slow for big arguments, ignores key order differences in objects, drops `undefined` and functions, turns `NaN` into null, and fails on circular structures or BigInt. Provide a custom key function when you know the argument shape."

**In simple words:** It is a quick key, not a perfect one.
:::

:::qa How would you make `memoize` safe for async functions that can fail? {level=hard}
**Say this:** "Cache the promise, and remove the entry if it rejects (`.catch(e => { cache.delete(k); throw e; })`), so failures are not cached forever."

**In simple words:** Remember successes, not errors.
:::

:::keypoints
- **once**: a `called` flag and a stored `result`; set the flag **before** calling.
- **memoize**: `Map` + key function; **`has()`**, not truthiness; keep **`this`**; **LRU** via delete + set; cache **promises** for async.
- Beware `JSON.stringify` keys, unbounded caches (leaks) and impure functions.
:::
