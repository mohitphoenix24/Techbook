---
title: Global State with Zustand
level: intermediate
time: 25
summary: When state is shared across distant parts of the app and changes often, a small store beats context. Learn Zustand — stores, selectors, actions, persistence and middleware — and how to choose between local state, context and a store.
---

Context is great for values that rarely change (theme, user). For **frequently changing, widely shared** state — the active conversation, a list of uploaded files, UI panels — a dedicated store is simpler and faster. **Zustand** is the most popular small option.

:::def Store
An object that lives **outside** your components and holds shared state plus the functions (actions) that change it. Components subscribe to the parts they need.
:::

:::def Selector
A function that picks the part of the store a component cares about: `useStore((s) => s.messages.length)`. The component re-renders **only** when that selected value changes.
:::

:::syntax
```jsx
import { create } from "zustand";

const useChatStore = create((set, get) => ({
  messages: [],
  addMessage: (m) => set((state) => ({ messages: [...state.messages, m] })),
  clear: () => set({ messages: [] }),
}));

const count = useChatStore((s) => s.messages.length);   // in any component
const add = useChatStore((s) => s.addMessage);
```
:::

## A shared store

```jsx run level=intermediate
import { create } from "zustand";

const useChatStore = create((set) => ({
  messages: [{ id: 1, role: "assistant", text: "Hi! I live in a Zustand store." }],
  model: "claude-opus-5-5",
  addMessage: (role, text) => set((s) => ({ messages: [...s.messages, { id: Date.now(), role, text }] })),
  setModel: (model) => set({ model }),
  clear: () => set({ messages: [] }),
}));

function Header() {                                   // re-renders only when model or count changes
  const model = useChatStore((s) => s.model);
  const count = useChatStore((s) => s.messages.length);
  console.log("render Header");
  return <h3>💬 {count} messages · <code>{model}</code></h3>;
}

function ModelPicker() {
  const model = useChatStore((s) => s.model);
  const setModel = useChatStore((s) => s.setModel);
  return (
    <select value={model} onChange={(e) => setModel(e.target.value)}>
      <option>claude-opus-5-5</option><option>claude-sonnet-5-5</option><option>claude-haiku-4-5</option>
    </select>
  );
}

function Messages() {
  const messages = useChatStore((s) => s.messages);
  return messages.map((m) => <div key={m.id} className="card"><b>{m.role}:</b> {m.text}</div>);
}

function Composer() {
  const addMessage = useChatStore((s) => s.addMessage);
  const clear = useChatStore((s) => s.clear);
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); const t = e.currentTarget.text.value.trim(); if (t) { addMessage("user", t); e.currentTarget.reset(); } }}>
      <input name="text" placeholder="Message…" style={{ flex: 1 }} />
      <button className="primary">Send</button>
      <button type="button" onClick={clear}>Clear</button>
    </form>
  );
}

export default function App() {
  return (
    <div className="stack" style={{ maxWidth: 440 }}>
      <Header />
      <ModelPicker />
      <Messages />
      <Composer />
    </div>
  );
}
```

No provider, no prop drilling — components in completely different parts of the tree share the same state.

## Selectors and re-renders

```jsx run level=advanced
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

const useUIStore = create((set) => ({
  sidebarOpen: true,
  theme: "dark",
  typing: "",
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setTyping: (typing) => set({ typing }),
}));

function Sidebar() {
  const open = useUIStore((s) => s.sidebarOpen);                 // ✅ only this field
  console.log("render Sidebar");
  return <div className="card">Sidebar is {open ? "open" : "closed"}</div>;
}

function Toolbar() {
  // pick several fields at once without re-rendering on unrelated changes
  const { theme, toggleSidebar } = useUIStore(useShallow((s) => ({ theme: s.theme, toggleSidebar: s.toggleSidebar })));
  return <div className="row"><button onClick={toggleSidebar}>Toggle sidebar</button><span className="muted">theme: {theme}</span></div>;
}

function Typing() {
  const typing = useUIStore((s) => s.typing);
  const setTyping = useUIStore((s) => s.setTyping);
  return <input value={typing} onChange={(e) => setTyping(e.target.value)} placeholder="Typing doesn't re-render Sidebar" />;
}

export default function App() {
  return <div className="stack" style={{ maxWidth: 380 }}><Toolbar /><Sidebar /><Typing /></div>;
}
```

