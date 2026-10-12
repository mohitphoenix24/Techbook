---
title: Streaming Chat UIs
level: advanced
time: 40
summary: Show answers word-by-word like ChatGPT and Claude. How streaming works (ReadableStream and Server-Sent Events), parsing chunks correctly, a reusable useChatStream hook with a Stop button, auto-scrolling, and the backend that streams from the Claude API.
---

Models generate text a few tokens at a time. Waiting for the whole answer can take 10–30 seconds; **streaming** shows each piece as soon as it exists, so users see progress in under a second.

:::def Streaming
Sending a response in **pieces** (chunks) over one open connection, instead of all at once at the end. The browser reads the pieces as they arrive.
:::

:::def ReadableStream
The browser's built-in object for data that arrives over time. `response.body` from `fetch` is a ReadableStream of bytes; you read it chunk by chunk with a **reader** and turn bytes into text with a **TextDecoder**.
:::

:::def Server-Sent Events (SSE)
A simple text format for streaming **events** over HTTP. Each event is one or more `data: ...` lines followed by a **blank line**:

```text
data: {"type":"text","text":"Hel"}

data: {"type":"text","text":"lo!"}

data: {"type":"done"}

```
:::

## Reading a stream, step by step

```js run level=intermediate
// Make a fake streamed Response — exactly what fetch() gives you from a streaming server
function fakeStream(pieces, delay = 120) {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      for (const p of pieces) {
        await new Promise((r) => setTimeout(r, delay));
        controller.enqueue(enc.encode(p));                 // bytes, like a real network
      }
      controller.close();
    },
  }));
}

const res = fakeStream(["Stre", "aming ", "is ", "just ", "reading ", "chunks."]);

const reader = res.body.getReader();
const decoder = new TextDecoder();
let full = "";
while (true) {
  const { value, done } = await reader.read();            // wait for the next chunk
  if (done) break;
  const text = decoder.decode(value, { stream: true });   // bytes → text (handles split emoji/UTF-8)
  full += text;
  console.log(`chunk: ${JSON.stringify(text).padEnd(12)} so far: ${full}`);
}
```

## Parsing SSE safely

:::warn Chunks don't line up with events
The network can split anywhere: one chunk may contain half an event, or three events and a bit. Always **buffer** text and only process complete events (ending in a blank line).
:::

```js run level=advanced
function fakeStream(pieces) {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    start(c) { for (const p of pieces) c.enqueue(enc.encode(p)); c.close(); },
  }));
}

// An async generator that yields parsed SSE events, however the bytes are split
async function* readSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) !== -1) {          // a complete event is ready
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (data) yield JSON.parse(data);
    }
  }
}

// Deliberately awkward chunk boundaries (mid-JSON, mid-event, two events at once):
const res = fakeStream([
  'data: {"type":"te',
  'xt","text":"Hello"}\n\ndata: {"type":"text","text":", "}\n',
  '\ndata: {"type":"text","text":"world!"}\n\ndata: {"type":"do',
  'ne","usage":{"output_tokens":3}}\n\n',
]);

let answer = "";
for await (const event of readSSE(res)) {
  if (event.type === "text") answer += event.text;
  console.log(event.type.padEnd(5), JSON.stringify(event), "→", answer);
}
```

## A streaming chat with a Stop button

Here the whole thing comes together: a fake streaming backend, the SSE parser, a `useChatStream` hook, a Stop button, and auto-scroll.

```jsx run level=advanced
import { useEffect, useRef, useState } from "react";

// ---------- pretend backend: streams SSE like the real one below --------------------
function fakeChatServer({ messages, signal }) {
  const last = messages.at(-1).content;
  const reply = `You said "${last}". Streaming sends the answer in small pieces, so you see it being written instead of waiting for the whole reply. Press Stop at any time to cancel the request.`;
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      for (const word of reply.split(/(?<= )/)) {
        if (signal.aborted) return controller.error(new DOMException("Aborted", "AbortError"));
        await new Promise((r) => setTimeout(r, 45));
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "text", text: word })}\n\n`));
      }
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      controller.close();
    },
  }));
}

async function* readSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      if (line.startsWith("data:")) yield JSON.parse(line.slice(5));
    }
  }
}

// ---------- the reusable hook --------------------------------------------------------
function useChatStream() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("idle");          // idle | streaming | error
  const controllerRef = useRef(null);

  const appendToLast = (text) =>
    setMessages((ms) => [...ms.slice(0, -1), { ...ms.at(-1), content: ms.at(-1).content + text }]);

  async function send(text) {
    const history = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);   // empty bubble to stream into
    setStatus("streaming");
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      // real app: const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages: history }), signal: controller.signal });
      const res = fakeChatServer({ messages: history, signal: controller.signal });
      for await (const event of readSSE(res)) {
        if (event.type === "text") appendToLast(event.text);
        if (event.type === "error") throw new Error(event.message);
      }
      setStatus("idle");
    } catch (err) {
      if (err.name === "AbortError") { appendToLast(" ⏹"); setStatus("idle"); }
      else setStatus("error");
    }
  }
  const stop = () => controllerRef.current?.abort();
  return { messages, status, send, stop };
}

