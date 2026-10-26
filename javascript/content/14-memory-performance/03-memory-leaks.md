---
title: Memory leaks: causes, detection and fixes
level: advanced
time: 35
summary: Eight common causes of leaks in browsers and Node (globals, timers, listeners, closures, caches, detached DOM, unbounded queues, forgotten subscriptions) with runnable demos, and a step-by-step method to find them with heap snapshots.
---

## What is a memory leak in a garbage-collected language?

> "A **leak** is memory that your program **no longer needs**, but that is still **reachable**, so the garbage collector cannot free it."

Symptoms: memory (RSS or heap) **grows over time and never drops**, the page or server gets slower, GC pauses get longer, and finally the tab crashes or Node dies with `JavaScript heap out of memory`.

## The 8 usual suspects

### 1. Accidental globals

```js run sloppy title="A global that is never released"
function process() {
  leaked = new Array(1000).fill("data");       // missing const/let: creates a global variable (sloppy mode)
}
process();
console.log("still reachable through the global object:", leaked.length);
```

Fix: strict mode / modules / `const`. (Also: huge objects stored deliberately on `window` or `global`.)

### 2. Timers that are never cleared

```js run node title="setInterval keeps its closure (and data) alive forever" nondet
function startPolling() {
  const bigData = new Array(1_000_000).fill("x");        // captured by the callback below
  const id = setInterval(() => bigData.length, 1000);
  return id;                                              // if the caller forgets to clearInterval...
}

const id = startPolling();
global.gc();
const held = process.memoryUsage().heapUsed / 1024 / 1024;
console.log("array still alive (timer holds it):", held > 5);
clearInterval(id);                                        // the fix: always clear
global.gc();
console.log("after clearInterval, freed:", process.memoryUsage().heapUsed / 1024 / 1024 < held);
```

### 3. Event listeners that are never removed

```js run node title="Listeners accumulate on a long-lived emitter"
const { EventEmitter } = require("node:events");
const bus = new EventEmitter();
bus.setMaxListeners(Infinity);

function openScreen(id) {
  const bigState = new Array(10000).fill(id);
  const handler = () => bigState.length;                  // closes over bigState
  bus.on("tick", handler);
  return () => bus.off("tick", handler);                  // the cleanup that is often forgotten
}

for (let i = 0; i < 3; i++) openScreen(i);                // "screens" opened and closed, but handlers remain
console.log("listeners still registered:", bus.listenerCount("tick"));

const cleanup = openScreen(99);
cleanup();
console.log("after cleanup:", bus.listenerCount("tick"));
```

In the browser the same happens with `addEventListener` on `window`, `document` or a long-lived element, and with **React effects without a cleanup**:

```jsx
useEffect(() => {
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);      // required!
}, []);
```

Node warns about this: `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 listeners added`. Never silence it without understanding why.

### 4. Closures that capture more than needed

(See the closures-and-memory lesson.) A long-lived callback holds the whole environment it uses.

### 5. Unbounded caches and collections

```js run node title="A cache that only grows" nondet
const cache = new Map();
function getUser(id) {
  if (!cache.has(id)) cache.set(id, { id, payload: new Array(100).fill(id) });     // never evicted
  return cache.get(id);
}
for (let i = 0; i < 100000; i++) getUser(i);              // every request id is cached forever
console.log("cache size:", cache.size);

// Fix 1: a size limit (LRU)
class LRU {
  #max; #map = new Map();
  constructor(max) { this.#max = max; }
  get(k) { if (!this.#map.has(k)) return undefined; const v = this.#map.get(k); this.#map.delete(k); this.#map.set(k, v); return v; }
  set(k, v) { this.#map.delete(k); this.#map.set(k, v); if (this.#map.size > this.#max) this.#map.delete(this.#map.keys().next().value); }
  get size() { return this.#map.size; }
}
const lru = new LRU(1000);
for (let i = 0; i < 100000; i++) lru.set(i, { i });
console.log("LRU size:", lru.size);

// Fix 2: WeakMap when the key is an object whose lifetime you do not control
const meta = new WeakMap();
let element = {};
meta.set(element, { clicks: 0 });
element = null;                                            // the entry can now be collected with the key
```

### 6. Detached DOM nodes (browser)

An element removed from the page but still referenced by JavaScript stays in memory **with its whole subtree and listeners**.

```js
const nodes = [];
function addRow() {
  const row = document.createElement("div");
  document.body.appendChild(row);
  nodes.push(row);                    // keeps a reference
}
function clearRows() {
  document.body.innerHTML = "";        // removed from the page...
  // ...but `nodes` still points to the old rows: they are "detached" and cannot be freed.
  // Fix: nodes.length = 0;
}
```

Chrome DevTools: filter the heap snapshot by **"Detached"**.

### 7. Unbounded queues and logs

A queue that **receives faster than it is consumed**, an in-memory log array, an `errors` list on a server: all grow without limit. Add **bounds**, **back-pressure**, or write to disk or an external system.

```js run title="A bounded buffer drops or blocks instead of growing forever"
class BoundedLog {
  #max; #items = [];
  constructor(max) { this.#max = max; }
  push(x) { this.#items.push(x); if (this.#items.length > this.#max) this.#items.shift(); }
  get items() { return [...this.#items]; }
}
const log = new BoundedLog(3);
for (let i = 1; i <= 10; i++) log.push("event " + i);
console.log(log.items);
```

### 8. Forgotten subscriptions and long-lived promises

