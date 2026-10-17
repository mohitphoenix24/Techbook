"""Claude, through the official Anthropic SDK. This is the only file that knows about the SDK."""
from collections.abc import AsyncIterator

import anthropic

from .base import LLMError, Message, StreamDone, StreamEvent, TextDelta, Usage


# region: client
class AnthropicClient:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, base_url: str | None = None, max_retries: int = 2):
        self.model = model
        # The SDK already retries 429 / 5xx / network errors with backoff (max_retries).
        self._client = anthropic.AsyncAnthropic(api_key=api_key, base_url=base_url, max_retries=max_retries)

    async def stream(self, *, system: str, messages: list[Message], max_tokens: int) -> AsyncIterator[StreamEvent]:
        try:
            async with self._client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
                # Chat wants the first word quickly, so ask for little hidden thinking.
                output_config={"effort": "low"},
            ) as stream:
                async for text in stream.text_stream:
                    yield TextDelta(text)
                final = await stream.get_final_message()
        except anthropic.APIError as exc:
            raise translate_error(exc) from exc

        yield StreamDone(
            stop_reason=final.stop_reason or "end_turn",
            usage=Usage(final.usage.input_tokens, final.usage.output_tokens),
        )
# endregion: client


# region: errors
def translate_error(exc: anthropic.APIError) -> LLMError:
    """Map SDK exceptions to the few cases a user can act on. Never leak raw provider errors."""
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
