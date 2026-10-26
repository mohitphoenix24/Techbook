---
title: Web Workers and Node worker threads
level: advanced
time: 35
summary: How to run CPU-heavy JavaScript on another thread: the browser Web Worker API, Node's worker_threads, message passing and structured clone, transferables, SharedArrayBuffer with Atomics, a worker pool, and when not to use workers.
---

## Why workers?

You learned that JavaScript runs your code on **one thread**. A heavy calculation freezes the UI or blocks every request on a server. **Workers** run JavaScript on **another thread**, with its **own event loop, heap and global scope**. The main thread stays responsive.

```viz algo=chain title="Main thread and worker: separate worlds that talk by messages"
node main "Main thread" @0,0 [hl]
  note: UI / server event loop
node w "Worker thread" @2,0 [fn]
  note: heavy computation
node msg1 "postMessage(data)" @1,0 [dim]
node msg2 "onmessage(result)" @1,1 [dim]
link main -> msg1 : send
link msg1 -> w : copy
link w -> msg2 : reply
link msg2 -> main : copy
```

Key properties:

- **No shared variables.** Threads share nothing by default, so there are **no data races** in normal code. They talk by **messages**.
- Messages are **copied** with the **structured clone** algorithm (like `structuredClone`): objects, arrays, Maps, Sets, Dates, typed arrays... but **not functions** or DOM nodes.
- **Large binary data** can be **transferred** (moved, zero-copy) with `ArrayBuffer`s, or **shared** with `SharedArrayBuffer`.
- Workers cost **memory and start-up time** (tens of ms, several MB each). Use a **pool**, not one per task.

## Browser: Web Workers

A worker is created from a **separate script file** (or a Blob URL). The main thread and worker talk through `postMessage` and `onmessage`.

```js
// main.js (the page)
const worker = new Worker("worker.js");                  // or new Worker(new URL("./worker.js", import.meta.url), { type: "module" })

worker.postMessage({ numbers: [1, 2, 3, 4] });           // send (copies the data)

worker.onmessage = (event) => console.log("result:", event.data);
worker.onerror = (error) => console.error("worker failed:", error.message);

// later: worker.terminate();                            // stop it from outside
```

```js
// worker.js (runs on another thread)
self.onmessage = (event) => {
  const { numbers } = event.data;
  const sum = numbers.reduce((a, b) => a + b, 0);        // imagine something heavy here
  self.postMessage(sum);                                 // reply
};
```

**What a worker cannot do:** touch the **DOM**, `window`, `document`, `localStorage`. It can use `fetch`, `setTimeout`, `IndexedDB`, `crypto`, `WebSocket`, `importScripts()` / ES module imports, `OffscreenCanvas`, WebAssembly.

Kinds: **Dedicated Worker** (one page), **Shared Worker** (many tabs), **Service Worker** (network proxy and offline: a different purpose).

A trick to try workers without a file: create one from a Blob (this works in our runner as a plain worker too):

```js run title="A worker created from a string (works in browsers)" nondet
if (typeof Worker === "undefined") {
  console.log("Web Workers are not available in this runtime (they exist in browsers)");
} else {
  const code = `onmessage = (e) => { let s = 0; for (let i = 0; i < e.data; i++) s += i; postMessage(s); };`;
  const worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
  worker.onmessage = (e) => { console.log("sum from worker:", e.data); worker.terminate(); };
  worker.postMessage(1000000);
}
```

## Node.js: `worker_threads`

```js run cjs node title="worker_threads: a worker in the same file"
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");

if (isMainThread) {
  // MAIN THREAD
  const worker = new Worker(__filename, { workerData: { limit: 5000000 } });   // run THIS file in a worker
  worker.on("message", (sum) => console.log("main got:", sum));
  worker.on("error", (e) => console.log("worker error:", e.message));
  worker.on("exit", (code) => console.log("worker exited with code", code));
  console.log("main thread is free while the worker works");
} else {
  // WORKER THREAD
  let sum = 0;
  for (let i = 0; i < workerData.limit; i++) sum += i;
  parentPort.postMessage(sum);
}
```

