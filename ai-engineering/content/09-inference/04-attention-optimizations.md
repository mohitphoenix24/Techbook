---
title: Faster Attention — FlashAttention, Sparsity and Alternatives
level: advanced
time: 50
summary: Attention's cost is dominated by memory traffic, not arithmetic. How FlashAttention computes exact attention in tiles with an online softmax (implemented and verified in NumPy), the IO-awareness idea, FlashDecoding and ring attention for long contexts, sliding-window and sparse attention, linear attention and state-space models as alternatives, and how to choose attention backends in practice.
---

Standard attention computes an `n × n` score matrix, softmaxes it, and multiplies by the values. For long sequences that matrix is enormous, and **writing it to GPU memory and reading it back** costs far more time than the multiplications. The key insight of modern attention kernels: **attention is memory-bound, so reduce memory traffic, not FLOPs.**

## The problem with the naive version

1. Compute `S = QKᵀ` (n × n) and **write it to HBM**.
2. Read `S`, compute softmax, **write `P` to HBM**.
3. Read `P`, multiply by `V`, write the output.

Memory movement is O(n²) per head per layer, while GPUs have a small, very fast on-chip memory (SRAM, ~20–50 MB across the chip at hundreds of KB per SM) and a large, slower HBM. The naive approach shuttles huge intermediate matrices between them.

## FlashAttention: tile it, never store the matrix