Observables (RxJS) never unsubscribed, WebSocket handlers, `AbortController` signals with listeners, third-party SDK callbacks. And **promises that never settle** keep their callbacks alive (a `await` on a promise that never resolves keeps the whole async function's environment).

## How to find a leak: the method

1. **Reproduce**: find the action that grows memory (open and close a screen, send 1000 requests).
2. **Take a heap snapshot** (baseline).
3. **Do the action many times** (for example 10 times).
4. **Force GC**, then **take another snapshot**.
5. **Compare**: sort by "# Delta" or "Size Delta". Look at objects that **grew by roughly the number of repetitions**.
6. Open the object → **Retainers** panel: it shows the **chain of references** keeping it alive (for example `window → handlers → closure → bigState`). Cut that chain.

### In the browser

- DevTools → **Memory** → *Heap snapshot*, *Allocation instrumentation on timeline*, *Allocation sampling*.
- **Performance monitor** → *JS heap size* and *DOM Nodes*, *Event listeners* counters.
- `performance.measureUserAgentSpecificMemory()` for production monitoring.

### In Node.js

```bash
node --inspect server.js            # then open chrome://inspect → Memory → snapshot
node --heapsnapshot-signal=SIGUSR2 server.js     # kill -USR2 <pid> writes a .heapsnapshot file
node --max-old-space-size=512 --heapsnapshot-near-heap-limit=3 server.js   # dump snapshots when nearly out of memory
```

```js run node title="Writing a heap snapshot from code (v8)" nondet
const v8 = require("node:v8");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const file = path.join(os.tmpdir(), "demo.heapsnapshot");
const written = v8.writeHeapSnapshot(file);                 // open it in Chrome DevTools → Memory → Load
console.log("snapshot written:", fs.statSync(written).size > 100000, "bytes (a big JSON file)");
fs.unlinkSync(written);
console.log(Object.keys(v8.getHeapStatistics()).slice(0, 5));
```

Libraries: `clinic doctor/heapprofiler`, `memwatch-next`, `heapdump`, `leakcanary`-like tests that check `process.memoryUsage()` after many iterations.

## Preventing leaks: a checklist

- Every `addEventListener` / `on` / `subscribe` has a matching **remove / unsubscribe** (use `AbortController` signal, `{ once: true }`, effect cleanup).
- Every `setInterval` / `setTimeout` that can outlive its owner is **cleared**.
- Caches have a **maximum size** or **TTL**, or use `WeakMap`.
- No data stored on `window` / `global` unless needed. Use strict mode.
- Remove DOM nodes **and** the references to them.
- Queues and logs are **bounded**.
- Capture only what you need in closures.
- Add a **memory test** to CI for long-running services (run N iterations, assert the heap does not grow).

:::interview How do you find and fix a memory leak in a Node.js service or a web app?
"First I confirm it: memory grows steadily and does not drop after GC. Then I take a heap snapshot, repeat the suspicious action many times, force GC and take another snapshot, and compare them to see which objects grew in proportion to the repetitions. The Retainers view shows the reference chain from a GC root, such as a global, a timer, an event listener or a cache, that keeps them alive. Common causes are uncleared timers, listeners without cleanup, unbounded caches, closures holding large data, detached DOM nodes and accidental globals. The fix is to break that chain: clear, unsubscribe, bound the cache or use a WeakMap. I add a regression test that checks heap growth."
:::

## More interview questions on this topic

:::qa What are the most common causes of memory leaks in JavaScript? {level=easy}
**Say this:** "Accidental globals, uncleared timers and intervals, event listeners that are never removed, closures holding big data, unbounded caches, detached DOM nodes, and unbounded queues."

**In simple words:** Something still points to data you no longer need.
:::

:::qa What is a detached DOM node and why does it leak? {level=medium}
**Say this:** "A node removed from the document that JavaScript still references, such as in an array or closure. It cannot be collected, with its children and listeners."

**In simple words:** It is off the page, but you are still holding it.
:::

:::qa What does the "Retainers" view show in a heap snapshot? {level=medium}
**Say this:** "The chain of references from a GC root to the selected object, i.e. why it is still alive."

**In simple words:** Who is holding on to this?
:::

:::qa How can you stop a cache from growing forever? {level=medium}
**Say this:** "Limit its size with an LRU policy or a TTL, or use a WeakMap if the keys are objects."

**In simple words:** Give the cache a maximum, or let it forget.
:::

```quiz
? What is a memory leak in JavaScript?
- Memory freed too early
+ Memory that is no longer needed but is still reachable
- A syntax error
> The GC cannot free what is reachable.
? What cleanup does a React effect that adds a window listener need?
- None
+ Return a function that removes the listener
- Set the state to null
> Otherwise handlers pile up.
? Which Node warning hints at a listener leak?
- DeprecationWarning
+ MaxListenersExceededWarning
- TimeoutOverflowWarning
> Too many listeners on one emitter.
```

:::keypoints
- A leak = **unneeded but reachable** memory. Symptoms: steady growth, slowdowns, `heap out of memory`.
- Top causes: **globals, timers, listeners, closures, unbounded caches, detached DOM, unbounded queues, forgotten subscriptions**.
- Find: **baseline snapshot → repeat action → GC → second snapshot → compare → Retainers**.
- Fix by **breaking the reference chain**: clear, unsubscribe, bound or `WeakMap`.
- Prevention: cleanup in effects, `AbortController`, limits on caches/queues, memory tests in CI.
:::
