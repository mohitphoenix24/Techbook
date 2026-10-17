import io
import json

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.rag.embeddings import HashEmbedder

from .conftest import wait_until_ready
from .helpers import make_pdf


def parse_sse(text):
    events = []
    for block in text.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        events.append((fields["event"], json.loads(fields["data"])))
    return events


def ask(client, question, **body):
    response = client.post("/api/ask", json={"question": question, **body})
    assert response.status_code == 200, response.text
    return parse_sse(response.text)


def answer_of(events):
    return "".join(d["text"] for n, d in events if n == "delta")


def test_upload_returns_at_once_and_the_document_becomes_ready(client):
    r = client.post("/api/documents", files=[("files", ("policy.md", io.BytesIO(b"# Leave Policy\n\nYou get 24 days of leave."), "text/markdown"))])
    assert r.status_code == 202 and r.json()[0]["status"] == "queued" and r.json()[0]["title"] == "Leave Policy"
    docs = wait_until_ready(client)
    assert docs[0]["status"] == "ready" and docs[0]["n_chunks"] == 1


def test_pdfs_work_and_bad_uploads_get_the_right_status(client):
    pdf = make_pdf(["Warranty lasts 12 months."])
    assert client.post("/api/documents", files=[("files", ("w.pdf", io.BytesIO(pdf), "application/pdf"))]).status_code == 202
    assert client.post("/api/documents", files=[("files", ("x.exe", io.BytesIO(b"MZ"), "application/octet-stream"))]).status_code == 415
    assert client.post("/api/documents", files=[("files", ("scan.pdf", io.BytesIO(make_pdf([])), "application/pdf"))]).status_code == 415
    wait_until_ready(client)
    assert any(c["page"] == 1 for c in client.post("/api/search", json={"query": "warranty months"}).json()["sources"])


def test_a_too_large_upload_is_refused(tmp_path):
    settings = Settings(llm_provider="mock", database_path=str(tmp_path / "t.db"), max_upload_bytes=100, frontend_dist="nope", _env_file=None)
    with TestClient(create_app(settings)) as client:
        r = client.post("/api/documents", files=[("files", ("big.txt", io.BytesIO(b"x" * 200), "text/plain"))])
    assert r.status_code == 413


def test_sample_documents_load_once(loaded):
    titles = sorted(d["title"] for d in loaded.get("/api/documents").json())
    assert titles == ["HomeFiber broadband: service terms", "Nayan Traders Employee Handbook", "Wireless Earbuds Pro: FAQ and warranty"]
    assert loaded.post("/api/documents/samples").json() == []                                 # a second call adds nothing


# region: ask-tests
def test_an_answerable_question_streams_sources_then_a_cited_answer(loaded):
    events = ask(loaded, "How many days of annual leave do I get?")
    names = [n for n, _ in events]
    assert names[:2] == ["rewrite", "sources"] and names[-3:] == ["citations", "usage", "done"] and set(names[2:-3]) == {"delta"}

    sources = dict(events)["sources"]["sources"]
    assert sources[0]["document"] == "Nayan Traders Employee Handbook" and "24 days of paid annual leave" in sources[0]["text"]
    assert [s["n"] for s in sources] == list(range(1, len(sources) + 1))

    answer = answer_of(events)
    citations = dict(events)["citations"]
    assert "24 days" in answer and citations["invalid"] == [] and citations["uncited"] is False
    assert "24 days of paid annual leave" in sources[citations["used"][0] - 1]["text"]       # the cited source really says it
    assert dict(events)["usage"]["cost_usd"] > 0


def test_a_sentence_that_never_says_the_topic_is_found_through_its_section_heading(loaded):
    # "The earbuds play for up to 8 hours on a single charge." never says "battery": the heading "Battery and charging" does.
    events = ask(loaded, "How long does the battery last?")
    assert "play for up to 8 hours" in answer_of(events)
    sources = dict(events)["sources"]["sources"]
    eight_hours = next(s for s in sources if "play for up to 8 hours" in s["text"])
    assert eight_hours["heading"] == "Battery and charging" and eight_hours["n"] in dict(events)["citations"]["used"]


def test_an_unrelated_question_is_refused_without_calling_the_model(loaded):
    events = ask(loaded, "What is the capital of France?")
    assert answer_of(events) == "I couldn't find that in your documents."
    assert dict(events)["sources"] == {"sources": [], "relevant": False}
    assert dict(events)["citations"]["refused"] is True and dict(events)["usage"]["input_tokens"] == 0     # a free "no"


