---
title: Attention — How Tokens Look at Each Other
level: intermediate
time: 50
summary: The mechanism that made modern LLMs possible. Queries, keys and values explained with a library analogy, scaled dot-product attention written in NumPy, the causal mask that makes generation work, multiple heads, and why attention cost grows with the square of the context length.
---

In "The animal didn't cross the street because **it** was too tired", what does "it" refer to? To read that sentence you must connect "it" back to "animal". **Attention** is the mechanism that lets every token look at every other token and decide which ones matter for understanding itself.

:::def Attention
An operation where each token builds a new representation of itself as a **weighted average of information from other tokens**, with the weights computed from how relevant each other token is. Relevance is learned, not hand-written.
:::

:::analogy
A library with a smart assistant. You (the **query**) describe what you are looking for. Every book has a spine label (its **key**) and contents (its **value**). The assistant compares your request with all the labels, scores how well each matches, then hands you a blend of the contents, weighted toward the best matches. Every token plays both roles: it asks questions of the others and offers its own label and contents.
:::

## Queries, keys and values

For each token's embedding `x`, the model computes three vectors by multiplying with three learned matrices:

| Vector | Role | Question it answers |
|---|---|---|
| **Query** `q = x·W_q` | what I am looking for | "What context do I need?" |
| **Key** `k = x·W_k` | how I advertise myself | "What do I contain?" |
| **Value** `v = x·W_v` | what I give if chosen | "What information do I pass on?" |

:::formula Scaled dot-product attention
\text{Attention}(Q,K,V) = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right)V
:::

Read it left to right: compare every query with every key (`Q Kᵀ`), scale so the numbers stay moderate (`/√d`), turn each row into weights that sum to 1 (`softmax`), and use those weights to blend the values.

## Attention in 20 lines

```python run title="Scaled dot-product attention from scratch" level=intermediate
import numpy as np

def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

tokens = ["The", "cat", "sat", "down"]
rng = np.random.default_rng(0)
d_model, d_k = 8, 4

X   = rng.normal(size=(len(tokens), d_model))     # token embeddings (made up here)
W_q = rng.normal(size=(d_model, d_k))
W_k = rng.normal(size=(d_model, d_k))
W_v = rng.normal(size=(d_model, d_k))

Q, K, V = X @ W_q, X @ W_k, X @ W_v
scores  = Q @ K.T / np.sqrt(d_k)                  # (4,4): how much token i attends to token j
weights = softmax(scores)                         # each row sums to 1
output  = weights @ V                             # new representation per token

print("attention weights (rows = who is looking):")
print(np.round(weights, 2))
print("row sums:", weights.sum(axis=1).round(2))
print("output shape:", output.shape)
```

:::note Why divide by √d?
Dot products of long vectors grow with the dimension, which would push softmax into near-one-hot saturation and kill gradients. Dividing by √d keeps the scale stable.
:::

## The causal mask: no peeking at the future

A model that generates text must predict token *t* using only tokens before it. During training the whole sentence is processed in parallel, so we **mask** future positions by setting their scores to −∞ before the softmax (they become weight 0).

```python run title="Causal masking" level=intermediate
import numpy as np

def softmax(x):
    e = np.exp(x - x.max(axis=-1, keepdims=True)); return e / e.sum(axis=-1, keepdims=True)

n = 5
rng = np.random.default_rng(1)
scores = rng.normal(size=(n, n))

mask = np.triu(np.ones((n, n), dtype=bool), k=1)      # True above the diagonal = the future
masked = np.where(mask, -np.inf, scores)
weights = softmax(masked)

print(np.round(weights, 2))
print("token 0 can only attend to itself:", weights[0].round(2))
```

You get a lower-triangular matrix: token 2 sees tokens 0, 1, 2 only. This is what makes a **decoder-only** model (GPT, Claude, Llama) autoregressive. Encoder models like BERT skip the mask and look both ways.

## See attention work

Pick a sentence and a head, then click a token to see where it looks. (Weights are illustrative: they are hand-crafted to show patterns that real heads learn, such as resolving pronouns and attending to the previous token.)

```viz algo=attention title="What does each token attend to?"
```

## Multi-head attention

One attention operation can focus on only one kind of relationship at a time. **Multi-head attention** runs *h* independent attention operations in parallel, each with its own `W_q, W_k, W_v` on a smaller slice of the dimensions, then concatenates and mixes the results with a final matrix. Different heads specialise: some track the previous token, some resolve pronouns, some match brackets in code.

