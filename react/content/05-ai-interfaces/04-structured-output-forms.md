---
title: Structured Output, Schemas & Forms
level: advanced
time: 35
summary: Make the model fill in data your UI can trust. Zod schemas shared by forms and model output, validating LLM JSON, human-in-the-loop review forms, streaming partial JSON into a form, and generating forms from a schema.
---

Chat is only one AI interface. Many products ask the model to **extract or generate data** — fields from an invoice, tags for a ticket, a product description — and show it in a **form** the user can check and edit. The glue is a **schema**.

:::def Schema
A description of the **shape** data must have: which fields, their types, and rules (required, min length, allowed values). The same schema can validate a form, the model's output and your API.
:::

:::def Structured output
Asking the model to answer in a fixed JSON shape instead of free text. The API can enforce the shape; your app should still **validate** what arrives.
:::

## One schema, many uses

```js run level=intermediate
import { z } from "zod";

const Ticket = z.object({
  title: z.string().min(5, "Title needs at least 5 characters"),
  priority: z.enum(["low", "medium", "high"]),
  tags: z.array(z.string()).max(5, "At most 5 tags"),
  email: z.email("Must be a valid email").optional(),
  estimateHours: z.coerce.number().positive().max(80).optional(),   // "3" from a form → 3
});

// ✅ what a good model answer looks like
console.log(Ticket.safeParse({ title: "Login button broken on Safari", priority: "high", tags: ["bug", "auth"] }).success);

// ❌ a sloppy answer: every problem is listed with its field path
const bad = Ticket.safeParse({ title: "Bug", priority: "urgent", tags: ["a", "b", "c", "d", "e", "f"], email: "nope" });
for (const issue of bad.error.issues) console.log(`${issue.path.join(".")}: ${issue.message}`);

// the same schema → JSON Schema you can send to a model as the output format
console.log(JSON.stringify(z.toJSONSchema(Ticket), null, 1).slice(0, 300) + " …");
```

## A form validated by the schema

```jsx run level=intermediate
import { useState } from "react";
import { z } from "zod";

const Agent = z.object({
  name: z.string().min(3, "At least 3 characters"),
  model: z.enum(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]),
  maxTokens: z.coerce.number().int().min(256, "At least 256").max(64000, "At most 64000"),
  systemPrompt: z.string().min(10, "Describe the agent's job (10+ characters)"),
});

function fieldErrors(error) {
  const out = {};
  for (const issue of error.issues) out[issue.path[0]] ??= issue.message;
  return out;
}

export default function App() {
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(null);

  function onSubmit(e) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget));     // everything arrives as strings
    const result = Agent.safeParse(raw);
    if (!result.success) { setErrors(fieldErrors(result.error)); setSaved(null); return; }
    setErrors({});
    setSaved(result.data);                                             // typed and clean: maxTokens is a number
  }

  const Field = ({ name, label, children }) => (
    <label className="stack" style={{ gap: 4 }}>
      <span>{label}</span>
      {children}
      {errors[name] && <small className="error">{errors[name]}</small>}
    </label>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="stack" style={{ maxWidth: 420 }}>
      <Field name="name" label="Agent name"><input name="name" defaultValue="Researcher" aria-invalid={!!errors.name} /></Field>
      <Field name="model" label="Model">
        <select name="model" defaultValue="claude-opus-5-5"><option>claude-opus-5-5</option><option>claude-sonnet-5-5</option><option>claude-haiku-4-5</option></select>
      </Field>
      <Field name="maxTokens" label="Max tokens"><input name="maxTokens" defaultValue="100" inputMode="numeric" aria-invalid={!!errors.maxTokens} /></Field>
      <Field name="systemPrompt" label="System prompt"><textarea name="systemPrompt" rows={2} defaultValue="Be brief" aria-invalid={!!errors.systemPrompt} /></Field>
      <button className="primary">Save agent</button>
      {saved && <pre>{JSON.stringify(saved, null, 2)}</pre>}
    </form>
  );
}
```

Submit once to see the errors, fix them, and submit again: the saved object has `maxTokens` as a **number**, because the schema coerced it.

:::tip Form libraries
For big forms, **React Hook Form** + `@hookform/resolvers/zod` or **TanStack Form** give you per-field validation, dirty tracking and great performance — with the same Zod schema.
:::

## Human-in-the-loop: review what the model extracted

The model extracts fields from a document; the user reviews, fixes and approves. Invalid or low-confidence fields are highlighted.

