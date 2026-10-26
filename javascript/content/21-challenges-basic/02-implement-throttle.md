---
title: Implement throttle
level: easy
time: 20
summary: Write throttle(fn, wait) that runs at most once per interval, with leading and trailing calls so the last value is never lost.
---

:::problem Implement throttle {level=easy tags="closures,timers,rate limiting"}
Write `throttle(fn, wait)`. While the returned function keeps being called, `fn` must run **at most once every `wait` ms**.

- The **first** call runs immediately (**leading**).
- If more calls arrive during the wait, the **last** one runs when the wait is over (**trailing**), so the final value is not lost.
- Calls use the arguments and `this` of the call that actually runs.

```js
const onScroll = throttle((y) => console.log(y), 100);
// 10 calls within 100 ms  ->  runs for the 1st call, then once more with the 10th call
```

:::hint Hint
Remember **when `fn` last ran**. If enough time has passed, run now. If not, schedule one trailing call for the remaining time and keep only the latest arguments.
:::
:::

## Solution and tests

```js run title="Solution (with tests that run against it)"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function throttle(fn, wait) {
  let lastRun = -Infinity;
  let timer = null;
  let pendingArgs, pendingThis;

  function invoke() {
    lastRun = Date.now();
    const args = pendingArgs, ctx = pendingThis;
    pendingArgs = pendingThis = undefined;
    fn.apply(ctx, args);
  }

  function throttled(...args) {
    pendingArgs = args;
    pendingThis = this;
    const remaining = wait - (Date.now() - lastRun);
    if (remaining <= 0) {                           // the interval is over: run now
      clearTimeout(timer);
      timer = null;
      invoke();
    } else if (timer === null) {                    // inside the interval: schedule ONE trailing call
      timer = setTimeout(() => { timer = null; if (pendingArgs) invoke(); }, remaining);
    }                                               // (further calls just replace pendingArgs)
  }
  throttled.cancel = () => { clearTimeout(timer); timer = null; pendingArgs = pendingThis = undefined; };
  return throttled;
}

// ---------------- tests ----------------
await test("a burst gives the first call and the last call", async () => {
  const calls = [];
  const t = throttle((x) => calls.push(x), 80);
  for (let i = 1; i <= 10; i++) t(i);
  await sleep(200);
  assert.deepEqual(calls, [1, 10]);
});

await test("a call after the interval runs immediately", async () => {
  const calls = [];
  const t = throttle((x) => calls.push(x), 50);
  t("a");
  await sleep(120);
  t("b");
  assert.deepEqual(calls, ["a", "b"]);
});

await test("only one call in a single call", async () => {
  const calls = [];
  const t = throttle((x) => calls.push(x), 50);
  t("only");
  await sleep(150);
  assert.deepEqual(calls, ["only"]);
});

await test("this is preserved", async () => {
  const obj = { v: 7, out: null, m: throttle(function () { this.out = this.v; }, 20) };
  obj.m();
  assert.equal(obj.out, 7);
});

await test("cancel removes the trailing call", async () => {
  const calls = [];
  const t = throttle((x) => calls.push(x), 80);
  t(1); t(2);
  t.cancel();
  await sleep(160);
  assert.deepEqual(calls, [1]);
});
```

## Variants interviewers ask

| Variant | Change |
|---|---|
| **Leading only** | do not schedule the trailing timer |
| **Trailing only** | never invoke immediately, always wait for the timer |
| **requestAnimationFrame throttle** | schedule `fn` with `requestAnimationFrame` once per frame |
| **Throttle by count** (at most N calls per second) | a token bucket / sliding window instead of a timestamp |

:::qa What goes wrong with a throttle that only uses `Date.now()` and ignores the trailing call? {level=medium}
**Say this:** "The last event in a burst can be dropped if it arrives inside the interval, so the final state (like the final scroll position) may never be handled. A trailing call fixes that."

**In simple words:** The very last scroll position would be lost.
:::

:::qa Why do we keep `pendingArgs` instead of the first call's arguments? {level=medium}
**Say this:** "The trailing call should reflect the **latest** event, so each call overwrites the pending arguments; the timer is created only once per interval."

**In simple words:** Use the newest information when you finally act.
:::

:::keypoints
- Throttle = **max one call per interval**; remember the **last run time** and schedule **one trailing call**.
- Update the **pending arguments** on every call; create the timer only if none exists.
- Add **`cancel`**; for visuals prefer **`requestAnimationFrame`**.
:::
