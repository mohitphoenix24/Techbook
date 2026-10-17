---
title: History, storage and the token budget
level: easy
time: 35
summary: Store conversations in SQLite, rebuild the history for every request, and trim it to a token budget so long chats stay fast and affordable.
tags: SQLite, history, token budget, context window
---

A model has no memory, so **your server is the memory**. Each time the user sends a message, the server must load the earlier ones and send them again. This lesson builds the storage and the trimming that keeps that affordable.

## Why SQLite

SQLite is a full SQL database in a single file, with no server to install. Python includes a driver (`sqlite3`). It is the right choice for a learning project and for many small production services. When you outgrow it (many writers at once, several servers), the same SQL moves to PostgreSQL with little change.

## Step 1: the schema

Two tables: a conversation has many messages.

```python src="pocket-chat/backend/app/db.py" region="schema" title="backend/app/db.py"
```

Points to notice:

- `role TEXT NOT NULL CHECK (role IN ('user', 'assistant'))`: the database itself refuses a nonsense role. Constraints are free, tireless validators.
- `ON DELETE CASCADE`: deleting a conversation deletes its messages. (SQLite needs `PRAGMA foreign_keys = ON` on **every connection** for this to work; the store sets it.)
- Each assistant message stores `input_tokens`, `output_tokens` and `cost_usd`, so cost can be shown later without recomputing.
- `stopped` records that a reply was cut short by the user.
- The index on `(conversation_id, id)` makes "all messages of this conversation, in order" fast.

## Step 2: a small store class

Routes should not contain SQL. A `Store` class holds all of it, so the rest of the app talks in plain Python values.

```python src="pocket-chat/backend/app/db.py" region="crud" title="backend/app/db.py"
```

