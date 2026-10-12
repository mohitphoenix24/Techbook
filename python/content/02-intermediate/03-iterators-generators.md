---
title: Iterators & Generators
level: intermediate
time: 25
summary: Produce data one piece at a time with yield. Generators power token streaming, data loaders and memory-efficient pipelines over huge datasets.
---

When ChatGPT or Claude "types" its answer word by word, your code is reading a **stream** of pieces. When PyTorch feeds a model one batch at a time, it uses an **iterator**. When you process a 50 GB dataset without running out of memory, you use **generators**. This lesson explains all three.

## Iterables and iterators

:::def Iterable
Anything you can loop over with `for`: lists, strings, dicts, files, ranges… Technically, an object with an `__iter__` method.
:::

:::def Iterator
An object that hands out items **one at a time** when you call `next()` on it, and raises `StopIteration` when it runs out. Every `for` loop secretly calls `iter()` then `next()` repeatedly.
:::

```python run level=easy
tokens = ["The", "cat", "sat"]

it = iter(tokens)        # get an iterator from the list
print(next(it))
print(next(it))
print(next(it))
try:
    next(it)
except StopIteration:
    print("no more items")

# this is what a for loop does for you:
for t in tokens:
    print(t, end=" ")
```

## Generators: functions that yield

:::def Generator
A function that uses `yield` instead of (or as well as) `return`. Calling it does **not** run the body — it returns a generator object. Each `next()` runs the code until the next `yield`, hands out that value, and **pauses**, remembering exactly where it was.
:::

:::syntax
```python
def my_generator():
    yield first_value
    yield second_value

for value in my_generator():
    ...
```
:::

```python run level=easy
def countdown(n):
    print("  (starting)")
    while n > 0:
        yield n            # hand out n and pause here
        n -= 1
    print("  (finished)")

gen = countdown(3)
print(gen)                 # just a generator object — nothing ran yet
print(next(gen))
print(next(gen))
for value in gen:          # the loop continues from where we paused
    print(value)
```

:::analogy
A normal function is like a **printer** that prints the whole book before handing it to you. A generator is like a **storyteller** who tells one page, waits for you to say "go on", then tells the next page — and never needs the whole book in memory.
:::

## Simulating LLM token streaming

This is the shape of streaming code you will write with real LLM SDKs:

```python run level=easy
def fake_llm_stream(answer: str):
    """Yield an answer piece by piece, like a streaming API."""
    for word in answer.split(" "):
        yield word + " "

full = []
for piece in fake_llm_stream("Generators let you show text as soon as it arrives."):
    print(piece, end="", flush=True)    # show immediately
    full.append(piece)

print("\n\nfull text:", "".join(full).strip())
```

With the real Anthropic SDK, streaming looks very similar — you loop over `stream.text_stream`:

```python local title="Real streaming with Claude"
import anthropic

client = anthropic.Anthropic()          # reads ANTHROPIC_API_KEY from your environment

with client.messages.stream(
    model="claude-opus-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Explain generators in one paragraph."}],
) as stream:
    for text in stream.text_stream:     # an iterator of text pieces!
        print(text, end="", flush=True)
```

## Why generators save memory

```python run level=intermediate
import sys

def squares_list(n):
    return [i * i for i in range(n)]       # builds everything

def squares_gen(n):
    for i in range(n):
        yield i * i                        # one at a time

big_list = squares_list(1_000_000)
big_gen = squares_gen(1_000_000)
print(f"list:      {sys.getsizeof(big_list):>10,} bytes")
print(f"generator: {sys.getsizeof(big_gen):>10,} bytes")
print("same sum? ", sum(big_list) == sum(big_gen))
```

## Generator pipelines

Generators chain together like an assembly line. Each stage pulls items from the previous one **only when needed**. This is how you process files bigger than your RAM.

```python run level=intermediate
# create a "big" log file
with open("docs.txt", "w", encoding="utf-8") as f:
    for i in range(10):
        f.write(f"document {i}: {'spam ' if i % 3 == 0 else ''}useful text about topic {i % 4}\n")

def read_lines(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield line.rstrip("\n")

def drop_spam(lines):
    for line in lines:
        if "spam" not in line:
            yield line

def to_records(lines):
    for line in lines:
        doc_id, text = line.split(": ", 1)
        yield {"id": doc_id, "text": text, "words": len(text.split())}

pipeline = to_records(drop_spam(read_lines("docs.txt")))   # nothing has run yet!
for record in pipeline:
    print(record)
```

## Batching with generators

Sending items to an API in **batches** is a constant need. Here is a reusable batcher that works on any iterable — even infinite ones:

