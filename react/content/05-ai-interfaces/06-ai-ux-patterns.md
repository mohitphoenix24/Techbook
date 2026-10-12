---
title: AI UX Patterns
level: advanced
time: 35
summary: The details that make AI products feel fast, trustworthy and pleasant — a great composer, starter prompts, message actions (copy, regenerate with versions, feedback), progress you can trust, context and cost meters, and graceful failure.
---

Two AI apps can use the same model and still feel completely different. The difference is **UX**: how input feels, how waiting feels, how mistakes are handled. This lesson collects the patterns used by the best AI products.

:::def Perceived performance
How fast an app **feels**, not just how fast it is. Streaming, instant feedback, skeletons and progress messages make a 10-second answer feel quick.
:::

## The composer

The message box is the most-used control in a chat app. A good one:

- **grows** with the text (up to a limit), then scrolls;
- sends with **Enter**, adds a new line with **Shift+Enter**;
- doesn't send while typing with an **IME** (Chinese, Japanese, Korean keyboards use Enter to confirm characters);
- keeps your **draft** if you navigate away;
- shows **starter prompts** when the chat is empty.

```jsx run level=intermediate
import { useEffect, useRef, useState } from "react";

const starters = ["Explain RAG like I'm 12", "Write a SQL query for top customers", "Summarise this week's tickets"];

function Composer({ onSend, disabled }) {
  const [text, setText] = useState(() => { try { return localStorage.getItem("draft") ?? ""; } catch { return ""; } });
  const ref = useRef(null);

  useEffect(() => {                                        // auto-grow up to ~6 lines
    const el = ref.current;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
    try { localStorage.setItem("draft", text); } catch {}
  }, [text]);

  function submit() {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  }
  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {   // IME-safe
      e.preventDefault();
      submit();
    }
  }
  const tokens = Math.ceil(text.length / 4);              // rough estimate: ~4 characters per token

  return (
    <div className="card stack" style={{ padding: 10 }}>
      <textarea ref={ref} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
        placeholder="Message… (Enter to send, Shift+Enter for a new line)" aria-label="Message"
        style={{ resize: "none", border: 0, background: "transparent", boxShadow: "none" }} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <small className="muted">≈ {tokens} tokens</small>
        <button className="primary" onClick={submit} disabled={!text.trim() || disabled}>Send ↵</button>
      </div>
    </div>
  );
}

export default function App() {
  const [sent, setSent] = useState([]);
  return (
    <div className="stack" style={{ maxWidth: 480 }}>
      {sent.length === 0 ? (
        <div className="stack">
          <span className="muted">Try one of these:</span>
          <div className="row">{starters.map((s) => <button key={s} onClick={() => setSent([s])}>{s}</button>)}</div>
        </div>
      ) : sent.map((m, i) => <div key={i} className="card" style={{ alignSelf: "flex-end" }}>{m}</div>)}
      <Composer onSend={(t) => setSent((s) => [...s, t])} />
    </div>
  );
}
```

## Message actions: copy, regenerate, feedback

Every answer should be easy to **copy**, **retry** and **rate**. Regenerating shouldn't throw away the old answer — keep **versions** the user can flip between.

