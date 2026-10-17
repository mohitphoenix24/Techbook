"""The agent's tools: what it may do. Each tool is a plain function; the model only ever asks for them by name.

A tool returns TWO things: `content`, a compact text for the MODEL to read (tokens cost money), and `ui`, richer data
for the BROWSER to draw (a table, a chart). They are different audiences with different needs.
"""
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from .seed import DESCRIPTIONS
from .sqlguard import QueryError, QueryResult, run_query

TABLES = list(DESCRIPTIONS)
MODEL_ROWS = 40                 # the model sees at most this many rows; the browser gets all (up to max_rows)


# region: definitions
TOOLS: list[dict] = [
    {
        "name": "list_tables",
        "description": "List the tables in the shop database with a one-line description and row count of each. Call this first if you are unsure what data exists.",
        "strict": True,
        "input_schema": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
    },
    {
        "name": "describe_table",
        "description": "Show the columns (name and type) of one table and three sample rows. Always describe a table before you query it, so you use the right column names.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"table": {"type": "string", "enum": TABLES, "description": "The table to describe."}},
            "required": ["table"],
            "additionalProperties": False,
        },
    },
    {
        "name": "run_sql",
        "description": (
            "Run ONE read-only SQL SELECT query (SQLite dialect) and get the result rows. Only SELECT is allowed. "
            "Use aggregates (SUM, COUNT, AVG) and GROUP BY instead of fetching raw rows. At most 200 rows are returned."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "A single SELECT statement."}},
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "show_chart",
        "description": "Display the result of the LAST successful run_sql as a chart for the user. x and y must be column names of that result, and y must be numeric. Use it when a picture helps (trends, comparisons, shares).",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["bar", "line", "pie"], "description": "bar to compare, line for a trend over time, pie for shares of a whole."},
                "title": {"type": "string", "description": "A short title."},
                "x": {"type": "string", "description": "Column for the labels or the horizontal axis."},
                "y": {"type": "string", "description": "Numeric column for the values."},
            },
            "required": ["kind", "title", "x", "y"],
            "additionalProperties": False,
        },
    },
]
# endregion: definitions


# region: output
@dataclass
class ToolOutput:
    ok: bool
    content: str                                   # what the model reads
    ui: dict[str, Any] = field(default_factory=dict)   # what the browser draws
# endregion: output


# region: format
def number(value: Any) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".") if isinstance(value, float) else str(value)


def table_for_model(result: QueryResult) -> str:
    """CSV, at most MODEL_ROWS rows. Compact on purpose: every row costs tokens on every later turn."""
    shown = result.rows[:MODEL_ROWS]
    lines = [",".join(result.columns), *(",".join("" if v is None else number(v) for v in row) for row in shown)]
    if result.row_count > len(shown) or result.truncated:
        lines.append(f"(showing the first {len(shown)} of {'more than ' if result.truncated else ''}{result.row_count} rows; add LIMIT, filters or aggregation)")
    elif not shown:
        lines.append("(no rows)")
    return "\n".join(lines)
# endregion: format


# region: toolbox
class ToolBox:
    """The tools, bound to one database. Remembers the last result so show_chart can refer to it."""

    def __init__(self, db_path: str, max_rows: int = 200, timeout: float = 2.0):
        self.db_path, self.max_rows, self.timeout = db_path, max_rows, timeout
        self.last: QueryResult | None = None

    def call(self, name: str, args: dict) -> ToolOutput:
        handler = getattr(self, f"_{name}", None)
        if handler is None:
            return ToolOutput(False, f"Unknown tool '{name}'. Available: {', '.join(t['name'] for t in TOOLS)}.")
        try:
            return handler(**args)
        except QueryError as exc:
            return ToolOutput(False, f"Error: {exc.message}" + (f" Hint: {exc.hint}" if exc.hint else ""), {"type": "error", "message": exc.message})
        except TypeError:
            return ToolOutput(False, f"Error: the arguments for {name} were not valid.")

    def _trusted(self) -> sqlite3.Connection:
        """For schema introspection only: we pass it table names that were checked against a fixed list, never raw SQL."""
        conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn

    def _list_tables(self) -> ToolOutput:
        with self._trusted() as db:
            rows = [{"table": t, "rows": db.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0], "description": DESCRIPTIONS[t]} for t in TABLES]
        text = "\n".join(f"{r['table']} ({r['rows']} rows): {r['description']}" for r in rows)
        return ToolOutput(True, text, {"type": "tables", "tables": rows})

    def _describe_table(self, table: str) -> ToolOutput:
        if table not in TABLES:                                     # the model chose this name: check it, never trust it
            raise QueryError(f"There is no table called '{table}'.", f"The tables are: {', '.join(TABLES)}.")
        with self._trusted() as db:
            columns = [{"name": r["name"], "type": r["type"]} for r in db.execute(f'PRAGMA table_info("{table}")')]
            sample = [dict(r) for r in db.execute(f'SELECT * FROM "{table}" LIMIT 3')]
        text = f"{table}: {DESCRIPTIONS[table]}\ncolumns: " + ", ".join(f"{c['name']} {c['type']}" for c in columns) + "\nsample rows:\n" + "\n".join(str(list(r.values())) for r in sample)
        return ToolOutput(True, text, {"type": "columns", "table": table, "columns": columns})

    def _run_sql(self, query: str) -> ToolOutput:
        result = run_query(self.db_path, query, self.max_rows, self.timeout)
        self.last = result
        note = " (truncated)" if result.truncated else ""
        ui = {"type": "table", "sql": result.sql, "columns": result.columns, "rows": result.rows, "row_count": result.row_count, "truncated": result.truncated, "ms": result.ms}
        return ToolOutput(True, table_for_model(result), {**ui, "note": note})

    def _show_chart(self, kind: str, title: str, x: str, y: str) -> ToolOutput:
        result = self.last
        if result is None:
            raise QueryError("There is no result to chart yet.", "Call run_sql first.")
        for column in (x, y):
            if column not in result.columns:
                raise QueryError(f"'{column}' is not a column of the last result.", f"The columns are: {', '.join(result.columns)}.")
        xi, yi = result.columns.index(x), result.columns.index(y)
        points = [[str(r[xi]), r[yi]] for r in result.rows]
        if not all(isinstance(p[1], (int, float)) for p in points):
            raise QueryError(f"'{y}' is not numeric.", "Choose a numeric column for y.")
        limit = 60 if kind == "line" else 20
        return ToolOutput(True, f"Chart '{title}' is now shown to the user ({len(points[:limit])} points).",
                          {"type": "chart", "kind": kind, "title": title, "x": x, "y": y, "points": points[:limit], "clipped": len(points) > limit})
# endregion: toolbox
