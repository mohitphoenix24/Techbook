---
title: Forms & Inputs
level: easy
time: 25
summary: Controlled and uncontrolled inputs, every input type, submitting forms, validation and accessible labels — plus a first look at React 19 form actions.
---

AI apps are full of forms: the chat composer, model settings, prompt templates, feedback, sign-up. React gives you two styles for inputs — and React 19 adds **form actions** that make submitting much simpler.

## Controlled inputs

:::def Controlled input
An input whose value comes from **React state** (`value={text}`) and is updated by an `onChange` handler. React is the single source of truth, so you can validate, transform or reset it easily.
:::

```jsx run level=easy
import { useState } from "react";

export default function App() {
  const [name, setName] = useState("");
  return (
    <div className="stack" style={{ maxWidth: 320 }}>
      <label htmlFor="name">Project name</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value.replace(/\s+/g, "-").toLowerCase())} />
      <span className="muted">Slug: <code>{name || "…"}</code></span>
      <button onClick={() => setName("")}>Reset</button>
    </div>
  );
}
```

The `onChange` handler transforms what you type (spaces → dashes, lowercase) — possible because React controls the value.

## Every kind of input

```jsx run level=intermediate
import { useState } from "react";

export default function App() {
  const [form, setForm] = useState({
    prompt: "Summarise the attached report.",
    model: "claude-opus-5-5",
    effort: "medium",
    maxTokens: 1024,
    stream: true,
    tools: ["web_search"],
  });
  const set = (field) => (e) => {
    const { type, value, checked } = e.target;
    setForm((f) => ({ ...f, [field]: type === "checkbox" ? checked : type === "number" ? Number(value) : value }));
  };
  const toggleTool = (tool) => setForm((f) => ({
    ...f, tools: f.tools.includes(tool) ? f.tools.filter((t) => t !== tool) : [...f.tools, tool],
  }));

  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 20 }}>
      <div className="stack" style={{ width: 300 }}>
        <textarea rows={3} value={form.prompt} onChange={set("prompt")} />
        <select value={form.model} onChange={set("model")}>
          <option>claude-opus-5-5</option><option>claude-sonnet-5-5</option><option>claude-haiku-4-5</option>
        </select>
        <div className="row">
          {["low", "medium", "high"].map((lvl) => (
            <label key={lvl}><input type="radio" name="effort" value={lvl} checked={form.effort === lvl} onChange={set("effort")} /> {lvl}</label>
          ))}
        </div>
        <input type="number" min={1} max={64000} value={form.maxTokens} onChange={set("maxTokens")} />
        <label><input type="checkbox" checked={form.stream} onChange={set("stream")} /> Stream</label>
        <div className="row">
          {["web_search", "calculator", "code_execution"].map((t) => (
            <label key={t}><input type="checkbox" checked={form.tools.includes(t)} onChange={() => toggleTool(t)} /> {t}</label>
          ))}
        </div>
      </div>
      <pre className="card" style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(form, null, 2)}</pre>
    </div>
  );
}
```

| Input | Value prop | Read in onChange |
|---|---|---|
| text, textarea, select | `value` | `e.target.value` |
| number, range | `value` | `Number(e.target.value)` |
| checkbox | `checked` | `e.target.checked` |
| radio | `checked={x === v}` | `e.target.value` |

## Submitting a form

```jsx run level=easy
import { useState } from "react";

export default function App() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();                 // stop the browser's full-page form submission
    setSent(email);
    setEmail("");
  }

  return (
    <form onSubmit={handleSubmit} className="row">
      <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="primary">Join waitlist</button>
      {sent && <span>✅ Added {sent}</span>}
    </form>
  );
}
```

:::tip Use a real `<form>`
Wrapping inputs in a `<form>` gives you Enter-to-submit, built-in validation (`required`, `type="email"`, `minLength`) and better accessibility for free.
:::

## Uncontrolled inputs and FormData

