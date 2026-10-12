---
title: Async & Concurrency
level: advanced
time: 35
summary: Run many slow operations at the same time with async / await. Essential for calling LLM APIs in parallel, streaming responses and building fast AI web servers.
---

Calling an LLM takes seconds. Most of that time your program is just **waiting** for the network. If you need 100 answers and do them one by one, you wait 100 times. With **async**, you send them all and wait **once**. This is one of the highest-impact skills for AI engineering.

:::note Running async code on this page
In a normal `.py` file you start async code with `asyncio.run(main())`. This page converts that line automatically so it works in the browser — just press Run.
:::

## The core idea

:::def Concurrency
Making progress on several tasks during the same period of time by **switching between them while they wait**. It is not about doing two calculations at the same instant (that is parallelism); it is about not sitting idle.
:::

:::analogy
A chef cooking a big meal does not stand watching the pasta boil for 10 minutes. They put the pasta on, then chop vegetables, then stir the sauce — **switching tasks whenever one is waiting**. One chef, many dishes, finished much sooner. That chef is the **event loop**.
:::

:::def Event loop
The engine of `asyncio`. It runs one task until that task has to wait (for the network, a timer…), then switches to another task that is ready. All of this happens in a single thread.
:::

## async def and await

:::def Coroutine
A function defined with `async def`. Calling it does **not** run it — it creates a coroutine object. It runs when you `await` it (or schedule it as a task).
:::

:::def await
"Pause **this** coroutine until that thing finishes — and let other tasks run meanwhile." You can only use `await` inside an `async def`.
:::

:::syntax
```python
import asyncio

async def fetch():              # a coroutine function
    await asyncio.sleep(1)      # wait without blocking others
    return "data"

async def main():
    result = await fetch()

asyncio.run(main())             # start the event loop
```
:::

```python run level=intermediate
import asyncio
import time

async def call_llm(prompt: str, seconds: float) -> str:
    print(f"  → sent: {prompt!r}")
    await asyncio.sleep(seconds)           # stands in for network waiting
    print(f"  ← got:  {prompt!r}")
    return f"answer to {prompt!r}"

async def main():
    start = time.perf_counter()
    answer = await call_llm("What is AI?", 1.0)
    print(answer, f"({time.perf_counter() - start:.1f}s)")

asyncio.run(main())
```

## One after another vs all at once

Here is the difference that matters. Three "API calls" of 1 second each:

```python run level=intermediate
import asyncio
import time

async def call_llm(prompt: str) -> str:
    await asyncio.sleep(1.0)
    return f"answer({prompt})"

async def sequential(prompts):
    return [await call_llm(p) for p in prompts]            # waits for each in turn

async def concurrent(prompts):
    return await asyncio.gather(*(call_llm(p) for p in prompts))   # all at once

async def main():
    prompts = ["summarize", "translate", "classify"]

    t = time.perf_counter()
    await sequential(prompts)
    print(f"sequential: {time.perf_counter() - t:.1f}s")

    t = time.perf_counter()
    results = await concurrent(prompts)
    print(f"concurrent: {time.perf_counter() - t:.1f}s")
    print(results)

asyncio.run(main())
```

:::def asyncio.gather
Runs several awaitables **concurrently** and returns their results **in the same order** you passed them, once all are done.
:::

## Tasks

:::def Task
A coroutine that has been **scheduled** on the event loop with `asyncio.create_task(...)`. It starts running in the background right away; you `await` it later to get the result.
:::

```python run level=intermediate
import asyncio

async def embed(doc: str) -> int:
    await asyncio.sleep(0.5)
    return len(doc)

async def main():
    task_a = asyncio.create_task(embed("first document"))     # starts now
    task_b = asyncio.create_task(embed("second, longer document"))
    print("tasks started; doing other work meanwhile...")
    await asyncio.sleep(0.1)
    print("still working while embeddings run")
    a, b = await task_a, await task_b
    print("results:", a, b)

asyncio.run(main())
```

## Limiting concurrency with a Semaphore

APIs have **rate limits**. Firing 1,000 requests at once will get you errors. A semaphore caps how many run at the same time.

:::def Semaphore
A counter that allows at most **N** tasks into a section of code at once. Others wait their turn. `async with sem:` takes a slot and frees it automatically.
:::

