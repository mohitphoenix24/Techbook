---
title: Serving Stacks — vLLM, SGLang, TGI, TensorRT-LLM, llama.cpp and Friends
level: advanced
time: 45
summary: The inference engines you will actually use. What each is best at (vLLM, SGLang, Hugging Face TGI, TensorRT-LLM, llama.cpp, Ollama, MLX, LMDeploy), the OpenAI-compatible API every one of them speaks, a launch-and-query walkthrough, the flags that matter, how to benchmark honestly, and a decision guide from laptop to cluster. With runnable client-side tooling (a request generator and latency percentile calculator).
---

You do not write an inference engine; you choose and configure one. The ecosystem has converged on a few mature projects that implement everything from the previous lessons (continuous batching, paged KV cache, prefix caching, quantisation, speculative decoding, tensor parallelism). Knowing their strengths lets you pick well and avoid lock-in, because they share one interface.

## The common interface: OpenAI-compatible HTTP

Nearly every engine exposes endpoints compatible with the OpenAI API (`/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/models`) with streaming. So **your application code does not change** when you swap the engine, or when you swap a hosted provider for your own server.

```python local title="One client for a local server, a cloud endpoint or a hosted API"
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="not-needed")          # vLLM / SGLang / TGI / Ollama (port 11434) / llama.cpp server
stream = client.chat.completions.create(
    model="Qwen/Qwen3-8B",
    messages=[{"role": "user", "content": "Explain the KV cache in two sentences."}],
    max_tokens=200, temperature=0.2, stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

## The engines

| Engine | Strengths | Typical use | Notes |
|---|---|---|---|
| **vLLM** ([docs](https://docs.vllm.ai)) | PagedAttention, continuous batching, prefix caching, wide model and quantisation support, multi-LoRA, speculative decoding, tensor/pipeline/expert parallelism, many hardware backends | the default open-source production engine | huge community; fast releases |
| **SGLang** ([docs](https://docs.sglang.ai)) | RadixAttention (aggressive prefix reuse), a **structured generation/program** runtime, strong throughput, good for agent/multi-call workloads and constrained decoding | agentic and structured-output heavy serving | very competitive with vLLM |
| **Hugging Face TGI** ([docs](https://huggingface.co/docs/text-generation-inference)) | integrates with the HF Hub, continuous batching, quantisation, production-hardened | HF-centric stacks, Inference Endpoints | check current maintenance status of the project |
| **TensorRT-LLM** ([repo](https://github.com/NVIDIA/TensorRT-LLM)) | highest performance on NVIDIA GPUs via compiled engines, in-flight batching, FP8/FP4, speculative decoding; wrapped by **Triton** and **NVIDIA NIM** / Dynamo | maximum NVIDIA performance at scale | more build/compile steps, NVIDIA-specific |
| **llama.cpp** ([repo](https://github.com/ggml-org/llama.cpp)) | GGUF quantisation, runs on CPU, Apple silicon, consumer GPUs, mobile; `llama-server` provides an OpenAI-compatible API | local and edge | single-user to modest concurrency |
| **Ollama** ([site](https://ollama.com)) | one-command model download and serving, built on llama.cpp; great developer UX | local development, small deployments | not a high-throughput server |
| **LM Studio / Jan / Open WebUI** | desktop apps with model browsers and local servers | non-engineers, demos | |
| **MLX / mlx-lm** ([repo](https://github.com/ml-explore/mlx)) | Apple silicon native, fast fine-tuning and inference | Macs | |
| **LMDeploy, DeepSpeed-MII, Ray Serve, KServe, BentoML, Modal, Baseten, Together/Fireworks (hosted engines)** | orchestration, autoscaling and managed hosting layers around the engines above | production platforms | choose by ops model |

## A launch-and-query walkthrough

```bash
# 1) vLLM: serve an 8B model with prefix caching, 16K context and an OpenAI-compatible API on :8000
pip install vllm
vllm serve Qwen/Qwen3-8B \
  --max-model-len 16384 \
  --gpu-memory-utilization 0.90 \
  --enable-prefix-caching \
  --max-num-seqs 128

# 2) quantised + tensor parallel across 2 GPUs
vllm serve Qwen/Qwen3-32B-AWQ --quantization awq --tensor-parallel-size 2

# 3) SGLang
python -m sglang.launch_server --model-path Qwen/Qwen3-8B --port 30000

