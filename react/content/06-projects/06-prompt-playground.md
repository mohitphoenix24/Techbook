---
title: Prompt Playground
level: advanced
time: 60
icon: wand
cover: #ec4899,#8b5cf6
tags: prompt templates, variables, A/B compare, history, code export
summary: A developer tool for crafting prompts — {{variables}} detected automatically, model and effort settings, streamed runs, side-by-side A/B comparison, run history, and one-click export to Python or JavaScript SDK code.
---

Prompt engineering is iterative: change a word, run again, compare. A **playground** makes that loop fast. Every AI team ends up building one — and it's a fantastic React project because it combines forms, derived state, streaming, history and code generation.

:::flow The loop
Template with {{vars}} | system + user
Fill variables | auto-detected inputs
Render prompt | replace {{vars}}
Run A and B | streamed, side by side
Compare + save | history, export code
:::

**You'll practise:** regex-driven derived state, dynamic forms, `useReducer` for a complex editor, async streaming of two outputs at once, history with restore, and generating code from state.

## Step 1 — Templates and variables

```js run title="Step 1 · find and fill {{variables}}"
const findVariables = (template) => [...new Set([...template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];

function render(template, values) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name) => values[name] ?? whole);   // leave unknown ones visible
}

const template = "Summarise this {{doc_type}} for a {{audience}} in {{n}} bullet points:\n\n{{text}}";
console.log(findVariables(template));
console.log(render(template, { doc_type: "bug report", audience: "product manager", n: 3 }));
```

## Step 2 — The complete playground

The "model" here is a small **deterministic demo** that recognises a few task types (summarise, classify, extract, translate-to-pirate 🏴‍☠️) so you can see real differences between prompts. The export button produces real SDK code.

