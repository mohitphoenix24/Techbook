from collections.abc import AsyncIterator
from typing import Any

import anthropic

from .base import LLMError, Message, TextDelta, TextDone, Usage


# region: client
class AnthropicClient:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, effort: str = "medium", base_url: str | None = None, max_retries: int = 2):
        self.model, self.effort = model, effort
        self._client = anthropic.AsyncAnthropic(api_key=api_key, base_url=base_url, max_retries=max_retries)

    async def stream_text(self, *, system: str, messages: list[Message], max_tokens: int,
                          hints: dict[str, Any] | None = None) -> AsyncIterator[TextDelta | TextDone]:
        try:
            async with self._client.messages.stream(model=self.model, max_tokens=max_tokens, system=system, messages=messages,
                                                    output_config={"effort": self.effort}) as stream:
                async for piece in stream.text_stream:
                    yield TextDelta(piece)
                final = await stream.get_final_message()
        except anthropic.APIError as exc:
            raise translate_error(exc) from exc
        if final.stop_reason == "refusal":
            raise LLMError("refused", "The model declined to answer this.")
        if final.stop_reason == "max_tokens":
            raise LLMError("truncated", "The answer was cut off. Try a narrower question.")
        yield TextDone("".join(b.text for b in final.content if b.type == "text"), Usage(final.usage.input_tokens, final.usage.output_tokens))
# endregion: client


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
