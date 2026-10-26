---
title: Concurrent React, Suspense, SSR, hydration and Server Components
level: advanced
time: 45
summary: What concurrent rendering gives you (transitions, deferred values), how Suspense works, CSR vs SSR vs SSG vs ISR, what hydration is and why mismatches happen, streaming SSR, and what React Server Components change.
---

## Concurrent rendering: interruptible renders

Before React 18, once rendering started it **could not stop**: a heavy update blocked the main thread, and typing in a search box could lag. **Concurrent rendering** makes the render phase **interruptible**: React can **pause** a low-priority render, handle an **urgent** update (typing, clicking), then resume or **discard** the stale work. It builds on **Fiber** (units of work) and **lanes** (priorities).

You opt in per update, not per app:

```jsx
function Search() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  function onChange(e) {
    setText(e.target.value);                         // URGENT: the input must follow the keyboard immediately
    startTransition(() => setQuery(e.target.value));  // NON-URGENT: the heavy results list may lag and be interrupted
  }
  return (<>
    <input value={text} onChange={onChange} />
    {isPending && <Spinner />}
    <Results query={query} />                         {/* can be rendered in the background */}
  </>);
}
```

| API | Use for |
|---|---|
| **`startTransition` / `useTransition`** | mark a **state update** as non-urgent (navigation, filtering, tab switch); you get `isPending` |
| **`useDeferredValue(value)`** | get a **lagging copy of a value** that updates after urgent work: when you do not control the code that sets the value |
| **`Suspense`** | declare **loading boundaries** around anything that can "wait" |
| **`flushSync`** | the opposite: force a **synchronous** update (rare) |

```jsx
const deferredQuery = useDeferredValue(query);
const stale = query !== deferredQuery;               // show the old results dimmed while the new ones compute
<Results query={deferredQuery} style={{ opacity: stale ? 0.6 : 1 }} />
```

