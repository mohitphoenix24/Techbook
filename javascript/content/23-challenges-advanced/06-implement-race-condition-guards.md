---
title: Fix race conditions (takeLatest, mutex, single-flight)
level: hard
time: 40
summary: Reproduce the stale-response bug of a typeahead, then fix it with takeLatest, stop lost updates with a mutex, and share one request with single-flight. The async bugs that appear only in production.
---

:::problem Fix async race conditions {level=hard tags="async,races,concurrency,abort,mutex"}
JavaScript has no data races between threads, but **async code interleaves**. Three classic bugs:

1. **Stale response**: the user types `a`, then `ab`. The request for `a` is slow, the one for `ab` is fast. The old response arrives last and **overwrites** the right result. Write `takeLatest(fn)`: only the **latest** call may produce a result; older ones are cancelled (their signal aborts) and rejected with an `AbortError`.
2. **Lost update**: two `increment()` calls both `await read()`, then both write `value + 1`. The counter goes up by 1, not 2. Write `createMutex()` so that tasks run **one at a time, in order**, even if one fails.
3. **Duplicate work**: ten components ask for `/user/1` at the same moment. Write `singleFlight(fn)` so that concurrent calls with the same key **share one** in-flight promise.

For each, first write the **buggy** version in the test and show the bug, then show the fix.

:::hint Hint
`takeLatest`: keep the current `AbortController`; on each call abort the previous one, and check `signal.aborted` again when your own `await` returns. Mutex: keep a `tail` promise; each task is chained after it. Single-flight: a `Map` of key → promise, deleted in `finally`.
:::
:::

## Solution and tests

```js run title="Race condition fixes, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

// ---------- 1. takeLatest ----------
function takeLatest(fn) {
  let current = null;
  return function (...args) {
    current?.abort(new DOMException("Superseded by a newer call", "AbortError"));   // cancel the previous call's work
    const controller = (current = new AbortController());
    return Promise.resolve()
      .then(() => fn(controller.signal, ...args))
      .then((value) => {
        if (controller.signal.aborted) throw controller.signal.reason;              // fn ignored the signal? drop the stale result anyway
        return value;
      });
  };
}

// ---------- 2. mutex (serial queue) ----------
function createMutex() {
  let tail = Promise.resolve();
  return function run(task) {
    const result = tail.then(task);                           // start only after the previous task has finished
    tail = result.catch(() => {});                            // a failed task must not block the queue
    return result;
  };
}

// ---------- 3. single-flight ----------
function singleFlight(fn, keyOf = (...args) => JSON.stringify(args)) {
  const inflight = new Map();
  return function (...args) {
    const key = keyOf(...args);
    if (inflight.has(key)) return inflight.get(key);
    const promise = Promise.resolve().then(() => fn(...args)).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  };
}

// ---------------- the scenario ----------------
const fakeSearch = async (query, signal) => {
  await sleep(query === "a" ? 60 : 10, signal);               // the short query is SLOW, the long one is fast
  return `results for "${query}"`;
};

await test("BUG: without a guard, the old slow response overwrites the new one", async () => {
  let shown = "";
  const naive = async (q) => { shown = await fakeSearch(q); };
  await Promise.all([naive("a"), (async () => { await sleep(5); await naive("ab"); })()]);
  assert.equal(shown, 'results for "a"');                     // WRONG: the user typed "ab"
});

await test("FIX 1a: a request counter ignores stale responses", async () => {
  let shown = "", latest = 0;
  const search = async (q) => { const mine = ++latest; const r = await fakeSearch(q); if (mine === latest) shown = r; };
  await Promise.all([search("a"), (async () => { await sleep(5); await search("ab"); })()]);
  assert.equal(shown, 'results for "ab"');
});

await test("FIX 1b: takeLatest aborts the old call and rejects it", async () => {
  let shown = "";
  const search = takeLatest((signal, q) => fakeSearch(q, signal));      // takeLatest passes the signal FIRST
  const results = await Promise.allSettled([
    search("a").then((r) => (shown = r)),
    (async () => { await sleep(5); return search("ab").then((r) => (shown = r)); })(),
  ]);
  assert.equal(shown, 'results for "ab"');
  assert.equal(results[0].status, "rejected");
  assert.equal(results[0].reason.name, "AbortError");         // not an error to report: it was replaced
  assert.equal(results[1].status, "fulfilled");
});

await test("takeLatest drops the stale result even if fn ignores the signal", async () => {
  const search = takeLatest(async (signal, q) => { await sleep(q === "slow" ? 40 : 5); return q; });
  const first = search("slow");
  const second = search("fast");
  assert.equal(await second, "fast");
  await assert.rejects(first, (e) => e.name === "AbortError");
});

await test("takeLatest: the signal given to fn is aborted when superseded", async () => {
  let firstSignal;
  const search = takeLatest(async (signal, q) => { if (q === 1) firstSignal = signal; await sleep(10); return q; });
  const p1 = search(1); p1.catch(() => {});
  await sleep(2);
  await search(2);
  assert.equal(firstSignal.aborted, true);
});

// ---------- lost update ----------
function makeCounter() {
  let stored = 0;
  return {
    read: async () => { await sleep(5); return stored; },
    write: async (v) => { await sleep(5); stored = v; },
    get value() { return stored; },
  };
}

await test("BUG: two concurrent read-modify-write operations lose an update", async () => {
  const c = makeCounter();
  const increment = async () => { const v = await c.read(); await c.write(v + 1); };
  await Promise.all([increment(), increment(), increment()]);
  assert.equal(c.value, 1);                                   // should be 3
});

await test("FIX 2: a mutex serialises the read-modify-write", async () => {
  const c = makeCounter();
  const lock = createMutex();
  const increment = () => lock(async () => { const v = await c.read(); await c.write(v + 1); });
  await Promise.all([increment(), increment(), increment()]);
  assert.equal(c.value, 3);
});

await test("mutex: tasks run in order and a failure does not block the rest", async () => {
  const lock = createMutex();
  const order = [];
  const a = lock(async () => { await sleep(20); order.push("a"); });
  const b = lock(async () => { order.push("b"); throw new Error("b failed"); });
  const c = lock(async () => { order.push("c"); return "c ok"; });
  await assert.rejects(b, /b failed/);
  assert.equal(await c, "c ok");
  await a;
  assert.deepEqual(order, ["a", "b", "c"]);
});

// ---------- duplicate requests ----------
await test("single-flight: concurrent calls share one request", async () => {
  let calls = 0;
  const getUser = singleFlight(async (id) => { calls++; await sleep(15); return { id }; });
  const [a, b, c] = await Promise.all([getUser(1), getUser(1), getUser(2)]);
  assert.equal(a, b);                                         // the very same result object
  assert.notEqual(a, c);
  assert.equal(calls, 2);
});

await test("single-flight: after it finishes, the next call starts a new request", async () => {
  let calls = 0;
  const get = singleFlight(async () => { calls++; await sleep(5); });
  await get(); await get();
  assert.equal(calls, 2);
});

await test("single-flight: a failure is shared, then forgotten", async () => {
  let calls = 0;
  const get = singleFlight(async () => { calls++; await sleep(5); if (calls === 1) throw new Error("first fails"); return "ok"; });
  const [r1, r2] = await Promise.allSettled([get(), get()]);
  assert.equal(r1.status, "rejected");
  assert.equal(r2.status, "rejected");
  assert.equal(await get(), "ok");
  assert.equal(calls, 2);
});
```

