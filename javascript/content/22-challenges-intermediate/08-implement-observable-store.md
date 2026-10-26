---
title: Implement a Redux-style store and observable
level: medium
time: 35
summary: Build createStore with dispatch, subscribe and reducers, add middleware and a memoized selector, then a tiny Observable with map, filter and unsubscribe. Explains the ideas behind Redux, Zustand and RxJS.
---

:::problem Implement createStore and a tiny Observable {level=medium tags="state,redux,observer,design"}
**Part 1: store.** `createStore(reducer, initialState)` returns `{ getState, dispatch, subscribe }`.

- `dispatch(action)` runs `reducer(state, action)`, saves the new state, then tells all subscribers.
- `subscribe(fn)` returns an unsubscribe function.
- A subscriber that unsubscribes (or subscribes) during a dispatch must not break the loop.
- Calling `dispatch` **inside a reducer** is an error.
- `applyMiddleware(...mw)` wraps `dispatch` (for logging, async actions).

**Part 2: selector.** `createSelector(inputSelectors, combiner)` recomputes only when its inputs change (by reference).

**Part 3: Observable.** `new Observable(subscribe)` with `.subscribe(observer)`, `.map`, `.filter`, and a returned **unsubscribe** that runs cleanup.

:::hint Hint
The reducer must be **pure**: it returns a new state and never changes the old one. Notify subscribers from a **copy** of the list. Middleware has the shape `store => next => action => ...`.
:::
:::

## Solution and tests

```js run title="Store, selector and Observable, with tests"
const assert = require("node:assert/strict");
const test = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// ---------- Part 1: the store ----------
function createStore(reducer, initialState, enhancer) {
  if (enhancer) return enhancer(createStore)(reducer, initialState);
  let state = initialState;
  let listeners = [];
  let dispatching = false;

  const getState = () => state;

  function subscribe(fn) {
    listeners = [...listeners, fn];                          // a new array each time: an ongoing notify loop is not disturbed
    return () => { listeners = listeners.filter((l) => l !== fn); };
  }

  function dispatch(action) {
    if (dispatching) throw new Error("Reducers may not dispatch actions");
    try { dispatching = true; state = reducer(state, action); }
    finally { dispatching = false; }
    for (const fn of listeners) fn();                        // `listeners` was captured: later changes affect the next dispatch
    return action;
  }

  dispatch({ type: "@@INIT" });
  return { getState, dispatch, subscribe };
}

const applyMiddleware = (...middlewares) => (createStoreFn) => (reducer, initial) => {
  const store = createStoreFn(reducer, initial);
  let dispatch = () => { throw new Error("Dispatching while constructing middleware is not allowed"); };
  const api = { getState: store.getState, dispatch: (a) => dispatch(a) };
  const chain = middlewares.map((mw) => mw(api));
  dispatch = chain.reduceRight((next, mw) => mw(next), store.dispatch);        // compose: first middleware is the outermost
  return { ...store, dispatch };
};

// ---------- Part 2: memoized selector ----------
function createSelector(inputs, combiner) {
  let lastArgs, lastResult;
  return (state) => {
    const args = inputs.map((sel) => sel(state));
    if (lastArgs && args.every((a, i) => Object.is(a, lastArgs[i]))) return lastResult;    // same inputs: same output, no work
    lastArgs = args;
    return (lastResult = combiner(...args));
  };
}

// ---------- Part 3: Observable ----------
class Observable {
  constructor(producer) { this._producer = producer; }
  subscribe(observer) {
    const o = typeof observer === "function" ? { next: observer } : observer;
    let closed = false, cleanup;                             // declared first: a synchronous producer may complete before we get its cleanup
    const safe = {
      next: (v) => { if (!closed) o.next?.(v); },
      error: (e) => { if (!closed) { closed = true; o.error?.(e); cleanup?.(); } },
      complete: () => { if (!closed) { closed = true; o.complete?.(); cleanup?.(); } },
    };
    cleanup = this._producer(safe);
    if (closed) cleanup?.();                                 // it already completed synchronously: clean up now
    return { unsubscribe() { if (!closed) { closed = true; cleanup?.(); } } };
  }
  map(f) { return new Observable((obs) => this.subscribe({ next: (v) => obs.next(f(v)), error: obs.error, complete: obs.complete }).unsubscribe); }
  filter(p) { return new Observable((obs) => this.subscribe({ next: (v) => p(v) && obs.next(v), error: obs.error, complete: obs.complete }).unsubscribe); }
  static of(...values) { return new Observable((obs) => { values.forEach((v) => obs.next(v)); obs.complete(); }); }
}

// ---------------- tests ----------------
const counter = (state = { n: 0 }, a) => (a.type === "inc" ? { ...state, n: state.n + (a.by ?? 1) } : state);

await test("dispatch updates the state immutably and notifies", () => {
  const store = createStore(counter);
  const before = store.getState();
  let calls = 0;
  store.subscribe(() => calls++);
  store.dispatch({ type: "inc" });
  assert.equal(store.getState().n, 1);
  assert.equal(before.n, 0);                                 // the old state object was not changed
  assert.notEqual(before, store.getState());
  assert.equal(calls, 1);
});

await test("unsubscribe stops notifications", () => {
  const store = createStore(counter);
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.dispatch({ type: "inc" }); off(); store.dispatch({ type: "inc" });
  assert.equal(calls, 1);
});

await test("unsubscribing during dispatch does not skip other listeners", () => {
  const store = createStore(counter);
  const seen = [];
  const off = store.subscribe(() => { seen.push("a"); off(); });
  store.subscribe(() => seen.push("b"));
  store.dispatch({ type: "inc" });
  assert.deepEqual(seen, ["a", "b"]);
});

await test("a reducer may not dispatch", () => {
  let store;
  const bad = (s = 0, a) => { if (a.type === "go") store.dispatch({ type: "x" }); return s; };
  store = createStore(bad);
  assert.throws(() => store.dispatch({ type: "go" }), /may not dispatch/);
});

await test("middleware: logging and thunks", async () => {
  const log = [];
  const logger = (api) => (next) => (action) => { log.push(action.type ?? "thunk"); return next(action); };
  const thunk = (api) => (next) => (action) => (typeof action === "function" ? action(api.dispatch, api.getState) : next(action));
  const store = createStore(counter, undefined, applyMiddleware(thunk, logger));
  store.dispatch((dispatch) => setTimeout(() => dispatch({ type: "inc", by: 5 }), 5));   // an async action
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(store.getState().n, 5);
  assert.ok(log.includes("inc"));
});

await test("selector recomputes only when its inputs change", () => {
  let computed = 0;
  const items = (s) => s.items, filter = (s) => s.filter;
  const visible = createSelector([items, filter], (list, f) => { computed++; return list.filter((x) => x.includes(f)); });
  const s1 = { items: ["apple", "banana"], filter: "a", other: 1 };
  assert.deepEqual(visible(s1), ["apple", "banana"]);
  visible({ ...s1, other: 2 });                              // an unrelated change
  visible({ ...s1, other: 3 });
  assert.equal(computed, 1);
  visible({ ...s1, filter: "b" });
  assert.equal(computed, 2);
});

await test("Observable: next, complete and map/filter", () => {
  const out = [];
  Observable.of(1, 2, 3, 4).filter((x) => x % 2 === 0).map((x) => x * 10).subscribe({ next: (v) => out.push(v), complete: () => out.push("done") });
  assert.deepEqual(out, [20, 40, "done"]);
});

await test("Observable: unsubscribe runs the cleanup and stops values", async () => {
  let cleaned = false;
  const ticks = new Observable((obs) => {
    let i = 0;
    const id = setInterval(() => obs.next(i++), 5);
    return () => { clearInterval(id); cleaned = true; };
  });
  const seen = [];
  const sub = ticks.subscribe((v) => seen.push(v));
  await new Promise((r) => setTimeout(r, 28));
  sub.unsubscribe();
  const count = seen.length;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(cleaned, true);
  assert.equal(seen.length, count);                          // nothing after unsubscribe
  assert.ok(count >= 2);
});

await test("Observable is lazy: nothing runs until subscribe", () => {
  let started = false;
  const o = new Observable(() => { started = true; });
  assert.equal(started, false);
  o.subscribe(() => {});
  assert.equal(started, true);
});
```

