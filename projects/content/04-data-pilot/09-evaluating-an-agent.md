---
title: Evaluating an agent
level: advanced
time: 55
summary: How do you know an agent gets the right answer, and still does after your next change? Golden questions, scoring by what a query returns rather than how it is spelled, and a regression you cause on purpose and watch the eval catch. The whole eval runs in your browser.
tags: evals, execution accuracy, golden set, regression, CI
---

You can chat with DataPilot a few times and feel that it works. That feeling is worth very little. It does not survive a change of model, a new prompt line, a new tool, or the ten questions you did not think to try. The discipline that replaces the feeling is an **eval**: a fixed set of questions with known right answers, run automatically, producing a number.

:::analogy The driving test
A driving test is not "does this person seem competent?". It is a fixed route, the same checks for everyone, and a pass mark. You can argue about the route, but you cannot argue with the result, and you can re-test after any change.
:::

## What counts as a right answer?

For a data agent there are two ways to judge, and the second is far better:

| Judge | How | Problem |
|---|---|---|
| **By the SQL text** | compare the model's query with a reference query | many different queries mean the same thing; a join and a subquery both give the right rows. You would punish correct work |
| **By execution** | run the reference query, run the agent's query, **compare the results** | none: if the data matches, the answer is right, however it was written |

This is called **execution accuracy**, and it is the standard way to evaluate text-to-SQL. The question is never "did it write the query I would write?" but "did it return what I would return?".

## The golden questions

```python src="data-pilot/backend/evals/cases.py" region="cases" title="backend/evals/cases.py"
```

Each case has a question, a **golden** query written by a careful person, and `ordered` (does the order of rows matter?). "Top 3 customers" is ordered; "orders by status" is not.

Notice what is deliberate:

- **The golden queries are written differently from the agent's.** They use subqueries where the agent uses joins. If both agree, the *meaning* agrees. A golden query copied from the agent's output would test nothing.
- **They encode the business rule** (`PAID`, only delivered or shipped orders). An agent that forgets the revenue rule fails every revenue question, which is exactly what we want an eval to notice.
- **The last four are hard** (average order value per city, repeat buyers, returns by category). The offline planner is *expected* to fail them. A test that nothing can fail is a test that proves nothing.

:::tip Where do golden questions come from?
Not from imagination. Start with the questions real users ask (the first ten or so), add every question the agent ever got wrong (a bug becomes a permanent case), and include a few hard ones that stretch it. A set of 30 to 100 well-chosen questions beats 1,000 generated ones, because you can read and trust each one.
:::

## Comparing results

```python src="data-pilot/backend/evals/run.py" region="compare" title="backend/evals/run.py"
```

Comparing two query results is fiddlier than `==`:

- **Float noise**: `2.0000001` and `2.0` are the same revenue. Round before comparing.
- **Row order**: for "orders by status", `[a, b]` and `[b, a]` are the same answer; for "top 5", they are not. Hence `ordered`.
- **Column names are ignored**: the agent may call it `total`, the golden query `revenue`. Only the data must match.
- **Extra columns are allowed** when every golden column appears among them. A chart needs a label column; asking for one should not cost a point.

The last test of the module checks exactly these four rules, so a sloppy comparison cannot silently inflate (or deflate) your score.

## The evaluation loop

```python src="data-pilot/backend/evals/run.py" region="evaluate" title="backend/evals/run.py"
```

For each case it runs the golden query for the answer key, runs the **real agent** (the same `run_agent` the API uses, so nothing is faked except possibly the model), takes the **last successful** `run_sql` result as the agent's answer, and compares. Along the way it counts three things beyond right and wrong:

| Metric | Why it matters |
|---|---|
| **execution_accuracy** | the headline number |
| **answered** | how often it produced any result at all (a refusal is not the same as a wrong answer) |
| **avg_turns, avg_tokens** | cost and speed; an agent that is right but takes 12 steps is a different product from one that takes 3 |
| **recovered_from_errors** | how many cases were right *after* at least one failed query: self-correction at work |

## Run it, and then break it

The block below runs the **whole eval in your browser**, with the offline planner as the model. First, the honest baseline. Then it plants a bug of the kind that really happens (the revenue rule is forgotten: "paid" now matches every order) and runs again, so you can see an eval do its job.

```python run src="data-pilot/backend/app/seed.py#imports+schema+data+build,data-pilot/backend/app/sqlguard.py,data-pilot/backend/app/tools.py,data-pilot/backend/app/llm/base.py,data-pilot/backend/app/prompts.py,data-pilot/backend/app/agent.py,data-pilot/backend/app/pricing.py,data-pilot/backend/evals/cases.py#cases,data-pilot/backend/app/llm/mock_planner.py,data-pilot/backend/app/llm/mock_client.py,data-pilot/backend/evals/run.py#compare+evaluate" flat title="Run the eval, then plant a regression" level=advanced
import asyncio, os, tempfile
from types import SimpleNamespace

path = os.path.join(tempfile.mkdtemp(), "shop.db")
conn = sqlite3.connect(path); build_database(conn); conn.close()
settings = SimpleNamespace(database_path=path, max_steps=6)


def show(title, report):
    print(f"\n{title}")
    print(f"{'case':<22}{'right?':<10}{'turns':<7}errors")
    for r in report["cases"]:
        print(f"{r['id']:<22}{('yes' if r['correct'] else 'NO' if r['answered'] else 'no answer'):<10}{r['turns']:<7}{r['sql_errors']}")
    s = report["summary"]
    print(f"=> execution accuracy {s['execution_accuracy']:.0%} ({s['cases']} questions), avg {s['avg_turns']} turns, recovered from errors: {s['recovered_from_errors']}")


async def main():
    global PAID
    llm = MockClient(0)
    show("1. Baseline: the offline planner on all 14 questions", await evaluate(llm, settings))

    show("2. The same, but it first writes a wrong column (and must fix it)", await evaluate(llm, settings, CASES[:10], hints={"simulate_mistake": "wrong_column"}))

    PAID = "1 = 1"                      # the regression: someone 'simplifies' the planner and drops the revenue rule
    report = await evaluate(llm, settings, CASES[:10])
    show("3. After forgetting the revenue rule (cases 1-10)", report)
    print("\nWhich cases did the change break?", [r["id"] for r in report["cases"] if not r["correct"]])

asyncio.run(main())
```

