---
title: NumPy Essentials
level: intermediate
time: 35
summary: Fast arrays of numbers — the foundation of all ML and deep learning. Create arrays, understand shapes, index and slice, do math on whole arrays, and master broadcasting.
---

Every image, sentence embedding, model weight and batch of data in AI is an **array of numbers**. NumPy is the Python library for working with those arrays fast. PyTorch tensors, pandas DataFrames and scikit-learn all build on NumPy's ideas, so learning it well pays off everywhere.

:::def NumPy array (ndarray)
A grid of numbers where every element has the **same type** (e.g. all `float32`). It can have any number of dimensions. Operations on arrays run in fast compiled code instead of slow Python loops.
:::

```python run level=easy
import numpy as np

a = np.array([1, 2, 3, 4])
print(a)
print(a * 10)          # math on every element — no loop!
print(a + a)
print(a ** 2)
print(a.sum(), a.mean(), a.max())

python_list = [1, 2, 3, 4]
print(python_list * 2)  # for lists, * means "repeat" — very different!
```

## Shape, dimensions and dtype

:::def Shape
A tuple giving the size of each dimension. A vector of 4 numbers has shape `(4,)`; a table with 2 rows and 3 columns has shape `(2, 3)`; a batch of 32 RGB images 224×224 has shape `(32, 224, 224, 3)`.
:::

:::def dtype
The data type of the elements: `int64`, `float64`, `float32`, `bool`… All elements of an array share one dtype. Deep learning usually uses `float32` (or smaller) to save memory.
:::

| Name | Dimensions (`ndim`) | Example shape | Example in AI |
|---|---|---|---|
| scalar | 0 | `()` | a loss value |
| vector | 1 | `(768,)` | one sentence embedding |
| matrix | 2 | `(1000, 768)` | 1000 embeddings |
| 3-D tensor | 3 | `(32, 128, 768)` | batch × tokens × features |
| 4-D tensor | 4 | `(32, 3, 224, 224)` | batch of images |

```python run level=easy
import numpy as np

vector = np.array([0.1, 0.5, 0.9])
matrix = np.array([[1, 2, 3],
                   [4, 5, 6]])

for name, arr in [("vector", vector), ("matrix", matrix)]:
    print(f"{name}: shape={arr.shape} ndim={arr.ndim} size={arr.size} dtype={arr.dtype}")

f32 = matrix.astype(np.float32)        # convert the dtype
print(f32.dtype, f32.nbytes, "bytes vs", matrix.nbytes, "bytes")
```

## Creating arrays

```python run level=easy
import numpy as np

print(np.zeros((2, 3)))                 # all zeros
print(np.ones(4))                       # all ones
print(np.full((2, 2), 7))               # filled with 7
print(np.eye(3))                        # identity matrix
print(np.arange(0, 10, 2))              # like range(): 0 2 4 6 8
print(np.linspace(0, 1, 5))             # 5 evenly spaced points from 0 to 1
print(np.zeros_like(np.ones((2, 2))))   # same shape as another array
```

### Random numbers (the modern way)

:::tip Use a Generator
`rng = np.random.default_rng(seed)` is the modern random API. Give it a seed for reproducible results — essential when initializing model weights or splitting data.
:::

```python run level=easy
import numpy as np

rng = np.random.default_rng(42)
print(rng.random(3))                      # uniform in [0, 1)
print(rng.integers(0, 10, size=5))        # random ints
print(rng.normal(0, 1, size=(2, 3)))      # normal (Gaussian): mean 0, std 1
print(rng.choice(["a", "b", "c"], size=4, p=[0.7, 0.2, 0.1]))   # weighted sampling
weights = rng.normal(0, 0.02, size=(4, 3))   # how neural net weights are often initialized
print(weights.round(3))
```

## Indexing and slicing

Works like lists, but with **one index per dimension**, separated by commas.

```python run level=easy
import numpy as np

m = np.arange(12).reshape(3, 4)
print(m)
print("row 0:      ", m[0])
print("element 1,2:", m[1, 2])
print("column 1:   ", m[:, 1])          # every row, column 1
print("last column:", m[:, -1])
print("top-left 2x2:\n", m[:2, :2])
print("every other column:\n", m[:, ::2])
```

### Boolean masks — filtering with conditions

:::def Boolean mask
An array of `True`/`False` values with the same shape as your data. Using it as an index keeps only the elements where it is `True`. This is how you filter arrays without loops.
:::

