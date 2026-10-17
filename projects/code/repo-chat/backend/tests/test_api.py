import zipfile
import io

from .conftest import events_of, make_zip


def ask(client, question, repo="sample", **kw):
    r = client.post(f"/api/repos/{repo}/ask", json={"question": question, **kw})
    assert r.status_code == 200, r.text
    return events_of(r)


# region: api-tests
def test_the_sample_repository_is_there_from_the_start(client):
    [repo] = client.get("/api/repos").json()
    assert repo["id"] == "sample" and repo["builtin"] and repo["files"] == 14 and repo["chunks"] > 50 and repo["languages"] == {"py": 12, "md": 2}
    assert client.get("/api/health").json() == {"status": "ok", "provider": "mock", "model": "mock-1"}


def test_the_file_tree_and_a_file_can_be_read(client):
    tree = client.get("/api/repos/sample/tree").json()
    assert {"path": "jobq/retry.py", "lines": 36, "chunks": 5} in tree
    file = client.get("/api/repos/sample/file", params={"path": "jobq/retry.py"}).json()
    assert file["lines"][19].startswith("def backoff_delay")


def test_a_path_is_looked_up_in_memory_so_traversal_is_just_not_found(client):
    for path in ("../../../etc/passwd", "/etc/passwd", "jobq/../../secrets.env", "nope.py"):
        assert client.get("/api/repos/sample/file", params={"path": path}).status_code == 404


def test_a_question_streams_retrieval_then_words_then_checked_citations_then_the_cost(client):
    events = ask(client, "Where is the retry delay calculated?")
    assert [n for n, _ in events if n != "delta"] == ["retrieval", "citations", "usage", "done"]
    data = dict(events)
    assert data["retrieval"]["hits"][0]["name"] == "backoff_delay" and "retry" in data["retrieval"]["terms"]
    answer = "".join(d["text"] for n, d in events if n == "delta")
    assert "[jobq/retry.py:20-29]" in answer and "backoff_delay" in answer
    assert all(c["status"] == "valid" for c in data["citations"]["items"]) and data["citations"]["items"]
    assert data["usage"]["cost_usd"] > 0


def test_an_answer_that_cites_code_that_does_not_exist_is_flagged(client):
    citations = dict(ask(client, "Where is the retry delay calculated?", simulate="bad_citation"))["citations"]["items"]
    assert {c["status"] for c in citations} >= {"valid", "no_such_file", "bad_lines"}


def test_a_question_with_no_relevant_code_never_calls_the_model(client):
    events = ask(client, "What is the airspeed velocity of an unladen swallow?")
    assert [n for n, _ in events] == ["retrieval", "delta", "citations", "done"]
    assert events[0][1]["hits"] == [] and "could not find anything" in events[1][1]["text"]


def test_the_search_endpoint_shows_what_would_be_sent_and_why(client):
    hits = client.get("/api/repos/sample/search", params={"q": "What does Worker._handle_failure do?", "k": 3}).json()["hits"]
    assert hits[0]["name"] == "Worker._handle_failure" and "named in the question" in hits[0]["reasons"]
    assert any(h["expanded"] for h in hits)
    assert client.get("/api/repos/sample/search", params={"q": "What does Worker._handle_failure do?", "expand": "false"}).json()["hits"][-1]["expanded"] is False


def test_validation_errors_and_unknown_repositories_are_ordinary_http_errors(client):
    assert client.post("/api/repos/sample/ask", json={"question": "x"}).status_code == 422
    assert client.post("/api/repos/nope/ask", json={"question": "a real question"}).status_code == 404
    assert client.get("/api/repos/nope").json()["detail"]["code"] == "not_found"
# endregion: api-tests


# region: upload-tests
def upload(client, files, name="mine.zip"):
    return client.post("/api/repos", files={"file": (name, make_zip(files), "application/zip")})


def test_an_uploaded_repository_is_indexed_and_can_be_asked_about(client):
    r = upload(client, {"app/pay.py": 'def charge_card(amount):\n    """Charge the customer\'s card for `amount` rupees."""\n    return amount\n', "README.md": "# Pay\nTakes payments."})
    assert r.status_code == 201 and r.json()["files"] == 2 and r.json()["name"] == "mine"
    repo_id = r.json()["id"]
    answer = "".join(d["text"] for n, d in ask(client, "Where do we charge the card?", repo=repo_id) if n == "delta")
    assert "charge_card" in answer and "[app/pay.py:1-3]" in answer


def test_uploading_the_same_content_twice_is_the_same_repository(client):
    files = {"a.py": "def a():\n    return 1\n"}
    assert upload(client, files).json()["id"] == upload(client, files, name="again.zip").json()["id"] and len(client.get("/api/repos").json()) == 2


def test_bad_uploads_are_refused_with_a_clear_message(client):
    assert upload(client, {"../evil.py": "x"}).json()["detail"]["message"].startswith("Unsafe file path")
    assert client.post("/api/repos", files={"file": ("notes.txt", b"hi", "text/plain")}).json()["detail"]["code"] == "not_a_zip"
    assert client.post("/api/repos", files={"file": ("x.zip", b"not a zip at all", "application/zip")}).json()["detail"]["message"] == "That is not a valid ZIP file."
    assert upload(client, {"logo.png": b"\x89PNG"}).json()["detail"]["message"].startswith("No readable source files")


def test_an_oversized_upload_is_refused_before_it_is_read_in_full(settings):
    from fastapi.testclient import TestClient
    from app.main import create_app
    settings.max_zip_bytes = 2000
    with TestClient(create_app(settings)) as c:
        big = io.BytesIO()
        with zipfile.ZipFile(big, "w", zipfile.ZIP_STORED) as z:
            z.writestr("a.py", "x = 1\n" * 2000)
        r = c.post("/api/repos", files={"file": ("big.zip", big.getvalue(), "application/zip")})
        assert r.status_code == 400 and "too large" in r.json()["detail"]["message"]


def test_the_number_of_uploaded_repositories_is_limited_and_one_can_be_removed(settings):
    from fastapi.testclient import TestClient
    from app.main import create_app
    settings.max_repos = 2
    with TestClient(create_app(settings)) as c:
        ids = [upload(c, {"a.py": f"def f{i}():\n    return {i}\n"}).json()["id"] for i in range(2)]
        assert upload(c, {"a.py": "def z():\n    return 0\n"}).json()["detail"]["message"].startswith("You already have 2")
        assert c.delete(f"/api/repos/{ids[0]}").status_code == 204
        assert upload(c, {"a.py": "def z():\n    return 0\n"}).status_code == 201
        assert c.delete("/api/repos/sample").status_code == 404                 # the built-in repository cannot be removed
# endregion: upload-tests
