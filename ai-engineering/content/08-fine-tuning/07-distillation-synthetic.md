---
title: Distillation and Synthetic Data Pipelines
level: advanced
time: 45
summary: Teaching a small model with a big one. Knowledge distillation (soft targets and temperature), sequence-level and on-policy distillation, rejection sampling, building synthetic data pipelines (seed → generate → verify → filter → diversify), model-collapse risks, evaluation, and the licensing and legal aspects of using model outputs for training. With runnable logit distillation and a filtered synthetic-data pipeline.
---

The most economical way to get a capable small model is often to **learn from a larger one**. Distillation underlies many of the small, fast models you use daily, and the same idea lets you turn an expensive frontier-model workflow into a cheap specialist.

:::def Distillation
Training a **student** model to imitate a **teacher** model's behaviour. The teacher can supply **soft targets** (full probability distributions over tokens), **generated outputs** (text that the student is fine-tuned on), or **rewards/judgements**. Introduced for neural networks by [Hinton et al.](https://arxiv.org/abs/1503.02531).
:::

## Why it works

A teacher's output distribution carries **dark knowledge**: not just "the answer is 3", but "it is probably 3, maybe 8, almost never 7": information about similarity between classes and plausible alternatives. Learning from that richer signal is more sample-efficient than learning from hard labels alone. With text generation, a teacher's **reasoning traces and well-formed answers** also provide demonstrations the student could not easily produce itself.

## Three flavours

| Flavour | Signal | Requires | Use |
|---|---|---|---|
| **Logit (soft-target) distillation** | match the teacher's per-token probability distribution (KL divergence) | access to teacher logits and a shared tokenizer | model compression with open teachers |
| **Sequence-level / data distillation** | fine-tune on the teacher's **generated text** (SFT) | only API access to outputs | the common route with closed teachers (subject to terms of use) |
| **On-policy distillation** | the student generates, the teacher scores or corrects the student's own outputs | teacher judgement per sample | reduces the train-test mismatch; strong results |
| **Reward / judge distillation** | teacher-based rewards for RL or preference data | verifier or judge | steer behaviour |

### Soft targets and temperature

Softening the teacher's distribution with a **temperature** `T > 1` exposes the "dark knowledge" in the non-top classes. The student matches those softened probabilities.

```python run title="Logit distillation: the student learns from soft targets" level=advanced
import numpy as np

rng = np.random.default_rng(0)
K, D, N = 5, 12, 400                                   # classes, input dim, training examples

def softmax(z, T=1.0):
    z = z / T; z = z - z.max(axis=-1, keepdims=True); e = np.exp(z); return e / e.sum(axis=-1, keepdims=True)

# a "teacher": a fixed linear model that produces rich distributions (classes 0/1 and 2/3 are similar)
Wt = rng.normal(size=(D, K)); Wt[:, 1] = Wt[:, 0] + 0.3 * rng.normal(size=D); Wt[:, 3] = Wt[:, 2] + 0.3 * rng.normal(size=D)
X = rng.normal(size=(N, D)); Xte = rng.normal(size=(2000, D))
teacher_logits = X @ Wt; teacher_te = np.argmax(Xte @ Wt, axis=1)

def train_student(targets, T, steps=600, lr=0.3, n=N):
    W = np.zeros((D, K))
    for _ in range(steps):
        p = softmax(X[:n] @ W, T)
        W -= lr * X[:n].T @ (p - targets[:n]) / n * (1.0)          # gradient of cross-entropy w.r.t. logits is (p - target)
    return W

hard = np.eye(K)[np.argmax(teacher_logits, axis=1)]                 # hard labels only
for T in (1.0, 3.0):
    soft = softmax(teacher_logits, T)
    W = train_student(soft, T, n=60)                                # only 60 examples!
    acc = np.mean(np.argmax(Xte @ W, axis=1) == teacher_te)
    print(f"student trained on SOFT targets (T={T}) with 60 examples: agrees with the teacher on {acc:.0%} of new inputs")
W = train_student(hard, 1.0, n=60)
print(f"student trained on HARD labels with 60 examples        : agrees with the teacher on {np.mean(np.argmax(Xte @ W, axis=1) == teacher_te):.0%}")
```

With few examples the soft targets typically give the student a better match to the teacher than hard labels do, because each example conveys more information.

## Sequence-level distillation (the practical route)

