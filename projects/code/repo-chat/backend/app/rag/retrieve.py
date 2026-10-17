"""Putting search and the call graph together, with one rule for variety."""
# region: imports
from dataclasses import dataclass, field

from .graph import CallGraph
from .index import CodeIndex, Hit, is_test
# endregion: imports


# region: retrieve
@dataclass
class Retrieval:
    hits: list[Hit]                        # what search found, best first, at most `per_file` from any one file
    expanded: list[Hit] = field(default_factory=list)       # neighbours added from the call graph

    @property
    def context(self) -> list[Hit]:
        return [*self.hits, *self.expanded]


def retrieve(index: CodeIndex, graph: CallGraph | None, question: str, *, k: int = 5, per_file: int = 2, expand: bool = True,
             symbol_boost: bool = True) -> Retrieval:
    """Find the code that answers a question: search, keep variety, then bring in the neighbours."""
    ranked = index.search(question, k=k * 4, symbol_boost=symbol_boost)
    hits: list[Hit] = []
    per: dict[str, int] = {}
    for hit in ranked:
        if per.get(hit.chunk.path, 0) < per_file:                # five hits from one file crowd out everything else
            hits.append(hit)
            per[hit.chunk.path] = per.get(hit.chunk.path, 0) + 1
        if len(hits) == k:
            break
    extra: list[Hit] = []
    if expand and graph and hits:
        wants_tests = "test" in question.lower()
        extra = [h for h in graph.expand(hits, limit=8) if wants_tests or not is_test(h.chunk.path)][:3]       # tests call everything: they are noise here
    return Retrieval(hits, extra)
# endregion: retrieve
