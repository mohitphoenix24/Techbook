---
title: "Async bank: cheat sheet"
level: easy
time: 15
summary: The order of execution, the promise combinators, the sequential and parallel patterns and the Node timing functions on one page.
---

## Order of execution

1. Synchronous code (the current call stack).
2. `process.nextTick` queue (Node only, CommonJS ordering).
3. Microtasks: promise reactions, `await` continuations, `queueMicrotask`.
4. Rendering (browser): `requestAnimationFrame`, style, layout, paint.
5. The next macrotask: timers, I/O callbacks, events, `setImmediate` (Node).

Repeat. After **each** macrotask all microtasks run.

```js run title="The classic order"
console.log("1 sync");
setTimeout(() => console.log("5 timeout"), 0);
Promise.resolve().then(() => console.log("3 promise"));
queueMicrotask(() => console.log("4 queueMicrotask"));
(async () => { console.log("2 async function body runs synchronously until the first await"); await null; console.log("4b after await"); })();
```

## Promise combinators

| Method | Fulfils when | Rejects when | Empty array |
|---|---|---|---|
| `Promise.all` | all fulfil (array in order) | the first rejects | fulfils `[]` |
| `Promise.allSettled` | all settle | never | fulfils `[]` |
| `Promise.race` | the first settles (fulfil) | the first settles (reject) | pending forever |
| `Promise.any` | the first fulfils | all reject (`AggregateError`) | rejects |

## Patterns

| Goal | Pattern |
|---|---|
| Parallel | `await Promise.all(items.map(fn))` |
| Sequential | `for (const x of items) await fn(x)` |
| Limited parallel | a worker pool or a library such as `p-limit` |
| Timeout | `Promise.race` + clear the timer, or `AbortSignal.timeout` |
| Retry | loop, backoff with jitter, retry only safe errors |
| Latest only | abort the previous request, or ignore stale results |
| Wrap a callback API | `new Promise((resolve, reject) => cb((err, v) => err ? reject(err) : resolve(v)))` |
| Run once, share the result | cache the **promise**, not the value |

## Timing functions

| Function | Where | Runs |
|---|---|---|
| `queueMicrotask(fn)` | both | after the current code, before any macrotask |
| `setTimeout(fn, ms)` | both | after at least `ms`, as a macrotask |
| `setInterval` | both | repeats; can overlap if the callback is slow, prefer a chained `setTimeout` |
| `requestAnimationFrame` | browser | before the next paint |
| `requestIdleCallback` | browser (not Safari) | when idle |
| `process.nextTick` | Node | before promise microtasks |
| `setImmediate` | Node | in the check phase, after I/O |

:::keypoints
- **sync → microtasks → render → next macrotask**.
- `all` fails fast; `allSettled` never fails; `race` is first-settled; `any` is first-success.
- Cache the **promise** to share work; **cancel the work**, not the promise.
:::
