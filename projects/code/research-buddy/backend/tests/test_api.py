import json

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def events(response) -> list[tuple[str, dict]]:
    out = []
    for block in response.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.split("\n"))
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def client():
    return TestClient(create_app(Settings(anthropic_api_key=None, frontend_dist="nope", _env_file=None)))


def test_health_without_a_key():
    with client() as c:
        assert c.get("/api/health").json() == {"status": "ok", "model": "claude-opus-5-5", "has_key": False, "max_searches": 4}


# region: nokey-test
def test_chat_without_a_key_says_so_instead_of_pretending():
    with client() as c:
        r = c.post("/api/chat", json={"message": "who won the match?"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    [(name, data)] = events(r)
    assert name == "error" and data["code"] == "no_key" and "ANTHROPIC_API_KEY" in data["message"]
# endregion: nokey-test


def test_chat_rejects_bad_input():
    with client() as c:
        assert c.post("/api/chat", json={"message": ""}).status_code == 422
        assert c.post("/api/chat", json={"message": "x" * 1001}).status_code == 422
        assert c.post("/api/chat", json={"message": "hi", "history": [{"role": "system", "text": "x"}]}).status_code == 422
        assert c.post("/api/chat", json={"message": "hi", "history": [{"role": "user", "text": "x"}] * 13}).status_code == 422
