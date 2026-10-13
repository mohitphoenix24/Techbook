---
title: Quantization — Fitting Big Models into Small Memory
level: advanced
time: 55
summary: How and why lower-precision numbers work. Number formats (FP32, BF16, FP8, INT8, INT4, NF4), uniform quantisation maths (scale, zero-point, groups), post-training methods (LLM.int8, GPTQ, AWQ, SmoothQuant, GGUF K-quants, bitsandbytes), weight-only versus weight-and-activation, KV-cache quantisation, quality-versus-bits trade-offs, evaluation, and runnable quantisers with an interactive explorer.
---

Weights are numbers. Storing each in 16 bits is generous: most of that precision does not matter for the model's behaviour. **Quantization** stores weights (and sometimes activations and the KV cache) with **fewer bits**, shrinking memory and, because decoding is bandwidth-bound, **speeding it up almost proportionally**. It is the highest-impact deployment optimisation, which is why nearly every local and many hosted models are quantised.

:::analogy
A photo stored at 16 million colours versus 256: to most eyes, nearly identical, at a fraction of the file size. The trick is choosing *which* 256 colours (the grid) and not letting one very bright pixel force a terrible palette for everyone else.
:::

## Number formats

| Format | Bits | Range/precision | Use |
|---|---|---|---|
| **FP32** | 32 | wide, precise | training master weights, optimiser state |
| **BF16** | 16 | FP32 range, ~3 significant digits | default for training and inference |
| **FP16** | 16 | narrower range, more precision | inference; needs loss scaling in training |
| **FP8** (E4M3, E5M2) | 8 | small float; native on H100/B200 | training/inference of weights, activations, KV |
| **INT8** | 8 | 256 integer levels + scale | weight and activation quantisation |
| **INT4 / FP4 / NF4** | 4 | 16 levels + scale per group | weight-only quantisation; QLoRA uses **NF4**, designed for bell-shaped weights |
| **2–3 bit, ternary (BitNet 1.58b)** | 1.6–3 | extreme compression | research and some GGUF K-quants; quality drops |

Memory scales with bits: an 8B model is **16 GB in 16-bit, 8 GB in 8-bit, ~4.5 GB in 4-bit** (including scales).

## The basic maths: absmax (symmetric) quantisation

Pick a **scale** so the largest value maps to the largest integer, then round:

:::formula Uniform symmetric quantisation
q = \operatorname{round}\!\left(\frac{w}{s}\right),\quad s=\frac{\max|w|}{2^{b-1}-1},\qquad \hat{w} = s\cdot q
:::

The error per weight is at most `s/2`. The scale `s` is set by the **largest** value in the group, so **outliers waste resolution**: one big weight stretches the grid and every small weight rounds coarsely. The remedy is **grouping**: quantise small groups (32–128 weights) with their own scale (and sometimes zero-point), costing a little extra storage (about 0.25–0.5 bits per weight).

Explore it: change bits and group size, add outliers, and watch the error.

```viz algo=quant title="Quantisation explorer"
```

```python run title="Group-wise quantisation error vs bits and group size" level=intermediate
import numpy as np

rng = np.random.default_rng(0)
W = rng.normal(0, 0.02, size=(512, 512))                         # a weight matrix (bell-shaped, like real layers)
W[3, 17], W[100, 400], W[300, 50] = 0.35, -0.30, 0.28            # a few outliers

def quantise(W, bits, group):
    flat = W.reshape(-1, group)
    qmax = 2 ** (bits - 1) - 1
    scale = np.abs(flat).max(axis=1, keepdims=True) / qmax
    q = np.clip(np.round(flat / scale), -qmax - 1, qmax)
    return (q * scale).reshape(W.shape)

x = rng.normal(size=(64, 512))                                   # activations
ref = x @ W.T
print(f"{'bits':>4} {'group':>6} {'weight MSE':>11} {'output rel. error':>18} {'bytes/weight':>13}")
for bits in (8, 6, 4, 3):
    for group in (512 * 512, 128, 32):
        Wq = quantise(W, bits, min(group, 512 * 512))
        mse = np.mean((W - Wq) ** 2)
        out_err = np.linalg.norm(x @ Wq.T - ref) / np.linalg.norm(ref)
        bytes_per = bits / 8 + (16 / group if group < 1e5 else 0) / 8
        label = "tensor" if group > 1e5 else str(group)
        print(f"{bits:>4} {label:>6} {mse:>11.2e} {out_err:>18.3%} {bytes_per:>13.3f}")
```

Smaller groups and more bits reduce error; per-tensor scales suffer most when outliers exist. Real methods go further than naive rounding.

## Post-training quantisation methods (PTQ)

You rarely quantise by plain rounding. These widely used methods preserve quality better:

