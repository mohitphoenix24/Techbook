---
title: Build an Inference Scheduler
level: advanced
time: 65
icon: cpu
cover: #f59e0b,#6366f1
tags: inference, continuous-batching, kv-cache, paged-attention, prefix-caching
summary: Build a discrete-event simulator of an LLM serving engine — static versus continuous batching, a paged KV-cache block allocator, admission control and preemption under memory pressure, chunked prefill and prefix caching — and measure throughput, latency and time-to-first-token for each design, the way vLLM-style servers are reasoned about.
---

A GPU serving an LLM is expensive, and most of its cost is **waiting**: waiting for memory, for the slowest request in a batch, for a long prompt to finish. A serving engine's scheduler decides which requests run each step, and how their **KV cache** (the stored keys and values of every token so far) is laid out in memory. Those two decisions explain most of the throughput difference between a naive server and vLLM, SGLang or TensorRT-LLM.

**What you'll build:** a small, deterministic simulator with a pluggable scheduler, a paged allocator and a prefix cache, plus a benchmark that compares designs on the same workload.

:::flow The engine loop
Queue | requests arrive over time
Admit | if a batch slot and KV blocks are free
Prefill | process the prompt (compute-heavy)
Decode | one token per running request per step
Grow | allocate a KV block when a sequence needs one
Preempt | free memory by evicting a sequence
Finish | free blocks, record latency
:::

:::def KV cache
During generation each new token attends to all earlier tokens. Recomputing their keys and values every step would be hopelessly slow, so the engine **stores** them. The cache grows by one token per step per sequence, so memory, not compute, usually limits how many requests can run together.
:::

## Step 1 — A workload and a time model

We simulate time in **milliseconds** instead of using a GPU. Each engine iteration (one forward pass) costs a fixed overhead, a little extra for every sequence decoding, and extra for prompt tokens processed in that iteration. These numbers are plausible, not measured; what matters are the **relative** results.

```python run shared title="Step 1 · workload and cost model"
import random, math
from dataclasses import dataclass, field

@dataclass
class Req:
    id: int; arrival: float; prompt_len: int; out_len: int; prefix_id: str = None; prefix_len: int = 0
    prefilled: int = 0; generated: int = 0; first_token: float = None; finish: float = None
    blocks: list = field(default_factory=list); preempted: int = 0; cached_tokens: int = 0

def make_workload(n=120, mean_gap_ms=45, seed=5):
    rnd, t, reqs = random.Random(seed), 0.0, []
    for i in range(n):
        t += rnd.expovariate(1 / mean_gap_ms)
        prompt = int(min(2500, max(40, rnd.lognormvariate(5.6, 0.8))))              # mostly a few hundred tokens, some very long
        out = int(min(300, max(8, rnd.expovariate(1 / 80))))                       # output lengths vary a lot
        shared = rnd.random() < 0.7                                                 # 70% of requests start with the same system prompt
        reqs.append(Req(i, t, prompt + (256 if shared else 0), out, "sys" if shared else None, 256 if shared else 0))
    return reqs

def iteration_ms(n_decode, prefill_tokens):
    return 8.0 + 0.35 * n_decode + 0.02 * prefill_tokens                           # fixed cost + per decoding sequence + per prompt token

reqs = make_workload()
lens = sorted(r.prompt_len for r in reqs)
print(f"{len(reqs)} requests over {reqs[-1].arrival / 1000:.1f} s | prompt tokens: median {lens[len(lens) // 2]}, max {lens[-1]} | output tokens: mean {sum(r.out_len for r in reqs) / len(reqs):.0f}")
print(f"one decode step for 32 sequences costs {iteration_ms(32, 0):.1f} ms; prefilling a 2000-token prompt adds {0.02 * 2000:.0f} ms")
```

## Step 2 — Static batching: the baseline

**Static batching** collects a group of requests, runs them together, and returns only when **every** request in the group has finished. Short requests sit finished while long ones continue (the slots are wasted), and new arrivals wait for the whole batch.

