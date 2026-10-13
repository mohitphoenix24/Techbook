---
title: The KV Cache — Memory, MQA/GQA and PagedAttention
level: advanced
time: 55
summary: Why serving a long conversation costs more memory than the model itself. How keys and values are cached, the memory formula and why context length and concurrency explode it, MHA versus MQA, GQA and MLA, KV quantisation, PagedAttention and prefix caching in vLLM, sliding windows and eviction, plus an interactive memory calculator and a runnable demonstration that caching turns quadratic work into linear.
---

When a model generates the 1,000th token, attention needs the **keys and values** of the previous 999 tokens. Recomputing them at every step would repeat nearly the whole forward pass. So the engine **stores** them: the **KV cache**. It is the single largest consumer of GPU memory in most serving systems after the weights, and managing it well is what separates a toy server from a production one.

## Why cache keys and values

In attention, each new token's **query** is compared against the **keys** of all previous tokens, and the result weights their **values**. The keys and values of past tokens **never change** once computed (causal masking), so compute them once and reuse.

```python run title="Without a KV cache, work grows quadratically; with it, linearly" level=intermediate
def work_without_cache(n_tokens):
    # at step t the model recomputes K,V for all t tokens (t units of projection work) and attends over them
    return sum(t for t in range(1, n_tokens + 1))

def work_with_cache(n_tokens):
    # at step t compute K,V only for the NEW token (1 unit) and attend over cached t entries (attention reads are unavoidable)
    return n_tokens

for n in (100, 1_000, 10_000):
    a, b = work_without_cache(n), work_with_cache(n)
    print(f"generate {n:>6} tokens: projection work without cache {a:>12,}   with cache {b:>7,}   saving {a / b:>7,.0f}x")
```

(The attention reads over the cache still grow with length, which is why long contexts remain costly in memory traffic, but the recomputation disappears.)

## How big is it?

For every token in every active sequence, every layer stores one key vector and one value vector per **KV head**:

:::formula KV-cache size
\text{KV bytes} = 2 \times L \times H_{kv} \times d_{head} \times b \times T \times B
:::

with `L` layers, `H_kv` KV heads, `d_head` head dimension, `b` bytes per number, `T` tokens per sequence, `B` sequences. Explore it:

```viz algo=kvcache title="KV-cache memory calculator"
```

For a Llama-style 8B model (32 layers, 8 KV heads, head dim 128, fp16) that is **128 KB per token**, so a **128K-token** conversation needs **~17 GB**, as much as the model's weights. Serve 20 such conversations and the KV cache is **~340 GB**. This is why long-context, high-concurrency serving is a memory problem.

```python run title="KV memory for real model shapes" level=easy
def kv_gb(layers, kv_heads, head_dim, tokens, batch=1, bytes_per=2):
    return 2 * layers * kv_heads * head_dim * bytes_per * tokens * batch / 1e9

models = {
    "7B full multi-head attention (32 KV heads)": (32, 32, 128),
    "8B with GQA (8 KV heads)":                    (32, 8, 128),
    "70B with GQA (8 KV heads)":                   (80, 8, 128),
}
for name, (L, H, D) in models.items():
    per_tok_kb = kv_gb(L, H, D, 1) * 1e6
    print(f"{name:44} {per_tok_kb:>6.0f} KB/token | 8K ctx: {kv_gb(L, H, D, 8_192):>5.1f} GB | 128K ctx: {kv_gb(L, H, D, 131_072):>6.1f} GB")
```

## Shrinking the cache: architecture

