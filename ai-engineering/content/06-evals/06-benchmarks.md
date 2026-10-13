---
title: Benchmarks and Leaderboards — Reading Them Critically
level: intermediate
time: 40
summary: A guide to the public benchmarks you will see in every model announcement: knowledge and reasoning (MMLU, GPQA), maths, code (HumanEval, SWE-bench), tool use, long context, preference arenas, and domain suites. How scores are produced, why they saturate, leak and mislead, how to detect contamination, how to test whether a difference is significant, and how to build an internal benchmark that actually predicts your results.
---

Every model release comes with a table of benchmark scores. They are useful for **shortlisting** and for tracking the field, and dangerous as the **basis for decisions**. This lesson teaches you to read them like an evaluator, not a fan.

## The map

| Family | What it tests | Examples | Notes |
|---|---|---|---|
| **Knowledge and reasoning (multiple choice)** | broad academic and professional knowledge | **MMLU**, MMLU-Pro, **GPQA** (graduate-level science), **Humanity's Last Exam** ([site](https://lastexam.ai)) | easy to score; saturating; sensitive to prompt format |
| **Maths** | competition and word problems | GSM8K, MATH, AIME-style sets | strong reasoning models approach ceilings on older sets |
| **Code generation** | writing functions that pass tests | HumanEval, MBPP, LiveCodeBench | small, contaminated, mostly saturated; fresh/live variants help |
| **Software engineering agents** | resolving real repository issues | **SWE-bench** ([site](https://www.swebench.com)), Verified, multilingual, live variants | scaffold matters as much as model |
| **Tool use / function calling** | choosing tools and arguments | **BFCL** ([leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)), τ-bench | closer to agent reality |
| **Long context** | retrieval and reasoning over huge inputs | needle-in-a-haystack, RULER-style suites | needles flatter models |
| **Human preference arenas** | which answer people prefer in blind chats | **LMArena** ([site](https://lmarena.ai)), MT-Bench | style bias; broad average, not your task |
| **Holistic suites** | many scenarios and metrics | **HELM** ([site](https://crfm.stanford.edu/helm/), [paper](https://arxiv.org/abs/2211.09110)) | slow-moving, transparent |
| **Embeddings / retrieval** | retrieval quality across tasks | **MTEB** ([leaderboard](https://huggingface.co/spaces/mteb/leaderboard)), BEIR | pick by language and task |
| **Safety and robustness** | refusals, jailbreaks, harmful content | HarmBench, AgentHarm, StrongREJECT | partial coverage |
| **Aggregators** | price, speed and quality side by side | [Artificial Analysis](https://artificialanalysis.ai), [Epoch AI](https://epoch.ai) | good for comparison shopping |

## Why a score is not a fact

1. **Prompting and harness details change scores**: few-shot vs zero-shot, answer extraction, system prompt, thinking budget, tool setup, number of attempts (pass@1 vs best-of-n), repeated sampling. Two reports of the "same" benchmark may not be comparable.
2. **Saturation**: when top models reach 90%+, differences shrink to noise and label errors (many benchmarks contain mislabelled or ambiguous items) become the limiting factor.
3. **Contamination (leakage)**: benchmark questions and answers appear in web-scale training data, inflating scores. Newer, held-out, or **live** benchmarks (refreshed over time) reduce this.
4. **Overfitting to the metric (Goodhart's law)**: labs optimise for popular benchmarks; "benchmark-maxxing" yields models that excel on tests and disappoint in practice.
5. **Selective reporting**: vendors choose the benchmarks and conditions that look best; independent evaluations (Artificial Analysis, LMArena, Epoch AI, HELM, Scale's SEAL) are more comparable.
6. **Construct validity**: does MMLU predict how well the model will classify your support tickets? Often only weakly.
7. **Style effects in arenas**: voters reward length, formatting and confidence; adjusted ("style-controlled") rankings exist for that reason.
8. **Statistical noise**: differences of 1–2 points on a few hundred questions are within sampling error.

## Is a difference significant? A quick test

A benchmark with *n* questions is a sample. For two models on the **same** questions, use a **paired** bootstrap (or McNemar's test) on the per-question correctness.

```python run title="Paired bootstrap: is model B really better than model A?" level=intermediate
import numpy as np

rng = np.random.default_rng(1)
n = 300
base = rng.random(n)                                   # a shared "difficulty" per question
model_a = (base < 0.62).astype(float)                  # ~62% accurate
model_b = (base + rng.normal(0, 0.05, n) < 0.65).astype(float)   # ~65%, correlated with A on the same questions

def paired_bootstrap(a, b, iters=10_000):
    idx = rng.integers(0, len(a), size=(iters, len(a)))
    diffs = (b[idx] - a[idx]).mean(axis=1)
    return diffs.mean(), np.percentile(diffs, [2.5, 97.5]), (diffs <= 0).mean()

mean, (lo, hi), p_not_better = paired_bootstrap(model_a, model_b)
print(f"A {model_a.mean():.1%}  B {model_b.mean():.1%}  difference {mean:+.1%}  95% CI [{lo:+.1%}, {hi:+.1%}]")
print(f"fraction of resamples where B is not better: {p_not_better:.1%}")
print("=> " + ("B is better with 95% confidence" if lo > 0 else "cannot claim B is better: interval includes zero"))
```

Rule of thumb: on a 100-question benchmark, a 5-point gap is often within noise. Public leaderboards that report 1-point differences between models are mostly reporting rank noise.

## Contamination: how to look for it

If a model has seen the test, scores mean little. Signals:

- **Verbatim recall**: give the model the first half of a benchmark question and see if it completes the rest verbatim.
- **Performance drop on fresh or perturbed items**: paraphrase questions or reorder options; a large drop suggests memorisation.
- **n-gram overlap** between your eval data and known training corpora (when available).
- **Time split**: evaluate on questions created **after** the model's training cutoff.

```python run title="Detect verbatim overlap between a test item and a corpus (13-gram check)" level=intermediate
import re

def ngrams(text, n=13):
    w = re.findall(r"[a-z0-9]+", text.lower())
    return {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}

corpus = ("A forum thread: someone posted the exam question verbatim: A train leaves the station at 3 pm travelling at "
          "60 km/h while a second train leaves at 4 pm travelling at 80 km/h. At what time does the second train catch the first? "
          "and the answer was 7 pm. Another unrelated paragraph about gardening and soil.")
test_items = {
    "q1 (leaked)": "A train leaves the station at 3 pm travelling at 60 km/h while a second train leaves at 4 pm travelling at 80 km/h. At what time does the second train catch the first?",
    "q2 (fresh)":  "Two cyclists start from opposite ends of a 90 km road at the same time, one at 20 km/h and the other at 25 km/h. When do they meet?",
}
corpus_grams = ngrams(corpus)
for name, q in test_items.items():
    overlap = ngrams(q) & corpus_grams
    print(f"{name:12} shares {len(overlap)} 13-grams with the corpus -> {'LIKELY CONTAMINATED' if overlap else 'no overlap found'}")
```

## Reading a model card critically

When you see a table of scores:

1. **Which exact benchmark version and settings?** (pass@1, number of shots, thinking on/off, tools allowed.)
2. **Who ran it?** Vendor, or an independent party with a public harness?
3. **Is the benchmark relevant** to what I need? (Coding agent scores for a summarisation product are mostly irrelevant.)
4. **Are the gaps larger than noise?**
5. **What is missing?** Latency, cost, long-context behaviour, tool reliability, safety, languages.
6. **Can I reproduce it** on a small sample of *my* data this afternoon? That is the real test.

## Build your own benchmark

A small internal benchmark of **real tasks with real success criteria** predicts your outcomes better than any public score.

1. Collect **50–200 representative tasks** from your product (not clever puzzles).
2. Define **scorers** (code checks, calibrated judges, human review for a sample).
3. Include **hard and adversarial** cases and your own **slices** (languages, segments).
4. Evaluate **all candidate models** with the **same prompts and tools**, 2–3 runs each, and compare with confidence intervals.
5. Add **cost, latency and reliability** (error rates, refusals) to the table.
6. **Refresh** it every few months and when you add features; version it; keep a held-out part.
7. Re-run it when a new model appears: a new release becomes a one-afternoon decision.

```python run title="A decision table: quality, cost and latency together" level=easy
candidates = {                       # (quality on YOUR eval %, $ per 1K tasks, p95 latency seconds, refusal/failure rate %)
    "model-small":  (79, 2.1, 1.1, 1.0),
    "model-medium": (91, 18.0, 2.4, 0.5),
    "model-large":  (94, 55.0, 5.8, 0.4),
}
min_quality, max_latency = 90, 4.0
print(f"{'model':14} {'quality':>8} {'$/1K':>7} {'p95 s':>6}  verdict")
for name, (q, cost, lat, fail) in candidates.items():
    ok = q >= min_quality and lat <= max_latency
    print(f"{name:14} {q:>7}% {cost:>7.1f} {lat:>6.1f}  {'candidate' if ok else 'rejected (' + ('quality' if q < min_quality else 'latency') + ')'}")
```

## A sensible stance

Use public benchmarks to **find candidates and track trends**; use your **own evals** to **decide**; and keep reading failures. When a leaderboard and your data disagree, trust your data.

```quiz
? Why can the same benchmark produce different scores in different reports?
+ Prompting, few-shot setup, answer extraction, thinking budget, tools and attempts per question all change the result
- Benchmarks are random
- Models change every minute
> Compare only like-for-like settings.

? What is benchmark contamination?
+ Test items (or their answers) appearing in a model's training data, inflating scores
- Dirty hardware
- Biased labellers
> Use fresh or held-out items to reduce it.

? Two models score 82% and 84% on a 150-question benchmark. What should you conclude?
+ Probably nothing: the gap is within sampling noise; run a paired test on more data
- The second is clearly better
- The first is clearly better
> Small differences on small sets are noise.

? What predicts your results best?
+ An internal benchmark of real tasks with real success criteria, evaluated across candidates
- The highest MMLU score
- The arena rank
> Public scores shortlist; your data decides.
```

:::problem A vendor claims their model "beats every competitor on 12 benchmarks". How do you respond? {level=medium tags="benchmarks,skepticism"}
List the checks you would make before believing the claim.

:::solution Model answer
Ask for **exact settings** (shots, thinking, tools, attempts) and whether competitors were run under the same conditions by the same harness; look for **independent replications** (Artificial Analysis, LMArena with style control, HELM). Check **margins vs noise** and sample sizes, benchmark **saturation and contamination** risk, and which benchmarks were **omitted**. Evaluate **relevance** to your tasks. Then run your own small benchmark across the candidates, including cost, latency and failure rates, with paired confidence intervals, before deciding.
:::
:::

:::keypoints
- Benchmarks cover knowledge, maths, code, agents, tool use, long context, preferences and more; use them to shortlist, not to decide.
- Scores depend on prompting, settings and attempts; they saturate, leak (contamination), get gamed, and are noisy at small sample sizes.
- Use paired bootstrap tests for differences; check contamination with overlap, fresh items and perturbations.
- Read model cards critically: exact settings, who ran it, relevance, margins vs noise, what is missing.
- Build an internal benchmark of real tasks (with cost and latency) and re-run it on every new model.
:::

:::resources
- [Artificial Analysis](https://artificialanalysis.ai) — independent quality, speed and price comparisons.
- [LMArena](https://lmarena.ai) — preference rankings; read the methodology on style control.
- [HELM](https://crfm.stanford.edu/helm/) and its [paper](https://arxiv.org/abs/2211.09110) — transparent, multi-metric evaluation.
- [SWE-bench](https://www.swebench.com), [BFCL](https://gorilla.cs.berkeley.edu/leaderboard.html), [MTEB](https://huggingface.co/spaces/mteb/leaderboard) — task-specific leaderboards.
- [Epoch AI](https://epoch.ai) — benchmark hub and trend analysis.
- [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) — reproduce standard benchmarks yourself.
:::
