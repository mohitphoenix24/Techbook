---
title: The event loop explained, step by step
level: intermediate
time: 35
summary: The five parts (call stack, Web/Node APIs, task queue, microtask queue, event loop), the loop algorithm in four lines, and a step-by-step simulator for a classic output question.
---

## The five parts

Think of the system as a small office.

| Part | Role | The office picture |
|---|---|---|
| **Call stack** | Runs the current function | The one clerk's desk: one file at a time |
| **Web APIs / Node APIs** | Do the slow waiting (timers, network, files) | The back office that handles slow requests |
| **Task queue** (macrotask queue) | Waiting callbacks from timers, I/O, events | The tray of normal mail |
| **Microtask queue** | Waiting promise callbacks and `queueMicrotask` | A tray of **urgent** mail that is always read first |
| **Event loop** | Moves callbacks to the stack when it is empty | The messenger who checks the trays |

## The loop in four lines

```
1. Run the current script until the call stack is empty.
2. Run ALL microtasks (until the microtask queue is empty).
3. Take ONE task (macrotask) from the task queue and run it.   (browsers: maybe render the page here)
4. Go back to step 2, and repeat forever.
```

That is the whole algorithm. Everything else (promise ordering, `await`, `setTimeout(0)` surprises) comes from these four lines.

```viz algo=chain title="The event loop at a glance"
node stack "Call stack" @0,0 [hl]
  note: runs one function at a time
node apis "Web / Node APIs" @1,0
  note: timers, fetch, fs, DOM events
node micro "Microtask queue" @1,1 [ok]
  note: promise .then, await, queueMicrotask
node macro "Task queue" @2,0 [fn]
  note: setTimeout, I/O, clicks
node loop "Event loop" @2,1 [dim]
  note: stack empty? take the next job
link stack -> apis : starts
link apis -> macro : when done
link stack -> micro : promise resolves
link micro -> loop : first
link macro -> loop : then one
link loop -> stack : push callback
```

## A classic question, step by step

```js run title="What is the output order?"
console.log("A");

setTimeout(() => console.log("B"), 0);

Promise.resolve().then(() => console.log("C"));

console.log("D");
```

The answer is `A D C B`. Press **▶** to watch exactly why:

```viz algo=eventloop title="A, setTimeout B, Promise C, D"
step | stack: main | note: The script starts. `main` (the whole file) is on the **call stack**.
step | stack: main, console.log("A") | print: A | note: `console.log("A")` runs at once and prints **A**.
step | stack: main, setTimeout(cbB, 0) | note: `setTimeout` is called. It hands the timer to the **browser / Node**. The callback is not run now.
step | stack: main | apis: timer 0ms → cbB | note: The call is done. The timer is running **outside** the JavaScript thread.
step | stack: main | apis: - | macro: cbB | note: The timer (0 ms) has finished at once, and its callback `cbB` waits in the **task queue**. It cannot run: `main` is still on the stack.
step | stack: main, Promise.resolve().then(cbC) | micro: cbC | note: The promise is already resolved, so `cbC` goes straight to the **microtask queue**.
step | stack: main, console.log("D") | print: D | note: Back in `main`: `console.log("D")` prints **D**. This is still synchronous code.
step | stack: - | note: `main` finishes. The **call stack is empty**. Now the event loop looks at the queues.
step | stack: cbC | micro: - | note: **Rule 2:** run all microtasks first. `cbC` moves to the stack.
step | stack: cbC, console.log("C") | print: C | note: It prints **C**.
step | stack: - | note: The microtask queue is empty. The stack is empty.
step | stack: cbB | macro: - | note: **Rule 3:** now take one task. `cbB` moves to the stack.
step | stack: cbB, console.log("B") | print: B | note: It prints **B**. Done: **A D C B**.
```

The two lessons from this one example:

1. **All synchronous code finishes first** (A, D).
2. **Microtasks (promises) beat macrotasks (timers)**, even when the timer is `0`.

## Why `setTimeout(fn, 0)` is not "now"

`0` means "as soon as possible, but not before the **current code and all microtasks** are finished". It also does not mean exactly 0 ms; browsers apply a minimum delay of about **4 ms** after nested timers and Node uses **1 ms** as the minimum.

```js run title="A 0 ms timer waits for everything synchronous"
setTimeout(() => console.log("timer"), 0);

for (let i = 0; i < 3; i++) console.log("sync", i);

Promise.resolve().then(() => console.log("microtask"));
```

## What lives in which queue

