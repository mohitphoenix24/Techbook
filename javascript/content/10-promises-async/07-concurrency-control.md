---
title: Concurrency control: pools, queues and semaphores
level: advanced
time: 30
summary: How to run many async jobs with a limit (a worker pool, a p-limit style helper, a semaphore, a task queue), and how to keep results in order, handle errors, and avoid starting thousands of requests at once.
---

## The problem

You have **1000 URLs** to fetch. Two bad options:

1. **One at a time** (`for...of` + `await`): safe, but slow.
2. **All at once** (`Promise.all(urls.map(fetch))`): fast, but you open 1000 connections together. You may hit rate limits, run out of file handles or memory, and overload the server.

The sweet spot is **concurrency limit N** (for example, 5 at a time): keep **exactly N** jobs running, and start the next one the moment one finishes.

```viz algo=timeline title="6 jobs, limit 2: a sliding window"
scale: 0-300 ms
lane Worker 1 | 0-100 | job 1 | run
lane Worker 1 | 100-200 | job 3 | run
lane Worker 1 | 200-300 | job 5 | run
lane Worker 2 | 0-150 | job 2 | ok
lane Worker 2 | 150-250 | job 4 | ok
lane Worker 2 | 250-300 | job 6 | ok
```

## Pattern 1: a worker pool

Start N "workers". Each worker is a loop that **takes the next item** until none are left.

```js run title="mapLimit(items, limit, worker)"
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);        // results keep the input order
  let next = 0;                                   // shared index

  async function runWorker(id) {
    while (true) {
      const i = next++;                           // take the next job (safe: JS is single-threaded)
      if (i >= items.length) return;
      results[i] = await worker(items[i], i, id);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, (_, id) => runWorker(id)));
  return results;
}

// demo: track how many jobs are running at the same time
let running = 0, maxRunning = 0;
const job = async (n) => {
  running++; maxRunning = Math.max(maxRunning, running);
  await new Promise((r) => setTimeout(r, 20 + (n % 3) * 10));
  running--;
  return n * 2;
};

mapLimit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, job).then((results) => {
  console.log(results);
  console.log("max running at once:", maxRunning);
});
```

Why does `next++` need no lock? Because JavaScript runs **one callback at a time**. Between `const i = next++` and the check, no other worker can run. (This is the benefit of the single thread.)

## Pattern 2: a `pLimit` function (like the popular `p-limit`)

Wrap functions so that no more than N are active, and the rest wait in a **queue**.

```js run title="pLimit(concurrency)"
function pLimit(concurrency) {
  const queue = [];
  let active = 0;

  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => { active--; next(); });       // when one ends, start the next
  };

  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

const limit = pLimit(2);
const log = [];
const task = (name, ms) => limit(async () => {
  log.push("start " + name);
  await new Promise((r) => setTimeout(r, ms));
  log.push("end " + name);
  return name;
});

Promise.all([task("A", 100), task("B", 30), task("C", 30), task("D", 20)]).then((r) => {
  console.log(r);
  console.log(log.join(", "));
});
```

You get the **same results order** as the input (because `Promise.all` keeps it), and at most 2 tasks active.

## Pattern 3: a semaphore (permits)

A **semaphore** is a counter of available "permits". `acquire()` waits for one, `release()` returns it.

```js run title="A simple semaphore"
class Semaphore {
  #permits;
  #waiters = [];
  constructor(permits) { this.#permits = permits; }

  async acquire() {
    if (this.#permits > 0) { this.#permits--; return; }
    await new Promise((resolve) => this.#waiters.push(resolve));      // wait for a release
  }
  release() {
    const waiter = this.#waiters.shift();
    if (waiter) waiter();                       // hand the permit directly to the next waiter
    else this.#permits++;
  }
  async run(fn) {
    await this.acquire();
    try { return await fn(); } finally { this.release(); }
  }
}

const sem = new Semaphore(2);
let active = 0, peak = 0;
const work = (n) => sem.run(async () => {
  active++; peak = Math.max(peak, active);
  await new Promise((r) => setTimeout(r, 15));
  active--;
  return n;
});

Promise.all([1, 2, 3, 4, 5].map(work)).then((r) => console.log(r, "peak:", peak));
```

A **mutex** is a semaphore with 1 permit. It is useful in async code too: for example to make sure only one token refresh happens at a time.

```js run title="Refresh the token only once (mutex + shared promise)"
let refreshing = null;
let refreshCount = 0;

function refreshToken() {
  if (!refreshing) {
    refreshing = new Promise((r) => setTimeout(() => { refreshCount++; r("new-token"); }, 20))
      .finally(() => { refreshing = null; });
  }
  return refreshing;                           // all callers share ONE in-flight promise
}

Promise.all([refreshToken(), refreshToken(), refreshToken()]).then((tokens) => {
  console.log(tokens, "network refreshes:", refreshCount);
});
```

