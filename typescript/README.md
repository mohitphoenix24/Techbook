# TypeLab — TypeScript for AI Engineers

An interactive course that teaches TypeScript from zero to advanced types, then uses it to build AI applications: the Claude SDK, streaming, tools and agents, structured output, RAG, MCP and production patterns. Every lesson explains ideas in plain English with definitions and syntax boxes. The code examples run in the browser and are **type-checked by the real TypeScript compiler**.

## Open it

Open the site from the repo root (`../index.html`) and pick this course, or open this folder's `index.html` directly. No server or install is needed.

The TypeScript compiler and type definitions are bundled in `assets/vendor/ts/`, so type checking and running plain TypeScript work **offline**. Examples that import npm packages (`zod`, `hono`) load them from [esm.sh](https://esm.sh) the first time, so those need an internet connection.

If your browser blocks local files, serve the folder instead:

```bash
python3 -m http.server 8000      # from the repo root, then open http://localhost:8000
```

## How the editors work

- **Red wavy underlines** show type errors, with a list under the editor. They update as you type.
- **`// ^?`** on the line under some code shows the type TypeScript sees at the `^`.
- **▶ Run** (or `Ctrl` + `Enter`) type-checks the code, then runs it in a sandbox with a Node-style console (objects, Maps, tables, errors).

The editors use **TypeScript 6.0.3**, the JavaScript build of the TypeScript 7 type system, because TypeScript 7's native compiler can't run inside a web page. The type rules and defaults (`strict` on) are the same. Types for `zod` 4.6, `hono` 4.13 and `ts-pattern` 5.9 are bundled, so imports from them are fully checked.

## What's inside

| Module | Lessons |
|---|---|
| 1. TypeScript Foundations | what TypeScript is, basic types & inference, functions, objects & interfaces, arrays/tuples/Map/Set, unions & narrowing, null safety, classes |
| 2. Intermediate TypeScript | generics, utility types, keyof/typeof/indexed access, type guards & `satisfies`, async code & streams, errors & Result types, modules & enums |
| 3. Advanced Types | conditional types & `infer`, mapped types, template literal types, branded types, advanced generics (const, NoInfer, builders, emitters), declaration files |
| 4. Runtime Safety & Tooling | Zod validation, project setup & tsconfig for TypeScript 7 + Node.js, testing with Vitest, typed HTTP clients & Hono APIs (running live) |
| 5. TypeScript for AI Engineering | Claude SDK, streaming, tool use & agents, structured output, embeddings & RAG, MCP servers & clients, production patterns |
| Project Lab (10 projects) | BPE tokenizer · type-safe prompt engine · vector search engine · docs Q&A with RAG + evals · agent framework · LLM output parser · resilient LLM client · eval harness · streaming chat API server · typed MCP server & client |

Other features: Ctrl+K search, a glossary of every definition, progress tracking, quizzes, exercises, light/dark themes, and a mobile layout.

Examples marked **Run locally** need Node.js on your computer (npm packages, files, or an `ANTHROPIC_API_KEY`). They use the official SDKs: `@anthropic-ai/sdk` with `claude-opus-5-5`, and the MCP TypeScript SDK v2. All of them were type-checked against the real packages. AI examples that run in the browser use scripted or fake models, so they cost nothing.

## Editing content

Lessons are Markdown files in `content/`. After editing, rebuild the bundle:

```bash
python3 build.py            # regenerates assets/js/content.js
python3 build.py --watch    # rebuild automatically on save
```

Extra Markdown syntax used in lessons:

| Syntax | Renders as |
|---|---|
| ```` ```ts run ```` | an editable, type-checked, runnable example (add `level=easy`, `title="..."`) |
| ```` ```ts run type-error ```` | an example that is **meant** to show a type error |
| ```` ```ts run expect-error ```` | an example that is meant to fail at runtime |
| ```` ```ts ```` (no `run`) | a read-only sample. Add `nocheck` for fragments that aren't complete programs |
| ```` ```quiz ```` | a quiz: `? question`, `- wrong`, `+ right`, `> explanation` |
| `:::def Term` … `:::` | a definition card (also added to the Glossary) |
| `:::syntax`, `:::tip`, `:::warn`, `:::note`, `:::ai`, `:::analogy`, `:::keypoints` | callout boxes |
| `:::exercise` / `:::solution` | a practice task with a collapsible solution |
| `:::flow Title` | a step diagram (one step per line, `Title \| detail`) |

To support another npm package in the editors, add it to `IMPORTS` in `assets/js/runner-ts.js`. To have its imports type-checked, also add its `.d.ts` files to `assets/vendor/ts/ts-types.js`.

## Folder layout

This course is one part of the combined site (see `../README.md`). The design system (`style.css`), the engine (`app.js`), CodeMirror, marked and KaTeX are shared from `../shared/`; the course catalogue is `../courses.js`.

```text
index.html                    the site shell + config
build.py                      bundles content/ → assets/js/content.js
content/                      all lessons and projects (Markdown)
assets/js/runner-ts.js        type checker (language service), ^? queries, sandboxed runner, console
assets/vendor/ts/             TypeScript 6.0.3 compiler + lib/zod/hono/ts-pattern type definitions
```
