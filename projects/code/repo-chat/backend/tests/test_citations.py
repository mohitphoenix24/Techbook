from app.rag.chunker import Chunk
from app.rag.citations import validate

FILES = {"a.py": "\n".join(f"line {i}" for i in range(1, 51)), "b.py": "x\ny\n"}
SHOWN = [Chunk("a.py:10-20", "a.py", "function", "f", 10, 20, "")]


# region: citation-tests
def verdicts(answer):
    return [(c.path, c.start, c.end, c.status) for c in validate(answer, FILES, SHOWN)]


def test_a_citation_to_code_the_model_was_shown_is_valid_even_when_it_cites_only_part_of_it():
    assert verdicts("See [a.py:12-15] and [a.py:20].") == [("a.py", 12, 15, "valid"), ("a.py", 20, 20, "valid")]


def test_a_real_file_that_the_model_was_never_shown_is_flagged():
    assert verdicts("It is in [a.py:30-40].") == [("a.py", 30, 40, "outside_context")]
    assert verdicts("It is in [b.py:1-2].") == [("b.py", 1, 2, "outside_context")]


def test_lines_that_do_not_exist_and_files_that_do_not_exist_are_caught():
    assert verdicts("[a.py:900-950] and [ghost.py:1-5] and [a.py:30-10]") == [("a.py", 900, 950, "bad_lines"), ("ghost.py", 1, 5, "no_such_file"), ("a.py", 30, 10, "bad_lines")]


def test_repeats_are_reported_once_and_other_brackets_are_ignored():
    assert verdicts("[a.py:11-12] again [a.py:11-12], a list [1, 2] and a link [docs](x)") == [("a.py", 11, 12, "valid")]
# endregion: citation-tests
