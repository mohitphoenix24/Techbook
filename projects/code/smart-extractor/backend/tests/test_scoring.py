from app.scoring import normalise, score_case, summarise


def test_normalise_ignores_case_spaces_and_float_noise():
    assert normalise("  Asha   RAO ") == normalise("asha rao")
    assert normalise(0.1 + 0.2) == normalise(0.3)


def test_every_expected_field_counts_once_and_extras_are_ignored():
    expected = {"a": "x", "b": {"c": 1.0}, "d": [1, 2]}
    actual = {"a": "X", "b": {"c": 1.0}, "d": [1, 3], "extra": "ignored"}
    score = score_case(expected, actual)
    assert (score.correct, score.total) == (3, 4)
    assert score.wrong == [("d.1", 2, 3)] and not score.exact


def test_missing_fields_count_as_wrong():
    assert score_case({"a": 1, "b": 2}, {"a": 1}).wrong == [("b", 2, None)]


def test_summary_averages_over_fields_not_cases():
    s = summarise([score_case({"a": 1}, {"a": 1}), score_case({"a": 1, "b": 2, "c": 3}, {"a": 0, "b": 0, "c": 3})])
    assert s == {"cases": 2, "field_accuracy": 0.5, "exact_match": 0.5}


def test_free_text_fields_can_be_left_out_of_the_score():
    expected = {"category": "billing", "summary": "Refund wanted for a double charge", "items": [{"task": "call", "owner": "Ravi"}]}
    actual = {"category": "billing", "summary": "Customer wants a refund", "items": [{"task": "phone them", "owner": "Ravi"}]}
    assert score_case(expected, actual).accuracy < 1.0
    assert score_case(expected, actual, ignore=["summary", "items[].task"]).accuracy == 1.0
