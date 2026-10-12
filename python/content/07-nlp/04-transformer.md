---
title: The Transformer Architecture
level: advanced
time: 45
summary: Assemble a complete GPT-style Transformer in NumPy — embeddings, positional information, attention + MLP blocks with residuals and LayerNorm, and the output head — then see how the KV cache, RoPE, GQA and Mixture-of-Experts shape modern LLMs.
---

You now have all the parts: embeddings, attention, MLPs, LayerNorm and residual connections. A **Transformer** is these parts stacked in a specific, repeated pattern. This lesson assembles a working (untrained) GPT-style model and explains every line.

:::def Transformer
A neural network architecture (Vaswani et al., 2017) built from repeated **blocks**, each containing **self-attention** (tokens exchange information) and an **MLP** (each token processes the information it gathered), wrapped with **residual connections** and **normalization**.
:::

## The big picture of a decoder-only LLM

:::flow GPT-style forward pass
Tokenize | text → token IDs
Embed | IDs → vectors (+ position)
N × Block | attention + MLP
Final norm | LayerNorm / RMSNorm
Unembed | vectors → logits over vocab
Softmax | probabilities for the next token
:::

```text
                ┌──────────────────────── × N blocks ────────────────────────┐
 token ids ─▶ embedding ─▶ [ x + Attention(Norm(x)) ] ─▶ [ x + MLP(Norm(x)) ] ─▶ Norm ─▶ Linear ─▶ logits
                   + positions
```

## Positional information

Attention by itself is **order-blind**: "dog bites man" and "man bites dog" contain the same tokens. We must inject position.

:::def Positional encoding
Information about each token's position, added to (or applied to) its vectors. The original Transformer added fixed **sinusoidal** patterns; GPT-2 learned a position embedding table; most modern LLMs use **RoPE** (rotary embeddings), which rotates query and key vectors by an angle depending on position.
:::

```python run level=intermediate
import numpy as np
import matplotlib.pyplot as plt

def sinusoidal_positions(T, d):
    pos = np.arange(T)[:, None]
    i = np.arange(d // 2)[None, :]
    angles = pos / (10000 ** (2 * i / d))
    pe = np.zeros((T, d))
    pe[:, 0::2] = np.sin(angles)
    pe[:, 1::2] = np.cos(angles)
    return pe

pe = sinusoidal_positions(64, 32)
fig, ax = plt.subplots(figsize=(8, 3.5))
ax.imshow(pe.T, aspect="auto", cmap="RdBu")
ax.set(title="Sinusoidal positional encodings (each column = one position)", xlabel="position", ylabel="dimension")
plt.show()

sims = pe @ pe[10]
print("similarity of position 10 with positions 8..12:", sims[8:13].round(2), "→ nearby positions look alike")
```

## One Transformer block

:::def Pre-norm Transformer block
The arrangement used by GPT-2 and later LLMs: `x = x + Attention(Norm(x))`, then `x = x + MLP(Norm(x))`. Normalizing **before** each sub-layer, and adding the result back (residual), keeps very deep stacks stable.
:::

:::def Residual stream
The running vector for each token that flows through all the blocks. Each attention and MLP layer **reads** from it and **adds** its result back. Interpretability researchers think of it as the model's shared working memory.
:::

## A complete tiny GPT in NumPy

Everything below is the real architecture, just small and untrained. Read it top to bottom — each piece maps to a lesson you've done.

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)

# ---------- config ----------
vocab_size, d_model, n_heads, n_layers, max_T = 50, 32, 4, 2, 16
d_head = d_model // n_heads

# ---------- helpers ----------
def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

def layer_norm(x, g, b, eps=1e-5):
    mu, var = x.mean(-1, keepdims=True), x.var(-1, keepdims=True)
    return g * (x - mu) / np.sqrt(var + eps) + b

def gelu(x):
    return 0.5 * x * (1 + np.tanh(np.sqrt(2 / np.pi) * (x + 0.044715 * x ** 3)))

def init(*shape, scale=0.02):
    return rng.normal(0, scale, shape)