```python run shared title="Step 2 · static batching"
import copy

def percentile(xs, p):
    xs = sorted(xs); return xs[min(len(xs) - 1, int(len(xs) * p))]

def summarize(name, reqs, end, extra=""):
    lat = [r.finish - r.arrival for r in reqs]; ttft = [r.first_token - r.arrival for r in reqs]
    tokens = sum(r.out_len for r in reqs)
    print(f"{name:34} {tokens / (end / 1000):>7.0f} tok/s | latency mean {sum(lat) / len(lat):>6.0f} ms p95 {percentile(lat, .95):>6.0f} ms | TTFT mean {sum(ttft) / len(ttft):>6.0f} ms p95 {percentile(ttft, .95):>6.0f} ms {extra}")

def static_batching(reqs, batch_size=16):
    queue, t, done = sorted(copy.deepcopy(reqs), key=lambda r: r.arrival), 0.0, []
    while queue:
        batch = queue[:batch_size]; queue = queue[batch_size:]
        t = max(t, batch[-1].arrival)                                               # wait until the whole batch has arrived
        t += iteration_ms(0, sum(r.prompt_len for r in batch))                      # prefill everything at once
        for r in batch: r.first_token = t
        for _ in range(max(r.out_len for r in batch)):                              # decode until the LONGEST request finishes
            t += iteration_ms(len(batch), 0)
        for r in batch: r.finish = t
        done += batch
    return done, t

done, end = static_batching(reqs, 16)
summarize("static batching (batch of 16)", done, end)
```

## Step 3 — Continuous batching

**Continuous (in-flight) batching** schedules at the level of a single iteration: finished sequences leave immediately, and waiting requests join the batch at the next step. No slot is idle while work is waiting. This one idea is the largest single throughput gain in LLM serving.

For now memory is unlimited; the next steps add the real constraint.

```python run shared title="Step 3 · continuous batching, unlimited memory"
def continuous_batching(reqs, max_batch=32, prefill_budget=None):
    pending, running, done, t = sorted(copy.deepcopy(reqs), key=lambda r: r.arrival), [], [], 0.0
    while pending or running:
        while pending and pending[0].arrival <= t and len(running) < max_batch:     # admit as many as fit
            running.append(pending.pop(0))
        if not running:
            t = pending[0].arrival; continue                                         # idle until the next arrival
        budget = prefill_budget or 10 ** 9                                           # max prompt tokens processed this iteration
        prefill_tokens = 0
        for r in running:
            if r.prefilled < r.prompt_len and budget > 0:
                chunk = min(r.prompt_len - r.prefilled, budget)
                r.prefilled += chunk; budget -= chunk; prefill_tokens += chunk
        decoding = [r for r in running if r.prefilled >= r.prompt_len and r.generated < r.out_len]
        t += iteration_ms(len(decoding), prefill_tokens)
        for r in decoding:
            r.generated += 1
            if r.first_token is None: r.first_token = t
            if r.generated >= r.out_len: r.finish = t
        done += [r for r in running if r.finish is not None]
        running = [r for r in running if r.finish is None]
    return done, t

done_c, end_c = continuous_batching(reqs, 32)
summarize("static batching (batch of 16)", done, end)
summarize("continuous batching (max 32)", done_c, end_c)
```

Same hardware, same requests: throughput up, latency and time-to-first-token (TTFT) far down, because nothing waits for the slowest request.

## Step 4 — The real limit: KV-cache memory

Every running sequence holds KV memory proportional to its length. If we **reserve memory for the maximum possible length** for each request (the simple "contiguous" approach), most of that reservation is wasted. **PagedAttention** (the idea behind vLLM) manages the cache like an operating system manages RAM: fixed-size **blocks** allocated **on demand** and tracked per sequence in a **block table**.

