---
title: Performance & Profiling
level: advanced
time: 25
summary: Make Python fast where it matters — measure first, then vectorize with NumPy, choose the right data structure, cache, batch and stream. Plus the token-cost side of LLM performance.
---

"Python is slow" is half true. **Pure Python loops** are slow. But Python that hands work to optimized libraries (NumPy, PyTorch) runs at C speed. And in LLM apps, the biggest wins are usually **fewer, smaller, batched, cached API calls**, not faster loops. This lesson teaches you how to find and fix the real bottleneck.

:::def Bottleneck
The single slowest part of a program that limits its overall speed. Optimizing anything else barely helps.
:::

## Rule 1: measure before you optimize

```python run level=intermediate
import timeit

setup = "data = list(range(10_000))"

loop = timeit.timeit("""
total = 0
for x in data:
    total += x * x
""", setup=setup, number=200)

comp = timeit.timeit("sum(x * x for x in data)", setup=setup, number=200)
builtin = timeit.timeit("sum(map(lambda x: x * x, data))", setup=setup, number=200)

print(f"for loop:   {loop * 1000 / 200:.3f} ms per run")
print(f"generator:  {comp * 1000 / 200:.3f} ms per run")
print(f"map:        {builtin * 1000 / 200:.3f} ms per run")
```

:::def Profiler
A tool that runs your program and reports **how much time each function took**, so you can see where the time goes. Python has `cProfile` built in.
:::

```python run level=advanced
import cProfile
import pstats
import io

def tokenize(text):
    return text.lower().split()

def count_words(docs):
    counts = {}
    for d in docs:
        for w in tokenize(d):
            counts[w] = counts.get(w, 0) + 1
    return counts

def slow_dedupe(items):
    out = []
    for x in items:
        if x not in out:       # O(n) search inside a loop -> O(n²)!
            out.append(x)
    return out

def pipeline():
    docs = [f"document {i % 50} about topic {i % 7} and more words" for i in range(3000)]
    counts = count_words(docs)
    unique = slow_dedupe(docs)
    return len(counts), len(unique)

profiler = cProfile.Profile()
profiler.enable()
pipeline()
profiler.disable()

stream = io.StringIO()
pstats.Stats(profiler, stream=stream).sort_stats("cumulative").print_stats(6)
print("\n".join(stream.getvalue().splitlines()[:16]))
```

The profile shows `slow_dedupe` dominating. The fix is a better data structure, not a faster computer:

```python run level=intermediate
import time

docs = [f"document {i % 50} about topic {i % 7}" for i in range(3000)]

def slow_dedupe(items):
    out = []
    for x in items:
        if x not in out:
            out.append(x)
    return out

def fast_dedupe(items):
    return list(dict.fromkeys(items))      # keeps first-seen order, O(n)

for fn in [slow_dedupe, fast_dedupe]:
    t = time.perf_counter()
    result = fn(docs)
    print(f"{fn.__name__}: {len(result)} unique in {(time.perf_counter() - t) * 1000:.2f} ms")
```

:::def Big-O notation
A way to describe how running time grows with input size `n`. **O(1)**: constant (dict lookup). **O(n)**: grows linearly (one loop). **O(n²)**: grows with the square (a loop inside a loop) — 10× more data means 100× slower.
:::

| Operation | list | set / dict |
|---|---|---|
| `x in container` | O(n) — slow | O(1) — fast |
| add an item | O(1) append | O(1) |
| get by index/key | O(1) | O(1) |

## Rule 2: vectorize numeric work

:::def Vectorization
Replacing a Python loop over numbers with **one operation on a whole array**, which NumPy runs in fast compiled C code. Often 10–100× faster.
:::

```python run level=intermediate
import time
import numpy as np

rng = np.random.default_rng(0)
a = rng.random(1_000_000)
b = rng.random(1_000_000)

t = time.perf_counter()
dot_loop = 0.0
for x, y in zip(a, b):
    dot_loop += x * y
loop_ms = (time.perf_counter() - t) * 1000

t = time.perf_counter()
dot_np = a @ b                       # one vectorized call
np_ms = (time.perf_counter() - t) * 1000

print(f"python loop: {loop_ms:8.1f} ms")
print(f"numpy:       {np_ms:8.2f} ms   ({loop_ms / max(np_ms, 1e-6):.0f}x faster)")
print("same result:", np.isclose(dot_loop, dot_np))
```

### Similarity search: loop vs matrix

This is the heart of every vector search — and the difference is dramatic:

```python run level=advanced
import time
import numpy as np

rng = np.random.default_rng(1)
docs = rng.normal(size=(20_000, 128)).astype(np.float32)     # 20k document embeddings
docs /= np.linalg.norm(docs, axis=1, keepdims=True)          # normalise once
query = rng.normal(size=128).astype(np.float32)
query /= np.linalg.norm(query)

t = time.perf_counter()
scores_loop = [float(np.dot(d, query)) for d in docs]
best_loop = int(np.argmax(scores_loop))
loop_ms = (time.perf_counter() - t) * 1000

t = time.perf_counter()
scores = docs @ query                                        # all 20k cosine similarities at once
top5 = np.argpartition(-scores, 5)[:5]                       # top-5 without a full sort
top5 = top5[np.argsort(-scores[top5])]
vec_ms = (time.perf_counter() - t) * 1000

print(f"loop: {loop_ms:.1f} ms   vectorized: {vec_ms:.2f} ms")
print("best match agrees:", best_loop == top5[0], "| top-5:", top5.tolist())
```

## Rule 3: cache repeated work