# 4) Local: Ollama or llama.cpp
ollama run qwen3:8b
llama-server -m Qwen3-8B-Q4_K_M.gguf -c 8192 --port 8080 -ngl 99
```

### The flags and settings that matter

| Setting | Effect |
|---|---|
| **`max-model-len`** | longest sequence supported; larger reserves more KV and limits concurrency |
| **`gpu-memory-utilization`** | fraction of GPU memory the engine may use for weights + KV; leave headroom for spikes |
| **`max-num-seqs`**, **`max-num-batched-tokens`** | concurrency and per-step work caps (throughput vs latency) |
| **prefix caching** | reuse KV for shared prefixes; enable when prompts share system text |
| **quantisation / `kv-cache-dtype`** | weights and KV precision; FP8 on supported GPUs |
| **tensor/pipeline parallel size** | GPUs per replica; use the minimum that fits plus headroom (communication costs) |
| **chunked prefill** | smoother ITL under mixed traffic |
| **speculative decoding config** | draft model / n-gram / EAGLE for latency |
| **LoRA settings** (`--enable-lora`, `--max-lora-rank`) | multi-adapter serving |
| **structured output / guided decoding backend** | JSON schema or grammar-constrained generation (XGrammar etc.) |
| **dtype, attention backend** | bf16/fp16/fp8; FlashAttention/FlashInfer |

## Benchmark honestly

Vendor charts depend on workload choices. Benchmark **your** scenario:

1. **Workload**: input/output length distributions from logs; realistic prefix reuse; streaming on.
2. **Load**: open-loop arrivals (requests at a fixed rate, Poisson) and a **concurrency sweep**; warm up first.
3. **Metrics**: TTFT, ITL percentiles (p50/p95/p99), throughput, **goodput under SLO**, error rate, GPU and KV utilisation.
4. **Quality**: evaluate output equality/quality for quantised and speculative configs.
5. **Cost**: tokens per GPU-hour → $ per million tokens (next lesson).

```python run title="Compute serving metrics from raw request logs" level=intermediate
import numpy as np

rng = np.random.default_rng(3)
n = 500
ttft = rng.lognormal(mean=np.log(0.35), sigma=0.55, size=n)                 # seconds
out_tokens = rng.integers(40, 600, size=n)
itl = rng.lognormal(mean=np.log(0.028), sigma=0.25, size=n)                 # seconds per token for each request
e2e = ttft + out_tokens * itl
duration = 120.0                                                           # test lasted two minutes

pct = lambda a, q: float(np.percentile(a, q))
print(f"requests {n}, completed in a {duration:.0f}s window, output throughput {out_tokens.sum() / duration:,.0f} tokens/s")
print(f"TTFT  p50 {pct(ttft, 50):.2f}s  p95 {pct(ttft, 95):.2f}s  p99 {pct(ttft, 99):.2f}s")
print(f"ITL   p50 {pct(itl, 50) * 1000:.0f}ms  p95 {pct(itl, 95) * 1000:.0f}ms  p99 {pct(itl, 99) * 1000:.0f}ms")
slo = (ttft <= 0.8) & (itl <= 0.045)                                       # an SLO: TTFT <= 800 ms and ITL <= 45 ms
print(f"goodput: {slo.mean():.0%} of requests met the SLO -> {out_tokens[slo].sum() / duration:,.0f} SLO-compliant tokens/s")
```

Tools: vLLM's `benchmark_serving` scripts, **GuideLLM** ([repo](https://github.com/vllm-project/guidellm)), NVIDIA **genai-perf**, `llmperf`, and general load generators (k6, Locust).

## Beyond one process: production layout

```viz algo=arch title="A production LLM serving layout" dir=down
cl   Clients | apps, agents [client] @0,1
gw   API gateway | auth, quotas, routing [gateway] @1,1
rt   Request router | model, load, prefix affinity [lb] @2,1
r1   Replica pool A | engine + GPUs [gpu*3] @3,0
r2   Replica pool B | other model / LoRAs [gpu*3] @3,2
met  Metrics + autoscaler | queue, KV, latency [monitor] @4,1
reg  Model registry + cache | weights on fast storage [storage] @4,2.4
--
cl -> gw
gw -> rt
rt -> r1
rt -> r2
r1 ~> met
r2 ~> met
reg -> r1 : load weights
reg -> r2 : load weights
```

Operational musts: **health and readiness probes** (a replica is ready only after weights load), **graceful drain** on deploy, **weights cached locally** to speed cold starts, **request timeouts and cancellation** (abort generation when clients disconnect), **TLS and auth** at the gateway (never expose engines directly), **per-tenant quotas**, structured **logs and metrics** (Prometheus endpoints are built in), and **version pinning** of engine and model.

## Choosing

:::flow Decision guide
Laptop or single-user local use | Ollama / LM Studio / llama.cpp (GGUF) / MLX on a Mac
Prototype API on one GPU | vLLM or SGLang with an OpenAI-compatible endpoint
Production, general workloads, open-source | vLLM (or SGLang for agentic/prefix-heavy workloads)
Maximum performance on NVIDIA at scale | TensorRT-LLM / Dynamo / NIM
Hugging Face-centric managed path | Inference Endpoints (TGI or vLLM under the hood)
No GPU ops at all | managed inference providers or the model vendor's API
:::

Engines evolve monthly: re-benchmark a candidate or two every few months, and keep the **OpenAI-compatible interface** as your stable boundary so switching is cheap.

```quiz
? Why do nearly all engines expose an OpenAI-compatible API?
+ It lets applications switch between engines, self-hosted and hosted providers without code changes
- It is required by GPUs
- It makes models faster
> A common interface is your decoupling layer.

