---
title: keyof, typeof & Indexed Access
level: intermediate
time: 25
summary: The three operators that let types follow your code — typeof (get a type from a value), keyof (get the property names of a type), and indexed access T[K] (get the type of a property) — used to build config tables, model registries and type-safe lookups.
---

Some of the best TypeScript code has **almost no hand-written types** — the types are derived from real values, so they can never be out of date. Three operators make this possible.

| Operator | Works on | Gives you | Example |
|---|---|---|---|
| `typeof x` | a **value** | its type | `typeof config` |
| `keyof T` | a **type** | union of its property names | `keyof Agent` → `"id" \| "name" \| …` |
| `T[K]` | a **type** + key | the type of that property | `Agent["model"]` |

## `typeof`: types from values

```ts run level=intermediate
const DEFAULTS = {
  model: "claude-sonnet-5-5",
  maxTokens: 4096,
  stream: true,
  retries: { max: 3, baseDelayMs: 500 },
};

type Settings = typeof DEFAULTS;
//   ^?

function withOverrides(overrides: Partial<Settings>): Settings {
  return { ...DEFAULTS, ...overrides };
}
console.log(withOverrides({ maxTokens: 1024 }));
```

:::warn Two different typeofs
In a **type** position (`type X = typeof value`), `typeof` is TypeScript's operator and gives a type. In a **value** position (`if (typeof x === "string")`), it's JavaScript's runtime operator that returns a string. Same word, two jobs.
:::

## `keyof`: property names as a union

```ts run level=intermediate
type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number };
type UsageField = keyof Usage;     // "inputTokens" | "outputTokens" | "cacheReadTokens"

function sumField(rows: Usage[], field: keyof Usage): number {
  return rows.reduce((total, row) => total + row[field], 0);
}

const rows: Usage[] = [
  { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 900 },
  { inputTokens: 800, outputTokens: 150, cacheReadTokens: 600 },
];
for (const f of ["inputTokens", "outputTokens", "cacheReadTokens"] as const) console.log(f, sumField(rows, f));
```

```ts run level=intermediate type-error
type Usage = { inputTokens: number; outputTokens: number };
function sumField(rows: Usage[], field: keyof Usage) { return rows.reduce((t, r) => t + r[field], 0); }
sumField([], "inputTokenz");      // ❌ typo caught: not a key of Usage
```

## `T[K]`: indexed access types

```ts run level=intermediate
type ApiResponse = {
  id: string;
  content: { type: "text"; text: string }[];
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: "end_turn" | "max_tokens" | "tool_use" | "refusal";
};

type Usage = ApiResponse["usage"];
//   ^?
type Block = ApiResponse["content"][number];      // [number] = "the element type of an array"
//   ^?
type StopReason = ApiResponse["stop_reason"];
//   ^?

const reasons: StopReason[] = ["end_turn", "refusal"];
console.log(reasons);
```

## Putting them together: a model registry

A single `const` object becomes the source of truth for runtime data **and** types:

```ts run level=intermediate
const MODELS = {
  "claude-opus-5-5":   { context: 1_000_000, price: { input: 5, output: 25 }, tier: "flagship" },
  "claude-sonnet-5-5": { context: 1_000_000, price: { input: 3, output: 15 }, tier: "balanced" },
  "claude-haiku-4-5":  { context: 200_000,   price: { input: 1, output: 5 },  tier: "fast" },
} as const;

type ModelId = keyof typeof MODELS;
//   ^?
type Tier = (typeof MODELS)[ModelId]["tier"];
//   ^?

function pickModel(tier: Tier): ModelId {
  const entry = (Object.entries(MODELS) as [ModelId, (typeof MODELS)[ModelId]][]).find(([, m]) => m.tier === tier);
  return entry![0];
}

function estimate(model: ModelId, inTok: number, outTok: number) {
  const { price } = MODELS[model];
  return `$${((inTok * price.input + outTok * price.output) / 1e6).toFixed(4)}`;
}

console.log(pickModel("fast"), estimate("claude-haiku-4-5", 50_000, 2_000));
console.log(pickModel("flagship"), estimate("claude-opus-5-5", 50_000, 2_000));
```

Add a new model to the object and `ModelId`, `Tier`, `pickModel` and `estimate` all accept it immediately — no type to update.

:::tip Object.keys returns string[]
`Object.keys(MODELS)` is typed as `string[]`, not `ModelId[]`, because at runtime an object might have extra keys. When you know the object is exactly what you declared, cast: `Object.keys(MODELS) as ModelId[]`.
:::

## A type-safe `get` helper

```ts run level=intermediate
function get<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const run = { id: "run_7", status: "completed" as const, steps: 4, costUsd: 0.0123 };
const status = get(run, "status");
//    ^?
const steps = get(run, "steps");
//    ^?
console.log(status, steps);
```

:::ai
SDK response types are deeply nested. Instead of guessing, pull out exactly the part you need: `type ToolUseBlock = Extract<Message["content"][number], { type: "tool_use" }>`. Indexed access plus `Extract` turns huge library types into the small, precise types your function actually needs.
:::

## Check yourself

```quiz
? For `type T = { a: string; b: number }`, what is `keyof T`?
+ "a" | "b"
- string
- [ "a", "b" ]
> keyof gives a union of property names.

? What does `Message["content"][number]` mean?
+ The type of one element of Message's content array
- The number of content blocks
- The first content block
> [number] indexes into an array type.

? Why derive `type ModelId = keyof typeof MODELS`?
+ Adding a model to the object automatically updates the type
- It's required for objects
- It makes the object immutable
> One source of truth for both data and types.
```

:::keypoints
- `typeof value` turns a value into a type; `keyof T` lists a type's keys as a union.
- `T[K]` reads a property's type; `T[number]` reads an array's element type.
- `as const` objects + `keyof typeof` = registries where data and types never drift apart.
- `<K extends keyof T>(obj: T, key: K): T[K]` is the classic type-safe lookup.
:::
