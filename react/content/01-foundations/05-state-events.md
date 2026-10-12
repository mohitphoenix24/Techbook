---
title: State & Events
level: easy
time: 30
summary: Make components interactive. Handle clicks and typing, store changing data with useState, update objects and arrays immutably, use updater functions, and understand how rendering really works.
---

Props come from outside; **state** is a component's own memory. A chat input's text, whether a sidebar is open, the list of messages, a loading flag — all state. Changing state is how a React app reacts to the user.

## Responding to events

:::def Event handler
A function React calls when something happens — a click, a key press, a form submit. Pass it as a prop like `onClick={handleClick}` (the function itself, **not** `handleClick()`).
:::

```jsx run level=easy
export default function App() {
  function handleClick() {
    console.log("Button clicked at", new Date().toLocaleTimeString());
  }
  return (
    <div className="row">
      <button onClick={handleClick}>Log a click</button>
      <button onClick={() => console.log("inline arrow handler")}>Inline handler</button>
      <input placeholder="Type here…" onChange={(e) => console.log("typed:", e.target.value)} />
    </div>
  );
}
```

:::warn onClick={fn} not onClick={fn()}
`onClick={handleClick()}` **calls** the function immediately during rendering. Pass the function itself: `onClick={handleClick}`, or wrap it: `onClick={() => handleClick(id)}`.
:::

## useState

:::syntax
```jsx
import { useState } from "react";

const [value, setValue] = useState(initialValue);
setValue(newValue);               // schedule a re-render with the new value
setValue((prev) => prev + 1);     // updater function: compute from the latest value
```
:::

:::def Hook
A special function whose name starts with `use` (like `useState`) that lets components use React features. Hooks must be called at the **top level** of a component — not inside loops, conditions or nested functions.
:::

```jsx run level=easy
import { useState } from "react";

export default function App() {
  const [temperature, setTemperature] = useState(0.7);
  const [open, setOpen] = useState(false);

  return (
    <div className="card stack" style={{ maxWidth: 360 }}>
      <button onClick={() => setOpen(!open)}>{open ? "▼" : "▶"} Advanced settings</button>
      {open && (
        <label className="stack">
          Temperature: <b>{temperature.toFixed(1)}</b>
          <input type="range" min="0" max="1" step="0.1" value={temperature}
                 onChange={(e) => setTemperature(Number(e.target.value))} />
          <span className="muted">{temperature < 0.4 ? "Focused & precise" : temperature < 0.8 ? "Balanced" : "Creative"}</span>
        </label>
      )}
    </div>
  );
}
```

## How rendering works

:::def Render
React calling your component function to get its JSX. A component re-renders when its **state** changes (or its parent re-renders). Each render is a **snapshot**: state values are fixed for that render.
:::

```jsx run level=intermediate
import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  console.log("rendering with count =", count);

  function addThreeWrong() {
    setCount(count + 1);    // count is 0 in this snapshot…
    setCount(count + 1);    // …still 0
    setCount(count + 1);    // …still 0  → ends at 1
  }
  function addThreeRight() {
    setCount((c) => c + 1); // each updater gets the latest value
    setCount((c) => c + 1);
    setCount((c) => c + 1); // → +3
  }
  return (
    <div className="row">
      <b style={{ fontSize: 22 }}>{count}</b>
      <button onClick={addThreeWrong}>+3 (wrong)</button>
      <button onClick={addThreeRight}>+3 (right)</button>
    </div>
  );
}
```

:::def Updater function
Passing a function to the setter — `setCount(c => c + 1)` — tells React "compute the new value from the latest one". Use it whenever the new state depends on the previous state.
:::

:::analogy
State is like a **photo** taken when the component rendered. Inside an event handler you're looking at the photo — calling `setCount` asks React to take a **new photo** after the handler finishes. It doesn't change the photo in your hand.
:::

## Updating objects immutably

:::def Immutable update
Never change (mutate) a state object or array directly. Create a **new** one with the changes and pass it to the setter. React compares old and new by reference — if it's the same object, it may skip the re-render.
:::

```jsx run level=intermediate
import { useState } from "react";

export default function App() {
  const [settings, setSettings] = useState({ model: "claude-opus-5-5", maxTokens: 1024, stream: true });

  function update(field, value) {
    setSettings((prev) => ({ ...prev, [field]: value }));    // copy + change one field
  }

  return (
    <div className="card stack" style={{ maxWidth: 380 }}>
      <select value={settings.model} onChange={(e) => update("model", e.target.value)}>
        <option>claude-opus-5-5</option><option>claude-sonnet-5-5</option><option>claude-haiku-4-5</option>
      </select>
      <input type="number" value={settings.maxTokens} onChange={(e) => update("maxTokens", Number(e.target.value))} />
      <label><input type="checkbox" checked={settings.stream} onChange={(e) => update("stream", e.target.checked)} /> Stream responses</label>
      <pre style={{ margin: 0 }}>{JSON.stringify(settings, null, 2)}</pre>
    </div>
  );
}
```

