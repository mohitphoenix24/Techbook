---
title: Utility Types
level: intermediate
time: 30
summary: TypeScript's built-in type helpers that turn one type into another — Partial, Required, Readonly, Pick, Omit, Record, Exclude, Extract, NonNullable, ReturnType, Parameters and Awaited — and how they keep request, update and response types in sync.
---

You often need **variations** of a type: the same `Agent` but with every field optional (for an update), without the `id` (for creation), or with only some fields (for a list view). Copy-pasting types means they drift apart. **Utility types** derive the variation from the original, so a change in one place flows everywhere.

:::def Utility type
A built-in generic type that transforms another type, like `Partial<T>` (make every property optional) or `Omit<T, "id">` (remove a property). They're written in TypeScript itself — you'll learn to build your own in Module 3.
:::

## The starting type

```ts
type Agent = {
  id: string;
  name: string;
  model: "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-4-5";
  systemPrompt: string;
  temperature?: number;
  tools: string[];
  createdAt: Date;
};
```

## Partial, Required, Readonly

```ts run level=intermediate
type Agent = {
  id: string;
  name: string;
  model: "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-4-5";
  systemPrompt: string;
  tools: string[];
};

// Partial<T>: every property optional → perfect for "update" requests
function updateAgent(agent: Agent, changes: Partial<Agent>): Agent {
  return { ...agent, ...changes };
}

const a: Agent = { id: "ag_1", name: "Researcher", model: "claude-sonnet-5-5", systemPrompt: "Find sources.", tools: ["search"] };
const b = updateAgent(a, { model: "claude-opus-5-5", tools: ["search", "fetch"] });
console.log(b);

// Readonly<T>: every property readonly
const frozen: Readonly<Agent> = b;
// frozen.name = "x";   ← would be an error

// Required<T>: remove every ?
type Settings = { temperature?: number; maxTokens?: number };
const defaults: Required<Settings> = { temperature: 1, maxTokens: 4096 };
console.log(defaults);
```

## Pick and Omit

```ts run level=intermediate
type Agent = {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  createdAt: Date;
};

type AgentSummary = Pick<Agent, "id" | "name" | "model">;        // keep only these
//   ^?
type NewAgent = Omit<Agent, "id" | "createdAt">;                  // everything except these
//   ^?

function createAgent(input: NewAgent): Agent {
  return { ...input, id: "ag_" + Math.random().toString(36).slice(2, 8), createdAt: new Date("2026-10-07") };
}

const created = createAgent({ name: "Support bot", model: "claude-haiku-4-5", systemPrompt: "Be kind.", tools: [] });
const summary: AgentSummary = { id: created.id, name: created.name, model: created.model };
console.log(summary.name, summary.model);
```

:::tip Derive, don't duplicate
`NewAgent = Omit<Agent, "id" | "createdAt">` means adding a field to `Agent` automatically adds it to `NewAgent`. If you'd copied the fields by hand, the two would silently drift apart.
:::

## Record

```ts run level=intermediate
type Model = "opus" | "sonnet" | "haiku";
type Pricing = { input: number; output: number };

const PRICES: Record<Model, Pricing> = {
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
};

function cost(model: Model, inTok: number, outTok: number): number {
  const p = PRICES[model];
  return (inTok * p.input + outTok * p.output) / 1_000_000;
}
console.log(cost("sonnet", 12_000, 800).toFixed(4));
```

## Working with unions: Exclude, Extract, NonNullable

```ts run level=intermediate
type StopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "pause_turn" | "refusal";

type Finished = Exclude<StopReason, "tool_use" | "pause_turn">;    // remove members
//   ^?
type NeedsAction = Extract<StopReason, "tool_use" | "pause_turn" | "refusal">;   // keep members
//   ^?
type MaybeModel = string | null | undefined;
type Model = NonNullable<MaybeModel>;
//   ^?

const done: Finished = "end_turn";
console.log(done);
```

## Types from functions: ReturnType, Parameters, Awaited

```ts run level=intermediate
async function fetchUsage(orgId: string, days: number) {
  return { orgId, days, inputTokens: 1_200_000, outputTokens: 95_000, requests: 3_400 };
}

type UsageArgs = Parameters<typeof fetchUsage>;
//   ^?
type UsagePromise = ReturnType<typeof fetchUsage>;
//   ^?
type Usage = Awaited<ReturnType<typeof fetchUsage>>;
//   ^?

function formatUsage(u: Usage) {
  return `${u.orgId}: ${u.requests} requests, ${(u.inputTokens / 1e6).toFixed(1)}M in / ${(u.outputTokens / 1e3).toFixed(0)}K out`;
}
console.log(formatUsage(await fetchUsage("org_acme", 30)));
```

:::def Awaited
`Awaited<T>` unwraps a Promise type: `Awaited<Promise<string>>` is `string`. Combined with `ReturnType`, it gives you "the type an async function resolves to" — without writing that type by hand.
:::

:::tip Types from code
`typeof value`, `ReturnType<typeof fn>` and `Parameters<typeof fn>` let **code be the single source of truth**. Great when a library function returns a complex object type that isn't exported.
:::

## Cheat sheet

| Utility | Does | Example use |
|---|---|---|
| `Partial<T>` | all properties optional | PATCH/update payloads |
| `Required<T>` | all properties required | settings after defaults applied |
| `Readonly<T>` | all properties readonly | config, shared state |
| `Pick<T, K>` | keep some properties | list views, summaries |
| `Omit<T, K>` | remove some properties | "create" inputs without `id` |
| `Record<K, V>` | object with keys K and values V | lookup tables |
| `Exclude<U, X>` / `Extract<U, X>` | remove / keep union members | narrowing event or status unions |
| `NonNullable<T>` | remove `null` and `undefined` | after validation |
| `ReturnType<F>` / `Parameters<F>` | function result / argument types | wrapping library functions |
| `Awaited<T>` | unwrap Promise | results of async functions |

:::ai
The Claude SDK's request type is large. Instead of retyping it, derive from it: `Omit<Anthropic.MessageCreateParams, "messages">` for shared defaults, `Partial<...>` for overrides, `Awaited<ReturnType<typeof client.messages.create>>` for the response. Your wrappers stay correct when the SDK adds new options.
:::

## Check yourself

```quiz
? Which type removes `id` and `createdAt` from Agent?
+ Omit<Agent, "id" | "createdAt">
- Pick<Agent, "id" | "createdAt">
- Exclude<Agent, "id">
> Omit removes properties; Pick keeps them; Exclude works on unions.

? What is `Awaited<ReturnType<typeof fn>>` for `async function fn() { return 42 }`?
+ number
- Promise<number>
- ReturnType
> ReturnType gives Promise<number>; Awaited unwraps it.

? Why use Partial<Agent> for an update function?
+ Callers can send only the fields they want to change, and it stays in sync with Agent
- It makes all fields required
- It's faster
> Derived types follow the original automatically.
```

:::keypoints
- Utility types **derive** new types from existing ones, so related types never drift apart.
- Object helpers: `Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`.
- Union helpers: `Exclude`, `Extract`, `NonNullable`.
- Function helpers: `ReturnType`, `Parameters`, `Awaited` — get types straight from code with `typeof`.
:::
