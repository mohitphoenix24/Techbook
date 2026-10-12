---
title: Performance — memo, useMemo, useCallback & the Compiler
level: intermediate
time: 28
summary: Understand why components re-render, measure before optimising, skip work with memo / useMemo / useCallback, render huge lists efficiently, and know what the React Compiler now does for you automatically.
---

React is fast by default. Performance work is about avoiding **unnecessary work**: re-rendering components whose output didn't change, or recalculating something expensive. Since React Compiler 1.0 (2025), much of this is automated — but you still need to understand it.

## Why components re-render

:::def Re-render
React calling a component function again. It happens when the component's **state** changes, its **parent** re-renders, or a **context** it reads changes. Re-rendering is cheap; React then updates only the DOM parts that actually changed.
:::

```jsx run level=intermediate
import { useState } from "react";

function Child({ label }) {
  console.log(`render <Child ${label}>`);
  return <li>{label}</li>;
}

export default function App() {
  const [count, setCount] = useState(0);
  console.log("render <App>");
  return (
    <div className="stack">
      <button onClick={() => setCount((c) => c + 1)}>Clicked {count}×</button>
      <ul><Child label="sidebar" /><Child label="footer" /></ul>
      <p className="muted">Open the Console: both children re-render on every click, even though their props never change.</p>
    </div>
  );
}
```

That's usually **fine**. It only matters when a child is expensive (big lists, charts, heavy calculations).

## memo: skip re-rendering when props are the same

:::def React.memo
Wraps a component so React **skips re-rendering** it when its props are equal (shallowly) to last time. `const Fast = memo(Slow)`.
:::

```jsx run level=intermediate
import { memo, useState } from "react";

const ExpensiveChart = memo(function ExpensiveChart({ data }) {
  console.log("🐢 rendering chart");
  const start = performance.now();
  while (performance.now() - start < 30) {}         // simulate 30ms of heavy work
  return <div className="card">📈 Chart of {data.length} points</div>;
});

const DATA = Array.from({ length: 500 }, (_, i) => Math.sin(i / 20));   // created once, outside the component

export default function App() {
  const [text, setText] = useState("");
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type — the chart doesn't re-render" />
      <ExpensiveChart data={DATA} />
    </div>
  );
}
```

## useMemo and useCallback: keep values stable

`memo` compares props by reference. A new array/object/function created on every render is a **different** reference each time — so `memo` can't skip.

:::def useMemo
Caches the **result of a calculation** between renders: `const sorted = useMemo(() => sortBig(list), [list])` — recomputed only when `list` changes.
:::

:::def useCallback
Caches a **function** between renders: `const onSelect = useCallback((id) => …, [deps])`. It's `useMemo` for functions — useful when passing callbacks to memoised children.
:::

```jsx run level=advanced
import { memo, useCallback, useMemo, useState } from "react";

const DOCS = Array.from({ length: 3000 }, (_, i) => ({ id: i, title: `Document ${i}`, score: Math.random() }));

const ResultList = memo(function ResultList({ items, onPick }) {
  console.log("render ResultList with", items.length, "items");
  return (
    <ul style={{ maxHeight: 150, overflow: "auto" }}>
      {items.slice(0, 50).map((d) => <li key={d.id} onClick={() => onPick(d.id)} style={{ cursor: "pointer" }}>{d.title} — {d.score.toFixed(2)}</li>)}
    </ul>
  );
});

export default function App() {
  const [minScore, setMinScore] = useState(0.5);
  const [picked, setPicked] = useState(null);
  const [notes, setNotes] = useState("");

  const visible = useMemo(() => {                       // expensive filter + sort, cached
    console.log("computing visible…");
    return DOCS.filter((d) => d.score >= minScore).sort((a, b) => b.score - a.score);
  }, [minScore]);

  const onPick = useCallback((id) => setPicked(id), []); // stable function → memo works

  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <label>Min score {minScore.toFixed(2)} <input type="range" min="0" max="1" step="0.05" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} /></label>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Typing here won't recompute or re-render the list" />
      <ResultList items={visible} onPick={onPick} />
      <span>Picked: {picked ?? "—"} · {visible.length} matching</span>
    </div>
  );
}
```

:::warn Don't memoise everything
`useMemo`/`useCallback`/`memo` have a cost (memory + comparisons) and make code harder to read. Use them when you've **measured** a problem, for genuinely expensive calculations, or for values passed to memoised children — or let the React Compiler do it.
:::

## The React Compiler