? Which engine is best suited for running quantised models on a laptop or Apple silicon?
+ llama.cpp / Ollama / MLX
- TensorRT-LLM
- Ray Serve
> GGUF engines target CPU, Apple silicon and consumer GPUs.

? What does `--max-model-len` trade off?
+ Maximum supported context versus KV memory and therefore concurrency
- Output quality only
- Network bandwidth
> Larger limits reserve more KV capacity.

? What is goodput?
+ The throughput of requests that meet their latency SLO
- Raw tokens per second regardless of latency
- GPU utilisation
> Optimise for useful work under constraints.
```

:::problem You must serve an 8B model at 200 requests/s peak with TTFT p95 < 1 s and ITL p95 < 50 ms. Describe how you would size and validate it. {level=hard tags="serving,capacity"}
Describe the experiment and the numbers you need.

:::solution Model answer
Gather real input/output length distributions and prefix-sharing behaviour. Pick a candidate engine (vLLM with prefix caching and chunked prefill), model precision (FP8 or 8-bit if quality holds), and GPU type. **Benchmark one replica** with an open-loop load at increasing request rates to find the **maximum rate that still meets the SLO** (goodput), recording KV/GPU utilisation and tail latencies. Replicas needed ≈ peak rate ÷ per-replica SLO rate ÷ target utilisation (~0.6–0.7) plus N+1 redundancy and headroom for scale-up lag. Validate with a **full-scale soak test** including bursts, long-prompt outliers and failure injection (kill a replica); set autoscaling on queue depth/KV usage; measure cost per million tokens and compare with hosted APIs.
:::
:::

:::keypoints
- Production engines (vLLM, SGLang, TGI, TensorRT-LLM) implement continuous batching, paged and prefix KV caching, quantisation, speculation and parallelism; llama.cpp/Ollama/MLX serve local and edge.
- Nearly all expose an OpenAI-compatible API: keep it as your stable boundary.
- Key settings: max model length, GPU memory utilisation, concurrency and batched-token caps, prefix caching, quantisation/KV dtype, parallel size, chunked prefill.
- Benchmark with realistic workloads: open-loop arrivals, percentiles, goodput under SLO, quality checks, cost per million tokens.
- Production needs gateways, routers, warm weights, health checks, graceful drains, quotas, metrics and autoscaling.
:::

:::resources
- [vLLM docs](https://docs.vllm.ai) and [vLLM on GitHub](https://github.com/vllm-project/vllm) — the reference open-source engine.
- [SGLang docs](https://docs.sglang.ai) and [repo](https://github.com/sgl-project/sglang) — RadixAttention and structured generation.
- [Hugging Face TGI docs](https://huggingface.co/docs/text-generation-inference) — Text Generation Inference.
- [TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM) and [NVIDIA NIM docs](https://docs.nvidia.com/nim/) — NVIDIA's optimised stack.
- [llama.cpp](https://github.com/ggml-org/llama.cpp), [Ollama](https://ollama.com), [MLX](https://github.com/ml-explore/mlx) — local and Apple-silicon inference.
- [BentoML LLM Inference Handbook](https://bentoml.com/llm/) — a vendor-neutral guide to serving.
:::
