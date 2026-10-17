"""The real Anthropic SDK against a local fake server: streamed text, errors, and a whole question end to end."""
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.llm import LLMError, TextDelta, TextDone
from app.llm.anthropic_client import AnthropicClient
from app.main import create_app

from .conftest import events_of
from .fake_anthropic import running_fake


def client_for(url, **kw):
    return AnthropicClient("sk-test", "claude-sonnet-5-5", base_url=url, max_retries=0, **kw)


# region: adapter-tests
async def test_the_answer_is_streamed_word_by_word_and_ends_with_the_usage():
    with running_fake("The delay is computed by backoff_delay [jobq/retry.py:20-29].") as (url, app):
        events = [e async for e in client_for(url).stream_text(system="Be exact.", messages=[{"role": "user", "content": "q"}], max_tokens=300)]
    assert "".join(e.text for e in events if isinstance(e, TextDelta)).strip() == "The delay is computed by backoff_delay [jobq/retry.py:20-29]."
    assert isinstance(events[-1], TextDone) and events[-1].usage.input_tokens == 80
    sent = app.state.requests[0]
    assert sent["stream"] is True and sent["system"] == "Be exact." and sent["output_config"] == {"effort": "medium"}


@pytest.mark.parametrize("status,kind,code,retryable", [(401, "authentication_error", "auth", False), (429, "rate_limit_error", "rate_limited", True),
                                                        (500, "api_error", "provider_down", True), (400, "invalid_request_error", "bad_request", False)])
async def test_provider_errors_become_codes_that_say_whether_retrying_helps(status, kind, code, retryable):
    with running_fake(fail_with=(status, kind, "boom")) as (url, _):
        with pytest.raises(LLMError) as err:
            [e async for e in client_for(url).stream_text(system="s", messages=[{"role": "user", "content": "q"}], max_tokens=100)]
    assert err.value.code == code and err.value.retryable is retryable


async def test_a_cut_off_answer_is_an_error_not_an_answer():
    with running_fake("half an ans", stop_reason="max_tokens") as (url, _):
        with pytest.raises(LLMError) as err:
            [e async for e in client_for(url).stream_text(system="s", messages=[{"role": "user", "content": "q"}], max_tokens=100)]
    assert err.value.code == "truncated"


def test_a_whole_question_with_the_real_sdk_sends_the_code_with_line_numbers_and_checks_the_citations():
    reply = "The wait is computed in backoff_delay [jobq/retry.py:20-29], and nothing at [jobq/nowhere.py:1-3]."
    with running_fake(reply) as (url, fake):
        settings = Settings(llm_provider="anthropic", anthropic_api_key="sk-test", frontend_dist="nope", _env_file=None)
        from app.llm.anthropic_client import AnthropicClient as Real
        with TestClient(create_app(settings, llm=Real("sk-test", "claude-sonnet-5-5", base_url=url, max_retries=0))) as c:
            events = events_of(c.post("/api/repos/sample/ask", json={"question": "Where is the retry delay calculated?"}))
    sent = fake.state.requests[0]["messages"][0]["content"]
    assert "### jobq/retry.py:20-29  (function backoff_delay)" in sent and "  20 | def backoff_delay(" in sent and "QUESTION: Where is the retry delay calculated?" in sent
    statuses = {c["path"]: c["status"] for c in dict(events)["citations"]["items"]}
    assert statuses == {"jobq/retry.py": "valid", "jobq/nowhere.py": "no_such_file"}
# endregion: adapter-tests
