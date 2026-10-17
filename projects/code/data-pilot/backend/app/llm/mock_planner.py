"""The offline "model": a planner that picks the next tool call from question templates.

It is NOT a language model and cannot understand an unusual question. What it does faithfully is behave like an
agent: it looks at the conversation so far (the question, the tool calls it already made, their results) and decides
the next move: describe the tables, run a query, fix a query that failed, chart the result, or write the answer from
what the tool returned. That is exactly the loop a real model runs, so everything around it is exercised honestly.

Pure functions, no I/O. `plan_next(messages, hints)` returns what to say and which tools to call.
"""
import csv
import io
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

PAID = "o.status IN ('delivered', 'shipped')"                      # the business rule: only these orders earned money
LINE = "i.quantity * i.unit_price"


# region: helpers
def indian(n: float) -> str:
    """211881 -> ₹2,11,881 (the Indian way of grouping digits: the last three, then pairs)."""
    s = f"{abs(round(n)):d}"
    head, tail = s[:-3], s[-3:]
    head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
    return ("-" if n < 0 else "") + "₹" + (head + "," if head else "") + tail


def parse_table(csv_text: str) -> tuple[list[str], list[list[Any]]]:
    """The model reads a tool result as text. This reads the CSV the run_sql tool returns back into rows."""
    lines = [l for l in csv_text.splitlines() if not l.startswith("(")]
    rows = list(csv.reader(io.StringIO("\n".join(lines))))
    if not rows:
        return [], []
    def convert(v: str):
        try:
            return int(v)
        except ValueError:
            try:
                return float(v)
            except ValueError:
                return v
    return rows[0], [[convert(v) for v in r] for r in rows[1:]]
# endregion: helpers


@dataclass
class Intent:
    key: str
    patterns: list[str]
    tables: list[str]
    sql: Callable[[dict], str]
    summary: Callable[[list[str], list[list]], str]
    chart: dict | None = None
    preface: str = "Let me look at the tables I need."
    break_with: tuple[str, str] = ("o.status", "o.state")           # how to make the first query fail, for the demo


def _n(params: dict, default: int = 5) -> int:
    return max(1, min(int(params.get("n", default)), 20))


