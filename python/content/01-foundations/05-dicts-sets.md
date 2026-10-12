---
title: Dictionaries & Sets
level: easy
time: 25
summary: Dictionaries map keys to values — they are exactly how JSON, API requests and chat messages look in Python. Sets store unique items and answer "is this in here?" instantly.
---

If you learn one data structure deeply for AI work, make it the **dictionary**. Every LLM API request is a dictionary. Every chat message is a dictionary. Every JSON response becomes a dictionary.

```python
# This is a real-looking LLM request — it's just dictionaries and lists!
request = {
    "model": "claude-opus-5-5",
    "max_tokens": 1024,
    "messages": [
        {"role": "user", "content": "What is a dictionary in Python?"}
    ],
}
```

## Dictionaries

:::def Dictionary (dict)
A collection of **key → value** pairs written with curly braces: `{"name": "Ada", "age": 36}`. You look values up by their **key** (like a word in a real dictionary), not by position. Keys must be unique.
:::

:::syntax
```python
d = {"key1": value1, "key2": value2}
d["key1"]            # read (KeyError if missing)
d.get("key1")        # read (None if missing)
d["key3"] = value3   # add or update
del d["key1"]        # delete
"key2" in d          # does the key exist?
```
:::

```python run level=easy
user = {"name": "Ada", "plan": "pro", "tokens_used": 1200}

print(user["name"])
print(user.get("email"))                 # missing key -> None, no crash
print(user.get("email", "not set"))      # with a default

user["tokens_used"] += 300               # update
user["email"] = "ada@example.com"        # add a new key
print(user)

del user["plan"]
print("plan" in user, "email" in user)
print(len(user), "keys")
```

:::analogy
A list is like a **numbered row of lockers** — you find things by locker number. A dictionary is like a **coat check** — you hand over a ticket (the key) and get exactly your coat (the value) back, instantly, no matter how many coats there are.
:::

### Looping over a dictionary

```python run level=easy
prices = {"claude-opus-5-5": 4.00, "claude-sonnet-5-5": 2.00, "claude-haiku-4-5": 1.00}

for model in prices:                    # loops over KEYS
    print(model)

for model, price in prices.items():     # keys AND values
    print(f"{model:<20} ${price:.2f} / 1M input tokens")

print(list(prices.keys()))
print(list(prices.values()))
cheapest = min(prices, key=prices.get)  # key with the smallest value
print("cheapest:", cheapest)
```

| Method | Returns |
|---|---|
| `.keys()` | all keys |
| `.values()` | all values |
| `.items()` | `(key, value)` pairs |
| `.get(k, default)` | value or default |
| `.update(other)` | merge another dict in |
| `.pop(k, default)` | remove `k` and return its value |
| `.setdefault(k, v)` | get `k`, or set it to `v` first if missing |

### Merging dictionaries

A very common pattern: **default settings** overridden by **user settings**.

```python run level=intermediate
defaults = {"model": "claude-opus-5-5", "max_tokens": 1024, "temperature": 1.0}
user_opts = {"max_tokens": 4096}

config = defaults | user_opts          # Python 3.9+: right side wins
print(config)

config2 = {**defaults, **user_opts, "stream": True}   # older unpacking style
print(config2)
```

## Nested data: lists of dicts, dicts of lists

Real data is nested. Practice reading it step by step — **one bracket at a time**.

```python run level=intermediate
response = {
    "id": "msg_01",
    "model": "claude-opus-5-5",
    "content": [
        {"type": "text", "text": "Paris is the capital of France."}
    ],
    "usage": {"input_tokens": 14, "output_tokens": 9},
}

print(response["content"])               # a list
print(response["content"][0])            # its first dict
print(response["content"][0]["text"])    # the text inside
usage = response["usage"]
print("total tokens:", usage["input_tokens"] + usage["output_tokens"])
```

:::tip Read nested data like an address
`response["content"][0]["text"]` reads as: *"in response, go to content → take item 0 → take its text"*. When lost, `print()` each step.
:::

### Building a chat history

```python run level=intermediate
messages = []

def add(role, content):
    messages.append({"role": role, "content": content})

add("user", "Hi! What's 2 + 2?")
add("assistant", "2 + 2 = 4.")
add("user", "And times 10?")

for m in messages:
    print(f"{m['role']:>9} | {m['content']}")

user_turns = [m for m in messages if m["role"] == "user"]
print(len(user_turns), "user messages")
```

:::warn Quotes inside f-strings
Inside an f-string that uses double quotes, use **single** quotes for dictionary keys: `f"{m['role']}"`. (Python 3.12+ allows reusing the same quotes, but mixing them works everywhere.)
:::

## Counting with dictionaries

Counting things is everywhere in NLP: word frequencies, label counts, token statistics.

```python run level=intermediate
text = "the cat sat on the mat the end"

counts = {}
for word in text.split():
    counts[word] = counts.get(word, 0) + 1     # 0 if new, then add 1
print(counts)

# sort by count, highest first
for word, n in sorted(counts.items(), key=lambda kv: kv[1], reverse=True):
    print(word, n)
```

Python has a ready-made tool for this, `collections.Counter`, which you'll meet in the Intermediate module:

```python run level=intermediate
from collections import Counter
print(Counter("the cat sat on the mat the end".split()).most_common(2))
```

### Dictionary keys must be immutable

