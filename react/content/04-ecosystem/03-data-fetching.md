---
title: Server Data with TanStack Query
level: intermediate
time: 30
summary: Fetch, cache and update server data the professional way — queries with loading/error states, caching and background refetching, mutations with invalidation and optimistic updates, pagination and Suspense mode.
---

Data from a server is different from UI state: it's **shared**, can become **stale**, needs **caching**, **retries**, **deduplication** and **refreshing**. Writing all that with `useEffect` is painful and buggy. **TanStack Query** (formerly React Query) handles it for you.

:::def Server state
Data whose source of truth lives on a server (conversations, documents, usage stats). Your app only holds a **cached copy** that may be out of date.
:::

:::def Query
A request for server data identified by a **query key** (like `["chats", userId]`). TanStack Query caches the result under that key, shares it between components, and refetches it when it may be stale.
:::

:::syntax
```jsx
const { data, isPending, isError, error, isFetching, refetch } = useQuery({
  queryKey: ["chats"],                 // cache key (array)
  queryFn: () => api.getChats(),       // returns a promise
  staleTime: 30_000,                   // treat data as fresh for 30s
});
```
:::

## Setup and a first query

```jsx run level=intermediate
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

// ---- a fake backend ----------------------------------------------------------
let calls = 0;
const api = {
  getModels: () => new Promise((resolve) => setTimeout(() => {
    calls += 1;
    resolve([{ id: "claude-opus-5-5", ctx: "1M" }, { id: "claude-sonnet-5-5", ctx: "1M" }, { id: "claude-haiku-4-5", ctx: "200K" }]);
  }, 700)),
};

const queryClient = new QueryClient();

function ModelList() {
  const { data, isPending, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["models"],
    queryFn: api.getModels,
  });
  if (isPending) return <p className="muted">Loading models…</p>;
  if (isError) return <p className="error">{error.message}</p>;
  return (
    <div className="stack">
      <ul>{data.map((m) => <li key={m.id}><code>{m.id}</code> · {m.ctx} context</li>)}</ul>
      <div className="row">
        <button onClick={() => refetch()}>Refetch</button>
        <span className="muted">{isFetching ? "updating…" : `API calls so far: ${calls}`}</span>
      </div>
    </div>
  );
}

function ModelCount() {                       // same query key → shares the cache, no extra request
  const { data } = useQuery({ queryKey: ["models"], queryFn: api.getModels });
  return <h3>{data ? `${data.length} models available` : "…"}</h3>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ModelCount />
      <ModelList />
    </QueryClientProvider>
  );
}
```

Two components use the same query, but only **one** request is made — results are cached and shared by key.

| Flag | Meaning |
|---|---|
| `isPending` | no data yet (first load) |
| `isFetching` | a request is in flight (including background refetches) |
| `isError` / `error` | the last fetch failed (after automatic retries) |
| `data` | the cached result |

## Query keys with parameters

```jsx run level=intermediate
import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, keepPreviousData } from "@tanstack/react-query";

const getMessages = (chatId) => new Promise((r) => setTimeout(() =>
  r([`#${chatId}: Hello`, `#${chatId}: How can I help?`, `#${chatId}: Thanks!`]), 600));

const client = new QueryClient();

function Chat({ chatId }) {
  const { data, isPending, isFetching, isPlaceholderData } = useQuery({
    queryKey: ["chat", chatId, "messages"],        // a different key per chat
    queryFn: () => getMessages(chatId),
    placeholderData: keepPreviousData,             // keep showing the previous chat while the next loads
  });
  if (isPending) return <p className="muted">Loading…</p>;
  return (
    <div className="card" style={{ opacity: isPlaceholderData ? 0.5 : 1 }}>
      {data.map((m) => <div key={m}>{m}</div>)}
      {isFetching && <small className="muted">refreshing…</small>}
    </div>
  );
}

export default function App() {
  const [chatId, setChatId] = useState(1);
  return (
    <QueryClientProvider client={client}>
      <div className="stack" style={{ maxWidth: 360 }}>
        <div className="row">{[1, 2, 3].map((n) => <button key={n} className={n === chatId ? "primary" : ""} onClick={() => setChatId(n)}>Chat {n}</button>)}</div>
        <Chat chatId={chatId} />
        <span className="muted">Revisit a chat: instant from cache, refreshed in the background.</span>
      </div>
    </QueryClientProvider>
  );
}
```

## Mutations and invalidation

:::def Mutation
A request that **changes** server data (create, update, delete). After it succeeds, you **invalidate** related queries so they refetch fresh data.
:::

```jsx run level=intermediate
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

let db = [{ id: 1, title: "Summarise in 3 bullets" }, { id: 2, title: "Explain like I'm five" }];
const api = {
  list: () => new Promise((r) => setTimeout(() => r([...db]), 400)),
  create: (title) => new Promise((resolve, reject) => setTimeout(() => {
    if (!title.trim()) return reject(new Error("Title is required"));
    const item = { id: Date.now(), title };
    db = [...db, item];
    resolve(item);
  }, 500)),
};

