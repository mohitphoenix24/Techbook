---
title: JSX — Writing UI in JavaScript
level: easy
time: 22
summary: How JSX works, its few rules (one root, close every tag, className, camelCase), embedding JavaScript with curly braces, fragments, and what JSX compiles to.
---

JSX lets you describe UI with familiar HTML-like tags, right inside JavaScript. It's the first thing everyone notices about React — and once you know its handful of rules, it feels natural.

:::def JSX
A syntax extension for JavaScript that looks like HTML. Build tools (like Babel or the TypeScript compiler) turn each tag into a JavaScript function call that creates a description of the UI.
:::

## JSX is JavaScript

```jsx run level=easy
export default function App() {
  const user = { name: "Ada", plan: "pro" };
  const tokensLeft = 12500;

  return (
    <div className="card">
      <h2>Welcome back, {user.name}!</h2>
      <p>Plan: {user.plan.toUpperCase()}</p>
      <p>Tokens left: {tokensLeft.toLocaleString()}</p>
      <p>2 + 2 = {2 + 2}</p>
    </div>
  );
}
```

:::def Curly braces in JSX
`{ … }` switches from "markup mode" back to JavaScript. Inside, you can put any **expression** — variables, math, function calls, ternaries — but not statements like `if` or `for`.
:::

## The rules

| Rule | Example |
|---|---|
| Return **one** root element (wrap siblings) | `<div>…</div>` or `<>…</>` |
| **Close every tag**, including self-closing ones | `<img />`, `<input />`, `<br />` |
| `class` → **`className`** | `<div className="card">` |
| `for` → **`htmlFor`** | `<label htmlFor="email">` |
| Attributes are **camelCase** | `onClick`, `tabIndex`, `strokeWidth` |
| `style` takes an **object** | `style={{ color: "red", fontSize: 14 }}` |
| Comments go in braces | `{/* a comment */}` |

```jsx run level=easy
export default function App() {
  return (
    <>
      {/* A fragment <>…</> groups elements without adding a <div> */}
      <label htmlFor="q">Ask a question</label>
      <br />
      <input id="q" placeholder="e.g. What is RAG?" style={{ width: 280, marginTop: 6 }} />
      <p style={{ color: "var(--muted)", fontSize: 13 }}>Press Enter to send</p>
    </>
  );
}
```

:::def Fragment
`<>…</>` (or `<Fragment>…</Fragment>`) lets a component return several elements side by side without wrapping them in an extra DOM element.
:::

:::warn Common JSX errors
- "Adjacent JSX elements must be wrapped in an enclosing tag" → return a single root (use a fragment).
- Writing `class=` instead of `className=` → works with a warning, but use `className`.
- Forgetting to close `<input>` → write `<input />`.
:::

## Attributes with JavaScript values

```jsx run level=easy
export default function App() {
  const avatar = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#6366f1"/><text x="24" y="31" font-size="22" text-anchor="middle">🤖</text></svg>');
  const disabled = true;
  const level = "warning";
  return (
    <div className="row">
      <img src={avatar} alt="Bot avatar" width={48} height={48} />
      <button disabled={disabled}>Can't click me</button>
      <span className={`badge badge-${level}`} title={`Level: ${level}`}>⚠ {level}</span>
    </div>
  );
}
```

Strings can use quotes (`alt="Bot avatar"`); anything else uses braces (`width={48}`, `disabled={disabled}`).

## Embedding lists and conditions (preview)

```jsx run level=easy
const steps = ["Retrieve documents", "Build prompt", "Call the model", "Show the answer"];

export default function App() {
  const done = 2;
  return (
    <ol>
      {steps.map((s, i) => (
        <li key={s} style={{ opacity: i < done ? 0.5 : 1 }}>
          {i < done ? "✅ " : "⏳ "}{s}
        </li>
      ))}
    </ol>
  );
}
```

You'll learn lists and conditionals properly in a later lesson.

## What JSX compiles to

Under the hood, each tag becomes a function call that creates a plain object — a **React element**.

```jsx run level=intermediate
import { createElement } from "react";

const withJSX = <h2 className="title">Hello</h2>;
const withoutJSX = createElement("h2", { className: "title" }, "Hello");

console.log("JSX element:", { type: withJSX.type, props: withJSX.props });
console.log("createElement:", { type: withoutJSX.type, props: withoutJSX.props });

export default function App() {
  return <div>{withJSX}{withoutJSX}</div>;
}
```

:::def React element
A lightweight JavaScript object describing what should appear on screen (`{ type: "h2", props: { … } }`). React compares these descriptions between renders and updates only what changed in the real DOM.
:::

## JSX is safe by default

```jsx run level=intermediate
export default function App() {
  const modelOutput = '<img src=x onerror="alert(\'hacked\')"> Hello!';
  return (
    <div className="stack">
      <p>Rendered as text (safe): {modelOutput}</p>
    </div>
  );
}
```

React **escapes** text you put in braces, so HTML or scripts in data (for example in an AI model's output!) are shown as text, not executed. React only renders raw HTML if you explicitly use the dangerously named `dangerouslySetInnerHTML` — avoid it with untrusted content.

:::ai
LLM output is untrusted text. Rendering it with `{text}` is safe. If you render Markdown from a model, use a Markdown component that sanitises HTML (covered in "Rendering AI output") — never `dangerouslySetInnerHTML` on raw model output.
:::

## Check yourself

```quiz
? How do you write a CSS class in JSX?
+ className="card"
- class="card"
- cssClass="card"
> `class` is a reserved word in JavaScript, so JSX uses className.

? What can you put inside { } in JSX?
+ Any JavaScript expression
- Only variable names
- if statements and for loops
> Use ternaries, &&, map() — expressions, not statements.

? How do you return two sibling elements without an extra div?
+ Wrap them in a fragment <>…</>
- Return an array of strings
- You can't
> Fragments group without adding DOM nodes.
```

:::exercise Profile card
Build a `ProfileCard` that shows a name in an `<h3>`, a role in a muted `<p>`, and a list of three skills from an array — all inside a `div` with `className="card"`. Use a style object to make the name blue.
:::

:::solution
```jsx run
const person = { name: "Ada Lovelace", role: "AI Engineer", skills: ["Python", "React", "RAG"] };

export default function App() {
  return (
    <div className="card">
      <h3 style={{ color: "royalblue" }}>{person.name}</h3>
      <p className="muted">{person.role}</p>
      <ul>{person.skills.map((s) => <li key={s}>{s}</li>)}</ul>
    </div>
  );
}
```
:::

:::keypoints
- JSX = HTML-like syntax that compiles to `createElement` calls producing React elements.
- `{ }` embeds JavaScript expressions; strings can use quotes.
- One root (use fragments), close every tag, `className`, camelCase attributes, `style={{ … }}`.
- Text in braces is escaped — safe for untrusted data like model output.
:::
