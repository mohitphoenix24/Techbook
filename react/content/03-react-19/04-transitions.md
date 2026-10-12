---
title: Transitions — useTransition & useDeferredValue
level: advanced
time: 25
summary: Keep the UI responsive during heavy updates. Mark non-urgent updates as transitions, show pending states, defer expensive rendering with useDeferredValue, and avoid jarring Suspense fallbacks.
---

Some updates are **urgent** (typing a letter must appear instantly) and some are **not** (re-filtering 10,000 results, switching a tab that loads data). React's **concurrent rendering** lets you mark non-urgent work as a *transition*, so urgent updates never wait behind it.

:::def Transition
A state update marked as **non-urgent**. React prepares it in the background, can interrupt it if something urgent happens (like another keystroke), and keeps showing the current UI until the new one is ready.
:::

:::syntax
```jsx
const [isPending, startTransition] = useTransition();
startTransition(() => {
  setTab("analytics");           // non-urgent update
});

const deferredQuery = useDeferredValue(query);   // a "lagging" copy of a value
```
:::

## The problem: a slow update blocks typing

```jsx run level=intermediate
import { useState, memo } from "react";

const SlowResults = memo(function SlowResults({ query }) {
  const items = [];
  for (let i = 0; i < 200; i++) {
    const start = performance.now();
    while (performance.now() - start < 0.6) {}             // ~120ms of fake work per render
    items.push(<li key={i}>{query} — result {i}</li>);
  }
  return <ul style={{ maxHeight: 140, overflow: "auto" }}>{items}</ul>;
});

export default function App() {
  const [query, setQuery] = useState("");
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type fast — notice the lag 😖" />
      <SlowResults query={query} />
    </div>
  );
}
```

## useDeferredValue: let the slow part lag behind

:::def useDeferredValue
Returns a copy of a value that **lags behind** during busy periods. Urgent UI (the input) uses the real value; slow UI (the results) uses the deferred one, rendered in the background and abandoned if the value changes again.
:::

```jsx run level=intermediate
import { useDeferredValue, useState, memo } from "react";

const SlowResults = memo(function SlowResults({ query }) {
  const items = [];
  for (let i = 0; i < 200; i++) {
    const start = performance.now();
    while (performance.now() - start < 0.6) {}
    items.push(<li key={i}>{query} — result {i}</li>);
  }
  return <ul style={{ maxHeight: 140, overflow: "auto" }}>{items}</ul>;
});

export default function App() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const stale = query !== deferredQuery;
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type fast — smooth now 😌" />
      <div style={{ opacity: stale ? 0.5 : 1, transition: "opacity .2s" }}>
        <SlowResults query={deferredQuery} />
      </div>
    </div>
  );
}
```

Typing stays instant; the results update when React has time, and fade while they're out of date. (`memo` matters: it lets React skip `SlowResults` during the urgent render, because its deferred prop hasn't changed yet.)

## useTransition: mark an update as non-urgent

```jsx run level=intermediate
import { useState, useTransition, memo } from "react";

const Tab = memo(function Tab({ name }) {
  const start = performance.now();
  if (name === "analytics") while (performance.now() - start < 400) {}   // a slow tab
  return <div className="card" style={{ minHeight: 60 }}>{name === "analytics" ? "📊 Heavy analytics panel" : `📄 ${name} tab`}</div>;
});

export default function App() {
  const [tab, setTab] = useState("chat");
  const [isPending, startTransition] = useTransition();
  const select = (t) => startTransition(() => setTab(t));
  return (
    <div className="stack" style={{ maxWidth: 400 }}>
      <div className="row">
        {["chat", "analytics", "settings"].map((t) => (
          <button key={t} className={t === tab ? "primary" : ""} onClick={() => select(t)}>{t}</button>
        ))}
        {isPending && <span className="muted">loading…</span>}
      </div>
      <Tab name={tab} />
    </div>
  );
}
```

Click **analytics** then quickly **settings**: React abandons the slow render and switches straight to settings — the buttons never freeze.

| | `useTransition` | `useDeferredValue` |
|---|---|---|
| you control | the **state update** (you call `startTransition`) | a **value** you receive (prop or state) |
| gives you | `isPending` flag | a lagging copy of the value |
| typical use | switching tabs/pages, filters, async actions | expensive rendering driven by typing |

## Transitions and Suspense

When a transition causes a component to suspend, React **keeps the old content visible** instead of replacing it with the fallback — no jarring flash back to a spinner.

```jsx run level=advanced
import { Suspense, use, useState, useTransition } from "react";

const cache = new Map();
const load = (id) => {
  if (!cache.has(id)) cache.set(id, new Promise((r) => setTimeout(() => r(`Conversation #${id}: ${"lorem ipsum ".repeat(6)}`), 900)));
  return cache.get(id);
};

function Conversation({ id }) {
  const text = use(load(id));
  return <div className="card">{text}</div>;
}

export default function App() {
  const [id, setId] = useState(1);
  const [isPending, startTransition] = useTransition();
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <div className="row">
        {[1, 2, 3, 4].map((n) => (
          <button key={n} onClick={() => startTransition(() => setId(n))} className={n === id ? "primary" : ""}>Chat {n}</button>
        ))}
      </div>
      <div style={{ opacity: isPending ? 0.5 : 1 }}>
        <Suspense fallback={<div className="card muted">Loading conversation…</div>}>
          <Conversation id={id} />
        </Suspense>
      </div>
      <span className="muted">The fallback shows only the first time; afterwards the old chat stays visible (dimmed) while the next loads.</span>
    </div>
  );
}
```

:::warn Inputs must not be transitions
Don't wrap the update of a **controlled input's value** in a transition — typing must be urgent. Keep `setQuery` urgent and defer the expensive consumer instead (with `useDeferredValue`).
:::

:::ai
In AI UIs: keep the composer instant while a big conversation re-renders, switch between chats with a transition (old chat stays visible until the new one loads), and defer re-filtering of long result lists in RAG search UIs.
:::

## Check yourself

```quiz
? Which update should be urgent (not a transition)?
+ Updating the text of an input as the user types
- Re-filtering 10,000 search results
- Switching to a tab that loads data
> Typing must feel instant.

? What does useDeferredValue return?
+ A copy of the value that may lag behind during heavy work
- A Promise
- The previous render's value always
> Use it for expensive rendering driven by fast-changing values.

? A transition makes a component suspend while content is already shown. What happens?
+ React keeps the old content visible until the new content is ready
- The fallback replaces the content immediately
- The update is cancelled
> That avoids jarring loading flashes.
```

:::keypoints
- **Transitions** mark updates as non-urgent; React can interrupt them and keeps the current UI visible.
- `useTransition()` → `[isPending, startTransition]` for state updates you trigger.
- `useDeferredValue(value)` gives a lagging copy for expensive rendering (pair with `memo`).
- Transitions + Suspense avoid flashing fallbacks; keep input updates urgent.
:::
