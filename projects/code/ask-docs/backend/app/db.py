"""Documents and their chunks in SQLite. The vectors are stored as raw float32 bytes next to each chunk."""
import sqlite3
import uuid
from contextlib import closing, contextmanager
from datetime import datetime, timezone

import numpy as np

# region: schema
SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    filename   TEXT NOT NULL,
    kind       TEXT NOT NULL,            -- text | pdf
    pages      INTEGER NOT NULL DEFAULT 1,
    status     TEXT NOT NULL,            -- queued | parsing | embedding | ready | failed
    error      TEXT,
    n_chunks   INTEGER NOT NULL DEFAULT 0,
    progress   REAL NOT NULL DEFAULT 0,  -- 0..1, shown as a progress bar
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    ordinal     INTEGER NOT NULL,        -- position in the document
    page        INTEGER NOT NULL,
    start       INTEGER NOT NULL,        -- character offsets inside the page text
    "end"       INTEGER NOT NULL,
    heading     TEXT NOT NULL DEFAULT '',
    text        TEXT NOT NULL,
    embedding   BLOB,                    -- float32 vector, or NULL until embedded
    embed_model TEXT                     -- which embedder made it: vectors from different models cannot be mixed
);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id, ordinal);
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
        with closing(sqlite3.connect(self.path, timeout=30)) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys = ON")
            with db:
                yield db

    # ---- documents
    def create_document(self, title: str, filename: str, kind: str) -> str:
        did = uuid.uuid4().hex[:10]
        with self._connect() as db:
            db.execute("INSERT INTO documents (id, title, filename, kind, status, created_at) VALUES (?, ?, ?, ?, 'queued', ?)",
                       (did, title, filename, kind, now()))
        return did

    def update_document(self, did: str, **fields) -> None:
        allowed = {"status", "error", "pages", "n_chunks", "progress", "title"}
        assert set(fields) <= allowed, fields
        sets = ", ".join(f"{k} = ?" for k in fields)
        with self._connect() as db:
            db.execute(f"UPDATE documents SET {sets} WHERE id = ?", (*fields.values(), did))

    def documents(self) -> list[dict]:
        with self._connect() as db:
            return [dict(r) for r in db.execute("SELECT * FROM documents ORDER BY created_at, rowid").fetchall()]

    def get_document(self, did: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM documents WHERE id = ?", (did,)).fetchone()
        return dict(row) if row else None

    def delete_document(self, did: str) -> bool:
        with self._connect() as db:
            return db.execute("DELETE FROM documents WHERE id = ?", (did,)).rowcount > 0

    # ---- chunks
    def add_chunks(self, did: str, rows: list[dict], vectors: np.ndarray, embed_model: str) -> list[int]:
        ids = []
        with self._connect() as db:
            for row, vec in zip(rows, vectors):
                cur = db.execute(
                    'INSERT INTO chunks (document_id, ordinal, page, start, "end", heading, text, embedding, embed_model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    (did, row["ordinal"], row["page"], row["start"], row["end"], row["heading"], row["text"], vec.astype(np.float32).tobytes(), embed_model))
                ids.append(cur.lastrowid)
        return ids

    def indexable_chunks(self, embed_model: str) -> list[dict]:
        """Chunks whose vectors came from the CURRENT embedder: the only ones we can search."""
        with self._connect() as db:
            rows = db.execute("SELECT c.id, c.document_id, c.heading, c.text, c.embedding FROM chunks c JOIN documents d ON d.id = c.document_id "
                              "WHERE c.embed_model = ? AND d.status = 'ready' ORDER BY c.id", (embed_model,)).fetchall()
        return [{**dict(r), "embedding": np.frombuffer(r["embedding"], dtype=np.float32)} for r in rows]

    def stale_chunks(self, embed_model: str) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("SELECT id, document_id, heading, text FROM chunks WHERE embed_model IS NOT ? ORDER BY id", (embed_model,)).fetchall()
        return [dict(r) for r in rows]

    def set_embeddings(self, ids: list[int], vectors: np.ndarray, embed_model: str) -> None:
        with self._connect() as db:
            for cid, vec in zip(ids, vectors):
                db.execute("UPDATE chunks SET embedding = ?, embed_model = ? WHERE id = ?", (vec.astype(np.float32).tobytes(), embed_model, cid))

    def chunks_by_ids(self, ids: list[int]) -> dict[int, dict]:
        if not ids:
            return {}
        marks = ",".join("?" * len(ids))
        with self._connect() as db:
            rows = db.execute(f'SELECT c.id, c.document_id, d.title AS document, c.ordinal, c.page, c.start, c."end" AS end, c.heading, c.text '
                              f"FROM chunks c JOIN documents d ON d.id = c.document_id WHERE c.id IN ({marks})", ids).fetchall()
        return {r["id"]: dict(r) for r in rows}

    def chunk_with_neighbours(self, cid: int) -> dict | None:
        chunk = self.chunks_by_ids([cid]).get(cid)
        if chunk is None:
            return None
        with self._connect() as db:
            near = {r["ordinal"]: r["text"] for r in db.execute(
                "SELECT ordinal, text FROM chunks WHERE document_id = ? AND ordinal IN (?, ?)", (chunk["document_id"], chunk["ordinal"] - 1, chunk["ordinal"] + 1))}
        return {**chunk, "before": near.get(chunk["ordinal"] - 1), "after": near.get(chunk["ordinal"] + 1)}
