---
title: LLM-as-a-Judge — Powerful, Biased, and Worth Calibrating
level: advanced
time: 55
summary: When code cannot score an output, a model can. Pointwise, pairwise and reference-based judging, designing rubrics and prompts that produce reliable verdicts, the known biases (position, verbosity, self-preference), measuring agreement with humans (accuracy and Cohen's kappa), correcting for judge error, ensembles and cost control. With runnable bias tests and a kappa calculation.
---

"Is this summary faithful?" "Is the tone appropriate for an upset customer?" "Which of these two answers is better?" There is no regex for these. **LLM-as-a-judge** uses a model to grade another model's output against criteria. Done carefully it scales human judgement cheaply; done carelessly it produces authoritative-looking nonsense. The method is established ([Zheng et al., MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685)): strong judges agree with humans about as often as humans agree with each other, **with systematic biases you must manage**.

## Three judging formats

| Format | Question | Pros | Cons |
|---|---|---|---|
| **Pointwise** (single output) | "Does this response meet criterion X? yes/no" or a score | simple, parallel, good for monitoring | scores drift and are poorly calibrated; scales invite noise |
| **Pairwise** (A vs B) | "Which response is better for criterion X?" | humans and models are better at comparing than at absolute scoring | O(n²) pairs; position bias; only gives relative ranks |
| **Reference-based** | "Does the response agree with the reference answer?" | far more reliable (the judge compares rather than invents truth) | needs references |

Practical guidance: prefer **binary, criterion-specific pointwise** judgements ("Did the response state the 30-day return window? yes/no") for regression tests; use **pairwise** when comparing two systems on open-ended quality; use **reference-based** whenever you have references.

## Designing the judge prompt

Treat the judge as a small, carefully specified classifier.

```text
You are evaluating a customer-support reply.

<question>{question}</question>
<policy_excerpt>{policy}</policy_excerpt>
<reply>{reply}</reply>

Criterion: FAITHFULNESS. The reply must not state any refund rule, deadline or amount that is not in the policy excerpt.

First, list each factual claim in the reply and say whether the policy excerpt supports it.
Then give a verdict: PASS if every claim is supported, otherwise FAIL.

Return JSON: {"claims": [{"claim": "...", "supported": true/false}], "verdict": "PASS" | "FAIL"}
```

Principles:

1. **One criterion per judge.** "Rate overall quality 1–10" mixes accuracy, tone, length and style, and is noisy. Use separate judges.
2. **Binary or 3-point scales** with defined anchors beat 1–10 scales.
3. **Define the criterion precisely** and include **examples** of pass and fail (few-shot). Add the rule for edge cases.
4. **Ask for reasoning first, then the verdict.** Reasoning improves accuracy and gives you an audit trail. (Put the reasoning field before the verdict in a structured output.)
5. **Give the judge the context it needs**: the question, the source documents, the reference, the rubric.
6. **Use structured output** to parse the verdict reliably.
7. **Use a strong model** for judging (often stronger than the one being judged, or at least a different one), and **pin its version**.
8. **Temperature/determinism**: where possible, use settings that reduce variance, and repeat borderline cases.

```python local title="A judge call with structured output (Claude)"
from pydantic import BaseModel
from typing import List, Literal

class Claim(BaseModel):
    claim: str
    supported: bool

class Verdict(BaseModel):
    claims: List[Claim]                       # reasoning first...
    verdict: Literal["PASS", "FAIL"]          # ...then the decision

def judge_faithfulness(question, policy, reply):
    r = client.messages.parse(
        model="claude-sonnet-5-5", max_tokens=1500,
        system="You are a strict grader. Judge only against the provided policy excerpt.",
        messages=[{"role": "user", "content": f"<question>{question}</question>\n<policy_excerpt>{policy}</policy_excerpt>\n<reply>{reply}</reply>\n\n"
                   "List each factual claim in the reply and whether the policy supports it. Verdict PASS only if every claim is supported."}],
        output_format=Verdict,
    )
    return r.parsed_output
```

## Known biases

| Bias | What happens | Mitigation |
|---|---|---|
| **Position bias** | in pairwise judging, the model prefers the answer in a given slot (often the first) | run both orders (A,B) and (B,A); count a win only if consistent, otherwise tie |
| **Verbosity bias** | longer answers look better | control for length; instruct "do not reward length"; compare length-matched; check correlation of scores with length |
| **Self-preference** | models favour outputs resembling their own style | use a different model family as judge; do not judge a model with itself when ranking |
| **Authority / formatting bias** | confident tone, markdown, citations score higher regardless of truth | rubric focused on verifiable claims; give evidence |
| **Sycophancy** | the judge agrees with a persuasive but wrong answer or a stated opinion | blind the judge to who/what produced it; no hints about the "expected" verdict |
| **Leniency / harshness drift** | scores shift with prompt wording or model update | calibrate against fixed human-labelled anchors; pin versions |
| **Limited reasoning** | the judge cannot verify hard facts, maths or code | use executable checks, references or tools for those |

```python run title="Measure position bias in a pairwise judge" level=intermediate
import numpy as np

rng = np.random.default_rng(0)

def biased_judge(quality_a, quality_b, position_bias=0.25, noise=0.15):
    """Returns 'A' or 'B'. The judge adds a bonus to whatever is shown FIRST (slot A)."""
    score_a = quality_a + position_bias + rng.normal(0, noise)
    score_b = quality_b + rng.normal(0, noise)
    return "A" if score_a > score_b else "B"

def evaluate_pair(q1, q2, bias):
    first = biased_judge(q1, q2, bias)          # system 1 in slot A
    second = biased_judge(q2, q1, bias)         # system 2 in slot A (order swapped)
    win1 = (first == "A") + (second == "B")     # system 1 wins when it is A in round one and B in round two
    return win1                                 # 2 = consistent win, 1 = inconsistent (tie), 0 = consistent loss

N = 2000
q_good, q_bad = 0.60, 0.50                      # system 1 is genuinely (slightly) better
for bias in (0.0, 0.25):
    results = [evaluate_pair(q_good, q_bad, bias) for _ in range(N)]
    single_order = np.mean([biased_judge(q_bad, q_good, bias) == "B" for _ in range(N)])   # naive: always put the better one second
    print(f"position bias {bias:.2f}: naive single-order says system 1 wins {single_order:.0%}; "
          f"both-orders: consistent wins {np.mean([r == 2 for r in results]):.0%}, ties {np.mean([r == 1 for r in results]):.0%}, "
          f"consistent losses {np.mean([r == 0 for r in results]):.0%}")
```

With bias, **a single-order test can understate or invert real differences** (the better system looks worse if it always sits in the disadvantaged slot). Evaluating both orders and treating inconsistency as a tie removes most of the effect.

## Calibrate the judge against humans

An unvalidated judge is an opinion. Calibrate:

1. Sample **50–200** outputs (include hard and borderline cases).
2. Have **humans** (ideally domain experts) label them with the same rubric.
3. Run the judge and compute **agreement**: raw accuracy, plus a chance-corrected measure such as **Cohen's kappa**, and, for the "bad" class, **precision and recall** (what you catch, and what you falsely flag).
4. **Read the disagreements.** Fix the rubric or add examples; iterate until agreement is acceptable, then freeze the judge prompt and version.
5. **Re-check** periodically and whenever the judge model, rubric or data distribution changes.

:::formula Cohen's kappa
\kappa = \frac{p_o - p_e}{1 - p_e}
:::

`p_o` is the observed agreement; `p_e` is the agreement expected by chance. Rough guide: below 0.4 weak, 0.4–0.6 moderate, 0.6–0.8 substantial, above 0.8 near-perfect.

```python run title="Judge vs human agreement: accuracy, kappa, precision and recall" level=intermediate
import numpy as np

def cohens_kappa(a, b):
    a, b = np.asarray(a), np.asarray(b)
    labels = np.unique(np.concatenate([a, b]))
    po = np.mean(a == b)
    pe = sum(np.mean(a == l) * np.mean(b == l) for l in labels)
    return (po - pe) / (1 - pe)

# 40 outputs labelled by a human and by the judge (1 = FAIL / bad output, 0 = PASS)
human = np.array([1] * 10 + [0] * 30)
judge = np.array([1] * 8 + [0] * 2 + [1] * 5 + [0] * 25)          # judge misses 2 bad ones, falsely flags 5 good ones

acc = np.mean(human == judge)
tp = np.sum((human == 1) & (judge == 1)); fp = np.sum((human == 0) & (judge == 1)); fn = np.sum((human == 1) & (judge == 0))
print(f"raw agreement {acc:.0%}  kappa {cohens_kappa(human, judge):.2f}")
print(f"on the FAIL class: precision {tp / (tp + fp):.0%}, recall {tp / (tp + fn):.0%}")
print("accuracy alone is flattering because most outputs are good; kappa and per-class metrics are more honest")
```

## Correcting for judge error

If a judge has known precision/recall, raw "failure rates" are biased. With a small human-labelled sample you can estimate the judge's **sensitivity and specificity**, then correct the aggregate:

```python run title="Estimate the true failure rate from a noisy judge" level=advanced
# the judge flags 18% of production outputs as failures. How many truly fail?
judge_flag_rate = 0.18
sensitivity = 0.85      # P(judge flags | truly bad)   (from a human-labelled calibration set)
specificity = 0.90      # P(judge passes | truly good)

# flag_rate = sens * p + (1 - spec) * (1 - p)   =>   p = (flag_rate - (1 - spec)) / (sens - (1 - spec))
p_true = (judge_flag_rate - (1 - specificity)) / (sensitivity - (1 - specificity))
print(f"estimated true failure rate: {p_true:.1%}  (naively reading the judge: {judge_flag_rate:.0%})")
```

(Report uncertainty too: with small calibration sets the intervals are wide.)

## Ensembles and cost control

- **Multiple judges or prompts** (different models, different wording) and **majority vote** reduce variance and single-model bias.
- **Cascade**: a cheap judge screens; a strong judge reviews only borderline cases.
- **Sample** production traffic for judging rather than scoring everything.
- **Batch API** and **prompt caching** (the rubric and examples are a static prefix) cut judge costs substantially.
- Judges need not be huge: small fine-tuned judges can be cheap and consistent for narrow criteria.

## What judges should not do

- Judge **facts they cannot verify** without evidence: supply sources, or use tools/code.
- Be the **only** evaluation for high-stakes systems.
- Score **their own** outputs when ranking models.
- Replace **human review** entirely: keep a standing human-labelled sample.

```quiz
? Why run a pairwise judge in both orders?
+ To cancel position bias: count a win only when the verdict is consistent across orders
- To double the sample size
- Because judges are deterministic
> Inconsistent verdicts indicate a tie or noise.

? Why ask the judge to give reasoning before the verdict?
+ It improves accuracy and gives an audit trail you can inspect
- It lowers cost
- It removes bias
> Reasoning first, decision second.

? What does Cohen's kappa add over raw agreement?
+ It corrects for the agreement expected by chance, which matters when one label dominates
- It measures speed
- It replaces human labelling
> Raw agreement can be high just because most cases are easy.

? Which design is generally more reliable?
- One judge prompt scoring overall quality 1–10
+ Several narrow binary judges, each for one criterion, calibrated against human labels
- No rubric
> Narrow, defined criteria reduce noise and are actionable.
```

:::problem Your LLM judge says a new prompt is 6 points better, but users complain. What do you check? {level=hard tags="judge,calibration"}
Think about the judge, the data and the metric.

:::solution Model answer
Check **verbosity bias** (did answers get longer? compare length-controlled), **position/self-preference** if pairwise or if the same model family judges and generates, and whether the **rubric measures what users care about** (maybe style over correctness). Re-validate the judge against fresh **human labels** on both versions and compute agreement and precision/recall on the FAIL class. Look at **slices** where users complain (a particular intent or segment) and read the cases the judge scored as improvements. Add narrow code-based checks for the complaints, and use an A/B test or sampled human review as the arbiter.
:::
:::

:::keypoints
- Judges scale evaluation of open-ended output; formats: pointwise, pairwise, reference-based; prefer narrow binary criteria and references.
- Prompt design: one criterion, defined anchors, examples, reasoning before verdict, structured output, a strong pinned judge model.
- Biases: position, verbosity, self-preference, authority, sycophancy, limited verification; mitigate with order-swapping, length control, different judge family, evidence.
- Calibrate against human labels (agreement, kappa, per-class precision/recall), read disagreements, re-check on changes, and correct aggregates for judge error.
- Use ensembles, cascades, sampling, batching and caching to control cost; never rely on a judge alone for high-stakes decisions.
:::

:::resources
- [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685) — the foundational study of judge agreement and biases.
- [Hamel Husain: Using LLM-as-a-Judge: a complete guide](https://hamel.dev/blog/posts/evals-faq/) — see the judge sections of the Evals FAQ.
- [Ragas docs](https://docs.ragas.io) and [DeepEval](https://deepeval.com) — ready-made judge metrics (and their prompts to read).
- [Anthropic docs: Define success criteria and build evaluations](https://docs.claude.com/en/docs/test-and-evaluate/develop-tests) — grading approaches including model-based grading.
- [Langfuse: LLM-as-a-judge evaluators](https://langfuse.com/docs) — running judges on production traces.
- [Self-RAG](https://arxiv.org/abs/2310.11511) — critique tokens as a built-in judge, for the curious.
:::
