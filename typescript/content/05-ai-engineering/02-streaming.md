---
title: Streaming Responses
level: intermediate
time: 35
summary: Show answers as they're written — the SDK's stream API, typed stream events, the "text" helper and finalMessage(), accumulating events into a message yourself, cancelling with AbortController, and forwarding a stream to a browser.
---

A long answer can take 30 seconds to finish. **Streaming** delivers it piece by piece, so users see progress in under a second — and long requests don't time out.

:::def Streaming
Receiving a response as a sequence of small **events** over one open connection, instead of one big JSON document at the end.
:::

## The SDK stream

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const stream = client.messages.stream({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  messages: [{ role: "user", content: "Explain embeddings to a 12-year-old." }],
});

stream.on("text", (delta) => process.stdout.write(delta));   // just the new text, as it arrives

const final = await stream.finalMessage();                   // the complete, typed Message
console.log("\n\nstop:", final.stop_reason, "| output tokens:", final.usage.output_tokens);
```

:::tip finalMessage()
`await stream.finalMessage()` resolves with the whole `Anthropic.Message` once the stream ends — handy for saving the conversation or reading usage. Don't wrap the event callbacks in your own `new Promise(...)`; `finalMessage()` already handles completion, errors and aborts.
:::

## Stream events are a discriminated union

You can also iterate over the raw events with `for await`. Each event has a `type`:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const stream = client.messages.stream({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  messages: [{ role: "user", content: "Write a haiku about TypeScript." }],
});

for await (const event of stream) {
  switch (event.type) {
    case "message_start":
      console.log("model:", event.message.model);
      break;
    case "content_block_start":
      console.log(`\n[block ${event.index}: ${event.content_block.type}]`);
      break;
    case "content_block_delta":
      if (event.delta.type === "text_delta") process.stdout.write(event.delta.text);
      break;
    case "message_delta":
      console.log("\nstop_reason:", event.delta.stop_reason, "output tokens:", event.usage.output_tokens);
      break;
  }
}
```

| Event | When |
|---|---|
| `message_start` | once, with the message id and model |
| `content_block_start` | a new block (text, tool_use, thinking…) begins |
| `content_block_delta` | a piece of a block: `text_delta`, `input_json_delta`, `thinking_delta` |
| `content_block_stop` | the block is complete |
| `message_delta` | final `stop_reason` and output usage |
| `message_stop` | the stream is done |

## Building a message from events

To understand streams (and to handle them in your own code), here's an accumulator that turns typed events into a final message. It runs on a simulated event stream:

```ts run level=advanced
type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
type StreamEvent =
  | { type: "message_start"; message: { id: string; model: string } }
  | { type: "content_block_start"; index: number; content_block: { type: "text" } | { type: "tool_use"; id: string; name: string } }
  | { type: "content_block_delta"; index: number; delta: { type: "text_delta"; text: string } | { type: "input_json_delta"; partial_json: string } }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason: string }; usage: { output_tokens: number } }
  | { type: "message_stop" };

async function* simulatedStream(): AsyncGenerator<StreamEvent> {
  const events: StreamEvent[] = [
    { type: "message_start", message: { id: "msg_1", model: "claude-opus-5-5" } },
    { type: "content_block_start", index: 0, content_block: { type: "text" } },
    ...["Let me ", "look up ", "your order."].map((text): StreamEvent => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })),
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "get_order" } },
    ...['{"order', 'Id": "A-', '1042"}'].map((partial_json): StreamEvent => ({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json } })),
    { type: "content_block_stop", index: 1 },
    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 38 } },
    { type: "message_stop" },
  ];
  for (const e of events) { await new Promise((r) => setTimeout(r, 30)); yield e; }
}

async function accumulate(events: AsyncIterable<StreamEvent>) {
  const blocks: Block[] = [];
  const jsonBuffers = new Map<number, string>();          // tool input arrives as JSON fragments
  let stopReason = "", outputTokens = 0, id = "";
  for await (const e of events) {
    switch (e.type) {
      case "message_start": id = e.message.id; break;
      case "content_block_start":
        blocks[e.index] = e.content_block.type === "text" ? { type: "text", text: "" } : { ...e.content_block, input: {} };
        break;
      case "content_block_delta": {
        const block = blocks[e.index];
        if (e.delta.type === "text_delta" && block.type === "text") { block.text += e.delta.text; console.log("text so far:", block.text); }
        if (e.delta.type === "input_json_delta") jsonBuffers.set(e.index, (jsonBuffers.get(e.index) ?? "") + e.delta.partial_json);
        break;
      }
      case "content_block_stop": {
        const block = blocks[e.index];
        if (block.type === "tool_use") block.input = JSON.parse(jsonBuffers.get(e.index) || "{}");   // parse once complete
        break;
      }
      case "message_delta": stopReason = e.delta.stop_reason; outputTokens = e.usage.output_tokens; break;
      case "message_stop": break;
    }
  }
  return { id, content: blocks, stop_reason: stopReason, output_tokens: outputTokens };
}

console.log(await accumulate(simulatedStream()));
```

