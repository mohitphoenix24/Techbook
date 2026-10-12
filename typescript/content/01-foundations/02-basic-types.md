---
title: Basic Types & Inference
level: easy
time: 25
summary: The building blocks — string, number, boolean, null and undefined, literal types, type annotations versus inference, type aliases, and the three special types every TypeScript developer must understand — any, unknown and never.
---

Every value in JavaScript has a kind: text, a number, true/false, nothing. TypeScript gives each kind a **type name** and checks that you use values consistently.

## The everyday types

| Type | Example values | Used for |
|---|---|---|
| `string` | `"hello"`, `'claude'`, `` `Hi ${name}` `` | text: prompts, model names, ids |
| `number` | `42`, `0.7`, `1_000_000`, `NaN` | counts, scores, prices (whole and decimal — one type) |
| `boolean` | `true`, `false` | flags: `stream`, `isDone` |
| `null` | `null` | "intentionally empty" |
| `undefined` | `undefined` | "not set yet" / missing |
| `bigint` | `9007199254740993n` | integers too large for `number` |

:::syntax
```ts
let name: string = "Ada";          // annotation:  name : type
let temperature: number = 0.7;
let stream: boolean = true;
```
:::

:::def Type annotation
A `: Type` you write after a variable, parameter or return value to say what type it must be. You **can** add them everywhere, but you rarely need to.
:::

## Inference: TypeScript figures it out

:::def Type inference
TypeScript working out a type **from the value** you assign, so you don't have to write it. `let count = 0` is automatically a `number`.
:::

```ts run level=easy
let prompt = "Summarise this document";
//  ^?
let maxTokens = 2048;
//  ^?
let isStreaming = false;
//  ^?
let scores = [0.91, 0.84, 0.77];
//  ^?

maxTokens = 4096;          // ✅ still a number
console.log({ prompt, maxTokens, isStreaming, scores });
```

```ts run level=easy type-error
let maxTokens = 2048;
maxTokens = "a lot";       // ❌ the type was decided when you first assigned it
```

:::tip When to write annotations
Let inference work for **variables**. Write types for **function parameters** (TypeScript can't guess them), for **values that start empty** (`let ids: string[] = []`), and when you want the type to be documentation for other people.
:::

## `const` vs `let`: literal types

```ts run level=easy
const role = "assistant";       // can never change → its type is the exact value
//    ^?
let mutableRole = "assistant";  // can change → widened to string
//  ^?

type Role = "user" | "assistant";   // a type that allows exactly these two strings
let next: Role = "user";
next = "assistant";                 // ✅
console.log(role, mutableRole, next);
```

:::def Literal type
A type that allows **one exact value**: `"user"`, `42`, `true`. Combined with `|` ("or"), literal types describe a fixed set of options — perfect for roles, model names, statuses.
:::

## Type aliases: giving a type a name

```ts run level=easy
type ModelName = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-4-5";
type Temperature = number;          // just a nickname, but it documents intent

let model: ModelName = "claude-sonnet-5-5";
console.log(`Using ${model}`);
```

:::syntax
```ts
type Name = <any type>;
```
Type names use **PascalCase** by convention: `ChatMessage`, `ModelName`.
:::

## The three special types: `any`, `unknown`, `never`

:::def any
"Turn off type checking for this value." Anything can be assigned to it and you can do anything with it — so mistakes slip through. Treat `any` as a last resort.
:::

:::def unknown
"I don't know the type yet." Anything can be assigned to it, but you **must check** what it is before using it. The safe choice for data from outside: `JSON.parse` results, API responses, model output.
:::

:::def never
"This can never happen." The type of a value that can't exist — a function that always throws, or a case your code has fully ruled out. It's how TypeScript proves you've handled every option.
:::

```ts run level=intermediate type-error expect-error
const fromApi: any = JSON.parse('{"text": "hi"}');
fromApi.toUpperCase();              // no error from TypeScript... but it crashes at runtime!

const safe: unknown = JSON.parse('{"text": "hi"}');
safe.text;                          // ❌ TypeScript: you must check it first

if (typeof safe === "object" && safe !== null && "text" in safe && typeof safe.text === "string") {
  console.log(safe.text.toUpperCase());   // ✅ checked, so TypeScript allows it
}
```

Look at both problems. With `unknown`, TypeScript stops you on line 5 **before** running — you're forced to check. With `any`, line 2 gets **no warning at all**, and the program crashes when it runs (`toUpperCase` doesn't exist on an object). Same mistake, but one is caught while you type and the other in production.

:::warn any is contagious
Values that come from `any` are also `any`, so one `any` can silently switch off checking across your codebase. Prefer `unknown` + a check (or a Zod schema, Module 4).
:::

## Checking types at runtime with `typeof`

Types disappear when the code runs, but JavaScript's `typeof` operator still works — and TypeScript understands it:

```ts run level=easy
function describe(value: unknown): string {
  if (typeof value === "string") return `text (${value.length} chars)`;     // value is string here
  if (typeof value === "number") return `number ${value.toFixed(2)}`;       // value is number here
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null) return "null";
  return typeof value;
}

for (const v of ["hello", 0.7, true, null, [1, 2], undefined]) console.log(describe(v));
```

:::ai
Everything that crosses a boundary into your program — a model's JSON, a tool call's arguments, a webhook body, a row from a vector database — should start life as `unknown`. Then you check it (by hand or with Zod) and get a precise type. Never type it as `any` "just to make the error go away".
:::

## Check yourself

```quiz
? What type does TypeScript infer for `let count = 5`?
+ number
- 5
- any
> let can be reassigned, so it's widened to number. const count = 5 would be the literal 5.

? Which type is the safest for the result of JSON.parse?
+ unknown — you must check it before using it
- any
- object
> unknown forces a check; any silently allows mistakes.

? Which of these is a literal type?
+ "assistant"
- string
- boolean
> A literal type allows exactly one value.
```

:::keypoints
- Everyday types: `string`, `number`, `boolean`, `null`, `undefined` (and `bigint`).
- TypeScript **infers** types from values; annotate parameters, empty starts and public APIs.
- `const` keeps **literal types**; unions of literals (`"user" | "assistant"`) describe fixed options.
- `type Name = ...` creates a **type alias**.
- Avoid `any`; use `unknown` for outside data and narrow it with checks. `never` means "impossible".
:::
