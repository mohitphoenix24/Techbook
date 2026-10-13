---
title: Why Evals Are the Core Skill
level: intermediate
time: 45
summary: Why measurement separates AI products that improve from ones that stall. The vibe-check trap, what an eval actually is (data, a task function, scorers, a report), the kinds of evals (deterministic, model-judged, human, online), the eval-driven development loop, and a complete minimal eval harness with bootstrap confidence intervals so you know whether a difference is real.
---

Ask any team that ships LLM products what they wish they had started earlier, and the answer is nearly always the same: **evals**. The 2026 AI-engineering job market agrees: the ability to build evaluation datasets, scoring methods and regression suites is the single most consistent differentiator between demos and products.

:::def Eval (evaluation)
A repeatable procedure that runs your AI system on a set of **inputs**, scores the **outputs** against a definition of good, and reports the results, so you can tell whether a change made the system better or worse. An eval turns "it feels better" into a number you can track, compare and automate.
:::

:::analogy
Software engineering has **tests**; manufacturing has **quality control**; medicine has **clinical trials**. An LLM system without evals is a factory without inspection: it ships, and you discover the defects from customers. Evals are your inspection line, regression suite and trial design in one.
:::

## The vibe-check trap

The natural workflow is: try a few prompts, look at the answers, tweak, repeat. It feels productive and it is a trap:

- **Anecdotes mislead**: you remember the cases you tried, not the ones you did not.
- **Fixes break other things silently**: a prompt change that repairs one case may regress ten you are not looking at.
- **You cannot compare**: is the new model better? Is the prompt rewrite worth it? No answer without data.
- **You cannot delegate or scale**: only you know what "good" means.
- **You cannot move fast safely**: every change feels risky, so you stop changing things.

A modest eval of 50–100 cases changes the dynamics: you iterate quickly because you can **see** the effect.

## What an eval consists of

```viz algo=arch title="Anatomy of an eval" dir=down
data  Dataset | inputs + expected behaviour [docs] @0,1
task  System under test | prompt, model, RAG, agent [llm] @1,1
out   Outputs + traces [list] @2,1
sc1   Code scorers | exact match, schema, tests [filter] @3,0
sc2   LLM judge | rubric-based [eval] @3,1
sc3   Human review | sampled [user] @3,2
rep   Report | scores, diffs, failures [chart] @4,1
--
data -> task
task -> out
out -> sc1
out -> sc2
out -> sc3
sc1 -> rep
sc2 -> rep
sc3 -> rep
```

1. **Dataset**: input cases, and what a good output looks like (a reference answer, properties, or a checker).
2. **Task**: a function that runs your system on one input and returns the output (and trace).
3. **Scorers**: functions that turn an output into a score (pass/fail or a number).
4. **Runner and report**: executes everything, aggregates, and lets you drill into failures.

## Kinds of evals

| Kind | How it scores | Strength | Weakness | Use for |
|---|---|---|---|---|
| **Deterministic / code-based** | exact match, regex, schema validity, unit tests, numeric tolerance | cheap, fast, objective, repeatable | only works where "correct" is checkable | structured output, classification, code, tool-call correctness |
| **LLM-as-judge** | a model grades against a rubric | scales to open-ended output | judge bias, cost, needs calibration | helpfulness, tone, faithfulness, summaries |
| **Human review** | people label or rank | the gold standard | slow, costly, inconsistent | calibrating judges, hard or high-stakes cases, ground truth |
| **Online / production** | real user behaviour (thumbs, edits, conversions), sampled judging | reflects reality | delayed, noisy, privacy-sensitive | monitoring, A/B tests (lesson 8) |
| **Adversarial / red-team** | attack prompts and edge cases | finds safety and robustness gaps | needs creativity | security and safety (module 7) |

The rule of thumb: use the **cheapest scorer that captures what matters**, and validate any model-judged scorer against human labels.

## Eval-driven development

:::flow The loop
Look at real data | read traces; list how it fails
Write evals for those failures | each failure type → test cases + a scorer
Change one thing | prompt, retrieval, model, tool, data
Run the evals | compare with the baseline, per slice
Decide | ship, iterate, or revert
Add new failures | production incidents become permanent tests
:::

Three principles:

1. **Start from errors, not from metrics.** Read 50–100 real outputs, write down what is wrong, and design evals for those failure modes (next lesson). Generic metrics ("helpfulness 4.2") often miss what actually hurts users.
2. **Evals are product requirements.** Defining "good" forces clarity that prompts alone never do.
3. **Evals are a living asset.** The dataset grows with every bug, and the suite runs on every change.

