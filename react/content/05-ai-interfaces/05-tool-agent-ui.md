---
title: Tool Calls, Agents & Generative UI
level: advanced
time: 40
summary: Show what an AI agent is doing — a typed event protocol, a live timeline of thinking, tool calls and results, approve/deny for risky actions, and "generative UI" where tool results render as rich React components.
---

Agents don't just answer — they **search, read files, call APIs and take actions** in a loop. Users need to see what's happening, stop it, and approve anything risky. That's a front-end job.

:::def Tool call
When the model decides to use one of your **tools** (functions like `search_docs` or `send_email`), it outputs the tool's name and JSON input. Your server runs the tool and sends the result back to the model, which continues.
:::

:::def Agent loop
Model → tool call → run tool → result back to model → … repeated until the model gives a final answer. The UI shows each step as it happens.
:::

:::def Human-in-the-loop (HITL)
Pausing the agent so a person can **approve, edit or deny** an action before it happens — essential for anything that sends, buys, deletes or publishes.
:::

## A typed event protocol

Your backend runs the agent loop and streams **events** to the browser. Define them as a discriminated union so the UI handles every case:

```ts
type AgentEvent =
  | { type: "status"; text: string }                                    // "Planning…"
  | { type: "tool_call"; id: string; name: string; input: unknown; needsApproval?: boolean }
  | { type: "tool_result"; id: string; output: unknown; ms: number }
  | { type: "tool_error"; id: string; error: string }
  | { type: "text"; text: string }                                      // final answer, streamed
  | { type: "done"; usage: { input_tokens: number; output_tokens: number } };
```

## A live agent timeline with approvals

The fake agent below emits those events. Risky tools pause until you click **Allow** or **Deny**.

