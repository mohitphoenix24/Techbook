---
title: Testing and hardening
level: easy
time: 35
summary: What the 28 back-end tests and 17 front-end tests protect you from, an end-to-end test in a real browser, and the guard rails (limits, rate limiting, logging) that make an AI endpoint safe to expose.
tags: pytest, vitest, Playwright, rate limiting, logging
---

An AI app that "worked when I tried it" is a demo. This lesson turns Pocket Chat into something you can change without fear, and then puts guard rails around the one expensive endpoint it has.

## The test pyramid for an AI app

```viz algo=arch title="Five kinds of test, from cheap to broad" dir=down
unit  Pure functions | trim_history, sse(), reducer [list] @0,0
route API routes | TestClient + the offline model [service] @1,0
sdk   Claude adapter | the real SDK vs a fake server [llm] @2,0
ui    UI logic | vitest: SSE parser, reducer [browser] @3,0
e2e   Whole app | a real browser, React + FastAPI [user] @4,0
--
unit -> route
route -> sdk
sdk -> ui
ui -> e2e
```

| Level | Count | What it protects you from |
|---|---|---|
| Pure functions (`test_context.py`) | 5 | the history cut starting on an assistant turn, or losing the newest message |
| Routes (`test_chat.py`, `test_conversations.py`) | 14 | wrong event order, lost partial replies, bad inputs, broken regenerate |
| Claude adapter (`test_anthropic_adapter.py`) | 5 | misreading the real stream, mishandling 401/429/500/400 |
| Rate limiter (`test_ratelimit.py`) | 4 | a client being able to run up your bill |
| Front end (`sse.test.ts`, `chatReducer.test.ts`) | 17 | a split UTF-8 character, a late `finished` overwriting `stopped`, state mutation |

Run them:

```bash title="Back end (from backend/)"
pytest -q
```

```bash title="Front end (from frontend/)"
npm test
npm run build      # also type-checks the whole project with tsc
```

## What a good route test looks like

The most useful tests read the stream **the way a browser would**. A tiny helper turns the raw body into `(event, data)` pairs:

```python src="pocket-chat/backend/tests/conftest.py" region="helpers" title="backend/tests/conftest.py"
```

```python src="pocket-chat/backend/tests/test_chat.py" region="stream-tests" title="backend/tests/test_chat.py"
```

Notice three habits:

- **The mock makes it fast and free.** Each test runs in milliseconds, with `MOCK_DELAY_MS=0` and a temporary database.
- **Assert on behaviour, not wording.** We check the event order, that deltas add up to the saved reply, that usage is stored. We do not assert the exact sentence a model writes (with a real model that would break constantly).
- **Test the unhappy paths:** a fake LLM that raises mid-stream, a closed generator, empty and oversized messages, unknown IDs.

A fake that fails on purpose is five lines:

```python src="pocket-chat/backend/tests/test_chat.py" region="failing-llm" title="backend/tests/test_chat.py"
```

## One test across the whole stack

Unit tests prove the parts. One browser test proves the *seams* between them: that React really reads what FastAPI really sends. The project's end-to-end script starts both servers, opens a real browser (Playwright), and acts like a person:

:::flow What the end-to-end test does
Start | uvicorn (offline model) + Vite
Send | type a message, press Enter
Watch | the caret appears, text streams, usage shows
Break | press Stop mid-reply: partial answer kept
Reload | open the saved chat from the database
:::

It checks 22 things, including *the caret appears while streaming*, *Stop keeps the partial answer and the Send button comes back*, *regenerate does not add a second answer*, *a reloaded conversation shows stored usage*, and *the sidebar slides in on a phone*. Failures there are the ones users would notice.

## Hardening: five guard rails

An endpoint that calls a paid model is an open wallet. These five measures, in this order, are the minimum.

### 1. Limit the input

Pydantic already rejects a message over 8,000 characters, and an empty one is refused by the route. Without a cap, one request could cost a fortune in input tokens. Also cap the **output** (`max_output_tokens`) and the **history** (the token budget from lesson 4).

### 2. Rate limit per client