```jsx run level=advanced
import { useState } from "react";

const alternatives = [
  "Vectors close together have similar meanings, so search finds related ideas, not just matching words.",
  "Embeddings map text to points in space. Nearby points = similar meaning. That's how semantic search works.",
  "Think of a map where every sentence is a city: cities about similar topics are neighbours.",
];

function AssistantMessage() {
  const [versions, setVersions] = useState([alternatives[0]]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);          // "up" | "down" | null
  const [copied, setCopied] = useState(false);

  function regenerate() {
    setLoading(true);
    setTimeout(() => {
      const next = alternatives[versions.length % alternatives.length];
      setVersions((v) => [...v, next]);
      setIndex(versions.length);                             // jump to the new version
      setLoading(false);
      setFeedback(null);
    }, 700);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(versions[index]); } catch {}
    setCopied(true); setTimeout(() => setCopied(false), 1200);
  }
  function rate(value) {
    setFeedback(value);
    console.log("feedback sent:", { version: index + 1, value });   // POST /api/feedback in a real app
  }

  return (
    <div className="card stack">
      <div style={{ opacity: loading ? 0.4 : 1 }}>{versions[index]}</div>
      <div className="row" style={{ fontSize: 13 }}>
        {versions.length > 1 && (
          <span className="row" style={{ gap: 2 }}>
            <button aria-label="Previous version" disabled={index === 0} onClick={() => setIndex(index - 1)}>‹</button>
            <small>{index + 1}/{versions.length}</small>
            <button aria-label="Next version" disabled={index === versions.length - 1} onClick={() => setIndex(index + 1)}>›</button>
          </span>
        )}
        <button onClick={copy} aria-label="Copy answer">{copied ? "✓" : "⧉"} Copy</button>
        <button onClick={regenerate} disabled={loading} aria-label="Regenerate answer">↻ {loading ? "…" : "Retry"}</button>
        <button aria-pressed={feedback === "up"} onClick={() => rate("up")} aria-label="Good answer" className={feedback === "up" ? "primary" : ""}>👍</button>
        <button aria-pressed={feedback === "down"} onClick={() => rate("down")} aria-label="Bad answer" className={feedback === "down" ? "primary" : ""}>👎</button>
      </div>
      {feedback === "down" && (
        <div className="row">
          {["Inaccurate", "Too long", "Not helpful"].map((r) => <button key={r} onClick={() => console.log("reason:", r)}>{r}</button>)}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <div className="stack" style={{ maxWidth: 460 }}>
      <div className="card" style={{ alignSelf: "flex-end" }}>What are embeddings, simply?</div>
      <AssistantMessage />
    </div>
  );
}
```

:::tip Feedback is data
👍/👎 with a reason, linked to the exact prompt, model and version, is one of the most valuable things your app collects. It becomes your **eval set** and tells you which prompt changes actually help.
:::

## Progress you can trust

Long tasks (research, file analysis, agents) need **honest** progress: what's happening now, what's done, how long it's been. Avoid fake progress bars.

```jsx run level=intermediate
import { useEffect, useState } from "react";

const plan = ["Reading 3 uploaded files", "Searching the knowledge base", "Comparing findings", "Writing the report"];

export default function App() {
  const [step, setStep] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const running = step >= 0 && step < plan.length;

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setElapsed((s) => s + 0.1), 100);
    const next = setTimeout(() => setStep((s) => s + 1), 1100);
    return () => { clearInterval(tick); clearTimeout(next); };
  }, [running, step]);

  return (
    <div className="stack" style={{ maxWidth: 380 }}>
      <button className="primary" disabled={running} onClick={() => { setStep(0); setElapsed(0); }}>Start research</button>
      {step >= 0 && (
        <div className="card stack" role="status" aria-live="polite">
          {plan.map((label, i) => (
            <div key={label} className="row" style={{ opacity: i > step ? 0.45 : 1 }}>
              <span style={{ width: 20 }}>{i < step ? "✅" : i === step ? "⏳" : "○"}</span>{label}
            </div>
          ))}
          <small className="muted">{running ? `Working… ${elapsed.toFixed(1)}s` : `Finished in ${elapsed.toFixed(1)}s`}</small>
        </div>
      )}
      {step >= 0 && running && <div className="stack" aria-hidden="true">
        {[90, 75, 82].map((w, i) => <div key={i} style={{ height: 12, width: `${w}%`, borderRadius: 6, background: "var(--card)", border: "1px solid var(--border)" }} />)}
      </div>}
    </div>
  );
}
```

## Context and cost meters

Power users want to know how much of the **context window** a conversation uses — long chats get slower, pricier and may need summarising.