```jsx run level=advanced
import { useState } from "react";
import { z } from "zod";

const Invoice = z.object({
  vendor: z.string().min(1, "Vendor is required"),
  invoiceNumber: z.string().regex(/^INV-\d+$/, "Looks like INV-1234"),
  date: z.iso.date("Use YYYY-MM-DD"),
  total: z.coerce.number().positive("Must be > 0"),
  currency: z.enum(["USD", "EUR", "INR", "GBP"]),
});

// What a model might return (with a confidence score per field) — one mistake included
const extracted = {
  data: { vendor: "Acme Cloud Ltd", invoiceNumber: "INV-20931", date: "12/03/2026", total: "1499.00", currency: "USD" },
  confidence: { vendor: 0.98, invoiceNumber: 0.95, date: 0.61, total: 0.93, currency: 0.88 },
};

export default function App() {
  const [values, setValues] = useState(extracted.data);
  const [approved, setApproved] = useState(null);
  const result = Invoice.safeParse(values);
  const errors = {};
  if (!result.success) for (const i of result.error.issues) errors[i.path[0]] ??= i.message;

  return (
    <div className="stack" style={{ maxWidth: 460 }}>
      <h3>Review extracted invoice</h3>
      <table>
        <tbody>
          {Object.keys(Invoice.shape).map((key) => {
            const conf = extracted.confidence[key];
            const flag = errors[key] || conf < 0.8;
            return (
              <tr key={key} style={{ background: flag ? "color-mix(in srgb, var(--danger) 10%, transparent)" : undefined }}>
                <th style={{ width: 120 }}>{key}</th>
                <td>
                  <input value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} aria-invalid={!!errors[key]} style={{ width: "100%" }} />
                  {errors[key] && <div className="error"><small>{errors[key]}</small></div>}
                </td>
                <td><small className={conf < 0.8 ? "error" : "muted"}>{Math.round(conf * 100)}%</small></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="primary" disabled={!result.success} onClick={() => setApproved(result.data)}>
        {result.success ? "Approve" : `Fix ${Object.keys(errors).length} field(s) to approve`}
      </button>
      {approved && <pre>{JSON.stringify(approved, null, 2)}</pre>}
    </div>
  );
}
```

Change the date to `2026-03-12` and the Approve button unlocks.

## Streaming structured output into a form

With structured output, the model streams **JSON**. Showing fields as they fill in feels much faster than waiting. The trick: repair the partial JSON (close the open string and brackets) and parse what you have so far.

```jsx run level=advanced
import { useEffect, useState } from "react";

// Best-effort parse of incomplete JSON: close open strings/brackets, drop dangling keys
function parsePartialJSON(text) {
  let s = text, stack = [], inStr = false, esc = false;
  for (const ch of s) {
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inStr) s += '"';
  s = s.replace(/,\s*$/, "").replace(/,?\s*"[^"]*"\s*:\s*$/, "");   // remove a trailing comma or a key with no value yet
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return JSON.parse(s + stack.slice().reverse().join("")); } catch { s = s.replace(/,?\s*"[^"]*"?\s*$/, ""); }
  }
  return {};
}

const modelJSON = JSON.stringify({
  title: "Build a RAG chatbot over company docs",
  summary: "Index the handbook, retrieve the top chunks for each question, and answer with citations.",
  steps: ["Chunk and embed documents", "Store vectors", "Retrieve top-k chunks", "Generate an answer with sources"],
  difficulty: "intermediate",
});

export default function App() {
  const [raw, setRaw] = useState("");
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => { i += 4; setRaw(modelJSON.slice(0, i)); if (i >= modelJSON.length) clearInterval(id); }, 30);
    return () => clearInterval(id);
  }, []);
  const plan = parsePartialJSON(raw);
  const done = raw.length >= modelJSON.length;
  return (
    <div className="stack" style={{ maxWidth: 460 }}>
      <label>Title <input readOnly value={plan.title ?? ""} placeholder="…" style={{ width: "100%" }} /></label>
      <label>Summary <textarea readOnly rows={2} value={plan.summary ?? ""} placeholder="…" style={{ width: "100%" }} /></label>
      <ol>{(plan.steps ?? []).map((s, i) => <li key={i}>{s}</li>)}</ol>
      <span>Difficulty: <b>{plan.difficulty ?? "…"}</b> {done ? "✅" : <span className="cursor">▍</span>}</span>
      <details><summary className="muted">Raw stream ({raw.length} chars)</summary><pre style={{ whiteSpace: "pre-wrap" }}>{raw}</pre></details>
    </div>
  );
}
```

