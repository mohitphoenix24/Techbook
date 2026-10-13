---
title: CI/CD, Prompt Versioning and Releases
level: intermediate
time: 35
summary: Engineering discipline for the non-deterministic parts of your system. Prompts, models, retrieval settings and tools as versioned artifacts, the three kinds of change (prompt, model, data), eval gates in CI with thresholds and statistical care, canary and shadow releases, feature flags and kill switches, model deprecation and upgrade playbooks, and reproducibility. With a runnable eval-gate script and a significance check.
---

In a normal codebase a change either passes the tests or it does not. In an LLM app **every prompt tweak, model upgrade or retrieval setting is a behaviour change you cannot fully predict by reading the diff**. Teams that ship safely treat these as **versioned artifacts** guarded by **automated evals**, with gradual rollouts and fast rollback.

## What is a "version" in an LLM app?

A request's behaviour depends on a whole **bundle**; version all of it:

| Component | Examples |
|---|---|
| **Prompts** | system prompt, templates, few-shot examples, tool descriptions |
| **Model** | provider, model id (pin a **dated snapshot** where available, not a moving alias), parameters, reasoning effort |
| **Retrieval** | embedding model, chunking, index version, top-k, reranker, filters |
| **Tools and schemas** | tool definitions, output schemas, MCP server versions |
| **Guardrails** | policies, classifiers, thresholds |
| **Code** | orchestration logic |
| **Data** | knowledge-base snapshot, eval sets |

Record the bundle (or its hash) in every trace so any output can be tied to **exactly what produced it**.

## Where prompts live

| Approach | Pros | Cons |
|---|---|---|
| **In the repo** (files, reviewed by PR) | code review, git history, deployed with the app, easy CI | non-engineers cannot edit; release tied to deploys |
| **Prompt registry / management tool** (LangSmith, Langfuse, PromptLayer, Braintrust and others) | versions, labels (staging/prod), non-engineer editing, runtime fetch, rollbacks without deploy | extra dependency, drift from code if uncontrolled |
| **Hybrid** | prompts in repo, synced to a registry for observability and A/B | more plumbing |

Whatever you pick: **immutable versions**, named **environments or labels** (dev, staging, prod), **review and approval** for prod changes, **diff and history**, and the **eval results attached** to each version.

## Three kinds of change, three kinds of risk

1. **Prompt/config change**: fast to make, easy to over-fit to the last bug you saw; can regress other cases.
2. **Model change** (new version, new provider, cheaper model): behaviour shifts in style, format adherence, refusals, tool use and latency; **prompts tuned for one model often need re-tuning** for another.
3. **Data change** (new documents, re-indexing, new embedding model): changes what retrieval returns, so answers change without any code change.

All three go through the same gate: **run the evals, compare to baseline, decide**.

## Eval gates in CI

```viz algo=arch title="A release pipeline with an eval gate" dir=right
pr    Pull request | prompt, model, retrieval change [service] @0,1
unit  Unit tests | parsers, validators, tools [worker] @1,0
ev    Eval suite | golden set, slices, judges [eval] @1,1
safe  Safety evals | injection, policy, PII [guard] @1,2
gate  Gate | thresholds vs baseline [filter] @2,1
can   Canary | 5 percent of traffic, watch metrics [monitor] @3,1
prod  Full rollout | flags, kill switch [llm] @4,1
--
pr -> unit
pr -> ev
pr -> safe
unit -> gate
ev -> gate
safe -> gate
gate -> can : "pass"
can -> prod : "healthy"
```

Practical guidance:

- **Fast tier on every PR** (tens to a few hundred cases, cheap judge or deterministic checks, minutes); **deep tier nightly or pre-release** (thousands of cases, human-validated judges, safety suites).
- Compare against the **current production baseline run on the same cases**, not an old number.
- Gate on **multiple metrics**: quality (task success, groundedness), **safety/policy**, **format validity**, **cost**, **latency** (p95), plus **no-regression on critical slices**.
- Use **hard assertions** for things that must never break (valid JSON, no PII leak, tool-call schema) and **thresholds with tolerance** for fuzzy quality.
- Account for **noise**: LLM outputs and judges vary. Use enough cases, run repeats for flaky tasks, report **confidence intervals**, and avoid overreacting to a 1-point change on 50 examples.
- Keep the golden set **out of prompts and training** to avoid overfitting.

```python run title="An eval gate that respects noise: is the new prompt really better?" level=advanced
import math, random

def gate(baseline, candidate, min_gain=0.0, max_drop_slice=0.05):
    """baseline/candidate: list of (slice, passed). Returns decision with a paired bootstrap on the overall score."""
    n = len(baseline)
    diffs = [int(c[1]) - int(b[1]) for b, c in zip(baseline, candidate)]
    mean = sum(diffs) / n
    rnd = random.Random(0)
    boots = sorted(sum(rnd.choice(diffs) for _ in range(n)) / n for _ in range(2000))
    lo, hi = boots[int(0.025 * 2000)], boots[int(0.975 * 2000)]
    slices = {s for s, _ in baseline}
    worst = 0.0
    for s in slices:
        b = [int(x[1]) for x in baseline if x[0] == s]; c = [int(x[1]) for x in candidate if x[0] == s]
        worst = min(worst, sum(c) / len(c) - sum(b) / len(b))
    ok = lo > -0.0001 and mean >= min_gain and worst >= -max_drop_slice
    return mean, (lo, hi), worst, ok

rng = random.Random(3)
cases = [(rng.choice(["billing", "tech", "legal"]), None) for _ in range(300)]
true_base = {"billing": 0.80, "tech": 0.75, "legal": 0.70}
base = [(s, rng.random() < true_base[s]) for s, _ in cases]
# candidate A: genuinely better on billing and tech, about the same on legal
candA = [(s, (p or rng.random() < 0.40) if s != "legal" else p) for s, p in base]
# candidate B: a tweak that looks better overall but quietly breaks legal questions
candB = [(s, (p or rng.random() < 0.60) if s != "legal" else (p and rng.random() < 0.75)) for s, p in base]
for name, cand in (("A", candA), ("B", candB)):
    mean, (lo, hi), worst, ok = gate(base, cand)
    print(f"candidate {name}: overall gain {mean:+.3f} (95% CI {lo:+.3f} to {hi:+.3f}), worst slice change {worst:+.2f} -> {'PASS' if ok else 'BLOCK'}")
print("\ncandidate B's average went up, but one slice dropped about 15 points: the slice check catches what the average hides")
```

