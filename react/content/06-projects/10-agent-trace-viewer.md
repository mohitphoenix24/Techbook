---
title: Agent Trace Viewer
level: advanced
time: 70
icon: network
cover: #64748b,#22d3ee
tags: observability, trees, waterfall timeline, Zod, keyboard navigation, developer tools
summary: A developer tool for debugging AI agents — load a trace of nested spans (LLM calls, tools, retrieval), explore it as a collapsible tree aligned with a waterfall timeline, inspect inputs and outputs, see token and cost totals, filter by type, and paste your own trace JSON validated with Zod.
---

When an agent gives a wrong answer, the question is always **"what did it actually do?"** Tracing tools (LangSmith, Langfuse, Arize, OpenTelemetry viewers) show every step as a **span** in a timeline. In this project you build your own.

:::def Trace and span
A **trace** is the full record of one request. It's made of **spans**: timed steps with a name, type, start and end time, inputs and outputs. Spans nest — an "agent" span contains LLM calls and tool calls, which may contain their own children.
:::

:::flow From JSON to UI
Trace JSON | flat list of spans
Validate | Zod schema
Build tree | parentId → children
Flatten visible rows | respects collapsed nodes
Render | tree + waterfall + details
:::

**You'll practise:** turning flat data into a tree, recursive traversal, collapsible rows, timeline maths, keyboard navigation in a tree grid, schema validation of pasted input, and derived totals.

## Step 1 — Flat spans → tree → visible rows

Traces usually arrive as a **flat list** with `parentId` links. We build the tree once, then flatten it into the rows that should be visible (skipping children of collapsed nodes).

```js run title="Step 1 · tree building and flattening"
const spans = [
  { id: "root", parentId: null, name: "agent" },
  { id: "a", parentId: "root", name: "llm: plan" },
  { id: "b", parentId: "root", name: "tool: search" },
  { id: "b1", parentId: "b", name: "http GET" },
  { id: "c", parentId: "root", name: "llm: answer" },
];

function buildTree(spans) {
  const byId = new Map(spans.map((s) => [s.id, { ...s, children: [] }]));
  const roots = [];
  for (const node of byId.values()) (node.parentId ? byId.get(node.parentId).children : roots).push(node);
  return roots;
}

function visibleRows(nodes, collapsed, depth = 0, out = []) {
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (!collapsed.has(n.id)) visibleRows(n.children, collapsed, depth + 1, out);
  }
  return out;
}

const tree = buildTree(spans);
console.log(visibleRows(tree, new Set()).map((r) => "  ".repeat(r.depth) + r.name).join("\n"));
console.log("--- collapse 'b' ---");
console.log(visibleRows(tree, new Set(["b"])).map((r) => "  ".repeat(r.depth) + r.name).join("\n"));
```

## Step 2 — The complete viewer

