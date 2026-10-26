---
title: Microtasks vs macrotasks
level: intermediate
time: 30
summary: The exact rules for ordering: what creates a microtask, what creates a macrotask, how nested microtasks and timers are ordered, async/await ordering, and the one rule that explains almost every puzzle.
---

## The one rule

> "After **each** piece of running code, **drain the whole microtask queue** before doing anything else. Only then take the next macrotask."

Memorise it as: **sync → all microtasks → one macrotask → all microtasks → one macrotask ...**

## What creates which, in one example

```js run title="Microtasks first, then macrotasks"
const log = (s) => console.log(s);

log("sync 1");

setTimeout(() => log("macro: timeout A"), 0);
setTimeout(() => log("macro: timeout B"), 0);

Promise.resolve().then(() => log("micro: promise 1"));
queueMicrotask(() => log("micro: queueMicrotask"));
Promise.resolve().then(() => log("micro: promise 2"));

(async () => {
  log("sync 2 (inside async, before await)");
  await undefined;
  log("micro: after await");
})();

log("sync 3");
```

Observe: all `sync` first (including the part of an async function **before** its first `await`). Then the microtasks **in the order they were queued**. Then the timers, in order.

## Microtasks queued by microtasks run in the same drain

```js run title="A microtask queues another microtask: still before the timer"
setTimeout(() => console.log("timer"), 0);

Promise.resolve().then(() => {
  console.log("micro 1");
  Promise.resolve().then(() => console.log("micro 3 (queued by micro 1)"));
});
Promise.resolve().then(() => console.log("micro 2"));
```

The inner microtask is added to the **back** of the same queue and still runs **before** the timer.

## A macrotask that queues microtasks and macrotasks

```js run title="Between two macrotasks, microtasks run"
setTimeout(() => {
  console.log("timer 1");
  Promise.resolve().then(() => console.log("micro inside timer 1"));
}, 0);

setTimeout(() => {
  console.log("timer 2");
}, 0);
```

Order: `timer 1`, then the microtask it created, **then** `timer 2`. In the browser (and in Node 11+) the microtask queue is drained **after each macrotask**, not after all timers.

## How `await` works with ordering

`await x` does two things: it makes `x` a promise (if it is not), and it **pauses** the function, scheduling the rest as a **microtask** that runs when the promise resolves.

```js run title="await ordering"
async function one() {
  console.log("one: start");
  await two();
  console.log("one: after await two()");
}
async function two() {
  console.log("two: start");
}

console.log("script start");
one();
Promise.resolve().then(() => console.log("promise callback"));
console.log("script end");
```

Walk through it:

1. `script start`
2. `one()` runs synchronously: `one: start`, calls `two()`, which runs: `two: start`.
3. `await two()` pauses `one`. The rest of `one` is queued as a microtask (after `two`'s promise resolves).
4. The promise callback is queued as a microtask.
5. `script end`.
6. Microtasks in order: `one: after await two()` (queued first), then `promise callback`.

## The exact cost of `await` (modern engines)

In modern V8, `await promise` takes **1 microtask tick** if `promise` is a native promise. Older code (before V8 7.2) needed 3 ticks. If you `await` a non-native **thenable**, it takes extra ticks. This matters only for puzzles that compare `await` vs `.then()` chains.

```js run title="await vs a .then chain: ticks decide the order"
async function a() {
  console.log("a1");
  await Promise.resolve();
  console.log("a2");
}

a();

Promise.resolve()
  .then(() => console.log("p1"))
  .then(() => console.log("p2"))
  .then(() => console.log("p3"));
```

`a1` is printed synchronously. Then `await Promise.resolve()` queues the rest of `a` as a microtask **first** (because `a()` was called first). The `p1` callback is queued **second**. So the microtask queue is `[a's continuation, p1]`. After `a2` prints, `p1` runs and queues `p2`, and so on. The result: `a1, a2, p1, p2, p3`.

If you swap the order (start the `.then` chain first, then call `a()`), then `p1` goes first. **The order in which microtasks are queued decides the order in which they run.**

## Returning a promise from `.then` costs extra ticks

If a `.then` callback **returns a promise**, the outer promise needs **2 extra ticks** to adopt it. This is a classic puzzle.

```js run title="Returning a promise from then() delays the chain"
Promise.resolve()
  .then(() => {
    console.log("A1");
    return Promise.resolve("value");          // returns a promise: costs 2 extra ticks
  })
  .then(() => console.log("A2"));

Promise.resolve()
  .then(() => console.log("B1"))
  .then(() => console.log("B2"))
  .then(() => console.log("B3"))
  .then(() => console.log("B4"));
```

`A2` appears **after `B3`**, not after `B1`, because of the extra ticks. You do not need to count ticks in real code. In an interview, if you meet this, say: "returning a promise from `then` adds extra microtask ticks because the promise has to be unwrapped (the `NewPromiseResolveThenableJob`)".

## Rendering and `requestAnimationFrame` (browser)

```
Task → microtasks → (if time to paint:) requestAnimationFrame callbacks → style/layout → paint → next task
```

- `requestAnimationFrame` callbacks run **before the next paint**, not as normal tasks.
- `requestIdleCallback` runs when the browser is idle, between frames.

## Summary table

| | Microtask | Macrotask (task) |
|---|---|---|
| Created by | `.then/.catch/.finally`, `await`, `queueMicrotask`, `MutationObserver` | `setTimeout`, `setInterval`, I/O, UI events, `MessageChannel`, `setImmediate` (Node) |
| When it runs | Right after the current script/task, **before** anything else, until the queue is empty | One per loop turn |
| Can starve other work? | **Yes** (endless chain) | No (others still get turns) |
| Browser painting | Not between microtasks | Possible between tasks |

:::interview What are microtasks and macrotasks? Which runs first and why?
"Macrotasks, or tasks, are things like timer callbacks, I/O callbacks and UI events: the event loop runs one per turn. Microtasks are promise reactions, the continuation after `await`, `queueMicrotask` and MutationObserver callbacks. After the current script or task finishes and the stack is empty, the engine drains the whole microtask queue, including any microtasks queued while draining, and only then takes the next macrotask. So promise callbacks always run before the next `setTimeout` callback, even with a 0 ms delay."
:::

## More interview questions on this topic

:::qa Are `setTimeout` callbacks microtasks or macrotasks? {level=easy}
**Say this:** "Macrotasks. They go to the task queue and run one per loop turn."

**In simple words:** Timers wait their turn behind all urgent promise work.
:::

:::qa How does `await` interact with the microtask queue? {level=medium}
**Say this:** "`await` pauses the async function. The code after it is scheduled as a microtask once the awaited promise settles. The code before the first `await` runs synchronously."

**In simple words:** An async function runs like normal code until its first `await`.
:::

:::qa If a microtask schedules another microtask, when does the second run? {level=medium}
**Say this:** "In the same drain: it is added to the end of the microtask queue and runs before any macrotask or rendering."

**In simple words:** The urgent tray is not "closed" until it is really empty.
:::

:::qa Why is `A2` printed after `B3` when `A1` returns a promise? {level=hard}
**Say this:** "When a `then` callback returns a promise, the derived promise must resolve with that promise, which requires an extra job to call its `then`, plus one more tick to settle. So it takes about 2 more microtask ticks than returning a plain value."

**In simple words:** Unwrapping a promise inside a promise takes extra steps in the queue.
:::

```quiz
? What is the order: `setTimeout(a, 0)`, `Promise.resolve().then(b)`, `queueMicrotask(c)`, sync `d`?
- a, b, c, d
+ d, b, c, a
- d, a, b, c
> Sync first, then microtasks in queue order, then the timer.
? What runs synchronously in an async function?
- Nothing: it is all async
+ Everything up to the first await
- Only the return
> The first await pauses it.
? When does the microtask queue get drained?
- Only once at the start
+ After each script or task, until it is empty
- Every 16 ms
> That is why microtasks starve other work.
```

:::keypoints
- **Microtasks**: promise reactions, `await` continuations, `queueMicrotask`. **Macrotasks**: timers, I/O, UI events.
- The whole microtask queue is drained after the script and **after every macrotask**.
- Microtasks queued by microtasks run in the **same** drain.
- Code before the first `await` is synchronous. `await` continues in a **microtask**.
- Returning a promise from `then` costs **extra ticks**.
:::