```python run level=intermediate
import numpy as np

scores = np.array([0.12, 0.88, 0.45, 0.93, 0.67, 0.30])
mask = scores > 0.5
print(mask)
print(scores[mask])                      # only the high scores
print(np.where(scores > 0.5, "relevant", "skip"))   # choose per element
print("how many relevant:", mask.sum())  # True counts as 1

scores[scores < 0.2] = 0.0               # set by condition
print(scores)

docs = np.array(["intro", "rag", "agents", "evals", "tools", "faq"])
print("relevant docs:", docs[scores > 0.5])
print("top-3 docs:", docs[np.argsort(scores)[::-1][:3]])   # sort indices by score, descending
```

### Fancy indexing — pick by index lists

```python run level=intermediate
import numpy as np

embedding_table = np.arange(20).reshape(5, 4) * 0.1   # vocab of 5 tokens, 4 features each
token_ids = np.array([3, 0, 3, 1])                    # a "sentence" of token ids
print(embedding_table[token_ids])                     # look up each token's vector
print(embedding_table[token_ids].shape)
```

:::ai
That one line — `embedding_table[token_ids]` — **is** an embedding layer. Every language model starts by turning token IDs into vectors exactly like this.
:::

## Reshaping

```python run level=intermediate
import numpy as np

x = np.arange(12)
print(x.reshape(3, 4))
print(x.reshape(2, -1))           # -1 = "work it out for me" -> (2, 6)
print(x.reshape(3, 4).T)          # transpose: swap rows and columns
print(x[np.newaxis, :].shape)     # add a dimension -> (1, 12)
print(x[:, None].shape)           # -> (12, 1)
print(np.expand_dims(x, 0).shape, np.squeeze(np.ones((1, 3, 1))).shape)

batch = np.arange(24).reshape(2, 3, 4)     # (batch, tokens, features)
print("flattened per example:", batch.reshape(2, -1).shape)
```

## Aggregations and the axis argument

:::def axis
Which dimension an operation **collapses**. For a matrix: `axis=0` works **down the rows** (one result per column); `axis=1` works **across columns** (one result per row).
:::

```python run level=intermediate
import numpy as np

# rows = students, columns = 3 exams
grades = np.array([[80, 90, 70],
                   [60, 75, 95],
                   [90, 85, 88]])

print("overall mean:", grades.mean())
print("per exam (axis=0):   ", grades.mean(axis=0))   # collapse rows -> one per column
print("per student (axis=1):", grades.mean(axis=1))   # collapse columns -> one per row
print("best exam per student:", grades.argmax(axis=1))
print("keepdims shape:", grades.sum(axis=1, keepdims=True).shape)
```

```text
          exam0 exam1 exam2
student0 [  80    90    70 ]  → axis=1 → mean per student
student1 [  60    75    95 ]
student2 [  90    85    88 ]
            ↓ axis=0 → mean per exam
```

## Broadcasting

:::def Broadcasting
NumPy's rule for doing math on arrays of **different shapes**: dimensions of size 1 (or missing) are stretched to match. It lets you, for example, subtract a per-column mean from every row with one expression.
:::

The rule, comparing shapes **from the right**: two dimensions are compatible if they are **equal** or one of them is **1**.

```python run level=intermediate
import numpy as np

X = np.array([[1.0, 200.0],
              [2.0, 300.0],
              [3.0, 400.0]])            # shape (3, 2): 3 samples, 2 features

mean = X.mean(axis=0)                   # shape (2,)
std = X.std(axis=0)                     # shape (2,)
X_norm = (X - mean) / std               # (3,2) - (2,) -> broadcast across rows
print(X_norm.round(3))
print("new means:", X_norm.mean(axis=0).round(6), "new stds:", X_norm.std(axis=0))

col = np.array([[1], [2], [3]])         # (3, 1)
row = np.array([10, 20, 30, 40])        # (4,)
print(col + row)                        # (3,1) + (4,) -> (3,4)
```

```python run level=advanced
import numpy as np

# Pairwise distances between all points — no loops, thanks to broadcasting
points = np.array([[0, 0], [3, 4], [6, 8]], dtype=float)    # (3, 2)
diff = points[:, None, :] - points[None, :, :]                # (3,1,2) - (1,3,2) -> (3,3,2)
dist = np.sqrt((diff ** 2).sum(axis=-1))                      # (3,3)
print(dist)
```

:::warn Shape errors
`ValueError: operands could not be broadcast together with shapes (3,2) (3,)` means the right-most dimensions don't match. Print `.shape` of both arrays — and add a dimension with `[:, None]` where needed.
:::

## Universal functions (ufuncs)