| Microtask queue (high priority) | Task queue (one per turn) |
|---|---|
| `promise.then / catch / finally` callbacks | `setTimeout`, `setInterval` callbacks |
| Code after `await` | I/O callbacks (network, file) |
| `queueMicrotask(fn)` | UI events: click, keydown, `message` |
| `MutationObserver` callbacks | `setImmediate` (Node), `MessageChannel` |
| *(Node)* `process.nextTick` queue (even higher) | `requestAnimationFrame` is separate: runs before the next paint |

## The event loop and rendering (browsers)

The browser **paints** the page between tasks, if needed (about every 16 ms for 60 fps). So:

- A **long task** (say 200 ms) delays painting and input: the page "freezes".
- Microtasks run **before** the browser can paint. A never-ending chain of microtasks **starves** rendering and timers.

```js run title="Microtask starvation: the timer must wait for a million microtasks"
// DO NOT do this in a real page: with an endless chain, the timer would never run.
let count = 0;
function loop() {
  count++;
  if (count < 1_000_000) Promise.resolve().then(loop);       // each step queues the next microtask
  else console.log("microtask chain finished after", count, "steps");
}

setTimeout(() => console.log("timer finally ran"), 0);
loop();
```

The timer is ready after 0 ms, but it cannot run until the microtask queue is empty, and the chain keeps refilling it. We stop the chain after a million steps. With an endless chain, the timer, and in a browser also painting and clicks, would **never** run.

## Common beginner beliefs that are wrong

| Belief | Truth |
|---|---|
| "`setTimeout(fn, 100)` runs after exactly 100 ms" | It runs **no earlier than** 100 ms, when the stack is free |
| "A promise runs in the background" | The **executor** runs synchronously; only `.then` callbacks are async (microtasks) |
| "`async` makes a function run in another thread" | It runs on the same thread; `await` just pauses it |
| "The event loop is part of JavaScript" | It belongs to the **host** (browser or Node); the language only defines jobs and the promise job queue |

:::interview Explain the event loop.
"JavaScript has one call stack. Slow operations like timers, network and file I/O are handled by the browser or Node outside the stack. When they finish, their callbacks go into queues: promise callbacks into the microtask queue, and timer, I/O and event callbacks into the task queue. The event loop repeats: when the stack is empty it runs all microtasks until the microtask queue is empty, then takes one task from the task queue and runs it, and in a browser it may render. That is why synchronous code runs first, then promise callbacks, then timers, even for `setTimeout(fn, 0)`."
:::

## More interview questions on this topic

:::qa What is the call stack, the task queue and the microtask queue? {level=easy}
**Say this:** "The call stack runs the current code. The task queue holds callbacks from timers, events and I/O. The microtask queue holds promise callbacks and `queueMicrotask`, and has higher priority."

**In simple words:** The stack is the desk. The queues are the trays. Urgent tray first.
:::

:::qa In what order does the event loop run things? {level=medium}
**Say this:** "Run the script (sync code) until the stack is empty, then all microtasks, then one macrotask, then all microtasks again, and so on, rendering in between in browsers."

**In simple words:** Sync, then all urgent mail, then one normal mail, repeat.
:::

:::qa Is the event loop part of the JavaScript language? {level=hard}
**Say this:** "Not exactly. ECMAScript defines jobs and the job queue for promises, but the event loop with task queues, timers and rendering is defined by the HTML spec for browsers and implemented by libuv in Node."

**In simple words:** The language gives promises. The browser and Node give the loop.
:::

:::qa Why can an endless chain of promises freeze the page? {level=hard}
**Say this:** "The loop must empty the microtask queue before moving on. If each microtask queues another, the queue is never empty, so rendering, timers and input never get a turn."

**In simple words:** The urgent tray keeps refilling, so normal mail is never read.
:::

```quiz
? After the call stack is empty, what does the event loop run first?
- One task from the task queue
+ All microtasks
- The next timer
> Microtasks have priority.
? What is the output order of: sync log, setTimeout 0, Promise.then?
- timeout, promise, sync
+ sync, promise, timeout
- sync, timeout, promise
> Sync first, then the microtask, then the macrotask.
? Which does NOT go to the microtask queue?
- promise.then callback
- queueMicrotask callback
+ setTimeout callback
> Timers are macrotasks.
```

:::keypoints
- Parts: **call stack, Web/Node APIs, task queue, microtask queue, event loop**.
- Loop: **run sync → all microtasks → one task → (render) → repeat**.
- Microtasks: promise callbacks, `await` continuations, `queueMicrotask`. Tasks: timers, I/O, UI events.
- `setTimeout(fn, 0)` = "after the current code and all microtasks".
- An endless microtask chain **starves** rendering and timers.
:::
