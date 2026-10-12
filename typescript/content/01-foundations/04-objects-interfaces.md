---
title: Objects, Types & Interfaces
level: easy
time: 30
summary: Describe the shape of your data — object types, type aliases vs interfaces, optional and readonly properties, nested objects, extending and combining types, index signatures and Record, and excess property checks.
---

Most data in AI apps is **objects**: a message, a request, a response, a document chunk. An object type lists the properties an object has and the type of each one.

:::syntax
```ts
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  tokens?: number;          // optional
  readonly id: string;      // can't be changed after creation
};
```
:::

## Object types

```ts run level=easy
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokens?: number;
};

const msg: ChatMessage = { id: "m1", role: "user", content: "What is RAG?" };

function preview(m: ChatMessage): string {
  const size = m.tokens ?? "?";            // tokens may be missing
  return `[${m.role}] ${m.content.slice(0, 30)} (${size} tokens)`;
}

console.log(preview(msg));
console.log(preview({ id: "m2", role: "assistant", content: "Retrieval-augmented generation…", tokens: 42 }));
```

TypeScript checks every property — missing ones, wrong types, and **typos**:

```ts run level=easy type-error
type ChatMessage = { role: "user" | "assistant"; content: string };

const a: ChatMessage = { role: "user" };                         // ❌ content is missing
const b: ChatMessage = { role: "system", content: "Be brief" };  // ❌ "system" isn't allowed
const c: ChatMessage = { role: "user", contents: "hi" };         // ❌ typo: contents
```

:::def Excess property check
When you write an object literal directly where a type is expected, TypeScript reports **extra properties** it doesn't know about. This catches typos like `contents` instead of `content`.
:::

## `interface` — another way to name an object type

```ts run level=easy
interface Document {
  id: string;
  title: string;
  text: string;
}

interface Chunk extends Document {       // everything in Document, plus more
  chunkIndex: number;
  embedding: number[];
}

const chunk: Chunk = { id: "d1", title: "Refunds", text: "Refunds within 30 days.", chunkIndex: 0, embedding: [0.1, 0.7, 0.2] };
console.log(chunk.title, chunk.chunkIndex, chunk.embedding.length, "dims");
```

:::def interface
A named object type declared with the `interface` keyword. It can `extend` other interfaces, and two declarations with the same name **merge** — which is how libraries let you add properties to their types.
:::

| | `type` | `interface` |
|---|---|---|
| object shapes | ✅ | ✅ |
| unions (`A \| B`), literals, tuples | ✅ | ❌ |
| extend | with `&` | with `extends` (slightly better error messages) |
| declaration merging | ❌ | ✅ |

:::tip Which one should I use?
Both are fine — pick one style and be consistent. A common rule: **`interface` for object shapes others may extend, `type` for everything else** (unions, function types, computed types). This course uses `type` most of the time because AI data is full of unions.
:::

## Combining types with `&` (intersection)

```ts run level=intermediate
type WithId = { id: string };
type Timestamps = { createdAt: Date; updatedAt: Date };
type Conversation = WithId & Timestamps & { title: string; messageCount: number };

const conv: Conversation = {
  id: "c_42", title: "RAG design", messageCount: 12,
  createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-06"),
};
console.log(conv);
```

:::def Intersection type
`A & B` — a value that has **all** the properties of `A` **and** all of `B`. Handy for mixing in common fields like `id` or timestamps.
:::

## Readonly properties

```ts run level=easy type-error
type Config = {
  readonly model: string;
  readonly maxTokens: number;
};

const config: Config = { model: "claude-opus-5-5", maxTokens: 4096 };
config.maxTokens = 99999;     // ❌ readonly — set it once, then it can't change
console.log(config);
```

`readonly` is checked only by TypeScript (the object isn't frozen at runtime), but it stops accidental changes — great for configuration and shared state.

## Nested objects

```ts run level=intermediate
type Usage = { inputTokens: number; outputTokens: number };
type ModelResponse = {
  id: string;
  model: string;
  content: { type: "text"; text: string }[];
  usage: Usage;
};

const res: ModelResponse = {
  id: "msg_01",
  model: "claude-opus-5-5",
  content: [{ type: "text", text: "Hello! How can I help?" }],
  usage: { inputTokens: 12, outputTokens: 8 },
};

const total = res.usage.inputTokens + res.usage.outputTokens;
console.log(res.content[0].text, `(${total} tokens)`);
```

## Dictionaries: index signatures and `Record`

When you don't know the keys in advance (a word → count map, model name → price), use an **index signature** or the built-in `Record` type:

```ts run level=intermediate
// "any string key maps to a number"
const wordCounts: { [word: string]: number } = {};
for (const w of "the cat sat on the mat the end".split(" ")) wordCounts[w] = (wordCounts[w] ?? 0) + 1;
console.log(wordCounts);

// Record<Keys, Value> — the same idea, shorter, and works with literal unions
type ModelName = "opus" | "sonnet" | "haiku";
const pricePerMillion: Record<ModelName, { input: number; output: number }> = {
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },        // remove a line and TypeScript complains: all keys are required
};
console.log(pricePerMillion.sonnet);
```

:::def Record
`Record<K, V>` is an object type whose keys are `K` and values are `V`. With a union of literal keys, **every** key is required — perfect for lookup tables you must keep complete.
:::

## Structural typing: shapes, not names

```ts run level=intermediate
type Point = { x: number; y: number };
function length(p: Point) { return Math.hypot(p.x, p.y); }

const vec = { x: 3, y: 4, label: "embedding-2d" };    // never declared as a Point…
console.log(length(vec));                               // …but it has x and y, so it fits ✅
```

:::def Structural typing
TypeScript compares types by their **shape** (the properties they have), not by their name. Any object with the right properties is accepted — even if it has extra ones (when it isn't a fresh literal).
:::

:::ai
SDK types like Claude's `Message` are just object types like these — with `content` being an array of blocks (`text`, `tool_use`, `thinking`…). Once you can read object types, reading SDK type definitions (hover in your editor!) becomes the fastest way to learn an API.
:::

## Check yourself

```quiz
? How do you mark a property as optional?
+ name?: string
- name: string | optional
- optional name: string
> A question mark after the name. Its type then includes undefined.

? What does `A & B` mean?
+ A value with all properties of A and all properties of B
- A value that is either A or B
- Only the properties A and B share
> & is intersection; | is union.

? `Record<"opus" | "haiku", number>` — what happens if you leave out "haiku"?
+ Type error: every key in the union is required
- Nothing, keys are optional
- haiku becomes undefined silently
> Records with literal keys must be complete.
```

:::keypoints
- Object types list properties: `{ name: string; age?: number; readonly id: string }`.
- `type` and `interface` both name object shapes; `interface` can `extend` and merge, `type` can do unions.
- Combine types with `&`; use `Record<K, V>` or index signatures for dictionaries.
- Excess property checks catch typos in object literals; `readonly` prevents accidental writes.
- TypeScript is **structural**: matching shape is what counts.
:::
