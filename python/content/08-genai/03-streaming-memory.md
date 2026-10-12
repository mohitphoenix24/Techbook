---
title: Streaming & Conversation Memory
level: intermediate
time: 32
summary: Show answers word by word as they are generated, understand stream events, and manage chat memory — sliding windows, token budgets and summaries — so conversations stay fast and affordable.
---

Users hate staring at a spinner. **Streaming** shows the answer as it is generated — the first words appear in well under a second instead of after the whole reply is done. And as conversations grow, **memory management** keeps them within the context window and your budget.

## Streaming

:::def Streaming
Receiving the model's output **incrementally**, as small chunks (events) over an open connection, instead of waiting for the complete response. Under the hood the API uses **Server-Sent Events (SSE)**.
:::

:::def Time to first token (TTFT)
How long until the user sees the first piece of the answer. Streaming doesn't make the total generation faster, but it makes TTFT tiny — which is what users *feel*.
:::

### Simulated streaming (runs here)

```python run level=easy
import asyncio
import time

ANSWER = "Streaming sends the answer in small pieces, so your interface can show each word the moment it is generated."

async def fake_stream(text, delay=0.06):
    for word in text.split(" "):
        await asyncio.sleep(delay)          # tokens arriving over the network
        yield word + " "

async def main():
    start = time.perf_counter()
    first = None
    async for chunk in fake_stream(ANSWER):
        if first is None:
            first = time.perf_counter() - start
        print(chunk, end="", flush=True)
    total = time.perf_counter() - start
    print(f"\n\ntime to first token: {first:.2f}s | total: {total:.2f}s")

asyncio.run(main())
```

### Streaming with Claude (run locally)

```python local title="The simplest stream: text_stream"
import anthropic

client = anthropic.Anthropic()

with client.messages.stream(
    model="claude-opus-5-5",
    max_tokens=64000,
    messages=[{"role": "user", "content": "Write a short poem about Python."}],
) as stream:
    for text in stream.text_stream:          # yields text pieces as they arrive
        print(text, end="", flush=True)
    final = stream.get_final_message()        # the complete Message, with usage

print("\n\nstop_reason:", final.stop_reason, "| output tokens:", final.usage.output_tokens)
```

:::tip Stream long outputs
For requests that may produce long outputs (large `max_tokens`), streaming also avoids HTTP timeouts. If you just want the final message without handling events, the `.stream()` helper's `get_final_message()` gives it to you.
:::

### Stream events

Under `text_stream`, the API sends typed **events**. Knowing them lets you show thinking, tool calls or progress:

| Event | Meaning |
|---|---|
| `message_start` | a new message begins (model, initial usage) |
| `content_block_start` | a new block begins: `text`, `thinking` or `tool_use` |
| `content_block_delta` | a piece of a block: `text_delta`, `thinking_delta`, `input_json_delta` |
| `content_block_stop` | the block is complete |
| `message_delta` | final `stop_reason` and output-token usage |
| `message_stop` | done |

```python local title="Handling raw events"
import anthropic

client = anthropic.Anthropic()
with client.messages.stream(
    model="claude-opus-5-5",
    max_tokens=64000,
    thinking={"type": "adaptive", "display": "summarized"},
    messages=[{"role": "user", "content": "How many prime numbers are there below 50?"}],
) as stream:
    for event in stream:
        if event.type == "content_block_start":
            print(f"\n[{event.content_block.type}] ", end="")
        elif event.type == "content_block_delta":
            if event.delta.type == "thinking_delta":
                print(event.delta.thinking, end="", flush=True)
            elif event.delta.type == "text_delta":
                print(event.delta.text, end="", flush=True)
```

Here's the same event-handling logic against a simulated event stream:

