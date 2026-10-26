---
title: Memoization
level: intermediate
time: 30
summary: Caching the results of pure functions: a basic memoize, handling many arguments and object arguments, limits and TTL, memoizing async functions safely, and when memoization is a bad idea.
---

## The idea

> "**Memoization** remembers the result of a function for each set of arguments, so the second call with the same arguments returns the saved answer instead of calculating again."

It works for **pure functions** only: same input must always give the same output, with no side effects. (See the pure-functions lesson.)

:::analogy Writing down answers
A maths student who solved `47 × 83` once writes the answer in a notebook. When the same question comes again, they look at the notebook instead of working it out.
:::

## A basic version

```js run title="memoize(fn): one argument"
function memoize(fn) {
  const cache = new Map();
  return function (arg) {
    if (cache.has(arg)) return cache.get(arg);           // cache hit
    const result = fn.call(this, arg);                    // cache miss: compute
    cache.set(arg, result);
    return result;
  };
}

let computations = 0;
const square = memoize((n) => { computations++; return n * n; });

console.log(square(9), square(9), square(9), square(12));
console.log("real computations:", computations);          // 2, not 4
```

Use `cache.has(arg)` (not `if (cache.get(arg))`) so falsy results like `0`, `""`, `false` or `undefined` are cached too.

## Many arguments: build a cache key

For several arguments, you need a **single key**. `JSON.stringify(args)` is the simple choice.

```js run title="memoize with multiple arguments"
function memoize(fn, { keyFn = (...args) => JSON.stringify(args) } = {}) {
  const cache = new Map();
  const memoized = function (...args) {
    const key = keyFn(...args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
  memoized.cache = cache;
  memoized.clear = () => cache.clear();
  return memoized;
}

let calls = 0;
const add = memoize((a, b) => { calls++; return a + b; });
console.log(add(1, 2), add(1, 2), add(2, 1), calls);       // add(2,1) is a different key: [2,1] vs [1,2]

// choose the key yourself when you know the shape (faster, and handles argument order)
const distance = memoize((p, q) => Math.hypot(p.x - q.x, p.y - q.y), { keyFn: (p, q) => `${p.x},${p.y}|${q.x},${q.y}` });
console.log(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), distance({ x: 0, y: 0 }, { x: 3, y: 4 }), distance.cache.size);
```

Limits of `JSON.stringify` as a key:

- it is **slow** for big arguments, and **loses** `undefined`, functions, symbols, `NaN`;
- `{a:1,b:2}` and `{b:2,a:1}` give **different** keys;
- it cannot handle **circular** structures or `BigInt`.

## Nested caches for object arguments (WeakMap)

If the argument is an **object**, key by identity with a `WeakMap`. It also avoids leaks, since the cache entry disappears when the object does.

```js run title="WeakMap cache: object identity as the key"
function memoizeByObject(fn) {
  const cache = new WeakMap();
  return (obj) => {
    if (!cache.has(obj)) cache.set(obj, fn(obj));
    return cache.get(obj);
  };
}

let work = 0;
const summarise = memoizeByObject((order) => { work++; return order.items.reduce((s, i) => s + i.price, 0); });

const order = { items: [{ price: 10 }, { price: 20 }] };
console.log(summarise(order), summarise(order), work);
const sameShape = { items: [{ price: 10 }, { price: 20 }] };
console.log(summarise(sameShape), work);                  // a different object: computed again
```

This is exactly how libraries like **Reselect** (selectors in Redux) and React's `useMemo` think: compare arguments by **reference** (`===`).

## A bounded cache: LRU and TTL

An unlimited cache is a **memory leak**. Limit the size, or the age of entries.

```js run title="memoize with a max size (LRU) and a TTL"
function memoizeBounded(fn, { max = 100, ttlMs = Infinity, now = () => Date.now() } = {}) {
  const cache = new Map();                                       // insertion order = recency order
  return (...args) => {
    const key = JSON.stringify(args);
    const hit = cache.get(key);
    if (hit && hit.expires > now()) {
      cache.delete(key); cache.set(key, hit);                    // move to the end: most recently used
      return hit.value;
    }
    const value = fn(...args);
    cache.delete(key);
    cache.set(key, { value, expires: now() + ttlMs });
    if (cache.size > max) cache.delete(cache.keys().next().value);   // evict the least recently used
    return value;
  };
}

let computed = [];
const f = memoizeBounded((n) => { computed.push(n); return n * 2; }, { max: 2 });
f(1); f(2); f(1);                    // 1 is "recently used" again
f(3);                                // evicts 2 (the least recently used)
f(2);                                // 2 must be recomputed
f(1);                                // 1 was evicted by the previous call (cache holds 3 and 2)
console.log("computed:", computed);

let t = 0;                           // a fake clock to demonstrate expiry deterministically
const g = memoizeBounded(() => "computed at t=" + t, { ttlMs: 1000, now: () => t });
console.log(g(), "|", (t = 500, g()), "|", (t = 1500, g()), "<- the last one was recomputed after the TTL");
```

## Memoizing async functions

For a function that returns a **promise**, cache the **promise itself** (so concurrent callers share one request), and **remove failures** so a temporary error is not cached forever.

