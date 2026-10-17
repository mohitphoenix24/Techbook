---
title: The LLM API in ten minutes
level: easy
time: 35
summary: Messages, system prompts, streaming, structured output, tools, usage and cost, errors and keys: the whole Claude API surface these projects use, with the one idea behind each.
---

You can build a lot with five ideas: **messages**, **streaming**, **structured output**, **tools**, and **usage**. This lesson shows each with the official Python SDK (`pip install anthropic`). The code blocks marked *Run locally* need an API key, so they are shown but not run in the page. The cost and history demos run right here.

## 1. A request is a list of messages

```python local title="The smallest possible call"
import anthropic

client = anthropic.Anthropic()          # reads ANTHROPIC_API_KEY from the environment

response = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    system="You are a concise assistant for a coding course.",
    messages=[{"role": "user", "content": "What is a Python decorator?"}],
)

for block in response.content:           # the answer is a list of content blocks
    if block.type == "text":
        print(block.text)
print(response.stop_reason)               # "end_turn", "max_tokens", "tool_use", ...
print(response.usage.input_tokens, response.usage.output_tokens)
```

| Part | What it is |
|---|---|
| `model` | which model answers. We use `claude-sonnet-5-5` for most app work; see the table below. |
| `system` | standing instructions: the persona, rules and format. It is separate from the conversation. |
| `messages` | the conversation so far: alternating `user` and `assistant` turns. |
| `max_tokens` | a hard cap on the length of the reply. If hit, `stop_reason` is `"max_tokens"` and the answer is cut off. |
| `response.content` | a **list of blocks** (text, tool calls, ...). Always check `block.type` before using `.text`. |
| `response.usage` | tokens read and written: your bill and your budget. |

:::def Token
The unit models read and write: roughly three-quarters of an English word, or about four characters. Prices, limits and speed are all measured in tokens, not words.
:::

## 2. The API has no memory

This is the most important fact for an app developer. **Every request stands alone.** To continue a conversation you resend the earlier messages yourself. That has a consequence you can calculate: the longer the chat, the more input tokens each turn costs.

The next block runs the *real* `context.py` from Project 1. It simulates twenty turns and compares sending everything with keeping only a 400-token window.

```python run src="pocket-chat/backend/app/context.py" region="imports,estimate,trim" title="History grows every turn (the real trim_history from Pocket Chat)" level=easy
history = []
sent_all = sent_trimmed = 0
print("turn | tokens if we resend everything | tokens with a 400-token window")
for turn in range(1, 21):
    history.append({"role": "user", "content": "Tell me more about topic number %d, please. " % turn * 4})
    history.append({"role": "assistant", "content": "Here is a fairly detailed answer about that topic. " * 6})
    full = sum(estimate_tokens(m["content"]) for m in history)
    kept, dropped = trim_history(history, budget=400)
    trimmed = sum(estimate_tokens(m["content"]) for m in kept)
    sent_all += full
    sent_trimmed += trimmed
    if turn in (1, 5, 10, 20):
        print(f"{turn:>4} | {full:>31} | {trimmed:>31}")
print()
print("total input tokens over 20 turns:", sent_all, "vs", sent_trimmed)
print(f"the window saves {100 * (1 - sent_trimmed / sent_all):.0f}% of the input cost")
```

Try a different `budget`. The cost of a long conversation grows with the *square* of its length if you never trim, which is why Project 1 trims history to a budget.

## 3. Models and prices

Prices are per million tokens (input / output). They change, so check the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) before you plan a budget.

| Model | Model ID | Good for | Input / output per 1M tokens |
|---|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | the hardest reasoning and agent work | $4 / $20 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | the everyday workhorse: chat, extraction, RAG, tools | $2 / $10 |
| Claude Haiku 5.5 | `claude-haiku-5-5` | fast, cheap tasks: classification, routing, judging | $0.10 / $0.50 |

```python run src="pocket-chat/backend/app/pricing.py" region="cost" title="Turning tokens into rupees... or dollars" level=easy
PRICES = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
}
DEFAULT_PRICE = PRICES["claude-sonnet-5-5"]

for model in PRICES:
    one = cost_usd(model, input_tokens=2_000, output_tokens=500)
    print(f"{model:<18} one chat turn ${one:.5f}   10,000 turns a day ${one * 10_000:,.2f}")
```

:::note Newer models take fewer knobs
On the Claude 5.5 models, setting `temperature`, `top_p` or `top_k` to a non-default value is rejected with a 400 error. You steer behaviour with the **prompt** and, for depth of reasoning, `output_config={"effort": "low" | "medium" | "high"}`. Chat apps usually want `low` (fast first word); hard reasoning wants `high`. Prefilling the assistant's reply is also no longer supported; use structured outputs or instructions instead.
:::

## 4. Streaming

Add `.stream(...)` and iterate over the text as it is produced. Pocket Chat wraps exactly this in one small function.

```python local title="Streaming with the SDK"
import anthropic

client = anthropic.Anthropic()

with client.messages.stream(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Write a haiku about monsoon."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    final = stream.get_final_message()       # the complete message, with usage

print("\n", final.usage.output_tokens, "tokens")
```

