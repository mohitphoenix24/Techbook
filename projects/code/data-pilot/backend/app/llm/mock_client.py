"""The offline model as an LLMClient: it asks the planner what to do and streams the answer word by word."""
import asyncio
import json
import re
from collections.abc import AsyncIterator
from typing import Any

from ..pricing import estimate_tokens
from .base import AssistantTurn, Message, TextDelta, ToolUse, TurnDone, Usage
from .mock_planner import plan_next


# region: mock
class MockClient:
    name = "mock"
    model = "mock-1"

    def __init__(self, delay_ms: int = 12):
        self._delay = delay_ms / 1000

    async def turn(self, *, system: str, messages: list[Message], tools: list[dict], max_tokens: int,
                   hints: dict[str, Any] | None = None) -> AsyncIterator[TextDelta | TurnDone]:
        step = plan_next(messages, hints)
        for piece in re.findall(r"\S+\s*", step.text):
            if self._delay:
                await asyncio.sleep(self._delay)
            yield TextDelta(piece)

        seen = sum(1 for m in messages if isinstance(m["content"], list) for b in m["content"] if b.get("type") == "tool_use")
        uses = [ToolUse(f"toolu_mock_{seen + i + 1}", name, args) for i, (name, args) in enumerate(step.calls)]
        content: list[dict] = ([{"type": "text", "text": step.text}] if step.text else []) + [{"type": "tool_use", "id": u.id, "name": u.name, "input": u.input} for u in uses]

        prompt = estimate_tokens(system + json.dumps(tools) + json.dumps(messages, default=str))       # the whole conversation is resent each turn
        yield TurnDone(AssistantTurn(step.text, uses, "tool_use" if uses else "end_turn", Usage(prompt, estimate_tokens(json.dumps(content))), content))
# endregion: mock
