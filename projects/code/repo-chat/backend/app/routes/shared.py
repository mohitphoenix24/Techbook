from ..rag.index import Hit


def hit_json(hit: Hit) -> dict:
    """A search hit as the browser sees it: where it is, what it is, how well it matched, and why."""
    c = hit.chunk
    return {"path": c.path, "start": c.start, "end": c.end, "kind": c.kind, "name": c.name, "score": hit.score, "reasons": hit.reasons, "expanded": hit.expanded}