# region: intents
INTENTS: list[Intent] = [
    Intent(
        "top_customers", [r"\b(top|best|biggest|highest)\b.*\bcustomers?\b", r"\bcustomers?\b.*\b(spen[dt]|revenue|most)\b"],
        ["customers", "orders", "order_items"],
        lambda p: f"SELECT c.name, c.city, ROUND(SUM({LINE})) AS revenue FROM customers c JOIN orders o ON o.customer_id = c.id "
                  f"JOIN order_items i ON i.order_id = o.id WHERE {PAID} GROUP BY c.id ORDER BY revenue DESC LIMIT {_n(p)}",
        lambda cols, rows: f"Your top customer is {rows[0][0]} from {rows[0][1]} with {indian(rows[0][2])}, followed by {rows[1][0]} ({indian(rows[1][2])}) "
                           f"and {rows[2][0]} ({indian(rows[2][2])}). The top {len(rows)} together brought in {indian(sum(r[2] for r in rows))}." if len(rows) >= 3 else f"{rows[0][0]} leads with {indian(rows[0][2])}.",
        chart={"kind": "bar", "title": "Top customers by revenue", "x": "name", "y": "revenue"}),
    Intent(
        "revenue_by_month", [r"\b(revenue|sales)\b.*\b(by|per|each|every)\s+month\b", r"\bmonthly\b.*\b(revenue|sales)\b", r"\b(revenue|sales)\b.*\b(trend|over time)\b"],
        ["orders", "order_items"],
        lambda p: f"SELECT substr(o.ordered_on, 1, 7) AS month, ROUND(SUM({LINE})) AS revenue FROM orders o JOIN order_items i ON i.order_id = o.id WHERE {PAID} GROUP BY month ORDER BY month",
        lambda cols, rows: (lambda best, worst: f"Revenue over {len(rows)} months was {indian(sum(r[1] for r in rows))}. The best month was {best[0]} ({indian(best[1])}) and the weakest was {worst[0]} ({indian(worst[1])}).")(max(rows, key=lambda r: r[1]), min(rows, key=lambda r: r[1])),
        chart={"kind": "line", "title": "Revenue by month", "x": "month", "y": "revenue"}),
    Intent(
        "orders_by_status", [r"\borders?\b.*\bby\s+status\b", r"\bstatus\b.*\b(breakdown|split)\b", r"\bbreakdown\b.*\bstatus\b"],
        ["orders"],
        lambda p: "SELECT o.status, COUNT(*) AS orders FROM orders o GROUP BY o.status ORDER BY orders DESC",
        lambda cols, rows: (lambda total: f"Of {total} orders, " + ", ".join(f"{r[1]} are {r[0]} ({100 * r[1] / total:.0f}%)" for r in rows) + ".")(sum(r[1] for r in rows)),
        chart={"kind": "pie", "title": "Orders by status", "x": "status", "y": "orders"}),
    Intent(
        "best_sellers", [r"\b(best[- ]?sell\w*|most sold|top[- ]selling|most popular)\b"],
        ["products", "order_items", "orders"],
        lambda p: f"SELECT p.name, p.category, SUM(i.quantity) AS units FROM products p JOIN order_items i ON i.product_id = p.id JOIN orders o ON o.id = i.order_id WHERE {PAID} GROUP BY p.id ORDER BY units DESC LIMIT {_n(p)}",
        lambda cols, rows: f"The best seller is {rows[0][0]} ({rows[0][1]}) with {rows[0][2]} units, then {rows[1][0]} ({rows[1][2]}) and {rows[2][0]} ({rows[2][2]})." if len(rows) >= 3 else f"{rows[0][0]} leads with {rows[0][2]} units.",
        chart={"kind": "bar", "title": "Best-selling products (units)", "x": "name", "y": "units"}),
    Intent(
        "revenue_by_category", [r"\b(revenue|sales)\b.*\b(by|per|each)\s+categor\w+", r"\bcategor\w+\b.*\b(revenue|sales)\b"],
        ["products", "order_items", "orders"],
        lambda p: f"SELECT p.category, ROUND(SUM({LINE})) AS revenue FROM products p JOIN order_items i ON i.product_id = p.id JOIN orders o ON o.id = i.order_id WHERE {PAID} GROUP BY p.category ORDER BY revenue DESC",
        lambda cols, rows: (lambda total: f"{rows[0][0]} is the biggest category with {indian(rows[0][1])}, {100 * rows[0][1] / total:.0f}% of the {indian(total)} total. The smallest is {rows[-1][0]} ({indian(rows[-1][1])}).")(sum(r[1] for r in rows)),
        chart={"kind": "bar", "title": "Revenue by category", "x": "category", "y": "revenue"}),
    Intent(
        "revenue_by_country", [r"\b(revenue|sales)\b.*\b(by|per|each)\s+(country|countries)\b"],
        ["customers", "orders", "order_items"],
        lambda p: f"SELECT c.country, ROUND(SUM({LINE})) AS revenue FROM customers c JOIN orders o ON o.customer_id = c.id JOIN order_items i ON i.order_id = o.id WHERE {PAID} GROUP BY c.country ORDER BY revenue DESC",
        lambda cols, rows: f"{rows[0][0]} brings in the most revenue ({indian(rows[0][1])}), far ahead of {rows[1][0]} ({indian(rows[1][1])})." if len(rows) > 1 else f"All revenue comes from {rows[0][0]}.",
        chart={"kind": "bar", "title": "Revenue by country", "x": "country", "y": "revenue"}),
    Intent(
        "aov", [r"\baverage order (value|size)\b", r"\baov\b"],
        ["customers", "orders", "order_items"],
        lambda p: f"SELECT c.country, ROUND(SUM({LINE}) / COUNT(DISTINCT o.id)) AS avg_order_value FROM customers c JOIN orders o ON o.customer_id = c.id JOIN order_items i ON i.order_id = o.id WHERE {PAID} GROUP BY c.country ORDER BY avg_order_value DESC",
        lambda cols, rows: f"Average order value is highest in {rows[0][0]} ({indian(rows[0][1])}) and lowest in {rows[-1][0]} ({indian(rows[-1][1])}).",
        chart={"kind": "bar", "title": "Average order value by country", "x": "country", "y": "avg_order_value"}),
    Intent(
        "rates", [r"\b(cancel\w*|return\w*)\b.*\b(rate|percent\w*|share)\b", r"\b(rate|percent\w*|share)\b.*\b(cancel\w*|return\w*)\b"],
        ["orders"],
        lambda p: "SELECT ROUND(100.0 * SUM(o.status = 'cancelled') / COUNT(*), 1) AS cancelled_pct, ROUND(100.0 * SUM(o.status = 'returned') / COUNT(*), 1) AS returned_pct FROM orders o",
        lambda cols, rows: f"{rows[0][0]}% of orders were cancelled and {rows[0][1]}% were returned.",
    ),
    Intent(
        "by_channel", [r"\b(orders?|revenue|sales)\b.*\b(by|per|each)\s+channel\b", r"\bchannels?\b.*\b(orders?|revenue|sales|split|breakdown)\b"],
        ["orders", "order_items"],
        lambda p: f"SELECT o.channel, COUNT(DISTINCT o.id) AS orders, ROUND(SUM({LINE})) AS revenue FROM orders o JOIN order_items i ON i.order_id = o.id WHERE {PAID} GROUP BY o.channel ORDER BY revenue DESC",
        lambda cols, rows: f"The {rows[0][0]} channel leads with {rows[0][1]} orders and {indian(rows[0][2])}; {rows[-1][0]} is smallest with {rows[-1][1]} orders.",
        chart={"kind": "bar", "title": "Revenue by channel", "x": "channel", "y": "revenue"}),
    Intent(
        "customers_by_city", [r"\bcustomers?\b.*\b(by|per|each)\s+(city|cities)\b", r"\bwhere\b.*\bcustomers?\b.*\blive\b"],
        ["customers"],
        lambda p: "SELECT city, COUNT(*) AS customers FROM customers GROUP BY city ORDER BY customers DESC",
        lambda cols, rows: f"Most customers live in {rows[0][0]} ({rows[0][1]}), then {rows[1][0]} ({rows[1][1]}) and {rows[2][0]} ({rows[2][1]}); {len(rows)} cities in all.",
        chart={"kind": "bar", "title": "Customers by city", "x": "city", "y": "customers"},
        break_with=("customers", "customer")),
    Intent(
        "low_stock", [r"\b(low|running low|out of)\b.*\bstock\b", r"\bstock\b.*\b(low|running)\b", r"\brunning out\b"],
        ["products"],
        lambda p: "SELECT name, category, stock FROM products WHERE stock < 20 ORDER BY stock, name LIMIT 10",
        lambda cols, rows: f"{len(rows)} products have fewer than 20 units left; the lowest is {rows[0][0]} with {rows[0][2]}." if rows else "No product has fewer than 20 units left.",
        break_with=("stock", "inventory")),
    Intent(
        "total_revenue", [r"\b(total|overall)\b.*\b(revenue|sales)\b", r"^\W*(what|how much)\b.*\b(revenue|sales)\b\W*$"],
        ["orders", "order_items"],
        lambda p: f"SELECT ROUND(SUM({LINE})) AS revenue, COUNT(DISTINCT o.id) AS orders FROM orders o JOIN order_items i ON i.order_id = o.id WHERE {PAID}",
        lambda cols, rows: f"Total revenue is {indian(rows[0][0])} from {rows[0][1]} delivered or shipped orders."),
    Intent(
        "count_customers", [r"\bhow many customers\b"], ["customers"],
        lambda p: "SELECT COUNT(*) AS customers FROM customers",
        lambda cols, rows: f"There are {rows[0][0]} customers.", break_with=("customers", "customer")),
    Intent(
        "count_products", [r"\bhow many products\b"], ["products"],
        lambda p: "SELECT COUNT(*) AS products FROM products",
        lambda cols, rows: f"There are {rows[0][0]} products.", break_with=("products", "product")),
    Intent(
        "count_orders", [r"\bhow many (cancelled |returned |delivered |shipped )?orders\b"], ["orders"],
        lambda p: (f"SELECT COUNT(*) AS {p['status']}_orders FROM orders o WHERE o.status = '{p['status']}'" if p.get("status") else "SELECT COUNT(*) AS orders FROM orders o"),
        lambda cols, rows: f"There are {rows[0][0]} {cols[0].replace('_', ' ')}."),
]
# endregion: intents

