---
title: Design an LLM Serving Platform
level: advanced
time: 55
summary: Serving large language models to many users — why LLM inference is unlike ordinary request serving (prefill vs decode, the KV cache, GPU memory), continuous batching, streaming tokens over SSE, routing with prefix-cache affinity, token-based rate limits and quotas, autoscaling scarce GPUs, multi-model and multi-region deployment, and the metrics that matter (TTFT, tokens/s, cost per token).
---

:::problem Design an LLM Serving Platform {level=hard tags="HLD,GPUs,batching,streaming"}
Design the inference platform behind a chat assistant / LLM API (like the ChatGPT or Claude API): clients send prompts (up to 100K+ tokens of context) and receive generated text **streamed** token by token. **Several models** of different sizes, **millions of requests per day**, strict per-customer quotas, and GPUs are the most expensive and scarce resource you have.

:::hint Hint
A request has two phases with different costs: **prefill** (process the whole prompt at once, compute-bound) and **decode** (generate one token at a time, memory-bandwidth-bound). The GPU is only used efficiently when many sequences decode together: **continuous batching**. GPU memory holds the model weights plus each active sequence's **KV cache**, which limits how many requests fit. Everything else (routing, quotas, autoscaling) is built around those facts.
:::
:::

## 1. Requirements

**Functional**: a `POST /v1/messages`-style API with model choice, system prompt, conversation, max tokens and sampling parameters; **streaming** responses; usage reporting (input/output tokens); per-organisation rate limits and quotas; multiple models and versions.

**Non-functional**
- **Latency**: **time to first token (TTFT)** < ~1 s for normal prompts; a steady **inter-token latency** (e.g. 20–50 ms) while streaming.
- **Throughput and cost**: maximise tokens per GPU-second (GPUs dominate cost).
- **Fairness and isolation** between customers; graceful overload (429s with retry hints, not timeouts).
- High availability across zones/regions; safe model rollouts.

## 2. Estimates

:::derive One replica of a large model
\text{weights: } 70\text{B params} \times 2\,\text{B (FP16)} = 140\,\text{GB} \Rightarrow 2 \times 80\,\text{GB GPUs minimum} || tensor parallelism across GPUs
\text{KV cache per token} \approx 2 \times 80\ \text{layers} \times 8\ \text{kv heads} \times 128 \times 2\,\text{B} \approx 0.33\,\text{MB} || grouped-query attention
\text{a 4K-token conversation} \approx 1.3\,\text{GB of KV cache} ||
!\text{a few dozen concurrent sequences fill the spare GPU memory: memory, not compute, limits concurrency} ||
:::

**Conclusions:** concurrency per replica is bounded by **KV-cache memory**; throughput depends on **batching** many sequences per decode step; long prompts make prefill expensive; and GPU capacity can't be added in seconds (model loading takes minutes), so plan for **queues, quotas and headroom**.

## 3. High-level design

```viz algo=arch title="LLM serving platform" dir=down
client   Clients | apps, SDKs [client] @0,1
gw       API gateway | auth, token quotas [gateway] @1,1
router   Router | model, region, prefix affinity [lb*2] @2,1
pool1    Model A replicas | GPU servers [gpu*3] @3,0.4
pool2    Model B replicas | GPU servers [gpu*2] @3,1.6
usage    Usage + billing [chart] @2,2.3
reg      Model registry | weights, versions [storage] @4,1.6
auto     Autoscaler | queue depth, KV usage [clock] @4,0.4
--
client -> gw : POST /v1/messages (stream)
gw -> router
router -> pool1
router -> pool2
gw ~> usage : tokens in/out
auto -> pool1 : add/remove replicas
reg -> pool2 : load weights
--
flow A streamed request
client > gw : POST /v1/messages {model: A, messages, max_tokens: 1000, stream: true}.
gw > router : Auth, then the org's limits: requests/min, input tokens/min, output tokens/min, concurrency. Allowed.
router > pool1 : Pick a replica of model A with spare KV-cache capacity, preferring one that already holds this conversation's prefix in its cache.
pool1 > client : The replica prefills the prompt (TTFT ≈ 400 ms), then streams tokens over SSE as they're decoded in a continuous batch.
gw > usage : When the stream ends, input/output token counts are recorded for quotas and billing.
flow Load rises
auto > pool1 : Queue depth and KV-cache utilisation stay high → request more GPU replicas (minutes to load weights), meanwhile shed lower-priority traffic with 429s.
reg > pool2 : New replicas pull model weights from the registry (or a local cache) before joining the pool.
```

