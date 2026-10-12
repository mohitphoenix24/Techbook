---
title: Declaration Files & Library Types
level: advanced
time: 30
summary: Where types come from — .d.ts declaration files, @types packages, declare for globals and untyped modules, module augmentation to extend a library's types, typing environment variables, and how to read the type definitions of SDKs like Claude's.
---

When you `import Anthropic from "@anthropic-ai/sdk"`, how does your editor know every method and type? The package ships **declaration files** — `.d.ts` files containing only types. Understanding them helps you read any library, add types to untyped code, and extend library types safely.

:::def Declaration file (.d.ts)
A file that contains **only type information** — no runtime code. Libraries publish `.d.ts` files next to their JavaScript so TypeScript users get types. TypeScript can also generate them from your `.ts` files (`declaration: true`).
:::

## What's inside a .d.ts

```ts nocheck
// a simplified slice of what an SDK's .d.ts looks like
export interface TextBlock { type: "text"; text: string }
export interface ToolUseBlock { type: "tool_use"; id: string; name: string; input: unknown }
export type ContentBlock = TextBlock | ToolUseBlock;

export interface Message {
  id: string;
  model: string;
  content: ContentBlock[];
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "pause_turn" | "refusal" | null;
  usage: { input_tokens: number; output_tokens: number };
}

export declare class Messages {
  create(params: MessageCreateParams): Promise<Message>;
}
```

Notice: `interface`, `type`, and `declare class` with method **signatures** but no bodies. The implementation lives in the `.js` file.

:::tip Reading library types
In VS Code, **Ctrl/Cmd + click** a function or type to jump to its declaration. For SDKs, the `.d.ts` files are often the most precise, up-to-date documentation: every option, every union member, every optional field.
:::

## Where types come from

| Situation | Where the types are |
|---|---|
| modern packages (`@anthropic-ai/sdk`, `zod`, `@modelcontextprotocol/server`) | bundled in the package (`"types"` in its package.json) |
| older JavaScript packages | community types: `npm i -D @types/package-name` |
| Node.js built-ins (`fs`, `process`, `Buffer`) | `npm i -D @types/node` + `"types": ["node"]` |
| browser APIs (`fetch`, `document`) | TypeScript's built-in `lib` files (`"lib": ["es2025", "dom"]`) |
| your own code | inferred from `.ts` files automatically |

:::note TypeScript 6+ and @types
Since TypeScript 6.0, the `types` option defaults to `[]` — installed `@types/*` packages are **not** loaded automatically anymore. List what you need: `"types": ["node"]`. (This is why the MCP SDK's README tells you to add it.)
:::

## `declare`: describing things that exist elsewhere

```ts run level=advanced
// A value provided by the environment (e.g. injected by a bundler or a <script> tag)
declare const __APP_VERSION__: string;
declare function trackEvent(name: string, data?: Record<string, unknown>): void;

// Here we also have to provide them at runtime, because this page doesn't inject them:
(globalThis as any).__APP_VERSION__ = "1.4.2";
(globalThis as any).trackEvent = (name: string) => console.log("tracked:", name);

console.log("version", __APP_VERSION__);
trackEvent("prompt_submitted", { tokens: 120 });
```

:::def declare
`declare` says "this exists at runtime — trust me, here is its type". It produces **no** JavaScript. Used in `.d.ts` files and for globals provided by the environment.
:::

## Typing an untyped module

If a package has no types, TypeScript reports *"Could not find a declaration file for module"*. You can describe just the parts you use:

```ts nocheck
// src/types/tiny-tokenizer.d.ts
declare module "tiny-tokenizer" {
  export interface Encoding { ids: number[]; tokens: string[] }
  export function encode(text: string, model?: string): Encoding;
  export function decode(ids: number[]): string;
}

// anywhere else
import { encode } from "tiny-tokenizer";
const { ids } = encode("Hello world");     // fully typed now
```

## Module augmentation: extending a library's types

Interfaces **merge**, so you can add fields to a library's interface from your own code:

```ts run level=advanced
// Imagine this interface comes from a logging library:
interface LogContext { requestId: string }

// Your app adds its own fields by declaring the same interface again (declaration merging)
interface LogContext { model?: string; promptTokens?: number }

function log(message: string, ctx: LogContext) {
  console.log(`[${ctx.requestId}] ${message}`, ctx.model ? `(${ctx.model}, ${ctx.promptTokens} tok)` : "");
}
log("model call finished", { requestId: "req_9f2", model: "claude-opus-5-5", promptTokens: 812 });
```

For a real package you wrap it in `declare module`:

```ts nocheck
// src/types/express.d.ts — add `user` to every Express request
import "express";
declare module "express-serve-static-core" {
  interface Request {
    user?: { id: string; plan: "free" | "pro" };
  }
}
```

## Typing environment variables

`process.env.ANTHROPIC_API_KEY` is `string | undefined` — correct, because it might be missing. Rather than augmenting the global type and pretending it's always set, **validate once at startup** and export a typed config:

```ts
// src/config.ts
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const config = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  maxConcurrency: Number(process.env.MAX_CONCURRENCY ?? "4"),
} as const;
```

The app fails fast with a clear message if the key is missing, and everywhere else uses `config.anthropicApiKey` as a plain `string`. (Module 4 does the same with a Zod schema.)

## Generating .d.ts for your own library

```json
// tsconfig.json for a package you publish
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist"
  }
}
```

TypeScript then emits `dist/index.js` **and** `dist/index.d.ts`, and your package.json points to them with `"types": "./dist/index.d.ts"` (or an `exports` map with a `types` condition).

:::ai
When an AI SDK adds a feature (a new content block type, a new stop reason, a new tool type), the change shows up first in its `.d.ts` files. After upgrading, run `tsc` — type errors point to every `switch` that doesn't handle the new member. Reading declarations is how you stay current with fast-moving AI APIs.
:::

## Check yourself

```quiz
? What does a .d.ts file contain?
+ Only type information — no runtime code
- Compiled JavaScript
- Tests for the types
> Declarations describe code that lives elsewhere.

? In TypeScript 6+, why might `process` be unknown even after installing @types/node?
+ The types option defaults to [], so add "types": ["node"]
- @types/node no longer exists
- Node doesn't support TypeScript
> Type packages are no longer auto-included.

? How do you add fields to an interface from a library?
+ Declare the same interface again (inside declare module) — interfaces merge
- Edit the file in node_modules
- Use a type alias with the same name
> Declaration merging only works for interfaces.
```

:::keypoints
- `.d.ts` files hold types only; packages bundle them or get them from `@types/*`.
- TypeScript 6+ needs `"types": ["node"]` (and others) listed explicitly.
- `declare` describes values/modules that exist at runtime; `declare module "x"` types untyped packages.
- Interfaces merge, enabling **module augmentation** of library types.
- Validate environment variables once at startup and export a typed config.
:::
