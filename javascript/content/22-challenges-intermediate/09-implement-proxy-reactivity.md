---
title: Implement reactivity with Proxy (mini Vue)
level: hard
time: 40
summary: Build reactive(), effect() and computed() with Proxy and Reflect. Track which effect reads which key, re-run only what is affected, clean up old dependencies and handle arrays and deletes.
---

:::problem Implement reactive, effect and computed {level=medium tags="proxy,reflect,reactivity,vue"}
Build the core of Vue 3's reactivity:

- `reactive(obj)` returns a Proxy. **Reading** a property while an effect is running **tracks** it. **Writing** a property **triggers** the effects that read it.
- `effect(fn)` runs `fn` at once, and again whenever something it read changes.
- `computed(getter)` is **lazy** and **cached**: it recomputes only when a dependency changed *and* someone reads it.

Rules:

1. Setting a property to the **same value** triggers nothing.
2. Nested objects are reactive too (wrapped when first read).
3. Dependencies are **re-collected on each run**: if a branch is no longer taken, changes there do not re-run the effect.
4. Adding/deleting keys and array `push` must trigger effects that read `length`, keys or the array.
5. An effect that changes its own dependency must not loop forever.

```js
const state = reactive({ count: 0 });
effect(() => console.log("count is", state.count));   // count is 0
state.count++;                                        // count is 1
```

:::hint Hint
Keep a global `activeEffect`. A map `target → key → Set<effect>` stores who depends on what. `get` trap = `track(target, key)`; `set` trap = `trigger(target, key)`. Before an effect re-runs, remove it from all its old sets.
:::
:::

## Solution and tests

