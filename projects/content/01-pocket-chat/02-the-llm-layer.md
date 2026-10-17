---
title: The LLM layer
level: easy
time: 35
summary: One small interface (stream events in, errors out), an offline model that behaves like a streaming API, and the real Claude client behind the same interface, tested against a fake Anthropic server.
tags: interface, mock, Anthropic SDK, errors
---

Everything in the app that needs "a model" depends on one small **interface**. Two classes implement it. This lesson builds all three pieces, and by the end the back end can already produce a streamed answer from the command line.

## Step 1: the contract

What does the rest of the app need from a model? A stream of text pieces, then the token usage. Failures must be reported in a form we control. That is all.

```python src="pocket-chat/backend/app/llm/base.py" region="events,errors,protocol" title="backend/app/llm/base.py"
```

Design choices worth noticing:

- **Events are tiny dataclasses**, not vendor objects. Nothing outside `anthropic_client.py` ever sees an Anthropic type.
- `StreamDone` always comes last and carries `usage`, so the route can compute the cost exactly once.
- `LLMError` carries a stable `code` and a `retryable` flag. The route turns it into an `error` event and the UI decides whether to offer **Try again**.
- `Protocol` is Python's structural interface: any class with the right `stream` method qualifies. No inheritance is needed.

## Step 2: the offline model

The mock has two jobs: be **deterministic** (so tests can assert exact text) and **behave like a streaming API** (so the stack above it is tested honestly).

```python src="pocket-chat/backend/app/llm/mock_client.py" region="script" title="backend/app/llm/mock_client.py: what it says"
```

```python src="pocket-chat/backend/app/llm/mock_client.py" region="stream" title="backend/app/llm/mock_client.py: how it streams"
```

Look at what `stream` copies from a real API:

| Real API behaviour | The mock's version |
|---|---|
| text arrives in small pieces | one word at a time, with a short `await asyncio.sleep` |
| `max_tokens` can cut the answer short | truncates and reports `stop_reason="max_tokens"` |
| a usage report at the end | estimated from character counts |
| a persona changes behaviour | reads the system prompt (the tutor adds a question) |

Because it is async and yields, **cancelling** it (the user presses Stop) works exactly like cancelling a real stream.

You can try it directly. This block runs the real mock against a short conversation:

```python local verify cwd="pocket-chat/backend" title="Try the mock from a Python shell"
import asyncio
from app.llm.mock_client import MockClient

async def main():
    llm = MockClient(delay_ms=0)
    messages = [{"role": "user", "content": "give me a plan"}]
    pieces = []
    async for event in llm.stream(system="Be helpful.", messages=messages, max_tokens=300):
        if hasattr(event, "text"):
            pieces.append(event.text)
        else:
            print("stop reason:", event.stop_reason, "| usage:", event.usage)
    print("".join(pieces)[:60].replace("\n", " "), "...")
    print("pieces streamed:", len(pieces))

asyncio.run(main())
```

```output
stop reason: end_turn | usage: Usage(input_tokens=7, output_tokens=44)
Here is a short plan:  1. Write down the goal in one sentenc ...
pieces streamed: 35
```

## Step 3: the real client

The Claude client implements the same `stream` method with the official SDK:

```python src="pocket-chat/backend/app/llm/anthropic_client.py" region="client" title="backend/app/llm/anthropic_client.py"
```

Four details deserve a closer look:

1. **`AsyncAnthropic`**: our server is async, so we use the async client. A blocking client inside an `async def` would freeze every other request.
2. **`messages.stream(...)`** is the SDK's streaming helper. `stream.text_stream` yields only the text pieces; `get_final_message()` gives the complete message with `usage` after the last piece.
3. **`output_config={"effort": "low"}`** asks for little hidden reasoning so the first word comes quickly. Chat wants low latency; a hard maths question would want `high`.
4. **Retries are the SDK's job.** `max_retries=2` retries rate limits (429), server errors and dropped connections with back-off. We do not write our own loop.

### Translating errors

A raw provider error is useless (or dangerous) to show a user. We map the few cases a person can act on:

```python src="pocket-chat/backend/app/llm/anthropic_client.py" region="errors" title="backend/app/llm/anthropic_client.py"
```

The order matters: `AuthenticationError` and `RateLimitError` are subclasses of `APIStatusError`, so the specific checks must come before the general one.

## Step 4: choosing a provider

```python src="pocket-chat/backend/app/llm/factory.py" region="factory" title="backend/app/llm/factory.py"
```

The `from .anthropic_client import ...` sits **inside** the branch on purpose: in mock mode the SDK is never imported, so even a machine without it can run the app.

## How do we know the Claude client works without paying?

We cannot call the real API in tests (it costs money, needs a key and is not repeatable). Instead the test suite starts a tiny **fake Anthropic server** that speaks the exact event format of `api.anthropic.com`, and points the *real SDK* at it with `base_url`:

```python src="pocket-chat/backend/tests/test_anthropic_adapter.py" region="adapter-test" title="backend/tests/test_anthropic_adapter.py"
```

The SDK parses the fake stream exactly as it would a real one, so this test proves the parts that are easy to get wrong: reading `text_stream`, reading `usage` from the final message, sending `system`, `messages` and `output_config` correctly, and mapping 401, 429, 500 and 400 to our error codes. (The fake server itself is about 60 lines: [tests/fake_anthropic.py](#/code/pocket-chat/backend/tests/fake_anthropic.py).)

:::note What this does not prove
It proves our *adapter*. It cannot prove that Claude gives good answers; for that you need evals (Projects 2, 3 and 5).
:::

:::keypoints
- The app depends on a tiny `LLMClient` protocol: a stream of `TextDelta` events ending in `StreamDone`, or an `LLMError`.
- The mock is deterministic and honest about being fake; it copies the API's behaviour, not its intelligence.
- The Claude client uses `AsyncAnthropic`, `messages.stream`, `text_stream` and `get_final_message`; the SDK handles retries.
- Translate provider exceptions into a few stable error codes; check specific exception classes before general ones.
- Test the adapter with the real SDK against a local fake server.
:::

```quiz
? Why does `stream` yield small dataclasses instead of the SDK's own objects?
- Dataclasses are faster
+ Nothing outside the adapter depends on a vendor SDK, so the mock, the real client and test fakes are interchangeable
- The SDK does not allow it
> Isolating the vendor in one file keeps the rest of the app simple and testable.
? Where must the `except anthropic.AuthenticationError` check come relative to `APIStatusError`?
+ Before it, because it is a more specific subclass
- After it, as a fallback
- Order does not matter
> Python takes the first matching branch. A general check placed first would hide the specific ones.
? What does the fake Anthropic server let us test?
- Whether Claude's answers are accurate
+ That our adapter correctly parses a real-format stream and maps errors, without a key or any cost
- How fast the real API is
> It exercises the real SDK and our adapter end to end. Answer quality is a separate question for evals.
```

:::exercise Add a provider
Create `EchoClient` in a new file that implements the `LLMClient` protocol: it streams back the last user message in upper case, character by character, then a `StreamDone`. Add `"echo"` to the `Literal` of `llm_provider` in `config.py` and a branch in `build_llm`. Start the app with `LLM_PROVIDER=echo` and chat. How many files outside `llm/` did you have to change? (The answer should be zero, apart from `config.py`.)
:::
