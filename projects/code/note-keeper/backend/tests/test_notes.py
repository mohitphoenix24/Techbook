import os

import pytest

from app.notes import NoteError, Notes, clean_name
from app.seed import SAMPLES, seed_if_empty


# region: name-tests
@pytest.mark.parametrize("raw,clean", [("ideas", "ideas"), ("Ideas.md", None), ("ideas.md", "ideas"), ("  trip-ideas  ", "trip-ideas"), ("meeting_2026-10-12", "meeting_2026-10-12")])
def test_valid_names(raw, clean):
    if clean is None:
        with pytest.raises(NoteError):
            clean_name(raw)                            # upper case is refused, not quietly changed
    else:
        assert clean_name(raw) == clean


@pytest.mark.parametrize("bad", ["", " ", "../secrets", "..", ".", "/etc/passwd", "a/b", "a\\b", "a.b", "a b", "-leading", "x" * 65, "ideas.md.md", "ideas\x00", "..%2f..%2fetc", "é"])
def test_every_way_out_of_the_folder_is_refused(notes, bad):
    for call in (notes.read, notes.exists, notes.delete, lambda n: notes.write(n, "x")):
        with pytest.raises(NoteError):
            call(bad)
# endregion: name-tests


# region: symlink-test
def test_a_symlink_inside_the_folder_cannot_lead_outside_it(notes, tmp_path):
    secret = tmp_path / "secret.txt"
    secret.write_text("the password is hunter2")
    os.symlink(secret, notes.root / "shortcut.md")
    with pytest.raises(NoteError, match="not an ordinary note"):
        notes.read("shortcut")
    assert "shortcut" not in notes.names()
    with pytest.raises(NoteError):
        notes.write("shortcut", "overwritten")
    assert secret.read_text() == "the password is hunter2"
# endregion: symlink-test


def test_read_write_delete(notes):
    assert notes.read("ideas").startswith("# Ideas")
    notes.write("ideas", "new")
    assert notes.read("ideas") == "new"
    notes.delete("ideas")
    assert not notes.exists("ideas")
    with pytest.raises(NoteError, match="no note called 'ideas'"):
        notes.read("ideas")
    with pytest.raises(NoteError):
        notes.delete("ideas")


def test_limits(tmp_path):
    n = Notes(tmp_path / "n", max_chars=10, max_notes=2)
    n.write("a", "0123456789")
    with pytest.raises(NoteError, match="limit is 10"):
        n.write("a", "01234567890")
    n.write("b", "x")
    with pytest.raises(NoteError, match="limit"):
        n.write("c", "x")
    n.write("b", "changed")                                  # changing an existing note is not creating one
    assert sorted(n.names()) == ["a", "b"]


def test_names_only_lists_real_notes(notes):
    (notes.root / "readme.txt").write_text("not a note")
    (notes.root / "Bad Name.md").write_text("not a valid name")
    (notes.root / "sub").mkdir()
    assert notes.names() == ["ideas", "shopping"]


# region: search-test
def test_search_finds_lines_ignoring_case(notes):
    assert notes.search("TO-DO") == [("ideas", 2, "- build a to-do agent")]
    assert notes.search("milk") == [("shopping", 2, "milk")]
    assert notes.search("nothing like this") == []


def test_search_stops_at_the_limit(tmp_path):
    n = Notes(tmp_path / "n")
    n.write("a", "\n".join(f"line {i}" for i in range(50)))
    assert len(n.search("line", limit=20)) == 20
# endregion: search-test


def test_info_for_the_sidebar(notes):
    assert notes.info() == [{"name": "ideas", "title": "Ideas", "chars": len("# Ideas\n- build a to-do agent\n- try web search\n")},
                            {"name": "shopping", "title": "Shopping", "chars": len("# Shopping\nmilk\neggs\n")}]


def test_seed_only_fills_an_empty_folder(tmp_path):
    n = Notes(tmp_path / "n")
    assert seed_if_empty(n) is True and n.names() == sorted(SAMPLES)
    n.delete("recipes")
    assert seed_if_empty(n) is False and not n.exists("recipes")           # a folder with notes is left exactly as it is


def test_the_samples_are_valid_notes():
    for name, text in SAMPLES.items():
        assert clean_name(name) == name and text.startswith("# ") and len(text) < 2000
    assert "ASSISTANT:" in SAMPLES["pasted-email"]                          # the injection lesson relies on it


def test_a_file_that_is_not_text_is_an_error_not_a_crash(notes):
    (notes.root / "binary.md").write_bytes(b"\xff\xfe\x00not utf-8")
    with pytest.raises(NoteError, match="could not be read"):
        notes.read("binary")
    assert "binary" in notes.names()
    assert [n["name"] for n in notes.info()] == ["ideas", "shopping"]            # one bad file does not hide the rest
    assert notes.search("milk") == [("shopping", 2, "milk")]
