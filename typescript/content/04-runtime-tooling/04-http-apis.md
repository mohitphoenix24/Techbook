---
title: Typed HTTP Clients & APIs
level: intermediate
time: 40
summary: Both sides of the wire — a typed fetch client that validates responses with Zod, then a real Hono API server (running live in your browser) with validated request bodies, typed errors, streaming with Server-Sent Events, and an end-to-end typed client.
---

AI features live behind HTTP: your front end calls your API, your API calls model providers, vector databases and tools. This lesson builds both sides with types that hold up at runtime.

## Part 1 — A typed fetch client

`fetch` returns `Promise<Response>`, and `await res.json()` is `any`. That `any` is where bugs sneak in. Wrap fetch once, validate with a schema, and return typed data:

```ts run level=intermediate
import { z } from "zod";

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = "HttpError"; this.status = status; }
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

function createClient(baseUrl: string, fetchImpl: Fetch = fetch) {
  async function request<S extends z.ZodType>(schema: S, path: string, init?: RequestInit): Promise<z.output<S>> {
    const res = await fetchImpl(baseUrl + path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
    if (!res.ok) throw new HttpError(res.status, await res.text());
    const data: unknown = await res.json();
    return schema.parse(data);                    // throws a ZodError if the server sent something unexpected
  }
  return {
    get: <S extends z.ZodType>(schema: S, path: string) => request(schema, path),
    post: <S extends z.ZodType>(schema: S, path: string, body: unknown) => request(schema, path, { method: "POST", body: JSON.stringify(body) }),
  };
}

// ---- a fake server, so this runs without a network ----
const fakeFetch: Fetch = async (url, init) => {
  if (url.endsWith("/models")) return Response.json([{ id: "claude-opus-5-5", context: 1_000_000 }, { id: "claude-haiku-4-5", context: 200_000 }]);
  if (url.endsWith("/summaries") && init?.method === "POST") return Response.json({ id: "sum_1", bullets: ["Refunds within 30 days"], tokens: 42 });
  return new Response("Not found", { status: 404 });
};

const Model = z.object({ id: z.string(), context: z.number() });
const Summary = z.object({ id: z.string(), bullets: z.array(z.string()), tokens: z.number() });

const api = createClient("https://api.example.com", fakeFetch);
const models = await api.get(z.array(Model), "/models");
//    ^?
const summary = await api.post(Summary, "/summaries", { text: "Our refund policy…" });
//    ^?
console.log(models.map((m) => m.id), summary.bullets);

try { await api.get(Model, "/nope"); } catch (e) { if (e instanceof HttpError) console.log("HTTP", e.status, e.message); }
```

:::tip Inject fetch
Passing `fetchImpl` as a parameter (defaulting to the global `fetch`) makes the client trivial to test and to run here without a network. The same trick works for SDK clients.
:::

## Part 2 — An API server with Hono

**Hono** is a small, fast web framework built on web-standard `Request`/`Response`, so the same code runs on Node.js, Bun, Deno, Cloudflare Workers — and, as below, inside this page. `app.request()` sends a request to the app without a network.

```ts run level=intermediate
import { Hono } from "hono";
import { z } from "zod";

const SummariseBody = z.object({
  text: z.string().min(20, "Send at least 20 characters"),
  maxBullets: z.number().int().min(1).max(10).default(3),
});

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, model: "claude-opus-5-5" }));

app.post("/summarise", async (c) => {
  const parsed = SummariseBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  const { text, maxBullets } = parsed.data;                  // typed and validated
  // In a real app: call the model here. We fake it with the first sentences.
  const bullets = text.split(/(?<=[.!?])\s+/).slice(0, maxBullets);
  return c.json({ bullets, inputChars: text.length });
});

app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

// ---- call it like a client would ----
const show = async (res: Response | Promise<Response>) => { const r = await res; console.log(r.status, await r.json()); };

await show(app.request("/health"));
await show(app.request("/summarise", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ text: "Refunds are available for 30 days. Pro costs $8 per month. Teams get admin controls.", maxBullets: 2 }),
}));
await show(app.request("/summarise", { method: "POST", body: JSON.stringify({ text: "too short", maxBullets: 50 }) }));
await show(app.request("/missing"));
```

To run it for real on Node.js:

```ts nocheck
// src/server.ts — npm install hono @hono/node-server
import { serve } from "@hono/node-server";
import { app } from "./app.ts";

serve({ fetch: app.fetch, port: 3000 });
console.log("Listening on http://localhost:3000");
```

## Streaming responses with Server-Sent Events

Model answers stream token by token. The server forwards them as **SSE** — `data:` lines separated by blank lines:

```ts run level=advanced
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

type ChatEvent = { type: "text"; text: string } | { type: "done"; tokens: number };

async function* fakeModelStream(question: string): AsyncGenerator<string> {
  for (const word of `You asked: "${question}". Streaming sends this answer in small pieces.`.split(" ")) {
    await new Promise((r) => setTimeout(r, 25));
    yield word + " ";
  }
}

const app = new Hono();
app.get("/chat", (c) => {
  const q = c.req.query("q") ?? "hello";
  return streamSSE(c, async (stream) => {
    let tokens = 0;
    for await (const text of fakeModelStream(q)) {
      tokens++;
      const event: ChatEvent = { type: "text", text };
      await stream.writeSSE({ data: JSON.stringify(event) });
    }
    await stream.writeSSE({ data: JSON.stringify({ type: "done", tokens } satisfies ChatEvent) });
  });
});

// ---- client side: read the stream and parse events ----
async function* readSSE(res: Response): AsyncGenerator<ChatEvent> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (data) yield JSON.parse(data) as ChatEvent;
    }
  }
}

let answer = "";
for await (const event of readSSE(await app.request("/chat?q=What+is+RAG"))) {
  if (event.type === "text") answer += event.text;
  else console.log(`done after ${event.tokens} chunks:\n${answer}`);
}
```

:::warn Chunks don't match events
The network can split a stream anywhere — half an event, or three events in one chunk. Always **buffer** text and only parse complete events (ending in a blank line), as `readSSE` does.
:::

## End-to-end types with Hono's client

Hono can export the **type** of your API so a client knows every route, body and response — with no code generation:

```ts run level=advanced
import { Hono } from "hono";
import { hc } from "hono/client";

const app = new Hono()
  .get("/models", (c) => c.json([{ id: "claude-opus-5-5", context: 1_000_000 }]))
  .post("/estimate", async (c) => {
    const { text } = await c.req.json<{ text: string }>();
    return c.json({ tokens: Math.ceil(text.length / 4) });
  });

type AppType = typeof app;            // export this type from your server package

// The client only needs the TYPE of the app (plus a fetch). Here: fetch = the app itself.
const client = hc<AppType>("http://local", { fetch: (input: RequestInfo | URL, init?: RequestInit) => app.request(input instanceof Request ? input : input.toString(), init) });

const res = await client.models.$get();
const models = await res.json();
//    ^?
const est = await (await client.estimate.$post({ json: { text: "How many tokens is this?" } })).json();
//    ^?
console.log(models, est);
```

Rename a route or change a response on the server and the client code shows type errors immediately — the same idea as tRPC.

:::ai
A typical AI back end in TypeScript: a Hono (or Express/Fastify) app with routes like `POST /chat` (SSE stream), `POST /extract` (structured output validated by Zod), `POST /documents` (ingest for RAG). Every request body is validated at the edge, the Claude client lives in one module, and the front end consumes typed events. Module 5 fills in the model calls.
:::

## Check yourself

```quiz
? Why validate `await res.json()` with a schema?
+ It's really unknown data — the schema checks it and gives you the correct type
- res.json() is slow
- It's required by fetch
> res.json() returns any; validation makes it safe.

? What does `app.request("/health")` do in Hono?
+ Sends a request straight to the app without a network — great for tests
- Starts the server
- Calls an external API
> It returns the Response your handler produces.

? Why must an SSE reader buffer text?
+ Network chunks can split or combine events
- SSE is binary
- To make it slower
> Parse only complete events ending in a blank line.
```

:::keypoints
- Wrap `fetch` once: check `res.ok`, parse JSON as `unknown`, validate with Zod, return typed data.
- Hono: web-standard `Request`/`Response` handlers; validate bodies with `safeParse`; test with `app.request()`.
- Stream model output with SSE (`streamSSE`); parse it on the client with a buffered reader.
- `hc<typeof app>` gives an end-to-end typed client.
:::
