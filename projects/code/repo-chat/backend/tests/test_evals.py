from app.rag.ingest import SourceFile
from evals.cases import CASES, HELD_OUT
from evals.run import CONFIGURATIONS, ablation, evaluate


# region: eval-tests
def sample_files(sample):
    return [SourceFile(p, t) for p, t in sample.files.items()]


def test_every_labelled_name_really_exists_in_the_sample_repository(sample):
    names = {c.name for c in sample.chunks}
    for case in [*CASES, *HELD_OUT]:
        assert all(n in names for n in case["names"]), (case["question"], [n for n in case["names"] if n not in names])


def test_the_chunked_search_finds_the_right_code_for_most_questions_and_stays_silent_on_the_rest(sample):
    result = evaluate(sample_files(sample), CASES)
    assert result["hit_at_5"] >= 0.85 and result["mrr"] >= 0.55 and result["refused_correctly"] == result["unanswerable"] == 2


def test_the_held_out_questions_agree_that_the_search_generalises(sample):
    result = evaluate(sample_files(sample), HELD_OUT)
    assert result["hit_at_5"] >= 0.75 and result["refused_correctly"] == 1


def test_chunking_shows_the_model_far_less_code_for_the_same_questions(sample):
    rows = {r["name"][0]: r for r in ablation(sample_files(sample))}
    assert rows["B"]["avg_lines"] * 2 < rows["A"]["avg_lines"] and rows["B"]["chunks"] > 4 * rows["A"]["chunks"]


def test_every_configuration_is_reported_and_the_naive_baselines_do_not_use_the_clever_parts(sample):
    rows = ablation(sample_files(sample))
    assert [r["name"] for r in rows] == [name for name, _ in CONFIGURATIONS]
    assert rows[-1]["hit_at_5"] >= rows[1]["hit_at_5"]                                  # each added idea helps or does no harm on this set
# endregion: eval-tests
