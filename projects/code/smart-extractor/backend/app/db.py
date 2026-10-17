"""Every extraction is saved, and a person's corrections are saved next to the model's answer.

Those corrections are the most valuable data in the system: they are a test set made by the people who know the
answers (see evals/ and lesson 8).
"""
import json
import sqlite3
import uuid
from contextlib import closing, contextmanager
from datetime import datetime, timezone

# region: schema
SCHEMA = """
CREATE TABLE IF NOT EXISTS extractions (
    id            TEXT PRIMARY KEY,
    doc_type      TEXT NOT NULL,
    source_text   TEXT NOT NULL,
    result_json   TEXT NOT NULL,      -- the full response we sent to the browser
    reviewed_json TEXT,               -- the data after a person corrected it (NULL until reviewed)
    created_at    TEXT NOT NULL
);
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
            with db:
                yield db

    def save(self, doc_type: str, source_text: str, result: dict) -> str:
        eid = uuid.uuid4().hex[:12]
        with self._connect() as db:
            db.execute("INSERT INTO extractions (id, doc_type, source_text, result_json, created_at) VALUES (?, ?, ?, ?, ?)",
                       (eid, doc_type, source_text, json.dumps(result), now()))
        return eid

    def get(self, eid: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM extractions WHERE id = ?", (eid,)).fetchone()
        return self._row(row) if row else None

    def recent(self, limit: int = 50) -> "list[dict]":
        with self._connect() as db:
            rows = db.execute("SELECT * FROM extractions ORDER BY created_at DESC, rowid DESC LIMIT ?", (limit,)).fetchall()
        return [self._row(r) for r in rows]

    def review(self, eid: str, data: dict) -> bool:
        with self._connect() as db:
            return db.execute("UPDATE extractions SET reviewed_json = ? WHERE id = ?", (json.dumps(data), eid)).rowcount > 0

    def reviewed_cases(self) -> list[dict]:
        """Every extraction a person has reviewed, as an eval case: the document and the answer a human approved."""
        with self._connect() as db:
            rows = db.execute("SELECT * FROM extractions WHERE reviewed_json IS NOT NULL ORDER BY created_at, rowid").fetchall()
        return [{"id": r["id"], "doc_type": r["doc_type"], "text": r["source_text"], "expected": json.loads(r["reviewed_json"])} for r in rows]

    def delete(self, eid: str) -> bool:
        with self._connect() as db:
            return db.execute("DELETE FROM extractions WHERE id = ?", (eid,)).rowcount > 0

    @staticmethod
    def _row(row) -> dict:
        return {"id": row["id"], "doc_type": row["doc_type"], "source_text": row["source_text"], "created_at": row["created_at"],
                "result": json.loads(row["result_json"]), "reviewed": json.loads(row["reviewed_json"]) if row["reviewed_json"] else None}
