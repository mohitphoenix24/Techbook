"""The real Anthropic SDK against a local fake server: streaming answers and the short non-streaming rewrite call."""
import pytest

from app.llm import LLMError, StreamDone, TextDelta
from app.llm.anthropic_client import AnthropicClient

from .fake_anthropic import running_fake


def client_for(url):
    return AnthropicClient("sk-test", "claude-sonnet-5-5", base_url=url, max_retries=0)


async def test_streams_an_answer_and_reports_usage():
    with running_fake(words=("24 days", " of leave", " [1]")) as (url, app):
        events = [e async for e in client_for(url).stream(system="Use sources.", messages=[{"role": "user", "content": "<sources>...</sources>\n\nQuestion: leave?"}], max_tokens=500)]
    assert "".join(e.text for e in events if isinstance(e, TextDelta)) == "24 days of leave [1]"
    assert isinstance(events[-1], StreamDone) and events[-1].usage.input_tokens == 21
    assert app.state.requests[0]["system"] == "Use sources." and app.state.requests[0]["stream"] is True


async def test_complete_makes_a_plain_call_for_the_rewrite():
    with running_fake(words=("How many days of sick leave?",)) as (url, app):
        result = await client_for(url).complete(system="Rewrite.", messages=[{"role": "user", "content": "..."}], max_tokens=100)
    assert result.text == "How many days of sick leave?" and result.usage.input_tokens == 30
    assert "stream" not in app.state.requests[0] or app.state.requests[0]["stream"] is False


@pytest.mark.parametrize("status,kind,code", [(401, "authentication_error", "auth"), (429, "rate_limit_error", "rate_limited"), (500, "api_error", "provider_down")])
async def test_errors_are_translated(status, kind, code):
    with running_fake(fail_with=(status, kind, "nope")) as (url, _):
        with pytest.raises(LLMError) as info:
            await client_for(url).complete(system="", messages=[{"role": "user", "content": "x"}], max_tokens=10)
    assert info.value.code == code
