---
title: Activity & useEffectEvent (React 19.2)
level: advanced
time: 22
summary: Two React 19.2 additions. `<Activity>` hides parts of the UI while keeping their state (and pre-renders what users will open next). `useEffectEvent` separates "event" logic from effects so they don't re-run unnecessarily.
---

React 19.2 (October 2025) added two features that solve very common problems: losing state when you hide something, and effects that re-run (reconnect, refetch) just because an unrelated value changed.

## `<Activity>`: hide without losing state

:::def Activity
A component that shows or hides its children: `<Activity mode="visible" | "hidden">`. When **hidden**, the children are visually hidden, their **effects are unmounted** and updates are deferred — but their **state is kept**. When visible again, they come back exactly as they were.
:::

:::syntax
```jsx
import { Activity } from "react";

// Before:   {isVisible && <Page />}          ← unmounting loses all of Page's state
<Activity mode={isVisible ? "visible" : "hidden"}>
  <Page />
</Activity>
```
:::

Type a draft in a tab, switch tabs, come back — compare the two approaches:

```jsx run level=advanced
import { Activity, useState } from "react";

function DraftTab({ name }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="card stack">
      <b>{name}</b>
      <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Write a draft in ${name}…`} />
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("A");
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 24 }}>
      <div className="stack" style={{ width: 240 }}>
        <div className="row">{["A", "B"].map((t) => <button key={t} className={t === tab ? "primary" : ""} onClick={() => setTab(t)}>Tab {t}</button>)}</div>
        <span className="muted">Conditional rendering ❌</span>
        {tab === "A" && <DraftTab name="Tab A" />}
        {tab === "B" && <DraftTab name="Tab B" />}
      </div>
      <div className="stack" style={{ width: 240 }}>
        <div className="row" style={{ visibility: "hidden" }}><button>x</button></div>
        <span className="muted">&lt;Activity&gt; ✅</span>
        <Activity mode={tab === "A" ? "visible" : "hidden"}><DraftTab name="Tab A" /></Activity>
        <Activity mode={tab === "B" ? "visible" : "hidden"}><DraftTab name="Tab B" /></Activity>
      </div>
    </div>
  );
}
```

### Effects are paused while hidden

```jsx run level=advanced
import { Activity, useEffect, useState } from "react";

function LiveTokenCounter() {
  const [tokens, setTokens] = useState(0);
  useEffect(() => {
    console.log("▶ effect mounted: streaming started");
    const id = setInterval(() => setTokens((t) => t + 7), 300);
    return () => { console.log("■ effect cleaned up: streaming paused"); clearInterval(id); };
  }, []);
  return <div className="card">Tokens streamed: {tokens}</div>;
}

export default function App() {
  const [visible, setVisible] = useState(true);
  return (
    <div className="stack" style={{ maxWidth: 360 }}>
      <button onClick={() => setVisible((v) => !v)}>{visible ? "Hide" : "Show"} panel</button>
      <Activity mode={visible ? "visible" : "hidden"}>
        <LiveTokenCounter />
      </Activity>
      <span className="muted">Hide, wait, show: the count resumes from where it was (state kept), and the console shows the effect pausing.</span>
    </div>
  );
}
```

### Pre-rendering what's next

Because hidden Activities render at low priority, you can **pre-render** a page the user is likely to open next (load its data, images and CSS in the background) so the switch is instant.

:::tip When to use Activity
Tabs and sidebars you switch between, back-navigation that should keep scroll position and inputs, "next step" pre-rendering. For things that should truly reset or rarely return, normal conditional rendering is still fine.
:::

## `useEffectEvent`: events fired from effects

Problem: an effect connects to a chat room (depends on `roomId`) and shows a notification using the current `theme`. Using `theme` inside the effect forces it into the dependency array — so changing the theme **reconnects** the chat. Wrong!

:::def useEffectEvent
A React 19.2 hook that wraps a function so it always "sees" the **latest** props and state, but is **not reactive** — it doesn't need to be in the effect's dependency array. Use it for "event" logic that is *fired from* an effect.
:::

```jsx run level=advanced
import { useEffect, useEffectEvent, useState } from "react";

function connectToRoom(roomId, onMessage) {               // a fake external chat connection
  console.log(`🔌 connect to #${roomId}`);
  const id = setInterval(() => onMessage(`new message in #${roomId}`), 2500);
  return () => { console.log(`❌ disconnect from #${roomId}`); clearInterval(id); };
}

function ChatRoom({ roomId, muted }) {
  const [log, setLog] = useState([]);

  const onMessage = useEffectEvent((text) => {            // reads the LATEST `muted`, isn't a dependency
    setLog((l) => [...l.slice(-3), muted ? `(muted) ${text}` : `🔔 ${text}`]);
  });

  useEffect(() => connectToRoom(roomId, onMessage), [roomId]);   // ✅ only reconnects when the room changes

  return <div className="card">{log.map((l, i) => <div key={i}>{l}</div>)}</div>;
}

export default function App() {
  const [roomId, setRoomId] = useState("general");
  const [muted, setMuted] = useState(false);
  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <div className="row">
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option>general</option><option>rag-team</option><option>agents</option>
        </select>
        <label><input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} /> Mute</label>
      </div>
      <ChatRoom roomId={roomId} muted={muted} />
      <span className="muted">Toggle Mute: no reconnect in the console. Change room: reconnects.</span>
    </div>
  );
}
```

:::warn Rules for Effect Events
- Only call them **from inside effects** (not during render, not as `onClick` handlers).
- Declare them in the **same component or hook** as the effect.
- **Don't** put them in dependency arrays, and don't use them just to silence the linter — values the effect genuinely depends on must stay dependencies.
:::

:::ai
Typical AI-app uses: a streaming connection that should only restart when the **conversation id** changes, while the "on token" callback reads the latest scroll position or settings via `useEffectEvent`; and `<Activity>` to keep inactive conversations' scroll position and half-written drafts when switching chats.
:::

## Check yourself

```quiz
? What happens to a component's state inside `<Activity mode="hidden">`?
+ It is kept; effects are unmounted until visible again
- It is destroyed like conditional rendering
- It keeps running effects normally
> Hidden activities keep state but pause effects and defer updates.

? Why use useEffectEvent for a notification callback that reads `theme`?
+ So changing theme doesn't re-run (reconnect) the effect, while the callback still sees the latest theme
- To make the effect run on every render
- To replace useEffect
> Effect Events are non-reactive but always up to date.

? Should an Effect Event appear in the dependency array?
+ No
- Yes, always
- Only if it reads state
> The updated linter knows to leave them out.
```

:::keypoints
- `<Activity mode="visible|hidden">` hides UI while **keeping state**; hidden trees unmount effects and render at low priority (great for tabs and pre-rendering).
- `useEffectEvent(fn)` creates a non-reactive function that always sees the latest values — for "events" fired from effects.
- Keep real dependencies in the array; call Effect Events only from effects.
:::
