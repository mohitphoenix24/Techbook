---
title: React and TypeScript essentials
level: easy
time: 40
summary: The React and TypeScript ideas the six front ends use: state, reducers, loading and error states, cancelling a request, and typed events. All examples run live against a fake server in the page.
---

You do not need to be a React expert for this course, but a few ideas appear in every project. This lesson covers exactly those, with **live** examples. Each preview below runs in your browser and talks to a *fake server* defined in the example itself, using the same `fetch` code you will write against the real FastAPI back end.

:::note New to React?
If components and hooks are new to you, take the first modules of [ReactLab](../react/index.html) first. This lesson is a refresher, not an introduction. Streaming chat interfaces are covered in more depth there in [Streaming chat UIs](../react/index.html#/l/streaming-chat).
:::

## 1. Components, props and state

A **component** is a function that returns what to show. **Props** are its inputs. **State** is memory that survives re-renders; changing it re-draws the component.

```tsx run title="State and props" level=easy
import { useState } from "react";

function Counter({ label, step = 1 }: { label: string; step?: number }) {
  const [count, setCount] = useState(0);
  return (
    <div className="card row">
      <b>{label}</b>
      <button onClick={() => setCount(count + step)}>+{step}</button>
      <span>{count}</span>
    </div>
  );
}

export default function App() {
  return (
    <div className="stack">
      <Counter label="Messages sent" />
      <Counter label="Tokens (hundreds)" step={100} />
    </div>
  );
}
```

The rule that matters most: **never change state directly**. Always create a new value (`setCount(count + 1)`, `[...items, newItem]`). React compares old and new to know what to redraw.

## 2. A reducer for conversation state

A chat has several things that change together: the message list, whether a reply is streaming, an error. Many `useState` calls get tangled. A **reducer** puts every change in one function that takes the old state and an *action* and returns the new state. Pocket Chat uses exactly this pattern.

```tsx run title="useReducer for a message list" level=easy
import { useReducer } from "react";

type Message = { id: number; role: "user" | "assistant"; text: string };
type Action =
  | { type: "send"; text: string }
  | { type: "delta"; text: string }       // a piece of the streamed reply
  | { type: "clear" };

function reducer(messages: Message[], action: Action): Message[] {
  switch (action.type) {
    case "send":
      return [...messages,
        { id: messages.length, role: "user", text: action.text },
        { id: messages.length + 1, role: "assistant", text: "" }];
    case "delta": {
      const last = messages[messages.length - 1];
      return [...messages.slice(0, -1), { ...last, text: last.text + action.text }];
    }
    case "clear":
      return [];
  }
}

export default function App() {
  const [messages, dispatch] = useReducer(reducer, []);
  const reply = () => ["Hel", "lo ", "there", "!"].forEach((t, i) => setTimeout(() => dispatch({ type: "delta", text: t }), 200 * (i + 1)));
  return (
    <div className="stack">
      <div className="row">
        <button onClick={() => { dispatch({ type: "send", text: "Hi!" }); reply(); }}>Send "Hi!"</button>
        <button onClick={() => dispatch({ type: "clear" })}>Clear</button>
      </div>
      {messages.map((m) => (
        <div key={m.id} className="card"><b>{m.role}:</b> {m.text || <span className="muted">…</span>}</div>
      ))}
    </div>
  );
}
```

Notice that the reducer is a **pure function**: same input, same output, no network, no clock. That makes it trivial to unit-test (Project 1 has a test file for it), and it is the reason the UI stays predictable while words stream in at random moments.

## 3. Talking to the back end: loading, error, success

Every request has three states, and a good interface shows all of them. This example calls `GET /api/personas` on a fake server that fails the first time, so you can see the error state and the retry.

```tsx run title="fetch with loading, error and retry" level=easy autoclick="Retry" wait=1200
import { useCallback, useEffect, useState } from "react";

let calls = 0;
mockServer({
  "GET /api/personas": () => {
    calls += 1;
    return calls < 2
      ? json({ detail: "The server is busy, try again." }, { status: 503, delay: 500 })
      : json([{ id: "friendly", name: "Friendly helper" }, { id: "tutor", name: "Socratic tutor" }], { delay: 500 });
  },
});

type Persona = { id: string; name: string };
type State = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: Persona[] };

export default function App() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/personas");
      if (!res.ok) throw new Error((await res.json()).detail ?? `Request failed (${res.status})`);
      setState({ status: "ok", data: await res.json() });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Unknown error" });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (state.status === "loading") return <p className="muted">Loading personas…</p>;
  if (state.status === "error")
    return <div className="card stack"><span className="error">⚠ {state.message}</span><button onClick={load}>Retry</button></div>;
  return <ul>{state.data.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

Two habits are worth copying:

- Model the state as a **union** (`loading | error | ok`) instead of three loose booleans. Then it is impossible to be "loading and failed" at the same time, and TypeScript forces you to handle every case.
- FastAPI sends errors as `{"detail": "..."}`, so read `detail` to get a message a person can understand.

## 4. Reading a stream, and cancelling it

`fetch` returns the response *before* the body finishes. `response.body` is a stream you can read piece by piece. To let users stop a long reply, pass an **`AbortController`** signal to `fetch`; calling `abort()` cancels the request and the next read throws an `AbortError`.

```tsx run title="Read a stream, with a Stop button" level=intermediate autoclick="Start" wait=1800
import { useRef, useState } from "react";

mockServer({
  "POST /api/story": () => sse([
    ["delta", { text: "Once " }], ["delta", { text: "upon " }], ["delta", { text: "a " }],
    ["delta", { text: "time " }], ["delta", { text: "there " }], ["delta", { text: "was " }],
    ["delta", { text: "a " }], ["delta", { text: "very " }], ["delta", { text: "long " }],
    ["delta", { text: "story…" }], ["done", {}],
  ], { delay: 350 }),
});

export default function App() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "stopped">("idle");
  const controller = useRef<AbortController | null>(null);

  async function start() {
    controller.current = new AbortController();
    setText(""); setStatus("streaming");
    try {
      const res = await fetch("/api/story", { method: "POST", signal: controller.current.signal });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // (raw chunks for now: the next project parses them into events properly)
        const chunk = decoder.decode(value, { stream: true });
        const m = chunk.match(/"text":"([^"]*)"/);
        if (m) setText((t) => t + m[1]);
      }
      setStatus("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") setStatus("stopped");   // not a failure: the user asked for it
      else throw e;
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <button className="primary" onClick={start} disabled={status === "streaming"}>Start</button>
        <button onClick={() => controller.current?.abort()} disabled={status !== "streaming"}>Stop</button>
        <span className="muted">{status}</span>
      </div>
      <div className="card" style={{ minHeight: 60 }}>{text}<span className="cursor">▍</span></div>
    </div>
  );
}
```

Press **Start**, then **Stop** half-way. The partial text stays on screen. Pocket Chat does the same thing, and the server notices the dropped connection and saves the partial answer.

:::warn Chunks are not events
This demo cheats: it assumes each network chunk contains one whole event. Real networks cut data anywhere, so one chunk can hold half an event or three. Project 1 builds a proper parser that buffers text and cuts at blank lines, and it has tests for exactly this.
:::

## 5. TypeScript: the three features we use most

You will meet these in every project. All of them are erased when the code is compiled, so they cost nothing at run time; they exist to catch mistakes while you type.

```ts title="Unions, interfaces and exhaustive switches"
// 1. A union limits a value to a few options
type Role = "user" | "assistant";

