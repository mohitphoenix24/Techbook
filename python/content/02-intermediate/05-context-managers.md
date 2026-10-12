---
title: Context Managers (with)
level: intermediate
time: 18
summary: Guarantee setup and cleanup with the with statement — files, timers, temporary settings, API streams and GPU memory all use this pattern.
---

You have already written `with open(...) as f:`. The `with` statement is not just for files — it is a general way to say **"set something up, and no matter what happens, clean it up afterwards."**

:::def Context manager
An object that defines what happens when a `with` block **starts** (`__enter__`) and **ends** (`__exit__`). The ending code runs even if an error happens inside the block.
:::

:::syntax
```python
with expression as name:
    # use name
# cleanup has already happened here
```
:::

:::analogy
A context manager is like a **hotel room**: check-in gives you the key (`__enter__`), and check-out always happens when you leave (`__exit__`) — even if you leave in a hurry because the fire alarm went off (an exception).
:::

## Why it matters

```python run level=easy
# Without with: if an error happens before close(), the file stays open
f = open("log.txt", "w", encoding="utf-8")
f.write("first line\n")
f.close()

# With with: closing is guaranteed
with open("log.txt", "a", encoding="utf-8") as f:
    f.write("second line\n")
print("closed?", f.closed)
print(open("log.txt", encoding="utf-8").read())
```

## Writing your own with a class

```python run level=intermediate
import time

class Timer:
    def __init__(self, label):
        self.label = label

    def __enter__(self):
        self.start = time.perf_counter()
        return self                         # this becomes the "as" variable

    def __exit__(self, exc_type, exc_value, traceback):
        self.elapsed = time.perf_counter() - self.start
        print(f"[{self.label}] {self.elapsed * 1000:.2f} ms")
        return False                        # False = do not hide exceptions

with Timer("tokenize") as t:
    words = ("lorem ipsum " * 20_000).split()

print(len(words), "words; elapsed stored on the object:", round(t.elapsed, 4))
```

`__exit__` receives the exception details if something went wrong (or `None` three times if not). Returning `True` would **swallow** the error — rarely what you want.

## The easy way: @contextmanager

:::def @contextmanager
A decorator from `contextlib` that turns a **generator** into a context manager. Code before `yield` is the setup, the yielded value is the `as` variable, and code after `yield` (in `finally`) is the cleanup.
:::

```python run level=intermediate
from contextlib import contextmanager
import time

@contextmanager
def timer(label):
    start = time.perf_counter()
    try:
        yield                                   # the with-block runs here
    finally:
        print(f"[{label}] {(time.perf_counter() - start) * 1000:.2f} ms")

with timer("sum of squares"):
    total = sum(i * i for i in range(300_000))
print(total)
```

### Temporarily changing settings

A very common use: change something for a block of code, then **restore** it.

```python run level=intermediate
from contextlib import contextmanager

CONFIG = {"temperature": 1.0, "model": "claude-opus-5-5"}

@contextmanager
def override(**changes):
    old = {k: CONFIG[k] for k in changes}
    CONFIG.update(changes)
    try:
        yield CONFIG
    finally:
        CONFIG.update(old)                      # restore, even on error

print("before:", CONFIG)
with override(temperature=0.0) as cfg:
    print("inside:", cfg)
print("after: ", CONFIG)

try:
    with override(model="claude-haiku-4-5"):
        raise RuntimeError("boom")
except RuntimeError:
    pass
print("restored after error:", CONFIG)
```

:::ai
This is exactly the pattern of `torch.no_grad()`: inside the block, PyTorch turns gradient tracking off (faster inference, less memory); when the block ends it is switched back on.
```python
with torch.no_grad():
    predictions = model(inputs)
```
:::

## Handy tools in contextlib

```python run level=intermediate
from contextlib import suppress, redirect_stdout, ExitStack
import io
import os

# suppress: ignore one specific, expected error
with suppress(FileNotFoundError):
    os.remove("does_not_exist.txt")
print("no crash")

# redirect_stdout: capture everything printed
buffer = io.StringIO()
with redirect_stdout(buffer):
    print("this goes into the buffer")
print("captured:", repr(buffer.getvalue()))

# ExitStack: open a variable number of resources safely
names = ["a.txt", "b.txt", "c.txt"]
with ExitStack() as stack:
    files = [stack.enter_context(open(n, "w", encoding="utf-8")) for n in names]
    for i, f in enumerate(files):
        f.write(f"file {i}")
print([open(n, encoding="utf-8").read() for n in names])
```

## A rate limiter with a context manager

Here is something genuinely useful for AI apps — make sure you never send more than N requests per time window:

```python run level=advanced
from contextlib import contextmanager
import time

class RateLimiter:
    def __init__(self, max_calls, per_seconds):
        self.max_calls = max_calls
        self.per_seconds = per_seconds
        self.calls = []

    @contextmanager
    def slot(self):
        now = time.monotonic()
        self.calls = [t for t in self.calls if now - t < self.per_seconds]
        if len(self.calls) >= self.max_calls:
            wait = self.per_seconds - (now - self.calls[0])
            print(f"  limit reached — would wait {wait:.2f}s")
            # time.sleep(wait)  <- in a real app
            self.calls.pop(0)
        self.calls.append(time.monotonic())
        yield

limiter = RateLimiter(max_calls=3, per_seconds=60)
for i in range(5):
    with limiter.slot():
        print(f"request {i} sent")
```

## Async context managers (preview)

Async code uses `async with` — for example the async Anthropic client's streaming helper. You will learn async in the Advanced module.

```python local title="async with — streaming from Claude"
import asyncio
import anthropic

async def main():
    client = anthropic.AsyncAnthropic()
    async with client.messages.stream(
        model="claude-opus-5-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Say hello in 3 languages."}],
    ) as stream:
        async for text in stream.text_stream:
            print(text, end="", flush=True)

asyncio.run(main())
```

## Check yourself

```quiz
? When does a context manager's cleanup code run?
- Only if the block succeeds
+ Always — whether the block succeeds or raises an error
- Only when you call close()
> That guarantee is the whole point of `with`.

? In a @contextmanager generator, what does the code after `yield` do?
+ Runs as cleanup when the with-block ends
- Runs before the with-block
- Never runs
> Put it in a `finally:` so it runs even on errors.

? What does `__enter__` return?
+ The value bound to the `as` variable
- Always None
- The exception, if any
> `with open(p) as f` — f is what open(...).__enter__() returned (the file itself).
```

:::exercise Working directory switcher
Write a context manager `working_dir(path)` with `@contextmanager` that creates the folder if needed, changes into it with `os.chdir`, and always changes back to the original directory afterwards. Prove it by writing a file inside the block and printing `os.getcwd()` before, inside and after.
:::

:::solution
```python run
import os
from contextlib import contextmanager

@contextmanager
def working_dir(path):
    old = os.getcwd()
    os.makedirs(path, exist_ok=True)
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(old)

print("before:", os.getcwd())
with working_dir("experiment_1"):
    print("inside:", os.getcwd())
    with open("results.txt", "w", encoding="utf-8") as f:
        f.write("accuracy=0.93")
print("after: ", os.getcwd())
print(open("experiment_1/results.txt", encoding="utf-8").read())
```
:::

:::keypoints
- `with` guarantees cleanup — files close, settings restore, locks release — even on errors.
- Build one with a class (`__enter__` / `__exit__`) or, more simply, `@contextmanager` + `yield`.
- `contextlib` gives `suppress`, `redirect_stdout`, `ExitStack` and more.
- AI uses: `torch.no_grad()`, streaming clients, timers, rate limiters, temporary configs.
:::
