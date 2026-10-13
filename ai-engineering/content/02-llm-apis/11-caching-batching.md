---
title: Prompt Caching, Batching and Other Cost Levers
level: intermediate
time: 45
summary: The cheapest tokens are the ones you do not pay full price for. How prompt caching works (prefix matching, breakpoints, TTL, pricing), the silent mistakes that destroy cache hits, the batch API for half-price offline work, response and semantic caching, and a ranked list of cost levers.
---

Most LLM apps send **the same large prefix** on every request: the system prompt, tool definitions, policy documents, few-shot examples. Paying full price for those tokens each time is the single biggest avoidable cost. Two features fix it: **prompt caching** and the **batch API**.

## Prompt caching

:::def Prompt caching
The provider stores the **internal state computed from the beginning of your prompt** (the KV cache, covered in module 9). When a later request starts with **exactly the same prefix**, it skips recomputing that part, so it is both **cheaper** (cached input tokens cost a small fraction of the normal price) and **faster** (lower time to first token).
:::

:::analogy
A book you have already read: when someone hands you the same first 100 pages plus a new chapter, you only read the new chapter. But if even one word on page 3 changed, you must re-read from page 3 onward.
:::

### The rules that matter

1. **Prefix match.** Only an exact prefix is reused. **Any change anywhere in the prefix invalidates everything after it.**
2. **Order is `tools` → `system` → `messages`.** Put stable things first.
3. **Minimum length.** Very short prefixes are not cached (the minimum is hundreds to a few thousand tokens depending on the model).
4. **Time to live.** Cached entries expire after a few minutes (a default of about five) and are refreshed on each hit; longer TTL options exist at a higher write price.
5. **Pricing (Anthropic):** writing to the cache costs a premium over normal input (about **1.25×** for the default TTL); reading from it costs a small fraction (about **0.1×**). One reuse already pays off.
6. **Verify.** Check `usage.cache_creation_input_tokens` and `usage.cache_read_input_tokens` in responses. If reads stay at zero, something is invalidating your prefix.

```python local title="Automatic caching on the Claude API"
response = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1024,
    cache_control={"type": "ephemeral"},          # cache the last cacheable block automatically
    system=LONG_SYSTEM_PROMPT_AND_POLICIES,       # thousands of tokens that never change
    messages=[{"role": "user", "content": question}],
)
u = response.usage
print("fresh input:", u.input_tokens, "| written to cache:", u.cache_creation_input_tokens, "| read from cache:", u.cache_read_input_tokens)
```

You can also place explicit breakpoints on individual blocks (`cache_control` inside a system block or message content) when you want finer control, for example caching a big document and a conversation separately (up to four breakpoints).

## Simulate it

Change what is in the prompt and see which part is a cache hit, a miss, or a write. Try putting a timestamp at the top.

```viz algo=promptcache title="Prefix caching explorer"
```

```python run title="Cache hit accounting with a prefix matcher" level=intermediate
class PrefixCache:
    """A toy provider-side cache: remembers token-prefixes of earlier requests."""
    def __init__(self, min_tokens=4):
        self.seen, self.min_tokens = [], min_tokens

    def lookup(self, tokens):
        best = 0
        for prev in self.seen:
            n = 0
            for a, b in zip(prev, tokens):
                if a != b: break
                n += 1
            best = max(best, n)
        return best if best >= self.min_tokens else 0

    def store(self, tokens):
        self.seen.append(list(tokens))

P_IN, P_CACHE_READ, P_CACHE_WRITE = 2.00, 0.20, 2.50          # $ per M tokens (example Sonnet-class numbers)

def request(cache, prompt_tokens):
    hit = cache.lookup(prompt_tokens)
    fresh = len(prompt_tokens) - hit
    written = fresh if hit == 0 else 0                       # first time: write the prefix
    cache.store(prompt_tokens)
    cost = (hit * P_CACHE_READ + (fresh - written) * P_IN + written * P_CACHE_WRITE) / 1e6
    return hit, fresh, cost

static = ["rule%d" % i for i in range(2000)]                 # 2,000-token static prefix
c = PrefixCache()
for i, q in enumerate(["q1", "q2", "q3"]):
    hit, fresh, cost = request(c, static + [f"question-{q}"] * 50)
    print(f"stable prefix  req {i + 1}: cached={hit:>5} fresh={fresh:>5} cost=${cost:.5f}")

c2 = PrefixCache()
for i in range(3):
    hit, fresh, cost = request(c2, [f"time-{i}"] + static + ["question"] * 50)   # timestamp first
    print(f"timestamp first req {i + 1}: cached={hit:>5} fresh={fresh:>5} cost=${cost:.5f}")
```

