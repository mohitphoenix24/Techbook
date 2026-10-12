---
title: AI Assistant Builder (Multi-Step Wizard)
level: intermediate
time: 50
icon: bot
cover: #f97316,#eab308
tags: forms, Zod, useActionState, multi-step, accessibility, file upload
summary: A guided multi-step form to configure a custom AI assistant — per-step Zod validation, a progress stepper, dynamic fields, file selection, a live preview of the generated system prompt, and a final submit with useActionState including server-side errors.
---

Long forms are overwhelming; **wizards** split them into small steps. This project builds a polished "create your assistant" flow — the kind of onboarding every AI product has — with validation that feels helpful instead of annoying.

:::flow Steps
1 · Basics | name, purpose
2 · Behaviour | model, tone, rules
3 · Knowledge | files, links
4 · Review | preview + create
Submit | useActionState
:::

**You'll practise:** one state object shared by all steps, per-step Zod schemas, dynamic field lists, reading files on the client, focus management between steps, and `useActionState` for the final server action with pending and error states.

## Step 1 — Per-step schemas

```js run title="Step 1 · validating one step at a time"
import { z } from "zod";

const steps = [
  z.object({ name: z.string().min(3, "Name needs 3+ characters"), purpose: z.string().min(15, "Describe the purpose in a sentence") }),
  z.object({ model: z.enum(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]), tone: z.enum(["friendly", "formal", "playful"]), rules: z.array(z.string().min(3)).max(5) }),
];

function validateStep(i, data) {
  const r = steps[i].safeParse(data);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((x) => [x.path.join("."), x.message]));
}

console.log(validateStep(0, { name: "Bo", purpose: "help" }));
console.log(validateStep(0, { name: "Support Buddy", purpose: "Answer billing questions for customers." }));
console.log(validateStep(1, { model: "claude-opus-5-5", tone: "friendly", rules: ["Be kind", "ok"] }));
```

Errors keyed by path (`rules.1`) let us show each message next to the exact field — even inside lists.

## Step 2 — The complete wizard

```jsx run title="Assistant Builder · complete app"
import { useActionState, useEffect, useRef, useState } from "react";
import { z } from "zod";

// ============ schemas, one per step ============
const STEPS = [
  { title: "Basics", schema: z.object({
      name: z.string().trim().min(3, "Name needs at least 3 characters").max(40),
      purpose: z.string().trim().min(15, "Describe the purpose in a full sentence (15+ characters)"),
    }) },
  { title: "Behaviour", schema: z.object({
      model: z.enum(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]),
      tone: z.enum(["friendly", "formal", "playful"]),
      rules: z.array(z.string().trim().min(3, "Too short")).max(5, "At most 5 rules"),
    }) },
  { title: "Knowledge", schema: z.object({
      links: z.array(z.url("Must be a full URL, like https://…")),
      files: z.array(z.object({ name: z.string(), size: z.number().max(2_000_000, "Max 2 MB per file") })).max(5, "At most 5 files"),
    }) },
  { title: "Review", schema: z.object({}) },
];

const INITIAL = { name: "", purpose: "", model: "claude-sonnet-5-5", tone: "friendly", rules: ["Cite the help-centre article you used"], links: [""], files: [] };
const validate = (i, data) => {
  const r = STEPS[i].schema.safeParse(i === 2 ? { ...data, links: data.links.filter(Boolean) } : data);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((x) => [x.path.join("."), x.message]));
};

function systemPrompt(d) {
  return [
    `You are ${d.name || "an assistant"}. ${d.purpose}`,
    `Tone: ${d.tone}.`,
    d.rules.filter(Boolean).length ? "Rules:\n" + d.rules.filter(Boolean).map((r) => `- ${r}`).join("\n") : "",
    d.files.length || d.links.some(Boolean) ? `Use only the provided knowledge (${d.files.length} files, ${d.links.filter(Boolean).length} links) and say when it doesn't cover a question.` : "",
  ].filter(Boolean).join("\n\n");
}

// ============ fake server action ============
const takenNames = ["support bot", "helper"];
async function createAssistant(prevState, data) {
  await new Promise((r) => setTimeout(r, 1200));
  if (takenNames.includes(data.name.trim().toLowerCase())) return { ok: false, error: `The name “${data.name}” is already taken.`, step: 0 };
  return { ok: true, id: "asst_" + Math.random().toString(36).slice(2, 8), name: data.name };
}

