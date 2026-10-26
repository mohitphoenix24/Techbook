---
title: Implement an async pool (concurrency limit)
level: medium
time: 30
summary: Run many async tasks with at most N at a time, keep the results in order, and stop cleanly on the first error. Also a reusable queue with a limit.
---

:::problem Implement an async pool {level=medium tags="promises,concurrency,queue"}
You have 1,000 URLs to fetch. `Promise.all(urls.map(fetch))` starts all 1,000 at once and may overload the server or your own network.

1. Write `pool(limit, items, worker)`: run `worker(item, index)` for each item, with **at most `limit` running at the same time**. Return the results **in input order**.
2. On the first error, **stop starting new tasks** and reject with that error.
3. Write `createLimiter(limit)` that returns a function `run(task)`; tasks are queued when the limit is full.

```js
const results = await pool(3, urls, (url) => fetchJson(url));
```

:::hint Hint
Start `limit` "workers". Each worker loops: take the next index, run the task, repeat until no items remain. Then wait for all workers with `Promise.all`.
:::
:::

## Solution and tests

```js run title="pool and createLimiter, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pool(limit, items, worker) {
  const list = Array.from(items);
  const results = new Array(list.length);
  let next = 0;
  let failed = false;

  async function runner() {
    while (!failed && next < list.length) {
      const i = next++;                                      // safe: JavaScript is single-threaded, no race here
      try {
        results[i] = await worker(list[i], i);
      } catch (e) {
        failed = true;                                       // tell the other runners to stop taking new items
        throw e;
      }
    }
  }
  const runners = Array.from({ length: Math.min(limit, list.length) }, runner);
  await Promise.all(runners);                                // rejects with the first error
  return results;
}

function createLimiter(limit) {
  let active = 0;
  const queue = [];

  const startNext = () => {
    if (active >= limit || queue.length === 0) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => { active--; startNext(); });
  };

  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    startNext();
  });
}

// ---------------- tests ----------------
await test("results keep the input order", async () => {
  const r = await pool(2, [30, 5, 15], async (ms, i) => { await sleep(ms); return `${i}:${ms}`; });
  assert.deepEqual(r, ["0:30", "1:5", "2:15"]);
});

await test("never more than `limit` at once", async () => {
  let active = 0, peak = 0;
  await pool(3, Array.from({ length: 10 }, (_, i) => i), async () => {
    active++; peak = Math.max(peak, active);
    await sleep(10);
    active--;
  });
  assert.equal(peak, 3);
});

await test("uses the full limit when there is enough work", async () => {
  let active = 0, peak = 0;
  await pool(4, Array.from({ length: 4 }, (_, i) => i), async () => { active++; peak = Math.max(peak, active); await sleep(10); active--; });
  assert.equal(peak, 4);
});

await test("a limit larger than the list is fine; an empty list too", async () => {
  assert.deepEqual(await pool(10, [1, 2], async (x) => x * 2), [2, 4]);
  assert.deepEqual(await pool(3, [], async (x) => x), []);
});

await test("stops starting new tasks after the first error", async () => {
  const started = [];
  await assert.rejects(
    pool(2, [0, 1, 2, 3, 4, 5, 6, 7], async (x) => {
      started.push(x);
      await sleep(10);
      if (x === 1) throw new Error("task 1 failed");
      return x;
    }),
    /task 1 failed/,
  );
  await sleep(50);                                           // let the running ones finish
  assert.ok(started.length < 8, "only " + started.length + " of 8 were started");
});

await test("worker receives the index", async () => {
  assert.deepEqual(await pool(2, ["a", "b", "c"], async (x, i) => x + i), ["a0", "b1", "c2"]);
});

await test("createLimiter limits parallel runs and returns each result", async () => {
  const run = createLimiter(2);
  let active = 0, peak = 0;
  const task = (v) => async () => { active++; peak = Math.max(peak, active); await sleep(10); active--; return v; };
  const results = await Promise.all([1, 2, 3, 4, 5].map((v) => run(task(v))));
  assert.deepEqual(results, [1, 2, 3, 4, 5]);
  assert.equal(peak, 2);
});

await test("createLimiter: a failing task does not block the queue", async () => {
  const run = createLimiter(1);
  const a = run(async () => { throw new Error("bad"); });
  const b = run(async () => "fine");
  await assert.rejects(a, /bad/);
  assert.equal(await b, "fine");
});
```

## Why a worker loop and not batches?

Batches (`chunk` the list, `await Promise.all(batch)`) wait for the **slowest** task in each batch, so slots sit idle. A worker loop starts the next task **the moment** one finishes, so the pool stays full.

| Approach | Idle slots | Code |
|---|---|---|
| `Promise.all(all)` | none, but no limit | shortest |
| Batches of N | **yes** (waits for the slowest) | simple |
| Worker loop (above) | none | a few lines more |

:::qa Is `const i = next++` safe without a lock? {level=medium}
**Say this:** "Yes. JavaScript runs one piece of synchronous code at a time, and there is no `await` between reading and incrementing `next`. So no two workers can take the same index. In a language with real threads you would need a lock."

**In simple words:** No two workers can run at the same instant here.
:::

:::qa How would you add retries, timeouts and cancellation? {level=hard}
**Say this:** "Wrap the `worker` call: `retry(() => withTimeout(worker(item), ms))`, pass an `AbortSignal` to the worker and stop the loop when it aborts. Keep the pool itself small and compose behaviours around the worker."

**In simple words:** Keep the pool simple, and wrap the worker.
:::

:::qa How is this different from the browser's connection limit or from rate limiting? {level=medium}
**Say this:** "A pool limits **how many run at once** (concurrency). A rate limiter limits **how many start per time period**. You often need both: for example, 5 parallel requests and at most 20 per second."

**In simple words:** One counts the people inside; the other counts the people entering per minute.
:::

:::keypoints
- `pool` = N **worker loops** sharing one `next` index; **results by index**.
- Set a **`failed` flag** so no new tasks start after an error; `Promise.all` rejects with the first one.
- Prefer worker loops to **batches** (no idle slots).
- Concurrency limit ≠ rate limit.
:::
