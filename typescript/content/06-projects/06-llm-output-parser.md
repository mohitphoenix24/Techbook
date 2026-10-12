---
title: Robust LLM Output Parser
level: intermediate
time: 45
icon: file
cover: #f59e0b,#ef4444
tags: parsing, Zod, Result types, repair prompts, testing
summary: Turn messy model output into trustworthy typed data — find JSON inside prose and code fences, fix common mistakes (trailing commas, smart quotes, comments), validate with Zod, produce precise repair prompts, and prove it all with a table of real-world failure cases.
---

Even well-prompted models sometimes wrap JSON in prose ("Sure! Here's the data:"), put it in a code fence, add a trailing comma, or use curly quotes. Structured-output APIs prevent most of this — but logs, older models, other providers and free-text prompts still produce messy output. This project builds a parser that copes, **without ever silently accepting wrong data**.

:::flow Parse pipeline
Raw text | prose, fences, JSON
Extract | find the JSON span
Repair | safe, mechanical fixes
Validate | Zod schema
Result | ok data, or errors + repair prompt
:::

**You'll practise:** string scanning with a small state machine, a typed `Result` with error kinds, generics over Zod schemas, and table-driven tests.

## The complete parser

```ts run level=intermediate title="LLM output parser · complete"
import { z } from "zod";

// ======================= result type =======================
type ParseFailure =
  | { kind: "no_json"; message: string }
  | { kind: "invalid_json"; message: string; snippet: string }
  | { kind: "schema"; message: string; issues: string[] };
type ParseResult<T> = { ok: true; data: T; repairs: string[] } | { ok: false; error: ParseFailure; repairs: string[] };

// ======================= 1. find the JSON span =======================
function extractJson(text: string): string | null {
  const fence = text.match(/```(?:json|JSON)?\s*\n([\s\S]*?)```/);          // prefer a fenced block
  if (fence) return fence[1].trim();
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  // scan for the matching closing bracket, ignoring brackets inside strings
  const stack: string[] = [];
  let inString: string | null = null, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") inString = ch;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") { stack.pop(); if (stack.length === 0) return text.slice(start, i + 1); }
  }
  return text.slice(start);                                                    // unterminated: return the rest
}

// ======================= 2. safe mechanical repairs =======================
function repair(json: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let t = json;
  const fix = (re: RegExp, to: string, label: string) => { const next = t.replace(re, to); if (next !== t) { repairs.push(label); t = next; } };
  fix(/[\u201C\u201D]/g, '"', "smart double quotes → \"");
  fix(/[\u2018\u2019]/g, "'", "smart single quotes → '");
  fix(/^\s*\/\/.*$/gm, "", "removed // comments");
  fix(/,\s*([}\]])/g, "$1", "removed trailing commas");
  fix(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":', "quoted bare keys");
  fix(/'([^'\\]*)'\s*:/g, '"$1":', "single-quoted keys → double");
  fix(/:\s*'([^'\\]*)'/g, ': "$1"', "single-quoted strings → double");
  fix(/\bTrue\b/g, "true", "Python True → true"); fix(/\bFalse\b/g, "false", "Python False → false"); fix(/\bNone\b/g, "null", "Python None → null");
  return { text: t, repairs };
}

// ======================= 3. parse + validate =======================
function parseOutput<S extends z.ZodType>(schema: S, raw: string): ParseResult<z.output<S>> {
  const span = extractJson(raw);
  if (span === null) return { ok: false, repairs: [], error: { kind: "no_json", message: "No JSON object or array found in the output." } };
  let data: unknown, repairs: string[] = [];
  try { data = JSON.parse(span); }
  catch {
    const fixed = repair(span);
    repairs = fixed.repairs;
    try { data = JSON.parse(fixed.text); }
    catch (e) { return { ok: false, repairs, error: { kind: "invalid_json", message: (e as Error).message, snippet: fixed.text.slice(0, 80) } }; }
  }
  const result = schema.safeParse(data);
  if (!result.success) return { ok: false, repairs, error: { kind: "schema", message: "Output didn't match the schema", issues: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) } };
  return { ok: true, data: result.data, repairs };
}

// ======================= 4. repair prompts =======================
function repairPrompt(error: ParseFailure): string {
  switch (error.kind) {
    case "no_json": return "Your previous reply contained no JSON. Reply with ONLY the JSON object, no other text.";
    case "invalid_json": return `Your previous reply was not valid JSON (${error.message}). Reply with ONLY a valid JSON object.`;
    case "schema": return `Your previous JSON had these problems:\n${error.issues.map((i) => `- ${i}`).join("\n")}\nReply with the corrected JSON object only.`;
  }
}

// ======================= 5. table-driven tests =======================
const Ticket = z.object({
  title: z.string().min(5),
  priority: z.enum(["low", "medium", "high"]),
  tags: z.array(z.string()).default([]),
  needsHuman: z.boolean(),
});

const cases: { name: string; raw: string; expectOk: boolean }[] = [
  { name: "clean JSON", raw: '{"title":"Login fails on Safari","priority":"high","needsHuman":false}', expectOk: true },
  { name: "prose around JSON", raw: 'Sure! Here is the ticket:\n{"title": "Export to PDF broken", "priority": "medium", "needsHuman": false}\nLet me know if you need more.', expectOk: true },
  { name: "code fence", raw: 'Here you go:\n```json\n{"title": "Sync conflict loses edits", "priority": "high", "tags": ["sync"], "needsHuman": true}\n```', expectOk: true },
  { name: "trailing comma + comment", raw: '{\n  // generated\n  "title": "Typo on pricing page",\n  "priority": "low",\n  "needsHuman": false,\n}', expectOk: true },
  { name: "smart quotes", raw: '{\u201Ctitle\u201D: \u201CDark mode flickers\u201D, \u201Cpriority\u201D: \u201Clow\u201D, \u201CneedsHuman\u201D: false}', expectOk: true },
  { name: "python-style literals", raw: "{'title': 'Billing shows wrong VAT', 'priority': 'high', 'needsHuman': True}", expectOk: true },
  { name: "braces inside strings", raw: 'Result: {"title": "Crash when name contains } or {", "priority": "high", "needsHuman": true} done', expectOk: true },
  { name: "wrong enum value", raw: '{"title":"Server down","priority":"urgent","needsHuman":true}', expectOk: false },
  { name: "no JSON at all", raw: "I'm sorry, I can't produce a ticket from that message.", expectOk: false },
  { name: "truncated output", raw: '{"title": "Long report about', expectOk: false },
];

let passed = 0;
for (const c of cases) {
  const r = parseOutput(Ticket, c.raw);
  const ok = r.ok === c.expectOk;
  passed += +ok;
  const detail = r.ok ? `→ ${r.data.priority} "${r.data.title}"` : `→ ${r.error.kind}`;
  console.log(`${ok ? "✅" : "❌"} ${c.name.padEnd(24)} ${detail}${r.repairs.length ? `   [${r.repairs.join(", ")}]` : ""}`);
}
console.log(`\n${passed}/${cases.length} cases behave as expected\n`);

const failed = parseOutput(Ticket, cases[7].raw);
if (!failed.ok) console.log("Repair prompt to send back to the model:\n" + repairPrompt(failed.error));
```