// ============ small field components ============
function Field({ label, error, hint, children }) {
  return (
    <label className="stack" style={{ gap: 4 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
      {error ? <small className="error" role="alert">{error}</small> : hint && <small className="muted">{hint}</small>}
    </label>
  );
}

function Stepper({ step, maxReached, onJump }) {
  return (
    <ol className="row" style={{ listStyle: "none", padding: 0, margin: 0, gap: 4 }} aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.title} style={{ flex: 1 }}>
          <button onClick={() => onJump(i)} disabled={i > maxReached} aria-current={i === step ? "step" : undefined}
            style={{ width: "100%", padding: "6px 4px", fontSize: 13, borderColor: i === step ? "var(--accent)" : undefined,
              background: i < step ? "color-mix(in srgb, var(--ok) 15%, transparent)" : undefined }}>
            {i < step ? "✓" : i + 1} {s.title}
          </button>
        </li>
      ))}
    </ol>
  );
}

// ============ the wizard ============
function Wizard({ onRestart }) {
  const [data, setData] = useState(INITIAL);
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [errors, setErrors] = useState({});
  const [result, submit, isPending] = useActionState(createAssistant, null);
  const headingRef = useRef(null);

  useEffect(() => { headingRef.current?.focus(); }, [step]);              // move focus to the new step's heading
  useEffect(() => { if (result && !result.ok) { setStep(result.step); setErrors({ name: result.error }); } }, [result]);

  const set = (key, value) => { setData((d) => ({ ...d, [key]: value })); setErrors((e) => ({ ...e, [key]: undefined })); };
  const setItem = (key, i, value) => set(key, data[key].map((x, j) => (j === i ? value : x)));

  function next() {
    const errs = validate(step, data);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setStep(step + 1);
    setMaxReached((m) => Math.max(m, step + 1));
  }
  function jump(i) {
    if (i > step && Object.keys(validate(step, data)).length) return next();   // validate before jumping forward
    setStep(i);
  }
  function onFiles(e) {
    const files = [...e.target.files].map((f) => ({ name: f.name, size: f.size }));
    set("files", [...data.files, ...files]);
    e.target.value = "";
  }

  if (result?.ok) return (
    <div className="card stack" style={{ textAlign: "center", maxWidth: 420, margin: "0 auto" }}>
      <div style={{ fontSize: 40 }}>🎉</div>
      <h3>{result.name} is ready!</h3>
      <code>{result.id}</code>
      <button onClick={onRestart}>Start over</button>
    </div>
  );

  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <Stepper step={step} maxReached={maxReached} onJump={jump} />
      <h3 ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>Step {step + 1}: {STEPS[step].title}</h3>

      {step === 0 && <>
        <Field label="Assistant name" error={errors.name} hint="Try “Support Bot” to see a server-side error at the end.">
          <input value={data.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} placeholder="e.g. Billing Buddy" />
        </Field>
        <Field label="What should it do?" error={errors.purpose}>
          <textarea rows={2} value={data.purpose} onChange={(e) => set("purpose", e.target.value)} aria-invalid={!!errors.purpose} placeholder="Answer billing and refund questions for our customers." />
        </Field>
      </>}

      {step === 1 && <>
        <Field label="Model">
          <div className="stack" style={{ gap: 4 }}>
            {[["claude-opus-5-5", "Most capable — complex reasoning"], ["claude-sonnet-5-5", "Balanced speed and intelligence"], ["claude-haiku-4-5", "Fastest and cheapest"]].map(([m, desc]) => (
              <label key={m} className="card row" style={{ padding: "6px 10px", borderColor: data.model === m ? "var(--accent)" : undefined }}>
                <input type="radio" name="model" checked={data.model === m} onChange={() => set("model", m)} />
                <code>{m}</code><small className="muted">{desc}</small>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Tone">
          <select value={data.tone} onChange={(e) => set("tone", e.target.value)}>{["friendly", "formal", "playful"].map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Rules" error={errors.rules}>
          <div className="stack" style={{ gap: 4 }}>
            {data.rules.map((r, i) => (
              <div key={i} className="stack" style={{ gap: 2 }}>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input value={r} onChange={(e) => setItem("rules", i, e.target.value)} aria-label={`Rule ${i + 1}`} aria-invalid={!!errors[`rules.${i}`]} style={{ flex: 1 }} />
                  <button onClick={() => set("rules", data.rules.filter((_, j) => j !== i))} aria-label={`Remove rule ${i + 1}`}>✕</button>
                </div>
                {errors[`rules.${i}`] && <small className="error">{errors[`rules.${i}`]}</small>}
              </div>
            ))}
            {data.rules.length < 5 && <button onClick={() => set("rules", [...data.rules, ""])} style={{ alignSelf: "flex-start" }}>＋ Add rule</button>}
          </div>
        </Field>
      </>}

      {step === 2 && <>
        <Field label="Help-centre links" hint="Pages the assistant may use as sources.">
          <div className="stack" style={{ gap: 4 }}>
            {data.links.map((l, i) => (
              <div key={i} className="stack" style={{ gap: 2 }}>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input value={l} onChange={(e) => setItem("links", i, e.target.value)} placeholder="https://help.example.com/refunds" aria-label={`Link ${i + 1}`} style={{ flex: 1 }} />
                  <button onClick={() => set("links", data.links.length > 1 ? data.links.filter((_, j) => j !== i) : [""])} aria-label={`Remove link ${i + 1}`}>✕</button>
                </div>
                {errors[`links.${data.links.filter(Boolean).indexOf(l)}`] && l && <small className="error">{errors[`links.${data.links.filter(Boolean).indexOf(l)}`]}</small>}
              </div>
            ))}
            <button onClick={() => set("links", [...data.links, ""])} style={{ alignSelf: "flex-start" }}>＋ Add link</button>
          </div>
        </Field>
        <Field label="Files" error={errors.files || Object.entries(errors).find(([k]) => k.startsWith("files."))?.[1]}>
          <input type="file" multiple accept=".pdf,.md,.txt,.docx" onChange={onFiles} />
          {data.files.map((f, i) => (
            <div key={i} className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
              <span>📄 {f.name} <span className="muted">({(f.size / 1024).toFixed(0)} KB)</span></span>
              <button onClick={() => set("files", data.files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} style={{ padding: "0 6px" }}>✕</button>
            </div>
          ))}
        </Field>
      </>}

      {step === 3 && <>
        <table><tbody>
          {[["Name", data.name], ["Model", data.model], ["Tone", data.tone], ["Knowledge", `${data.files.length} files, ${data.links.filter(Boolean).length} links`]].map(([k, v]) => <tr key={k}><th style={{ width: 110 }}>{k}</th><td>{v}</td></tr>)}
        </tbody></table>
        <Field label="Generated system prompt"><pre style={{ whiteSpace: "pre-wrap" }}>{systemPrompt(data)}</pre></Field>
      </>}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <button onClick={() => setStep(step - 1)} disabled={step === 0 || isPending}>← Back</button>
        {step < STEPS.length - 1
          ? <button className="primary" onClick={next}>Next →</button>
          : <form action={() => submit(data)}><button className="primary" disabled={isPending}>{isPending ? "Creating…" : "Create assistant"}</button></form>}
      </div>
    </div>
  );
}

export default function App() {
  const [run, setRun] = useState(0);
  return <Wizard key={run} onRestart={() => setRun((r) => r + 1)} />;   // a new key = a fresh wizard with fresh state
}
```

Walk through it: try **Next** with empty fields, add an invalid link, pick some files, and on the last step create an assistant called "Support Bot" to see the server error send you back to step 1 — with your data intact.

## How it works

| Feature | Technique |
|---|---|
| shared data | one `data` object for all steps; steps only decide **which fields to show** |
| per-step validation | each step has its own Zod schema; errors keyed by path (`rules.1`) |
| stepper | completed steps are clickable; future steps unlock only after validation |
| focus | moving to a step focuses its heading, so screen readers announce it |
| files | read `name`/`size` from the file input; real uploads go to your backend (or straight to storage with a signed URL) |
| submit | `useActionState(createAssistant)` gives `isPending` and the server's result; errors map back to a step |

:::exercise Extend it
1. Add a **"✨ Suggest rules"** button that sends the purpose to a model and adds 3 suggested rules (validate them with the schema!).
2. Save the draft to `sessionStorage` so a refresh doesn't lose progress.
3. Add a **live test chat** on the review step that uses the generated system prompt.
4. Use **React Hook Form** with `zodResolver` and compare the amount of code.
:::

:::keypoints
- One data object, many steps: steps are views, not separate states.
- Validate per step with Zod; key errors by path to support dynamic lists.
- Manage focus between steps; keep "Back" and the stepper non-destructive.
- `useActionState` handles the final submit's pending and error states cleanly.
:::
