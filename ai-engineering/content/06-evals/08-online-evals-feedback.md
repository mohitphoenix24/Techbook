---
title: Online Evaluation, A/B Tests and Feedback Loops
level: advanced
time: 50
summary: Offline evals tell you whether a change is safe to try; production tells you whether it works. Shadow mode, canaries, A/B tests with sensible sample sizes and statistics, implicit and explicit user feedback and its biases, judging sampled live traffic, drift detection (input distribution and quality), and closing the loop from production failures into your eval set. With runnable A/B test, sample-size and drift calculations.
---

Offline evals use a fixed dataset you control. Real users are messier, change over time, and care about outcomes your dataset never imagined. **Online evaluation** is how you learn what actually happens after launch, and how you keep improving safely.

## The release ladder

:::flow From idea to everyone
Offline evals | the dataset suite passes; no regressions
Shadow mode | run the new version on real traffic, log outputs, show users nothing
Internal / dogfood | employees use it; collect feedback
Canary | 1–5% of traffic, with alerts and instant rollback
A/B test | randomised comparison on a key metric
Gradual rollout | 10% → 50% → 100% with guardrail metrics
Monitor | dashboards, sampled judging, drift alerts
:::

- **Shadow mode** is excellent for LLM changes: you can compare old and new outputs on the same real inputs, score both with judges or code, and inspect differences, with zero user risk (watch the doubled cost).
- **Canaries** limit blast radius. Define **guardrail metrics** (error rate, latency, refusals, escalation, cost) with automatic rollback thresholds.

## A/B tests for LLM features

Randomly assign users (not requests, to keep conversations consistent) to variants and compare a **primary metric** tied to value: task completion, resolution without escalation, conversion, retention, edit distance of accepted drafts, thumbs-up rate.

Why LLM A/B tests are tricky:

- **Noisy, subjective outcomes**: sample sizes needed are larger than you expect.
- **Novelty effects**: users react to "different" regardless of quality.
- **Non-stationary traffic**: seasonality, launches, news.
- **Interference**: shared caches, memory, or rate limits between variants.
- **Multiple comparisons**: many metrics and slices mean something will look significant by chance.
- **Long-term effects** (trust, retention) take longer to show than clicks.

```python run title="A two-proportion z-test for an A/B experiment" level=intermediate
import math

def two_prop_ztest(success_a, n_a, success_b, n_b):
    p_a, p_b = success_a / n_a, success_b / n_b
    p = (success_a + success_b) / (n_a + n_b)
    se = math.sqrt(p * (1 - p) * (1 / n_a + 1 / n_b))
    z = (p_b - p_a) / se
    p_value = math.erfc(abs(z) / math.sqrt(2))              # two-sided
    # 95% CI for the difference (unpooled)
    se_diff = math.sqrt(p_a * (1 - p_a) / n_a + p_b * (1 - p_b) / n_b)
    return p_b - p_a, (p_b - p_a - 1.96 * se_diff, p_b - p_a + 1.96 * se_diff), z, p_value

# resolution-without-escalation rate: control vs new prompt
diff, ci, z, p = two_prop_ztest(success_a=1180, n_a=2000, success_b=1262, n_b=2000)
print(f"control 59.0%, treatment 63.1%: difference {diff:+.1%}, 95% CI [{ci[0]:+.1%}, {ci[1]:+.1%}], z={z:.2f}, p={p:.4f}")
print("=> significant" if p < 0.05 else "=> not significant")

diff, ci, z, p = two_prop_ztest(success_a=118, n_a=200, success_b=126, n_b=200)      # same rates, 10x fewer users
print(f"same rates with n=200 each: difference {diff:+.1%}, 95% CI [{ci[0]:+.1%}, {ci[1]:+.1%}], p={p:.3f}  (not significant)")
```

### How many users do you need?

Plan the sample size **before** the test: it depends on the baseline rate, the **minimum effect you care about**, and the desired power.