In an async server (FastAPI) use `anthropic.AsyncAnthropic()` with `async with ... as stream` and `async for text in stream.text_stream`.

## 5. Structured output

Free text is hard for programs to use. Give Claude a schema and it returns JSON that fits it. With Pydantic this is two lines (Project 2 is built on it):

```python local title="Structured output with Pydantic"
from pydantic import BaseModel
import anthropic

class Contact(BaseModel):
    name: str
    email: str
    wants_demo: bool

client = anthropic.Anthropic()
response = client.messages.parse(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Extract: Jane Doe (jane@co.com) would love a demo."}],
    output_format=Contact,
)
contact = response.parsed_output           # a validated Contact object, not a string
print(contact.name, contact.wants_demo)
```

## 6. Tools: letting the model act

A **tool** is a function you describe to the model. When it needs one, it stops and asks you to run it; you run it and send the result back. The model never executes anything itself. That is the entire idea behind agents, and Projects 4 and 5 are built on it.

```viz algo=seq title="One tool-use round trip"
participant app Your server [service]
participant llm Claude [llm]
participant fn Your function [tool]
app -> llm : messages + tool definitions (name, description, JSON schema)
llm --> app : stop_reason = tool_use | tool_use{id: t1, name: run_sql, input: {query: "SELECT ..."}}
app -> fn : run_sql("SELECT ...")
fn --> app : rows
app -> llm : history + tool_result(t1) with the rows
llm --> app : stop_reason = end_turn | the final answer in words
```

```python local title="A tool definition"
tools = [{
    "name": "run_sql",
    "description": "Run a read-only SQL query on the shop database and return the rows.",
    "input_schema": {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "One SELECT statement"}},
        "required": ["query"],
    },
}]
# response = client.messages.create(model=..., max_tokens=..., tools=tools, messages=[...])
# if response.stop_reason == "tool_use": run the tool, append a tool_result, call again.
```

:::warn Tool inputs are untrusted
The model decides the arguments, and a user (or a malicious document) can influence the model. Treat tool input like any other user input: validate it, and give tools the least power they need. Project 4 shows how to run model-written SQL safely.
:::

## 7. Errors, retries and keys

| Status | Meaning | What to do |
|---|---|---|
| 400 | invalid request (bad parameter, bad message order) | fix the code; do not retry |
| 401 / 403 | bad key or no permission | check the key |
| 404 | unknown model or endpoint | check the model ID |
| 413 | request too large | shorten the input |
| 429 | rate limited | wait and retry |
| 500 / 529 | provider trouble or overloaded | retry with back-off |

The SDK **already retries** 429, 5xx and network errors twice with back-off. In your server, catch the typed exceptions (`anthropic.RateLimitError`, `anthropic.AuthenticationError`, `anthropic.APIConnectionError`, ...) and turn them into messages a user can act on. Never show raw provider errors in the interface.

**Keys:** keep `ANTHROPIC_API_KEY` in an environment variable or a `.env` file that is in `.gitignore`. Never put it in front-end code, never commit it, and never print it in logs.

:::keypoints
- A request is `model` + `system` + `messages` + `max_tokens`; the reply is a list of content blocks plus `usage`.
- The API is stateless: you resend history, so cost grows with conversation length unless you trim.
- Stream with `messages.stream`; get structured output with `messages.parse` and a Pydantic model.
- A tool is a described function the model can ask you to run. You run it; the model never does.
- Retry 429/5xx, never 400/401; turn SDK exceptions into friendly messages; keep the key on the server.
:::

```quiz
? You send the same conversation again with one new question. Why do you pay for the old messages again?
- The model charges a subscription
+ The API is stateless, so the earlier messages are input tokens in every request
- Because streaming doubles the cost
> Nothing is remembered between requests. Trimming or summarising history is how you control this cost (prompt caching can also reduce it).
? Which stop_reason means the answer was cut off?
- end_turn
- tool_use
+ max_tokens
> max_tokens means the reply hit your limit. Raise it, or ask for a shorter answer.
? A model returns a tool_use block. Who runs the tool?
- Claude runs it on Anthropic's servers
+ Your code runs it and sends back a tool_result
- The browser runs it
> With client tools, the model only asks. Your server decides whether and how to run the function.
```

:::exercise Cost planning
A support bot sends about 3,000 input tokens and gets 400 output tokens per message. With Haiku 5.5 and Sonnet 5.5, what does one message cost, and what is the monthly bill at 50,000 messages? Use the `cost_usd` block above (change the numbers) to check your arithmetic. At what point would you consider using the cheaper model for part of the work?
:::
:::solution
Haiku: `3000×0.10 + 400×0.50 = 500` micro-dollars-per-million → $0.0005 per message, about **$25/month**. Sonnet: `3000×2 + 400×10 = 10,000` → $0.01 per message, about **$500/month**. A common pattern is to route simple requests (classification, short answers) to Haiku and keep Sonnet for the hard ones. Project 5 builds this routing and a fallback chain into its gateway.
:::

:::resources Go deeper
- [Anthropic API documentation](https://platform.claude.com/docs/en/api/overview) is the reference for every parameter.
- [Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming) lists every streaming event type.
- [Tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) explains the tool loop in detail.
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python) on GitHub has the source and examples.
:::
