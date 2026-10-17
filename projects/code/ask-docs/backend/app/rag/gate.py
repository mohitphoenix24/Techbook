from .index import Hit


# region: gate
def is_relevant(hits: list[Hit], vector_threshold: float, keyword_threshold: float) -> bool:
    """Is there any point asking the model? If even the best passages look unrelated, answer "not found" for free.

    The thresholds depend on the embedding model and the corpus, so they are tuned with an eval (see evals/retrieval.py).
    """
    return any((h.vector_score or 0.0) >= vector_threshold or (h.keyword_score or 0.0) >= keyword_threshold for h in hits[:3])
# endregion: gate
