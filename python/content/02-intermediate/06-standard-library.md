---
title: Standard Library Power Tools
level: intermediate
time: 28
summary: Batteries included — collections (Counter, defaultdict, deque), itertools, functools, random, datetime, hashlib, uuid and more. Tools you'll reach for daily in AI projects.
---

Python ships with a huge **standard library** — modules you can import with no installation. Knowing the right tool saves you from writing (and debugging) dozens of lines. This lesson is a tour of the ones AI engineers use most.

:::def Standard library
The collection of modules that comes with every Python installation (`json`, `math`, `random`, `collections`, `itertools`, `pathlib`…). No `pip install` needed.
:::

:::def Module & import
A **module** is a file of Python code you can reuse. `import collections` loads it; `from collections import Counter` loads one name from it; `import numpy as np` gives it a short nickname.
:::

## collections

### Counter — counting made easy

```python run level=easy
from collections import Counter

text = "to be or not to be that is the question to ask"
counts = Counter(text.split())

print(counts.most_common(3))
print(counts["to"], counts["missing"])        # missing keys are 0, no KeyError

labels = ["pos", "neg", "pos", "pos", "neutral", "neg"]
dist = Counter(labels)
print(dist)
total = sum(dist.values())
for label, n in dist.most_common():
    print(f"{label:<8} {n}  ({n / total:.0%})")
```

```python run level=intermediate
from collections import Counter

a = Counter("hello world".split())
b = Counter("hello there world world".split())
print("a + b:", a + b)               # add counts
print("b - a:", b - a)               # subtract (keeps only positive)
print("char frequency:", Counter("mississippi").most_common(2))
```

### defaultdict — dictionaries with automatic defaults

:::def defaultdict
A dict that **creates a default value** the first time you access a missing key. `defaultdict(list)` gives an empty list, `defaultdict(int)` gives `0`.
:::

```python run level=easy
from collections import defaultdict

docs = [("rag.md", "retrieval"), ("agents.md", "tools"), ("rag.md", "chunking"), ("rag.md", "embeddings")]

topics_by_doc = defaultdict(list)
for doc, topic in docs:
    topics_by_doc[doc].append(topic)        # no "if doc not in ..." needed

print(dict(topics_by_doc))

bigram_counts = defaultdict(int)
words = "the cat and the hat and the bat".split()
for a, b in zip(words, words[1:]):
    bigram_counts[(a, b)] += 1
print(max(bigram_counts.items(), key=lambda kv: kv[1]))
```

### deque — a fast queue with a max length

:::def deque
A "double-ended queue": fast to add or remove at **both** ends. With `maxlen`, it automatically drops old items — perfect for "keep the last N messages".
:::

```python run level=intermediate
from collections import deque

memory = deque(maxlen=4)             # sliding-window chat memory
for i in range(1, 8):
    memory.append(f"msg {i}")
    print(list(memory))

queue = deque(["task A", "task B"])
queue.appendleft("urgent task")       # add to the front
print(queue.popleft(), "|", list(queue))
```

### namedtuple — lightweight records

```python run level=intermediate
from collections import namedtuple

Hit = namedtuple("Hit", ["doc_id", "score"])
hits = [Hit("a", 0.3), Hit("b", 0.9)]
best = max(hits, key=lambda h: h.score)
print(best, best.doc_id, best.score)
doc_id, score = best                  # still a tuple: unpacking works
```

## itertools — iterator superpowers

```python run level=intermediate
import itertools

# all combinations of hyperparameters (grid search)
grid = list(itertools.product([0.1, 0.01], [16, 32], ["adam", "sgd"]))
print(len(grid), "configs; first:", grid[0])

# pairs of documents to compare
print(list(itertools.combinations(["d1", "d2", "d3"], 2)))

# join several lists lazily
print(list(itertools.chain(["a", "b"], ["c"], ["d", "e"])))

# running totals (cumulative token usage)
print(list(itertools.accumulate([120, 300, 80, 500])))

# group consecutive items by a key
events = ["text", "text", "tool", "tool", "tool", "text"]
print([(k, len(list(g))) for k, g in itertools.groupby(events)])

# take the first n from any iterator
print(list(itertools.islice(itertools.count(start=10, step=5), 4)))
```