def test_a_follow_up_is_rewritten_using_the_conversation(loaded):
    history = [{"role": "user", "content": "How many days of annual leave do I get?"}, {"role": "assistant", "content": "24 days [1]"}]
    events = ask(loaded, "And sick leave?", history=history)
    rewrite = dict(events)["rewrite"]
    assert rewrite["rewritten"] and "annual leave" in rewrite["standalone"] and "sick leave" in rewrite["standalone"]
    assert "8 days per year" in answer_of(events)
    assert dict(events)["usage"]["input_tokens"] > 0                                          # the rewrite call is counted too


def test_search_can_be_limited_to_chosen_documents(loaded):
    docs = {d["filename"]: d["id"] for d in loaded.get("/api/documents").json()}
    only_earbuds = ask(loaded, "How long does the battery last?", document_ids=[docs["earbuds-faq.md"]])
    assert {s["document_id"] for s in dict(only_earbuds)["sources"]["sources"]} == {docs["earbuds-faq.md"]}
    wrong_doc = ask(loaded, "How long does the battery last?", document_ids=[docs["handbook.md"]])
    assert answer_of(wrong_doc) == "I couldn't find that in your documents."
# endregion: ask-tests


def test_modes_return_their_own_ranks(loaded):
    for mode, expected in [("keyword", (False, True)), ("vector", (True, False)), ("hybrid", (True, True))]:
        first = loaded.post("/api/search", json={"query": "late fee for paying my bill late", "mode": mode}).json()["sources"][0]
        assert (first["vector_rank"] is not None, first["keyword_rank"] is not None) == expected, mode


def test_a_passage_can_be_opened_with_its_neighbours(loaded):
    source = loaded.post("/api/search", json={"query": "sick leave doctor's note"}).json()["sources"][0]
    chunk = loaded.get(f"/api/chunks/{source['chunk_id']}").json()
    assert chunk["text"] == source["text"] and chunk["document"] == source["document"] and "before" in chunk and "after" in chunk
    assert loaded.get("/api/chunks/99999").status_code == 404


def test_deleting_a_document_removes_it_from_search(loaded):
    docs = {d["filename"]: d["id"] for d in loaded.get("/api/documents").json()}
    assert loaded.delete(f"/api/documents/{docs['earbuds-faq.md']}").status_code == 204
    assert loaded.delete(f"/api/documents/{docs['earbuds-faq.md']}").status_code == 404
    assert answer_of(ask(loaded, "How long does the battery last?")) == "I couldn't find that in your documents."


def test_validation_errors_are_normal_http_errors(client):
    assert client.post("/api/ask", json={"question": ""}).status_code == 422
    assert client.post("/api/ask", json={"question": "x", "mode": "magic"}).status_code == 422
    assert client.post("/api/ask", json={"question": "x", "top_k": 99}).status_code == 422


# region: restart-test
def test_documents_survive_a_restart_without_being_embedded_again(tmp_path):
    settings = Settings(llm_provider="mock", mock_delay_ms=0, database_path=str(tmp_path / "t.db"), frontend_dist="nope", _env_file=None)
    with TestClient(create_app(settings)) as first:
        first.post("/api/documents/samples")
        wait_until_ready(first)

    class Counting(HashEmbedder):
        documents_embedded = 0

        def embed(self, texts, kind="document"):
            if kind == "document":
                Counting.documents_embedded += len(texts)
            return super().embed(texts, kind)

    with TestClient(create_app(settings, embedder=Counting())) as second:
        assert answer_of(ask(second, "How many days of annual leave do I get?")).startswith("Every full-time employee gets 24 days")
    assert Counting.documents_embedded == 0
# endregion: restart-test


def test_changing_the_embedder_leaves_stale_vectors_until_reindexed(tmp_path):
    settings = Settings(llm_provider="mock", mock_delay_ms=0, database_path=str(tmp_path / "t.db"), frontend_dist="nope", _env_file=None)
    with TestClient(create_app(settings)) as first:
        first.post("/api/documents/samples")
        wait_until_ready(first)

    class Other(HashEmbedder):
        name = "other-model"

    with TestClient(create_app(settings, embedder=Other())) as second:
        assert second.get("/api/health").json()["stale_chunks"] > 0
        assert second.post("/api/search", json={"query": "annual leave"}).json()["sources"] == []        # nothing searchable yet
        assert second.post("/api/reindex").json()["reindexed"] > 0
        assert second.get("/api/health").json()["stale_chunks"] == 0
        assert second.post("/api/search", json={"query": "annual leave"}).json()["sources"] != []
