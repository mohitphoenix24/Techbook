---
title: GPU Sizing, Hardware and the Economics of Self-Hosting
level: advanced
time: 50
summary: Choosing hardware and answering "should we self-host?" with numbers. The accelerator landscape (NVIDIA H100/H200/B200, AMD MI300, TPUs, L40S, consumer GPUs, Apple silicon), the three specs that matter (memory capacity, memory bandwidth, FLOPs), sizing from model, precision, context and concurrency, cost per million tokens from utilisation, rent versus buy, and the break-even against API pricing. With an interactive sizing tool and runnable cost calculators.
---

"What GPU do I need?" and "Is it cheaper to host it ourselves?" are two of the most common AI-engineering questions. Both reduce to arithmetic you now know: **memory for weights and KV cache, bandwidth for decode speed, FLOPs for prefill**, then **dollars per GPU-hour divided by useful tokens**.

## The specs that matter

| Spec | Why it matters | Rule of thumb |
|---|---|---|
| **Memory capacity (GB)** | weights + KV must fit | decides **whether** a model runs |
| **Memory bandwidth (TB/s)** | decode speed and batch scaling | decides **how fast** it generates |
| **Compute (TFLOP/s, bf16/FP8)** | prefill speed, large batches, training | decides prompt processing and training throughput |
| **Interconnect (NVLink, InfiniBand/Ethernet)** | multi-GPU tensor parallelism | needed for models spanning GPUs |
| **Software support** | kernels, engines, quantisation formats | NVIDIA's CUDA ecosystem is the broadest |
| **Price and availability** | the real constraint | varies hugely by provider and time |

### The landscape (approximate, as of late 2026; always check current specs and prices)

| Accelerator | Memory | Bandwidth | Notes |
|---|---|---|---|
| **NVIDIA RTX 4090 / 5090** (consumer) | 24 GB / 32 GB | ~1.0 / ~1.8 TB/s | great for QLoRA and 7–14B inference; no NVLink; licensing limits datacenter use |
| **NVIDIA L4 / L40S** | 24 / 48 GB | 0.3 / 0.86 TB/s | cost-efficient inference, FP8 on L40S |
| **NVIDIA A100** | 40 / 80 GB | 1.6–2.0 TB/s | previous-generation workhorse, widely available |
| **NVIDIA H100** | 80 GB | ~3.35 TB/s | the standard for LLM serving and training; FP8 |
| **NVIDIA H200** | 141 GB | ~4.8 TB/s | H100 compute with more and faster memory: better for large models and long contexts |
| **NVIDIA B200 / GB200 (Blackwell)** | ~180–192 GB | ~8 TB/s | FP4/FP8; rack-scale systems (NVL72) |
| **AMD MI300X / MI325X / MI350** | 192–288 GB | 5–8 TB/s | large memory; ROCm software maturing quickly; supported by vLLM/SGLang |
| **Google TPU (v5e/v5p/Trillium/Ironwood)** | varies | varies | via Google Cloud; JAX/vLLM-TPU |
| **AWS Trainium/Inferentia, Intel Gaudi, Groq/Cerebras/SambaNova** | specialised | specialised | different cost/latency profiles; hosted APIs often built on them |
| **Apple silicon (M-series Max/Ultra)** | up to 128–512 GB unified | 0.4–0.8 TB/s | surprisingly capable for local large models at low speed; MLX/llama.cpp |

**Memory capacity and bandwidth, not peak FLOPs, usually decide LLM serving**, which is why a card with more HBM can beat a "faster" one.

## Sizing in four steps

Use the tool: pick a model, precision, GPU, count, context and concurrency. It shows whether the weights fit, how many concurrent sequences the KV cache allows, and the decode-speed ceiling.

```viz algo=gpusize title="GPU sizing and decode speed"
```

1. **Weights**: `params × bytes per weight` (plus quantisation overhead). Must fit in total GPU memory (across tensor-parallel GPUs), with ~10–20% headroom.
2. **KV cache**: `KV per token × context × concurrent sequences` must fit in what remains (previous lessons).
3. **Decode speed**: per-stream tokens/s ≈ `0.6–0.7 × bandwidth ÷ bytes read per step`; aggregate ≈ per-stream × concurrency until compute-bound.
4. **Prefill**: `2 × params × prompt tokens` FLOPs at 40–60% of peak: sets TTFT for long prompts.

