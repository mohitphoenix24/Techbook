---
title: Unions & Narrowing
level: intermediate
time: 35
summary: The most important TypeScript skill for AI apps — union types ("this OR that"), narrowing with typeof, in, instanceof and equality checks, discriminated unions for messages, events and content blocks, and exhaustive checks with never.
---

A model response can contain **text, a tool call, or thinking**. A stream event can be **start, delta, or stop**. A request can be **loading, done, or failed**. All of these are "one of several shapes" — and TypeScript's **union types** describe them perfectly.

:::def Union type
`A | B` means "a value that is **either** an `A` **or** a `B`". You can only use what all members have in common — until you **narrow** it to one member.
:::

## Simple unions

```ts run level=easy
type Id = string | number;

function formatId(id: Id): string {
  if (typeof id === "number") return `#${id.toString().padStart(4, "0")}`;   // number here
  return id.toUpperCase();                                                     // string here
}

console.log(formatId(42), formatId("doc-a7"));
```

:::def Narrowing
Using a check (`typeof`, `in`, `instanceof`, `===`, …) so TypeScript knows which member of a union you have **inside that branch**. Outside the check, the full union still applies.
:::

```ts run level=easy type-error
function shout(value: string | number) {
  return value.toUpperCase();      // ❌ numbers don't have toUpperCase — narrow first
}
```

## The narrowing toolbox

```ts run level=intermediate
type ApiKey = { kind: "key"; value: string };

function describe(x: string | number[] | Date | ApiKey | null) {
  if (x === null) return "nothing";                        // equality
  if (typeof x === "string") return `text: ${x}`;          // typeof (string, number, boolean, object, function…)
  if (Array.isArray(x)) return `${x.length} numbers`;      // Array.isArray
  if (x instanceof Date) return `date: ${x.toDateString()}`; // instanceof (classes)
  if ("kind" in x) return `key ending …${x.value.slice(-4)}`; // the "in" operator
  return x;                                                 // never — every case handled
}

for (const v of ["hi", [0.1, 0.2], new Date("2026-10-07"), { kind: "key", value: "sk-ant-1234abcd" } as ApiKey, null])
  console.log(describe(v));
```

## Discriminated unions — the AI app superpower

When each member of a union has a common field with a **different literal value** (often called `type` or `kind`), checking that field narrows to exactly one member.

:::def Discriminated union
A union of object types that share a literal "tag" property — like `type: "text"` vs `type: "tool_use"`. A `switch` on the tag gives you the exact shape in each case. The Claude API, OpenAI, MCP and almost every streaming protocol use this pattern.
:::

```ts run level=intermediate
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "thinking"; thinking: string };

function render(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text;                                   // only text blocks have .text
    case "tool_use":
      return `🔧 ${block.name}(${JSON.stringify(block.input)})`;
    case "thinking":
      return `💭 ${block.thinking.slice(0, 40)}…`;
  }
}

const response: ContentBlock[] = [
  { type: "thinking", thinking: "The user wants the weather, so I should call the tool first." },
  { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Pune" } },
  { type: "text", text: "It's 27°C and sunny in Pune." },
];
response.forEach((b) => console.log(render(b)));
```

```ts run level=intermediate type-error
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown };

function firstText(blocks: ContentBlock[]) {
  return blocks[0].text;          // ❌ blocks[0] might be a tool_use block, which has no text
}
```

## Modelling state: loading, success, error

Instead of several loose variables (`isLoading`, `error`, `data` — which can contradict each other), use one discriminated union. Impossible states become impossible to write.

```ts run level=intermediate
type RequestState<T> =
  | { status: "idle" }
  | { status: "loading"; startedAt: number }
  | { status: "success"; data: T; ms: number }
  | { status: "error"; error: string; retryable: boolean };

function statusLine(s: RequestState<string>): string {
  switch (s.status) {
    case "idle": return "Ask a question";
    case "loading": return `Thinking… (${Date.now() - s.startedAt} ms)`;
    case "success": return `✅ ${s.data} (${s.ms} ms)`;
    case "error": return `⚠ ${s.error}${s.retryable ? " — retry?" : ""}`;
  }
}

console.log(statusLine({ status: "idle" }));
console.log(statusLine({ status: "loading", startedAt: Date.now() - 120 }));
console.log(statusLine({ status: "success", data: "RAG = retrieve, then generate", ms: 840 }));
console.log(statusLine({ status: "error", error: "Rate limited", retryable: true }));
```

## Exhaustive checks with `never`

What happens when a new block type is added later? You want **every** `switch` that handles blocks to fail the build until it's updated. The `never` trick does that:

```ts run level=advanced type-error
type StreamEvent =
  | { type: "message_start"; id: string }
  | { type: "text_delta"; text: string }
  | { type: "message_stop" }
  | { type: "error"; message: string };        // ← newly added

function assertNever(x: never): never {
  throw new Error("Unhandled case: " + JSON.stringify(x));
}

function handle(e: StreamEvent): string {
  switch (e.type) {
    case "message_start": return `start ${e.id}`;
    case "text_delta": return e.text;
    case "message_stop": return "stop";
    default: return assertNever(e);           // ❌ error: "error" events are not handled yet
  }
}
```

Add a `case "error": return e.message;` and the error disappears. In the `default` branch, TypeScript has removed every handled member; if anything is left, it isn't `never`, so the call fails to type-check.

:::tip Make illegal states unrepresentable
If two fields only make sense together (`data` only when `status` is `"success"`), put them in the same union member. Then TypeScript won't let you read `data` while loading — a whole category of UI bugs disappears.
:::

:::ai
Claude's streaming API sends events like `message_start`, `content_block_start`, `content_block_delta` (with `text_delta`, `input_json_delta` or `thinking_delta` inside) and `message_stop`. Every one is a member of a discriminated union in the SDK's types. Once you're comfortable with `switch (event.type)`, handling streams, tool calls and agent traces is straightforward.
:::

## Check yourself

```quiz
? Inside `if (typeof x === "string")` where `x: string | number`, what is x?
+ string
- string | number
- unknown
> typeof checks narrow the union.

? What makes a union "discriminated"?
+ Each member has a shared property with a different literal value, like type: "text"
- It uses the | operator
- It has exactly two members
> Checking the tag narrows to one member.

? What is the purpose of `assertNever(x)` in a default branch?
+ To get a type error when a union gains a member you haven't handled
- To make the function return never
- To catch runtime exceptions
> If a case is missing, x isn't never, so the call doesn't type-check.
```

:::keypoints
- `A | B` = either. You can only use shared members until you **narrow**.
- Narrow with `typeof`, `===`, `Array.isArray`, `instanceof`, and `"prop" in obj`.
- **Discriminated unions** (`type: "text" | "tool_use" | …`) + `switch` give exact shapes per case.
- Model request/UI state as a union to make impossible states unrepresentable.
- `assertNever` in `default` makes the compiler enforce exhaustive handling.
:::
