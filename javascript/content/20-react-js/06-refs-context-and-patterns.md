---
title: Refs, context, controlled inputs and composition patterns
level: advanced
time: 35
summary: useRef for DOM access and mutable values, context for passing data without prop drilling (and its cost), controlled vs uncontrolled inputs, composition (children, render props, compound components), error boundaries, and custom hooks.
---

## Refs: a box that does not trigger renders

```jsx
function SearchBox() {
  const inputRef = useRef(null);             // { current: null }, the same object for the life of the component
  const renderCount = useRef(0);
  renderCount.current++;                     // changing a ref does NOT re-render

  useEffect(() => { inputRef.current.focus(); }, []);          // after mount, current is the DOM node
  return <input ref={inputRef} placeholder="search..." />;
}
```

Two uses:

1. **Access a DOM node** (focus, scroll, measure, play a video, integrate a non-React library).
2. **Keep a mutable value across renders** that should **not** cause a render: a timer id, the previous value, the latest callback, a flag "is mounted", an `AbortController`.

```jsx
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => { ref.current = value; });       // updated AFTER render, so during render it holds the PREVIOUS value
  return ref.current;
}

function useLatest(value) {                         // always-fresh value for long-lived callbacks (fixes stale closures)
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
```

Rules: **do not read or write `ref.current` during render** (except for lazy init), because render must be pure. Do it in **effects and event handlers**.

`forwardRef` (React 18) or the plain `ref` **prop** (React 19) lets a parent reach a child's DOM node; `useImperativeHandle` exposes only chosen methods (`focus()`, `reset()`) instead of the raw node.

## Context: avoiding prop drilling

```jsx
const ThemeContext = createContext("light");                 // default value (used when there is no Provider)

function App() {
  const [theme, setTheme] = useState("dark");
  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}><Page /></ThemeContext.Provider>;
}

function DeepButton() {
  const { theme, setTheme } = useContext(ThemeContext);      // no props passed through Page, Layout, Toolbar...
  return <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme}</button>;
}
```

**How context works (model):** a provider holds a value and a list of subscribers; when the value changes by reference, every `useContext` consumer below re-renders (even `React.memo` ones).

```js run title="Context as a model: a value, subscribers, and re-render on change"
function createContext(defaultValue) {
  const ctx = { value: defaultValue, subscribers: new Set() };
  ctx.set = (next) => { if (Object.is(next, ctx.value)) return; ctx.value = next; ctx.subscribers.forEach((rerender) => rerender()); };
  return ctx;
}

const theme = createContext({ mode: "light" });
const renders = { header: 0, sidebar: 0, footer: 0 };

const consumer = (name) => { theme.subscribers.add(() => { renders[name]++; }); };
consumer("header"); consumer("sidebar"); consumer("footer");              // three consumers

theme.set({ mode: "dark" });                                              // new reference: all three re-render
theme.set(theme.value);                                                   // same reference: nothing
theme.set({ mode: "dark" });                                              // equal CONTENT but a new object: all three again!
console.log(renders);
```

Context pitfalls:

- **Every consumer re-renders when the value changes.** Keep the value **stable** (`useMemo`), **split** into several contexts (state vs actions; fast vs slow), or use a **store with selectors** (Zustand, Redux, Jotai) for frequently changing data.
- Context is for **low-frequency, app-wide** data (theme, locale, current user, router), not a general state manager for fast-changing values.
- The default value is only used **without a provider**; avoid relying on it. Provide a **custom hook** that throws when used outside the provider.

```jsx
function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
```

## Controlled vs uncontrolled inputs

| | **Controlled** | **Uncontrolled** |
|---|---|---|
| Source of truth | **React state** | the **DOM** |
| Code | `value={text} onChange={e => setText(e.target.value)}` | `ref` + read `inputRef.current.value` (or `FormData`), `defaultValue` |
| Re-renders on typing | yes, every keystroke | no |
| Good for | live validation, formatting, dependent fields, disabling a button | simple forms, file inputs, big forms where per-keystroke rendering is costly, integrating non-React code |

```jsx
// controlled
const [email, setEmail] = useState("");
<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

// uncontrolled: read once on submit
<form onSubmit={(e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); save(data); }}>
  <input name="email" type="email" defaultValue="" />
  <button>Save</button>
</form>
```

A common bug: switching an input from **uncontrolled to controlled** (`value` starts `undefined`): React warns. Always give controlled inputs a defined initial value (`""`). Libraries like **React Hook Form** (uncontrolled, fast) and **Formik** manage this for big forms; **Zod** validates schemas.

## Composition patterns

**1. `children`: let the parent decide the content** (also avoids re-render cascades).

```jsx
function Card({ title, children }) { return <section><h2>{title}</h2>{children}</section>; }
<Card title="Orders"><OrderList /></Card>
```

**2. Render props / function as a child**: the component supplies data, the caller decides how to render.

```jsx
function MouseTracker({ children }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return <div onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}>{children(pos)}</div>;
}
<MouseTracker>{({ x, y }) => <p>{x}, {y}</p>}</MouseTracker>
// custom hooks now replace most uses: const { x, y } = useMouse();
```

**3. Compound components**: related components share implicit state through context.

