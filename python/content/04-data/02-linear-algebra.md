---
title: Linear Algebra for AI
level: intermediate
time: 30
summary: Vectors, dot products, cosine similarity, matrix multiplication and norms — the only linear algebra you need to understand embeddings, neural networks and attention, explained visually and in code.
---

You do not need a maths degree for AI. You need a handful of ideas — and you need to **feel** what they mean. This lesson covers exactly those, each with code you can play with.

## Vectors

:::def Vector
An ordered list of numbers, like `[0.2, -1.3, 0.8]`. You can think of it as an **arrow** in space, or as a **list of features** describing something. An embedding is a vector that describes the meaning of a piece of text.
:::

```python run level=easy
import numpy as np

# Describe animals with 3 features: [size, is_pet, can_fly]
cat   = np.array([0.3, 1.0, 0.0])
dog   = np.array([0.5, 1.0, 0.0])
eagle = np.array([0.4, 0.0, 1.0])

print("cat + dog:", cat + dog)           # add element by element
print("2 * eagle:", 2 * eagle)           # scale
print("difference cat→dog:", dog - cat)
```

:::analogy
Imagine every word placed on a giant map. Words with similar meanings sit close together: "cat" near "dog", "Paris" near "London". An embedding is just the word's **coordinates on that map** — with hundreds of dimensions instead of two.
:::

## Length (norm)

:::def Norm (L2 norm)
The length of a vector: the square root of the sum of its squared elements. `‖v‖ = √(v₁² + v₂² + … )`. A **unit vector** has length 1.
:::

```python run level=easy
import numpy as np

v = np.array([3.0, 4.0])
print(np.sqrt((v ** 2).sum()))      # by hand: 5.0
print(np.linalg.norm(v))            # built in
unit = v / np.linalg.norm(v)        # normalize: same direction, length 1
print(unit, np.linalg.norm(unit))

print("L1 norm (sum of absolute values):", np.abs(v).sum())
```

## The dot product

:::def Dot product
Multiply two vectors element by element and add everything up: `a · b = a₁b₁ + a₂b₂ + …`. It is large when the vectors point the same way, zero when they are perpendicular, and negative when they point in opposite directions.
:::

:::formula Dot product
a · b = Σ aᵢ × bᵢ = ‖a‖ ‖b‖ cos(θ)
:::

```python run level=easy
import numpy as np

a = np.array([1, 2, 3])
b = np.array([4, 5, 6])
print(1*4 + 2*5 + 3*6)       # by hand: 32
print(np.dot(a, b))          # function
print(a @ b)                 # the @ operator — what you will see most

east  = np.array([1, 0])
north = np.array([0, 1])
west  = np.array([-1, 0])
print("same direction:", east @ east, "| perpendicular:", east @ north, "| opposite:", east @ west)
```

## Cosine similarity — the #1 formula of RAG

:::def Cosine similarity
The cosine of the angle between two vectors: their dot product divided by both lengths. It ranges from **−1** (opposite) through **0** (unrelated) to **1** (same direction). It measures how similar two meanings are, ignoring vector length.
:::

:::formula Cosine similarity
cos(a, b) = (a · b) / (‖a‖ × ‖b‖)
:::

```python run level=intermediate
import numpy as np

def cosine(a, b):
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))

# Tiny hand-made "embeddings": [animal, vehicle, food, royalty]
emb = {
    "kitten":  np.array([0.9, 0.0, 0.1, 0.0]),
    "puppy":   np.array([0.8, 0.1, 0.1, 0.0]),
    "car":     np.array([0.0, 0.9, 0.0, 0.1]),
    "pizza":   np.array([0.0, 0.0, 1.0, 0.0]),
    "queen":   np.array([0.1, 0.0, 0.0, 0.9]),
}

query = "kitten"
ranked = sorted(((cosine(emb[query], v), w) for w, v in emb.items() if w != query), reverse=True)
for score, word in ranked:
    print(f"{word:<6} {score:+.3f}")
```

:::tip Normalize once, then dot product = cosine
If every vector already has length 1, cosine similarity is **just the dot product**. Vector databases normalize embeddings when storing them so that search is a single fast matrix multiplication.
:::

## Matrices