| Method | Idea | Typical use |
|---|---|---|
| **LLM.int8()** ([paper](https://arxiv.org/abs/2208.07339)) | 8-bit matrix multiplication with **outlier dimensions kept in 16-bit** | first practical 8-bit LLM inference (bitsandbytes) |
| **GPTQ** ([paper](https://arxiv.org/abs/2210.17323)) | quantise weights **layer by layer**, using second-order (Hessian) information to compensate each rounding error in the remaining weights | 4-bit and 3-bit weight-only; GPU serving |
| **AWQ** ([paper](https://arxiv.org/abs/2306.00978)) | protect the ~1% of **salient channels** (identified by activation magnitudes) by scaling before quantising | strong 4-bit quality, fast kernels |
| **SmoothQuant** ([paper](https://arxiv.org/abs/2211.10438)) | migrate quantisation difficulty from **activations** (outlier-heavy) to weights with per-channel scaling, enabling W8A8 | 8-bit weights **and** activations (real compute savings) |
| **bitsandbytes NF4 / FP4** | 4-bit data types with block-wise scales; used in **QLoRA** | easy loading in Hugging Face; training adapters |
| **GGUF K-quants** (llama.cpp: Q8_0, Q6_K, Q5_K_M, **Q4_K_M**, Q3_K, Q2_K, IQ-quants) | mixed block-wise schemes, with important tensors kept at higher precision; importance-matrix variants | CPU, Apple silicon and consumer GPUs; the de facto local format |
| **FP8 (E4M3/E5M2)** | native 8-bit float on recent GPUs, with per-tensor/channel scales | production serving on H100/H200/B200 with little quality loss |
| **QAT** (quantisation-aware training) | simulate quantisation during training/fine-tuning so the model adapts | best quality at very low bits |

**Weight-only vs weight-and-activation:** *weight-only* (W4A16, W8A16) cuts memory and bandwidth (great for memory-bound decode), but the multiplication still runs in 16-bit after dequantising. *Weight-and-activation* (W8A8, FP8) also speeds the **compute** (helpful for prefill and large batches), but activations have outliers, so it needs smoothing.

## What quality loss to expect

Rough, task-dependent pattern for well-made quantisations of modern models:

| Bits (weights) | Memory vs 16-bit | Quality |
|---|---|---|
| **8-bit** (INT8/FP8) | 50% | near-lossless |
| **6-bit** (Q6_K) | ~38% | near-lossless |
| **5-bit** (Q5_K_M) | ~33% | very small loss |
| **4-bit** (Q4_K_M, AWQ, GPTQ) | ~28% | small loss; the usual sweet spot |
| **3-bit** | ~22% | noticeable on harder tasks |
| **2-bit** | ~17% | significant degradation unless QAT/specialised |

**Larger models tolerate quantisation better** than small ones: a 70B at 4-bit usually beats a 13B at 16-bit. **Reasoning, code and long-context** tasks degrade earlier than casual chat. **Always measure on your tasks**, not just perplexity.

```python run title="A simple quality-vs-memory selection" level=easy
# illustrative numbers: measure these on YOUR eval for YOUR model
options = {  # name: (GB for an 8B model, task accuracy on your eval %)
    "16-bit":   (16.1, 91.0), "8-bit":    (8.5, 90.8), "Q6_K":    (6.6, 90.5), "Q5_K_M":  (5.7, 90.1),
    "Q4_K_M":   (4.9, 89.4), "Q3_K_M":   (3.9, 86.0), "Q2_K":    (3.2, 78.5),
}
budget_gb, min_acc = 6.0, 89.0
fits = {k: v for k, v in options.items() if v[0] <= budget_gb and v[1] >= min_acc}
print("meets memory and quality constraints:", list(fits))
best = max(fits, key=lambda k: fits[k][1])
print("highest quality that fits:", best, fits[best])
```

## Quantising the KV cache and activations

- **KV-cache quantisation** (FP8/INT8/INT4) reduces the memory that limits concurrency (previous lesson), with modest quality effects; test long-context accuracy.
- **Activation quantisation** is harder because of outliers; FP8 on recent GPUs makes W8A8 practical.
- **Attention in low precision** (FlashAttention-3 FP8) is an active area.

## Practical workflow

1. **Start from the vendor's official quantised checkpoint** (FP8/AWQ/GGUF) when available: it is calibrated and tested.
2. For custom models: quantise with **AutoAWQ / GPTQModel / llm-compressor / llama.cpp's quantize tool**, using **calibration data** representative of your use (a few hundred samples of real prompts matter, especially for domain models).
3. **Evaluate the exact artefact**: your eval suite plus **perplexity** as a quick sanity check; compare to 16-bit; read outputs on tricky cases (tools, JSON, long context, multilingual).
4. **Benchmark speed and memory** on your serving engine (kernels matter: some formats are fast on some hardware only).
5. Keep the **16-bit reference** for fallback and for future re-quantisation.
6. Re-check **safety and refusals**: quantisation can shift behaviour.

```python local title="Load a 4-bit model with bitsandbytes (Hugging Face)"
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

cfg = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.bfloat16)
model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen3-8B", quantization_config=cfg, device_map="auto")
print(f"{model.get_memory_footprint() / 1e9:.1f} GB")
```

```bash
# Serve an AWQ-quantised model with vLLM (checkpoint already quantised)
vllm serve Qwen/Qwen3-8B-AWQ --quantization awq --max-model-len 16384
# Or run a GGUF locally
llama-cli -m model-Q4_K_M.gguf -p "Explain KV caching in two sentences." -n 128
```

## Compression beyond quantisation

**Pruning** (removing weights/heads/layers; structured pruning can speed up inference), **distillation** (smaller student), **low-rank factorisation**, **sparsity** (2:4 structured sparsity on NVIDIA GPUs), and **extreme low-bit research** such as BitNet-style 1.58-bit models ([paper](https://arxiv.org/abs/2402.17764)). These combine with quantisation; the usual order of reach is: **right-size the model → quantise → serve efficiently**.

```quiz
? Why does quantisation speed up decoding?
+ Decode is memory-bandwidth-bound, so fewer bytes per weight means proportionally less data to read each step
- It makes arithmetic faster by itself in all cases
- It removes layers
> Weight-only quantisation mainly cuts bandwidth.

? Why do outliers hurt per-tensor quantisation?
+ The scale is set by the largest value, so a single outlier makes the grid coarse for all other weights
- Outliers cannot be stored
- They make models bigger
> Grouping and outlier-aware methods address this.

? Which format is the usual sweet spot for local models?
+ 4-bit (for example Q4_K_M, AWQ or GPTQ)
- 1-bit
- 64-bit
> Small quality loss for about 3.5× memory savings.

? What must you evaluate after quantising?
+ The exact quantised artefact on your own tasks (accuracy, format, safety, speed, memory)
- Only perplexity
- Nothing
> Method and calibration choices change behaviour.
```

:::problem You must deploy a 70B model on a node with 4×48 GB GPUs (192 GB). Choose a precision and justify with numbers. {level=hard tags="quantization,capacity"}
Include KV-cache headroom.

:::solution Model answer
16-bit weights = 140 GB: fits only barely, leaving ~40 GB (and tensor-parallel overhead) for KV: poor concurrency. **FP8/8-bit** = 70 GB leaves ~110 GB for KV and activations: good for quality and concurrency. **4-bit (AWQ/GPTQ)** = ~38–40 GB weights: could even fit on 1–2 GPUs but quality is slightly lower and decode is faster. Recommended: **FP8 weights with an FP8 KV cache** across the 4 GPUs (tensor parallel 4): near-lossless quality, ample KV for long contexts and high concurrency; evaluate on your tasks, and fall back to 4-bit if throughput per dollar matters more. Verify engine kernel support for FP8 on that GPU generation (L40S supports FP8; check your specific hardware).
:::
:::

:::keypoints
- Quantisation stores weights (and optionally activations and KV) in fewer bits, cutting memory and, for memory-bound decode, latency.
- Uniform quantisation uses a per-group scale; outliers force coarse grids, so use small groups and outlier-aware methods (LLM.int8, GPTQ, AWQ, SmoothQuant, K-quants, FP8).
- Weight-only quantisation helps bandwidth and memory; weight-and-activation (W8A8/FP8) also speeds compute.
- 8-bit is near-lossless, 4-bit is the usual sweet spot, 3-bit and below degrade; larger models tolerate it better.
- Use official quantised checkpoints when possible, calibrate with representative data, and evaluate the exact artefact on your tasks.
:::

:::resources
- [LLM.int8()](https://arxiv.org/abs/2208.07339), [GPTQ](https://arxiv.org/abs/2210.17323), [AWQ](https://arxiv.org/abs/2306.00978), [SmoothQuant](https://arxiv.org/abs/2211.10438) — the key PTQ papers.
- [QLoRA](https://arxiv.org/abs/2305.14314) — NF4 and double quantisation.
- [Hugging Face: 4-bit transformers with bitsandbytes](https://huggingface.co/blog/4bit-transformers-bitsandbytes) and [GPTQ integration](https://huggingface.co/blog/gptq-integration) — practical guides.
- [llama.cpp](https://github.com/ggml-org/llama.cpp) — GGUF K-quants and the quantize tool.
- [The Era of 1-bit LLMs (BitNet b1.58)](https://arxiv.org/abs/2402.17764) — extreme low-bit research.
- [vLLM docs](https://docs.vllm.ai) — supported quantisation formats and kernels.
:::