const client = new QueryClient();

function SavedPrompts() {
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["prompts"], queryFn: api.list });
  const createPrompt = useMutation({
    mutationFn: api.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prompts"] }),   // refetch the list
  });

  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <form className="row" onSubmit={(e) => { e.preventDefault(); createPrompt.mutate(e.currentTarget.title.value); e.currentTarget.reset(); }}>
        <input name="title" placeholder="New saved prompt" />
        <button className="primary" disabled={createPrompt.isPending}>{createPrompt.isPending ? "Saving…" : "Save"}</button>
      </form>
      {createPrompt.isError && <p className="error">{createPrompt.error.message}</p>}
      <ul>{data.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
    </div>
  );
}

export default function App() {
  return <QueryClientProvider client={client}><SavedPrompts /></QueryClientProvider>;
}
```

## Optimistic updates with Query

```jsx run level=advanced
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

let server = [{ id: 1, title: "RAG design", starred: false }, { id: 2, title: "Agent evals", starred: true }];
const api = {
  list: () => new Promise((r) => setTimeout(() => r(server.map((c) => ({ ...c }))), 300)),
  toggleStar: (id) => new Promise((resolve, reject) => setTimeout(() => {
    if (Math.random() < 0.3) return reject(new Error("Server error"));
    server = server.map((c) => (c.id === id ? { ...c, starred: !c.starred } : c));
    resolve();
  }, 700)),
};
const client = new QueryClient();

function Chats() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["chats"], queryFn: api.list });
  const star = useMutation({
    mutationFn: api.toggleStar,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["chats"] });
      const previous = qc.getQueryData(["chats"]);
      qc.setQueryData(["chats"], (old) => old.map((c) => (c.id === id ? { ...c, starred: !c.starred } : c)));   // instant
      return { previous };
    },
    onError: (err, id, context) => { qc.setQueryData(["chats"], context.previous); console.log("rolled back:", err.message); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["chats"] }),
  });
  return data.map((c) => (
    <div key={c.id} className="card row" style={{ justifyContent: "space-between", maxWidth: 340 }}>
      <span>{c.title}</span>
      <button onClick={() => star.mutate(c.id)}>{c.starred ? "★" : "☆"}</button>
    </div>
  ));
}

export default function App() {
  return <QueryClientProvider client={client}><div className="stack"><Chats /><span className="muted">~30% of stars fail and roll back (see console).</span></div></QueryClientProvider>;
}
```

## Suspense mode

```jsx
import { useSuspenseQuery } from "@tanstack/react-query";

function Usage() {
  const { data } = useSuspenseQuery({ queryKey: ["usage"], queryFn: api.getUsage });   // data is never undefined
  return <p>{data.tokens} tokens</p>;
}

<ErrorBoundary fallback={<p>Couldn't load usage</p>}>
  <Suspense fallback={<Skeleton />}><Usage /></Suspense>
</ErrorBoundary>
```

## Good defaults to know

| Option | Default | Tip |
|---|---|---|
| `staleTime` | `0` (immediately stale) | raise it (e.g. 30 s) for data that rarely changes |
| `gcTime` | 5 minutes | how long unused cache entries are kept |
| `retry` | 3 retries with backoff | lower for user-facing errors you want to show fast |
| `refetchOnWindowFocus` | `true` | users returning to the tab get fresh data |

:::tip Real fetch
`queryFn: async () => { const r = await fetch("/api/chats"); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }` — remember `fetch` doesn't throw on 404/500, so check `r.ok` yourself.
:::

:::ai
Use queries for **conversation lists, chat history, documents, usage and eval results**; mutations for **renaming, deleting, uploading files and saving prompts**. The **live token stream** of an in-progress answer is not a query — handle it with streaming code (AI Interfaces module), then write the final message into the query cache with `setQueryData`.
:::

## Check yourself

```quiz
? Two components call useQuery with the same queryKey. How many requests happen?
+ One — the result is cached and shared
- Two
- It depends on render order
> Requests are deduplicated by key.

? After creating an item with a mutation, how do you refresh the list?
+ queryClient.invalidateQueries({ queryKey: ["items"] })
- Reload the page
- Call useQuery again inside onSuccess
> Invalidation marks it stale and refetches it.

? Difference between isPending and isFetching?
+ isPending = no data yet; isFetching = any request in flight, including background refetches
- They are the same
- isFetching is only for mutations
> Show a full loader only when isPending.
```

:::keypoints
- Server state needs caching, deduping, retries and refreshing — use **TanStack Query** instead of hand-written effects.
- `useQuery({ queryKey, queryFn })`; keys identify cache entries — include parameters.
- `useMutation` + `invalidateQueries` for updates; `onMutate`/`setQueryData` for optimistic changes with rollback.
- Tune `staleTime`; use `useSuspenseQuery` with Suspense + error boundaries.
:::