```python run level=intermediate
def batched(items, size):
    batch = []
    for item in items:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:                 # the last, smaller batch
        yield batch

texts = (f"text-{i}" for i in range(10))     # a generator, not a list
for i, b in enumerate(batched(texts, 4)):
    print(f"batch {i}: {b}")
```

:::tip Built-in since Python 3.12
`itertools.batched(items, n)` does exactly this (it yields tuples). Use it when your Python is 3.12+.
:::

```python run level=intermediate skiplocal
import itertools

print(list(itertools.batched(range(10), 4)))
```

## Infinite generators and itertools

A generator can go on forever — you just take as many items as you need.

```python run level=intermediate
import itertools

def learning_rate_schedule(start=0.1, decay=0.5):
    lr = start
    while True:              # infinite!
        yield lr
        lr *= decay

for step, lr in zip(range(5), learning_rate_schedule()):
    print(f"step {step}: lr={lr:.5f}")

print(list(itertools.islice(learning_rate_schedule(1.0, 0.9), 3)))   # take 3

colors = itertools.cycle(["red", "green", "blue"])                    # repeat forever
print([next(colors) for _ in range(5)])
```

## yield from and generator return values

```python run level=advanced
def chunks_of(doc, size):
    for i in range(0, len(doc), size):
        yield doc[i:i + size]

def all_chunks(docs, size):
    for doc in docs:
        yield from chunks_of(doc, size)    # delegate to another generator

print(list(all_chunks(["abcdefg", "hijk"], 3)))
```

### Sending values into a generator (advanced)

Generators can also **receive** values with `.send()`. This is rare in everyday code but shows how coroutines (and `async`) grew out of generators.

```python run level=advanced
def running_average():
    total, count, average = 0.0, 0, None
    while True:
        value = yield average      # pause, hand out average, receive a value
        total += value
        count += 1
        average = total / count

avg = running_average()
next(avg)                          # "prime" it: run to the first yield
for loss in [2.0, 1.5, 1.0, 0.5]:
    print(f"loss={loss}  running avg={avg.send(loss):.3f}")
```

## A custom iterator class

Sometimes you want an object that is iterable **and** carries state — like a dataset that shuffles every epoch. Implement `__iter__` (and, for an iterator, `__next__`).

```python run level=advanced
import random

class Dataset:
    """Iterate over examples in a new shuffled order each epoch."""
    def __init__(self, examples, seed=0):
        self.examples = list(examples)
        self.rng = random.Random(seed)

    def __len__(self):
        return len(self.examples)

    def __iter__(self):                  # a generator method is the easy way
        order = list(range(len(self.examples)))
        self.rng.shuffle(order)
        for i in order:
            yield self.examples[i]

ds = Dataset(["a", "b", "c", "d"], seed=42)
for epoch in range(3):
    print(f"epoch {epoch}:", list(ds))
```

:::ai
- **Streaming responses** from LLM APIs are iterators of text chunks or events.
- **PyTorch `DataLoader`** is an iterable that yields batches each epoch.
- **Hugging Face `datasets`** can stream huge datasets lazily (`streaming=True`).
- **RAG ingestion** pipelines read, clean, chunk and embed documents as a chain of generators.
:::

## Check yourself

```quiz
? What happens when you call a generator function?
- Its body runs to the end
+ It returns a generator object; the body runs only when you ask for items
- It returns a list
> Execution starts at the first next() and pauses at each yield.

? Why do generators use less memory than lists?
+ They produce one item at a time instead of storing all items
- They compress the data
- They only work with small data
> A generator stores its "recipe" and current position, not all the values.

? What does `yield from other_gen()` do?
+ Yields every item from another generator
- Returns the other generator
- Stops the current generator
> It delegates: equivalent to `for x in other_gen(): yield x`.
```

:::exercise Sliding windows
Write a generator `windows(tokens, size, stride)` that yields overlapping windows of a token list — e.g. with `size=4, stride=2` over 10 tokens you get windows starting at 0, 2, 4, 6. (This is how long documents are split into overlapping chunks for RAG.)
:::

:::solution
```python run
def windows(tokens, size, stride):
    for start in range(0, max(len(tokens) - size, 0) + 1, stride):
        yield tokens[start:start + size]

tokens = list(range(10))
for w in windows(tokens, size=4, stride=2):
    print(w)
```
:::

:::keypoints
- `for` loops call `iter()` then `next()` until `StopIteration`.
- A function with `yield` is a **generator**: it pauses and resumes, producing items lazily.
- Generators save memory and chain into pipelines; `yield from` delegates.
- Streaming LLM output, data loaders and batchers are all generator patterns.
- `itertools` (`islice`, `cycle`, `batched`, `chain`…) is full of ready-made iterator tools.
:::
