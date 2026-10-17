from collections.abc import AsyncIterator
from typing import Any

import anthropic

from .base import AssistantTurn, LLMError, Message, TextDelta, ToolUse, TurnDone, Usage


# region: client
class AnthropicClient:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, effort: str = "medium", base_url: str | None = None, max_retries: int = 2):
        self.model, self.effort = model, effort
        self._client = anthropic.AsyncAnthropic(api_key=api_key, base_url=base_url, max_retries=max_retries)

    async def turn(self, *, system: str, messages: list[Message], tools: list[dict], max_tokens: int,
                   hints: dict[str, Any] | None = None) -> AsyncIterator[TextDelta | TurnDone]:
        try:
            async with self._client.messages.stream(
                model=self.model, max_tokens=max_tokens, system=system, messages=messages, tools=tools,
                output_config={"effort": self.effort},
            ) as stream:
                async for text in stream.text_stream:
                    yield TextDelta(text)
                final = await stream.get_final_message()
        except anthropic.APIError as exc:
            raise translate_error(exc) from exc

        if final.stop_reason == "refusal":
            raise LLMError("refused", "The model declined to answer this.")
        if final.stop_reason == "max_tokens":
            raise LLMError("truncated", "The answer was cut off. Try a narrower question.")

        yield TurnDone(AssistantTurn(
            text="".join(b.text for b in final.content if b.type == "text"),
            tool_uses=[ToolUse(b.id, b.name, dict(b.input)) for b in final.content if b.type == "tool_use"],
            stop_reason=final.stop_reason or "end_turn",
            usage=Usage(final.usage.input_tokens, final.usage.output_tokens),
            content=list(final.content),            # sent back exactly as received, so the model keeps its own context intact
        ))
# endregion: client


# region: errors
def translate_error(exc: anthropic.APIError) -> LLMError:
    if isinstance(exc, anthropic.AuthenticationError):
        return LLMError("auth", "The API key was rejected. Check ANTHROPIC_API_KEY.")
    if isinstance(exc, anthropic.RateLimitError):
        return LLMError("rate_limited", "Too many requests right now. Please try again in a moment.", retryable=True)
    if isinstance(exc, anthropic.APIConnectionError):
        return LLMError("network", "Could not reach the model provider.", retryable=True)
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code >= 500:
        return LLMError("provider_down", "The model provider had a problem. Try again.", retryable=True)
    return LLMError("bad_request", "The model provider rejected the request.")
# endregion: errors