# ---------- parameters ----------
params = {
    "tok_emb": init(vocab_size, d_model),          # token embedding table
    "pos_emb": init(max_T, d_model),               # learned positions (GPT-2 style)
    "blocks": [dict(
        ln1_g=np.ones(d_model), ln1_b=np.zeros(d_model),
        W_qkv=init(d_model, 3 * d_model), W_o=init(d_model, d_model),
        ln2_g=np.ones(d_model), ln2_b=np.zeros(d_model),
        W_up=init(d_model, 4 * d_model), W_down=init(4 * d_model, d_model),
    ) for _ in range(n_layers)],
    "lnf_g": np.ones(d_model), "lnf_b": np.zeros(d_model),
}

def attention(x, blk):
    T = x.shape[0]
    q, k, v = np.split(x @ blk["W_qkv"], 3, axis=-1)
    heads = lambda t: t.reshape(T, n_heads, d_head).transpose(1, 0, 2)
    q, k, v = heads(q), heads(k), heads(v)
    scores = q @ k.transpose(0, 2, 1) / np.sqrt(d_head)
    scores = np.where(np.tril(np.ones((T, T), bool)), scores, -np.inf)   # causal mask
    out = softmax(scores) @ v
    return out.transpose(1, 0, 2).reshape(T, d_model) @ blk["W_o"]

def mlp(x, blk):
    return gelu(x @ blk["W_up"]) @ blk["W_down"]   # expand 4x, non-linearity, project back

def gpt_forward(token_ids):
    T = len(token_ids)
    x = params["tok_emb"][token_ids] + params["pos_emb"][:T]          # (T, d_model)
    for blk in params["blocks"]:
        x = x + attention(layer_norm(x, blk["ln1_g"], blk["ln1_b"]), blk)   # residual + attention
        x = x + mlp(layer_norm(x, blk["ln2_g"], blk["ln2_b"]), blk)         # residual + MLP
    x = layer_norm(x, params["lnf_g"], params["lnf_b"])
    return x @ params["tok_emb"].T                 # weight tying: reuse the embedding to get logits

ids = np.array([3, 14, 15, 9, 26])
logits = gpt_forward(ids)
probs = softmax(logits[-1])                        # distribution over the NEXT token
print("logits shape:", logits.shape, "= (positions, vocab)")
print("next-token prediction:", int(probs.argmax()), f"with p={probs.max():.3f} (untrained ≈ uniform 1/{vocab_size})")

count = lambda o: o.size if isinstance(o, np.ndarray) else sum(count(v) for v in (o.values() if isinstance(o, dict) else o))
print(f"parameters: {count(params):,}")
```

:::def Logits over the vocabulary
The model's final output: for **every position**, one score per vocabulary token. Softmax of the last position's logits is the probability distribution for the **next** token. During training, every position predicts its own next token at once — that's why Transformers train so efficiently.
:::

:::def Weight tying
Reusing the token-embedding matrix (transposed) as the output layer. It saves parameters and often improves quality — many language models do it.
:::

## Generating text: the autoregressive loop

:::def Autoregressive generation
Producing text one token at a time: run the model, pick the next token from the predicted distribution, **append** it to the input, and repeat. Every chatbot answer is generated this way.
:::

```python run level=advanced
import numpy as np

rng = np.random.default_rng(1)
V, d = 12, 16
vocab = ["<s>", "the", "cat", "dog", "sat", "ran", "on", "mat", "rug", "fast", ".", "<e>"]
E = rng.normal(0, 1, (V, d))
W = rng.normal(0, 1, (d, V))

def toy_model(ids):
    """Stand-in for gpt_forward: mean of embeddings -> logits (enough to show the loop)."""
    return np.tanh(E[ids].mean(0)) @ W

def generate(prompt_ids, max_new=8, temperature=0.8):
    ids = list(prompt_ids)
    for _ in range(max_new):
        logits = toy_model(np.array(ids)) / temperature
        p = np.exp(logits - logits.max()); p /= p.sum()
        nxt = int(rng.choice(V, p=p))                 # sample the next token
        ids.append(nxt)                               # feed it back in
        if vocab[nxt] == "<e>":
            break
    return " ".join(vocab[i] for i in ids)

