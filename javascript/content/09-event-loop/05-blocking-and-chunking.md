---
title: Blocking the event loop: chunking and yielding
level: intermediate
time: 25
summary: How a long task freezes a page or a server, how to measure it, how to split work into chunks and yield to the event loop (setTimeout, MessageChannel, scheduler.yield, setImmediate), and when to move work to a worker.
---

## Why blocking is a problem

Everything shares **one thread**: your code, event handlers, timers, and (in a browser) painting. If one task runs for **200 ms**:

- In a **browser**: the page cannot respond to clicks or scroll, animations stutter. Anything over **50 ms** is called a **long task**.
- In **Node.js**: no other request is served during that time. One slow request can make the whole server look dead.

```js run title="A long task delays everything else" nondet
const events = [];
const start = performance.now();

setTimeout(() => events.push("timer due at 10 ms ran at " + Math.round(performance.now() - start) + " ms"), 10);

// pretend this is a heavy calculation
let sum = 0;
for (let i = 0; i < 6e7; i++) sum += i % 3;

events.push("heavy loop took about " + Math.round(performance.now() - start) + " ms");
setTimeout(() => {
  console.log(events.join("\n"));
  console.log("the 10 ms timer ran late: yes");
}, 0);
```

## Measure first

```js run title="Measure with performance.now" nondet
function measure(label, fn) {
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  console.log(`${label}: ${ms > 50 ? "LONG TASK (over 50 ms)" : "fine"}`);
  return result;
}

measure("small job", () => { let s = 0; for (let i = 0; i < 1e5; i++) s += i; return s; });
measure("big job", () => { let s = 0; for (let i = 0; i < 4e8; i++) s += i; return s; });
```

In the browser use the **Performance** tab and the **Long Tasks API** (`PerformanceObserver` with `longtask`). In Node use `--cpu-prof`, `clinic.js`, or `perf_hooks.monitorEventLoopDelay()`.

## Fix 1: chunk the work and yield between chunks

Split a big job into small slices. After each slice, **give control back** to the event loop so other tasks can run, then continue.

```js run title="Process a huge array in chunks"
const bigArray = Array.from({ length: 200000 }, (_, i) => i);

function processInChunks(items, handle, chunkSize = 20000) {
  return new Promise((resolve) => {
    let index = 0;
    function nextChunk() {
      const end = Math.min(index + chunkSize, items.length);
      for (; index < end; index++) handle(items[index]);
      if (index < items.length) setTimeout(nextChunk, 0);     // yield: other tasks can run now
      else resolve();
    }
    nextChunk();
  });
}

let total = 0, heartbeats = 0;
const hb = setInterval(() => heartbeats++, 1);                // a task that wants to run regularly

processInChunks(bigArray, (n) => { total += n % 10; }).then(() => {
  clearInterval(hb);
  console.log("total:", total);
  console.log("other tasks got a turn while we worked:", heartbeats > 0);
});
```

## Fix 2: yield with a promise helper

```js run title="An async loop that yields"
const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

async function sumSlowly(n) {
  let total = 0;
  for (let i = 1; i <= n; i++) {
    total += i;
    if (i % 25000 === 0) await yieldToEventLoop();       // let other tasks run every 25,000 steps
  }
  return total;
}

setTimeout(() => console.log("a timer got to run while summing"), 0);
sumSlowly(100000).then((t) => console.log("sum:", t));
```

**Important:** `await Promise.resolve()` does **not** yield to the event loop: it only yields to **microtasks**. To let timers, rendering and I/O run, you need a **macrotask**: `setTimeout`, `MessageChannel`, `setImmediate` (Node), or `scheduler.yield()`.

```js run title="Microtask yield vs macrotask yield"
const order = [];
setTimeout(() => order.push("timer"), 0);

(async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve();    // only microtasks: the timer is still waiting
  order.push("after 3 microtask yields");
  await new Promise((r) => setTimeout(r, 0));             // macrotask yield: the timer gets in first
  order.push("after macrotask yield");
  console.log(order);
})();
```

## Better yielding APIs (modern browsers)

