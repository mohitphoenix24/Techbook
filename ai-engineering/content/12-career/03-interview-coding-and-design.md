---
title: Coding Rounds and Take-Home Exercises
level: intermediate
time: 50
summary: The hands-on questions that appear in AI engineering interviews, each with a runnable reference solution — cosine top-k search, softmax with temperature, chunking with overlap, recall@k and MRR, a rate limiter, JSON repair and validation, a retry wrapper, a tiny BPE step, and a reciprocal-rank-fusion merge. Plus a checklist for take-home assignments and live debugging rounds.
---

Besides concept and design questions, many companies run a **live coding round** or **take-home**. They test whether you can write clean, correct code for the small algorithmic pieces around LLM systems, and talk about trade-offs while you do. Practise each exercise below: cover the solution, write your own, then compare. All the solutions run in the browser.

## How to approach a coding round

1. **Restate the problem**, confirm inputs, outputs and edge cases (empty input, ties, huge input).
2. Start with the **simplest correct version**, then optimise if asked. Say the complexity.
3. **Test as you go** with tiny examples, and include an edge case.
4. Name things well, keep functions small, and mention what you would do in production (batching, numerical stability, error handling).
5. If stuck, think aloud; interviewers reward reasoning and recovery.

## 1. Top-k cosine similarity search

*Given a matrix of document embeddings and a query vector, return the indices of the k most similar documents.*

```python run title="Exercise 1: cosine top-k with NumPy" level=easy
import numpy as np

def top_k_cosine(docs, query, k=3):
    docs = np.asarray(docs, dtype=float); query = np.asarray(query, dtype=float)
    d = docs / np.maximum(np.linalg.norm(docs, axis=1, keepdims=True), 1e-12)      # normalise rows (guard against zero vectors)
    q = query / max(np.linalg.norm(query), 1e-12)
    scores = d @ q                                                                   # cosine similarity for all docs at once
    k = min(k, len(scores))
    idx = np.argpartition(-scores, k - 1)[:k]                                        # O(n) selection of the top k
    idx = idx[np.argsort(-scores[idx])]                                              # sort only those k
    return idx.tolist(), scores[idx].round(3).tolist()

docs = [[1, 0, 0], [0.9, 0.1, 0], [0, 1, 0], [0, 0, 1], [0.7, 0.7, 0]]
print(top_k_cosine(docs, [1, 0.1, 0], k=3))
print("zero query vector does not crash:", top_k_cosine(docs, [0, 0, 0], k=2))
print("k larger than the corpus is clipped:", top_k_cosine(docs[:2], [1, 0, 0], k=5))
```

*Follow-ups*: for millions of vectors, mention **approximate nearest neighbour** indexes (HNSW, IVF), quantisation and filtering.

## 2. Softmax with temperature (numerically stable)

```python run title="Exercise 2: stable softmax, temperature, top-p" level=easy
import numpy as np

def softmax(logits, temperature=1.0):
    z = np.asarray(logits, dtype=float) / max(temperature, 1e-8)
    z = z - z.max()                                        # subtract the max so exp() cannot overflow
    e = np.exp(z)
    return e / e.sum()

def top_p_filter(probs, p=0.9):
    order = np.argsort(-probs)
    cum = np.cumsum(probs[order])
    keep = order[: int(np.searchsorted(cum, p) + 1)]       # smallest set whose mass reaches p
    out = np.zeros_like(probs); out[keep] = probs[keep]
    return out / out.sum()

logits = [2.0, 1.0, 0.1, -1.0]
for t in (0.2, 1.0, 2.0):
    print(f"T={t}: {softmax(logits, t).round(3)}")
print("top-p 0.9 :", top_p_filter(softmax(logits), 0.9).round(3))
print("huge logits do not overflow:", softmax([1000, 999, 0]).round(3))
```

## 3. Chunk text with overlap

*Split a document into chunks of at most `size` words with `overlap` words shared between neighbours.*

