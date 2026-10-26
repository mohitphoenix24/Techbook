---
title: Implement an EventEmitter
level: medium
time: 30
summary: Build on/off/once/emit with unsubscribe functions, safe removal during emit, error events, and the same behaviour as Node's EventEmitter. Also the pub/sub pattern behind most frontend and Node code.
---

:::problem Implement an EventEmitter {level=easy tags="design,observer,pub-sub,closures"}
Write a class `Emitter` with:

- `on(event, fn)` adds a listener and **returns an unsubscribe function**.
- `off(event, fn)` removes it.
- `once(event, fn)` runs the listener at most once.
- `emit(event, ...args)` calls the listeners **in the order added**, returns `true` if there were any.
- `listenerCount(event)`.

Behaviours to get right:

1. A listener that removes itself (or another) **during** `emit` must not break the loop.
2. An `emit("error", err)` with **no listener** throws `err` (like Node).
3. `off` works for a function that was added with `once`.

```js
const bus = new Emitter();
const stop = bus.on("save", (id) => console.log("saved", id));
bus.emit("save", 1);    // saved 1
stop();
bus.emit("save", 2);    // nothing
```

:::hint Hint
Store listeners as `Map<event, Set or Array>`. Iterate over a **copy** of the array in `emit`. For `once`, wrap the function and remember the original on the wrapper so `off` can find it.
:::
:::

## Solution and tests

```js run title="Emitter, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

class Emitter {
  #events = new Map();                                       // event -> array of listeners (arrays keep the order and allow repeats)

  on(event, fn) {
    if (typeof fn !== "function") throw new TypeError("listener must be a function");
    if (!this.#events.has(event)) this.#events.set(event, []);
    this.#events.get(event).push(fn);
    return () => this.off(event, fn);                        // unsubscribe
  }

  once(event, fn) {
    const wrapper = (...args) => { this.off(event, wrapper); return fn.apply(this, args); };
    wrapper.original = fn;                                   // so off(event, fn) can find the wrapper
    return this.on(event, wrapper);
  }

  off(event, fn) {
    const list = this.#events.get(event);
    if (!list) return this;
    const i = list.findIndex((l) => l === fn || l.original === fn);
    if (i !== -1) list.splice(i, 1);                         // remove one matching listener (like Node)
    if (list.length === 0) this.#events.delete(event);       // no leaks for dead events
    return this;
  }

  emit(event, ...args) {
    const list = this.#events.get(event);
    if (!list || list.length === 0) {
      if (event === "error") throw args[0] instanceof Error ? args[0] : new Error("Unhandled error: " + String(args[0]));
      return false;
    }
    for (const fn of [...list]) fn.apply(this, args);        // iterate a COPY: listeners may add or remove listeners
    return true;
  }

  listenerCount(event) { return this.#events.get(event)?.length ?? 0; }
}

// ---------------- tests ----------------
test("on and emit pass arguments in order", () => {
  const e = new Emitter();
  const seen = [];
  e.on("x", (a, b) => seen.push("first " + a + b));
  e.on("x", (a, b) => seen.push("second " + a + b));
  assert.equal(e.emit("x", 1, 2), true);
  assert.deepEqual(seen, ["first 12", "second 12"]);
});

test("emit returns false when nobody listens", () => assert.equal(new Emitter().emit("nothing"), false));

test("the returned function unsubscribes", () => {
  const e = new Emitter();
  let n = 0;
  const stop = e.on("x", () => n++);
  e.emit("x"); stop(); e.emit("x");
  assert.equal(n, 1);
  assert.equal(e.listenerCount("x"), 0);
});

test("once runs once", () => {
  const e = new Emitter();
  let n = 0;
  e.once("x", () => n++);
  e.emit("x"); e.emit("x");
  assert.equal(n, 1);
});

test("off works for a once listener", () => {
  const e = new Emitter();
  let n = 0;
  const fn = () => n++;
  e.once("x", fn);
  e.off("x", fn);
  e.emit("x");
  assert.equal(n, 0);
});

test("a listener removing itself during emit does not skip the next one", () => {
  const e = new Emitter();
  const seen = [];
  const a = () => { seen.push("a"); e.off("x", a); };
  e.on("x", a);
  e.on("x", () => seen.push("b"));
  e.on("x", () => seen.push("c"));
  e.emit("x");
  assert.deepEqual(seen, ["a", "b", "c"]);
  e.emit("x");
  assert.deepEqual(seen, ["a", "b", "c", "b", "c"]);
});

test("a listener added during emit runs from the next emit", () => {
  const e = new Emitter();
  const seen = [];
  e.once("x", () => e.on("x", () => seen.push("late")));
  e.emit("x");
  assert.deepEqual(seen, []);
  e.emit("x");
  assert.deepEqual(seen, ["late"]);
});

test("error with no listener throws", () => {
  const e = new Emitter();
  assert.throws(() => e.emit("error", new Error("boom")), /boom/);
  let got;
  e.on("error", (err) => (got = err.message));
  e.emit("error", new Error("handled"));
  assert.equal(got, "handled");
});

test("the same function added twice runs twice, off removes one", () => {
  const e = new Emitter();
  let n = 0;
  const f = () => n++;
  e.on("x", f); e.on("x", f);
  e.emit("x");
  assert.equal(n, 2);
  e.off("x", f);
  assert.equal(e.listenerCount("x"), 1);
});

test("this inside a listener is the emitter", () => {
  const e = new Emitter();
  let self;
  e.on("x", function () { self = this; });
  e.emit("x");
  assert.equal(self, e);
});

test("a throwing listener stops the rest (same as Node)", () => {
  const e = new Emitter();
  const seen = [];
  e.on("x", () => { throw new Error("listener failed"); });
  e.on("x", () => seen.push("never"));
  assert.throws(() => e.emit("x"), /listener failed/);
  assert.deepEqual(seen, []);
});
```

## Extensions to talk about

| Feature | Idea |
|---|---|
| `prependListener` | `unshift` instead of `push` |
| Wildcards (`"user.*"`) | match event names with a regex or a trie |
| Async `emit` | `await Promise.all(listeners.map(...))` or run in sequence |
| Max listeners warning | warn when one event has more than 10 listeners: a common **leak** sign |
| Symbols as event names | the `Map` already supports any key type |

:::qa What goes wrong if `emit` loops over the live array? {level=medium}
**Say this:** "If a listener removes itself, `splice` shifts the array and the loop skips the next listener. If a listener adds one, it could run in the same emit, even forever. Copying the array first gives a stable list for this emit."

**In simple words:** Do not walk a list that is being changed under your feet.
:::

:::qa How do EventEmitters cause memory leaks? {level=medium}
**Say this:** "A long-lived emitter holds a reference to every listener, and each listener holds its closure. If you add listeners and never remove them (for example in a React component or per request), memory grows. Always unsubscribe in cleanup. Node warns after 10 listeners for the same event."

**In simple words:** The emitter keeps everything you gave it until you take it back.
:::

:::qa Is an EventEmitter synchronous or asynchronous? {level=easy}
**Say this:** "`emit` calls the listeners **synchronously**, one after another, before it returns. If you need async behaviour, schedule it inside the listener (`queueMicrotask`, `setImmediate`) or await the work yourself."

**In simple words:** It is just a loop calling functions.
:::

:::keypoints
- Store `event → [listeners]`; **`on` returns an unsubscribe** function.
- `once` = wrapper that removes itself; keep `wrapper.original` so **`off`** finds it.
- Iterate a **copy** in `emit`; `emit('error')` with no listener should **throw**.
- Emit is **synchronous**; forgotten listeners are a classic **memory leak**.
:::
