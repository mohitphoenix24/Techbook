---
title: Attention from Scratch
level: advanced
time: 40
summary: The mechanism at the heart of every LLM. Build scaled dot-product attention, causal masking and multi-head attention in NumPy, and visualise what each token attends to.
---

**Attention** lets every token in a sequence look at every other token and decide which ones matter for understanding it. It's the single idea that made Transformers — and therefore Claude, GPT, Gemini and Llama — possible. By the end of this lesson you will have built it yourself.

## The intuition

Consider: *"The animal didn't cross the street because **it** was too tired."* To understand **it**, you must connect it to **animal** (not street). Attention computes, for each word, a **weighted mix of all the other words**, where the weights say "how relevant is that word to me?".

:::analogy
Attention works like a **library search**. Each token writes a **query** ("what am I looking for?"). Every token also has a **key** (its label on the shelf: "what do I contain?") and a **value** (the actual content). A token compares its query with every key, gets a relevance score for each, and reads a blend of the values — mostly from the most relevant books.
:::

:::def Query, Key, Value (Q, K, V)
Three different linear projections of each token's vector. The **query** asks, the **key** advertises, the **value** carries the information. Attention scores come from `query · key`; the output is a weighted sum of values.
:::

:::formula Scaled dot-product attention
Attention(Q, K, V) = softmax( Q Kᵀ / √d_k ) V
:::

:::flow Attention step by step
Project | Q = XW_q, K = XW_k, V = XW_v
Score | S = Q Kᵀ / √d
Mask | hide future tokens (GPT)
Softmax | each row → weights summing to 1
Mix | output = weights · V
:::

## Step 1: scores from dot products

```python run level=intermediate
import numpy as np

np.set_printoptions(precision=2, suppress=True)
tokens = ["the", "cat", "sat"]
# pretend these are already the queries and keys (d_k = 4)
Q = np.array([[1.0, 0.0, 1.0, 0.0],
              [0.0, 2.0, 0.0, 1.0],
              [1.0, 1.0, 0.0, 1.0]])
K = np.array([[1.0, 0.0, 0.5, 0.0],
              [0.0, 1.5, 0.0, 1.0],
              [0.5, 1.0, 0.0, 1.5]])

scores = Q @ K.T                       # (3, 3): every query vs every key
print("raw scores (row = query token, column = key token):")
print(scores)
print("\nscaled by sqrt(d_k):")
print(scores / np.sqrt(K.shape[1]))
```

:::def Why divide by √d_k?
Dot products of long vectors get large, which pushes softmax into extreme values (one weight ≈ 1, the rest ≈ 0) and makes gradients tiny. Dividing by √d keeps the scores in a healthy range.
:::

## Step 2: softmax → attention weights

```python run level=intermediate
import numpy as np

np.set_printoptions(precision=3, suppress=True)

def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

scores = np.array([[1.25, 0.0, 0.25],
                   [0.0, 2.5, 2.5],
                   [0.5, 1.75, 2.25]]) / 2
weights = softmax(scores)               # each row sums to 1
print(weights)
print("row sums:", weights.sum(axis=1))
```

Row *i* tells you **how much token i attends to each token**.

## Step 3: mix the values

```python run level=intermediate
import numpy as np

np.set_printoptions(precision=3, suppress=True)
weights = np.array([[0.53, 0.20, 0.27],
                    [0.14, 0.43, 0.43],
                    [0.18, 0.34, 0.48]])
V = np.array([[1.0, 0.0],      # value of "the"
              [0.0, 1.0],      # value of "cat"
              [1.0, 1.0]])     # value of "sat"
out = weights @ V              # each output = weighted average of value vectors
print(out)
```

Each output vector is a **blend** of the value vectors, mixed according to the attention weights. That blend becomes the token's new, **context-aware** representation.

## The full attention function