:::warn Don't select the whole store
`const state = useStore()` (no selector) re-renders the component on **every** change to any field. Select only what you need; use `useShallow` when selecting an object or array of several fields.
:::

## Async actions and get()

```jsx run level=advanced
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

const fakeApi = (q) => new Promise((r) => setTimeout(() => r([`${q}: result 1`, `${q}: result 2`]), 600));

const useSearchStore = create((set, get) => ({
  query: "",
  results: [],
  status: "idle",
  history: [],
  setQuery: (query) => set({ query }),
  search: async () => {
    const { query, history } = get();                 // read current state inside actions
    if (!query.trim()) return;
    set({ status: "loading" });
    try {
      const results = await fakeApi(query);
      set({ results, status: "idle", history: [query, ...history].slice(0, 5) });
    } catch {
      set({ status: "error" });
    }
  },
}));

export default function App() {
  const { query, results, status, history } = useSearchStore(
    useShallow((s) => ({ query: s.query, results: s.results, status: s.status, history: s.history })));
  const { setQuery, search } = useSearchStore.getState();      // actions never change: read once
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <form className="row" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search docs…" />
        <button className="primary" disabled={status === "loading"}>{status === "loading" ? "…" : "Search"}</button>
      </form>
      <ul>{results.map((r) => <li key={r}>{r}</li>)}</ul>
      {history.length > 0 && <span className="muted">Recent: {history.join(", ")}</span>}
    </div>
  );
}
```

## Persisting to localStorage

```jsx run level=advanced
import { create } from "zustand";
import { persist } from "zustand/middleware";

const useSettings = create(
  persist(
    (set) => ({
      model: "claude-opus-5-5",
      systemPrompt: "You are a helpful assistant.",
      update: (patch) => set(patch),
    }),
    { name: "chat-settings" },                   // localStorage key
  ),
);

export default function App() {
  const { model, systemPrompt, update } = useSettings();     // whole store: fine for a tiny settings store
  return (
    <div className="stack" style={{ maxWidth: 400 }}>
      <select value={model} onChange={(e) => update({ model: e.target.value })}>
        <option>claude-opus-5-5</option><option>claude-sonnet-5-5</option><option>claude-haiku-4-5</option>
      </select>
      <textarea rows={3} value={systemPrompt} onChange={(e) => update({ systemPrompt: e.target.value })} />
      <span className="muted">Change something and press Reload on the preview — it's remembered.</span>
    </div>
  );
}
```

## Choosing where state lives

| Kind of state | Best home |
|---|---|
| used by one component (input text, open/closed) | `useState` / `useReducer` |
| shared by a few nearby components | lift state up + props |
| app-wide, rarely changes (theme, user, locale) | Context |
| app-wide, changes often, read in many places (active chat, UI panels, uploads) | **Zustand** (or Redux Toolkit, Jotai) |
| data from a server (lists, details, search results) | **TanStack Query** / framework loaders (next lesson) |
| shareable in the URL (filters, selected tab, page) | the **URL** (router search params) |

:::tip Redux Toolkit and Jotai
**Redux Toolkit** is the standard in many large companies (strong conventions, great DevTools). **Jotai** uses small "atoms" of state. The ideas — a store outside React, selectors, actions — carry over.
:::

:::ai
A typical AI app keeps the **conversation list** and **UI state** (sidebar, active chat, model settings) in a store, **server data** (chat history pages, usage stats) in TanStack Query, and the **composer text** in local state.
:::

## Check yourself

```quiz
? What does a selector like `useStore(s => s.count)` achieve?
+ The component re-renders only when `count` changes
- It copies the store
- It makes the store immutable
> Fine-grained subscriptions avoid needless re-renders.

? Which state belongs in a server-state library rather than Zustand?
+ A list of conversations fetched from your API
- Whether the sidebar is open
- The selected model in the UI
> Server data needs caching, refetching and invalidation.

? Does Zustand need a Provider component?
+ No — the store is a hook you import
- Yes, always
- Only with TypeScript
> That's one reason it's so lightweight.
```

:::keypoints
- `create((set, get) => ({ …state, …actions }))` makes a store hook usable anywhere — no provider.
- Subscribe with **selectors**; use `useShallow` for multiple fields; never select the whole store in hot paths.
- Actions can be async; `get()` reads the current state; `persist` middleware saves to storage.
- Use local state first, context for rarely-changing globals, a store for shared fast-changing state, and a data library for server state.
:::
