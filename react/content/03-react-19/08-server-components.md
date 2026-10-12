---
title: Server Components & Server Functions
level: advanced
time: 32
summary: How modern React apps split work between server and browser — Server Components that fetch data directly and ship no JavaScript, 'use client' boundaries, Server Functions ('use server') called from forms, and streaming — explained with Next.js examples.
---

For years, React ran only in the browser. **React Server Components (RSC)** let components run **on the server**: they can read databases and call APIs (with secret keys!) directly, and they send finished UI to the browser instead of JavaScript. Frameworks like **Next.js** (App Router) are built on them.

:::note Runs in a framework
Server Components need a framework or bundler that supports them (Next.js, React Router's RSC mode, Waku, Parcel). The examples here are **Next.js App Router** code to read and copy; the live editors on this site run in the browser only.
:::

:::def Server Component
A component that runs **only on the server** (at build time or per request). It can be `async`, `await` data directly, use secrets, and its code is **never sent to the browser**. It can't use state, effects or event handlers. In the App Router, components are Server Components by default.
:::

:::def Client Component
A regular interactive React component that runs in the browser (and is also pre-rendered to HTML). Marked by a `'use client'` directive at the top of its file. Needed for state, effects, event handlers and browser APIs.
:::

:::flow One request in a Server Components app
Request | user opens /chats/42
Server Components run | await database, APIs (with secrets)
Stream | HTML + RSC payload, Suspense boundaries fill in
Browser | hydrates only the Client Components
Interact | Client Components handle clicks; Server Functions handle mutations
:::

## A Server Component

```jsx
// app/chats/[id]/page.jsx  — a Server Component (no directive needed in Next.js App Router)
import { db } from "@/lib/db";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";            // a Client Component (interactive)

export default async function ChatPage({ params }) {
  const { id } = await params;
  const chat = await db.chat.findUnique({ where: { id }, include: { messages: true } });   // direct DB access
  if (!chat) return <p>Chat not found.</p>;

  return (
    <main>
      <h1>{chat.title}</h1>
      <MessageList messages={chat.messages} />      {/* can be a Server Component too */}
      <Composer chatId={id} />                      {/* interactive: runs in the browser */}
    </main>
  );
}
```

No `useEffect`, no loading state, no API route just to fetch data — and the database client and its credentials never reach the browser.

## The 'use client' boundary

```jsx
// app/chats/[id]/Composer.jsx
"use client";                                  // everything this file imports becomes client code

import { useState } from "react";

export function Composer({ chatId }) {
  const [text, setText] = useState("");
  return <textarea value={text} onChange={(e) => setText(e.target.value)} />;
}
```

:::def 'use client'
A directive at the top of a file marking the **boundary** where server code hands over to browser code. The component and everything it imports are bundled for the browser. Props passed from Server to Client Components must be serialisable (plain data, not functions — except Server Functions).
:::

| Server Components | Client Components |
|---|---|
| `async`/`await` data directly | `useState`, `useEffect`, `useRef`… |
| secrets, databases, file system | event handlers (`onClick`, `onChange`) |
| zero JavaScript sent to the browser | browser APIs (`localStorage`, `window`) |
| can render Client Components | can render Server Components passed as `children` |

:::tip Push 'use client' down
Keep most of the tree as Server Components and make only the **interactive leaves** client components (a button, a form, a chart). Less JavaScript ships, pages load faster.
:::

## Server Functions ('use server')

:::def Server Function (Server Action)
An `async` function marked with `'use server'` that runs **on the server** but can be **called from the browser** — passed to a `<form action>`, or called from a Client Component. React handles the network request for you. When used for mutations from forms they're often called **Server Actions**.
:::

```jsx
// app/chats/actions.js
"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();                     // ANTHROPIC_API_KEY stays on the server

export async function sendMessage(chatId, formData) {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Message is empty" };

  await db.message.create({ data: { chatId, role: "user", text } });
  const history = await db.message.findMany({ where: { chatId }, orderBy: { createdAt: "asc" } });

  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2048,
    messages: history.map((m) => ({ role: m.role, content: m.text })),
  });
  const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");

  await db.message.create({ data: { chatId, role: "assistant", text: reply } });
  revalidatePath(`/chats/${chatId}`);               // refresh the Server Components showing this chat
  return { error: null };
}
```

```jsx
// app/chats/[id]/Composer.jsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendMessage } from "../actions";

function SendButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "Thinking…" : "Send"}</button>;
}

export function Composer({ chatId }) {
  const [state, formAction] = useActionState(async (prev, formData) => sendMessage(chatId, formData), { error: null });
  return (
    <form action={formAction}>
      <textarea name="text" required />
      <SendButton />
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
```

Everything from the Actions lesson — `useActionState`, `useFormStatus`, `useOptimistic` — works with Server Functions. Forms using them even work **before JavaScript loads** (progressive enhancement).

:::warn Server Functions are public endpoints
Anyone can call a Server Function with any arguments. Always **authenticate**, **authorise** (does this user own `chatId`?) and **validate** input inside it — exactly like an API route.
:::

## Streaming with Suspense

Server Components can stream: the shell arrives immediately and slow parts fill in as their data resolves.

```jsx
// app/dashboard/page.jsx
import { Suspense } from "react";

export default function Dashboard() {
  return (
    <>
      <h1>Usage</h1>                                     {/* sent immediately */}
      <Suspense fallback={<p>Loading costs…</p>}>
        <CostChart />                                    {/* streamed in when its data is ready */}
      </Suspense>
      <Suspense fallback={<p>Loading eval results…</p>}>
        <EvalTable />
      </Suspense>
    </>
  );
}

async function CostChart() {
  const costs = await getCostsFromWarehouse();           // slow query
  return <Chart data={costs} />;
}
```

## Passing promises from server to client

A Server Component can start a request and pass the **promise** to a Client Component, which reads it with `use()` — the request starts early on the server, and the client shows a fallback until it resolves.

```jsx
// Server Component
export default function Page() {
  const suggestionsPromise = getSuggestions();       // not awaited
  return (
    <Suspense fallback={<p>Loading suggestions…</p>}>
      <Suggestions promise={suggestionsPromise} />
    </Suspense>
  );
}

// Suggestions.jsx — Client Component
"use client";
import { use } from "react";
export function Suggestions({ promise }) {
  const items = use(promise);
  return items.map((s) => <button key={s}>{s}</button>);
}
```

## When to use what

| Situation | Choose |
|---|---|
| content pages, dashboards, docs, product listings | mostly Server Components |
| highly interactive tools (editors, canvases, games) | mostly Client Components |
| forms and mutations | Server Functions + Actions |
| secrets (LLM API keys, DB credentials) | **only** on the server |
| a single-page app with a separate API (e.g. FastAPI) | a client-only React app (Vite) is perfectly fine |

:::ai
For AI apps, Server Components + Server Functions are a natural fit: the API key lives on the server, conversation history loads straight from the database, and the composer is a small Client Component using Actions. Token **streaming** to the browser is usually done with a route handler returning a stream (or an AI SDK), consumed by a Client Component — the AI Interfaces module shows the client side.
:::

## Check yourself

```quiz
? Which can a Server Component do?
+ await a database query directly
- useState
- handle onClick
> Interactivity needs Client Components.

? What does 'use client' mark?
+ The boundary where a module (and its imports) becomes browser code
- A component that only runs on the client and is never pre-rendered
- A server-only file
> Client Components are still pre-rendered to HTML.

? What must every Server Function do?
+ Check authentication, authorisation and validate its inputs
- Return JSX
- Use useEffect
> Server Functions are callable by anyone, like API endpoints.

? Where should your ANTHROPIC_API_KEY be used?
+ Only in server code (Server Components, Server Functions, route handlers, your backend)
- In a Client Component
- In localStorage
> Browser code is public.
```

:::keypoints
- **Server Components** run on the server, can be `async`, use secrets and ship no JavaScript; they're the default in the Next.js App Router.
- **`'use client'`** marks the boundary for interactive components; push it down to the leaves.
- **Server Functions** (`'use server'`) are called from forms/clients; combine with `useActionState`/`useFormStatus`; always auth + validate.
- Stream slow parts with **Suspense**; pass promises from server to client and read them with `use()`.
:::
