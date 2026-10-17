from collections.abc import AsyncIterator

import anthropic

from .base import Completion, LLMError, Message, StreamDone, TextDelta, Usage


# region: client
class AnthropicClient:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, base_url: str | None = None, max_retries: int = 2):
        self.model = model
        self._client = anthropic.AsyncAnthropic(api_key=api_key, base_url=base_url, max_retries=max_retries)

    async def stream(self, *, system: str, messages: list[Message], max_tokens: int) -> AsyncIterator[TextDelta | StreamDone]:
        try:
            async with self._client.messages.stream(
                model=self.model, max_tokens=max_tokens, system=system, messages=messages,
                output_config={"effort": "low"},          # answering from sources is easy; keep the first word fast
            ) as stream:
                async for text in stream.text_stream:
                    yield TextDelta(text)
                final = await stream.get_final_message()
        except anthropic.APIError as exc:
            raise translate_error(exc) from exc
        yield StreamDone(final.stop_reason or "end_turn", Usage(final.usage.input_tokens, final.usage.output_tokens))

    async def complete(self, *, system: str, messages: list[Message], max_tokens: int) -> Completion:
        try:
            response = await self._client.messages.create(
                model=self.model, max_tokens=max_tokens, system=system, messages=messages, output_config={"effort": "low"},
            )
        except anthropic.APIError as exc:
            raise translate_error(exc) from exc
        text = next((b.text for b in response.content if b.type == "text"), "")
        return Completion(text, Usage(response.usage.input_tokens, response.usage.output_tokens))
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
