---
title: Synchronous vs asynchronous code
level: easy
time: 20
summary: What blocking and non-blocking mean, why JavaScript needs async code, and a timeline picture of the same job done synchronously and asynchronously.
---

## Two ways to wait

Imagine you order tea and toast at a stall.

- **Synchronous (blocking):** the stall owner makes your tea, **stands and waits** for it to boil, then makes toast. You wait for both, one after the other.
- **Asynchronous (non-blocking):** the owner puts the kettle on, **starts the toast while the water boils**, and serves each when it is ready.

The same cook (one thread), a better use of time. That is the whole point of async JavaScript.

```viz algo=timeline title="Tea (300 ms) and toast (200 ms): blocking vs non-blocking"
scale: 0-500 ms
lane Blocking | 0-300 | boil water (waiting) | wait
lane Blocking | 300-500 | make toast | run
lane Non-blocking | 0-300 | boil water (cook is free)| wait
lane Non-blocking | 0-200 | make toast | run
mark 500 | blocking finishes
mark 300 | non-blocking finishes
```

## Synchronous code

Each line finishes before the next one starts. If a line is slow, **everything waits**, including the page (clicks, scrolling, animations).

```js run title="Synchronous: the whole thread waits"
function sleepBlocking(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy waiting: the thread is stuck */ }
}

const start = Date.now();
console.log("1. start");
sleepBlocking(200);                      // nothing else can run during this
console.log("2. after blocking sleep");
console.log("total time at least 200 ms:", Date.now() - start >= 200);
```

## Asynchronous code

Async code **starts** a slow job and says "tell me when it is done". The thread is free in between.

```js run title="Asynchronous: the thread keeps working"
console.log("1. start");

setTimeout(() => {
  console.log("3. the slow job finished (callback)");
}, 200);

console.log("2. the thread is free to do other work");
```

Here the order is `1, 2, 3`, even though `3` is written in the middle. The callback runs **later**.

## What counts as asynchronous?

| Type | Examples | Who does the waiting? |
|---|---|---|
| **Timers** | `setTimeout`, `setInterval` | Browser / Node timer system |
| **Network** | `fetch`, XHR, WebSocket, `http.get` | Browser networking / OS |
| **Files & I/O (Node)** | `fs.readFile`, streams, DNS | libuv thread pool / OS |
| **User events** | click, keypress, scroll | Browser (waits for the user) |
| **Promises** | `.then`, `await` | The microtask queue (code continues later) |
| **Workers** | Web Worker, `worker_threads` | A separate thread |

The JavaScript thread **never waits** for any of these. It registers a callback and continues.

## Async does not mean parallel

A common misunderstanding:

- **Concurrency:** many tasks are **in progress** at the same time (interleaved).
- **Parallelism:** many tasks **run at the exact same instant** on different CPU cores.

JavaScript gives you **concurrency** on one thread. Your JavaScript code is never run in parallel (unless you use Workers). The waiting (network, timers) happens in parallel in the background, but your callbacks run one at a time.

```js run title="Two waits overlap, but callbacks run one at a time"
const t0 = Date.now();
const wait = (ms, label) => new Promise((resolve) => setTimeout(() => { console.log(label); resolve(); }, ms));

(async () => {
  await Promise.all([wait(100, "A done"), wait(100, "B done"), wait(100, "C done")]);
  const total = Date.now() - t0;
  console.log("three 100 ms waits took about 100 ms, not 300:", total < 200);
})();
```

## CPU-heavy work is still a problem

Async APIs only help when the work is **waiting**. If your code is **computing** (a huge loop, parsing a giant file, image processing), the thread is busy and nothing else can run. Async syntax does not fix that. Use a **Worker**, break the job into chunks, or move it to another service.

```js run title="async/await does not make heavy computing parallel"
function heavy() {
  let s = 0;
  for (let i = 0; i < 3e7; i++) s += i % 7;
  return s;
}

(async () => {
  setTimeout(() => console.log("timer wanted to fire early, but had to wait"), 0);
  const result = await Promise.resolve().then(heavy);       // still blocks the thread
  console.log("heavy done:", result);
})();
```

The timer is stuck behind the heavy work: `await` and promises only change **when** code runs, not **which thread** runs it.

:::interview What is the difference between synchronous and asynchronous code? Does async mean multi-threaded?
"Synchronous code runs line by line and each operation blocks the thread until it finishes. Asynchronous code starts an operation, such as a timer, a network call or a file read, and continues; when the operation completes, a callback or promise continuation runs later through the event loop. Async does not mean multi-threaded: JavaScript runs your code on a single thread and gets concurrency by overlapping waiting, which is done by the browser or Node outside the thread. CPU-heavy work still blocks, so for that I use workers or chunking."
:::

## More interview questions on this topic

:::qa What does "non-blocking" mean? {level=easy}
**Say this:** "An operation returns immediately and notifies later, so the thread can keep doing other work instead of waiting."

**In simple words:** You do not stand in the queue. You get a token and are called when ready.
:::

:::qa Is asynchronous the same as parallel? {level=medium}
**Say this:** "No. Async is about not waiting: tasks overlap in time. Parallel means running at the same instant on multiple threads or cores. JavaScript callbacks run one at a time on one thread."

**In simple words:** One cook handling several pots is concurrent. Several cooks is parallel.
:::

:::qa Why does JavaScript need async programming at all? {level=easy}
**Say this:** "Because the thread is single and shared with rendering and event handling. If it blocked on every network or file operation, the page would freeze and a server could not handle other requests."

**In simple words:** Waiting is slow. The thread should do something else meanwhile.
:::

:::qa Does `await` block the thread? {level=medium}
**Say this:** "No. `await` pauses only that async function; the thread continues with other code. The function resumes later as a microtask."

**In simple words:** The function sleeps, the thread does not.
:::

```quiz
? Which of these blocks the main thread?
- setTimeout(fn, 1000)
- fetch(url)
+ A for loop that runs for 3 seconds
> Computing keeps the thread busy; waiting APIs do not.
? Does async/await run JavaScript in parallel?
- Yes, on many cores
+ No, one thread, with overlapping waits
- Only in Node
> Use workers for real parallelism.
? A timer is set for 0 ms, followed by a 200 ms busy loop. When does the timer callback run?
- Immediately
+ After the loop finishes
- Never
> The thread must be free first.
```

:::keypoints
- **Synchronous** = one thing at a time, each blocks. **Asynchronous** = start now, finish later through a callback/promise.
- The waiting is done **outside** the JavaScript thread (browser, OS, libuv).
- **Async ≠ parallel.** JavaScript is concurrent on one thread.
- `await` pauses a function, not the thread. **CPU-heavy** work still blocks; use workers or chunking.
:::
