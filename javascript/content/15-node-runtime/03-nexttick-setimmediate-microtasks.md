---
title: process.nextTick, setImmediate and microtasks
level: advanced
time: 30
summary: The exact priority order (nextTick, promises, timers, I/O, immediate), why nextTick can starve the loop, the CommonJS vs ES module difference, and when to use each in real code (emit after construction, break up work, defer errors).
---

## The priority list

From highest to lowest priority, after the current operation finishes:

| Order | API | Queue |
|---|---|---|
| 1 | **`process.nextTick(fn)`** | the **nextTick queue** (drained completely first) |
| 2 | **`Promise.then`**, `await`, **`queueMicrotask(fn)`** | the **microtask queue** (drained completely second) |
| 3 | **`setTimeout` / `setInterval`** | timers phase |
| 4 | **I/O callbacks** | poll phase |
| 5 | **`setImmediate(fn)`** | check phase |

The naming is confusing: `nextTick` runs **before** the next loop tick (right after the current operation), and `setImmediate` runs on the **next** iteration's check phase. The Node docs even say the names should be swapped.

```js run cjs node title="Priority in a CommonJS file"
setImmediate(() => console.log("5 setImmediate"));
setTimeout(() => console.log("4 setTimeout 0"), 0);
Promise.resolve().then(() => console.log("3 promise.then"));
queueMicrotask(() => console.log("3b queueMicrotask"));
process.nextTick(() => console.log("2 nextTick"));
console.log("1 synchronous");
```

(In a module the promise and nextTick lines swap, as you saw. And `4` vs `5` can swap from the main module.)

## Nested scheduling

Each queue is **drained completely** before moving on, including callbacks added while draining.

```js run cjs node title="nextTick inside promise inside nextTick"
process.nextTick(() => {
  console.log("tick 1");
  Promise.resolve().then(() => console.log("promise (from tick 1)"));
  process.nextTick(() => console.log("tick 3 (queued by tick 1)"));
});
process.nextTick(() => console.log("tick 2"));

Promise.resolve().then(() => {
  console.log("promise 1");
  process.nextTick(() => console.log("tick (queued from a promise)"));
});
Promise.resolve().then(() => console.log("promise 2"));
```

The loop is: drain the **nextTick** queue; drain the **microtask** queue; if either added work to the other, repeat, until both are empty.

## Starvation: nextTick can freeze the loop

Because both queues are drained **completely** before the event loop continues, a callback that keeps scheduling `nextTick`s (or promises) **starves I/O and timers**.

```js run cjs node title="A recursive nextTick prevents the timer from ever running (stopped after 100,000 steps)"
let n = 0;
setTimeout(() => console.log("timer finally ran, after", n, "nextTicks"), 0);

function spin() {
  if (++n < 100000) process.nextTick(spin);          // each step queues the next: the loop cannot move on
}
spin();
```

An **infinite** version would freeze the process: no timers, no I/O, no HTTP responses. **`setImmediate`** does **not** starve I/O, because each immediate callback runs in the check phase and the loop then continues to other phases:

```js run cjs node title="setImmediate lets timers and I/O run between iterations"
let n = 0, ranAfter = null, finished = false;
setTimeout(() => { ranAfter = n; }, 0);

function spin() {
  if (++n < 300000) setImmediate(spin);              // yields to the loop on every step
  else finished = true;
}
spin();

setTimeout(() => console.log("the timer got its turn in the middle of the work:", ranAfter !== null && ranAfter < 300000, "| work finished:", finished), 500);
```

## Real uses of `process.nextTick`

### 1. Make an API consistently async (avoid "Zalgo")

```js run cjs node title="Emit after the caller has attached listeners"
const { EventEmitter } = require("node:events");

class Connection extends EventEmitter {
  constructor() {
    super();
    this.emit("ready");                              // BAD: no listener is attached yet, so it is lost
    process.nextTick(() => this.emit("ready-later"));   // GOOD: emitted after the constructor returns
  }
}

const c = new Connection();
c.on("ready", () => console.log("ready (never printed)"));
c.on("ready-later", () => console.log("ready-later (printed)"));
```

### 2. Defer an error so the caller can attach a handler

```js run cjs node title="Callbacks should be called asynchronously, always"
function readValue(input, callback) {
  if (typeof input !== "string") {
    return process.nextTick(callback, new TypeError("input must be a string"));    // not synchronously!
  }
  setImmediate(callback, null, input.toUpperCase());
}

let order = "";
readValue(42, (err) => { order += "callback "; console.log("order:", order + "(" + err.message + ")"); });
order += "after-call ";
```

The callback now runs **after** the code that follows the call, every time, so behaviour is consistent.