```jsx run level=advanced
import { useReducer, useRef, useState } from "react";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- pretend server-side agent: yields events, asks for approval on risky tools ----------
async function* fakeAgent(task, askApproval) {
  yield { type: "status", text: "Planning how to answer…" };
  await sleep(600);
  yield { type: "tool_call", id: "t1", name: "search_docs", input: { query: "refund policy", top_k: 3 } };
  await sleep(900);
  yield { type: "tool_result", id: "t1", ms: 870, output: [{ title: "Refunds", snippet: "Refunds within 30 days…" }, { title: "Billing FAQ", snippet: "Annual plans…" }] };
  yield { type: "tool_call", id: "t2", name: "get_order", input: { order_id: "A-1042" } };
  await sleep(700);
  yield { type: "tool_result", id: "t2", ms: 640, output: { order_id: "A-1042", days_since_purchase: 12, amount: 49 } };
  yield { type: "tool_call", id: "t3", name: "issue_refund", input: { order_id: "A-1042", amount: 49 }, needsApproval: true };
  const ok = await askApproval("t3");                                       // ⏸ wait for the human
  if (!ok) {
    yield { type: "tool_error", id: "t3", error: "Denied by user" };
    for (const w of "I didn't issue the refund. Order A-1042 is eligible (12 days old) if you change your mind.".split(/(?<= )/)) { await sleep(35); yield { type: "text", text: w }; }
  } else {
    await sleep(800);
    yield { type: "tool_result", id: "t3", ms: 760, output: { refund_id: "R-5531", status: "processed" } };
    for (const w of "Done! I refunded $49 for order A-1042 (refund R-5531). It's within the 30-day window.".split(/(?<= )/)) { await sleep(35); yield { type: "text", text: w }; }
  }
  yield { type: "done", usage: { input_tokens: 2140, output_tokens: 96 } };
}

// ---------- state: a list of steps built from events ----------
function reducer(state, e) {
  switch (e.type) {
    case "reset": return { steps: [], answer: "", status: "running", usage: null };
    case "status": return { ...state, steps: [...state.steps, { kind: "status", text: e.text }] };
    case "tool_call": return { ...state, steps: [...state.steps, { kind: "tool", id: e.id, name: e.name, input: e.input, state: e.needsApproval ? "awaiting" : "running", t0: Date.now() }] };
    case "approved": return { ...state, steps: state.steps.map((s) => (s.id === e.id ? { ...s, state: "running" } : s)) };
    case "tool_result": return { ...state, steps: state.steps.map((s) => (s.id === e.id ? { ...s, state: "done", output: e.output, ms: e.ms } : s)) };
    case "tool_error": return { ...state, steps: state.steps.map((s) => (s.id === e.id ? { ...s, state: "error", error: e.error } : s)) };
    case "text": return { ...state, answer: state.answer + e.text };
    case "done": return { ...state, status: "done", usage: e.usage };
    default: return state;
  }
}

const ICON = { running: "⏳", awaiting: "✋", done: "✅", error: "⛔" };

function ToolStep({ step, onDecide }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ padding: "8px 12px", borderColor: step.state === "awaiting" ? "var(--accent)" : undefined }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button onClick={() => setOpen(!open)} aria-expanded={open} style={{ border: 0, background: "none", padding: 0 }}>
          {ICON[step.state]} <code>{step.name}</code> {open ? "▾" : "▸"}
        </button>
        <small className="muted">{step.ms ? `${step.ms} ms` : step.state}</small>
      </div>
      {open && <pre style={{ marginTop: 6 }}>{JSON.stringify({ input: step.input, output: step.output ?? step.error }, null, 2)}</pre>}
      {step.state === "awaiting" && (
        <div className="stack" style={{ marginTop: 8 }}>
          <span>The agent wants to run <b>{step.name}</b> with <code>{JSON.stringify(step.input)}</code></span>
          <div className="row">
            <button className="primary" onClick={() => onDecide(step.id, true)}>Allow</button>
            <button onClick={() => onDecide(step.id, false)}>Deny</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, { steps: [], answer: "", status: "idle", usage: null });
  const pending = useRef(new Map());                                       // tool id → resolve(decision)

  async function run() {
    dispatch({ type: "reset" });
    const askApproval = (id) => new Promise((resolve) => pending.current.set(id, resolve));
    for await (const event of fakeAgent("Refund order A-1042", askApproval)) dispatch(event);
  }
  function decide(id, ok) {
    if (ok) dispatch({ type: "approved", id });
    pending.current.get(id)?.(ok);
    pending.current.delete(id);
  }

  return (
    <div className="stack" style={{ maxWidth: 480 }}>
      <div className="row">
        <button className="primary" onClick={run} disabled={state.status === "running"}>Ask: “Refund order A-1042”</button>
        {state.usage && <small className="muted">{state.usage.input_tokens + state.usage.output_tokens} tokens</small>}
      </div>
      {state.steps.map((s, i) => s.kind === "status"
        ? <small key={i} className="muted">💭 {s.text}</small>
        : <ToolStep key={s.id} step={s} onDecide={decide} />)}
      {state.answer && <div className="card"><b>Answer:</b> {state.answer}</div>}
    </div>
  );
}
```

Run it twice: once allowing the refund, once denying it. Click a tool name to inspect its input and output.

:::tip Approval design
Show **exactly** what will happen (the tool and its arguments in plain words), make **Deny** as easy as Allow, and let users **edit** arguments before approving (a schema form from the previous lesson is perfect for this). Keep a log of who approved what.
:::

## Generative UI: tool results as components

Instead of dumping JSON, render each tool's result with a **component made for it**. The model picks the tool; your registry picks the component.

```jsx run level=advanced
const WeatherCard = ({ city, tempC, sky }) => (
  <div className="card row" style={{ gap: 14 }}>
    <span style={{ fontSize: 36 }}>{sky === "sunny" ? "☀️" : sky === "rain" ? "🌧️" : "⛅"}</span>
    <div><b>{city}</b><div style={{ fontSize: 24 }}>{tempC}°C</div></div>
  </div>
);

const StockChart = ({ symbol, prices }) => {
  const max = Math.max(...prices), min = Math.min(...prices);
  const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * 200},${50 - ((p - min) / (max - min || 1)) * 45}`).join(" ");
  const up = prices.at(-1) >= prices[0];
  return (
    <div className="card">
      <b>{symbol}</b> <span style={{ color: up ? "var(--ok)" : "var(--danger)" }}>{up ? "▲" : "▼"} {prices.at(-1)}</span>
      <svg viewBox="0 0 200 55" width="100%" height="60" role="img" aria-label={`${symbol} price chart`}>
        <polyline points={pts} fill="none" stroke={up ? "var(--ok)" : "var(--danger)"} strokeWidth="2" />
      </svg>
    </div>
  );
};

