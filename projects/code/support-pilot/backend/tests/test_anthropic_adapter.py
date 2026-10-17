"""The real Anthropic SDK against a local fake server: structured JSON, streamed text, errors, and the gateway on top."""
import json
import random

import pytest

from app.gateway import FakeClock, Gateway
from app.llm.anthropic_client import AnthropicClient
from app.llm.base import LLMError, TextDelta, TextDone
from app.schemas import Triage
from app.triage import classify

from .fake_anthropic import running_fake

TRIAGE = {"category": "refund", "priority": "normal", "sentiment": "neutral", "language": "en", "order_ids": ["AUR-1001"], "summary": "Wants a refund.", "needs_human": False}


def client_for(url, **kw):
    return AnthropicClient("sk-test", "claude-sonnet-5-5", base_url=url, **kw)


# region: adapter-tests
async def test_triage_asks_for_a_json_schema_and_reads_the_answer_back():
    with running_fake(TRIAGE) as (url, app):
        triage, info = await classify(client_for(url), "Subject: Refund\n\nOrder AUR-1001", "Subject: Refund\n\nOrder AUR-1001")
    assert triage.category == "refund" and triage.order_ids == ["AUR-1001"] and info.usage.input_tokens == 120
    sent = app.state.requests[0]
    assert sent["output_config"]["format"]["type"] == "json_schema" and sent["output_config"]["effort"] == "medium"
    assert sent["output_config"]["format"]["schema"]["additionalProperties"] is False and set(sent["output_config"]["format"]["schema"]["properties"]) == set(Triage.model_fields)


async def test_the_draft_is_streamed_word_by_word_and_ends_with_the_usage():
    with running_fake("Hi Asha, we can refund it [kb:returns].") as (url, app):
        events = [e async for e in client_for(url).stream_text(system="Be kind.", messages=[{"role": "user", "content": "facts"}], max_tokens=300)]
    assert "".join(e.text for e in events if isinstance(e, TextDelta)).strip() == "Hi Asha, we can refund it [kb:returns]."
    done = events[-1]
    assert isinstance(done, TextDone) and done.usage.input_tokens == 80 and done.model == "claude-sonnet-5-5"
    assert app.state.requests[0]["stream"] is True and app.state.requests[0]["system"] == "Be kind."


@pytest.mark.parametrize("status,kind,code,retryable", [(401, "authentication_error", "auth", False), (429, "rate_limit_error", "rate_limited", True),
                                                        (500, "api_error", "provider_down", True), (400, "invalid_request_error", "bad_request", False)])
async def test_provider_errors_become_codes_that_say_whether_retrying_helps(status, kind, code, retryable):
    with running_fake(fail_with=(status, kind, "boom")) as (url, _):
        with pytest.raises(LLMError) as err:
            await client_for(url).complete_json(system="s", messages=[{"role": "user", "content": "x"}], schema=Triage.model_json_schema(), max_tokens=100)
    assert err.value.code == code and err.value.retryable is retryable


async def test_a_refusal_or_a_cut_off_answer_is_an_error_not_a_result():
    with running_fake(TRIAGE, stop_reason="max_tokens") as (url, _):
        with pytest.raises(LLMError) as err:
            await client_for(url).complete_json(system="s", messages=[{"role": "user", "content": "x"}], schema=Triage.model_json_schema(), max_tokens=100)
    assert err.value.code == "truncated"


async def test_the_gateway_falls_back_to_the_second_model_when_the_first_is_down():
    with running_fake(fail_with=(500, "api_error", "down")) as (down, _), running_fake(TRIAGE) as (up, backup_app):
        primary = client_for(down)
        backup = AnthropicClient("sk-test", "claude-haiku-5-5", base_url=up)
        gateway = Gateway(primary, backup, clock=FakeClock(), rng=random.Random(1), attempts=2)
        triage, info = await classify(gateway.bind("asha"), "Subject: Refund\n\nOrder AUR-1001", "Subject: Refund\n\nOrder AUR-1001")
    assert triage.category == "refund" and info.model == "claude-haiku-5-5" and info.attempts == 3
    assert backup_app.state.requests[0]["model"] == "claude-haiku-5-5"
# endregion: adapter-tests