```python run shared title="Step 4 · a paged block allocator"
BLOCK = 16                                                   # tokens per KV block

class BlockAllocator:
    def __init__(self, total_blocks):
        self.total, self.free_list, self.ref = total_blocks, list(range(total_blocks)), {}
        self.peak = 0
    def used(self): return self.total - len(self.free_list)
    def can_alloc(self, n): return len(self.free_list) >= n
    def alloc(self, n):
        if not self.can_alloc(n): return None
        blocks = [self.free_list.pop() for _ in range(n)]
        for b in blocks: self.ref[b] = 1
        self.peak = max(self.peak, self.used()); return blocks
    def incref(self, blocks):
        for b in blocks: self.ref[b] += 1
    def release(self, blocks):                               # a block returns to the pool only when nobody references it
        for b in blocks:
            self.ref[b] -= 1
            if self.ref[b] == 0: del self.ref[b]; self.free_list.append(b)

blocks_for = lambda tokens: math.ceil(tokens / BLOCK)

TOTAL_BLOCKS, MAX_LEN = 600, 2800                            # a 9,600-token KV cache; the longest allowed sequence is 2,800 tokens
print(f"KV cache: {TOTAL_BLOCKS} blocks x {BLOCK} tokens = {TOTAL_BLOCKS * BLOCK} tokens")
print(f"contiguous reservation: every request reserves {MAX_LEN} tokens -> only {TOTAL_BLOCKS * BLOCK // MAX_LEN} concurrent requests fit")
avg_seq = sum(r.prompt_len + r.out_len for r in reqs) / len(reqs)
print(f"paged allocation: the average sequence needs {avg_seq:.0f} tokens ({blocks_for(avg_seq)} blocks) -> about {int(TOTAL_BLOCKS / blocks_for(avg_seq))} concurrent requests fit")
alloc = BlockAllocator(10)
a = alloc.alloc(3); b = alloc.alloc(4); alloc.release(a)
print("allocator demo: after allocating 3 and 4 blocks and freeing the first, used =", alloc.used(), "free =", len(alloc.free_list))
```

Paging fixes **fragmentation** and **over-reservation**: memory is only held for tokens that exist (rounded up to one block), and any free block can be used by any sequence.

## Step 5 — A scheduler with memory, admission control and preemption

Now the scheduler must obey the allocator:

- **Admission control**: admit a waiting request only if its prompt blocks fit.
- **Growth**: as a sequence generates tokens, allocate a new block each time it crosses a block boundary.
- **Preemption**: if there is no free block for growth, **evict** the most recently admitted sequence, free its blocks and put it back in the queue (it will **recompute** its prompt later). This keeps the engine alive under memory pressure at the cost of wasted work.

