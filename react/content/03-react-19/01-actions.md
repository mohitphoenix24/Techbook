---
title: Actions, useActionState & useFormStatus
level: advanced
time: 32
summary: React 19's new way to handle submissions and async updates — form actions, async transitions, useActionState for results and errors, and useFormStatus for pending UI — with far less boilerplate than useState + handlers.
---

Handling a submit used to mean juggling `isPending`, `error` and `result` state by hand. React 19 introduces **Actions**: async functions that React runs inside a transition, tracking pending state, errors and form resets for you.

:::def Action (React 19)
A function — usually `async` — triggered by a user interaction (form submit, button click) and run inside a **transition**. While it runs, React knows the UI is "pending"; when it finishes, React applies the state updates together. You can pass actions to `<form action={…}>`, `<button formAction={…}>`, `useActionState` and `startTransition`.
:::

## Before and after

```jsx
// Before React 19: manual everything
function Old() {
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [isPending, setIsPending] = useState(false);
  async function handleSubmit(e) {
    e.preventDefault();
    setIsPending(true);
    const err = await updateName(name);
    setIsPending(false);
    if (err) setError(err); else setName("");
  }
  // …
}

// React 19: an Action + useActionState
function New() {
  const [error, submitAction, isPending] = useActionState(async (prev, formData) => {
    const err = await updateName(formData.get("name"));
    return err ?? null;
  }, null);
  return <form action={submitAction}>…</form>;
}
```

## useActionState

:::syntax
```jsx
const [state, formAction, isPending] = useActionState(actionFn, initialState);

async function actionFn(previousState, formData) {
  // do the work, then RETURN the new state (result, error message, …)
}

<form action={formAction}> … </form>
```
:::

```jsx run level=intermediate
import { useActionState } from "react";

async function fakeSubscribe(email) {
  await new Promise((r) => setTimeout(r, 900));
  if (!email.includes("@")) return { ok: false, message: "That doesn't look like an email address." };
  if (email.endsWith("@test.com")) return { ok: false, message: "Test addresses aren't allowed." };
  return { ok: true, message: `🎉 ${email} is on the waitlist!` };
}

export default function App() {
  const [result, submit, isPending] = useActionState(async (previous, formData) => {
    return await fakeSubscribe(String(formData.get("email") ?? ""));
  }, null);

  return (
    <form action={submit} className="stack" style={{ maxWidth: 360 }}>
      <input name="email" placeholder="you@example.com" disabled={isPending} />
      <button className="primary" disabled={isPending}>{isPending ? "Joining…" : "Join waitlist"}</button>
      {result && <p className={result.ok ? "" : "error"}>{result.message}</p>}
    </form>
  );
}
```

Notice: no `useState` for loading, no `preventDefault`, and the input clears automatically after a successful submit (uncontrolled form fields are reset).

:::tip The previous state is useful
The action receives `previousState` first — handy for accumulating results (like a list of past answers) or counting attempts.
:::

```jsx run level=intermediate
import { useActionState } from "react";

const ask = (q) => new Promise((r) => setTimeout(() => r(`(${q.length} chars) A thoughtful answer to “${q}”.`), 700));

export default function App() {
  const [history, askAction, isPending] = useActionState(async (prev, formData) => {
    const q = String(formData.get("q") || "").trim();
    if (!q) return prev;                                   // nothing to do
    const answer = await ask(q);
    return [...prev, { q, answer }];                       // accumulate using previous state
  }, []);

  return (
    <div className="stack" style={{ maxWidth: 440 }}>
      {history.map((h, i) => (
        <div key={i} className="card"><b>Q:</b> {h.q}<br /><b>A:</b> {h.answer}</div>
      ))}
      <form action={askAction} className="row">
        <input name="q" placeholder="Ask something…" style={{ flex: 1 }} />
        <button className="primary" disabled={isPending}>{isPending ? "…" : "Ask"}</button>
      </form>
    </div>
  );
}
```

## useFormStatus: pending UI inside the form

:::def useFormStatus
A hook from `react-dom` that a component **inside** a `<form>` uses to read that form's submission status: `{ pending, data, method, action }`. Perfect for reusable submit buttons that disable themselves.
:::

```jsx run level=intermediate
import { useFormStatus } from "react-dom";
import { useState } from "react";

function SubmitButton({ children }) {
  const { pending, data } = useFormStatus();          // reads the parent <form>'s status
  return (
    <button className="primary" disabled={pending}>
      {pending ? `Saving “${data?.get("title")}”…` : children}
    </button>
  );
}

export default function App() {
  const [saved, setSaved] = useState([]);
  async function save(formData) {
    await new Promise((r) => setTimeout(r, 1000));
    setSaved((s) => [...s, formData.get("title")]);
  }
  return (
    <div className="stack" style={{ maxWidth: 360 }}>
      <form action={save} className="row">
        <input name="title" placeholder="Prompt name" required />
        <SubmitButton>Save prompt</SubmitButton>
      </form>
      <ul>{saved.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}
```

:::warn useFormStatus must be inside the form
It reads the status of the **closest parent** `<form>`. Called in the same component that renders the `<form>`, it won't see it. Put it in a child component like `SubmitButton`.
:::

