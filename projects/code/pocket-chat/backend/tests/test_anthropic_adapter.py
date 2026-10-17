"""The real Anthropic SDK, talking to a local fake server: proves our adapter parses a real stream."""
import pytest

from app.llm import LLMError, StreamDone, TextDelta
from app.llm.anthropic_client import AnthropicClient

from .fake_anthropic import running_fake


async def collect(client, **kw):
    return [e async for e in client.stream(system="Be brief.", messages=[{"role": "user", "content": "Say hello"}], max_tokens=100, **kw)]


# region: adapter-test
async def test_streams_text_then_reports_usage():
    with running_fake() as (url, app):
        client = AnthropicClient("sk-test", "claude-sonnet-5-5", base_url=url, max_retries=0)
        events = await collect(client)

    assert "".join(e.text for e in events if isinstance(e, TextDelta)) == "Hello from the fake API"
    done = events[-1]
    assert isinstance(done, StreamDone) and done.stop_reason == "end_turn"
    assert done.usage.input_tokens == 21 and done.usage.output_tokens == 5

    request = app.state.requests[0]
    assert request["model"] == "claude-sonnet-5-5" and request["stream"] is True
    assert request["system"] == "Be brief." and request["messages"] == [{"role": "user", "content": "Say hello"}]
    assert request["output_config"] == {"effort": "low"}
# endregion: adapter-test


@pytest.mark.parametrize("status,kind,expected_code,retryable", [
    (401, "authentication_error", "auth", False),
    (429, "rate_limit_error", "rate_limited", True),
    (500, "api_error", "provider_down", True),
    (400, "invalid_request_error", "bad_request", False),
])
async def test_sdk_errors_are_translated(status, kind, expected_code, retryable):
    with running_fake(fail_with=(status, kind, "nope")) as (url, _):
        client = AnthropicClient("sk-test", "claude-sonnet-5-5", base_url=url, max_retries=0)
        with pytest.raises(LLMError) as info:
            await collect(client)
    assert info.value.code == expected_code and info.value.retryable is retryable
