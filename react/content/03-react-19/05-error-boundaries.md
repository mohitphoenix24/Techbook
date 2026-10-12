---
title: Error Boundaries
level: advanced
time: 20
summary: Stop one broken component from blanking the whole app. Build an error boundary, show friendly fallbacks with retry, handle errors from Suspense and Actions, and report errors with React 19's root options.
---

By default, if any component throws while rendering, React removes the **whole** app from the screen — a blank page. **Error boundaries** contain the damage: the broken part shows a fallback, everything else keeps working.

:::def Error boundary
A component that catches JavaScript errors thrown while rendering its children (including errors from `use()` promises and Actions), shows a fallback UI instead, and lets you log the error. Today it's written as a **class component** — the one place modern React still uses classes.
:::

## Building one

```jsx run level=advanced
import { Component, useState } from "react";

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {       // render the fallback on the next render
    return { error };
  }

  componentDidCatch(error, info) {                // log it (send to Sentry, your API, …)
    console.error("Caught by boundary:", error.message);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return this.props.fallback?.(this.state.error, this.reset) ?? <p>Something went wrong.</p>;
    }
    return this.props.children;
  }
}

function FlakyWidget({ crash }) {
  if (crash) throw new Error("The usage chart failed to render (bad data).");
  return <div className="card">📈 Usage chart</div>;
}

export default function App() {
  const [crash, setCrash] = useState(false);
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <button onClick={() => setCrash(true)}>💥 Break the widget</button>
      <ErrorBoundary
        fallback={(error, reset) => (
          <div className="card" style={{ borderColor: "var(--danger)" }}>
            <b className="error">⚠ {error.message}</b>
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={() => { setCrash(false); reset(); }}>Try again</button>
            </div>
          </div>
        )}
      >
        <FlakyWidget crash={crash} />
      </ErrorBoundary>
      <div className="card">💬 The chat keeps working — only the widget is affected.</div>
    </div>
  );
}
```

:::tip Use a library in real apps
`react-error-boundary` gives you a ready-made `<ErrorBoundary FallbackComponent={…} onReset={…}>` plus a `useErrorBoundary()` hook — no class to write.
:::

## What boundaries catch (and don't)

| Caught ✅ | Not caught ❌ (handle with try/catch) |
|---|---|
| errors thrown while **rendering** children | errors in **event handlers** (`onClick`) |
| rejected promises read with `use()` | errors in `setTimeout` / async code outside React |
| errors thrown inside **Actions** (form actions, transitions) | errors in the boundary itself |
| errors in lifecycle/effect code of children | |

## Errors from data loading

Combine an error boundary with Suspense: Suspense handles **waiting**, the boundary handles **failing**.

```jsx run level=advanced
import { Component, Suspense, use, useState } from "react";

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    return this.state.error
      ? <div className="card"><span className="error">⚠ {this.state.error.message}</span> <button onClick={() => { this.setState({ error: null }); this.props.onRetry(); }}>Retry</button></div>
      : this.props.children;
  }
}

let attempt = 0;
function loadSummary() {
  attempt += 1;
  return new Promise((resolve, reject) =>
    setTimeout(() => (attempt === 1 ? reject(new Error("Summary service timed out")) : resolve("Q3 revenue grew 12%; costs rose 20%.")), 800));
}

function Summary({ promise }) {
  return <div className="card">📝 {use(promise)}</div>;
}

export default function App() {
  const [promise, setPromise] = useState(() => loadSummary());
  return (
    <ErrorBoundary onRetry={() => setPromise(loadSummary())}>
      <Suspense fallback={<div className="card muted">Summarising…</div>}>
        <Summary promise={promise} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

The first load fails (on purpose); **Retry** creates a new promise and succeeds.

## Errors thrown in Actions

```jsx run level=advanced
import { Component, useTransition } from "react";

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <p className="error">⚠ Action failed: {this.state.error.message}</p> : this.props.children; }
}

function DeleteChat() {
  const [isPending, startTransition] = useTransition();
  return (
    <button disabled={isPending} onClick={() => startTransition(async () => {
      await new Promise((r) => setTimeout(r, 500));
      throw new Error("You don't have permission to delete this chat.");   // propagates to the boundary
    })}>
      {isPending ? "Deleting…" : "🗑 Delete chat"}
    </button>
  );
}

export default function App() {
  return <ErrorBoundary><DeleteChat /></ErrorBoundary>;
}
```

:::tip Expected vs unexpected errors
Return **expected** errors (validation, "name taken") as state from `useActionState`. Let **unexpected** ones (bugs, permission problems, outages) throw to a boundary.
:::

## Reporting errors: root options (React 19)

```jsx
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root"), {
  onCaughtError: (error, info) => reportToMonitoring(error, info.componentStack),    // caught by a boundary
  onUncaughtError: (error, info) => reportToMonitoring(error, info.componentStack),  // not caught → app unmounts
  onRecoverableError: (error) => console.warn("Recovered:", error),                  // e.g. hydration mismatches
}).render(<App />);
```

## Where to place boundaries

- One near the **root** ("Something went wrong — reload") as a last resort.
- Around **independent widgets** (sidebar, charts, each message's rich content) so one failure stays local.
- Around **routes/pages**, so navigation still works.

:::ai
Wrap each AI message's **rich rendering** (Markdown, code highlighting, charts generated from model output) in a boundary: malformed model output then breaks one bubble, not the whole conversation.
:::

## Check yourself

```quiz
? Which error does an error boundary catch?
+ An error thrown while rendering a child component
- An error inside an onClick handler
- An error inside a setTimeout callback
> Event handlers need try/catch.

? Which method switches a boundary to its fallback?
+ static getDerivedStateFromError
- componentDidMount
- render only
> componentDidCatch is for logging.

? A promise read with use() rejects. Who handles it?
+ The nearest error boundary
- The nearest Suspense boundary
- Nobody — it's ignored
> Suspense = waiting; error boundary = failing.
```

:::keypoints
- An uncaught render error unmounts the whole app; **error boundaries** contain it and show a fallback.
- Boundaries are class components (`getDerivedStateFromError`, `componentDidCatch`) — or use `react-error-boundary`.
- They catch render errors, rejected `use()` promises and errors thrown in Actions — not event handlers.
- Pair Suspense (loading) with error boundaries (failure); report errors with `createRoot` options.
:::
