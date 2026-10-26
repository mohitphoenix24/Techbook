---
title: Implement debounce
level: easy
time: 20
summary: Write debounce(fn, wait) with the correct this and arguments, then add cancel, flush and a leading option. The most asked JavaScript utility in interviews.
---

:::problem Implement debounce {level=easy tags="closures,timers,this"}
Write `debounce(fn, wait)` that returns a function. When the returned function is called repeatedly, `fn` runs **only once**, `wait` ms after the **last** call, with the **arguments and `this` of the last call**.

Then extend it:

1. `debounced.cancel()` drops a pending call.
2. `debounced.flush()` runs the pending call immediately.
3. An option `{ leading: true }` also calls `fn` immediately on the first call of a burst.

```js
const log = debounce((x) => console.log("saved", x), 100);
log(1); log(2); log(3);        // only "saved 3" is printed, 100 ms after the last call
```

:::hint Hint
You need one variable that lives **between calls**: the timer id. Each call clears the previous timer and starts a new one. Keep the latest arguments and `this` in variables too.
:::
:::

## Think first

- State that lives between calls ⇒ a **closure**.
- "Last call wins" ⇒ clear the old timer on every call.
- `this` and arguments ⇒ use a normal `function` (not an arrow) for the returned function, and `fn.apply(this, args)`.

## Solution and tests

```js run title="Solution (with tests that run against it)"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function debounce(fn, wait, { leading = false } = {}) {
  let timer = null;
  let lastArgs, lastThis;

  function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    const startOfBurst = timer === null;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) { const a = lastArgs, t = lastThis; lastArgs = lastThis = undefined; fn.apply(t, a); }   // trailing call
    }, wait);
    if (leading && startOfBurst) {                                                                          // leading call
      const a = lastArgs, t = lastThis;
      lastArgs = lastThis = undefined;                                                                      // do not repeat it as a trailing call
      fn.apply(t, a);
    }
  }
  debounced.cancel = () => { clearTimeout(timer); timer = null; lastArgs = lastThis = undefined; };
  debounced.flush = () => {
    if (timer === null) return;
    clearTimeout(timer); timer = null;
    if (lastArgs) { const a = lastArgs, t = lastThis; lastArgs = lastThis = undefined; fn.apply(t, a); }
  };
  return debounced;
}

// ---------------- tests ----------------
await test("calls once with the last arguments", async () => {
  const calls = [];
  const d = debounce((x) => calls.push(x), 60);
  d(1); d(2); d(3);
  await sleep(150);
  assert.deepEqual(calls, [3]);
});

await test("separate bursts call separately", async () => {
  const calls = [];
  const d = debounce((x) => calls.push(x), 40);
  d("a"); await sleep(120); d("b"); await sleep(120);
  assert.deepEqual(calls, ["a", "b"]);
});

await test("keeps this", async () => {
  const obj = { name: "obj", got: null, method: debounce(function () { this.got = this.name; }, 30) };
  obj.method();
  await sleep(100);
  assert.equal(obj.got, "obj");
});

await test("cancel drops the pending call", async () => {
  const calls = [];
  const d = debounce(() => calls.push("x"), 40);
  d(); d.cancel();
  await sleep(100);
  assert.deepEqual(calls, []);
});

await test("flush runs it now", async () => {
  const calls = [];
  const d = debounce((x) => calls.push(x), 500);
  d("now"); d.flush();
  assert.deepEqual(calls, ["now"]);
  await sleep(20);
  assert.equal(calls.length, 1);
});

await test("leading: first call is immediate, trailing only if more calls came", async () => {
  const calls = [];
  const d = debounce((x) => calls.push(x), 50, { leading: true });
  d(1);
  assert.deepEqual(calls, [1]);
  d(2); d(3);
  await sleep(150);
  assert.deepEqual(calls, [1, 3]);
});
```

## Edge cases to mention

- `wait = 0` still defers to the next macrotask.
- The **returned function returns `undefined`** (the call is deferred). Lodash returns the last result; explain why that is rarely useful.
- **Memory:** the closure holds the last arguments until the timer fires: call `cancel()` on unmount.
- **Max wait:** lodash's `maxWait` guarantees a call at least every N ms during a long burst (add a second timer).
- **React:** create the debounced function once (`useMemo`/`useRef`) and `cancel` it in the effect cleanup.

:::qa Why must the returned function be a normal function and not an arrow function? {level=medium}
**Say this:** "Because it needs its own `this`, the object it is called on, so it can forward it with `fn.apply(this, args)`. An arrow function would capture the `this` of `debounce` itself."

**In simple words:** The debounced function should behave like the method it replaces.
:::

:::qa How is debounce different from throttle? {level=easy}
**Say this:** "Debounce waits for a pause and calls once at the end; throttle calls at a steady maximum rate during continuous activity."

**In simple words:** Wait until you stop, or at most once every X ms.
:::

:::keypoints
- State between calls (timer, last args, last `this`) lives in a **closure**.
- Each call **clears and restarts** the timer; the last call wins.
- Use a **normal function** and `fn.apply(this, args)`; add **cancel** and **flush**; **leading** calls need care to avoid a double call.
:::
