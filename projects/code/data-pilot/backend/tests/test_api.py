import json

from fastapi.testclient import TestClient

from app.main import create_app

from .conftest import sql
from .scripted import Scripted, reply


def parse_sse(text):
    events = []
    for block in text.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        events.append((fields["event"], json.loads(fields["data"])))
    return events


def ask(client, question, **body):
    r = client.post("/api/ask", json={"question": question, **body})
    assert r.status_code == 200, r.text
    return parse_sse(r.text)


def test_health_and_schema(client):
    assert client.get("/api/health").json() == {"status": "ok", "provider": "mock", "model": "mock-1"}
    tables = {t["table"]: t for t in client.get("/api/schema").json()}
    assert set(tables) == {"customers", "products", "orders", "order_items"} and tables["orders"]["rows"] == 420
    assert [c["name"] for c in tables["orders"]["columns"]] == ["id", "customer_id", "ordered_on", "status", "channel"]


def test_the_sql_endpoint_uses_the_same_guard_as_the_agent(client):
    ok = client.post("/api/sql", json={"query": "SELECT status, COUNT(*) AS n FROM orders GROUP BY status ORDER BY n DESC"}).json()
    assert ok["columns"] == ["status", "n"] and ok["rows"][0][0] == "delivered"
    bad = client.post("/api/sql", json={"query": "DROP TABLE orders"})
    assert bad.status_code == 400 and bad.json()["detail"]["hint"] == "Rewrite it as a SELECT."
    assert client.post("/api/sql", json={"query": ""}).status_code == 422


# region: ask-tests
def test_a_question_streams_steps_then_an_answer(client, db_path):
    events = ask(client, "Who are the top 3 customers by revenue?")
    names = [n for n, _ in events]
    assert names[0] == "turn" and names[-2:] == ["usage", "done"]
    calls = [d["name"] for n, d in events if n == "tool_call"]
    assert calls == ["describe_table", "describe_table", "describe_table", "run_sql", "show_chart"]

    table = next(d for n, d in events if n == "tool_result" and d["name"] == "run_sql")
    expected = sql(db_path, "SELECT c.name, SUM(i.quantity * i.unit_price) AS r FROM customers c JOIN orders o ON o.customer_id = c.id JOIN order_items i ON i.order_id = o.id "
                            "WHERE o.status IN ('delivered', 'shipped') GROUP BY c.id ORDER BY r DESC LIMIT 3")
    assert table["ok"] and [r[0] for r in table["ui"]["rows"]] == [r[0] for r in expected]                      # the right people, in the right order
    assert any(d["ui"]["type"] == "chart" for n, d in events if n == "tool_result")

    answer = dict(events)["done"]["answer"]
    assert expected[0][0] in answer and dict(events)["done"]["queries"] == [table["ui"]["sql"]]
    assert dict(events)["usage"]["cost_usd"] > 0


def test_the_agent_recovers_from_a_bad_query_by_itself(client):
    events = ask(client, "customers by city", simulate_mistake="wrong_column")
    results = [(d["name"], d["ok"]) for n, d in events if n == "tool_result"]
    assert ("run_sql", False) in results and results.index(("run_sql", False)) < results.index(("run_sql", True))
    assert "Most customers live in" in dict(events)["done"]["answer"]


def test_a_destructive_query_is_blocked_and_nothing_changes(client, db_path):
    events = ask(client, "how many cancelled orders are there", simulate_mistake="unsafe")
    blocked = [d for n, d in events if n == "tool_result" and not d["ok"]]
    assert blocked and "read-only" in blocked[0]["summary"]
    assert "31 cancelled orders" in dict(events)["done"]["answer"]
    assert sql(db_path, "SELECT COUNT(*) FROM orders WHERE status = 'cancelled'")[0][0] == 31


def test_a_follow_up_uses_the_earlier_query(client):
    history = [{"question": "What is our total revenue?", "answer": "Total revenue is ₹10.", "queries": ["SELECT 1 AS revenue"]}]
    assert "Revenue over 12 months" in dict(ask(client, "And by month?", history=history))["done"]["answer"]
    chart = ask(client, "show that as a chart", history=[{"question": "orders by status", "answer": "...", "queries": ["SELECT o.status, COUNT(*) AS orders FROM orders o GROUP BY o.status"]}])
    assert [d["ui"]["kind"] for n, d in chart if n == "tool_result" and d["name"] == "show_chart"] == ["bar"]


def test_a_question_it_cannot_map_is_not_guessed(client):
    events = ask(client, "What is the meaning of life?")
    assert [n for n, _ in events if n == "tool_call"] == [] and "could not match" in dict(events)["done"]["answer"]
# endregion: ask-tests


def test_a_model_that_never_finishes_ends_in_an_error_event(settings):
    with TestClient(create_app(settings, llm=Scripted(reply("", ("list_tables", {}))))) as client:
        events = ask(client, "loop forever")
    assert events[-1][0] == "error" and events[-1][1]["code"] == "too_many_steps" and sum(n == "turn" for n, _ in events) == settings.max_steps


def test_validation_errors_are_normal_http_errors(client):
    assert client.post("/api/ask", json={"question": ""}).status_code == 422
    assert client.post("/api/ask", json={"question": "x", "simulate_mistake": "bogus"}).status_code == 422
    assert client.post("/api/ask", json={"question": "x" * 2000}).status_code == 422