```python run level=intermediate
from types import SimpleNamespace as NS

events = [
    NS(type="message_start"),
    NS(type="content_block_start", content_block=NS(type="thinking")),
    NS(type="content_block_delta", delta=NS(type="thinking_delta", thinking="Count primes: 2,3,5,7,11,13,17,19,23,29,31,37,41,43,47.")),
    NS(type="content_block_stop"),
    NS(type="content_block_start", content_block=NS(type="text")),
    NS(type="content_block_delta", delta=NS(type="text_delta", text="There are ")),
    NS(type="content_block_delta", delta=NS(type="text_delta", text="15 primes below 50.")),
    NS(type="content_block_stop"),
    NS(type="message_delta", delta=NS(stop_reason="end_turn"), usage=NS(output_tokens=48)),
    NS(type="message_stop"),
]

answer = ""
for event in events:
    if event.type == "content_block_start":
        print(f"\n[{event.content_block.type}] ", end="")
    elif event.type == "content_block_delta":
        if event.delta.type == "thinking_delta":
            print(event.delta.thinking, end="")
        elif event.delta.type == "text_delta":
            print(event.delta.text, end="")
            answer += event.delta.text
    elif event.type == "message_delta":
        print(f"\n\nstop_reason={event.delta.stop_reason}, output_tokens={event.usage.output_tokens}")
print("final answer:", answer)
```

### Streaming to a web page

In a web app, your Python server receives the stream from the model and forwards it to the browser. With FastAPI:

```python local title="api.py — stream Claude's answer to the browser (SSE)"
import json
import anthropic
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI()
client = anthropic.AsyncAnthropic()

class ChatRequest(BaseModel):
    messages: list[dict]

@app.post("/chat")
async def chat(req: ChatRequest):
    async def event_stream():
        async with client.messages.stream(
            model="claude-opus-5-5", max_tokens=64000, messages=req.messages,
        ) as stream:
            async for text in stream.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"      # one SSE event per chunk
        yield "data: [DONE]\n\n"
    return StreamingResponse(event_stream(), media_type="text/event-stream")
# run with:  uvicorn api:app --reload
```

The React track of this site shows how to consume such a stream in the browser.

## Conversation memory

:::def Context window
The maximum number of tokens the model can consider in one request — system prompt, all messages, documents and the output. Large today (hundreds of thousands to a million tokens), but every token still costs money and time.
:::

Because the API is stateless, "memory" is simply **what you choose to send**. Common strategies:

| Strategy | How | Trade-off |
|---|---|---|
| **Full history** | send everything | simplest; cost grows every turn |
| **Sliding window** | keep the last N messages | cheap; forgets early facts |
| **Token budget** | keep the newest messages that fit a token budget | predictable cost |
| **Summary + recent** | summarise old turns into one note, keep recent turns verbatim | remembers the gist cheaply |
| **Retrieval memory** | store facts/turns in a vector DB, retrieve relevant ones | scales to long-term memory |
| **Server-side compaction** | the API summarises earlier context for you (Claude supports this for long sessions) | least code |

### Sliding window and token budget

```python run level=intermediate
def approx_tokens(text: str) -> int:
    return max(1, len(text) // 4)

def trim_to_budget(messages, budget_tokens, keep_first=0):
    """Keep the newest messages that fit in the budget (optionally pin the first few)."""
    pinned, rest = messages[:keep_first], messages[keep_first:]
    used = sum(approx_tokens(m["content"]) for m in pinned)
    kept = []
    for m in reversed(rest):                   # walk from newest to oldest
        cost = approx_tokens(m["content"])
        if used + cost > budget_tokens:
            break
        kept.append(m)
        used += cost
    trimmed = pinned + list(reversed(kept))
    while len(trimmed) > keep_first and trimmed[keep_first]["role"] != "user":
        trimmed.pop(keep_first)                # the conversation must start with a user turn
    return trimmed, used

history = []
for i in range(1, 9):
    history.append({"role": "user", "content": f"Question {i}: " + "details " * (5 * i)})
    history.append({"role": "assistant", "content": f"Answer {i}: " + "explanation " * (6 * i)})

trimmed, used = trim_to_budget(history, budget_tokens=200)
print(f"full history: {len(history)} messages, ~{sum(approx_tokens(m['content']) for m in history)} tokens")
print(f"trimmed:      {len(trimmed)} messages, ~{used} tokens")
print("kept:", [m["content"].split(":")[0] for m in trimmed])
```

### Summary + recent turns