print(generate([0, 1, 2]))
print(generate([0, 1, 3]))
```

The output is gibberish — the model is untrained — but the **loop** is exactly what happens inside every LLM API call.

## The KV cache: why generation is fast

At each new step, the earlier tokens' keys and values don't change. Recomputing them every time would waste work, so inference engines **cache** them.

:::def KV cache
Storing the attention **keys and values** of all previous tokens during generation, so each new token only computes its own Q, K, V and attends to the cache. It turns generation from quadratic to roughly linear work per token — at the cost of memory that grows with context length.
:::

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
d = 16
Wq, Wk, Wv = (rng.normal(0, 0.3, (d, d)) for _ in range(3))
tokens = rng.normal(size=(6, d))

def softmax(x):
    e = np.exp(x - x.max()); return e / e.sum()

# without cache: recompute K, V for the whole prefix at every step
ops_no_cache = 0
for t in range(1, len(tokens) + 1):
    K, V = tokens[:t] @ Wk, tokens[:t] @ Wv
    ops_no_cache += 2 * t
    out_no_cache = softmax((tokens[t - 1] @ Wq) @ K.T / np.sqrt(d)) @ V

# with cache: compute K, V once per token and append
K_cache, V_cache, ops_cache = [], [], 0
for t in range(len(tokens)):
    K_cache.append(tokens[t] @ Wk); V_cache.append(tokens[t] @ Wv); ops_cache += 2
    out_cache = softmax((tokens[t] @ Wq) @ np.array(K_cache).T / np.sqrt(d)) @ np.array(V_cache)

print("same final output:", np.allclose(out_no_cache, out_cache))
print("K/V projections computed — without cache:", ops_no_cache, "| with cache:", ops_cache)

# memory: 2 (K and V) × layers × heads × head_dim × tokens × 2 bytes (bf16)
layers, kv_heads, head_dim = 64, 8, 128
for T in [8_000, 128_000, 1_000_000]:
    gb = 2 * layers * kv_heads * head_dim * T * 2 / 1e9
    print(f"KV cache for {T:>9,} tokens ≈ {gb:6.1f} GB (one sequence)")
```

That memory cost is why providers price long contexts carefully and offer **prompt caching** — reusing the KV cache of a repeated prefix (like a long system prompt) across requests.

## Three Transformer families

| Family | Attention | Trained to | Examples | Good for |
|---|---|---|---|---|
| **Encoder-only** | bidirectional | fill in masked words | BERT, RoBERTa, embedding models | classification, embeddings, search |
| **Decoder-only** | causal | predict the next token | GPT, Claude, Llama, Gemini | generation, chat, reasoning — today's LLMs |
| **Encoder-decoder** | encoder bidirectional + decoder causal with cross-attention | map input text → output text | T5, original Transformer, Whisper | translation, summarization, speech-to-text |

## Modern upgrades (2023–2026 LLMs)

| Component | Original (2017) | Typical modern LLM |
|---|---|---|
| positions | sinusoidal / learned | **RoPE** (rotary), extended for long context |
| normalization | post-LayerNorm | **pre-RMSNorm** |
| MLP activation | ReLU | **SwiGLU** (gated SiLU) |
| attention heads | full multi-head | **GQA** — grouped-query attention (shared K/V heads → smaller KV cache) |
| attention kernel | plain | **FlashAttention** |
| feed-forward | one dense MLP | often **Mixture-of-Experts** (MoE) |

:::def RoPE (rotary position embedding)
Encodes position by **rotating** query and key vectors by an angle proportional to their position. The dot product between a query and key then depends on their **relative** distance — which generalizes well and can be stretched to longer contexts.
:::

