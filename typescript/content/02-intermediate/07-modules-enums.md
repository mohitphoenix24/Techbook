---
title: Modules, Imports & Enums
level: intermediate
time: 25
summary: Organise code across files — ES module imports and exports, type-only imports, where types live in a project, ESM vs CommonJS — and why most modern TypeScript code uses const objects and union types instead of enums.
---

Real projects split code into many files: one for API types, one for the model client, one per tool. TypeScript uses standard **ES modules** (`import` / `export`) and adds a few type-specific features.

:::def Module
A file with at least one `import` or `export`. Everything inside is private unless exported. Other files bring exported things in with `import`.
:::

## Exporting and importing

```ts nocheck
// src/types.ts
export type Role = "user" | "assistant";
export interface Message { role: Role; content: string }
export const DEFAULT_MODEL = "claude-opus-5-5";

// src/format.ts
import { DEFAULT_MODEL, type Message } from "./types.ts";    // named imports (+ a type-only one)

export function formatMessage(m: Message): string {
  return `[${m.role}] ${m.content}`;
}

export default function banner() {                              // a default export (use sparingly)
  return `Using ${DEFAULT_MODEL}`;
}

// src/main.ts
import banner, { formatMessage } from "./format.ts";
import * as types from "./types.ts";                           // namespace import
console.log(banner(), formatMessage({ role: "user", content: "hi" }), types.DEFAULT_MODEL);
```

:::tip Named exports over default exports
Named exports (`export function x`) keep the same name everywhere, work better with auto-imports and renames, and make "find usages" reliable. Most style guides prefer them.
:::

## Type-only imports

```ts nocheck
import type { Message, Role } from "./types.ts";       // the whole import is types
import { DEFAULT_MODEL, type Message } from "./types.ts";  // mixed: inline `type` marker
export type { Message } from "./types.ts";             // re-export a type
```

:::def import type
An import that only brings in **types**. It's completely removed from the JavaScript output, so it can never cause a runtime import (or a circular-import problem). Tools that strip types without full type checking (Node, esbuild, SWC) rely on these markers.
:::

The `verbatimModuleSyntax` setting makes this a rule: any import used only as a type **must** say `type`. It's recommended for new projects.

## File extensions in imports

Modern Node.js ESM and TypeScript's `nodenext`/`bundler` modes use real file paths:

```ts nocheck
import { formatMessage } from "./format.ts";   // with allowImportingTsExtensions / Node type stripping
import { formatMessage } from "./format.js";   // classic tsc output style: refers to the compiled file
```

Which one you write depends on how the code runs — the project setup lesson (Module 4) covers the two common setups.

## ESM vs CommonJS

| | ES modules (ESM) | CommonJS (CJS) |
|---|---|---|
| syntax | `import` / `export` | `require()` / `module.exports` |
| status | the standard; used by browsers, Deno, Bun, modern Node | older Node.js style, still in many packages |
| top-level `await` | ✅ | ❌ |
| how to enable in Node | `"type": "module"` in package.json, or `.mts` files | default for `.js`/`.cts` |

New TypeScript projects should be **ESM**. TypeScript 6+ defaults `module` to `esnext`.

## Enums — and the modern alternative

TypeScript has an `enum` keyword:

```ts run level=intermediate
enum StopReason {
  EndTurn = "end_turn",
  MaxTokens = "max_tokens",
  ToolUse = "tool_use",
}

function describe(r: StopReason) {
  return r === StopReason.ToolUse ? "run the tool" : "show the answer";
}
console.log(describe(StopReason.ToolUse), Object.values(StopReason));
```

It works, but enums have drawbacks: they generate JavaScript code (they're not "erasable"), so Node's built-in type stripping and the `erasableSyntaxOnly` setting reject them; **numeric** enums accept any number; and API data arrives as plain strings that don't fit the enum type without a cast.

### The alternative: a const object + a union type

```ts run level=intermediate
const StopReason = {
  EndTurn: "end_turn",
  MaxTokens: "max_tokens",
  ToolUse: "tool_use",
} as const;

type StopReason = (typeof StopReason)[keyof typeof StopReason];
//   ^?

function describe(r: StopReason) {
  return r === StopReason.ToolUse ? "run the tool" : "show the answer";
}

console.log(describe(StopReason.ToolUse));     // use the named constant…
console.log(describe("end_turn"));             // …or the plain string from an API response — both fine
console.log(Object.values(StopReason));        // still iterable at runtime
```

Even simpler, when you don't need named constants — just a union of string literals:

```ts run level=intermediate type-error
type Role = "user" | "assistant";
const r: Role = "assistant";       // autocomplete still suggests the options
const bad: Role = "admin";         // ❌ caught
```

:::tip Rule of thumb
Use **string literal unions** for most cases (roles, statuses, stop reasons). Add an `as const` object when you also want named constants or a runtime list of values. Avoid `enum` in new code, and especially numeric enums.
:::

:::def Namespace
An old TypeScript way to group code (`namespace Foo { ... }`), from before ES modules existed. Modern code uses modules instead; you'll mainly see namespaces in older type definition files.
:::

:::ai
SDKs export both runtime values and types from one package: `import Anthropic from "@anthropic-ai/sdk"` gives you the client class **and** a namespace of types like `Anthropic.MessageParam` and `Anthropic.Tool`. Use `import type` for anything you only use in annotations — your bundles stay smaller and tools stay fast.
:::

## Check yourself

```quiz
? What does `import type { Message } from "./types"` produce in the JavaScript output?
+ Nothing — type-only imports are removed entirely
- A normal import
- A runtime check
> Type-only imports never execute.

? Why might a project avoid `enum`?
+ Enums generate code (not erasable) and don't accept plain strings from APIs without casts
- Enums are slower at runtime
- Enums can't be exported
> Const objects + unions give the same benefits without the downsides.

? How do you get a union type from `const S = { A: "a", B: "b" } as const`?
+ (typeof S)[keyof typeof S]
- keyof S
- typeof S
> keyof gives the keys ("A" | "B"); indexed access gives the values.
```

:::keypoints
- Use ES modules: named `export`s and `import`s; prefer named over default exports.
- `import type` / inline `type` markers for type-only imports (enforced by `verbatimModuleSyntax`).
- New projects are ESM (`"type": "module"`).
- Prefer string literal unions or `as const` objects over `enum`s.
:::
