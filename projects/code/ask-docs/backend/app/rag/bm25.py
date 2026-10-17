"""BM25: the classic keyword ranking. It rewards rare words and does not let long passages win just by being long."""
import math
from collections import Counter, defaultdict

from .text import tokenize


# region: bm25
class BM25:
    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.postings: dict[str, dict[int, int]] = defaultdict(dict)       # word -> {chunk id: how many times}
        self.lengths: dict[int, int] = {}                                  # chunk id -> number of words

    def add(self, doc_id: int, text: str) -> None:
        tokens = tokenize(text)
        self.lengths[doc_id] = len(tokens)
        for word, count in Counter(tokens).items():
            self.postings[word][doc_id] = count

    def remove(self, doc_ids: set[int]) -> None:
        for word in list(self.postings):
            for d in doc_ids & self.postings[word].keys():
                del self.postings[word][d]
            if not self.postings[word]:
                del self.postings[word]
        for d in doc_ids:
            self.lengths.pop(d, None)

    def search(self, query: str, k: int = 10, allowed: set[int] | None = None) -> list[tuple[int, float]]:
        """Return up to k (chunk id, score) pairs, best first. Words that no chunk contains are ignored."""
        n = len(self.lengths)
        if not n:
            return []
        avg = sum(self.lengths.values()) / n
        scores: dict[int, float] = defaultdict(float)
        for word in set(tokenize(query)):
            docs = self.postings.get(word)
            if not docs:
                continue
            idf = math.log(1 + (n - len(docs) + 0.5) / (len(docs) + 0.5))   # rare words count for more
            for d, tf in docs.items():
                if allowed is not None and d not in allowed:
                    continue
                norm = tf + self.k1 * (1 - self.b + self.b * self.lengths[d] / avg)   # long passages are discounted
                scores[d] += idf * tf * (self.k1 + 1) / norm
        return sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:k]
# endregion: bm25