```python run title="Exercise 3: sliding-window chunking" level=easy
def chunk(words, size=8, overlap=2):
    if overlap >= size: raise ValueError("overlap must be smaller than size")
    step = size - overlap
    chunks = []
    for start in range(0, max(len(words) - overlap, 1), step):          # stop when the tail is already covered
        chunks.append(" ".join(words[start:start + size]))
        if start + size >= len(words): break
    return chunks

text = "the quick brown fox jumps over the lazy dog while the cat sleeps on the warm sunny windowsill today".split()
for i, c in enumerate(chunk(text)):
    print(i, "|", c)
print("single short doc:", chunk("only three words".split()))
```

*Follow-ups*: token-based rather than word-based chunking, respecting sentence and heading boundaries, and storing offsets for citations.

## 4. Retrieval metrics: recall@k, MRR, nDCG

```python run title="Exercise 4: evaluation metrics for retrieval" level=intermediate
import math

def recall_at_k(ranked, relevant, k):
    return len(set(ranked[:k]) & set(relevant)) / len(relevant) if relevant else 0.0

def mrr(ranked, relevant):
    for i, d in enumerate(ranked, 1):
        if d in relevant: return 1 / i
    return 0.0

def ndcg_at_k(ranked, relevant, k):
    dcg = sum(1 / math.log2(i + 1) for i, d in enumerate(ranked[:k], 1) if d in relevant)
    ideal = sum(1 / math.log2(i + 1) for i in range(1, min(len(relevant), k) + 1))
    return dcg / ideal if ideal else 0.0

queries = {"q1": (["d3", "d1", "d9", "d2"], {"d1", "d2"}), "q2": (["d7", "d8", "d4"], {"d4"}), "q3": (["d5", "d6"], {"d0"})}
for k in (1, 3):
    print(f"recall@{k}:", round(sum(recall_at_k(r, rel, k) for r, rel in queries.values()) / len(queries), 3))
print("MRR      :", round(sum(mrr(r, rel) for r, rel in queries.values()) / len(queries), 3))
print("nDCG@3   :", round(sum(ndcg_at_k(r, rel, 3) for r, rel in queries.values()) / len(queries), 3))
```

## 5. Reciprocal rank fusion (hybrid search)

```python run title="Exercise 5: merge BM25 and vector rankings with RRF" level=intermediate
from collections import defaultdict

def rrf(rankings, k=60):
    scores = defaultdict(float)
    for ranking in rankings:
        for rank, doc in enumerate(ranking, 1):
            scores[doc] += 1 / (k + rank)                      # documents ranked high in any list rise to the top
    return sorted(scores, key=lambda d: (-scores[d], d))

bm25   = ["errcode-42", "doc-a", "doc-b", "doc-c"]             # keyword search nails the exact identifier
vector = ["doc-b", "doc-d", "doc-a", "errcode-42"]             # semantic search finds paraphrases
print(rrf([bm25, vector]))
print("a document found by both lists beats one found by only one, with no score normalisation needed")
```

## 6. A token-bucket rate limiter

```python run title="Exercise 6: token bucket with a fake clock (testable)" level=intermediate
class RateLimiter:
    def __init__(self, rate_per_s, burst, clock):
        self.rate, self.capacity, self.tokens, self.clock = rate_per_s, burst, burst, clock
        self.last = clock()
    def acquire(self, cost=1):
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.rate)
        self.last = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False

t = [0.0]
rl = RateLimiter(rate_per_s=2, burst=4, clock=lambda: t[0])           # injecting the clock makes the code deterministic to test
print([rl.acquire() for _ in range(6)])                                # burst of 4 allowed, then rejected
t[0] += 1.0                                                            # one second later: 2 tokens refilled
print([rl.acquire() for _ in range(3)])
```

## 7. Robust JSON extraction and validation

*Models often wrap JSON in prose or markdown fences. Extract the first valid JSON object and validate it against expected fields.*

```python run title="Exercise 7: parse, validate, and produce a useful error for a retry" level=intermediate
import json, re

FENCE = "`" * 3                                                          # a markdown code fence, built so it does not end this block