### The silent killers of cache hits

| Mistake | Why it breaks the cache | Fix |
|---|---|---|
| Timestamp, request id or user name at the top | the prefix differs every time | Move volatile data to the end |
| Re-serialising JSON with unsorted keys | same data, different bytes | Sort keys; build the string deterministically |
| Tool list in changing order | tools come first in the prefix | Fixed, sorted tool list |
| Editing the system prompt per user | a different prefix per user | Keep one shared system prompt; put per-user info later |
| Inserting or editing earlier messages | everything after the edit is invalidated | Append-only history; summarise by adding, not rewriting (or accept a miss) |
| Changing model, tools or effort settings mid-conversation | caches are model-specific and settings may be part of the prefix | Keep them stable within a conversation |
| Waiting longer than the TTL between calls | the entry expired | Use the longer TTL, or send a keep-alive if worth it |

:::tip Cache what is big and stable
A 5,000-token system prompt + tools used by every request is ideal. A 200-token prompt is not worth a breakpoint. For RAG, the retrieved chunks change per question and are not cacheable, but the instructions before them are.
:::

## The Batch API: half price for patient work

Many jobs do not need an answer in two seconds: classifying last night's tickets, summarising thousands of documents, generating evaluation data, running your **eval suite**. The **batch API** accepts up to tens of thousands of requests, runs them asynchronously (usually within an hour, at most 24 hours), and bills **50%** of the standard price.

```python local title="Submit a batch and collect results"
import time
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

batch = client.messages.batches.create(requests=[
    Request(custom_id=f"doc-{i}",
            params=MessageCreateParamsNonStreaming(
                model="claude-haiku-5-5", max_tokens=300,
                messages=[{"role": "user", "content": f"Summarise in one line: {text}"}]))
    for i, text in enumerate(documents)
])

while client.messages.batches.retrieve(batch.id).processing_status != "ended":
    time.sleep(30)

for result in client.messages.batches.results(batch.id):          # results are NOT in order: key by custom_id
    if result.result.type == "succeeded":
        print(result.custom_id, result.result.message.content[0].text)
```

Rules: results come back in **any order** (match on `custom_id`); handle `errored`, `canceled` and `expired` entries; all features (vision, tools, caching) work in batches. Batching and caching can be combined for the biggest saving on bulk jobs.

## Other caches (do not confuse them)

| Cache | What it stores | Saves | Risk |
|---|---|---|---|
| **Provider prompt cache** | internal state for a prompt *prefix* | input cost + TTFT | none for correctness |
| **Exact response cache** (you build) | final answers keyed by the exact request | the whole call | stale answers; privacy across users |
| **Semantic cache** (you build) | answers keyed by *embedding similarity* of the question | the whole call for paraphrases | **wrong hits**: "reset my password" vs "reset my pin"; set a high threshold and test |
| **Embedding cache** | vectors keyed by text hash | embedding calls | none |
| **Tool-result cache** | results of deterministic tools | tool latency | staleness |

```python run title="An exact-match response cache with TTL" level=intermediate
import hashlib, json

class ResponseCache:
    def __init__(self, ttl):
        self.ttl, self.store, self.hits, self.misses = ttl, {}, 0, 0
    def key(self, model, system, messages):
        blob = json.dumps([model, system, messages], sort_keys=True)          # deterministic serialisation
        return hashlib.sha256(blob.encode()).hexdigest()
    def get(self, k, now):
        entry = self.store.get(k)
        if entry and now - entry[1] < self.ttl:
            self.hits += 1; return entry[0]
        self.misses += 1; return None
    def put(self, k, value, now):
        self.store[k] = (value, now)

cache = ResponseCache(ttl=3600)
def answer(question, now):
    k = cache.key("model-x", "Be brief.", [{"role": "user", "content": question}])
    cached = cache.get(k, now)
    if cached: return cached + " (cached)"
    value = f"Answer to: {question}"                                         # a real call would go here
    cache.put(k, value, now); return value

for t, q in [(0, "What is RAG?"), (10, "What is RAG?"), (20, "What is RAG ?"), (4000, "What is RAG?")]:
    print(f"t={t:>4}  {answer(q, t)}")
print("hits:", cache.hits, "misses:", cache.misses)
```