```python run title="Rule-of-thumb sizing for common models" level=intermediate
GPU_MEM = {"RTX 4090": 24, "L40S": 48, "A100-80": 80, "H100": 80, "H200": 141, "B200": 192}

def min_gpus(params_b, bits, ctx, concurrency, kv_kb_per_token, gpu_mem_gb, headroom=0.9):
    weights = params_b * bits / 8                           # GB
    kv = kv_kb_per_token * 1024 * ctx * concurrency / 1e9   # GB
    need = weights + kv
    n = 1
    while n * gpu_mem_gb * headroom < need:
        n += 1
    return n, weights, kv

scenarios = [  # name, params B, bits, ctx, concurrency, KV KB/token (GQA estimates)
    ("8B chat, 8K ctx, 64 users",   8, 16, 8_192, 64, 128),
    ("8B chat, 8K ctx, 64 users (4-bit)", 8, 4, 8_192, 64, 128),
    ("70B assistant, 16K ctx, 32 users", 70, 8, 16_384, 32, 320),
    ("70B long-context, 128K, 8 users", 70, 8, 131_072, 8, 320),
]
print(f"{'scenario':38} {'weights':>8} {'KV':>7}  min GPUs by type")
for name, p, bits, ctx, conc, kv in scenarios:
    row = []
    for g, mem in GPU_MEM.items():
        n, w, k = min_gpus(p, bits, ctx, conc, kv, mem)
        row.append(f"{g}:{n}")
    print(f"{name:38} {w:>6.0f}GB {k:>5.0f}GB  " + "  ".join(row))
```

(Memory fit is necessary, not sufficient: you also need enough bandwidth for your latency target and fast interconnect if you split a model across GPUs.)

## Cost per million tokens

The economics of serving come from **utilisation**. A GPU costs the same per hour whether it serves 1 request or 1,000; high batch utilisation spreads the cost over many tokens.

:::formula Cost per million output tokens
\text{cost}_{1M} = \frac{\text{GPU-hour price} \times \text{GPUs}}{\text{tokens per second} \times 3600} \times 10^6
:::

```python run title="Cost per million tokens vs utilisation (self-hosted)" level=intermediate
def cost_per_million(gpu_hour_usd, n_gpus, peak_tokens_per_sec, utilisation):
    tokens_per_hour = peak_tokens_per_sec * utilisation * 3600
    return gpu_hour_usd * n_gpus / tokens_per_hour * 1e6

# an 8B model on one H100: ~12,000 aggregate tokens/s at good batch sizes (illustrative; benchmark your own)
print(f"{'utilisation':>11} {'$/M tokens (1 H100 @ $3/h)':>28}")
for u in (0.05, 0.1, 0.25, 0.5, 0.8):
    print(f"{u:>11.0%} {cost_per_million(3.0, 1, 12_000, u):>28.3f}")
print("\nat low utilisation self-hosting is expensive; a hosted API charges only for tokens you use")
```

## Rent vs buy vs API

| Option | Cost shape | Best when |
|---|---|---|
| **Provider API (per token)** | pay only for use; no idle cost; vendor margin; rate limits | spiky or low volume; frontier capability; speed to market |
| **Managed open-model endpoints** (Together, Fireworks, Baseten, etc.) | per token or per GPU-hour; open models, no ops | want open models without running infra |
| **Rent GPUs (cloud/GPU marketplace)** | $/GPU-hour (on-demand, reserved, spot); you operate the engine | steady load; custom models; privacy; fine-tuned adapters |
| **Buy hardware (on-prem)** | capex + power + cooling + staff; cheapest per hour at high sustained utilisation | large, stable, predictable demand; data-residency rules |

### The break-even with an API

```python run title="Self-hosted GPU vs API: where is the break-even?" level=intermediate
def monthly_self_host(n_gpus, gpu_hour_usd, ops_usd_per_month=3000):
    return n_gpus * gpu_hour_usd * 24 * 30 + ops_usd_per_month

def monthly_api(tokens_millions, price_in, price_out, in_share=0.8):
    return tokens_millions * (in_share * price_in + (1 - in_share) * price_out)

# mid-size open model self-hosted on 2 H100s (~$3/h each) vs an API priced at $0.4 in / $1.6 out per M tokens (example)
host = monthly_self_host(2, 3.0)
print(f"self-host fixed cost: ${host:,.0f}/month (2 GPUs 24/7 + ops)")
print(f"{'tokens / month':>16} {'API cost':>10} {'self-host':>10}  cheaper")
for m in (50, 500, 2_000, 10_000, 40_000):          # millions of tokens per month
    api = monthly_api(m, 0.4, 1.6)
    print(f"{m * 1e6:>16,.0f} {api:>10,.0f} {host:>10,.0f}  {'API' if api < host else 'self-host'}")
```

Include in the self-hosting side: **engineering time** (a real, recurring cost), on-call, upgrades and security; the **quality gap** between your open model and the frontier API; **headroom for spikes** (you pay for peak, the API charges for average); and **idle time**. Often the right answer is **hybrid**: API for the frontier model and bursts; self-hosted small/medium models for high-volume, latency-sensitive or private workloads.

