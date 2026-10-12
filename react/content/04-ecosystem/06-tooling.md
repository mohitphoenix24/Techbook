---
title: Tooling, Project Setup & Deployment
level: intermediate
time: 25
summary: Go from "empty folder" to "live on the internet" — Vite vs Next.js, project structure, environment variables (and why API keys never go in the browser), ESLint and the React Compiler, code splitting, DevTools, and deploying.
---

The live editors on this site hide the setup. Real projects need a **build tool**, a **folder structure**, **linting**, **environment variables** and a way to **deploy**. This lesson is your setup checklist.

:::def Build tool
A program that turns your source (JSX, TypeScript, CSS, imports) into optimised files a browser can load, and runs a fast **dev server** with instant reload while you code. **Vite** is the standard for React SPAs.
:::

:::def Framework
A build tool **plus** routing, server rendering, data loading and an API/backend layer. **Next.js** and **React Router (framework mode)** are the popular React frameworks.
:::

## Pick a starting point

| You're building | Start with | Command |
|---|---|---|
| a single-page app / dashboard / internal tool | **Vite** | `npm create vite@latest my-app -- --template react-ts` |
| a full-stack product (SEO, server code, API routes, Server Components) | **Next.js** | `npx create-next-app@latest my-app` |
| an SPA that may grow into full-stack | **React Router** | `npx create-react-router@latest my-app` |

:::warn create-react-app is gone
`create-react-app` is deprecated. Use Vite or a framework.
:::

```bash
npm create vite@latest chat-ui -- --template react-ts
cd chat-ui
npm install
npm run dev          # http://localhost:5173 with instant hot reload
npm run build        # production files in dist/
npm run preview      # serve the production build locally
```

## A clean folder structure

```text
src/
├── main.tsx                 → createRoot(...).render(<App />)
├── App.tsx
├── components/              → reusable UI (Button, Dialog, Markdown)
├── features/                → grouped by feature, each with its own components/hooks
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   ├── useChatStream.ts
│   │   └── chat.test.tsx
│   └── documents/
├── lib/                     → non-React helpers (api client, formatters, zod schemas)
├── stores/                  → Zustand stores
└── styles/
```

:::tip Group by feature
Putting everything for "chat" in one folder (components, hooks, tests, types) scales much better than giant `components/` and `hooks/` folders.
:::

## Environment variables — and the golden rule

```bash
# .env.local  (never commit this file)
VITE_API_BASE_URL=https://api.myapp.com      # VITE_ prefix → included in the browser bundle
ANTHROPIC_API_KEY=sk-ant-...                 # no prefix → NOT exposed to browser code (server only)
```

```js
const base = import.meta.env.VITE_API_BASE_URL;     // Vite
// Next.js: process.env.NEXT_PUBLIC_... in the browser, process.env.ANTHROPIC_API_KEY on the server only
```

:::warn Never put an API key in front-end code
Everything in your browser bundle — including any `VITE_` / `NEXT_PUBLIC_` variable — can be read by anyone who opens DevTools. A model API key there **will** be found and abused. The browser calls **your** backend (`/api/chat`); only the backend holds the key. The AI Interfaces module shows this pattern.
:::

## Linting and formatting

```bash
npm install -D eslint eslint-plugin-react-hooks prettier
```

```js
// eslint.config.js (flat config)
import reactHooks from "eslint-plugin-react-hooks";

export default [
  reactHooks.configs.recommended,    // rules of hooks, exhaustive deps, and React Compiler checks
];
```

The **react-hooks** plugin is essential: it catches hooks called conditionally, missing effect dependencies, and code the React Compiler can't optimise (like mutating props or reading refs during render). **Prettier** formats your code automatically so you never argue about spacing.

## The React Compiler

The **React Compiler** automatically memoises components and values at build time, so you rarely need `useMemo`, `useCallback` or `memo` by hand.

```bash
npm install -D babel-plugin-react-compiler
```

```js
// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({ babel: { plugins: ["babel-plugin-react-compiler"] } })],
});

// next.config.js →  export default { reactCompiler: true };
```

It works best when your components follow the rules: pure render, no mutation of props/state, hooks at the top level.

## Code splitting with lazy()

Big parts of the app (a chart library, a code editor, the settings page) can be loaded only when needed:

```jsx run level=intermediate
import { lazy, Suspense, useState } from "react";

// In a real app: const Settings = lazy(() => import("./Settings.jsx"));
// Here we simulate a slow network download of a separate file:
const Settings = lazy(() => new Promise((resolve) => setTimeout(() => resolve({
  default: function Settings() {
    return <div className="card">⚙️ Settings panel (downloaded on demand)</div>;
  },
}), 1000)));

export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack" style={{ maxWidth: 340 }}>
      <button onClick={() => setOpen(true)} disabled={open}>Open settings</button>
      {open && (
        <Suspense fallback={<p className="muted">Downloading settings code…</p>}>
          <Settings />
        </Suspense>
      )}
      <span className="muted">The second time, it's instant: the module is cached.</span>
    </div>
  );
}
```

## Debugging and profiling

- **React DevTools** (browser extension): inspect the component tree, props, state and hooks; see which components were memoised by the compiler.
- **Profiler tab**: record an interaction and see which components rendered and how long each took.
- **`<StrictMode>`** in development: runs effects twice and renders twice to surface impure code and missing cleanups.
- **Network tab**: inspect requests and streamed responses (`EventStream` tab for SSE).

## Deploying

| Kind of app | Where | How |
|---|---|---|
| Vite SPA (static files) | Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3 | `npm run build` → upload `dist/` (configure SPA fallback to `index.html`) |
| Next.js | Vercel (native), Netlify, Docker on any host | connect the Git repo, or `next build && next start` |
| SPA + your own API | static host + a server (Node, Python FastAPI, serverless functions) | keep secrets on the server, set CORS |

```text
Browser (React)  ──fetch /api/chat──▶  Your backend (holds ANTHROPIC_API_KEY)  ──▶  Claude API
       ▲                                       │
       └──────────── streamed tokens ◀─────────┘
```

:::ai
A common, cheap AI stack: **Vite + React** front end on a static host, and a small **Python FastAPI** (from the Python course) or **serverless function** that holds the API key, applies rate limits and streams the model's response back.
:::

## Check yourself

```quiz
? Which variable is safe from being shipped to the browser in a Vite app?
+ ANTHROPIC_API_KEY (no VITE_ prefix), read only by server code
- VITE_ANTHROPIC_API_KEY
- Any variable in .env
> Only VITE_-prefixed variables are bundled; but keys belong on a server anyway.

? What does lazy() + Suspense give you?
+ Code that's downloaded only when the component is first needed
- Faster state updates
- Automatic memoisation
> It's code splitting.

? What does the React Compiler do?
+ Automatically memoises components and values at build time
- Converts React to Vue
- Type-checks your code
> It removes most of the need for manual useMemo/useCallback/memo.
```

:::keypoints
- Start SPAs with **Vite**, full-stack apps with **Next.js** (or React Router framework mode). `create-react-app` is deprecated.
- Organise by feature; use `.env.local` for config. **API keys stay on the server** — browser env vars are public.
- Use ESLint's **react-hooks** plugin, Prettier, and the **React Compiler**.
- Split heavy code with `lazy()` + Suspense; debug with React DevTools and the Profiler.
- Deploy `dist/` to a static host, Next.js to Vercel or Docker, with a backend for model calls.
:::
