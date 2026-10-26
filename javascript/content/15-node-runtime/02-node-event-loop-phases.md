---
title: The Node.js event loop: phases
level: advanced
time: 35
summary: The six phases of the libuv event loop (timers, pending, idle/prepare, poll, check, close), where setTimeout, setImmediate and I/O callbacks run, and where process.nextTick and promise microtasks fit between them.
---

## The browser loop vs the Node loop

In the browser you learned: **run a task, then all microtasks, then maybe render**. Node has no rendering, but it has a richer loop made of **phases**. Each phase has its own **queue of callbacks**. The loop visits the phases in a fixed order, over and over.

```viz algo=eventloop title="The phases of one loop iteration (step through them)"
phases: timers, pending, idle, poll, check, close
step | phase: timers | stack: - | macro: setTimeout cb | note: **Timers phase.** Runs callbacks of `setTimeout` and `setInterval` whose time has come.
step | phase: pending | macro: - | note: **Pending callbacks.** Some system-level callbacks deferred from the previous loop (e.g. certain TCP errors).
step | phase: idle | note: **Idle / prepare.** Used internally by libuv. You never write code for this phase.
step | phase: poll | apis: socket data, file read done | macro: I/O callback | note: **Poll phase.** The heart of the loop. Runs **I/O callbacks** (network, file reads) and **waits** here for new I/O if nothing else is scheduled.
step | phase: check | macro: setImmediate cb | note: **Check phase.** Runs **`setImmediate`** callbacks, right after poll.
step | phase: close | macro: socket.on('close') | note: **Close callbacks.** For example `socket.on("close", ...)`.
step | phase: timers | note: Then the loop starts again with the timers phase. If nothing is left to do, the process exits.
```

| # | Phase | What runs there |
|---|---|---|
| 1 | **timers** | `setTimeout` / `setInterval` callbacks that are due |
| 2 | **pending callbacks** | some deferred system callbacks |
| 3 | **idle, prepare** | internal use |
| 4 | **poll** | **I/O callbacks**; also **waits** for new I/O (blocks here if nothing else is due) |
| 5 | **check** | **`setImmediate`** callbacks |
| 6 | **close callbacks** | `close` events of sockets, handles |

**Between every callback** (since Node 11), Node runs the **`process.nextTick` queue** and then the **promise microtask queue**, until both are empty. So the "microtasks after every task" rule you know from the browser applies to every callback in every phase.

```
            ┌───────────────────────────┐
         ┌─>│          timers           │
         │  └─────────────┬─────────────┘
         │  ┌─────────────┴─────────────┐
         │  │     pending callbacks     │
         │  └─────────────┬─────────────┘
         │  ┌─────────────┴─────────────┐
         │  │       idle, prepare       │
         │  └─────────────┬─────────────┘      ┌───────────────┐
         │  ┌─────────────┴─────────────┐      │   incoming:   │
         │  │           poll            │<─────┤  connections, │
         │  └─────────────┬─────────────┘      │   data, etc.  │
         │  ┌─────────────┴─────────────┐      └───────────────┘
         │  │           check           │
         │  └─────────────┬─────────────┘
         │  ┌─────────────┴─────────────┐
         └──┤      close callbacks      │
            └───────────────────────────┘
      (after EACH callback: process.nextTick queue, then promise microtasks)
```

## How the loop decides how long to wait (poll)

In the **poll** phase:

1. If the poll queue has callbacks, run them (up to a limit).
2. If it is empty:
   - if `setImmediate` callbacks are scheduled, **move on** to the check phase;
   - otherwise, **wait** for I/O (but not longer than the earliest timer).
3. If there is nothing at all (no timers, no I/O, no handles), the process **exits**.

## `setTimeout` vs `setImmediate`

Both mean "soon", but they run in **different phases**.

```js run node title="Inside an I/O callback, setImmediate ALWAYS comes first"
const fs = require("node:fs");

fs.readFile(process.argv[1], () => {                                 // any file: we are now in the poll phase
  setTimeout(() => console.log("timeout"), 0);
  setImmediate(() => console.log("immediate"));                      // the check phase comes right after poll
});
```

The order is **always** `immediate`, then `timeout`: after poll comes **check**, while the timer must wait for the **next loop** iteration.

From the **main module** (not in an I/O callback), the order is **not guaranteed**: it depends on how fast the process starts (the 1 ms timer may or may not be due when the loop begins).

```js run node title="From the main script: the order can vary" nondet
const order = [];
setTimeout(() => order.push("timeout"), 0);
setImmediate(() => order.push("immediate"));
setTimeout(() => console.log("order this time:", order.join(" then ")), 20);
```

| | `setTimeout(fn, 0)` | `setImmediate(fn)` |
|---|---|---|
| Phase | timers | check |
| Min delay | about 1 ms | none: right after poll |
| In an I/O callback | after `setImmediate` | **first** |
| Use for | "later, after a delay" | "right after the current I/O" |

## `process.nextTick` and promises relative to phases

