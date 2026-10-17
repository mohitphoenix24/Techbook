from app.config import Settings
from evals.retrieval import build, evaluate


# region: eval-test
def test_hybrid_search_finds_every_answer_and_the_gate_separates_questions_from_noise():
    settings = Settings(_env_file=None)
    store, index, embedder = build(settings)
    result = evaluate(store, index, embedder, settings, "hybrid")
    assert result["hit@5"] == 1.0 and result["mrr"] > 0.8
    assert result["answers_questions"] == 1.0 and result["refuses_out_of_scope"] == 1.0
    assert result["missed"] == []


def test_a_word_matching_vector_is_a_poor_judge_of_relevance():
    """Why the gate leans on BM25: with the built-in embedder, vector-only mode refuses many real questions."""
    settings = Settings(_env_file=None)
    store, index, embedder = build(settings)
    assert evaluate(store, index, embedder, settings, "vector")["answers_questions"] < 0.6
# endregion: eval-test