FOLLOW_UP = re.compile(r"^\W*(and|now|also|what about|how about|same|then)\b", re.I)
CHART_WORDS = re.compile(r"\b(chart|plot|graph|pie|bar|visuali[sz]e|picture)\b", re.I)


@dataclass
class Resolved:
    intent: Intent | None                    # None means "re-run the previous query and chart it"
    params: dict = field(default_factory=dict)
    previous_sql: str = ""


def _params(question: str) -> dict:
    params: dict = {}
    m = re.search(r"\b(?:top|best|biggest|highest|first)\s+(\d+)\b|\b(\d+)\s+(?:top|best|biggest)\b", question, re.I)
    if m:
        params["n"] = int(m.group(1) or m.group(2))
    m = re.search(r"\b(cancelled|returned|delivered|shipped)\b", question, re.I)
    if m:
        params["status"] = m.group(1).lower()
    return params


def previous_sql(messages: list[dict]) -> str:
    """The last query we ran, remembered in the earlier assistant message as "(SQL used: ...)"."""
    for m in reversed(messages):
        if m["role"] == "assistant" and isinstance(m["content"], str):
            found = re.findall(r"\(SQL used: (.+?)\)\s*$", m["content"], re.S | re.M)
            if found:
                return found[-1].strip()
    return ""


