---
title: React output puzzles
level: advanced
time: 30
summary: Ten "what does this log or render?" puzzles on state snapshots, batching, effects order and cleanup, keys, memo, stale closures and context. Some are runnable simulations; some are JSX you reason about.
---

Write your answer first. The **JSX** puzzles cannot run here (they need React), so the reasoning is in the hint. The **runnable** ones simulate the rule.

## Puzzle 1: snapshot in a handler

```jsx
function App() {
  const [n, setN] = useState(0);
  function handle() {
    setN(n + 1);
    setN(n + 1);
    console.log("in handler:", n);
    setN((x) => x + 1);
  }
  return <button onClick={handle}>{n}</button>;
}
// The user clicks once. What is logged, and what does the button show afterwards?
```

:::hint Show the reason
`n` is `0` in this render's closure: the log prints `in handler: 0`. The updates queue as: set to `1`, set to `1`, then `x => x + 1` applied to the queued value `1` → `2`. The button shows **2**.
:::

## Puzzle 2: stale closure in a timeout

```jsx
function App() {
  const [count, setCount] = useState(0);
  function handleClick() {
    setCount(count + 1);
    setTimeout(() => alert("count is " + count), 3000);
  }
  return <button onClick={handleClick}>{count}</button>;
}
// Click once, then immediately click twice more. What do the three alerts say?
```

:::hint Show the reason
Each click runs the handler from a different render, and each timeout closes over that render's `count`. Click 1: `count` = 0 → alert "count is 0"; click 2 (after re-render) `count` = 1 → "count is 1"; click 3: "count is 2". The alerts show **0, 1, 2**, not the latest value. (The value `count` is a per-render constant.)
:::

## Puzzle 3: a runnable model of batching

```js run title="Puzzle 3: three updates, one render"
let state = { a: 0, b: 0 };
let renders = 0;
const queue = [];

const setState = (update) => queue.push(update);
function flush() {                                    // React does this once per event, then renders once
  for (const u of queue.splice(0)) state = { ...state, ...(typeof u === "function" ? u(state) : u) };
  renders++;
}

function handler() {
  setState({ a: 1 });
  setState((s) => ({ b: s.a + 10 }));
  setState({ a: 5 });
}
handler();
flush();
console.log(state, "renders:", renders);
```

:::hint Show the reason
The queue is processed in order against the evolving state: `a: 1`, then `b = 1 + 10 = 11` (the function sees the queued `a`), then `a: 5`. One render. Output: `{ a: 5, b: 11 } renders: 1`.
:::

## Puzzle 4: the order of effects and renders

```jsx
function Child() {
  console.log("Child render");
  useEffect(() => { console.log("Child effect"); return () => console.log("Child cleanup"); }, []);
  return <p>child</p>;
}
function Parent() {
  console.log("Parent render");
  useEffect(() => { console.log("Parent effect"); return () => console.log("Parent cleanup"); }, []);
  return <Child />;
}
// Mount <Parent /> (production, no Strict Mode), then unmount it. What is logged?
```

