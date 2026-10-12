---
title: Comprehensions
level: easy
time: 18
summary: Build lists, dicts and sets in one readable line. Comprehensions are how Python developers transform and filter data — you'll see them in every AI codebase.
---

A huge amount of AI code is "take this collection, transform each item, keep some of them". Python has a short, readable syntax for exactly that: **comprehensions**.

:::def List comprehension
A one-line way to build a new list from an existing collection: `[expression for item in collection if condition]`. It replaces a 3–4 line loop with an append.
:::

:::syntax
```python
[expression for item in iterable]
[expression for item in iterable if condition]
{key_expr: value_expr for item in iterable}     # dict comprehension
{expression for item in iterable}               # set comprehension
```
Read it in English: *"give me `expression`, for each `item` in `iterable`, if `condition`."*
:::

## From loop to comprehension

```python run level=easy
words = ["Transformers", "use", "Attention", "to", "read", "Text"]

# the loop way
lower = []
for w in words:
    lower.append(w.lower())
print(lower)

# the comprehension way — same result
lower = [w.lower() for w in words]
print(lower)

lengths = [len(w) for w in words]
print(lengths)

squares = [n ** 2 for n in range(6)]
print(squares)
```

## Filtering with if

```python run level=easy
words = ["Transformers", "use", "Attention", "to", "read", "Text"]

long_words = [w for w in words if len(w) > 3]
print(long_words)

capitalized = [w for w in words if w[0].isupper()]
print(capitalized)

scores = [0.12, 0.88, 0.45, 0.93, 0.67]
relevant = [s for s in scores if s >= 0.5]
print(relevant)
```

### if/else inside the expression

Notice the different position: a **filter** `if` goes at the end; a **choice** `if/else` goes at the front.

```python run level=intermediate
scores = [0.12, 0.88, 0.45, 0.93, 0.67]

labels = ["pos" if s >= 0.5 else "neg" for s in scores]   # choose for every item
print(labels)

clipped = [min(max(s, 0.2), 0.8) for s in scores]         # clip values into a range
print(clipped)
```

## Dict and set comprehensions

```python run level=easy
models = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]

name_lengths = {m: len(m) for m in models}
print(name_lengths)

vocab = ["<pad>", "<unk>", "the", "cat", "sat"]
token_to_id = {tok: i for i, tok in enumerate(vocab)}   # a tokenizer vocabulary!
id_to_token = {i: tok for tok, i in token_to_id.items()} # and its reverse
print(token_to_id)
print(id_to_token[3])

text = "the cat sat on the mat"
unique_letters = {ch for ch in text if ch.isalpha()}
print(sorted(unique_letters))
```

### Encode and decode text with a vocabulary

```python run level=intermediate
vocab = ["<unk>", "i", "love", "deep", "learning", "python"]
stoi = {w: i for i, w in enumerate(vocab)}   # "string to index"
itos = {i: w for w, i in stoi.items()}       # "index to string"

sentence = "i love python and deep learning"
ids = [stoi.get(w, stoi["<unk>"]) for w in sentence.split()]
print(ids)                                   # unknown words become 0
print(" ".join(itos[i] for i in ids))
```

:::ai
That `stoi` / `itos` pattern is exactly how tokenizers map text to the integer IDs a neural network actually sees. You will build a real one (BPE) in the Project Lab.
:::

## Nested comprehensions

You can have more than one `for`. They read **left to right, like nested loops**.

```python run level=intermediate
# flatten a list of lists — e.g. chunks from many documents
docs_chunks = [["a1", "a2"], ["b1"], ["c1", "c2", "c3"]]
all_chunks = [chunk for doc in docs_chunks for chunk in doc]
print(all_chunks)

# every combination (a grid search)
grid = [(lr, bs) for lr in [0.1, 0.01] for bs in [16, 32]]
print(grid)

# a matrix (list of rows)
matrix = [[r * 3 + c for c in range(3)] for r in range(3)]
print(matrix)

# transpose it (swap rows and columns)
transposed = [[row[i] for row in matrix] for i in range(3)]
print(transposed)
```

