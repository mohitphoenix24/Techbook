---
title: Implement a Promise class
level: hard
time: 40
summary: Build a small Promise/A+ style class with then chaining, asynchronous callbacks through microtasks, thenable adoption and catch/finally. The best way to really understand promises.
---

:::problem Implement a Promise class {level=medium tags="promises,microtasks,thenables,async"}
Write `MyPromise` with:

- `new MyPromise((resolve, reject) => {...})`; an error thrown in the executor rejects the promise.
- `then(onFulfilled, onRejected)` returns a **new** promise. Callbacks run **asynchronously** (as microtasks), never synchronously.
- Chaining: a returned value fulfils the next promise; a returned **promise or thenable** is adopted; a thrown error rejects the next promise.
- `catch(fn)` and `finally(fn)`.
- Static `MyPromise.resolve`, `MyPromise.reject`.
- A promise can settle **only once**; resolving with itself is a `TypeError`.

```js
new MyPromise((res) => res(1)).then((x) => x + 1).then(console.log);   // 2
```

:::hint Hint
State is one of `pending | fulfilled | rejected`. While pending, store the callbacks in a queue. When it settles, run the queue with `queueMicrotask`. The core of `then` is the **resolution procedure**: what to do with the value `x` returned by a callback.
:::
:::

## Solution and tests

```js run title="MyPromise, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

const PENDING = 0, FULFILLED = 1, REJECTED = 2;

class MyPromise {
  #state = PENDING;
  #value;
  #handlers = [];                                            // callbacks waiting for settlement

  constructor(executor) {
    const resolve = (v) => this.#resolveWith(v);
    const reject = (r) => this.#settle(REJECTED, r);
    try { executor(resolve, reject); } catch (e) { reject(e); }
  }

  #settle(state, value) {
    if (this.#state !== PENDING) return;                     // settle only once
    this.#state = state;
    this.#value = value;
    for (const h of this.#handlers) this.#run(h);
    this.#handlers = [];
  }

  // The resolution procedure: what happens when resolve(x) is called
  #resolveWith(x) {
    if (this.#state !== PENDING) return;
    if (x === this) return this.#settle(REJECTED, new TypeError("Chaining cycle detected for promise"));
    if (x !== null && (typeof x === "object" || typeof x === "function")) {
      let then;
      try { then = x.then; } catch (e) { return this.#settle(REJECTED, e); }       // reading .then can throw
      if (typeof then === "function") {                                            // a thenable: follow it
        let called = false;                                                        // a bad thenable may call both: only the first counts
        try {
          then.call(x,
            (y) => { if (!called) { called = true; this.#resolveWith(y); } },
            (r) => { if (!called) { called = true; this.#settle(REJECTED, r); } });
        } catch (e) { if (!called) { called = true; this.#settle(REJECTED, e); } }
        return;
      }
    }
    this.#settle(FULFILLED, x);
  }

  #run({ onFulfilled, onRejected, resolve, reject }) {
    queueMicrotask(() => {                                   // callbacks are ALWAYS async
      const cb = this.#state === FULFILLED ? onFulfilled : onRejected;
      if (typeof cb !== "function") {                        // no handler: pass the result along
        return this.#state === FULFILLED ? resolve(this.#value) : reject(this.#value);
      }
      try { resolve(cb(this.#value)); } catch (e) { reject(e); }
    });
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      const handler = { onFulfilled, onRejected, resolve, reject };
      if (this.#state === PENDING) this.#handlers.push(handler);
      else this.#run(handler);
    });
  }

  catch(onRejected) { return this.then(undefined, onRejected); }

  finally(fn) {
    return this.then(
      (v) => MyPromise.resolve(fn()).then(() => v),          // wait for fn, then pass the original value on
      (r) => MyPromise.resolve(fn()).then(() => { throw r; }),
    );
  }

  static resolve(v) { return v instanceof MyPromise ? v : new MyPromise((res) => res(v)); }
  static reject(r) { return new MyPromise((_, rej) => rej(r)); }
}

// ---------------- tests ----------------
const tick = () => new Promise((r) => setTimeout(r, 5));

await test("then chains values", async () => {
  const out = [];
  new MyPromise((res) => res(1)).then((x) => x + 1).then((x) => out.push(x));
  await tick();
  assert.deepEqual(out, [2]);
});

await test("callbacks are asynchronous", async () => {
  const log = [];
  new MyPromise((res) => res("v")).then(() => log.push("then"));
  log.push("sync");
  await tick();
  assert.deepEqual(log, ["sync", "then"]);
});

await test("executor runs synchronously", () => {
  let ran = false;
  new MyPromise(() => { ran = true; });
  assert.equal(ran, true);
});

await test("same order as native promises", async () => {
  const mine = [], native = [];
  MyPromise.resolve().then(() => mine.push("a")).then(() => mine.push("c"));
  MyPromise.resolve().then(() => mine.push("b")).then(() => mine.push("d"));
  Promise.resolve().then(() => native.push("a")).then(() => native.push("c"));
  Promise.resolve().then(() => native.push("b")).then(() => native.push("d"));
  await tick();
  assert.deepEqual(mine, native);
});

await test("settles only once", async () => {
  const p = new MyPromise((res, rej) => { res("first"); res("second"); rej(new Error("no")); });
  let got;
  p.then((v) => (got = v));
  await tick();
  assert.equal(got, "first");
});

await test("executor throwing rejects", async () => {
  let msg;
  new MyPromise(() => { throw new Error("oops"); }).catch((e) => (msg = e.message));
  await tick();
  assert.equal(msg, "oops");
});

await test("a throw in then rejects the next promise; catch recovers", async () => {
  let got;
  MyPromise.resolve(1).then(() => { throw new Error("mid"); }).then(() => (got = "skipped")).catch((e) => (got = "caught " + e.message));
  await tick();
  assert.equal(got, "caught mid");
});

await test("missing handlers pass values through", async () => {
  let got;
  MyPromise.resolve("kept").then().then(undefined, undefined).then((v) => (got = v));
  await tick();
  assert.equal(got, "kept");
});

await test("returning a promise is adopted", async () => {
  let got;
  MyPromise.resolve(1).then((x) => new MyPromise((res) => setTimeout(() => res(x + 10), 10))).then((v) => (got = v));
  await tick(); await tick(); await tick();
  assert.equal(got, 11);
});

await test("a native promise or thenable is adopted too", async () => {
  const out = [];
  MyPromise.resolve(Promise.resolve("native")).then((v) => out.push(v));
  MyPromise.resolve({ then(res) { res("thenable"); } }).then((v) => out.push(v));
  await tick();
  assert.deepEqual(out.sort(), ["native", "thenable"]);
});

await test("a misbehaving thenable that calls both callbacks only counts once", async () => {
  let got;
  const bad = { then(res, rej) { res("ok"); rej(new Error("late")); } };
  MyPromise.resolve(bad).then((v) => (got = v), () => (got = "rejected"));
  await tick();
  assert.equal(got, "ok");
});

await test("resolving with itself is a TypeError", async () => {
  let err;
  const p = new MyPromise((res) => setTimeout(() => res(p), 0));
  p.catch((e) => (err = e));
  await tick(); await tick();
  assert.ok(err instanceof TypeError);
});

await test("finally runs for both outcomes and keeps the result", async () => {
  const log = [];
  await MyPromise.resolve("v").finally(() => log.push("f1")).then((v) => log.push(v));
  await MyPromise.reject(new Error("r")).finally(() => log.push("f2")).catch((e) => log.push(e.message));
  await tick();
  assert.deepEqual(log, ["f1", "v", "f2", "r"]);
});

await test("await works with it (thenable)", async () => {
  assert.equal(await new MyPromise((res) => setTimeout(() => res("awaited"), 5)), "awaited");
});
```