```python run title="Sample size per variant for detecting a lift" level=intermediate
import math

def sample_size_per_group(p_base, lift, alpha_z=1.96, power_z=0.84):
    """Approximate n per group to detect an absolute lift in a proportion (95% confidence, 80% power)."""
    p_new = p_base + lift
    p_bar = (p_base + p_new) / 2
    num = (alpha_z * math.sqrt(2 * p_bar * (1 - p_bar)) + power_z * math.sqrt(p_base * (1 - p_base) + p_new * (1 - p_new))) ** 2
    return math.ceil(num / lift ** 2)

for lift in (0.10, 0.05, 0.02, 0.01):
    print(f"baseline 60%, detect +{lift:.0%}: ~{sample_size_per_group(0.60, lift):>7,} users per variant")
```

Halving the effect you want to detect roughly **quadruples** the sample you need. Decide the metric, effect size and duration up front, avoid **peeking and stopping early** (or use sequential testing methods), and correct for multiple comparisons.

## Feedback signals

| Signal | Kind | Strengths | Biases and caveats |
|---|---|---|---|
| **Thumbs up/down** | explicit | direct, cheap | rare (1–5% of users), skewed to extremes and to annoyed users |
| **Free-text comments** | explicit | explain why | sparse |
| **Edits to the AI draft** | implicit | strong signal of quality (distance between draft and final) | requires instrumentation; users may not edit even bad drafts |
| **Regenerate / retry / rephrase** | implicit | dissatisfaction | also curiosity |
| **Copy / accept / use** | implicit | satisfaction | users may copy then discard |
| **Escalation to human** | implicit | failure signal | policy-driven |
| **Conversation abandonment** | implicit | possible failure | or success without further need |
| **Task completion / downstream conversion** | outcome | what you actually want | delayed, confounded |
| **Support tickets** | outcome | severe failures | very delayed |

**Make feedback easy** (one-click, in context), collect **reasons** for thumbs-down, and **never treat it as ground truth**: respondents are a biased sample. Use it to **find** cases to review and to track trends, then confirm with labelled data.

## Judging live traffic

Run **automatic evaluators on sampled production traces**: judges for faithfulness, policy compliance, tone, task success; code checks for format and citation validity; safety classifiers. Attach the scores to traces, track them as time series, and alert on drops. Calibrate judges offline first (previous lesson) and re-validate with fresh human labels periodically, since production distribution shifts.

## Drift: when the world changes under you

Systems degrade without anyone changing a line of code:

- **Input drift**: users ask new kinds of questions (a new product, a news event, seasonality).
- **Knowledge drift**: documents and policies change; your eval answers go stale.
- **Model drift**: the provider updates the model behind an alias.
- **Data/tool drift**: APIs change formats; retrieval indexes grow.
- **Behavioural drift**: users learn to prompt differently.

Detect it with **distribution comparisons** over time: topic or intent mix, input length, embedding-cluster shares, tool-call rates, refusal rate, and judge scores. A common summary statistic is the **Population Stability Index (PSI)**.

```python run title="Detect drift in the mix of user intents with PSI" level=advanced
import numpy as np

def psi(expected, actual, eps=1e-4):
    e, a = np.clip(np.asarray(expected, float), eps, None), np.clip(np.asarray(actual, float), eps, None)
    e, a = e / e.sum(), a / a.sum()
    return float(np.sum((a - e) * np.log(a / e)))

intents = ["order status", "refund", "technical", "billing", "other"]
baseline = [0.34, 0.22, 0.20, 0.15, 0.09]           # launch month
for month, mix in {"month 2": [0.33, 0.23, 0.20, 0.15, 0.09],
                   "month 3": [0.28, 0.20, 0.31, 0.12, 0.09],            # a technical issue surges
                   "month 4": [0.15, 0.18, 0.45, 0.10, 0.12]}.items():
    v = psi(baseline, mix)
    print(f"{month}: PSI = {v:.3f}  ->", "stable" if v < 0.1 else "moderate shift: investigate" if v < 0.25 else "major shift: re-evaluate and update evals")
```

When drift appears: **sample new traces**, find the new clusters, add cases to your eval set, and check whether quality dropped on them.

## The improvement loop

