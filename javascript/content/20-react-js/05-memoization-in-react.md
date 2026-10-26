---
title: useMemo, useCallback, React.memo and referential equality
level: advanced
time: 35
summary: What referential equality is, how React.memo, useMemo and useCallback use it, when memoisation actually helps (and when it only costs), how to find unnecessary renders, and what the React Compiler changes.
---

## The key idea: referential equality

In JavaScript, objects, arrays and functions are compared **by reference**. Every time a component renders, **new** objects and functions are created, even with identical contents.

```js run title="Same contents, different references"
const render = () => ({ options: { dark: true }, onClick: () => {}, ids: [1, 2] });

const a = render();
const b = render();
console.log(a.options === b.options, a.onClick === b.onClick, a.ids === b.ids);
console.log(JSON.stringify(a.options) === JSON.stringify(b.options));
console.log(Object.is(1, 1), Object.is("x", "x"), Object.is(NaN, NaN));            // primitives compare by value
```

React compares with `Object.is` in three places: **`React.memo` (props)**, **dependency arrays** (`useEffect`, `useMemo`, `useCallback`), and **state updates**. A new reference every render means "changed" every render.

## The three tools

| Tool | Memoises | Skips... | Compares |
|---|---|---|---|
| **`React.memo(Component)`** | the component's **output** | **re-rendering** the child | props, shallow (`Object.is` per prop) |
| **`useMemo(() => value, deps)`** | a **computed value** | recomputing it | deps |
| **`useCallback(fn, deps)`** | a **function's identity** | creating a new function | deps |

`useCallback(fn, deps)` is exactly `useMemo(() => fn, deps)`.

```js run title="useMemo and useCallback on top of a deps check (a model)"
function createMemoCell() {
  let deps, value, has = false;
  return (factory, nextDeps) => {
    if (has && nextDeps.every((d, i) => Object.is(d, deps[i]))) return value;       // same deps: same reference as before
    has = true; deps = nextDeps; value = factory();
    return value;
  };
}

const useMemoA = createMemoCell(), useCallbackA = createMemoCell(), useMemoB = createMemoCell();
const results = [];
let work = 0;

for (const props of [{ items: [3, 1, 2], dir: "asc" }, { items: [3, 1, 2], dir: "asc" }, { items: [3, 1, 2], dir: "asc" }]) {   // 3 renders: SAME props values; the array prop is a NEW array each time
  const stable = [3, 1, 2];
  const sorted = useMemoA(() => { work++; return [...props.items].sort(); }, [props.items]);          // deps contain a new array: recomputed
  const sortedStable = useMemoB(() => { work += 10; return [...stable].sort(); }, [props.dir]);        // deps are primitives: computed once
  const handler = useCallbackA(() => () => props.dir, [props.dir]);
  results.push(handler);
}
console.log("work units:", work, "(the first memo reran every time, the second only once)", "| same handler identity:", results[0] === results[1] && results[1] === results[2]);
```

## `React.memo` only helps if the props are stable

```jsx
const Row = React.memo(function Row({ item, onSelect, style }) { /* ... */ });

function List({ items }) {
  const [selected, setSelected] = useState(null);

  // BAD: new function and new object on every render => Row's memo never hits
  return items.map((item) => <Row key={item.id} item={item} onSelect={() => setSelected(item.id)} style={{ color: "red" }} />);
}

function ListFixed({ items }) {
  const [selected, setSelected] = useState(null);
  const onSelect = useCallback((id) => setSelected(id), []);              // stable identity (setState is stable)
  return items.map((item) => <Row key={item.id} item={item} onSelect={onSelect} style={ROW_STYLE} />);   // ROW_STYLE: a module constant
}
// Row calls onSelect(item.id) itself
```

Passing **stable references** is half the job: **memo + `useCallback`/`useMemo` for the props** work **together**. One without the other does nothing (or only costs).

## When memoisation helps, and when it does not

**Helps:**

- A **pure child that is expensive to render** (big lists, charts, tables) inside a parent that re-renders often for unrelated reasons.
- A **computation that is genuinely slow** (filtering/sorting thousands of items, heavy parsing): measure it.
- A value used as a **dependency** of `useEffect`, `useMemo` or `React.memo` children, where a new reference would trigger work.
- A value passed to **context providers** (the `value` object): without it, every consumer re-renders each time the provider's parent renders.

**Does not help (or hurts):**

- Cheap components and cheap computations: the memo bookkeeping can cost **more** than the work.
- Props that change every time anyway (a new object each render, `children` JSX).
- Premature everywhere-memoising: more code, more bugs from **wrong dependencies** (stale values), harder to read.

```jsx
// Not worth it: multiplying two numbers is cheaper than the memo bookkeeping
const total = useMemo(() => price * qty, [price, qty]);

// Worth it (if measured): 10,000 items, filtered and sorted on each keystroke elsewhere in the tree
const visible = useMemo(() => items.filter(match(query)).sort(byName), [items, query]);
```

Remember: memoisation is a **performance hint, not a semantic guarantee**. React may discard the cache (it could in the future, for example offscreen). Your code must still be **correct** without it.

## Context and re-renders

