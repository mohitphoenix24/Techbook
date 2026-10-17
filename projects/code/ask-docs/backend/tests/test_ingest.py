import numpy as np
import pytest

from app.config import Settings
from app.db import Store
from app.ingest import UnsupportedFile, build_index, chunk_pages, embedding_text, extract_pages, ingest_document, title_from
from app.rag.chunker import Chunk
from app.rag.embeddings import HashEmbedder
from app.rag.index import Index

from .helpers import make_pdf


# region: pages-tests
def test_text_markdown_and_pdf_files_become_pages():
    assert extract_pages("a.md", b"# Title\nHello") == (["# Title\nHello"], "text")
    pages, kind = extract_pages("a.pdf", make_pdf(["Leave policy", "24 days"]))
    assert kind == "pdf" and "Leave policy" in pages[0]


def test_files_we_cannot_read_get_a_clear_error():
    with pytest.raises(UnsupportedFile, match="Upload a"):
        extract_pages("a.docx", b"PK")
    with pytest.raises(UnsupportedFile, match="could not be read"):
        extract_pages("a.pdf", b"not a pdf")
    with pytest.raises(UnsupportedFile, match="no text layer"):
        extract_pages("scan.pdf", make_pdf([]))
# endregion: pages-tests


def test_titles_come_from_the_first_heading_or_the_file_name():
    assert title_from("hr-handbook.md", "# Employee Handbook\n\nWelcome") == "Employee Handbook"
    assert title_from("hr-handbook.md", "No heading here") == "Hr Handbook"


def test_pages_are_chunked_separately_with_continuous_ordinals():
    chunks = chunk_pages(["First page sentence one. Sentence two.", "Second page sentence."], size=500, overlap=50)
    assert [(c.page, c.ordinal) for c in chunks] == [(1, 0), (2, 1)]


def test_the_heading_is_part_of_what_gets_embedded():
    assert embedding_text(Chunk("carry over 6 days", 0, 10, 1, 0, heading="Leave")) == "Leave\ncarry over 6 days"
    assert embedding_text(Chunk("carry over 6 days", 0, 10, 1, 0)) == "carry over 6 days"


def make(tmp_path):
    settings = Settings(database_path=str(tmp_path / "t.db"), _env_file=None)
    emb = HashEmbedder()
    return settings, Store(settings.database_path), emb, Index(emb)


# region: ingest-tests
def test_ingestion_stores_chunks_indexes_them_and_reports_progress(tmp_path):
    settings, store, emb, index = make(tmp_path)
    did = store.create_document("Handbook", "h.md", "text")
    seen = []
    ingest_document(store, index, emb, settings, did, ["# Leave\n\nYou get 24 days of annual leave. " * 3], on_progress=seen.append)

    doc = store.get_document(did)
    assert doc["status"] == "ready" and doc["n_chunks"] >= 1 and doc["progress"] == 1.0 and seen[-1] == 1.0
    assert len(index.ids) == doc["n_chunks"] and index.search("annual leave")[0].chunk_id in index.ids


def test_a_failure_is_recorded_on_the_document_not_lost(tmp_path):
    settings, store, emb, index = make(tmp_path)
    did = store.create_document("Empty", "e.md", "text")
    ingest_document(store, index, emb, settings, did, ["   \n\n  "])
    doc = store.get_document(did)
    assert doc["status"] == "failed" and "no readable text" in doc["error"] and index.ids == []


def test_the_index_is_rebuilt_from_saved_vectors_without_calling_the_embedder(tmp_path):
    settings, store, emb, index = make(tmp_path)
    did = store.create_document("Handbook", "h.md", "text")
    ingest_document(store, index, emb, settings, did, ["Sick leave is 8 days per year. A doctor's note is needed."])

    class Forbidden(HashEmbedder):
        def embed(self, texts, kind="document"):
            if kind == "document":
                raise AssertionError("must not re-embed documents at start-up")
            return super().embed(texts, kind)

    rebuilt = build_index(store, Forbidden())
    assert rebuilt.ids == index.ids and np.allclose(rebuilt.matrix, index.matrix)
    assert rebuilt.search("sick leave days")[0].chunk_id == index.ids[0]
# endregion: ingest-tests


# region: stale-test
def test_vectors_from_another_embedder_are_not_loaded(tmp_path):
    settings, store, emb, index = make(tmp_path)
    did = store.create_document("Handbook", "h.md", "text")
    ingest_document(store, index, emb, settings, did, ["Sick leave is 8 days per year."])

    class Other(HashEmbedder):
        name = "other-model"

    assert build_index(store, Other()).ids == []
    assert len(store.stale_chunks("other-model")) == 1
# endregion: stale-test
