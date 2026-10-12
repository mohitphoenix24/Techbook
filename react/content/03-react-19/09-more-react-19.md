---
title: Metadata, Resources & Other React 19 Upgrades
level: advanced
time: 20
summary: The smaller React 19 improvements you'll use all the time — <title> and <meta> from any component, stylesheet precedence, resource preloading, better hydration errors, custom elements — plus a recap of what changed from React 18.
---

Beyond the headline features, React 19 removed a lot of everyday friction. This lesson collects the improvements you'll meet in modern codebases, and a quick "React 18 → 19" cheat sheet.

## Document metadata from any component

:::def Document metadata
Tags like `<title>`, `<meta>` and `<link>` that belong in the page's `<head>`. In React 19, you can render them **anywhere** in your component tree — React hoists them into `<head>` automatically.
:::

```jsx run level=intermediate
import { useEffect, useState } from "react";

function ChatPage({ title, unread }) {
  return (
    <article className="card">
      <title>{unread ? `(${unread}) ${title}` : title}</title>     {/* hoisted to <head> */}
      <meta name="description" content={`Conversation: ${title}`} />
      <h3>{title}</h3>
    </article>
  );
}

function HeadInspector({ watch }) {
  const [title, setTitle] = useState("");
  useEffect(() => setTitle(document.title), [watch]);           // read the DOM after React commits
  return <p className="muted">document.title is now: <code>{title}</code></p>;
}

export default function App() {
  const [unread, setUnread] = useState(0);
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <button onClick={() => setUnread((n) => n + 1)}>Receive a message</button>
      <ChatPage title="RAG architecture" unread={unread} />
      <HeadInspector watch={unread} />
    </div>
  );
}
```

No more `react-helmet` or effects that set `document.title` by hand (frameworks may still offer their own metadata APIs, which build on this).

## Stylesheets with precedence

```jsx
function MarkdownMessage({ html }) {
  return (
    <>
      {/* React inserts this <link> once, in the right order, and waits for it before showing content */}
      <link rel="stylesheet" href="/styles/code-highlight.css" precedence="default" />
      <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
```

With `precedence`, components can declare the CSS they need; React deduplicates it, orders it, and (with Suspense) avoids flashes of unstyled content.

## Resource preloading APIs

```jsx
import { preconnect, prefetchDNS, preload, preinit } from "react-dom";

function ChatShell() {
  preconnect("https://api.example.com");                         // open the connection early
  prefetchDNS("https://cdn.example.com");
  preload("/fonts/Inter.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  preinit("/scripts/markdown-worker.js", { as: "script" });      // download and execute
  return <div>…</div>;
}
```

These let any component tell the browser about resources it will need soon, so they load in parallel instead of in a slow chain.

## Other quality-of-life changes

| React 19 change | What it means for you |
|---|---|
| `ref` as a prop | no more `forwardRef` for function components |
| ref callback cleanups | return a cleanup function from a ref callback |
| `<Context value>` as provider | no more `.Provider` |
| `use(context)` | read context conditionally |
| `useDeferredValue(value, initialValue)` | show an initial value on first render, then defer |
| better hydration error messages | one clear diff instead of many confusing errors |
| custom elements (Web Components) | full support for properties and events |
| `createRoot` error options | `onCaughtError`, `onUncaughtError` for monitoring |
| removed legacy APIs | `propTypes`, `defaultProps` on functions, string refs, `ReactDOM.render` are gone |

```jsx run level=intermediate
import { useDeferredValue, useState, memo } from "react";

const Results = memo(function Results({ query }) {
  if (!query) return <p className="muted">Start typing to search your notes.</p>;
  return <p>Showing notes matching <b>{query}</b></p>;
});

export default function App() {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query, "");          // React 19: initial value for the first render
  return (
    <div className="stack" style={{ maxWidth: 360 }}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…" />
      <Results query={deferred} />
    </div>
  );
}
```

### Default props: use default parameters

```jsx run level=easy
// ❌ React 19 removed defaultProps for function components:
// Avatar.defaultProps = { size: 32 };

// ✅ Use JavaScript default parameters:
function Avatar({ name, size = 32 }) {
  return (
    <span style={{ display: "inline-grid", placeItems: "center", width: size, height: size, borderRadius: "50%", background: "var(--accent)", color: "white", fontWeight: 700 }}>
      {name[0]}
    </span>
  );
}

export default function App() {
  return <div className="row"><Avatar name="Ada" /><Avatar name="Claude" size={48} /></div>;
}
```

## Upgrading from React 18: checklist

1. Upgrade to **React 18.3** first — it warns about everything React 19 removes.
2. `npm install react@latest react-dom@latest` (and `@types/react@latest` for TypeScript).
3. Run the official codemods: `npx codemod@latest react/19/migration-recipe`.
4. Replace `ReactDOM.render` with `createRoot`, `forwardRef` with `ref` props, `defaultProps` with default parameters, `.Provider` with `<Context value>`.
5. Turn on the **React Compiler** and the latest `eslint-plugin-react-hooks`.

:::ai
Small things add up in AI products: `<title>` showing unread replies or "Generating…", `preconnect` to your model gateway so the first request is faster, and stylesheets for code highlighting loaded only when a message actually contains code.
:::

## Check yourself

```quiz
? Where does React 19 put a `<title>` rendered inside a component?
+ In the document <head>
- Where it was rendered in the body
- Nowhere — it's ignored
> Metadata tags are hoisted automatically.

? How do you set default props for a function component in React 19?
+ With default parameter values in the function signature
- With Component.defaultProps
- With propTypes
> defaultProps for function components was removed.

? What does `preconnect(url)` do?
+ Tells the browser to open a connection to that origin early
- Fetches JSON from the URL
- Connects a WebSocket
> It speeds up the first request to that server.
```

:::keypoints
- Render `<title>`, `<meta>`, `<link>` anywhere — React 19 hoists them to `<head>`.
- Stylesheets with `precedence` are deduplicated and ordered; `preload`/`preinit`/`preconnect` speed up resources.
- Everyday upgrades: ref as a prop, ref cleanups, `<Context value>`, `use(context)`, `useDeferredValue` initial value, better errors.
- Removed: `defaultProps` on functions, propTypes, string refs, `ReactDOM.render` — use codemods to upgrade.
:::