Every repair is **recorded** (`repairs`), so you can log how often the model needs fixing — a useful quality signal — and nothing is accepted without passing the schema.

## How it works

| Piece | Technique |
|---|---|
| finding JSON | prefer fenced blocks; otherwise scan brackets with a tiny state machine that ignores brackets inside strings |
| repairs | only mechanical, meaning-preserving fixes (quotes, commas, comments, literals), each one logged |
| validation | `parseOutput<S extends z.ZodType>` returns `ParseResult<z.output<S>>` — typed data or a typed failure |
| failure kinds | a union (`no_json`, `invalid_json`, `schema`) so each gets the right repair prompt |
| tests | a table of real-world messy outputs with the expected outcome |

:::warn Repair the syntax, never the meaning
Fixing a trailing comma is safe. "Fixing" `priority: "urgent"` into `"high"` is guessing — send it back to the model (or a human) instead. The parser above only repairs syntax; schema problems always fail.
:::

## Making it real

With Claude, prefer native structured output (`zodOutputFormat` + `messages.parse`) — the API then constrains the output to your schema. Keep this parser for everything else: logs, other providers, free-text prompts that *mention* JSON, and tool results from third-party systems.

```ts nocheck
const raw = await callAnyModel(prompt);
let result = parseOutput(Ticket, raw);
if (!result.ok) result = parseOutput(Ticket, await callAnyModel(prompt + "\n\n" + repairPrompt(result.error)));
if (!result.ok) await queueForHumanReview(raw, result.error);
```

:::exercise Extend it
1. Support **JSON Lines** (one object per line) and return per-line results.
2. Add a `parsePartial` mode for streaming (close open strings/brackets) used only for display.
3. Track repair statistics per model/prompt version and alert when they rise.
4. Generate the cases table from your real production logs (anonymised).
:::

:::keypoints
- Extract JSON from prose and fences with a bracket scanner that respects strings.
- Apply only safe, logged syntax repairs; never "fix" values.
- Validate with Zod and return a typed `Result` with failure kinds.
- Turn failures into precise repair prompts; test with a table of real messy outputs.
:::