## A ranked list of cost levers

Apply roughly in this order (free and safe first):

1. **Prompt caching** for stable prefixes.
2. **Trim input**: tight system prompt, fewer tools, fewer and smaller retrieved chunks, summarised history.
3. **Cap and shape output**: `max_tokens`, concise formats, no needless preamble.
4. **Batch API** for anything non-interactive.
5. **Pick the right size**: smaller model or lower effort for easy tasks; route by difficulty.
6. **Response / semantic caching** for repeated questions (carefully).
7. **Avoid unnecessary calls**: use code for what code can do; deduplicate; stop agent loops early.
8. **Fine-tune or distil** a small model for high-volume stable tasks (module 8).
9. **Self-host open models** at sustained high volume (module 9).

Measure cost **per completed task**, not per request: a cheaper request that needs more retries is not cheaper.

```quiz
? What does prompt caching require to get a hit?
- A similar-meaning prompt
+ An exactly identical prefix (byte for byte) up to the cache breakpoint
- The same user
> It is prefix matching; any change before the breakpoint invalidates the rest.

? Why put the current date and the user's question at the end of the prompt?
+ They change every request, and anything before them stays cacheable
- The model prefers it
- It reduces output length
> Volatile content must follow the stable prefix.

? What is the batch API best for?
- Real-time chat
+ Large non-urgent jobs such as classification, summarisation and running evals, at about half price
- Streaming responses
> It trades latency for cost.

? What is the main risk of a semantic response cache?
- It is slow
+ Returning a wrong answer to a question that is similar in embedding space but different in meaning
- It needs a GPU
> Use high similarity thresholds, scope by user/tenant, and evaluate hit quality.
```

:::problem Your cache read tokens are always zero even though the system prompt never changes. List the likely causes. {level=medium tags="caching,debugging"}
Think about everything that makes up the prefix.

:::solution Model answer
Check: (1) something volatile **earlier** than the breakpoint (timestamp, request id, per-user text); (2) the prefix is **below the minimum cacheable length**; (3) **non-deterministic serialisation** (unsorted JSON keys, changing whitespace) in tools or system blocks; (4) **tool list or order changes** between requests; (5) **TTL expired** between requests (low traffic); (6) the breakpoint is placed on content that **changes** (for example on the user turn); (7) different **model, effort or other parameters** per call; (8) requests routed through a proxy that rewrites the body. Diff two consecutive request bodies byte for byte.
:::
:::

:::keypoints
- Prompt caching reuses an identical prefix at a fraction of the price and with lower latency; order content stable-first, volatile-last.
- Verify with cache-read and cache-write token counts; debug misses by diffing consecutive request bodies.
- The batch API gives about 50% off for non-urgent work; match results by custom_id.
- Response and semantic caches save whole calls but risk staleness and wrong hits.
- Pull cost levers in order: cache, trim, cap output, batch, right-size, avoid calls, fine-tune, self-host; measure cost per completed task.
:::

:::resources
- [Claude docs: Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) — breakpoints, TTLs, pricing.
- [Claude docs: Batch processing](https://docs.claude.com/en/docs/build-with-claude/batch-processing) — endpoints, limits, results.
- [OpenAI: Prompt caching](https://platform.openai.com/docs/guides/latency-optimization) — the equivalent automatic caching, in the latency guide.
- [Eugene Yan: Patterns for LLM systems — caching](https://eugeneyan.com/writing/llm-patterns/) — why and how to cache.
- [vLLM: automatic prefix caching](https://docs.vllm.ai) — how self-hosted engines implement the same idea.
- [GPTCache-style semantic caching with Redis](https://redis.io/docs/latest/develop/ai/) — one popular implementation route.
:::
