"""What the agent needs from a model: ONE turn (text and/or tool requests), streamed."""
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Protocol

Message = dict[str, Any]          # {"role": "user" | "assistant", "content": str | list of blocks}


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    def __add__(self, other: "Usage") -> "Usage":
        return Usage(self.input_tokens + other.input_tokens, self.output_tokens + other.output_tokens)


# region: turn
@dataclass
class ToolUse:
    id: str
    name: str
    input: dict[str, Any]


@dataclass
class TextDelta:
    text: str


@dataclass
class AssistantTurn:
    """Everything the model produced in one request."""
    text: str                                   # words for the user (may be empty when it only calls tools)
    tool_uses: list[ToolUse]                    # tools it wants us to run (empty when it is done)
    stop_reason: str                            # "tool_use" when it wants tools, "end_turn" when it is finished
    usage: Usage
    content: list[Any] = field(default_factory=list)   # the blocks to send back unchanged as the assistant message


@dataclass
class TurnDone:
    turn: AssistantTurn
# endregion: turn


class LLMError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code, self.message, self.retryable = code, message, retryable


# region: protocol
class LLMClient(Protocol):
    name: str
    model: str

    def turn(self, *, system: str, messages: list[Message], tools: list[dict], max_tokens: int,
             hints: dict[str, Any] | None = None) -> AsyncIterator[TextDelta | TurnDone]:
        """Stream text pieces, then exactly one TurnDone. `hints` is for the offline mock only."""
        ...
# endregion: protocol
