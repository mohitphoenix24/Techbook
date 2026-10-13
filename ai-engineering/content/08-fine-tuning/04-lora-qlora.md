---
title: LoRA and QLoRA — Fine-Tuning on a Budget
level: advanced
time: 55
summary: Why a tiny low-rank update can adapt a huge model. The idea and the math (W + BA), parameter and memory arithmetic, choosing rank, alpha and target modules, QLoRA (4-bit NF4 base, double quantisation, paged optimisers), merging and swapping adapters, DoRA and friends, and what LoRA can and cannot do. With an interactive calculator and a NumPy LoRA that you can watch learn.
---

Full fine-tuning updates every weight and needs memory for gradients and optimiser state: about **16 bytes per parameter**. A 7B model needs ~112 GB just for that. **LoRA** (Low-Rank Adaptation, [Hu et al.](https://arxiv.org/abs/2106.09685)) made fine-tuning practical on a single GPU by training a **tiny add-on** and leaving the original weights frozen.

:::analogy
You do not repaint a whole house to change its mood; you hang new curtains. The house (the pretrained weights) stays as it was. The curtains (the adapter) are small, cheap to make, easy to swap, and change the feel of every room.
:::

## The idea

When fine-tuning, the weight update `ΔW` for a layer turns out to have **low intrinsic rank**: it can be well approximated by the product of two thin matrices. So instead of learning a full `d × k` update, learn:

:::formula LoRA update
W' = W + \frac{\alpha}{r}\, B A,\qquad B\in\mathbb{R}^{d\times r},\; A\in\mathbb{R}^{r\times k},\; r \ll \min(d,k)
:::

- `W` is **frozen** (no gradients, no optimiser state).
- `A` (initialised randomly) and `B` (initialised to **zeros**, so the model starts unchanged) are **trained**.
- `r` is the **rank**; `α` (alpha) is a scaling factor so you can change `r` without retuning the learning rate (the update is scaled by `α/r`).

For a 4096 × 4096 matrix (16.8M numbers), rank 16 trains `2 × 4096 × 16 = 131K` numbers: **0.8%**.

Play with it: change the model, rank and which layers get adapters, and watch trainable parameters and GPU memory.

```viz algo=lora title="LoRA and QLoRA calculator" model=8B rank=16
```

## See it learn

Here a "layer" `W` must be adapted to a new target. We train only a rank-`r` update with gradient descent and compare it to the best possible full update.

```python run title="A low-rank update recovers a low-rank change" level=advanced
import numpy as np

rng = np.random.default_rng(0)
d, k, true_rank = 64, 64, 4
W = rng.normal(size=(d, k)) / np.sqrt(k)                           # the frozen "pretrained" weights

# the change we want to learn has low intrinsic rank (that is the LoRA assumption)
delta_true = (rng.normal(size=(d, true_rank)) @ rng.normal(size=(true_rank, k))) * 0.15
X = rng.normal(size=(512, k))                                      # inputs
Y = X @ (W + delta_true).T                                         # target outputs of the adapted layer

def train_lora(r, steps=4000, lr=0.02, alpha=None):
    alpha = alpha or r
    A = rng.normal(size=(r, k)) * 0.05                              # random init
    B = np.zeros((d, r))                                           # zero init => starts exactly at W
    for _ in range(steps):
        delta = (alpha / r) * (B @ A)
        err = X @ (W + delta).T - Y                                # (n, d)
        g = err.T @ X / len(X)                                     # gradient wrt delta (d, k)
        gB, gA = (alpha / r) * g @ A.T, (alpha / r) * B.T @ g
        B -= lr * gB; A -= lr * gA
    delta = (alpha / r) * (B @ A)
    return np.mean((X @ (W + delta).T - Y) ** 2), delta

base_err = np.mean((X @ W.T - Y) ** 2)
print(f"error with no adaptation: {base_err:.4f}")
for r in (1, 2, 4, 8):
    err, _ = train_lora(r)
    params = r * (d + k)
    print(f"rank {r}: error {err:.5f}   trainable numbers {params:>5} ({params / (d * k):.0%} of the full update)")
print(f"(the true change has rank {true_rank}: ranks below it cannot fully capture it, ranks at or above it can)")
```

## Memory arithmetic

For a model with `P` parameters and adapter parameters `p`:

| Method | Weights | Gradients | Optimiser state (Adam) | Rough total (bf16) |
|---|---|---|---|---|
| **Full fine-tuning** | 2P | 2P | 12P (fp32 master + m + v) | **≈ 16 P bytes** |
| **LoRA** (16-bit base) | 2P (frozen) | 2p | 12p | ≈ 2P + 16p |
| **QLoRA** (4-bit base) | ≈ 0.5P (frozen, quantised) | 2p | 12p | ≈ 0.55P + 16p |

```python run title="GPU memory for 7B and 70B models: full vs LoRA vs QLoRA" level=intermediate
def gb(x): return x / 1e9

def memory(P, adapter_frac=0.008):
    p = P * adapter_frac
    return {
        "full fine-tuning":  16 * P,
        "LoRA (bf16 base)":  2 * P + 16 * p,
        "QLoRA (4-bit base)": 0.56 * P + 16 * p,
    }

for name, P in (("7B", 7e9), ("13B", 13e9), ("70B", 70e9)):
    print(f"\n{name}  (adapter ≈ 0.8% of parameters; excludes activations)")
    for method, b in memory(P).items():
        fits = "fits a 24 GB GPU" if gb(b) < 22 else "fits an 80 GB GPU" if gb(b) < 76 else "needs multiple GPUs"
        print(f"  {method:20} {gb(b):>7.1f} GB   {fits}")
```

That is why **QLoRA put 65B-parameter fine-tuning on a single 48 GB GPU** ([paper](https://arxiv.org/abs/2305.14314)) and why 7–8B models tune on a laptop-class or free-tier GPU.

## QLoRA in three ideas

1. **4-bit NormalFloat (NF4)** quantisation of the frozen base weights: a 4-bit format designed for normally distributed weights, with far less quality loss than naive 4-bit integers.
2. **Double quantisation**: quantise the quantisation constants themselves to save a bit more.
3. **Paged optimisers**: when GPU memory spikes, optimiser state pages to CPU memory instead of crashing.

During training, weights are **dequantised on the fly** to bf16 for each matrix multiply; gradients flow through the frozen quantised weights into the LoRA adapters (kept in 16-bit). Quality typically matches 16-bit LoRA closely, at a slowdown from the dequantisation.

## Choosing hyperparameters

| Setting | Guidance |
|---|---|
| **Rank `r`** | 8–64 is typical; start at 16. Higher ranks add capacity but also memory and overfitting risk. For **knowledge-heavy or large datasets**, use higher ranks; for style and format, low ranks suffice. Studies find LoRA matches full fine-tuning on small-to-medium datasets, and underperforms when the dataset exceeds its capacity ([LoRA Without Regret](https://thinkingmachines.ai/blog/lora/)). |
| **Alpha `α`** | commonly `α = r` or `α = 2r`. Scaling is `α/r`, so keep the ratio consistent when changing `r` |
| **Target modules** | modern guidance: **apply to all linear layers** (attention q,k,v,o **and** MLP gate/up/down), which beats attention-only at similar parameter counts |
| **Dropout** | 0–0.1 |
| **Learning rate** | 1e-4 to 3e-4 (about 10× higher than full fine-tuning) |
| **Bias/embeddings** | usually leave frozen; train embeddings only if adding new tokens |
| **Epochs, batch size** | as in the SFT lesson |

## Merging and serving adapters

An adapter is a **small file** (tens to hundreds of MB). Options at inference time:

- **Merge** it into the base: `W' = W + (α/r)BA`. The merged model is an ordinary model with **zero extra latency**.
- **Keep it separate** and load adapters dynamically: one base model in memory serving **many adapters** (per-customer, per-task), swapped per request (vLLM and LoRAX support multi-LoRA serving).

```python run title="Merging gives exactly the same outputs as running the adapter on the side" level=intermediate
import numpy as np

rng = np.random.default_rng(1)
d, k, r, alpha = 32, 32, 4, 8
W = rng.normal(size=(d, k)); B = rng.normal(size=(d, r)); A = rng.normal(size=(r, k))
x = rng.normal(size=(5, k))

unmerged = x @ W.T + (alpha / r) * (x @ A.T) @ B.T                  # base + adapter computed separately (extra matmuls)
W_merged = W + (alpha / r) * B @ A                                   # one-time merge
merged = x @ W_merged.T
print("merged and unmerged outputs identical (up to float rounding):", bool(np.allclose(unmerged, merged, atol=1e-9)))

# adapters can be swapped by changing (B, A) while keeping W: here is a "customer B" adapter
B2, A2 = rng.normal(size=(d, r)), rng.normal(size=(r, k))
print("output changes with the adapter, base weights untouched:", not np.allclose(x @ (W + (alpha / r) * B2 @ A2).T, merged))
```

Merging into a **quantised** base needs care (merge into the 16-bit weights, then re-quantise).

## Variants and relatives

| Method | Idea |
|---|---|
| **DoRA** | decompose weights into magnitude and direction; apply LoRA to the direction |
| **rsLoRA** | rank-stabilised scaling (`α/√r`) so high ranks train well |
| **LoRA+** | different learning rates for A and B |
| **QA-LoRA / LoftQ** | quantisation-aware initialisation to reduce QLoRA loss |
| **AdaLoRA** | allocate rank adaptively across layers |
| **Prefix / prompt tuning, adapters (bottleneck)** | other parameter-efficient methods |
| **GaLore** ([paper](https://arxiv.org/abs/2403.03507)) | low-rank *gradient* projection: full-parameter training with less optimiser memory |
| **Model merging** (TIES, DARE, SLERP) | combine multiple fine-tuned models' weights without training |

## What LoRA can and cannot do

**Can:** change style, format and behaviour; teach task skills; adapt to a domain; match full fine-tuning on moderate datasets; give you cheap per-task or per-customer variants; run on small hardware.

**Cannot (well):** inject large amounts of new knowledge (adapter capacity is limited, and knowledge is better handled by RAG); fully replace pretraining; fix a base model that lacks a capability; guarantee no forgetting (it limits it).

```quiz
? Why is B initialised to zeros in LoRA?
+ So the adapted model starts exactly equal to the pretrained one and diverges only as training proceeds
- To save memory
- Zeros train faster
> Starting from W unchanged avoids an initial quality hit.

? Roughly how much trainable-parameter share does a rank-16 LoRA on a 4096×4096 matrix have?
+ about 0.8% of that matrix
- 50%
- 10%
> 2×4096×16 = 131K of 16.8M.

? What does QLoRA add on top of LoRA?
+ A 4-bit NF4 quantised frozen base (plus double quantisation and paged optimisers) to cut memory dramatically
- A bigger rank
- A different loss
> Same adapters, much smaller base-model memory.

? Why merge an adapter for serving?
+ The merged weights run as an ordinary model with no extra latency
- It reduces accuracy
- It is required by law
> Or keep adapters separate to serve many variants from one base.
```

:::problem You must serve 200 customer-specific fine-tuned variants of an 8B model. What is the architecture? {level=hard tags="lora,serving,multi-tenant"}
Explain trade-offs.

:::solution Model answer
Train one **LoRA adapter per customer** on a shared base (small files, cheap training). **Do not** keep 200 merged 16 GB copies. Serve with a **multi-LoRA server** (for example vLLM or LoRAX): one base in GPU memory, adapters loaded dynamically and batched together per request, with an LRU cache of hot adapters and a registry for versions. Benefits: ~16 GB plus small adapters instead of 3.2 TB; fast onboarding. Trade-offs: slightly higher per-token overhead than a merged model and adapter-switching latency for cold adapters; ensure tenant isolation and evaluate each adapter against the shared regression suite before activation. Merge and dedicate a replica only for very high-traffic customers.
:::
:::

:::keypoints
- LoRA freezes W and trains a low-rank update (α/r)·BA, with B starting at zero; typically under 1–2% of parameters.
- Memory: full fine-tuning ≈ 16 bytes/parameter; LoRA ≈ 2P + 16p; QLoRA ≈ 0.55P + 16p, putting large models on single GPUs.
- Defaults: rank 16, α = r or 2r, all linear layers, learning rate 1e-4–3e-4.
- QLoRA = NF4 4-bit base + double quantisation + paged optimisers.
- Adapters can be merged (no extra latency) or hot-swapped (many variants from one base); LoRA changes behaviour well but is a poor way to add large amounts of knowledge.
:::

:::resources
- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685) and [QLoRA](https://arxiv.org/abs/2305.14314) — the papers.
- [LoRA Without Regret (Thinking Machines)](https://thinkingmachines.ai/blog/lora/) — when LoRA matches full fine-tuning, with practical settings.
- [Hugging Face PEFT docs](https://huggingface.co/docs/peft) — the standard library for LoRA and relatives.
- [Hugging Face: 4-bit quantization with bitsandbytes](https://huggingface.co/blog/4bit-transformers-bitsandbytes) — how QLoRA is implemented.
- [Unsloth docs](https://docs.unsloth.ai) — memory-efficient LoRA/QLoRA recipes.
- [Sebastian Raschka's magazine](https://magazine.sebastianraschka.com) — practical LoRA experiments and insights.
:::