// ---------- the UI -------------------------------------------------------------------
export default function App() {
  const { messages, status, send, stop } = useChatStream();
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages]);   // follow the stream

  function onSubmit(e) {
    e.preventDefault();
    if (!draft.trim() || status === "streaming") return;
    send(draft.trim());
    setDraft("");
  }

  return (
    <div className="stack" style={{ maxWidth: 480 }}>
      <div className="stack" style={{ maxHeight: 260, overflowY: "auto", padding: 4 }}>
        {messages.length === 0 && <p className="muted">Say hello 👋</p>}
        {messages.map((m, i) => (
          <div key={i} className="card" style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%",
            background: m.role === "user" ? "var(--accent)" : undefined, color: m.role === "user" ? "white" : undefined }}>
            {m.content}
            {status === "streaming" && i === messages.length - 1 && <span className="cursor">▍</span>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={onSubmit} className="row">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message…" aria-label="Message" style={{ flex: 1 }} />
        {status === "streaming"
          ? <button type="button" onClick={stop}>■ Stop</button>
          : <button className="primary" disabled={!draft.trim()}>Send</button>}
      </form>
      {status === "error" && <p role="alert" className="error">The response failed. Try again.</p>}
    </div>
  );
}
```

## The real backend: streaming from Claude

```js
// Express route that turns the SDK's stream into simple SSE events for the browser
app.post("/api/chat", async (req, res) => {
  const messages = validateMessages(req.body?.messages);         // check roles, lengths, count
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  const stream = client.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    system: "You are a helpful assistant.",
    messages,
  });
  res.on("close", () => stream.abort());                         // user pressed Stop / closed the tab

  stream.on("text", (text) => send({ type: "text", text }));     // just the new text

  try {
    const final = await stream.finalMessage();
    send({ type: "done", stop_reason: final.stop_reason, usage: final.usage });
  } catch (err) {
    if (!res.writableEnded) send({ type: "error", message: "The model stream failed." });
  }
  res.end();
});
```

```python
# FastAPI equivalent
from fastapi.responses import StreamingResponse
import json

@app.post("/api/chat")
async def chat(body: ChatRequest):
    async def events():
        async with client.messages.stream(
            model="claude-opus-5-5", max_tokens=16000, messages=body.messages,
        ) as stream:
            async for text in stream.text_stream:
                yield f"data: {json.dumps({'type': 'text', 'text': text})}\n\n"
            final = await stream.get_final_message()
            yield f"data: {json.dumps({'type': 'done', 'stop_reason': final.stop_reason})}\n\n"
    return StreamingResponse(events(), media_type="text/event-stream")
```

:::tip Why your own simple events?
The model API streams many event types (`message_start`, `content_block_delta`, …). Converting them on the server into **your own small format** (`text`, `tool`, `done`, `error`) keeps the front end simple, and lets you switch models or providers without touching React.
:::

## Performance tips for long answers

- **Batch updates**: tokens can arrive faster than the screen refreshes. Collect text in a ref and flush it to state with `requestAnimationFrame` (or every ~30 ms).
- **Memoise old messages** (or let the React Compiler do it) so only the streaming message re-renders.
- **Only auto-scroll if the user is already at the bottom** — don't yank them away while they read earlier text.
- Use `startTransition` for expensive work like Markdown rendering of a long, growing answer.

```js
// batching tokens with requestAnimationFrame
const pending = useRef("");
const frame = useRef(0);
function onToken(text) {
  pending.current += text;
  if (!frame.current) frame.current = requestAnimationFrame(() => {
    const chunk = pending.current; pending.current = ""; frame.current = 0;
    appendToLast(chunk);                       // one state update per frame, not per token
  });
}
```

:::ai
`EventSource` (the browser's built-in SSE client) only supports **GET** without a body, so chat apps usually `fetch` with POST and parse SSE themselves — exactly the `readSSE` function above. Libraries like the **Vercel AI SDK** (`useChat`) package this pattern, but now you know what they do inside.
:::

## Check yourself

```quiz
? Why do you need a buffer when parsing SSE?
+ Network chunks can split an event in the middle or contain several events
- Because JSON.parse is slow
- To store the chat history
> Only process complete events (ending with a blank line).

? How does the Stop button actually stop generation?
+ It aborts the fetch; the server sees the closed connection and aborts the model stream
- It hides the message
- It sets status to idle only
> Aborting frees the server and stops paying for tokens.

? What does `decoder.decode(value, { stream: true })` protect against?
+ Multi-byte characters (like emoji) split across two chunks
- Slow networks
- XSS attacks
> stream:true keeps incomplete bytes for the next chunk.
```

:::keypoints
- Streaming shows progress immediately; `response.body` is a `ReadableStream` read with a reader + `TextDecoder`.
- SSE events are `data:` lines ending in a blank line — **buffer** and parse only complete events.
- A `useChatStream` hook manages messages, status and an `AbortController` for **Stop**.
- The backend converts the SDK stream (`stream.on("text")` / `text_stream`) to simple SSE events and aborts when the client disconnects.
- Batch token updates, auto-scroll politely, and memoise finished messages.
:::