A sliding window remembers when each client called and refuses once the limit is reached. The logic is a pure class, so it is tested with a fake clock instead of real waiting. It runs right here:

```python run src="pocket-chat/backend/app/ratelimit.py" region="imports,limiter" title="backend/app/ratelimit.py" level=intermediate
clock = [0.0]
limiter = SlidingWindowLimiter(limit=3, window=60, clock=lambda: clock[0])   # a fake clock we control

for second in (0, 5, 10, 15, 30, 61, 66):
    clock[0] = second
    allowed, wait = limiter.allow("alice")
    print(f"t={second:>2}s  alice: {'ok' if allowed else f'refused, retry in {wait:.0f}s'}")

print("bob at t=66s:", limiter.allow("bob")[0], "(his budget is separate)")
```

Hooking it into FastAPI is one dependency that raises `429` with a `Retry-After` header:

```python src="pocket-chat/backend/app/deps.py" region="rate-limit" title="backend/app/deps.py"
```

The limiter lives in memory, which is fine for one server process. With several processes you need a shared store such as Redis, and behind a proxy you must read the client address from `X-Forwarded-For` (and only trust that header from your own proxy). The React side already copes: a 429 arrives as `ApiError` with the server's friendly `detail`.

### 3. Do not leak errors

`translate_error` turns provider failures into five safe messages. The raw exception, which may contain request details, goes to the server log only.

### 4. Log what matters, never secrets

Every finished reply logs one line with the conversation, model, tokens and cost:

```python
log.info("reply saved conversation=%s model=%s in=%d out=%d cost=$%.5f", ...)
```

Those lines answer the questions you will be asked: *Why was last week's bill high? Which conversation was expensive?* Never log message text by default (it is private user data) and never log keys or `Authorization` headers.

### 5. Control who can call

Pocket Chat has no accounts, so anyone who can reach it can use it. Before you put it on the internet, add authentication. Project 5 builds it (JWT, roles, and per-organisation budgets). Until then, keep it on your laptop, or behind a password at the reverse proxy.

:::warn A key in the browser is a leaked key
If you ever find yourself pasting `sk-ant-...` into front-end code "just to test", stop. It will end up in your repository or your build. The server holds the key; the browser holds nothing secret.
:::

## A checklist before you share a link

- [ ] `.env` is in `.gitignore`, and `git log` contains no key
- [ ] `max_output_tokens`, the message cap and the rate limit are set
- [ ] CORS lists only your real site (or you serve the app and the API from one origin)
- [ ] The server logs tokens and cost per reply
- [ ] Errors shown to users are friendly; details are only in logs
- [ ] A spending limit is set in the provider's console (the last line of defence)

:::keypoints
- Test at five levels: pure functions, routes, the provider adapter, UI logic and one real-browser run.
- Test behaviour (event order, saved partial replies, error mapping), not exact model wording.
- Cap input, output and history; rate limit per client; return 429 with `Retry-After`.
- Log tokens and cost per reply, never secrets or private text; show users only friendly errors.
- Authentication and a provider-side spending limit are the last two guard rails.
:::

```quiz
? Why do route tests use the offline model instead of the real one?
- The real model is not allowed in tests
+ It is free, instant and deterministic, so tests can assert exact behaviour
- It is more accurate
> Fast, repeatable tests need a predictable model. Real-model quality is measured separately with evals.
? A client sends 4 requests in a minute and the limit is 3. What do they get?
- A normal answer
+ 429 Too Many Requests with a Retry-After header
- A 500 error
> The dependency raises a 429 before the model is called, so refused requests cost nothing.
? Which of these should NOT be logged by default?
- Tokens and cost per reply
- The model name
+ The full text of users' messages
> Messages can contain private data. Log metadata (ids, sizes, tokens, cost) and keep content out of logs unless you have a clear reason and consent.
```

:::exercise Break the rate limiter
Run the rate-limit block and change `limit=3` to `limit=1`. What happens at `t=61`? Then answer: with `window=60`, can a client send 3 requests at second 59 and 3 more at second 61? Why do some systems prefer a *token bucket* to a sliding window (hint: bursts)?
:::
