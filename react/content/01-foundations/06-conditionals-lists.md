---
title: Conditional Rendering & Lists
level: easy
time: 22
summary: Show different UI for loading, error, empty and success states, render lists with map, and understand keys — why they matter and how to choose them.
---

Real interfaces have many **states**: loading, error, empty, success, streaming. And they're full of **lists**: messages, search results, files, models. This lesson covers both.

## Conditional rendering

| Pattern | Use when |
|---|---|
| `if (…) return …` | early return for whole different screens (loading / error) |
| `cond ? <A/> : <B/>` | choose between two things inline |
| `cond && <A/>` | show something or nothing |
| a variable holding JSX | complex logic, keep the return readable |

```jsx run level=easy
import { useState } from "react";

function ResultPanel({ status, answer, error }) {
  if (status === "loading") return <p className="muted">⏳ Thinking…</p>;           // early return
  if (status === "error") return <p className="error">⚠ {error}</p>;
  if (!answer) return <p className="muted">Ask something to get started.</p>;       // empty state
  return <div className="card">{answer}</div>;                                      // success
}

export default function App() {
  const [status, setStatus] = useState("idle");
  const [answer, setAnswer] = useState("");

  function ask(fail) {
    setStatus("loading");
    setTimeout(() => {
      if (fail) setStatus("error");
      else { setAnswer("React re-renders when state changes. ✨"); setStatus("done"); }
    }, 800);
  }

  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <div className="row">
        <button className="primary" onClick={() => ask(false)}>Ask</button>
        <button onClick={() => ask(true)}>Ask (simulate error)</button>
        <button onClick={() => { setAnswer(""); setStatus("idle"); }}>Reset</button>
      </div>
      <ResultPanel status={status} answer={answer} error="The model is overloaded. Try again." />
    </div>
  );
}
```

:::tip Design every state
For each async UI, design **idle, loading, error, empty and success**. Users notice missing states (blank screens, frozen buttons) more than polish.
:::

### && pitfall with numbers

```jsx run level=easy
export default function App() {
  const unread = 0;
  return (
    <div className="stack">
      <div>Wrong: {unread && <span>🔔 {unread} new</span>}</div>
      <div>Right: {unread > 0 && <span>🔔 {unread} new</span>}</div>
    </div>
  );
}
```

`0 && …` evaluates to `0`, and React renders the number **0**. Make the condition a real boolean: `count > 0 &&`.

## Rendering lists

:::syntax
```jsx
{items.map((item) => (
  <Item key={item.id} {...item} />
))}
```
:::

```jsx run level=easy
const results = [
  { id: "doc-12", title: "Refund policy", score: 0.92, source: "help-center" },
  { id: "doc-07", title: "Cancel your subscription", score: 0.81, source: "help-center" },
  { id: "doc-33", title: "Billing FAQ", score: 0.64, source: "faq" },
];

export default function App() {
  return (
    <div className="stack" style={{ maxWidth: 440 }}>
      <h3>Search results</h3>
      {results.length === 0 ? (
        <p className="muted">No results.</p>
      ) : (
        results.map((r, i) => (
          <div key={r.id} className="card row" style={{ justifyContent: "space-between" }}>
            <span><b>{i + 1}.</b> {r.title} <span className="muted">· {r.source}</span></span>
            <code>{r.score.toFixed(2)}</code>
          </div>
        ))
      )}
    </div>
  );
}
```

## Keys

:::def key
A special prop that gives each list item a **stable identity** among its siblings: `<li key={item.id}>`. React uses keys to match items between renders, so it can keep the right state with the right item when the list changes.
:::

| Good keys | Bad keys |
|---|---|
| database IDs (`message.id`) | array index (when items can be added, removed or reordered) |
| unique stable strings (`file.path`) | `Math.random()` (new key every render!) |
| `crypto.randomUUID()` created **once** when the item is created | |

See why index keys break things — type in a box, then add an item to the **top**:

```jsx run level=intermediate
import { useState } from "react";

function Row({ label }) {
  return (
    <div className="row">
      <span style={{ width: 80 }}>{label}</span>
      <input placeholder={`note for ${label}`} />
    </div>
  );
}

let n = 3;

export default function App() {
  const [items, setItems] = useState([{ id: 1, label: "Item 1" }, { id: 2, label: "Item 2" }]);
  const addToTop = () => {
    const id = n++;
    setItems((list) => [{ id, label: `Item ${id}` }, ...list]);
  };
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 24 }}>
      <div className="stack">
        <b>key = index ❌</b>
        {items.map((it, i) => <Row key={i} label={it.label} />)}
      </div>
      <div className="stack">
        <b>key = id ✅</b>
        {items.map((it) => <Row key={it.id} label={it.label} />)}
      </div>
      <button onClick={addToTop}>Add to top</button>
    </div>
  );
}
```

