"""Embedders: turn text into vectors so that "similar" text lands close together.

All embedders return float32 arrays of unit length, so the similarity of two texts is simply a dot product.
`kind` is "document" for passages being indexed and "query" for a user's question: some models embed them differently.
"""
import zlib
from collections import Counter
from typing import Protocol

import numpy as np

from .text import tokenize


# region: protocol
class Embedder(Protocol):
    name: str                       # stored with every vector: vectors from different models cannot be compared
    dim: int
    relevance_threshold: float      # cosine below which a passage is probably unrelated to the question

    def embed(self, texts: list[str], kind: str = "document") -> np.ndarray: ...
# endregion: protocol


# region: hash
class HashEmbedder:
    """A built-in embedder with no model and no download: "feature hashing" of words and word pairs.

    It matches WORDS, not meaning: "annual leave" is close to "leave policy" but not to "holiday". It is perfect for
    learning how the rest of the system works, and for fast, repeatable tests. Real semantics need a real model.
    """

    name = "hash-1024"
    dim = 1024
    # Unrelated text still scores up to ~0.17 by chance, and real questions can score as low as 0.06: a word-matching vector
    # is a poor judge of "is this relevant?". The gate leans on BM25 for that (see rag/gate.py), so this is set high.
    relevance_threshold = 0.20

    def embed(self, texts: list[str], kind: str = "document") -> np.ndarray:
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for row, text in enumerate(texts):
            words = tokenize(text)
            features = Counter(words) + Counter(f"{a}_{b}" for a, b in zip(words, words[1:]))     # words and word pairs
            for feature, count in features.items():
                h = zlib.crc32(feature.encode())                                                  # stable across runs
                sign = 1.0 if (h >> 31) & 1 else -1.0                                            # random +/- limits collisions
                out[row, h % self.dim] += sign * (1.0 + np.log(count))
        norms = np.linalg.norm(out, axis=1, keepdims=True)
        return out / np.where(norms == 0, 1.0, norms)
# endregion: hash


# region: fastembed
class FastEmbedder:
    """Real semantic embeddings from a small open model (BGE small), running locally with ONNX. No API key."""

    name = "bge-small-en-v1.5"
    dim = 384
    relevance_threshold = 0.55

    def __init__(self):
        from fastembed import TextEmbedding              # imported late: only needed if you choose this embedder

        self._model = TextEmbedding("BAAI/bge-small-en-v1.5")

    def embed(self, texts: list[str], kind: str = "document") -> np.ndarray:
        if kind == "query":                                # this model family likes an instruction in front of questions
            texts = [f"Represent this sentence for searching relevant passages: {t}" for t in texts]
        return np.array(list(self._model.embed(texts)), dtype=np.float32)
# endregion: fastembed


# region: voyage
class VoyageEmbedder:
    """Hosted embeddings from Voyage AI (Anthropic's recommended embeddings partner). Needs VOYAGE_API_KEY."""

    dim = 1024
    relevance_threshold = 0.45

    def __init__(self, api_key: str, model: str = "voyage-3.5-lite", base_url: str = "https://api.voyageai.com/v1", transport=None):
        self.name = model
        self._key, self._url, self._transport = api_key, base_url, transport

    def embed(self, texts: list[str], kind: str = "document") -> np.ndarray:
        import httpx

        vectors: list[list[float]] = []
        with httpx.Client(transport=self._transport, timeout=60) as http:
            for i in range(0, len(texts), 64):                                         # the API takes batches
                response = http.post(
                    f"{self._url}/embeddings",
                    headers={"Authorization": f"Bearer {self._key}"},
                    json={"input": texts[i:i + 64], "model": self.name, "input_type": kind},
                )
                response.raise_for_status()
                vectors += [item["embedding"] for item in response.json()["data"]]
        arr = np.array(vectors, dtype=np.float32)
        self.dim = arr.shape[1]
        return arr / np.linalg.norm(arr, axis=1, keepdims=True)
# endregion: voyage
