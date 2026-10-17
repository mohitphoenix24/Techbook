"""The real Anthropic SDK against a local fake server: streamed text, streamed tool calls, and a whole agent run."""
import pytest

from app.agent import run_agent
from app.llm import LLMError, TextDelta, TurnDone
from app.llm.anthropic_client import AnthropicClient
from app.tools import TOOLS, ToolBox

from .fake_anthropic import running_fake


def client_for(url):
    return AnthropicClient("sk-test", "claude-sonnet-5-5", base_url=url, max_retries=0)


async def one_turn(client, **kw):
    events = [e async for e in client.turn(system="Be exact.", messages=[{"role": "user", "content": "How many customers?"}], tools=TOOLS, max_tokens=500, **kw)]
    return events[:-1], events[-1].turn


# region: adapter-tests
async def test_a_turn_with_text_and_a_tool_call_is_read_back_correctly():
    script = [[("text", "Let me count them."), ("tool_use", "toolu_9", "run_sql", {"query": "SELECT COUNT(*) FROM customers"})]]
    with running_fake(script) as (url, app):
        deltas, turn = await one_turn(client_for(url))

    assert "".join(d.text for d in deltas if isinstance(d, TextDelta)).strip() == "Let me count them."
    assert turn.stop_reason == "tool_use" and turn.text.strip() == "Let me count them."
    assert [(u.id, u.name, u.input) for u in turn.tool_uses] == [("toolu_9", "run_sql", {"query": "SELECT COUNT(*) FROM customers"})]
    assert turn.usage.input_tokens == 50 and turn.usage.output_tokens == 30

    sent = app.state.requests[0]
    assert [t["name"] for t in sent["tools"]] == ["list_tables", "describe_table", "run_sql", "show_chart"]
    assert sent["tools"][2]["strict"] is True and sent["system"] == "Be exact." and sent["output_config"] == {"effort": "medium"}


async def test_a_whole_agent_run_with_the_real_sdk(db_path):
    script = [
        [("text", "I will count."), ("tool_use", "toolu_1", "run_sql", {"query": "SELECT COUNT(*) AS customers FROM customers"})],
        [("text", "There are 60 customers.")],
    ]
    with running_fake(script) as (url, app):
        events = [e async for e in run_agent(client_for(url), ToolBox(db_path), "How many customers?", [])]

    assert [e["type"] for e in events if e["type"] != "delta"] == ["turn", "tool_call", "tool_result", "turn", "done"]
    assert events[-1]["answer"].strip() == "There are 60 customers."
    second = app.state.requests[1]["messages"]                                                      # what the SDK sent on turn two
    assert second[1]["role"] == "assistant" and any(b["type"] == "tool_use" and b["id"] == "toolu_1" for b in second[1]["content"])
    assert second[2]["content"][0]["type"] == "tool_result" and second[2]["content"][0]["content"] == "customers\n60"
# endregion: adapter-tests


@pytest.mark.parametrize("status,kind,code", [(401, "authentication_error", "auth"), (429, "rate_limit_error", "rate_limited"), (500, "api_error", "provider_down"), (400, "invalid_request_error", "bad_request")])
async def test_sdk_errors_are_translated(status, kind, code):
    with running_fake(fail_with=(status, kind, "nope")) as (url, _):
        with pytest.raises(LLMError) as info:
            await one_turn(client_for(url))
    assert info.value.code == code
