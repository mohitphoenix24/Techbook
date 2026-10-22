import pytest

from app.tools import TOOLS, AddTask, DeleteTask, GetToday, ListTasks, UpdateTask, schema_of


# region: definition-tests
def test_every_tool_is_defined_the_way_the_api_expects():
    for tool in TOOLS:
        assert set(tool) == {"name", "description", "input_schema"}
        assert tool["input_schema"]["type"] == "object"
        assert len(tool["description"]) > 30, "a tool is only as good as its description"


def test_every_tool_has_a_handler_and_every_handler_a_tool(box):
    assert {t["name"] for t in TOOLS} == set(box._run)


def test_schema_comes_from_the_validation_model():
    props = schema_of(UpdateTask)["properties"]
    assert set(props) == {"id", "title", "due", "priority", "done"}          # a field called "title" survives the clean-up
    assert "title" not in schema_of(AddTask)                                 # but the generated schema "title" does not
    assert schema_of(AddTask)["required"] == ["title"]


def test_nothing_in_the_schema_is_undocumented():
    for model in (AddTask, ListTasks, UpdateTask, DeleteTask):
        for name, prop in schema_of(model)["properties"].items():
            assert prop.get("description"), f"{model.__name__}.{name} has no description"
# endregion: definition-tests


def test_get_today(box):
    r = box.call("get_today", {})
    assert r.ok and r.content == "Today is 2026-10-18, a Sunday."
    assert GetToday.model_validate({})


def test_add_then_list(box):
    r = box.call("add_task", {"title": "Call the plumber", "due": "2026-10-21", "priority": "high"})
    assert r.ok and r.changed and r.summary == "added #1"
    listed = box.call("list_tasks", {})
    assert not listed.changed
    assert listed.content == "#1 [ ] Call the plumber (due 2026-10-21, high priority)"
    assert listed.summary == "1 task"


def test_list_empty(box):
    r = box.call("list_tasks", {})
    assert r.content == "No tasks match." and r.summary == "0 tasks"


def test_list_is_capped_for_the_model(box):
    for i in range(60):
        box.store.add(f"task {i}")
    r = box.call("list_tasks", {})
    assert r.content.count("\n") == 50 and "showing 50 of 60" in r.content


def test_update_marks_done(box):
    box.call("add_task", {"title": "x"})
    r = box.call("update_task", {"id": 1, "done": True})
    assert r.ok and r.changed and "[x]" in r.content


def test_update_with_null_due_clears_it(box):
    box.call("add_task", {"title": "x", "due": "2026-10-20"})
    r = box.call("update_task", {"id": 1, "due": None})
    assert r.ok and "no date" in r.content


def test_update_false_is_a_real_value(box):
    box.call("add_task", {"title": "x"})
    box.call("update_task", {"id": 1, "done": True})
    r = box.call("update_task", {"id": 1, "done": False})
    assert "[ ]" in r.content


def test_update_with_nothing_to_change(box):
    box.call("add_task", {"title": "x"})
    r = box.call("update_task", {"id": 1})
    assert not r.ok and "nothing to change" in r.content


def test_delete(box):
    box.call("add_task", {"title": "x"})
    r = box.call("delete_task", {"id": 1})
    assert r.ok and r.changed and r.content.startswith("Deleted:")
    assert box.store.list("all") == []


# region: error-tests
@pytest.mark.parametrize("name,args,expect", [
    ("update_task", {"id": 42, "done": True}, "no task with id 42"),
    ("delete_task", {"id": 42}, "no task with id 42"),
    ("add_task", {"title": ""}, "title"),
    ("add_task", {"title": "x", "due": "next friday"}, "due"),
    ("add_task", {"title": "x", "priority": "urgent"}, "priority"),
    ("update_task", {"done": True}, "id"),
    ("list_tasks", {"status": "everything"}, "status"),
    ("make_coffee", {}, "no tool called"),
])
def test_bad_calls_become_errors_the_model_can_read(box, name, args, expect):
    r = box.call(name, args)
    assert not r.ok and not r.changed
    assert r.content.startswith("Error:") and expect in r.content


def test_a_failed_call_changes_nothing(box):
    box.call("add_task", {"title": "x", "due": "tomorrow"})
    assert box.store.list("all") == []
# endregion: error-tests


# region: crash-test
def test_a_tool_that_crashes_becomes_an_error_too(box, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("disk on fire")
    monkeypatch.setattr(box.store, "list", boom)
    r = box.call("list_tasks", {})
    assert not r.ok and r.summary == "tool failed" and "disk on fire" not in r.content       # the model hears 'failed', not our internals
# endregion: crash-test
