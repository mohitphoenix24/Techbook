---
title: Evaluating the copilot
level: advanced
time: 60
summary: How do you know the copilot is good, and still good after your next change? Labelled tickets, a score for each stage (triage, escalation, the policy decision, the guardrails, personal data, cost), the one number that must always be zero, and a regression you cause on purpose and watch the eval catch. The whole eval runs in your browser.
tags: evals, metrics, regression, golden set, quality
---

You have a pipeline with eight stages, a gateway, guardrails and a human at the end. It is tempting to conclude that, with so many safeguards, it must be fine. But safeguards do not tell you whether the **copilot is actually good**: how often it understands a ticket, how often its draft needs rewriting, whether a model change made things better or worse. For that you need measurements.

You met evals in Projects 2, 3 and 4. A pipeline needs a richer kind, because there is more than one thing to get wrong.

## Measure each stage, not just the end

A single "accuracy" would hide where the problems are. So the eval scores **each stage separately**, from the same run:

| Metric | What it measures | Why it matters |
|---|---|---|
| **category accuracy** | triage picked the right category | wrong category means wrong rules apply |
| **priority accuracy** | triage picked the right priority | the inbox order |
| **escalation accuracy** | `needs_human` is right: both *missed* escalations and *needless* ones | **the most important triage metric** |
| **policy decision accuracy** | action, amount and "needs a lead" all match what a careful person concluded | the money |
| **drafts passing the guardrails** | the first draft needs no rewrite | cost, time, and how often a person must fix it |
| **personal data leaked** | personal data in any draft | **must always be 0** |
| **revised** | how many drafts needed the automatic rewrite | a leading indicator of prompt problems |
| **pipeline errors** | runs that ended in an error | reliability |
| **cost and time per ticket** | averages | the business case |

Two of these deserve to be treated differently from the rest:

- **Escalation** has an *asymmetric* cost. Escalating a harmless ticket wastes a minute of a person's time. *Missing* a legal threat could be serious. So look at them separately (a missed escalation is worse than a needless one), and when you have to trade, trade towards escalating.
- **Personal data leaked** is not a percentage to improve; it is a **tripwire**. The runner exits with an error if it is above zero, whatever the other numbers say.

## Labelled tickets

```python src="support-pilot/backend/evals/cases.py" region="hard-cases" title="backend/evals/cases.py"
```

The eval's tickets are the 18 from the demo inbox, plus these harder ones. Each carries `expect`: the category, priority, whether a person must take over, and the policy decision. Notice what the extra six are for:

- **Paraphrases**: "the zip on my shoes broke" instead of "damaged"; "please stop AUR-1004 from being dispatched" instead of "cancel".
- **A language switch**: Hinglish for a payment problem.
- **A hidden risk**: a journalist's reputational threat, which a human would escalate.
- **A trap in the other direction**: a customer saying thank you. The right answer is *not* to treat it as a refund.

The first 18 were written alongside the offline model's rules, so it solves them. The six hard ones are there so that **the eval can tell when something is wrong**. A test nothing can fail proves nothing.

:::tip Where labelled tickets come from
Start from real tickets (anonymised first, using lesson 3), labelled by the people who do the job, ideally two people independently, with disagreements discussed (they show where the *policy* is unclear, not just the model). Add every ticket the copilot ever got wrong. Keep a **held-out** set that nobody tunes on, and refresh it, so you do not slowly learn to pass your own test.
:::

## Scoring one ticket

```python src="support-pilot/backend/evals/run.py" region="score" title="backend/evals/run.py"
```

`score_case` does not call any model itself. It reads the **events** that the real pipeline produced for the ticket and compares them with `expect`: the triage result, the decision, the draft's checks, the citations it used, and the trace's cost and time. That is a design choice worth copying: because the eval consumes the pipeline's own event stream, *anything the pipeline reports can be scored*, and the eval can never drift from what the product does.

## Running them all

```python src="support-pilot/backend/evals/run.py" region="evaluate" title="backend/evals/run.py"
```

A **fresh database per run**, with the orders but no tickets, so an eval never touches the desk's real data and always starts from the same state. Each case becomes a ticket, runs through the **real** `process_ticket`, and is scored.

## Run it, then break it