```jsx run title="Prompt Playground · complete app"
import { useMemo, useReducer, useRef, useState } from "react";

// ============ demo model: deterministic, streams words ============
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function demoModel({ system, prompt, effort }) {
  const p = prompt.toLowerCase(), text = prompt.split(/\n\n/).slice(1).join(" ") || prompt;
  const sentences = text.match(/[^.!?]+[.!?]/g)?.map((s) => s.trim()) ?? [text];
  const bullets = Number(p.match(/(\d+) bullet/)?.[1] ?? 0);
  let out;
  if (p.includes("summar")) out = bullets ? sentences.slice(0, bullets).map((s) => "• " + s).join("\n") : sentences.slice(0, 2).join(" ");
  else if (p.includes("classify") || p.includes("sentiment")) {
    const pos = (text.match(/love|great|fast|excellent|happy|thanks/gi) || []).length, neg = (text.match(/hate|slow|broken|bad|crash|refund/gi) || []).length;
    out = JSON.stringify({ label: pos > neg ? "positive" : neg > pos ? "negative" : "neutral", confidence: Number((0.55 + Math.abs(pos - neg) * 0.12).toFixed(2)) });
  } else if (p.includes("extract")) out = JSON.stringify({ emails: text.match(/[\w.+-]+@[\w-]+\.\w+/g) ?? [], amounts: text.match(/\$\d+(?:\.\d+)?/g) ?? [] }, null, 2);
  else if (p.includes("pirate")) out = text.replace(/\byou\b/gi, "ye").replace(/\bhello\b/gi, "ahoy").replace(/\bmy\b/gi, "me").replace(/\bis\b/gi, "be") + " Arrr! 🏴‍☠️";
  else out = `(demo model) I received ${prompt.length} characters. Try a prompt that asks to summarise, classify, extract or talk like a pirate.`;
  if (/concise|brief|short/i.test(system) && out.length > 160) out = out.slice(0, 157) + "…";
  if (effort === "high") out += "\n\n(checked twice ✓)";
  return out;
}
async function* runModel(params, signal) {
  await sleep({ low: 150, medium: 350, high: 700 }[params.effort]);         // "thinking time"
  for (const piece of demoModel(params).match(/\S+\s*|\n/g)) {
    if (signal.aborted) return;
    await sleep(18);
    yield piece;
  }
}

// ============ helpers ============
const VAR_RE = /\{\{\s*(\w+)\s*\}\}/g;
const findVariables = (...texts) => [...new Set(texts.flatMap((t) => [...t.matchAll(VAR_RE)].map((m) => m[1])))];
const renderTemplate = (t, values) => t.replace(VAR_RE, (whole, name) => values[name] || whole);
const estimateTokens = (s) => Math.ceil(s.length / 4);

function toCode(lang, { model, maxTokens, effort, system, prompt }) {
  if (lang === "python") return `import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model=${JSON.stringify(model)},
    max_tokens=${maxTokens},
    output_config={"effort": ${JSON.stringify(effort)}},
    system=${JSON.stringify(system)},
    messages=[{"role": "user", "content": ${JSON.stringify(prompt)}}],
)
print(next(b.text for b in response.content if b.type == "text"))`;
  return `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.messages.create({
  model: ${JSON.stringify(model)},
  max_tokens: ${maxTokens},
  output_config: { effort: ${JSON.stringify(effort)} },
  system: ${JSON.stringify(system)},
  messages: [{ role: "user", content: ${JSON.stringify(prompt)} }],
});
for (const block of response.content) if (block.type === "text") console.log(block.text);`;
}

// ============ editor state ============
const INITIAL = {
  model: "claude-opus-5-5", maxTokens: 1024, effort: "medium",
  system: "You are a precise assistant. Be concise.",
  promptA: "Summarise this {{doc_type}} in {{n}} bullet points:\n\n{{text}}",
  promptB: "Classify the sentiment of this {{doc_type}}. Reply with JSON.\n\n{{text}}",
  values: { doc_type: "customer review", n: "2", text: "I love the new search feature. It is fast and the results are great. The export button is broken though. Thanks for listening!" },
  compare: true,
};
function reducer(s, a) {
  switch (a.type) {
    case "set": return { ...s, [a.key]: a.value };
    case "var": return { ...s, values: { ...s.values, [a.name]: a.value } };
    case "restore": return { ...s, ...a.snapshot };
    default: return s;
  }
}

function Output({ label, text, status, ms, tokens }) {
  return (
    <div className="card stack" style={{ flex: "1 1 220px", minHeight: 120 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>{label}</b>
        <small className="muted">{status === "running" ? "running…" : status === "done" ? `${ms} ms · ~${tokens} tok out` : ""}</small>
      </div>
      <div style={{ whiteSpace: "pre-wrap", fontFamily: text.trim().startsWith("{") ? "JetBrains Mono, monospace" : undefined, fontSize: 14 }}>
        {text || <span className="muted">Press Run (Ctrl+Enter)</span>}{status === "running" && <span className="cursor">▍</span>}
      </div>
    </div>
  );
}

export default function App() {
  const [s, dispatch] = useReducer(reducer, INITIAL);
  const [outputs, setOutputs] = useState({ A: { text: "", status: "idle" }, B: { text: "", status: "idle" } });
  const [history, setHistory] = useState([]);
  const [exportLang, setExportLang] = useState(null);
  const controllerRef = useRef(null);
  const set = (key) => (e) => dispatch({ type: "set", key, value: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const variables = useMemo(() => findVariables(s.system, s.promptA, s.compare ? s.promptB : ""), [s.system, s.promptA, s.promptB, s.compare]);
  const rendered = {
    system: renderTemplate(s.system, s.values),
    A: renderTemplate(s.promptA, s.values),
    B: renderTemplate(s.promptB, s.values),
  };
  const missing = variables.filter((v) => !s.values[v]);
  const running = Object.values(outputs).some((o) => o.status === "running");

  async function runOne(key, signal) {
    const t0 = performance.now();
    setOutputs((o) => ({ ...o, [key]: { text: "", status: "running" } }));
    let text = "";
    for await (const piece of runModel({ system: rendered.system, prompt: rendered[key], effort: s.effort }, signal)) {
      text += piece;
      setOutputs((o) => ({ ...o, [key]: { ...o[key], text } }));
    }
    const result = { text, status: "done", ms: Math.round(performance.now() - t0), tokens: estimateTokens(text) };
    setOutputs((o) => ({ ...o, [key]: result }));
    return result;
  }
  async function run() {
    if (running || missing.length) return;
    controllerRef.current = new AbortController();
    const keys = s.compare ? ["A", "B"] : ["A"];
    const results = await Promise.all(keys.map((k) => runOne(k, controllerRef.current.signal)));   // run A and B in parallel
    const { compare, ...snapshot } = s;
    setHistory((h) => [{ id: Date.now(), at: new Date().toLocaleTimeString(), snapshot: { ...snapshot, compare }, results: Object.fromEntries(keys.map((k, i) => [k, results[i].text])) }, ...h].slice(0, 8));
  }

  return (
    <div className="stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); }}>
      {/* settings */}
      <div className="row">
        <select value={s.model} onChange={set("model")} aria-label="Model"><option>claude-opus-5-5</option><option>claude-sonnet-5-5</option><option>claude-haiku-4-5</option></select>
        <label className="row" style={{ gap: 4 }}>effort
          <select value={s.effort} onChange={set("effort")}><option>low</option><option>medium</option><option>high</option></select></label>
        <label className="row" style={{ gap: 4 }}>max tokens<input type="number" value={s.maxTokens} onChange={set("maxTokens")} style={{ width: 80 }} /></label>
        <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={s.compare} onChange={set("compare")} /> A/B compare</label>
      </div>

      {/* templates */}
      <label className="stack" style={{ gap: 3 }}><small className="muted">System prompt</small>
        <textarea rows={2} value={s.system} onChange={set("system")} /></label>
      <div className="row" style={{ alignItems: "stretch" }}>
        {(s.compare ? ["A", "B"] : ["A"]).map((k) => (
          <label key={k} className="stack" style={{ gap: 3, flex: "1 1 220px" }}>
            <small className="muted">User prompt {k} · ~{estimateTokens(rendered.system + rendered[k])} tokens in</small>
            <textarea rows={4} value={s["prompt" + k]} onChange={set("prompt" + k)} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13 }} />
          </label>
        ))}
      </div>

      {/* variables: generated from the templates */}
      {variables.length > 0 && (
        <div className="card stack" style={{ padding: 10 }}>
          <small className="muted">Variables (found automatically)</small>
          {variables.map((v) => (
            <label key={v} className="row" style={{ flexWrap: "nowrap" }}>
              <code style={{ width: 112, flexShrink: 0, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{`{{${v}}}`}</code>
              {v === "text"
                ? <textarea rows={2} value={s.values[v] ?? ""} onChange={(e) => dispatch({ type: "var", name: v, value: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                : <input value={s.values[v] ?? ""} onChange={(e) => dispatch({ type: "var", name: v, value: e.target.value })} style={{ flex: 1, minWidth: 0 }} />}
            </label>
          ))}
        </div>
      )}

      <div className="row">
        <button className="primary" onClick={run} disabled={running || missing.length > 0}>{running ? "Running…" : "▶ Run"}</button>
        {running && <button onClick={() => controllerRef.current.abort()}>■ Stop</button>}
        {missing.length > 0 && <small className="error">Fill in: {missing.join(", ")}</small>}
        <span style={{ flex: 1 }} />
        <button onClick={() => setExportLang(exportLang === "python" ? null : "python")} aria-pressed={exportLang === "python"}>{"</>"} Python</button>
        <button onClick={() => setExportLang(exportLang === "js" ? null : "js")} aria-pressed={exportLang === "js"}>{"</>"} JS</button>
      </div>

      {exportLang && <pre>{toCode(exportLang, { model: s.model, maxTokens: Number(s.maxTokens), effort: s.effort, system: rendered.system, prompt: rendered.A })}</pre>}

      <div className="row" style={{ alignItems: "stretch" }}>
        <Output label="Output A" {...outputs.A} />
        {s.compare && <Output label="Output B" {...outputs.B} />}
      </div>

      {history.length > 0 && (
        <details>
          <summary className="muted">History ({history.length})</summary>
          <div className="stack" style={{ marginTop: 6 }}>
            {history.map((h) => (
              <div key={h.id} className="card row" style={{ padding: "6px 10px", justifyContent: "space-between", flexWrap: "nowrap" }}>
                <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.at} · {h.snapshot.effort} · {h.results.A.slice(0, 50)}</small>
                <button onClick={() => dispatch({ type: "restore", snapshot: h.snapshot })} style={{ padding: "2px 8px", fontSize: 12 }}>Restore</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
```