When you can only call the teacher through an API:

1. **Collect prompts** that represent your task (real inputs from logs, public datasets, or synthetic).
2. **Generate outputs** from the strong teacher with a **carefully engineered prompt** (the teacher may use long instructions, tools, retrieval and reasoning that the student will not have).
3. **Filter**: validators, judges, execution checks, humans on a sample.
4. **Fine-tune the student** on (prompt → teacher output) with a **short, clean prompt**, so behaviour moves into the weights (and the long prompt disappears).
5. **Evaluate** the student against the teacher and the baseline.

This "teacher with an elaborate pipeline → student with a plain prompt" pattern converts an expensive **agentic or prompt-engineered system into a cheap model**, as long as the task is narrow and stable enough.

### Rejection sampling

Sample **n** outputs from the teacher (or the student), score them with a verifier or reward model, **keep the best** (or those above a threshold). Fine-tune on the survivors. It is "best-of-n baked into the weights" and a core ingredient of reasoning-model recipes.

## A synthetic data pipeline

```python run title="Seed → generate → verify → filter → dedupe, with a yield report" level=intermediate
import random, re
from collections import Counter

random.seed(0)

# 1) SEEDS: hand-written examples define the target style (a real pipeline gives these to an LLM as few-shot context)
SEEDS = [("Convert 3 km to miles", "3 km is about 1.86 miles.")]

# 2) GENERATE: stand-in for a teacher LLM producing candidate (question, answer) pairs, some of them flawed
def teacher_generate(n):
    out = []
    for _ in range(n):
        km = random.choice([1, 2, 5, 10, 21, 42])
        correct = round(km * 0.621371, 2)
        mode = random.random()
        ans = (f"{km} km is about {correct} miles." if mode < 0.7 else
               f"{km} km is about {round(correct * 1.5, 2)} miles." if mode < 0.85 else          # wrong number
               f"Sure! Great question! {km} km is about {correct} miles. Hope that helps!")       # chatty filler
        out.append((f"Convert {km} km to miles", ans))
    return out

# 3) VERIFY with code where possible (here: recompute the answer), 4) FILTER style, 5) DEDUPE
def verify(q, a):
    km = float(re.search(r"Convert ([\d.]+) km", q).group(1))
    nums = [float(x) for x in re.findall(r"about ([\d.]+) miles", a)]
    return bool(nums) and abs(nums[0] - km * 0.621371) < 0.01

def style_ok(a): return a.count("!") == 0 and len(a.split()) <= 12

candidates = teacher_generate(60)
stats = Counter()
kept, seen = [], set()
for q, a in candidates:
    if not verify(q, a):      stats["rejected: wrong answer"] += 1; continue
    if not style_ok(a):       stats["rejected: style"] += 1; continue
    if q in seen:             stats["rejected: duplicate prompt"] += 1; continue
    seen.add(q); kept.append((q, a)); stats["kept"] += 1

print(f"{len(candidates)} candidates -> {len(kept)} kept")
for k, v in stats.most_common(): print(f"  {k:28} {v}")
print("sample kept:", kept[:2])
```

The report is as important as the data: **yield per stage** tells you where the teacher or prompt is weak. Note that only 6 distinct prompts exist here, so the deduped set is tiny: real pipelines must generate **diverse** prompts (the dimension-sampling approach from the data lesson).

### Making synthetic data diverse

- Sample **topics, personas, difficulty, formats and edge cases** as explicit dimensions.
- Ask the teacher to **generate the prompts** as well as answers; **seed with real examples** to stay realistic.
- **Evolve** prompts (Evol-Instruct style): make them harder, add constraints, combine topics.
- Use **embedding-based dedup/clustering** to cap near-duplicates and balance clusters.
- Use **multiple teachers** to avoid inheriting one model's quirks.

## Risks

| Risk | Detail | Mitigation |
|---|---|---|
| **Inherited errors and biases** | the student learns the teacher's mistakes confidently | verify against ground truth; human review; ensembles |
| **Mode collapse / homogenisation** | repeated training on model outputs narrows diversity ("model collapse") | mix real data; dimension sampling; dedupe |
| **Capability ceiling** | the student rarely exceeds the teacher on the same distribution | combine with verifiers and RL |
| **Style leakage** | the student mimics the teacher's tics, hedging and signature phrasing | filter filler; style guidelines |
| **Evaluation circularity** | judging a student with its teacher | independent judges and ground truth |
| **Licence and terms-of-use** | many providers restrict using their outputs to train competing models; open-weight licences vary | read the terms; use permissive teachers (or your own) |
| **Privacy** | teacher prompts may contain personal data | scrub prompts and outputs |

