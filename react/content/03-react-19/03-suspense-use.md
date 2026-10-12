---
title: Suspense, use() & lazy
level: advanced
time: 32
summary: Declarative loading states. Read promises during render with use(), show fallbacks with Suspense boundaries, nest boundaries for progressive loading, and code-split components with lazy().
---

Instead of every component juggling `isLoading` flags, React lets a component simply **wait** for its data while a parent **Suspense boundary** shows a fallback. Combined with React 19's `use()`, data loading becomes declarative.

:::def Suspense
A component that shows a **fallback** (like a skeleton or spinner) while any child inside it is still waiting for something — data, code, images. `<Suspense fallback={<Spinner />}>…</Suspense>`.
:::

:::def use()
A React 19 API that reads the value of a **promise** (or a context) during render. If the promise isn't resolved yet, the component "suspends" and the nearest Suspense boundary shows its fallback; when it resolves, React renders again with the value. Unlike hooks, `use` can be called inside conditions and loops.
:::

:::syntax
```jsx
function Profile({ userPromise }) {
  const user = use(userPromise);          // suspends until the promise resolves
  return <h2>{user.name}</h2>;
}

<Suspense fallback={<p>Loading…</p>}>
  <Profile userPromise={userPromise} />
</Suspense>
```
:::

## A first example

```jsx run level=intermediate
import { Suspense, use, useState } from "react";

function fetchAnswer(question) {
  return new Promise((resolve) => setTimeout(() => resolve(`Answer to “${question}”: Suspense handles the waiting.`), 1200));
}

function Answer({ answerPromise }) {
  const answer = use(answerPromise);           // no loading state needed here
  return <div className="card">{answer}</div>;
}

export default function App() {
  const [answerPromise, setAnswerPromise] = useState(null);
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <button className="primary" onClick={() => setAnswerPromise(fetchAnswer("What is Suspense?"))}>Ask</button>
      {answerPromise && (
        <Suspense fallback={<div className="card muted">⏳ Thinking…</div>}>
          <Answer answerPromise={answerPromise} />
        </Suspense>
      )}
    </div>
  );
}
```

:::warn Don't create the promise during render
`use(fetchAnswer(q))` inside a component creates a **new promise on every render** → it suspends forever. Create promises in event handlers (as above), in a parent and pass them down, in a framework loader, or cache them (see below).
:::

## Caching promises

When data should load on first render, keep one promise per key in a cache:

```jsx run level=intermediate
import { Suspense, use, useState } from "react";

const cache = new Map();
function fetchDocs(topic) {
  if (!cache.has(topic)) {
    cache.set(topic, new Promise((resolve) =>
      setTimeout(() => resolve([`${topic}: getting started`, `${topic}: best practices`, `${topic}: FAQ`]), 900)));
  }
  return cache.get(topic);                     // the same promise for the same topic
}

function DocList({ topic }) {
  const docs = use(fetchDocs(topic));
  return <ul>{docs.map((d) => <li key={d}>{d}</li>)}</ul>;
}

export default function App() {
  const [topic, setTopic] = useState("RAG");
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <div className="row">
        {["RAG", "Agents", "Evals"].map((t) => <button key={t} onClick={() => setTopic(t)} className={t === topic ? "primary" : ""}>{t}</button>)}
      </div>
      <Suspense fallback={<p className="muted">Loading {topic} docs…</p>}>
        <DocList topic={topic} />
      </Suspense>
      <span className="muted">Switch back to a topic you've seen — it's instant (cached).</span>
    </div>
  );
}
```