Ideas to try: change prompt B to "Talk like a pirate: {{text}}", add a new `{{tone}}` variable (an input appears automatically), set effort to *high*, export the code, and restore an earlier run from history.

## How it works

| Feature | Technique |
|---|---|
| variable inputs | **derived** from the templates with a regex — never stored separately, so they can't drift |
| rendering | `template.replace(regex, fn)` fills known variables and leaves unknown ones visible |
| A/B runs | two async generators consumed in parallel with `Promise.all`; each updates its own output |
| Stop | one `AbortController` shared by both runs |
| history | snapshot of the editor state + results; **Restore** dispatches the snapshot back into the reducer |
| code export | a pure function from state → SDK code string |
| shortcut | `Ctrl/⌘+Enter` handled on the wrapper's `onKeyDown` |

:::exercise Extend it
1. Connect `runModel` to your backend so the playground calls Claude for real (keep the API key on the server!).
2. Add **test cases**: a table of variable sets, run the prompt on all of them, and show a grid of outputs — a mini eval.
3. Add a **"✨ Improve this prompt"** button that asks a model to critique and rewrite prompt A.
4. Save prompts to a library with versions and a diff view.
:::

:::keypoints
- Derive variable fields from templates; render with `replace` and a callback.
- Run multiple streams in parallel, each updating its own slice of state; abort them together.
- Snapshots make history and restore trivial when your editor state lives in one reducer.
- Generating code from state is a pure function — easy to test and extend.
:::
