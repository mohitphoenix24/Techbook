"""The offline model as an LLMClient: rules for triage, a template writer for replies, streamed word by word."""
import asyncio
import json
import re
from collections.abc import AsyncIterator
from typing import Any

from ..pricing import estimate_tokens
from .base import JsonResult, LLMError, Message, TextDelta, TextDone, Usage
from .mock_rules import triage, write_reply


# region: mock
class MockClient:
    name = "mock"
    model = "mock-1"

    def __init__(self, delay_ms: int = 8):
        self._delay = delay_ms / 1000

    def _maybe_fail(self, hints: dict[str, Any] | None) -> None:
        flaky = (hints or {}).get("flaky")
        if flaky and flaky["left"] > 0:                       # the pipeline shares this dict across retries, so it counts down
            flaky["left"] -= 1
            raise LLMError("provider_down", "The model provider had a problem. Try again.", retryable=True)

    async def complete_json(self, *, system: str, messages: list[Message], schema: dict[str, Any], max_tokens: int,
                            hints: dict[str, Any] | None = None) -> JsonResult:
        self._maybe_fail(hints)
        await asyncio.sleep(self._delay)
        text = json.dumps(triage(messages[-1]["content"]))
        return JsonResult(text, Usage(estimate_tokens(system + json.dumps(messages)), estimate_tokens(text)), model=self.model)

    async def stream_text(self, *, system: str, messages: list[Message], max_tokens: int,
                          hints: dict[str, Any] | None = None) -> AsyncIterator[TextDelta | TextDone]:
        self._maybe_fail(hints)
        hints = hints or {}
        text = write_reply(hints["facts"], hints.get("simulate", "none"), revision=bool(hints.get("revision")))
        for piece in re.findall(r"\S+\s*", text):
            if self._delay:
                await asyncio.sleep(self._delay / 4)
            yield TextDelta(piece)
        yield TextDone(text, Usage(estimate_tokens(system + json.dumps(messages)), estimate_tokens(text)), self.model)
# endregion: mock
