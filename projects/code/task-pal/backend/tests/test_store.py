import pytest

from app.store import TaskStore


def test_add_and_get(store):
    t = store.add("Pay the electricity bill", "2026-10-20", "high")
    assert t == {"id": 1, "title": "Pay the electricity bill", "due": "2026-10-20", "priority": "high", "done": False}
    assert store.get(1) == t
    assert store.get(99) is None


def test_defaults(store):
    t = store.add("Buy milk")
    assert t["due"] is None and t["priority"] == "normal" and t["done"] is False


# region: ordering-test
def test_open_tasks_come_back_in_due_order_then_priority(store):
    store.add("no date")
    store.add("later", "2026-11-01")
    store.add("soon, normal", "2026-10-20")
    store.add("soon, high", "2026-10-20", "high")
    assert [t["title"] for t in store.list()] == ["soon, high", "soon, normal", "later", "no date"]
# endregion: ordering-test


def test_status_filter(store):
    store.add("a")
    store.add("b")
    store.update(2, done=True)
    assert [t["title"] for t in store.list("open")] == ["a"]
    assert [t["title"] for t in store.list("done")] == ["b"]
    assert len(store.list("all")) == 2


def test_due_before_leaves_out_undated_tasks(store):
    store.add("undated")
    store.add("early", "2026-10-19")
    store.add("late", "2026-12-01")
    assert [t["title"] for t in store.list(due_before="2026-10-31")] == ["early"]


def test_priority_filter(store):
    store.add("a", priority="high")
    store.add("b")
    assert [t["title"] for t in store.list(priority="high")] == ["a"]


def test_update_changes_only_what_is_given(store):
    store.add("x", "2026-10-20", "low")
    t = store.update(1, priority="high")
    assert t["priority"] == "high" and t["due"] == "2026-10-20" and t["title"] == "x"


def test_update_can_clear_the_due_date(store):
    store.add("x", "2026-10-20")
    assert store.update(1, due=None)["due"] is None


def test_update_unknown_task_and_unknown_field(store):
    assert store.update(5, done=True) is None
    store.add("x")
    assert store.update(1, **{"id; DROP TABLE tasks": 1})["title"] == "x"      # unknown columns are ignored, never put in SQL
    assert len(store.list("all")) == 1


def test_delete(store):
    store.add("x")
    assert store.delete(1) is True
    assert store.delete(1) is False
    assert store.list("all") == []


def test_the_database_enforces_its_own_rules(store):
    import sqlite3
    with pytest.raises(sqlite3.IntegrityError):
        store._db.execute("INSERT INTO tasks (title, priority) VALUES ('x', 'urgent')")


def test_a_file_database_survives_a_restart(tmp_path):
    path = str(tmp_path / "t.db")
    TaskStore(path).add("kept")
    assert [t["title"] for t in TaskStore(path).list()] == ["kept"]
