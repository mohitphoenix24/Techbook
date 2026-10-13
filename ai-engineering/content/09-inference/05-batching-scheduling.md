---
title: Batching and Scheduling — Continuous Batching, Chunked Prefill, Disaggregation
level: advanced
time: 50
summary: How serving engines keep GPUs busy under real traffic. Static versus dynamic versus continuous (iteration-level) batching, why continuous batching multiplies throughput, the prefill/decode interference problem and chunked prefill, prefill–decode disaggregation, scheduling policies and SLOs, preemption, admission control and autoscaling. With an interactive timeline and a runnable scheduler simulation.
---

Because decoding is memory-bound, the way to make a GPU worth its price is to serve **many requests at once**. But requests arrive at random times and want different numbers of tokens. **Scheduling** decides which tokens run on the GPU at each step. It is where a good serving engine earns its throughput.

## Three generations of batching

| Approach | How it works | Problem |
|---|---|---|
| **Static batching** | collect N requests, run the batch until **all** finish, then take the next batch | short requests wait for the longest; new arrivals wait for the batch to end; padding waste |
| **Dynamic batching** | wait a short time window to form batches (common in classic model serving) | still request-level: one slow sequence holds the batch |
| **Continuous (iteration-level) batching** (Orca, [paper](https://www.usenix.org/conference/osdi22/presentation/yu); vLLM, TGI, SGLang, TensorRT-LLM) | decide the batch **at every decode step**: finished sequences leave, waiting ones join | handles variable lengths; near-full GPU utilisation |

Compare static and continuous batching on the same traffic:

```viz algo=batching title="Static vs continuous batching"
```

In continuous batching the **unit of scheduling is one token step**, not one request. A freed slot is refilled immediately, so the GPU runs full batches almost all the time. Typical gains versus naive static batching are **several-fold throughput** at the same latency, and it is the reason modern engines are an order of magnitude better than serving each request separately.

## A scheduler you can run

```python run title="Static vs continuous batching, same workload" level=intermediate
import random

random.seed(7)
# requests arrive over time with varied output lengths; the GPU decodes one token per active request per step (step time is ~constant)
requests = [{"id": i, "arrive": int(i * 2.2 + random.random() * 3), "need": random.choice([8, 12, 20, 40, 120, 300])} for i in range(40)]

def simulate(mode, slots=16):
    waiting = sorted((dict(r, left=r["need"], start=None, end=None) for r in requests), key=lambda r: r["arrive"])
    running, done, t, busy = [], [], 0, 0
    while len(done) < len(requests):
        can_admit = mode == "continuous" or not running                 # static: only when the previous batch fully finished
        while can_admit and len(running) < slots and waiting and waiting[0]["arrive"] <= t:
            r = waiting.pop(0); r["start"] = t; running.append(r)
        if not running:
            t = waiting[0]["arrive"] if waiting else t + 1; continue
        t += 1; busy += len(running)                                     # one decode step for everyone running
        for r in running:
            r["left"] -= 1
            if r["left"] == 0: r["end"] = t; done.append(r)
        running = [r for r in running if r["left"] > 0]
    lat = sorted(r["end"] - r["arrive"] for r in done)
    wait = sorted(r["start"] - r["arrive"] for r in done)
    return t, sum(r["need"] for r in done) / t, busy / (t * slots), lat[len(lat) // 2], lat[int(len(lat) * 0.95)], wait[int(len(wait) * 0.95)]

print(f"{'mode':11} {'steps':>6} {'tokens/step':>12} {'slot util':>10} {'p50 latency':>12} {'p95 latency':>12} {'p95 queue wait':>15}")
for mode in ("static", "continuous"):
    steps, tput, util, p50, p95, w95 = simulate(mode)
    print(f"{mode:11} {steps:>6} {tput:>12.2f} {util:>10.0%} {p50:>12} {p95:>12} {w95:>15}")
```

Same traffic, far fewer total steps, much better tail latency, because slots never idle waiting for a straggler.

## Prefill and decode interfere

A new request's **prefill** is a big, compute-heavy chunk of work (thousands of tokens). When the scheduler runs it in a step, every active **decode** user in that step waits for the prefill to finish: their inter-token latency spikes ("generation stalls"). Under mixed traffic this produces ugly tail latencies even when average throughput looks good.

### Chunked prefill

Split long prompts into **chunks** (say 512–2,048 tokens) and schedule **at most one chunk per step alongside the decodes**. Each step then has a bounded cost, so decoding users see smooth ITL while prefill progresses a bit at a time. Sarathi-Serve and vLLM's chunked prefill popularised this. Trade-off: slightly longer TTFT for the prefilling request, much steadier ITL for everyone else; tune the **token budget per step**.

```python run title="Why chunked prefill smooths inter-token latency" level=intermediate
def step_time(decode_users, prefill_tokens, per_decode=0.2, per_prefill_token=0.02, base=12.0):
    return base + decode_users * per_decode + prefill_tokens * per_prefill_token          # milliseconds

users = 32
print("A 8,000-token prompt arrives while 32 users are decoding:\n")
unchunked = step_time(users, 8000)
print(f"unchunked: that one step takes {unchunked:6.1f} ms -> every active user sees a {unchunked:.0f} ms gap (normal ITL ≈ {step_time(users, 0):.0f} ms)")
chunk = 512
steps = 8000 // chunk + (1 if 8000 % chunk else 0)
chunked = step_time(users, chunk)
print(f"chunked  : {steps} steps of {chunked:6.1f} ms each -> users see ~{chunked:.0f} ms ITL; the new prompt's prefill takes {steps * chunked:.0f} ms total (TTFT +{steps * chunked - unchunked:.0f} ms)")
```

## Prefill/decode disaggregation

Prefill is compute-bound; decode is memory-bound. Running both on the same GPUs forces compromises. **Disaggregated serving** (DistServe, Splitwise, and now in several engines and NVIDIA Dynamo) runs **prefill on one pool of GPUs and decode on another**, transferring the **KV cache** between them over a fast network. Benefits: each pool is tuned for its job (batch sizes, parallelism, even hardware), no interference, and independent scaling to meet TTFT and ITL SLOs. Costs: KV-transfer bandwidth and orchestration complexity; it pays off at large scale with strict SLOs and long prompts.

## Scheduling policies

- **FCFS** (first come, first served): simple and fair; long jobs can block (head-of-line).
- **Shortest-job-first / priority**: better median latency, but needs length prediction and risks starvation.
- **Priority classes / tenants**: paid tiers, interactive vs batch; reserve capacity.
- **SLO-aware scheduling**: prioritise requests nearing their deadline; shed or defer low-value work under overload.
- **Fair sharing across tenants** (weighted fair queuing) to prevent one customer's burst from starving others.
- **Prefix-aware routing**: send requests with the same prefix to the same replica to hit its KV cache.

## Memory pressure: admission control and preemption

KV memory is finite (previous lesson). When it fills:

- **Admission control**: stop admitting new sequences (queue them) when KV usage is high; reject with 429/503 when the queue exceeds limits, rather than letting latency explode.
- **Preemption**: evict a running sequence and either **swap its KV to CPU** or **recompute** it later (re-run prefill). Costly but prevents OOM.
- **Max sequence limits** (`max_num_seqs`, `max_num_batched_tokens`) bound the step size; set them from load tests.

## Autoscaling and capacity

Scale replicas on **queue depth, KV-cache utilisation, TTFT/ITL percentiles and GPU utilisation**, not CPU. LLM replicas are **slow to start** (loading tens of GB of weights takes minutes), so scale **ahead of demand** (predictive or generous headroom) and keep **warm spares**. Use model-weight caching on nodes and fast storage. Route by model and load; consider **spot/preemptible** capacity for batch work.

```python run title="Sizing replicas from traffic and per-replica throughput" level=easy
import math

def replicas_needed(rps, avg_output_tokens, tokens_per_sec_per_replica, target_util=0.7):
    demand = rps * avg_output_tokens                                  # tokens/s the fleet must produce
    return math.ceil(demand / (tokens_per_sec_per_replica * target_util))

for rps in (2, 10, 50, 200):
    n = replicas_needed(rps, avg_output_tokens=350, tokens_per_sec_per_replica=2500)
    print(f"{rps:>4} requests/s x 350 output tokens -> {n:>3} replicas (at 70% target utilisation)")
```

## Benchmarking like an engineer

Measure under **realistic mixed workloads**: input and output length distributions from production logs, arrival process (Poisson or bursty), concurrency sweep. Report **TTFT and ITL percentiles**, **throughput**, and **goodput** (requests meeting the SLO). Tools: vLLM's benchmark scripts, **GuideLLM**, **genai-perf** (NVIDIA), and load generators such as k6 or Locust. Always warm up; test long-tail prompts; vary prefix reuse; record GPU and KV utilisation.

```quiz
? What distinguishes continuous batching from static batching?
+ The batch is re-formed at every decode step: finished sequences leave and waiting ones join immediately
- It uses more GPUs
- It pads all sequences to the same length
> Iteration-level scheduling keeps slots full.

? Why does a long prefill hurt other users, and what fixes it?
+ It occupies a whole step, stalling decodes; chunked prefill bounds per-step work so decoding stays smooth
- Prefill uses the network
- Nothing can fix it
> Chunk long prompts alongside decodes.

? What is prefill/decode disaggregation?
+ Running prefill and decode on separate GPU pools and transferring the KV cache between them
- Splitting the model by layers
- Running two copies of the same model
> It lets each phase be tuned and scaled independently.

? What should drive autoscaling for LLM replicas?
+ Queue depth, KV-cache utilisation and latency percentiles, scaled ahead of demand because replicas start slowly
- CPU usage only
- The time of day only
> GPU-bound services need GPU-aware signals.
```

:::problem p50 latency looks fine but p99 TTFT is 12 seconds during busy periods. List causes and mitigations. {level=hard tags="scheduling,latency"}
Think about queues, long prompts and memory.

:::solution Model answer
Causes: **queueing** when arrival rate exceeds capacity (long waits at the tail), **head-of-line blocking** by very long prompts, **prefill interference** and cache thrash, **KV memory pressure** causing preemption/recompute, cold replicas after scaling, uneven routing. Mitigations: autoscale ahead of load on queue depth/KV usage; **admission control** with fast rejection and priorities; **chunked prefill** and token budgets; **separate pools** or routing for long-context requests (or disaggregated prefill); **prefix caching** and cache-aware routing; cap `max_num_seqs` according to KV; keep warm spares; measure goodput against explicit SLOs and review per-length-bucket latency.
:::
:::

:::keypoints
- Continuous (iteration-level) batching re-forms the batch every step, removing head-of-line waiting and padding, and multiplies throughput versus static batching.
- Long prefills stall decoding; chunked prefill bounds per-step work, and prefill/decode disaggregation separates the compute-bound and memory-bound phases onto different pools.
- Scheduling policies (FCFS, priority, SLO-aware, tenant-fair, prefix-aware routing) shape tail latency and fairness.
- Protect memory with admission control and preemption (swap or recompute); bound step sizes with token and sequence limits.
- Autoscale on queue depth, KV usage and latency, ahead of demand; benchmark with realistic mixed workloads and report goodput.
:::

:::resources
- [Orca: A Distributed Serving System for Transformer-Based Generative Models](https://www.usenix.org/conference/osdi22/presentation/yu) — iteration-level scheduling.
- [PagedAttention / vLLM paper](https://arxiv.org/abs/2309.06180) — memory management that enables large batches.
- [vLLM docs](https://docs.vllm.ai) — chunked prefill, scheduling and benchmarking guides.
- [SGLang docs](https://docs.sglang.ai) — RadixAttention and cache-aware scheduling.
- [BentoML LLM Inference Handbook](https://bentoml.com/llm/) — metrics, batching and optimisation explained.
- [NVIDIA TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM) — in-flight batching and production serving on NVIDIA GPUs.
:::