:::def Matrix
A 2-D grid of numbers with shape `(rows, columns)`. A matrix can hold many vectors (one per row), or represent a **transformation** that turns one vector into another — that is what a neural network layer does.
:::

### Matrix multiplication

:::def Matrix multiplication
`A @ B` — each entry of the result is the **dot product of a row of A with a column of B**. Shapes must line up: `(m, n) @ (n, p) → (m, p)`. The inner sizes (`n`) must match.
:::

```python run level=intermediate
import numpy as np

A = np.array([[1, 2],
              [3, 4],
              [5, 6]])          # (3, 2)
B = np.array([[1, 0, 2],
              [0, 1, 3]])       # (2, 3)

C = A @ B                       # (3,2) @ (2,3) -> (3,3)
print(C)
print("C[0,2] =", A[0] @ B[:, 2], "(row 0 of A · column 2 of B)")
print(A.shape, "@", B.shape, "->", C.shape)

try:
    A @ A                       # (3,2) @ (3,2): inner sizes 2 and 3 don't match
except ValueError as e:
    print("ValueError:", e)
```

```text
  (m, n) @ (n, p)  →  (m, p)
       └──┬──┘
     must match
```

### A neural network layer is a matrix multiplication

```python run level=intermediate
import numpy as np

rng = np.random.default_rng(0)

x = rng.normal(size=(4, 3))        # batch of 4 examples, 3 features each
W = rng.normal(size=(3, 2))        # layer weights: 3 inputs -> 2 outputs
b = np.array([0.1, -0.1])          # bias, one per output

out = x @ W + b                    # (4,3) @ (3,2) + (2,) -> (4,2)
activated = np.maximum(0, out)     # ReLU
print("output shape:", out.shape)
print(activated.round(3))
```

That is literally a **dense (linear) layer** followed by ReLU. Stack several and you have a neural network. You will build one from scratch in the Deep Learning module.

### Search over many documents at once

```python run level=intermediate
import numpy as np

rng = np.random.default_rng(7)
doc_embeddings = rng.normal(size=(6, 16))                   # 6 documents
doc_embeddings /= np.linalg.norm(doc_embeddings, axis=1, keepdims=True)
query = doc_embeddings[2] + 0.3 * rng.normal(size=16)       # a query close to doc 2
query /= np.linalg.norm(query)

scores = doc_embeddings @ query                             # (6,16) @ (16,) -> (6,)
ranking = np.argsort(-scores)
print("scores:", scores.round(3))
print("ranking:", ranking)                                  # doc 2 should come first
```

## Transpose, identity and inverse

```python run level=intermediate
import numpy as np

M = np.array([[2.0, 1.0],
              [1.0, 3.0]])
print("transpose:\n", M.T)
print("identity:\n", np.eye(2))
print("M @ I == M:", np.allclose(M @ np.eye(2), M))

M_inv = np.linalg.inv(M)
print("inverse:\n", M_inv.round(3))
print("M @ M_inv:\n", (M @ M_inv).round(6))

# Solve M x = y for x (better than computing the inverse yourself)
y = np.array([5.0, 10.0])
print("solution x:", np.linalg.solve(M, y))
```

## Matrix shapes in attention (a preview)

The core of a Transformer is a few matrix multiplications. Here are the **shapes** — you will build the real thing in the NLP module:

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
seq_len, d_model, d_head = 5, 16, 8

X  = rng.normal(size=(seq_len, d_model))          # 5 tokens, 16 features each
Wq = rng.normal(size=(d_model, d_head))
Wk = rng.normal(size=(d_model, d_head))
Wv = rng.normal(size=(d_model, d_head))

Q, K, V = X @ Wq, X @ Wk, X @ Wv                  # each (5, 8)
scores = Q @ K.T / np.sqrt(d_head)                # (5,8) @ (8,5) -> (5,5): every token vs every token
weights = np.exp(scores - scores.max(axis=1, keepdims=True))
weights /= weights.sum(axis=1, keepdims=True)     # softmax per row
out = weights @ V                                 # (5,5) @ (5,8) -> (5,8)

for name, arr in [("X", X), ("Q", Q), ("scores", scores), ("weights", weights), ("out", out)]:
    print(f"{name:<8} {arr.shape}")
