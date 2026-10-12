---
title: Accessibility (a11y)
level: intermediate
time: 25
summary: Build interfaces everyone can use — semantic HTML, labels, keyboard support, focus management, accessible forms and dialogs, and live regions so screen readers can follow a streaming AI answer.
---

About 1 in 6 people live with a disability. Accessible apps work with **keyboards**, **screen readers**, **zoom** and **voice control** — and they're usually better for everyone (clearer labels, better focus, fewer surprises). Accessibility is often called **a11y** (a + 11 letters + y).

:::def Accessibility
Making sure people with different abilities — vision, hearing, movement, cognition — can perceive, understand and operate your interface.
:::

:::def ARIA
"Accessible Rich Internet Applications": HTML attributes (`aria-label`, `aria-live`, `role`, …) that describe meaning to assistive technology **when native HTML can't**. Rule #1 of ARIA: if a native element exists, use it instead.
:::

## Use the right HTML element

```jsx run level=easy
export default function App() {
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      {/* ❌ looks like a button, but no keyboard focus, no Enter/Space, not announced as a button */}
      <div className="card" onClick={() => console.log("div clicked")} style={{ cursor: "pointer" }}>
        ❌ I'm a clickable div — try reaching me with Tab
      </div>

      {/* ✅ a real button: focusable, works with Enter and Space, announced as "button" */}
      <button onClick={() => console.log("button clicked")}>✅ I'm a real button — Tab to me and press Enter</button>

      {/* ✅ links navigate, buttons do actions */}
      <a href="#docs">Docs (a link goes somewhere)</a>
    </div>
  );
}
```

| Need | Use | Not |
|---|---|---|
| an action | `<button>` | `<div onClick>` |
| navigation | `<a href>` / `<Link>` | `<span onClick>` |
| page regions | `<header> <nav> <main> <aside> <footer>` | `<div>` everywhere |
| headings | `<h1>`…`<h6>` in order | big bold `<div>`s |
| lists | `<ul>/<ol>` + `<li>` | stacked `<div>`s |
| a modal | `<dialog>` | a `<div>` overlay |

## Labels for everything

```jsx run level=easy
import { useId } from "react";

export default function App() {
  const id = useId();                              // unique ids, safe even with multiple instances
  return (
    <form className="stack" style={{ maxWidth: 380 }} onSubmit={(e) => e.preventDefault()}>
      <label htmlFor={`${id}-q`}>Question</label>
      <input id={`${id}-q`} placeholder="Ask about your documents…" />

      {/* icon-only buttons need an accessible name */}
      <div className="row">
        <button type="button" aria-label="Attach a file">📎</button>
        <button type="button" aria-label="Start voice input">🎤</button>
        <button className="primary">Send</button>
      </div>

      {/* decorative images get empty alt; meaningful ones describe the content */}
      <img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'/%3E" />
    </form>
  );
}
```

:::warn Placeholders are not labels
A placeholder disappears as soon as someone types, often has low contrast, and isn't reliably read by screen readers. Always add a real `<label>` (it can be visually hidden if your design needs it).
:::

## Accessible form errors

```jsx run level=intermediate
import { useId, useState } from "react";

export default function App() {
  const id = useId();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  function onSubmit(e) {
    e.preventDefault();
    setError(key.startsWith("proj_") ? "" : "Project IDs start with proj_");
  }
  return (
    <form onSubmit={onSubmit} noValidate className="stack" style={{ maxWidth: 360 }}>
      <label htmlFor={`${id}-pid`}>Project ID</label>
      <input
        id={`${id}-pid`}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        aria-invalid={!!error}                         // announced as "invalid entry"
        aria-describedby={error ? `${id}-err` : undefined}   // error text is read with the field
      />
      {error && <p id={`${id}-err`} role="alert" className="error">{error}</p>}
      <button className="primary">Save</button>
    </form>
  );
}
```

## Keyboard support and focus

Everything you can do with a mouse must work with the keyboard: **Tab** moves between controls, **Enter/Space** activate, **Arrow keys** move inside widgets (tabs, menus, lists), **Escape** closes things.

```jsx run level=advanced
import { useRef, useState } from "react";

const tabs = ["Answer", "Sources", "Raw JSON"];

export default function App() {
  const [active, setActive] = useState(0);
  const refs = useRef([]);
  function onKeyDown(e) {
    const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!dir) return;
    const next = (active + dir + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next].focus();                        // move focus with the selection
  }
  return (
    <div style={{ maxWidth: 420 }}>
      <div role="tablist" aria-label="Response views" className="row" onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={t}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            id={`tab-${i}`}
            aria-selected={active === i}
            aria-controls={`panel-${i}`}
            tabIndex={active === i ? 0 : -1}           // only the active tab is in the Tab order
            className={active === i ? "primary" : ""}
            onClick={() => setActive(i)}
          >{t}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} className="card" style={{ marginTop: 8 }}>
        {active === 0 && "Paris is the capital of France."}
        {active === 1 && "📄 geography.pdf, page 3"}
        {active === 2 && <code>{'{"answer":"Paris","sources":[3]}'}</code>}
      </div>
      <p className="muted">Click a tab, then use ← → arrow keys.</p>
    </div>
  );
}
```

