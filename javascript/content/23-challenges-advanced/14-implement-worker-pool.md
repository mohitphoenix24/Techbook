---
title: Implement a worker thread pool
level: hard
time: 45
summary: Run CPU-heavy jobs on a fixed number of worker_threads, queue extra jobs, keep the main thread responsive, survive crashes by replacing the worker, support timeouts and shut down cleanly.
---

:::problem Implement a worker pool {level=hard tags="node,worker_threads,concurrency,cpu-bound"}
Node runs your JavaScript on **one thread**. A CPU-heavy job (image resize, hashing, parsing a huge file) blocks the event loop, so every other request waits. `worker_threads` run JavaScript on **other threads**. Starting a worker is slow (tens of ms), so we keep a **pool** and reuse the workers.

Write `WorkerPool(size, source)`:

1. Starts `size` workers from a code string (`new Worker(source, { eval: true })`).
2. `run(task, payload, { timeout })` returns a promise with the worker's result. At most `size` jobs run at once; extra jobs **wait in a queue**.
3. An **error thrown by a task** rejects only that job; the worker stays usable.
4. A **crashing worker** (uncaught error, `process.exit`) rejects its job and is **replaced**, so the pool keeps its size.
5. A job that exceeds `timeout` rejects with a `TimeoutError`, its worker is terminated and replaced.
6. `close()` rejects queued jobs, terminates the workers, and later `run` calls reject.
7. Show that the **main thread stays responsive** while a worker is busy.

:::hint Hint
Keep `idle` workers and a `queue` of jobs. `pump()` pairs them. Each worker slot remembers its current job; the `message`, `error` and `exit` events settle it. Because `error` is followed by `exit`, mark the slot as dead so you replace it only once.
:::
:::

## Solution and tests

