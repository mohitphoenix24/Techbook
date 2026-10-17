"""The real Anthropic SDK against a local fake server: proves what we send and how we read the reply."""
import pytest

from app.doctypes import DOC_TYPES
from app.extract import extract_document
from app.llm import LLMError
from app.llm.anthropic_client import AnthropicClient

from .fake_anthropic import running_fake

SCHEMA = DOC_TYPES["invoice"].model.model_json_schema()
MESSAGES = [{"role": "user", "content": "Extract the invoice"}]


def client_for(url):
    return AnthropicClient("sk-test", "claude-sonnet-5-5", effort="medium", base_url=url, max_retries=0)


# region: adapter-tests
async def test_sends_a_transformed_schema_and_returns_the_json_text():
    with running_fake({"vendor": "Acme"}) as (url, app):
        result = await client_for(url).complete_json(system="Be exact.", messages=MESSAGES, schema=SCHEMA, max_tokens=2000)

    assert result.text == '{"vendor": "Acme"}' and result.usage.input_tokens == 120 and result.usage.output_tokens == 45
    sent = app.state.requests[0]
    assert sent["model"] == "claude-sonnet-5-5" and sent["system"] == "Be exact." and sent["messages"] == MESSAGES
    assert sent["output_config"]["effort"] == "medium"
    fmt = sent["output_config"]["format"]
    assert fmt["type"] == "json_schema" and fmt["schema"]["additionalProperties"] is False
    assert "minLength" not in str(fmt["schema"]) and "exclusiveMinimum" in str(fmt["schema"]["$defs"]["LineItem"]["properties"]["quantity"]["description"])


async def test_refusals_and_truncation_are_errors_not_garbage_json():
    for stop_reason, code in [("refusal", "refused"), ("max_tokens", "truncated")]:
        with running_fake('{"vendor": "Ac', stop_reason=stop_reason) as (url, _):
            with pytest.raises(LLMError) as info:
                await client_for(url).complete_json(system="", messages=MESSAGES, schema=SCHEMA, max_tokens=10)
        assert info.value.code == code
# endregion: adapter-tests


@pytest.mark.parametrize("status,kind,code", [(401, "authentication_error", "auth"), (429, "rate_limit_error", "rate_limited"),
                                               (500, "api_error", "provider_down"), (400, "invalid_request_error", "bad_request")])
async def test_sdk_errors_are_translated(status, kind, code):
    with running_fake(fail_with=(status, kind, "nope")) as (url, _):
        with pytest.raises(LLMError) as info:
            await client_for(url).complete_json(system="", messages=MESSAGES, schema=SCHEMA, max_tokens=10)
    assert info.value.code == code


async def test_the_whole_pipeline_works_with_the_real_sdk_and_a_fake_server():
    from app.llm.mock_client import MockClient
    from app.doctypes.samples import SAMPLES

    text = SAMPLES["invoice"][0]["text"]
    good = (await extract_document(MockClient(), DOC_TYPES["invoice"], text)).data
    with running_fake(good) as (url, app):
        result = await extract_document(client_for(url), DOC_TYPES["invoice"], text)
    assert result.valid and result.data["invoice_number"] == "INV-2026-0042" and len(app.state.requests) == 1
