---
title: The Transformer Block, Assembled
level: intermediate
time: 55
summary: Put the pieces together. Positional information (RoPE), residual connections, normalisation, the feed-forward layer, the stacked decoder, and the output head. Run a tiny Transformer forward pass in NumPy, count parameters of real model sizes, and learn the modern variants (GQA, SwiGLU, MoE) you will see in model cards.
---

Attention lets tokens exchange information. A **Transformer block** wraps attention with the few extra pieces that make deep stacks trainable. A modern LLM is that block repeated tens of times, with an embedding table at the bottom and a prediction head on top.

```viz algo=arch title="A decoder-only Transformer" dir=down
tok   Token IDs | integers [list] @0,0
emb   Embedding table | ID to vector [embed] @1,0
blk   N × Transformer block | the same recipe, stacked [llm*3] @2,0
norm  Final norm [filter] @3,0
head  Output head | vector to vocab logits [chart] @4,0
sm    Softmax | next-token probabilities [cache] @5,0
--
tok -> emb
emb -> blk : + position info
blk -> norm
norm -> head
head -> sm
```

## One block, inside

:::flow One decoder block (pre-norm)
Normalise | RMSNorm keeps numbers well-scaled
Attention | each token reads from earlier tokens
Add (residual) | x = x + attention(x)
Normalise | again
Feed-forward (MLP) | a per-token two-layer network
Add (residual) | x = x + mlp(x)
:::

### The five ingredients

:::def Residual connection
Adding a layer's input back to its output: `x + f(x)`. Each layer only has to learn a small **correction** to what it receives. Residuals create a "highway" for information and gradients, which is what makes 80-layer networks trainable.
:::

:::def Normalisation (LayerNorm / RMSNorm)
Rescales each token's vector to a standard size before a sublayer. It stabilises training. Modern LLMs mostly use **RMSNorm** ([paper](https://arxiv.org/abs/1910.07467)), a simpler variant, applied *before* each sublayer ("pre-norm").
:::

:::def Feed-forward network (MLP)
Applied to each token independently: expand the vector to a wider size (about 4×, or ~2.7× for gated variants), apply a non-linearity, and project back. It holds a large share of the parameters and much of the model's stored "knowledge". Modern models use **SwiGLU**-style gated units ([paper](https://arxiv.org/abs/2002.05202)).
:::

