---
title: Runtime Validation with Zod
level: intermediate
time: 40
summary: Types vanish at runtime, so data from outside must be checked. Learn Zod 4 — schemas, z.infer, parse vs safeParse, readable errors, defaults, transforms and refinements, discriminated unions, brands, JSON Schema export, and validating config and model output.
---

Everything you've learned so far is checked **while you write code**. But at runtime the types are gone — and data from APIs, files, users and **language models** can be anything. You need a check that runs *at runtime*. **Zod** gives you that, and generates the TypeScript type from the same definition.

:::def Schema
A runtime object that describes the shape data must have. `schema.parse(data)` checks real data against it — and returns typed data or throws a detailed error.
:::

:::def z.infer
`z.infer<typeof Schema>` produces the TypeScript type that matches a schema. Write the shape **once** (the schema) and get both runtime validation and the static type.
:::

:::syntax
```ts
import { z } from "zod";

const Message = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});
type Message = z.infer<typeof Message>;     // { role: "user" | "assistant"; content: string }

const msg = Message.parse(unknownData);     // throws if invalid
const result = Message.safeParse(unknownData);  // { success: true, data } | { success: false, error }
```
:::

## A first schema

```ts run level=intermediate
import { z } from "zod";

const Ticket = z.object({
  title: z.string().min(5),
  priority: z.enum(["low", "medium", "high"]),
  tags: z.array(z.string()).max(5).default([]),
  assignee: z.email().optional(),
});
type Ticket = z.infer<typeof Ticket>;
//   ^?

// Pretend this JSON came from a model
const fromModel: unknown = JSON.parse('{"title": "Login fails on Safari", "priority": "high"}');
const ticket = Ticket.parse(fromModel);      // validated and typed (tags got its default)
console.log(ticket);
```

## safeParse and readable errors

`parse` throws; `safeParse` returns a result you can check — usually better for data you expect to be wrong sometimes.

```ts run level=intermediate
import { z } from "zod";

const Ticket = z.object({
  title: z.string().min(5, "Title is too short"),
  priority: z.enum(["low", "medium", "high"]),
  estimateHours: z.number().positive().max(80),
});

const outputs: unknown[] = [
  { title: "Fix crash in tokenizer", priority: "high", estimateHours: 3 },
  { title: "Bug", priority: "urgent", estimateHours: -2 },
  "Sure! Here's the ticket you asked for…",
];

for (const data of outputs) {
  const r = Ticket.safeParse(data);
  if (r.success) console.log("✅", r.data);
  else {
    console.log("❌ " + r.error.issues.length + " problem(s):");
    console.log(z.prettifyError(r.error));
  }
}
```

Each issue has a `path` (which field) and a `message` — perfect for showing errors in a form, or for **sending back to the model** so it can fix its answer.

## The building blocks

| Schema | Matches |
|---|---|
| `z.string()`, `.min(n)`, `.max(n)`, `.regex(re)`, `.startsWith("x")` | strings with rules |
| `z.email()`, `z.url()`, `z.uuid()`, `z.iso.datetime()` | common string formats |
| `z.number()`, `.int()`, `.positive()`, `.min()`, `.max()` | numbers with rules |
| `z.boolean()`, `z.null()`, `z.literal("x")` | exact values |
| `z.enum(["a", "b"])` | one of a few strings |
| `z.array(S)`, `z.tuple([A, B])`, `z.record(z.string(), S)` | collections |
| `z.object({...})`, `z.strictObject({...})` | objects (strict rejects unknown keys) |
| `S.optional()`, `S.nullable()`, `S.default(v)` | missing / null / fallback |
| `z.union([A, B])`, `z.discriminatedUnion("type", [...])` | one of several shapes |

## Discriminated unions

```ts run level=intermediate
import { z } from "zod";

const ContentBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.record(z.string(), z.unknown()) }),
]);
type ContentBlock = z.infer<typeof ContentBlock>;
//   ^?

const blocks = z.array(ContentBlock).parse([
  { type: "text", text: "Let me look that up." },
  { type: "tool_use", id: "toolu_1", name: "get_order", input: { orderId: "A-1042" } },
]);

for (const b of blocks) {
  if (b.type === "tool_use") console.log("tool:", b.name, b.input);      // narrowed, like hand-written unions
  else console.log("text:", b.text);
}
```

## Defaults, coercion and transforms

```ts run level=intermediate
import { z } from "zod";

// Query strings and env vars are always strings — coerce converts them before validating
const SearchParams = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  includeArchived: z.stringbool().default(false),            // "true"/"false"/"1"/"0"/"yes"/"no"
  tags: z.string().default("").transform((s) => s.split(",").filter(Boolean)),
});

type Input = z.input<typeof SearchParams>;     // what you may pass in
//   ^?
type Output = z.output<typeof SearchParams>;   // what you get out (same as z.infer)
//   ^?

const url = new URL("https://example.com/search?q=+refund+policy+&limit=5&includeArchived=yes&tags=billing,faq");
console.log(SearchParams.parse(Object.fromEntries(url.searchParams)));
```

## Custom rules: refine

