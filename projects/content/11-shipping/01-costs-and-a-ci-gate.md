---
title: Costs and a CI gate
level: intermediate
time: 45
summary: Predict what an AI feature will cost before it surprises you, then make the build refuse to ship when tests or evaluations get worse. A cost model you can edit and run, a CI pipeline (tests, type-check, evaluation gate, image), and one checklist that applies to all ten projects.
tags: cost, CI, GitHub Actions, evals, operations, checklist
---

Ten projects are built, tested and measured. Two questions remain before anyone relies on one of them: **what will it cost to run**, and **how do I stop a change from quietly making it worse?** Neither is glamorous, and both decide whether an AI feature survives its first quarter.

## What will it cost?

Model prices are quoted per million tokens, split into input and output, and every request in this course sends the whole conversation or context again. So cost depends on four things you can estimate before launch:

| Driver | Where it comes from |
|---|---|
| **tickets (or questions) per day** | your traffic |
| **tokens per request** | the prompt (system instructions, facts, excerpts) plus the answer; the apps print the real numbers on every run |
| **how many model calls per request** | SupportPilot makes two (triage, draft) and a third when it rewrites; DataPilot's agent makes three to six; RepoChat makes one; the beginner agents (7 to 10) make two to four, each re-sending the whole conversation, so their cost grows faster than their step count; ResearchBuddy adds **a cent per web search** on top |
| **how many calls are avoided** | the gateway's cache, and the "nothing found, no model call" rule |

The prices are in the project's own `pricing.py`, which the apps use to show a cost on every answer. This block turns them into a monthly estimate you can edit. The token counts below are placeholders: **replace them with the numbers your app prints** (the usage line under each answer, or `avg_cost_usd` and the tokens in a trace), because a guess about tokens is the weakest part of any estimate.

```python run src="support-pilot/backend/app/pricing.py" title="A monthly cost model you can edit" level=intermediate
# Replace these with measurements from your own runs.
TICKETS_PER_DAY = 400
DAYS = 30
TRIAGE = dict(model="claude-sonnet-5-5", input=450, output=70)         # one structured-output call
DRAFT = dict(model="claude-sonnet-5-5", input=1100, output=140)        # one streamed reply
REWRITE_RATE = 0.12          # the share of drafts a guardrail check sends back for a second try
CACHE_HIT_RATE = 0.10        # the share of triage calls answered from the gateway's cache
ESCALATED = 0.06             # the share of tickets that stop after triage (no draft written)


def call_cost(spec):
    return cost_usd(spec["model"], spec["input"], spec["output"])


def per_ticket(triage=TRIAGE, draft=DRAFT, rewrite=REWRITE_RATE, cache=CACHE_HIT_RATE, escalated=ESCALATED):
    triage_cost = call_cost(triage) * (1 - cache)
    draft_cost = (call_cost(draft) * (1 + rewrite)) * (1 - escalated)         # a rewrite is a second draft call
    return triage_cost + draft_cost


def monthly(cost_each):
    return cost_each * TICKETS_PER_DAY * DAYS


base = per_ticket()
print(f"one ticket costs ${base:.5f}   ->   {TICKETS_PER_DAY} a day for {DAYS} days: ${monthly(base):,.2f} a month\n")

print("What each choice does to the monthly bill")
rows = [
    ("as above", base),
    ("no cache", per_ticket(cache=0)),
    ("30% of drafts are rewritten", per_ticket(rewrite=0.30)),
    ("a bigger prompt: 2,000 tokens of facts and articles", per_ticket(draft=dict(DRAFT, input=2000))),
    ("triage on the cheap model", per_ticket(triage=dict(TRIAGE, model="claude-haiku-5-5"))),
    ("draft on the strongest model", per_ticket(draft=dict(DRAFT, model="claude-opus-5-5"))),
    ("both on the strongest model", per_ticket(triage=dict(TRIAGE, model="claude-opus-5-5"), draft=dict(DRAFT, model="claude-opus-5-5"))),
]
for label, cost in rows:
    print(f"  {label:<52}${cost:.5f} per ticket   ${monthly(cost):>9,.2f} a month   {cost / base:>5.1f}x")

print("\nTraffic scales it linearly; so does a mistake. Retrying the draft ten times, with the triage call unchanged:")
for n in (1, 10):
    print(f"  {n:>2} attempts per draft: ${monthly(call_cost(TRIAGE) + call_cost(DRAFT) * n):,.2f} a month")
```

Read it as a sensitivity analysis. The cache and the rewrite rate matter a little; the **model you choose for each call** and the **size of your prompts** matter a lot. That is why SupportPilot can use a cheaper model for triage (a short classification) and a stronger one for the draft, and why every prompt in this course is built from a *closed set of facts* rather than "everything we know". And the last two lines are the real lesson: cost grows linearly with traffic, and **multiplicatively with bugs** (ten draft attempts cost about seven times as much). Per-user budgets and rate limits (the gateway, Project 5) are not only security measures; they cap the damage of the day something loops.

:::warn Prices change
The numbers in `pricing.py` are the ones in the project at the time of writing. Check the current price list before you budget, and keep prices in one file so a change is one edit. Read the provider's page on pricing and on caching and batching: both can lower a bill a good deal for the right workload.
:::

## A pipeline that can say no

