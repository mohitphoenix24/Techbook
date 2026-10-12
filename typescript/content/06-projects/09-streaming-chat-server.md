---
title: Streaming Chat API Server
level: advanced
time: 60
icon: message
cover: #6366f1,#ec4899
tags: Hono, SSE, streaming, Zod, typed events, conversations, cancellation
summary: The back end of a chat product, running live in your browser — a Hono API with validated routes, a conversation store, Server-Sent Events streaming of model tokens with a typed event protocol, usage accounting, cancellation, and a typed client that consumes the stream.
---

Every chat UI needs the same back end: create a conversation, send a message, **stream** the answer token by token, save the final message, report usage, and stop cleanly when the user cancels. This project builds it with Hono — a real web framework that runs here, so you can exercise the API end to end.

:::flow Request lifecycle
POST /conversations | create
POST …/messages | validated body
Stream (SSE) | start → delta… → done
Save | final assistant message
GET …/messages | full history
:::

**You'll practise:** Hono routes and validation, async generators, SSE with a typed event union, an in-memory repository behind an interface, and a streaming client parser.

## The complete server (and client)

```ts run level=advanced title="Streaming chat server · complete"
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

// ======================= domain types =======================
type Role = "user" | "assistant";
type Message = { id: string; role: Role; content: string; createdAt: string; status: "complete" | "stopped"; usage?: { inputTokens: number; outputTokens: number } };
type Conversation = { id: string; title: string; model: string; messages: Message[] };

// The events the browser receives — one typed protocol, independent of the model provider
type ChatEvent =
  | { type: "start"; messageId: string; model: string }
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string; usage: { inputTokens: number; outputTokens: number } }
  | { type: "error"; message: string };

// ======================= storage behind an interface =======================
interface ConversationRepo {
  create(title: string, model: string): Conversation;
  get(id: string): Conversation | undefined;
  append(id: string, m: Message): void;
}
class MemoryRepo implements ConversationRepo {
  #items = new Map<string, Conversation>();
  #n = 0;
  create(title: string, model: string) { const c: Conversation = { id: `conv_${++this.#n}`, title, model, messages: [] }; this.#items.set(c.id, c); return c; }
  get(id: string) { return this.#items.get(id); }
  append(id: string, m: Message) { this.#items.get(id)?.messages.push(m); }
}

// ======================= a fake streaming model (swap for the Claude SDK) =======================
async function* fakeModel(history: Message[], signal: AbortSignal): AsyncGenerator<string> {
  const question = history.at(-1)?.content ?? "";
  const answer = /refund/i.test(question)
    ? "You can request a full refund within 30 days of purchase. Refunds arrive in 5 to 7 business days."
    : `You said: "${question}". I'm a demo model, but the streaming, saving and usage accounting are real.`;
  for (const word of answer.split(/(?<= )/)) {
    if (signal.aborted) return;
    await new Promise((r) => setTimeout(r, 15));
    yield word;
  }
}

// ======================= the API =======================
const repo: ConversationRepo = new MemoryRepo();
const CreateConversation = z.object({ title: z.string().min(1).max(100).default("New chat"), model: z.enum(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]).default("claude-opus-5-5") });
const SendMessage = z.object({ content: z.string().trim().min(1).max(10_000) });
let ids = 0;
const newId = () => `msg_${++ids}`;

const app = new Hono()
  .post("/conversations", async (c) => {
    const body = CreateConversation.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: z.prettifyError(body.error) }, 400);
    const conv = repo.create(body.data.title, body.data.model);
    return c.json({ id: conv.id, title: conv.title, model: conv.model }, 201);
  })
  .get("/conversations/:id/messages", (c) => {
    const conv = repo.get(c.req.param("id"));
    return conv ? c.json(conv.messages) : c.json({ error: "conversation not found" }, 404);
  })
  .post("/conversations/:id/messages", async (c) => {
    const conv = repo.get(c.req.param("id"));
    if (!conv) return c.json({ error: "conversation not found" }, 404);
    const body = SendMessage.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: z.prettifyError(body.error) }, 400);

    repo.append(conv.id, { id: newId(), role: "user", content: body.data.content, createdAt: new Date().toISOString(), status: "complete" });

    return streamSSE(c, async (sse) => {
      const send = (e: ChatEvent) => sse.writeSSE({ data: JSON.stringify(e) });
      const controller = new AbortController();
      sse.onAbort(() => controller.abort());                       // client went away → stop generating

      const messageId = newId();
      let text = "";
      await send({ type: "start", messageId, model: conv.model });
      try {
        for await (const delta of fakeModel(conv.messages, controller.signal)) {
          text += delta;
          await send({ type: "delta", text: delta });
        }
        const usage = { inputTokens: Math.ceil(conv.messages.map((m) => m.content).join(" ").length / 4), outputTokens: Math.ceil(text.length / 4) };
        repo.append(conv.id, { id: messageId, role: "assistant", content: text, createdAt: new Date().toISOString(), status: controller.signal.aborted ? "stopped" : "complete", usage });
        if (!controller.signal.aborted) await send({ type: "done", messageId, usage });
      } catch (e) {
        await send({ type: "error", message: e instanceof Error ? e.message : "stream failed" });
      }
    });
  });

