import pytest

from app.rag.codetext import code_tokens, split_identifier, stem


# region: codetext-tests
@pytest.mark.parametrize("word,parts", [
    ("backoff_delay", ["backoff", "delay"]),
    ("getUserByID", ["get", "user", "by", "id"]),
    ("HTTPServerError", ["http", "server", "error"]),
    ("_handle_failure", ["handle", "failure"]),
    ("MAX_ATTEMPTS", ["max", "attempts"]),
    ("run_once", ["run", "once"]),
    ("x", ["x"]),
])
def test_identifiers_split_at_underscores_and_camel_case(word, parts):
    assert split_identifier(word) == parts


def test_a_question_and_the_code_meet_in_the_same_terms():
    assert "backoff" in code_tokens("Where is the backoff calculated?")
    assert {"backoff", "delay", "backoffdelay"} <= set(code_tokens("def backoff_delay(attempt):"))


def test_the_whole_identifier_is_kept_beside_its_parts_so_an_exact_name_is_a_strong_match():
    assert code_tokens("_handle_failure")[:3] == ["handlefailure", "handle", "failure"]


def test_without_splitting_an_identifier_stays_one_strange_word():
    assert code_tokens("backoff_delay", split=False) == ["backoff_delay"]


def test_stop_words_keywords_and_single_letters_are_dropped_and_plurals_folded():
    assert code_tokens("def run(self): return the jobs") == ["run", "job"]
    assert [stem(w) for w in ("retries", "jobs", "class", "status")] == ["retry", "job", "class", "status"]
# endregion: codetext-tests
