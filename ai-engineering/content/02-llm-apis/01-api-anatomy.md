---
title: Anatomy of an LLM API Call
level: easy
time: 40
summary: Everything inside a request and a response — messages and roles, the system prompt, content blocks, max_tokens, stop reasons, usage, thinking and effort — shown first with a mock API you can run in the browser, then with the real Anthropic SDK. Plus the stateless-conversation pattern every chatbot is built on.
---

Whatever provider you use (Anthropic, OpenAI, Google, an open model behind vLLM) a chat-completion call has the same shape: **you send a list of messages and some settings; you get back content and bookkeeping.** Learn it once and every SDK looks familiar.

## The request

```text
POST /v1/messages
{
  "model": "claude-sonnet-5-5",
  "max_tokens": 1024,
  "system": "You are a helpful, concise assistant.",
  "messages": [
    {"role": "user", "content": "What is a token?"}
  ]
}
```

| Field | Meaning | Notes |
|---|---|---|
| `model` | which model to run | pin an exact version in production |
| `messages` | the conversation so far, alternating `user` / `assistant` | you resend the **entire** history each call |
| `system` | standing instructions: role, rules, format | not a message in the list on Claude's API; a separate field on most APIs |
| `max_tokens` | hard cap on output tokens | counts the reply (and thinking), not the input |
| `tools` | functions the model may call | next lessons |
| `stream` | send tokens as they are generated | the streaming lesson |
| `thinking`, `output_config.effort` | reasoning controls on current models | later in this lesson |
| `temperature`, `top_p`, `top_k` | sampling | **not accepted** on the newest Claude models; see the decoding lesson |

### Roles

:::def Role
Each message has a role. **`system`** instructions set behaviour and have the highest priority. **`user`** is the person (or your program) asking. **`assistant`** is the model's earlier replies, which you send back so it "remembers". Tool results come back to the model as part of a `user` turn.
:::

### Content: a string or a list of blocks

`content` can be a plain string, or a **list of content blocks** that mix types: text, images, documents, tool results. The model's reply is also a list of blocks (text, thinking, tool calls).

```python local title="Block-style content"
messages = [{
    "role": "user",
    "content": [
        {"type": "image", "source": {"type": "url", "url": "https://example.com/chart.png"}},
        {"type": "text", "text": "What trend does this chart show?"},
    ],
}]
```

## The response

```text
{
  "id": "msg_01...",
  "model": "claude-sonnet-5-5",
  "role": "assistant",
  "content": [ {"type": "text", "text": "A token is a chunk of text..."} ],
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 21, "output_tokens": 64, "cache_read_input_tokens": 0}
}
```

| Field | What to do with it |
|---|---|
| `content` | a **list** of blocks: loop over it and check each block's `type`; never assume `content[0]` is text |
| `stop_reason` | `end_turn` (finished), `max_tokens` (cut off), `stop_sequence`, `tool_use` (it wants a tool run), `pause_turn` (resume), `refusal` (declined for safety) |
| `usage` | input and output token counts (and cache reads/writes): log them for cost tracking |
| `id` | log it; providers use it to debug problems |

:::warn Always branch on stop_reason
`max_tokens` means the answer is **truncated**: possibly broken JSON, a half-finished code block. Treat it as an error path (raise the limit, shorten the task, or continue). `refusal` is a normal HTTP 200 with no useful content, so check for it before reading the text.
:::

## A mock API you can run

Real calls need a key, so here is a tiny fake "model" with the same request/response shape. It is rule-based, but your **client code** is identical to what you would write for a real API.

