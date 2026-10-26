---
title: Implement promisify and callbackify
level: medium
time: 25
summary: Convert Node-style callback functions to promises and back. Handle this, multiple results, custom promisify symbols and the Zalgo problem.
---

:::problem Implement promisify {level=medium tags="promises,callbacks,node"}
Many old Node APIs use the **error-first callback**: `fn(arg1, arg2, (err, result) => {...})`.

1. Write `promisify(fn)` that returns a function giving a promise: it rejects with `err`, or fulfils with `result`.
2. It must keep **`this`** (for methods).
3. If the callback gets **several results** (`cb(null, a, b)`), fulfil with an **array** only when asked (`promisify(fn, { multiArgs: true })`).
4. Write `callbackify(asyncFn)`, the reverse.
5. Explain how to make sure the callback is **never called twice**.

```js
const readFileP = promisify(fs.readFile);
const text = await readFileP("a.txt", "utf8");
```

:::hint Hint
The promise executor creates the callback for you and appends it as the **last** argument. Then call the original with `this`.
:::
:::

## Solution and tests

```js run title="promisify and callbackify, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

function promisify(fn, { multiArgs = false } = {}) {
  if (typeof fn !== "function") throw new TypeError("fn must be a function");
  return function (...args) {
    return new Promise((resolve, reject) => {
      fn.call(this, ...args, (err, ...results) => {          // our callback goes LAST
        if (err) return reject(err);
        resolve(multiArgs ? results : results[0]);
      });
    });                                                      // a throw inside fn also rejects (the executor catches it)
  };
}

function callbackify(asyncFn) {
  return function (...args) {
    const cb = args.pop();
    if (typeof cb !== "function") throw new TypeError("The last argument must be a callback");
    asyncFn.apply(this, args).then(
      (value) => queueMicrotask(() => cb(null, value)),      // not inside this promise chain: a throw in cb must not become a rejection
      (err) => queueMicrotask(() => cb(err || new Error("Promise was rejected with a falsy value"))),
    );
  };
}

// ---------------- tests ----------------
// a classic callback API for the demo
const divide = (a, b, cb) => setTimeout(() => (b === 0 ? cb(new Error("divide by zero")) : cb(null, a / b)), 5);

await test("success gives the result", async () => assert.equal(await promisify(divide)(10, 2), 5));
await test("error rejects", async () => await assert.rejects(promisify(divide)(1, 0), /divide by zero/));

await test("this is kept for methods", async () => {
  const counter = {
    n: 10,
    addLater(x, cb) { setTimeout(() => cb(null, this.n + x), 1); },
  };
  counter.addLaterP = promisify(counter.addLater);
  assert.equal(await counter.addLaterP(5), 15);
});

await test("a synchronous throw becomes a rejection", async () => {
  const bad = () => { throw new Error("sync boom"); };
  await assert.rejects(promisify(bad)(), /sync boom/);
});

await test("multiple results with multiArgs", async () => {
  const two = (cb) => cb(null, "a", "b");
  assert.equal(await promisify(two)(), "a");
  assert.deepEqual(await promisify(two, { multiArgs: true })(), ["a", "b"]);
});

await test("the extra arguments are passed through", async () => {
  const echo = (...all) => all.at(-1)(null, all.slice(0, -1).join("|"));
  assert.equal(await promisify(echo)("x", "y", "z"), "x|y|z");
});

await test("callbackify success and error", async () => {
  const double = callbackify(async (n) => n * 2);
  const fail = callbackify(async () => { throw new Error("nope"); });
  const r1 = await new Promise((res) => double(21, (err, v) => res([err, v])));
  const r2 = await new Promise((res) => fail((err, v) => res([err.message, v])));
  assert.deepEqual(r1, [null, 42]);
  assert.deepEqual(r2, ["nope", undefined]);
});

await test("callbackify: falsy rejection reasons still produce an error", async () => {
  const f = callbackify(async () => { throw null; });
  const err = await new Promise((res) => f((e) => res(e)));
  assert.ok(err instanceof Error);
});

await test("round trip", async () => {
  const roundTrip = promisify(callbackify(async (x) => x + 1));
  assert.equal(await roundTrip(1), 2);
});

await test("a callback called twice only counts the first call", async () => {
  const noisy = (cb) => { cb(null, "first"); cb(null, "second"); cb(new Error("late")); };
  assert.equal(await promisify(noisy)(), "first");         // a promise settles once; later calls are ignored (silently)
});
```

## What Node gives you

```js
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";     // many core APIs now have promise versions: prefer these
```

- `util.promisify` also honours a custom `fn[util.promisify.custom]`, which is how `setTimeout` becomes `await sleep(ms)`.
- `events.once(emitter, "event")` turns an event into a promise.

:::qa Why is the callback appended as the last argument? {level=easy}
**Say this:** "It is the convention for Node's error-first callbacks: arguments first, callback last. `promisify` only works for functions that follow that rule."

**In simple words:** The function expects the callback at the end.
:::

:::qa What is the 'Zalgo' problem? {level=hard}
**Say this:** "A function that calls its callback synchronously sometimes (for example, from a cache) and asynchronously other times (when it does I/O) makes the order of code unpredictable. Always be consistently async; promises enforce this, which is one reason to prefer them."

**In simple words:** A callback that is sometimes early and sometimes late causes odd bugs.
:::

:::qa Why does `callbackify` call `cb` through `queueMicrotask`? {level=hard}
**Say this:** "If `cb` threw inside the `.then(...)` handler, the error would be turned into a rejected promise that nobody handles. Moving the call out of the chain means a throw surfaces as a normal uncaught exception, the same as with a callback API."

**In simple words:** Errors in the user's callback should not be swallowed by the promise.
:::

:::keypoints
- `promisify`: in a `new Promise`, call the original with your **callback last**; `err` → reject, else resolve.
- Keep **`this`** (`fn.call(this, …)`); support **multiple results** only by option.
- `callbackify`: `.then(v => cb(null, v), e => cb(e))`, call `cb` **outside** the promise chain; guard falsy reasons.
- A promise settles once, so a **double callback** is harmless.
:::
