---
title: useEffect — Syncing with the Outside World
level: intermediate
time: 30
summary: What effects are for (timers, subscriptions, browser APIs, network), dependency arrays, cleanup functions, avoiding race conditions — and the many cases where you don't need an effect at all.
---

Components should be **pure**: same props and state in, same JSX out. But apps must also talk to things outside React — timers, WebSockets, the browser's title, `localStorage`, network requests. **Effects** are the escape hatch for that.

:::def Effect
Code that runs **after** React has updated the screen, to synchronise a component with an external system (a timer, a subscription, a browser API, a server). You write it with `useEffect`.
:::

:::syntax
```jsx
useEffect(() => {
  // setup: start something
  return () => {
    // cleanup: stop it (runs before the next effect and on unmount)
  };
}, [dep1, dep2]);   // re-run only when these values change
```
:::

## Dependencies control when it runs

| Dependency array | Effect runs… |
|---|---|
| `[a, b]` | after the first render, and again whenever `a` or `b` changed |
| `[]` | once, after the first render (mount) |
| *(omitted)* | after **every** render (rarely what you want) |

```jsx run level=intermediate
import { useEffect, useState } from "react";

export default function App() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Chat` : "Chat";       // sync the tab title
    console.log("effect ran: title =", document.title);
  }, [unread]);                                                        // only when unread changes

  return (
    <div className="row">
      <button onClick={() => setUnread((n) => n + 1)}>New message</button>
      <button onClick={() => setUnread(0)}>Mark all read</button>
      <span>Unread: {unread}</span>
    </div>
  );
}
```

## Cleanup

:::def Cleanup function
The function returned from an effect. React calls it before re-running the effect and when the component is removed (unmounted). Use it to clear timers, close connections and remove listeners — otherwise they keep running in the background (a leak).
:::

```jsx run level=intermediate
import { useEffect, useState } from "react";

function Stopwatch() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    console.log("▶ start interval");
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      console.log("■ clear interval");          // without this, intervals would pile up
      clearInterval(id);
    };
  }, []);
  return <p className="card">⏱ Generating for {seconds}s…</p>;
}

export default function App() {
  const [show, setShow] = useState(true);
  return (
    <div className="stack">
      <button onClick={() => setShow((s) => !s)}>{show ? "Unmount" : "Mount"} stopwatch</button>
      {show && <Stopwatch />}
    </div>
  );
}
```

### Event listeners

```jsx run level=intermediate
import { useEffect, useState } from "react";

export default function App() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [lastKey, setLastKey] = useState("—");

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const onKey = (e) => setLastKey(e.key);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return <p className="card">Window: {size.w} × {size.h}px · last key pressed (click here first): <code>{lastKey}</code></p>;
}
```

## Fetching data in an effect (and the race-condition trap)

```jsx run level=intermediate
import { useEffect, useState } from "react";

const fakeSearch = (q) => new Promise((resolve) =>
  setTimeout(() => resolve([`${q} — result A`, `${q} — result B`]), 300 + Math.random() * 900));

export default function App() {
  const [query, setQuery] = useState("react");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;                       // flag flipped by cleanup
    setLoading(true);
    fakeSearch(query).then((data) => {
      if (!ignore) {                          // only the LATEST request may update state
        setResults(data);
        setLoading(false);
      }
    });
    return () => { ignore = true; };
  }, [query]);

  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type fast…" />
      {loading && <span className="muted">Searching…</span>}
      <ul>{results.map((r) => <li key={r}>{r}</li>)}</ul>
    </div>
  );
}
```

:::warn Race conditions
Responses can arrive **out of order**. Without the `ignore` flag, a slow reply for "re" could overwrite the reply for "react". Always guard async results in effects — or use `AbortController` to cancel stale requests, or a data library (TanStack Query) or React 19's `use()` with Suspense.
:::

```jsx
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
    .then((r) => r.json())
    .then(setResults)
    .catch((err) => { if (err.name !== "AbortError") setError(err); });
  return () => controller.abort();            // cancel the stale request
}, [query]);
```

## You might not need an effect

Effects are for **external** systems. Many effects in beginner code should be removed:

| Instead of an effect that… | Do this |
|---|---|
| computes a value from props/state and stores it in state | **calculate during render** (`const total = items.reduce(…)`) |
| runs when a button is clicked | put the logic in the **event handler** |
| resets state when a prop changes | give the component a **`key`** that changes |
| caches an expensive calculation | `useMemo` (or rely on the React Compiler) |
| fetches data | a data library, or `use()` + Suspense |

```jsx run level=intermediate
import { useState } from "react";