```python run title="A mock Messages API" level=easy
from dataclasses import dataclass, field

@dataclass
class Block:
    type: str
    text: str = ""

@dataclass
class Response:
    content: list
    stop_reason: str
    usage: dict
    model: str = "mock-1"

def count_tokens(text):                       # crude estimate: ~4 characters per token
    return max(1, len(text) // 4)

class MockClient:
    """Pretends to be an LLM API. Same shape as the real thing."""
    def create(self, model, max_tokens, messages, system=""):
        last = messages[-1]["content"]
        if isinstance(last, list):                       # content blocks -> join the text ones
            last = " ".join(b["text"] for b in last if b["type"] == "text")
        reply = {"hello": "Hello! How can I help?", "token": "A token is a chunk of text, about 4 characters."}
        text = next((v for k, v in reply.items() if k in last.lower()), "I'm a mock model, so I only know a few things.")
        if system and "pirate" in system.lower():
            text = "Arr! " + text
        in_tokens = count_tokens(system + " ".join(str(m["content"]) for m in messages))
        out_tokens = count_tokens(text)
        if out_tokens > max_tokens:                      # enforce max_tokens like a real API
            text = text[: max_tokens * 4]
            return Response([Block("text", text)], "max_tokens", {"input_tokens": in_tokens, "output_tokens": max_tokens})
        return Response([Block("text", text)], "end_turn", {"input_tokens": in_tokens, "output_tokens": out_tokens})

client = MockClient()
r = client.create("mock-1", 100, [{"role": "user", "content": "What is a token?"}], system="You are a pirate.")
for block in r.content:
    if block.type == "text":
        print(block.text)
print("stop_reason:", r.stop_reason, "| usage:", r.usage)

r = client.create("mock-1", 3, [{"role": "user", "content": "What is a token?"}])
print("\nwith max_tokens=3 ->", repr(r.content[0].text), "| stop_reason:", r.stop_reason)
```

## Conversations are just resent history

The API is **stateless**. A chatbot keeps the history list itself and sends it all every turn.

```python run title="A conversation manager" level=intermediate
class Conversation:
    def __init__(self, client, system="", max_tokens=200, model="mock-1"):
        self.client, self.system, self.max_tokens, self.model = client, system, max_tokens, model
        self.messages = []
        self.total_in = self.total_out = 0

    def send(self, user_text):
        self.messages.append({"role": "user", "content": user_text})
        r = self.client.create(self.model, self.max_tokens, self.messages, self.system)
        text = "".join(b.text for b in r.content if b.type == "text")
        self.messages.append({"role": "assistant", "content": text})      # keep the assistant turn!
        self.total_in += r.usage["input_tokens"]
        self.total_out += r.usage["output_tokens"]
        return text, r

# reuse the MockClient from above (re-declared compactly so this block runs on its own)
from dataclasses import dataclass
@dataclass
class Block: type: str; text: str = ""
@dataclass
class Resp: content: list; stop_reason: str; usage: dict
class MockClient:
    def create(self, model, max_tokens, messages, system=""):
        text = "Hello! How can I help?" if len(messages) == 1 else f"(turn {len(messages)//2 + 1}) I can see {len(messages)} messages of history."
        tin = len(system + " ".join(m["content"] for m in messages)) // 4 + 1
        return Resp([Block("text", text)], "end_turn", {"input_tokens": tin, "output_tokens": len(text) // 4 + 1})

chat = Conversation(MockClient(), system="Be brief.")
for q in ["hello", "tell me more", "and more?", "last one"]:
    text, r = chat.send(q)
    print(f"user: {q:14} -> {text}   [input tokens this call: {r.usage['input_tokens']}]")
print("total tokens in/out:", chat.total_in, chat.total_out)
```

Look at the **input tokens growing every turn**: each call re-sends everything. A 50-turn conversation costs far more than 50× one turn, which is why the memory lessons (module 3) and prompt caching matter.

## The real thing, with the Anthropic SDK

```python local title="A real call, with error handling"
import anthropic

client = anthropic.Anthropic()          # reads ANTHROPIC_API_KEY

try:
    response = client.messages.create(
        model="claude-sonnet-5-5",
        max_tokens=1024,
        system="You are a helpful, concise assistant.",
        messages=[{"role": "user", "content": "What is a token?"}],
    )
except anthropic.RateLimitError:
    print("Slow down: rate limited (the SDK already retried twice)")
except anthropic.APIStatusError as e:
    print("API error", e.status_code, e.message)
else:
    if response.stop_reason == "refusal":
        print("The model declined:", response.stop_details)
    elif response.stop_reason == "max_tokens":
        print("Truncated! Raise max_tokens.")
    for block in response.content:
        if block.type == "text":
            print(block.text)
    print(response.usage)
```

