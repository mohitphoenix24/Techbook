---
title: Structured Output with Zod
level: advanced
time: 35
summary: Get data, not prose — define the output shape once with Zod, use the SDK's zodOutputFormat and messages.parse for typed results, validate and repair when something goes wrong, show partial JSON while it streams, and design schemas that models fill in reliably.
---

Many AI features need **data**: fields extracted from an invoice, a ticket's priority, a list of action items. Free text would need fragile parsing. **Structured output** asks the model to answer in an exact JSON shape — and with Zod you get that shape, the validation, and the TypeScript type from a single definition.

:::def Structured output
Constraining the model's answer to a **JSON Schema** you provide. The API makes the model produce JSON that matches the schema, and the SDK parses it into a typed object.
:::

## messages.parse + zodOutputFormat

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const client = new Anthropic();

const Invoice = z.object({
  vendor: z.string(),
  invoiceNumber: z.string(),
  issueDate: z.string().describe("ISO date, YYYY-MM-DD"),
  currency: z.enum(["USD", "EUR", "INR", "GBP"]),
  lineItems: z.array(z.object({ description: z.string(), quantity: z.number(), unitPrice: z.number() })),
  total: z.number(),
});

const response = await client.messages.parse({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  messages: [{ role: "user", content: `Extract the invoice fields from this text:\n\n${"ACME Cloud Ltd — Invoice INV-20931 — 2026-09-12 …"}` }],
  output_config: { format: zodOutputFormat(Invoice) },
});

const invoice = response.parsed_output;          // typed as z.infer<typeof Invoice> | null
if (!invoice) throw new Error("Model output didn't match the schema");
console.log(invoice.vendor, invoice.total, invoice.lineItems.length);
```

:::tip Check the stop reason too
`parsed_output` is `null` if the answer couldn't be parsed — for example when `stop_reason` is `"max_tokens"` (the JSON was cut off) or `"refusal"`. Check both before using the data.
:::

## Validate business rules yourself

The schema guarantees the **shape**. Rules like "line items must add up to the total" are your job — and models do make arithmetic mistakes. Here's a full extract → validate → repair loop, running against a scripted model:

```ts run level=advanced
import { z } from "zod";

const Invoice = z
  .object({
    vendor: z.string().min(1),
    invoiceNumber: z.string().regex(/^INV-\d+$/),
    lineItems: z.array(z.object({ description: z.string(), quantity: z.number().positive(), unitPrice: z.number().nonnegative() })).min(1),
    total: z.number(),
  })
  .superRefine((inv, ctx) => {
    const sum = inv.lineItems.reduce((t, li) => t + li.quantity * li.unitPrice, 0);
    if (Math.abs(sum - inv.total) > 0.01)
      ctx.addIssue({ code: "custom", path: ["total"], message: `total is ${inv.total} but line items add up to ${sum.toFixed(2)}` });
  });
type Invoice = z.infer<typeof Invoice>;

// A scripted model: first answer has an arithmetic slip, the retry is correct
let calls = 0;
async function fakeModel(prompt: string): Promise<string> {
  calls++;
  console.log(`--- model call ${calls} ---\n${prompt.slice(0, 160)}${prompt.length > 160 ? "…" : ""}`);
  return calls === 1
    ? '{"vendor":"ACME Cloud","invoiceNumber":"INV-20931","lineItems":[{"description":"GPU hours","quantity":10,"unitPrice":2.5},{"description":"Storage","quantity":1,"unitPrice":12}],"total":36}'
    : '{"vendor":"ACME Cloud","invoiceNumber":"INV-20931","lineItems":[{"description":"GPU hours","quantity":10,"unitPrice":2.5},{"description":"Storage","quantity":1,"unitPrice":12}],"total":37}';
}

async function extract(text: string, maxAttempts = 2): Promise<Invoice> {
  let prompt = `Extract the invoice as JSON.\n\n${text}`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await fakeModel(prompt);
    let data: unknown;
    try { data = JSON.parse(raw); } catch { prompt += "\n\nYour previous answer was not valid JSON. Reply with JSON only."; continue; }
    const result = Invoice.safeParse(data);
    if (result.success) return result.data;
    const problems = z.prettifyError(result.error);
    console.log(`validation failed:\n${problems}`);
    prompt = `Extract the invoice as JSON.\n\n${text}\n\nYour previous answer had these problems:\n${problems}\nRe-read the invoice and correct them.`;
  }
  throw new Error(`Could not extract a valid invoice after ${maxAttempts} attempts`);
}

