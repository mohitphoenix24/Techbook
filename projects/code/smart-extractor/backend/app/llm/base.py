"""What the extraction pipeline needs from a model: one call that returns JSON text and the token usage."""
from dataclasses import dataclass
from typing import Any, Protocol

Message = dict[str, str]          # {"role": "user" | "assistant", "content": "..."}


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    def __add__(self, other: "Usage") -> "Usage":
        return Usage(self.input_tokens + other.input_tokens, self.output_tokens + other.output_tokens)


# region: result
@dataclass
class JsonResult:
    text: str                 # the model's JSON, as a string: the pipeline parses and validates it
    usage: Usage
    stop_reason: str = "end_turn"
# endregion: result


class LLMError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code, self.message, self.retryable = code, message, retryable


# region: protocol
class LLMClient(Protocol):
    name: str
    model: str

    async def complete_json(
        self, *, system: str, messages: list[Message], schema: dict[str, Any], max_tokens: int, hints: dict[str, Any] | None = None,
    ) -> JsonResult:
        """Ask for one JSON object that follows `schema`. `hints` is for the offline mock only; real clients ignore it."""
        ...
# endregion: protocol
