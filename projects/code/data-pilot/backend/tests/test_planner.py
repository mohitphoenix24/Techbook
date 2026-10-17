import pytest

from app.llm.mock_planner import indian, parse_table, plan_next, resolve


def ask(question, history=()):
    return [*history, {"role": "user", "content": question}]


@pytest.mark.parametrize("question,key", [
    ("Who are the top 5 customers by revenue?", "top_customers"),
    ("show me the biggest customers", "top_customers"),
    ("Show revenue by month", "revenue_by_month"),
    ("monthly sales trend", "revenue_by_month"),
    ("orders by status", "orders_by_status"),
    ("What are our best selling products?", "best_sellers"),
    ("revenue per category", "revenue_by_category"),
    ("average order value", "aov"),
    ("What is the cancellation rate?", "rates"),
    ("sales by channel", "by_channel"),
    ("customers by city", "customers_by_city"),
    ("which products are low on stock", "low_stock"),
    ("What is our total revenue?", "total_revenue"),
    ("how many customers do we have", "count_customers"),
    ("how many cancelled orders are there", "count_orders"),
])
def test_questions_are_matched_to_templates(question, key):
    assert resolve(question, []).intent.key == key


def test_unfamiliar_questions_are_not_guessed():
    assert resolve("What is the meaning of life?", []) is None
    assert plan_next(ask("What is the meaning of life?")).calls == []


def test_the_number_in_the_question_is_used():
    r = resolve("top 3 customers by revenue", [])
    assert "LIMIT 3" in r.intent.sql(r.params)
    assert "LIMIT 20" in r.intent.sql({"n": 99})                                               # and capped


def test_follow_ups_use_the_conversation():
    history = [{"role": "user", "content": "What is our total revenue?"}, {"role": "assistant", "content": "Total is ₹10.\n(SQL used: SELECT 1 AS revenue)"}]
    assert resolve("And by month?", history).intent.key == "revenue_by_month"
    chart = resolve("show that as a chart", history)
    assert chart.intent is None and chart.previous_sql == "SELECT 1 AS revenue"


# region: planner-tests
def test_the_plan_follows_the_agent_pattern_describe_query_chart_answer():
    q = ask("Show revenue by month")
    step = plan_next(q)
    assert [name for name, _ in step.calls] == ["describe_table", "describe_table"]                # parallel calls to look at the tables
    q += [{"role": "assistant", "content": [{"type": "tool_use", "id": "a", "name": "describe_table", "input": {}}]},
          {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "a", "content": "ok"}]}]
    assert plan_next(q).calls[0][0] == "run_sql"


def test_a_failed_query_is_corrected_and_not_repeated_forever():
    q = ask("customers by city")
    wrong = plan_next(q, {"simulate_mistake": "wrong_column"})
    q = ask("customers by city")
    def after_run(q, sql, ok, content):
        return [*q, {"role": "assistant", "content": [{"type": "tool_use", "id": "r1", "name": "run_sql", "input": {"query": sql}}]},
                {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "r1", "content": content, "is_error": not ok}]}]
    bad = after_run(q, "SELECT x", False, "Error: no such table: customer")
    fixed = plan_next(bad, {"simulate_mistake": "wrong_column"})
    assert fixed.calls[0][0] == "run_sql" and "FROM customers" in fixed.calls[0][1]["query"]
    for _ in range(2):
        bad = after_run(bad, "SELECT x", False, "Error: still wrong")
    assert plan_next(bad).calls == []                                                          # gives up after three attempts
# endregion: planner-tests


def test_indian_number_grouping():
    assert [indian(n) for n in (0, 999, 1000, 211881, 3217610, 12345678)] == ["₹0", "₹999", "₹1,000", "₹2,11,881", "₹32,17,610", "₹1,23,45,678"]


def test_a_tool_result_is_read_back_into_rows():
    assert parse_table("name,revenue\nAsha,100\nRavi,2.5\n(showing the first 2 of 9 rows; add LIMIT)") == (["name", "revenue"], [["Asha", 100], ["Ravi", 2.5]])