```js run cjs node title="WorkerPool, with tests"
const assert = require("node:assert/strict");
const { Worker } = require("node:worker_threads");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class TimeoutError extends Error { constructor(ms) { super(`Job timed out after ${ms} ms`); this.name = "TimeoutError"; } }

class WorkerPool {
  #size; #source; #slots = new Set(); #idle = []; #queue = []; #closed = false; #nextId = 1;
  peakBusy = 0; spawned = 0;

  constructor(size, source) {
    this.#size = size; this.#source = source;
    for (let i = 0; i < size; i++) this.#spawn();
  }

  #spawn() {
    const slot = { worker: new Worker(this.#source, { eval: true }), job: null, dead: false };
    this.spawned++;
    slot.worker.on("message", (msg) => {
      const job = slot.job; slot.job = null;
      if (!job) return;
      clearTimeout(job.timer);
      msg.error ? job.reject(new Error(msg.error)) : job.resolve(msg.result);       // a task error: reject the job, keep the worker
      this.#idle.push(slot);
      this.#pump();
    });
    const die = (error) => {                                                          // 'error' and 'exit' both end up here: handle once
      if (slot.dead) return;
      slot.dead = true;
      this.#slots.delete(slot);
      this.#idle = this.#idle.filter((s) => s !== slot);
      if (slot.job) { clearTimeout(slot.job.timer); slot.job.reject(error); slot.job = null; }
      if (!this.#closed) { this.#spawn(); this.#pump(); }                             // keep the pool at full size
    };
    slot.worker.on("error", (err) => die(err));
    slot.worker.on("exit", (code) => die(new Error(`Worker exited with code ${code}`)));
    this.#slots.add(slot);
    this.#idle.push(slot);
  }

  run(task, payload, { timeout } = {}) {
    if (this.#closed) return Promise.reject(new Error("Pool is closed"));
    return new Promise((resolve, reject) => {
      this.#queue.push({ id: this.#nextId++, task, payload, timeout, resolve, reject, timer: null });
      this.#pump();
    });
  }

  #pump() {
    while (this.#idle.length && this.#queue.length) {
      const slot = this.#idle.shift();
      const job = this.#queue.shift();
      slot.job = job;
      if (job.timeout) {
        job.timer = setTimeout(() => { job.reject(new TimeoutError(job.timeout)); slot.job = null; slot.worker.terminate(); }, job.timeout);   // 'exit' then replaces the worker
      }
      slot.worker.postMessage({ id: job.id, task: job.task, payload: job.payload });
      this.peakBusy = Math.max(this.peakBusy, this.#size - this.#idle.length);
    }
  }

  get pending() { return this.#queue.length; }
  get size() { return this.#slots.size; }

  async close() {
    this.#closed = true;
    for (const job of this.#queue.splice(0)) job.reject(new Error("Pool is closed"));
    await Promise.all([...this.#slots].map((slot) => slot.worker.terminate()));
  }
}

// The code that runs INSIDE each worker (its own thread, its own memory)
const workerSource = `
const { parentPort, threadId } = require("node:worker_threads");
parentPort.on("message", ({ id, task, payload }) => {
  try {
    if (task === "square") return parentPort.postMessage({ id, result: payload * payload });
    if (task === "fib") { const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2)); return parentPort.postMessage({ id, result: fib(payload) }); }
    if (task === "spin") { const end = Date.now() + payload; while (Date.now() < end); return parentPort.postMessage({ id, result: "spun " + payload }); }
    if (task === "thread") return parentPort.postMessage({ id, result: threadId });
    if (task === "fail") throw new Error("task failed: " + payload);
    if (task === "crash") return setImmediate(() => { throw new Error("worker crashed"); });
    if (task === "hang") return;
    throw new Error("unknown task " + task);
  } catch (e) { parentPort.postMessage({ id, error: e.message }); }
});`;

// ---------------- tests ----------------
(async () => {
  await test("runs jobs and returns results", async () => {
    const pool = new WorkerPool(2, workerSource);
    try {
      const results = await Promise.all([3, 4, 5, 6].map((n) => pool.run("square", n)));
      assert.deepEqual(results, [9, 16, 25, 36]);
    } finally { await pool.close(); }
  });

  await test("at most `size` jobs run at once; the rest wait in the queue", async () => {
    const pool = new WorkerPool(2, workerSource);
    try {
      const jobs = Array.from({ length: 6 }, () => pool.run("spin", 40));
      await sleep(5);
      assert.equal(pool.pending, 4);                          // 2 running, 4 queued
      await Promise.all(jobs);
      assert.equal(pool.peakBusy, 2);
    } finally { await pool.close(); }
  });

  await test("jobs really run on different threads", async () => {
    const pool = new WorkerPool(3, workerSource);
    try {
      const ids = new Set(await Promise.all([1, 2, 3].map(() => pool.run("spin", 60).then(() => pool.run("thread")))));
      assert.ok(ids.size >= 2, "thread ids: " + [...ids]);
      assert.ok(![...ids].includes(0), "none of them is the main thread (id 0)");
    } finally { await pool.close(); }
  });

  await test("the main thread stays responsive while a worker is busy", async () => {
    const pool = new WorkerPool(1, workerSource);
    try {
      let ticks = 0;
      const timer = setInterval(() => ticks++, 10);
      await pool.run("spin", 200);                            // 200 ms of pure CPU work, in the worker
      clearInterval(timer);
      assert.ok(ticks >= 8, "the event loop ticked " + ticks + " times");
    } finally { await pool.close(); }
  });

  await test("on the main thread the same work would block the timers", async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    await sleep(0);
    const end = Date.now() + 100; while (Date.now() < end);   // 100 ms blocked
    clearInterval(timer);
    assert.equal(ticks, 0);                                   // not a single timer could run
  });

  await test("a task error rejects only that job; the worker lives on", async () => {
    const pool = new WorkerPool(1, workerSource);
    try {
      await assert.rejects(pool.run("fail", "bad input"), /task failed: bad input/);
      assert.equal(await pool.run("square", 7), 49);
      assert.equal(pool.spawned, 1);                          // no replacement was needed
    } finally { await pool.close(); }
  });

  await test("a crashing worker rejects its job and is replaced", async () => {
    const pool = new WorkerPool(1, workerSource);
    try {
      await assert.rejects(pool.run("crash"), /worker crashed/);
      assert.equal(await pool.run("square", 5), 25);          // the replacement works
      assert.equal(pool.spawned, 2);
      assert.equal(pool.size, 1);
    } finally { await pool.close(); }
  });

  await test("a timeout rejects the job, kills that worker and replaces it", async () => {
    const pool = new WorkerPool(1, workerSource);
    try {
      await assert.rejects(pool.run("hang", null, { timeout: 50 }), (e) => e.name === "TimeoutError");
      assert.equal(await pool.run("square", 6), 36);
      assert.equal(pool.spawned, 2);
    } finally { await pool.close(); }
  });

  await test("a CPU-heavy computation gives the right answer", async () => {
    const pool = new WorkerPool(2, workerSource);
    try {
      const [a, b] = await Promise.all([pool.run("fib", 25), pool.run("fib", 20)]);
      assert.deepEqual([a, b], [75025, 6765]);
    } finally { await pool.close(); }
  });

  await test("close() rejects queued jobs and later calls", async () => {
    const pool = new WorkerPool(1, workerSource);
    const running = pool.run("spin", 50);
    const queued = pool.run("square", 2);
    const closing = pool.close();
    await assert.rejects(queued, /Pool is closed/);
    await closing;
    await assert.rejects(pool.run("square", 3), /Pool is closed/);
    running.catch(() => {});                                  // the running job is cut off by terminate()
  });
})();
```