// 2. An interface describes the shape of an object
interface Usage { input_tokens: number; output_tokens: number; cost_usd: number }

// 3. A discriminated union: the `type` field tells TypeScript which shape you have
type ServerEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "error"; message: string };

function describe(e: ServerEvent): string {
  switch (e.type) {
    case "delta": return `text: ${e.text}`;          // here TypeScript knows e.text exists
    case "usage": return `${e.usage.output_tokens} tokens`;
    case "error": return `failed: ${e.message}`;
    // If you add a new event type and forget it here, the compiler reports an error.
  }
}
```

:::tip Types do not exist at run time
TypeScript cannot check data that arrives from the network: `await res.json()` is whatever the server sent. The type is a promise you make. That is why the back end validates with Pydantic, and why Project 2 teaches validating model output too.
:::

## 6. Custom hooks: keep components small

A **hook** is a function whose name starts with `use` and that can use state and effects. Moving the messy parts out of the component keeps the screen code readable. Pocket Chat has one called `useChat` that owns the conversation, the stream and the Stop button, and returns `{ state, send, stop, regenerate }`. The components only draw.

:::keypoints
- State changes by creating new values, never by mutating old ones.
- A reducer centralises state changes in one pure, testable function.
- Model async state as a union (loading, error, ok) and handle every case.
- `response.body` is a stream; `AbortController` cancels it, and an `AbortError` is not a failure.
- TypeScript unions and discriminated unions make illegal states impossible. Types vanish at run time, so validate data from the network.
- Put logic in hooks and reducers; keep components for drawing.
:::

```quiz
? Why model request state as a union instead of three booleans (loading, error, data)?
- It is faster at run time
+ Impossible combinations such as "loading and failed" cannot exist, and the compiler makes you handle each case
- React requires unions
> A union lists exactly the valid states. With separate booleans nothing stops them from contradicting each other.
? You call controller.abort() while reading a stream. What does the pending read do?
- It returns the rest of the data
+ It throws an AbortError, which you should treat as a normal stop
- Nothing, the stream keeps going
> abort() cancels the request. The read rejects with an AbortError; check the name and show "stopped" instead of an error.
? Why is a reducer easy to test?
- It uses the network
+ It is a pure function: the same state and action always give the same new state
- It runs on the server
> No timers, no network, no hidden state: you pass a state and an action and compare the result.
```

:::exercise Extend the reducer
In the reducer demo, add an action `{ type: "error"; message: string }` that replaces the last assistant message with `"⚠ " + message`. Add a button that dispatches it. What happens if you forget the new case in `reducer`? (In a real project the compiler tells you, because the function must return a `Message[]` on every path.)
:::