In every project, `pytest` runs the offline model, so tests need no key and cost nothing. The same is true of the browser tests. That is what makes this possible: a continuous-integration (CI) pipeline that runs the *whole* suite on every push, and **fails the build** when quality drops.

```yaml
name: ci
on:
  push:
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12", cache: pip, cache-dependency-path: backend/requirements.txt }
      - run: pip install -r requirements.txt
      - run: pytest -q                              # unit and API tests, with the offline model: no key, no cost
      - run: python -m evals.run --fail-under 0.7   # the quality gate: fail the build if the evaluation drops

  frontend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      - run: npm test
      - run: npm run build                          # type-check, then the production bundle

  image:
    needs: [backend, frontend]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t app:${{ github.sha }} .
```

What each job guards:

| Job | Guards against |
|---|---|
| `pytest -q` | a broken function, route or guardrail |
| `python -m evals.run --fail-under 0.7` | **a prompt, model or rule change that makes the product worse**: the evaluation is a test with a threshold |
| `npm test` | broken reducers, parsers and formatters |
| `npm run build` | a type error (the compiler runs before the bundler) |
| `docker build` | an image that no longer builds |

Three decisions matter more than the syntax:

1. **Gate on the evaluation, not only on tests.** Unit tests tell you the code runs; the evaluation tells you the *behaviour* is still good. Each project has one (field accuracy, retrieval hit rate, execution accuracy, policy decision accuracy). Choose the `--fail-under` threshold from your measured baseline minus a small margin, and raise it as you improve.
2. **Keep secrets out of CI by default.** This pipeline never calls a real model, so it needs no API key. If you add a job that does (an evaluation against Claude), run it on a schedule or on demand, give it a spending limit, and keep the key in the platform's secret store, never in the repository.
3. **Fail loudly on the tripwires.** SupportPilot's runner exits non-zero if **any** personal data reaches a draft, whatever the other numbers say. Some failures are not percentages.

These workflow files are a sketch: the YAML is valid, and the paths assume one project per repository. Adapt the working directories if you keep several projects in one repository, and pin action versions for your own supply-chain policy.

:::tip The course's own gate
The course you are reading is built the same way: `python3 projects/build.py --verify-code` runs each project's pytest, type-check, production build and unit tests, and a separate browser test runs every lesson's code in a real browser. Anything that no longer works fails the build, so a lesson cannot silently rot.
:::

## One checklist for any of the ten

| Area | Ask | Where it was built |
|---|---|---|
| **Secrets** | no key in the repository; `.env` ignored; separate keys per environment | every `.env.example` |
| **Limits** | upload size, question length, steps, tokens, rows, files: all settings with safe defaults | `config.py` in each project |
| **Privacy** | what leaves the machine, what is stored, how long | redaction (Project 5), masking (Project 6) |
| **Authentication** | who can call it, and what may they do | Project 5; **absent** in the others, which are single-user |
| **Input safety** | every input from outside is hostile until proven otherwise | SQL guard (4), ZIP and regex limits (6), form limits (5) |
| **Failure** | what happens when the model is down, slow, or wrong | gateway and fallback (5), repair and fail-safe (2, 5) |
| **Evidence** | can a person see why this answer? | citations (3, 6), steps (4), traces (5) |
| **Measurement** | is there a labelled set, a held-out set, a threshold in CI? | the eval in each project |
| **Cost** | a budget per user, a number you have estimated, an alert | gateway (5), the model above |
| **A human** | who is the person in the loop for anything that matters? | the approval workflow (5); proposals and diffs (9) |
| **Least privilege** | what is the worst a fully fooled agent could do? | no tool that writes (9), a sandbox (9), a safe calculator (10), safe links (10) |

:::keypoints
- Estimate cost before launch: traffic, tokens per request, model calls per request, calls avoided. Replace guessed tokens with printed measurements.
- Model choice and prompt size dominate the bill; bugs multiply it. Budgets and rate limits cap the damage.
- Tests that use the offline model cost nothing and need no key, so CI can run all of them on every push.
- Gate on the evaluation with a threshold, as well as on tests: behaviour can get worse while every test still passes.
- Never put a real key in CI by default; some failures (leaked personal data) are tripwires, not percentages.
- One checklist covers all ten: secrets, limits, privacy, authentication, input safety, failure, evidence, measurement, cost, a human in the loop, and least privilege.
:::

```quiz
? Why gate the build on the evaluation as well as on the unit tests?
- Evaluations run faster
+ A prompt or model change can make the product worse while every unit test still passes
- Unit tests cannot run in CI
> Tests check the code; evaluations check the behaviour.
? Which lowers cost most for a short classification step that runs on every ticket?
- A longer prompt
+ A cheaper model for that step, and a cache for repeated inputs
- Retrying more often
> Match the model to the difficulty of the call.
? Why does the CI pipeline need no API key?
- Keys are not allowed in CI
+ The tests and evaluations run on the offline model behind the same interface
- Claude is free in CI
> Designing for an offline model makes everything testable for free.
```

:::exercise Cost your own project
Pick the project you would most like to run. Fill the block with its real numbers: run ten questions, read the token counts off the usage line, estimate traffic honestly (low, expected, high), and write down the monthly cost for each. Then find the one lever that would cut the expected cost by a third without lowering the evaluation score, and test it against the evaluation. If you cannot say what the evaluation score is, that is the first thing to fix.
:::
