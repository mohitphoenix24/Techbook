---
title: The streaming chat endpoint
level: easy
time: 40
summary: How Server-Sent Events work on the wire, how to turn an async generator into a streaming FastAPI response, and how to survive the user pressing Stop.
tags: SSE, StreamingResponse, async generator, cancellation
---

This is the heart of the app. In this lesson you will see exactly what travels over the wire when a reply streams, build the endpoint that produces it, and handle the awkward case where the browser walks away half-way through.

## Server-Sent Events, on the wire

SSE is a text protocol on top of an ordinary HTTP response. The server sets `Content-Type: text/event-stream` and keeps the response open. Each **event** is a few `field: value` lines ended by **one blank line**:

```text title="What the browser receives"
event: meta
data: {"conversation_id": "a1b2c3", "model": "mock-1"}

event: delta
data: {"text": "Hello! "}

event: delta
data: {"text": "I am Pocket Chat."}

event: usage
data: {"input_tokens": 44, "output_tokens": 33, "cost_usd": 0.0004}

event: done
data: {"message_id": 2}

```

| Field | Meaning |
|---|---|
| `event:` | the event's name (default is `message`) |
| `data:` | the payload. We always send **one line of JSON**; several `data:` lines would be joined with newlines |
| a line starting with `:` | a comment, used as a keep-alive ping |
| a blank line | **ends the event** |

:::def Server-Sent Events (SSE)
A one-way streaming format over plain HTTP: the server keeps the response open and writes events as they happen. It is simpler than WebSockets (no upgrade, works through ordinary proxies and load balancers) and perfect when only the server talks: a model's answer, a progress bar, a log tail.
:::

The helper that produces one event is a tiny pure function you can run right here:

```python run src="pocket-chat/backend/app/sse.py" region="imports,format" title="backend/app/sse.py: format one event" level=easy
for event, data in [("delta", {"text": "Hello, "}), ("delta", {"text": "नमस्ते 👋"}), ("done", {})]:
    print(repr(sse(event, data)))
```

Look at the `\n\n` at the end of each string: that blank line is what tells the browser "this event is complete". `ensure_ascii=False` keeps Hindi and emoji readable instead of `न...` escapes.

## Step 1: request and response shapes

```python src="pocket-chat/backend/app/schemas.py" region="chat-request" title="backend/app/schemas.py"
```

The request is a normal JSON `POST` (that is why we use `fetch` on the browser side, not `EventSource`, which can only `GET`). `max_length=8000` is a cheap defence against someone pasting a novel into every request.

## Step 2: the generator that produces events

`StreamingResponse` takes any **async generator of strings or bytes** and sends each `yield` as it happens. So the endpoint's job splits in two: ordinary checks, then a generator.

```python src="pocket-chat/backend/app/routes/chat.py" region="events" title="backend/app/routes/chat.py: chat_events"
```

Read it slowly; each part has a reason.

1. **Load, trim, announce.** We read the stored conversation, trim it to the budget (next lesson), and immediately yield a `meta` event so the UI can show the model name and conversation ID before the first word.
2. **Forward every piece.** `async for event in llm.stream(...)` receives `TextDelta` events; each becomes a `delta` event. We also collect them in `parts` so we can save the whole reply later.
3. **Finish properly.** On `StreamDone` we save the reply with its token counts, then yield `usage` (cost included) and `done`. Saving *before* `done` means that when the browser sees `done`, the database already has the message.
4. **Errors travel in the stream.** An `LLMError` becomes an `error` event. The status code is long gone (200), so this is the only way to tell the browser.
5. **`finally` handles the walk-away.**

### What happens when the user presses Stop

When the browser aborts the request, the connection closes. Starlette (the server library under FastAPI) **cancels** the generator at its current `await`, and the `finally` block runs. We use it to keep whatever was already streamed:

```python
finally:
    if parts and not saved:
        save(stopped=True)      # a partial answer, marked "stopped"
```