const SourceList = ({ results }) => (
  <div className="card"><b>Sources</b><ol>{results.map((r) => <li key={r.url}><a href={r.url}>{r.title}</a></li>)}</ol></div>
);

// tool name → component that knows how to display its result
const registry = { get_weather: WeatherCard, get_stock: StockChart, search_web: SourceList };

function ToolResult({ name, output }) {
  const Component = registry[name];
  return Component ? <Component {...output} /> : <pre>{JSON.stringify(output, null, 2)}</pre>;   // safe fallback
}

// what an agent conversation might contain
const toolResults = [
  { name: "get_weather", output: { city: "Bengaluru", tempC: 27, sky: "cloudy" } },
  { name: "get_stock", output: { symbol: "ACME", prices: [102, 104, 101, 107, 110, 108, 115] } },
  { name: "search_web", output: { results: [{ title: "Attention Is All You Need", url: "https://arxiv.org/abs/1706.03762" }] } },
  { name: "unknown_tool", output: { raw: true } },
];

export default function App() {
  return <div className="stack" style={{ maxWidth: 380 }}>{toolResults.map((r, i) => <ToolResult key={i} {...r} />)}</div>;
}
```

:::warn Never let the model send code to run in your page
Generative UI means the model chooses **from components you wrote**, passing **data** as props. Don't `eval` model-generated JSX or HTML in your app — if you must preview generated code, use a sandboxed iframe.
:::

## Wiring it to the real API

On the server, the agent loop calls Claude with your tools and turns each step into an event for the browser:

```js
// simplified server loop (Node). The browser only ever sees AgentEvents.
const tools = [{
  name: "search_docs",
  description: "Search the company knowledge base. Returns the top matching passages.",
  input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
}];

const messages = [{ role: "user", content: task }];
while (true) {
  const response = await client.messages.create({ model: "claude-opus-5-5", max_tokens: 16000, tools, messages });
  messages.push({ role: "assistant", content: response.content });

  if (response.stop_reason !== "tool_use") {                       // final answer
    send({ type: "text", text: response.content.filter((b) => b.type === "text").map((b) => b.text).join("") });
    break;
  }
  const results = [];
  for (const block of response.content.filter((b) => b.type === "tool_use")) {
    send({ type: "tool_call", id: block.id, name: block.name, input: block.input, needsApproval: RISKY.has(block.name) });
    if (RISKY.has(block.name) && !(await waitForApproval(block.id))) {
      results.push({ type: "tool_result", tool_use_id: block.id, content: "The user denied this action.", is_error: true });
      send({ type: "tool_error", id: block.id, error: "Denied by user" });
      continue;
    }
    const output = await runTool(block.name, block.input);
    send({ type: "tool_result", id: block.id, output, ms: output.ms });
    results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output) });
  }
  messages.push({ role: "user", content: results });
}
```

The approval decision comes back from the browser on a separate request (`POST /api/agent/:runId/approve`) that resolves `waitForApproval`.

:::ai
Good agent UIs share a pattern: a **collapsed-by-default timeline** (details on demand), **clear status** for each step, **elapsed time**, a **Stop** button that cancels the server loop, **approvals** for side-effects, and a **final answer with sources**. Developers also love a "raw trace" view — that's a project in the Project Lab.
:::

## Check yourself

```quiz
? Which tool call should wait for human approval?
+ issue_refund({ amount: 49 })
- search_docs({ query: "refund policy" })
- get_order({ id: "A-1042" })
> Actions with side-effects (money, emails, deletions) need approval.

? How does "generative UI" stay safe?
+ The model chooses from pre-built components and only provides data (props)
- The model writes JSX that the app evals
- It renders the model's HTML with dangerouslySetInnerHTML
> Map tool names to components you control.

? Why model events as a discriminated union?
+ The UI can handle each event type with full type safety and no missed cases
- It makes JSON smaller
- React requires it
> switch (event.type) knows each case's fields.
```

:::keypoints
- Stream agent steps as typed **events**: status, tool_call, tool_result, tool_error, text, done.
- Build state with `useReducer` and render a collapsible **timeline** with per-step status and timing.
- Pause risky tools for **approval**: resolve a promise when the user clicks Allow/Deny.
- **Generative UI**: map tool names to your own components; never eval model-generated code.
:::