```viz algo=arch title="Closing the loop from production to evals" dir=down
prod  Production traffic [users] @0,1
trace Tracing | every request [eval] @1,1
samp  Sampling | errors, thumbs-down, random [filter] @2,1
rev   Review + label | humans and judges [user] @3,1
data  Eval dataset | grows with each failure [docs] @4,1
change Prompt / model / retrieval change [prompt] @5,1
--
prod -> trace
trace -> samp
samp -> rev
rev -> data
data -> change : run evals
change -> prod : canary / A-B
```

The teams that improve fastest run this loop **weekly**: review a batch of production traces, label failures, add them to the dataset, fix the biggest failure mode, verify offline, canary, and repeat.

## Practical guardrails for experiments

1. Pre-register the **primary metric, guardrails and stopping rule**.
2. Use **randomisation by user**, not by request.
3. Run for **full weekly cycles** to average out day-of-week effects.
4. Monitor **guardrail metrics** (errors, latency, cost, safety) and auto-rollback.
5. Segment the results (new vs returning users, languages, intents), but treat segments as **hypothesis-generating**.
6. Combine **quantitative results with qualitative review** of sampled conversations from both arms.
7. Keep the **rollback path** one click away.

```quiz
? What is shadow mode?
+ Running the new version on real traffic without showing users its outputs, to compare and score safely
- Running at night
- A dark UI theme
> Shadow mode gives real-input evidence with no user risk (but extra cost).

? Why is thumbs-up/down feedback not ground truth?
+ Few users give it, and respondents are biased toward the very satisfied or annoyed
- It is encrypted
- It always agrees with judges
> Use it to find cases and track trends, then verify with labelled data.

? Halving the lift you want to detect has what effect on required sample size?
+ Roughly quadruples it
- Halves it
- No effect
> Sample size scales with 1 / effect².

? What is PSI used for?
+ Quantifying how much a distribution (such as intent mix) has shifted from a baseline
- Computing token costs
- Judging answers
> A drift alarm for inputs and outputs.
```

:::problem Your new prompt wins offline (+7 points) but the A/B test shows no difference in resolution rate. What might explain it? {level=hard tags="ab-testing,evals"}
Give hypotheses and next steps.

:::solution Model answer
Possible causes: the offline dataset **doesn't match production** (distribution, difficulty); the **offline metric** (judge score) isn't tied to the **business metric** (resolution); **underpowered test** (confidence interval includes real effects: check the interval); novelty or interference effects; the improvement is in a **small slice** diluted overall; both variants share a bottleneck (retrieval or tools) that dominates. Next steps: examine CI and compute power; **slice** results by intent; sample conversations from both arms and compare with human review; check judge calibration vs outcomes; rebuild the offline set from recent traces; and consider the next bottleneck rather than prompt tweaks.
:::
:::

:::keypoints
- Release safely: offline evals → shadow mode → canary → A/B test → gradual rollout, with guardrail metrics and instant rollback.
- A/B tests need planned sample sizes, randomisation by user, full weekly cycles, pre-registered metrics, and care with peeking and multiple comparisons.
- Feedback signals (thumbs, edits, retries, escalations, outcomes) are biased: use them to find cases and trends, not as ground truth.
- Judge sampled live traffic with calibrated evaluators; watch for input, knowledge, model and tool drift (for example with PSI).
- Close the loop weekly: sample, review, label, add to the dataset, fix, verify, release.
:::

:::resources
- [Hamel Husain: A field guide to rapidly improving AI products](https://hamel.dev/blog/posts/field-guide/) — the weekly error-analysis loop.
- [Eugene Yan: Patterns for Building LLM-based Systems & Products](https://eugeneyan.com/writing/llm-patterns/) — collecting user feedback.
- [Langfuse docs](https://langfuse.com/docs) — online evaluators and datasets from production traces.
- [Arize Phoenix](https://docs.arize.com/phoenix) — monitoring, embedding drift and evaluations.
- [Chip Huyen: Building a GenAI platform](https://huyenchip.com/2024/07/25/genai-platform.html) — feedback and monitoring in the stack.
- [Braintrust docs](https://www.braintrust.dev/docs) — experiments and online scoring.
:::
