import json

from app.seed import SAMPLES


def events(response) -> list[tuple[str, dict]]:
    out = []
    for block in response.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.split("\n"))
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_health_without_a_key(client):
    assert client.get("/api/health").json() == {"status": "ok", "model": "claude-opus-5-5", "has_key": False}


def test_a_new_folder_gets_the_sample_notes(client):
    names = [n["name"] for n in client.get("/api/notes").json()]
    assert names == sorted(SAMPLES)


def test_read_a_note(client):
    body = client.get("/api/notes/recipes").json()
    assert body["name"] == "recipes" and body["content"].startswith("# Recipes to try")
    assert client.get("/api/notes/nope").status_code == 404
    assert client.get("/api/notes/Not-Valid").status_code == 404
    assert client.get("/api/notes/..%2F..%2Fetc%2Fpasswd").status_code == 404
    assert client.get("/api/notes/..").status_code in (400, 404)


# region: approval-api-tests
def propose(client, **body):
    return client.app.state.proposals.add(client.app.state.notes, body["action"], body["name"], body.get("content"), "test")


def test_the_person_applies_a_proposal(client):
    p = propose(client, action="append", name="recipes", content="## Chai\nTea, milk, ginger.")
    [listed] = client.get("/api/proposals").json()
    assert listed["id"] == p.id and listed["status"] == "pending" and "+## Chai" in listed["diff"]
    assert "Chai" not in client.get("/api/notes/recipes").json()["content"]               # proposed, not applied
    assert client.post(f"/api/proposals/{p.id}/apply").json()["status"] == "applied"
    assert "## Chai" in client.get("/api/notes/recipes").json()["content"]


def test_the_person_rejects_a_proposal(client):
    p = propose(client, action="delete", name="trip-ideas")
    assert client.post(f"/api/proposals/{p.id}/reject").json()["status"] == "rejected"
    assert client.get("/api/notes/trip-ideas").status_code == 200


def test_applying_twice_and_unknown_proposals(client):
    p = propose(client, action="append", name="recipes", content="x")
    client.post(f"/api/proposals/{p.id}/apply")
    assert client.post(f"/api/proposals/{p.id}/apply").status_code == 409
    assert client.post(f"/api/proposals/{p.id}/reject").status_code == 409
    assert client.post("/api/proposals/99/apply").status_code == 404
    assert client.post("/api/proposals/99/reject").status_code == 404


def test_a_stale_proposal_is_a_409_with_the_reason(client):
    p = propose(client, action="replace", name="recipes", content="# Recipes\nnew\n")
    client.app.state.notes.write("recipes", "edited by the person")
    r = client.post(f"/api/proposals/{p.id}/apply")
    assert r.status_code == 409 and "changed after this was proposed" in r.json()["detail"]
# endregion: approval-api-tests


# region: nokey-test
def test_chat_without_a_key_says_so_instead_of_pretending(client):
    r = client.post("/api/chat", json={"message": "what is in my notes?"})
    [(name, data)] = events(r)
    assert name == "error" and data["code"] == "no_key" and "ANTHROPIC_API_KEY" in data["message"]
# endregion: nokey-test


def test_chat_rejects_bad_input(client):
    assert client.post("/api/chat", json={"message": ""}).status_code == 422
    assert client.post("/api/chat", json={"message": "x" * 1001}).status_code == 422
