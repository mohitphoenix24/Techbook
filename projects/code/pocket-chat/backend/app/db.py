"""Conversation storage in one SQLite file. Plain `sqlite3`: no ORM, nothing to learn first."""
import sqlite3
import uuid
from contextlib import closing, contextmanager
from datetime import datetime, timezone

# region: schema
SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    persona     TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_usd        REAL NOT NULL DEFAULT 0,
    stopped         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
"""
# endregion: schema


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str):
        self.path = path
        with self._connect() as db:
            db.executescript(SCHEMA)

    @contextmanager
    def _connect(self):
        with closing(sqlite3.connect(self.path)) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys = ON")
            with db:                                   # commit on success, roll back on error
                yield db

    # region: crud
    def create_conversation(self, title: str, persona: str) -> str:
        cid = uuid.uuid4().hex[:12]
        with self._connect() as db:
            db.execute(
                "INSERT INTO conversations (id, title, persona, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (cid, title[:60], persona, now(), now()),
            )
        return cid

    def add_message(self, cid: str, role: str, content: str, *, input_tokens=0, output_tokens=0, cost_usd=0.0, stopped=False) -> int:
        with self._connect() as db:
            cur = db.execute(
                "INSERT INTO messages (conversation_id, role, content, input_tokens, output_tokens, cost_usd, stopped, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (cid, role, content, input_tokens, output_tokens, cost_usd, int(stopped), now()),
            )
            db.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now(), cid))
            return cur.lastrowid

    def messages(self, cid: str) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("SELECT * FROM messages WHERE conversation_id = ? ORDER BY id", (cid,)).fetchall()
        return [dict(r) | {"stopped": bool(r["stopped"])} for r in rows]

    def delete_last_assistant_message(self, cid: str) -> bool:
        with self._connect() as db:
            row = db.execute("SELECT id, role FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", (cid,)).fetchone()
            if row and row["role"] == "assistant":
                db.execute("DELETE FROM messages WHERE id = ?", (row["id"],))
                return True
        return False
    # endregion: crud

    def get_conversation(self, cid: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM conversations WHERE id = ?", (cid,)).fetchone()
        return dict(row) if row else None

    def list_conversations(self) -> list[dict]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count"
                " FROM conversations c ORDER BY updated_at DESC, rowid DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_conversation(self, cid: str) -> bool:
        with self._connect() as db:
            return db.execute("DELETE FROM conversations WHERE id = ?", (cid,)).rowcount > 0
