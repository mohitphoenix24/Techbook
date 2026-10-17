import pytest

from app.rag.chunker import Chunk
from app.rag.index import CodeIndex
from app.rag.retrieve import retrieve


def top(sample, question, k=5, **kw):
    return [h.chunk.name for h in retrieve(sample.index, sample.graph, question, k=k, **kw).hits]


# region: index-tests
@pytest.mark.parametrize("question,expected", [
    ("Where is the retry delay calculated?", {"backoff_delay"}),
    ("How is a job claimed so that two workers never take the same one?", {"Storage.claim_next"}),
    ("What happens to a job whose task has no registered handler?", {"Worker._execute"}),
    ("What does the stale_after setting mean?", {"Config", "Storage.requeue_stale"}),            # either is a good answer
])
def test_the_right_code_is_among_the_first_hits(sample, question, expected):
    assert expected & set(top(sample, question, k=3))


def test_a_question_that_names_a_symbol_finds_it_first(sample):
    hits = retrieve(sample.index, sample.graph, "What does Worker._handle_failure do?").hits
    assert hits[0].chunk.name == "Worker._handle_failure" and "named in the question" in hits[0].reasons


def test_an_ordinary_english_word_is_not_mistaken_for_a_symbol(sample):
    assert sample.index.named_in("how do I schedule a job every five minutes") == set()           # "job" is not the class Job
    assert sample.index.named_in("what is a Job") != set()                                          # but a capital J, as written in the code, is


def test_identifier_splitting_lets_a_loose_question_find_code_whose_names_are_snake_case(sample):
    question, right = "What is the default maximum number of attempts for a job?", {"Config", "new_job", "Job", "README.md > jobq > How retries work"}
    plain = CodeIndex(sample.chunks, split_identifiers=False)         # `max_attempts` stays one strange word: the question's "attempts" never meets it
    assert not right & {h.chunk.name for h in plain.search(question, 5, symbol_boost=False)}
    assert right & {h.chunk.name for h in sample.index.search(question, 5, symbol_boost=False)}


def test_tests_are_demoted_unless_the_question_is_about_tests(sample):
    plain = {h.chunk.name: h.score for h in sample.index.search("Which errors are never retried?", 5)}
    assert "should_retry" in top(sample, "Which errors are never retried?", 2)                       # the source is among the first two
    boosted = {h.chunk.name: h.score for h in sample.index.search("Which tests check which errors are never retried?", 5)}
    assert boosted["test_a_permanent_error_is_never_retried"] > plain["test_a_permanent_error_is_never_retried"]      # no demotion once you ask about tests
    assert top(sample, "Which tests check the retry delay?", 3)[0].startswith("test_")


def test_a_question_the_repository_cannot_answer_finds_nothing_rather_than_the_closest_noise(sample):
    assert top(sample, "What is the airspeed velocity of an unladen swallow?") == []
    assert top(sample, "How do I plug jobq into a Django project with Celery?") == []              # "jobq" is in every path: it carries no meaning


def test_each_hit_says_which_question_words_it_matched(sample):
    hit = sample.index.search("retry delay", 1)[0]
    assert hit.matched == ["retry", "delay"] and hit.reasons == ["matches: retry, delay"]


def test_a_match_in_the_name_is_worth_more_than_a_match_in_the_body():
    named = Chunk("a.py:1-2", "a.py", "function", "retry_policy", 1, 2, "x = 1", signature="def retry_policy()")
    body = Chunk("b.py:1-2", "b.py", "function", "other", 1, 2, "retry retry retry", signature="def other()")
    filler = [Chunk(f"f{i}.py:1-2", f"f{i}.py", "function", f"f{i}", 1, 2, "nothing here") for i in range(6)]
    assert CodeIndex([named, body, *filler]).search("retry", 2, symbol_boost=False)[0].chunk.name == "retry_policy"


def test_no_more_than_two_hits_from_one_file_crowd_out_the_rest(sample):
    paths = [h.chunk.path for h in retrieve(sample.index, sample.graph, "worker job handler failure retry", k=5).hits]
    assert max(paths.count(p) for p in set(paths)) <= 2
# endregion: index-tests