:::warn Tool input streams as partial JSON
`input_json_delta` events carry **fragments** of JSON (`{"order`, `Id": "A-`…). Only parse when the block stops — the SDK's `finalMessage()` does this for you.
:::

## Cancelling a stream

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const stream = client.messages.stream({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  messages: [{ role: "user", content: "Write a very long story." }],
});

setTimeout(() => stream.abort(), 2000);    // e.g. the user pressed Stop or closed the tab

stream.on("text", (t) => process.stdout.write(t));
try {
  await stream.finalMessage();
} catch (error) {
  if (stream.aborted) console.log("\n[stopped by user]");
  else throw error;
}
```

Aborting stops generation, which also stops you paying for tokens nobody will read.

## Forwarding a stream to the browser

A server route that streams Claude's answer as simple Server-Sent Events (the client side is in the previous module):

```ts
import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

const client = new Anthropic();
export const app = new Hono();

app.post("/chat", async (c) => {
  const { messages } = await c.req.json<{ messages: Anthropic.MessageParam[] }>();
  return streamSSE(c, async (sse) => {
    const stream = client.messages.stream({ model: "claude-opus-5-5", max_tokens: 16000, messages });
    sse.onAbort(() => stream.abort());                         // browser disconnected → stop the model
    stream.on("text", (text) => { void sse.writeSSE({ data: JSON.stringify({ type: "text", text }) }); });
    const final = await stream.finalMessage();
    await sse.writeSSE({ data: JSON.stringify({ type: "done", stopReason: final.stop_reason, usage: final.usage }) });
  });
});
```

:::tip Your own event format
Convert the SDK's detailed events into a **small, typed event union** for your front end (`text`, `tool`, `done`, `error`). The UI stays simple and doesn't break when the provider adds new event types.
:::

:::ai
Streaming is also important for **long, high-`max_tokens` requests** even when nobody watches: a non-streaming request that takes many minutes risks hitting timeouts. Stream, and use `finalMessage()` if you only need the end result.
:::

## Check yourself

```quiz
? What does `stream.on("text", fn)` give you?
+ Each new piece of text as it arrives
- The whole answer at the end
- Raw bytes
> It's the simplest way to show streaming text.

? When can you JSON.parse a streaming tool call's input?
+ After its content_block_stop event, when all fragments have arrived
- On every input_json_delta
- Before the stream starts
> Fragments aren't valid JSON on their own.

? How do you stop a stream when the user presses Stop?
+ stream.abort()
- Ignore the rest of the events
- Set max_tokens to 0
> Aborting cancels the request and the token cost.
```

:::keypoints
- `client.messages.stream({...})` + `stream.on("text")` for live text; `await stream.finalMessage()` for the full `Message`.
- Raw events are a discriminated union: `message_start`, `content_block_*`, `message_delta`, `message_stop`.
- Tool inputs stream as partial JSON — parse at `content_block_stop`.
- `stream.abort()` cancels; forward streams to browsers as your own small SSE event types.
:::
