"""The to-do list: one SQLite table and five small functions. No AI in this file."""
import sqlite3
import threading


# region: schema
SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    due        TEXT,                                   -- 'YYYY-MM-DD' or NULL
    priority   TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1))
)
"""
# endregion: schema


# region: store
class TaskStore:
    def __init__(self, path: str = ":memory:"):
        self._db = sqlite3.connect(path, check_same_thread=False)    # the API and the agent run on different threads...
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()                                # ...so one lock keeps them from interleaving
        with self._lock:
            self._db.execute(SCHEMA)
            self._db.commit()

    def _one(self, task_id: int) -> dict | None:
        row = self._db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _task(row) if row else None

    def add(self, title: str, due: str | None = None, priority: str = "normal") -> dict:
        with self._lock:
            cur = self._db.execute("INSERT INTO tasks (title, due, priority) VALUES (?, ?, ?)", (title, due, priority))
            self._db.commit()
            return self._one(cur.lastrowid)

    def get(self, task_id: int) -> dict | None:
        with self._lock:
            return self._one(task_id)

    def list(self, status: str = "open", due_before: str | None = None, priority: str | None = None) -> list[dict]:
        where, args = [], []
        if status != "all":
            where.append("done = ?")
            args.append(1 if status == "done" else 0)
        if due_before:
            where.append("due IS NOT NULL AND due <= ?")
            args.append(due_before)
        if priority:
            where.append("priority = ?")
            args.append(priority)
        sql = "SELECT * FROM tasks" + (" WHERE " + " AND ".join(where) if where else "")
        sql += " ORDER BY done, due IS NULL, due, CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, id"
        with self._lock:
            return [_task(r) for r in self._db.execute(sql, args).fetchall()]

    def update(self, task_id: int, **fields) -> dict | None:
        """Change only the fields given (a value of None is allowed for `due`: it clears the date)."""
        allowed = {"title", "due", "priority", "done"}
        sets = {k: (int(v) if k == "done" else v) for k, v in fields.items() if k in allowed}
        with self._lock:
            if sets:
                self._db.execute(f"UPDATE tasks SET {', '.join(f'{k} = ?' for k in sets)} WHERE id = ?", [*sets.values(), task_id])
                self._db.commit()
            return self._one(task_id)

    def delete(self, task_id: int) -> bool:
        with self._lock:
            cur = self._db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            self._db.commit()
            return cur.rowcount > 0


def _task(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "title": row["title"], "due": row["due"], "priority": row["priority"], "done": bool(row["done"])}
# endregion: store
