import asyncio

from app.config import Settings
from app.db import Store
from app.llm import LLMError, StreamDone, TextDelta, Usage
from app.llm.mock_client import MockClient
from app.main import create_app
from app.routes.chat import chat_events
from fastapi.testclient import TestClient

from .conftest import chat, parse_sse


# region: stream-tests
def test_stream_has_the_expected_event_order(client):
    response, events = chat(client, message="hello there")
    assert response.headers["content-type"].startswith("text/event-stream")
    names = [name for name, _ in events]
    assert names[0] == "meta" and names[-2:] == ["usage", "done"]
    assert set(names[1:-2]) == {"delta"} and len(names) > 5


def test_deltas_join_into_the_saved_reply(client):
    _, events = chat(client, message="hello there")
    streamed = "".join(data["text"] for name, data in events if name == "delta")
    conversation_id = events[0][1]["conversation_id"]
    saved = client.get(f"/api/conversations/{conversation_id}").json()["messages"]
    assert [m["role"] for m in saved] == ["user", "assistant"]
    assert saved[1]["content"] == streamed and saved[1]["stopped"] is False


# endregion: stream-tests


def test_usage_and_cost_are_reported_and_stored(client):
    _, events = chat(client, message="hello there")
    usage = dict(events)["usage"]
    assert usage["input_tokens"] > 0 and usage["output_tokens"] > 0 and usage["cost_usd"] > 0
    saved = client.get(f"/api/conversations/{events[0][1]['conversation_id']}").json()["messages"][1]
    assert saved["output_tokens"] == usage["output_tokens"]


def test_follow_up_sends_the_history(client):
    _, first = chat(client, message="hello there")
    cid = first[0][1]["conversation_id"]
    _, second = chat(client, conversation_id=cid, message="tell me something odd")
    text = "".join(d["text"] for n, d in second if n == "delta")
    assert "I can see 2 earlier messages" in text


def test_regenerate_replaces_the_last_answer(client):
    _, first = chat(client, message="tell me something odd")
    cid = first[0][1]["conversation_id"]
    _, again = chat(client, conversation_id=cid, regenerate=True)
    assert again[-1][0] == "done"
    messages = client.get(f"/api/conversations/{cid}").json()["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"]          # not user, assistant, assistant


def test_persona_changes_the_system_prompt(client):
    _, events = chat(client, message="tell me something odd", persona="tutor")
    text = "".join(d["text"] for n, d in events if n == "delta")
    assert text.endswith("What do you think happens next?")


def test_validation_errors_are_normal_http_errors(client):
    assert client.post("/api/chat", json={"message": "   "}).status_code == 422
    assert client.post("/api/chat", json={"message": "x" * 9000}).status_code == 422
    assert client.post("/api/chat", json={"conversation_id": "nope", "message": "hi"}).status_code == 404
    assert client.post("/api/chat", json={"conversation_id": "nope", "regenerate": True}).status_code == 404


def test_old_messages_are_trimmed_to_the_budget(tmp_path):
    settings = Settings(llm_provider="mock", mock_delay_ms=0, database_path=str(tmp_path / "t.db"), context_budget_tokens=60, _env_file=None)
    with TestClient(create_app(settings)) as client:
        _, events = chat(client, message="hello " * 40)
        cid = events[0][1]["conversation_id"]
        _, events = chat(client, conversation_id=cid, message="and another question please")
        assert events[0][1]["history_dropped"] >= 1


# region: failing-llm
class ExplodingLLM:
    name, model = "boom", "boom-1"

    async def stream(self, *, system, messages, max_tokens):
        yield TextDelta("partial ")
        raise LLMError("rate_limited", "slow down", retryable=True)


def test_provider_errors_become_an_error_event_and_keep_partial_text(settings):
    with TestClient(create_app(settings, llm=ExplodingLLM())) as client:
        _, events = chat(client, message="hi")
        assert events[-1] == ("error", {"code": "rate_limited", "message": "slow down", "retryable": True})
        cid = events[0][1]["conversation_id"]
        saved = client.get(f"/api/conversations/{cid}").json()["messages"][-1]
        assert saved["content"] == "partial " and saved["stopped"] is True
# endregion: failing-llm


# region: stop-test
async def test_closing_the_stream_saves_the_partial_reply_as_stopped(tmp_path):
    """What happens when the user presses Stop: the browser drops the connection and the generator is closed."""
    settings = Settings(llm_provider="mock", mock_delay_ms=0, database_path=str(tmp_path / "t.db"), _env_file=None)
    store = Store(settings.database_path)
    cid = store.create_conversation("hi", "friendly")
    store.add_message(cid, "user", "give me a plan")

    stream = chat_events(store=store, llm=MockClient(delay_ms=0), settings=settings, conversation_id=cid, persona="friendly")
    seen = [await stream.__anext__() for _ in range(4)]          # meta + three deltas
    assert seen[0].startswith("event: meta")
    await stream.aclose()                                         # <- the client went away

    saved = store.messages(cid)[-1]
    assert saved["role"] == "assistant" and saved["stopped"] is True and len(saved["content"]) > 0
    assert saved["content"].startswith("Here is")
# endregion: stop-test


def test_mock_respects_max_tokens():
    async def run():
        events = [e async for e in MockClient(delay_ms=0).stream(system="", messages=[{"role": "user", "content": "give me a plan"}], max_tokens=5)]
        return events[-1]

    done = asyncio.run(run())
    assert isinstance(done, StreamDone) and done.stop_reason == "max_tokens" and isinstance(done.usage, Usage)
