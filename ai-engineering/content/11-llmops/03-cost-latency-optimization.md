---
title: Cost and Latency Optimization
level: advanced
time: 40
summary: A systematic way to make an LLM feature cheaper and faster without hurting quality. Measure first, then pull the levers in order of payoff and risk — prompt and context trimming, caching, model routing and cascades, output limits, batching, streaming and parallelism, speculative work, and distillation. With runnable cost-model, cascade-routing and latency-budget calculators.
---

Prototype economics lie. A feature that costs $0.02 per request looks free in a demo and becomes a six-figure line item at a million users. Latency works the same way: a 6 second answer is fine in a notebook and unacceptable in a product. **Optimisation is a discipline**: measure, find the dominant cost, pull the safest lever, and re-run evals so quality does not silently drop.

## Step 0: know where the money and time go

Per request, cost is roughly:

:::formula
cost = (uncached input tokens × input price) + (cached input tokens × cache-read price) + (output tokens × output price) + (tool and retrieval costs) + (extra calls: judges, retries, embeddings)
:::

and latency is roughly **time to first token** (network + queueing + prefill, grows with input length) plus **generation time** (output tokens × per-token time) plus **everything around the model** (retrieval, tools, guardrails, serial calls).

Instrument per **feature, route, tenant and model**: input/output tokens, cache hit rate, calls per user action, retries, p50/p95 latency by stage. Optimise what the data shows, not what feels expensive. Typical surprises: giant system prompts resent every call, agent loops with ten calls per task, retrieval stuffing 20 chunks, output verbosity, and retries.

```python run title="A cost model you can tweak: where does a request's money go?" level=intermediate
def cost(inp, out, cached=0, price_in=2.0, price_out=10.0, price_cache_read=0.2, extra_calls=0, extra_cost_each=0.0):
    """prices in dollars per million tokens"""
    fresh = inp - cached
    return (fresh * price_in + cached * price_cache_read + out * price_out) / 1e6 + extra_calls * extra_cost_each

scenarios = {
    "baseline (8K prompt, 600 out)":            dict(inp=8000, out=600),
    "+ prompt caching of a 6K static prefix":   dict(inp=8000, out=600, cached=6000),
    "+ trim retrieval 8K -> 3K":                dict(inp=3000, out=600, cached=2000),
    "+ concise answers (600 -> 250 out)":       dict(inp=3000, out=250, cached=2000),
}
base = cost(**scenarios["baseline (8K prompt, 600 out)"])
for name, kw in scenarios.items():
    c = cost(**kw)
    print(f"{name:42} ${c:.4f}/req   {c / base:5.0%} of baseline   ${c * 1_000_000:>9,.0f} per 1M requests")
print("\nnote how output tokens dominate: they cost 5x more per token and also drive latency")
```

## The levers, in the order to try them

| # | Lever | Typical effect | Risk |
|---|---|---|---|
| 1 | **Fix waste**: duplicate calls, retries, unbounded loops, oversized `max_tokens`, logging calls | big, free | none |
| 2 | **Prompt caching** of long static prefixes (system prompt, tools, documents) | up to ~90% off cached input tokens, lower TTFT | none if you structure prompts well |
| 3 | **Trim context**: fewer/better chunks, summarise history, drop unused tools | proportional to tokens removed | quality: validate with evals |
| 4 | **Limit output**: concise style instructions, structured outputs, stop sequences, sensible `max_tokens` | output is the priciest and slowest part | cutting useful content |
| 5 | **Right-size the model**: smaller model for easy steps, routing and cascades | 5-30× cheaper per call on routed traffic | misrouting hurts quality |
| 6 | **Batch API** for non-urgent work | about 50% cheaper | latency (hours) |
| 7 | **Response/semantic caching** for repeated questions | removes calls entirely | stale or wrong-user answers; privacy |
| 8 | **Parallelise** independent calls and tool steps; **stream** | lower wall-clock latency | rate limits, complexity |
| 9 | **Distil or fine-tune** a small model for a narrow high-volume task | large at scale | upfront cost, maintenance |
| 10 | **Self-host** for steady, high volume (inference module) | cost per token can fall; ops cost rises | utilisation, staffing |

Do 1 to 4 before anything clever.

### Prompt caching