def extract_json(text):
    fenced = re.search(FENCE + r"(?:json)?\s*(\{.*?\})\s*" + FENCE, text, re.S)
    candidates = [fenced.group(1)] if fenced else []
    start = text.find("{")
    while start != -1:                                                   # fall back: try every '{' as a possible start
        depth = 0
        for i in range(start, len(text)):
            depth += text[i] == "{"; depth -= text[i] == "}"
            if depth == 0:
                candidates.append(text[start:i + 1]); break
        start = text.find("{", start + 1)
    for c in candidates:
        try: return json.loads(c)
        except json.JSONDecodeError: continue
    raise ValueError("no valid JSON object found")

def validate(obj, schema):
    errors = []
    for field, typ in schema.items():
        if field not in obj: errors.append(f"missing field '{field}'")
        elif not isinstance(obj[field], typ): errors.append(f"field '{field}' should be {typ.__name__}, got {type(obj[field]).__name__}")
    return errors

reply = "Sure! Here is the data:\n" + FENCE + 'json\n{"name": "Ada", "age": "36", "tags": ["ml"]}\n' + FENCE + "\nLet me know if you need more."
obj = extract_json(reply)
errors = validate(obj, {"name": str, "age": int, "tags": list})
print("parsed:", obj)
print("errors to send back to the model for a repair attempt:", errors)
print("plain JSON in prose also works:", extract_json('The answer is {"ok": true} as requested.'))
```

## 8. Retry wrapper with exponential backoff

```python run title="Exercise 8: retries with backoff, only for transient errors" level=intermediate
import random

class Transient(Exception): pass
class Permanent(Exception): pass

def with_retries(fn, attempts=5, base=0.5, cap=8.0, sleep=lambda s: None, rng=random.Random(0)):
    for i in range(attempts):
        try:
            return fn()
        except Permanent:
            raise                                                      # do not retry validation or auth errors
        except Transient:
            if i == attempts - 1: raise
            delay = min(cap, base * 2 ** i) * rng.random()             # full jitter
            sleep(delay)

calls = {"n": 0}
def flaky():
    calls["n"] += 1
    if calls["n"] < 3: raise Transient("429")
    return "ok"
print(with_retries(flaky), "after", calls["n"], "calls")
def bad(): raise Permanent("invalid api key")
try: with_retries(bad)
except Permanent as e: print("permanent error raised immediately:", e)
```

## 9. One step of byte-pair encoding

```python run title="Exercise 9: find and merge the most frequent adjacent pair" level=intermediate
from collections import Counter

def most_frequent_pair(tokens_list):
    pairs = Counter()
    for toks in tokens_list:
        pairs.update(zip(toks, toks[1:]))
    return pairs.most_common(1)[0] if pairs else None

def merge(toks, pair, new):
    out, i = [], 0
    while i < len(toks):
        if i < len(toks) - 1 and (toks[i], toks[i + 1]) == pair:
            out.append(new); i += 2
        else:
            out.append(toks[i]); i += 1
    return out

corpus = [list("low"), list("lower"), list("lowest"), list("newer")]
for step in range(3):
    best = most_frequent_pair(corpus)
    pair, count = best
    new = pair[0] + pair[1]
    corpus = [merge(t, pair, new) for t in corpus]
    print(f"merge {step + 1}: {pair} (seen {count}x) -> {new!r}   {corpus[1]}")
```

## 10. Debugging round: find the bug

Interviewers sometimes hand you broken code. Practise reading for classic LLM-app bugs:

```python run title="Exercise 10: spot the bug (the buggy version is first)" level=intermediate
# BUGGY: appends the model reply to the SAME list used for the next call and mutates the shared default
def chat_turn_buggy(user, history=[]):
    history.append({"role": "user", "content": user})
    reply = f"echo:{user}"
    history.append({"role": "assistant", "content": reply})
    return reply, history

_, h1 = chat_turn_buggy("hello")
_, h2 = chat_turn_buggy("different user")                      # leaks the first user's messages into the second conversation!
print("buggy second conversation has", len(h2), "messages (should be 2)")

def chat_turn(user, history=None):
    history = list(history or [])                                # fresh list, no shared mutable default
    history.append({"role": "user", "content": user})
    reply = f"echo:{user}"
    history.append({"role": "assistant", "content": reply})
    return reply, history

