import pytest

from app.notes import NoteError
from app.proposals import diff_of, result_of


# region: result-tests
def test_what_each_action_would_leave_behind():
    assert result_of("create", None, "hello") == "hello"
    assert result_of("replace", "old", "new") == "new"
    assert result_of("delete", "old", None) is None
    assert result_of("append", "line one\n", "line two") == "line one\nline two\n"
    assert result_of("append", "no newline at end", "more") == "no newline at end\nmore\n"
    assert result_of("append", "", "first") == "first\n"
# endregion: result-tests


def test_the_diff_shows_what_goes_and_what_arrives():
    d = diff_of("ideas", "# Ideas\n- a\n- b\n", "# Ideas\n- a\n- c\n")
    assert d.splitlines()[:2] == ["--- ideas.md", "+++ ideas.md"]
    assert "-- b" in d.splitlines() and "+- c" in d.splitlines()
    assert diff_of("x", None, "new\n").splitlines()[:2] == ["--- (new note)", "+++ x.md"]
    assert diff_of("x", "old\n", None).splitlines()[:2] == ["--- x.md", "+++ (deleted)"]
    assert diff_of("x", "same\n", "same\n") == ""


# region: lifecycle-tests
def test_adding_a_proposal_changes_nothing(notes, proposals):
    before = {n: notes.read(n) for n in notes.names()}
    proposals.add(notes, "replace", "ideas", "# Ideas\nrewritten\n", "tidy up")
    proposals.add(notes, "delete", "shopping", None, "not needed")
    proposals.add(notes, "create", "new-note", "hello", "needed")
    assert {n: notes.read(n) for n in notes.names()} == before
    assert [p.status for p in proposals.all()] == ["pending"] * 3 and [p.id for p in proposals.all()] == [1, 2, 3]


def test_apply_makes_the_change(notes, proposals):
    p = proposals.add(notes, "append", "ideas", "- learn MCP", "new idea")
    assert proposals.apply(p.id, notes).status == "applied"
    assert notes.read("ideas").endswith("- try web search\n- learn MCP\n")
    d = proposals.add(notes, "delete", "shopping", None, "done shopping")
    proposals.apply(d.id, notes)
    assert not notes.exists("shopping")
    c = proposals.add(notes, "create", "fresh", "# Fresh\n", "new")
    proposals.apply(c.id, notes)
    assert notes.read("fresh") == "# Fresh\n"


def test_reject_leaves_the_note_alone(notes, proposals):
    p = proposals.add(notes, "delete", "ideas", None, "x")
    assert proposals.reject(p.id).status == "rejected"
    assert notes.exists("ideas")
    with pytest.raises(NoteError, match="already rejected"):
        proposals.apply(p.id, notes)


def test_a_proposal_can_only_be_decided_once(notes, proposals):
    p = proposals.add(notes, "append", "ideas", "- x", "x")
    proposals.apply(p.id, notes)
    with pytest.raises(NoteError, match="already applied"):
        proposals.apply(p.id, notes)
    with pytest.raises(NoteError, match="already applied"):
        proposals.reject(p.id)
    assert notes.read("ideas").count("- x") == 1                      # applying twice did not append twice


def test_unknown_proposal(notes, proposals):
    with pytest.raises(NoteError, match="no proposal #9"):
        proposals.apply(9, notes)
    with pytest.raises(NoteError, match="no proposal #9"):
        proposals.reject(9)
# endregion: lifecycle-tests


# region: stale-test
def test_a_proposal_goes_stale_when_the_note_changes_first(notes, proposals):
    p = proposals.add(notes, "replace", "ideas", "# Ideas\nrewritten\n", "tidy")
    notes.write("ideas", "# Ideas\nsomething I just typed myself\n")                 # the person edits the note meanwhile
    with pytest.raises(NoteError, match="changed after this was proposed"):
        proposals.apply(p.id, notes)
    assert "typed myself" in notes.read("ideas") and p.status == "pending"          # their work is safe, and the proposal stays visible


def test_a_create_goes_stale_when_the_name_is_taken_meanwhile(notes, proposals):
    p = proposals.add(notes, "create", "fresh", "mine", "x")
    notes.write("fresh", "someone else got there first")
    with pytest.raises(NoteError, match="changed after"):
        proposals.apply(p.id, notes)
    assert notes.read("fresh") == "someone else got there first"
# endregion: stale-test


@pytest.mark.parametrize("action,name,content,expect", [
    ("create", "ideas", "x", "already exists"),
    ("replace", "nope", "x", "no note called 'nope'"),
    ("append", "nope", "x", "no note called 'nope'"),
    ("delete", "nope", None, "no note called 'nope'"),
    ("create", "fresh", None, "needs the content"),
    ("replace", "ideas", "", "needs the content"),
    ("create", "../escape", "x", "not a valid note name"),
    ("replace", "ideas", "x" * 20_001, "limit"),
])
def test_bad_proposals_are_refused_up_front(notes, proposals, action, name, content, expect):
    with pytest.raises(NoteError, match=expect):
        proposals.add(notes, action, name, content, "r")
    assert proposals.all() == []


def test_append_cannot_push_a_note_past_the_limit(notes, proposals):
    notes.write("big", "x" * 19_990)
    with pytest.raises(NoteError, match="limit"):
        proposals.add(notes, "append", "big", "y" * 50, "r")


# region: flood-test
def test_an_agent_cannot_bury_the_person_in_proposals(notes):
    from app.proposals import Proposals
    props = Proposals(max_pending=3)
    for i in range(3):
        props.add(notes, "create", f"note-{i}", "x", "r")
    with pytest.raises(NoteError, match="3 proposals are already waiting"):
        props.add(notes, "create", "note-3", "x", "r")
    props.reject(1)                                                  # the person makes room by deciding
    props.add(notes, "create", "note-3", "x", "r")
    assert len([p for p in props.all() if p.status == "pending"]) == 3
# endregion: flood-test