## Design notes (what to say)

| Question | Answer |
|---|---|
| **When** do I need workers? | CPU-bound work: hashing, compression, image/PDF processing, big parsing, ML inference. Not for waiting on I/O: the event loop already does that well |
| **Why a pool?** | A worker costs ~10–50 ms and several MB to start. Reuse them; limit the count to roughly the number of CPU cores (`os.availableParallelism()`) |
| **How do threads talk?** | Messages are **copied** (structured clone). Use `transferList` for `ArrayBuffer`s (zero copy) or `SharedArrayBuffer` + `Atomics` for shared memory |
| **Threads vs processes?** | Threads share the process and can share memory; `child_process`/`cluster` give strong isolation (a crash cannot affect others) |
| **Libraries** | **Piscina** (a production worker pool), `workerpool`, `threads.js`; in browsers use Web Workers (+ Comlink) |
| **Pitfalls** | passing huge objects (copy cost), unhandled worker errors, forgetting `terminate()` (the process never exits), too many workers (context switching) |

:::qa Why not just use `Promise.all` with async functions for CPU-heavy work? {level=easy}
**Say this:** "Promises give concurrency for waiting (I/O), not for computing. A CPU-heavy function still runs on the one JavaScript thread and blocks everything until it returns. Only worker threads (or another process) give real parallel execution."

**In simple words:** `async` lets you wait together; it does not let you work together.
:::

:::qa How do you avoid copying large data to a worker? {level=hard}
**Say this:** "Transfer the underlying `ArrayBuffer` in the `transferList` of `postMessage`: ownership moves to the worker with no copy (the sender's buffer becomes empty). Or use a `SharedArrayBuffer` that both threads see, and synchronise with `Atomics`. Plain objects are always copied with structured clone."

**In simple words:** Hand over the box instead of photocopying everything inside.
:::

:::qa How would you size the pool and handle backpressure? {level=hard}
**Say this:** "Start with `availableParallelism() - 1` workers for CPU-bound work, and measure. Keep a bounded queue and reject with a clear error (or apply backpressure to the caller, such as HTTP 503) when it is full, otherwise memory grows without limit under load."

**In simple words:** Do not accept more work than you can ever finish.
:::

:::keypoints
- **Worker threads = real parallelism** for CPU-bound work; the event loop stays free for I/O.
- A **pool** reuses workers (startup is expensive), caps concurrency, and **queues** the rest.
- Settle jobs from `message`, `error` and `exit`; **replace dead workers once**; a **task error** is not a **worker crash**.
- **Timeouts** need `terminate()`; always **`close()`** the pool; **transfer** buffers instead of copying.
:::