**Important:** concurrent rendering does **not** make code run on another thread. It **time-slices** work on the main thread, yielding between chunks (React's scheduler uses `MessageChannel`, like the event-loop lessons). Your render functions must therefore be **pure and idempotent**, since React may call them more than once.

## Suspense

**Suspense** lets a component say "I am not ready yet" and show a **fallback** for the nearest boundary until it is.

```jsx
<Suspense fallback={<Skeleton />}>
  <Profile />            {/* may suspend while loading code (lazy) or data */}
</Suspense>
```

What can suspend:

- **`React.lazy`** components (code splitting),
- **data fetching** with a Suspense-aware library or framework (TanStack Query with `useSuspenseQuery`, Relay, Next.js, `use(promise)` in React 19),
- **Server Components** streaming.

How it works (model): the component **throws a promise** (older libraries) or calls `use(promise)`; React **catches it** at the nearest `<Suspense>`, shows the fallback, **waits for the promise**, then **re-renders**.

```js run title="Suspense, as a model: a component throws a promise, the boundary shows a fallback and retries"
function createResource(promiseFactory) {
  let status = "pending", result, promise;
  return {
    read() {
      if (status === "pending") { promise ??= promiseFactory().then((v) => { status = "done"; result = v; }, (e) => { status = "error"; result = e; }); throw promise; }
      if (status === "error") throw result;
      return result;
    },
  };
}

const user = createResource(() => new Promise((r) => setTimeout(() => r({ name: "Asha" }), 30)));
const Profile = () => `Hello ${user.read().name}`;                     // "suspends" until ready

async function renderWithSuspense(component, fallback) {
  const frames = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    try { frames.push(component()); break; }
    catch (thrown) {
      if (!(thrown instanceof Promise)) throw thrown;                  // a real error: goes to an error boundary
      frames.push(fallback);                                            // a promise: show the fallback...
      await thrown;                                                     // ...wait for it, then re-render
    }
  }
  return frames;
}

renderWithSuspense(Profile, "Loading...").then((frames) => console.log(frames));
```

Combine **Suspense** (loading) with **Error Boundaries** (failure) around async parts of the UI. Nest several boundaries so that **parts of the page** appear as they are ready ("progressive rendering") instead of one big spinner.

## Where rendering happens: CSR, SSR, SSG, ISR

| Strategy | HTML is produced... | First paint | Good for | Cost |
|---|---|---|---|---|
| **CSR** (client-side rendering) | in the **browser**, by JavaScript | slow (empty HTML, then JS, then data) | dashboards behind login, highly interactive apps | poor SEO/first load unless careful |
| **SSR** (server-side rendering) | on the **server, per request** | fast (HTML arrives ready) | personalised/pages that must be fresh and SEO-friendly | server work per request; TTFB |
| **SSG** (static site generation) | at **build time** | fastest (CDN files) | blogs, docs, marketing | rebuild for content changes |
| **ISR** (incremental static regeneration) | static, **regenerated in the background** after a time or on demand | fast | catalogues, news | some staleness |
| **Streaming SSR** | server sends HTML **in chunks** as Suspense boundaries resolve | fast and progressive | big pages with slow data | needs framework/runtime support |

Frameworks: **Next.js** (App Router), **Remix / React Router 7**, **Astro**, **Gatsby**, **TanStack Start**.

```viz algo=seq title="SSR then hydration"
participant b Browser [browser]
participant s Server [server]
b -> s : GET /products
s --> b : HTML (already rendered) + JS bundle links | The user can SEE the page now, but it is not interactive yet.
b -> b : parse HTML, paint (First Contentful Paint)
b -> s : download JS
b -> b : hydrateRoot(): attach event handlers to the existing DOM | Now the page is interactive (Time to Interactive / INP ready).
```

## Hydration

**Hydration** is React **attaching to the server-rendered HTML**: it renders the components **again in the browser**, **matches** the result to the existing DOM, and **adds event listeners and state**, instead of creating the DOM from scratch.

```jsx
// client entry
import { hydrateRoot } from "react-dom/client";
hydrateRoot(document.getElementById("root"), <App />);   // not createRoot().render(): reuse the server's HTML

// server: renderToString(<App />)  or  renderToPipeableStream(<App />) for streaming
```

### Hydration mismatches

If the HTML React renders **on the client** differs from what the **server** sent, React warns ("Text content does not match server-rendered HTML") and may **throw away and re-render** the subtree. Typical causes: **anything that differs between server and client**:

```jsx
<p>{new Date().toLocaleTimeString()}</p>        // time differs
<p>{Math.random()}</p>                           // random
<p>{typeof window !== "undefined" ? "client" : "server"}</p>   // branches on environment
<p>{localStorage.getItem("name")}</p>            // only exists in the browser
<div><p>...</p></div> inside <p>                  // invalid HTML nesting changes after parsing
```

Fixes:

- Render the **same** thing first on both, then update **after mount** with an effect:

```jsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
return <p>{mounted ? new Date().toLocaleTimeString() : "—"}</p>;
```

- `useId` for ids (stable across server and client). `suppressHydrationWarning` only for intentional tiny differences (a timestamp).
- Do not read `window`/`localStorage` during render. Use effects, or `useSyncExternalStore` with a server snapshot.

React 18 improvements: **selective hydration** (hydrate parts as they arrive, prioritising what the user interacts with) and **streaming**.

## React Server Components (RSC)

**Server Components** run **only on the server** (at request or build time). They can **read databases or files directly**, are **never sent as JavaScript** to the browser (their code and dependencies stay on the server), and send a serialised **description of the UI** (the RSC payload) to the client.

| | **Server Component** (default in Next App Router) | **Client Component** (`"use client"`) |
|---|---|---|
| Runs on | server only | server (for the first HTML) **and** the browser |
| Can use | `async/await`, DB, file system, secrets, heavy libraries | `useState`, `useEffect`, event handlers, browser APIs |
| Sent to the browser as JS? | **No** | **Yes** (the bundle) |
| Interactivity | none | yes |

```jsx
// app/products/page.jsx : a Server Component (no "use client")
import { db } from "@/lib/db";
import AddToCart from "./AddToCart";                         // a Client Component

export default async function Products() {
  const products = await db.product.findMany();               // runs on the server: no API route needed, no secret leaks
  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>{p.name} <AddToCart id={p.id} /></li>     {/* props must be serialisable */}
      ))}
    </ul>
  );
}

// app/products/AddToCart.jsx
"use client";                                                 // everything imported here becomes client code
import { useState } from "react";
export default function AddToCart({ id }) { const [n, setN] = useState(0); return <button onClick={() => setN(n + 1)}>Add ({n})</button>; }
```

Benefits: **less JavaScript shipped** (smaller bundles, faster INP), data access **close to the data**, no waterfalls of client fetches, secrets stay server-side. Rules: Server Components **cannot** use state, effects or browser APIs; props passed from server to client must be **serialisable** (no functions, except **Server Actions**); a client component can render server components passed as **`children`**.

**Server Actions** (`"use server"`): functions that run on the server, callable from forms and client code:

```jsx
async function createPost(formData) { "use server"; await db.post.create({ data: { title: formData.get("title") } }); revalidatePath("/posts"); }
<form action={createPost}><input name="title" /><button>Save</button></form>      // works even before hydration (progressive enhancement)
```

Treat Server Actions like **public API endpoints**: validate input, check **authorisation** every time.

:::interview What are SSR, hydration and React Server Components? What causes hydration errors?
"Server-side rendering produces the HTML on the server so the user sees content immediately and crawlers can index it; the browser then downloads the JavaScript and hydrates: React renders again on the client, matches the existing DOM, and attaches event handlers and state. A hydration mismatch happens when the client render differs from the server HTML, usually because of things like the current time, random values, `window` or `localStorage` access, or invalid HTML nesting; I fix it by rendering the same output first and updating after mount in an effect, using `useId`, and avoiding browser-only APIs during render. Server Components run only on the server and are never shipped as JavaScript, can access databases directly, and send a serialised UI description; client components marked `use client` handle interactivity. Concurrent features like `useTransition`, `useDeferredValue` and Suspense make rendering interruptible and let non-urgent updates and loading states stay responsive."
:::

## More interview questions on this topic

:::qa What is the difference between CSR, SSR and SSG? {level=easy}
**Say this:** "CSR renders in the browser with JavaScript; SSR renders HTML on the server for every request; SSG renders HTML at build time and serves it from a CDN. SSR and SSG give faster first paint and better SEO; SSG is fastest but static; CSR suits app-like pages behind login."

**In simple words:** Cook at the table (CSR), cook in the kitchen when ordered (SSR), or cook in advance (SSG).
:::

:::qa What problem does `useTransition` solve? {level=medium}
**Say this:** "It marks a state update as non-urgent so React can keep urgent updates, like typing, responsive and interrupt the heavy render. You get an `isPending` flag for feedback."

**In simple words:** Let the typing win over the slow list.
:::

:::qa Is concurrent rendering multi-threaded? {level=medium}
**Say this:** "No. It time-slices rendering on the main thread: React can pause, prioritise and discard renders. For real parallelism you still need Web Workers."

**In simple words:** One worker who can put down the task to answer the phone, not two workers.
:::

:::qa Why must components be pure in React 18+? {level=hard}
**Say this:** "Because React may render a component multiple times, pause it, discard it or run it twice in Strict Mode. Side effects or mutations during render would be repeated or leaked."

**In simple words:** Render must be safe to repeat.
:::

```quiz
? What does hydration do?
- Renders HTML on the server
+ Attaches React to server-rendered HTML in the browser (listeners and state)
- Fetches data
> It reuses the existing DOM.
? Which causes a hydration mismatch?
- A constant string
+ Rendering new Date() or Math.random() directly
- Using useState
> Server and client outputs differ.
? What cannot a Server Component use?
- async/await
+ useState and event handlers
- Database access
> Interactivity requires a client component.
```

:::keypoints
- **Concurrent React** = interruptible, prioritised rendering (time-sliced on the main thread): `useTransition`, `useDeferredValue`, **Suspense**. Render must be **pure**.
- **Suspense** = loading boundaries (code, data, streaming); pair with **error boundaries**.
- **CSR / SSR / SSG / ISR / streaming**: trade-offs of first paint, SEO, freshness, server cost.
- **Hydration** attaches handlers to server HTML; **mismatches** come from time/random/`window` differences: render the same first, update after mount.
- **Server Components**: server-only, zero client JS, direct data access; **`"use client"`** for interactivity; **Server Actions** need validation and authz.
:::
