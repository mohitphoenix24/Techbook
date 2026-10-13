---
title: Choosing a Model — Closed, Open, Small, Large
level: intermediate
time: 40
summary: How to pick a model for a job without chasing leaderboards. The axes that matter (capability, cost, latency, context, modality, privacy, licence), closed versus open weights, size tiers and routing, how to read benchmarks and leaderboards critically, and a repeatable selection process built on your own evals.
---

There are hundreds of models and a new one every week. The wrong question is "which model is best?" The right question is **"which model is good enough for this task at the lowest cost and latency, and how do I know?"**

:::analogy
Choosing a vehicle. A sports car is "best" on a racetrack, but if you are delivering parcels you want a van, and for a trip to the corner shop, a bicycle. Models come in tiers for the same reason: pay for the capability you need.
:::

## The axes that matter

| Axis | Question | Typical trade-off |
|---|---|---|
| **Quality** | Does it solve *my* task on *my* data? | Bigger and newer is usually better, with diminishing returns |
| **Cost** | Price per million input / output tokens, times my volume | Small models can be 10–100× cheaper |
| **Latency** | Time to first token and tokens per second | Small and non-reasoning models respond faster |
| **Context window** | How many tokens fit, and how well does it use them? | Long context costs more and can degrade attention to details |
| **Modality** | Text only, or images, audio, video, PDFs? | Some tasks need vision |
| **Tools & structure** | Reliable function calling, JSON schemas, parallel tools? | Matters enormously for agents |
| **Reasoning** | Can it think before answering, and can I control the effort? | More thinking = better on hard tasks, slower and costlier |
| **Privacy & compliance** | Where does data go? Retention? Region? Certifications? | Self-hosting gives control; managed clouds give compliance paperwork |
| **Licence & availability** | Can I use and modify it commercially? Will the API still exist next year? | Open weights reduce lock-in |
| **Reliability** | Rate limits, uptime, version stability | Pin versions, plan fallbacks |

## Closed API models vs open-weight models

| | Hosted frontier (Claude, GPT, Gemini…) | Open-weight (Llama, Qwen, DeepSeek, Mistral, Gemma…) |
|---|---|---|
| Capability at the top end | Usually the strongest | Close behind, sometimes level on narrow tasks |
| Setup effort | An API key | GPUs, serving stack, monitoring, upgrades |
| Cost model | Pay per token, scales to zero | Pay for GPUs, cheaper at **sustained high volume** |
| Customisation | Prompting, tools, sometimes managed fine-tuning | Full: fine-tune, quantize, modify, distil |
| Data control | Data leaves your boundary (contracts and regions apply) | Data stays in your network |
| Lock-in | Provider-specific features | Portable weights |
| Safety/guardrails | Built in and maintained by the provider | Yours to add |

The pragmatic default: **start with a hosted frontier model to find out what is possible, measure, then optimise** (a smaller model, a distilled model, a self-hosted open model) once you know the quality bar.

## Size tiers and how to use them

Most providers sell three tiers. Names vary; the pattern does not.

| Tier | Example (Anthropic names) | Use for | Per-token price |
|---|---|---|---|
| **Small / fast** | Haiku-class | Classification, routing, extraction, summarising, high-volume steps, sub-agents | lowest |
| **Balanced** | Sonnet-class | Most production work, coding, agents, customer-facing chat | mid |
| **Frontier / max** | Opus- and Fable-class | Hardest reasoning, long autonomous tasks, high-stakes quality | highest |

Cached example list prices from Anthropic's docs (October 2026), per million tokens input / output: Haiku 5.5 **$0.10 / $0.50**, Sonnet 5.5 **$2 / $10**, Opus 5.5 **$4 / $20**. The spread between tiers is large, which is what makes routing valuable. Treat all prices as examples and read the provider's current page.

### Model routing

:::def Model routing
Sending each request to the cheapest model that can handle it. A router can be rules (task type), a small classifier, or a cheap model that triages. A common pattern: a small model handles easy or high-volume steps; hard cases escalate to a larger model.
:::

```python run title="A routing cost simulation" level=intermediate
import numpy as np

rng = np.random.default_rng(42)
N = 10_000
difficulty = rng.beta(2, 5, size=N)                     # most requests are easy (skewed toward 0)

PRICE = {"small": 0.004, "large": 0.060}                # cost per request (example numbers)
ACCURACY = {"small": lambda d: np.clip(1.0 - 1.4 * d, 0, 1),   # small model gets worse as difficulty rises
            "large": lambda d: np.clip(1.0 - 0.3 * d, 0, 1)}

def evaluate(route):
    cost = acc = 0.0
    for d in difficulty:
        m = route(d)
        cost += PRICE[m]
        acc += ACCURACY[m](d)
    return cost, acc / N

for name, route in [("all large", lambda d: "large"),
                    ("all small", lambda d: "small"),
                    ("route at 0.3", lambda d: "small" if d < 0.3 else "large"),
                    ("route at 0.5", lambda d: "small" if d < 0.5 else "large")]:
    c, a = evaluate(route)
    print(f"{name:13} cost=${c:7.0f}   expected accuracy={a:.3f}")
```

A threshold router recovers most of the large model's accuracy at a fraction of the price. In reality you do not know the difficulty in advance; you estimate it with a classifier, a confidence score, or by letting the small model try first and escalating when a check fails. You must **evaluate** that router like any other component.

## Reading benchmarks and leaderboards

Public benchmarks are useful for a first shortlist and misleading for the final choice.

