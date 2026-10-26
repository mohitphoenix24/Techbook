---
title: Timers in depth: setTimeout, setInterval and friends
level: intermediate
time: 25
summary: What a delay really guarantees, why setInterval drifts, how to write a self-correcting timer, clearing timers safely, the 4 ms rule, background-tab throttling and when to use requestAnimationFrame instead.
---

## `setTimeout(fn, delay)`

`setTimeout` schedules `fn` to run **no earlier than `delay` ms** from now, when the stack is free. It returns an **id** (in browsers a number; in Node a `Timeout` object) that you can pass to `clearTimeout`.

```js run title="The delay is a minimum"
const start = Date.now();

setTimeout(() => {
  const elapsed = Date.now() - start;
  console.log("asked for 50 ms, waited at least 50:", elapsed >= 49);   // allow 1 ms clock rounding
}, 50);
```

If the thread is busy, the callback runs later. It is **never earlier**.

```js run title="A busy thread delays the timer"
const start = Date.now();

setTimeout(() => {
  console.log("timer asked for 10 ms, ran after at least 100 ms:", Date.now() - start >= 100);
}, 10);

while (Date.now() - start < 100) { /* busy */ }
```

## Passing arguments and `this`

```js run title="Extra arguments to the callback"
setTimeout((a, b) => console.log("args:", a, b), 10, "x", "y");

const obj = {
  name: "obj",
  later() {
    setTimeout(() => console.log("arrow keeps this:", this.name), 0);
    setTimeout(function () { console.log("normal function this is not obj:", this === obj); }, 0);
  },
};
obj.later();
```

(See the this lessons: a normal function callback loses `this`.)

## Clearing timers

```js run title="clearTimeout and clearInterval"
const id = setTimeout(() => console.log("never runs"), 20);
clearTimeout(id);

let ticks = 0;
const interval = setInterval(() => {
  ticks++;
  console.log("tick", ticks);
  if (ticks === 3) clearInterval(interval);       // stop it from inside
}, 10);
```

**Always keep the id and clear timers** you no longer need (for example in a React cleanup function). An uncleared `setInterval` keeps running forever and holds its closure in memory. In Node, an active timer also keeps the **process alive** (use `timer.unref()` to prevent that).

## `setInterval` drift, and the self-correcting timer

`setInterval(fn, 1000)` does not guarantee exactly one second between calls. If a callback is slow, or the thread is busy, ticks are late, and **errors add up** (drift). Also, if the callback takes longer than the interval, calls can bunch up.

A common fix is a **recursive `setTimeout`**, which waits for the callback to finish and **adjusts** the next delay:

```js run title="A self-correcting timer"
function accurateInterval(fn, ms, count) {
  let expected = Date.now() + ms;
  let n = 0;
  const drifts = [];
  function step() {
    const drift = Date.now() - expected;             // how late are we?
    drifts.push(drift);
    fn(++n);
    if (n >= count) return console.log("no tick was more than 100 ms late:", drifts.every((d) => d < 100));
    expected += ms;
    setTimeout(step, Math.max(0, ms - drift));       // shorten the next wait by the lateness
  }
  setTimeout(step, ms);
}

accurateInterval((n) => console.log("tick", n), 20, 5);
```

## Recursive `setTimeout` vs `setInterval`

| | `setInterval(fn, ms)` | recursive `setTimeout(fn, ms)` |
|---|---|---|
| Starts next wait... | at fixed times, regardless of the callback's duration | **after** the callback ends |
| If callback is slow | Calls can pile up or be skipped | The gap grows, but never overlaps |
| Good for | Clocks, simple repeating | Polling, retries, back-off (change `ms` each time) |

```js run title="Polling with a recursive setTimeout (no overlap)"
let polls = 0;
function poll() {
  polls++;
  console.log("poll", polls);
  if (polls < 3) setTimeout(poll, 10 * polls);       // growing delay: simple back-off
}
poll();
```

## The minimum delay and nesting

- Browsers clamp nested timers (5 levels deep) to a minimum of **4 ms**.
- In **background tabs**, timers are throttled to about **1 s** (or more) to save battery.
- Node: the minimum is **1 ms** (`setTimeout(fn, 0)` is treated as 1).
- The delay is converted to a 32-bit integer: anything above about **24.8 days** (2,147,483,647 ms) fires immediately.

