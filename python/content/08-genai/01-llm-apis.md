---
title: Calling LLM APIs
level: intermediate
time: 40
summary: Everything about talking to a large language model from Python — the Claude Messages API, roles and system prompts, response content blocks, multi-turn chat, model choice, thinking and effort, tokens and cost, errors and refusals.
---

This is where it all comes together: your Python code sends text to a large language model and gets an answer back. Every chatbot, RAG system and AI agent is built on this one operation. We'll use **Claude** through Anthropic's official Python SDK; other providers follow the same pattern.

:::def LLM API
A web service that runs a large language model for you. You send a **request** (model name, messages, settings) over HTTPS and receive a **response** (the generated content plus usage information). You pay per token.
:::

:::def SDK (Software Development Kit)
A library that wraps an API in convenient Python functions and classes. `pip install anthropic` gives you `anthropic.Anthropic()` with methods like `client.messages.create(...)`, typed response objects, automatic retries and streaming helpers.
:::

## Setup (on your computer)

```bash
pip install anthropic                     # or: uv add anthropic
export ANTHROPIC_API_KEY="sk-ant-..."     # macOS/Linux  (Windows PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-...")
```

Get a key from the [Claude Console](https://platform.claude.com/). Remember the rule from the Environments lesson: keys live in **environment variables** or a git-ignored `.env`, never in your code.

## Your first API call

```python local title="hello_claude.py"
import anthropic

client = anthropic.Anthropic()            # reads ANTHROPIC_API_KEY from the environment

response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Explain what an API is in two sentences."}
    ],
)

for block in response.content:            # the reply is a list of content blocks
    if block.type == "text":
        print(block.text)

print(response.usage)                     # input_tokens, output_tokens, ...
```

### The request, piece by piece

| Parameter | Meaning |
|---|---|
| `model` | which model to run, e.g. `"claude-opus-5-5"` |
| `max_tokens` | the **maximum** number of tokens the model may generate (a hard cap, not a target) |
| `messages` | the conversation so far: a list of `{"role": ..., "content": ...}` dicts |
| `system` | optional instructions that set the model's role, rules and context |
| `stop_sequences` | optional strings that end generation when produced |
| `stream` | receive the answer token by token (see the Streaming lesson) |
| `tools` | functions the model may call (see Tool Calling) |

:::def Message roles
`"user"` messages come from the person (or your program). `"assistant"` messages are the model's previous replies. The conversation must start with a `user` message. Instructions about *how* the model should behave go in the separate `system` parameter.
:::

:::def System prompt
Instructions given to the model outside the conversation — its role, tone, rules, output format and any background context. It is the main lever you have to shape behaviour.
:::

## The response object

The SDK returns a `Message` object. Its main parts:

```python
Message(
    id="msg_01...",
    model="claude-opus-5-5",
    role="assistant",
    content=[TextBlock(type="text", text="An API is ...")],   # a LIST of blocks
    stop_reason="end_turn",                                   # why generation stopped
    usage=Usage(input_tokens=21, output_tokens=58, ...),
)
```

:::def Content blocks
The reply is a **list** of typed blocks, not one string: `text` blocks hold answers, `thinking` blocks hold (summarised) reasoning, `tool_use` blocks hold tool calls. Always check `block.type` before reading `block.text`.
:::

:::def stop_reason
Why the model stopped: `"end_turn"` (finished naturally), `"max_tokens"` (hit your limit — the answer is cut off), `"stop_sequence"`, `"tool_use"` (it wants to call a tool), `"pause_turn"`, or `"refusal"` (declined for safety reasons). Check it before trusting the output.
:::

### Practise with a mock client

To practise in the browser without an API key, here is a **fake client** that returns objects shaped exactly like the real SDK's. Code you write against it works unchanged with `anthropic.Anthropic()`.

```python run level=easy
from dataclasses import dataclass, field

# ---- a tiny stand-in for the anthropic SDK (same shapes as the real objects) ----
@dataclass
class TextBlock:
    text: str
    type: str = "text"

@dataclass
class Usage:
    input_tokens: int
    output_tokens: int

@dataclass
class Message:
    content: list
    stop_reason: str
    usage: Usage
    model: str
    role: str = "assistant"

class FakeMessages:
    def create(self, model, max_tokens, messages, system=None, **kwargs):
        question = messages[-1]["content"]
        answer = f"(pretend answer from {model}) You asked: {question!r}"
        words = answer.split()
        stop = "end_turn"
        if len(words) > max_tokens:                         # pretend 1 word = 1 token
            words, stop = words[:max_tokens], "max_tokens"
        in_tokens = sum(len(m["content"].split()) for m in messages) + len((system or "").split())
        return Message([TextBlock(" ".join(words))], stop, Usage(in_tokens, len(words)), model)

class FakeAnthropic:
    def __init__(self):
        self.messages = FakeMessages()
# -------------------------------------------------------------------------------

client = FakeAnthropic()
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=1024,
    system="You are a friendly tutor.",
    messages=[{"role": "user", "content": "What is an API?"}],
)

text = "".join(b.text for b in response.content if b.type == "text")
print(text)
print("stop_reason:", response.stop_reason)
print("tokens:", response.usage.input_tokens, "in /", response.usage.output_tokens, "out")

short = client.messages.create(model="claude-opus-5-5", max_tokens=5,
                               messages=[{"role": "user", "content": "Tell me everything about APIs"}])
if short.stop_reason == "max_tokens":
    print("\n⚠️ answer was cut off:", short.content[0].text)
```

## System prompts in action

```python local title="Same question, different system prompts"
import anthropic

client = anthropic.Anthropic()
question = [{"role": "user", "content": "What is recursion?"}]

for system in [
    "You are a computer science professor. Be precise and formal.",
    "You explain things to 8-year-olds using fun analogies. Max 3 sentences.",
    "Reply ONLY with a Python code example, no prose.",
]:
    r = client.messages.create(model="claude-opus-5-5", max_tokens=1024, system=system, messages=question)
    print(f"--- {system}\n{r.content[0].text}\n")
```

## Multi-turn conversations

:::def Stateless API
The API does **not** remember previous requests. To continue a conversation you send the **entire history** — every user and assistant message — with each new request.
:::

```python run level=intermediate
class FakeClient:                         # minimal fake: echoes how much history it received
    class messages:
        @staticmethod
        def create(model, max_tokens, messages, system=None):
            n_user = sum(m["role"] == "user" for m in messages)
            return type("R", (), {"content": [type("B", (), {"type": "text", "text": f"(reply #{n_user}, I can see {len(messages)} messages)"})()]})()

class Chat:
    def __init__(self, client, model="claude-opus-5-5", system=None):
        self.client, self.model, self.system = client, model, system
        self.history = []

    def send(self, text):
        self.history.append({"role": "user", "content": text})
        response = self.client.messages.create(model=self.model, max_tokens=1024,
                                               system=self.system, messages=self.history)
        reply = "".join(b.text for b in response.content if b.type == "text")
        self.history.append({"role": "assistant", "content": reply})
        return reply

chat = Chat(FakeClient(), system="You are helpful.")
print(chat.send("Hi, my name is Ada."))
print(chat.send("What's my name?"))
print(chat.send("Thanks!"))
for m in chat.history:
    print(f"{m['role']:>9}: {m['content']}")
```

With the real client, the model answers "Your name is Ada" on the second turn — only because the first message was sent again.

:::warn History grows — and so does the cost
Every turn re-sends the whole conversation, so input tokens (and cost) grow with each message. Long chats need a strategy: keep only the last N turns, summarise older turns, or use prompt caching (see the Performance lesson). Claude also supports server-side compaction for very long agent sessions.
:::

## Choosing a model

| Model | ID | Good for |
|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | the default — strong at reasoning, coding, agents and writing |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | fast, capable everyday work at lower cost |
| Claude Haiku 4.5 | `claude-haiku-4-5` | the fastest and cheapest — classification, extraction, routing |
| Claude Fable 5.1 | `claude-fable-5-1` | Anthropic's most capable model, for the hardest problems |

Model lineups and prices change regularly — check the [models overview](https://platform.claude.com/docs/en/about-claude/models/overview) and pricing pages, or list models from code with `client.models.list()`.

## Thinking and effort

Current Claude models can **think** before answering — an internal reasoning step that improves results on hard problems. Two settings control it:

:::def Adaptive thinking
The model decides by itself when and how much to reason before answering (`thinking={"type": "adaptive"}`). On Claude Opus 5.5 it is always on.
:::

:::def Effort
A dial (`"low"`, `"medium"`, `"high"`, `"xhigh"`, `"max"`) that controls how much the model thinks and how thorough it is. Lower effort = faster and cheaper; higher effort = better on difficult tasks. Set it in `output_config`.
:::

```python local title="Thinking + effort"
import anthropic

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    thinking={"type": "adaptive", "display": "summarized"},   # show a summary of the reasoning
    output_config={"effort": "high"},
    messages=[{"role": "user", "content": "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much is the ball?"}],
)
for block in response.content:
    if block.type == "thinking":
        print("💭", block.thinking)
    elif block.type == "text":
        print("✅", block.text)
```

:::tip Steer with instructions, not temperature
Reasoning models like Claude Opus 5.5 don't accept `temperature` / `top_p` — you control them with your **prompt** and the **effort** setting. Use `effort="low"` for simple, high-volume tasks and `"high"`/`"xhigh"` for hard reasoning or coding.
:::

## Tokens and cost

You pay separately for **input** tokens (everything you send) and **output** tokens (everything generated, including thinking), priced per million tokens.

```python run level=intermediate
PRICES = {                                 # $ per 1M tokens (input, output) — check current pricing
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-4-5": (1.00, 5.00),
}

def request_cost(model, input_tokens, output_tokens):
    p_in, p_out = PRICES[model]
    return (input_tokens * p_in + output_tokens * p_out) / 1_000_000

# A support bot: 3,000-token system prompt + docs, 200-token question, 400-token answer, 50,000 chats/month
for model in PRICES:
    per_chat = request_cost(model, 3_200, 400)
    print(f"{model:<18} ${per_chat:.4f} per chat   ${per_chat * 50_000:>9,.2f} per month")
```

Levers to cut cost: shorter prompts, **prompt caching** for repeated prefixes, the **Batch API** (50% off for non-urgent jobs), a cheaper model for simple steps, and lower effort where quality holds. The `client.messages.count_tokens(...)` endpoint tells you the exact input size before sending.

## Errors and retries

```python local title="Robust error handling"
import anthropic

client = anthropic.Anthropic(max_retries=3, timeout=60.0)   # the SDK already retries 429/5xx twice by default

try:
    response = client.messages.create(
        model="claude-opus-5-5", max_tokens=1024,
        messages=[{"role": "user", "content": "Hello!"}],
    )
except anthropic.RateLimitError as e:
    retry_after = e.response.headers.get("retry-after", "60")
    print(f"Rate limited — retry after {retry_after}s")
except anthropic.BadRequestError as e:          # 400: something is wrong with the request itself
    print("Fix the request:", e.message)
except anthropic.AuthenticationError:
    print("Check your API key")
except anthropic.APIStatusError as e:           # any other HTTP error
    print(f"API error {e.status_code}: {e.message}")
except anthropic.APIConnectionError:
    print("Network problem — check your connection")
```

:::def Rate limit
A cap on how many requests or tokens you may use per minute. Exceeding it returns HTTP **429**; wait (the `retry-after` header says how long) and retry with backoff.
:::

## Refusals and fallbacks

Models can decline requests that conflict with usage policies. A decline is **not** an exception: the API returns normally with `stop_reason == "refusal"`. Always check `stop_reason` before reading `content`.

```python local title="Handle refusals, with a server-side fallback"
import anthropic

client = anthropic.Anthropic()
response = client.beta.messages.create(
    model="claude-opus-5-5",
    max_tokens=1024,
    betas=["server-side-fallback-2026-07-01"],
    fallbacks="default",          # if the request is declined, retry on Anthropic's recommended fallback model
    messages=[{"role": "user", "content": "Explain how TLS certificates work."}],
)

if response.stop_reason == "refusal":
    print("The request was declined. Rephrase it or explain the legitimate context.")
else:
    print("".join(b.text for b in response.content if b.type == "text"))
```

## Other providers use the same ideas

Every major LLM API has the same building blocks: a model name, a list of role-tagged messages or an input string, a system instruction, a token limit, and a response with text plus token usage. For example, OpenAI's Python SDK:

```python local title="OpenAI Responses API (for comparison)"
from openai import OpenAI                 # pip install openai ; needs OPENAI_API_KEY

client = OpenAI()
response = client.responses.create(model="gpt-5", instructions="Be concise.", input="What is an API?")
print(response.output_text)
```

Learn one SDK well and the others take minutes. Frameworks like LangChain or LiteLLM can wrap several providers behind one interface — but understanding the raw API first makes debugging those layers much easier.

:::ai The anatomy you'll reuse everywhere
`client.messages.create(model, max_tokens, system, messages, tools, ...)` → check `stop_reason` → loop over `content` blocks → read `usage`. Every lesson that follows — prompting, streaming, structured output, tools, RAG, agents — is a variation on this call.
:::

## Check yourself

```quiz
? You want the model to remember the user's name on the next turn. What must you do?
+ Send the full conversation history, including earlier messages, with the new request
- Nothing — the API remembers automatically
- Put the name in max_tokens
> The Messages API is stateless.

? `stop_reason == "max_tokens"` means…
+ The answer was cut off because it hit your max_tokens limit
- The model used exactly the right number of tokens
- The request was refused
> Raise max_tokens (or ask for shorter output) and try again.

? Where should behaviour rules like "Always answer in French" go?
+ In the system prompt
- In max_tokens
- In the model name
> The system parameter sets role, rules and format.

? Why loop over `response.content` instead of reading `response.content[0].text`?
+ The reply is a list of typed blocks (thinking, text, tool_use…), and the first may not be text
- It's faster
- content is a string
> Always filter by block.type.
```

:::exercise Cost-aware chat
Extend the `Chat` class (with the fake client) so it keeps a running total of estimated tokens: count input tokens as the number of words in all messages sent, output tokens as the words in the reply. After three turns, print the total and the estimated cost on `claude-opus-5-5` pricing ($4 / $20 per million).
:::

:::solution
```python run
class FakeClient:
    class messages:
        @staticmethod
        def create(model, max_tokens, messages, system=None):
            reply = f"Reply number {sum(m['role'] == 'user' for m in messages)} to your message."
            return type("R", (), {"content": [type("B", (), {"type": "text", "text": reply})()]})()

class Chat:
    def __init__(self, client, model="claude-opus-5-5"):
        self.client, self.model, self.history = client, model, []
        self.tokens_in = self.tokens_out = 0

    def send(self, text):
        self.history.append({"role": "user", "content": text})
        self.tokens_in += sum(len(m["content"].split()) for m in self.history)
        r = self.client.messages.create(model=self.model, max_tokens=1024, messages=self.history)
        reply = "".join(b.text for b in r.content if b.type == "text")
        self.tokens_out += len(reply.split())
        self.history.append({"role": "assistant", "content": reply})
        return reply

chat = Chat(FakeClient())
for msg in ["Hello there", "Tell me about embeddings please", "Thanks a lot"]:
    print(chat.send(msg))
cost = (chat.tokens_in * 4 + chat.tokens_out * 20) / 1e6
print(f"tokens in={chat.tokens_in} out={chat.tokens_out}  cost ≈ ${cost:.6f}")
```
:::

:::keypoints
- `client.messages.create(model=..., max_tokens=..., system=..., messages=[...])` is the core call.
- The reply is a list of **content blocks** — filter by `type`; check **`stop_reason`** first.
- The API is **stateless**: send the whole history every turn (and watch the token cost grow).
- Choose the model per task; control reasoning with **effort** and **adaptive thinking**.
- Handle errors (`RateLimitError`, `APIStatusError`…) and **refusals** (`stop_reason == "refusal"`, optional `fallbacks`).
:::