:::def React Compiler
A build-time tool (stable since v1.0, October 2025) that analyses your components and **automatically adds memoisation** where it's safe — effectively applying `memo`, `useMemo` and `useCallback` for you. It requires code that follows the Rules of React (pure components, no mutating props/state).
:::

```bash
# Vite / Babel setup
npm install -D babel-plugin-react-compiler
# vite.config.js → react({ babel: { plugins: ["babel-plugin-react-compiler"] } })
# Next.js → next.config: { reactCompiler: true }
```

With the compiler enabled, the example above works efficiently **without** writing `memo`, `useMemo` or `useCallback`. Many teams adopting it remove most manual memoisation. The rules still matter — the compiler skips components that break them (and its ESLint plugin tells you why).

## Rendering long lists: virtualisation

:::def Virtualisation (windowing)
Rendering only the list items currently **visible** in the scroll area (plus a few extra), instead of all 10,000. The DOM stays small, so scrolling stays smooth. Libraries: TanStack Virtual, react-window.
:::

```jsx run level=advanced
import { useState } from "react";

const ROWS = Array.from({ length: 10000 }, (_, i) => `Log line ${i}: request handled in ${(i * 7) % 300} ms`);
const ROW_HEIGHT = 26, VIEW_HEIGHT = 260, OVERSCAN = 5;

export default function App() {
  const [scrollTop, setScrollTop] = useState(0);
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(ROWS.length, Math.ceil((scrollTop + VIEW_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  return (
    <div className="stack" style={{ maxWidth: 480 }}>
      <span className="muted">Rendering rows {first}–{last} of {ROWS.length.toLocaleString()}</span>
      <div onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
           style={{ height: VIEW_HEIGHT, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
        <div style={{ height: ROWS.length * ROW_HEIGHT, position: "relative" }}>
          {ROWS.slice(first, last).map((text, i) => (
            <div key={first + i} style={{ position: "absolute", top: (first + i) * ROW_HEIGHT, height: ROW_HEIGHT, padding: "3px 10px", fontFamily: "monospace", fontSize: 13 }}>
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

## A performance checklist

1. **Measure first**: React DevTools Profiler shows which components render and how long they take; the browser Performance panel shows the rest.
2. **Move state down**: keep fast-changing state (like input text) in the smallest component that needs it, so typing doesn't re-render the whole page.
3. **Lift content up**: pass expensive parts as `children` — they won't re-render when the wrapper's state changes.
4. **Virtualise** long lists; **paginate** or **lazy-load** heavy content.
5. **Code-split** with `lazy()` so users download less JavaScript up front (Modern React module).
6. Use **transitions** (`useTransition`, `useDeferredValue`) to keep typing responsive during heavy updates (Modern React module).
7. Turn on the **React Compiler**.

```jsx run level=intermediate
import { useState } from "react";

function SlowTree() {
  console.log("🐢 SlowTree rendered");
  return <div className="card">An expensive part of the page</div>;
}

function Composer() {                      // state moved DOWN: only this re-renders while typing
  const [text, setText] = useState("");
  return <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type here — SlowTree stays quiet" />;
}

export default function App() {
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <Composer />
      <SlowTree />
    </div>
  );
}
```

:::ai
Streaming chat UIs update state for **every token** — dozens of times per second. Keep the streaming message in its own small component (or state), memoise the long list of past messages (or let the compiler do it), and virtualise very long conversations.
:::

## Check yourself

```quiz
? A parent re-renders. What happens to its children by default?
+ They re-render too (unless memoised)
- Nothing
- They unmount
> Re-rendering is usually cheap; memo skips it when props are unchanged.

? Why might `memo(Child)` still re-render with `<Child onPick={() => …} />`?
+ A new function is created every render, so the prop is never equal
- memo doesn't work with functions
- Because Child has no state
> Stabilise it with useCallback — or let the React Compiler do it.

? What does the React Compiler do?
+ Automatically memoises components and values at build time
- Compiles React to C++
- Makes effects run faster
> It removes most of the need for manual memo/useMemo/useCallback.

? What is list virtualisation?
+ Rendering only the visible rows of a long list
- Storing the list in a virtual machine
- Converting the list to a table
> It keeps the DOM small and scrolling smooth.
```

:::keypoints
- Re-renders are normal; optimise only measured problems.
- `memo` skips re-renders with equal props; `useMemo` caches values; `useCallback` caches functions.
- The **React Compiler** (v1.0+) adds memoisation automatically for code that follows the rules.
- Move fast state down, pass heavy parts as children, virtualise long lists.
:::