:::def Uncontrolled input
An input that keeps its own value in the DOM (you don't pass `value`). You read the values when the form is submitted — often with `FormData`. Less code when you don't need to react to every keystroke.
:::

```jsx run level=easy
export default function App() {
  function handleSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    console.log("submitted:", data);
    e.currentTarget.reset();
  }
  return (
    <form onSubmit={handleSubmit} className="stack" style={{ maxWidth: 320 }}>
      <input name="title" placeholder="Prompt title" required />
      <textarea name="body" rows={3} placeholder="Prompt text" defaultValue="You are a helpful assistant." />
      <select name="category" defaultValue="writing">
        <option value="writing">Writing</option><option value="coding">Coding</option>
      </select>
      <button className="primary">Save prompt</button>
    </form>
  );
}
```

Use `defaultValue` / `defaultChecked` to give uncontrolled inputs a starting value.

## React 19: form actions

React 19 lets you pass a **function** to a form's `action` prop. React calls it with the `FormData` on submit — no `preventDefault`, and the form resets automatically after the action succeeds.

```jsx run level=intermediate
import { useState } from "react";

export default function App() {
  const [saved, setSaved] = useState([]);

  async function savePrompt(formData) {
    await new Promise((r) => setTimeout(r, 400));             // pretend to call a server
    setSaved((s) => [...s, formData.get("title")]);
  }

  return (
    <div className="stack" style={{ maxWidth: 340 }}>
      <form action={savePrompt} className="row">
        <input name="title" placeholder="Prompt title" required />
        <button className="primary">Save</button>
      </form>
      <ul>{saved.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}
```

:::def Action
In React 19, a function (usually async) that handles a user interaction like a form submit and runs inside a **transition**. React tracks its pending state, errors and optimistic updates. The Modern React module covers `useActionState`, `useFormStatus` and `useOptimistic`, which build on actions.
:::

## Validation

```jsx run level=intermediate
import { useState } from "react";

function validate({ name, apiUrl, temperature }) {
  const errors = {};
  if (name.trim().length < 3) errors.name = "Name must be at least 3 characters.";
  if (!/^https:\/\//.test(apiUrl)) errors.apiUrl = "Use an https:// URL.";
  if (temperature < 0 || temperature > 1) errors.temperature = "Temperature must be between 0 and 1.";
  return errors;
}

export default function App() {
  const [values, setValues] = useState({ name: "", apiUrl: "http://", temperature: 0.7 });
  const [touched, setTouched] = useState({});
  const errors = validate(values);
  const field = (name, extra = {}) => ({
    name, value: values[name], "aria-invalid": !!(touched[name] && errors[name]),
    onChange: (e) => setValues((v) => ({ ...v, [name]: extra.number ? Number(e.target.value) : e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
  });
  const showError = (name) => touched[name] && errors[name] && <span className="error" style={{ fontSize: 13 }}>{errors[name]}</span>;
  const valid = Object.keys(errors).length === 0;

  return (
    <form className="stack" style={{ maxWidth: 340 }} onSubmit={(e) => { e.preventDefault(); console.log("✅ valid:", values); }}>
      <label>Assistant name <input {...field("name")} /></label>{showError("name")}
      <label>Backend URL <input {...field("apiUrl")} /></label>{showError("apiUrl")}
      <label>Temperature <input type="number" step="0.1" {...field("temperature", { number: true })} /></label>{showError("temperature")}
      <button className="primary" disabled={!valid}>Create assistant</button>
    </form>
  );
}
```

Errors show only after a field is **touched** (blurred) — nobody likes red errors before they've typed anything. For bigger forms, libraries like React Hook Form and validation schemas (Zod) help; the Ecosystem and AI modules use Zod.

## Accessibility basics

- Every input needs a **label**: `<label htmlFor="id">` + `id`, or wrap the input inside `<label>`.
- Use the right `type` (`email`, `number`, `url`) — phones show the right keyboard.
- Mark invalid fields with `aria-invalid` and connect error text with `aria-describedby`.
- Buttons inside a form submit by default; use `type="button"` for buttons that shouldn't.

:::ai
The chat composer is a form: a controlled `<textarea>` (to auto-grow, count tokens and clear after send), Enter to send and Shift+Enter for a new line, and a disabled send button while the model is responding.
:::

## Check yourself

```quiz
? What makes an input "controlled"?
+ Its value comes from state via `value`, updated in `onChange`
- It has a `name` attribute
- It is inside a form
> React state is the single source of truth.

? Why call `e.preventDefault()` in onSubmit?
+ To stop the browser from reloading/navigating the page on submit
- To validate the form
- To clear the inputs
> React 19 form actions handle this for you.

? Which prop reads a checkbox's value?
+ checked / e.target.checked
- value / e.target.value
- selected
> Checkboxes use checked.
```

:::exercise Chat composer
Build a composer: a textarea that sends on **Enter** and inserts a newline on **Shift+Enter**, appends the message to a list, clears itself, and ignores empty messages.
:::

:::solution
```jsx run
import { useState } from "react";

export default function App() {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  function send() {
    if (!text.trim()) return;
    setMessages((m) => [...m, text.trim()]);
    setText("");
  }
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      {messages.map((m, i) => <div key={i} className="card">{m}</div>)}
      <textarea rows={2} value={text} placeholder="Message… (Enter to send, Shift+Enter for a new line)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
    </div>
  );
}
```
:::

:::keypoints
- **Controlled** inputs: `value` + `onChange` (React owns the value). **Uncontrolled**: `defaultValue` + read with `FormData`.
- Use a real `<form>` with `onSubmit` (+ `preventDefault`) — or React 19's `action={fn}`.
- Validate on change/blur, show errors after a field is touched, disable submit while invalid.
- Label every input and use the right input types.
:::