This **deduplicating in-flight requests** trick is very common in real apps.

## Pattern 4: a task queue with `await` for completion

```js run title="A queue that processes jobs with a concurrency limit"
class TaskQueue {
  #concurrency; #running = 0; #queue = []; #idle = [];
  constructor(concurrency) { this.#concurrency = concurrency; }

  add(task) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ task, resolve, reject });
      this.#pump();
    });
  }
  #pump() {
    while (this.#running < this.#concurrency && this.#queue.length) {
      const { task, resolve, reject } = this.#queue.shift();
      this.#running++;
      task().then(resolve, reject).finally(() => {
        this.#running--;
        this.#pump();
        if (this.#running === 0 && this.#queue.length === 0) this.#idle.splice(0).forEach((f) => f());
      });
    }
  }
  onIdle() { return this.#running === 0 && this.#queue.length === 0 ? Promise.resolve() : new Promise((r) => this.#idle.push(r)); }
}

const q = new TaskQueue(2);
const done = [];
for (const n of [1, 2, 3, 4, 5]) q.add(async () => { await new Promise((r) => setTimeout(r, 10 * n)); done.push(n); });
q.onIdle().then(() => console.log("all done, order of completion:", done));
```

## Choosing the limit

| Work | Typical limit |
|---|---|
| HTTP calls to one API | 5 to 10 (respect its rate limit docs) |
| Database queries | up to the connection-pool size |
| File reads | tens (the OS and libuv thread pool of 4 are the real limit) |
| CPU-bound work in workers | number of CPU cores |
| Browser `fetch` to one host | the browser caps at about 6 (HTTP/1.1) |

:::interview How would you fetch 1000 URLs with at most 5 requests at a time?
"I would use a worker pool: start 5 async worker loops that share an index; each loop takes the next URL, awaits the fetch, stores the result at that index, and continues until none are left. `Promise.all` over the 5 workers resolves when everything is done, and results stay in input order. It works without locks because JavaScript runs one callback at a time. Alternatively I'd use `p-limit`, which queues functions and starts the next as one finishes. I'd also add error handling per job, retries with back-off, and an AbortController."
:::

## More interview questions on this topic

:::qa Why is `Promise.all(urls.map(fetch))` risky for a large list? {level=easy}
**Say this:** "It starts all requests at once, which can overload the server and your own process, trigger rate limits, and use a lot of memory. A concurrency limit avoids that."

**In simple words:** Everyone rushes through the door together. Let a few in at a time.
:::

:::qa Why does the worker-pool pattern work without locks in JavaScript? {level=hard}
**Say this:** "Callbacks never run in parallel: only one runs at a time. Between reading and incrementing the shared index there is no `await`, so no other worker can interleave. (With `await` in between, you would need to be careful.)"

**In simple words:** The single thread makes small shared-variable updates safe.
:::

:::qa What is a semaphore and when do you use it in JavaScript? {level=medium}
**Say this:** "A counter of permits that limits how many tasks may enter a section at once. I use it for concurrency limits, and with one permit as a mutex to serialise something like a token refresh."

**In simple words:** A club with only N tickets.
:::

:::qa What does it mean to dedupe in-flight requests? {level=medium}
**Say this:** "Store the pending promise in a variable or Map, and return it to every caller until it settles, so only one network call is made for identical simultaneous requests."

**In simple words:** If someone is already fetching it, share their promise.
:::

```quiz
? What is a good way to keep exactly N async jobs running?
- Promise.all on everything
+ A worker pool or a queue that starts the next job when one finishes
- setInterval
> A sliding window.
? Why is `const i = next++` safe in a worker pool?
- Because of a mutex
+ Because JavaScript callbacks do not run in parallel
- Because next is const
> No interleaving between those synchronous lines.
? What does deduplicating in-flight requests mean?
- Cancelling requests
+ Sharing one pending promise between callers asking for the same thing
- Caching results forever
> Many callers, one network call.
```

:::keypoints
- Limit concurrency: **worker pool** (N loops with a shared index), **`pLimit`** (queue + counter), **semaphore**, **task queue**.
- Results stay in **input order** if you store by index or use `Promise.all`.
- Single-threaded callbacks make small shared-state updates safe (no `await` in between).
- **Dedupe in-flight** work by sharing the pending promise.
- Pick the limit by the resource: API rate limit, DB pool size, CPU cores.
:::