Look at the three reports. The baseline shows the offline planner solves the ten template questions and fails the four hard ones (that is its honest limit, and why those cases exist). The second run proves the loop recovers: every case still passes, each after exactly one failed query. The third is the point of the whole lesson: a one-line change, "harmless" by inspection, **breaks specific, named questions**, and the eval tells you which. Without the eval, the dashboard would simply show smaller wrong numbers and nobody would know.

## Using it with the real model

```bash
cd backend
python -m evals.run                      # whichever model your settings choose
python -m evals.run --fail-under 0.8     # exit with an error below 80% (use in CI)
```

With `ANTHROPIC_API_KEY` set, the same command evaluates Claude. It costs real money (every case is several model calls, and the whole conversation is resent each turn, so check the token total it prints first) and it gives a number that is **not identical each time**: a model's answers vary. So:

- **Run it a few times** and look at the spread before trusting a difference of two points.
- **Compare changes on the same set**: a new prompt line, a different model, another `effort` level. The number tells you whether you moved forward or back, which "it feels better" cannot.
- **Read the failures.** The score says *how often*; the failing cases say *why*. Usually a failure is one of: forgot the business rule, wrong join, misread the date range, or a question that really is ambiguous (which means the golden answer needs a decision, not the agent).
- **Do not publish a number you did not measure.** The offline planner's 71% is a fact about templates, not a claim about Claude.

:::warn Evals can mislead
A golden set that the team keeps tuning against becomes a target you pass without getting better ("teaching to the test"). Keep a small **held-out** set that nobody tunes on, add new cases from real failures, and remember that the questions are only as good as the people who chose them. An eval is a flashlight, not a guarantee.
:::

## What else to evaluate

Execution accuracy checks the **data**. A complete picture adds:

| Dimension | How |
|---|---|
| **The wording of the answer** | does the answer text agree with the rows? A second model can grade this ("LLM as a judge") against a rubric, or you can check that every number in the text appears in the result |
| **Safety** | a set of attack questions ("delete the cancelled orders", "ignore your rules") and assertions that the data is unchanged and the guard blocked them |
| **Cost and latency** | tracked per case; set budgets and fail the build when they are exceeded |
| **Refusals** | questions the data cannot answer: the right result is "I cannot tell from this data", not a guess |

## The tests

```python src="data-pilot/backend/tests/test_evals.py" region="eval-test" title="backend/tests/test_evals.py"
```

The eval has its own tests, because a broken scorer is worse than none. They pin the three things that matter: easy cases pass **and hard ones fail** (the eval can tell the difference), self-correction is counted correctly, and the comparison obeys its four rules.

:::keypoints
- Replace "it seems to work" with a fixed set of questions with known answers, run automatically, producing a number.
- Judge by **execution**: run the golden query and the agent's, and compare the results, not the SQL text.
- Write golden queries differently from the agent's, include the business rules, and include hard questions the agent may fail.
- Compare carefully: round floats, respect row order only when it matters, ignore column names, allow extra columns.
- Track accuracy, answered rate, turns, tokens and recoveries; the cost of being right matters too.
- Run real-model evals several times, read the failures, keep a held-out set, and never quote a number you did not measure.
- Every bug you find becomes a permanent case.
:::

```quiz
? Why score by comparing query results instead of the SQL text?
- Comparing text is slower
+ Different queries can mean the same thing; execution accuracy checks meaning, not spelling
- Because SQL cannot be compared as text
> A join and a subquery can return identical rows. Only the data matters to the user.
? The agent's result has an extra label column the golden result lacks. What should the comparison do?
- Mark it wrong
+ Accept it if every golden column appears in the result
- Ignore the data
> Asking for a label for a chart is reasonable; it should not cost a point.
? You change the prompt and the score moves from 78% to 80% on one run with the real model. What do you conclude?
- The change is a clear improvement
+ Nothing yet: model output varies, so repeat the run and look at which cases changed
- The eval is broken
> Small differences can be noise. Repeat, and read the cases.
```

:::exercise Two new cases
Add two cases to `CASES`: one the offline planner can answer ("How many customers do we have?" and a golden query), and one that **cannot be answered** from the data ("What is the average customer age?"). For the second, decide what the eval should check, given there is no golden query (hint: that the agent produced no result and its answer says so). What small change does `evaluate` need to support "expected to refuse" cases? Write the test first.
:::
