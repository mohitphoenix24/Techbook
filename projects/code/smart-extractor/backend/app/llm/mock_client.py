"""The offline model: deterministic JSON from rules, with optional simulated mistakes."""
import json
import re
from typing import Any

from ..pricing import estimate_tokens
from .base import JsonResult, LLMError, Message, Usage
from .mock_extractors import EXTRACTORS, break_a_rule, invent_a_value


# region: mock
class MockClient:
    name = "mock"
    model = "mock-1"

    async def complete_json(self, *, system: str, messages: list[Message], schema: dict[str, Any], max_tokens: int, hints: dict[str, Any] | None = None) -> JsonResult:
        title = schema.get("title", "")
        extractor = EXTRACTORS.get(title)
        if extractor is None:
            raise LLMError("bad_request", f"The offline model does not know how to extract a '{title}'.")

        first = messages[0]["content"]
        m = re.search(r"<document>\n(.*?)\n</document>", first, re.S)
        data = extractor(m.group(1) if m else first)

        # A repair turn (more than one message) always gets the correct answer: that is the point of the loop.
        mistake = (hints or {}).get("simulate_mistake")
        if len(messages) == 1:
            if mistake == "rule":
                data = break_a_rule(title, data)
            elif mistake == "invent":
                data = invent_a_value(title, data)

        text = json.dumps(data, ensure_ascii=False)
        prompt_tokens = estimate_tokens(system) + estimate_tokens(json.dumps(schema)) + sum(estimate_tokens(x["content"]) for x in messages)
        return JsonResult(text, Usage(prompt_tokens, estimate_tokens(text)))
# endregion: mock