Cached prefixes must be **byte-identical** and placed **first**: stable system prompt and tool definitions, then documents, then the changing user turn last. Cache reads are far cheaper than fresh input, and shorter prefill lowers latency. Track the **cache hit rate**; a timestamp or request id inside the prefix silently disables it (see the API lessons).

### Model routing and cascades

Most traffic is easy. Send it to a cheap model and **escalate only when needed**:

- **Router**: a small classifier or rules decide model per request (intent, length, user tier, risk).
- **Cascade**: try the cheap model; accept if a **verifier** (rules, schema, confidence, small judge) passes, else escalate to the strong model.
- Always **evaluate the combined system**, not each model alone, and monitor the escalation rate.

```python run title="Cascade routing: cost versus quality trade-off" level=advanced
import random
rng = random.Random(7)

def make_requests(n=20000, easy_share=0.7):
    return ["easy" if rng.random() < easy_share else "hard" for _ in range(n)]

PRICE = {"small": 0.004, "large": 0.040}                     # dollars per call
QUALITY = {("small", "easy"): 0.95, ("small", "hard"): 0.55, ("large", "easy"): 0.97, ("large", "hard"): 0.90}
VERIFIER_RECALL, VERIFIER_FALSE_ALARM = 0.80, 0.10           # verifier flags 80% of bad small answers, and 10% of good ones

def run(policy, reqs):
    cost = correct = escalated = 0
    for kind in reqs:
        if policy == "always_large":
            cost += PRICE["large"]; correct += rng.random() < QUALITY[("large", kind)]
        elif policy == "always_small":
            cost += PRICE["small"]; correct += rng.random() < QUALITY[("small", kind)]
        else:                                                  # cascade with a verifier
            cost += PRICE["small"]
            good = rng.random() < QUALITY[("small", kind)]
            flagged = (rng.random() < VERIFIER_RECALL) if not good else (rng.random() < VERIFIER_FALSE_ALARM)
            if flagged:
                escalated += 1; cost += PRICE["large"]
                correct += rng.random() < QUALITY[("large", kind)]
            else:
                correct += good
    n = len(reqs)
    return cost / n, correct / n, escalated / n

reqs = make_requests()
for policy in ("always_large", "always_small", "cascade"):
    c, q, e = run(policy, reqs)
    print(f"{policy:13} cost/req=${c:.4f}  quality={q:.1%}  escalation={e:.0%}")
print("\nthe cascade roughly matches the large model's quality at about a third of the cost (this is a toy simulation with assumed numbers); the verifier is the critical piece")
```

## Latency levers

Latency has different physics from cost:

- **TTFT** is driven by input length, queueing and network. Reduce with caching, shorter prompts, regional endpoints and warm connections.
- **Generation time** is per-token and linear in output length. Reduce with **shorter outputs**, smaller or faster models, and (self-hosted) speculative decoding.
- **Serial chains** add up. Run independent steps **in parallel** (retrieval + guardrail + classification), start work speculatively, and avoid agent loops where a fixed workflow suffices.
- **Perceived latency**: stream, show progress ("searching docs…"), and render partial results; users tolerate waiting when they see progress.
- **Reasoning effort**: extended thinking improves hard tasks but adds latency and cost. Set effort per route (low for simple, high for hard).
- **Edge tricks**: precompute answers for common questions, prefetch likely next steps, and cache embeddings and retrieval results.

```python run title="A latency budget: where do the seconds go, and what does parallelism save?" level=intermediate
stages_serial = [("auth + routing", 0.03), ("input guardrail", 0.25), ("retrieval + rerank", 0.45), ("LLM prefill (TTFT)", 0.60), ("LLM generate 300 tokens", 3.00), ("output guardrail", 0.30)]
total_serial = sum(t for _, t in stages_serial)
print("serial pipeline:")
for name, t in stages_serial: print(f"  {name:26} {t:5.2f}s")
print(f"  {'total':26} {total_serial:5.2f}s   time to first token ~ {sum(t for n, t in stages_serial[:4]):.2f}s")

# run the input guardrail and retrieval in parallel, and stream while checking output in chunks
parallel_front = max(0.25, 0.45)
ttft = 0.03 + parallel_front + 0.60
streamed_total = ttft + 3.00 + 0.05          # output guardrail runs incrementally during streaming
print(f"\nafter parallelising front-end checks and streaming: first token ~ {ttft:.2f}s, finished ~ {streamed_total:.2f}s")
shorter = 3.00 * 150 / 300
print(f"cutting the answer to 150 tokens saves another {3.00 - shorter:.2f}s of generation time")
```