In real apps, frameworks (Next.js, React Router loaders) and data libraries (TanStack Query's `useSuspenseQuery`) handle this caching for you.

## Nested boundaries: progressive loading

Place boundaries where it makes sense for the user. Fast parts appear first; slow parts fill in.

```jsx run level=advanced
import { Suspense, use } from "react";

const delay = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));
const profileP = delay(500, { name: "Ada", plan: "Pro" });
const usageP = delay(1300, { tokens: 182340, requests: 412 });
const historyP = delay(2200, ["RAG architecture", "Prompt review", "Eval results"]);

function Profile() { const p = use(profileP); return <h3>👋 {p.name} <small className="muted">({p.plan})</small></h3>; }
function Usage() { const u = use(usageP); return <p>{u.tokens.toLocaleString()} tokens · {u.requests} requests this month</p>; }
function History() { const h = use(historyP); return <ul>{h.map((x) => <li key={x}>{x}</li>)}</ul>; }

const Skeleton = ({ h = 18, w = "60%" }) => <div style={{ height: h, width: w, borderRadius: 6, background: "var(--border)", margin: "8px 0" }} />;

export default function App() {
  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <Suspense fallback={<Skeleton h={26} w="40%" />}>
        <Profile />
        <Suspense fallback={<Skeleton />}>
          <Usage />
          <Suspense fallback={<><Skeleton w="80%" /><Skeleton w="70%" /></>}>
            <History />
          </Suspense>
        </Suspense>
      </Suspense>
    </div>
  );
}
```

:::tip Skeletons beat spinners
A **skeleton** (grey shapes in the layout of the real content) feels faster than a spinner and prevents layout jumps when content arrives.
:::

## Showing errors

If a promise **rejects**, `use()` throws the error to the nearest **error boundary** (next lessons). Wrap Suspense boundaries in error boundaries in production apps.

## Code splitting with lazy()

:::def lazy()
`const Editor = lazy(() => import("./Editor.jsx"))` loads a component's code **only when it is first rendered**, and suspends while downloading. It keeps the initial JavaScript bundle small.
:::

```jsx run level=intermediate
import { lazy, Suspense, useState } from "react";

// Simulate a separate file being downloaded on demand
const HeavyEditor = lazy(() => new Promise((resolve) => setTimeout(() => resolve({
  default: function HeavyEditor() {
    return <textarea rows={6} style={{ width: "100%" }} defaultValue={"// imagine a 500 KB code editor\nfunction hello() {}"} />;
  },
}), 1000)));

export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <button onClick={() => setOpen(true)}>Open code editor</button>
      {open && (
        <Suspense fallback={<p className="muted">Downloading editor…</p>}>
          <HeavyEditor />
        </Suspense>
      )}
    </div>
  );
}
```

```jsx
// In a real app (Vite/Next split this into its own file automatically):
const CodeEditor = lazy(() => import("./CodeEditor.jsx"));
```

## Transitions keep content visible

When a Suspense boundary is already showing content, updating it inside a **transition** keeps the old content on screen (instead of flashing the fallback) until the new data is ready. You'll see this in the next lesson.

:::ai
Suspense suits AI dashboards: the page shell renders immediately, the conversation list streams in, and slow panels (usage analytics, eval results) show skeletons until ready. With React Server Components, the **server** can stream these boundaries in as their data resolves.
:::

## Check yourself

```quiz
? What does a component do when use(promise) is called and the promise is still pending?
+ It suspends; the nearest Suspense boundary shows its fallback
- It renders undefined
- It throws a syntax error
> React retries rendering when the promise resolves.

? Why is `use(fetch(url))` directly in a component a problem?
+ A new promise is created on every render, so it never settles from React's point of view
- use() can't read fetch
- It's only a style issue
> Create or cache promises outside render.

? What does lazy() do?
+ Loads a component's code only when it's first rendered
- Makes a component render slower on purpose
- Disables a component
> It enables code splitting.

? Can use() be called inside an if statement?
+ Yes — unlike hooks, use() may be called conditionally
- No, never
- Only in class components
> It still must be called inside a component or hook.
```

:::keypoints
- `<Suspense fallback>` shows a fallback while children wait; `use(promise)` reads async values during render.
- Create or **cache** promises outside render; frameworks and data libraries do this for you.
- Nest boundaries for progressive loading; prefer skeletons.
- `lazy(() => import(…))` code-splits components; pair rejected promises with error boundaries.
:::
