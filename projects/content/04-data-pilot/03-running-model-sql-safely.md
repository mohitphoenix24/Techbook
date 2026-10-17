---
title: Running model-written SQL safely
level: intermediate
time: 50
summary: Four independent layers (a text check, a read-only connection, a database-level authoriser, and time and row limits) so that a wrong or manipulated model cannot damage the data. Every attack runs live in your browser.
tags: security, SQL, read-only, guardrails, defence in depth
---

The moment a model can write SQL, you are running **code written by something you do not fully control**. It may be wrong. It may be tricked by a sentence hidden in the data it reads. It may simply try something enthusiastic: "to answer this, let me clean up the table first".

You cannot make a model perfectly safe. You *can* make the **environment** safe, so that even a model that tries something destructive cannot succeed.

## What could go wrong

| Threat | Example | Result without protection |
|---|---|---|
| Writes | `DELETE FROM orders WHERE status = 'cancelled'` | data lost |
| Schema changes | `DROP TABLE customers` | data lost |
| Hidden statements | `SELECT 1; DROP TABLE orders` | the second statement runs |
| Writes inside a read | `WITH x AS (SELECT 1) DELETE FROM orders` | data lost |
| Reaching out | `ATTACH DATABASE '/etc/passwd' AS x`, `load_extension(...)` | files or code reached |
| Runaway cost | an accidental cross join of two large tables, or an endless recursive query | the server is stuck for minutes |
| Flooding | `SELECT * FROM order_items` on a table with 50 million rows | memory exhausted, and a huge, expensive tool result for the model |

## Defence in depth

No single check is trustworthy on its own: text filters can be bypassed, and software has bugs. So we stack **independent** layers, each of which would stop most mistakes by itself:

```viz algo=arch title="Four layers between the model's SQL and the data" dir=right
sql   Model's SQL | untrusted [prompt] @0,0
l1    1 Text check | one SELECT, no write words [filter] @1,0
l2    2 Read-only connection | mode=ro, query_only [lock] @2,0
l3    3 Authoriser | SQLite refuses writes [guard] @3,0
l4    4 Limits | time and rows [clock] @4,0
db    Data | safe [db] @5,0
--
sql -> l1
l1 -> l2
l2 -> l3
l3 -> l4
l4 -> db
```

## Layer 1: the text check

Cheap, fast, and with the best error messages. It only allows a single `SELECT` (or `WITH ... SELECT`) statement and refuses a list of write and admin keywords.

```python src="data-pilot/backend/app/sqlguard.py" region="text-check" title="backend/app/sqlguard.py"
```

The subtle part is `strip_noise`: before looking for keywords it removes **comments** and the **contents of string literals**. Without that, `WHERE name = 'Delete Me'` would be refused (a false alarm), and `SELECT 1 -- DROP TABLE` would hide... nothing, but a naive check could be fooled the other way too. The check is applied to the *code* of the query, not to text inside it.

:::warn Why a text check is never enough
Parsing SQL with regular expressions is a famously leaky business. Different databases have different syntax, Unicode tricks and odd constructs exist, and the next feature someone adds may open a gap. Treat layer 1 as a courtesy that gives the model a clear, early error. **Never** let it be the only protection.
:::

## Layers 2 and 3: the database says no

These layers do not read the SQL at all. They change what the *connection* is allowed to do.

```python src="data-pilot/backend/app/sqlguard.py" region="authoriser" title="backend/app/sqlguard.py"
```

```python src="data-pilot/backend/app/sqlguard.py" region="connect" title="backend/app/sqlguard.py"
```

- **`mode=ro`** opens the database file read-only, so the operating system refuses any write.
- **`PRAGMA query_only = ON`** makes SQLite itself refuse to change anything.
- **The authoriser** is a function SQLite calls for *every operation a statement wants to perform*: reading a column, calling a function, creating a table, writing a row. We return `OK` only for `SELECT`, reads, and functions (except `load_extension`), and `DENY` for everything else. A `DELETE` hidden inside a CTE is just another `DELETE` operation to SQLite, so it is denied no matter how it was disguised.

The project's test proves layers 2 and 3 work **on their own**, by skipping layer 1 entirely:

```python src="data-pilot/backend/tests/test_seed_and_guard.py" region="guard-tests" title="backend/tests/test_seed_and_guard.py"
```

## Layer 4: limits

A read-only query can still do damage: it can run forever or return the whole table.

```python src="data-pilot/backend/app/sqlguard.py" region="run" title="backend/app/sqlguard.py"
```

- **Time:** `set_progress_handler` makes SQLite call our function every 10,000 virtual-machine steps. When the deadline passes we return non-zero, and SQLite **aborts** the query with an "interrupted" error, which we turn into advice ("add filters, remove a join").
- **Rows:** `fetchmany(max_rows + 1)` asks for one row more than allowed. If we get it, we know the result was **truncated** and tell the caller, instead of silently pretending that 200 rows were all there was.
- **Errors for a reader who can act:** every failure becomes a `QueryError` with a message *and a hint* ("Check table and column names with describe_table"). The model reads this and tries again; it is the heart of self-correction (lesson 5).