## A complete minimal eval harness

Everything above in a page of code. The "system" is a stand-in classifier whose behaviour changes between two prompt versions.

```python run title="A minimal eval harness: dataset, task, scorers, report" level=intermediate
import json, random

# ---- 1) dataset: inputs and expected behaviour ----
DATASET = [
    {"id": "t1", "input": "I was charged twice this month",        "expected": "billing", "slice": "billing"},
    {"id": "t2", "input": "refund for the broken blender",         "expected": "billing", "slice": "billing"},
    {"id": "t3", "input": "app crashes when I open settings",      "expected": "bug",     "slice": "bug"},
    {"id": "t4", "input": "button does nothing on safari",         "expected": "bug",     "slice": "bug"},
    {"id": "t5", "input": "please add dark mode",                  "expected": "feature", "slice": "feature"},
    {"id": "t6", "input": "can you support CSV export?",           "expected": "feature", "slice": "feature"},
    {"id": "t7", "input": "hello, are you open today?",            "expected": "other",   "slice": "other"},
    {"id": "t8", "input": "my invoice shows the wrong VAT number", "expected": "billing", "slice": "billing"},
]

# ---- 2) the system under test (two prompt versions, simulated) ----
def system_v1(text):
    t = text.lower()
    if "charged" in t or "refund" in t: return "billing"
    if "crash" in t: return "bug"
    if "add" in t: return "feature"
    return "other"

def system_v2(text):
    t = text.lower()
    if any(w in t for w in ("charged", "refund", "invoice", "vat")): return "billing"
    if any(w in t for w in ("crash", "does nothing", "error")): return "bug"
    if any(w in t for w in ("add", "support", "feature")): return "feature"
    return "other"

# ---- 3) scorers ----
def exact_match(output, case): return 1.0 if output == case["expected"] else 0.0

# ---- 4) runner + report ----
def run_eval(system, dataset, scorer):
    rows = [{**c, "output": system(c["input"]), } for c in dataset]
    for r in rows: r["score"] = scorer(r["output"], r)
    return rows

def report(name, rows):
    acc = sum(r["score"] for r in rows) / len(rows)
    by_slice = {}
    for r in rows: by_slice.setdefault(r["slice"], []).append(r["score"])
    print(f"{name}: accuracy {acc:.0%}   " + "  ".join(f"{s}={sum(v) / len(v):.0%}" for s, v in by_slice.items()))
    for r in rows:
        if r["score"] < 1: print(f"   ✗ {r['id']}: {r['input']!r} -> {r['output']!r} (expected {r['expected']!r})")

r1, r2 = run_eval(system_v1, DATASET, exact_match), run_eval(system_v2, DATASET, exact_match)
report("v1", r1); report("v2", r2)
changed = [(a["id"], a["score"], b["score"]) for a, b in zip(r1, r2) if a["score"] != b["score"]]
print("cases that changed:", changed)
```

Note the **slice breakdown** (per category) and the **diff of changed cases**: an equal average can hide a swap of failures, and an improvement in one slice can hide a regression in another.

## Is the difference real? Confidence intervals

With 8 cases, "v2 beats v1 by 25%" means little. Eval sets are **samples**, and small samples are noisy. Use a **bootstrap** (resample the cases with replacement, many times) to get a confidence interval for the metric or for the *difference between two systems on the same cases*.

```python run title="Bootstrap: is v2 really better than v1?" level=advanced
import numpy as np

rng = np.random.default_rng(0)
# per-case scores (1 = correct) for two systems evaluated on the SAME 40 cases
v1 = np.array([1] * 26 + [0] * 14)
v2 = np.array([1] * 30 + [0] * 10)
rng.shuffle(v1); rng.shuffle(v2)

def bootstrap_diff(a, b, n=10_000):
    idx = rng.integers(0, len(a), size=(n, len(a)))          # resample case indices (paired!)
    diffs = b[idx].mean(axis=1) - a[idx].mean(axis=1)
    return diffs.mean(), np.percentile(diffs, [2.5, 97.5])

mean, (lo, hi) = bootstrap_diff(v1, v2)
print(f"v1 accuracy {v1.mean():.0%}, v2 accuracy {v2.mean():.0%}")
print(f"difference {mean:+.1%}, 95% interval [{lo:+.1%}, {hi:+.1%}]")
print("verdict:", "v2 is better (interval excludes 0)" if lo > 0 else "inconclusive: the interval includes 0; collect more cases")

# how many cases would you need to see a 10-point gain reliably?
for n in (40, 100, 400):
    a, b = rng.random(n) < 0.65, rng.random(n) < 0.75
    m, (lo, hi) = bootstrap_diff(a.astype(float), b.astype(float), 3000)
    print(f"n={n:>3}: observed gain {m:+.1%}  interval [{lo:+.1%}, {hi:+.1%}]")
```

