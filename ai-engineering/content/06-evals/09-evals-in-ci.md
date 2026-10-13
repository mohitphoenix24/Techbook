---
title: Evals in CI — Regression Tests for Prompts, Models and Pipelines
level: advanced
time: 40
summary: Make evaluation automatic. What belongs in a fast PR suite versus a nightly suite, gating releases with confidence-aware thresholds, handling non-determinism and flakiness, controlling cost (sampling, caching, batch), snapshotting baselines, evaluation tooling (promptfoo, DeepEval, Inspect, Braintrust, Langfuse), and a runnable regression gate that decides whether a change is safe to ship.
---

An eval nobody runs protects nothing. The final step of the evaluation story is to make evals **automatic and unavoidable**: every change to a prompt, model, retrieval setting, tool or dependency triggers a regression suite, and **bad changes cannot merge**. This is "CI/CD for AI", and it is what lets teams change things quickly without fear.

## What can change (and therefore needs a test)

| Change | Why it can break things |
|---|---|
| **Prompt / system prompt / few-shot examples** | behaviour shifts in unexpected places |
| **Model or model version** (including provider-side updates) | different style, format, refusals, tool habits |
| **Retrieval**: chunking, embeddings, index, reranker, filters | recall and ranking change |
| **Tools**: descriptions, schemas, outputs | selection and argument errors |
| **Parameters**: effort, max tokens, temperature, caching | quality, cost and latency |
| **Dependencies / frameworks** | hidden prompt or parsing changes |
| **Data**: knowledge base content | stale or conflicting answers |

## Two tiers of suites

| | **PR suite (fast)** | **Nightly / release suite (thorough)** |
|---|---|---|
| Size | 30–100 cases, the highest-signal ones | hundreds to thousands |
| Scorers | mostly code checks, a few cheap judges | + calibrated judges, human spot checks |
| Runs | on every pull request | nightly, before release, on model/provider changes |
| Duration/cost | minutes, cents to dollars | longer, uses batch APIs |
| Purpose | catch obvious regressions quickly | full quality picture, slices, trends, cost/latency |

Also keep a **canary suite against production** (scheduled): the same checks against the live system catch provider-side model changes and data drift.

## Design a good gate

A naive gate ("fail if accuracy < 90%") is brittle: noise causes false failures and real regressions hide in slices. Better:

1. **Compare to a baseline** (the current production version's scores on the same cases), not to an absolute number alone.
2. **Fail on significant regressions** (paired bootstrap interval below zero), not on any dip. With small suites accept that you only catch large regressions and rely on the nightly suite for subtle ones.
3. **Per-slice thresholds** for critical categories (safety, billing, top intents): "no regression allowed".
4. **Hard gates for hard rules**: any safety/policy violation, invalid-format rate above X%, a cost or latency budget exceeded.
5. **Report differences**: which cases flipped pass→fail and fail→pass, with outputs side by side, in the PR comment.
6. **Allow overrides with justification** (an engineer can accept a known trade-off, and it is recorded).

```python run title="A regression gate: baseline comparison with a confidence interval and hard rules" level=advanced
import numpy as np

rng = np.random.default_rng(0)

def gate(baseline, candidate, slices, critical_slices, min_ci_low=-0.02, max_cost_increase=0.25, costs=(1.0, 1.1)):
    """baseline/candidate: per-case 0/1 scores on the SAME cases. slices: list of slice names per case."""
    baseline, candidate, slices = map(np.asarray, (baseline, candidate, slices))
    idx = rng.integers(0, len(baseline), size=(5000, len(baseline)))
    diffs = (candidate[idx] - baseline[idx]).mean(axis=1)
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    reasons, ok = [], True
    if lo < min_ci_low:
        ok = False; reasons.append(f"overall score may have regressed: 95% CI of the change is [{lo:+.1%}, {hi:+.1%}]")
    for s in critical_slices:
        m = slices == s
        if candidate[m].mean() < baseline[m].mean():
            ok = False; reasons.append(f"critical slice '{s}' regressed: {baseline[m].mean():.0%} -> {candidate[m].mean():.0%}")
    if costs[1] / costs[0] - 1 > max_cost_increase:
        ok = False; reasons.append(f"cost increased {costs[1] / costs[0] - 1:+.0%} (budget {max_cost_increase:+.0%})")
    flips_bad = int(((baseline == 1) & (candidate == 0)).sum()); flips_good = int(((baseline == 0) & (candidate == 1)).sum())
    return ok, reasons, (lo, hi), flips_good, flips_bad

slices = np.array(["billing"] * 20 + ["bug"] * 20 + ["safety"] * 20)
base = np.array([1] * 17 + [0] * 3 + [1] * 15 + [0] * 5 + [1] * 19 + [0] * 1)
cand_a = base.copy(); cand_a[17:20] = 1; cand_a[20:23] = 0              # fixes 3 billing cases but breaks 3 bug cases
cand_b = base.copy(); cand_b[17:20] = 1; cand_b[-1] = 1                 # strictly better

for name, cand in (("candidate A (swap of failures)", cand_a), ("candidate B (strict improvement)", cand_b)):
    ok, reasons, (lo, hi), good, bad = gate(base, cand, slices, critical_slices=["safety"])
    print(f"{name}: {'PASS' if ok else 'FAIL'}  (fixed {good}, broke {bad}; CI of change [{lo:+.1%}, {hi:+.1%}])")
    for r in reasons: print("   -", r)
```

## Non-determinism and flaky evals

LLM outputs vary, so an eval case can pass one run and fail the next. Tame flakiness:

- **Reduce variance**: fixed prompts, lower temperature where settable, caching of model responses for **replay** in unit-style tests (record once, replay offline).
- **Run each case multiple times** (3–5) and use the **majority or pass rate**; for gating use the **mean over runs**.
- **Separate deterministic from stochastic tests**: code logic (parsers, routers, tool schemas) gets ordinary deterministic unit tests with a **stub model**; model behaviour gets statistical evals.
- **Quarantine flaky cases**: track their pass rate; fix or relabel ambiguous ones instead of ignoring failures.
- **Pin model versions** in CI so that the model is not a hidden variable.

```python run title="Handle flakiness with repeated runs and a pass-rate threshold" level=intermediate
import random

random.seed(3)                                         # a stochastic "system": each case passes with its own probability
cases = {"easy-1": 0.99, "easy-2": 0.97, "hard-1": 0.70, "hard-2": 0.55, "broken-1": 0.05}
RUNS, THRESHOLD = 5, 0.6
for cid, p in cases.items():
    passes = sum(random.random() < p for _ in range(RUNS))
    status = "stable pass" if passes == RUNS else "FAIL" if passes / RUNS < THRESHOLD else "flaky (monitor)"
    print(f"{cid:9} passed {passes}/{RUNS}  -> {status}")
```

## Control cost

Evals can quietly become your biggest bill.

| Lever | How |
|---|---|
| **Tiered suites** | tiny fast suite on PRs; big suite nightly |
| **Cache model responses** | key by (model, prompt, params): unchanged cases cost nothing; re-run only affected cases |
| **Prompt caching** | the static rubric/system prompt is cached across thousands of judge calls |
| **Batch API** | ~50% cheaper for non-urgent nightly runs |
| **Cheaper judges** | small models for narrow criteria; escalate disagreements |
| **Targeted runs** | run only the slices touched by the change (paths-based triggers) |
| **Stop early** | abort the suite when a hard gate fails |

## Tooling

| Tool | Highlights |
|---|---|
| **promptfoo** ([docs](https://www.promptfoo.dev/docs/intro)) | config-file driven tests and assertions, many providers, side-by-side comparison, CI integration, red-teaming |
| **DeepEval** ([site](https://deepeval.com)) | pytest-style LLM tests with built-in metrics (faithfulness, relevance, ...) |
| **Inspect AI** ([site](https://inspect.aisi.org.uk/)) | tasks, solvers, scorers, agent and sandbox support, from the UK AI Security Institute |
| **Ragas** ([docs](https://docs.ragas.io)) | RAG-specific metrics and test-set generation |
| **Braintrust**, **LangSmith**, **Langfuse** | datasets, experiments, comparison views, and online evals tied to traces |
| **OpenAI Evals / provider consoles** | hosted dataset and grader tooling |
| **pytest + your own scorers** | perfectly fine: a dataset file, a runner script, and assertions |

## A CI sketch

```yaml
# .github/workflows/evals.yml  (illustrative)
name: llm-evals
on:
  pull_request:
    paths: ["prompts/**", "src/rag/**", "src/tools/**", "evals/**"]
jobs:
  pr-suite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements.txt
      - name: Run fast eval suite against the baseline
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY_CI }}   # a low-limit CI key
        run: python evals/run.py --suite pr --baseline origin/main --out report.json
      - name: Gate
        run: python evals/gate.py report.json         # exits non-zero on regression
      - name: Comment results on the PR
        if: always()
        run: python evals/comment.py report.json
```

Put the **eval code, datasets and gate logic in the repo**, version prompts alongside code, give CI a **separate, budget-limited API key**, and store results as artefacts so trends are visible.

## Habits of teams that move fast and stay safe

1. **Every bug becomes a test** before it is fixed.
2. **Every prompt change ships with an eval diff** in the PR.
3. **Dashboards track scores over time**, not just pass/fail.
4. **Evals are reviewed** like code: ambiguous labels fixed, stale cases pruned, thresholds revisited.
5. **A model-upgrade runbook**: run the full suite on the new model, compare slices and cost, adapt prompts, canary, roll out.
6. **Ownership**: someone is responsible for the eval suite's health.

```quiz
? Why compare to a baseline instead of an absolute threshold alone?
+ A baseline captures what "no regression" means for your current system and accounts for case difficulty
- Absolute thresholds are illegal
- Baselines are cheaper
> Gate on change from production, plus hard rules.

? What is a good way to handle flaky eval cases?
+ Run them several times and use pass rates, quarantine and fix ambiguous ones, pin model versions
- Delete them
- Ignore failures
> Flakiness hides real regressions if you ignore it.

? What belongs in the fast PR suite?
+ A small, high-signal set with mostly cheap code-based checks
- Every case and judge
- Nothing
> Keep PR runs fast; run the big suite nightly.

? How can you cut the cost of running evals?
+ Tiered suites, response caching, batch APIs, prompt caching, cheaper judges and targeted runs
- Skip them
- Use the biggest model for everything
> Evals are a recurring cost: engineer them like production.
```

:::problem A model provider announces a new version of the model you use. What is your upgrade process? {level=medium tags="ci,model upgrade"}
Describe it step by step.

:::solution Model answer
(1) **Pin** the current version in production. (2) Run the **full nightly suite** on the new model with the **same prompts**; compare scores overall and by slice, plus cost, latency, refusal and format-failure rates, with confidence intervals. (3) Read the **flipped cases** and fix with prompt or tool adjustments (the new model may need different instructions); re-run. (4) Run **adversarial and safety suites**. (5) **Shadow** or **canary** on real traffic with guardrail metrics. (6) Roll out gradually, keep the old version as instant rollback, and **update the baseline**. (7) Record the decision, results and prompt changes.
:::
:::

:::keypoints
- Make evals automatic: every change to prompts, models, retrieval, tools, parameters or data triggers a regression suite.
- Two tiers: a fast PR suite (high-signal, cheap) and a thorough nightly/release suite; add a scheduled production canary.
- Gate on change versus a baseline with confidence intervals, per-slice rules and hard rules; report flipped cases.
- Tame non-determinism with repeats, pass rates, stubs for deterministic logic, quarantining and pinned versions.
- Control cost with caching, batching and targeted runs; use tooling like promptfoo, DeepEval, Inspect, Braintrust or plain pytest.
:::

:::resources
- [promptfoo](https://www.promptfoo.dev/docs/intro) — config-driven evals and CI integration.
- [DeepEval](https://deepeval.com) — pytest-style LLM tests.
- [Inspect AI](https://inspect.aisi.org.uk/) — a rigorous evaluation framework with sandboxes.
- [Hamel Husain: Your AI product needs evals](https://hamel.dev/blog/posts/evals/) — evals as the foundation of a development loop, including unit tests.
- [Langfuse docs](https://langfuse.com/docs) and [Braintrust docs](https://www.braintrust.dev/docs) — experiments, datasets and CI-friendly workflows.
- [Anthropic docs: Define success criteria and build evaluations](https://docs.claude.com/en/docs/test-and-evaluate/develop-tests) — grading approaches and test design.
:::