Keys can be strings, numbers, or tuples — but **not** lists (they can change).

```python run level=advanced
cache = {}
cache[("claude-opus-5-5", "What is AI?")] = "AI is..."   # tuple key: OK
print(cache)

# A bigram model counts pairs of words — tuples are perfect keys
words = "to be or not to be".split()
bigrams = {}
for pair in zip(words, words[1:]):
    bigrams[pair] = bigrams.get(pair, 0) + 1
print(bigrams)
```

## Sets

:::def Set
An **unordered** collection of **unique** items, written with curly braces: `{1, 2, 3}`. Duplicates are removed automatically, and checking `x in my_set` is extremely fast, even with millions of items.
:::

```python run level=easy
tags = {"python", "ai", "python", "ml", "ai"}
print(tags)                    # duplicates gone (order may vary)
print(len(tags))

tags.add("llm")
tags.discard("ml")             # remove if present (no error if missing)
print("ai" in tags)

words = "to be or not to be".split()
print(sorted(set(words)))      # unique words — a tiny "vocabulary"
```

:::warn Empty set
`{}` creates an empty **dictionary**, not a set. Use `set()` for an empty set.
:::

### Set math

```python run level=intermediate
doc_a = set("machine learning is fun and useful".split())
doc_b = set("deep learning is a part of machine learning".split())

print("both:  ", doc_a & doc_b)     # intersection
print("either:", doc_a | doc_b)     # union
print("only A:", doc_a - doc_b)     # difference

# Jaccard similarity: overlap / total — a simple text-similarity score
jaccard = len(doc_a & doc_b) / len(doc_a | doc_b)
print(f"Jaccard similarity: {jaccard:.2f}")
```

:::def Jaccard similarity
A score between 0 and 1 measuring how much two sets overlap: size of the intersection divided by size of the union. Used for quick near-duplicate detection in datasets.
:::

### Fast membership — why sets matter

```python run level=advanced
import time

stopwords_list = [f"word{i}" for i in range(50_000)]
stopwords_set = set(stopwords_list)

t = time.perf_counter()
for _ in range(500):
    "word49999" in stopwords_list    # scans the whole list every time
list_time = time.perf_counter() - t

t = time.perf_counter()
for _ in range(500):
    "word49999" in stopwords_set     # instant hash lookup
set_time = time.perf_counter() - t

print(f"list: {list_time*1000:.1f} ms   set: {set_time*1000:.3f} ms")
```

:::def Hash
A number computed from a value that acts like its "fingerprint". Dicts and sets use hashes to jump straight to an item instead of searching. That is why their keys/items must be immutable.
:::

## Choosing the right container

| Need | Use |
|---|---|
| ordered items you will change | `list` |
| fixed group / record | `tuple` |
| look things up by a name/key | `dict` |
| unique items, fast `in` checks | `set` |

:::ai
- **Messages** sent to Claude/GPT: a `list` of `dict`s with `"role"` and `"content"`.
- **Vocabulary** of a tokenizer: a `dict` from token text → token id.
- **Deduplicating** a training dataset: a `set` of document hashes.
- **Caching** LLM answers: a `dict` from prompt → response.
:::

## Check yourself

```quiz
? `d = {"a": 1}`. What does `d.get("b", 0)` return?
+ 0
- None
- KeyError
> `.get()` returns the default (here 0) when the key is missing.

? What does `{}` create?
- An empty set
+ An empty dictionary
- An error
> Use `set()` for an empty set.

? `response["usage"]["output_tokens"]` reads…
+ the "output_tokens" value inside the "usage" dict inside response
- the second item of the usage list
- nothing — you can only use one bracket at a time
> You can chain lookups; each bracket goes one level deeper.

? Which can be a dictionary key?
+ ("model", 1)
- ["model", 1]
- {"model": 1}
> Keys must be immutable (hashable). Tuples are; lists and dicts are not.
```

:::exercise Token usage report
Given this list of API responses, compute the **total input tokens**, **total output tokens**, and **how many requests used each model**.

```python
logs = [
    {"model": "claude-opus-5-5", "usage": {"input": 1200, "output": 300}},
    {"model": "claude-haiku-4-5", "usage": {"input": 400, "output": 50}},
    {"model": "claude-opus-5-5", "usage": {"input": 900, "output": 250}},
]
```
:::

:::solution
```python run
logs = [
    {"model": "claude-opus-5-5", "usage": {"input": 1200, "output": 300}},
    {"model": "claude-haiku-4-5", "usage": {"input": 400, "output": 50}},
    {"model": "claude-opus-5-5", "usage": {"input": 900, "output": 250}},
]

total_in = sum(log["usage"]["input"] for log in logs)
total_out = sum(log["usage"]["output"] for log in logs)

per_model = {}
for log in logs:
    per_model[log["model"]] = per_model.get(log["model"], 0) + 1

print("input tokens:", total_in)
print("output tokens:", total_out)
print("requests per model:", per_model)
```
:::

:::keypoints
- A **dict** maps unique keys to values: `d[key]`, `d.get(key, default)`, `d.items()`.
- Merge with `a | b` (right wins). Nested data = read one bracket at a time.
- Chat messages, API requests and JSON are all **lists of dicts**.
- A **set** holds unique items with lightning-fast `in` checks and supports `&`, `|`, `-`.
- Keys and set items must be **immutable** (str, int, tuple).
:::
