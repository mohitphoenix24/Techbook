---
title: View Transitions & Fragment Refs (React 19.3)
level: advanced
time: 25
summary: The newest stable React features (September 2026). Animate elements entering, leaving and changing with `<ViewTransition>` and `addTransitionType`, and work with a group of DOM nodes through Fragment refs.
---

React 19.3 made two long-awaited experimental features stable: **View Transitions** for smooth animations driven by state changes, and **Fragment refs** for attaching behaviour to a group of elements without a wrapper `<div>`.

## `<ViewTransition>`

:::def View Transition API
A browser feature that snapshots the page before and after a DOM change and animates between the two (cross-fades, slides, morphs). React's `<ViewTransition>` component uses it automatically for updates made inside **transitions**.
:::

:::def ViewTransition (React)
Wrap part of your UI in `<ViewTransition>` and React animates it when, during a transition, it **enters** (is added), **exits** (is removed), **updates** (its content/style changes) or is **shared** (a named ViewTransition moves from one place to another). The default animation is a smooth cross-fade.
:::

:::syntax
```jsx
import { ViewTransition, startTransition } from "react";

startTransition(() => setShow((s) => !s));      // only transition updates animate

{show && (
  <ViewTransition>
    <Panel />
  </ViewTransition>
)}
```
:::

```jsx run level=advanced
import { ViewTransition, startTransition, useState } from "react";

export default function App() {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <button onClick={() => startTransition(() => setShowDetails((s) => !s))}>
        {showDetails ? "Hide" : "Show"} citation details
      </button>
      {showDetails && (
        <ViewTransition>
          <div className="card">
            <b>[1] Refund policy</b>
            <p className="muted">help-center/refunds · relevance 0.92 · retrieved 2s ago</p>
          </div>
        </ViewTransition>
      )}
      <span className="muted">The card fades in and out (browsers with the View Transition API).</span>
    </div>
  );
}
```

:::warn Only transitions animate
Updates not marked as transitions are **urgent** and appear immediately, without animation. Use `startTransition`, a Suspense reveal, or `useDeferredValue` to trigger View Transitions.
:::

### Different animations for different causes: addTransitionType

```jsx run level=advanced
import { ViewTransition, addTransitionType, startTransition, useState } from "react";

const css = `
  ::view-transition-old(.slide-to-left) { animation: 260ms ease-in both slide-out-left; }
  ::view-transition-new(.slide-from-right) { animation: 260ms ease-out both slide-in-right; }
  ::view-transition-old(.slide-to-right) { animation: 260ms ease-in both slide-out-right; }
  ::view-transition-new(.slide-from-left) { animation: 260ms ease-out both slide-in-left; }
  @keyframes slide-out-left { to { transform: translateX(-60px); opacity: 0; } }
  @keyframes slide-in-right { from { transform: translateX(60px); opacity: 0; } }
  @keyframes slide-out-right { to { transform: translateX(60px); opacity: 0; } }
  @keyframes slide-in-left { from { transform: translateX(-60px); opacity: 0; } }
`;

const steps = ["1 · Upload documents", "2 · Choose chunk size", "3 · Pick an embedding model", "4 · Test retrieval"];

export default function App() {
  const [i, setI] = useState(0);
  const go = (dir) => startTransition(() => {
    addTransitionType(dir);                                   // tag WHY this transition happens
    setI((n) => (n + (dir === "next" ? 1 : -1) + steps.length) % steps.length);
  });
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <style>{css}</style>
      <ViewTransition key={i}
        enter={{ next: "slide-from-right", previous: "slide-from-left" }}
        exit={{ next: "slide-to-left", previous: "slide-to-right" }}>
        <div className="card" style={{ fontSize: 18 }}>{steps[i]}</div>
      </ViewTransition>
      <div className="row">
        <button onClick={() => go("previous")}>← Back</button>
        <button className="primary" onClick={() => go("next")}>Next →</button>
      </div>
    </div>
  );
}
```

:::def addTransitionType
Called inside `startTransition`, it labels the transition (e.g. `"next"`, `"previous"`). `<ViewTransition>` props like `enter` and `exit` can map these types to different CSS animation classes.
:::

### Animating Suspense reveals

```jsx run level=advanced
import { Suspense, ViewTransition, startTransition, use, useState } from "react";

const loadAnswer = () => new Promise((r) => setTimeout(() => r("Here's the generated answer, revealed with a smooth animation instead of a jump."), 1000));

function Answer({ promise }) {
  return <div className="card">{use(promise)}</div>;
}

export default function App() {
  const [promise, setPromise] = useState(null);
  return (
    <div className="stack" style={{ maxWidth: 400 }}>
      <button className="primary" onClick={() => startTransition(() => setPromise(loadAnswer()))}>Generate</button>
      {promise && (
        <ViewTransition update="auto" default="none">
          <Suspense fallback={<div className="card muted">Generating…</div>}>
            <Answer promise={promise} />
          </Suspense>
        </ViewTransition>
      )}
    </div>
  );
}
```

