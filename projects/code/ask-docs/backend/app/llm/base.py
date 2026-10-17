"""What the app needs from a model: stream an answer, or complete a short text (used for query rewriting)."""
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

Message = dict[str, str]


@dataclass
class TextDelta:
    text: str


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    def __add__(self, other: "Usage") -> "Usage":
        return Usage(self.input_tokens + other.input_tokens, self.output_tokens + other.output_tokens)


@dataclass
class StreamDone:
    stop_reason: str
    usage: Usage


@dataclass
class Completion:
    text: str
    usage: Usage


class LLMError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code, self.message, self.retryable = code, message, retryable


class LLMClient(Protocol):
    name: str
    model: str

    def stream(self, *, system: str, messages: list[Message], max_tokens: int) -> AsyncIterator[TextDelta | StreamDone]: ...

    async def complete(self, *, system: str, messages: list[Message], max_tokens: int) -> Completion: ...