**FlashAttention** ([Dao et al.](https://arxiv.org/abs/2205.14135)) computes **exact** attention without ever materialising the `n × n` matrix. It processes `Q`, `K`, `V` in **tiles** that fit in SRAM, and keeps running statistics so the softmax can be computed incrementally. HBM traffic drops from O(n²) to O(n²d/M) (with SRAM size `M`), and memory use for attention becomes **linear** in sequence length. Result: 2–4× faster training and inference at long sequences, enabling long contexts at all. FlashAttention-2 ([paper](https://arxiv.org/abs/2307.08691)) improved parallelism and work partitioning; FlashAttention-3 targets Hopper GPUs with asynchrony and FP8.

### The online softmax trick

Softmax needs the max and the sum over **all** scores in a row, which seems to require the full row. But you can maintain a **running max `m` and running sum `ℓ`** and **rescale** earlier partial results when a new tile reveals a larger max:

:::flow Online softmax across tiles
Start | m = −∞, ℓ = 0, output accumulator o = 0
For each tile of keys | compute scores s for this tile
Update the max | m_new = max(m, max(s))
Rescale old state | o and ℓ are multiplied by exp(m − m_new)
Add the tile | ℓ += Σ exp(s − m_new); o += exp(s − m_new)·V_tile
End | output = o / ℓ  (exactly standard attention)
:::

```python run title="Tiled attention with online softmax equals standard attention" level=advanced
import numpy as np

rng = np.random.default_rng(0)
n, d, tile = 256, 32, 64
Q, K, V = (rng.normal(size=(n, d)) for _ in range(3))
scale = 1 / np.sqrt(d)

def standard_attention(Q, K, V):
    S = Q @ K.T * scale
    P = np.exp(S - S.max(axis=1, keepdims=True)); P /= P.sum(axis=1, keepdims=True)
    return P @ V                                              # materialises the full n x n matrices

def flash_attention(Q, K, V, tile):
    n, d = Q.shape
    O = np.zeros((n, d))
    m = np.full(n, -np.inf)                                    # running max per query row
    l = np.zeros(n)                                            # running softmax denominator
    for start in range(0, n, tile):                            # iterate over KEY/VALUE tiles
        Kt, Vt = K[start:start + tile], V[start:start + tile]
        S = Q @ Kt.T * scale                                   # scores against this tile only: (n, tile)
        m_new = np.maximum(m, S.max(axis=1))
        correction = np.exp(m - m_new)                         # rescale what we accumulated so far
        P = np.exp(S - m_new[:, None])
        l = l * correction + P.sum(axis=1)
        O = O * correction[:, None] + P @ Vt
        m = m_new
    return O / l[:, None]

ref, out = standard_attention(Q, K, V), flash_attention(Q, K, V, tile)
print("identical to standard attention (up to float rounding):", bool(np.allclose(ref, out, atol=1e-10)), "| max |difference| < 1e-12:", bool(np.abs(ref - out).max() < 1e-12))
print(f"memory for the score matrix: standard {n * n:,} numbers; tiled only {n * tile:,} at a time (tile={tile})")
```

The result is **exact**: it is not an approximation. That is the elegance: same maths, different order of operations, vastly less memory traffic.

:::def IO-awareness
Designing an algorithm around the **cost of moving data** between memory levels (HBM and SRAM), not just counting arithmetic. FlashAttention's speedup comes entirely from fewer HBM reads and writes.
:::

## Decoding and long contexts

- **FlashDecoding / split-KV**: during decode there is only one query token, so parallelism must come from splitting the **KV sequence** across thread blocks, then combining partial results with the same online-softmax rescaling.
- **Paged and prefix-aware kernels** (FlashInfer, vLLM kernels): attention that reads KV from non-contiguous blocks efficiently.
- **Ring attention / sequence parallelism**: split a very long sequence across GPUs and pass KV blocks around a ring while computing, overlapping communication with compute, to reach million-token contexts.
- **Chunked prefill**: process a long prompt in chunks interleaved with decode steps, so prefill does not starve decode users.

## Cheaper patterns of attention

| Pattern | Idea | Trade-off |
|---|---|---|
| **Sliding-window (local) attention** | each token attends only to the last W tokens (some layers) | linear cost and bounded KV; long-range needs other layers |
| **Global + local mix** | a few global tokens/layers + local windows (Longformer, Gemma-style interleaving) | good long-context efficiency |
| **Block-sparse / strided** | fixed sparse patterns | speed; may lose information |
| **Learned sparse / top-k retrieval attention** | attend to the most relevant past tokens | active research; needs indexing |
| **Compressed attention** | summarise old tokens into fewer slots (memory tokens; MLA latent) | smaller KV; training required |

## Alternatives to quadratic attention

| Family | Idea | Notes |
|---|---|---|
| **Linear attention** | replace softmax with a kernel feature map so attention becomes a running sum: O(n) time, constant state | quality gap at scale; recent variants narrow it |
| **State-space models (Mamba, [paper](https://arxiv.org/abs/2312.00752))** | a recurrent state updated with input-dependent (selective) dynamics | linear time, constant memory per token, fast decode; weaker at some recall tasks |
| **Hybrids** (attention + SSM/linear layers, e.g. Jamba, Griffin [paper](https://arxiv.org/abs/2402.19427)) | few attention layers for exact recall, many cheap layers elsewhere | much smaller KV cache |
| **Test-time memory** ([Titans](https://arxiv.org/abs/2501.00663) and similar) | learn to memorise during inference | research frontier |

For now, **Transformers with GQA, FlashAttention-style kernels and long-context tricks dominate deployments**, with hybrids appearing where KV memory is the bottleneck.

## Choosing a backend in practice

You rarely write kernels; you **select** them:

- Hugging Face Transformers: `attn_implementation="sdpa"` (PyTorch's scaled-dot-product attention, which dispatches to FlashAttention-style kernels), `"flash_attention_2"` (needs the `flash-attn` package and a supported GPU), or `"eager"` (slow reference).
- **vLLM / SGLang** choose optimised backends automatically (FlashAttention, FlashInfer, Triton, ROCm kernels) and expose flags to override.
- Check **hardware support** (Ampere/Hopper/Blackwell, AMD, TPU) and **features** (sliding windows, GQA, ALiBi, FP8, paged KV).
- **Benchmark** on your sequence-length distribution: kernels differ at 512 vs 128K tokens.

```python local title="Selecting an attention implementation (Hugging Face)"
import torch
from transformers import AutoModelForCausalLM

model = AutoModelForCausalLM.from_pretrained(
    "Qwen/Qwen3-4B-Instruct-2507",
    torch_dtype=torch.bfloat16,
    attn_implementation="sdpa",          # or "flash_attention_2" if installed; avoid "eager" except for debugging
    device_map="auto",
)
```

```python run title="How attention cost grows: naive memory vs tiled working set" level=easy
def gb(x): return x / 1e9
heads, layers = 32, 32
print(f"{'seq length':>12} {'score matrix per layer (fp16, all heads)':>42} {'tiled working set (tile=128)':>30}")
for n in (2_048, 8_192, 32_768, 131_072):
    naive = n * n * 2 * heads                  # bytes for one layer's full score matrices if materialised
    tiled = n * 128 * 2 * heads                # only an n x tile slab at a time
    print(f"{n:>12,} {gb(naive):>38.1f} GB {gb(tiled):>26.2f} GB")
```

```quiz
? What is the main idea of FlashAttention?
+ Compute exact attention in tiles with an online softmax so the n×n matrix is never written to slow memory
- Approximate attention with random sampling
- Remove softmax
> It is an IO-aware exact algorithm.

? Why is attention usually memory-bound rather than compute-bound?
+ The intermediate score matrices must move between slow HBM and fast SRAM, costing more time than the arithmetic
- The GPU has no multipliers
- Softmax is very expensive arithmetic
> Reducing memory traffic is what speeds it up.

? What does the running max and rescaling in online softmax accomplish?
+ It lets softmax be computed across tiles without seeing the whole row at once, yielding the exact result
- It makes the result approximate
- It removes the need for values
> The correction factor exp(m_old − m_new) fixes earlier partial sums.

? Which approach gives a constant-size state per token instead of a growing KV cache?
+ State-space or linear-attention layers (for example Mamba)
- Multi-head attention
- A bigger context window
> Recurrent state replaces the cache, with different quality trade-offs.
```

:::problem Explain to a colleague why FlashAttention is faster even though it performs slightly more arithmetic. {level=medium tags="flashattention,io"}
Use the memory hierarchy.

:::solution Model answer
GPU time is dominated by moving data between large, slow HBM and tiny, fast SRAM. Naive attention writes and re-reads the n×n score and probability matrices to HBM, costing O(n²) memory traffic. FlashAttention processes small tiles entirely in SRAM, keeping running softmax statistics and the output accumulator, so it reads Q, K, V once and writes the output once, never storing the full matrix. It does a bit more arithmetic (rescaling corrections, and recomputation in the backward pass) but trades cheap compute for expensive memory movement, a net win because attention is memory-bound.
:::
:::

:::keypoints
- Attention is memory-bound: naive implementations spend most time moving the n×n matrices between HBM and SRAM.
- FlashAttention computes exact attention in tiles using an online softmax (running max and sum with rescaling), cutting memory traffic and making memory linear in sequence length.
- Long-context serving adds split-KV decoding, paged-KV kernels, chunked prefill and ring/sequence parallelism.
- Cheaper patterns (sliding windows, sparse attention) and alternatives (linear attention, SSMs, hybrids) reduce quadratic cost or KV size at some quality trade-offs.
- In practice choose an optimised backend (SDPA/FlashAttention/FlashInfer) and benchmark at your sequence lengths.
:::

:::resources
- [FlashAttention](https://arxiv.org/abs/2205.14135) and [FlashAttention-2](https://arxiv.org/abs/2307.08691) — the papers; plus the [repo](https://github.com/Dao-AILab/flash-attention).
- [Horace He: Making Deep Learning Go Brrrr](https://horace.io/brrr_intro.html) — why memory bandwidth dominates.
- [Mamba](https://arxiv.org/abs/2312.00752) and [Griffin](https://arxiv.org/abs/2402.19427) — state-space and hybrid architectures.
- [Efficient Streaming Language Models with Attention Sinks](https://arxiv.org/abs/2309.17453) — streaming attention.
- [Lilian Weng: The Transformer Family v2](https://lilianweng.github.io/posts/2023-01-27-the-transformer-family-v2/) — sparse and efficient attention variants.
- [Sebastian Raschka: LLMs from scratch](https://github.com/rasbt/LLMs-from-scratch) — attention variants implemented from scratch.
:::