| API | What it does |
|---|---|
| `setTimeout(fn, 0)` | Works everywhere; has a 4 ms clamp when nested |
| `MessageChannel` | A macrotask without the 4 ms clamp (used by React's scheduler) |
| `scheduler.yield()` | Yield and **continue with higher priority** than other tasks (Chrome 129+) |
| `scheduler.postTask(fn, { priority })` | Run work at a given priority (user-blocking / user-visible / background) |
| `requestIdleCallback(fn)` | Run low-priority work when idle |
| `isInputPending()` | Check if the user is waiting before continuing |
| `setImmediate(fn)` (Node) | Yield to I/O, then run in the check phase |

## Fix 3: move heavy work to another thread

Chunking keeps the thread responsive but is not faster. For real CPU-heavy work (image processing, parsing, crypto, big sorts), use **another thread**:

- **Browser:** `Web Worker` (`new Worker("worker.js")`) with `postMessage`.
- **Node:** `worker_threads` (see the Node module), or a child process, or a separate service/queue.

You will build both in the [workers lesson](#/l/web-workers-and-worker-threads).

## Node: blocking the server

```js run title="A synchronous call in a server blocks every request" node
const http = require("node:http");

const server = http.createServer((req, res) => {
  if (req.url === "/slow") {
    const end = Date.now() + 300;
    while (Date.now() < end) {}                           // blocks every other request for 300 ms
    return res.end("slow done");
  }
  res.end("fast");
});

server.listen(0, async () => {
  const port = server.address().port;
  const get = (path) => new Promise((resolve) => http.get({ port, path }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => resolve(d)); }));

  const t0 = Date.now();
  const slow = get("/slow");                               // a request that blocks the server
  const fastStart = Date.now();
  const fast = await get("/fast");                         // this fast request has to wait!
  console.log("fast request answered:", fast, "| it waited for the slow one:", Date.now() - fastStart >= 250);
  await slow;
  server.close();
});
```

The fast request waited for the slow request, because they share one thread. Fixes: use async APIs (`fs.promises`, not `readFileSync`), offload CPU work to worker threads, and keep every handler short.

:::warn Dangerous things on the main thread
- `JSON.parse` / `JSON.stringify` of huge data
- Regular expressions with **catastrophic backtracking** (ReDoS)
- `fs.readFileSync`, `crypto.pbkdf2Sync`, `zlib.gzipSync` on a server
- Sorting or filtering millions of items
- Big `for` loops in a click handler
:::

:::interview How do you handle a CPU-heavy task in JavaScript without freezing the UI or server?
"First I measure to see if it is really CPU-bound. If it can be split, I process it in chunks and yield between chunks with `setTimeout`, `MessageChannel` or `scheduler.yield()`, remembering that awaiting a resolved promise only yields to microtasks, not to rendering or timers. For genuinely heavy work I move it to a Web Worker in the browser or a worker thread in Node, or to a queue and a separate service. On a server I also avoid sync APIs like `readFileSync` in request handlers."
:::

## More interview questions on this topic

:::qa What is a long task? {level=easy}
**Say this:** "Any task that keeps the main thread busy for more than 50 ms. It delays input handling and painting, so the page feels unresponsive."

**In simple words:** The thread was too busy to answer a click quickly.
:::

:::qa Does `await` give the browser a chance to repaint? {level=hard}
**Say this:** "Not by itself. `await` on a resolved promise continues in a microtask, before rendering and before timers. To let the browser render you must yield with a macrotask, for example `setTimeout`, `scheduler.yield()` or `requestAnimationFrame`."

**In simple words:** Microtasks are "same turn". A macrotask is "next turn".
:::

:::qa Why does one slow request make a Node server slow for everyone? {level=medium}
**Say this:** "Because Node runs your JavaScript on one thread. A synchronous or CPU-heavy handler blocks the event loop, so no other callbacks (new requests, responses) can run until it finishes."

**In simple words:** One cashier. If one customer takes ten minutes, the whole queue waits.
:::

:::qa How would you detect event loop blocking in Node? {level=hard}
**Say this:** "`perf_hooks.monitorEventLoopDelay()` gives a histogram of loop lag, or I can compare an interval's expected vs actual time. For the cause, I profile with `--cpu-prof` or `clinic doctor`."

**In simple words:** Measure how late a small timer fires. Late means blocked.
:::

```quiz
? Which yields to timers and rendering?
- await Promise.resolve()
+ await new Promise(r => setTimeout(r, 0))
- queueMicrotask(fn)
> A macrotask is needed; microtasks run before the event loop continues.
? What is a good fix for a CPU-heavy calculation that must not freeze the page?
- Wrapping it in async/await
+ Running it in a Web Worker
- Using setInterval
> Async syntax does not make code parallel.
? How long must a task take to be called a "long task" in the browser?
- Over 5 ms
+ Over 50 ms
- Over 1 s
> The Long Tasks API reports tasks over 50 ms.
```

:::keypoints
- One thread: a **long task** (over 50 ms) freezes the UI or delays every server request.
- **Measure first** (Performance tab, `performance.now`, `monitorEventLoopDelay`).
- **Chunk and yield** with a **macrotask** (`setTimeout`, `MessageChannel`, `scheduler.yield`). `await Promise.resolve()` does not.
- For real CPU work, use **Workers** (browser) or **worker_threads** (Node).
- On servers, avoid sync APIs and keep handlers short.
:::