```jsx
<Tabs defaultValue="a">
  <Tabs.List><Tabs.Tab value="a">One</Tabs.Tab><Tabs.Tab value="b">Two</Tabs.Tab></Tabs.List>
  <Tabs.Panel value="a">First</Tabs.Panel>
  <Tabs.Panel value="b">Second</Tabs.Panel>
</Tabs>                                              // used by Radix UI, Reach UI, Headless UI
```

**4. Higher-order components (HOC):** a function that takes a component and returns an enhanced one (`withAuth(Page)`). Older; hooks replaced most uses.

**5. Custom hooks**: extract logic (`useFetch`, `useDebounce`, `useLocalStorage`, `useMediaQuery`) so components stay about UI.

```js run title="A debounced value hook, built on our own mini-hooks model" nondet
// a minimal state cell + effect model to show the idea behind useDebouncedValue
function createDebouncedValue(delay, onChange) {
  let timer, shown;
  return {
    update(value) { clearTimeout(timer); timer = setTimeout(() => { shown = value; onChange(shown); }, delay); },   // the effect and its cleanup
  };
}

const seen = [];
const search = createDebouncedValue(40, (v) => seen.push(v));
["j", "ja", "jav"].forEach((v, i) => setTimeout(() => search.update(v), i * 10));         // typing quickly
setTimeout(() => console.log("values that triggered a search:", seen), 150);
```

## Error boundaries

An **error boundary** catches errors thrown **during rendering** (and in lifecycle methods/constructors) of its **children**, shows a fallback, and prevents a white screen. They must be **class components** (or use the `react-error-boundary` library).

```jsx
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }          // switch to the fallback UI
  componentDidCatch(error, info) { reportToService(error, info.componentStack); }   // log
  render() { return this.state.error ? <p>Something went wrong. <button onClick={() => this.setState({ error: null })}>Retry</button></p> : this.props.children; }
}
<ErrorBoundary><Dashboard /></ErrorBoundary>
```

They do **not** catch errors in **event handlers**, **async code** (promises, timers), SSR or the boundary itself. Use `try/catch` for those.

## Portals, fragments, lazy and Suspense in one place

- **`createPortal(children, document.body)`**: render into another DOM node (modals, tooltips) while keeping React tree behaviour (context, events bubble through the React tree).
- **`<>...</>` fragments**: return several elements without a wrapper node.
- **`React.lazy(() => import("./Chart"))` + `<Suspense fallback={<Spinner/>}>`**: load a component's code on demand (code splitting).

:::interview When do you use useRef vs useState? Explain context and its performance problem, and controlled vs uncontrolled components.
"`useState` is for data that should update the UI when it changes; `useRef` is a stable mutable box for DOM nodes and for values like timer ids or the previous value that must persist across renders without causing one, and I do not read or write it during render. Context passes data deep without prop drilling, but every consumer re-renders when the provider's value changes by reference, so I memoise the value, split contexts by update frequency, or use a selector-based store for fast-changing state. A controlled input keeps its value in React state via `value` and `onChange`, giving live validation and control at the cost of a render per keystroke; an uncontrolled input lets the DOM hold the value and I read it with a ref or FormData on submit, which is simpler and cheaper for many forms. I compose with children, custom hooks and compound components, and wrap risky subtrees in error boundaries."
:::

## More interview questions on this topic

:::qa Why doesn't changing `ref.current` re-render the component? {level=easy}
**Say this:** "A ref is a plain object stored outside React's render cycle. React does not track changes to it, so it is perfect for values that must not trigger renders."

**In simple words:** A private notebook that React never reads.
:::

:::qa What is prop drilling and how do you avoid it? {level=easy}
**Say this:** "Passing props through many intermediate components that do not use them. Avoid it with context, composition (passing elements as `children`), or a state library."

**In simple words:** Handing a parcel through five people who do not care about it.
:::

:::qa What can an error boundary not catch? {level=medium}
**Say this:** "Errors in event handlers, asynchronous code like promises and timeouts, server-side rendering, and errors thrown in the boundary itself. Use try/catch or `.catch` for those."

**In simple words:** It only watches rendering.
:::

:::qa What does "lifting state up" mean? {level=easy}
**Say this:** "Moving state to the closest common ancestor of the components that need it, and passing it down by props, so they stay in sync."

**In simple words:** Keep the shared notebook with the common parent.
:::

```quiz
? Which causes a re-render when changed?
- ref.current
+ State set with useState
- A local variable
> Only state/props/context changes trigger renders.
? What happens to context consumers when the provider value is a new object each render?
- Nothing
+ All consumers re-render
- Only memoised ones
> Compared by reference.
? Which input style makes React state the source of truth?
- Uncontrolled
+ Controlled
- defaultValue only
> value + onChange.
```

:::keypoints
- **`useRef`**: DOM access and mutable values that must **not** cause renders. Do not read/write in render.
- **Context**: avoids prop drilling; **all consumers re-render on a new value reference** → memoise the value, **split** contexts, or use a **selector store**.
- **Controlled** (state is truth, per-keystroke render) vs **uncontrolled** (DOM is truth, read on submit); avoid switching.
- **Composition** over inheritance: `children`, custom hooks, compound components. **Error boundaries** (class) catch render errors only.
:::