```python run shared title="Step 5 · scheduler with paged KV memory"
def serve(reqs, total_blocks=TOTAL_BLOCKS, max_batch=32, prefill_budget=None, prefix_cache=False, paged=True):
    pending, running, done = sorted(copy.deepcopy(reqs), key=lambda r: r.arrival), [], []
    alloc, t, preemptions, prefix_blocks, prefill_saved = BlockAllocator(total_blocks), 0.0, 0, {}, 0
    batch_sizes = []
    def blocks_needed(r):
        return blocks_for(r.prompt_len) if paged else blocks_for(MAX_LEN)           # contiguous mode reserves the maximum up front
    while pending or running:
        # 1) admit while there is a free batch slot and enough KV blocks
        while pending and pending[0].arrival <= t and len(running) < max_batch:
            r = pending[0]
            shared = []
            if prefix_cache and r.prefix_id in prefix_blocks:                       # reuse the cached blocks of the shared system prompt
                shared = prefix_blocks[r.prefix_id]
            need = blocks_needed(r) - len(shared)
            if not alloc.can_alloc(need): break                                      # head-of-line request does not fit yet: wait
            pending.pop(0)
            r.blocks = shared + alloc.alloc(need)
            if shared:
                alloc.incref(shared); r.prefilled = r.cached_tokens = len(shared) * BLOCK; prefill_saved += r.cached_tokens
            running.append(r)
        if not running:
            t = pending[0].arrival; continue
        # 2) prefill (chunked if a budget is set), then decode one token for every ready sequence
        budget, prefill_tokens = prefill_budget or 10 ** 9, 0
        for r in running:
            if r.prefilled < r.prompt_len and budget > 0:
                chunk = min(r.prompt_len - r.prefilled, budget)
                r.prefilled += chunk; budget -= chunk; prefill_tokens += chunk
                if prefix_cache and r.prefix_id and r.prefilled >= r.prompt_len and r.prefix_id not in prefix_blocks:
                    n = r.prefix_len // BLOCK                                        # only whole blocks can be shared
                    prefix_blocks[r.prefix_id] = r.blocks[:n]; alloc.incref(r.blocks[:n])   # the cache itself holds a reference
        decoding = [r for r in running if r.prefilled >= r.prompt_len and r.generated < r.out_len]
        # 3) growth: a sequence that crosses a block boundary needs one more block
        for r in list(decoding):
            if paged and (r.prompt_len + r.generated) % BLOCK == 0:
                got = alloc.alloc(1)
                while got is None and len(running) > 1:                              # out of memory: preempt the newest sequence
                    victim = running[-1] if running[-1] is not r else running[-2]
                    alloc.release(victim.blocks); victim.blocks = []
                    victim.prefilled = victim.generated = victim.cached_tokens = 0; victim.first_token = None; victim.preempted += 1
                    running.remove(victim); decoding = [d for d in decoding if d is not victim]
                    pending.insert(0, victim); preemptions += 1
                    got = alloc.alloc(1)
                if got: r.blocks += got
        t += iteration_ms(len(decoding), prefill_tokens)
        batch_sizes.append(len(running))
        for r in decoding:
            r.generated += 1
            if r.first_token is None: r.first_token = t
            if r.generated >= r.out_len: r.finish = t
        for r in [r for r in running if r.finish is not None]:
            alloc.release(r.blocks); done.append(r)
        running = [r for r in running if r.finish is None]
    return done, t, {"peak_blocks": alloc.peak, "preemptions": preemptions, "avg_batch": sum(batch_sizes) / len(batch_sizes), "prefill_saved": prefill_saved}

for label, kw in (("contiguous KV (reserve max length)", dict(paged=False)), ("paged KV", dict(paged=True))):
    d, e, info = serve(reqs, **kw)
    summarize(label, d, e, f"| avg batch {info['avg_batch']:.1f}, peak KV {info['peak_blocks']}/{TOTAL_BLOCKS}, preemptions {info['preemptions']}")
```

Paging admits many more requests at once, so the batch is larger, throughput is higher and the queue shorter. Try a smaller `total_blocks` to watch preemptions appear and latency suffer.

## Step 6 — Prefix caching

Many requests start with the **same prefix** (a system prompt, a long document, few-shot examples). Their KV blocks are identical, so we can compute them **once** and let later requests **share** them (reference counted, read-only). That saves prefill compute (lower time to first token) **and** memory.

```python run shared title="Step 6 · prefix caching"
for label, kw in (("paged, no prefix cache", dict(prefix_cache=False)), ("paged + prefix cache", dict(prefix_cache=True))):
    d, e, info = serve(reqs, **kw)
    summarize(label, d, e, f"| prefill tokens saved {info['prefill_saved']}, peak KV {info['peak_blocks']}")
```

Shared prefixes cut the TTFT because those prompt tokens never need processing again. In real systems the shared prefix is found by **hashing token blocks** (as in vLLM's automatic prefix caching or SGLang's RadixAttention) rather than by an id.

## Step 7 — Chunked prefill: protect the other users

One 2,000-token prompt in a single iteration adds about 40 ms to **everyone's** next token. **Chunked prefill** limits the prompt tokens processed per iteration, so decoding sequences keep their steady rhythm.