## How this maps to real libraries

| Idea | Redux | Zustand / Pinia | RxJS |
|---|---|---|---|
| State in one place | store + reducer | store with `set` | `BehaviorSubject` |
| Change = new object | immutable updates | `set` with a new object | each value is an event |
| Subscribe / unsubscribe | `store.subscribe` | hooks subscribe | `subscribe` / `unsubscribe` |
| Derived data | `reselect` | selectors | `map`, `combineLatest` |
| Side effects | middleware (thunk, saga) | actions | operators |

React's `useSyncExternalStore(store.subscribe, store.getState)` is the bridge between a store like this and a component.

:::qa Why must reducers be pure and return new objects? {level=medium}
**Say this:** "Change detection is by reference: subscribers and selectors compare old and new state with `===`. If you mutate in place the reference stays the same, so nothing notices. Pure reducers also make time-travel debugging and tests easy."

**In simple words:** The only way to know something changed is that the object is a new one.
:::

:::qa Why does `subscribe` create a new array instead of pushing? {level=hard}
**Say this:** "A dispatch loops over the listeners. If a listener subscribes or unsubscribes in the middle and we changed the same array, the loop would skip or repeat items. A fresh array each time keeps the running loop's view stable."

**In simple words:** The notify loop works on a snapshot.
:::

:::qa How is an Observable different from a Promise? {level=medium}
**Say this:** "A promise is **one** future value, **eager** (starts at once) and **not cancellable**. An observable is **zero to many** values over time, **lazy** (starts on subscribe), and **cancellable** through unsubscribe, which runs the cleanup."

**In simple words:** A promise is one letter; an observable is a stream of letters you can stop.
:::

:::keypoints
- **Store** = state + `dispatch(action)` through a **pure reducer** + `subscribe` returning **unsubscribe**.
- Notify from a **snapshot** of the listeners; forbid dispatch **inside reducers**.
- **Middleware** = `store => next => action`, composed with `reduceRight`.
- **Selectors** memoize on input references; **Observable** = lazy, many values, cancellable.
:::
