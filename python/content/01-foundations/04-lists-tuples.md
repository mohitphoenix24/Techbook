---
title: Lists & Tuples
level: easy
time: 22
summary: Store many values in order. Lists hold chat histories, batches and datasets; tuples hold fixed groups like shapes and (x, y) pairs.
---

One value is rarely enough. A chat is a **list** of messages. A dataset is a **list** of examples. A batch is a **list** of inputs. A tensor's shape is a **tuple** like `(32, 512)`.

## Lists

:::def List
An **ordered**, **changeable** collection of values written in square brackets: `[1, 2, 3]`. Items can be any type, and you can add, remove and change them.
:::

:::syntax
```python
my_list = [item0, item1, item2]
my_list[0]           # first item
my_list[-1]          # last item
my_list[1:3]         # slice: items 1 and 2
len(my_list)         # how many items
```
:::

```python run level=easy
models = ["claude", "gpt", "gemini", "llama"]

print(models)
print(models[0])         # first
print(models[-1])        # last
print(models[1:3])       # slice — same rules as strings
print(len(models))
print("gpt" in models)   # membership test
```

### Changing a list

```python run level=easy
history = ["Hi!"]

history.append("Hello! How can I help?")   # add to the end
history.append("What is RAG?")
print(history)

history.insert(0, "[conversation start]")  # add at a position
print(history)

history[1] = "Hi there!"                   # replace an item
removed = history.pop()                    # remove & return the last item
print("popped:", removed)

history.remove("[conversation start]")     # remove by value
print(history)
```

| Method | What it does |
|---|---|
| `.append(x)` | add `x` to the end |
| `.extend(other)` | add every item of another list |
| `.insert(i, x)` | add `x` at position `i` |
| `.pop()` / `.pop(i)` | remove and return the last item / item `i` |
| `.remove(x)` | remove the first `x` (error if missing) |
| `.index(x)` | position of `x` |
| `.count(x)` | how many `x` |
| `.sort()` / `.reverse()` | sort / reverse **in place** |
| `.copy()` | a shallow copy |

### Useful built-in functions on lists

```python run level=easy
losses = [2.31, 1.87, 1.42, 1.15, 0.98, 1.02, 0.91]

print("epochs:", len(losses))
print("lowest loss:", min(losses))
print("highest loss:", max(losses))
print("total:", round(sum(losses), 2))
print("average:", round(sum(losses) / len(losses), 3))
print("sorted:", sorted(losses))                  # new sorted list
print("best epoch:", losses.index(min(losses)))   # position of the minimum
```

:::warn sort() vs sorted()
`my_list.sort()` changes the list and returns `None`. `sorted(my_list)` returns a **new** list and keeps the original. A classic bug: `x = my_list.sort()` makes `x` equal to `None`.
:::

### Sorting with a key

```python run level=intermediate
docs = ["a long document about transformers", "short", "medium length text"]
print(sorted(docs, key=len))                  # by length
print(sorted(docs, key=len, reverse=True))    # longest first

scores = [("doc-a", 0.82), ("doc-b", 0.95), ("doc-c", 0.40)]
top = sorted(scores, key=lambda pair: pair[1], reverse=True)
print(top)        # ranked like search results
print(top[:2])    # top-2 results
```

`lambda pair: pair[1]` is a tiny unnamed function that says "sort by the second item". You will meet lambdas properly in the Functions lesson.

## Lists inside lists

Lists can hold other lists. This is how you represent a **table** or a **matrix** in plain Python (later, NumPy does this much faster).

```python run level=intermediate
matrix = [
    [1, 2, 3],
    [4, 5, 6],
]
print(matrix[1])       # second row
print(matrix[1][2])    # row 1, column 2 -> 6

# a chat history: a list of [role, text] pairs
chat = [["user", "Hi"], ["assistant", "Hello!"], ["user", "Tell me a joke"]]
for role, text in chat:
    print(f"{role:>9}: {text}")
```

## Copying: the #1 list surprise

:::def Reference
A variable does not hold the list itself — it holds a **reference** (a pointer) to it. Two names can point to the **same** list.
:::

```python run level=intermediate
a = [1, 2, 3]
b = a            # NOT a copy — b points to the same list
b.append(4)
print("a:", a)   # a changed too!

c = a.copy()     # a real (shallow) copy; a[:] or list(a) also work
c.append(99)
print("a:", a)
print("c:", c)
```

:::analogy
`b = a` is like giving someone the **address** of your house, not building them a new house. If they paint the walls, your walls change too. `.copy()` builds a new house with the same furniture.
:::