```python run shared title="Step 7 · chunked prefill budget"
print(f"{'prefill budget per step':26} {'throughput':>11} {'latency p95':>12} {'TTFT p95':>9}")
for budget in (None, 2048, 512, 128):
    d, e, info = serve(reqs, prefix_cache=True, prefill_budget=budget)
    lat = [r.finish - r.arrival for r in d]; ttft = [r.first_token - r.arrival for r in d]
    print(f"{str(budget or 'unlimited'):26} {sum(r.out_len for r in d) / (e / 1000):>8.0f} t/s {percentile(lat, .95):>9.0f} ms {percentile(ttft, .95):>6.0f} ms")
```

There is a trade-off: a tiny budget protects steady decoding but delays each prompt's first token, a huge one does the opposite. In this workload the effect is small because prompts are short compared with the decode work; it grows with long prompts (documents, codebases) and tight latency targets. Real engines tune a **token budget per iteration** to balance throughput, TTFT and inter-token latency.

## Step 8 — Benchmark all designs

```python run shared title="Step 8 · the full comparison"
configs = [("static batching (16)", None), ("continuous, contiguous KV", dict(paged=False)), ("continuous, paged KV", dict(paged=True)),
           ("+ prefix cache", dict(paged=True, prefix_cache=True)), ("+ chunked prefill (512)", dict(paged=True, prefix_cache=True, prefill_budget=512))]
base = None
for name, kw in configs:
    if kw is None:
        d, e = static_batching(reqs, 16); extra = ""
    else:
        d, e, info = serve(reqs, **kw); extra = f"| preemptions {info['preemptions']}"
    tput = sum(r.out_len for r in d) / (e / 1000)
    base = base or tput
    summarize(name, d, e, f"| {tput / base:.1f}x {extra}")
```

Read the table top to bottom. Notice that **continuous batching with contiguous KV reservation is no better than static batching**: memory, not scheduling, was the bottleneck (the batch averaged 3 requests). Scheduling and memory management have to improve **together**.

## How it works

| Idea | What it fixes | Where it shows up |
|---|---|---|
| Continuous batching | idle slots while waiting for the slowest request | throughput and latency in Step 3 |
| Paged KV blocks | over-reservation and fragmentation of GPU memory | batch size in Step 5 |
| Admission control | overload and out-of-memory errors | `can_alloc` before admitting |
| Preemption (recompute) | deadlock when memory runs out mid-flight | `preemptions` under a small cache |
| Prefix caching | recomputing identical prompt prefixes | TTFT in Step 6 |
| Chunked prefill | long prompts stalling other users' decoding | tail latency in Step 7 |

What the simulator leaves out (and real engines add): multiple GPUs and tensor parallelism, speculative decoding, quantised KV caches, prefix-cache eviction policies (LRU), swapping KV blocks to CPU memory instead of recomputing, priority and fairness between tenants, and disaggregated prefill and decode on separate GPUs.

:::exercise Extend it
1. Set `total_blocks=250` and compare **recompute** preemption with a version that counts a fixed cost to **swap** blocks to CPU instead.
2. Add **priority**: requests flagged `interactive` are admitted before `batch` requests; measure TTFT for each class.
3. Add **speculative decoding**: each step emits 1 + k tokens with probability p; how much does throughput improve?
4. Replace the prefix id with a **hash of each full block of tokens** so any shared prefix is found automatically.
5. Plot GPU utilisation (average batch size over time) for static versus continuous batching.
:::

:::keypoints
- Static batching wastes capacity waiting for the slowest request; continuous batching schedules per iteration and is the biggest single serving win.
- KV-cache memory, not compute, limits concurrency; paged allocation holds memory only for tokens that exist and lets any free block serve any sequence.
- Admission control and preemption keep the engine alive under memory pressure, at the cost of recomputation.
- Prefix caching shares identical prompt prefixes, cutting prefill compute, memory and time to first token.
- Chunked prefill balances time to first token against steady decoding for other users; tune a per-iteration token budget.
:::