```jsx run title="Agent Trace Viewer · complete app"
import { useMemo, useState } from "react";
import { z } from "zod";

// ============ schema for a trace ============
const Span = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  type: z.enum(["agent", "llm", "tool", "retrieval"]),
  start: z.number().nonnegative(),          // ms since trace start
  end: z.number().nonnegative(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  tokens: z.object({ input: z.number(), output: z.number() }).optional(),
  model: z.string().optional(),
  error: z.string().optional(),
}).refine((s) => s.end >= s.start, { message: "end must be after start" });
const Trace = z.object({ name: z.string(), spans: z.array(Span).min(1) });

// ============ a sample trace ============
const SAMPLE = {
  name: "Support agent · “Can I get a refund for order A-1042?”",
  spans: [
    { id: "s0", parentId: null, name: "support_agent", type: "agent", start: 0, end: 6420, input: { question: "Can I get a refund for order A-1042?" }, output: { answer: "Yes — refund R-5531 issued." } },
    { id: "s1", parentId: "s0", name: "plan", type: "llm", model: "claude-opus-5-5", start: 20, end: 1480, tokens: { input: 1830, output: 142 }, input: { messages: 2 }, output: { tool_calls: ["search_docs", "get_order"] } },
    { id: "s2", parentId: "s0", name: "search_docs", type: "tool", start: 1500, end: 2380, input: { query: "refund policy" }, output: { hits: 3 } },
    { id: "s2a", parentId: "s2", name: "embed query", type: "retrieval", start: 1510, end: 1690, input: { model: "voyage-4" }, output: { dims: 1024 } },
    { id: "s2b", parentId: "s2", name: "vector search", type: "retrieval", start: 1700, end: 2050, input: { top_k: 20 }, output: { candidates: 20 } },
    { id: "s2c", parentId: "s2", name: "rerank", type: "retrieval", start: 2060, end: 2370, input: { candidates: 20 }, output: { kept: 3 } },
    { id: "s3", parentId: "s0", name: "get_order", type: "tool", start: 1500, end: 2900, input: { order_id: "A-1042" }, error: "Timeout after 1.4s (retrying)" },
    { id: "s4", parentId: "s0", name: "get_order (retry)", type: "tool", start: 2910, end: 3350, input: { order_id: "A-1042" }, output: { days_since_purchase: 12, amount: 49 } },
    { id: "s5", parentId: "s0", name: "decide", type: "llm", model: "claude-opus-5-5", start: 3360, end: 4630, tokens: { input: 3120, output: 96 }, output: { tool_calls: ["issue_refund"] } },
    { id: "s6", parentId: "s0", name: "issue_refund", type: "tool", start: 4640, end: 5210, input: { order_id: "A-1042", amount: 49 }, output: { refund_id: "R-5531" } },
    { id: "s7", parentId: "s0", name: "final answer", type: "llm", model: "claude-opus-5-5", start: 5220, end: 6400, tokens: { input: 3380, output: 88 }, output: { text: "Yes! I've refunded $49 (refund R-5531)…" } },
  ],
};

const COLORS = { agent: "#64748b", llm: "#8b5cf6", tool: "#0ea5e9", retrieval: "#22c55e" };
const RATES = { input: 5, output: 25 };     // example $ per million tokens

function buildTree(spans) {
  const byId = new Map(spans.map((s) => [s.id, { ...s, children: [] }]));
  const roots = [];
  for (const n of byId.values()) (n.parentId && byId.has(n.parentId) ? byId.get(n.parentId).children : roots).push(n);
  const sortRec = (ns) => { ns.sort((a, b) => a.start - b.start); ns.forEach((n) => sortRec(n.children)); };
  sortRec(roots);
  return roots;
}
function flatten(nodes, collapsed, depth = 0, out = []) {
  for (const n of nodes) { out.push({ ...n, depth }); if (!collapsed.has(n.id)) flatten(n.children, collapsed, depth + 1, out); }
  return out;
}

// ============ components ============
function Waterfall({ span, total }) {
  const left = (span.start / total) * 100, width = Math.max(0.6, ((span.end - span.start) / total) * 100);
  return (
    <div style={{ position: "relative", height: 14 }}>
      <div title={`${span.start}–${span.end} ms`} style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 2, height: 10, borderRadius: 3,
        background: span.error ? "var(--danger)" : COLORS[span.type], opacity: span.type === "agent" ? 0.45 : 0.9 }} />
    </div>
  );
}

function Details({ span }) {
  if (!span) return <p className="muted">Select a span to see its details.</p>;
  const dur = span.end - span.start;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>{span.name}</b>
        <small style={{ color: COLORS[span.type] }}>● {span.type}</small>
      </div>
      <small className="muted">{dur} ms · starts at {span.start} ms{span.model ? ` · ${span.model}` : ""}</small>
      {span.tokens && <small>🔢 {span.tokens.input.toLocaleString()} in / {span.tokens.output.toLocaleString()} out tokens</small>}
      {span.error && <div className="error" role="alert">⚠ {span.error}</div>}
      {span.input !== undefined && <><small className="muted">Input</small><pre style={{ margin: 0 }}>{JSON.stringify(span.input, null, 2)}</pre></>}
      {span.output !== undefined && <><small className="muted">Output</small><pre style={{ margin: 0 }}>{JSON.stringify(span.output, null, 2)}</pre></>}
    </div>
  );
}

function Importer({ onLoad }) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState([]);
  function load() {
    let json;
    try { json = JSON.parse(text); } catch (e) { return setErrors([`Invalid JSON: ${e.message}`]); }
    const r = Trace.safeParse(json);
    if (!r.success) return setErrors(r.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
    setErrors([]); onLoad(r.data);
  }
  return (
    <details>
      <summary className="muted">Paste your own trace JSON</summary>
      <div className="stack" style={{ marginTop: 6 }}>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"name": "...", "spans": [{"id": "a", "parentId": null, "name": "agent", "type": "agent", "start": 0, "end": 100}]}' style={{ fontFamily: "monospace", fontSize: 12 }} />
        <div className="row"><button onClick={load}>Load trace</button><button onClick={() => setText(JSON.stringify(SAMPLE, null, 1))}>Insert sample</button></div>
        {errors.map((e) => <small key={e} className="error">{e}</small>)}
      </div>
    </details>
  );
}

export default function App() {
  const [trace, setTrace] = useState(SAMPLE);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState("s3");
  const [types, setTypes] = useState(() => new Set(Object.keys(COLORS)));
  const [query, setQuery] = useState("");

  const tree = useMemo(() => buildTree(trace.spans), [trace]);
  const total = useMemo(() => Math.max(...trace.spans.map((s) => s.end)), [trace]);
  const rows = flatten(tree, collapsed).filter((r) => types.has(r.type) && (!query || r.name.toLowerCase().includes(query.toLowerCase())));
  const selected = trace.spans.find((s) => s.id === selectedId);
  const totals = useMemo(() => {
    const llm = trace.spans.filter((s) => s.tokens);
    const input = llm.reduce((t, s) => t + s.tokens.input, 0), output = llm.reduce((t, s) => t + s.tokens.output, 0);
    return { llmCalls: llm.length, tools: trace.spans.filter((s) => s.type === "tool").length, errors: trace.spans.filter((s) => s.error).length,
      input, output, cost: (input * RATES.input + output * RATES.output) / 1e6 };
  }, [trace]);

  const toggle = (id) => setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleType = (t) => setTypes((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });

  function onKeyDown(e) {
    const i = rows.findIndex((r) => r.id === selectedId);
    const row = rows[i];
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedId(rows[Math.min(i + 1, rows.length - 1)]?.id); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedId(rows[Math.max(i - 1, 0)]?.id); }
    if (e.key === "ArrowLeft" && row) {
      if (row.children.length && !collapsed.has(row.id)) toggle(row.id);   // collapse an open node…
      else if (row.parentId) setSelectedId(row.parentId);                    // …or jump to the parent
    }
    if (e.key === "ArrowRight" && row && collapsed.has(row.id)) toggle(row.id);
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b style={{ fontSize: 14 }}>🧭 {trace.name}</b>
        <small className="muted">{(total / 1000).toFixed(2)} s total</small>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {[["LLM calls", totals.llmCalls], ["Tool calls", totals.tools], ["Tokens", `${totals.input.toLocaleString()} / ${totals.output.toLocaleString()}`], ["Cost (example)", `$${totals.cost.toFixed(4)}`], ["Errors", totals.errors]].map(([k, v]) => (
          <div key={k} className="card" style={{ padding: "4px 10px", flex: "1 1 auto" }}><small className="muted">{k}</small><div style={{ fontWeight: 700, color: k === "Errors" && v ? "var(--danger)" : undefined }}>{v}</div></div>
        ))}
      </div>
      <div className="row" style={{ gap: 4 }}>
        {Object.entries(COLORS).map(([t, c]) => (
          <button key={t} onClick={() => toggleType(t)} aria-pressed={types.has(t)} style={{ padding: "1px 9px", fontSize: 12, borderColor: c, background: types.has(t) ? c : "transparent", color: types.has(t) ? "white" : c }}>{t}</button>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter spans…" aria-label="Filter spans" style={{ padding: "2px 8px", width: 130 }} />
      </div>

      <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
        <div role="treegrid" aria-label="Spans" tabIndex={0} onKeyDown={onKeyDown} className="card" style={{ flex: "2 1 340px", padding: 6, outlineOffset: 2 }}>
          {rows.map((r) => (
            <div key={r.id} role="row" aria-selected={r.id === selectedId} aria-level={r.depth + 1} aria-expanded={r.children.length ? !collapsed.has(r.id) : undefined}
              onClick={() => setSelectedId(r.id)}
              style={{ display: "grid", gridTemplateColumns: "minmax(140px, 45%) 1fr 64px", alignItems: "center", gap: 6, padding: "3px 4px", borderRadius: 6, cursor: "pointer",
                background: r.id === selectedId ? "color-mix(in srgb, var(--accent) 18%, transparent)" : undefined }}>
              <span style={{ paddingLeft: r.depth * 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}>
                {r.children.length ? <button onClick={(e) => { e.stopPropagation(); toggle(r.id); }} aria-label={collapsed.has(r.id) ? "Expand" : "Collapse"} style={{ padding: "0 4px", border: 0, background: "none" }}>{collapsed.has(r.id) ? "▸" : "▾"}</button> : <span style={{ display: "inline-block", width: 18 }} />}
                <span style={{ color: COLORS[r.type] }}>●</span> {r.name}{r.error && " ⚠"}
              </span>
              <Waterfall span={r} total={total} />
              <small className="muted" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{r.end - r.start} ms</small>
            </div>
          ))}
          {rows.length === 0 && <small className="muted">No spans match the filters.</small>}
        </div>
        <div className="card" style={{ flex: "1 1 220px", minWidth: 0 }}><Details span={selected} /></div>
      </div>
      <Importer onLoad={(t) => { setTrace(t); setCollapsed(new Set()); setSelectedId(t.spans[0].id); }} />
      <small className="muted">Click the span list, then use ↑ ↓ to move, ← to collapse or go to the parent, → to expand.</small>
    </div>
  );
}
```

