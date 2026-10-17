"""The search index: a ranking function (BM25) made aware of what a code chunk is made of.

A chunk is not a bag of words. Its *name* says what it is, its *path* says where it lives, its *signature* and
*docstring* say what it does, and its *body* says how. A match in the name is worth far more than a match in the
body, so each field counts with its own weight. On top of that, a question that names a symbol outright
("what does _handle_failure do?") gets that symbol first.
"""
# region: imports
import math
import re
from dataclasses import dataclass, field

from .chunker import Chunk
from .codetext import code_tokens
# endregion: imports

# region: weights
FIELD_WEIGHTS = {"name": 3.0, "path": 2.0, "signature": 2.0, "doc": 2.0, "body": 1.0}
SYMBOL_BOOST = 6.0              # added when the question names this exact symbol
MIN_SCORE = 1.0                 # below this, a chunk is not an answer: it is noise
MIN_IDF = 0.4                   # a word found in most chunks (like the project's own name) says nothing: ignore it in questions
TEST_PENALTY = 0.6              # tests mention everything: unless the question is about tests, source code ranks first
# endregion: weights


@dataclass
class Hit:
    chunk: Chunk
    score: float
    matched: list[str] = field(default_factory=list)       # the question's terms that this chunk contains
    reasons: list[str] = field(default_factory=list)       # why it is here, in words a person can read
    expanded: bool = False                                 # True when it came from the call graph, not from search


def is_test(path: str) -> bool:
    return any(part in ("tests", "test") or part.startswith("test_") or part.endswith("_test.py") for part in path.split("/"))


def fields_of(chunk: Chunk) -> dict[str, str]:
    return {"name": chunk.name, "path": chunk.path, "signature": chunk.signature, "doc": chunk.doc, "body": chunk.text}


# region: index
class CodeIndex:
    def __init__(self, chunks: list[Chunk], *, split_identifiers: bool = True, k1: float = 1.5, b: float = 0.4,
                 weights: dict[str, float] = FIELD_WEIGHTS):
        self.chunks, self.split, self.k1, self.b = chunks, split_identifiers, k1, b
        self.tf: list[dict[str, float]] = []
        for chunk in chunks:
            counts: dict[str, float] = {}
            for name, text in fields_of(chunk).items():
                for term in code_tokens(text, split=split_identifiers):
                    counts[term] = counts.get(term, 0.0) + weights[name]        # a field's weight multiplies its term counts
            self.tf.append(counts)
        self.lengths = [sum(tf.values()) for tf in self.tf]
        self.avg = (sum(self.lengths) / len(self.lengths)) if self.lengths else 1.0
        df: dict[str, int] = {}
        for tf in self.tf:
            for term in tf:
                df[term] = df.get(term, 0) + 1
        n = len(chunks)
        self.idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}
        self.by_name: dict[str, list[int]] = {}                                 # last name segment -> chunk positions
        for i, chunk in enumerate(chunks):
            if chunk.kind in ("function", "method", "class") and chunk.name:
                self.by_name.setdefault(chunk.name.split(".")[-1].lower(), []).append(i)

    def score(self, terms: list[str], i: int) -> tuple[float, list[str]]:
        tf, total, matched = self.tf[i], 0.0, []
        for term in dict.fromkeys(terms):
            f = tf.get(term, 0.0)
            if f and self.idf.get(term, 0.0) >= MIN_IDF:
                total += self.idf.get(term, 0.0) * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * self.lengths[i] / self.avg))
                matched.append(term)
        return total, matched

    def search(self, question: str, k: int = 5, *, symbol_boost: bool = True) -> list[Hit]:
        terms = code_tokens(question, split=self.split)
        named = self.named_in(question) if symbol_boost else set()
        scored = []
        for i, chunk in enumerate(self.chunks):
            value, matched = self.score(terms, i)
            reasons = [f"matches: {', '.join(matched[:4])}"] if matched else []
            if i in named:
                value, reasons = value + SYMBOL_BOOST, ["named in the question", *reasons]
            if value and is_test(chunk.path) and "test" not in question.lower():
                value *= TEST_PENALTY
            if value >= MIN_SCORE:
                scored.append(Hit(chunk, round(value, 3), matched, reasons))
        return sorted(scored, key=lambda h: -h.score)[:k]

    def named_in(self, question: str) -> set[int]:
        """Positions of chunks whose symbol name appears in the question, as written: `backoff_delay`, `Worker._execute`, `parse_interval()`.

        An ordinary English word must not count as a symbol: "job" in a sentence is not the class `Job`. So a name only counts
        when it is written the way the code writes it: with an underscore or a dot, or with the exact capitals of a class.
        """
        found: set[int] = set()
        for word in re.findall(r"[A-Za-z_][A-Za-z0-9_.]*", question):
            word = word.strip(".")
            last = word.split(".")[-1]
            for i in self.by_name.get(last.lower(), []):
                chunk_last = self.chunks[i].name.split(".")[-1]
                deliberate = "_" in word or "." in word or last == chunk_last           # `backoff_delay`, `Worker._execute`, `Job`
                if deliberate and ("." not in word or self.chunks[i].name.lower().endswith(word.lower())):
                    found.add(i)
        return found
# endregion: index
