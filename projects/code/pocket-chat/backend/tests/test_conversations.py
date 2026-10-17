from .conftest import chat


def test_health_and_personas(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    ids = [p["id"] for p in client.get("/api/personas").json()]
    assert ids[0] == "friendly" and "tutor" in ids


def test_list_get_delete(client):
    assert client.get("/api/conversations").json() == []
    _, a = chat(client, message="first chat about cats")
    _, b = chat(client, message="second chat about dogs")
    listing = client.get("/api/conversations").json()
    assert [c["title"] for c in listing] == ["second chat about dogs", "first chat about cats"]   # newest first
    assert listing[0]["message_count"] == 2

    cid = a[0][1]["conversation_id"]
    detail = client.get(f"/api/conversations/{cid}").json()
    assert detail["title"] == "first chat about cats" and len(detail["messages"]) == 2

    assert client.delete(f"/api/conversations/{cid}").status_code == 204
    assert client.get(f"/api/conversations/{cid}").status_code == 404
    assert client.delete(f"/api/conversations/{cid}").status_code == 404
    assert len(client.get("/api/conversations").json()) == 1


def test_built_frontend_is_served_next_to_the_api(tmp_path):
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import create_app

    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<h1>Pocket Chat</h1>")
    settings = Settings(llm_provider="mock", database_path=str(tmp_path / "t.db"), frontend_dist=str(dist), _env_file=None)
    with TestClient(create_app(settings)) as client:
        assert "Pocket Chat" in client.get("/").text
        assert client.get("/api/health").json() == {"status": "ok"}      # the API still wins
