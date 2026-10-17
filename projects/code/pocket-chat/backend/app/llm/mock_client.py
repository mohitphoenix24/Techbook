"""An offline stand-in for a model, so the whole stack runs with no API key.

It is NOT intelligent: it recognises a few kinds of request and answers from templates. What it
does faithfully is behave like a streaming API (small chunks, a usage report, the same events),
so everything you build around it works the same when you switch to Claude.
"""
import asyncio
import re
from collections.abc import AsyncIterator

from ..context import estimate_tokens
from .base import Message, StreamDone, StreamEvent, TextDelta, Usage

CODE_REPLY = """Here is a small example in Python:

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("Pocket Chat"))
```

It defines a function with a type hint and calls it. Ask me to change it and I will."""

LIST_REPLY = """Here is a short plan:

1. Write down the goal in one sentence.
2. Break it into the smallest steps you can.
3. Do the first step today.
4. Review what you learned and adjust."""

TABLE_REPLY = """| Part | Job |
|------|-----|
| React | shows the chat and sends your message |
| FastAPI | checks it, adds history, calls the model |
| The model | writes the answer, a few words at a time |"""


# region: script
def script_reply(messages: list[Message], system: str) -> str:
    last = messages[-1]["content"].strip()
    lowered = last.lower()
    earlier = len(messages) - 1

    if re.search(r"\b(hi|hello|hey|namaste)\b", lowered) and len(lowered) < 40:
        body = "Hello! I am Pocket Chat. Right now I am running in **offline demo mode**, so my answers come from templates, not from a real model."
    elif re.search(r"\b(code|python|function|script)\b", lowered):
        body = CODE_REPLY
    elif re.search(r"\b(table|compare|comparison)\b", lowered):
        body = TABLE_REPLY
    elif re.search(r"\b(plan|steps|list|how do i)\b", lowered):
        body = LIST_REPLY
    elif re.search(r"\b(remember|earlier|before|previous|said)\b", lowered) and earlier:
        prior = next((m["content"] for m in reversed(messages[:-1]) if m["role"] == "user"), "")
        body = f"Earlier you wrote: “{prior[:80]}”. That is the history your server sent me along with this message."
    else:
        body = (
            f"You asked: “{last[:120]}”.\n\n"
            "I am in offline demo mode, so I cannot answer that for real. "
            f"I can see {earlier} earlier message{'s' if earlier != 1 else ''} in this chat, "
            "which proves your server is sending the conversation history. "
            "Add an `ANTHROPIC_API_KEY` to get real answers."
        )

    if "Socratic" in system or "tutor" in system:
        body += "\n\nWhat do you think happens next?"
    elif "at most three sentences" in system:
        body = " ".join(re.split(r"(?<=[.!?])\s+", body)[:3])
    return body
# endregion: script


# region: stream
class MockClient:
    name = "mock"
    model = "mock-1"

    def __init__(self, delay_ms: int = 25):
        self._delay = delay_ms / 1000

    async def stream(self, *, system: str, messages: list[Message], max_tokens: int) -> AsyncIterator[StreamEvent]:
        reply = script_reply(messages, system)
        limit = max_tokens * 4                                      # honour max_tokens (≈ 4 chars each)
        stop_reason = "end_turn"
        if len(reply) > limit:
            reply, stop_reason = reply[:limit], "max_tokens"

        sent = 0
        for chunk in re.findall(r"\S+\s*|\s+", reply):              # one word (plus trailing space) at a time
            if self._delay:
                await asyncio.sleep(self._delay)
            sent += len(chunk)
            yield TextDelta(chunk)

        prompt_tokens = estimate_tokens(system) + sum(estimate_tokens(m["content"]) for m in messages)
        yield StreamDone(stop_reason, Usage(prompt_tokens, estimate_tokens(reply)))
# endregion: stream
