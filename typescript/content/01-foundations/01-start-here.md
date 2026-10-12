---
title: Start Here — What TypeScript Is
level: easy
time: 15
summary: What TypeScript is, why almost every serious AI app and SDK uses it, how types catch bugs before your code runs, and how to use the live editors on this site (type errors, // ^? type queries, and the Run button).
---

**TypeScript is JavaScript with types.** You write normal JavaScript, and add small notes saying what kind of value each thing is — a number, a string, a list of messages. A program called the **TypeScript compiler** reads those notes and warns you when the code doesn't match them, *before* the code ever runs.

:::def TypeScript
A programming language made by Microsoft that adds **static types** to JavaScript. TypeScript code is checked by the compiler, then the types are removed ("erased"), leaving plain JavaScript that runs in browsers, Node.js, Deno or Bun.
:::

:::def Type
A description of what values are allowed. `number` allows `42` and `3.14`; `string` allows `"hello"`; `{ role: "user" | "assistant"; text: string }` allows chat messages with exactly those fields.
:::

:::analogy
Think of types as **labels on boxes in a warehouse**. If a box is labelled "glass — this side up", the warehouse system refuses to let a forklift flip it. Nobody has to remember the rule: the label enforces it every time. TypeScript does the same for your data.
:::

## Your first type check

Read this code, then press **▶ Run**. Look at the red underline and the message under the editor.

```ts run level=easy type-error
function costInDollars(tokens: number, pricePerMillion: number) {
  return (tokens / 1_000_000) * pricePerMillion;
}

console.log(costInDollars(250_000, 3));      // ✅ 0.75

const tokensFromForm = "250000";              // text from an input box
console.log(costInDollars(tokensFromForm, 3)); // ❌ TypeScript: a string is not a number
```

The code still ran (JavaScript turned `"250000" / 1000000` into a number by accident), but TypeScript flagged the mistake **before** you shipped it. In a real project the build stops until you fix it — change line 8 to use `Number(tokensFromForm)` and the error disappears as you type.

:::tip How the editors on this site work
- **Red wavy underline** = a type error. Hover it, or read the list under the editor.
- **`// ^?`** on the line below some code shows the type TypeScript sees at the `^`. Try it below.
- **▶ Run** (or `Ctrl` + `Enter`) type-checks and runs the code. Output appears underneath.
- Everything runs **in your browser** with the real TypeScript compiler.
:::

## Seeing types with `// ^?`

You don't have to write types everywhere — TypeScript **infers** most of them. The `^?` comment lets you peek at what it figured out:

```ts run level=easy
const model = "claude-opus-5-5";
//    ^?
let maxTokens = 1024;
//  ^?
const message = { role: "user", content: "Hello!" };
//    ^?
const words = message.content.split(" ");
//    ^?

console.log(model, maxTokens, words);
```

Notice `const model` has the type `"claude-opus-5-5"` (that exact text — it can never change), while `let maxTokens` is `number` (it can change to another number). Move a `^` under a different word and the type updates.

## Why AI engineers use TypeScript

| Problem in AI apps | How TypeScript helps |
|---|---|
| Model responses are big nested JSON objects | Types describe every field, and your editor autocompletes them |
| A message can be text, an image, a tool call… | **Union types** force you to handle each kind |
| You rename a field and miss one place | The compiler finds every place that breaks |
| An SDK upgrade changes a function | Type errors show exactly what to update |
| The model returns JSON that doesn't match | Schemas (Zod) check it at runtime **and** give you the type |

The official SDKs — Claude's `@anthropic-ai/sdk`, the MCP SDK, Vercel's AI SDK — are written in TypeScript. Their types are the best documentation you'll get.

## How TypeScript runs in real life

TypeScript never runs directly — the types are **erased** first:

```ts
// what you write
function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

```js
// what actually runs (types removed)
function greet(name) {
  return `Hello, ${name}!`;
}
```

:::def Type erasure
Removing all type annotations to produce plain JavaScript. Types exist **only while checking**; at runtime they are gone. That's why you can't ask "is this value a `Message`?" at runtime without writing a check yourself (or using a schema library — Module 4).
:::

| Tool | What it does |
|---|---|
| `tsc` (TypeScript 7) | the official compiler — checks types (about 10× faster since the native 7.0 rewrite) |
| `node app.ts` | Node.js can run `.ts` files directly by stripping types (no checking!) |
| Vite, Next.js, Bun, Deno | build tools and runtimes that understand TypeScript out of the box |
| your editor (VS Code…) | runs the type checker live as you type |

:::note About the version here
Real projects use **TypeScript 7** — the new native compiler. TypeScript 7 doesn't run inside a web page, so these editors use **TypeScript 6.0**, the JavaScript build of the same type system with the same rules and defaults (`strict` mode on). Code that type-checks here type-checks in TypeScript 7.
:::

:::ai
In AI work you constantly pass data between systems: your UI, your server, the model, tools, vector databases. Every hand-off is a chance for a shape mismatch — `content` vs `contents`, a missing `id`, a number sent as a string. TypeScript turns those into red underlines while you type, instead of failures in production at 2 a.m.
:::

## Check yourself

```quiz
? What happens to TypeScript types when your code runs?
+ They are erased — the running code is plain JavaScript
- They are checked again at runtime
- They are sent to the server
> Types only exist during checking. Use runtime validation (like Zod) for data from outside.

? What does `// ^?` do in the editors on this site?
+ Shows the type TypeScript sees at the position of the caret
- Runs the line above
- Marks the line as an error
> It's a "type query" — a quick way to learn what TypeScript inferred.

? `const model = "claude-opus-5-5"` — what is its type?
+ The exact string type "claude-opus-5-5"
- string
- any
> A const can never change, so TypeScript keeps the exact value as its type.
```

:::keypoints
- TypeScript = JavaScript + **types**; the compiler checks them, then erases them.
- Type errors show up **before** your code runs — in your editor and in your build.
- TypeScript **infers** most types; use `// ^?` here to see them.
- Real projects use **TypeScript 7** (`tsc`); this site runs the same type system in your browser.
:::
