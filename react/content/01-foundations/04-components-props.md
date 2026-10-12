---
title: Components & Props
level: easy
time: 25
summary: Split UIs into reusable components, pass data down with props, use children for layout components, set defaults, and think in components — the core skill of React.
---

A chat app is made of a header, a message list, message bubbles, an input box, a send button… Each of those is a **component**. Components receive data through **props** — that's how one `MessageBubble` component can show thousands of different messages.

:::def Props
Short for "properties": the inputs you pass to a component, written like HTML attributes — `<Message text="Hi" from="user" />`. Inside, the component receives them as one object, usually destructured: `function Message({ text, from })`.
:::

:::syntax
```jsx
function Greeting({ name, excited = false }) {      // receive props (with a default)
  return <h2>Hello, {name}{excited ? "!" : "."}</h2>;
}

<Greeting name="Ada" excited />                       // use it (excited={true})
```
:::

## Building with components

```jsx run level=easy
function Avatar({ role }) {
  return <span style={{ fontSize: 22 }}>{role === "user" ? "🧑" : "🤖"}</span>;
}

function MessageBubble({ role, text, time }) {
  const mine = role === "user";
  return (
    <div className="row" style={{ justifyContent: mine ? "flex-end" : "flex-start" }}>
      {!mine && <Avatar role={role} />}
      <div className="card" style={{ maxWidth: 360, background: mine ? "var(--accent)" : undefined, color: mine ? "white" : undefined }}>
        {text}
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{time}</div>
      </div>
      {mine && <Avatar role={role} />}
    </div>
  );
}

export default function App() {
  return (
    <div className="stack">
      <MessageBubble role="user" text="What's a component?" time="10:01" />
      <MessageBubble role="assistant" text="A reusable piece of UI — like me, this bubble!" time="10:01" />
      <MessageBubble role="user" text="Neat 😄" time="10:02" />
    </div>
  );
}
```

One `MessageBubble`, three different messages — the data comes from props.

:::warn Component names must start with a capital letter
`<messageBubble />` is treated as an HTML tag and won't work. Write `<MessageBubble />`.
:::

## Props are read-only

:::def One-way data flow
Data flows **down** from parent to child through props. A child must never modify its props — if something needs to change, the parent owns that data as state and passes down a new value (or a function to change it).
:::

```jsx run level=intermediate
function TokenMeter({ used, limit }) {
  // used = 0;  ❌ never reassign props
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const color = pct > 90 ? "var(--danger)" : pct > 70 ? "orange" : "var(--ok)";
  return (
    <div className="card" style={{ width: 300 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>Context window</b><span className="muted">{used.toLocaleString()} / {limit.toLocaleString()}</span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: "var(--border)", marginTop: 8 }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color, transition: "width .3s" }} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="stack">
      <TokenMeter used={12000} limit={200000} />
      <TokenMeter used={150000} limit={200000} />
      <TokenMeter used={195000} limit={200000} />
    </div>
  );
}
```

## The children prop

:::def children
The special prop containing whatever you put **between** a component's opening and closing tags: `<Card>…this…</Card>`. It lets you build layout and wrapper components.
:::

```jsx run level=easy
function Card({ title, icon = "📦", children }) {
  return (
    <section className="card" style={{ marginBottom: 10 }}>
      <h3>{icon} {title}</h3>
      {children}
    </section>
  );
}

export default function App() {
  return (
    <>
      <Card title="Model settings" icon="⚙️">
        <p>Model: <code>claude-opus-5-5</code></p>
        <p>Max tokens: 4096</p>
      </Card>
      <Card title="Usage">
        <p>You've used <b>32%</b> of today's budget.</p>
      </Card>
    </>
  );
}
```

## Passing objects, arrays and functions

Props can be any JavaScript value — including **functions**, which is how children talk back to parents.

