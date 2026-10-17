"""Claude, with structured outputs: the API is given a JSON Schema and returns JSON that fits it."""
from typing import Any

import anthropic

from .base import JsonResult, LLMError, Message, Usage


# region: client
class AnthropicClient:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, effort: str = "medium", base_url: str | None = None, max_retries: int = 2):
        self.model = model
        self.effort = effort
        self._client = anthropic.AsyncAnthropic(api_key=api_key, base_url=base_url, max_retries=max_retries)

    async def complete_json(self, *, system: str, messages: list[Message], schema: dict[str, Any], max_tokens: int, hints: dict[str, Any] | None = None) -> JsonResult:
        try:
            response = await self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
                output_config={
                    "effort": self.effort,
                    # The API supports only part of JSON Schema (no minimum/maxLength...). transform_schema() moves
                    # the constraints we cannot send into each field's description and adds additionalProperties: false.
                    # Our own Pydantic validation still enforces every rule afterwards.
                    "format": {"type": "json_schema", "schema": anthropic.transform_schema(schema)},
                },
            )
        except anthropic.APIError as exc:
            raise translate_error(exc) from exc

        if response.stop_reason == "refusal":
            raise LLMError("refused", "The model declined to process this document.")
        if response.stop_reason == "max_tokens":
            raise LLMError("truncated", "The answer was cut off before the JSON was complete.")
        text = next((b.text for b in response.content if b.type == "text"), "")
        return JsonResult(text, Usage(response.usage.input_tokens, response.usage.output_tokens), response.stop_reason or "end_turn")
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