## Rolling out safely

1. **Shadow mode**: run the new version in parallel on real traffic without showing users; compare outputs, cost and latency offline.
2. **Canary**: expose to a small slice (1 to 5 percent, internal users first), watch error rates, latency, cost, guardrail hits, feedback.
3. **Progressive ramp** with automatic rollback conditions.
4. **A/B test** when you need to measure effect on product metrics (task success, retention, revenue), with enough traffic and a pre-registered metric.
5. **Feature flags and kill switches** per feature, tenant, tool and model route, so you can turn off a misbehaving capability in seconds without a deploy.

## Model lifecycle: deprecations and upgrades

Providers retire model versions on published schedules. Plan for it:

- **Pin model ids** and subscribe to deprecation notices; keep an inventory of where each model is used.
- Maintain a **model-upgrade playbook**: run the full eval suite on the new model, **re-tune prompts** if needed (newer models may need less scaffolding and may reject some parameters), compare cost and latency, shadow, canary, then migrate.
- Keep a **compatible fallback** for emergencies, tested regularly.
- Store **frozen eval baselines** per model so you can see how behaviour moved between versions.

## Reproducibility and incident response

- Log the version bundle and a **seed or settings** where possible; exact reproduction of sampled output may be impossible, so also **store the inputs and outputs** of interesting cases.
- Turn every production incident into a **regression test** in the golden set.
- Keep a **changelog** for prompts and models with the reason, evidence (eval deltas), and owner.
- Rollback must be **one action**, tested.

```quiz
? Why should a model id be pinned to a specific version rather than a moving alias?
+ Behaviour changes when the alias moves, which can silently regress your app
- Aliases are more expensive
- Pinned models are faster
> Upgrade deliberately, with evals, on your schedule.

? What belongs in an eval gate besides overall quality?
+ Safety, format validity, cost, latency and checks on critical slices
- Only the average score
- The length of the diff
> Aggregates hide slice regressions and non-quality costs.

? What is shadow mode?
+ Running a new version on real traffic in parallel without showing its output to users, to compare offline
- Hiding the prompt from developers
- Training on user data
> It gives real-world evidence with no user risk.

? After a production incident you should:
+ Add the failing case to the regression eval set and fix the root cause
- Delete the logs
- Change the model alias
> Incidents are your best test cases.
```

:::problem Your team wants to switch from an expensive model to a cheaper one to save 70% of cost. Describe the release plan, what you measure, and the criteria to proceed or abort. {level=medium tags="release,model-migration"}
Include prompts, evals and rollout.

:::solution Model answer
Baseline: run the current golden set on the production model and record quality, safety, format validity, latency, cost, sliced by task type. Run the cheaper model with the **same prompts**, then with prompts tuned for it (shorter, clearer constraints, examples where it fails). Compare with confidence intervals and slice checks; add cases where the cheap model is expected to struggle (long context, tool use, rare languages). Decide a **routing option** (cheap model for easy traffic with a verifier and escalation) if quality is insufficient overall. Then **shadow** on production traffic, review disagreements with humans or a validated judge, **canary** 5%, watch quality proxies (thumbs, edits, escalation), cost and latency, ramp gradually with automatic rollback thresholds (for example success rate down more than 2 points or any safety regression). Proceed if quality is within tolerance on all critical slices and savings are realised; otherwise keep the strong model for hard slices. Keep the old route as a fallback and document the decision.
:::
:::

:::keypoints
- Version the whole bundle: prompts, model id and parameters, retrieval settings, tools, guardrails, code and data; stamp it on every trace.
- Prompts live in the repo or a registry with immutable versions, environments, review and attached eval results.
- Gate every prompt, model or data change with evals against the production baseline: hard assertions plus thresholds, with slices and noise-aware statistics.
- Roll out via shadow, canary, ramp and A/B, with flags and kill switches and one-action rollback.
- Pin model versions, plan for deprecations with an upgrade playbook, and convert incidents into regression tests.
:::

:::resources
- [Claude docs: Create strong empirical evaluations](https://docs.claude.com/en/docs/test-and-evaluate/develop-tests) — designing tests for prompt changes.
- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — practical eval design.
- [Langfuse: Prompt management](https://langfuse.com/docs/prompts) — versioning, labels and deployment of prompts.
- [promptfoo docs](https://www.promptfoo.dev/docs/intro/) — open-source eval and red-team CI tooling.
- [Braintrust docs](https://www.braintrust.dev/docs) — evals, datasets and experiments platform.
- [Hamel Husain: field guide to improving AI products](https://hamel.dev/blog/posts/field-guide/) — error analysis and eval-driven iteration.
:::
