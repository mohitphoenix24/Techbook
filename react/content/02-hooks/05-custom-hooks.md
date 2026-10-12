---
title: Custom Hooks
level: intermediate
time: 28
summary: Extract reusable stateful logic into your own hooks — useLocalStorage, useDebounce, useAsync, useOnlineStatus with useSyncExternalStore — and learn the rules of hooks that make them work.
---

When two components need the same *logic* — not the same UI — you extract it into a **custom hook**. A custom hook is just a function whose name starts with `use` and that calls other hooks. It's the main way React code is reused.

:::def Custom hook
A JavaScript function named `useSomething` that uses other hooks inside. Each component that calls it gets its **own independent** state — hooks share logic, not state.
:::

:::def Rules of hooks
1. Only call hooks at the **top level** of a component or custom hook — never inside conditions, loops or nested functions.
2. Only call hooks from **React functions** (components and custom hooks).
React relies on hooks being called in the same order on every render. (`use()` is the one exception that may be called conditionally.)
:::

## useLocalStorage

```jsx run level=intermediate
import { useEffect, useState } from "react";

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;                  // storage blocked or bad JSON
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue];                 // same shape as useState
}

export default function App() {
  const [model, setModel] = useLocalStorage("pref:model", "claude-opus-5-5");
  const [favs, setFavs] = useLocalStorage("pref:favs", []);
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <select value={model} onChange={(e) => setModel(e.target.value)}>
        <option>claude-opus-5-5</option><option>claude-sonnet-5-5</option><option>claude-haiku-4-5</option>
      </select>
      <button onClick={() => setFavs((f) => (f.includes(model) ? f : [...f, model]))}>★ Favourite this model</button>
      <p>Favourites: {favs.join(", ") || "none"} <span className="muted">(press Reload on the preview — they persist)</span></p>
    </div>
  );
}
```

## useDebounce

:::def Debouncing
Waiting until a value has **stopped changing** for a while before acting on it — e.g. searching only after the user pauses typing for 300 ms, instead of on every keystroke.
:::

```jsx run level=intermediate
import { useEffect, useState } from "react";

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);                 // value changed again → restart the timer
  }, [value, delay]);
  return debounced;
}

export default function App() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 400);
  const [calls, setCalls] = useState(0);

  useEffect(() => {
    if (debouncedQuery) setCalls((c) => c + 1);    // pretend: an embedding search API call
  }, [debouncedQuery]);

  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type quickly…" />
      <span>Typed: <code>{query}</code></span>
      <span>Searched for: <code>{debouncedQuery}</code></span>
      <span className="muted">API calls made: {calls}</span>
    </div>
  );
}
```

## useAsync: loading, error and data in one hook

```jsx run level=intermediate
import { useCallback, useEffect, useState } from "react";

function useAsync(asyncFn, deps) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  const run = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading", error: null }));
    asyncFn()
      .then((data) => !cancelled && setState({ status: "success", data, error: null }))
      .catch((error) => !cancelled && setState({ status: "error", data: null, error }));
    return () => { cancelled = true; };
  }, deps);                                     // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => run(), [run]);
  return { ...state, retry: run };
}

const fetchModels = () => new Promise((resolve, reject) =>
  setTimeout(() => (Math.random() < 0.3 ? reject(new Error("503 Service Unavailable")) :
    resolve(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"])), 700));

export default function App() {
  const { status, data, error, retry } = useAsync(fetchModels, []);
  if (status === "loading" || status === "idle") return <p className="muted">Loading models…</p>;
  if (status === "error") return <p className="error">⚠ {error.message} <button onClick={retry}>Retry</button></p>;
  return <ul>{data.map((m) => <li key={m}>{m}</li>)}</ul>;
}
```

:::tip In real apps, use a data library
For server data, **TanStack Query** (Ecosystem module) gives you caching, deduping, retries and background refresh — far beyond a hand-written `useAsync`. React 19's `use()` + Suspense is another option. Writing `useAsync` once is still the best way to understand what those tools do.
:::

## useSyncExternalStore: subscribing to outside data

:::def useSyncExternalStore
The hook for reading data from a store that lives **outside React** (browser APIs, a global store) safely: give it a `subscribe` function and a `getSnapshot` function, and React re-renders whenever the store changes.
:::

```jsx run level=advanced
import { useSyncExternalStore } from "react";

function subscribe(callback) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnlineStatus() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

function useMediaQuery(query) {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(query); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => matchMedia(query).matches,
  );
}

export default function App() {
  const online = useOnlineStatus();
  const narrow = useMediaQuery("(max-width: 500px)");
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  return (
    <ul>
      <li>Network: {online ? "🟢 online" : "🔴 offline — messages will send when you reconnect"}</li>
      <li>Layout: {narrow ? "📱 narrow" : "🖥 wide"} (resize the window)</li>
      <li>System theme: {prefersDark ? "dark" : "light"}</li>
    </ul>
  );
}
```