(In this lesson's example the file is run twice by Node: once as the main thread and once as the worker. Real projects use a separate file.)

Differences from browser workers: `require`/`import` work; **`process.env`** is copied; you can use **`worker.postMessage`** and **`MessageChannel`**; there is a `resourceLimits` option, and `worker.terminate()` returns a promise.

### A promise wrapper

```js run node title="Run a function in a worker and await the result"
const { Worker } = require("node:worker_threads");

function runInWorker(fnSource, data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `const { parentPort, workerData } = require("node:worker_threads");
       parentPort.postMessage((${fnSource})(workerData));`,
      { eval: true, workerData: data },
    );
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => { if (code !== 0) reject(new Error("worker stopped with code " + code)); });
  });
}

(async () => {
  const fib = "(n) => { const f = (k) => (k < 2 ? k : f(k - 1) + f(k - 2)); return f(n); }";
  const [a, b] = await Promise.all([runInWorker(fib, 30), runInWorker(fib, 32)]);      // two threads, in parallel
  console.log("fib(30) =", a, "| fib(32) =", b);
  try { await runInWorker("() => { throw new Error('boom inside the worker'); }", null); }
  catch (e) { console.log("caught:", e.message); }
})();
```

## Transferring data without copying

Copying a 100 MB buffer is slow. **Transfer** moves ownership instead: the buffer becomes unusable (`byteLength` 0) in the sender.

```js run title="Transfer an ArrayBuffer (zero-copy)"
const buffer = new ArrayBuffer(8 * 1024 * 1024);          // 8 MB
console.log("before:", buffer.byteLength);

const channel = new MessageChannel();                       // the same API as between a page and a worker
channel.port1.onmessage = (e) => { console.log("received:", e.data.byteLength); channel.port1.close(); };

channel.port2.postMessage(buffer, [buffer]);                // second argument: the transfer list
console.log("after transfer, sender has:", buffer.byteLength);   // 0: moved, not copied
```

## SharedArrayBuffer and Atomics: real shared memory

A `SharedArrayBuffer` is **one block of memory seen by several threads**. To avoid data races you must use **`Atomics`** for reads, writes and waiting.

```js run cjs node title="A shared counter updated by two workers"
const { Worker, isMainThread, workerData } = require("node:worker_threads");

if (isMainThread) {
  const shared = new SharedArrayBuffer(4);
  const counter = new Int32Array(shared);
  let done = 0;
  for (let i = 0; i < 2; i++) {
    const w = new Worker(__filename, { workerData: shared });
    w.on("exit", () => {
      if (++done === 2) console.log("final count (atomic, always 20000):", Atomics.load(counter, 0));
    });
  }
} else {
  const counter = new Int32Array(workerData);
  for (let i = 0; i < 10000; i++) Atomics.add(counter, 0, 1);       // atomic increment: no lost updates
  // a plain counter[0]++ here would LOSE updates (a data race)
}
```

In browsers, `SharedArrayBuffer` needs the page to be **cross-origin isolated** (`COOP: same-origin` and `COEP: require-corp` headers), because of Spectre.

## A worker pool

Do not create a new worker per task: start a **fixed number** (about the number of CPU cores) and queue the jobs.

```js run node title="A small worker pool"
const { Worker } = require("node:worker_threads");
const os = require("node:os");

class WorkerPool {
  #workers = []; #idle = []; #queue = [];
  constructor(size, code) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(code, { eval: true });
      this.#workers.push(worker);
      this.#idle.push(worker);
    }
  }
  run(data) {
    return new Promise((resolve, reject) => {
      this.#queue.push({ data, resolve, reject });
      this.#next();
    });
  }
  #next() {
    if (!this.#idle.length || !this.#queue.length) return;
    const worker = this.#idle.pop();
    const { data, resolve, reject } = this.#queue.shift();
    const done = (fn) => (v) => { worker.removeAllListeners("message"); worker.removeAllListeners("error"); this.#idle.push(worker); fn(v); this.#next(); };
    worker.once("message", done(resolve));
    worker.once("error", done(reject));
    worker.postMessage(data);
  }
  async close() { await Promise.all(this.#workers.map((w) => w.terminate())); }
}

const code = `
  const { parentPort } = require("node:worker_threads");
  parentPort.on("message", (n) => {
    let count = 0;
    for (let i = 2; i <= n; i++) { let prime = true; for (let j = 2; j * j <= i; j++) if (i % j === 0) { prime = false; break; } if (prime) count++; }
    parentPort.postMessage({ n, primes: count });
  });
`;

(async () => {
  const pool = new WorkerPool(Math.min(4, os.cpus().length), code);
  const results = await Promise.all([20000, 30000, 40000, 50000, 60000, 70000].map((n) => pool.run(n)));
  console.log(results.map((r) => `${r.n}:${r.primes}`).join("  "));
  await pool.close();
})();
```

In production use a library such as **`piscina`** (Node) or **Comlink** (browser, makes a worker look like an async object).

## When to use workers (and when not)

| Use workers for | Do NOT use workers for |
|---|---|
| **CPU-bound** work: image processing, parsing big files, encryption, compression, ML, big sorts, physics | **I/O-bound** work (network, disk): the event loop already handles it |
| Keeping the UI at 60 fps | Tiny tasks: the cost of messaging exceeds the benefit |
| Using several CPU cores | Anything needing the DOM |
| Isolating risky code | Sharing lots of mutable state (complexity) |

Other options for CPU work in Node: **child processes** (`child_process`), the **`cluster`** module (a process per core for HTTP servers), a **job queue** with separate worker processes (BullMQ), or **native addons / WebAssembly**.

:::interview How do you run CPU-heavy work without blocking the main thread? Explain Web Workers and worker_threads.
"I move it to a separate thread. In the browser I use a Web Worker: a separate script with its own event loop and heap, no DOM access, communicating through `postMessage` with structured-clone copying; large buffers can be transferred without copying, or shared with SharedArrayBuffer and Atomics when the page is cross-origin isolated. In Node I use `worker_threads` the same way, or a pool with a library like piscina. Because threads share no memory by default there are no data races, but messages cost serialisation, workers cost memory and start-up time, so I use a pool sized to the CPU cores and only for CPU-bound work, not I/O, which the event loop already handles."
:::

## More interview questions on this topic

:::qa Do workers share memory with the main thread? {level=medium}
**Say this:** "Not by default: they have separate heaps and communicate by copying messages. Shared memory is possible with `SharedArrayBuffer` and `Atomics`."

**In simple words:** Separate rooms, speaking through a window, unless you build a shared table.
:::

:::qa What is a transferable object? {level=hard}
**Say this:** "An object like `ArrayBuffer`, `MessagePort` or `OffscreenCanvas` that can be moved to another thread with zero copy by listing it in the transfer list; after that it is unusable in the sender."

**In simple words:** Hand over the box instead of photocopying everything inside.
:::

:::qa What is the difference between worker_threads, child_process and cluster in Node? {level=medium}
**Say this:** "`worker_threads` are threads in the same process (lighter, can share memory). `child_process` spawns separate OS processes with separate memory (stronger isolation, any program). `cluster` is a helper that forks several Node processes to share one server port across CPU cores."

**In simple words:** Threads, processes, and a prepared set of processes for web servers.
:::

:::qa Why does `Atomics.add` matter for SharedArrayBuffer? {level=hard}
**Say this:** "A plain `x++` is read, add, write: two threads can interleave and lose updates. Atomics operations are indivisible, so they are safe across threads."

**In simple words:** The increment happens as one unbreakable step.
:::

```quiz
? What can a Web Worker NOT access?
- fetch
+ The DOM
- setTimeout
> Workers have no document or window.
? How do threads normally communicate?
- Shared variables
+ postMessage (copied via structured clone)
- Global state
> Isolated heaps.
? When should you avoid workers?
- CPU-heavy image processing
+ Simple network requests
- Large computations
> I/O is already non-blocking.
```

:::keypoints
- **Workers** = another thread with its **own event loop and heap**. Browser: `Worker`, `postMessage`. Node: `worker_threads`.
- Messages are **copied** (structured clone); big buffers can be **transferred**; **SharedArrayBuffer + Atomics** for shared memory (cross-origin isolation in browsers).
- No DOM in workers. Use a **pool** (≈ CPU cores): libraries `piscina`, `Comlink`.
- For **CPU-bound** work only. I/O is handled by the event loop. Alternatives: child processes, cluster, queues, WebAssembly.
:::