With index keys, the typed text stays in the first box while the labels shift — the state gets attached to the wrong item. With stable ids, everything moves together.

:::warn Keys must be unique among siblings
Duplicate keys cause React warnings and subtle bugs. Keys only need to be unique within the same list, not globally.
:::

## Grouping and nested lists

```jsx run level=intermediate
const chats = [
  { id: 1, title: "RAG architecture", day: "Today" },
  { id: 2, title: "Fix my React hook", day: "Today" },
  { id: 3, title: "Trip to Kyoto", day: "Yesterday" },
  { id: 4, title: "SQL window functions", day: "Last week" },
];

export default function App() {
  const groups = Object.groupBy ? Object.groupBy(chats, (c) => c.day)
    : chats.reduce((g, c) => ({ ...g, [c.day]: [...(g[c.day] || []), c] }), {});
  return (
    <nav style={{ width: 260 }}>
      {Object.entries(groups).map(([day, items]) => (
        <section key={day} style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>{day}</div>
          {items.map((c) => <div key={c.id} style={{ padding: "6px 8px", borderRadius: 8 }}>💬 {c.title}</div>)}
        </section>
      ))}
    </nav>
  );
}
```

## Filtering and sorting in render

```jsx run level=intermediate
import { useState } from "react";

const models = [
  { id: "opus", name: "Claude Opus 5.5", price: 4, speed: 2 },
  { id: "sonnet", name: "Claude Sonnet 5.5", price: 2, speed: 3 },
  { id: "haiku", name: "Claude Haiku 4.5", price: 1, speed: 5 },
];

export default function App() {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("price");
  const visible = models
    .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
    .toSorted((a, b) => (sortBy === "price" ? a.price - b.price : b.speed - a.speed));
  return (
    <div className="stack" style={{ maxWidth: 400 }}>
      <div className="row">
        <input placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="price">Cheapest first</option>
          <option value="speed">Fastest first</option>
        </select>
      </div>
      {visible.map((m) => <div key={m.id} className="card">{m.name} · ${m.price}/M input tokens · speed {"⚡".repeat(m.speed)}</div>)}
      {visible.length === 0 && <p className="muted">No models match “{query}”.</p>}
    </div>
  );
}
```

:::ai
Chat UIs render a list of messages (key = message id — **not** index, since messages stream in and may be edited or deleted), sidebars render grouped conversation lists, and RAG UIs render ranked results with scores and sources.
:::

## Check yourself

```quiz
? `{count && <Badge />}` with count = 0 renders…
+ The number 0
- Nothing
- The Badge
> Use {count > 0 && <Badge />}.

? Which is the best key for chat messages?
+ The message's unique id
- The array index
- Math.random()
> Stable, unique ids keep state attached to the right item.

? What is an "early return" used for?
+ Returning a different UI (like a loading screen) before the main JSX
- Exiting a loop
- Stopping React from rendering forever
> if (loading) return <Spinner />;
```

:::exercise Notification list
Render a list of notifications `{ id, text, read }`. Show unread ones in bold with a "Mark read" button, show a "🎉 All caught up" message when none are unread, and a count badge `(N unread)` only when N > 0.
:::

:::solution
```jsx run
import { useState } from "react";

export default function App() {
  const [items, setItems] = useState([
    { id: "a", text: "Your eval finished: 92% accuracy", read: false },
    { id: "b", text: "New model available", read: false },
    { id: "c", text: "Invoice paid", read: true },
  ]);
  const unread = items.filter((i) => !i.read).length;
  const markRead = (id) => setItems((list) => list.map((i) => (i.id === id ? { ...i, read: true } : i)));
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <h3>Notifications {unread > 0 && <span style={{ color: "var(--accent)" }}>({unread} unread)</span>}</h3>
      {unread === 0 && <p>🎉 All caught up</p>}
      {items.map((i) => (
        <div key={i.id} className="card row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontWeight: i.read ? 400 : 700 }}>{i.text}</span>
          {!i.read && <button onClick={() => markRead(i.id)}>Mark read</button>}
        </div>
      ))}
    </div>
  );
}
```
:::

:::keypoints
- Use early returns, ternaries and `&&` (with real booleans) to render different states.
- Always design loading, error, empty and success states.
- Render lists with `map`, and give each item a **stable, unique `key`** — not the index when the list changes.
- Filter, sort and group data during render; don't store derived lists in state.
:::
