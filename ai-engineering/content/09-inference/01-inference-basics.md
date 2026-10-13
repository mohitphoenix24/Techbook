---
title: How LLM Inference Works — Prefill, Decode and the Memory Wall
level: advanced
time: 50
summary: Why generating text is slow and what limits it. The two phases (prefill and decode), compute-bound versus memory-bound work, arithmetic intensity and the roofline model, the napkin formula for decode speed, latency and throughput metrics (TTFT, inter-token latency, goodput), and why batching is the central trick. With runnable roofline and speed calculators.
---

A model that took months to train answers you in a second. Understanding **why inference costs what it does**, and where the bottleneck sits, is what lets you choose hardware, set expectations, and reason about every optimisation in this module.

## Two phases

Generating a reply has two very different stages:

:::flow One request
Prefill | process the whole prompt in parallel; builds the KV cache; produces the first token
Decode | generate tokens one at a time; each step reads the whole model and the KV cache
Finish | stop token or length limit
:::

| | **Prefill** | **Decode** |
|---|---|---|
| Work | all prompt tokens at once (large matrix–matrix multiplications) | one new token per step (matrix–**vector**-like, tiny work per byte read) |
| Bottleneck | **compute** (FLOP/s) | **memory bandwidth** (bytes/s) |
| Time | grows with prompt length | grows with output length |
| Metric it drives | time to first token (TTFT) | inter-token latency, tokens/s |
| GPU utilisation | high | low for one request; improves with batching |

:::analogy
Prefill is a chef reading the whole recipe and prepping every ingredient at once (lots of work, done in parallel). Decode is plating one dish at a time, but each plate requires walking to the pantry and back (the pantry is GPU memory, the walk is bandwidth). The walking, not the cooking, dominates.
:::

## Compute-bound vs memory-bound

A GPU can do a huge number of arithmetic operations per second **if** the data is already close to the compute units; moving data from GPU memory (HBM) is much slower per byte than the arithmetic is per number.

:::def Arithmetic intensity
FLOPs performed per byte moved from memory. High intensity (many operations per byte) keeps the compute units busy: **compute-bound**. Low intensity leaves them waiting for data: **memory-bound**.
:::

The **roofline model** says performance = min(peak FLOP/s, bandwidth × intensity). The "ridge point" is peak FLOPs ÷ bandwidth (for an H100: roughly 1,000 TFLOP/s ÷ 3.35 TB/s ≈ 300 FLOPs per byte).

- **Prefill** of a long prompt: each weight read from memory is reused across thousands of tokens → intensity of hundreds+ → compute-bound.
- **Decode** with batch size 1: each weight is read once and used for **one** token → about 1 FLOP per 1–2 bytes (≈ 1 for bf16: 2 FLOPs per 2-byte weight) → **hopelessly memory-bound**, using ~1% of the GPU's compute.

```python run title="Roofline: where do prefill and decode land?" level=intermediate
def roofline(peak_tflops, bandwidth_tbs, flops, bytes_moved):
    intensity = flops / bytes_moved
    ridge = peak_tflops * 1e12 / (bandwidth_tbs * 1e12)
    attainable = min(peak_tflops * 1e12, intensity * bandwidth_tbs * 1e12)
    return intensity, ridge, attainable / 1e12, "compute-bound" if intensity >= ridge else "memory-bound"

H100 = dict(peak_tflops=990, bandwidth_tbs=3.35)                   # approximate dense bf16 peak, HBM3 bandwidth
P = 8e9                                                           # an 8B-parameter model, bf16 weights = 16 GB
weights_bytes = 2 * P

for name, tokens in (("decode, batch 1", 1), ("decode, batch 32", 32), ("decode, batch 256", 256), ("prefill, 2,048-token prompt", 2048)):
    flops = 2 * P * tokens                                         # ~2 FLOPs per parameter per token
    intensity, ridge, tflops, kind = roofline(**H100, flops=flops, bytes_moved=weights_bytes)
    print(f"{name:28} intensity {intensity:>7.0f} FLOP/B  ridge {ridge:.0f}  attainable {tflops:>6.0f} TFLOP/s ({tflops / H100['peak_tflops']:>4.0%} of peak)  {kind}")
```

Batch 1 decode uses about **1/300** of the GPU's arithmetic. **Batching** (serving many requests at once) lets each weight read serve many tokens, raising utilisation almost for free, up to the ridge. That single fact explains most of inference engineering.

