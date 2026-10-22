"""The only file that knows how to reach Claude: build the client, and turn the SDK's errors into plain messages."""
import anthropic

from .config import Settings


# region: client
def make_client(settings: Settings) -> anthropic.AsyncAnthropic | None:
    """The official SDK client, or None when no key is set (the API then says so instead of failing mid-request)."""
    if not settings.anthropic_api_key:
        return None
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key, max_retries=2)     # the SDK retries 429s and 5xx for us
# endregion: client


# region: errors
def explain(exc: anthropic.APIError) -> dict:
    """An SDK exception as the `error` event the browser understands. Most specific class first."""
    if isinstance(exc, anthropic.AuthenticationError):
        return {"code": "auth", "message": "The API key was rejected. Check ANTHROPIC_API_KEY.", "retryable": False}
    if isinstance(exc, anthropic.NotFoundError):
        return {"code": "model", "message": "The API does not know that model. Check LLM_MODEL.", "retryable": False}
    if isinstance(exc, anthropic.RateLimitError):
        return {"code": "rate_limited", "message": "Too many requests right now. Try again in a moment.", "retryable": True}
    if isinstance(exc, anthropic.APIConnectionError):
        return {"code": "network", "message": "Could not reach the Anthropic API. Check your internet connection.", "retryable": True}
    if isinstance(exc, anthropic.BadRequestError):
        return {"code": "bad_request", "message": f"The API rejected the request: {exc.message}", "retryable": False}
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code >= 500:
        return {"code": "provider_down", "message": "The Anthropic API had a problem. Try again.", "retryable": True}
    return {"code": "api_error", "message": "The Anthropic API returned an error.", "retryable": False}
# endregion: errors