## 4. Deep dives

### A. Continuous batching

A GPU decode step costs about the same for 1 or 32 sequences (it's dominated by reading the weights from memory), so batching is essential. **Static batching** waits for the whole batch to finish, so short answers wait for the longest one and new requests wait outside. **Continuous (in-flight) batching** (vLLM, TGI, TensorRT-LLM) admits new sequences and retires finished ones **at every step**:

```js run title="Static vs continuous batching on one GPU"
// One GPU can decode up to 8 sequences per step (one token each, ~25 ms per step regardless of batch size).
// Requests arrive over time with very different output lengths.
let seed = 29;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const SLOTS = 8, STEP_MS = 25;
const requests = Array.from({ length: 60 }, (_, i) => ({
  id: i, arrive: Math.floor(i * 800 + rand() * 400),                     // one request every ~0.8 s (~70% of capacity)
  tokens: rand() < 0.2 ? 400 + Math.floor(rand() * 400) : 20 + Math.floor(rand() * 120),   // a few long answers
}));

function simulate(continuous) {
  const waiting = [...requests].map((r) => ({ ...r })), running = [], done = [];
  let t = 0, busySlotSteps = 0, steps = 0;
  while (done.length < requests.length) {
    const canAdmit = continuous ? true : running.length === 0;          // static: wait until the whole batch finishes
    while (canAdmit && running.length < SLOTS && waiting.length && waiting[0].arrive <= t) {
      const r = waiting.shift(); r.start = t; r.left = r.tokens; running.push(r);
    }
    if (!running.length) { t = waiting[0].arrive; continue; }            // idle until the next arrival
    t += STEP_MS; steps++; busySlotSteps += running.length;
    for (const r of running) if (--r.left === 0) { r.end = t; done.push(r); }
    for (let i = running.length - 1; i >= 0; i--) if (running[i].left === 0) running.splice(i, 1);
  }
  const lat = done.map((r) => r.end - r.arrive).sort((a, b) => a - b);
  const wait = done.map((r) => r.start - r.arrive).sort((a, b) => a - b);
  const tokens = requests.reduce((s, r) => s + r.tokens, 0);
  console.log(`${(continuous ? "continuous batching" : "static batching").padEnd(20)} ` +
    `throughput ${(tokens / (t / 1000)).toFixed(0)} tok/s, GPU slots used ${(100 * busySlotSteps / (steps * SLOTS)).toFixed(0)}%, ` +
    `queue wait p50 ${(wait[30] / 1000).toFixed(1)} s, total latency p50 ${(lat[30] / 1000).toFixed(1)} s / p95 ${(lat[57] / 1000).toFixed(1)} s`);
}
simulate(false);
simulate(true);
```

Same GPU, same load: static batching builds a long queue (it wastes slots on finished sequences), while continuous batching keeps up. Prefill of new requests is interleaved with decode steps (chunked prefill) so a long prompt doesn't stall everyone's streams.

### B. KV-cache management

Each active sequence's attention keys/values are kept in GPU memory so the next token doesn't recompute the past. **PagedAttention** allocates the KV cache in fixed-size blocks (like virtual memory pages), avoiding fragmentation and allowing ~2–4× more concurrent sequences. When memory runs out, the scheduler **preempts** sequences (swap their KV to CPU memory or recompute later). **Prefix caching** keeps the KV of common prefixes (a long system prompt, earlier turns of a conversation) so the next request skips their prefill: that's why the router prefers the replica that served the previous turn (**session/prefix affinity**).

### C. Prefill vs decode

Prefill is compute-bound and bursty (a 100K-token prompt is a big job); decode is memory-bound and steady. At large scale, **disaggregated serving** runs them on separate GPU pools and ships the KV cache from prefill to decode nodes, so each pool is sized and tuned independently. Other throughput levers: quantisation (FP8/INT4), speculative decoding (a small model drafts tokens the big one verifies), and tensor/pipeline parallelism for models that don't fit on one GPU.

### D. Quotas, rate limits and fairness

Requests vary by orders of magnitude in cost, so limits are expressed in **tokens**: input tokens/min, output tokens/min, plus concurrent requests per organisation (token buckets in a shared store, as in the rate-limiter case study). Output tokens aren't known upfront: reserve `max_tokens` at admission and refund the unused part at the end. **Priority tiers** and per-tenant queues keep one customer's batch job from starving interactive users; under overload, return **429 with retry-after** quickly rather than letting requests time out.

### E. Autoscaling and capacity

GPU replicas take minutes to start (allocating machines, loading 100+ GB of weights), so autoscaling uses **leading signals** (queue depth, KV-cache utilisation, TTFT trend) with headroom, scheduled capacity for known peaks, and fast weight loading (local NVMe caches, streaming weights from object storage). Multiple models share a fleet: smaller models can be packed several per GPU; rarely used models scale to zero with a cold-start cost.

### F. Streaming and reliability

Tokens stream over **SSE** (or WebSockets); the gateway holds the long-lived connection. If a replica dies mid-stream, the request can be retried from scratch (output may differ) or the client resumes; client SDKs retry idempotently on 429/5xx with backoff. **Rollouts** of new model versions use canaries and shadow traffic with quality and latency checks; old versions remain addressable by name.

## 5. Wrap-up

Gateway (auth, **token-based quotas**, usage metering) → **router** (model, region, KV/prefix-cache affinity, load) → GPU replicas running **continuous batching** with **paged KV cache**, chunked prefill, prefix caching, optionally disaggregated prefill/decode → **SSE streaming**; autoscaling on queue depth and KV utilisation with headroom; priorities and 429s under overload. Monitor **TTFT**, inter-token latency, tokens/s per GPU, KV-cache utilisation, queue time, preemptions, error rates, and **cost per million tokens**.

```quiz
? Why does continuous batching beat static batching for LLMs?
+ Finished sequences free their slot immediately and new requests join at the next decode step, so the GPU stays full and short answers don't wait for long ones
- It uses a smaller model
- It skips the prefill phase
> Decode steps cost about the same whatever the batch size, so keeping the batch full is everything.

? What usually limits how many requests a GPU replica can serve concurrently?
+ GPU memory for the KV cache of all active sequences (after the model weights)
- The number of CPU cores
- Network bandwidth for prompts
> Paged KV-cache allocation and prefix sharing raise the limit.

? Why are LLM rate limits expressed in tokens rather than requests?
+ Request cost varies enormously with prompt and output length; tokens reflect the actual GPU work
- Tokens are easier to count than requests
- Requests can't be rate limited
> Reserve max_tokens at admission, refund what isn't used.
```

:::keypoints
- LLM inference = **prefill** (compute-bound) + **decode** (memory-bound, one token per step); GPU memory holds weights + **KV cache**, which caps concurrency.
- **Continuous batching** + **paged KV cache** + chunked prefill + **prefix caching** maximise tokens per GPU; disaggregate prefill/decode at scale.
- Route by model, region and **prefix-cache affinity**; stream tokens over **SSE**.
- **Token-based quotas** (reserve max_tokens, refund), priority tiers, fast 429s under overload.
- Autoscale on **leading signals** with headroom (weights load slowly); track TTFT, inter-token latency, tokens/s/GPU and cost per token.
:::
