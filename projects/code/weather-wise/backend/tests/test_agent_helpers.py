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
    msgs = history_messages([Turn(role="assistant", text="Hi!"), Turn(role="user", text="weather?"), Turn(role="assistant", text="Sunny.")])
    assert msgs == [{"role": "user", "content": "weather?"}, {"role": "assistant", "content": "Sunny."}]


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


def test_cost():
    assert cost_usd("claude-opus-5-5", 1_000_000, 100_000) == 6.0
    assert cost_usd("some-new-model", 1000, 0) == cost_usd("claude-opus-5-5", 1000, 0)