| Function | Gives you |
|---|---|
| `product(a, b)` | every combination (nested loops) |
| `combinations(x, r)` | unique groups of size r, no repeats |
| `permutations(x, r)` | ordered arrangements |
| `chain(a, b, ...)` | one long iterator |
| `accumulate(x)` | running totals |
| `groupby(x, key)` | consecutive groups |
| `islice(it, n)` | first n items |
| `count()`, `cycle()`, `repeat()` | infinite iterators |
| `pairwise(x)` (3.10+) | overlapping pairs `(x0,x1), (x1,x2)…` |

## functools

```python run level=intermediate
import functools
import operator

# reduce: combine all items into one value
print(functools.reduce(operator.mul, [1, 2, 3, 4, 5]))   # 5! = 120

# partial: pre-fill some arguments
def call_model(prompt, model, temperature):
    return f"{model} @ {temperature}: {prompt}"

creative = functools.partial(call_model, model="claude-opus-5-5", temperature=1.0)
precise = functools.partial(call_model, model="claude-opus-5-5", temperature=0.0)
print(creative("Write a poem"))
print(precise("Extract the date"))

# cache: memoize an expensive pure function
@functools.cache
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
print(fib(80))
```

## random — reproducible randomness

:::def Random seed
A starting number for the random number generator. Using the **same seed** gives the **same sequence** of "random" numbers — essential for reproducible ML experiments.
:::

```python run level=easy
import random

random.seed(42)                       # reproducible!
print(random.random())                # float in [0, 1)
print(random.randint(1, 6))           # dice roll
print(random.choice(["claude", "gpt", "gemini"]))

data = list(range(10))
random.shuffle(data)                  # in place
print(data)
print(random.sample(data, 3))         # 3 unique picks

# weighted choice — like sampling the next token from probabilities!
tokens = ["the", "a", "cat", "dog"]
probs = [0.5, 0.2, 0.2, 0.1]
print(random.choices(tokens, weights=probs, k=10))
```

```python run level=intermediate
import random

# A train / validation / test split, reproducible with a seed
examples = [f"ex{i}" for i in range(20)]
rng = random.Random(7)                # an independent generator object
shuffled = examples[:]
rng.shuffle(shuffled)
n = len(shuffled)
train, val, test = shuffled[: int(.7 * n)], shuffled[int(.7 * n): int(.85 * n)], shuffled[int(.85 * n):]
print(len(train), len(val), len(test))
print("test:", test)
```

## datetime and time

```python run level=easy
from datetime import datetime, timedelta, timezone

now = datetime.now(timezone.utc)
print(now.isoformat(timespec="seconds"))
print(now.strftime("%Y-%m-%d %H:%M"))

later = now + timedelta(days=7, hours=3)
print("in a week:", later.date())

parsed = datetime.fromisoformat("2026-01-15T09:30:00+00:00")
print("days since:", (now - parsed).days)
```

```python run level=intermediate
import time

start = time.perf_counter()          # best for measuring durations
total = sum(range(1_000_000))
print(f"took {(time.perf_counter() - start) * 1000:.1f} ms")
print("unix timestamp:", int(time.time()))
```

## hashlib and uuid — fingerprints and IDs

:::def Hash function
A function that turns any data into a fixed-size "fingerprint". The same input always gives the same hash; a tiny change gives a completely different one. Used to detect duplicates and build cache keys.
:::

```python run level=intermediate
import hashlib
import uuid

def fingerprint(text: str) -> str:
    normalized = " ".join(text.lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:12]

docs = ["Hello World", "hello   world", "Goodbye world"]
for d in docs:
    print(fingerprint(d), d)

unique = {fingerprint(d): d for d in docs}     # near-duplicate removal
print(len(unique), "unique documents")

print("new id:", uuid.uuid4())                  # random unique id
print("stable id:", uuid.uuid5(uuid.NAMESPACE_URL, "https://example.com/doc1"))
```

## os, sys and shutil