### Ways to lower the cost per token

1. **Quantise** (FP8/INT4): more concurrency per GPU.
2. **Right-size the model** or **distil** a smaller one for the task.
3. **Increase utilisation**: continuous batching, queue non-urgent work, time-share GPUs across models, use batch/off-peak for offline jobs.
4. **Prefix caching** and **prompt design** that shares prefixes.
5. **Speculative decoding** for latency-bound, low-concurrency cases.
6. **Spot/preemptible instances** for fault-tolerant batch work.
7. **Reserved capacity or committed-use discounts** for steady baselines; autoscale the rest.
8. **Route** easy requests to small models; escalate hard ones.
9. Choose hardware by **tokens per dollar**, not by headline FLOPs: bandwidth per dollar and memory per dollar matter.

## Practical sizing workflow

1. Define the **workload**: model(s), context lengths, peak and average concurrency, SLOs.
2. Compute **memory fit** and a first-guess **GPU count**.
3. **Benchmark** one replica on candidate hardware with real traffic shapes; measure goodput.
4. Compute **replicas** for peak with headroom; plan autoscaling and N+1 redundancy.
5. Compute **$/M tokens** at expected utilisation; compare with hosted options, including the engineering cost.
6. Pilot, measure real utilisation, and revisit quarterly as hardware prices, model sizes and API prices move.

```quiz
? What usually decides whether a model runs on a given GPU?
+ Memory capacity: weights plus KV cache must fit
- Peak FLOP/s
- The vendor
> Capacity decides if; bandwidth decides how fast.

? Why can an H200 outperform an H100 for large-model serving despite similar compute?
+ More and faster memory: more room for KV cache and higher bandwidth for decode
- It has more tensor cores
- It uses less power
> LLM serving is memory-bound.

? How does utilisation affect cost per token for self-hosting?
+ A GPU costs the same per hour regardless of load, so low utilisation makes each token far more expensive
- It does not matter
- Higher utilisation raises cost
> Cost per token = hourly cost ÷ tokens actually served.

? When does self-hosting usually beat an API on cost?
+ High, steady volume of a model that meets your quality needs, with good utilisation and low ops overhead
- Spiky low volume
- When you need the frontier model's capability
> Compare total cost of ownership including engineering time.
```

:::problem Your product uses 4 billion tokens a month with an API at $2/M input and $10/M output (80% input). A team proposes self-hosting a comparable open model on 8 H100s. Evaluate. {level=hard tags="cost,self-hosting"}
Do the arithmetic and list the caveats.

:::solution Model answer
API cost: 4,000M tokens × (0.8×$2 + 0.2×$10) = 4,000 × $3.6 = **$14,400/month**. Self-hosting: 8 H100s × $3/h × 720 h ≈ **$17,300/month** plus ops (say $5–10K) ≈ $22–27K: **more expensive** at this volume unless utilisation is high and the API price is higher than assumed. Caveats: check throughput (8 H100s could serve far more than 4B tokens/month: you may only need 2–3 GPUs, ~$5K/month, which would be cheaper), peak-to-average ratio, quality gap vs the API model (evals!), engineering and on-call cost, redundancy, and whether prompt caching/batching with the API would cut its cost by 30–50%. Right-size from benchmarks, then decide; a hybrid with routing is common.
:::
:::

:::keypoints
- Memory capacity decides fit, memory bandwidth decides decode speed, FLOPs decide prefill and training; more HBM often beats more compute for serving.
- Size in four steps: weights, KV cache for context × concurrency, decode speed from bandwidth, prefill from FLOPs; then benchmark.
- Cost per million tokens = hourly cost ÷ (tokens/s × utilisation × 3600) × 10⁶; utilisation is the main lever.
- Rent, buy or use APIs based on volume stability, privacy, quality needs and engineering capacity; compare total cost of ownership.
- Lower cost via quantisation, right-sizing, batching and queuing, prefix caching, speculation, spot capacity, routing and tokens-per-dollar hardware choice.
:::

:::resources
- [How to Scale Your Model (JAX)](https://jax-ml.github.io/scaling-book/) — hardware, rooflines and cost, rigorously.
- [Kipply: Transformer Inference Arithmetic](https://kipp.ly/transformer-inference-arithmetic/) — memory and bandwidth maths.
- [Artificial Analysis](https://artificialanalysis.ai) — provider speed and price comparisons for hosted open models.
- [Ray: LLM numbers every developer should know](https://github.com/ray-project/llm-numbers) — handy constants.
- [RunPod](https://www.runpod.io/), [Lambda](https://lambda.ai/), [Modal docs](https://modal.com/docs) — GPU rental and serverless options.
- [BentoML LLM Inference Handbook](https://bentoml.com/llm/) — cost and capacity planning.
:::
