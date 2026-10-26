---
title: Implement an async iterator pipeline
level: hard
time: 40
summary: Write map, filter, take, batch and merge as async generators. See pull-based backpressure, clean shutdown through return(), error propagation, and why this beats arrays of promises for large or endless data.
---

:::problem Implement async iterator operators {level=hard tags="async iterators,generators,backpressure,streams"}
Write small operators on **async iterables** (anything you can `for await` over), each returning a new async iterable:

- `map(fn)`, `filter(pred)` (both may be async)
- `take(n)`: stop after `n` items and **close the source** (its `finally` must run)
- `batch(size)`: groups of `size`, and the last smaller group
- `merge(...sources)`: items from several sources **as they arrive**, closing all sources on early exit
- `pipeline(source, ...operators)` and `toArray(iterable)`

Behaviour to show and test:

1. **Lazy / pull-based**: the source produces a value only when the consumer asks for it.
2. **Early exit**: `break` or `take` closes the source and runs its cleanup.
3. **Errors** travel to the consumer and clean up every source.

```js
const result = await toArray(pipeline(numbers(), filter((x) => x % 2), map((x) => x * 10), take(3)));
```

:::hint Hint
An **async generator** (`async function*`) is the natural tool: `for await (const x of src) yield ...`. Leaving a `for await` loop early (return, break or throw) automatically calls `src.return()`. For `merge`, keep one pending `next()` per source and `Promise.race` them.
:::
:::

## Solution and tests

```js run title="Async iterator operators, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- operators: each takes a source and returns an async generator ----------
const map = (fn) => async function* (src) { for await (const x of src) yield await fn(x); };
const filter = (pred) => async function* (src) { for await (const x of src) if (await pred(x)) yield x; };

const take = (n) => async function* (src) {
  if (n <= 0) return;                                        // never even start the source
  let i = 0;
  for await (const x of src) {
    yield x;
    if (++i >= n) return;                                    // leaving the loop calls src.return(): the source's finally runs
  }
};

const batch = (size) => async function* (src) {
  let group = [];
  for await (const x of src) {
    group.push(x);
    if (group.length === size) { yield group; group = []; }
  }
  if (group.length) yield group;                             // the last, smaller group
};

async function* merge(...sources) {
  const its = sources.map((s) => s[Symbol.asyncIterator]());
  const pending = new Map(its.map((it, i) => [i, it.next().then((r) => ({ i, r }))]));   // one outstanding next() per source
  try {
    while (pending.size) {
      const { i, r } = await Promise.race(pending.values());                            // whichever source answers first
      if (r.done) pending.delete(i);
      else { pending.set(i, its[i].next().then((r2) => ({ i, r: r2 }))); yield r.value; }
    }
  } finally {
    await Promise.all(its.map((it) => it.return?.()));       // early exit or error: close every source
  }
}

const pipeline = (source, ...ops) => ops.reduce((s, op) => op(s), source);
async function toArray(iterable) { const out = []; for await (const x of iterable) out.push(x); return out; }

// ---------------- tests ----------------
async function* numbers(limit = Infinity, log = []) {
  try { for (let i = 1; i <= limit; i++) { log.push("produce " + i); yield i; } }
  finally { log.push("source closed"); }
}

await test("map, filter and take compose", async () => {
  const r = await toArray(pipeline(numbers(), filter((x) => x % 2), map((x) => x * 10), take(3)));
  assert.deepEqual(r, [10, 30, 50]);
});

await test("an endless source is fine, because everything is lazy", async () => {
  assert.equal((await toArray(pipeline(numbers(), take(1000)))).length, 1000);
});

await test("pull-based: producer and consumer take turns", async () => {
  const log = [];
  for await (const x of take(2)(numbers(5, log))) log.push("consume " + x);
  assert.deepEqual(log, ["produce 1", "consume 1", "produce 2", "consume 2", "source closed"]);   // 3, 4 and 5 were never produced
});

await test("break closes the source", async () => {
  const log = [];
  for await (const x of numbers(10, log)) { if (x === 2) break; }
  assert.equal(log.at(-1), "source closed");
});

await test("a slow consumer slows the producer (backpressure)", async () => {
  const log = [];
  for await (const x of numbers(3, log)) { log.push("start " + x); await sleep(10); log.push("end " + x); }
  assert.deepEqual(log.slice(0, 4), ["produce 1", "start 1", "end 1", "produce 2"]);        // no produce 2 before end 1
});

await test("take(0) never starts the source", async () => {
  const log = [];
  await toArray(take(0)(numbers(5, log)));
  assert.deepEqual(log, []);
});

await test("batch groups and keeps the remainder", async () => {
  assert.deepEqual(await toArray(batch(2)(numbers(5))), [[1, 2], [3, 4], [5]]);
});

await test("async map and filter", async () => {
  const r = await toArray(pipeline(numbers(4), map(async (x) => { await sleep(2); return x + 1; }), filter(async (x) => x > 2)));
  assert.deepEqual(r, [3, 4, 5]);
});

await test("errors reach the consumer and the source is closed", async () => {
  const log = [];
  const failing = pipeline(numbers(10, log), map((x) => { if (x === 3) throw new Error("bad item 3"); return x; }));
  await assert.rejects(toArray(failing), /bad item 3/);
  assert.equal(log.at(-1), "source closed");
});

async function* timed(items) { for (const [ms, value] of items) { await sleep(ms); yield value; } }

await test("merge yields items as they arrive", async () => {
  const a = timed([[10, "a1"], [60, "a2"]]);               // arrives at about 10 and 70 ms
  const b = timed([[40, "b1"]]);                           // arrives at about 40 ms
  assert.deepEqual(await toArray(merge(a, b)), ["a1", "b1", "a2"]);
});

await test("merge: take closes every source", async () => {
  const log = [];
  async function* src(name, ms) { try { for (let i = 1; ; i++) { await sleep(ms); yield `${name}${i}`; } } finally { log.push(name + " closed"); } }
  const first3 = await toArray(take(3)(merge(src("a", 10), src("b", 25))));
  assert.equal(first3.length, 3);
  assert.deepEqual(log.sort(), ["a closed", "b closed"]);
});

await test("merge: an error in one source closes the others", async () => {
  const log = [];
  async function* good() { try { while (true) { await sleep(5); yield "ok"; } } finally { log.push("good closed"); } }
  async function* bad() { await sleep(20); throw new Error("source failed"); }
  await assert.rejects(toArray(merge(good(), bad())), /source failed/);
  assert.deepEqual(log, ["good closed"]);
});

await test("works with Node-style sources too: any async iterable", async () => {
  const { Readable } = require("node:stream");
  const r = await toArray(pipeline(Readable.from(["a", "b", "c"]), map((s) => s.toUpperCase())));
  assert.deepEqual(r, ["A", "B", "C"]);
});
```