```js run title="Async memoize: share in-flight requests, do not cache errors"
function memoizeAsync(fn) {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) {
      const promise = fn(key).catch((err) => { cache.delete(key); throw err; });   // evict on failure
      cache.set(key, promise);
    }
    return cache.get(key);
  };
}

let requests = 0, shouldFail = true;
const fetchUser = memoizeAsync(async (id) => {
  requests++;
  await new Promise((r) => setTimeout(r, 20));
  if (shouldFail) throw new Error("network error");
  return { id };
});

(async () => {
  const [a, b] = await Promise.allSettled([fetchUser(1), fetchUser(1)]);        // concurrent: ONE request
  console.log(a.status, b.status, "requests:", requests);
  shouldFail = false;
  console.log(await fetchUser(1), await fetchUser(1), "requests:", requests);   // retried once, then cached
})();
```

## Memoization with recursion

Memoizing the recursive function itself turns exponential algorithms into linear ones (you saw `fib`). For deep recursion keep the stack limit in mind.

```js run title="Memoized recursion: the number of ways to climb stairs"
const climb = memoize((n) => (n <= 1 ? 1 : climb(n - 1) + climb(n - 2)));
function memoize(fn) { const c = new Map(); return (n) => (c.has(n) ? c.get(n) : (c.set(n, fn(n)), c.get(n))); }
console.log(climb(10), climb(40), climb(90));
```

## When NOT to memoize

- **Impure functions**: reading time, random numbers, files, the network (without an expiry), or mutating arguments. The cache would return stale or wrong answers.
- **Cheap functions**: the cache lookup (especially `JSON.stringify`) can cost **more** than the calculation.
- **Arguments that are almost never repeated**: the cache only grows and never helps.
- **Huge or unbounded input space**: needs a size limit.
- **Mutable arguments**: an object changed after caching keeps the old answer under the same reference.

Always **measure** (hit rate and time) before and after.

## Related: memoization in React

| API | What it memoizes | Compares with |
|---|---|---|
| `useMemo(() => compute(a, b), [a, b])` | a **calculated value** | `Object.is` on each dependency |
| `useCallback(fn, [deps])` | a **function identity** | dependencies |
| `React.memo(Component)` | a **component's render** | props, shallow |
| Selectors (Reselect) | derived state | input selectors, `===` |

They keep **one previous result** (not a map of all), and they are for avoiding **re-renders and recalculations**, not a guarantee (React may drop the cache).

:::interview What is memoization? Implement a memoize function and discuss its pitfalls.
"Memoization caches the result of a pure function per set of arguments, so repeated calls with the same input return the stored value. I implement it with a `Map` in a closure: build a key from the arguments (`JSON.stringify(args)`, or a custom key function), return the cached value if `has(key)`, otherwise compute and store. Pitfalls: it only works for pure functions; JSON keys are slow and ignore object identity or key order; an unbounded cache is a memory leak, so I add an LRU limit or TTL, or a WeakMap for object arguments; for async functions I cache the promise to share in-flight requests and remove it on rejection; and for cheap functions the lookup may cost more than the work."
:::

## More interview questions on this topic

:::qa Why do we use `cache.has(key)` instead of checking the value? {level=easy}
**Say this:** "Because a cached value can be falsy (`0`, `''`, `false`, `undefined`). `has` tells us whether the key exists."

**In simple words:** An answer of zero is still an answer.
:::

:::qa How do you memoize a function that takes object arguments? {level=medium}
**Say this:** "Use a `WeakMap` keyed by object identity, or build a key from the relevant fields, or serialise with a stable stringify. Identity works if the same object is reused; and the WeakMap releases entries when the object is collected."

**In simple words:** Either "same object" or "same content", and choose which one you mean.
:::

:::qa How do you prevent the cache from growing forever? {level=medium}
**Say this:** "Set a maximum size and evict the least recently used entry, or add a time-to-live per entry, or use a WeakMap."

**In simple words:** Give the notebook a limited number of pages.
:::

:::qa Why cache the promise rather than the resolved value for async functions? {level=hard}
**Say this:** "So that callers that arrive while the request is still in flight share the same promise and one request is made. I delete the entry if it rejects."

**In simple words:** Everyone who asks while the answer is being fetched gets the same ticket.
:::

```quiz
? Which functions can be memoized safely?
- Any function
+ Pure functions
- Functions that read the clock
> Same input must give the same output.
? What is a risk of an unbounded memoize cache?
- It is slower to read
+ A memory leak
- It breaks recursion
> Add a size limit or TTL.
? Why delete a rejected promise from an async memoize cache?
- To save memory only
+ So a temporary failure is not cached and a later call can retry
- Because promises cannot be cached
> Do not cache errors.
```

:::keypoints
- **Memoization** = cache results of **pure** functions by arguments. A `Map` in a closure.
- Use `has()`, not a truthiness check. Key via `JSON.stringify(args)` or a custom key; **WeakMap** for object identity.
- **Bound** the cache (LRU, TTL). **Async**: cache the promise, evict on failure.
- Do not memoize impure or cheap functions. **Measure.**
- React: `useMemo`, `useCallback`, `React.memo` are memoization by reference.
:::