The whole eval, in your browser, with the offline model. First the honest baseline. Then the guardrails under stress (a model that writes bad drafts). Then a regression of a kind that really happens: someone "tidies" the policy and shortens the return window.

```python run src="support-pilot/backend/app/seed.py,support-pilot/backend/app/redact.py,support-pilot/backend/app/policy.py,support-pilot/backend/app/kb.py,support-pilot/backend/app/checks.py,support-pilot/backend/app/workflow.py,support-pilot/backend/app/pricing.py,support-pilot/backend/app/llm/base.py,support-pilot/backend/app/gateway.py,support-pilot/backend/app/tracing.py,support-pilot/backend/app/schemas.py,support-pilot/backend/app/prompts.py,support-pilot/backend/app/triage.py,support-pilot/backend/app/llm/mock_rules.py,support-pilot/backend/app/llm/mock_client.py,support-pilot/backend/app/store.py,support-pilot/backend/app/principal.py,support-pilot/backend/app/pipeline.py,support-pilot/backend/evals/cases.py#hard-cases+all,support-pilot/backend/evals/run.py#score+evaluate" flat title="Evaluate the whole copilot, then break it" level=advanced
import asyncio, os, re, tempfile
from types import SimpleNamespace

settings = SimpleNamespace(today=TODAY, refund_auto_limit_inr=5000, max_output_tokens=800)


def show(title, report):
    s = report["summary"]
    print(f"\n{title}")
    print(f"  tickets {s['cases']} | category {s['category_accuracy']:.0%} | priority {s['priority_accuracy']:.0%} | escalation {s['escalation_accuracy']:.0%} | policy decision {s['decision_accuracy']:.0%}")
    print(f"  drafts {s['drafts']} | passing the guardrails first time {s['drafts_passing_checks']:.0%} | revised {s['revised']} | personal data leaked {s['pii_leaks']} | errors {s['errors']}")


async def main():
    llm = MockClient(0)
    base = await evaluate(llm, settings)
    show("1. Baseline: the offline model on all 24 tickets", base)
    print("   tickets where triage or the decision was wrong:")
    for r in base["cases"]:
        if not (r["category_ok"] and r["priority_ok"] and r["escalation_ok"] and r["decision_ok"]):
            bits = [name for name, ok in (("category", r["category_ok"]), ("priority", r["priority_ok"]), ("escalation", r["escalation_ok"]), ("decision", r["decision_ok"])) if not ok]
            print(f"     {r['subject']:<30}{', '.join(bits)}")

    stress = await evaluate(llm, settings, CASES[:12], simulate="stubborn")
    show("2. A model that writes leaky, over-promising drafts (12 tickets): the guardrails and the eval both see it", stress)

    global RETURN_WINDOW_DAYS
    RETURN_WINDOW_DAYS = 5                 # the regression: someone 'tidies' the policy
    regress = await evaluate(llm, settings, CASES[:18])
    show("3. After shortening the return window from 10 days to 5 (the 18 demo tickets)", regress)
    broke = [r["subject"] for r, b in zip(regress["cases"], base["cases"]) if b["decision_ok"] and not r["decision_ok"]]
    print("   the change broke:", broke)

asyncio.run(main())
```

Read the three reports like a reviewer.

**1.** Offline, the demo tickets are solved and the hard six expose the limits: paraphrases, the Hinglish payment message and the journalist slip past keyword rules. That is the right outcome: it tells you *exactly* what a real model must improve, and gives you the target to beat.

**2.** With a stubborn model, almost no draft passes first time, many get rewritten, and `personal data leaked` is above zero because the offline model's *final* drafts still carry a phone number. The point is not the number: it is that **the eval counts leaks that reach a draft**, while in the live app those drafts could never be approved or sent.

**3.** One constant changed, and the eval names the ticket whose answer moved (the headphones, which were refundable on day seven and now are not). A policy change that is *intended* should update `expect`; one that is not intended stops here.

## Using it with a real model

```bash
cd backend
python -m evals.run                    # whichever model your settings choose
python -m evals.run --fail-under 0.8   # fail the build below 80% decision accuracy, or on ANY leaked personal data
```

With `ANTHROPIC_API_KEY` set, the same command evaluates Claude through the same gateway. Some practical points:

- **It costs money**: every ticket is two or more model calls. The report prints the average cost and time per ticket; look at those before running a big set.
- **Unthrottle the eval.** The first version of `main()` ran the eval through a gateway with the *desk's* rate limit (30 calls a minute). After about fifteen tickets it started refusing calls, and the later tickets were scored as failures, for reasons unrelated to quality. The runner now builds its gateway with a high limit and no budget, and the report counts `errors` so a throttled run cannot pass for a bad model.
- **Run it more than once.** A model's answers vary. A two-point difference in one run is noise; a consistent gap across runs is a change.
- **Compare on the same set**: a new prompt line, a different model, another `effort` setting. The numbers tell you whether you moved forward, which "it feels better" cannot.
- **Read the failures** first. The score says *how often*, the failing tickets say *why*.
- **Never quote a number you did not measure.** The 83% here is a fact about keyword rules, not a claim about any model.

## Offline numbers versus real-world numbers

The eval measures the copilot on labelled tickets *before* release. Once real agents use it, the desk records three numbers that measure it *in use*, and they are the honest ones:

| Live metric | Where it comes from | What it says |
|---|---|---|
| **edit rate** | drafts whose last version has `source = "human"` | how often a person had to fix the draft |
| **approval rate** | audit: approvals divided by approvals plus rejections | how often the draft was good enough |
| **time and cost per ticket** | the traces | the business case |

They appear on the team lead's Metrics page. A copilot that scores well offline but has a 70% edit rate in use has a gap between your labelled tickets and your real ones, and the edits themselves (and the rejection reasons in the audit log) are the best source of your next labelled tickets.

:::warn Measuring can mislead
A labelled set that the team keeps tuning against becomes a target you pass without getting better. Keep a held-out set, add cases from real failures, and remember that the labels are only as good as the people who wrote them. If two careful people disagree about a ticket, that is a finding about your policy, not noise to average away.
:::

## Tests of the eval itself

```python src="support-pilot/backend/tests/test_evals.py" region="eval-tests" title="backend/tests/test_evals.py"
```

An eval has to be tested too: a scorer that cannot tell good from bad is worse than none. These tests check that the easy tickets pass **and the hard ones expose the limits**, and that a stubborn model shows up in the numbers.

:::keypoints
- Score each stage (triage, escalation, policy decision, guardrails, personal data, cost) from one run, so you know *where* quality is lost.
- Treat escalation as asymmetric (a missed one is worse) and personal data as a tripwire that must always be zero.
- Write labelled tickets with traps and hard cases; have people label them; keep a held-out set; add every real failure.
- Score from the pipeline's own events, so the eval cannot drift from the product.
- Do not throttle the eval with the desk's own limits, and count errors so a throttled run cannot look like a bad model.
- Run real-model evals several times, compare on the same set, read the failures, and never quote an unmeasured number.
- In use, watch edit rate, approval rate, time and cost: the honest measures of whether the copilot helps.
:::

```quiz
? Why is "personal data leaked" treated differently from accuracy?
- It is harder to measure
+ It is a tripwire that must always be zero, not a number to improve a little
- It is optional
> The runner fails whenever it is above zero, whatever the other scores.
? Triage escalates a harmless ticket, and misses a legal threat on another. Which is worse?
- The harmless escalation
+ The missed legal threat; when in doubt, trade towards escalating
- They are equal
> The costs are asymmetric: a person's minute versus a serious mistake.
? A real-model eval run scores several tickets as failures because they got "rate_limited" errors. What is wrong?
- The model is bad
+ The eval went through the desk's own rate limit; it needs its own gateway, and errors should be counted separately
- The tickets are too hard
> A throttled run measures the limiter, not the model.
```

:::exercise Measure escalation properly
Split `escalation_accuracy` into two numbers: **recall** (of the tickets a person labelled "needs a human", how many did triage escalate?) and **precision** (of the tickets triage escalated, how many truly needed it?). Add both to the summary and the runner's exit rule (fail if recall drops below 100%), then add two labelled tickets: a safety problem ("the heater sparked and caught fire") and a harmless ticket that *mentions* a lawyer ("my sister is a lawyer, she says I should check your policy"). Which does the offline model get wrong, and what does that tell you about keyword rules?
:::