// ======================= a typed client =======================
async function* readEvents(res: Response): AsyncGenerator<ChatEvent> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const data = buffer.slice(0, end).split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      buffer = buffer.slice(end + 2);
      if (data) yield JSON.parse(data) as ChatEvent;
    }
  }
}

const json = { "content-type": "application/json" };
const conv = (await (await app.request("/conversations", { method: "POST", headers: json, body: JSON.stringify({ title: "Billing questions" }) })).json()) as { id: string };
console.log("created", conv);

async function sendMessage(content: string) {
  const res = await app.request(`/conversations/${conv.id}/messages`, { method: "POST", headers: json, body: JSON.stringify({ content }) });
  if (!res.ok) return console.log("❌", res.status, await res.json());
  let shown = "";
  for await (const e of readEvents(res)) {
    switch (e.type) {
      case "start": console.log(`\n▶ ${e.messageId} (${e.model})`); break;
      case "delta": shown += e.text; break;
      case "done": console.log(`${shown}\n✔ done — ${e.usage.inputTokens} in / ${e.usage.outputTokens} out tokens`); break;
      case "error": console.log("⚠", e.message); break;
    }
  }
}

await sendMessage("How do refunds work?");
await sendMessage("Thanks! Can you also explain streaming?");
await sendMessage("   ");                                              // rejected by validation

const history = (await (await app.request(`/conversations/${conv.id}/messages`)).json()) as Message[];
console.log("\nsaved history:", history.map((m) => `${m.role}: ${m.content.slice(0, 40)}${m.content.length > 40 ? "…" : ""} [${m.status}]`));
console.log((await app.request("/conversations/conv_999/messages")).status, "for an unknown conversation");
```

## How it works

| Piece | Technique |
|---|---|
| routes | Hono handlers on web-standard `Request`/`Response`; chained `.post/.get` keeps the app's type for typed clients |
| validation | Zod `safeParse` on every body; `z.prettifyError` for 400 responses |
| storage | a `ConversationRepo` interface — swap `MemoryRepo` for Postgres/SQLite without touching routes |
| streaming | `streamSSE` + an async generator; each SSE event carries one `ChatEvent` |
| cancellation | `sse.onAbort` aborts the model stream; the partial answer is saved as `"stopped"` |
| client | a buffered SSE reader yields typed `ChatEvent`s; a `switch` renders them |

## Making it real

Replace `fakeModel` with the SDK — the rest of the server doesn't change:

```ts nocheck
async function* claudeModel(history: Message[], signal: AbortSignal): AsyncGenerator<string> {
  const stream = anthropic.messages.stream(
    { model: "claude-opus-5-5", max_tokens: 16000, messages: history.map(({ role, content }) => ({ role, content })) },
    { signal },
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }
}
```

Then serve it on Node.js with `@hono/node-server`, put authentication middleware in front of the routes, and use real token counts from `stream.finalMessage()`.

:::exercise Extend it
1. Add `DELETE /conversations/:id` and `PATCH` to rename, with Zod-validated bodies.
2. Auto-generate a conversation **title** after the first answer (a second, cheap model call).
3. Add per-user **rate limiting** middleware (the token bucket from Production Patterns).
4. Export `type AppType = typeof app` and call it with `hc<AppType>()` for an end-to-end typed client.
:::

:::keypoints
- A chat back end = validated routes + a conversation store + a streamed answer + saved history.
- Stream with SSE using one small, typed event union (`start`, `delta`, `done`, `error`).
- Stop generating when the client disconnects, and save partial answers with a status.
- Keep the model behind a function (async generator) so fake and real implementations are interchangeable.
:::