```jsx run level=intermediate
import { useState } from "react";

const CONTEXT_WINDOW = 1_000_000;          // tokens the model can read at once
const PRICE = { input: 5, output: 25 };    // example rates in $ per million tokens — use your real pricing

export default function App() {
  const [inputTokens, setInputTokens] = useState(180_000);
  const [outputTokens, setOutputTokens] = useState(12_000);
  const used = inputTokens + outputTokens;
  const pct = Math.min(100, (used / CONTEXT_WINDOW) * 100);
  const cost = (inputTokens * PRICE.input + outputTokens * PRICE.output) / 1_000_000;
  const color = pct > 85 ? "var(--danger)" : pct > 60 ? "#f59e0b" : "var(--ok)";
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <label>Input tokens: {inputTokens.toLocaleString()}<input type="range" min={0} max={900000} step={1000} value={inputTokens} onChange={(e) => setInputTokens(+e.target.value)} style={{ width: "100%" }} /></label>
      <label>Output tokens: {outputTokens.toLocaleString()}<input type="range" min={0} max={100000} step={1000} value={outputTokens} onChange={(e) => setOutputTokens(+e.target.value)} style={{ width: "100%" }} /></label>
      <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Context used"
        style={{ height: 10, borderRadius: 5, background: "var(--card)", border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width .2s" }} />
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <small>{pct.toFixed(1)}% of context</small>
        <small className="muted">≈ ${cost.toFixed(2)} at example rates</small>
      </div>
      {pct > 85 && <p className="error">This chat is nearly full. <button>Summarise & continue in a new chat</button></p>}
    </div>
  );
}
```

## A checklist of patterns

| Moment | Pattern |
|---|---|
| empty state | starter prompts, examples of what the assistant can do, capabilities and limits |
| typing | auto-grow, Enter/Shift+Enter, IME-safe, drafts saved, paste/drag files, `/` commands |
| sending | show the user's message **instantly** (optimistic), disable double-send, keep focus in the composer |
| waiting | stream; show step status for tools; elapsed time; **Stop** button |
| answer | Markdown, copy buttons on code, citations, regenerate with versions, edit-and-resend, 👍/👎 |
| failure | keep the user's text, clear message, **Retry**, partial answer kept if a stream breaks |
| trust | show sources, show what tools did, approval for actions, "AI can make mistakes" where it matters |
| long chats | context meter, summarise & continue, search over past chats |
| speed | prefetch on hover, cache conversations (TanStack Query), virtualise very long lists |

:::warn Don't fake it
Fake typing delays, spinners with made-up percentages and "thinking…" when nothing is happening break trust once users notice. Show **real** progress: real tokens, real tool steps, real elapsed time.
:::

:::ai
The same patterns apply beyond chat: AI search (instant results + streamed summary with citations), writing assistants (inline suggestions with accept/reject), code assistants (diff view with apply/undo), and extraction tools (review forms). The Project Lab builds several of these.
:::

## Check yourself

```quiz
? A Japanese user presses Enter to confirm a character and the message sends early. What's the fix?
+ Ignore Enter while e.nativeEvent.isComposing is true
- Remove Enter-to-send
- Use onKeyUp instead of onKeyDown
> IME composition uses Enter; check isComposing.

? The user clicks Regenerate. What's the best behaviour?
+ Add a new version and let them switch between versions
- Replace the old answer forever
- Start a new chat
> Users often prefer an earlier answer.

? A stream fails halfway. What should the UI do?
+ Keep the partial answer, show an error and a Retry button
- Delete the message silently
- Show only a generic 500 page
> Never lose the user's work or the partial result.
```

:::keypoints
- The composer matters: auto-grow, Enter/Shift+Enter, IME-safe, saved drafts, starter prompts.
- Give every answer actions: copy, regenerate (keep versions), edit & resend, 👍/👎 with reasons.
- Show honest progress: real steps, elapsed time, Stop — never fake progress.
- Help power users with context and cost meters; handle failure without losing work.
:::
