---
title: The React app and the SSE client
level: easy
time: 40
summary: Types for the contract, one API module, and a streaming parser that copes with chunks cut anywhere, with a live demo of the real parser in your browser.
tags: React, TypeScript, fetch, ReadableStream, SSE parser
---

The back end is done; now the screen. We start at the bottom, with the code that talks to the server, because everything else depends on it. By the end of this lesson you can read a chat stream in TypeScript and prove that the parser is correct.

## Step 1: types for the contract

The five events from lesson 1 become a **discriminated union**, so TypeScript knows which fields exist after you check `type`:

```ts src="pocket-chat/frontend/src/types.ts" region="types" title="frontend/src/types.ts"
```

`ChatMessage.status` is the interesting field: a reply is `streaming` while words arrive, then `done`, or `stopped` (the user pressed Stop), or `error`. One field drives the caret, the "Stopped" notice and the error banner.

## Step 2: one module owns the network

Components never call `fetch` directly. `api.ts` has one small helper for ordinary JSON calls and turns FastAPI's error shape into readable messages:

```ts src="pocket-chat/frontend/src/api.ts" region="request" title="frontend/src/api.ts"
```

FastAPI sends errors as `{"detail": "..."}` (a string for `HTTPException`, a list of problems for 422 validation errors). `errorText` handles both, so every failure becomes an `ApiError` whose message you can show directly.

## Step 3: reading an SSE stream

`fetch` gives us `response.body`, a stream of **bytes**. Turning bytes into events has two traps, and the whole parser exists to avoid them:

1. **Chunks do not respect event boundaries.** One network chunk may hold half an event, or three events. So we keep a text **buffer** and only cut at a blank line.
2. **A character can be split between chunks.** The Hindi letter `न` is three bytes in UTF-8. If a chunk ends after two of them, decoding it alone gives garbage. `TextDecoder.decode(value, { stream: true })` remembers the leftover bytes for the next chunk.

First, the small function that parses one complete event block:

```ts src="pocket-chat/frontend/src/sse.ts" region="parse-block" title="frontend/src/sse.ts"
```

Then the generator that turns a byte stream into a stream of those:

```ts src="pocket-chat/frontend/src/sse.ts" region="parse-stream" title="frontend/src/sse.ts"
```

It is an **async generator** (`async function*`): the caller writes `for await (const message of parseSSE(body)) { ... }` and receives each event the moment it is complete.

## Try the real parser

The block below is the actual `sse.ts` from the project, plus a small page around it. It sends a fake stream through the parser, **cut into pieces of the size you choose**. Press **Parse**, then try size `1` (one byte at a time, worst case) and a large size. The parsed events must be identical every time; only the "chunks" row changes.

```tsx run src="pocket-chat/frontend/src/sse.ts" title="The real SSE parser, with adjustable chunk sizes" level=intermediate autoclick="Parse" wait=800
import { useState } from "react";

const WIRE =
  'event: meta\ndata: {"model":"mock-1"}\n\n' +
  'event: delta\ndata: {"text":"Hello "}\n\n' +
  'event: delta\ndata: {"text":"नमस्ते 👋"}\n\n' +
  'event: done\ndata: {}\n\n';

function chunked(text: string, size: number): { stream: ReadableStream<Uint8Array>; pieces: string[] } {
  const bytes = new TextEncoder().encode(text);
  const pieces: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) pieces.push(bytes.slice(i, i + size));
  const stream = new ReadableStream<Uint8Array>({ start(c) { pieces.forEach((p) => c.enqueue(p)); c.close(); } });
  return { stream, pieces: pieces.map((p) => new TextDecoder().decode(p)) };
}

export default function App() {
  const [size, setSize] = useState(7);
  const [out, setOut] = useState<{ pieces: string[]; events: { event: string; data: string }[] } | null>(null);

  async function parse() {
    const { stream, pieces } = chunked(WIRE, size);
    const events = [];
    for await (const m of parseSSE(stream)) events.push(m);
    setOut({ pieces, events });
  }

  return (
    <div className="stack">
      <div className="row">
        <label>Chunk size: <b>{size}</b> bytes <input type="range" min={1} max={120} value={size} onChange={(e) => setSize(+e.target.value)} /></label>
        <button className="primary" onClick={parse}>Parse</button>
      </div>
      {out && (
        <>
          <div><b>{out.pieces.length} network chunks</b> (the ⟦ ⟧ marks show where each one ends)</div>
          <pre>{out.pieces.map((p) => "⟦" + p.replace(/\n/g, "↵") + "⟧").join(" ")}</pre>
          <div><b>{out.events.length} parsed events</b> (always the same)</div>
          <pre>{out.events.map((e) => e.event + "  " + e.data).join("\n")}</pre>
        </>
      )}
    </div>
  );
}
```

With chunk size 1 you will see the Hindi text and the emoji arrive intact: that is `{ stream: true }` doing its job. Try removing `{ stream: true }` from the code above and parse with size 1 to see the damage.

## Step 4: from events to typed values

`streamChat` ties it together: it POSTs the message, checks the status **before** reading the stream, then yields typed events.

```ts src="pocket-chat/frontend/src/api.ts" region="stream-chat" title="frontend/src/api.ts"
```

Notice:

- A `404` or `422` arrives as a normal failed response, *before* any stream. We read its `detail` and throw.
- The `switch` turns the raw `{event, data}` pairs into the `ServerEvent` union, so the rest of the app gets autocomplete and exhaustiveness checks instead of strings.
- `signal` is passed straight to `fetch`. Aborting it cancels the request and makes the next read throw, which `useChat` treats as "Stop".
- `streamChat` is itself an async generator, so callers simply write `for await (const event of streamChat(...))`.

## Step 5: tests for the parser

The parser is the piece most likely to hide a bug that only appears on a slow network, so it has its own tests, including split events and split multi-byte characters:

```ts src="pocket-chat/frontend/src/sse.test.ts" title="frontend/src/sse.test.ts"
```

Run them with `npm test`. Tests like these are why the demo above is safe to trust.

:::keypoints
- Model the server's events as a discriminated union so TypeScript checks every branch.
- One module (`api.ts`) calls `fetch`; it converts FastAPI's `{"detail": ...}` into readable errors.
- `response.body` is a byte stream: buffer text, cut at blank lines, and decode with `{ stream: true }`.
- An async generator (`async function*`) lets callers `for await` over events as they complete.
- Check the status before reading the stream; pass `signal` to `fetch` so Stop can cancel.
:::

```quiz
? Why can't the parser assume one network chunk equals one SSE event?
- Browsers split chunks randomly by design, so events can never be parsed
+ Networks cut data at arbitrary points, so a chunk may hold part of an event or several events
- Chunks are always exactly 1 KB
> A buffer plus cutting at blank lines makes the parser correct no matter how the bytes are split.
? What does `decoder.decode(value, { stream: true })` protect against?
- Slow networks
+ A multi-byte character being split between two chunks
- Duplicate events
> With stream: true the decoder keeps incomplete bytes and finishes the character with the next chunk.
? Where does a 404 for an unknown conversation show up?
- As an `error` event in the stream
+ As a normal failed response before streaming starts, which streamChat turns into an ApiError
- It is silently ignored
> Status codes are decided before the first byte, so failed checks are ordinary HTTP errors.
```

:::exercise Support a `retry` field
The SSE format also defines `id:` and `retry:` fields. Extend `parseEventBlock` to return them (`id` as a string, `retry` as a number), add two tests, and decide: would Pocket Chat use them? (Hint: `EventSource` uses `id` to resume a dropped stream. Our POST-based stream cannot resume, so we ignore them.)
:::
