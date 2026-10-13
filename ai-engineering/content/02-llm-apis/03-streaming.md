---
title: Streaming Responses
level: intermediate
time: 35
summary: Why every chat UI streams, how server-sent events carry tokens, the event types of a streamed response (including tool calls and thinking), parsing a stream yourself, handling cancellation and mid-stream errors, and streaming safely through your own backend to a browser.
---

A 600-token answer takes about eight seconds to generate. If you wait for the whole thing, users stare at a spinner. If you **stream**, the first words appear in half a second and the rest flow in while they read. Streaming does not make the model faster; it makes the product **feel** fast, and it is required for very long outputs to avoid HTTP timeouts.

## What streaming is on the wire

Streaming uses **Server-Sent Events (SSE)**: one long-lived HTTP response whose body is a series of text events.

```text
event: message_start
data: {"type":"message_start","message":{"id":"msg_01","role":"assistant","usage":{"input_tokens":25}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo!"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}

event: message_stop
data: {"type":"message_stop"}
```

The shape is the same across providers: **start**, then many **deltas** (small pieces of text, thinking, or tool-call JSON), then **stop** events carrying the stop reason and final usage. Each event is `event:` and `data:` lines, terminated by a blank line.

## Parse a stream yourself

SDKs do this for you, but writing the parser once makes the protocol concrete.

```python run title="An SSE parser and message assembler" level=intermediate
import json

raw = """event: message_start
data: {"type":"message_start","message":{"id":"msg_01","usage":{"input_tokens":25}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Streaming "}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"makes it "}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"feel fast."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}

event: message_stop
data: {"type":"message_stop"}

"""

def parse_sse(text):
    """Yield (event_name, data_dict) for each event. Events are separated by blank lines."""
    for chunk in text.strip().split("\n\n"):
        name, data = None, []
        for line in chunk.splitlines():
            if line.startswith("event:"):
                name = line[6:].strip()
            elif line.startswith("data:"):
                data.append(line[5:].strip())
        if data:
            yield name, json.loads("\n".join(data))

blocks, usage, stop = {}, {}, None
for name, ev in parse_sse(raw):
    if name == "message_start":
        usage.update(ev["message"]["usage"])
    elif name == "content_block_start":
        blocks[ev["index"]] = {"type": ev["content_block"]["type"], "text": ""}
    elif name == "content_block_delta":
        d = ev["delta"]
        if d["type"] == "text_delta":
            blocks[ev["index"]]["text"] += d["text"]
            print(d["text"], end="|", flush=True)          # what a UI would paint immediately
    elif name == "message_delta":
        stop = ev["delta"]["stop_reason"]
        usage.update(ev["usage"])

print("\nassembled:", blocks[0]["text"])
print("stop_reason:", stop, "| usage:", usage)
```

## Simulate token arrival

A generator that yields tokens with delays is how you build and test streaming UIs without calling a real model.

```python run title="Time to first token vs total time" level=easy
def fake_stream(text, ttft=0.6, tps=40):
    """Yield (arrival_time, token). The first token arrives at ttft; then one every 1/tps seconds."""
    t = ttft
    for tok in text.split(" "):
        yield t, tok + " "
        t += 1 / tps

answer = " ".join(["word"] * 80)          # an 80-token answer
events = list(fake_stream(answer))
first, last = events[0][0], events[-1][0]
print(f"blocking UI: user sees nothing for {last:.1f}s, then everything")
print(f"streaming UI: first words after {first:.1f}s, finished at {last:.1f}s")
for t, tok in events[:3]:
    print(f"  t={t:4.2f}s paint {tok!r}")
```

## With the real SDK

```python local title="Stream text in Python"
with client.messages.stream(
    model="claude-sonnet-5-5",
    max_tokens=2000,
    messages=[{"role": "user", "content": "Explain streaming in three sentences."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    final = stream.get_final_message()            # the full, assembled message at the end

print("\n", final.stop_reason, final.usage)
```

`get_final_message()` is the idiomatic way to get the complete response (with usage) without hand-assembling events. For very large `max_tokens` the SDKs **require** streaming to avoid HTTP timeouts.

### Thinking and tool-call events

Other block types stream through the same envelope: thinking blocks send `thinking_delta`s; a tool call's JSON arguments arrive as `input_json_delta` fragments that you accumulate and parse only when the block stops.