# region: resolve
def resolve(question: str, history: list[dict]) -> Resolved | None:
    """Which template does this question match? Follow-ups ("and by month?", "show that as a chart") use the history."""
    q = question.lower()
    follow_up = bool(FOLLOW_UP.search(q)) or len(q.split()) <= 4 or bool(re.search(r"\b(that|it|this|these|them|the result|previous)\b", q))
    if follow_up and history:
        prior = previous_sql(history)
        if CHART_WORDS.search(q) and prior:
            return Resolved(None, {}, prior)
        for key, word in (("revenue_by_month", "month"), ("revenue_by_category", "categor"), ("revenue_by_country", "countr"), ("by_channel", "channel")):
            if word in q:
                return Resolved(next(i for i in INTENTS if i.key == key), _params(question))
    for intent in INTENTS:
        if any(re.search(p, q) for p in intent.patterns):
            return Resolved(intent, _params(question))
    return None
# endregion: resolve


@dataclass
class Step:
    text: str
    calls: list[tuple[str, dict]]              # (tool name, input) pairs; empty means "I am finished"


CANT_HELP = ("I can answer questions about customers, products, orders, revenue, channels and stock in the Aurora shop, but I could not match this "
             "question to that data. Try something like: \"Who are the top 5 customers by revenue?\" or \"Show revenue by month\".")


def _history_and_progress(messages: list[dict]):
    """Split the messages into the earlier conversation, the current question, and what has happened since."""
    qi = max(i for i, m in enumerate(messages) if m["role"] == "user" and isinstance(m["content"], str))
    calls: list[dict] = []                       # {id, name, input, ok, content}
    for m in messages[qi + 1:]:
        if isinstance(m["content"], list):
            for block in m["content"]:
                if block.get("type") == "tool_use":
                    calls.append({"id": block["id"], "name": block["name"], "input": block["input"], "ok": None, "content": ""})
                elif block.get("type") == "tool_result":
                    for c in calls:
                        if c["id"] == block["tool_use_id"]:
                            c["ok"], c["content"] = not block.get("is_error", False), block["content"]
    return messages[:qi], messages[qi]["content"], calls


# region: plan
def plan_next(messages: list[dict], hints: dict | None = None) -> Step:
    """Decide the next move, the way an agent does: from the question and everything that has happened so far."""
    history, question, calls = _history_and_progress(messages)
    resolved = resolve(question, history)
    if resolved is None:
        return Step(CANT_HELP, [])
    intent = resolved.intent

    def sql_for_attempt(attempt: int) -> str:
        good = resolved.previous_sql if intent is None else intent.sql(resolved.params)
        mistake = (hints or {}).get("simulate_mistake")
        if attempt == 0 and mistake == "unsafe":
            return "DELETE FROM orders WHERE status = 'cancelled'"                   # a model can ask for anything
        if attempt == 0 and mistake == "wrong_column" and intent is not None:
            find, replace = intent.break_with
            return good.replace(find, replace, 1)
        return good

    runs = [c for c in calls if c["name"] == "run_sql"]
    if intent is not None and not calls:                                                # 1. look at the tables first
        return Step(intent.preface, [("describe_table", {"table": t}) for t in intent.tables])
    if not runs:                                                                      # 2. run the query
        return Step("Now I will run the query." if intent else "I will re-run the last query and chart it.", [("run_sql", {"query": sql_for_attempt(0)})])

    last = runs[-1]
    if not last["ok"]:                                                                # 3. it failed: read the error, fix it
        if len(runs) >= 3:
            return Step(f"I could not get a working query after {len(runs)} attempts. The last error was: {last['content']}", [])
        return Step("That query failed, so I will correct it and try again.", [("run_sql", {"query": sql_for_attempt(len(runs))})])

    columns, rows = parse_table(last["content"])
    if not any(c["name"] == "show_chart" for c in calls):                             # 4. a picture, if it helps
        chart = intent.chart if intent else None
        if intent is None and rows:
            y = next((c for c, v in zip(columns, rows[0]) if isinstance(v, (int, float))), None)
            x = next((c for c in columns if c != y), None)
            kind = "pie" if re.search(r"\bpie\b", question, re.I) else "line" if re.search(r"\bline\b", question, re.I) else "bar"
            chart = {"kind": kind, "title": "Result", "x": x, "y": y} if x and y else None
        if chart and len(rows) > 1:
            return Step("A chart will make this clearer.", [("show_chart", dict(chart))])
    if intent is None:
        return Step(f"Here is the previous result as a chart ({len(rows)} rows).", [])
    if not rows:
        return Step("The query ran, but it returned no rows.", [])
    return Step(intent.summary(columns, rows), [])                                    # 5. answer from the data
# endregion: plan