:::warn Keep it readable
If a comprehension needs more than one `for` **and** a condition, or does not fit on one line, a normal loop is usually clearer. Readability beats cleverness.
:::

## Generator expressions — lazy comprehensions

Swap the square brackets for round ones and you get a **generator expression**. It produces items one at a time instead of building the whole list in memory.

:::def Generator expression
`(expression for item in iterable)` — like a list comprehension, but **lazy**: values are produced only when needed. Perfect for feeding straight into `sum()`, `max()`, `any()`, `all()` or `"".join()`.
:::

```python run level=intermediate
token_counts = [120, 340, 90, 2000, 15]

print(sum(c for c in token_counts))               # no list is built
print(max(c for c in token_counts if c < 1000))
print(any(c > 1500 for c in token_counts))        # is any over 1500?
print(all(c > 10 for c in token_counts))          # are all over 10?

words = ["deep", "learning"]
print("-".join(w.upper() for w in words))
```

```python run level=advanced
import sys

as_list = [n * n for n in range(1_000_000)]
as_gen = (n * n for n in range(1_000_000))
print("list size:", sys.getsizeof(as_list), "bytes")
print("generator size:", sys.getsizeof(as_gen), "bytes")   # tiny — it stores the recipe, not the data
print(sum(as_gen))
```

## A real data-prep pipeline

Comprehensions chain together nicely into small pipelines — this is typical preprocessing before building a RAG index or training a classifier:

```python run level=advanced
raw_reviews = [
    {"text": "  Loved it!! Best course ever  ", "stars": 5},
    {"text": "", "stars": 3},
    {"text": "Too hard for beginners.", "stars": 2},
    {"text": "Great examples, clear definitions", "stars": 5},
    {"text": "ok", "stars": 3},
]

# 1. drop empty / tiny texts and clean whitespace
cleaned = [{**r, "text": " ".join(r["text"].split())} for r in raw_reviews if len(r["text"].strip()) > 3]

# 2. turn stars into a label
dataset = [(r["text"], "positive" if r["stars"] >= 4 else "negative") for r in cleaned]

# 3. label counts
label_counts = {label: sum(1 for _, l in dataset if l == label) for label in {l for _, l in dataset}}

for text, label in dataset:
    print(f"{label:<9} | {text}")
print(label_counts)
```

## Check yourself

```quiz
? What does `[x * 2 for x in range(4) if x % 2 == 0]` give?
+ [0, 4]
- [0, 2, 4, 6]
- [2, 6]
> Only even x (0 and 2) pass the filter, then each is doubled.

? Where does a filtering `if` go in a list comprehension?
- At the very start
+ At the end, after the `for` part
- Inside the brackets of range()
> Filter: `[x for x in xs if cond]`. Choice: `[a if cond else b for x in xs]`.

? Why use `sum(x for x in data)` instead of `sum([x for x in data])`?
+ It does not build a temporary list, so it uses less memory
- It gives a different answer
- It is required by Python
> Generator expressions produce values lazily. Same result, less memory.
```

:::exercise Clean a vocabulary
Given `text = "The model reads the text. The text is long!"`:
1. Make a list of lowercase words with punctuation (`.` and `!`) removed.
2. Build a **sorted** vocabulary (unique words).
3. Build a dict `word -> id` using `enumerate`.
4. Encode the text as a list of ids.
:::

:::solution
```python run
text = "The model reads the text. The text is long!"

words = [w.strip(".!").lower() for w in text.split()]
vocab = sorted(set(words))
stoi = {w: i for i, w in enumerate(vocab)}
ids = [stoi[w] for w in words]

print(words)
print(vocab)
print(stoi)
print(ids)
```
:::

:::keypoints
- `[expr for x in items if cond]` builds a list in one readable line.
- Filter `if` goes at the end; choice `a if cond else b` goes at the front.
- Dict `{k: v for ...}` and set `{x for ...}` comprehensions work the same way.
- Round brackets give a lazy **generator expression** — ideal inside `sum()`, `any()`, `join()`.
- If it gets complicated, go back to a normal loop.
:::