## The napkin formula for decode speed

Each decode step must read **all the weights** (and the KV cache of the sequence). So the time per token is at least:

:::formula Memory-bound decode
t_{\text{token}} \;\gtrsim\; \frac{\text{bytes read per step}}{\text{memory bandwidth}} \;\approx\; \frac{P \cdot b_w + \text{KV bytes}}{BW}
:::

```python run title="How fast can a GPU decode one stream? (the ceiling)" level=easy
def decode_tokens_per_sec(params_b, bytes_per_weight, bandwidth_tbs, efficiency=0.7, kv_gb=0.0):
    bytes_per_step = params_b * 1e9 * bytes_per_weight + kv_gb * 1e9
    return efficiency * bandwidth_tbs * 1e12 / bytes_per_step

gpus = {"RTX 4090 (1.0 TB/s)": 1.0, "A100 (2.0 TB/s)": 2.0, "H100 (3.35 TB/s)": 3.35, "H200 (4.8 TB/s)": 4.8}
print(f"{'':22} {'8B @16-bit':>11} {'8B @4-bit':>10} {'70B @16-bit':>12} {'70B @4-bit':>11}")
for name, bw in gpus.items():
    row = [decode_tokens_per_sec(8, 2, bw), decode_tokens_per_sec(8, 0.5, bw), decode_tokens_per_sec(70, 2, bw), decode_tokens_per_sec(70, 0.5, bw)]
    print(f"{name:22} " + " ".join(f"{v:>10.0f}" if i != 2 else f"{v:>12.0f}" for i, v in enumerate(row)))
print("\n(tokens/s for ONE request; 70B at 16-bit does not fit on one GPU, the number assumes enough GPUs aggregate their bandwidth)")
```

Two practical levers fall out of the formula: **fewer bytes per weight** (quantisation) and **more bandwidth** (better GPU, or tensor parallelism across GPUs). Faster FLOPs alone barely help decode.

## Metrics you should know

| Metric | Meaning | Shaped by |
|---|---|---|
| **TTFT** (time to first token) | request arrival → first output token | queueing + prefill (prompt length, cache hits, load) |
| **ITL / TPOT** (inter-token latency / time per output token) | time between consecutive tokens | decode speed, batch size, KV size |
| **E2E latency** | total time | TTFT + (output tokens − 1) × ITL |
| **Throughput** (tokens/s) | total output (or input+output) tokens per second across all requests | batching, hardware |
| **Requests/s** | completed requests per second | prompt/output length mix |
| **Goodput** | throughput of requests that **meet their SLO** | scheduling under load |
| **Cost per million tokens** | $ per 1M generated tokens | utilisation × hardware price |

A serving system trades **latency against throughput**: bigger batches raise tokens per GPU-second (cheaper) but also lengthen each step (slower for each user). Design to an **SLO** (for example p95 TTFT < 1 s, p95 ITL < 50 ms) and maximise throughput within it.

```python run title="The latency-throughput trade-off as batch size grows" level=intermediate
# step time = time to read weights (fixed) + time to read each sequence's KV + a small compute term
def step_time_ms(batch, weights_gb=16, kv_gb_per_seq=0.5, bw_gbs=3350 * 0.7, flops_per_token=16e9, peak_flops=990e12 * 0.5):
    mem_ms = (weights_gb + batch * kv_gb_per_seq) / bw_gbs * 1e3
    compute_ms = batch * flops_per_token / peak_flops * 1e3
    return max(mem_ms, compute_ms)

print(f"{'batch':>5} {'step ms':>8} {'ITL (per user) tok/s':>21} {'aggregate tok/s':>16}")
for b in (1, 4, 16, 32, 64, 128, 256):
    t = step_time_ms(b)
    print(f"{b:>5} {t:>8.2f} {1000 / t:>21.0f} {b * 1000 / t:>16,.0f}")
```

Aggregate throughput climbs steeply while per-user speed degrades slowly, until KV-cache reads dominate. The sweet spot depends on your SLO.

## What affects each metric

