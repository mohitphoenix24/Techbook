---
title: "Async bank: the event loop"
level: medium
time: 30
summary: Thirteen answers on the event loop, the call stack and queues, microtasks versus macrotasks, timers, nextTick and setImmediate, rendering, blocking the loop and keeping the UI responsive.
---

## Basics

:::qa Explain the event loop in simple terms. {level=easy}
**Say this:** "JavaScript runs on one thread. When the call stack is empty, the event loop picks the next task from a queue and runs it. Timers, network and user events are handled by the browser or Node outside the stack, and their callbacks wait in queues until the stack is free."

**In simple words:** A waiter with one pair of hands. He takes one order at a time, and the kitchen (the browser) cooks in the background and rings a bell when it is ready.
:::

:::qa What is the difference between microtasks and macrotasks? {level=medium}
**Say this:** "Macrotasks (tasks) are things like `setTimeout`, I/O callbacks, UI events and `setInterval`. Microtasks are promise reactions (`then`, `catch`, `finally`, `await` continuations), `queueMicrotask` and `MutationObserver`. After each macrotask, the loop runs **all** microtasks, including ones added while it runs, and only then continues."

**In simple words:** Macrotasks are meetings on the calendar. Microtasks are small follow-ups you must finish before the next meeting starts.
:::

:::qa What is the output? `console.log(1); setTimeout(() => console.log(2)); Promise.resolve().then(() => console.log(3)); console.log(4);` {level=easy}
**Say this:** "1, 4, 3, 2. The synchronous logs run first (1, 4). Then microtasks run (3). Then the timer callback, a macrotask, runs (2)."

**In simple words:** Finish the current job, finish the small follow-ups, then take the next scheduled job.
:::

:::qa Does `setTimeout(fn, 0)` run immediately? {level=easy}
**Say this:** "No. It schedules a macrotask for the next turn of the loop, after the current code and all microtasks. Browsers also clamp nested timers to at least 4 ms, and Node's minimum is 1 ms. The delay is a minimum, never a guarantee."

**In simple words:** 'As soon as you are free', not 'right now'.
:::

:::qa Is asynchronous the same as parallel? {level=medium}
**Say this:** "No. Async means the code does not wait, so the thread can do other work in the meantime. Your JavaScript still runs one piece at a time. Real parallelism needs Web Workers, worker threads or other processes."

**In simple words:** One person switching between tasks is not the same as two people working.
:::

## Browser details

:::qa Where does rendering fit into the loop? {level=hard}
**Say this:** "After a task and its microtasks, the browser may run a rendering step: `requestAnimationFrame` callbacks, style, layout, paint. Long JavaScript blocks this step, so the page freezes. `requestAnimationFrame` runs just before the next paint and is the right place for visual updates."

**In simple words:** The painter can only paint when the waiter is not busy.
:::

:::qa How do you keep the page responsive during heavy work? {level=medium}
**Say this:** "Break the work into small chunks and yield between them (`setTimeout`, `scheduler.yield()`, `requestIdleCallback`), move it to a Web Worker, use `requestAnimationFrame` for visual steps, and debounce or throttle frequent events. Measure with the Performance panel and look for long tasks over 50 ms."

**In simple words:** Do a little, let the page breathe, do a little more.
:::

:::qa What is a microtask starvation problem? {level=hard}
**Say this:** "Because the loop empties the whole microtask queue before moving on, a microtask that keeps scheduling another microtask never lets timers, I/O or rendering run. The page or process looks frozen even though no single task is long."

**In simple words:** Small follow-ups that create more follow-ups can block the whole calendar.
:::

:::qa What is `requestIdleCallback` for? {level=medium}
**Say this:** "It runs low-priority work when the browser is idle, with a deadline telling you how much time is left. It is good for analytics, prefetching and non-urgent computation. It is not available in Safari, so use a fallback."

**In simple words:** Do the cleaning when the shop is quiet.
:::

## Node details

:::qa How does Node's event loop differ from the browser's? {level=hard}
**Say this:** "Node (libuv) has phases: timers, pending callbacks, poll (I/O), check (`setImmediate`) and close callbacks. `process.nextTick` runs before promise microtasks, after the current operation. Between phases Node drains the `nextTick` queue and then the microtask queue."

**In simple words:** Same idea, but with named stops on the route.
:::

:::qa `setTimeout(fn, 0)` or `setImmediate(fn)`: which runs first? {level=hard}
**Say this:** "From the main module the order is not guaranteed; it depends on how fast the process starts. Inside an I/O callback, `setImmediate` always runs first, because the check phase comes right after the poll phase."

**In simple words:** Outside I/O it is a coin toss; inside I/O `setImmediate` wins.
:::

:::qa What is `process.nextTick` and why can it be dangerous? {level=hard}
**Say this:** "It queues a callback to run right after the current operation, before promise microtasks. Calling it recursively starves the event loop, because I/O never gets a turn. Prefer `queueMicrotask` or `setImmediate` unless you need the nextTick ordering."

**In simple words:** It jumps the queue, so overuse blocks everyone behind.
:::

:::qa What blocks the event loop in Node, and how do you find it? {level=medium}
**Say this:** "Synchronous CPU work: big JSON parsing, regex backtracking, crypto in sync mode, `fs.readFileSync` in handlers, large loops. Find it with a CPU profile (`--cpu-prof`, clinic.js), monitor event-loop delay with `perf_hooks.monitorEventLoopDelay`, and move the work to worker threads or another service."

**In simple words:** One slow customer at the counter makes everybody wait.
:::

:::keypoints
- One thread, one stack; the loop runs a **macrotask → all microtasks → render (browser)**.
- Promise callbacks and `await` continuations are **microtasks**; timers and I/O are **macrotasks**.
- `setTimeout 0` is "later", never "now"; async is **not** parallel.
- Node: `nextTick` → microtasks → phases; avoid starving the loop.
- Heavy work: **chunk, worker, or offload**.
:::