```jsx run level=intermediate
import { useState } from "react";

function ModelPicker({ models, selected, onSelect }) {
  return (
    <div className="row">
      {models.map((m) => (
        <button key={m.id} className={m.id === selected ? "primary" : ""} onClick={() => onSelect(m.id)}>
          {m.label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const models = [
    { id: "claude-opus-5-5", label: "Opus 5.5" },
    { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
    { id: "claude-haiku-4-5", label: "Haiku 4.5" },
  ];
  const [selected, setSelected] = useState(models[0].id);
  return (
    <div className="stack">
      <ModelPicker models={models} selected={selected} onSelect={setSelected} />
      <p>Selected: <code>{selected}</code></p>
    </div>
  );
}
```

The parent **owns** the state; the child receives the current value and a callback (`onSelect`). This "lifting state up" pattern is everywhere in React.

### Spreading props

```jsx run level=intermediate
function Button({ variant = "default", children, ...rest }) {
  // `...rest` collects any other props (onClick, disabled, title…) and passes them through
  return <button className={variant === "primary" ? "primary" : ""} {...rest}>{children}</button>;
}

export default function App() {
  return (
    <div className="row">
      <Button variant="primary" onClick={() => console.log("sent!")}>Send</Button>
      <Button disabled title="Nothing to undo">Undo</Button>
    </div>
  );
}
```

## Thinking in components

How do you split a design into components? Draw boxes around parts of the UI:

```text
ChatApp
├── Header            (title, model picker)
├── MessageList
│   └── MessageBubble (× many)
│       └── Avatar
└── Composer          (textarea + send button)
```

- A component should do **one thing**. If it grows big, split it.
- Data lives in the **closest common parent** of the components that need it.
- Give components names that describe *what they are*, not how they look (`MessageBubble`, not `BlueBox`).

:::ai
AI interfaces are mostly lists of rich, reusable components: message bubbles, citation chips, tool-call cards, code blocks with copy buttons, thumbs-up/down feedback rows. Get comfortable building small components with clear props.
:::

## Check yourself

```quiz
? How does a child component receive data from its parent?
+ Through props
- By reading the parent's variables directly
- From a global variable only
> Props are the inputs to a component.

? What is `children`?
+ Whatever is placed between a component's opening and closing tags
- The list of components a component imports
- A reserved word you cannot use
> It enables wrapper/layout components like <Card>…</Card>.

? A child needs to tell its parent a button was clicked. How?
+ The parent passes a function prop (e.g. onSelect) and the child calls it
- The child modifies its props
- The child edits the parent's state variable directly
> Data flows down; events flow up via callbacks.
```

:::exercise Pricing cards
Create a `PlanCard` component with props `name`, `price`, `features` (array) and `highlighted` (boolean). Render three plans (Free, Pro, Team) in a row; the highlighted one should have an accent border and a "Most popular" label.
:::

:::solution
```jsx run
function PlanCard({ name, price, features, highlighted = false }) {
  return (
    <div className="card" style={{ width: 170, border: highlighted ? "2px solid var(--accent)" : undefined }}>
      {highlighted && <div style={{ color: "var(--accent)", fontSize: 12, fontWeight: 700 }}>MOST POPULAR</div>}
      <h3>{name}</h3>
      <p style={{ fontSize: 24, fontWeight: 700 }}>{price === 0 ? "Free" : `$${price}/mo`}</p>
      <ul>{features.map((f) => <li key={f}>{f}</li>)}</ul>
    </div>
  );
}

export default function App() {
  return (
    <div className="row" style={{ alignItems: "stretch" }}>
      <PlanCard name="Free" price={0} features={["3 chats/day"]} />
      <PlanCard name="Pro" price={8} features={["Unlimited chats", "File uploads"]} highlighted />
      <PlanCard name="Team" price={15} features={["Shared workspaces", "Admin controls"]} />
    </div>
  );
}
```
:::

:::keypoints
- Components are capitalised functions; **props** are their read-only inputs.
- Destructure props in the signature and give defaults: `({ name, size = "md" })`.
- `children` enables wrapper components; `...rest` passes extra props through.
- Data flows **down** via props; events flow **up** via callback props.
- Split UIs into small, single-purpose components.
:::
