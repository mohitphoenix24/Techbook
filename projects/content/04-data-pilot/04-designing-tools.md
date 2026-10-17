---
title: Designing tools
level: intermediate
time: 50
summary: Four tools, written as the model will meet them: a clear contract (name, description, JSON schema), results sized for a model's attention, errors that teach, and a second channel of rich data for the browser. The real tools run in your browser.
tags: tool use, JSON Schema, strict, tool results, errors
---

A model never sees your Python. It sees **tool definitions**: a name, a description and a schema for the arguments. Those few lines are its entire understanding of what the tool does. Good tool design is half of agent quality, and it is mostly writing for a very literal, very fast new colleague.

## The contract the model reads

```python src="data-pilot/backend/app/tools.py" region="definitions" title="backend/app/tools.py"
```

Read each definition as the model would:

| Part | What it does | The craft |
|---|---|---|
| `name` | how the model asks for it | short verbs: `run_sql`, `describe_table` |
| `description` | **when and how to use it** | the single most important field. Say what it does, when to prefer it, its limits ("only SELECT", "at most 200 rows"), and what *not* to do |
| `input_schema` | the arguments, as JSON Schema | give every property a description; use `enum` to close choices |
| `strict: true` | guarantees the arguments follow the schema exactly | requires `additionalProperties: false` and every property in `required` |

Choices worth copying:

- `describe_table` takes `"enum": ["customers", "products", "orders", "order_items"]`. The model **cannot** invent a table name; with `strict` the API guarantees it picks one of these.
- The `describe_table` description says *always describe a table before querying it*. Behaviour you want ("check the columns first") belongs in the tool description or the system prompt, not in hope.
- `run_sql` states its dialect ("SQLite") and its preference ("use aggregates instead of fetching raw rows"). Models write better SQL when told which database they are talking to.
- `show_chart` says it refers to the **last** successful query: the model passes only column names, never the data. Do not make a model copy data into arguments; it will make mistakes, and the tokens cost money.

:::tip How many tools?
Fewer is better. Each definition costs tokens on **every** turn, and a long menu makes choosing harder. Four tools here cover the whole job: see the structure (`list_tables`, `describe_table`), ask (`run_sql`), show (`show_chart`). Merge tools that are always used together; split ones that do different jobs.
:::

## Two audiences, two results

When a tool finishes, it has two audiences with different needs:

| Audience | Needs | Gets |
|---|---|---|
| **The model** | a *compact* text it can reason about; every token costs money and attention, on this turn and every later one | `content`: CSV, at most 40 rows, with a note when cut |
| **The browser** | the *full* data to draw a table or chart | `ui`: columns, up to 200 rows, timings, chart points |

```python src="data-pilot/backend/app/tools.py" region="format" title="backend/app/tools.py"
```

That is why `ToolOutput` has three fields:

```python src="data-pilot/backend/app/tools.py" region="output" title="backend/app/tools.py"
```

Sending 200 rows of raw data back to the model on every turn is a classic way to burn money and lose accuracy: models get *worse* at reasoning over long dumps. Return the first rows, say plainly that there are more, and trust the model to aggregate (the tool description told it to).

## Errors that teach

The most important property of a tool is how it **fails**. An exception that crashes the server helps nobody. An error returned as a result lets the model read it and adapt:

| Situation | Bad | Good |
|---|---|---|
| unknown table | `KeyError: 'users'` | `There is no table called 'users'. The tables are: customers, products, orders, order_items.` |
| bad column | a stack trace | `no such column: o.state. Hint: Check table and column names with describe_table.` |
| a write | the data changes | `Only read-only SELECT queries are allowed. Hint: Rewrite it as a SELECT.` |
| too slow | a hung request | `The query ran for more than 2 seconds and was stopped. Hint: add filters...` |

`ToolBox.call` turns every failure into a `ToolOutput(ok=False, content="Error: ... Hint: ...")`. The agent loop sends it back as a `tool_result` with `is_error: true` (lesson 5), and a decent model fixes its own query. Write error messages for the reader who can act on them.

## Run the real tools

This block runs the real `seed.py`, `sqlguard.py` and `tools.py` in your browser. It calls the tools the way the agent does, including three that fail.