:::def Positional encoding
Attention alone sees a bag of tokens with no order. Positional information tells it that this token is 3rd and that one is 17th. Modern LLMs mostly use **RoPE** (rotary embeddings, [paper](https://arxiv.org/abs/2104.09864)), which rotates query and key vectors by an angle that depends on position, so attention scores naturally depend on **relative distance**.
:::

:::def Output head
A final matrix that maps each token's vector to one score per vocabulary entry (the logits). Often it shares weights with the embedding table ("weight tying"). Only the **last position's** logits are needed to pick the next token.
:::

## A tiny Transformer you can run

Random weights, so it outputs nonsense, but the shapes and the flow are exactly those of GPT-style models.

```python run title="A decoder-only Transformer forward pass" level=advanced
import numpy as np

rng = np.random.default_rng(0)
V, D, H, L, T = 50, 32, 4, 2, 6          # vocab, model dim, heads, layers, sequence length
d_head, d_ff = D // H, 4 * D

def softmax(x):
    e = np.exp(x - x.max(axis=-1, keepdims=True)); return e / e.sum(axis=-1, keepdims=True)

def rmsnorm(x, g):
    return x / np.sqrt((x ** 2).mean(axis=-1, keepdims=True) + 1e-6) * g

def init(shape): return rng.normal(scale=shape[0] ** -0.5, size=shape)

params = {
    "emb": init((V, D)),
    "layers": [{
        "wq": init((D, D)), "wk": init((D, D)), "wv": init((D, D)), "wo": init((D, D)),
        "w1": init((D, d_ff)), "w2": init((d_ff, D)),
        "g1": np.ones(D), "g2": np.ones(D),
    } for _ in range(L)],
    "gf": np.ones(D),
}

def rope(x, pos):
    """Rotate pairs of dimensions by a position-dependent angle. x: (heads, T, d_head)."""
    half = x.shape[-1] // 2
    freqs = 10000 ** (-np.arange(half) / half)
    ang = pos[:, None] * freqs[None, :]                    # (T, half)
    cos, sin = np.cos(ang), np.sin(ang)
    x1, x2 = x[..., :half], x[..., half:]
    return np.concatenate([x1 * cos - x2 * sin, x1 * sin + x2 * cos], axis=-1)

def block(x, p):
    n = x.shape[0]
    h = rmsnorm(x, p["g1"])
    split = lambda M: M.reshape(n, H, d_head).transpose(1, 0, 2)
    q, k, v = split(h @ p["wq"]), split(h @ p["wk"]), split(h @ p["wv"])
    pos = np.arange(n)
    q, k = rope(q, pos), rope(k, pos)                     # position enters through q and k only
    s = q @ k.transpose(0, 2, 1) / np.sqrt(d_head)
    s = np.where(np.triu(np.ones((n, n), bool), 1), -np.inf, s)
    att = (softmax(s) @ v).transpose(1, 0, 2).reshape(n, D) @ p["wo"]
    x = x + att                                           # residual 1
    h = rmsnorm(x, p["g2"])
    x = x + np.maximum(h @ p["w1"], 0) @ p["w2"]          # residual 2 (ReLU MLP for simplicity)
    return x

def forward(token_ids):
    x = params["emb"][token_ids]                          # (T, D)
    for p in params["layers"]:
        x = block(x, p)
    x = rmsnorm(x, params["gf"])
    return x @ params["emb"].T                            # weight-tied head: (T, V) logits

ids = rng.integers(0, V, size=T)
logits = forward(ids)
probs = softmax(logits[-1])                               # only the last position predicts the next token
print("input ids:", ids)
print("logits shape:", logits.shape)
print("next-token distribution sums to", probs.sum().round(3), "| top-3 ids:", probs.argsort()[-3:][::-1])
n_params = params["emb"].size + sum(v.size for p in params["layers"] for v in p.values()) + params["gf"].size
print("parameters:", f"{n_params:,}")
```

Everything you read about LLMs, from "7B" to "1T parameters", is this program with bigger `V, D, H, L`, trained on trillions of tokens.

## Counting parameters

Where do the parameters live? Per layer, roughly **4·D²** for attention (Q, K, V, O) and **8·D²** for a standard 4× MLP, so about **12·D²** per layer, plus **V·D** for the embedding table.

```python run title="How many parameters? (back-of-envelope)" level=intermediate
def params_estimate(vocab, d_model, n_layers, ff_mult=4):
    attn = 4 * d_model ** 2
    mlp = 2 * ff_mult * d_model ** 2
    per_layer = attn + mlp
    embedding = vocab * d_model
    return embedding + n_layers * per_layer

# GPT-2 small, a 7B-ish and a 70B-ish shape (illustrative shapes, not exact specs)
for name, v, d, l in [("GPT-2 small", 50_257, 768, 12),
                      ("~7B shape", 32_000, 4_096, 32),
                      ("~70B shape", 128_000, 8_192, 80)]:
    n = params_estimate(v, d, l)
    print(f"{name:12} ≈ {n / 1e9:6.2f} B params   weights in 16-bit: {n * 2 / 1e9:7.1f} GB")
```

That last column is why a 70B model needs **multiple GPUs** at 16-bit precision: 140 GB of weights alone. It is also why quantization (module 9) matters.

## What model cards mention (decoder glossary)

| Term | Meaning | Why you care |
|---|---|---|
| **Layers / hidden size / heads** | depth, width, parallel attention patterns | size and quality |
| **GQA / MQA** | many query heads share a few key/value heads ([GQA paper](https://arxiv.org/abs/2305.13245)) | shrinks the KV cache, so cheaper long-context serving |
| **RoPE scaling (YaRN, etc.)** | stretches positions to longer contexts | how a model extends its window |
| **SwiGLU** | gated MLP | slightly better quality at equal cost |
| **MoE (mixture of experts)** | many MLP "experts"; a router sends each token to a few ([Switch](https://arxiv.org/abs/2101.03961), [Mixtral](https://arxiv.org/abs/2401.04088)) | huge total parameters, but only a fraction active per token, giving cheaper inference per quality |
| **Sliding-window attention** | attend only to nearby tokens in some layers | long inputs at lower cost |
| **Context length** | max tokens the position scheme supports | how much you can put in the prompt |
| **Vocabulary size** | tokens in the tokenizer | affects multilingual efficiency |

:::note Alternatives to attention
**State-space models** such as Mamba ([paper](https://arxiv.org/abs/2312.00752)) and hybrids process sequences with a fixed-size state, giving linear-time inference. Hybrids that mix attention and recurrence layers are increasingly common. The Transformer remains the dominant design, and the ideas in this module (tokens, embeddings, next-token prediction, KV caching) apply to the alternatives too.
:::

## Encoder, decoder, or both?

| Family | Attention | Examples | Typical use |
|---|---|---|---|
| Encoder-only | sees the whole input both ways | BERT, embedding models, rerankers | classification, search, embeddings |
| Decoder-only | causal | GPT, Claude, Llama, Qwen, Gemma | generation, chat, agents |
| Encoder–decoder | encoder reads input; decoder generates | T5, Whisper | translation, speech-to-text |

```quiz
? What does a residual connection do?
- It drops random neurons
+ It adds a layer's input to its output so layers learn corrections and gradients flow through deep stacks
- It normalises the embeddings
> x + f(x) gives information and gradients a direct path through the network.

? Why does a Transformer need positional information?
- To make the model smaller
+ Because attention alone has no sense of token order
- To handle different languages
> Without position, "dog bites man" and "man bites dog" would look identical to attention.

? Which part of a block holds most parameters?
- Layer normalisation
+ The attention and feed-forward matrices (about 12·D² per layer)
- The softmax
> Norms are tiny; matrix weights dominate.

? In a mixture-of-experts model, what is true?
+ Each token activates only a few experts, so active parameters per token are far fewer than total parameters
- Every token uses every expert
- Experts are separate models trained independently
> MoE gives large capacity at lower per-token compute, though all experts still need to fit in memory.
```

:::problem Why can a 70B-parameter model not run on one 24 GB consumer GPU at 16-bit precision, and what are your options? {level=medium tags="parameters,memory,quantization"}
Do the arithmetic.

:::solution Model answer
At 16 bits (2 bytes/parameter) the weights alone are 70B × 2 = **140 GB**, far above 24 GB, before counting the KV cache and activations. Options: **quantize** to 4-bit (about 35–40 GB, still too big for one 24 GB card but fine on two, or on one 48/80 GB card); **shard** across several GPUs (tensor/pipeline parallelism); **offload** layers to CPU RAM (slow); use a **smaller or MoE** model with fewer active parameters; or use a **hosted API**.
:::
:::

:::keypoints
- A decoder block = norm → attention → residual add → norm → MLP → residual add; the model is that block repeated, plus embedding in and logits out.
- Residuals and normalisation make deep stacks trainable; RoPE encodes position through rotation of queries and keys.
- Parameters per layer ≈ 12·D²; weights in 16-bit take 2 bytes per parameter.
- Model-card terms (GQA, MoE, SwiGLU, RoPE scaling) are variations on this recipe that trade quality, memory and speed.
- Decoder-only models generate; encoder-only models embed and classify.
:::

:::resources
- [Karpathy: nanoGPT](https://github.com/karpathy/nanoGPT) and [nanochat](https://github.com/karpathy/nanochat) — a complete GPT and a full ChatGPT-style pipeline in a small, readable codebase.
- [Sebastian Raschka: LLMs from scratch](https://github.com/rasbt/LLMs-from-scratch) — the code companion to *Build a Large Language Model (From Scratch)*.
- [Lilian Weng: The Transformer Family v2](https://lilianweng.github.io/posts/2023-01-27-the-transformer-family-v2/) — a catalogue of every variant, with the maths.
- [The Illustrated GPT-2](https://jalammar.github.io/illustrated-gpt2/) — the decoder-only story, visually.
- [RoFormer (RoPE)](https://arxiv.org/abs/2104.09864), [GQA](https://arxiv.org/abs/2305.13245), [Mixtral of Experts](https://arxiv.org/abs/2401.04088) — three papers that define modern model cards.
- [LLM Visualization](https://bbycroft.net/llm) — watch every matrix multiplication in a small GPT.
:::