```python run level=intermediate
import functools
import time

def slow_embed(text):
    time.sleep(0.01)                   # pretend: 10 ms API call
    return len(text)

@functools.lru_cache(maxsize=10_000)
def cached_embed(text):
    return slow_embed(text)

queries = ["what is rag", "what is ai", "what is rag", "what is rag", "what is ai"] * 10

for fn in [slow_embed, cached_embed]:
    t = time.perf_counter()
    for q in queries:
        fn(q)
    print(f"{fn.__name__}: {(time.perf_counter() - t) * 1000:.0f} ms for {len(queries)} calls")
```

## Rule 4: batch your API calls

Most embedding and LLM APIs accept **many inputs per request**. One request with 100 texts is far faster (and often cheaper) than 100 requests with one text each, because of network overhead.

```python run level=intermediate
NETWORK_OVERHEAD_MS = 80        # per request
PER_ITEM_MS = 2                 # per text

def time_for(n_items, batch_size):
    n_requests = -(-n_items // batch_size)          # ceiling division
    return n_requests * NETWORK_OVERHEAD_MS + n_items * PER_ITEM_MS

for bs in [1, 10, 100, 500]:
    print(f"batch size {bs:>3}: {time_for(1000, bs) / 1000:6.1f} s to embed 1000 texts")
```

:::tip Message Batches API
For large offline jobs (evaluations, classification of thousands of items), Anthropic's **Message Batches API** processes requests asynchronously at **50% of the normal price**. Use it whenever you do not need answers immediately.
:::

## Rule 5: stream and use memory wisely

```python run level=advanced
import sys
import numpy as np

# dtype matters: float32 is half the memory of float64 — and plenty for embeddings
emb64 = np.zeros((100_000, 384), dtype=np.float64)
emb32 = emb64.astype(np.float32)
emb16 = emb64.astype(np.float16)
for arr in [emb64, emb32, emb16]:
    print(f"{arr.dtype}: {arr.nbytes / 1e6:6.1f} MB")

# __slots__ shrinks millions of small objects
class Plain:
    def __init__(self, a, b): self.a, self.b = a, b

class Slotted:
    __slots__ = ("a", "b")
    def __init__(self, a, b): self.a, self.b = a, b

p, s = Plain(1, 2), Slotted(1, 2)
print("plain object:  ", sys.getsizeof(p) + sys.getsizeof(p.__dict__), "bytes")
print("slotted object:", sys.getsizeof(s), "bytes")
```

## The LLM side of performance

For Gen-AI apps, latency and cost are usually dominated by **tokens**:

| Lever | Effect |
|---|---|
| **Prompt caching** | Reuse a long, unchanging prefix (system prompt, documents) — cached input costs ~10% and is faster |
| **Shorter prompts** | Fewer input tokens = lower cost and faster first token |
| **Right-sized `max_tokens`** & concise instructions | Output tokens are the slowest and priciest part |
| **Streaming** | Users see the first words in well under a second instead of waiting for the full answer |
| **Concurrency** (async + semaphore) | Many requests in the time of one |
| **Batch API** | 50% cheaper for non-urgent jobs |
| **Smaller/faster model for simple steps** | e.g. classification or routing |
| **Retrieval quality** | Sending 3 good chunks beats 30 mediocre ones |

```python run level=intermediate
def cost(input_tokens, output_tokens, cached_tokens=0, price_in=4.00, price_out=20.00, cache_read_multiplier=0.1):
    uncached = input_tokens - cached_tokens
    return (uncached * price_in + cached_tokens * price_in * cache_read_multiplier + output_tokens * price_out) / 1e6

system_prompt_tokens = 20_000      # a big manual pasted into the system prompt
question_tokens = 50
answer_tokens = 300
n_questions = 1_000

no_cache = n_questions * cost(system_prompt_tokens + question_tokens, answer_tokens)
with_cache = n_questions * cost(system_prompt_tokens + question_tokens, answer_tokens, cached_tokens=system_prompt_tokens)
print(f"without caching: ${no_cache:,.2f}")
print(f"with caching:    ${with_cache:,.2f}  (cache-write cost ignored for simplicity)")
```

## Going further

- **multiprocessing / ProcessPoolExecutor** — CPU-heavy pure-Python work across cores.
- **Numba** — `@njit` compiles numeric Python functions to machine code.
- **Polars** — a very fast DataFrame library (Rust-based) for big tabular data.
- **PyTorch on GPU** — `tensor.to("cuda")` for massive parallel math.

## Check yourself

```quiz
? What should you do before optimizing code?
+ Measure / profile to find the real bottleneck
- Rewrite it in C
- Add more caching everywhere
> Optimizing the wrong part wastes time.

? `x in my_list` inside a loop over the same list is…
+ O(n²) — use a set or dict for membership checks
- O(1)
- Always fine
> List membership scans the list; set membership is a hash lookup.

? Why is `docs @ query` so much faster than a Python loop of dot products?
+ NumPy does all the math in optimized compiled code in one call
- It skips some documents
- It uses less precision
> That's vectorization.

? Which LLM-side change usually saves the most money for a big repeated system prompt?
+ Prompt caching
- Lower temperature
- More max_tokens
> Cached input tokens cost a fraction of normal input tokens.
```

:::keypoints
- **Measure first**: `timeit` for snippets, `cProfile` for whole programs.
- Pick the right structure (set/dict for lookups) — algorithmic wins beat micro-tweaks.
- **Vectorize** numeric work with NumPy; use `float32` for embeddings.
- **Cache** repeated calls, **batch** API requests, **stream** outputs.
- For LLM apps, optimize **tokens**: caching, shorter prompts, right-sized outputs, concurrency, Batch API.
:::