```js run title="Mini reactivity, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

const targetMap = new WeakMap();                             // target -> Map(key -> Set(effect)); weak, so garbage can be collected
const ITERATE = Symbol("iterate");                           // a pseudo-key: "someone iterates over the keys"
let activeEffect = null;

function track(target, key) {
  if (!activeEffect) return;
  let deps = targetMap.get(target);
  if (!deps) targetMap.set(target, (deps = new Map()));
  let set = deps.get(key);
  if (!set) deps.set(key, (set = new Set()));
  set.add(activeEffect);
  activeEffect.deps.push(set);                               // remember where we are registered, for cleanup
}

function trigger(target, key) {
  const set = targetMap.get(target)?.get(key);
  if (!set) return;
  for (const e of [...set]) {                                // copy: running an effect changes the sets
    if (e === activeEffect) continue;                        // an effect writing its own dependency: do not loop
    e.scheduler ? e.scheduler() : e.run();
  }
}

function cleanup(e) {
  for (const set of e.deps) set.delete(e);
  e.deps.length = 0;
}

function effect(fn, { lazy = false, scheduler } = {}) {
  const e = {
    deps: [], scheduler,
    run() {
      cleanup(e);                                            // forget old dependencies; the run collects the current ones
      const prev = activeEffect;
      activeEffect = e;
      try { return fn(); } finally { activeEffect = prev; }  // supports nested effects
    },
  };
  if (!lazy) e.run();
  return e;
}

const proxies = new WeakMap();                               // one proxy per object: reactive(x) === reactive(x)
const proxySet = new WeakSet();                              // the proxies themselves: reactive(proxy) returns the proxy
function reactive(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (proxySet.has(obj)) return obj;
  if (proxies.has(obj)) return proxies.get(obj);
  const proxy = new Proxy(obj, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);      // receiver keeps getters working with the right `this`
      track(target, key);
      return value !== null && typeof value === "object" ? reactive(value) : value;      // wrap nested objects lazily
    },
    set(target, key, value, receiver) {
      const had = Object.prototype.hasOwnProperty.call(target, key);
      const old = target[key];
      const oldLength = Array.isArray(target) ? target.length : 0;
      const ok = Reflect.set(target, key, value, receiver);
      if (!had) trigger(target, ITERATE);                    // a new key: key lists changed
      if (!Object.is(old, value)) trigger(target, key);
      if (Array.isArray(target) && target.length !== oldLength) trigger(target, "length");
      return ok;
    },
    deleteProperty(target, key) {
      const had = Object.prototype.hasOwnProperty.call(target, key);
      const ok = Reflect.deleteProperty(target, key);
      if (had && ok) { trigger(target, key); trigger(target, ITERATE); }
      return ok;
    },
    has(target, key) { track(target, key); return Reflect.has(target, key); },           // "key in obj"
    ownKeys(target) { track(target, Array.isArray(target) ? "length" : ITERATE); return Reflect.ownKeys(target); },   // Object.keys, for...in
  });
  proxies.set(obj, proxy);
  proxySet.add(proxy);
  return proxy;
}

function computed(getter) {
  let value, dirty = true;
  const box = {};
  const runner = effect(getter, {
    lazy: true,
    scheduler() { if (!dirty) { dirty = true; trigger(box, "value"); } },      // a dependency changed: mark dirty and tell my readers
  });
  return {
    get value() {
      if (dirty) { value = runner.run(); dirty = false; }
      track(box, "value");                                   // whoever reads me depends on me
      return value;
    },
  };
}

// ---------------- tests ----------------
test("effect runs at once and again on change", () => {
  const s = reactive({ count: 0 });
  const seen = [];
  effect(() => seen.push(s.count));
  s.count = 1; s.count = 2;
  assert.deepEqual(seen, [0, 1, 2]);
});

test("same value triggers nothing", () => {
  const s = reactive({ n: 1 });
  let runs = 0;
  effect(() => { s.n; runs++; });
  s.n = 1;
  assert.equal(runs, 1);
});

test("only effects that read the key re-run", () => {
  const s = reactive({ a: 1, b: 1 });
  let ra = 0, rb = 0;
  effect(() => { s.a; ra++; });
  effect(() => { s.b; rb++; });
  s.a = 2;
  assert.deepEqual([ra, rb], [2, 1]);
});

test("nested objects are reactive", () => {
  const s = reactive({ user: { name: "A", address: { city: "Pune" } } });
  const seen = [];
  effect(() => seen.push(s.user.address.city));
  s.user.address.city = "Delhi";
  assert.deepEqual(seen, ["Pune", "Delhi"]);
});

test("dependencies are re-collected: an unused branch no longer triggers", () => {
  const s = reactive({ ok: true, a: "A", b: "B" });
  let runs = 0;
  effect(() => { runs++; s.ok ? s.a : s.b; });
  s.b = "B2";                                                // b is not read while ok is true
  assert.equal(runs, 1);
  s.ok = false;                                              // now b is read, a is not
  assert.equal(runs, 2);
  s.a = "A2";
  assert.equal(runs, 2);
  s.b = "B3";
  assert.equal(runs, 3);
});

test("adding and deleting keys triggers key-based effects", () => {
  const s = reactive({ a: 1 });
  const seen = [];
  effect(() => seen.push(Object.keys(s).join(",")));
  s.b = 2;
  delete s.a;
  assert.deepEqual(seen, ["a", "a,b", "b"]);
});

test("`in` checks are tracked", () => {
  const s = reactive({});
  const seen = [];
  effect(() => seen.push("x" in s));
  s.x = 1;
  assert.deepEqual(seen, [false, true]);
});

test("arrays: push and length", () => {
  const list = reactive([1, 2]);
  const lengths = [], sums = [];
  effect(() => lengths.push(list.length));
  effect(() => sums.push(list.reduce((a, b) => a + b, 0)));
  list.push(3);
  assert.deepEqual(lengths.at(-1), 3);
  assert.equal(sums.at(-1), 6);
});

test("an effect writing its own dependency does not loop forever", () => {
  const s = reactive({ n: 0 });
  let runs = 0;
  effect(() => { runs++; s.n = s.n + 1; });
  assert.equal(runs, 1);
  assert.equal(s.n, 1);
});

test("nested effects restore the outer effect", () => {
  const s = reactive({ outer: 0, inner: 0 });
  let outerRuns = 0, innerRuns = 0;
  effect(() => {
    outerRuns++;
    s.outer;
    effect(() => { innerRuns++; s.inner; });
    s.outer;                                                 // still tracked by the outer effect after the inner one ran
  });
  s.outer = 1;
  assert.equal(outerRuns, 2);
});

test("reactive(x) returns the same proxy each time", () => {
  const raw = { a: 1 };
  assert.equal(reactive(raw), reactive(raw));
  assert.equal(reactive(reactive(raw)), reactive(raw));
});

test("computed is lazy and cached", () => {
  const s = reactive({ a: 1, b: 2 });
  let computes = 0;
  const sum = computed(() => { computes++; return s.a + s.b; });
  assert.equal(computes, 0);                                 // lazy: nothing yet
  assert.equal(sum.value, 3);
  assert.equal(sum.value, 3);
  assert.equal(computes, 1);                                 // cached
  s.a = 10;
  assert.equal(computes, 1);                                 // dirty, but still not computed
  assert.equal(sum.value, 12);
  assert.equal(computes, 2);
});

test("effects that read a computed re-run when its inputs change", () => {
  const s = reactive({ n: 1 });
  const double = computed(() => s.n * 2);
  const seen = [];
  effect(() => seen.push(double.value));
  s.n = 2; s.n = 3;
  assert.deepEqual(seen, [2, 4, 6]);
});

test("getters see the proxy as `this` (Reflect receiver)", () => {
  const s = reactive({ first: "A", last: "B", get full() { return this.first + this.last; } });
  const seen = [];
  effect(() => seen.push(s.full));
  s.first = "Z";
  assert.deepEqual(seen, ["AB", "ZB"]);
});
```

