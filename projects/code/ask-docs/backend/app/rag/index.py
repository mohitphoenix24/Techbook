"""The search index: keyword (BM25) and vector search over the same chunks, kept in memory and rebuilt from SQLite."""
import threading
from dataclasses import dataclass, field

import numpy as np

from .bm25 import BM25
from .embeddings import Embedder
from .fusion import rrf


@dataclass
class Hit:
    chunk_id: int
    score: float                                             # the final (fused) score: higher is better
    vector_rank: int | None = None                           # 1 = best; None if the vector search did not return it
    keyword_rank: int | None = None
    vector_score: float | None = None                        # cosine similarity, 0..1 for text
    keyword_score: float | None = None                       # BM25 score
    extra: dict = field(default_factory=dict)


# region: index
class Index:
    def __init__(self, embedder: Embedder):
        self.embedder = embedder
        self.ids: list[int] = []
        self.matrix = np.zeros((0, embedder.dim), dtype=np.float32)
        self.bm25 = BM25()
        self.doc_of: dict[int, str] = {}
        self._lock = threading.RLock()          # ingestion runs in a background thread while requests search

    def add(self, chunk_ids: list[int], document_id: str, texts: list[str], vectors: np.ndarray) -> None:
        with self._lock:
            self.ids += chunk_ids
            self.matrix = np.vstack([self.matrix, vectors]) if len(self.matrix) else vectors.astype(np.float32)
            for cid, text in zip(chunk_ids, texts):
                self.bm25.add(cid, text)
                self.doc_of[cid] = document_id

    def remove_document(self, document_id: str) -> None:
        with self._lock:
            gone = {c for c, d in self.doc_of.items() if d == document_id}
            keep = [i for i, c in enumerate(self.ids) if c not in gone]
            self.ids = [self.ids[i] for i in keep]
            self.matrix = self.matrix[keep] if keep else np.zeros((0, self.embedder.dim), dtype=np.float32)
            self.bm25.remove(gone)
            for c in gone:
                del self.doc_of[c]

    def _allowed(self, document_ids: set[str] | None) -> set[int] | None:
        return None if document_ids is None else {c for c, d in self.doc_of.items() if d in document_ids}

    def search(self, query: str, mode: str = "hybrid", k: int = 5, document_ids: set[str] | None = None, pool: int = 20) -> list[Hit]:
        """mode: "keyword", "vector" or "hybrid". The hybrid mode fuses both rankings with Reciprocal Rank Fusion."""
        with self._lock:
            allowed = self._allowed(document_ids)
            if allowed is not None and not allowed:
                return []
            vec: list[tuple[int, float]] = []
            kw: list[tuple[int, float]] = []
            if mode in ("vector", "hybrid") and len(self.ids):
                q = self.embedder.embed([query], kind="query")[0]
                sims = self.matrix @ q                                     # cosine similarity: vectors have unit length
                order = np.argsort(-sims)
                vec = [(self.ids[i], float(sims[i])) for i in order if allowed is None or self.ids[i] in allowed][:pool]
            if mode in ("keyword", "hybrid"):
                kw = self.bm25.search(query, k=pool, allowed=allowed)

        hits: dict[int, Hit] = {}
        for rank, (cid, score) in enumerate(vec, start=1):
            hit = hits.setdefault(cid, Hit(cid, 0.0))
            hit.vector_rank, hit.vector_score = rank, score
        for rank, (cid, score) in enumerate(kw, start=1):
            hit = hits.setdefault(cid, Hit(cid, 0.0))
            hit.keyword_rank, hit.keyword_score = rank, score

        if mode == "hybrid":
            for cid, score in rrf([[c for c, _ in vec], [c for c, _ in kw]]):
                hits[cid].score = score
        else:
            for cid, h in hits.items():
                h.score = h.vector_score if mode == "vector" else h.keyword_score
        return sorted(hits.values(), key=lambda h: (-h.score, h.chunk_id))[:k]
# endregion: index