- **Longer prompts** → longer prefill (TTFT up), more KV memory (fewer concurrent sequences).
- **Longer outputs** → more decode steps (E2E up).
- **Prefix caching** → cached prompt prefixes skip prefill (TTFT down, cheaper).
- **Concurrency** → batching raises throughput; queues raise TTFT when overloaded.
- **Model size and precision** → bytes per step.
- **Hardware bandwidth** → decode speed ceiling.
- **Parallelism** (tensor parallel across GPUs) → pools bandwidth and memory, adds communication cost.

## Optimisation map (what the next lessons cover)

| Bottleneck | Techniques |
|---|---|
| Weight bytes per step | quantisation; MoE (read only active experts); smaller models; distillation |
| KV cache size and traffic | GQA/MQA/MLA; KV quantisation; paged and prefix caching; sliding window |
| Low utilisation at small batch | continuous batching; larger concurrency; disaggregated prefill/decode |
| One token per step | speculative decoding; multi-token prediction |
| Attention memory traffic | FlashAttention and variants |
| Prefill cost | prefix caching; chunked prefill; sparse/long-context tricks |
| Network and orchestration | tensor/pipeline parallelism; efficient kernels; CUDA graphs |

```quiz
? Why is single-request decoding memory-bound?
+ Each step reads all the weights from memory to produce one token, so there is little arithmetic per byte moved
- The GPU has too many cores
- Tokenization is slow
> Arithmetic intensity is about 1 FLOP/byte at batch size 1.

? What is the main reason batching improves throughput?
+ One read of the weights serves many requests' tokens, raising arithmetic intensity
- It shortens the prompts
- It reduces model size
> Each step costs about the same memory traffic regardless of batch size, up to a point.

? Which phase mostly determines time to first token?
+ Prefill (plus queueing)
- Decode
- Sampling
> Long prompts and cold caches increase TTFT.

? A model has 70B parameters at 16-bit and the GPU bandwidth is 3.35 TB/s. Roughly what is the ceiling for decode speed per stream on one device that could hold it?
+ roughly 17–24 tokens/s (3.35 TB/s ÷ 140 GB, less overhead)
- 1,000 tokens/s
- 1 token/s
> Bandwidth divided by bytes per step; quantisation and tensor parallelism raise it.
```

:::problem Your chat app has slow time to first token only at peak hours, while streaming speed is fine. Diagnose. {level=medium tags="inference,latency"}
List likely causes and fixes.

:::solution Model answer
TTFT = **queueing + prefill**. Decode speed (ITL) is fine, so the GPUs are not saturated in decode, but requests wait to be admitted or prefilled. Causes: **overload/queueing** (not enough replicas or max concurrency), **long prompts** (big system prompt or retrieved context, no prefix caching), **prefill interfering with decode** (no chunked prefill), cold KV cache after scaling events. Fixes: autoscale on queue depth and KV usage, enable **prefix caching** and put static content first, **chunked prefill** or **prefill/decode disaggregation**, shorten prompts, route by length, add admission control with fast rejection, and check cache hit rates.
:::
:::

:::keypoints
- Inference has two phases: prefill (parallel, compute-bound, drives TTFT) and decode (sequential, memory-bandwidth-bound, drives inter-token latency).
- Single-stream decode speed ≈ efficiency × memory bandwidth ÷ (weight bytes + KV bytes): quantisation and bandwidth help; FLOPs do not.
- Batching amortises weight reads across requests, raising throughput until the ridge point, at some per-user latency cost.
- Track TTFT, ITL, E2E latency, throughput, goodput and cost per million tokens against an SLO.
- Optimisations target weight bytes, KV traffic, utilisation, one-token-per-step, attention I/O and prefill.
:::

:::resources
- [Kipply: Transformer Inference Arithmetic](https://kipp.ly/transformer-inference-arithmetic/) — the classic napkin-math article.
- [Horace He: Making Deep Learning Go Brrrr](https://horace.io/brrr_intro.html) — compute, bandwidth and overhead.
- [How to Scale Your Model (JAX)](https://jax-ml.github.io/scaling-book/) — rigorous treatment of the inference chapter included.
- [Lilian Weng: Large Transformer Model Inference Optimization](https://lilianweng.github.io/posts/2023-01-10-inference-optimization/) — a survey of techniques.
- [BentoML LLM Inference Handbook](https://bentoml.com/llm/) — a practical guide to metrics, optimisations and serving.
- [vLLM docs](https://docs.vllm.ai) — a production engine built around these ideas.
:::