`update="auto" default="none"` animates only the **fallback → content** update, so the fallback itself appears instantly — the pattern the React team recommends for snappy Suspense animations.

## Fragment refs

:::def Fragment ref
In React 19.3 you can pass a `ref` to `<Fragment>`. You get a **FragmentInstance** that works with the fragment's DOM children **as a group**: add event listeners, move focus, observe visibility/size, measure and scroll — without adding a wrapper element and without changing the child components.
:::

| FragmentInstance method | Does |
|---|---|
| `addEventListener` / `removeEventListener` / `dispatchEvent` | events on the first-level children |
| `focus()` / `focusLast()` / `blur()` | move focus into the group |
| `observeUsing(observer)` / `unobserveUsing(observer)` | attach an IntersectionObserver or ResizeObserver |
| `getClientRects()`, `getRootNode()`, `compareDocumentPosition()`, `scrollIntoView()` | measure and scroll |

```jsx run level=advanced
import { Fragment, useEffect, useRef, useState } from "react";

// Imagine these come from a UI library and don't accept a ref:
function Suggestion({ text }) {
  return <button style={{ display: "block", margin: "4px 0" }}>{text}</button>;
}

export default function App() {
  const groupRef = useRef(null);
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    const group = groupRef.current;                            // a FragmentInstance
    const onClick = () => setClicks((c) => c + 1);
    group.addEventListener("click", onClick);                  // one listener for the whole group
    return () => group.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="stack" style={{ maxWidth: 360 }}>
      <b>Suggested follow-ups</b>
      <Fragment ref={groupRef}>
        <Suggestion text="Explain it more simply" />
        <Suggestion text="Show a code example" />
        <Suggestion text="What are the trade-offs?" />
      </Fragment>
      <div className="row">
        <button className="primary" onClick={() => groupRef.current.focus()}>Focus first suggestion</button>
        <span className="muted">Suggestion clicks: {clicks}</span>
      </div>
    </div>
  );
}
```

### Visibility tracking without a wrapper

```jsx run level=advanced
import { Fragment, useEffect, useRef, useState } from "react";

function InView({ children, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => onChange(entries.some((e) => e.isIntersecting)));
    ref.current.observeUsing(observer);
    return () => ref.current?.unobserveUsing(observer);
  }, [onChange]);
  return <Fragment ref={ref}>{children}</Fragment>;
}

export default function App() {
  const [visible, setVisible] = useState(false);
  return (
    <div className="stack">
      <span>Footer citations visible: <b>{visible ? "yes 👀" : "no"}</b></span>
      <div style={{ height: 160, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
        <p>Scroll down inside this box…</p>
        <div style={{ height: 240 }} />
        <InView onChange={setVisible}>
          <p className="card">[1] Refund policy</p>
          <p className="card">[2] Billing FAQ</p>
        </InView>
      </div>
    </div>
  );
}
```

## Also new in 19.3

- **`browser()`** (from `react-dom`): `use(browser())` marks a component as browser-only — during server rendering it suspends (showing the nearest Suspense fallback), and in the browser it renders normally. Handy for things like the user's time zone or `localStorage`.
- **Trusted Types** support for apps with strict Content-Security-Policy.
- **Server Components** can render `<Context value>` directly when the context comes from a `'use client'` module.

```jsx
import { Suspense, use } from "react";
import { browser } from "react-dom";

function LocalTime() {
  use(browser());                                     // skip on the server; render in the browser
  return <p>{new Date().toLocaleTimeString()}</p>;
}

<Suspense fallback={<p>…</p>}><LocalTime /></Suspense>
```

:::ai
View Transitions make AI interfaces feel polished: new messages slide in, the "thinking" placeholder morphs into the answer, citation panels open smoothly, and step-by-step agent traces animate between steps. Use them sparingly — animation should clarify what changed, not slow the user down.
:::

## Check yourself

```quiz
? Which updates trigger a `<ViewTransition>` animation?
+ Updates inside a transition (startTransition, Suspense reveals, useDeferredValue)
- Every setState
- Only page navigations
> Urgent updates apply instantly without animation.

? What does addTransitionType let you do?
+ Pick different animations based on why a transition happened (e.g. next vs previous)
- Change the transition's speed
- Disable transitions
> Map types to classes in the enter/exit props.

? What does a Fragment ref give you?
+ A FragmentInstance to work with the fragment's DOM children as a group
- A ref to the first child only
- Nothing — fragments can't have refs
> New in React 19.3.
```

:::keypoints
- `<ViewTransition>` (19.3) animates enter / exit / update / share for updates made inside transitions; default is a cross-fade.
- `addTransitionType` + `enter`/`exit` maps let one component animate differently per cause; `update="auto" default="none"` suits Suspense.
- Fragment refs (19.3) give a `FragmentInstance` for events, focus, observers and measuring a group of children — no wrapper `<div>`.
- `use(browser())` marks browser-only components for server rendering.
:::
