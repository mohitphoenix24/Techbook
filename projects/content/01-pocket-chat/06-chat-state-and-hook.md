---
title: Chat state and the useChat hook
level: easy
time: 40
summary: Model the whole conversation as a reducer, then wrap the stream, Stop and Regenerate in one hook, and watch the real reducer handle a scripted stream in your browser.
tags: useReducer, custom hook, AbortController, state
---

You now have a function that yields typed events. The next question is the one that decides whether a chat UI feels solid or flaky: **where does the conversation state live, and how does it change?**

## What changes during one reply?

Think of a single exchange as a short story:

:::flow The life of one reply
Sent | user message added, empty assistant message appears
Meta | server confirms the conversation ID and model
Delta ×N | text is appended to the last message
Usage | tokens and cost arrive
Finished | status becomes done
:::

Plus the unhappy endings: **Stopped** (user pressed Stop), **Failed** (network or model error), and **Regenerating** (the last answer is replaced). Eight kinds of change, all touching the same few fields. That is exactly what a **reducer** is for.

## The state

```ts src="pocket-chat/frontend/src/chatReducer.ts" region="state" title="frontend/src/chatReducer.ts"
```

Every possible change is an **action**, a plain object with a `type`. The state is deliberately small: the messages, a `streaming` flag, the conversation ID, and a little information from the `meta` event.

## The reducer

```ts src="pocket-chat/frontend/src/chatReducer.ts" region="reducer" title="frontend/src/chatReducer.ts"
```

Three habits make this reliable:

1. **Immutable updates.** `[...messages.slice(0, -1), { ...last, content: last.content + text }]` builds *new* arrays and objects. React sees a new reference and redraws. Mutating `last.content += text` would update memory but not the screen.
2. **`delta` only touches the last message.** Deltas arrive many times a second; keeping the update this small is what keeps streaming smooth.
3. **`finished` does not overwrite `stopped`.** If the user pressed Stop, a late `finished` must not turn the message back into "done". Small guards like this are why we test the reducer (next section).

### Watch the real reducer

The block below runs the project's actual `chatReducer.ts`. It replays a scripted stream and prints the action log next to the resulting state. Press **Play**, or **Play and stop** to see the Stop path.

```tsx run src="pocket-chat/frontend/src/chatReducer.ts" title="The real chatReducer replaying a stream" level=intermediate autoclick="Play and stop" wait=2500
import { useReducer, useState } from "react";

const SCRIPT: Action[] = [
  { type: "sent", userId: "u1", assistantId: "a1", text: "Give me a plan" },
  { type: "meta", conversationId: "c1", provider: "mock", model: "mock-1", dropped: 0 },
  ...["Here ", "is ", "a ", "short ", "plan: ", "1. ", "Write ", "the ", "goal."].map((text): Action => ({ type: "delta", text })),
  { type: "usage", usage: { input_tokens: 12, output_tokens: 9, cost_usd: 0.00011 } },
  { type: "finished" },
];

export default function App() {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const [log, setLog] = useState<string[]>([]);

  function play(stopAfter?: number) {
    dispatch({ type: "reset" });
    setLog([]);
    SCRIPT.forEach((action, i) => setTimeout(() => {
      if (stopAfter !== undefined && i > stopAfter) {
        if (i === stopAfter + 1) { dispatch({ type: "stopped" }); setLog((l) => [...l, "stopped  ← the user pressed Stop"]); }
        return;                                   // later events never arrive
      }
      dispatch(action);
      setLog((l) => [...l, action.type + ("text" in action ? "  " + JSON.stringify(action.text) : "")]);
    }, 160 * i));
  }

  return (
    <div className="stack">
      <div className="row">
        <button className="primary" onClick={() => play()}>Play</button>
        <button onClick={() => play(6)}>Play and stop</button>
      </div>
      <div className="card">
        {state.messages.map((m) => (
          <p key={m.id}><b>{m.role}</b> <span className="muted">[{m.status}]</span> {m.content}{m.usage ? <span className="muted"> · {m.usage.output_tokens} tokens</span> : null}</p>
        ))}
        <p className="muted">streaming: {String(state.streaming)}</p>
      </div>
      <pre>{log.join("\n") || "(press Play)"}</pre>
    </div>
  );
}
```

## Testing a reducer

A reducer is a pure function, so a test is three lines. These are the project's tests:

```ts src="pocket-chat/frontend/src/chatReducer.test.ts" title="frontend/src/chatReducer.test.ts"
```

Notice the last one: it checks that the reducer **does not mutate** its input. That is the bug that bites everyone once.

## The hook: connecting the stream to the reducer

The reducer is pure; something has to *do* the asynchronous work and dispatch actions as events arrive. That is the job of the `useChat` hook, the only place that knows about both the network and React.

```ts src="pocket-chat/frontend/src/useChat.ts" region="run" title="frontend/src/useChat.ts: run"
```

Walk through `run`:

1. **Abort anything already running.** Starting a second request while the first is still streaming would interleave two replies. We keep the current `AbortController` in a `useRef` (a box that survives re-renders without causing one).
2. **`for await` over `streamChat`.** Each server event becomes one dispatched action. The component re-renders on every `delta`, so the UI is always showing the newest text.
3. **Normal end** dispatches `finished`.
4. **`catch`: abort is not an error.** If `controller.signal.aborted` is true, the user pressed Stop (or switched conversation): dispatch `stopped`. Anything else is a real failure; we show a friendly message, with a special case for `ApiError` (whose text came from the server).
5. **`finally`** clears the ref and calls `onSaved`, which refreshes the sidebar list, because the server just saved a message (and possibly created a conversation).

The rest of the hook is small. `send` and `regenerate` dispatch an action first (so the UI reacts instantly) and then call `run`:

```ts title="useChat.ts (the rest)"
const send = useCallback((text: string) => {
  dispatch({ type: "sent", userId: uid(), assistantId: uid(), text });       // optimistic: show it now
  return run({ conversation_id: state.conversationId, message: text, persona });
}, [run, state.conversationId, persona]);

const regenerate = useCallback(() => {
  if (!state.conversationId) return;
  dispatch({ type: "regenerating", assistantId: uid() });                     // replace the last answer
  return run({ conversation_id: state.conversationId, regenerate: true, persona });
}, [run, state.conversationId, persona]);

const stop = useCallback(() => abort.current?.abort(), []);
```

**Stop** is just `abort()`. Everything after follows from the earlier lessons: the browser drops the connection, the server's generator is cancelled and saves the partial reply, and our `catch` sees an aborted signal and dispatches `stopped`.

:::tip Why `useCallback`
`useChat` returns functions that components pass down as props. `useCallback` keeps their identity stable between renders so children are not redrawn needlessly, and so effects that depend on them do not re-run. It matters most for `run`, which `send` and `regenerate` depend on.
:::

:::warn Typical hook bugs
- **Two replies mixed together:** forgetting to abort the previous request before starting a new one.
- **A "ghost" reply after switching chats:** not aborting in `open` and `reset`. Both do, in this hook.
- **Stale state in an old callback:** a function that closed over an outdated `state.conversationId`. That is why `state.conversationId` is in the `useCallback` dependency list.
:::

:::keypoints
- List every change as an action; one reducer applies them all, so the state can never be half-updated.
- Reducers update immutably and are pure, so they are easy to test (including "does not mutate").
- `useChat` is the only place that mixes network and React: it runs the stream, dispatches events, and owns the `AbortController`.
- An aborted request is a normal stop, not an error; always abort the previous request first.
- Dispatch an optimistic action before the request so the UI responds instantly.
:::

```quiz
? Why does the `delta` case build a new array instead of doing `last.content += text`?
- Arrays are read-only in JavaScript
+ React only redraws when it sees a new object; mutating in place changes memory but not the screen
- It is shorter
> Immutable updates give React a new reference to compare. Mutation also makes reducers harder to test and reason about.
? In useChat, how does Stop produce the "stopped" state?
- The server sends a stopped event
+ abort() makes the stream throw, and the catch block sees controller.signal.aborted and dispatches stopped
- The reducer polls the server
> The abort is client-side. The server independently notices the closed connection and saves the partial reply.
? Why is the previous AbortController aborted at the start of run?
- To save memory
+ Two streams writing into the same message list would mix their text together
- AbortController can only be used once per page
> Only one reply may stream at a time; starting a new one cancels the old one.
```

:::exercise Add a "retrying" state
Add an action `{ type: "retrying" }` that sets the last message back to `streaming` with empty content *without* adding a new message, and use it in a "Try again" button for failed replies. Write the reducer test first. Which existing action is it most similar to, and could you reuse it instead of adding a new one?
:::