| Technique | Idea | Effect |
|---|---|---|
| **MHA** (multi-head) | each attention head has its own K and V | baseline: biggest cache |
| **MQA** (multi-query) | **one** K,V shared by all query heads | cache ÷ heads (e.g. 32×); some quality loss |
| **GQA** (grouped-query, [paper](https://arxiv.org/abs/2305.13245)) | groups of query heads share a K,V (e.g. 8 KV heads for 32 query heads) | cache ÷ 4 at near-MHA quality: the modern default |
| **MLA** (multi-head latent attention, DeepSeek) | cache a compressed **latent** vector and reconstruct K,V on the fly | very small cache with strong quality |
| **Sliding-window attention** | some layers attend only to the last W tokens | bounded cache for those layers |
| **Attention sinks / eviction** ([StreamingLLM](https://arxiv.org/abs/2309.17453)) | keep the first few tokens + a recent window; drop the middle | constant memory for streaming, lossy |
| **Hybrid models** (attention + SSM/linear layers) | fewer attention layers | smaller cache |

These choices are baked into the model when it is trained. When you pick a model for long-context serving, **its KV-cache footprint per token is a first-class specification**.

## Shrinking the cache: serving techniques

- **KV-cache quantisation**: store keys/values in FP8 or INT8/INT4 instead of 16-bit: 2–4× smaller, with small quality effects (validate on your long-context tasks).
- **Offloading**: spill cold sessions' KV to CPU RAM or SSD and bring it back when needed (useful for multi-turn chat with idle gaps).
- **Compression/eviction policies**: heavy-hitter and importance-based token dropping (research-grade, lossy).

## PagedAttention: no more fragmentation

Naively, each sequence reserves one **contiguous** region sized for its **maximum** length, wasting memory on unused slots and fragmenting free space. **PagedAttention** ([vLLM paper](https://arxiv.org/abs/2309.06180)) borrows operating-system paging: the KV cache is split into fixed-size **blocks** (e.g. 16 tokens) allocated on demand and tracked by a per-sequence **block table**. Result: near-zero waste, and **sharing** of blocks between sequences.

```python run title="Block allocation: paged versus contiguous reservation" level=intermediate
import math

MAX_LEN, BLOCK = 4096, 16
requests = [120, 900, 35, 2200, 410, 78, 1500, 260]                 # actual lengths (prompt + generated) of 8 concurrent requests

# contiguous: each request reserves MAX_LEN slots up front
contiguous_slots = len(requests) * MAX_LEN
used = sum(requests)

# paged: allocate ceil(len / BLOCK) blocks per request; waste is at most BLOCK-1 slots per request
paged_slots = sum(math.ceil(n / BLOCK) * BLOCK for n in requests)

print(f"actually needed:       {used:>7,} token slots")
print(f"contiguous reservation: {contiguous_slots:>7,} slots -> {used / contiguous_slots:>4.0%} utilised, {contiguous_slots / paged_slots:.1f}x more memory than paged")
print(f"paged (16-token blocks): {paged_slots:>7,} slots -> {used / paged_slots:>4.0%} utilised")
```

vLLM reported **2–4× higher throughput** than prior systems largely because the freed memory allows **many more concurrent sequences** in a batch.

## Prefix caching: share the common start

Many requests share a **prefix** (the system prompt, tool definitions, few-shot examples, a long document). Because KV for a given token sequence is deterministic, engines **reuse** the cached blocks for the shared prefix instead of recomputing the prefill (**automatic prefix caching**, also called RadixAttention in SGLang). Effects:

- **TTFT drops** (no prefill for the cached part).
- **GPU work and cost fall.**
- It is the self-hosted version of **provider-side prompt caching** that you met earlier, with the same rule: **put stable content first**.

```python run title="A radix-style prefix cache: how much prefill is skipped?" level=intermediate
class PrefixCache:
    """Stores token-sequence prefixes; reports the longest cached prefix for a new prompt."""
    def __init__(self): self.seqs = []
    def match_len(self, tokens):
        best = 0
        for s in self.seqs:
            n = 0
            for a, b in zip(s, tokens):
                if a != b: break
                n += 1
            best = max(best, n)
        return best
    def add(self, tokens): self.seqs.append(list(tokens))

system = ["<sys>"] + [f"rule{i}" for i in range(1500)]                       # a 1,500-token shared system prompt
cache = PrefixCache()
total_prompt = computed = 0
for i, q in enumerate(["what is x", "how do I y", "explain z in detail please"]):
    prompt = system + q.split()
    hit = cache.match_len(prompt)
    total_prompt += len(prompt); computed += len(prompt) - hit
    cache.add(prompt)
    print(f"request {i + 1}: prompt {len(prompt)} tokens, cache hit {hit}, prefill computes {len(prompt) - hit}")
print(f"prefill work saved overall: {1 - computed / total_prompt:.0%}")
```

## Operational implications

- **Concurrency is limited by KV memory, not compute.** Capacity planning: `max concurrent sequences ≈ (GPU memory × utilisation − weights) ÷ KV per sequence`.
- **Long contexts hurt twice**: more KV per sequence and more attention traffic per step. A mixed workload (a few 100K-token requests among many short ones) needs scheduling and admission control.
- **Preemption**: when memory runs out, engines **swap out or recompute** (evict and later redo prefill for) lower-priority sequences. Watch for preemption metrics.
- **Monitor KV utilisation**, prefix-cache hit rate and queue depth; autoscale on them.
- **Memory knobs** in vLLM: `--gpu-memory-utilization`, `--max-model-len`, `--max-num-seqs`, `--kv-cache-dtype fp8`, `--enable-prefix-caching`.

```quiz
? What does the KV cache store?
+ The keys and values of all previous tokens for each layer, so they are not recomputed at every step
- The model weights
- The user's chat history text
> It trades memory for compute.

? Why does grouped-query attention reduce serving cost?
+ Fewer KV heads means a smaller KV cache per token, allowing more concurrent sequences and less memory traffic
- It makes the vocabulary smaller
- It removes attention
> GQA divides the cache by heads ÷ KV heads at near-MHA quality.

? What problem does PagedAttention solve?
+ Wasted and fragmented KV memory from contiguous per-sequence reservations, enabling many more concurrent sequences and block sharing
- Slow tokenization
- Training instability
> Block tables allocate KV memory on demand.

? Why put the system prompt first in requests when self-hosting with prefix caching?
+ Identical prefixes can reuse cached KV blocks and skip prefill
- Models read the start more carefully
- It reduces output length
> Stable content first, volatile content last.
```

:::problem Your 8B model on an 80 GB GPU serves 32 concurrent chats well at 4K context, but OOMs when users start sending 64K-token documents. Explain and fix. {level=hard tags="kv cache,capacity"}
Do the arithmetic and propose changes.

:::solution Model answer
Weights ≈ 16 GB; KV ≈ 128 KB/token (GQA, fp16): a 4K chat ≈ 0.5 GB (32 chats ≈ 16 GB, fine) but a **64K** sequence ≈ **8.6 GB**; a few of them plus many short chats exceed the ~56 GB KV budget. Fixes: **limit `max-num-seqs` or admission-control long requests** (separate pool/queue for long contexts), **quantise the KV cache to FP8** (halves it), **enable prefix caching** if documents repeat, use **chunked prefill** to avoid prefill spikes, **route long-context requests** to a different replica or larger-memory GPUs, offload idle sessions' KV, and consider a model with a smaller KV footprint (MLA/sliding window) for the long-context workload. Add KV-utilisation and preemption alerts.
:::
:::

:::keypoints
- The KV cache stores past keys and values so decoding does not recompute them; it turns quadratic recomputation into linear work at the price of memory.
- Size = 2 × layers × KV heads × head dim × bytes × tokens × sequences; it often rivals or exceeds the weights, limiting concurrency and context length.
- Reduce it with GQA/MQA/MLA, sliding windows, KV quantisation and offloading.
- PagedAttention allocates KV in blocks to avoid fragmentation and enables sharing; prefix caching reuses KV for common prefixes, cutting TTFT and cost.
- Plan capacity by KV memory, watch utilisation, preemption and cache-hit metrics, and treat long contexts as a separate workload.
:::

:::resources
- [Efficient Memory Management for LLM Serving with PagedAttention](https://arxiv.org/abs/2309.06180) — the vLLM paper.
- [vLLM blog: PagedAttention](https://blog.vllm.ai/2023/06/20/vllm.html) — an accessible explanation.
- [GQA: Training Generalized Multi-Query Transformer Models](https://arxiv.org/abs/2305.13245) — grouped-query attention.
- [Efficient Streaming Language Models with Attention Sinks](https://arxiv.org/abs/2309.17453) — bounded-memory streaming.
- [Kipply: Transformer Inference Arithmetic](https://kipp.ly/transformer-inference-arithmetic/) — KV cache maths in detail.
- [vLLM docs](https://docs.vllm.ai) — prefix caching, KV quantisation and tuning flags.
:::