```python local title="Handle several block types"
with client.messages.stream(
    model="claude-opus-5-5",
    max_tokens=16000,
    thinking={"type": "adaptive", "display": "summarized"},
    messages=[{"role": "user", "content": "Plan a three-step study schedule."}],
) as stream:
    for event in stream:
        if event.type == "content_block_start":
            print(f"\n[{event.content_block.type}]")
        elif event.type == "content_block_delta":
            if event.delta.type == "thinking_delta":
                print(event.delta.thinking, end="", flush=True)
            elif event.delta.type == "text_delta":
                print(event.delta.text, end="", flush=True)
```

:::warn Partial tool-call JSON is not valid JSON
While a tool call streams, the accumulated string is a **prefix** of the arguments. Never execute a tool, or `json.loads`, until the block (and the stop reason) says it is complete. If `stop_reason` is `max_tokens` the arguments were truncated: do not run them.
:::

## Streaming through your own backend

Your browser should not hold the API key, so a typical app proxies the stream: **browser → your server → provider**, and the server relays events as SSE or over a WebSocket.

```python local title="A FastAPI endpoint that relays tokens as SSE"
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import anthropic, json

app = FastAPI()
client = anthropic.AsyncAnthropic()

@app.post("/chat")
async def chat(payload: dict):
    async def gen():
        async with client.messages.stream(
            model="claude-sonnet-5-5", max_tokens=1500,
            messages=payload["messages"],
        ) as stream:
            async for text in stream.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")
```

Things that bite in production:

- **Buffering proxies** (nginx, some CDNs, some serverless platforms) hold responses until complete. Disable buffering (`X-Accel-Buffering: no`), and test through your real infrastructure.
- **Cancellation:** when the user clicks Stop or closes the tab, **abort the upstream request** so you stop paying for tokens nobody reads. Handle client disconnects.
- **Errors mid-stream:** the HTTP status was already 200, so errors arrive as an `error` event or a dropped connection. The UI needs a "something went wrong, retry" path, and you need to decide whether to keep the partial text.
- **Moderation and guardrails** are harder when tokens stream: either check **chunks** as they arrive, buffer a few sentences, or stream and then retract. Know the trade-off.
- **Structured output** (JSON) cannot be parsed until complete. For streaming UIs, use incremental parsers or stream a human-readable part first.
- **Store the final message** server-side (and its usage) once; do not rebuild it from client-side pieces.

## Rendering well

- Append tokens to a buffer and render with `requestAnimationFrame`, not on every token event, to avoid layout thrash.
- Render Markdown incrementally and tolerate half-open code fences and tables while text is mid-stream.
- Auto-scroll only if the user is already at the bottom.
- Show a stop button and a typing indicator; keep a visible way to copy.

```quiz
? What is the main benefit of streaming?
- The model generates faster
+ Users see the first tokens sooner, so the feature feels faster, and long outputs avoid timeouts
- It is cheaper per token
> Total generation time is the same; perceived latency is much lower.

? Why must you not parse a tool call's arguments while it is still streaming?
- The arguments are encrypted
+ They arrive as a partial JSON prefix and may be incomplete or truncated
- Tools run only after the full response
> Wait for the block to finish and check the stop reason before executing.

? A user closes the tab mid-answer. What should the server do?
+ Abort the upstream model request so it stops generating billable tokens
- Keep generating, because it was already started
- Retry from the start
> Cancellation propagation saves cost.

? Why might streaming "not work" behind a reverse proxy?
- SSE is not HTTP
+ The proxy may buffer the response until it ends; disable buffering for the route
- Browsers block it
> Buffering defeats the whole point of streaming.
```

:::keypoints
- Streaming improves perceived latency (time to first token) and avoids timeouts; it does not speed generation.
- SSE sends start → many deltas → stop events; text, thinking and tool-call JSON all stream as deltas.
- Use the SDK's stream helpers and `get_final_message()`; parse tool arguments only when complete.
- Proxy through your backend, disable buffering, propagate cancellation, and design for mid-stream errors.
:::

:::resources
- [Claude docs: Streaming](https://docs.claude.com/en/docs/build-with-claude/streaming) — all event types, with examples.
- [MDN: Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) — the protocol itself.
- [Vercel AI SDK](https://ai-sdk.dev/docs) — a popular TypeScript toolkit for streaming chat UIs.
- [OpenAI: Realtime guide](https://platform.openai.com/docs/guides/realtime) — streaming audio and low-latency interaction.
:::
