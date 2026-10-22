import anthropic
import httpx2 as httpx

from app.agent import history_messages
from app.config import Settings
from app.llm import explain, make_client
from app.pricing import cost_usd
from app.schemas import Turn


def err(cls, status: int, message: str = "boom"):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls(message, response=httpx.Response(status, request=request), body=None)


def test_history_becomes_plain_messages_and_starts_with_the_user():
    msgs = history_messages([Turn(role="assistant", text="Hi!"), Turn(role="user", text="latest news?"), Turn(role="assistant", text="Here it is.")])
    assert msgs == [{"role": "user", "content": "latest news?"}, {"role": "assistant", "content": "Here it is."}]


def test_each_sdk_error_gets_a_plain_message():
    assert explain(err(anthropic.AuthenticationError, 401))["code"] == "auth"
    assert explain(err(anthropic.NotFoundError, 404))["code"] == "model"
    rate = explain(err(anthropic.RateLimitError, 429))
    assert rate["code"] == "rate_limited" and rate["retryable"]
    assert explain(err(anthropic.InternalServerError, 500))["code"] == "provider_down"
    assert "boom" in explain(err(anthropic.BadRequestError, 400))["message"]
    assert explain(anthropic.APIConnectionError(request=httpx.Request("POST", "https://x")))["code"] == "network"


def test_no_key_no_client():
    assert make_client(Settings(anthropic_api_key=None, _env_file=None)) is None
    assert make_client(Settings(anthropic_api_key="sk-ant-test", _env_file=None)) is not None


def test_an_unknown_model_is_priced_like_the_default():
    assert cost_usd("some-new-model", 1000, 0) == cost_usd("claude-opus-5-5", 1000, 0)


# region: append-tests
def test_a_continued_turn_joins_the_previous_assistant_message():
    from app.agent import append_assistant
    messages = [{"role": "user", "content": "q"}]
    append_assistant(messages, ["block 1", "block 2"])                    # a paused turn
    append_assistant(messages, ["block 3"])                               # its continuation
    assert messages == [{"role": "user", "content": "q"}, {"role": "assistant", "content": ["block 1", "block 2", "block 3"]}]
    messages.append({"role": "user", "content": ["result"]})
    append_assistant(messages, ["next turn"])                             # after a user message, a new assistant message starts
    assert [m["role"] for m in messages] == ["user", "assistant", "user", "assistant"]
# endregion: append-tests
