---
title: useOptimistic — Instant UI
level: advanced
time: 25
summary: Show the result of an action immediately — a sent message, a liked post, a renamed chat — while the server catches up, and roll back automatically if it fails.
---

Waiting a full second to see your own chat message appear feels broken. **Optimistic updates** show the expected result instantly and reconcile with the server's real answer when it arrives. React 19 has a hook built for it.

:::def Optimistic update
Updating the UI **as if** an action already succeeded, before the server confirms it. If the action fails, the UI goes back to the real state.
:::

:::def useOptimistic
`const [optimisticState, addOptimistic] = useOptimistic(state, updateFn)`. While an action is pending, `optimisticState` shows `state` plus your optimistic changes; when the action finishes, it snaps back to the real `state` (which you've updated — or not, if it failed).
:::

:::syntax
```jsx
const [optimisticMessages, addOptimisticMessage] = useOptimistic(
  messages,                                         // the real state
  (current, newMessage) => [...current, newMessage]  // how to apply an optimistic change
);

// inside an action (form action or startTransition):
addOptimisticMessage({ text, sending: true });
await sendToServer(text);
setMessages(…);                                     // the real update
```
:::

## Optimistic chat messages

```jsx run level=intermediate
import { useOptimistic, useState, startTransition } from "react";

const sendToServer = (text) => new Promise((resolve, reject) =>
  setTimeout(() => (text.toLowerCase().includes("fail") ? reject(new Error("Network error")) : resolve({ id: crypto.randomUUID(), text })), 1200));

export default function App() {
  const [messages, setMessages] = useState([{ id: "1", text: "Welcome! Try sending a message (include 'fail' to see a rollback)." }]);
  const [error, setError] = useState(null);
  const [optimistic, addOptimistic] = useOptimistic(messages, (current, text) => [...current, { id: "pending", text, sending: true }]);

  async function send(formData) {
    const text = String(formData.get("text")).trim();
    if (!text) return;
    setError(null);
    addOptimistic(text);                                  // appears instantly
    try {
      const saved = await sendToServer(text);
      startTransition(() => setMessages((m) => [...m, saved]));   // the real state catches up
    } catch (e) {
      setError(`“${text}” failed to send: ${e.message}`);  // optimistic message disappears automatically
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      {optimistic.map((m) => (
        <div key={m.id} className="card" style={{ opacity: m.sending ? 0.55 : 1 }}>
          {m.text} {m.sending && <small className="muted">· sending…</small>}
        </div>
      ))}
      {error && <p className="error">⚠ {error}</p>}
      <form action={send} className="row">
        <input name="text" placeholder="Message…" style={{ flex: 1 }} />
        <button className="primary">Send</button>
      </form>
    </div>
  );
}
```

Send something normal: it appears faded at once, then becomes solid. Send a message containing "fail": it appears, then vanishes and an error shows — React rolls back for you, because the real `messages` state never changed.

:::warn Call it inside an action
`addOptimistic` must be called during an **action or transition** (a form `action`, or inside `startTransition`). Called from a plain event handler, React warns and the optimistic state won't behave correctly.
:::

## Optimistic toggles: likes and pins

```jsx run level=intermediate
import { useOptimistic, useState, useTransition } from "react";

const savePin = (pinned) => new Promise((resolve, reject) =>
  setTimeout(() => (Math.random() < 0.25 ? reject(new Error("failed")) : resolve(pinned)), 800));

function PinButton({ pinned, onChange }) {
  const [optimisticPinned, setOptimisticPinned] = useOptimistic(pinned);    // no update fn: just replace
  const [, startTransition] = useTransition();
  return (
    <button onClick={() => startTransition(async () => {
      setOptimisticPinned(!pinned);
      try { await onChange(!pinned); } catch { console.log("pin failed — rolled back"); }
    })}>
      {optimisticPinned ? "📌 Pinned" : "Pin"}
    </button>
  );
}

export default function App() {
  const [pinned, setPinned] = useState(false);
  async function handleChange(next) {
    const saved = await savePin(next);
    setPinned(saved);
  }
  return (
    <div className="card row" style={{ justifyContent: "space-between", maxWidth: 380 }}>
      <span>💬 RAG architecture discussion</span>
      <PinButton pinned={pinned} onChange={handleChange} />
    </div>
  );
}
```

## When to be optimistic

| Good candidates | Be careful with |
|---|---|
| sending a chat message | payments and purchases |
| likes, pins, stars, read status | anything irreversible |
| renaming, reordering, toggling settings | actions that often fail validation |
| adding items to a list | long-running AI generations (show progress instead) |

:::tip Show the "in flight" state
Optimistic doesn't mean "pretend it's done". A subtle hint — faded text, a small spinner, "sending…" — keeps users informed, and a clear error with a **Retry** button handles failures.
:::

:::ai
In chat apps the user's own message should appear **instantly** (optimistic), while the assistant's reply streams in. If the request fails, keep the user's text in the composer or show "Failed — retry" so nothing they typed is lost.
:::

## Check yourself

```quiz
? What does useOptimistic show while an action is pending?
+ The real state plus your optimistic changes
- Only the server's response
- Nothing
> When the action ends, it shows the real state again.

? An optimistic action fails and you don't update the real state. What does the user see?
+ The optimistic change disappears (automatic rollback)
- The optimistic change stays forever
- The app crashes
> The real state never changed, so React shows it again.

? Where must you call the optimistic setter?
+ Inside an action or transition
- In useEffect
- During render
> E.g. inside a form action or startTransition.
```

:::keypoints
- `useOptimistic(state, updateFn)` returns `[optimisticState, addOptimistic]`.
- Call `addOptimistic` inside an action/transition; then update the real state when the server responds.
- On failure, React automatically reverts to the real state — show an error and a retry.
- Use for fast, reversible interactions: messages, likes, pins, renames.
:::