```python run level=advanced
def fake_summarize(messages):
    """Stand-in for an LLM call like: 'Summarize the key facts and decisions in this conversation.'"""
    facts = [m["content"] for m in messages if m["role"] == "user"]
    return "Earlier the user said: " + "; ".join(facts)

class SummaryMemory:
    def __init__(self, max_recent=4):
        self.max_recent = max_recent
        self.summary = ""
        self.recent = []

    def add(self, role, content):
        self.recent.append({"role": role, "content": content})
        if len(self.recent) > self.max_recent:
            overflow = self.recent[:-self.max_recent]
            self.recent = self.recent[-self.max_recent:]
            old = [{"role": "user", "content": self.summary}] if self.summary else []
            self.summary = fake_summarize(old + overflow)

    def build_request(self, system):
        sys_prompt = system + (f"\n\n<conversation_summary>\n{self.summary}\n</conversation_summary>" if self.summary else "")
        return {"system": sys_prompt, "messages": self.recent}

mem = SummaryMemory(max_recent=4)
turns = [("user", "My name is Ada and I'm building a RAG app."), ("assistant", "Great! What data?"),
         ("user", "PDF manuals for washing machines."), ("assistant", "Nice. Which vector DB?"),
         ("user", "Probably Chroma."), ("assistant", "Good choice for prototypes."),
         ("user", "How should I chunk the PDFs?")]
for role, text in turns:
    mem.add(role, text)

req = mem.build_request("You are a helpful AI engineering mentor.")
print(req["system"])
print("\nrecent messages:")
for m in req["messages"]:
    print(f"  {m['role']}: {m['content']}")
```

:::warn Summaries lose detail
Every summary drops information. Pin truly important facts (user preferences, IDs, decisions) separately — e.g. in a small "facts" store you always include — rather than trusting them to survive repeated summarisation.
:::

### Long-term memory with retrieval

For assistants that should remember things across sessions ("I'm vegetarian", "my project uses Postgres"), store facts and retrieve the relevant ones per question — exactly the RAG idea from the next lessons:

```python run level=advanced
import re
from collections import Counter

memories = [
    "User is vegetarian.",
    "User's project uses PostgreSQL and FastAPI.",
    "User prefers answers with Python code examples.",
    "User lives in Pune, India.",
]

def words(t):
    return Counter(re.findall(r"[a-z]+", t.lower()))

def recall(query, k=2):
    q = words(query)
    scored = sorted(memories, key=lambda m: -sum((words(m) & q).values()))
    return [m for m in scored[:k] if sum((words(m) & q).values()) > 0]

for question in ["Suggest a dinner recipe, I'm vegetarian-friendly please", "How do I connect FastAPI to my database (PostgreSQL)?"]:
    print(f"Q: {question}\n   relevant memories: {recall(question)}")
```

(Real systems use embeddings instead of word overlap, plus an LLM step that decides which new facts are worth saving.)

:::ai
Chat apps combine these: **stream** every answer, keep the **recent turns** verbatim, carry a **summary** or pinned **facts**, retrieve **long-term memories** when relevant, and use **prompt caching** so the unchanging system prompt and early history are cheap to resend.
:::

## Check yourself

```quiz
? What does streaming improve the most?
+ Time to first token — the user sees output almost immediately
- Total generation time
- Answer quality
> The full answer takes about as long; it just starts showing sooner.

? In a stream, text arrives in which event type?
+ content_block_delta with a text_delta
- message_start
- message_stop
> Thinking arrives as thinking_delta; tool inputs as input_json_delta.

? A sliding-window memory keeps the last 6 messages. What's the downside?
+ It forgets facts from early in the conversation
- It makes every request more expensive
- It breaks streaming
> Combine with a summary or pinned facts.

? Why must the trimmed history start with a user message?
+ The Messages API requires the conversation to begin with a user turn
- To save tokens
- Assistant messages can't be first for security reasons
> trim_to_budget drops leading assistant messages for this reason.
```

:::keypoints
- **Stream** to cut time-to-first-token; use `messages.stream(...)` and `text_stream`, or handle typed events.
- Stream events: `message_start` → `content_block_start/delta/stop` → `message_delta` → `message_stop`.
- Forward streams to browsers with **SSE** (e.g. FastAPI `StreamingResponse`).
- Memory = what you send: sliding window, token budget, summary + recent, retrieval memory, or server-side compaction.
- Pin critical facts; summaries lose detail.
:::
