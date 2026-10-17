"""What the app needs from a model: stream an answer, then report how many tokens it cost."""
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Protocol

Message = dict[str, str]


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0


# region: events
@dataclass
class TextDelta:
    text: str


@dataclass
class TextDone:
    text: str
    usage: Usage
# endregion: events


class LLMError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code, self.message, self.retryable = code, message, retryable


# region: protocol
class LLMClient(Protocol):
    name: str
    model: str

    def stream_text(self, *, system: str, messages: list[Message], max_tokens: int,
                    hints: dict[str, Any] | None = None) -> AsyncIterator[TextDelta | TextDone]:
        """Stream text pieces, then exactly one TextDone. `hints` is for the offline mock only."""
        ...
# endregion: protocol