```python run level=intermediate
import numpy as np

x = np.array([-2.0, -0.5, 0.0, 0.5, 2.0])
print("exp:    ", np.exp(x).round(3))
print("log1p:  ", np.log1p(np.abs(x)).round(3))
print("sqrt:   ", np.sqrt(np.abs(x)).round(3))
print("clip:   ", np.clip(x, -1, 1))
print("relu:   ", np.maximum(0, x))                   # the ReLU activation!
print("sigmoid:", (1 / (1 + np.exp(-x))).round(3))    # the sigmoid activation!
print("tanh:   ", np.tanh(x).round(3))
```

## Combining and splitting arrays

```python run level=intermediate
import numpy as np

a = np.ones((2, 3))
b = np.zeros((2, 3))
print(np.concatenate([a, b], axis=0).shape)    # stack rows: (4, 3)
print(np.concatenate([a, b], axis=1).shape)    # side by side: (2, 6)
print(np.stack([a, b]).shape)                  # new dimension: (2, 2, 3)
print(np.vstack([a, b]).shape, np.hstack([a, b]).shape)

batches = np.array_split(np.arange(10), 3)     # split into 3 near-equal parts
print(batches)
```

## Views vs copies

:::def View
A slice of an array usually **shares memory** with the original — changing the view changes the original. Use `.copy()` when you need an independent array.
:::

```python run level=advanced
import numpy as np

a = np.arange(6)
view = a[:3]
view[0] = 99
print("a after editing the view:", a)        # changed!

safe = a[:3].copy()
safe[1] = -1
print("a after editing the copy:", a)        # unchanged
print("shares memory?", np.shares_memory(a, view), np.shares_memory(a, safe))
```

## Putting it together: softmax, batched

Softmax turns a list of scores into probabilities. It is used at the end of every classifier and inside attention. This version handles a **batch** of score vectors and is numerically stable:

```python run level=advanced
import numpy as np

def softmax(logits: np.ndarray, axis: int = -1) -> np.ndarray:
    shifted = logits - logits.max(axis=axis, keepdims=True)   # stability: avoid huge exp()
    e = np.exp(shifted)
    return e / e.sum(axis=axis, keepdims=True)

logits = np.array([[2.0, 1.0, 0.1],
                   [1000.0, 1001.0, 1002.0]])     # huge values would overflow without the shift
probs = softmax(logits)
print(probs.round(3))
print("rows sum to 1:", probs.sum(axis=1))
print("predicted class per row:", probs.argmax(axis=1))
```

## Check yourself

```quiz
? What is the shape of `np.zeros((32, 10))[0]`?
+ (10,)
- (32,)
- (32, 10)
> Indexing the first dimension leaves the remaining one: 10 values.

? For `m` with shape (100, 5), what shape does `m.mean(axis=0)` have?
- (100,)
+ (5,)
- ()
> axis=0 collapses the 100 rows, leaving one mean per column.

? Can shapes (4, 3) and (3,) be added?
+ Yes — (3,) is broadcast across the 4 rows
- No — shapes must be identical
- Only if you reshape first
> Comparing from the right: 3 matches 3, and the missing dimension is stretched.

? `scores[scores > 0.5]` returns…
+ only the elements greater than 0.5
- a True/False array
- the indexes of elements over 0.5
> A boolean mask used as an index filters the array.
```

:::exercise Normalize embeddings
Create 5 random embeddings of size 8 with `rng = np.random.default_rng(0)`. Normalize each row to length 1 (divide by its L2 norm using `np.linalg.norm(..., axis=1, keepdims=True)`), check every norm is now 1, and find which pair of different rows has the highest dot product.
:::

:::solution
```python run
import numpy as np

rng = np.random.default_rng(0)
E = rng.normal(size=(5, 8))
E = E / np.linalg.norm(E, axis=1, keepdims=True)
print("norms:", np.linalg.norm(E, axis=1).round(6))

sims = E @ E.T                       # all pairwise dot products (5x5)
np.fill_diagonal(sims, -np.inf)      # ignore each row with itself
i, j = np.unravel_index(np.argmax(sims), sims.shape)
print(f"most similar pair: rows {i} and {j}, similarity {sims[i, j]:.3f}")
```
:::

:::keypoints
- Arrays hold same-typed numbers; math applies to **every element** without loops.
- Know your `.shape`, `.ndim` and `.dtype` — most bugs are shape bugs.
- Index with `a[row, col]`, slice with `:`, filter with boolean masks, look up with index arrays.
- `axis=0` collapses rows, `axis=1` collapses columns; `keepdims=True` keeps shapes broadcastable.
- **Broadcasting** stretches size-1 dimensions to make shapes match.
:::