## Updating arrays immutably

| Goal | Don't (mutates) | Do (new array) |
|---|---|---|
| add | `arr.push(x)` | `[...arr, x]` |
| remove | `arr.splice(i, 1)` | `arr.filter(item => item.id !== id)` |
| replace / edit | `arr[i] = x` | `arr.map(item => item.id === id ? {...item, ...changes} : item)` |
| sort / reverse | `arr.sort()` | `[...arr].sort()` or `arr.toSorted()` |

```jsx run level=intermediate
import { useState } from "react";

let nextId = 3;

export default function App() {
  const [prompts, setPrompts] = useState([
    { id: 1, text: "Summarize this article", starred: true },
    { id: 2, text: "Explain like I'm five", starred: false },
  ]);
  const [draft, setDraft] = useState("");

  const add = () => {
    if (!draft.trim()) return;
    const id = nextId++;                       // side effects go OUTSIDE the updater (updaters must be pure)
    setPrompts((p) => [...p, { id, text: draft.trim(), starred: false }]);
    setDraft("");
  };
  const remove = (id) => setPrompts((p) => p.filter((x) => x.id !== id));
  const toggleStar = (id) => setPrompts((p) => p.map((x) => (x.id === id ? { ...x, starred: !x.starred } : x)));

  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <div className="row">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New saved prompt…"
               onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: 1 }} />
        <button className="primary" onClick={add}>Add</button>
      </div>
      {prompts.map((p) => (
        <div key={p.id} className="card row" style={{ justifyContent: "space-between" }}>
          <span>{p.text}</span>
          <span className="row">
            <button onClick={() => toggleStar(p.id)}>{p.starred ? "★" : "☆"}</button>
            <button onClick={() => remove(p.id)}>✕</button>
          </span>
        </div>
      ))}
    </div>
  );
}
```

## Where should state live?

- If only one component uses it → keep it **inside** that component.
- If several components need it → **lift it up** to their closest common parent and pass it down as props.
- If you can **calculate** it from other state or props → don't store it; compute it during render.

```jsx run level=intermediate
import { useState } from "react";

export default function App() {
  const [messages] = useState([
    { role: "user", text: "Hi", tokens: 2 },
    { role: "assistant", text: "Hello! How can I help?", tokens: 7 },
    { role: "user", text: "Explain state", tokens: 3 },
  ]);
  // ✅ derived values — computed on every render, never out of sync
  const total = messages.reduce((s, m) => s + m.tokens, 0);
  const userCount = messages.filter((m) => m.role === "user").length;
  return <p className="card">{messages.length} messages · {userCount} from you · {total} tokens</p>;
}
```

:::warn Don't duplicate state
Storing `total` in its own `useState` and updating it by hand is a classic source of bugs (it drifts out of sync). Derive it instead.
:::

## Check yourself

```quiz
? What does `setCount(count + 1)` called three times in one click do (count starts at 0)?
+ Sets count to 1
- Sets count to 3
- Throws an error
> Each call reads the same snapshot value 0. Use setCount(c => c + 1) to add 3.

? Which correctly removes the item with id 7 from state?
+ setItems(items.filter(i => i.id !== 7))
- items.splice(index, 1); setItems(items)
- delete items[7]
> Create a new array; never mutate state.

? Where can you call useState?
+ At the top level of a component (or custom hook)
- Inside an if statement
- Inside a for loop
> Hooks must run in the same order on every render.

? Why is `onClick={save()}` a bug?
+ It calls save during render instead of passing it as the handler
- onClick must be lowercase
- Functions can't be props
> Pass the function: onClick={save}.
```

:::exercise Character counter
Build a textarea for a prompt with a live counter "N / 500 characters" that turns red above 450, and a **Clear** button. Disable a **Send** button when the text is empty or over 500.
:::

:::solution
```jsx run
import { useState } from "react";

export default function App() {
  const [text, setText] = useState("");
  const n = text.length;
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a prompt…" />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span style={{ color: n > 450 ? "var(--danger)" : "var(--muted)" }}>{n} / 500 characters</span>
        <span className="row">
          <button onClick={() => setText("")}>Clear</button>
          <button className="primary" disabled={n === 0 || n > 500}>Send</button>
        </span>
      </div>
    </div>
  );
}
```
:::

:::keypoints
- Handle events with props like `onClick={handler}` — pass the function, don't call it.
- `const [value, setValue] = useState(initial)`; setting state triggers a re-render.
- Each render is a snapshot; use **updater functions** when the next state depends on the previous.
- Update objects/arrays **immutably** with spread, `map` and `filter`.
- Keep state minimal: lift it up when shared, derive what you can compute.
:::