### Multi-turn with the real client

```python local title="Resending history"
history = []
def ask(text):
    history.append({"role": "user", "content": text})
    r = client.messages.create(model="claude-sonnet-5-5", max_tokens=1024, messages=history)
    answer = "".join(b.text for b in r.content if b.type == "text")
    history.append({"role": "assistant", "content": answer})
    return answer

print(ask("My name is Priya."))
print(ask("What is my name?"))          # works because the first turn is in `history`
```

## Thinking and effort (current Claude models)

Reasoning-capable models can **think before answering**. On the newest Claude models you do not set a token budget for thinking: you use **adaptive thinking** (the model decides how much) and an **`effort`** level that trades quality for speed and cost.

```python local title="Adaptive thinking and effort"
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    thinking={"type": "adaptive", "display": "summarized"},   # show a summary of the reasoning
    output_config={"effort": "high"},                          # low | medium | high | xhigh | max
    messages=[{"role": "user", "content": "Find the bug: def avg(xs): return sum(xs) / len(xs) + 1"}],
)
for block in response.content:
    if block.type == "thinking":
        print("[thinking summary]", block.thinking)
    elif block.type == "text":
        print(block.text)
```

| Effort | Use for |
|---|---|
| `low` | classification, routing, simple extraction, chat |
| `medium` | everyday tasks (the default on some models, so set it explicitly) |
| `high` / `xhigh` | coding, agents, multi-step reasoning |
| `max` | when correctness matters more than cost |

Thinking tokens are billed as output. Defaults differ per model, so **set effort explicitly** and check the model's page. Older models used a fixed thinking budget in tokens; on the newest models that parameter is rejected.

## What *not* to send

- **Prefilling** the assistant's reply (starting its answer for it) is rejected by the newest models. Use instructions or structured outputs for format control.
- **Non-default sampling parameters** are rejected by some of them.
- **Secrets and personal data** you do not need: everything you send is processed and may be logged by you and the provider.

```quiz
? Why do you send the full message history on every call?
- To make the answer longer
+ The API is stateless; the model only knows what is in the request
- Because of rate limits
> A chatbot's "memory" is just your app resending prior turns.

? What should you check before using response.content[0].text?
- Nothing, it is always text
+ The block type (it may be thinking or a tool call) and the stop_reason (it may be truncated or refused)
- The model name
> content is a list of typed blocks; stop_reason tells you whether the output is complete.

? Why does a long chat cost more per turn than a short one?
+ Each call re-sends all previous messages as input tokens
- The model gets slower at thinking
- Output tokens cost more over time
> Input tokens grow with history. Truncation, summarisation and caching manage this.

? What does max_tokens limit?
- The input length
+ The number of tokens the model may generate in its reply
- The conversation length
> It is an output cap; hitting it yields stop_reason = max_tokens.
```

:::keypoints
- A call = model + messages (+ system, tools, limits); the reply = a list of content blocks, a stop reason and token usage.
- Roles: system sets rules, user asks, assistant is the model's past replies; tool results come back as user content.
- The API is stateless: resend history each turn. Input cost grows with conversation length.
- Always handle `max_tokens`, `refusal` and errors; log usage and request ids.
- On current Claude models, use adaptive thinking plus an explicit `effort`; do not rely on prefill or sampling knobs.
:::

:::resources
- [Claude API docs](https://docs.claude.com/en/docs/intro) — the Messages API, models, and guides.
- [Anthropic SDK for Python](https://github.com/anthropics/anthropic-sdk-python) — client, streaming helpers, tool runner.
- [OpenAI API: function calling and chat](https://platform.openai.com/docs/guides/function-calling) — the same ideas, different field names.
- [Gemini API docs](https://ai.google.dev/gemini-api/docs) — Google's equivalent.
- [Anthropic Cookbook](https://github.com/anthropics/anthropic-cookbook) — runnable notebooks for each feature.
- [LiteLLM](https://github.com/BerriAI/litellm) — one interface over 100+ providers; useful to see how the shapes line up.
:::