### 3. Run something right after the current operation but before I/O

Used internally by Node's own streams and events. In application code, prefer **`queueMicrotask`** (standard, portable) or promises, unless you specifically need to run before promise callbacks.

## When to use which

| I want to... | Use |
|---|---|
| Run right after the current sync code, before anything else (library internals, emit-after-construct) | `process.nextTick` (rarely in app code) |
| Run a small job as a microtask, portable to browsers | `queueMicrotask` / a promise |
| Run after the current I/O phase, **yield** to the loop between chunks of work | `setImmediate` |
| Run after a minimum delay | `setTimeout` |
| Run CPU-heavy work without blocking | `worker_threads` |

:::warn Do not use process.nextTick for "yielding"
A long job split with `nextTick` still **blocks I/O**. To split CPU work so the server stays responsive, use `setImmediate` between chunks (or a worker thread).
:::

## Tracing the order with `async_hooks` (advanced)

For debugging and APM tools, `async_hooks` / `AsyncLocalStorage` track async context across ticks, timers and promises (used for request-scoped logging and tracing).

```js run node title="AsyncLocalStorage: request context across async hops"
const { AsyncLocalStorage } = require("node:async_hooks");
const store = new AsyncLocalStorage();

const log = (msg) => console.log(`[req ${store.getStore()?.id ?? "-"}] ${msg}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function handle(id) {
  return store.run({ id }, async () => {
    log("start");
    await wait(10 * (3 - id));                          // different delays: the requests interleave
    process.nextTick(() => log("tick"));
    await wait(5);
    log("end");
  });
}

Promise.all([handle(1), handle(2)]).then(() => log("outside any request"));
```

Each log line knows **which request** it belongs to, without passing `id` through every function.

:::interview What is the difference between process.nextTick and setImmediate? Which has priority?
"`process.nextTick` callbacks run immediately after the current operation completes, before the event loop continues, and before promise microtasks in CommonJS; the queue is fully drained, so a recursive nextTick can starve I/O. `setImmediate` runs in the check phase of the next loop iteration, after poll, so it lets I/O and timers run in between. Order: synchronous code, nextTick queue, promise microtasks, then timers, I/O, and setImmediate. I use `queueMicrotask` or promises for microtasks, `setImmediate` to yield between chunks of work, and `nextTick` mainly in library code to keep APIs consistently asynchronous, for example emitting an event after the constructor returns."
:::

## More interview questions on this topic

:::qa Why can a recursive `process.nextTick` freeze a Node server? {level=medium}
**Say this:** "The nextTick queue is drained completely before the loop moves on, so if every callback schedules another, the loop never reaches timers, I/O or immediates."

**In simple words:** The urgent tray is refilled forever, so normal mail is never read.
:::

:::qa Do nextTick callbacks run before promise callbacks? {level=hard}
**Say this:** "In CommonJS code and in callbacks, yes: nextTick first, then promise microtasks. In an ES module's top-level code, promises run first, because the module is evaluated inside a promise job."

**In simple words:** It depends on whether we are already inside a microtask.
:::

:::qa How do you split CPU-heavy work so the server stays responsive? {level=medium}
**Say this:** "Chunk it and yield with `setImmediate` between chunks so I/O callbacks can run. For real heavy work use worker threads, a child process or a queue."

**In simple words:** Do a bit, let others in, continue.
:::

:::qa What is `AsyncLocalStorage` for? {level=hard}
**Say this:** "It keeps a context value, like a request id, available across async calls (timers, promises, callbacks) without passing it as a parameter. It is used for logging, tracing and per-request state."

**In simple words:** A backpack that follows the request through every async hop.
:::

```quiz
? Which runs first in a CommonJS file: process.nextTick or Promise.then?
- Promise.then
+ process.nextTick
- They are equal
> nextTick has the highest priority in CommonJS.
? Which one lets I/O callbacks run between iterations of a loop?
- process.nextTick
- Promise.then
+ setImmediate
> It uses the check phase of each iteration.
? Why emit "ready" with nextTick in a constructor?
- To make it faster
+ So listeners attached after construction still receive it
- To avoid memory leaks
> The event is emitted after the constructor returns.
```

:::keypoints
- Priority: **sync → nextTick queue → promise microtasks → timers → I/O (poll) → setImmediate (check)**.
- Both **nextTick and microtask queues are drained completely**: recursion **starves** timers and I/O.
- **ES module top level: promises before nextTick.** CommonJS and callbacks: nextTick first.
- Use `setImmediate` to **yield**; `nextTick` mainly in libraries (consistent async APIs); `queueMicrotask` for portability.
- `AsyncLocalStorage` carries request context across async hops.
:::