## Why not just arrays and `Promise.all`?

| Need | Arrays + Promise.all | Async iterators |
|---|---|---|
| Endless or huge data (log files, DB cursors, events) | no: needs everything in memory | **yes**, one item at a time |
| Stop early and release resources | awkward | `break` / `return()` runs `finally` |
| Slow consumer | the producer runs ahead | **backpressure** by design |
| Items arrive over time | no | **yes** |
| Parallel work on all items | `Promise.all` is simple and fast | needs a concurrency operator |

Node streams, `fs.promises` `filehandle.readLines()`, `events.on()`, `fetch` response bodies and database cursors are all async iterables.

:::qa What happens to the source when the consumer leaves a `for await` loop early? {level=medium}
**Say this:** "The loop calls `iterator.return()`. For an async generator that resumes it at the `yield` as if a `return` happened, so the `finally` block runs and resources are released. That is why generators are the safest way to wrap resources."

**In simple words:** Leaving the loop politely tells the source to tidy up.
:::

:::qa How is backpressure achieved here without any extra code? {level=medium}
**Say this:** "An async generator does nothing until someone calls `next()`. The consumer only calls `next()` when it is ready for more, so the producer cannot get ahead of it. There is no buffer to overflow."

**In simple words:** The source gives an item only when asked.
:::

:::qa How would you add a concurrency option to `map`? {level=hard}
**Say this:** "Keep a set of up to N in-flight promises: pull items from the source while fewer than N are running, `Promise.race` to find the one that finishes first, and yield its result (unordered), or keep the order by yielding the oldest first. Remember to close the source and ignore the pending work on early exit."

**In simple words:** Start several at once, but still stay in step with the consumer.
:::

:::keypoints
- **Async generators** make operators in a few lines: `for await` in, `yield` out.
- **Pull-based** = lazy and **backpressure for free**; works on endless sources.
- Leaving a `for await` **calls `return()`**, which runs the source's **`finally`**; `take` relies on this.
- `merge` = one **pending `next()` per source** + `Promise.race`; always close all sources in `finally`.
:::
