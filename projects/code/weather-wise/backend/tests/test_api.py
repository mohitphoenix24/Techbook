import json


def events(response) -> list[tuple[str, dict]]:
    out = []
    for block in response.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.split("\n"))
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_health_without_a_key(client):
    assert client.get("/api/health").json() == {"status": "ok", "model": "claude-opus-5-5", "has_key": False}


# region: nokey-test
def test_chat_without_a_key_says_so_instead_of_pretending(client):
    r = client.post("/api/chat", json={"message": "weather in Pune?"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    [(name, data)] = events(r)
    assert name == "error" and data["code"] == "no_key" and "ANTHROPIC_API_KEY" in data["message"]
# endregion: nokey-test


def test_chat_rejects_bad_input(client):
    assert client.post("/api/chat", json={"message": ""}).status_code == 422
    assert client.post("/api/chat", json={"message": "x" * 1001}).status_code == 422
    assert client.post("/api/chat", json={"message": "hi", "history": [{"role": "system", "text": "x"}]}).status_code == 422