The lesson: **small evals can only detect large effects.** Use bigger or paired datasets for fine comparisons, run non-deterministic systems multiple times, and report intervals, not just point estimates.

## Common mistakes

| Mistake | Consequence | Better |
|---|---|---|
| Evaluating only the final answer | cannot tell where failures start | evaluate components and the end-to-end |
| One aggregate score | hides regressions in important slices | slice by category, difficulty, user type |
| Test set = examples you tuned on | overfitting; false confidence | keep a held-out test split |
| Only easy synthetic cases | scores near 100%, real failures unseen | include real, hard, adversarial cases |
| Trusting an uncalibrated LLM judge | systematically wrong scores | validate against human labels |
| Running once on a non-deterministic system | noise looks like signal | multiple runs; intervals |
| Evals that nobody runs | stale | automate in CI (lesson 9) |
| Optimising the metric blindly | Goodhart's law: the metric stops measuring what you care about | keep a human-reviewed sample and re-read failures |

## How much is enough to start?

Start tiny: **20–50 representative cases** and one or two scorers beats a perfect plan with no eval. Grow it with every failure. A few hundred well-chosen cases usually support most decisions; thousands matter for fine comparisons, many slices, or safety-critical systems.

```quiz
? What is the main problem with vibe-checking a few prompts?
- It is too slow
+ Anecdotes mislead, fixes silently regress other cases, and you cannot compare versions or delegate
- Models dislike it
> A fixed dataset with scorers lets you see the effect of every change.

? Why report results by slice as well as overall?
+ An unchanged average can hide an improvement in one category and a regression in another
- Slices are required by frameworks
- It is shorter
> Slice-level views show where changes help or hurt.

? A new prompt scores 75% vs 65% on 40 cases and the bootstrap interval for the difference is [-4%, +24%]. What do you conclude?
- v2 is definitely better
+ The result is inconclusive; you need more cases or a larger effect
- v2 is worse
> The interval includes zero.

? Where should eval cases come from first?
+ Real user inputs and observed failures
- Only synthetic data
- The model's favourite examples
> Evals start from errors and real distributions.
```

:::problem Your team ships prompt changes after "trying it on ten examples". Propose a minimal evaluation process. {level=easy tags="evals,process"}
Be concrete and low-friction.

:::solution Model answer
Create a shared file of **50 real inputs** (from logs) with expected behaviour labels, split 40/10 into dev and test. Write a script that runs the system and scores with simple code scorers (exact match, schema validity) plus one calibrated LLM judge for tone. Print overall and per-category scores plus the list of **cases that changed** versus the last run. Require the report in each prompt-change PR, add every new bug as a case, and re-run on the held-out test set before releases. Add confidence intervals once the set grows.
:::
:::

:::keypoints
- An eval = dataset + task + scorers + report; it replaces vibe-checks with comparable numbers.
- Kinds: deterministic, LLM-judged, human, online, adversarial; use the cheapest scorer that captures what matters and calibrate judges.
- Eval-driven development: read data, write evals for observed failures, change one thing, run, decide, add new failures.
- Report by slice, diff changed cases, and use bootstrap intervals; small sets only detect large effects.
- Start with 20–50 real cases and grow the set with every failure; keep a held-out test split.
:::

:::resources
- [Hamel Husain: Your AI product needs evals](https://hamel.dev/blog/posts/evals/) — the classic argument, with a practical workflow.
- [Hamel Husain: Evals FAQ](https://hamel.dev/blog/posts/evals-faq/) — answers to the questions teams actually ask.
- [Hamel Husain: A field guide to rapidly improving AI products](https://hamel.dev/blog/posts/field-guide/) — error analysis first.
- [Eugene Yan: Patterns for Building LLM-based Systems & Products](https://eugeneyan.com/writing/llm-patterns/) — the evals section.
- [Anthropic docs: Define success criteria and build evaluations](https://docs.claude.com/en/docs/test-and-evaluate/develop-tests) — guidance and code.
- [OpenAI: Evals guide](https://platform.openai.com/docs/guides/evals) — platform tooling for datasets and graders.
- [Inspect AI](https://inspect.aisi.org.uk/) and [promptfoo](https://www.promptfoo.dev/docs/intro) — open-source eval frameworks.
:::