:::hint Show the reason
Render goes **parent → child** (parent's function runs first, then it renders its child). Effects run **child → parent** (children commit first). On unmount, cleanups run **parent first, then child** (top-down). Output: `Parent render`, `Child render`, `Child effect`, `Parent effect`; then on unmount: `Parent cleanup`, `Child cleanup`.
:::

## Puzzle 5: Strict Mode

```jsx
function App() {
  useEffect(() => {
    console.log("connect");
    return () => console.log("disconnect");
  }, []);
  return null;
}
// Mounted inside <React.StrictMode> in development. What is logged?
```

:::hint Show the reason
Strict Mode mounts, simulates an unmount, then mounts again: `connect`, `disconnect`, `connect`. In production it is only `connect`. It exists to reveal missing or wrong cleanup.
:::

## Puzzle 6: keys and state

```jsx
function Input({ label }) { const [text, setText] = useState(""); return <label>{label}: <input value={text} onChange={(e) => setText(e.target.value)} /></label>; }

function App() {
  const [order, setOrder] = useState(["A", "B"]);
  return (<>
    {order.map((l, i) => <Input key={i} label={l} />)}
    <button onClick={() => setOrder(["B", "A"])}>swap</button>
  </>);
}
// The user types "1" in the A input and "2" in the B input, then presses swap. What do the two inputs show?
```

:::hint Show the reason
With `key={i}`, React matches by position. After the swap, position 0 now has label "B" but keeps the state of the first instance (text "1"); position 1 has label "A" with text "2". The labels swap but the typed text **stays at the position**: `B: 1`, `A: 2`. With `key={l}` the state would move with the label: `B: 2`, `A: 1`.
:::

## Puzzle 7: a runnable model of memo and inline props

```js run title="Puzzle 7: how many times does the memoised child render?"
const shallowEqual = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => Object.is(a[k], b[k]));
function memo(component) {
  let last, out;
  return (props) => (last && shallowEqual(last, props) ? out : ((last = props), (out = component(props))));
}

function makeChild() {                                            // a fresh memoised child with its own render counter
  let renders = 0;
  const Child = memo((props) => { renders++; return props.label; });
  return { Child, count: () => renders };
}

const stableCallback = () => {};
const variants = {
  "primitive props": () => ({ label: "x", count: 1 }),
  "inline function": () => ({ label: "x", onClick: () => {} }),
  "stable function": () => ({ label: "x", onClick: stableCallback }),
  "inline array": () => ({ label: "x", items: [1, 2] }),
};

const counts = {};
for (const [name, makeProps] of Object.entries(variants)) {
  const { Child, count } = makeChild();
  for (let parentRender = 0; parentRender < 3; parentRender++) Child(makeProps());       // three parent renders
  counts[name] = count();
}
console.log(counts);
```

:::hint Show the reason
With primitive props, or a **stable** function, the props are `Object.is`-equal on parent renders 2 and 3, so the memoised child renders only **once**. An **inline function** or **inline array** is a new reference on every parent render, so the child renders **every time (3)**. Output: `{ 'primitive props': 1, 'inline function': 3, 'stable function': 1, 'inline array': 3 }`.
:::

## Puzzle 8: setState with the same value, and with a mutated object

```jsx
function App() {
  const [user, setUser] = useState({ name: "Asha", visits: 0 });
  console.log("render", user.visits);
  return (
    <>
      <button onClick={() => { user.visits++; setUser(user); }}>mutate</button>
      <button onClick={() => setUser({ ...user, visits: user.visits + 1 })}>copy</button>
      <button onClick={() => setUser((u) => u)}>same</button>
    </>
  );
}
// Click "mutate", then "copy", then "same". What is logged?
```

:::hint Show the reason
Initial: `render 0`. **mutate**: the object is changed in place and the same reference is set: `Object.is` says equal, so React bails out: **no render, nothing logged** (the UI is stale; `visits` is already 1 inside the object). **copy**: a new object with `visits: 2` (1 + 1): `render 2`. **same**: returns the same reference: no render. Logged: `render 0`, `render 2`.
:::

## Puzzle 9: effects with dependencies (a runnable model)

```js run title="Puzzle 9: which renders run the effect?"
const log = [];
let prevDeps;

function commit(label, deps) {
  const changed = !prevDeps || deps.some((d, i) => !Object.is(d, prevDeps[i]));
  if (changed) log.push(label + ": effect runs");
  else log.push(label + ": skipped");
  prevDeps = deps;
}

const obj = { id: 1 };
commit("render 1 (id=1, obj)", [1, obj]);
commit("render 2 (id=1, obj)", [1, obj]);
commit("render 3 (id=2, obj)", [2, obj]);
commit("render 4 (id=2, new object with same content)", [2, { id: 1 }]);
commit("render 5 (NaN)", [NaN, obj]);
commit("render 6 (NaN)", [NaN, obj]);
console.log(log.join("\n"));
```

:::hint Show the reason
Deps compare with `Object.is`: `render 1` runs (first), `render 2` skipped, `render 3` runs (id changed), `render 4` runs (a new object is a new reference even with the same content), `render 5` runs (obj and NaN; NaN changed from 2), `render 6` skipped (`Object.is(NaN, NaN)` is true).
:::

## Puzzle 10: context and memo

```jsx
const Ctx = createContext(0);
const Memo = React.memo(function Memo() { console.log("Memo render"); return <Consumer />; });
function Consumer() { const v = useContext(Ctx); console.log("Consumer render", v); return v; }

function App() {
  const [v, setV] = useState(0);
  return <Ctx.Provider value={v}><Memo /><button onClick={() => setV(v + 1)}>+</button></Ctx.Provider>;
}
// Click the button once. What is logged after the click?
```

:::hint Show the reason
`Memo` has no props, so `React.memo` skips it when the parent re-renders: **no "Memo render"**. But `Consumer` reads the context, and the context value changed, so React re-renders `Consumer` directly even though its parent was skipped: `Consumer render 1`. Context updates bypass memoisation.
:::

## Cheat sheet

| Rule | Remember |
|---|---|
| State in a render | a **snapshot**: `setState` schedules the next render |
| Updates in one event | **batched**: functional updates see the latest queued value |
| Effects order | render parent → child; **effects child → parent**; cleanup parent → child |
| Keys | index keys keep state at the **position**; stable ids keep it with the **item** |
| Same reference | `Object.is` equal ⇒ **no render** (mutation is invisible) |
| `memo` | skips only when **all props** are `Object.is`-equal; context changes still re-render consumers |
| Strict Mode (dev) | mount → unmount → mount: effects run **twice** |

:::keypoints
- Handlers see **their own render's** values: three `setCount(count + 1)` ≠ three increments; use `setCount(c => c + 1)`.
- Timers and listeners close over a **specific render's** state: they can log old values.
- **Effects run child first**, cleanups parent first; Strict Mode doubles effects in development.
- **Index keys** attach state to positions. **Mutating** state and setting the same reference does nothing.
- `React.memo` compares props shallowly by reference: inline objects/functions defeat it; **context** updates bypass it.
:::
