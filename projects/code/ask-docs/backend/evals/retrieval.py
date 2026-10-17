"""Measure retrieval: does the right passage come back, and do out-of-scope questions get refused?

    python -m evals.retrieval                              # the built-in sample documents, your current embedder
    EMBEDDINGS_PROVIDER=fastembed python -m evals.retrieval

Retrieval is the part of RAG that most often breaks, and it can be measured without any language model at all.
"""
import os
import tempfile

from app.config import Settings
from app.db import Store
from app.ingest import ingest_document, title_from
from app.rag.factory import build_embedder
from app.rag.gate import is_relevant
from app.rag.index import Index
from app.routes.documents import SAMPLES

from .cases import ANSWERABLE, OUT_OF_SCOPE


def build(settings: Settings):
    """Ingest the sample documents into a throw-away database and return everything needed to search them."""
    store = Store(os.path.join(tempfile.mkdtemp(), "eval.db"))
    embedder = build_embedder(settings)
    index = Index(embedder)
    for path in sorted(SAMPLES.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        did = store.create_document(title_from(path.name, text), path.name, "text")
        ingest_document(store, index, embedder, settings, did, [text])
    return store, index, embedder


# region: metrics
def evaluate(store: Store, index: Index, embedder, settings: Settings, mode: str, k: int = 5) -> dict:
    ranks, answered = [], 0
    for question, phrase in ANSWERABLE:
        hits = index.search(question, mode, k)
        texts = [store.chunks_by_ids([h.chunk_id])[h.chunk_id]["text"] for h in hits]
        rank = next((i for i, t in enumerate(texts, start=1) if phrase in t), None)
        ranks.append(rank)
        answered += is_relevant(hits, embedder.relevance_threshold, settings.keyword_threshold)

    refused = sum(not is_relevant(index.search(q, mode, k), embedder.relevance_threshold, settings.keyword_threshold) for q in OUT_OF_SCOPE)
    n = len(ranks)
    return {
        "mode": mode,
        "hit@1": sum(r == 1 for r in ranks) / n,
        "hit@3": sum(r is not None and r <= 3 for r in ranks) / n,
        "hit@5": sum(r is not None for r in ranks) / n,
        "mrr": sum(1 / r for r in ranks if r) / n,                      # mean reciprocal rank: 1.0 means always first
        "answers_questions": answered / n,                                # the gate lets real questions through
        "refuses_out_of_scope": refused / len(OUT_OF_SCOPE),              # ...and stops unrelated ones
        "missed": [q for (q, _), r in zip(ANSWERABLE, ranks) if r is None],
    }
# endregion: metrics


# region: sweep
def sweep(sizes: list[int], overlap_ratio: float = 0.15, mode: str = "hybrid") -> list[dict]:
    """Run the eval once per chunk size. The question "what chunk size is best?" has an answer for YOUR documents."""
    rows = []
    for size in sizes:
        settings = Settings(chunk_size=size, chunk_overlap=int(size * overlap_ratio), _env_file=None)
        store, index, embedder = build(settings)
        result = evaluate(store, index, embedder, settings, mode)
        rows.append({"size": size, "chunks": len(index.ids), **{k: result[k] for k in ("hit@1", "hit@3", "mrr")}})
    return rows
# endregion: sweep


def main() -> None:
    settings = Settings()
    store, index, embedder = build(settings)
    print(f"embedder: {embedder.name} | {len(ANSWERABLE)} answerable and {len(OUT_OF_SCOPE)} out-of-scope questions\n")
    print(f"{'mode':<9}{'hit@1':>7}{'hit@3':>7}{'hit@5':>7}{'MRR':>7}{'answers':>9}{'refuses':>9}")
    for mode in ("keyword", "vector", "hybrid"):
        r = evaluate(store, index, embedder, settings, mode)
        print(f"{mode:<9}{r['hit@1']:>7.0%}{r['hit@3']:>7.0%}{r['hit@5']:>7.0%}{r['mrr']:>7.2f}{r['answers_questions']:>9.0%}{r['refuses_out_of_scope']:>9.0%}")
        if mode == "hybrid" and r["missed"]:
            print("\nmissed by hybrid:", *r["missed"], sep="\n  ")


if __name__ == "__main__":
    main()
