---
title: State, snapshots and why components re-render
level: advanced
time: 40
summary: What triggers a render, why state is a snapshot, batching and functional updates, why mutating state breaks React, referential equality with Object.is, and how parent re-renders cascade down.
---

## What makes a component re-render?

A component function runs again when:

1. **Its own state changes** (`setState` with a value that is **not `Object.is`-equal** to the current one).
2. **Its parent re-renders** (by default, **all children re-render too**, even if their props are the same).
3. **A context it reads changes** (`useContext`).
4. (`useReducer`, `useSyncExternalStore` and external-store hooks work like state.)

**Not** a reason: changing a normal variable, mutating an object, changing `ref.current`.

```js run title="Re-render triggers, as a model: Object.is decides if state changed"
function makeState(initial, onChange) {
  let value = initial;
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === "function" ? next(value) : next;
      if (Object.is(resolved, value)) return console.log("  (same value: React bails out, no re-render)");
      value = resolved;
      onChange();
    },
  };
}

let renders = 0;
const count = makeState(0, () => renders++);
const user = makeState({ name: "Asha" }, () => renders++);

count.set(0);                                     // same primitive: no render
count.set(1);                                     // changed: render
const u = user.get();
u.name = "Ravi";                                  // MUTATION: same object
user.set(u);                                      // same reference: React sees "no change": the UI will NOT update
user.set({ ...user.get(), name: "Meera" });       // a NEW object: renders
console.log("renders:", renders, "| user:", user.get());
```

## State is a snapshot

Each render has its **own** `props`, `state` and event handlers: values **frozen for that render**. `setState` does **not** change the variable in the running function. It **schedules a new render**, where the variable has the new value.

```js run title="Three setCount(count + 1) calls add only 1; three functional updates add 3"
// a mini scheduler: updates are queued during an event, then applied together in ONE render (batching)
function createStateCell(initial) {
  let state = initial, queue = [];
  return {
    snapshot: () => state,
    set: (next) => queue.push(next),
    flush() {                                           // runs once, after the event handler finished
      for (const update of queue) state = typeof update === "function" ? update(state) : update;
      queue = [];
      return state;
    },
  };
}

// handler A: uses the snapshot value
const a = createStateCell(0);
const handlerA = () => { const count = a.snapshot(); a.set(count + 1); a.set(count + 1); a.set(count + 1); };   // count is 0 in all three
handlerA();
console.log("snapshot style  :", a.flush());

// handler B: functional updates receive the latest queued value
const b = createStateCell(0);
const handlerB = () => { b.set((c) => c + 1); b.set((c) => c + 1); b.set((c) => c + 1); };
handlerB();
console.log("functional style:", b.flush());

// the "replace, then update" mix
const c = createStateCell(5);
c.set(10); c.set((n) => n * 2); c.set(7);
console.log("queue 10, n*2, 7  ->", c.flush(), "(the last replacement wins)");
```

```jsx
function Counter() {
  const [count, setCount] = useState(0);
  function handleClick() {
    setCount(count + 1);
    console.log(count);          // STILL the old value (0): this function belongs to the render where count was 0
    setCount(count + 1);         // computed from the same snapshot: the same result
    setCount((c) => c + 1);      // functional: based on the latest queued state
  }
  return <button onClick={handleClick}>{count}</button>;
}
```

Rule: if the **new state depends on the previous state**, use the **functional form** `setX(prev => ...)`.

## Batching (React 18+)

React groups **all** state updates that happen in the same tick (event handlers, timeouts, promises, native events) into **one render**. In React 17 only updates inside React event handlers were batched. To force a synchronous update (rare): `flushSync(() => setState(...))`.

## Never mutate state

```jsx
const [todos, setTodos] = useState([{ id: 1, done: false }]);

todos[0].done = true;            // WRONG: mutates in place, same reference
setTodos(todos);                 // React sees the same array: bail-out: no re-render

setTodos(todos.map((t) => (t.id === 1 ? { ...t, done: true } : t)));       // RIGHT: new array and a new object for the changed item
setTodos((prev) => [...prev, { id: 2, done: false }]);                      // add
setTodos((prev) => prev.filter((t) => t.id !== 1));                         // remove
```

Why immutability matters for React:

1. **Change detection by reference** (`Object.is`): `===` is O(1), deep comparing is O(n).
2. **`React.memo`, `useMemo`, `useEffect` dependencies** compare by reference.
3. **Concurrent rendering** may render with an old state snapshot; mutated state would be visible in the "past".
4. **Time-travel debugging, undo/redo** need old versions intact.

Convenience: **Immer** (`produce(state, draft => { draft.todos[0].done = true })`) lets you write mutation-style code that creates immutable updates (used inside Redux Toolkit and `useImmer`).

## Re-render cascades down

```jsx
function Parent() {
  const [n, setN] = useState(0);
  return (<>
    <button onClick={() => setN(n + 1)}>{n}</button>
    <Child />                       {/* re-renders on EVERY parent render, even with no props */}
  </>);
}
```

