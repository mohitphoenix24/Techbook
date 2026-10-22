import pytest

from app.tools import TOOLS, ProposeChange, ReadNote, SearchNotes, schema_of


# region: definition-tests
def test_every_tool_is_defined_the_way_the_api_expects():
    for tool in TOOLS:
        assert set(tool) == {"name", "description", "input_schema"}
        assert tool["input_schema"]["type"] == "object"
        assert len(tool["description"]) > 30, "a tool is only as good as its description"


def test_there_is_no_tool_that_writes():
    """The agent's tools: three that read and one that proposes. The names are the safety review."""
    assert [t["name"] for t in TOOLS] == ["list_notes", "read_note", "search_notes", "propose_change"]


def test_every_input_is_documented():
    for model in (ReadNote, SearchNotes, ProposeChange):
        for name, prop in schema_of(model)["properties"].items():
            assert prop.get("description"), f"{model.__name__}.{name} has no description"
    assert schema_of(ProposeChange)["properties"]["action"]["enum"] == ["create", "replace", "append", "delete"]
# endregion: definition-tests


def test_list_notes(box):
    r = box.call("list_notes", {})
    assert r.ok and r.summary == "2 notes"
    assert r.content.splitlines() == ['ideas: "Ideas" (47 characters)', 'shopping: "Shopping" (21 characters)']


def test_read_note(box):
    r = box.call("read_note", {"name": "shopping"})
    assert r.ok and r.content == "# Shopping\nmilk\neggs\n"
    assert box.call("read_note", {"name": "shopping.md"}).ok


def test_search(box):
    r = box.call("search_notes", {"query": "milk"})
    assert r.ok and r.content == "shopping:2: milk" and r.summary == "1 match"
    r = box.call("search_notes", {"query": "zebra"})
    assert r.ok and "No line contains" in r.content and r.summary == "no matches"


# region: propose-tests
def test_propose_change_writes_nothing_and_tells_the_model_it_is_not_done(box, notes):
    before = notes.read("ideas")
    r = box.call("propose_change", {"action": "replace", "name": "ideas", "content": "# Ideas\nnew\n", "reason": "tidy up"})
    assert r.ok and r.changed and r.summary == "proposal #1: replace ideas"
    assert "NOT been applied" in r.content and "do not say it is done" in r.content
    assert notes.read("ideas") == before
    assert [p.status for p in box.proposals.all()] == ["pending"]


def test_a_delete_proposal_deletes_nothing(box, notes):
    r = box.call("propose_change", {"action": "delete", "name": "shopping", "reason": "no longer needed"})
    assert r.ok and notes.exists("shopping")
# endregion: propose-tests


# region: error-tests
@pytest.mark.parametrize("name,args,expect", [
    ("read_note", {"name": "nope"}, "no note called 'nope'"),
    ("read_note", {"name": "../../etc/passwd"}, "not a valid note name"),
    ("read_note", {}, "name"),
    ("search_notes", {"query": "x"}, "query"),
    ("propose_change", {"action": "create", "name": "ideas", "content": "x", "reason": "r r r"}, "already exists"),
    ("propose_change", {"action": "erase", "name": "ideas", "reason": "r r r"}, "action"),
    ("propose_change", {"action": "replace", "name": "ideas", "reason": "r r r"}, "needs the content"),
    ("propose_change", {"action": "delete", "name": "ideas"}, "reason"),
    ("propose_change", {"action": "delete", "name": "../ideas", "reason": "r r r"}, "not a valid note name"),
    ("write_note", {"name": "x", "content": "y"}, "no tool called"),
])
def test_bad_calls_become_errors_the_model_can_read(box, name, args, expect):
    r = box.call(name, args)
    assert not r.ok and not r.changed and r.content.startswith("Error:") and expect in r.content
    assert box.proposals.all() == []
# endregion: error-tests


def test_a_tool_that_crashes_becomes_an_error_too(box, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("disk on fire")
    monkeypatch.setattr(box.notes, "info", boom)
    r = box.call("list_notes", {})
    assert not r.ok and r.summary == "tool failed" and "disk on fire" not in r.content