```python run level=advanced
import numpy as np

def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

def attention(Q, K, V, mask=None):
    d_k = Q.shape[-1]
    scores = Q @ K.swapaxes(-1, -2) / np.sqrt(d_k)       # (..., T, T)
    if mask is not None:
        scores = np.where(mask, scores, -np.inf)          # blocked positions -> -inf -> weight 0
    weights = softmax(scores, axis=-1)
    return weights @ V, weights

rng = np.random.default_rng(0)
T, d_model, d_k = 5, 16, 8
X = rng.normal(size=(T, d_model))                         # 5 token embeddings
W_q, W_k, W_v = (rng.normal(0, 1 / np.sqrt(d_model), (d_model, d_k)) for _ in range(3))

out, w = attention(X @ W_q, X @ W_k, X @ W_v)
print("output shape:", out.shape)                          # (5, 8)
print("weights shape:", w.shape, "| rows sum to 1:", np.allclose(w.sum(-1), 1))
```

## Causal masking: no peeking at the future

A GPT-style model generates text left to right, so token *t* must only attend to tokens **0…t** — otherwise during training it could "cheat" by looking at the word it's supposed to predict.

:::def Causal (look-ahead) mask
A lower-triangular mask that blocks each position from attending to later positions. Masked scores are set to −∞ so their softmax weight is exactly 0. Decoder-only LLMs (GPT, Claude, Llama) use it in every attention layer.
:::

```python run level=advanced
import numpy as np
import matplotlib.pyplot as plt

def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

tokens = ["<s>", "The", "cat", "sat", "on", "the", "mat"]
T = len(tokens)
rng = np.random.default_rng(3)
scores = rng.normal(size=(T, T))

causal = np.tril(np.ones((T, T), dtype=bool))
print(causal.astype(int))

w_full = softmax(scores)
w_causal = softmax(np.where(causal, scores, -np.inf))

fig, axes = plt.subplots(1, 2, figsize=(10, 4.3))
for ax, w, title in [(axes[0], w_full, "bidirectional (BERT-style)"), (axes[1], w_causal, "causal (GPT-style)")]:
    ax.imshow(w, cmap="magma", vmin=0, vmax=1)
    ax.set_xticks(range(T), tokens, rotation=45); ax.set_yticks(range(T), tokens)
    ax.set(title=title, xlabel="key (attended to)", ylabel="query")
fig.tight_layout()
plt.show()
```

## Multi-head attention

One attention pattern can only capture one kind of relationship at a time. **Multi-head** attention runs several smaller attentions in parallel — one head might track grammar, another coreference ("it" → "animal"), another nearby words — then concatenates the results.

:::def Multi-head attention
Split the model dimension into `h` heads, run attention independently in each head with its own Q/K/V projections, concatenate the head outputs, and mix them with a final projection `W_o`.
:::

```python run level=advanced
import numpy as np

def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

class MultiHeadAttention:
    def __init__(self, d_model, n_heads, rng):
        assert d_model % n_heads == 0
        self.h, self.d_head = n_heads, d_model // n_heads
        s = 1 / np.sqrt(d_model)
        self.W_qkv = rng.normal(0, s, (d_model, 3 * d_model))     # Q, K, V projections fused
        self.W_o = rng.normal(0, s, (d_model, d_model))

    def __call__(self, X, causal=True):
        T, d = X.shape
        qkv = X @ self.W_qkv                                        # (T, 3d)
        q, k, v = np.split(qkv, 3, axis=-1)                         # each (T, d)
        split = lambda t: t.reshape(T, self.h, self.d_head).transpose(1, 0, 2)   # -> (h, T, d_head)
        q, k, v = split(q), split(k), split(v)
        scores = q @ k.transpose(0, 2, 1) / np.sqrt(self.d_head)    # (h, T, T)
        if causal:
            scores = np.where(np.tril(np.ones((T, T), bool)), scores, -np.inf)
        weights = softmax(scores)
        heads = weights @ v                                         # (h, T, d_head)
        concat = heads.transpose(1, 0, 2).reshape(T, d)             # (T, d)
        return concat @ self.W_o, weights

rng = np.random.default_rng(0)
mha = MultiHeadAttention(d_model=32, n_heads=4, rng=rng)
X = rng.normal(size=(6, 32))
out, weights = mha(X)
print("input ", X.shape)
print("output", out.shape, "(same shape — attention mixes information, it doesn't change size)")
print("weights", weights.shape, "= (heads, queries, keys)")
print("parameters:", mha.W_qkv.size + mha.W_o.size)
```

## Watching attention learn something

Random weights give random patterns. Here we **hand-craft** a head that does something meaningful: every token attends to the **previous** token — a real pattern ("previous-token head") found in trained LLMs.

