"""What the pipeline needs from a model: a JSON answer (for triage) and streamed text (for the draft)."""
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Protocol

Message = dict[str, str]          # {"role": "user" | "assistant", "content": "..."}


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    def __add__(self, other: "Usage") -> "Usage":
        return Usage(self.input_tokens + other.input_tokens, self.output_tokens + other.output_tokens)


# region: results
@dataclass
class JsonResult:
    text: str                      # the model's JSON as a string: the pipeline parses and validates it
    usage: Usage
    cached: bool = False           # True when the gateway answered from its cache and no model was called
    model: str = ""                # which model really answered (it may be the fallback)
    attempts: int = 1              # how many tries the gateway needed (1 means it worked first time)


@dataclass
class TextDelta:
    text: str


@dataclass
class TextDone:
    text: str
    usage: Usage
    model: str = ""
    attempts: int = 1
# endregion: results


class LLMError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code, self.message, self.retryable = code, message, retryable


# region: protocol
class LLMClient(Protocol):
    name: str
    model: str

    async def complete_json(self, *, system: str, messages: list[Message], schema: dict[str, Any], max_tokens: int,
                            hints: dict[str, Any] | None = None) -> JsonResult:
        """Ask for one JSON object that follows `schema`."""
        ...

    def stream_text(self, *, system: str, messages: list[Message], max_tokens: int,
                    hints: dict[str, Any] | None = None) -> AsyncIterator[TextDelta | TextDone]:
        """Stream text pieces, then exactly one TextDone. `hints` is for the offline mock only."""
        ...
# endregion: protocol
