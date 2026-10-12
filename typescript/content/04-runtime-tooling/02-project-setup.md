---
title: Project Setup, tsconfig & TypeScript 7
level: intermediate
time: 35
summary: From an empty folder to a working TypeScript project — installing TypeScript 7, a modern tsconfig explained line by line, running .ts files directly with Node.js, the strict flags worth turning on, project layout, scripts, and how bundlers and frameworks fit in.
---

The editors on this site hide the setup. On your computer you need a project folder, a `tsconfig.json`, and a way to run code. This lesson is your checklist — with a configuration you can copy.

## 1. Create the project

```bash
mkdir ai-app && cd ai-app
npm init -y
npm pkg set type=module                    # use ES modules
npm install -D typescript @types/node      # TypeScript 7 + Node.js types
npx tsc --init                             # creates a tsconfig.json
```

:::def TypeScript 7
The current major version (released July 2026): the same language and type system as 6.0, but the compiler was rewritten in Go. Full builds are typically **8–12× faster**, and editors respond faster too. You install it as usual: `npm install -D typescript`, and run `npx tsc`.
:::

## 2. A modern tsconfig.json for Node.js apps

```json
{
  "compilerOptions": {
    "target": "es2025",
    "module": "nodenext",
    "types": ["node"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,

    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "rewriteRelativeImportExtensions": true,

    "rootDir": "src",
    "outDir": "dist",
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

| Option | What it does | Why |
|---|---|---|
| `target` | which JavaScript features the output uses | `es2025` for current Node/browsers |
| `module: "nodenext"` | follow Node.js's real ESM/CJS rules | correct imports and package exports |
| `types: ["node"]` | load `@types/node` | TS 6+ loads no `@types` automatically |
| `strict` | all the core safety checks (default `true` since TS 6) | null safety, no implicit `any`… |
| `noUncheckedIndexedAccess` | `arr[i]` and `obj[key]` include `undefined` | catches empty arrays/missing keys |
| `exactOptionalPropertyTypes` | `x?: string` can't be set to `undefined` explicitly | more precise optional fields (stricter — optional) |
| `noImplicitOverride` | subclasses must write `override` | safer refactors of class hierarchies |
| `verbatimModuleSyntax` | type-only imports must say `type` | imports behave exactly as written |
| `erasableSyntaxOnly` | forbid enums, namespaces, parameter properties | code runs with plain type stripping (Node) |
| `rewriteRelativeImportExtensions` | `./x.ts` imports become `./x.js` in output | write `.ts` imports, still compile with `tsc` |
| `rootDir` / `outDir` | where sources are / where JS goes | `src/` → `dist/` |
| `skipLibCheck` | don't type-check `.d.ts` files of dependencies | faster builds, fewer third-party errors |

:::note Defaults changed in TypeScript 6 / 7
`strict` is now **on** by default, `module` defaults to `esnext`, `target` to the current ECMAScript year, `types` to `[]`, and `rootDir` to the tsconfig's folder. Old options like `target: "es5"`, `moduleResolution: "node"` (node10), `baseUrl`, `outFile` and AMD/UMD modules were removed. If you upgrade an older project, run TypeScript 6 first — it warns about everything TypeScript 7 removes.
:::

## 3. Write some code

```ts
// src/config.ts
export const config = {
  model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  maxTokens: Number(process.env.MAX_TOKENS ?? "4096"),
} as const;
```

```ts nocheck
// src/main.ts
import { config } from "./config.ts";
import { readFile } from "node:fs/promises";

const prompt = await readFile(new URL("../prompts/summary.md", import.meta.url), "utf8");
console.log(`Using ${config.model} with a ${prompt.length}-character prompt`);
```

## 4. Run it

There are three common ways:

```bash
# A) Node.js runs .ts directly by stripping the types (Node 22.18+ / 23.6+ / 24+)
node src/main.ts

# B) Type-check, then run — the standard "check + run" pair
npx tsc --noEmit && node src/main.ts