```js run cjs node title="CommonJS file: sync, nextTick, promises, then the loop phases"
const fs = require("node:fs");

fs.readFile(process.argv[1], () => {                               // an I/O callback (poll phase)
  setTimeout(() => console.log("7 timeout (next loop, timers phase)"), 0);
  setImmediate(() => console.log("6 immediate (check phase, same loop)"));
  Promise.resolve().then(() => console.log("5b promise inside the I/O callback"));
  process.nextTick(() => console.log("5a nextTick inside the I/O callback"));
});

Promise.resolve().then(() => console.log("4 promise (microtask)"));
process.nextTick(() => console.log("3 nextTick"));
console.log("1 sync A");
queueMicrotask(() => console.log("4b queueMicrotask"));
console.log("2 sync B");
```

Order: sync code first. Then the **`nextTick`** queue, then the **promise microtasks** (in the order queued). Later, in the I/O callback: again nextTick and promises first (right after that callback), then `setImmediate` (check phase), then the timeout (next loop).

**A famous gotcha:** in an **ES module** the order of `nextTick` and promises **flips**, because the module itself is evaluated inside a promise job, so the microtask queue is drained first:

```js run esm node title="ES module file: promises BEFORE nextTick"
Promise.resolve().then(() => console.log("promise (microtask)"));
process.nextTick(() => console.log("nextTick"));
console.log("sync");
```

In a CommonJS file (and in callbacks inside either kind of file) `nextTick` comes first. Always say which module system you are talking about in an interview.

The next lesson covers the nextTick/promise rules and the **starvation** problem in detail.

## What keeps the process alive?

Node exits when the loop has **nothing left to wait for**: no pending timers, no open sockets or servers, no active handles or child processes. That is why a `setInterval` or an open server keeps your script running.

```js run node title="unref(): a timer that does not keep the process alive"
const t = setInterval(() => console.log("never printed"), 1000);
t.unref();                                      // do not let this timer keep Node running
setTimeout(() => console.log("the only real work; then the process exits"), 20);
console.log(typeof t.ref, typeof t.hasRef, t.hasRef());
```

## Phases and real performance tips

- A **slow callback in any phase** blocks the whole loop. Keep callbacks short.
- Use **`setImmediate`** to **yield** to I/O between chunks of CPU work. (`process.nextTick` would starve I/O.)
- **Do not** nest endless `nextTick`/microtask chains.
- Heavy callbacks in the **timers phase** delay everything after them, because timers cannot interrupt a running callback.

:::interview Explain the phases of the Node.js event loop. Where do setTimeout, setImmediate, nextTick and promises run?
"The libuv loop cycles through phases: timers, pending callbacks, idle/prepare, poll, check and close callbacks. `setTimeout` and `setInterval` callbacks run in the timers phase; I/O callbacks and waiting for new I/O happen in the poll phase; `setImmediate` runs in the check phase right after poll; close handlers run last. After every callback, Node drains the `process.nextTick` queue first and then the promise microtask queue. So inside an I/O callback, `setImmediate` always runs before `setTimeout 0`, while from the main module the order of those two is not guaranteed. The process exits when no timers, handles or I/O remain."
:::

## More interview questions on this topic

:::qa What is the poll phase and why is it important? {level=medium}
**Say this:** "It runs I/O callbacks and, if nothing else is due, it blocks waiting for new I/O events (up to the next timer). It is where a server spends most of its idle time."

**In simple words:** The loop waits there for mail to arrive.
:::

:::qa Why does `setImmediate` always run before `setTimeout(0)` inside an I/O callback? {level=hard}
**Say this:** "After the poll phase (where I/O callbacks run) the next phase is check, where setImmediate runs; the timer would run only in the timers phase of the next iteration."

**In simple words:** The check phase is the next stop. The timers are the stop after the whole circle.
:::

:::qa What keeps a Node process alive? {level=easy}
**Say this:** "Active handles and requests: timers, open servers and sockets, child processes, pending I/O. When there are none, the loop ends and the process exits. `timer.unref()` removes a timer from that count."

**In simple words:** The program stays until nothing is waiting.
:::

:::qa How do microtasks interact with the phases? {level=medium}
**Say this:** "After each individual callback (since Node 11), the nextTick queue and then the promise microtask queue are fully drained before the next callback or phase."

**In simple words:** Urgent mail is read after every single letter, not only at the end of the day.
:::

```quiz
? In which phase do setImmediate callbacks run?
- timers
- poll
+ check
> The check phase follows poll.
? Inside an fs.readFile callback, what runs first: setTimeout(0) or setImmediate?
- setTimeout
+ setImmediate
- It is random
> Check comes right after poll.
? What runs first after the current callback: process.nextTick or promise microtasks?
- Promise microtasks
+ process.nextTick queue
- They alternate
> nextTick has a higher priority.
```

:::keypoints
- Phases: **timers → pending → idle/prepare → poll → check → close**.
- `setTimeout`/`setInterval` in **timers**; I/O callbacks in **poll**; `setImmediate` in **check**.
- After **every callback**: drain **`process.nextTick`**, then **promise microtasks**.
- In an I/O callback: `setImmediate` first. From the main module: `timeout` vs `immediate` order is not guaranteed.
- The process exits when no handles/timers/I/O remain (`unref()` detaches a timer).
:::