```python run level=advanced
import numpy as np

def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

tokens = ["I", "love", "deep", "learning", "models"]
T = len(tokens)
pos = np.eye(T)                                    # one-hot positions as the token vectors
W_q = np.eye(T) * 5                                # query: "my position"
W_k = np.roll(np.eye(T), 1, axis=1) * 1            # key: "the position right after me"
q, k = pos @ W_q, pos @ W_k
scores = q @ k.T
scores = np.where(np.tril(np.ones((T, T), bool)), scores, -np.inf)
w = softmax(scores)
for i, t in enumerate(tokens):
    j = int(np.argmax(w[i]))
    print(f"{t:<9} attends most to {tokens[j]:<9} ({w[i, j]:.2f})")
```

Trained models discover heads like this — and far subtler ones — on their own through backprop.

## Cost: why long context is expensive

```python run level=intermediate
for T in [1_000, 8_000, 128_000, 1_000_000]:
    entries = T * T
    print(f"{T:>9,} tokens → attention matrix with {entries:>18,} entries per head per layer")
```

Attention compares **every token with every token**: cost grows with the **square** of the sequence length. Techniques like FlashAttention (compute in tiles without storing the full matrix), the **KV cache** (next lesson), and sparse or sliding-window attention make long contexts practical.

:::def Self-attention vs cross-attention
**Self-attention**: Q, K and V all come from the same sequence. **Cross-attention**: queries come from one sequence and keys/values from another — e.g. a translation decoder attending to the source sentence, or an image-generation model attending to the text prompt.
:::

:::ai
- Every layer of an LLM contains **multi-head causal self-attention**.
- **Long-context models** are largely about making attention fast and memory-efficient.
- Attention patterns are a major subject of **interpretability** research — finding heads that copy, track syntax or retrieve facts.
- In **RAG**, retrieved passages are pasted into the context so attention can "look them up" while generating.
:::

## Check yourself

```quiz
? In attention, what do the scores Q·Kᵀ measure?
+ How relevant each key token is to each query token
- The final output vectors
- The token IDs
> Then softmax turns each row of scores into weights.

? Why is the causal mask needed in GPT-style models?
+ So each position can't see future tokens it is trying to predict
- To make attention faster
- To remove padding
> Without it, training would "cheat" by reading the answer.

? What does multi-head attention add?
+ Several attention patterns in parallel, each capturing different relationships
- More layers
- A bigger vocabulary
> Head outputs are concatenated and projected back to d_model.

? Doubling the context length multiplies the attention matrix size by about…
- 2
+ 4
- 8
> T² scaling: (2T)² = 4T².
```

:::exercise Attention with padding
Batches often contain sequences of different lengths, padded with a `<pad>` token. Write a `padding_mask(lengths, T)` that returns a boolean array of shape `(batch, T, T)` where position `j` is allowed only if `j < length` of that sequence. Apply it (with the attention function) to a batch of 2 sequences with lengths `[3, 5]` and `T = 5`, and check the weights on padded keys are 0.
:::

:::solution
```python run
import numpy as np

def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

def padding_mask(lengths, T):
    keys_ok = np.arange(T)[None, :] < np.array(lengths)[:, None]      # (batch, T)
    return np.repeat(keys_ok[:, None, :], T, axis=1)                  # (batch, T, T)

rng = np.random.default_rng(0)
B, T, d = 2, 5, 4
Q, K = rng.normal(size=(B, T, d)), rng.normal(size=(B, T, d))
scores = Q @ K.transpose(0, 2, 1) / np.sqrt(d)
w = softmax(np.where(padding_mask([3, 5], T), scores, -np.inf))
print(w[0].round(2))        # columns 3 and 4 are zero for the first (short) sequence
print("max weight on padding:", w[0][:, 3:].max())
```
:::

:::keypoints
- Attention = `softmax(Q Kᵀ / √d) V`: each token takes a weighted mix of all value vectors.
- **Q** asks, **K** advertises, **V** carries content — all are learned projections of the token vectors.
- A **causal mask** stops tokens attending to the future (decoder-only LLMs).
- **Multi-head** attention runs several attention patterns in parallel.
- Cost grows with **sequence length squared** — the core challenge of long context.
:::