## What this is missing (good to say)

- **Batching**: real Vue queues effects and runs each once per tick (`nextTick`). Here an effect runs for every write. Use a `scheduler` with a `Set` and `queueMicrotask`.
- `Map`, `Set` and other collections need special traps.
- Arrays have many edge cases (`indexOf` with proxies, `length = 0`).
- Stopping effects (`stop()`) and error handling.

:::qa Why `Reflect.get/set` and not `target[key]`? {level=medium}
**Say this:** "`Reflect` takes the `receiver` argument, so getters and setters run with `this` set to the proxy, which keeps tracking working inside them. It also returns a boolean from `set`, which the Proxy invariants require (returning false throws in strict mode)."

**In simple words:** It does the default thing correctly, with the right `this`.
:::

:::qa Why clean up the dependencies before every run? {level=medium}
**Say this:** "The effect may read different keys on different runs (an `if` branch). If we kept old subscriptions, it would re-run for changes it no longer cares about, and it would leak memory in the sets. So each run starts with an empty dependency list."

**In simple words:** Re-read the list of things you depend on every time.
:::

:::qa How does Proxy-based reactivity differ from `Object.defineProperty` (Vue 2)? {level=hard}
**Say this:** "`defineProperty` must be applied to each known property up front, so it cannot see new keys, deletes or array index changes (Vue 2 needed `Vue.set`). A Proxy intercepts all operations on the object, including adding and deleting keys, `in`, and iteration, and wraps nested objects lazily."

**In simple words:** A Proxy watches the whole object, not one property at a time.
:::

:::keypoints
- **track** in `get`, **trigger** in `set`/`delete`; store `target → key → Set(effects)` in a `WeakMap`.
- Re-run = **cleanup old deps**, set `activeEffect`, run, restore (supports **nesting**).
- Skip equal values; skip the **active effect** to avoid loops; wrap nested objects **lazily**.
- `computed` = **lazy effect + dirty flag**, and it is itself trackable.
- Use **Reflect** with `receiver`.
:::