:::warn Validate the final result
Partial objects are for **display only**. When the stream ends, run the full schema (`Schema.safeParse(final)`) before saving or acting on the data.
:::

## The backend side

The server asks for structured output and validates before sending it to the browser:

```python
# Python: the SDK parses the response straight into a Pydantic model
from pydantic import BaseModel

class TicketOut(BaseModel):
    title: str
    priority: Literal["low", "medium", "high"]
    tags: list[str]

response = client.messages.parse(
    model="claude-opus-5-5",
    max_tokens=2000,
    messages=[{"role": "user", "content": f"Turn this email into a ticket:\n\n{email}"}],
    output_format=TicketOut,
)
ticket = response.parsed_output          # a validated TicketOut instance
```

Then the React side validates again with the matching Zod schema — **never trust data just because it crossed a network**.

## Forms generated from a schema

When you have many schemas (one per document type or per agent tool), generate the form instead of hand-writing each one:

```jsx run level=advanced
import { useState } from "react";
import { z } from "zod";

const SearchTool = z.object({
  query: z.string().min(2).describe("What to search for"),
  maxResults: z.number().int().min(1).max(20).describe("How many results"),
  source: z.enum(["web", "docs", "tickets"]).describe("Where to search"),
  includeArchived: z.boolean().describe("Include archived items"),
});

function SchemaForm({ schema, onSubmit }) {
  const json = z.toJSONSchema(schema);                       // walk JSON Schema: simpler than Zod internals
  const [values, setValues] = useState({});
  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));
  const result = schema.safeParse(values);
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (result.success) onSubmit(result.data); }}>
      {Object.entries(json.properties).map(([key, prop]) => (
        <label key={key} className="stack" style={{ gap: 3 }}>
          <span><b>{key}</b> <small className="muted">— {prop.description}</small></span>
          {prop.enum ? (
            <select value={values[key] ?? ""} onChange={(e) => set(key, e.target.value)}>
              <option value="" disabled>Choose…</option>
              {prop.enum.map((o) => <option key={o}>{o}</option>)}
            </select>
          ) : prop.type === "boolean" ? (
            <input type="checkbox" checked={!!values[key]} onChange={(e) => set(key, e.target.checked)} style={{ alignSelf: "flex-start" }} />
          ) : prop.type === "integer" || prop.type === "number" ? (
            <input type="number" min={prop.minimum} max={prop.maximum} value={values[key] ?? ""} onChange={(e) => set(key, e.target.value === "" ? undefined : Number(e.target.value))} />
          ) : (
            <input value={values[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
          )}
        </label>
      ))}
      <button className="primary" disabled={!result.success}>Run tool</button>
    </form>
  );
}

export default function App() {
  const [ran, setRan] = useState(null);
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      <SchemaForm schema={SearchTool} onSubmit={setRan} />
      {ran && <pre>{JSON.stringify(ran, null, 2)}</pre>}
    </div>
  );
}
```

:::ai
Schema-driven UIs are everywhere in AI products: **tool parameter forms** (let users run or edit a tool call), **extraction review screens**, **eval rubrics**, and **agent configuration**. Keep schemas in one shared file (or generate Zod from your backend's Pydantic/JSON Schema) so the model, the API and the UI always agree.
:::

## Check yourself

```quiz
? Why validate structured output in the browser if the API already enforced a schema?
+ Data can still be wrong or changed in transit, and your UI must be sure before acting on it
- It isn't needed
- To make it faster
> Validate at every trust boundary.

? A form field gives "42" but the schema needs a number. Which Zod feature helps?
+ z.coerce.number()
- z.string().number()
- JSON.parse
> coerce converts input before validating.

? What should you do with partially-streamed JSON?
+ Show it for progress, but validate the complete result before saving
- Save each partial object to the database
- Ignore it until the end
> Partial data is for display only.
```

:::keypoints
- A **Zod schema** describes data once and validates forms, model output and API responses; `z.toJSONSchema` exports it for models and form generators.
- `safeParse` gives typed data or a list of issues with field paths — map them to field errors.
- Build **review forms** for extracted data: highlight invalid and low-confidence fields; approve only when valid.
- Stream structured output into the UI with a partial-JSON parser, then validate the final object.
:::