:::tip Never remove the focus outline without a replacement
`outline: none` makes keyboard users lose track of where they are. Style `:focus-visible` instead — it shows only for keyboard navigation.
:::

## Dialogs the easy way: `<dialog>`

The native `<dialog>` element gives you focus trapping, Escape to close, and a backdrop — for free.

```jsx run level=intermediate
import { useRef } from "react";

export default function App() {
  const dialogRef = useRef(null);
  return (
    <>
      <button onClick={() => dialogRef.current.showModal()}>Delete conversation…</button>
      <dialog ref={dialogRef} aria-labelledby="del-title" onClose={() => console.log("closed with:", dialogRef.current.returnValue || "escape")}>
        <form method="dialog" className="stack">
          <h3 id="del-title">Delete this conversation?</h3>
          <p>This can't be undone.</p>
          <div className="row">
            <button value="cancel" autoFocus>Cancel</button>
            <button value="delete" className="primary">Delete</button>
          </div>
        </form>
      </dialog>
      <p className="muted">Open it, then try Tab, Escape, or the buttons. Focus returns to the opener.</p>
    </>
  );
}
```

## Live regions: announcing streaming AI output

:::def Live region
An element with `aria-live` whose content changes are **announced** by screen readers without moving focus. `polite` waits for a pause; `assertive` interrupts (use rarely).
:::

A streaming answer changes dozens of times a second — announcing every token would be unbearable. Announce **status changes** instead, and let users read the finished answer:

```jsx run level=advanced
import { useState } from "react";

const answer = "Retrieval-augmented generation fetches relevant documents and gives them to the model as context.";

export default function App() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  function ask() {
    setText(""); setBusy(true); setStatus("Assistant is responding…");
    const words = answer.split(" ");
    words.forEach((w, i) => setTimeout(() => {
      setText((t) => t + (i ? " " : "") + w);
      if (i === words.length - 1) { setBusy(false); setStatus("Response complete."); }
    }, 80 * (i + 1)));
  }

  return (
    <div className="stack" style={{ maxWidth: 440 }}>
      <button className="primary" onClick={ask} disabled={busy}>Ask: what is RAG?</button>

      {/* the visible answer: aria-busy tells assistive tech it's still changing */}
      <div className="card" aria-busy={busy} aria-label="Assistant response">{text || <span className="muted">No answer yet</span>}</div>

      {/* a polite live region that announces only status changes */}
      <p role="status" aria-live="polite" className="muted">{status}</p>
    </div>
  );
}
```

## Respect user preferences

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- **Colour contrast**: body text at least **4.5:1** against its background.
- **Don't rely on colour alone**: an error is red **and** has an icon or text.
- **Zoom**: the layout should work at 200% zoom and on small screens.
- **Tools**: the axe DevTools extension, Lighthouse, `eslint-plugin-jsx-a11y`, and actually trying your app with only a keyboard and a screen reader (VoiceOver, NVDA).

:::ai
AI interfaces have special a11y needs: announce "responding…" and "done" via a live region (not every token), give the **Stop** button a clear label and keyboard shortcut, make code blocks' copy buttons labelled, provide text alternatives for generated images, and keep focus in the composer after sending so keyboard users can keep chatting.
:::

## Check yourself

```quiz
? What's wrong with `<div onClick={save}>Save</div>`?
+ It can't be reached or activated with the keyboard and isn't announced as a button
- Nothing
- divs can't have onClick
> Use <button>, which has keyboard support and the right role built in.

? How should a screen reader user learn that a streaming answer finished?
+ A polite live region announcing "Response complete."
- Announce every token with aria-live="assertive"
- Play a sound only
> Announce status changes, not every token.

? An icon-only 📎 button needs…
+ an accessible name, e.g. aria-label="Attach a file"
- a tooltip only
- nothing, the emoji is enough
> Screen readers need a text name.
```

:::keypoints
- Use semantic HTML first (`button`, `a`, `label`, `dialog`, landmarks); add ARIA only when needed.
- Every input needs a label; icon buttons need `aria-label`; link errors with `aria-invalid` + `aria-describedby`.
- Everything must work with the keyboard; manage focus deliberately; keep visible focus styles.
- Use `aria-live` / `role="status"` to announce status changes — especially for streaming AI output.
- Respect reduced motion, contrast and zoom; test with axe, Lighthouse and a real keyboard.
:::