```ts run level=intermediate
import { z } from "zod";

const Budget = z
  .object({ maxInputTokens: z.number().int().positive(), maxOutputTokens: z.number().int().positive(), contextWindow: z.number().int() })
  .refine((b) => b.maxInputTokens + b.maxOutputTokens <= b.contextWindow, {
    message: "Input + output tokens must fit in the context window",
    path: ["maxOutputTokens"],
  });

console.log(Budget.safeParse({ maxInputTokens: 150_000, maxOutputTokens: 64_000, contextWindow: 200_000 }).error?.issues);
console.log(Budget.safeParse({ maxInputTokens: 100_000, maxOutputTokens: 64_000, contextWindow: 200_000 }).success);
```

## Reusing schemas: extend, pick, omit, partial

```ts run level=intermediate
import { z } from "zod";

const Agent = z.object({
  id: z.string().startsWith("ag_"),
  name: z.string().min(3),
  model: z.enum(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]),
  systemPrompt: z.string(),
  tools: z.array(z.string()),
});

const CreateAgent = Agent.omit({ id: true });                 // like Omit<...> but at runtime too
const UpdateAgent = Agent.omit({ id: true }).partial();       // every field optional
const AgentWithStats = Agent.extend({ runs: z.number().int(), avgCostUsd: z.number() });

type UpdateAgent = z.infer<typeof UpdateAgent>;
//   ^?
console.log(UpdateAgent.parse({ model: "claude-haiku-4-5" }));
console.log(CreateAgent.safeParse({ id: "ag_1", name: "Bot", model: "claude-opus-5-5", systemPrompt: "", tools: [] }).success);
console.log(Object.keys(AgentWithStats.shape));
```

## Brands with Zod

```ts run level=intermediate type-error
import { z } from "zod";

const UserId = z.string().startsWith("usr_").brand<"UserId">();
type UserId = z.infer<typeof UserId>;

function loadUser(id: UserId) { return { id, name: "Ada" }; }

const id = UserId.parse("usr_123");
console.log(loadUser(id));
loadUser("usr_456");          // ❌ a plain string is not a validated UserId
```

## Validating configuration at startup

```ts run level=intermediate
import { z } from "zod";

const Env = z.object({
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-", "Doesn't look like an Anthropic key"),
  ANTHROPIC_MODEL: z.enum(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]).default("claude-opus-5-5"),
  MAX_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

// In Node.js you'd pass process.env; here we simulate it
const fakeEnv = { ANTHROPIC_API_KEY: "sk-ant-api03-example", MAX_CONCURRENCY: "8" };
const config = Env.parse(fakeEnv);
console.log(config);

const bad = Env.safeParse({ ANTHROPIC_API_KEY: "oops", LOG_LEVEL: "verbose" });
if (!bad.success) console.log("Startup failed:\n" + z.prettifyError(bad.error));
```

## Schemas → JSON Schema (for models)

Model APIs describe tool inputs and structured output with **JSON Schema**. Zod can generate it from the same schema you validate with:

```ts run level=intermediate
import { z } from "zod";

const WeatherArgs = z.object({
  city: z.string().describe("City name, e.g. Pune"),
  unit: z.enum(["celsius", "fahrenheit"]).default("celsius").describe("Temperature unit"),
});

console.log(JSON.stringify(z.toJSONSchema(WeatherArgs), null, 2));
```

:::tip One schema, three jobs
A single Zod schema can (1) tell the model what to produce (JSON Schema), (2) validate what it actually produced, and (3) give your code the TypeScript type. That's why the Claude SDK's helpers (`zodOutputFormat`, `betaZodTool`) take Zod schemas — Module 5.
:::

:::warn Validate at the boundary, once
Parse data **where it enters** your program (HTTP handler, model response, file read, env). After that, pass the typed result around — don't re-validate everywhere, and never `as`-cast unknown data instead.
:::

:::ai
LLMs are probabilistic: even with structured output, you should treat responses as untrusted input. `safeParse` the result; on failure, send `z.prettifyError(error)` back to the model in a follow-up message ("Your JSON had these problems: … Please fix them"). One retry with the exact errors fixes most failures.
:::

## Check yourself

```quiz
? What does `z.infer<typeof Schema>` give you?
+ The TypeScript type of data that passes the schema
- A runtime validator
- A JSON Schema
> Write the schema once; infer the type from it.

? When should you prefer safeParse over parse?
+ When invalid data is expected and you want to handle it without exceptions
- Never
- Only for arrays
> safeParse returns { success, data | error }.

? Why use z.coerce.number() for query parameters?
+ Query strings and env vars are strings; coerce converts before validating
- It makes numbers optional
- It rounds numbers
> "10" becomes 10, then the number rules apply.
```

:::keypoints
- Types disappear at runtime — validate outside data with **Zod** schemas.
- `z.infer` (or `z.output`/`z.input`) derives TypeScript types from schemas.
- `parse` throws; `safeParse` returns a result; `z.prettifyError` makes readable messages.
- Use `default`, `coerce`, `transform`, `refine`, `discriminatedUnion`, `brand`, and `extend/pick/omit/partial`.
- `z.toJSONSchema` turns schemas into the JSON Schema models need.
:::