All consumers of a context re-render when its **value** changes by reference.

```jsx
// BAD: a new object each render of Provider's parent: every consumer re-renders every time
<ThemeContext.Provider value={{ theme, toggle }}>

// GOOD: a stable value
const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
<ThemeContext.Provider value={value}>
```

Also **split contexts** (state vs dispatch; rarely-changing vs fast-changing values) so components only subscribe to what they need, or use a store with **selectors** (Zustand, Redux `useSelector`, `use-context-selector`).

## Finding unnecessary renders

1. **React DevTools Profiler**: record, look at "Why did this render?" (props changed, hook changed, parent rendered) and flame graph with render times.
2. `console.count("Row render")`, or the "Highlight updates when components render" setting.
3. `why-did-you-render` library in development.
4. Measure with `<Profiler onRender>` or the browser Performance panel before and after.

Typical fixes, in order of preference:

1. **Move state down** (a form's input state into its own small component) or **lift content up** (pass expensive children as `children`: they are created by the parent that does not re-render).
2. **Fix the structure**: do not put frequently changing state in a high-level component.
3. Then `React.memo` + stable props; `useMemo` for slow computations.
4. **Virtualise** long lists (`react-window`, `@tanstack/virtual`).

```jsx
// "children" pattern: SlowTree is created by App, which does not re-render when `n` changes
function App() { return <Counter><SlowTree /></Counter>; }
function Counter({ children }) {
  const [n, setN] = useState(0);
  return <div onClick={() => setN(n + 1)}>{n}{children}</div>;     // children are the same element objects: React skips them
}
```

## The React Compiler (React 19+)

The **React Compiler** (formerly "React Forget") is a build-time tool that **automatically memoises** components, values and callbacks by analysing your code, so you rarely write `useMemo`/`useCallback`/`memo` by hand. It requires code that follows the **Rules of React** (pure render, no mutation of props/state). Until your project uses it, the manual rules above apply; interviews still expect you to understand **referential equality** and why memoisation works.

:::interview What are useMemo, useCallback and React.memo? When would you use them and when not?
"They all rely on referential equality. `React.memo` skips re-rendering a component when its props are shallowly equal by `Object.is`; `useMemo` caches a computed value until its dependencies change; `useCallback` caches a function's identity, so it is `useMemo(() => fn, deps)`. They only help together: a memoised child still re-renders if the parent passes a new inline object or function each render, so I stabilise those props with `useCallback`/`useMemo`, or move them out of the component. I use them for expensive pure children, genuinely slow computations, context provider values and effect dependencies, after measuring with the Profiler. I do not memoise cheap work, because the comparison can cost more than it saves, and wrong dependencies cause stale values. Often restructuring state, passing children, or virtualising a list is better, and the React Compiler can automate memoisation."
:::

## More interview questions on this topic

:::qa Does `React.memo` prevent re-renders from state or context changes inside the child? {level=medium}
**Say this:** "No. It only skips re-renders caused by the parent re-rendering with equal props. The child still re-renders when its own state changes or a context it uses changes."

**In simple words:** It guards the front door (props), not the back door (own state, context).
:::

:::qa Why does passing an inline arrow function as a prop defeat `React.memo`? {level=easy}
**Say this:** "A new function is created on every render, so the prop is never `Object.is`-equal to the previous one, and the memoised child re-renders every time. Use `useCallback` or a stable reference."

**In simple words:** The function looks the same but is a new object each time.
:::

:::qa What are the downsides of overusing `useMemo`/`useCallback`? {level=medium}
**Say this:** "Extra code and memory, comparison costs, harder-to-read components, and a risk of stale values from wrong dependency arrays. Measure first and memoise where it matters."

**In simple words:** Locking every drawer takes more time than it saves.
:::

:::qa How can you avoid re-rendering an expensive child without memo? {level=hard}
**Say this:** "Restructure: move the changing state into a smaller component, or pass the expensive subtree as `children` or a prop created higher up, so its element identity is unchanged and React skips it."

**In simple words:** Put the moving part in its own box so the heavy part is not disturbed.
:::

```quiz
? What does React.memo compare?
- The component's state
+ The props, shallowly with Object.is
- The DOM
> Same props means the previous output is reused.
? Which is equivalent to useCallback(fn, deps)?
- useEffect(fn, deps)
+ useMemo(() => fn, deps)
- useRef(fn)
> It memoises the function value.
? Why wrap a context provider's value in useMemo?
- To make it immutable
+ So consumers do not re-render when the parent re-renders with an equal value
- To share it between apps
> A new object each render notifies all consumers.
```

:::keypoints
- Objects, arrays and functions are new **references** each render; React compares with **`Object.is`** (memo props, deps, state).
- **`React.memo`** (skip child), **`useMemo`** (cache value), **`useCallback`** (stable function = `useMemo(() => fn)`). They must be **used together** with stable props.
- Use for **expensive pure children**, **slow computations**, **effect deps**, **context values**. Not for cheap work; **measure** with the Profiler.
- Better first: **move state down**, pass **`children`**, **virtualise**, split contexts. The **React Compiler** automates memoisation.
:::