## Several buttons, several actions

```jsx run level=advanced
import { useActionState } from "react";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const [status, dispatch, isPending] = useActionState(async (prev, formData) => {
    const intent = formData.get("intent");                   // which button was pressed
    await wait(600);
    if (intent === "draft") return `💾 Saved draft (${formData.get("body").length} chars)`;
    if (intent === "publish") return `🚀 Published “${formData.get("title")}”`;
    return prev;
  }, "Not saved yet");

  return (
    <form action={dispatch} className="stack" style={{ maxWidth: 380 }}>
      <input name="title" defaultValue="My system prompt" />
      <textarea name="body" rows={3} defaultValue="You are a precise, friendly assistant." />
      <div className="row">
        <button name="intent" value="draft" disabled={isPending}>Save draft</button>
        <button name="intent" value="publish" className="primary" disabled={isPending}>Publish</button>
      </div>
      <span className="muted">{isPending ? "Working…" : status}</span>
    </form>
  );
}
```

## Actions outside forms: async transitions

Actions aren't only for forms. Pass an async function to `startTransition` (from `useTransition`) and React tracks it as pending.

```jsx run level=intermediate
import { useState, useTransition } from "react";

const regenerate = () => new Promise((r) => setTimeout(() => r(`Fresh answer #${Math.floor(Math.random() * 1000)}`), 900));

export default function App() {
  const [answer, setAnswer] = useState("First answer");
  const [isPending, startTransition] = useTransition();

  function handleRegenerate() {
    startTransition(async () => {                    // an async Action
      const next = await regenerate();
      startTransition(() => setAnswer(next));         // updates after an await go in a transition too
    });
  }

  return (
    <div className="card stack" style={{ maxWidth: 380, opacity: isPending ? 0.6 : 1 }}>
      <p>{answer}</p>
      <button onClick={handleRegenerate} disabled={isPending}>{isPending ? "Regenerating…" : "↻ Regenerate"}</button>
    </div>
  );
}
```

:::note Why the inner startTransition?
State updates that happen **after an `await`** inside an action aren't automatically part of the transition (a JavaScript limitation React expects to remove in future). Wrapping them in `startTransition` again keeps them in the same pending action.
:::

## Error handling in actions

Return errors as **state** for expected problems (validation, "email taken"); **throw** for unexpected ones — a thrown error inside an action propagates to the nearest **error boundary** (see the Error Boundaries lesson).

:::ai
Actions map beautifully onto AI interfaces: the composer is a `<form action={sendAction}>`, the send button uses `useFormStatus` to disable itself while the model is responding, `useActionState` keeps the conversation (or the latest result) as state, and "Regenerate" is an async transition. Pair them with `useOptimistic` (next lesson) to show the user's message instantly.
:::

## Check yourself

```quiz
? What does useActionState return?
+ [state, formAction, isPending]
- [value, setValue]
- A Promise
> Pass formAction to <form action> and read state + isPending.

? What arguments does a useActionState action receive?
+ (previousState, formData)
- (event)
- (formData) only
> The returned value becomes the new state.

? Where must useFormStatus be called?
+ In a component rendered inside the <form>
- In the component that renders the <form>
- Anywhere in the app
> It reads the nearest parent form's status.

? What happens to an uncontrolled form after its action succeeds?
+ React resets the form fields
- Nothing
- The page reloads
> That's built into form actions.
```

:::exercise Feedback form
Build a feedback form with a 1–5 rating `<select name="rating">` and a `<textarea name="comment">`. Use `useActionState` to "submit" (wait 600 ms) and return either `{ error: "Please add a comment for ratings below 3" }` or `{ thanks: "…" }`. Use a `SubmitButton` with `useFormStatus`.
:::

:::solution
```jsx run
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="primary" disabled={pending}>{pending ? "Sending…" : "Send feedback"}</button>;
}

export default function App() {
  const [state, action] = useActionState(async (prev, formData) => {
    await new Promise((r) => setTimeout(r, 600));
    const rating = Number(formData.get("rating"));
    const comment = String(formData.get("comment")).trim();
    if (rating < 3 && !comment) return { error: "Please add a comment for ratings below 3" };
    return { thanks: `Thanks for the ${rating}★ rating!` };
  }, {});
  return (
    <form action={action} className="stack" style={{ maxWidth: 360 }}>
      <select name="rating" defaultValue="5">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ★</option>)}</select>
      <textarea name="comment" rows={3} placeholder="Comments (required below 3★)" />
      <SubmitButton />
      {state.error && <p className="error">{state.error}</p>}
      {state.thanks && <p>{state.thanks}</p>}
    </form>
  );
}
```
:::

:::keypoints
- **Actions** are async functions React runs in a transition, tracking pending state and errors.
- `<form action={fn}>` calls `fn(formData)` and resets the form after success.
- `useActionState(action, initial)` → `[state, formAction, isPending]`; the action returns the next state.
- `useFormStatus()` (react-dom) gives a child of the form its `pending` status.
- `startTransition(async () => …)` turns any async work into an Action.
:::