## The same bugs in React

```js
useEffect(() => {
  let ignore = false;                           // the "latest only" guard
  fetchResults(query).then((r) => { if (!ignore) setResults(r); });
  return () => { ignore = true; };              // runs before the next effect, or on unmount
}, [query]);
```

Better: pass an `AbortController` signal into `fetch` and abort in the cleanup. Libraries like **TanStack Query**, **SWR** and **RTK Query** do this (plus de-duplication = single-flight) for you.

## Which tool for which bug?

| Symptom | Cause | Fix |
|---|---|---|
| Old result shows after new input | out-of-order responses | `takeLatest` / abort / "ignore" flag |
| Counter or balance is off by some | read-modify-write across `await` | mutex, or do it atomically (DB transaction, `UPDATE ... SET n = n + 1`) |
| Same request fired many times | many callers, no sharing | single-flight / cache the promise |
| Double submit of a form | click twice before the first finishes | disable the button, or `if (submitting) return`, plus an **idempotency key** on the server |
| State update after unmount | late response | abort in cleanup |

:::qa JavaScript is single-threaded, so how can races exist? {level=medium}
**Say this:** "Each synchronous piece runs without interruption, but every `await` is a point where other code can run. Between reading a value and writing it back, another task can change the same state. So the problem is interleaving, not parallel threads."

**In simple words:** Only one person talks at a time, but they can leave the room between sentences.
:::

:::qa Why is a mutex in the app not enough for a bank balance? {level=hard}
**Say this:** "A mutex only protects one process. With several servers, or a restart in the middle, the database must guarantee correctness: a transaction, an atomic update (`balance = balance - 100 WHERE balance >= 100`), optimistic locking with a version column, or an idempotency key."

**In simple words:** The lock must live where all the servers can see it.
:::

:::qa What is the difference between debouncing and `takeLatest`? {level=medium}
**Say this:** "Debounce **delays** the call until the user pauses, so fewer requests are sent. `takeLatest` allows the requests but **ignores the stale ones**. They are often used together: debounce to reduce traffic, takeLatest to guarantee correctness."

**In simple words:** One sends fewer requests; the other ignores outdated answers.
:::

:::keypoints
- Races come from **`await` gaps**: reads and writes that span an `await` can interleave.
- **Stale responses**: abort the old call and re-check "am I still the latest?" after the `await`.
- **Lost updates**: serialise with a **mutex** (promise chain; keep the chain alive after failures), or make the operation atomic in the database.
- **Duplicate requests**: **single-flight** on a key, delete the entry in `finally`.
:::