Things to notice: the failed `get_order` call (red bar) and its retry, `search_docs` running **in parallel** with `get_order`, the three retrieval sub-steps, and how much of the total time is spent in LLM calls. Try pasting broken JSON or a span with `"type": "database"` to see validation errors.

## Producing traces from your backend

Wrap each step of your agent in a tiny span helper and send the list to the browser (or to a tracing service):

```js
function createTracer() {
  const t0 = performance.now(), spans = [];
  async function span(name, type, parentId, fn, input) {
    const s = { id: crypto.randomUUID(), parentId, name, type, start: Math.round(performance.now() - t0), input };
    spans.push(s);
    try { s.output = await fn(s.id); return s.output; }
    catch (err) { s.error = String(err); throw err; }
    finally { s.end = Math.round(performance.now() - t0); }
  }
  return { span, spans };
}

// usage
const tracer = createTracer();
await tracer.span("support_agent", "agent", null, async (rootId) => {
  const plan = await tracer.span("plan", "llm", rootId, () => client.messages.create({ /* … */ }));
  // …
});
res.json({ name: "Support agent", spans: tracer.spans });
```

In production, use **OpenTelemetry** with an LLM-aware backend (Langfuse, Arize Phoenix, LangSmith…) — and your own viewer for custom views like this one.

