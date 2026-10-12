# ReactLab — Modern React for Generative AI

A complete, interactive course in modern React (19.3), from your first component to production AI interfaces. Every lesson explains ideas in plain English, gives clear definitions and syntax, and has **live editors**: change the code and the preview updates instantly, with a console underneath.

## Open it

Open the site from the repo root (`../index.html`) and pick this course, or open this folder's `index.html` directly. No server or install is needed.

The live editors load React and the other libraries from a CDN ([esm.sh](https://esm.sh)) the first time you run one, so you need an internet connection to run code. Reading works offline.

If your browser blocks local files, serve the folder instead:

```bash
python3 -m http.server 8000      # from the repo root, then open http://localhost:8000
```

## What's inside

| Module | Lessons |
|---|---|
| 1. React Foundations | start here, JavaScript for React, JSX, components & props, state & events, conditionals & lists, forms, styling |
| 2. Hooks in Depth | useEffect, useRef, useReducer, context, custom hooks, performance & the React Compiler |
| 3. React 19 & Modern React | Actions & useActionState, useOptimistic, Suspense & use(), transitions, error boundaries, `<Activity>` & useEffectEvent, `<ViewTransition>` & Fragment refs, Server Components, metadata & other upgrades |
| 4. The Ecosystem | TypeScript, Zustand, TanStack Query, React Router, testing (Vitest + RTL, Playwright), tooling & deployment, accessibility |
| 5. React for AI Interfaces | calling AI APIs safely, streaming chat (SSE), rendering model output safely, structured output & schema forms, tool calls / agents / generative UI, AI UX patterns |
| Project Lab (10 projects) | task manager · streaming AI chat app · Markdown notes · Kanban board · LLM usage dashboard · prompt playground · RAG search UI · assistant builder wizard · infinite AI image gallery · agent trace viewer |

Features: Ctrl+K search, a glossary of every definition, progress tracking, quizzes, exercises, light/dark themes (synced into the previews), and a mobile layout.

The live editors include React 19.3, React DOM, Zustand, TanStack Query, Zod, React Router, Immer and clsx. They accept JSX and TypeScript (`tsx` blocks: types are stripped, not checked). AI examples use a fake model in the browser, so nothing costs money. Each lesson also shows the real backend code: the official Anthropic SDK with `claude-opus-5-5`, and the API key kept on the server.

## Editing content

Lessons are Markdown files in `content/`. After editing, rebuild the bundle:

```bash
python3 build.py            # regenerates assets/js/content.js
python3 build.py --watch    # rebuild automatically on save
```

Extra Markdown syntax used in lessons:

| Syntax | Renders as |
|---|---|
| ```` ```jsx run ```` / ```` ```tsx run ```` | a live editor with a preview. The component named `App`, or the default export, is mounted automatically |
| ```` ```js run ```` | runnable JavaScript with console output only (top-level `await` works) |
| ```` ```jsx ```` (no `run`) | a read-only code sample (backend code, framework files, config) |
| ```` ```quiz ```` | a quiz: `? question`, `- wrong`, `+ right`, `> explanation` |
| `:::def Term` … `:::` | a definition card (also added to the Glossary) |
| `:::syntax`, `:::tip`, `:::warn`, `:::note`, `:::ai`, `:::analogy`, `:::keypoints` | callout boxes |
| `:::exercise` / `:::solution` | a practice task with a collapsible solution |
| `:::flow Title` | a step diagram (one step per line, `Title \| detail`) |

Add `title="..."` or `level=easy|intermediate|advanced` after `run` to label a block. Each module folder has a `_module.md` with its title, icon, level and description. Projects also take `icon`, `cover` (two colours) and `tags` in their front matter.

To use another npm package in the editors, add it to the `IMPORTS` map at the top of `assets/js/runner-react.js`.

## Folder layout

This course is one part of the combined site (see `../README.md`). The design system (`style.css`), the engine (`app.js`), CodeMirror, marked and KaTeX are shared from `../shared/`; the course catalogue is `../courses.js`.

```text
index.html                  the site shell + config
build.py                    bundles content/ → assets/js/content.js
content/                    all lessons and projects (Markdown)
assets/js/runner-react.js   live editor: Babel compile → sandboxed iframe preview + console
```