## The three ideas that make it work

1. **A state machine** with a one-way transition: pending → fulfilled or rejected, once.
2. **Callbacks in a queue**, run through `queueMicrotask`, so `then` is always asynchronous, even on an already-settled promise.
3. **The resolution procedure**: when a callback returns `x`, check whether `x` is a thenable; if yes, **follow it**, else fulfil. This is what makes chains flatten and why `await` works with any thenable.

:::qa Why must `then` callbacks be asynchronous even if the promise is already resolved? {level=medium}
**Say this:** "So the order of code is always predictable. If sometimes they ran synchronously and sometimes later, code that depends on the order would be a bug that appears only in some cases (the 'Zalgo' problem). The spec says callbacks run after the current stack, as microtasks."

**In simple words:** Same behaviour every time, no surprises.
:::

:::qa Why does returning a promise from `then` cost extra ticks? {level=hard}
**Say this:** "Adopting a thenable needs a job to call its `then`, and another to deliver the value. So `return promise` takes about two more microtask turns than `return value`. That is why some output-order puzzles surprise people."

**In simple words:** Following another promise needs extra hops.
:::

:::qa How is `finally` different from `then(fn, fn)`? {level=medium}
**Say this:** "`finally` gets no argument, waits for the returned promise, and then **passes the original value or error on**. If `fn` throws or rejects, that new error replaces the result. `then(fn, fn)` would replace the result with whatever `fn` returns."

**In simple words:** `finally` is for cleanup and does not change the answer.
:::

:::keypoints
- State: **pending → fulfilled | rejected**, once; keep a **handler queue**.
- Run callbacks with **`queueMicrotask`**; `then` returns a **new** promise.
- **Resolution procedure**: self-resolution is a `TypeError`; **adopt thenables**; only the first call of a thenable's callbacks counts.
- `catch` = `then(undefined, fn)`; `finally` passes the original outcome through.
:::