print("each row of weights sums to 1:", weights.sum(axis=1).round(3))
```

## Eigenvectors and SVD (just the intuition)

:::def SVD (Singular Value Decomposition)
A way to break any matrix into simple pieces: `M = U · S · Vᵀ`. The biggest values in `S` capture the most important "directions" in the data. Keeping only the top few gives the best low-rank approximation — the idea behind **PCA** and **LoRA** fine-tuning.
:::

```python run level=advanced
import numpy as np

rng = np.random.default_rng(3)
# A 50x40 matrix that is secretly "rank 2" plus a little noise
M = rng.normal(size=(50, 2)) @ rng.normal(size=(2, 40)) + 0.01 * rng.normal(size=(50, 40))

U, S, Vt = np.linalg.svd(M, full_matrices=False)
print("top singular values:", S[:5].round(3))      # two big, the rest tiny

k = 2
M_approx = U[:, :k] @ np.diag(S[:k]) @ Vt[:k]      # rebuild from just 2 directions
error = np.linalg.norm(M - M_approx) / np.linalg.norm(M)
print(f"relative error with rank {k}: {error:.4f}")
print(f"numbers stored: full={M.size}, rank-2 pieces={U[:, :k].size + k + Vt[:k].size}")
```

:::ai Where each idea shows up
| Idea | Used in |
|---|---|
| vectors | embeddings of words, sentences, images |
| dot product / cosine | semantic search, RAG retrieval, recommendations |
| matrix multiplication | every neural network layer, attention |
| norms | normalizing embeddings, regularization, gradient clipping |
| transpose | `Q @ K.T` in attention |
| SVD / low rank | PCA, LoRA fine-tuning, compression |
:::

## Check yourself

```quiz
? Two embeddings have cosine similarity 0.98. What does that suggest?
+ Their meanings are very similar
- They are unrelated
- They are opposites
> Close to 1 = pointing the same direction = similar meaning.

? What is the result shape of (32, 768) @ (768, 10)?
+ (32, 10)
- (768, 768)
- An error
> The inner 768s match and disappear: (m, n) @ (n, p) → (m, p).

? If all vectors are normalized to length 1, cosine similarity equals…
+ their dot product
- their difference
- always 1
> The lengths in the denominator are both 1.

? Which operation is a dense neural network layer (before activation)?
+ x @ W + b
- x + W
- W.T
> A matrix multiplication plus a bias.
```

:::exercise Analogy arithmetic
With these toy embeddings (features: [royalty, male, female, person]), compute `king - man + woman` and find which word in the table has the highest cosine similarity to the result (excluding king, man and woman).

```python
words = {
    "king":   [0.9, 0.9, 0.0, 1.0],
    "queen":  [0.9, 0.0, 0.9, 1.0],
    "man":    [0.0, 0.9, 0.0, 1.0],
    "woman":  [0.0, 0.0, 0.9, 1.0],
    "prince": [0.7, 0.9, 0.0, 0.8],
    "apple":  [0.0, 0.0, 0.0, 0.0],
}
```
:::

:::solution
```python run
import numpy as np

words = {
    "king":   [0.9, 0.9, 0.0, 1.0],
    "queen":  [0.9, 0.0, 0.9, 1.0],
    "man":    [0.0, 0.9, 0.0, 1.0],
    "woman":  [0.0, 0.0, 0.9, 1.0],
    "prince": [0.7, 0.9, 0.0, 0.8],
    "apple":  [0.0, 0.0, 0.0, 0.0],
}
E = {w: np.array(v) for w, v in words.items()}
target = E["king"] - E["man"] + E["woman"]

def cosine(a, b):
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / denom) if denom else 0.0

candidates = {w: cosine(target, v) for w, v in E.items() if w not in {"king", "man", "woman"}}
for w, s in sorted(candidates.items(), key=lambda kv: -kv[1]):
    print(f"{w:<7} {s:.3f}")
```
:::

:::keypoints
- A **vector** is a list of numbers — an embedding is a vector of meaning.
- **Dot product** `a @ b` measures alignment; **cosine similarity** normalizes it to [−1, 1].
- **Matrix multiplication** `(m,n) @ (n,p) → (m,p)` is the core operation of neural networks.
- Normalize embeddings once, then search with a single `docs @ query`.
- **SVD** finds the most important directions — the idea behind PCA and LoRA.
:::
