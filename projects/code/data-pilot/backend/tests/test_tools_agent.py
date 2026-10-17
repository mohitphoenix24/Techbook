import pytest

from app.agent import history_messages, run_agent
from app.tools import MODEL_ROWS, TOOLS, ToolBox

from .conftest import sql
from .scripted import Scripted, reply


@pytest.fixture
def box(db_path):
    return ToolBox(db_path)


async def collect(llm, box, question="q", history=(), **kw):
    return [e async for e in run_agent(llm, box, question, list(history), **kw)]


# region: tool-tests
def test_the_tools_are_described_for_the_model():
    assert [t["name"] for t in TOOLS] == ["list_tables", "describe_table", "run_sql", "show_chart"]
    assert all(t["strict"] and t["input_schema"]["additionalProperties"] is False for t in TOOLS)         # strict: valid arguments guaranteed
    assert TOOLS[1]["input_schema"]["properties"]["table"]["enum"] == ["customers", "products", "orders", "order_items"]


def test_the_model_reads_compact_text_and_the_browser_gets_the_data(box):
    out = box.call("run_sql", {"query": "SELECT name, price FROM products ORDER BY id LIMIT 2"})
    assert out.ok and out.content == "name,price\nWireless Earbuds Pro,4999\nSmart Watch S2,8999"
    assert out.ui["type"] == "table" and out.ui["columns"] == ["name", "price"] and out.ui["rows"][0] == ["Wireless Earbuds Pro", 4999.0]


def test_long_results_are_cut_for_the_model_and_say_so(box):
    out = box.call("run_sql", {"query": "SELECT id FROM order_items"})
    assert out.content.count("\n") == MODEL_ROWS + 1 and "showing the first 40 of" in out.content
    assert len(out.ui["rows"]) == 200 and out.ui["truncated"]                                              # the browser still gets up to 200


def test_describe_and_list_tables(box):
    assert "orders (420 rows)" in box.call("list_tables", {}).content
    out = box.call("describe_table", {"table": "orders"})
    assert "columns: id INTEGER" in out.content and "status TEXT" in out.content and out.content.count("\n") >= 5
    bad = box.call("describe_table", {"table": "users; DROP TABLE orders"})
    assert not bad.ok and "no table called" in bad.content                                                  # names are checked against a fixed list


def test_failures_become_results_the_model_can_read_not_exceptions(box):
    out = box.call("run_sql", {"query": "DELETE FROM orders"})
    assert not out.ok and out.content.startswith("Error: Only read-only SELECT") and "Hint:" in out.content
    assert not box.call("run_sql", {"query": "SELECT nope FROM orders"}).ok
    assert not box.call("no_such_tool", {}).ok
    assert not box.call("run_sql", {"unexpected": 1}).ok


def test_charts_refer_to_the_last_result_and_are_validated(box):
    assert "no result to chart" in box.call("show_chart", {"kind": "bar", "title": "t", "x": "a", "y": "b"}).content
    box.call("run_sql", {"query": "SELECT status, COUNT(*) AS n FROM orders GROUP BY status"})
    ok = box.call("show_chart", {"kind": "pie", "title": "Orders", "x": "status", "y": "n"})
    assert ok.ok and ok.ui["type"] == "chart" and len(ok.ui["points"]) == 4
    assert "is not a column" in box.call("show_chart", {"kind": "bar", "title": "t", "x": "status", "y": "revenue"}).content
    assert "not numeric" in box.call("show_chart", {"kind": "bar", "title": "t", "x": "n", "y": "status"}).content
# endregion: tool-tests


# region: loop-tests
async def test_the_loop_runs_tools_and_gives_the_results_back_to_the_model(box):
    llm = Scripted(reply("Let me check.", ("run_sql", {"query": "SELECT COUNT(*) AS n FROM customers"})), reply("There are 60 customers."))
    events = await collect(llm, box, "How many customers?")

    assert [e["type"] for e in events] == ["turn", "delta", "tool_call", "tool_result", "turn", "delta", "done"]
    assert events[-1]["answer"] == "There are 60 customers." and events[-1]["queries"] == ["SELECT COUNT(*) AS n FROM customers"]
    second_request = llm.requests[1]
    assert [m["role"] for m in second_request] == ["user", "assistant", "user"]
    assert second_request[1]["content"][1]["type"] == "tool_use"                                            # what the model said, unchanged
    assert second_request[2]["content"] == [{"type": "tool_result", "tool_use_id": "toolu_1", "content": "n\n60", "is_error": False}]


async def test_all_the_results_of_one_turn_go_back_in_a_single_message(box):
    llm = Scripted(reply("", ("describe_table", {"table": "orders"}), ("describe_table", {"table": "customers"})), reply("Done."))
    await collect(llm, box)
    results = llm.requests[1][-1]["content"]
    assert [r["tool_use_id"] for r in results] == ["toolu_1", "toolu_2"] and llm.requests[1][-1]["role"] == "user"


async def test_a_failed_tool_is_flagged_as_an_error_and_the_loop_continues(box):
    llm = Scripted(reply("", ("run_sql", {"query": "DROP TABLE orders"})), reply("I could not do that; the database is read-only."))
    events = await collect(llm, box)
    assert [e["ok"] for e in events if e["type"] == "tool_result"] == [False]
    assert llm.requests[1][-1]["content"][0]["is_error"] is True and events[-1]["type"] == "done"
    assert sql(box.db_path, "SELECT COUNT(*) FROM orders")[0][0] == 420                                     # nothing was harmed


async def test_a_model_that_never_finishes_is_stopped(box):
    llm = Scripted(reply("", ("list_tables", {})))
    events = await collect(llm, box, max_steps=3)
    assert events[-1]["type"] == "error" and events[-1]["code"] == "too_many_steps"
    assert sum(e["type"] == "turn" for e in events) == 3 and len(llm.requests) == 3                          # three paid turns, then a hard stop


async def test_token_use_is_added_up_across_turns(box):
    llm = Scripted(reply("", ("list_tables", {})), reply("Done."))
    assert (await collect(llm, box))[-1]["usage"] == {"input_tokens": 200, "output_tokens": 40}


def test_earlier_turns_become_plain_messages_that_remember_the_query():
    messages = history_messages([{"question": "Revenue?", "answer": "Total is ₹10.", "queries": ["SELECT 1", "SELECT 2"]}])
    assert messages == [{"role": "user", "content": "Revenue?"}, {"role": "assistant", "content": "Total is ₹10.\n(SQL used: SELECT 2)"}]
# endregion: loop-tests