```python run title="Multi-head attention (shapes tell the story)" level=advanced
import numpy as np

def softmax(x):
    e = np.exp(x - x.max(axis=-1, keepdims=True)); return e / e.sum(axis=-1, keepdims=True)

def multi_head_attention(X, n_heads, rng):
    n, d_model = X.shape
    d_head = d_model // n_heads
    W_q, W_k, W_v, W_o = (rng.normal(scale=d_model ** -0.5, size=(d_model, d_model)) for _ in range(4))

    def split(M):                       # (n, d_model) -> (heads, n, d_head)
        return M.reshape(n, n_heads, d_head).transpose(1, 0, 2)

    Q, K, V = split(X @ W_q), split(X @ W_k), split(X @ W_v)
    scores = Q @ K.transpose(0, 2, 1) / np.sqrt(d_head)          # (heads, n, n)
    scores = np.where(np.triu(np.ones((n, n), bool), 1), -np.inf, scores)   # causal
    A = softmax(scores)                                          # per-head attention maps
    heads = A @ V                                                # (heads, n, d_head)
    concat = heads.transpose(1, 0, 2).reshape(n, d_model)        # glue heads back together
    return concat @ W_o, A

rng = np.random.default_rng(3)
X = rng.normal(size=(6, 32))
out, A = multi_head_attention(X, n_heads=4, rng=rng)
print("input", X.shape, "-> output", out.shape, "| attention maps", A.shape, "(heads, query, key)")
print("head 0, last token attends to:", A[0, -1].round(2))
print("head 3, last token attends to:", A[3, -1].round(2))
```

## Cost: why context length is expensive

The score matrix is `n × n` for a sequence of `n` tokens, so compute and memory grow with **n²**. Doubling the context quadruples that part of the work.

```python run title="Attention matrix size vs context length" level=easy
for n in [1_000, 8_000, 32_000, 128_000, 1_000_000]:
    entries = n * n
    gb_fp16 = entries * 2 / 1e9                 # one head, one layer, 2 bytes per number
    print(f"n={n:>9,}  score entries={entries:>16,}  ~{gb_fp16:>10,.1f} GB per head per layer if materialised")
```

You never materialise that matrix in practice. **FlashAttention** ([paper](https://arxiv.org/abs/2205.14135)) computes exact attention in tiles that stay in fast on-chip memory, and **sparse, sliding-window and linear variants** trade exactness for speed. We return to this in the inference module. For now remember two consequences:

1. Long contexts are slower and costlier (prefill time grows super-linearly).
2. Models use more tricks (grouped-query attention, caching keys and values) to make **generation** cheap; the KV-cache lesson explains that.

## What attention is not

- It is not a database lookup: the weights are soft, so information blends.
- Attention weights are not a perfect explanation of why a model said something. They are one ingredient inside many layers.
- Position is not built in: attention treats the input as a set unless you add **positional information** (next lesson).

```quiz
? In attention, what do queries and keys produce?
- The final output tokens
+ A score for every pair of tokens, turned into weights by softmax
- The embeddings
> Q·Kᵀ gives pairwise relevance scores; softmax makes them weights that sum to 1.

? What is the purpose of the causal mask?
- To make training faster by removing tokens
+ To stop a token from attending to later tokens so the model can generate left to right
- To remove padding
> Without it, the model could cheat by looking at the answer during training.

? Why does doubling the context roughly quadruple the attention score computation?
- Because tokens are twice as long
+ Because every token attends to every other token, giving an n × n matrix
- Because the vocabulary doubles
> The score matrix has n² entries.

? Why have multiple heads?
- To use more GPUs
+ So different heads can learn different relationships at the same time
- To reduce parameters
> Each head attends to a different subspace and pattern; their outputs are concatenated.
```

:::problem Explain self-attention to a colleague in three sentences. {level=easy tags="transformers,attention"}
Include queries, keys and values and why it is parallel.

:::solution Model answer
Each token is turned into a query, a key and a value vector. A token's query is compared with every token's key to get relevance scores, which a softmax converts to weights, and the token's new representation is the weighted sum of the values, so information flows from the relevant tokens. All tokens do this at once as matrix multiplications, which is why Transformers train in parallel on GPUs, unlike RNNs that process tokens one after another.
:::
:::

:::keypoints
- Attention lets each token build its representation from a weighted blend of others, with weights computed from query–key similarity.
- softmax(QKᵀ/√d)·V is the whole operation; it is just matrix multiplications, so it parallelises.
- The causal mask zeroes out the future so generation is left to right.
- Multi-head attention runs several attention patterns in parallel.
- Cost grows with n² in context length, which drives many inference optimisations.
:::

:::resources
- [Attention Is All You Need](https://arxiv.org/abs/1706.03762) — the original paper; short and readable.
- [The Illustrated Transformer (Jay Alammar)](https://jalammar.github.io/illustrated-transformer/) — step-by-step pictures of exactly this.
- [Transformer Explainer](https://poloclub.github.io/transformer-explainer/) — run GPT-2 in your browser and watch attention.
- [LLM Visualization (Brendan Bycroft)](https://bbycroft.net/llm) — a 3-D walkthrough of every operation in a tiny GPT.
- [Karpathy: Let's build GPT (video)](https://www.youtube.com/watch?v=kCc8FmEb1nY) — attention built from scratch.
- [FlashAttention](https://arxiv.org/abs/2205.14135) and its [repo](https://github.com/Dao-AILab/flash-attention) — how attention became fast.
:::