```python run level=intermediate
import os
import sys
import shutil

os.environ["MY_APP_MODE"] = "dev"                  # environment variables
print(os.environ.get("MY_APP_MODE"))
print(os.environ.get("ANTHROPIC_API_KEY", "not set (good — never hard-code keys!)"))

print("python:", sys.version.split()[0])
print("platform:", sys.platform)

os.makedirs("tmp_dir/sub", exist_ok=True)
with open("tmp_dir/sub/x.txt", "w") as f:
    f.write("x")
shutil.copytree("tmp_dir", "tmp_copy", dirs_exist_ok=True)
print(sorted(os.listdir("tmp_copy/sub")))
shutil.rmtree("tmp_dir"); shutil.rmtree("tmp_copy")
```

## textwrap, string and pprint — small text helpers

```python run level=intermediate
import textwrap
from pprint import pprint

long = "Retrieval-Augmented Generation (RAG) improves answers by first searching a knowledge base and then giving the most relevant passages to the language model as context."
print(textwrap.fill(long, width=50))
print(textwrap.shorten(long, width=60, placeholder=" …"))

prompt = textwrap.dedent("""
    You are a helpful assistant.
        - Be concise.
        - Cite sources.
""").strip()
print(prompt)

pprint({"model": "claude-opus-5-5", "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1024}, width=60)
```

:::tip textwrap.dedent for prompts
Prompts written as triple-quoted strings inside functions pick up the function's indentation. `textwrap.dedent(...)` removes it, so the model sees clean text.
:::

## statistics and math

```python run level=easy
import statistics as st
import math

latencies = [120, 135, 98, 410, 125, 140, 118]
print("mean:  ", round(st.mean(latencies), 1))
print("median:", st.median(latencies))        # robust to the 410 outlier
print("stdev: ", round(st.stdev(latencies), 1))
print("p90:   ", st.quantiles(latencies, n=10)[-1])

print(math.log(100, 10), math.exp(1), math.sqrt(2))
print(math.inf > 1e308, math.isnan(float("nan")))
```

## Check yourself

```quiz
? Which tool counts how many times each word appears?
+ collections.Counter
- itertools.count
- statistics.mode
> `Counter(words).most_common(5)` gives the top 5.

? What does `deque(maxlen=3)` do when you append a 4th item?
+ Drops the oldest item automatically
- Raises an error
- Grows to 4 items
> Perfect for sliding windows like "last N chat messages".

? Why set `random.seed(42)`?
+ To get the same random numbers every run (reproducibility)
- To make numbers more random
- To speed up random
> Seeds make experiments repeatable.

? `itertools.product([1,2], ["a","b"])` gives…
+ (1,'a'), (1,'b'), (2,'a'), (2,'b')
- (1,'a'), (2,'b')
- [1, 2, 'a', 'b']
> product = every combination, like nested loops.
```

:::exercise Word statistics report
For the text below, print: the 3 most common words (lowercase, punctuation stripped), the number of unique words, the mean word length (2 decimals), and a list of words grouped by first letter using `defaultdict(list)` (only show letters with 2+ words).

```python
text = "Large language models learn language patterns. Models predict tokens; tokens form language."
```
:::

:::solution
```python run
from collections import Counter, defaultdict
import statistics as st
import string

text = "Large language models learn language patterns. Models predict tokens; tokens form language."
words = [w.strip(string.punctuation).lower() for w in text.split()]

print(Counter(words).most_common(3))
print("unique:", len(set(words)))
print("mean length:", round(st.mean(len(w) for w in words), 2))

by_letter = defaultdict(list)
for w in sorted(set(words)):
    by_letter[w[0]].append(w)
print({k: v for k, v in by_letter.items() if len(v) >= 2})
```
:::

:::keypoints
- `Counter`, `defaultdict`, `deque(maxlen=…)` and `namedtuple` cover most data-wrangling needs.
- `itertools` builds grids (`product`), chains, running totals and groups lazily.
- `functools` gives `partial`, `reduce` and caching.
- Seed `random` for reproducible splits and sampling; `random.choices` samples by weights.
- `hashlib` fingerprints for dedup/caching; `os.environ` for config and secrets.
:::
