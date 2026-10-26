---
title: Throttle
level: intermediate
time: 25
summary: What throttle does (at most one call per interval), two implementations (timestamp and timer), leading and trailing calls, requestAnimationFrame throttling, real uses (scroll, mousemove, API limits) and a comparison with debounce.
---

## The idea

> "**Throttle** lets a function run **at most once in every interval**, no matter how many times it is triggered."

:::analogy A turnstile at a metro station
It lets one person through every few seconds. A crowd pushing does not make it faster. People pass at a steady rate.
:::

A `scroll` event can fire **60 to 120 times per second**. Running heavy code (layout reads, analytics, a position calculation) on every event makes the page janky. With a 100 ms throttle the handler runs **at most 10 times per second**, evenly spaced.

```viz algo=timeline title="Events every 20 ms, throttled to one call per 100 ms"
scale: 0-420 ms
dot events | 0 | 
dot events | 20 | 
dot events | 40 | 
dot events | 60 | 
dot events | 80 | 
dot events | 100 | 
dot events | 120 | 
dot events | 140 | 
dot events | 160 | 
dot events | 180 | 
dot events | 200 | 
lane calls | 0-12 | call | ok
lane calls | 100-112 | call | ok
lane calls | 200-212 | call | ok
mark 100 | next allowed call
```

## Implementation 1: timestamps

Remember when the function **last ran**. If less than `wait` ms have passed, ignore the call.

```js run title="throttle with a timestamp (leading edge only)"
function throttle(fn, wait) {
  let last = 0;
  return function throttled(...args) {
    const now = Date.now();
    if (now - last >= wait) {                    // enough time has passed since the last run
      last = now;
      return fn.apply(this, args);
    }
  };
}

const calls = [];
const onScroll = throttle((y) => calls.push(y), 100);

// scroll events every 40 ms for 480 ms
for (let i = 0; i <= 12; i++) setTimeout(() => onScroll(i * 40), i * 40);

setTimeout(() => console.log("handler ran for scroll positions:", calls), 400);
```

Problem: with this version the **last event** of a burst can be **lost** (if it arrives within the wait period). For a scroll handler, the final position matters. That is why we often add a **trailing call**.

## Implementation 2: leading and trailing with a timer

```js run title="throttle with leading + trailing, cancel"
function throttle(fn, wait, { leading = true, trailing = true } = {}) {
  let timerId = null, lastArgs, lastThis, lastCall = 0;

  function invoke(time) {
    lastCall = time;
    const args = lastArgs, ctx = lastThis;
    lastArgs = lastThis = undefined;
    fn.apply(ctx, args);
  }

  function throttled(...args) {
    const now = Date.now();
    if (!lastCall && !leading) lastCall = now;               // skip the leading call
    const remaining = wait - (now - lastCall);
    lastArgs = args;
    lastThis = this;

    if (remaining <= 0 || remaining > wait) {                // time is up: run now
      clearTimeout(timerId);
      timerId = null;
      invoke(now);
    } else if (!timerId && trailing) {                       // otherwise schedule the trailing call
      timerId = setTimeout(() => {
        timerId = null;
        if (lastArgs) invoke(leading ? Date.now() : 0);
      }, remaining);
    }
  }

  throttled.cancel = () => { clearTimeout(timerId); timerId = null; lastArgs = lastThis = undefined; lastCall = 0; };
  return throttled;
}

const calls = [];
const handler = throttle((y) => calls.push(y), 100);

// burst 1: ten events in a row, all within the same millisecond
for (let i = 0; i < 10; i++) handler("a" + i);
// burst 2: three events, 300 ms later
setTimeout(() => { handler("b0"); handler("b1"); handler("b2"); }, 300);

setTimeout(() => console.log("handled:", calls), 700);
```

Each burst gives the **first** event immediately (leading) **and** one call with the **latest** value when the interval ends (trailing). The ten events of the first burst become just two calls: `a0` and `a9`. Events in between are dropped, and the last one is never lost.

## Throttle with `requestAnimationFrame`

For visual updates, throttle to **one call per frame** (about 16 ms), not to a fixed number of milliseconds:

```js
function rafThrottle(fn) {
  let scheduled = false, lastArgs;
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;                      // already scheduled for the next frame
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; fn(...lastArgs); });
  };
}

window.addEventListener("mousemove", rafThrottle((e) => moveTooltip(e.clientX, e.clientY)));
```