## Quality guardrails for optimisation

Every cost cut is a **hypothesis about quality**. Protect yourself:

1. Keep a **regression eval set** (see the evals module) and run it for each change; compare cost, latency and quality together.
2. **Slice** results (by task type, language, customer) since averages hide losers.
3. Use **canaries** and shadow traffic to compare a cheaper path with production before switching.
4. Watch **user signals** (regenerations, thumbs-down, escalations to humans).
5. Set **budgets and alerts**: per-request token caps, per-user and per-tenant limits, daily spend alarms.

## Unit economics

Think per **successful task**, not per call: cost per resolved ticket, per qualified lead, per document processed, including retries, judge calls, human review and infrastructure. Compare against the value or the human alternative. Pricing models for your own product (seats, usage, credits) should reflect the **variable cost**, since heavy users can cost far more than light ones.

```quiz
? Which two optimisations are usually safest and should come first?
+ Eliminating waste (duplicate calls, bloated prompts) and prompt caching of stable prefixes
- Switching to a smaller model everywhere
- Removing the evals
> They reduce cost with little or no quality risk.

? Why can shortening the output be a strong lever for both cost and latency?
+ Output tokens are priced higher than input and are generated sequentially, so they dominate time
- Output tokens are free
- It makes the model smarter
> Ask for concise, structured answers where possible.

? What is the key component of a model cascade?
+ A verifier that decides whether the cheap model's answer is good enough or should escalate
- A random number generator
- A larger context window
> The verifier's recall and false-alarm rate set the cost-quality trade-off.

? How should you judge an optimisation?
+ By cost, latency and quality together on a representative eval set, sliced by segment
- By average latency only
- By how small the prompt looks
> Without evals you cannot tell a saving from a regression.
```

:::problem Your support assistant costs $0.09 per conversation and median latency is 7 s. Management wants 60% lower cost and under 3 s time-to-first-token. Lay out your plan. {level=hard tags="optimization,planning"}
Be specific about measuring, ordering and protecting quality.

:::solution Model answer
Measure first: tokens by component (system prompt, history, retrieval, output), calls per conversation, cache hit rate, retries, latency per stage. Likely wins in order: remove wasted calls and retries; **prompt caching** for the large static prefix (also cuts TTFT); **trim retrieval and history** (fewer, reranked chunks; summarise old turns); **shorter outputs** with a concise style and structured fields; **route** simple intents (FAQ, status) to a small model with a verifier and escalate hard cases; parallelise guardrails and retrieval; stream with progress indicators; use the batch API for offline analytics. Protect quality with a regression eval set (sliced by intent), shadow/canary traffic, and user-signal monitoring; set per-conversation token budgets and alerts. Report cost per resolved conversation and escalation rate, not only per-call cost.
:::
:::

:::keypoints
- Measure cost and latency per feature, stage and tenant before optimising; output tokens and wasted calls often dominate.
- Order of attack: eliminate waste, cache prefixes, trim context, limit output, route/cascade models, batch offline work, then distil or self-host.
- Cascades need a good verifier; evaluate the system end to end, including escalation rate.
- Latency: reduce TTFT (caching, short prompts), shorten outputs, parallelise independent steps, stream and show progress.
- Protect quality with regression evals, slices, canaries and user signals; track unit economics per successful task.
:::

:::resources
- [Claude docs: Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) — what to cache and how to structure prompts.
- [Claude docs: Message Batches](https://docs.claude.com/en/docs/build-with-claude/batch-processing) — asynchronous batch processing at lower cost.
- [FrugalGPT](https://arxiv.org/abs/2305.05176) — cascades and routing to cut LLM cost.
- [RouteLLM](https://arxiv.org/abs/2406.18665) — learned routing between strong and weak models.
- [Chip Huyen: Building A Generative AI Platform](https://huyenchip.com/2024/07/25/genai-platform.html) — caching, routing and gateways in one reference.
- [Hamel Husain's blog](https://hamel.dev/blog/) — practical posts on evals and production LLM work.
:::