```js run title="Counting renders: a parent re-render re-runs the children unless they are memoised"
const renders = { parent: 0, plainChild: 0, memoStableProps: 0, memoInlineObject: 0 };

function shallowEqual(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.is(a[k], b[k]));
}
function memo(component, areEqual = shallowEqual) {                      // React.memo, as a model
  let lastProps, lastResult;
  return (props) => {
    if (lastProps && areEqual(lastProps, props)) return lastResult;      // skip: same props
    lastProps = props;
    return (lastResult = component(props));
  };
}

const PlainChild = (props) => { renders.plainChild++; return `plain(${props.label})`; };
const MemoStable = memo((props) => { renders.memoStableProps++; return `memo(${props.label})`; });
const MemoInline = memo((props) => { renders.memoInlineObject++; return `memo(${props.label})`; });

function Parent() {
  renders.parent++;
  return [
    PlainChild({ label: "a" }),                                          // not memoised: runs every time
    MemoStable({ label: "a" }),                                          // memoised, primitive props: skipped when nothing changed
    MemoInline({ label: "a", style: { color: "red" } }),                 // memoised, but a NEW object prop every render
  ];
}

Parent(); Parent(); Parent();                                            // three parent renders
console.log(renders);
```

The plain child runs **3 times** (every parent render). The memoised child with primitive props runs **once**. The memoised child that receives an **inline object** runs **3 times** anyway: `{ color: "red" }` is a **new object on every render**, so `Object.is` says "different" and `memo` cannot help. This is **referential equality**: the next lessons show how to keep references stable (`useMemo`, `useCallback`).

## Derived data: do not store what you can compute

```jsx
// BAD: duplicated state that must be kept in sync
const [items, setItems] = useState([]);
const [count, setCount] = useState(0);                   // can drift out of sync
useEffect(() => setCount(items.length), [items]);        // extra render

// GOOD: derive during render
const count = items.length;
const visible = useMemo(() => items.filter((i) => i.name.includes(query)), [items, query]);    // only if it is expensive
```

## Lifting state, and where state should live

- Keep state **as close as possible** to where it is used.
- If two siblings need it, **lift it up** to their closest common parent.
- For app-wide state use **context**, a store (Redux Toolkit, Zustand, Jotai), or server-state libraries (**React Query / TanStack Query**, SWR) for data from APIs.
- **Initial state from an expensive computation:** pass a function, `useState(() => expensive())`, so it runs only on the first render.
- State is **per component instance** and **reset when it unmounts** (or its `key` changes).

:::interview Why does `setCount(count + 1)` three times add only 1? Why does mutating state not update the UI?
"State is a snapshot: within one render, `count` is a constant, so the three calls all schedule `count + 1` computed from the same old value, and React batches them into one render. With the functional form `setCount(c => c + 1)` each update gets the latest queued value, so three calls add three. React decides whether to re-render by comparing the new state to the old with `Object.is`; if I mutate an array or object in place and pass the same reference, nothing looks changed and the UI does not update, and memoised children and effect dependencies also compare by reference. So I always create new objects and arrays, with spread, map and filter, or Immer. A parent's re-render also re-renders its children by default, unless they are wrapped in `React.memo` and their props are referentially stable."
:::

## More interview questions on this topic

:::qa Does calling `setState` change the variable immediately? {level=easy}
**Say this:** "No. It schedules a re-render. The variable in the current function stays as it was; the new value is available in the next render."

**In simple words:** The update arrives with the next picture, not this one.
:::

:::qa What is automatic batching? {level=medium}
**Say this:** "In React 18, all state updates within the same event loop tick, including in timeouts, promises and native handlers, are batched into a single render."

**In simple words:** React waits until you finish, then draws once.
:::

:::qa When should you use the functional form of `setState`? {level=easy}
**Say this:** "When the new value depends on the previous one, such as counters, toggles or appending to a list, and in effects or timers where the closure may hold a stale value."

**In simple words:** "Add one to whatever it is now."
:::

:::qa If a child component is wrapped in `React.memo` but still re-renders, why? {level=hard}
**Say this:** "Some prop has a new reference each render (an inline object, array or function), or it consumes a context that changed, or it has its own state change. `memo` compares props shallowly with `Object.is`."

**In simple words:** The props only look the same; they are new objects each time.
:::

```quiz
? What does React compare to decide whether state changed?
- Deep equality
+ Object.is (reference or value for primitives)
- JSON.stringify
> A mutated object has the same reference.
? What is logged: `setCount(count + 1); console.log(count);` (count was 0)?
- 1
+ 0
- undefined
> The handler sees the snapshot of its own render.
? Which update makes three consecutive increments work?
- setCount(count + 1) three times
+ setCount(c => c + 1) three times
- count++ three times
> The functional form receives the latest value.
```

:::keypoints
- Re-render triggers: **own state/reducer change**, **parent re-render**, **context change**. Changing variables, mutating state or `ref.current` does not.
- **State is a snapshot** per render: `setState` schedules the next render. **Batching** merges updates; use **functional updates** when based on previous state.
- **Never mutate**; create new objects/arrays (spread, `map`, `filter`, Immer). React compares with **`Object.is`**.
- Children re-render with their parent unless **`React.memo`** + stable props. **Derive** values instead of syncing state; keep state close; lift when shared.
:::