```python run src="data-pilot/backend/app/seed.py#imports+schema+data+build,data-pilot/backend/app/sqlguard.py,data-pilot/backend/app/tools.py" flat title="Call the real tools" level=advanced
import os, tempfile

path = os.path.join(tempfile.mkdtemp(), "shop.db")
conn = sqlite3.connect(path); build_database(conn); conn.close()
box = ToolBox(path)

def call(name, **args):
    out = box.call(name, args)
    print(f"\n> {name}({', '.join(f'{k}={v!r}' for k, v in args.items())})   ok={out.ok}")
    print("   model sees:", out.content.replace("\n", "\n              "))
    return out

call("list_tables")
call("describe_table", table="orders")
call("describe_table", table="users")                                    # not a table
out = call("run_sql", query="SELECT status, COUNT(*) AS orders FROM orders GROUP BY status ORDER BY orders DESC")
print("   browser gets:", {k: out.ui[k] for k in ("type", "columns", "row_count")})
call("run_sql", query="SELECT o.state FROM orders o")                    # a wrong column: the error teaches
call("run_sql", query="DELETE FROM orders")                              # refused
call("show_chart", kind="pie", title="Orders by status", x="status", y="orders")        # wrong: the last query failed
call("run_sql", query="SELECT status, COUNT(*) AS orders FROM orders GROUP BY status")
call("show_chart", kind="pie", title="Orders by status", x="status", y="orders")
call("show_chart", kind="bar", title="x", x="status", y="revenue")       # a column that does not exist
```

Notice, in the output, **what the model reads**: compact CSV and one-line errors with hints, never a Python exception. And notice the chart tool's behaviour: the first `show_chart` fails because the last query failed (there is no good result to chart), the second succeeds, and the third names a column that does not exist and gets the list of real columns.

## The toolbox

```python src="data-pilot/backend/app/tools.py" region="toolbox" title="backend/app/tools.py"
```

Three design points in `ToolBox`:

1. **One instance per question** (the route creates it). It remembers the last result so `show_chart` can refer to it, and that memory must never leak between users.
2. **Schema introspection uses a separate, trusted connection**, and only with table names checked against a fixed list. The *model's* SQL always goes through the guard; the *schema* tools never run model-supplied SQL at all.
3. **Unknown tools and bad arguments are results, not crashes.** `strict` makes bad arguments rare, but the loop must still survive a model (or an old cached request) that sends nonsense.

## Tests

```python src="data-pilot/backend/tests/test_tools_agent.py" region="tool-tests" title="backend/tests/test_tools_agent.py"
```

The tests state the design as rules: the tools are strict and closed (the enum), the model reads CSV while the browser gets data, long results are cut *and say so*, table names are checked, **failures are results not exceptions**, and a chart must refer to a real, numeric column of the last result.

:::keypoints
- The description is the most important line of a tool: when to use it, its limits, what not to do.
- Close choices with `enum`, set `strict: true`, and never make the model copy data into arguments.
- Return a compact text for the model and the full data for the browser: two audiences, two results.
- Cut long results for the model and say so; models reason worse over long dumps.
- Failures are results with a message and a hint, so the model can fix its own mistake.
- One ToolBox per question; model SQL always goes through the guard; fewer tools are better.
:::

```quiz
? Why does `describe_table` use an enum for the table name?
- Enums are faster
+ The model cannot invent a table that does not exist, and strict mode guarantees it picks a listed one
- SQLite requires it
> Closed choices remove a whole class of errors before they happen.
? A query returns 5,000 rows. What does the model receive?
- All 5,000 rows
+ The first 40 rows as CSV plus a note that there are more
- Nothing
> Every row costs tokens on every later turn, and long dumps reduce accuracy. The browser still gets up to 200 rows to display.
? A tool raises a Python exception. What is the problem?
- Exceptions are slow
+ The model never learns what went wrong; return the failure as a result with a hint so it can adapt
- Nothing: exceptions are fine
> Errors are information for the model. Turn them into readable results.
```

:::exercise Add a tool
Add `top_n_by(table, group_column, value_expression, n)` as a *new* tool that builds the `GROUP BY` query itself from a **closed set** of allowed tables and columns (an allow-list dictionary), so the model cannot write SQL at all for the common case. Write its schema with enums, and a test. What are the trade-offs between this restricted tool and the free-form `run_sql` (hint: safety against flexibility)? In which products would you offer only the restricted tool?
:::
