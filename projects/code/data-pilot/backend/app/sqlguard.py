"""Run SQL that a MODEL wrote, safely.

A model decides what to run, and a model can be wrong or be talked into things. So the database is protected by
several independent layers, and any single one of them would stop most mistakes:

    1. a text check          only one SELECT (or WITH ... SELECT) statement, no write or admin keywords
    2. a read-only connection the file is opened with mode=ro and PRAGMA query_only
    3. an authoriser          SQLite itself refuses every operation except reading
    4. limits                 a time limit (the query is aborted) and a row limit
"""
import re
import sqlite3
import time
from dataclasses import dataclass, field


class QueryError(Exception):
    """A problem with the query, phrased so that a model (or a person) can fix it."""

    def __init__(self, message: str, hint: str = ""):
        super().__init__(message)
        self.message, self.hint = message, hint


# region: text-check
FORBIDDEN = ("insert", "update", "delete", "drop", "alter", "create", "replace", "attach", "detach", "pragma", "vacuum", "reindex", "analyze", "load_extension", "truncate")


def strip_noise(sql: str) -> str:
    """Remove comments and the CONTENTS of string literals, so keyword checks look only at real SQL."""
    sql = re.sub(r"--[^\n]*|/\*.*?\*/", " ", sql, flags=re.S)
    return re.sub(r"'(?:[^']|'')*'|\"(?:[^\"]|\"\")*\"", "''", sql)


def validate_sql(sql: str) -> str:
    """Return the cleaned query, or raise QueryError. This is layer 1; the other layers do not trust it."""
    query = sql.strip().rstrip(";").strip()
    if not query:
        raise QueryError("The query is empty.")
    code = strip_noise(query).strip().rstrip(";").strip()      # a trailing semicolon (even before a comment) is harmless
    if ";" in code:
        raise QueryError("Only one statement is allowed per query.", "Remove the extra statement after the semicolon.")
    first = code.split(None, 1)[0].lower()
    if first not in ("select", "with"):
        raise QueryError("Only read-only SELECT queries are allowed.", "Rewrite it as a SELECT.")
    for word in FORBIDDEN:
        if re.search(rf"\b{word}\b", code, re.I):
            raise QueryError(f"The keyword '{word.upper()}' is not allowed: this database is read-only.", "Use SELECT to read data.")
    return query
# endregion: text-check


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[list]
    row_count: int                  # rows returned (at most max_rows)
    truncated: bool                 # True if the query had more rows than max_rows
    ms: int
    sql: str = ""
    notes: list[str] = field(default_factory=list)


# region: authoriser
ALLOWED_ACTIONS = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}


def read_only_authoriser(action, arg1, arg2, db_name, source):
    """SQLite calls this for every operation a statement wants to perform. Anything but reading is refused."""
    if action in ALLOWED_ACTIONS:
        if action == sqlite3.SQLITE_FUNCTION and arg2 and str(arg2).lower() == "load_extension":
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK
    return sqlite3.SQLITE_DENY
# endregion: authoriser


# region: connect
def connect_read_only(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, check_same_thread=False)
    conn.execute("PRAGMA query_only = ON")
    conn.set_authorizer(read_only_authoriser)
    return conn
# endregion: connect


# region: run
def run_query(path: str, sql: str, max_rows: int = 200, timeout: float = 2.0) -> QueryResult:
    """Validate, then run on a read-only connection with an authoriser, a time limit and a row limit."""
    query = validate_sql(sql)
    conn = connect_read_only(path)
    deadline = time.monotonic() + timeout
    conn.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 10_000)     # non-zero return aborts the query
    started = time.perf_counter()
    try:
        cursor = conn.execute(query)
        columns = [d[0] for d in cursor.description or []]
        rows = [list(r) for r in cursor.fetchmany(max_rows + 1)]
    except sqlite3.OperationalError as exc:
        text = str(exc)
        if "interrupted" in text:
            raise QueryError(f"The query ran for more than {timeout:g} seconds and was stopped.", "Add filters, remove a join, or aggregate earlier.") from exc
        if "not authorized" in text or "readonly" in text:
            raise QueryError("That operation is not allowed on this read-only database.", "Use SELECT only.") from exc
        raise QueryError(text, "Check table and column names with describe_table.") from exc
    except sqlite3.Error as exc:
        raise QueryError(str(exc)) from exc
    finally:
        conn.close()
    truncated = len(rows) > max_rows
    rows = rows[:max_rows]
    return QueryResult(columns, rows, len(rows), truncated, int((time.perf_counter() - started) * 1000), query)
# endregion: run