## Try to break it

The block below builds the shop and then throws safe queries and attacks at the **real** `run_query`. Add your own attacks at the bottom of the list. Then look at the second part, which goes *around* the text check and attacks the connection directly.

```python run src="data-pilot/backend/app/seed.py#imports+schema+data+build,data-pilot/backend/app/sqlguard.py" title="Attack the guard" level=advanced
import os, tempfile

path = os.path.join(tempfile.mkdtemp(), "shop.db")
conn = sqlite3.connect(path)
build_database(conn)
conn.close()

QUERIES = [
    ("a normal query", "SELECT status, COUNT(*) AS n FROM orders GROUP BY status ORDER BY n DESC"),
    ("a name that looks like a command", "SELECT COUNT(*) FROM customers WHERE name = 'Delete Me'"),
    ("DELETE", "DELETE FROM orders WHERE status = 'cancelled'"),
    ("two statements", "SELECT 1; DROP TABLE orders"),
    ("write hidden in a CTE", "WITH x AS (SELECT 1) DELETE FROM orders"),
    ("PRAGMA", "PRAGMA writable_schema = 1"),
    ("ATTACH a file", "ATTACH DATABASE 'other.db' AS other"),
    ("endless loop", "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c"),
    ("far too many rows", "SELECT * FROM order_items"),
    ("a mistake, not an attack", "SELECT nope FROM orders"),
]
print(f"{'what':<34}result")
for label, sql in QUERIES:
    try:
        r = run_query(path, sql, max_rows=50, timeout=0.4)
        print(f"{label:<34}ALLOWED: {r.row_count} rows{' (truncated)' if r.truncated else ''}, first row {r.rows[0] if r.rows else None}")
    except QueryError as e:
        print(f"{label:<34}BLOCKED: {e.message}")

print("\nNow skip the text check and attack the connection itself (layers 2 and 3):")
raw = connect_read_only(path)
for statement in ["DELETE FROM orders", "DROP TABLE orders", "INSERT INTO products VALUES (99, 'x', 'x', 1, 1)", "PRAGMA writable_schema = 1"]:
    try:
        raw.execute(statement)
        print(f"  {statement:<52}RAN (this must never print)")
    except sqlite3.Error as e:
        print(f"  {statement:<52}refused by SQLite: {e}")
print("  orders still has", raw.execute("SELECT COUNT(*) FROM orders").fetchone()[0], "rows")
```

Two things to notice. The **endless loop** is stopped by the time limit after 0.4 seconds, not by any keyword check (there is no keyword to find). And the second half shows that **even if layer 1 had a bug**, SQLite itself refuses every write.

## In production, with a bigger database

SQLite makes the layers easy to see. The same principles apply to PostgreSQL or MySQL, with their own tools:

| Layer | In a real database |
|---|---|
| Read-only | a **dedicated database user** with `SELECT` rights only, on a **read replica**, never your primary |
| Least privilege | grant access to **views** that hide sensitive columns (emails, phone numbers, card numbers), not to the raw tables |
| Row-level security | policies so a user only ever sees their own organisation's rows |
| Time | `statement_timeout`; also a limit on concurrent queries per user |
| Rows | `LIMIT` enforced by the tool, as here |
| Audit | log every query the agent ran, with who asked |

:::keypoints
- A model that can write SQL is running untrusted code. Make the environment safe, not just the prompt.
- Stack independent layers: a text check (clear errors), a read-only connection, a database-level authoriser, time and row limits.
- A text check cannot be the only layer; the database itself must refuse writes.
- Strip comments and string contents before looking for keywords.
- Limits protect cost: abort slow queries, cap rows, and tell the caller when a result was truncated.
- Errors should say what was wrong *and* what to do, because the model reads them and retries.
:::

```quiz
? Why keep the text check if the database already refuses writes?
- It is not needed; remove it
+ It gives the model an early, clear message in plain words, and costs nothing; it just must not be the only layer
- Because SQLite cannot refuse writes
> Defence in depth: the text check helps the model correct itself, while the connection layers guarantee safety.
? An endless recursive query is submitted. Which layer stops it?
- The text check
- The read-only connection
+ The time limit (a progress handler that aborts the query)
> There is nothing "forbidden" in the text. Only a deadline can stop a query that is allowed but never finishes.
? Why fetch max_rows + 1 rows?
- To make the query faster
+ Getting one extra row proves the result was longer than the limit, so we can report truncation honestly
- Because SQLite starts counting at 1
> Without it, a result of exactly the limit and a longer one look the same.
```

:::exercise Hide a column
Add a `phone` column to `customers` (just a made-up number). Make sure the agent can never see it: change `describe_table` and the query path so that a query touching `phone` is refused (hint: the authoriser receives the column name for every `SQLITE_READ`, as `arg2`; deny the read when `arg1 == "customers"` and `arg2 == "phone"`). Write a test. Why is this stronger than telling the model in the prompt "do not look at phone numbers"?
:::