## Composing hooks: useChat (preview)

Custom hooks can call other custom hooks. Here's the skeleton of the `useChat` hook you'll build properly in the AI module:

```jsx run level=advanced
import { useCallback, useRef, useState } from "react";

function useChat({ fetchReply }) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("idle");
  const controllerRef = useRef(null);

  const send = useCallback(async (text) => {
    const user = { id: crypto.randomUUID(), role: "user", text };
    setMessages((m) => [...m, user]);
    setStatus("loading");
    controllerRef.current = new AbortController();
    try {
      const reply = await fetchReply(text, controllerRef.current.signal);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: reply }]);
      setStatus("idle");
    } catch (e) {
      setStatus(e.name === "AbortError" ? "idle" : "error");
    }
  }, [fetchReply]);

  const stop = useCallback(() => controllerRef.current?.abort(), []);
  return { messages, status, send, stop };
}

const fakeReply = (text, signal) => new Promise((resolve, reject) => {
  const id = setTimeout(() => resolve(`Echo: ${text}`), 1200);
  signal.addEventListener("abort", () => { clearTimeout(id); reject(new DOMException("aborted", "AbortError")); });
});

export default function App() {
  const { messages, status, send, stop } = useChat({ fetchReply: fakeReply });
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      {messages.map((m) => <div key={m.id} className="card"><b>{m.role}:</b> {m.text}</div>)}
      <div className="row">
        <button className="primary" disabled={status === "loading"} onClick={() => send("Hello hooks!")}>Send</button>
        {status === "loading" && <button onClick={stop}>■ Stop</button>}
        <span className="muted">{status}</span>
      </div>
    </div>
  );
}
```

## More built-in hooks worth knowing

| Hook | Use for |
|---|---|
| `useId()` | unique, stable ids for accessibility attributes (`htmlFor`, `aria-describedby`) |
| `useLayoutEffect` | measuring the DOM before paint |
| `useSyncExternalStore` | subscribing to external stores |
| `useImperativeHandle` | exposing a custom ref API |
| `useDebugValue` | labelling custom hooks in React DevTools |

```jsx run level=intermediate
import { useId } from "react";

function Field({ label, hint }) {
  const id = useId();                       // unique per component instance, stable across renders
  return (
    <div className="stack">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={`${id}-hint`} />
      <small id={`${id}-hint`} className="muted">{hint}</small>
    </div>
  );
}

export default function App() {
  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <Field label="API base URL" hint="Your FastAPI backend" />
      <Field label="Timeout (s)" hint="Default 60" />
    </div>
  );
}
```

## Check yourself

```quiz
? Two components call `useLocalStorage("theme", "dark")`. Do they share state?
- Yes, always
+ No — each call has its own state (they only share the logic; storage sync would need extra work)
- Only if they are siblings
> Custom hooks reuse logic, not state.

? Which is a valid custom hook name?
+ useDebounce
- debounceHook
- UseDebounce
> Hooks must start with "use" (lowercase).

? Why can't you call useState inside an if statement?
+ React identifies hooks by call order, which must be the same every render
- It's slower
- useState only works in loops
> use() is the exception that can be conditional.
```

:::exercise usePrevious and useToggle
Write `useToggle(initial)` returning `[on, toggle]`, and `usePrevious(value)` returning the value from the previous change (hint: keep the current and previous values in state, and update them during render when the value changes — React's recommended pattern). Use both in a component with a toggle button and a counter that shows "now X, before Y".
:::

:::solution
```jsx run
import { useState, useCallback } from "react";

function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((v) => !v), []);
  return [on, toggle];
}

function usePrevious(value) {
  const [current, setCurrent] = useState(value);
  const [previous, setPrevious] = useState(undefined);
  if (value !== current) {     // adjusting state during render when an input changed: allowed
    setPrevious(current);
    setCurrent(value);
  }
  return previous;
}

export default function App() {
  const [on, toggle] = useToggle();
  const [count, setCount] = useState(0);
  const prev = usePrevious(count);
  return (
    <div className="stack">
      <button onClick={toggle}>Streaming: {on ? "ON" : "OFF"}</button>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
      <span>now {count}, before {prev ?? "—"}</span>
    </div>
  );
}
```
:::

:::keypoints
- A custom hook is a `useX` function that calls other hooks — reuse **logic**, not state.
- Follow the **rules of hooks**: top level only, only from components/hooks.
- Classic custom hooks: `useLocalStorage`, `useDebounce`, `useAsync`, `useMediaQuery`, `useOnlineStatus`.
- `useSyncExternalStore` subscribes safely to external data; `useId` creates accessible ids.
:::