const messages = [{ text: "Hi", tokens: 2 }, { text: "Hello there!", tokens: 4 }, { text: "Explain effects", tokens: 3 }];

export default function App() {
  const [filter, setFilter] = useState("");

  // ❌ Bad: const [visible, setVisible] = useState([]); useEffect(() => setVisible(...), [filter]);
  // ✅ Good: derive it during render — always in sync, one render instead of two
  const visible = messages.filter((m) => m.text.toLowerCase().includes(filter.toLowerCase()));
  const tokens = visible.reduce((s, m) => s + m.tokens, 0);

  return (
    <div className="stack" style={{ maxWidth: 360 }}>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter messages" />
      {visible.map((m) => <div key={m.text} className="card">{m.text}</div>)}
      <span className="muted">{tokens} tokens shown</span>
    </div>
  );
}
```

## Strict Mode runs effects twice (in development)

:::def Strict Mode
`<StrictMode>` (used by default in new Vite/Next projects) runs your effects **setup → cleanup → setup** once more in development, to reveal missing cleanup. If something breaks or duplicates, your effect needs a proper cleanup. It doesn't happen in production builds.
:::

:::ai
Effects in AI UIs: subscribe to a WebSocket or SSE stream (close it in cleanup!), auto-scroll the message list when a new token arrives, autosave a draft to `localStorage`, and track "time to first token". Starting a chat request when the user clicks Send belongs in the **event handler**, not an effect.
:::

## Check yourself

```quiz
? When does an effect with `[]` dependencies run?
+ Once after the first render (plus cleanup on unmount)
- On every render
- Never
> An empty array means "no dependencies change after mount".

? What should the cleanup of a `setInterval` effect do?
+ Call clearInterval with the interval id
- Nothing — intervals stop automatically
- Call setInterval again
> Otherwise the interval keeps running after unmount.

? You store `fullName` in state and update it in an effect whenever first/last name change. Better?
+ Compute fullName during render from firstName and lastName
- Add more dependencies
- Use two effects
> Derived data doesn't need state or effects.

? Why use an `ignore` flag or AbortController when fetching in an effect?
+ To stop outdated responses from overwriting newer results
- To make requests faster
- Because fetch requires it
> Responses can arrive out of order.
```

:::exercise Autosave draft
Make a textarea whose content is saved to `localStorage` (key `"draft"`) one second after the user stops typing (debounce with `setTimeout` + cleanup), and restored when the component mounts. Show "Saved ✓" after saving.
:::

:::solution
```jsx run
import { useEffect, useState } from "react";

export default function App() {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem("draft") ?? ""; } catch { return ""; }
  });
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setSaved(false);
    const id = setTimeout(() => {
      try { localStorage.setItem("draft", text); } catch {}
      setSaved(true);
    }, 1000);
    return () => clearTimeout(id);            // typing again cancels the pending save
  }, [text]);

  return (
    <div className="stack" style={{ maxWidth: 400 }}>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Start typing — reload the preview and it's still here" />
      <span className="muted">{saved ? "Saved ✓" : "Saving…"}</span>
    </div>
  );
}
```
:::

:::keypoints
- Effects synchronise components with **external systems**; they run after the screen updates.
- The dependency array decides when they re-run; return a **cleanup** to undo the setup.
- Guard async work against **race conditions** (`ignore` flag / `AbortController`).
- Don't use effects for derived data or for reacting to user events — compute in render, act in handlers.
- Strict Mode double-runs effects in development to catch missing cleanups.
:::
