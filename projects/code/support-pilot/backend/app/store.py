"""Storage: tickets, drafts, the audit log, traces and sent messages, in one SQLite file (standard library only)."""
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from typing import Any

# region: schema
SCHEMA = """
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, email TEXT, name TEXT, placed_on TEXT, status TEXT, payment TEXT,
                                   delivered_on TEXT, eta TEXT, total REAL, items TEXT);
CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, from_email TEXT, subject TEXT, body TEXT,
                                    channel TEXT, status TEXT DEFAULT 'new', triage TEXT, redactions TEXT);
CREATE TABLE IF NOT EXISTS drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER, version INTEGER, text TEXT, policy TEXT,
                                   checks TEXT, citations TEXT, sources TEXT, source TEXT, author TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, ticket_id INTEGER, actor TEXT, role TEXT, action TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS traces (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER, created_at TEXT, summary TEXT, spans TEXT);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER, created_at TEXT, text TEXT, sent_by TEXT);
"""
JSON_COLUMNS = {"triage", "redactions", "policy", "checks", "citations", "sources", "summary", "spans", "items"}
PRIORITY_RANK = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
# endregion: schema


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _row(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return {k: (json.loads(row[k]) if k in JSON_COLUMNS and row[k] is not None else row[k]) for k in row.keys()}


class Store:
    """Each method opens its own short connection, so the store is safe to call from any thread."""

    def __init__(self, path: str):
        self.path = path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def _run(self, sql: str, args: tuple = ()) -> int:
        with closing(self._connect()) as conn, conn:
            return conn.execute(sql, args).lastrowid or 0

    def _all(self, sql: str, args: tuple = ()) -> list[dict]:
        with closing(self._connect()) as conn:
            return [_row(r) for r in conn.execute(sql, args).fetchall()]

    def _one(self, sql: str, args: tuple = ()) -> dict | None:
        rows = self._all(sql, args)
        return rows[0] if rows else None

    # -- setup --
    def init(self, orders: list[dict], tickets: list[dict]) -> None:
        """Create the tables, and on the very first start fill them with the demo shop and a demo inbox."""
        with closing(self._connect()) as conn, conn:
            conn.executescript(SCHEMA)
            if conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 0:
                conn.executemany("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?)", [
                    (o["id"], o["email"], o["name"], o["placed_on"], o["status"], o["payment"], o["delivered_on"], o["eta"], o["total"], json.dumps(o["items"])) for o in orders])
                conn.executemany("INSERT INTO tickets (created_at, from_email, subject, body, channel) VALUES (?,?,?,?,?)",
                                 [(now_iso(), t["from_email"], t["subject"], t["body"], t["channel"]) for t in tickets])

    # -- orders --
    def get_order(self, order_id: str) -> dict | None:
        return self._one("SELECT * FROM orders WHERE id = ?", (order_id.upper(),))

    def orders_for_email(self, email: str) -> list[dict]:
        return self._all("SELECT * FROM orders WHERE lower(email) = lower(?) ORDER BY placed_on DESC", (email,))

    # -- tickets --
    def add_ticket(self, from_email: str, subject: str, body: str, channel: str) -> int:
        return self._run("INSERT INTO tickets (created_at, from_email, subject, body, channel) VALUES (?,?,?,?,?)", (now_iso(), from_email, subject, body, channel))

    def get_ticket(self, ticket_id: int) -> dict | None:
        return self._one("SELECT * FROM tickets WHERE id = ?", (ticket_id,))

    def list_tickets(self, status: str | None = None, q: str | None = None, limit: int = 200) -> list[dict]:
        sql, args = "SELECT * FROM tickets WHERE 1=1", []
        if status:
            sql += " AND status = ?"
            args.append(status)
        if q:
            sql += " AND (subject LIKE ? OR from_email LIKE ?)"
            args += [f"%{q}%", f"%{q}%"]
        rows = self._all(sql + " ORDER BY id DESC LIMIT ?", (*args, limit))
        return sorted(rows, key=lambda t: (PRIORITY_RANK.get((t["triage"] or {}).get("priority", "normal"), 2), -t["id"]))

    def update_ticket(self, ticket_id: int, **fields: Any) -> None:
        allowed = {"status", "triage", "redactions"}
        assert set(fields) <= allowed, f"cannot update {set(fields) - allowed}"
        values = [json.dumps(v) if k in JSON_COLUMNS else v for k, v in fields.items()]
        self._run(f"UPDATE tickets SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?", (*values, ticket_id))

    # -- drafts --
    def add_draft(self, ticket_id: int, text: str, policy: dict, checks: list[dict], citations: list[str], sources: list[str], source: str, author: str) -> dict:
        version = (self._one("SELECT MAX(version) AS v FROM drafts WHERE ticket_id = ?", (ticket_id,)) or {}).get("v") or 0
        self._run("INSERT INTO drafts (ticket_id, version, text, policy, checks, citations, sources, source, author, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (ticket_id, version + 1, text, json.dumps(policy), json.dumps(checks), json.dumps(citations), json.dumps(sources), source, author, now_iso()))
        return self.latest_draft(ticket_id)  # type: ignore[return-value]

    def latest_draft(self, ticket_id: int) -> dict | None:
        return self._one("SELECT * FROM drafts WHERE ticket_id = ? ORDER BY version DESC LIMIT 1", (ticket_id,))

    def drafts(self, ticket_id: int) -> list[dict]:
        return self._all("SELECT * FROM drafts WHERE ticket_id = ? ORDER BY version", (ticket_id,))

    # -- audit, traces, messages --
    def add_audit(self, ticket_id: int, actor: str, role: str, action: str, detail: str = "") -> None:
        self._run("INSERT INTO audit (ts, ticket_id, actor, role, action, detail) VALUES (?,?,?,?,?,?)", (now_iso(), ticket_id, actor, role, action, detail))

    def audit(self, ticket_id: int) -> list[dict]:
        return self._all("SELECT ts, actor, role, action, detail FROM audit WHERE ticket_id = ? ORDER BY id", (ticket_id,))

    def add_trace(self, ticket_id: int, summary: dict, spans: list[dict]) -> int:
        return self._run("INSERT INTO traces (ticket_id, created_at, summary, spans) VALUES (?,?,?,?)", (ticket_id, now_iso(), json.dumps(summary), json.dumps(spans)))

    def latest_trace(self, ticket_id: int) -> dict | None:
        return self._one("SELECT id, created_at, summary, spans FROM traces WHERE ticket_id = ? ORDER BY id DESC LIMIT 1", (ticket_id,))

    def add_message(self, ticket_id: int, text: str, sent_by: str) -> None:
        self._run("INSERT INTO messages (ticket_id, created_at, text, sent_by) VALUES (?,?,?,?)", (ticket_id, now_iso(), text, sent_by))

    def messages(self, ticket_id: int) -> list[dict]:
        return self._all("SELECT created_at, text, sent_by FROM messages WHERE ticket_id = ? ORDER BY id", (ticket_id,))

    # -- numbers for the dashboard --
    def metrics(self) -> dict:
        statuses = {r["status"]: r["n"] for r in self._all("SELECT status, COUNT(*) AS n FROM tickets GROUP BY status")}
        traces = [r["summary"] for r in self._all("SELECT summary FROM traces")]
        actions = {r["action"]: r["n"] for r in self._all("SELECT action, COUNT(*) AS n FROM audit GROUP BY action")}
        edited = self._one("SELECT COUNT(DISTINCT ticket_id) AS n FROM drafts WHERE source = 'human'")["n"]
        drafted = self._one("SELECT COUNT(DISTINCT ticket_id) AS n FROM drafts")["n"]
        approved, rejected = actions.get("approve", 0), actions.get("reject", 0)
        return {
            "tickets": sum(statuses.values()), "by_status": statuses, "processed_runs": len(traces),
            "avg_cost_usd": round(sum(t["cost_usd"] for t in traces) / len(traces), 6) if traces else 0.0,
            "avg_duration_ms": round(sum(t["duration_ms"] for t in traces) / len(traces)) if traces else 0,
            "approved": approved, "rejected": rejected, "sent": actions.get("send", 0),
            "approval_rate": round(approved / (approved + rejected), 2) if approved + rejected else None,
            "edit_rate": round(edited / drafted, 2) if drafted else None,
        }
