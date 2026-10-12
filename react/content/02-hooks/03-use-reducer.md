---
title: useReducer — Managing Complex State
level: intermediate
time: 28
summary: When state has many related pieces and many ways to change, move the logic into a reducer — a pure function that turns (state, action) into the next state. Ideal for chat sessions, wizards and streaming UIs.
---

A chat screen's state isn't one value: it's the messages, the input, the status (idle / streaming / error), the current error, the streaming text… and many events change several of these at once. Scattering a dozen `setX` calls across handlers gets messy fast. **Reducers** put all the update logic in one place.

:::def Reducer
A **pure function** `(state, action) => newState`. It receives the current state and an **action** (an object describing what happened, like `{ type: "message_sent", text }`) and returns the next state — without changing the old one.
:::

:::def Action
A plain object describing **what happened**, usually with a `type` string and some data: `{ type: "token_received", token: "Hello" }`. Components *dispatch* actions; the reducer decides how state changes.
:::

:::syntax
```jsx
function reducer(state, action) {
  switch (action.type) {
    case "increment": return { ...state, count: state.count + 1 };
    default: throw new Error(`Unknown action: ${action.type}`);
  }
}

const [state, dispatch] = useReducer(reducer, initialState);
dispatch({ type: "increment" });
```
:::

## A first reducer

```jsx run level=easy
import { useReducer } from "react";

function reducer(state, action) {
  switch (action.type) {
    case "like": return { ...state, likes: state.likes + 1 };
    case "dislike": return { ...state, dislikes: state.dislikes + 1 };
    case "reset": return { likes: 0, dislikes: 0 };
    default: throw new Error(`Unknown action ${action.type}`);
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, { likes: 0, dislikes: 0 });
  const total = state.likes + state.dislikes;
  return (
    <div className="row">
      <button onClick={() => dispatch({ type: "like" })}>👍 {state.likes}</button>
      <button onClick={() => dispatch({ type: "dislike" })}>👎 {state.dislikes}</button>
      <button onClick={() => dispatch({ type: "reset" })}>Reset</button>
      <span className="muted">{total ? `${Math.round((state.likes / total) * 100)}% positive` : "No feedback yet"}</span>
    </div>
  );
}
```

:::analogy
A reducer is like a **bank teller** with a strict rulebook. You hand over a slip ("deposit 50") — the action. The teller looks up the rule, updates the ledger, and hands back the new balance. You never reach into the vault yourself.
:::

## A real example: a streaming chat session

```jsx run level=intermediate
import { useReducer, useRef } from "react";

const initial = { messages: [], input: "", status: "idle", error: null };

function chatReducer(state, action) {
  switch (action.type) {
    case "input_changed":
      return { ...state, input: action.value };
    case "sent":
      return {
        ...state, input: "", status: "streaming", error: null,
        messages: [...state.messages, { id: action.id, role: "user", text: action.text },
                                      { id: action.id + 1, role: "assistant", text: "" }],
      };
    case "token": {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      messages[messages.length - 1] = { ...last, text: last.text + action.token };
      return { ...state, messages };
    }
    case "done":
      return { ...state, status: "idle" };
    case "failed":
      return { ...state, status: "error", error: action.error };
    default:
      throw new Error(`Unknown action ${action.type}`);
  }
}

async function* fakeStream(question) {
  const answer = `You asked "${question}". Reducers keep all of this logic in one tidy place.`;
  for (const word of answer.split(" ")) {
    await new Promise((r) => setTimeout(r, 60));
    yield word + " ";
  }
}

export default function App() {
  const [state, dispatch] = useReducer(chatReducer, initial);
  const nextId = useRef(1);

  async function send(e) {
    e.preventDefault();
    if (!state.input.trim() || state.status === "streaming") return;
    const text = state.input.trim();
    dispatch({ type: "sent", text, id: nextId.current });
    nextId.current += 2;
    try {
      for await (const token of fakeStream(text)) dispatch({ type: "token", token });
      dispatch({ type: "done" });
    } catch (err) {
      dispatch({ type: "failed", error: err.message });
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 440 }}>
      {state.messages.map((m) => (
        <div key={m.id} className="card" style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start" }}>
          <b>{m.role === "user" ? "You" : "AI"}:</b> {m.text}{state.status === "streaming" && m === state.messages.at(-1) && "▍"}
        </div>
      ))}
      {state.error && <p className="error">{state.error}</p>}
      <form onSubmit={send} className="row">
        <input value={state.input} onChange={(e) => dispatch({ type: "input_changed", value: e.target.value })} placeholder="Ask something…" style={{ flex: 1 }} />
        <button className="primary" disabled={state.status === "streaming"}>{state.status === "streaming" ? "…" : "Send"}</button>
      </form>
    </div>
  );
}
```

Look at how readable the component became: it only **dispatches what happened**. All the "how state changes" logic lives in `chatReducer`, which you can test without any UI:

```jsx run level=intermediate
function chatReducer(state, action) {
  switch (action.type) {
    case "sent": return { ...state, status: "streaming", messages: [...state.messages, { role: "user", text: action.text }, { role: "assistant", text: "" }] };
    case "token": { const m = [...state.messages]; m[m.length - 1] = { ...m.at(-1), text: m.at(-1).text + action.token }; return { ...state, messages: m }; }
    case "done": return { ...state, status: "idle" };
    default: throw new Error(action.type);
  }
}

// Reducers are pure functions — test them with plain assertions:
let s = { messages: [], status: "idle" };
s = chatReducer(s, { type: "sent", text: "Hi" });
s = chatReducer(s, { type: "token", token: "Hel" });
s = chatReducer(s, { type: "token", token: "lo!" });
s = chatReducer(s, { type: "done" });
console.assert(s.messages.length === 2, "two messages");
console.assert(s.messages[1].text === "Hello!", "tokens appended");
console.assert(s.status === "idle", "back to idle");
console.log("✅ reducer tests passed", s);
```

## useState or useReducer?

| | `useState` | `useReducer` |
|---|---|---|
| state shape | one or a few independent values | several related values |
| updates | simple (`setOpen(true)`) | many event types touching several fields |
| where logic lives | in each event handler | one reducer function |
| testing | through the UI | the reducer alone, as a pure function |
| debugging | — | log every action: a clear history of what happened |

You can also mix: `useState` for simple bits (is the menu open?), `useReducer` for the complex domain state.

## Reducer rules

- **Pure**: no API calls, timers, random numbers or mutations inside the reducer. Do side effects in handlers/effects, then dispatch the results.
- **Immutable**: always return new objects/arrays.
- **Describe what happened**, not what to set: `{ type: "message_deleted", id }` is clearer than `{ type: "set_messages", messages }`.

:::tip Immer for deeply nested updates
The `immer` library (and `use-immer`) lets you write "mutating" code that actually produces immutable updates: `draft.messages.at(-1).text += token`. Handy when state is deeply nested.
:::

```jsx run level=advanced
import { useReducer } from "react";
import { produce } from "immer";

const reducer = produce((draft, action) => {          // write "mutations" on a draft copy
  switch (action.type) {
    case "rename_chat": draft.chats[action.index].title = action.title; break;
    case "add_tag": draft.chats[action.index].tags.push(action.tag); break;
  }
});

export default function App() {
  const [state, dispatch] = useReducer(reducer, { chats: [{ title: "Untitled", tags: [] }] });
  return (
    <div className="stack" style={{ maxWidth: 360 }}>
      <button onClick={() => dispatch({ type: "rename_chat", index: 0, title: "RAG design review" })}>Rename</button>
      <button onClick={() => dispatch({ type: "add_tag", index: 0, tag: "work" })}>Add tag</button>
      <pre className="card" style={{ margin: 0 }}>{JSON.stringify(state, null, 2)}</pre>
    </div>
  );
}
```

## Check yourself

```quiz
? What does a reducer return?
+ The next state, as a new object
- Nothing — it mutates the state
- A Promise
> (state, action) => newState, pure and immutable.

? Where should an API call go when using a reducer?
+ In an event handler or effect, which then dispatches the result
- Inside the reducer
- In the initial state
> Reducers must be pure.

? A good action name is…
+ { type: "message_deleted", id }
- { type: "set_state", state }
- { type: "update" }
> Describe what happened in the app.
```

:::exercise Undo
Add an `"undo"` action to the like/dislike reducer: keep a `history` array of previous states inside the state, push to it on every change, and pop from it on undo. Disable the Undo button when there's nothing to undo.
:::

:::solution
```jsx run
import { useReducer } from "react";

const initial = { likes: 0, dislikes: 0, history: [] };
function reducer(state, action) {
  const snapshot = { likes: state.likes, dislikes: state.dislikes };
  switch (action.type) {
    case "like": return { ...state, likes: state.likes + 1, history: [...state.history, snapshot] };
    case "dislike": return { ...state, dislikes: state.dislikes + 1, history: [...state.history, snapshot] };
    case "undo": {
      if (!state.history.length) return state;
      const prev = state.history.at(-1);
      return { ...prev, history: state.history.slice(0, -1) };
    }
    default: throw new Error(action.type);
  }
}

export default function App() {
  const [s, dispatch] = useReducer(reducer, initial);
  return (
    <div className="row">
      <button onClick={() => dispatch({ type: "like" })}>👍 {s.likes}</button>
      <button onClick={() => dispatch({ type: "dislike" })}>👎 {s.dislikes}</button>
      <button disabled={!s.history.length} onClick={() => dispatch({ type: "undo" })}>↶ Undo</button>
    </div>
  );
}
```
:::

:::keypoints
- `useReducer(reducer, initialState)` returns `[state, dispatch]`; components dispatch **actions**.
- A reducer is a **pure** `(state, action) => newState` function — easy to read, log and test.
- Use it when many related values change together (chat sessions, wizards, editors).
- Keep side effects outside the reducer; consider Immer for deeply nested updates.
:::