```python run level=advanced
import numpy as np

def rope(x, pos, base=10000):
    d = x.shape[-1]
    freqs = base ** (-np.arange(0, d, 2) / d)
    angle = pos * freqs
    x1, x2 = x[0::2], x[1::2]
    out = np.empty_like(x)
    out[0::2] = x1 * np.cos(angle) - x2 * np.sin(angle)     # rotate each pair of dimensions
    out[1::2] = x1 * np.sin(angle) + x2 * np.cos(angle)
    return out

rng = np.random.default_rng(0)
q, k = rng.normal(size=8), rng.normal(size=8)
print("RoPE score depends only on relative distance:")
for qp, kp in [(5, 3), (105, 103), (1005, 1003)]:
    print(f"  q at {qp:>4}, k at {kp:>4} (distance 2) → score {rope(q, qp) @ rope(k, kp):+.4f}")
```

:::def Mixture of Experts (MoE)
Replacing the single MLP in each block with many "expert" MLPs plus a small **router** that sends each token to only the top 1–2 experts. The model has huge total capacity, but each token only uses a fraction of the parameters — so it runs much cheaper than a dense model of the same size.
:::

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
d, n_experts, top_k = 8, 4, 2
experts = [rng.normal(0, 0.3, (d, d)) for _ in range(n_experts)]
router = rng.normal(0, 1, (d, n_experts))

def moe(x):
    logits = x @ router
    chosen = np.argsort(logits)[-top_k:]                   # pick the top-k experts
    gates = np.exp(logits[chosen]); gates /= gates.sum()
    return sum(g * np.tanh(x @ experts[e]) for g, e in zip(gates, chosen)), chosen

for i in range(4):
    token = rng.normal(size=d)
    _, used = moe(token)
    print(f"token {i}: routed to experts {sorted(used.tolist())}  ({top_k}/{n_experts} experts active)")
```

## How big are real models?

```python run level=intermediate
def gpt_params(n_layers, d_model, vocab, mlp_mult=4):
    attn = 4 * d_model * d_model                    # Q, K, V, O projections
    mlp = 2 * mlp_mult * d_model * d_model          # up + down projections
    return n_layers * (attn + mlp) + vocab * d_model

for name, cfg in {"GPT-2 small": (12, 768, 50257), "GPT-2 XL": (48, 1600, 50257),
                  "a 7B-class model": (32, 4096, 32000), "a 70B-class model": (80, 8192, 128000)}.items():
    print(f"{name:<18} ≈ {gpt_params(*cfg) / 1e9:6.2f} B parameters")
```

(The rough formula ignores small details like GQA and SwiGLU's three matrices, but lands in the right ballpark.)

:::ai
When you call Claude through the API, your messages are tokenized, run through a very large decoder-only Transformer like the one you just built, and decoded token by token with a KV cache — with careful sampling, safety systems and a lot of engineering around it. The architecture fits on this page; the scale and training data are what make it powerful.
:::

## Check yourself

```quiz
? Why do Transformers need positional information?
+ Attention alone treats the input as an unordered set of tokens
- To reduce memory
- To make softmax work
> Without positions, "dog bites man" = "man bites dog".

? In a pre-norm block, what is computed?
+ x = x + Attention(Norm(x)), then x = x + MLP(Norm(x))
- x = Norm(Attention(x) + MLP(x))
- x = Attention(MLP(x))
> Each sub-layer reads a normalized copy and adds its result to the residual stream.

? What does the KV cache store?
+ Keys and values of previous tokens, so they aren't recomputed each generation step
- The final answer
- The tokenizer vocabulary
> It trades memory for speed during generation.

? What is the main benefit of Mixture-of-Experts?
+ Huge total capacity while each token only uses a few experts (cheaper per token)
- Fewer total parameters
- No need for attention
> A router picks the top-k experts per token.
```

:::keypoints
- A decoder-only LLM: **embed** tokens (+ positions) → **N blocks** of attention + MLP with residuals and norms → **unembed** to logits → softmax for the next token.
- Text is generated **autoregressively**, one token at a time; the **KV cache** makes this efficient.
- Encoder-only (BERT) for understanding/embeddings, decoder-only (GPT/Claude) for generation, encoder-decoder (T5) for seq2seq.
- Modern LLMs use RoPE, RMSNorm, SwiGLU, GQA, FlashAttention and often Mixture-of-Experts.
:::
