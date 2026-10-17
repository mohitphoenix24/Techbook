"""Claude: structured outputs for triage, a streamed answer for the draft."""
from collections.abc import AsyncIterator
from typing import Any

import anthropic

from .base import JsonResult, LLMError, Message, TextDelta, TextDone, Usage


# region: client
class AnthropicClient:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, effort: str = "medium", base_url: str | None = None, max_retries: int = 0):
        self.model, self.effort = model, effort
        # max_retries=0: the GATEWAY owns retries, backoff and fallback. Two layers of retries multiply into long stalls.
        self._client = anthropic.AsyncAnthropic(api_key=api_key, base_url=base_url, max_retries=max_retries)

    # region: json
    async def complete_json(self, *, system: str, messages: list[Message], schema: dict[str, Any], max_tokens: int,
                            hints: dict[str, Any] | None = None) -> JsonResult:
        try:
            response = await self._client.messages.create(
                model=self.model, max_tokens=max_tokens, system=system, messages=messages,
                output_config={"effort": self.effort, "format": {"type": "json_schema", "schema": anthropic.transform_schema(schema)}},
            )
        except anthropic.APIError as exc:
            raise translate_error(exc) from exc
        if response.stop_reason == "refusal":
            raise LLMError("refused", "The model declined to process this ticket.")
        if response.stop_reason == "max_tokens":
            raise LLMError("truncated", "The answer was cut off before the JSON was complete.")
        text = next((b.text for b in response.content if b.type == "text"), "")
        return JsonResult(text, Usage(response.usage.input_tokens, response.usage.output_tokens), model=self.model)
    # endregion: json

    # region: stream
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
            raise LLMError("refused", "The model declined to write this reply.")
        if final.stop_reason == "max_tokens":
            raise LLMError("truncated", "The reply was cut off. Edit it by hand or try again.")
        yield TextDone("".join(b.text for b in final.content if b.type == "text"), Usage(final.usage.input_tokens, final.usage.output_tokens), self.model)
    # endregion: stream
# endregion: client


# region: errors
def translate_error(exc: anthropic.APIError) -> LLMError:
    if isinstance(exc, anthropic.AuthenticationError):
        return LLMError("auth", "The API key was rejected. Check ANTHROPIC_API_KEY.")
    if isinstance(exc, anthropic.RateLimitError):
        return LLMError("rate_limited", "The provider is rate limiting us. Trying again shortly.", retryable=True)
    if isinstance(exc, anthropic.APIConnectionError):
        return LLMError("network", "Could not reach the model provider.", retryable=True)
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code >= 500:
        return LLMError("provider_down", "The model provider had a problem.", retryable=True)
    return LLMError("bad_request", "The model provider rejected the request.")
# endregion: errors
