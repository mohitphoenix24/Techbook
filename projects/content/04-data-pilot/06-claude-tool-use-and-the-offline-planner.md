---
title: Claude tool use and the offline planner
level: intermediate
time: 50
summary: One interface, two models. The real Claude client (streaming, strict tools, effort, errors) and an offline planner that behaves like an agent without being one, so the whole project runs and is tested with no key. The planner runs live in your browser.
tags: Claude API, streaming, tool use, effort, mock, testing
---

The loop (lesson 5) talks to a model through one tiny interface. Behind it we put two implementations: the real **Claude** client, and an **offline planner** that needs no key, no network and no money. This lesson shows both, and is honest about what the offline one is.

## The interface

```python src="data-pilot/backend/app/llm/base.py" region="turn,protocol" title="backend/app/llm/base.py"
```

A model, for the loop, is anything with a `turn` method. It streams `TextDelta` pieces and then yields exactly one `TurnDone` that holds:

| Field | Used for |
|---|---|
| `text` | the words, for the answer or the "thinking aloud" before tool calls |
| `tool_uses` | what the model wants us to run (empty means it is finished) |
| `stop_reason` | `tool_use` or `end_turn` |
| `usage` | tokens in and out, for cost |
| `content` | the raw blocks, to send back **unchanged** on the next request |

## The real client

```python src="data-pilot/backend/app/llm/anthropic_client.py" region="client" title="backend/app/llm/anthropic_client.py"
```

Take it line by line:

- **`AsyncAnthropic(max_retries=2)`**: the SDK retries rate limits and transient server errors with backoff by itself. We do not write that loop.
- **`messages.stream(...)`** with `tools=` and `system=`: the response arrives as a stream. `stream.text_stream` gives the text pieces as they are generated; we pass each on as a `TextDelta`. This is what makes the answer appear word by word in the browser.
- **`get_final_message()`** waits for the end and returns the complete message, with the finished `tool_use` blocks (their JSON arguments are only complete at the end, so we do not act on half a tool call).
- **`output_config={"effort": ...}`** tunes how much thinking and tool use the model spends: `low` for quick lookups, `high` for deeper investigation. For a data agent, `medium` is a sensible default; raise it if you see the model giving up too early on hard questions.
- **`stop_reason`** is checked for `refusal` and `max_tokens`. A refusal is not a failure of ours and a cut-off answer is not an answer: both become clear `LLMError`s, so the user sees a message instead of half a sentence presented as final.
- **`content=list(final.content)`** is the important one. We return the model's own blocks, so the next request replays exactly what it produced. (Rewriting or dropping blocks breaks the link between a `tool_use` and its result, and loses any internal state the model attached.)
- **No tool-argument parsing code.** The tools are `strict`, so the arguments always match the schema; `b.input` arrives as a ready dict.

The model name comes from settings (`LLM_MODEL`, default `claude-sonnet-5-5`), never from the code, so you can change models without a deploy.

### Errors, in the user's language

```python src="data-pilot/backend/app/llm/anthropic_client.py" region="errors" title="backend/app/llm/anthropic_client.py"
```

Provider errors differ in what the user (or your code) should do about them. `translate_error` maps SDK exceptions to a small set of codes:

| Code | Cause | Retryable? | The user is told |
|---|---|---|---|
| `auth` | bad key | no | check the key |
| `rate_limited` | too many requests | yes | try again in a moment |
| `network` | cannot reach the provider | yes | could not reach it |
| `provider_down` | 5xx | yes | the provider had a problem |
| `bad_request` | anything else | no | the request was rejected |

The `retryable` flag travels with the `error` event, so the interface can offer a "Try again" button only when it makes sense.

## Testing the real client without calling it

The adapter has its own tests, and they use the **real SDK** against a tiny fake server that speaks Anthropic's streaming format over HTTP (`base_url` points at it):

```python src="data-pilot/backend/tests/test_anthropic_adapter.py" region="adapter-tests" title="backend/tests/test_anthropic_adapter.py"
```

This is stronger than mocking the SDK. The SDK really parses the stream, and the test checks what was **sent** (tools in order, `strict: true`, the system prompt, the effort) as well as what was understood. It runs a whole two-turn agent through it, including the second request's `tool_result`. What it cannot prove is that the real model *chooses well*, which is what evals are for (lesson 9).

## The offline planner

Everyone should be able to run this project on a train with no API key. So there is a second model, and it needs a careful sentence of honesty:

:::warn What the offline model is, and is not
It is **not** a language model. It cannot understand an unusual question. It matches your question to about a dozen **templates** ("top customers", "revenue by month", "orders by status"...) and fills in a few details (like the number in "top 7"). Anything else gets a polite "I could not match this question".

What it does faithfully is behave like an **agent**: it reads the conversation so far (the question, the tools already called, their results) and decides the next move. That is exactly the loop a real model runs, so the loop, the tools, the guard, the streaming and the interface are all exercised honestly.
:::

Its function is `plan_next(messages)`, a pure function from conversation to next step. The deciding part is short:

```python src="data-pilot/backend/app/llm/mock_planner.py" region="plan" title="backend/app/llm/mock_planner.py"
```

Read the numbered comments: **look at the tables, run the query, if it failed read the error and fix it (and give up after three attempts), chart it, answer from the data**. The final answer is written from the rows that the tool actually returned, which is why even this fake never invents a number.

Each question template is data, not code:

```python src="data-pilot/backend/app/llm/mock_planner.py" region="intents" title="backend/app/llm/mock_planner.py"
```

