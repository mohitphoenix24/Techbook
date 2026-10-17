"""The call graph: which chunk calls which, so a question about one function can also bring in its neighbours.

The answer to "what happens when a job fails?" is not in one function. `Worker.run_once` calls `_handle_failure`,
which calls `should_retry` and `backoff_delay`. Search finds the function that matches the words; the graph brings in
the functions it leans on and the functions that lean on it.

The resolution is a heuristic, not a compiler: it matches names. It can be wrong when two functions share a name.
"""
# region: imports
from dataclasses import replace

from .chunker import Chunk
from .index import Hit
# endregion: imports

# region: graph
COMMON = {"get", "append", "items", "keys", "values", "update", "pop", "join", "format", "split", "strip", "read", "write", "close", "open",
          "sleep", "dumps", "loads", "count", "extend", "setdefault", "startswith", "endswith", "lower", "upper", "fetchone", "fetchall", "execute"}


class CallGraph:
    # region: build
    def __init__(self, chunks: list[Chunk]):
        self.chunks = {c.id: c for c in chunks}
        names: dict[str, list[Chunk]] = {}
        for c in chunks:
            if c.kind in ("function", "method", "class") and c.name:
                names.setdefault(c.name.split(".")[-1], []).append(c)
        self.calls: dict[str, list[str]] = {c.id: [] for c in chunks}
        self.called_by: dict[str, list[str]] = {c.id: [] for c in chunks}
        for c in chunks:
            owner = c.name.split(".")[0] if c.kind == "method" else ""
            for call in c.calls:
                parts = call.split(".")
                if parts[0] == "self" and len(parts) == 2:
                    targets = [t for t in names.get(parts[1], []) if t.name.split(".")[0] == owner]       # self.method(): same class only
                elif parts[-1] in COMMON:
                    targets = []                                                                          # too generic to trust
                else:
                    targets = names.get(parts[-1], [])
                for t in targets:
                    if t.id != c.id and t.id not in self.calls[c.id]:
                        self.calls[c.id].append(t.id)
                        self.called_by[t.id].append(c.id)
    # endregion: build

    # region: expand
    def expand(self, hits: list[Hit], *, limit: int = 3, decay: float = 0.5, seeds: int = 3) -> list[Hit]:
        """Neighbours of the best `seeds` hits (what they call, and what calls them), scored below their parent."""
        have = {h.chunk.id for h in hits}
        added: dict[str, Hit] = {}
        for hit in hits[:seeds]:
            for ids, verb in ((self.calls[hit.chunk.id], "called by"), (self.called_by[hit.chunk.id], "calls")):
                for cid in ids:
                    if cid in have:
                        continue
                    chunk = self.chunks[cid]
                    candidate = Hit(chunk, round(hit.score * decay, 3), [], [f"{verb} {hit.chunk.name or hit.chunk.path}"], expanded=True)
                    if cid not in added or added[cid].score < candidate.score:
                        added[cid] = candidate
        return sorted(added.values(), key=lambda h: -h.score)[:limit]
    # endregion: expand
# endregion: graph