The `_connect` helper (see the full file in the [source explorer](#/code/pocket-chat/backend/app/db.py)) opens a connection per operation and uses `with db:` so the change is **committed on success and rolled back on error**. Opening a SQLite connection is cheap, and one connection per call avoids sharing a connection between threads, which SQLite forbids by default. Always pass values as `?` parameters, never by building SQL strings: that is how SQL injection is prevented.

Here is the store in action, using a temporary database:

```python local verify cwd="pocket-chat/backend" title="Using the store"
import os, tempfile
from app.db import Store

store = Store(os.path.join(tempfile.mkdtemp(), "demo.db"))
cid = store.create_conversation("How do decorators work?", persona="tutor")
store.add_message(cid, "user", "How do decorators work?")
store.add_message(cid, "assistant", "A decorator wraps a function...", input_tokens=18, output_tokens=7, cost_usd=0.0001)

for m in store.messages(cid):
    print(m["role"], "|", m["content"][:30], "|", m["output_tokens"], "tokens")
print([c["title"] for c in store.list_conversations()])
print("deleted:", store.delete_conversation(cid), "| left:", len(store.list_conversations()))
```

```output
user | How do decorators work? | 0 tokens
assistant | A decorator wraps a function.. | 7 tokens
['How do decorators work?']
deleted: True | left: 0
```

## Step 3: the history is everything stored so far

In `chat_events` the history is simply the stored messages, in order:

```python
history = [{"role": m["role"], "content": m["content"]} for m in store.messages(conversation_id)]
```

Because the *server* builds it from its own database, the browser cannot forge earlier turns. It only sends the new message and a conversation ID.

## Step 4: the token budget

Left alone, history only grows, and so does every request. Two costs rise together: **money** (you pay for input tokens every turn) and **latency** (more input is slower), until you hit the model's context window and the request fails. So we trim.

:::def Context window
The maximum number of tokens (input plus output) a model can handle in one request. For the Claude 5.5 models it is very large (1 million tokens), but you still pay for every token you send, and long contexts are slower. A budget is about cost and speed, not only about fitting.
:::

First a cheap way to count tokens:

```python src="pocket-chat/backend/app/context.py" region="estimate" title="backend/app/context.py"
```

Four characters per token is an approximation for English; other languages (Hindi, Chinese) use more tokens per character. It is fine for budgeting. When you need an exact count, the API can count for you (`client.messages.count_tokens`).

Then the trimming rule. **Play with it:** the block below is the real function from the project. Change the budget, the messages or the roles and run it.

```python run src="pocket-chat/backend/app/context.py" region="imports,estimate,trim" title="Trim playground (the real trim_history)" level=easy
chat = [
    {"role": "user", "content": "Hi! I am planning a trip to Jaipur in December."},
    {"role": "assistant", "content": "Lovely! December is pleasant. Do you prefer forts, food or shopping?"},
    {"role": "user", "content": "Forts, mostly. And I travel with my parents, so not too much walking."},
    {"role": "assistant", "content": "Amber Fort has an elephant-free jeep route, and Nahargarh is easy by car."},
    {"role": "user", "content": "Great. What should I book first?"},
]

for budget in (200, 60, 30, 8):
    kept, dropped = trim_history(chat, budget)
    print(f"budget {budget:>3}: kept {len(kept)} message(s), dropped {dropped}; first kept role = {kept[0]['role']}")
```

Run it with a budget of `30` and notice the rules at work:

1. We walk **backwards** from the newest message, so recent context survives and old context is dropped first.
2. The newest message is **always** kept, even if it alone exceeds the budget (otherwise the user's question would vanish).
3. The result must **start with a `user` message**, because the API requires it, so a leftover assistant reply at the front is dropped too.

The route reports how many messages were dropped in the `meta` event (`history_dropped`), and the UI shows a small notice. Silent forgetting confuses users, so tell them.

:::tip Better memory strategies (all build on this)
Trimming is the simplest strategy. When it is not enough: **summarise** old messages into one short note and keep it at the top; **pin** the first message (the user's goal); keep **facts** the user told you in a small profile; or retrieve only the relevant old messages (that is RAG, Project 3). Prompt caching can also make a long, stable prefix much cheaper.
:::

## Step 5: the conversation endpoints

The remaining routes are plain CRUD: list, read, delete. They are short, so here is the whole file:

```python src="pocket-chat/backend/app/routes/conversations.py" title="backend/app/routes/conversations.py"
```

Two FastAPI habits show up here: `response_model` documents and filters what is returned, and `status_code=204` on delete says "success, no body" (the front end's `request()` helper knows not to call `.json()` on a 204).

## Step 6: a test for the rules

```python src="pocket-chat/backend/tests/test_context.py" title="backend/tests/test_context.py"
```

Each test name states a rule. When a rule changes, you change one test and one function, and the failing test tells you if you forgot the other.

:::keypoints
- The server owns the conversation: SQLite stores it, and the server rebuilds the history for every request.
- Constraints, foreign keys and indexes make the database itself help you keep data correct.
- Always use `?` parameters; keep SQL inside a `Store` class.
- Trim history by walking backwards from the newest message: keep the newest, drop the oldest, start on a `user` turn.
- Estimate tokens at about four characters each; tell the user when history was dropped.
:::

```quiz
? Why does `trim_history` always keep the newest message even if it is over budget?
- To save money
+ Without it the user's current question would disappear from the request
- The API requires exactly one message
> The newest message is the thing being answered; dropping it would make the call meaningless.
? Why must a trimmed history start with a user message?
- Python lists must start with a user
+ The Messages API requires the first message to have the role "user"
- Assistant messages are not stored
> If the cut leaves an assistant reply at the front, it is dropped too so the request is valid.
? How do you prevent SQL injection in the Store?
- Escape quotes by hand
+ Pass values as ? parameters instead of building SQL strings
- Use a longer password
> Parameters are sent separately from the SQL text, so user data can never change the query.
```

:::exercise Summarise instead of dropping
Change the idea: instead of dropping old messages, replace them with one message, `"Summary of earlier conversation: ..."`. Write a pure function `summarise_dropped(dropped, summarise)` that takes the dropped messages and a function that turns text into a short summary (for the mock you can return the first 80 characters of each). Where would the summary go: as a user message, or in the system prompt? What are the trade-offs?
:::