A pattern to recognise the question, the tables to describe, a function that builds the SQL (always with the revenue rule), a chart and a summary. Adding a question to the offline model is adding one `Intent`.

### Making it fail on purpose

For testing and demos, `hints={"simulate_mistake": "wrong_column"}` makes the planner's *first* query reference a column that does not exist, and `"unsafe"` makes it try `DELETE FROM orders`. A real model does this by accident now and then; the planner does it on request, so you can watch the system cope without waiting for a bad day.

Wrapped in the same interface, it also streams word by word, with a small delay, and estimates token counts from text length, so the cost display works too:

```python src="data-pilot/backend/app/llm/mock_client.py" region="mock" title="backend/app/llm/mock_client.py"
```

And one function chooses which model to use, from configuration:

```python src="data-pilot/backend/app/llm/factory.py" title="backend/app/llm/factory.py"
```

No key means the offline planner; a key means Claude (or force either with `LLM_PROVIDER`). Nothing else in the application knows which one it has.

## Run the whole agent offline

The real agent, tools, guard and database, with the offline planner as the model, in your browser. The second question makes a mistake first, the third tries something unsafe, and the last one it cannot understand.

```python run src="data-pilot/backend/app/seed.py#imports+schema+data+build,data-pilot/backend/app/sqlguard.py,data-pilot/backend/app/tools.py,data-pilot/backend/app/llm/base.py,data-pilot/backend/app/prompts.py,data-pilot/backend/app/agent.py,data-pilot/backend/app/pricing.py,data-pilot/backend/app/llm/mock_planner.py,data-pilot/backend/app/llm/mock_client.py" flat title="The offline agent" level=advanced
import asyncio, os, tempfile

path = os.path.join(tempfile.mkdtemp(), "shop.db")
conn = sqlite3.connect(path); build_database(conn); conn.close()


async def ask(question, hints=None, history=()):
    print(f"\n=== {question}" + (f"   [{hints['simulate_mistake']} on purpose]" if hints else ""))
    llm = MockClient(delay_ms=0)
    async for e in run_agent(llm, ToolBox(path), question, list(history), hints=hints):
        if e["type"] == "tool_call":
            sql = e["input"].get("query") or e["input"]
            print(f"  call   {e['name']}  {str(sql)[:88]}")
        elif e["type"] == "tool_result":
            print(f"  result {'ok   ' if e['ok'] else 'ERROR'} {e['summary'][:88]}")
        elif e["type"] == "done":
            print(f"  ANSWER {e['answer']}")
        elif e["type"] == "error":
            print(f"  STOPPED {e['message']}")


async def main():
    await ask("Who are the top 3 customers by revenue?")
    await ask("Show revenue by category", {"simulate_mistake": "wrong_column"})
    await ask("What is our total revenue?", {"simulate_mistake": "unsafe"})
    await ask("Why is the sky blue?")

asyncio.run(main())
```

Compare with the loop in lesson 5. Same events, same tools; only the voice behind them is a template instead of a language model. In the second question you can watch the **self-correction**: the first query fails with "no such column", the error returns as a result, and the planner writes a corrected query. In the third, the `DELETE` is refused by the guard (lesson 3) and the planner reports it honestly instead of pretending it worked.

:::note Why bother with a fake?
Because the interesting engineering in an agent is everything *except* the model, and you want to test it a hundred times a day for free, deterministically. Use the real model for judgement (evals, a handful of end-to-end checks); use a fake for plumbing. The two are connected by one small interface, and that is the whole trick.
:::

## Tests

```python src="data-pilot/backend/tests/test_planner.py" region="planner-tests" title="backend/tests/test_planner.py"
```

The planner is tested like any pure function: the plan follows describe, then query; a failed query is corrected and not repeated forever; unfamiliar questions are *not guessed*.

:::keypoints
- The loop needs one thing from a model: stream text, then one finished turn with its tool requests, stop reason, usage and raw content.
- With the real client: `messages.stream`, strict tools, `get_final_message`, the `effort` setting, and return the model's content unchanged.
- Check for refusals and truncation; translate provider errors into a few codes with a `retryable` flag.
- Test the adapter with the real SDK against a fake server, and check what was *sent*.
- An offline planner behaves like an agent (look, query, fix, chart, answer from data) without being one. Say so plainly.
- One factory chooses the model from configuration; nothing else knows which.
:::

```quiz
? Why return `final.content` unchanged as the assistant message?
- It is shorter than rebuilding it
+ The next request must replay exactly what the model produced, so tool_use ids match their results
- The API charges less
> Altering the blocks can break the link to tool results and lose state the model attached to its own turn.
? What is the offline planner good for?
- Replacing the real model in production
+ Testing and demonstrating the loop, tools, guard, streaming and interface deterministically and for free
- Answering any question about the data
> It handles a dozen templates only; evals and a few real calls judge model quality.
? A turn ends with stop_reason "max_tokens". What should the client do?
- Treat the partial text as the answer
+ Raise a clear error: a cut-off answer is not a finished one
- Ignore it
> Showing half an answer as if it were complete is worse than saying it was cut off.
```

:::exercise Add a question
Add a new `Intent` to the planner: "average order value by channel" (join orders and order_items, apply the revenue rule, group by `o.channel`, divide by the number of distinct orders). Write the SQL, a chart (`bar`), a one-line summary function, and add a row to the parametrised test in `test_planner.py`. Then ask it through the running app. What did you have to know about the data that a real model would have to *discover* with `describe_table`?
:::
