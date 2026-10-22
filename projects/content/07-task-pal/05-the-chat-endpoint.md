---
title: The chat endpoint
level: easy
time: 35
summary: Turn the agent's events into a Server-Sent Events stream with FastAPI, so the browser can show every step as it happens. How the no-key case is handled honestly, why the server keeps no conversation, and how the checkbox and the agent share one store.
tags: FastAPI, Server-Sent Events, streaming, async generators, dependencies
---

The loop (lesson 4) is an *async generator*: it `yield`s a small dictionary each time something happens. The endpoint's job is to turn each dictionary into one Server-Sent Event and send it to the browser straight away. You met SSE in Pocket Chat; here the events describe **steps** instead of words.

## The events

| Event | When | Carries |
|---|---|---|
| `step` | a model call begins | the step number |
| `note` | Claude wrote text before asking for a tool | the text |
| `tool_call` | Claude asked for a tool | `id`, `name`, `input` |
| `tool_result` | the tool finished | `id`, `ok`, a short `summary`, `changed` |
| `done` | Claude answered | the `answer`, the step count, tokens and cost |
| `error` | something stopped the run | a `code`, a `message`, `retryable` |

Every run ends with exactly one `done` **or** one `error`. The browser relies on that to know when to stop spinning.

## SSE in six lines

```python src="task-pal/backend/app/sse.py" region="format" title="backend/app/sse.py"
```

An event is two lines of text and a blank line. The runnable block shows what the browser receives for a short run:

```python run src="task-pal/backend/app/sse.py" title="What goes over the wire" level=easy
events = [
    {"type": "step", "step": 0},
    {"type": "tool_call", "step": 0, "id": "toolu_1", "name": "add_task", "input": {"title": "Call mum"}},
    {"type": "tool_result", "id": "toolu_1", "name": "add_task", "ok": True, "summary": "added #1", "changed": True},
    {"type": "done", "answer": "Done. I added Call mum.", "steps": 2},
]
for e in events:
    print(sse(e.pop("type"), e), end="")          # the event's name goes in the `event:` line, the rest is JSON
```

```output
event: step
data: {"step": 0}

event: tool_call
data: {"step": 0, "id": "toolu_1", "name": "add_task", "input": {"title": "Call mum"}}

event: tool_result
data: {"id": "toolu_1", "name": "add_task", "ok": true, "summary": "added #1", "changed": true}

event: done
data: {"answer": "Done. I added Call mum.", "steps": 2}
```

## The route

```python src="task-pal/backend/app/main.py" region="chat-route" title="backend/app/main.py"
```

Four decisions to notice:

1. **No key, no pretend.** If there is no client, the stream is a single `error` event that says exactly what to do. The page loads, `/api/health` says `has_key: false` (the browser uses that to show the yellow banner), and nothing is faked.
2. **A new `ToolBox` for every request.** It is cheap, and it means the tools can never leak state from one request into the next. (The *store* is shared, on purpose: it is the app's data.)
3. **`event.pop("type")`.** The loop's dictionaries carry their own `type`; the route turns it into the SSE event name and sends the remaining fields as the data.
4. **`today_in(tz)` is a function, not a date.** The toolbox calls it each time `get_today` runs. A date computed at startup would be wrong after midnight. The time zone is a setting, because "today" in Pune is not "today" in London.

The response is a `StreamingResponse` with `text/event-stream` and headers that tell proxies not to cache or buffer it, so each event reaches the browser the moment it is written.

:::note The server keeps no conversation
The browser sends the earlier turns with every message (lesson 4). The server stores nothing about chats, so you can run two copies of it behind a load balancer and any request can go to either. The only state is the task list, in the database, which is where it belongs.
:::

## The other routes

The task board needs the list, and the tick-box needs a way to change one task:

```python src="task-pal/backend/app/main.py" region="tasks-routes" title="backend/app/main.py"
```

These use the **same `TaskStore` object** the agent's tools use, so a task you tick in the browser is a task the agent sees as done on its next `list_tasks`, and a task the agent adds shows up on the board. There is one source of truth.

Here is the real app answering those routes (a new in-memory database, no API key, and a task added straight through the store):

```python local verify cwd="task-pal/backend" title="The task routes"
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app

settings = Settings(anthropic_api_key=None, database_path=":memory:", frontend_dist="nope", _env_file=None)
with TestClient(create_app(settings)) as client:
    print("empty board:", client.get("/api/tasks").json())
    client.app.state.store.add("Call mum", "2026-10-23")                 # what the agent's add_task does
    print("after an add:", client.get("/api/tasks").json())
    print("tick it:", client.patch("/api/tasks/1", json={"done": True}).json())
    print("unknown id:", client.patch("/api/tasks/9", json={"done": True}).status_code)
    print("bad body:", client.patch("/api/tasks/1", json={"done": "maybe"}).status_code)
    print("empty message:", client.post("/api/chat", json={"message": ""}).status_code)
```

```output
empty board: []
after an add: [{'id': 1, 'title': 'Call mum', 'due': '2026-10-23', 'priority': 'normal', 'done': False}]
tick it: {'id': 1, 'title': 'Call mum', 'due': '2026-10-23', 'priority': 'normal', 'done': True}
unknown id: 404
bad body: 422
empty message: 422
```

Notice the two `422` responses: FastAPI validates every body against the Pydantic model (`ChatRequest`, `TaskPatch`) before our code runs, so an empty message or a `done` that is not a boolean never reaches the agent.

## The request model

```python src="task-pal/backend/app/schemas.py" region="chat-request" title="backend/app/schemas.py"
```

Every limit is deliberate: a message of at most 1,000 characters, at most 20 earlier turns of at most 4,000 characters each. They bound what one request can cost. A client that sends a million-character history should get a `422`, not a bill.

## Tests

```python src="task-pal/backend/tests/test_api.py" region="nokey-test" title="backend/tests/test_api.py"
```

The rest of `test_api.py` covers the health route, the validation limits, that the task routes share the agent's store, and the tick-box. Note what is *absent*: no test calls the model. The route is tested where it is deterministic (no key, bad input, shared store); how Claude behaves is checked by using the app.

:::keypoints
- The endpoint turns each event from the loop into one SSE event, sent immediately. Every run ends in exactly one `done` or `error`.
- With no key the stream is one honest `error` event; the app never pretends.
- One `ToolBox` per request keeps tools stateless; the store is the shared state.
- The server keeps no conversation: the browser sends earlier turns, which makes the server easy to scale.
- Validate every request body with Pydantic and bound its size. Limits are cost control.
:::

```quiz
? Why does the route create a new ToolBox for each request?
+ So tools cannot carry state from one request into another
- Because ToolBox cannot be reused in Python
- To make requests slower
> Fresh, cheap objects per request avoid a whole class of leaks and races. Shared data belongs in the store.
? What does the browser receive when no API key is set?
- A made-up answer
- Nothing; the connection hangs
+ One error event saying the key is missing
> Honest failure is part of the design.
? Why is `today_in(tz)` a function that returns a function?
- Python requires it
+ So the date is worked out when the tool runs, not once at start-up (it would go stale after midnight)
- To hide the time zone
> Anything about "now" must be computed late.
```

:::exercise Cancel properly
When the user presses Stop, the browser closes the connection and Starlette cancels the generator at its next `await`. Where in `run_agent` could that happen, and is anything left half-done? (Think about a tool that has run but whose result was never sent back.) Why is that safe for TaskPal, and why might it not be for an agent that sends emails?
:::