**Check the legal side before you start**: provider terms, dataset licences, and your own contracts determine whether distilling from a given model is allowed.

## Distillation for reasoning

Reasoning ability transfers well through **trace distillation**: fine-tune a small model on a strong reasoning model's chains of thought (filtered for correctness). The R1 report found this more effective than RL on the small model alone; small "distilled reasoners" now rival much larger non-reasoning models on maths and code.

## Evaluating a distilled model

1. **Task metrics** versus teacher and a prompted baseline.
2. **Agreement analysis**: where does the student disagree with the teacher, and who is right?
3. **Robustness** on inputs unlike the training distribution (the student's weak spot).
4. **Cost and latency gains** (the reason you did this).
5. **Safety and regression suites.**
6. **Calibration and refusal behaviour**, which often degrade.

```quiz
? What is "dark knowledge" in distillation?
+ The information in a teacher's full output distribution about which wrong answers are plausible and which classes are similar
- Hidden training data
- A secret prompt
> Soft targets carry more signal per example than hard labels.

? How do you distill from an API-only teacher?
+ Generate and filter its outputs for your prompts, then fine-tune the student on them (sequence-level distillation), respecting the terms of use
- Download its logits
- It is impossible
> Only outputs are available; check licences.

? What is rejection sampling in this context?
+ Sample several outputs, keep those that pass a verifier or score highest, and train on them
- Rejecting API requests
- Throwing away the dataset
> Best-of-n baked into the training data.

? Why mix real data into synthetic datasets?
+ To avoid homogenisation and compounding errors (model collapse) and to anchor the student in real distributions
- Real data is cheaper
- To increase the file size
> Diversity and ground truth keep quality up.
```

:::problem Your frontier-model agent solves a task well but costs $0.40 per run. Plan a distillation to a small model. {level=hard tags="distillation,cost"}
Describe data, filtering, training and evaluation.

:::solution Model answer
Log thousands of **successful** agent trajectories (inputs, tool calls, final outputs) for the narrow task; **filter** to verified-correct runs (outcome checks, tests) and remove PII. Choose the student's interface: either **end-to-end** (input → final answer) or **tool-calling** (train on the tool-call sequences). Convert to chat-format SFT examples with a **short system prompt**; add hard and failure-recovery cases (including teacher-corrected ones). Train a LoRA on a 3–8B model; hold out a time-split set. **Evaluate** outcome success versus teacher, per slice, plus cost/latency and safety. Deploy behind routing: the student handles easy/typical cases, the teacher handles low-confidence or failed ones; keep logging to refresh the dataset. Check the teacher's terms of use first.
:::
:::

:::keypoints
- Distillation transfers a teacher's behaviour to a cheaper student via soft targets, generated data, on-policy feedback or rewards.
- API-only route: engineer the teacher pipeline, generate, verify and filter, then SFT the student with a short prompt (rejection sampling keeps only good outputs).
- Synthetic pipelines: seeds → diverse prompts → generation → verification → style filters → dedupe, with a yield report per stage.
- Risks: inherited errors, homogenisation/collapse, ceilings, style leakage, circular evaluation, licence terms and privacy.
- Reasoning traces distil well; evaluate the student against teacher and baseline on quality, robustness, safety, cost and latency.
:::

:::resources
- [Distilling the Knowledge in a Neural Network](https://arxiv.org/abs/1503.02531) — the original paper.
- [Self-Instruct](https://arxiv.org/abs/2212.10560) and [Textbooks Are All You Need](https://arxiv.org/abs/2306.11644) — synthetic-data milestones.
- [DeepSeek-R1](https://arxiv.org/abs/2501.12948) — distilling reasoning traces into small models.
- [Tulu 3](https://arxiv.org/abs/2411.15124) — synthetic data, decontamination and mixes in an open recipe.
- [Hugging Face TRL docs](https://huggingface.co/docs/trl) — trainers for SFT, distillation-style objectives and RL.
- [Maxime Labonne: LLM course](https://github.com/mlabonne/llm-course) — synthetic-data generation and fine-tuning notebooks.
:::