For lists inside lists, use `copy.deepcopy()` — a shallow copy still shares the inner lists.

```python run level=advanced
import copy

grid = [[0, 0], [0, 0]]
shallow = grid.copy()
deep = copy.deepcopy(grid)

grid[0][0] = 99
print("shallow:", shallow)   # inner list is shared -> changed
print("deep:   ", deep)      # fully independent
```

## Tuples

:::def Tuple
An **ordered**, **unchangeable** (immutable) collection, written with round brackets: `(1, 2, 3)`. Use a tuple for a fixed group of values that belong together, like a shape `(rows, cols)` or a point `(x, y)`.
:::

```python run level=easy
shape = (32, 512)           # batch size, sequence length
print(shape[0], shape[1])
print(len(shape))

point = 3, 4                # brackets are optional
print(point, type(point))

single = (5,)               # a one-item tuple NEEDS the comma
print(type(single), type((5)))
```

```python run level=easy expect-error
shape = (32, 512)
shape[0] = 64               # tuples cannot be changed!
```

### Unpacking

:::def Unpacking
Assigning the items of a list or tuple to several names at once: `rows, cols = (32, 512)`. Use `*rest` to collect "everything else".
:::

```python run level=intermediate
rows, cols = (32, 512)
print(rows, cols)

first, *middle, last = [10, 20, 30, 40, 50]
print(first, middle, last)

# functions often return tuples
def min_max(values):
    return min(values), max(values)

lo, hi = min_max([4, 8, 1, 9])
print(lo, hi)
```

### List or tuple — which one?

| Use a **list** when… | Use a **tuple** when… |
|---|---|
| items will be added or removed | the group is fixed |
| all items are the same kind (a batch of prompts) | items have different meanings by position (`(name, score)`) |
| | you need it as a dictionary key or set item |

## Handy tools: range, enumerate, zip

```python run level=intermediate
print(list(range(5)))          # 0..4
print(list(range(2, 10, 3)))   # start 2, stop before 10, step 3

prompts = ["Summarize", "Translate", "Classify"]
for i, p in enumerate(prompts, start=1):      # position + item
    print(i, p)

questions = ["2+2?", "Capital of Japan?"]
answers = ["4", "Tokyo"]
for q, a in zip(questions, answers):           # walk two lists together
    print(f"Q: {q}  A: {a}")

pairs = list(zip(questions, answers))
print(pairs)
```

:::ai Batching
LLM and embedding APIs work faster and cheaper when you send items in **batches**. Here is the classic slicing trick for splitting a big list into chunks of size `n`:
:::

```python run level=advanced
documents = [f"doc-{i}" for i in range(11)]
batch_size = 4

batches = [documents[i:i + batch_size] for i in range(0, len(documents), batch_size)]
for b in batches:
    print(len(b), b)
```

## Check yourself

```quiz
? `nums = [5, 1, 4]`. What is `nums.sort()`?
- [1, 4, 5]
+ None (it sorts nums in place)
- [5, 4, 1]
> `.sort()` changes the list and returns None. Use `sorted(nums)` to get a new list.

? After `a = [1, 2]; b = a; b.append(3)`, what is `a`?
- [1, 2]
+ [1, 2, 3]
- An error
> `b = a` copies the reference, not the list. Both names point to the same list.

? Which creates a one-item tuple?
- (7)
+ (7,)
- [7]
> The comma makes the tuple. `(7)` is just the number 7 in brackets.
```

:::exercise Top-k retrieval
You have search results as `(document, score)` pairs:

```python
results = [("intro.md", 0.42), ("rag.md", 0.91), ("agents.md", 0.77), ("faq.md", 0.88)]
```
Print the **top 3** documents by score, numbered from 1, like `1. rag.md (0.91)`.
:::

:::solution
```python run
results = [("intro.md", 0.42), ("rag.md", 0.91), ("agents.md", 0.77), ("faq.md", 0.88)]

top3 = sorted(results, key=lambda r: r[1], reverse=True)[:3]
for rank, (doc, score) in enumerate(top3, start=1):
    print(f"{rank}. {doc} ({score})")
```
:::

:::keypoints
- **Lists** `[...]` are ordered and changeable; **tuples** `(...)` are ordered and fixed.
- Index from 0, slice with `[start:stop]`, use `len()`, `in`, `min()`, `max()`, `sum()`, `sorted()`.
- `b = a` shares the same list — use `.copy()` (or `deepcopy`) to copy.
- `enumerate()` gives positions, `zip()` walks lists together, unpacking assigns many names at once.
- Slicing in steps (`docs[i:i+n]`) is the standard way to make **batches**.
:::
