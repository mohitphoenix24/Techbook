---
title: Functions
level: easy
time: 25
summary: Typing functions — parameters, return types, optional and default parameters, rest parameters, arrow functions, function types for callbacks, void, and overloads — with examples from token counting, retries and prompt building.
---

Functions are where types pay off most. Parameters are the "contract" of a function: what it needs. Typing them means every caller is checked.

## Parameters and return types

:::syntax
```ts
function name(param: Type, other: Type): ReturnType {
  // ...
}
```
:::

```ts run level=easy
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);      // rough rule: ~4 characters per token
}

function formatCost(tokens: number, pricePerMillion: number): string {
  return "$" + ((tokens / 1_000_000) * pricePerMillion).toFixed(4);
}

const prompt = "Explain retrieval-augmented generation in two sentences.";
const tokens = estimateTokens(prompt);
console.log(tokens, "tokens ≈", formatCost(tokens, 5));
```

The return type is usually **inferred** too — hover-check it with `^?`. Writing it explicitly is good practice for exported functions: if you accidentally return the wrong thing, the error appears **inside** the function instead of somewhere far away.

```ts run level=easy type-error
function average(scores: number[]): number {
  if (scores.length === 0) return "n/a";     // ❌ promised a number
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
console.log(average([0.8, 0.9]));
```

## Optional and default parameters

```ts run level=easy
function buildPrompt(question: string, context?: string, style = "concise"): string {
  //                                    ^?
  const parts = [`Answer in a ${style} way.`];
  if (context) parts.push(`Context:\n${context}`);   // context is string | undefined — check before use
  parts.push(`Question: ${question}`);
  return parts.join("\n\n");
}

console.log(buildPrompt("What is an embedding?"));
console.log("---");
console.log(buildPrompt("What is our refund window?", "Refunds within 30 days.", "friendly"));
```

:::def Optional parameter
A parameter marked with `?` that callers may leave out. Inside the function its type includes `undefined`, so TypeScript makes you handle the "not given" case.
:::

:::def Default parameter
A parameter with `= value`. If the caller leaves it out, the default is used. Its type is inferred from the default (`style = "concise"` → `string`).
:::

## Arrow functions and function types

```ts run level=easy
const double = (n: number): number => n * 2;

// A function TYPE describes the shape of a function: (params) => return
type Scorer = (query: string, doc: string) => number;

const overlapScore: Scorer = (query, doc) => {      // parameters are typed from Scorer
  const q = new Set(query.toLowerCase().split(" "));
  return doc.toLowerCase().split(" ").filter((w) => q.has(w)).length;
};

function rank(query: string, docs: string[], score: Scorer): string[] {
  return [...docs].sort((a, b) => score(query, b) - score(query, a));
}

console.log(double(21));
console.log(rank("refund policy", ["Our pricing plans", "The refund policy is 30 days", "Refund requests"], overlapScore));
```

:::def Function type
A type that describes a function: `(query: string, doc: string) => number`. Use it for callbacks, so any function you pass in is checked to have the right parameters and return type.
:::

## Callbacks and `void`

```ts run level=intermediate
type OnToken = (token: string) => void;     // void = "the return value is ignored"

function fakeStream(text: string, onToken: OnToken): void {
  for (const word of text.split(" ")) onToken(word + " ");
}

let collected = "";
fakeStream("streaming one word at a time", (t) => { collected += t; });
fakeStream("hello there", (t) => console.log("token:", JSON.stringify(t)));
console.log("collected:", collected);
```

:::def void
The return type of a function whose result doesn't matter (it returns nothing useful). A callback typed `() => void` may still return something — the caller simply ignores it.
:::

## Rest parameters

```ts run level=easy
function joinLines(separator: string, ...lines: string[]): string {
  return lines.join(separator);
}
console.log(joinLines("\n", "System: be brief", "User: hi", "Assistant: hello!"));
```

## Async functions return `Promise<T>`

A quick preview of Module 2: an `async` function always returns a **Promise** of its result.

```ts run level=easy
async function fetchModelList(): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 100));       // pretend network delay
  return ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"];
}

const models = await fetchModelList();
//    ^?
console.log(models);
```

## Overloads (when the return type depends on the input)

```ts run level=advanced
function parseTokens(input: string): number;
function parseTokens(input: string[]): number[];
function parseTokens(input: string | string[]): number | number[] {
  return Array.isArray(input) ? input.map((s) => Number(s)) : Number(input);
}

const one = parseTokens("128");
//    ^?
const many = parseTokens(["1", "2", "3"]);
//    ^?
console.log(one, many);
```

:::tip Prefer unions or generics
Overloads are useful but verbose. Often a union parameter or a **generic** (Module 2) is simpler. Use overloads when different inputs really produce different output types.
:::

:::ai
Typed function signatures become **tool definitions** for AI agents: a tool is just a function with typed inputs and a typed result. In Module 5 you'll describe a tool's parameters once (with Zod) and get both the JSON Schema the model needs and the TypeScript type your function receives.
:::

## Check yourself

```quiz
? Inside `function f(x?: string)`, what is the type of x?
+ string | undefined
- string
- any
> Optional parameters may be left out, so undefined is possible.

? How do you type a callback that receives a token and returns nothing useful?
+ (token: string) => void
- function(token): void
- Callback<string>
> Function types use arrow syntax.

? Why write an explicit return type on exported functions?
+ Mistakes are reported inside the function, and the type documents the contract
- It makes the code run faster
- TypeScript can't infer return types
> Inference works, but explicit return types catch errors closer to the cause.
```

:::keypoints
- Always type **parameters**; return types are inferred but worth writing for public functions.
- `param?: T` is optional (type includes `undefined`); `param = value` has a default.
- Function types `(a: A) => R` describe callbacks; `void` means "result ignored".
- `...rest: T[]` collects extra arguments; `async` functions return `Promise<T>`.
- Overloads give different return types for different inputs — use sparingly.
:::