Also: **passive event listeners** (`addEventListener("scroll", fn, { passive: true })`) tell the browser the handler will not call `preventDefault`, so scrolling stays smooth.

## Debounce vs throttle

| | **Debounce** | **Throttle** |
|---|---|---|
| Rule | Run **after** events stop for X ms | Run **at most once** per X ms **while** events continue |
| During a burst of 100 events | 1 call (at the end) | about 1 per interval |
| Latest value? | Yes, at the end | Yes, if a trailing call is used |
| Good for | search box, resize end, autosave, validation | scroll, mousemove, drag, window resize (live), rate limiting, game input |
| Risk | long delay if events never stop | may skip intermediate values |

```js run title="Same events, two behaviours"
function debounce(fn, w) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), w); }; }
function throttle(fn, w) { let last = 0; return (...a) => { const n = Date.now(); if (n - last >= w) { last = n; fn(...a); } }; }

const d = [], t = [];
const dbn = debounce((i) => d.push(i), 100);
const thr = throttle((i) => t.push(i), 100);
for (let i = 0; i < 12; i++) setTimeout(() => { dbn(i); thr(i); }, i * 40);       // 12 events over 440 ms

setTimeout(() => console.log("debounce:", d, "| throttle:", t), 800);
```

## Real-world uses

- **Scroll** handlers: sticky headers, parallax, infinite scroll ("load more" check), analytics scroll depth.
- **`mousemove` / drag**: tooltips, drawing, drag and drop.
- **Window `resize`** while dragging: recalculate layout at a steady pace.
- **API rate limits**: do not call a service more than N times per second.
- **Game or UI input**: limit fire rate of a button or key.
- **Rate limiting on the server**: a different but related idea (token bucket, sliding window).

:::interview What is throttling? How is it different from debouncing? Implement it.
"Throttling guarantees a function runs at most once per interval while events keep arriving, so a stream of events becomes a steady rate of calls. A simple version stores the timestamp of the last call and ignores calls that come too soon; a better version also schedules a trailing call so the final event is not lost. Debounce waits for the events to stop and then runs once at the end. I throttle scroll, mousemove and live resize handlers, ideally with requestAnimationFrame for visual work and passive listeners, and I debounce search input, autosave and validation."
:::

## More interview questions on this topic

:::qa When would you choose throttle over debounce? {level=easy}
**Say this:** "When I want regular updates during continuous activity, like scroll position, dragging or live resizing, not just one update at the end."

**In simple words:** Throttle for "keep me updated", debounce for "tell me when done".
:::

:::qa What is the problem with the simple timestamp throttle? {level=medium}
**Say this:** "The last event in a burst can be dropped if it comes before the interval ends, so the final state may never be handled. Add a trailing call."

**In simple words:** The final scroll position might be missed.
:::

:::qa How does `requestAnimationFrame` help throttle? {level=medium}
**Say this:** "It runs the callback once before each repaint, so visual updates are limited to the display refresh rate, and it pauses in background tabs."

**In simple words:** Update when the screen is ready to draw.
:::

:::qa What are passive event listeners? {level=hard}
**Say this:** "Listeners registered with `{ passive: true }` promise not to call `preventDefault`, so the browser can scroll immediately without waiting for the handler. Used for touch and wheel events."

**In simple words:** "I will not block scrolling," so the browser does not wait.
:::

```quiz
? A throttle of 100 ms receives events every 10 ms for 1 second. About how many calls?
- 100
+ About 10
- 1
> One per interval.
? What keeps the latest event from being lost in throttle?
- A larger wait
+ A trailing call
- clearTimeout
> The trailing call uses the last arguments.
? Which is best for a scroll position handler?
- debounce 500 ms
+ throttle, often with requestAnimationFrame
- setTimeout 0
> Steady updates while scrolling.
```

:::keypoints
- **Throttle**: at most **one call per interval** during continuous events. **Debounce**: one call after events **stop**.
- Implementation: timestamp (leading only) or timer (leading + trailing, `cancel`).
- For visual updates use **`requestAnimationFrame`**; add **`{ passive: true }`** to scroll/touch listeners.
- Uses: scroll, mousemove, drag, live resize, API limits.
:::
