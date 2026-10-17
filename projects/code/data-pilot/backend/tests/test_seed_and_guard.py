import sqlite3

import pytest

from app.seed import build_database
from app.sqlguard import QueryError, connect_read_only, run_query, strip_noise, validate_sql

from .conftest import sql


# region: seed-tests
def test_the_shop_has_the_expected_shape(db_path):
    assert [r[0] for r in sql(db_path, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")] == ["customers", "order_items", "orders", "products"]
    assert sql(db_path, "SELECT COUNT(*) FROM customers")[0][0] == 60
    assert sql(db_path, "SELECT COUNT(*) FROM products")[0][0] == 24
    assert sql(db_path, "SELECT COUNT(*) FROM orders")[0][0] == 420
    assert {r[0] for r in sql(db_path, "SELECT DISTINCT status FROM orders")} == {"delivered", "shipped", "cancelled", "returned"}
    assert sql(db_path, "SELECT MIN(ordered_on), MAX(ordered_on) FROM orders")[0] == ("2025-11-01", "2026-10-12")


def test_the_same_seed_gives_the_same_shop_and_another_seed_a_different_one():
    def revenue(seed):
        conn = sqlite3.connect(":memory:")
        build_database(conn, seed=seed)
        return conn.execute("SELECT SUM(quantity * unit_price) FROM order_items").fetchone()[0]

    assert revenue(7) == revenue(7) and revenue(7) != revenue(8)


def test_no_orphans_and_prices_match_the_catalogue(db_path):
    assert sql(db_path, "SELECT COUNT(*) FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE c.id IS NULL")[0][0] == 0
    assert sql(db_path, "SELECT COUNT(*) FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.unit_price != p.price")[0][0] == 0
# endregion: seed-tests


# region: guard-tests
ATTACKS = [
    "DELETE FROM orders",
    "UPDATE orders SET status = 'delivered'",
    "DROP TABLE orders",
    "INSERT INTO customers VALUES (999, 'x', 'x', 'x', 'x', 'x')",
    "SELECT 1; DROP TABLE orders",
    "SELECT 1; SELECT 2",
    "PRAGMA table_info(orders)",
    "ATTACH DATABASE 'other.db' AS other",
    "WITH x AS (SELECT 1) DELETE FROM orders",
    "SELECT load_extension('evil')",
    "  ",
]


@pytest.mark.parametrize("query", ATTACKS)
def test_the_text_check_refuses_every_write_and_admin_statement(query):
    with pytest.raises(QueryError):
        validate_sql(query)


def test_keywords_inside_text_and_comments_are_not_mistaken_for_commands():
    assert validate_sql("SELECT name FROM customers WHERE name = 'Delete Me'").startswith("SELECT")
    assert validate_sql("SELECT 1 -- DROP TABLE orders") == "SELECT 1 -- DROP TABLE orders"
    assert validate_sql("SELECT 1; ") == "SELECT 1"                                            # a trailing semicolon is harmless
    assert " ".join(strip_noise("SELECT 'a;b' /* DELETE */ FROM t").split()) == "SELECT '' FROM t"


def test_the_database_connection_itself_refuses_writes_even_if_the_text_check_were_bypassed(db_path):
    conn = connect_read_only(db_path)                                                         # layers 2 and 3, with no layer 1
    for statement in ["DELETE FROM orders", "DROP TABLE orders", "INSERT INTO customers VALUES (999, 'x', 'x', 'x', 'x', 'x')", "PRAGMA writable_schema = 1"]:
        with pytest.raises(sqlite3.Error):
            conn.execute(statement)
    assert conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 420


def test_a_runaway_query_is_stopped_by_the_time_limit(db_path):
    with pytest.raises(QueryError, match="ran for more than"):
        run_query(db_path, "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c", timeout=0.3)


def test_results_are_limited_in_rows_and_say_so(db_path):
    result = run_query(db_path, "SELECT * FROM order_items", max_rows=10)
    assert result.row_count == 10 and result.truncated and len(result.columns) == 5
    assert not run_query(db_path, "SELECT * FROM products LIMIT 5", max_rows=10).truncated


def test_errors_are_written_for_the_model_to_act_on(db_path):
    with pytest.raises(QueryError) as info:
        run_query(db_path, "SELECT nope FROM orders")
    assert "no such column: nope" in info.value.message and "describe_table" in info.value.hint
# endregion: guard-tests