This is why a stopped answer is still there after a reload, and why the UI can show "Stopped. This is a partial answer." Two details make it safe:

- `finally` contains **no `await`**: after a cancellation you must not wait for anything, and `store.add_message` is a plain synchronous write.
- The `saved` flag prevents saving twice when the stream completed normally.

You can prove this works without a browser by closing the generator yourself. This is one of the project's tests:

```python src="pocket-chat/backend/tests/test_chat.py" region="stop-test" title="backend/tests/test_chat.py"
```

## Step 3: the endpoint

```python src="pocket-chat/backend/app/routes/chat.py" region="endpoint" title="backend/app/routes/chat.py: the route"
```

Notice the ordering rule from lesson 1: **everything that can fail with a normal status code happens before `StreamingResponse` is returned.** A missing conversation is a 404, an empty message is a 422, a wrong persona silently falls back to the default. After that we hand FastAPI the generator.

The three response headers matter more than they look:

```python src="pocket-chat/backend/app/sse.py" region="headers" title="backend/app/sse.py"
```

`Cache-Control: no-cache` stops proxies and browsers from caching a live stream, and `X-Accel-Buffering: no` tells nginx to forward each chunk immediately. Without the latter, a reverse proxy may collect the whole answer and release it at once, which makes your streaming look broken only in production.

## Try it from the terminal

With the back end running, `curl -N` (no buffering) shows the raw stream:

```bash
curl -N -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "give me a plan", "persona": "friendly"}'
```

You should see `event: meta`, a run of `event: delta` lines arriving over about a second, then `usage` and `done`. Add `-i` to see the headers.

## Test it

The test client reads the whole stream, so a test can assert on exactly what a browser would see:

```python src="pocket-chat/backend/tests/conftest.py" region="helpers" title="backend/tests/conftest.py: parse a stream in tests"
```

```python src="pocket-chat/backend/tests/test_chat.py" region="stream-tests" title="backend/tests/test_chat.py"
```

:::warn Typical streaming bugs, and how they show up
- **All the text arrives at once:** something buffers (a proxy, gzip middleware, or you used a blocking `time.sleep` inside the async generator, so the loop could not flush).
- **`RuntimeError: ... response already started`:** you raised `HTTPException` after the first yield. Move checks before streaming, or send an `error` event.
- **A hung request after the user leaves:** the generator ignores cancellation. Never swallow `CancelledError` with a bare `except:`.
:::

:::keypoints
- SSE is `event:` and `data:` lines, with a blank line ending each event, sent with `Content-Type: text/event-stream`.
- `StreamingResponse` + an async generator streams each `yield` immediately.
- Checks that can return 404 or 422 run **before** streaming; later failures become `error` events.
- Save the reply before sending `done`; use `finally` (with no `await`) to keep partial text when the client disconnects.
- `no-cache` and `X-Accel-Buffering: no` keep proxies from buffering the stream.
:::

```quiz
? Why do we use fetch with POST instead of the browser's EventSource?
- EventSource is deprecated
+ EventSource can only send GET requests, and a chat needs to POST the message body
- fetch is faster
> The message and history live in a request body, which needs POST. We read the response stream ourselves.
? What ends one SSE event?
- A closing tag
- The word "end"
+ A blank line
> Each event is a block of field lines terminated by an empty line. The parser splits on it.
? The user presses Stop. What does the `finally` block in chat_events do?
- Deletes the conversation
+ Saves the text streamed so far, marked as stopped
- Restarts the stream
> Cancellation raises inside the generator; finally runs and keeps the partial reply so a reload still shows it.
```

:::exercise Add a keep-alive
Some proxies close connections that are silent for 30 to 60 seconds, which can happen while a model "thinks". Add a comment event (`": ping\n\n"`) that is yielded if no piece has arrived for 15 seconds. Hint: wrap `llm.stream` iteration with `asyncio.wait_for` on `__anext__()`, or run a small background task that puts pings on an `asyncio.Queue`. Browsers (and the parser you will write) ignore lines that start with `:`.
:::