_, g1 = chat_turn("hello"); _, g2 = chat_turn("different user")
print("fixed second conversation has", len(g2), "messages")
```

Other classic bugs to look for: **cross-tenant state in globals or caches**, **missing `max_tokens` handling (truncated JSON)**, **not awaiting async calls**, **swallowing exceptions**, **retrying non-idempotent tool calls**, **building prompts with string concatenation of untrusted input**, **appending the whole history without a token budget**, and **comparing floats or embeddings with `==`**.

## Take-home assignments

Typical brief: "Build a small RAG/agent/extraction service in 4 hours and write up your approach." What stands out:

| Do | Avoid |
|---|---|
| A **README** with design choices, trade-offs, how to run, known limits | code only |
| A small **eval set** and results table (even 20 cases) with failure analysis | "it seems to work" |
| **Clear structure**: model client behind an interface, config, tests | one giant notebook |
| Handling **errors, timeouts, and bad inputs** | only the happy path |
| Realistic **cost and latency** notes | ignoring them |
| Honest list of **what you would do with more time** | claiming perfection |
| Staying **within the time box** and scope | over-engineering |

Keep secrets out of the repo, make it runnable with one command, and include a short demo script or recording if allowed.

```quiz
? Why subtract the maximum logit before exponentiating in softmax?
+ It prevents overflow without changing the result
- It makes the output random
- It speeds up sorting
> The shift cancels in the normalisation.

? What does reciprocal rank fusion combine?
+ Rankings from different retrievers using ranks instead of raw scores
- Embeddings from different models
- Two prompts
> Ranks are comparable across systems even when scores are not.

? Why inject a clock into a rate limiter?
+ So tests can control time and stay deterministic
- To make it faster
- To store logs
> Dependency injection makes time-based code testable.

? What is wrong with a mutable default argument like history=[] in a chat function?
+ The same list is shared across calls, leaking state between conversations
- It is slower
- Python forbids it
> Use None and create a fresh list inside the function.
```

:::problem In a live round you are asked: "Write a function that, given a long document and a model with a 4,000-token limit, produces a summary." Outline your approach and edge cases. {level=medium tags="coding,summarization"}
Think map-reduce and budgets.

:::solution Model answer
Count tokens, reserve space for instructions and output, and if the document fits, summarise in one call. Otherwise **split into chunks** at natural boundaries (sections/paragraphs) within the budget, **summarise each chunk** (map, parallelisable with a concurrency limit), then **combine the partial summaries** (reduce); if the combined text is still too long, repeat the reduce hierarchically. Edge cases: empty document, a single paragraph longer than the budget (split by sentence), non-text content, rate limits and retries, preserving key entities and numbers across chunks (ask for structured notes), and cost control. Mention evaluating summaries for faithfulness and coverage, and an alternative using a long-context model when the whole document fits.
:::
:::

:::keypoints
- Coding rounds test small, clean implementations: cosine top-k, stable softmax and top-p, chunking with overlap, retrieval metrics, rank fusion, rate limiting, JSON extraction and validation, retries, BPE steps.
- State assumptions, handle edge cases, test with tiny examples, and discuss complexity and production concerns.
- Use dependency injection (clocks, random generators) to keep time- and randomness-dependent code testable.
- In debugging rounds look for shared mutable state, truncation, unawaited calls, swallowed errors, unsafe retries and prompt string-building.
- Take-homes are judged on README, evals, structure, error handling, honesty about limits and staying within scope.
:::

:::resources
- [NumPy documentation](https://numpy.org/doc/stable/) — array operations for the vector exercises.
- [Pyodide](https://pyodide.org) — run Python in the browser, as this course does.
- [Rank fusion: Cormack et al. (RRF) via Elasticsearch docs](https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html) — reciprocal rank fusion in practice.
- [Karpathy: Let's build the GPT Tokenizer (video)](https://www.youtube.com/watch?v=zduSFxRajkE) — implement BPE end to end.
- [Python docs: heapq](https://docs.python.org/3/library/heapq.html) — the standard-library heap for top-k problems.
- [Chip Huyen: ML interviews book](https://huyenchip.com/ml-interviews-book/) — sample coding and design questions.
:::