## How it works

| Feature | Technique |
|---|---|
| tree from flat spans | a `Map` by id, push each node into its parent's `children` |
| collapsible rows | recursive `flatten` that skips children of collapsed ids |
| waterfall bars | `left = start / total`, `width = duration / total`, as percentages |
| details panel | the selected span's input/output pretty-printed with `JSON.stringify(x, null, 2)` |
| totals | derived with `useMemo` from all spans (tokens, cost, errors) |
| keyboard | `treegrid` with ↑ ↓ to move, ← to collapse (or jump to the parent), → to expand |
| import | `JSON.parse` + a Zod schema with a `refine` rule, showing the first few issues |

:::exercise Extend it
1. Highlight the **critical path**: the chain of spans that determines total latency.
2. Add a **compare** mode: load two traces side by side (e.g. before/after a prompt change).
3. Add a **search inside inputs and outputs**, not just names.
4. Stream spans **live** from a running agent (SSE) and animate new rows in.
:::

:::keypoints
- Traces are flat spans with parent links: build a tree once, flatten to visible rows on each render.
- Waterfall timelines are simple percentage maths on start/end times.
- Validate any user-supplied JSON with a schema and show clear, path-specific errors.
- Good developer tools combine overview (totals, timeline) with detail on demand (inputs, outputs, errors).
:::
