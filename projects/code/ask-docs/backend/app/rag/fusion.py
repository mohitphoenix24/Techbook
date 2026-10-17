"""Combining several rankings into one."""


# region: rrf
def rrf(rankings: list[list[int]], k: int = 60) -> list[tuple[int, float]]:
    """Reciprocal Rank Fusion. Each ranking is a list of ids, best first. An id scores 1/(k + rank) in every ranking
    that contains it, and the scores are added. Only RANKS are used, never the raw scores, so a cosine similarity
    (0 to 1) and a BM25 score (0 to 30) can be combined without any tuning.
    """
    scores: dict[int, float] = {}
    for ranking in rankings:
        for rank, item in enumerate(ranking, start=1):
            scores[item] = scores.get(item, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
# endregion: rrf