| Source | What it measures | Watch out for |
|---|---|---|
| [LMArena](https://lmarena.ai) | Human preference votes in blind chats | Style bias; not your task |
| [Artificial Analysis](https://artificialanalysis.ai) | Independent quality, speed and price comparisons | Aggregates; check the sub-scores that match you |
| [SWE-bench](https://www.swebench.com) | Fixing real GitHub issues | Coding agents only; scaffold matters as much as the model |
| [MTEB](https://huggingface.co/spaces/mteb/leaderboard) | Embedding models | Domain mismatch |
| [BFCL](https://gorilla.cs.berkeley.edu/leaderboard.html) | Function calling | Simple schemas vs your real tools |
| [HELM](https://crfm.stanford.edu/helm/) | Broad academic evaluations ([paper](https://arxiv.org/abs/2211.09110)) | Slow to update |
| [Humanity's Last Exam](https://lastexam.ai) | Very hard expert questions | Far from everyday work |

:::warn Benchmarks leak and saturate
Questions end up in training data (contamination); scores approach 100% and stop discriminating; labs tune for popular benchmarks; and vendors choose which numbers to publish. **Your own eval set beats any public leaderboard.**
:::

## A selection process that works

:::flow Pick a model
Define the task | inputs, outputs, success criteria, constraints
Build an eval set | 30–100 real examples, with expected outcomes
Shortlist 3–4 | one per tier, plus an open-weight candidate
Run the same prompt on all | measure quality, latency, cost per request
Check the failures | read them; are they fixable by prompt, tool, or retrieval?
Choose the cheapest that clears the bar | pin the version, plan a fallback
Re-run monthly | models and prices change
:::

```python run title="Compare candidates on quality, cost and latency" level=easy
candidates = [
    # name,      quality (your eval %), $ per 1K requests, p50 latency (s)
    ("small",       82,   3.0, 0.6),
    ("balanced",    93,  25.0, 1.4),
    ("frontier",    96,  60.0, 3.1),
    ("open-8B",     78,   1.2, 0.5),
]
REQUIRED_QUALITY = 90
LATENCY_BUDGET = 2.0

ok = [c for c in candidates if c[1] >= REQUIRED_QUALITY and c[3] <= LATENCY_BUDGET]
print("meets the bar:", [c[0] for c in ok])
best = min(ok, key=lambda c: c[2])
print("cheapest that qualifies:", best[0], f"(${best[2]}/1K requests)")
```

## Practical rules

1. **Abstract the provider.** Wrap model calls behind your own function so swapping models is a config change. Avoid provider-only features unless the benefit is clear.
2. **Pin exact model versions** in production and read deprecation schedules. "Latest" aliases can change behaviour overnight.
3. **Plan a fallback** for outages and rate limits, ideally a different provider or tier.
4. **Prompts are not portable by default.** A prompt tuned for one model can underperform on another; retest after every switch.
5. **Sunk-cost trap.** Last quarter's best model is probably now cheaper or beaten. Re-evaluate on a schedule.

```quiz
? You need to classify 5 million short support tickets per day. What is the sensible first move?
- Use the biggest frontier model for every ticket
+ Evaluate a small, cheap model first; escalate only the uncertain cases
- Fine-tune a model before testing anything
> High-volume simple tasks are where small tiers shine. Measure, then escalate selectively.

? Why is a public leaderboard rank insufficient to choose your production model?
+ It may not reflect your data, prompts, tools or constraints, and benchmarks can leak or saturate
- Leaderboards are always wrong
- They cost money
> Use leaderboards to shortlist; decide with your own eval set.

? What is a typical advantage of open-weight models?
- They are always more capable
+ You control data, deployment and customisation, and avoid lock-in
- They need no hardware
> The trade-off is that you operate them yourself.

? What does "pin the model version" protect against?
- Higher token prices
+ Silent behaviour changes when an alias like "latest" moves to a new model
- Network timeouts
> Pinning makes behaviour reproducible until you choose to upgrade and re-evaluate.
```

:::problem Your CEO asks "should we use the best model for everything?" Argue the cost side with numbers. {level=easy tags="models,cost"}
Assume 2M requests/month, 2,000 input and 300 output tokens each, large model $4/$20 per M tokens, small $0.10/$0.50.

:::solution Model answer
Per request, large: 2,000×$4/1M + 300×$20/1M = $0.008 + $0.006 = **$0.014** → ×2M = **$28,000/month**. Small: $0.0002 + $0.00015 = **$0.00035** → **$700/month**: 40× cheaper. If a router sends 85% of traffic to small and 15% to large, cost ≈ 0.85×$700 + 0.15×$28,000 ≈ **$4,800/month** (83% saving). The decision hinges on what quality the small model achieves on your evals and what a wrong answer costs.
:::
:::

:::keypoints
- Choose by task fit, cost, latency, context, modality, privacy and licence, not by hype.
- Start with a hosted frontier model to learn what is possible, then optimise with smaller, routed or open-weight models.
- Routing sends easy requests to cheap models; it needs its own evaluation.
- Public benchmarks shortlist; your own eval set decides. Pin versions, plan fallbacks, re-evaluate regularly.
:::

:::resources
- [Artificial Analysis](https://artificialanalysis.ai) — independent quality / speed / price comparisons.
- [LMArena](https://lmarena.ai) — crowd-sourced preference rankings.
- [Hugging Face model hub](https://huggingface.co/models) and [Open LLM discovery via the HF blog](https://huggingface.co/blog) — find and filter open models.
- [Epoch AI](https://epoch.ai) — trends in compute, data and model capabilities.
- [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685) — how arena-style evals work, and their biases.
- [HELM](https://crfm.stanford.edu/helm/) — holistic, transparent academic benchmarking.
:::