const invoice = await extract("ACME Cloud — INV-20931\nGPU hours ×10 @ $2.50\nStorage ×1 @ $12.00\nTOTAL $37.00");
console.log("\n✅ final:", invoice);
```

:::tip Feed errors back
`z.prettifyError` produces exactly the kind of message a model can act on: field paths and what's wrong. One repair attempt with precise feedback fixes most failures; if it still fails, flag the document for a human.
:::

## Showing partial results while streaming

Structured output can stream too. To show fields as they arrive, parse the **incomplete** JSON leniently, and validate only the final result:

```ts run level=advanced
import { z } from "zod";

// Close any open strings/arrays/objects so incomplete JSON can be parsed
function parsePartial(text: string): unknown {
  const stack: string[] = [];
  let inString = false, escaped = false;
  for (const ch of text) {
    if (inString) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let repaired = text + (inString ? '"' : "");
  repaired = repaired.replace(/,\s*$/, "").replace(/,?\s*"[^"]*"\s*:\s*$/, "");      // drop a dangling key
  try { return JSON.parse(repaired + stack.reverse().join("")); } catch { return undefined; }
}

const Plan = z.object({ title: z.string(), steps: z.array(z.string()), difficulty: z.enum(["easy", "medium", "hard"]) });
const PartialPlan = Plan.partial();                       // for display only: every field optional

const full = JSON.stringify({ title: "Build a RAG chatbot", steps: ["Chunk the docs", "Embed and index", "Retrieve top-k", "Answer with citations"], difficulty: "medium" });
for (let i = 12; i < full.length; i += 23) {
  const partial = PartialPlan.safeParse(parsePartial(full.slice(0, i)));
  if (partial.success) console.log(`${String(i).padStart(3)} chars →`, JSON.stringify(partial.data));
}
console.log("final:", Plan.parse(JSON.parse(full)));        // validate the complete object
```

## Designing schemas models fill in well

| Do | Why |
|---|---|
| use `z.enum([...])` for categories | the model can only pick valid options |
| add `.describe()` to fields with formats or units | descriptions go into the JSON Schema the model reads |
| prefer flat, simple shapes | deep nesting and huge unions are harder to fill correctly |
| allow "unknown": `z.string().nullable()` or `"unknown"` in the enum | otherwise the model may invent a value to satisfy the schema |
| keep reasoning fields optional and first if you add them | free text before the answer can help on hard extractions |
| validate business rules in code (`refine`) | the schema can't express "sums must match" |

:::warn Nullable beats made-up
If a field might genuinely be missing from the document (a PO number, a due date), make it nullable. A required field pressures the model to fill it with something plausible — a hallucination your validation won't catch.
:::

:::ai
Structured output turns LLMs into reliable components: classification (`z.enum`), extraction (objects), routing (`z.discriminatedUnion` of actions), scoring for evals (`z.object({ score: z.number().int().min(1).max(5), reason: z.string() })`). The pattern is always the same: schema → `zodOutputFormat` → check `parsed_output` and `stop_reason` → business-rule validation → repair or escalate.
:::

## Check yourself

```quiz
? What is `response.parsed_output` when parsing failed?
+ null — so check it before use
- An empty object
- The raw text
> It's typed as T | null.

? The schema matched, but the total doesn't equal the sum of line items. What now?
+ Add a refine rule, send the precise error back to the model, and retry once
- Trust the model
- Delete the total field
> Shape validation and business validation are different jobs.

? Why make a field nullable when the document may not contain it?
+ So the model doesn't have to invent a value to satisfy the schema
- Nullable fields are faster
- It removes the field from the JSON Schema
> Required fields can pressure models into hallucinating.
```

:::keypoints
- `client.messages.parse({ ..., output_config: { format: zodOutputFormat(Schema) } })` → typed `parsed_output` (or `null`).
- Check `stop_reason` and `parsed_output`; validate business rules with `refine`/`superRefine`.
- Repair loop: send `z.prettifyError` output back once; escalate if it still fails.
- Stream partial JSON for display with a lenient parser + `Schema.partial()`; validate only the final object.
- Design schemas with enums, descriptions, nullable fields and simple shapes.
:::
