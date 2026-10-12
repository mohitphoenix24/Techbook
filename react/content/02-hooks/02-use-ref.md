---
title: useRef — DOM Access & Mutable Values
level: intermediate
time: 25
summary: Reach real DOM elements (focus, scroll, measure), keep values that shouldn't trigger re-renders (timers, previous values), pass refs as plain props in React 19, and auto-scroll a chat.
---

Most of the time React manages the DOM for you. But sometimes you need to **touch the real element** — focus an input, scroll to the newest message, measure a box. And sometimes you need to **remember** something without re-rendering — a timer id, the previous value. That's what refs are for.

:::def Ref
A plain object `{ current: … }` that React keeps for the lifetime of a component. Changing `ref.current` does **not** cause a re-render. Created with `useRef(initialValue)`.
:::

:::syntax
```jsx
const inputRef = useRef(null);       // for a DOM element
<input ref={inputRef} />             // React sets inputRef.current = the <input> element
inputRef.current.focus();            // use it in handlers or effects (not during render)

const countRef = useRef(0);          // for a mutable value
countRef.current += 1;               // no re-render
```
:::

## Focusing and selecting

```jsx run level=easy
import { useRef } from "react";

export default function App() {
  const inputRef = useRef(null);
  return (
    <div className="row">
      <input ref={inputRef} defaultValue="Explain closures in JavaScript" style={{ width: 280 }} />
      <button onClick={() => inputRef.current.focus()}>Focus</button>
      <button onClick={() => inputRef.current.select()}>Select all</button>
    </div>
  );
}
```

## Auto-scrolling a chat

The classic AI-UI ref: keep the newest message in view as messages arrive.

```jsx run level=intermediate
import { useEffect, useRef, useState } from "react";

const replies = ["Sure!", "Here's an idea.", "Refs are great for scrolling.", "Anything else?", "👍"];

export default function App() {
  const [messages, setMessages] = useState(["Hi! Ask me anything."]);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);                                  // after each new message

  const add = () => setMessages((m) => [...m, `You: question ${m.length}`, `Bot: ${replies[m.length % replies.length]}`]);

  return (
    <div className="stack" style={{ maxWidth: 360 }}>
      <div style={{ height: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 12, padding: 10 }}>
        {messages.map((m, i) => <p key={i} style={{ margin: "6px 0" }}>{m}</p>)}
        <div ref={bottomRef} />
      </div>
      <button className="primary" onClick={add}>Send a message</button>
    </div>
  );
}
```

:::tip Don't yank the user
Real chat UIs only auto-scroll if the user is already near the bottom — if they scrolled up to read, keep their position and show a "↓ New messages" button instead.
:::

## Measuring elements

```jsx run level=intermediate
import { useLayoutEffect, useRef, useState } from "react";

export default function App() {
  const boxRef = useRef(null);
  const [text, setText] = useState("Resize me by typing more text…");
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {                        // runs before the browser paints: no flicker
    const { width, height } = boxRef.current.getBoundingClientRect();
    setSize({ width: Math.round(width), height: Math.round(height) });
  }, [text]);

  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
      <div ref={boxRef} className="card" style={{ display: "inline-block", maxWidth: 300 }}>{text}</div>
      <span className="muted">Box size: {size.width} × {size.height}px</span>
    </div>
  );
}
```

:::def useLayoutEffect
Like `useEffect`, but runs **synchronously after the DOM updates and before the browser paints**. Use it only for measuring layout and adjusting it without a visible flicker; prefer `useEffect` otherwise.
:::

## Refs for values that don't affect rendering

```jsx run level=intermediate
import { useRef, useState } from "react";

export default function App() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const timerRef = useRef(null);          // the interval id: needed by handlers, never displayed
  const startRef = useRef(0);

  function start() {
    startRef.current = Date.now() - elapsed;
    timerRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 50);
    setRunning(true);
  }
  function stop() {
    clearInterval(timerRef.current);
    setRunning(false);
  }
  return (
    <div className="row">
      <b style={{ fontFamily: "monospace", fontSize: 22 }}>{(elapsed / 1000).toFixed(2)}s</b>
      {running ? <button onClick={stop}>Stop</button> : <button className="primary" onClick={start}>Start</button>}
      <button onClick={() => { stop(); setElapsed(0); }}>Reset</button>
    </div>
  );
}
```