```python run level=advanced
import asyncio
import time

MAX_CONCURRENT = 3
sem = asyncio.Semaphore(MAX_CONCURRENT)
active = 0

async def call_llm(i: int) -> str:
    global active
    async with sem:                       # at most 3 inside at once
        active += 1
        print(f"start {i:2d}  (in flight: {active})")
        await asyncio.sleep(0.5)
        active -= 1
        return f"result {i}"

async def main():
    t = time.perf_counter()
    results = await asyncio.gather(*(call_llm(i) for i in range(9)))
    print(f"{len(results)} results in {time.perf_counter() - t:.1f}s (9 calls, 3 at a time)")

asyncio.run(main())
```

## Timeouts and errors

```python run level=advanced
import asyncio

async def slow_model():
    await asyncio.sleep(5)
    return "finally!"

async def flaky_model(i):
    await asyncio.sleep(0.2)
    if i == 2:
        raise ConnectionError(f"request {i} failed")
    return f"ok {i}"

async def main():
    # 1) give up on a call that takes too long
    try:
        await asyncio.wait_for(slow_model(), timeout=0.5)
    except asyncio.TimeoutError:
        print("timed out after 0.5s")

    # 2) one failure should not lose all the other results
    results = await asyncio.gather(*(flaky_model(i) for i in range(4)), return_exceptions=True)
    for r in results:
        print("  error:" if isinstance(r, Exception) else "  ok:   ", r)

asyncio.run(main())
```

:::warn Never use time.sleep() in async code
`time.sleep()` **blocks the whole event loop** — every task freezes. Inside `async def`, always use `await asyncio.sleep()`. The same goes for any slow, non-async library call (see `asyncio.to_thread` below).
:::

## Processing results as they finish

`gather` waits for **all** results. `as_completed` gives you each result **as soon as it is ready** — great for progress bars and showing fast answers first.

```python run level=advanced
import asyncio
import random

random.seed(4)

async def grade(answer_id: int) -> tuple[int, float]:
    await asyncio.sleep(random.uniform(0.1, 1.0))
    return answer_id, round(random.random(), 2)

async def main():
    tasks = [asyncio.create_task(grade(i)) for i in range(5)]
    for done, coro in enumerate(asyncio.as_completed(tasks), start=1):
        answer_id, score = await coro
        print(f"[{done}/5] answer {answer_id} graded: {score}")

asyncio.run(main())
```

## Async generators: streaming

:::def Async generator
An `async def` function that uses `yield`. You loop over it with `async for`. This is exactly how streaming LLM responses are consumed in async code.
:::

```python run level=advanced
import asyncio

async def stream_tokens(text: str):
    for word in text.split():
        await asyncio.sleep(0.15)          # tokens arrive over the network
        yield word + " "

async def main():
    full = ""
    async for token in stream_tokens("Async generators let you show each token the moment it arrives."):
        print(token, end="", flush=True)
        full += token
    print(f"\n\n({len(full.split())} tokens received)")

asyncio.run(main())
```

## Producer / consumer with asyncio.Queue

A classic pipeline: one task **produces** work (e.g. reads documents), several workers **consume** it (e.g. embed them).

```python run level=advanced
import asyncio

async def producer(queue: asyncio.Queue, docs):
    for d in docs:
        await queue.put(d)
        print(f"queued  {d}")
    for _ in range(WORKERS):
        await queue.put(None)              # one "stop" signal per worker

async def worker(name: str, queue: asyncio.Queue, results: list):
    while True:
        doc = await queue.get()
        if doc is None:
            break
        await asyncio.sleep(0.3)           # embedding call
        results.append((doc, name))
        print(f"{name} embedded {doc}")

WORKERS = 2

async def main():
    queue = asyncio.Queue(maxsize=3)
    results = []
    docs = [f"doc{i}" for i in range(6)]
    await asyncio.gather(producer(queue, docs), *(worker(f"w{i}", queue, results) for i in range(WORKERS)))
    print(len(results), "embedded")

asyncio.run(main())
```

## Calling blocking code from async

Some libraries are not async. Wrap slow blocking calls with `asyncio.to_thread` so they run in a separate thread without freezing the event loop:

```python local title="asyncio.to_thread"
import asyncio
import time

def blocking_pdf_parse(path):          # a normal, slow, non-async function
    time.sleep(2)
    return f"text of {path}"

async def main():
    texts = await asyncio.gather(*(asyncio.to_thread(blocking_pdf_parse, p) for p in ["a.pdf", "b.pdf"]))
    print(texts)                        # ~2s total, not 4s

asyncio.run(main())
```

## Real async LLM calls

The Anthropic SDK ships an async client. Combine it with `gather` and a semaphore to process many prompts quickly and safely:

```python local title="Parallel Claude calls"
import asyncio
import anthropic

client = anthropic.AsyncAnthropic()          # reads ANTHROPIC_API_KEY
sem = asyncio.Semaphore(5)                   # stay under your rate limit

async def summarize(text: str) -> str:
    async with sem:
        response = await client.messages.create(
            model="claude-opus-5-5",
            max_tokens=1024,
            messages=[{"role": "user", "content": f"Summarize in one sentence:\n\n{text}"}],
        )
        return next(b.text for b in response.content if b.type == "text")

async def main():
    docs = ["...document 1...", "...document 2...", "...document 3..."]
    summaries = await asyncio.gather(*(summarize(d) for d in docs))
    for s in summaries:
        print("-", s)

asyncio.run(main())
```

:::tip Async vs threads vs processes
| Tool | Best for |
|---|---|
| `asyncio` | many **network** waits (API calls, web servers, streaming) |
| `threading` / `ThreadPoolExecutor` | blocking libraries you cannot make async |
| `multiprocessing` / `ProcessPoolExecutor` | heavy **CPU** work in pure Python (bypasses the GIL) |

For NumPy/PyTorch math, the libraries already use all your cores internally.
:::

:::def GIL (Global Interpreter Lock)
A lock in the standard CPython interpreter that lets only one thread run Python code at a time. It is why threads do not speed up pure-Python CPU work. (Python 3.13+ offers an experimental "free-threaded" build without the GIL.)
:::

:::ai
- **Batch evaluation**: run an LLM judge over 500 answers concurrently.
- **RAG ingestion**: embed thousands of chunks with bounded concurrency.
- **Web servers**: FastAPI endpoints are `async def`, so one server handles many users while waiting on the model.
- **Agents**: run independent tool calls in parallel.
:::

## Check yourself

```quiz
? What does calling an `async def` function return?
- Its result
+ A coroutine object — it runs when awaited or scheduled
- None
> You must await it (or create a task) for it to actually run.

? Three 1-second calls run with asyncio.gather take about…
- 3 seconds
+ 1 second
- 0 seconds
> They wait at the same time, so the total is the longest single call.

? Why is `time.sleep(1)` bad inside async code?
+ It blocks the entire event loop, freezing all tasks
- It is slower than asyncio.sleep
- It raises an error
> Use `await asyncio.sleep(1)` instead.

? What is a Semaphore used for here?
+ Limiting how many requests run at the same time
- Making requests faster
- Retrying failed requests
> It protects you from rate limits.
```

:::exercise Bounded parallel translator
Write `translate(text, lang)` that sleeps 0.4s and returns `f"[{lang}] {text}"`. Translate `"hello"` into 6 languages with **at most 2 concurrent calls**, keep results in the input order, and print the total time (it should be about 1.2s).
:::

:::solution
```python run
import asyncio
import time

sem = asyncio.Semaphore(2)

async def translate(text, lang):
    async with sem:
        await asyncio.sleep(0.4)
        return f"[{lang}] {text}"

async def main():
    langs = ["fr", "de", "es", "it", "ja", "hi"]
    t = time.perf_counter()
    results = await asyncio.gather(*(translate("hello", l) for l in langs))
    print(results)
    print(f"took {time.perf_counter() - t:.1f}s")

asyncio.run(main())
```
:::

:::keypoints
- `async def` creates coroutines; `await` pauses one while others run.
- `asyncio.gather` runs many concurrently and keeps order; `create_task` starts work in the background.
- Use a `Semaphore` to respect rate limits, `wait_for` for timeouts, `return_exceptions=True` to survive failures.
- `async for` over async generators = streaming. `asyncio.Queue` builds producer/consumer pipelines.
- Never block the loop with `time.sleep` or slow sync calls — use `asyncio.sleep` / `asyncio.to_thread`.
:::