# C) Compile to JavaScript (for publishing or older runtimes), then run the output
npx tsc && node dist/main.js
```

:::def Type stripping
Running TypeScript by **deleting** the type annotations (replacing them with spaces) instead of compiling. It's very fast, and that's how Node.js runs `.ts` files natively — but it **doesn't check types**. Always run `tsc --noEmit` (in your editor, a pre-commit hook or CI) as well.
:::

:::warn Type stripping needs erasable syntax
Node's built-in support can't handle `enum`, `namespace` or constructor parameter properties, because those generate code. `erasableSyntaxOnly: true` makes `tsc` report them, so you find out in your editor instead of when Node crashes.
:::

## 5. Useful package.json scripts

```json
{
  "type": "module",
  "scripts": {
    "dev": "node --watch src/main.ts",
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "start": "node dist/main.js",
    "test": "vitest"
  }
}
```

TypeScript 7's watch mode (`tsc --watch`) and its faster type checker make `npm run typecheck` cheap enough to run constantly. For big monorepos, `--checkers <n>` controls how many parallel type-checking workers it uses.

## A clean project layout

```text
ai-app/
├── package.json
├── tsconfig.json
├── .env                    ← secrets (never commit) — ANTHROPIC_API_KEY=...
├── prompts/                ← prompt templates as files
└── src/
    ├── main.ts             ← entry point
    ├── config.ts           ← env validation (Zod) → typed config
    ├── llm/
    │   ├── client.ts       ← one place that creates the Claude client
    │   └── schemas.ts      ← Zod schemas for structured output
    ├── tools/              ← one file per tool (schema + implementation)
    ├── rag/                ← chunking, embeddings, retrieval
    └── *.test.ts           ← tests next to the code they test
```

## Bundlers, frameworks and other runtimes

| You're building | Typical setup | TypeScript role |
|---|---|---|
| Node.js API / CLI / agent | Node + `tsc --noEmit` (+ `tsx` for older Node) | type checking; Node runs `.ts` |
| web front end | Vite (`npm create vite@latest -- --template react-ts`) | Vite strips types (esbuild); `tsc --noEmit` checks |
| full-stack web app | Next.js, React Router, SvelteKit… | framework compiles; `tsc` checks |
| Bun / Deno apps | run `.ts` natively | still use `tsc` or the runtime's checker |
| npm library | `tsc` with `declaration: true` | emits `.js` + `.d.ts` |

:::tip The two jobs of TypeScript
Every setup splits TypeScript into **(1) removing types** so code can run (Node, Vite, esbuild, Bun — very fast) and **(2) checking types** (`tsc` — thorough). Make sure your project does both: the runtime does (1), your editor + CI do (2).
:::

:::ai
For AI services, a common production stack is: Node.js 24 running `.ts` directly (or a compiled `dist/`), `tsc --noEmit` and Vitest in CI, Zod-validated config, the `@anthropic-ai/sdk` client in one module, and strict flags (`noUncheckedIndexedAccess` especially) because model responses and retrieved documents are often missing pieces you assumed were there.
:::

## Check yourself

```quiz
? What does `node src/main.ts` do with type errors?
+ Nothing — it only strips types; you need tsc to check them
- Refuses to run
- Prints warnings
> Type stripping removes types without checking them.

? Why turn on erasableSyntaxOnly?
+ So tsc reports enums/namespaces/parameter properties that Node's type stripping can't run
- To make builds faster
- To remove all types
> It keeps your code runnable by any type-stripping tool.

? Since TypeScript 6, why must you add "types": ["node"]?
+ The types option defaults to [], so @types packages aren't loaded automatically
- Node types are deprecated
- It enables strict mode
> List the global type packages you need.
```

:::keypoints
- Install with `npm i -D typescript @types/node`; TypeScript 7 is the fast native compiler (`npx tsc`).
- Start from a modern tsconfig: `module: nodenext`, `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `types: ["node"]`.
- Node.js 22.18+/24+ runs `.ts` by **stripping** types — pair it with `tsc --noEmit` for checking.
- Bundlers and frameworks remove types; `tsc` (editor + CI) checks them.
:::