| Use **state** when… | Use a **ref** when… |
|---|---|
| the value is shown on screen | the value is only used in handlers/effects |
| changing it should re-render | changing it should **not** re-render |
| e.g. messages, input text, loading | e.g. timer ids, AbortControllers, previous values, DOM nodes |

:::warn Don't read or write refs during render
Reading `ref.current` while rendering makes your component unpredictable (it won't update when the ref changes). Use refs in **event handlers and effects**. (Initialising lazily — `if (ref.current === null) ref.current = …` — is the one accepted exception.)
:::

## React 19: ref is just a prop

Before React 19 you needed `forwardRef` to give a ref to your own component. Now function components receive `ref` as a normal prop.

```jsx run level=intermediate
import { useRef } from "react";

function PromptInput({ ref, label, ...props }) {          // React 19: ref arrives like any prop
  return (
    <label className="stack">
      <span className="muted">{label}</span>
      <input ref={ref} {...props} />
    </label>
  );
}

export default function App() {
  const promptRef = useRef(null);
  return (
    <div className="row" style={{ alignItems: "flex-end" }}>
      <PromptInput ref={promptRef} label="System prompt" defaultValue="You are concise." />
      <button onClick={() => { promptRef.current.focus(); promptRef.current.select(); }}>Edit</button>
    </div>
  );
}
```

### Ref callbacks with cleanup (React 19)

```jsx run level=advanced
import { useState } from "react";

export default function App() {
  const [visible, setVisible] = useState(true);
  return (
    <div className="stack">
      <button onClick={() => setVisible((v) => !v)}>Toggle observed box</button>
      {visible && (
        <div
          className="card"
          ref={(node) => {
            // called with the DOM node when it mounts…
            const observer = new ResizeObserver(([entry]) => console.log("box width:", Math.round(entry.contentRect.width)));
            observer.observe(node);
            return () => observer.disconnect();   // …and React 19 calls this cleanup when it unmounts
          }}
          style={{ resize: "horizontal", overflow: "auto", width: 220 }}
        >
          Drag my corner to resize ↘
        </div>
      )}
    </div>
  );
}
```

## useImperativeHandle: a custom ref API

```jsx run level=advanced
import { useImperativeHandle, useRef, useState } from "react";

function Composer({ ref }) {
  const [text, setText] = useState("");
  const inputRef = useRef(null);
  useImperativeHandle(ref, () => ({            // expose only what parents may call
    insert: (snippet) => { setText((t) => (t ? t + " " : "") + snippet); inputRef.current.focus(); },
    clear: () => setText(""),
  }));
  return <textarea ref={inputRef} rows={3} value={text} onChange={(e) => setText(e.target.value)} style={{ width: 360 }} />;
}

export default function App() {
  const composer = useRef(null);
  return (
    <div className="stack">
      <div className="row">
        {["Summarise this:", "Translate to French:", "Explain like I'm 5:"].map((s) => (
          <button key={s} onClick={() => composer.current.insert(s)}>{s}</button>
        ))}
        <button onClick={() => composer.current.clear()}>Clear</button>
      </div>
      <Composer ref={composer} />
    </div>
  );
}
```

## Check yourself

```quiz
? Changing `ref.current`…
+ Does not trigger a re-render
- Always re-renders the component
- Is not allowed
> That's the key difference from state.

? Where should you call `inputRef.current.focus()`?
+ In an event handler or an effect
- Directly in the component body during render
- In the JSX
> During render, the DOM node may not exist yet.

? In React 19, how does a function component receive a ref?
+ As a regular prop named `ref`
- Only through forwardRef
- It can't
> forwardRef is no longer needed for function components.

? What's a good use of a ref (not state)?
+ Storing an interval id to clear later
- Storing chat messages shown on screen
- Storing the text of a controlled input
> Values that are never rendered belong in refs.
```

:::keypoints
- `useRef` gives a stable `{ current }` box; changing it never re-renders.
- Attach refs to elements to **focus, scroll, measure**; use them in handlers and effects.
- Store non-visual values (timer ids, AbortControllers, previous values) in refs.
- React 19: `ref` is a normal prop; ref callbacks can return a **cleanup**.
- `useImperativeHandle` exposes a small custom API; `useLayoutEffect` measures before paint.
:::
