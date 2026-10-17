"""The contract between our app and "an LLM". Everything else depends on this, not on a vendor SDK."""
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

Message = dict[str, str]          # {"role": "user" | "assistant", "content": "..."}


# region: events
@dataclass
class TextDelta:
    """A few characters of the answer, as soon as the model produces them."""
    text: str


@dataclass
class Usage:
    input_tokens: int
    output_tokens: int


@dataclass
class StreamDone:
    """Always the last event. `stop_reason` is "end_turn", "max_tokens", ..."""
    stop_reason: str
    usage: Usage


StreamEvent = TextDelta | StreamDone
# endregion: events


# region: errors
class LLMError(Exception):
    """A provider failure, translated into something our API can show to a user."""

    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
# endregion: errors


# region: protocol
class LLMClient(Protocol):
    name: str          # "anthropic" | "mock"
    model: str

    def stream(self, *, system: str, messages: list[Message], max_tokens: int) -> AsyncIterator[StreamEvent]:
        """Yield TextDelta events, then exactly one StreamDone. Raise LLMError on failure."""
        ...
# endregion: protocol
