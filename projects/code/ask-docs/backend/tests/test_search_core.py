import httpx
import numpy as np
import pytest

from app.rag.bm25 import BM25
from app.rag.embeddings import HashEmbedder, VoyageEmbedder
from app.rag.fusion import rrf
from app.rag.index import Index


# region: bm25-tests
def test_rare_words_matter_more_than_common_ones():
    bm = BM25()
    bm.add(1, "leave leave leave policy for all staff members and the company")
    bm.add(2, "the policy about bereavement")
    bm.add(3, "the policy about travel and the policy about meals")
    ranked = [d for d, _ in bm.search("bereavement policy")]
    assert ranked[0] == 2                                   # "bereavement" is rare, "policy" is everywhere


def test_a_long_passage_does_not_win_just_by_being_long():
    bm = BM25()
    bm.add(1, "refund policy")
    bm.add(2, "refund " + "filler words about nothing in particular " * 30)
    assert bm.search("refund")[0][0] == 1


def test_unknown_words_score_nothing_and_filters_and_removal_work():
    bm = BM25()
    bm.add(1, "annual leave"); bm.add(2, "annual bonus")
    assert bm.search("zebra") == []
    assert [d for d, _ in bm.search("annual", allowed={2})] == [2]
    bm.remove({1})
    assert [d for d, _ in bm.search("annual")] == [2] and bm.search("leave") == []
# endregion: bm25-tests


# region: fusion-tests
def test_rrf_rewards_agreement_between_rankings():
    keyword = [1, 2, 3, 4]
    vector = [3, 9, 1, 8]
    fused = [i for i, _ in rrf([keyword, vector])]
    assert fused[:2] == [1, 3]                              # both rankings contain 1 and 3, so they beat the rest
    assert set(fused) == {1, 2, 3, 4, 8, 9}


def test_rrf_uses_ranks_not_scores():
    assert rrf([[7, 8]]) == [(7, 1 / 61), (8, 1 / 62)]
# endregion: fusion-tests


# region: embedding-tests
def test_hash_embeddings_are_unit_length_deterministic_and_lexical():
    emb = HashEmbedder()
    a, b, c, empty = emb.embed(["annual leave policy", "leave policy for staff", "earbud battery life", ""])
    assert np.isclose(np.linalg.norm(a), 1.0) and np.all(emb.embed(["annual leave policy"])[0] == a)
    assert a @ b > a @ c + 0.2                              # shared words -> close
    assert not empty.any()                                  # no words, no vector (and no division by zero)


def test_voyage_embedder_sends_the_documented_request_and_normalises_the_reply():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        seen["url"], seen["auth"], seen["body"] = str(request.url), request.headers["authorization"], json.loads(request.content)
        return httpx.Response(200, json={"data": [{"embedding": [3.0, 4.0]}, {"embedding": [0.0, 2.0]}], "usage": {"total_tokens": 5}})

    emb = VoyageEmbedder("pa-test", transport=httpx.MockTransport(handler))
    vectors = emb.embed(["one", "two"], kind="query")
    assert seen["url"] == "https://api.voyageai.com/v1/embeddings" and seen["auth"] == "Bearer pa-test"
    assert seen["body"] == {"input": ["one", "two"], "model": "voyage-3.5-lite", "input_type": "query"}
    assert np.allclose(vectors, [[0.6, 0.8], [0.0, 1.0]]) and emb.dim == 2


def test_fastembed_understands_meaning():
    pytest.importorskip("fastembed")
    from app.rag.embeddings import FastEmbedder

    emb = FastEmbedder()
    q = emb.embed(["Can I take time off when my father passes away?"], kind="query")[0]
    docs = emb.embed(["Employees get 5 days of bereavement leave when a close family member dies.", "The earbuds play for 8 hours."])
    assert q @ docs[0] > q @ docs[1] + 0.15


# endregion: embedding-tests


# region: index-tests
def make_index():
    emb = HashEmbedder()
    texts = ["annual leave is 24 days", "sick leave needs a doctor's note", "earbuds battery lasts 8 hours", "refund within 30 days"]
    index = Index(emb)
    index.add([1, 2], "handbook", texts[:2], emb.embed(texts[:2]))
    index.add([3, 4], "faq", texts[2:], emb.embed(texts[2:]))
    return index


def test_hybrid_search_finds_the_right_passage_and_reports_both_ranks():
    hit = make_index().search("how long does the battery last", mode="hybrid", k=2)[0]
    assert hit.chunk_id == 3 and hit.vector_rank == 1 and hit.keyword_rank == 1


def test_each_mode_returns_only_its_own_evidence():
    index = make_index()
    kw = index.search("battery", mode="keyword", k=3)
    vec = index.search("battery", mode="vector", k=3)
    assert all(h.vector_rank is None for h in kw) and all(h.keyword_rank is None for h in vec)


def test_search_can_be_limited_to_some_documents_and_documents_can_be_removed():
    index = make_index()
    assert {index.doc_of[h.chunk_id] for h in index.search("leave days", k=4, document_ids={"handbook"})} == {"handbook"}
    assert index.search("leave", document_ids=set()) == []
    index.remove_document("handbook")
    assert 1 not in index.ids and all(h.chunk_id in (3, 4) for h in index.search("leave days", k=4))
# endregion: index-tests