```js run title="Delay limits"
const t0 = Date.now();
setTimeout(() => console.log("huge delay fires at once?", Date.now() - t0 < 100), 2 ** 31);   // overflow: treated as 1 ms (Node warns)
```

## Timers are not for precise animation

For visual updates use **`requestAnimationFrame`** (browser). It is called **before each repaint** (usually 60 times per second), pauses in background tabs, and gives a high-resolution timestamp.

```js
function animate(timestamp) {
  moveBox(timestamp);
  requestAnimationFrame(animate);          // schedule the next frame
}
requestAnimationFrame(animate);
```

Use the timestamp, not a fixed step, so animation speed does not depend on frame rate.

## Other timing APIs

| API | Where | Use |
|---|---|---|
| `setImmediate(fn)` | Node | Run after the current poll phase (check phase) |
| `process.nextTick(fn)` | Node | Run before promises, right after the current operation |
| `queueMicrotask(fn)` | Both | Run as a microtask |
| `requestAnimationFrame(fn)` | Browser | Before the next paint |
| `requestIdleCallback(fn)` | Browser | When the browser is idle |
| `scheduler.postTask(fn, {priority})` | Modern browsers | Prioritised tasks |
| `timers/promises` | Node | `await setTimeout(ms)` without callbacks |

```js run title="await a timer: a tiny sleep helper"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log("before");
  await sleep(50);
  console.log("after 50 ms");
})();
```

:::interview Is setTimeout accurate? What is the difference between setTimeout and setInterval?
"The delay is a minimum, not a guarantee: the callback goes into the task queue when the timer expires and runs when the stack is free, so a busy thread, other timers, and clamping (4 ms for nested timers, throttling in background tabs) all add delay. `setInterval` schedules repeatedly at fixed times, and can drift or bunch up if callbacks are slow; a recursive `setTimeout` waits for the callback and lets me adjust the next delay, which is better for polling and back-off. For animation I use `requestAnimationFrame`. I always clear timers I no longer need."
:::

## More interview questions on this topic

:::qa What happens if a `setInterval` callback takes longer than the interval? {level=medium}
**Say this:** "The browser does not start overlapping calls of the same interval. Ticks that were due while the callback ran are queued late or coalesced, so the callback runs back to back, and timing drifts."

**In simple words:** The clock keeps ticking, but your callback cannot keep up.
:::

:::qa Why prefer `requestAnimationFrame` over `setInterval` for animations? {level=medium}
**Say this:** "`requestAnimationFrame` is synchronised with the display refresh, runs just before paint, pauses in hidden tabs, and gives a precise timestamp, so animations are smooth and efficient."

**In simple words:** It runs exactly when the screen is ready to draw.
:::

:::qa How do you stop a timer? Why is it important? {level=easy}
**Say this:** "Save the id and call `clearTimeout(id)` or `clearInterval(id)`. Forgetting leaks memory through the closure, keeps work running and, in Node, can keep the process alive."

**In simple words:** An uncleared timer keeps working forever.
:::

:::qa What is the maximum delay for `setTimeout`? {level=hard}
**Say this:** "About 2³¹−1 ms (roughly 24.8 days). A larger value overflows and the timer fires almost immediately."

**In simple words:** The delay is stored in a 32-bit signed integer.
:::

```quiz
? What does setTimeout(fn, 100) guarantee?
- fn runs after exactly 100 ms
+ fn runs no earlier than 100 ms, when the stack is free
- fn runs in a separate thread
> It is a minimum, not an exact time.
? Which is better for polling where each request must finish before the next?
- setInterval
+ a recursive setTimeout
- requestAnimationFrame
> It waits for the callback, so calls never overlap.
? Which API is best for visual animations in the browser?
- setTimeout(fn, 16)
+ requestAnimationFrame
- setImmediate
> It is synchronised with painting.
```

:::keypoints
- `setTimeout` delay is a **minimum**. Busy threads, nesting (4 ms) and background tabs add delay.
- **Clear** timers (`clearTimeout`/`clearInterval`) to avoid leaks.
- `setInterval` drifts; use **recursive `setTimeout`** for polling and back-off.
- `requestAnimationFrame` for animation. `process.nextTick`/`setImmediate` are Node-only.
- Max delay ≈ 24.8 days (2³¹−1 ms).
:::
