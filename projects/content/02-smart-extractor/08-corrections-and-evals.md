---
title: Corrections become tests: evals
level: easy
time: 40
summary: Turn a person's corrections into golden test cases, score the extractor field by field, read an eval report, and use it to make changes with confidence. The scoring code runs in your browser.
tags: evals, golden set, human in the loop, metrics
---

You can now extract, validate, repair and ground. But how do you know it is **good**? And when you change the prompt, switch to a cheaper model, or add a document type, how do you know you did not make things *worse*?

The answer is an **eval**: a fixed set of documents with known-correct answers, and a number that says how close you get. Without one you are steering by feel; with one you can improve like an engineer.

:::def Eval
A repeatable test for model-based software: run the real pipeline on a set of cases, compare the output with the right answers, and report metrics. Unlike a unit test, an eval returns a *score* (87%) not a pass or fail, because a model is rarely 100% right.
:::

## Where good test cases come from

Writing test cases by hand is slow and biased toward what *you* think is hard. The best source is **your users**. Every time a person opens a result, fixes a field and presses **Save corrections** (or **Confirm as correct**), they hand you a perfect test case: the document, and the answer a human approved.

That is why the review route stores the model's answer and the corrected one side by side, and why it validates corrections against the same schema (a typo in a "correct" total would otherwise teach your eval the wrong lesson). One route turns the table into a file:

```python src="smart-extractor/backend/app/routes/extract.py" region="export-route" title="backend/app/routes/extract.py"
```

```python src="smart-extractor/backend/tests/test_api.py" region="export-test" title="backend/tests/test_api.py"
```

The loop closes like this:

:::flow The improvement loop
Use | people extract documents in the app
Correct | they fix and approve results
Export | download the reviewed cases as JSON Lines
Measure | run the eval before and after a change
Decide | keep the change, or throw it away
:::

## Scoring one case

The unit of scoring is a **field**. Every value in the expected answer counts once, and it is right if the extractor produced the same value after normalisation (case, extra spaces and float noise do not matter).

```python src="smart-extractor/backend/app/scoring.py" region="normalise" title="backend/app/scoring.py"
```

```python src="smart-extractor/backend/app/scoring.py" region="score" title="backend/app/scoring.py"
```

Three design choices to notice:

1. **Field accuracy, not document accuracy.** A document with 20 fields and one wrong is 95% right, not a failure. Field accuracy shows *where* the extractor is weak (always the dates? always the tax?); document-level *exact match* shows how often a person can approve without touching anything. You want both.
2. **Free text is not scored by exact match.** A summary or a task description is worded differently each time, so each document type lists its `free_text` paths and they are skipped. (They need a different judge: a person, or a second model asked "do these two sentences mean the same?", which is the subject of Project 5.)
3. **Lists are compared by position.** It is strict and simple. The right items in the wrong order score zero; real systems often match items by their content instead.

Try it. This block runs the real `scoring.py` (with the files it imports) in your browser. Edit the "actual" data and watch the numbers.

```python run src="smart-extractor/backend/app/dates.py,smart-extractor/backend/app/grounding.py,smart-extractor/backend/app/scoring.py" flat title="Score a few extractions (the real scoring.py)" level=intermediate
expected = {"vendor": "Sharma Stationers", "total": 4861.6, "due_date": "2026-11-13",
            "line_items": [{"description": "A4 Paper", "amount": 2500.0}, {"description": "Ball pens", "amount": 720.0}]}

actual_good = {"vendor": "sharma  stationers", "total": 4861.60, "due_date": "2026-11-13",
               "line_items": [{"description": "A4 paper", "amount": 2500.0}, {"description": "Ball pens", "amount": 720.0}]}
actual_bad = {"vendor": "Sharma Stationery", "total": 4816.6, "due_date": None,
              "line_items": [{"description": "Ball pens", "amount": 720.0}, {"description": "A4 Paper", "amount": 2500.0}]}

scores = []
for name, actual in [("good", actual_good), ("bad", actual_bad)]:
    s = score_case(expected, actual)
    scores.append(s)
    print(f"{name}: {s.correct}/{s.total} fields right ({s.accuracy:.0%}), exact match: {s.exact}")
    for path, want, got in s.wrong:
        print(f"    {path}: expected {want!r}, got {got!r}")

print()
print(summarise(scores))
```

The bad case teaches three things at once: a **near miss** (`Stationery`) scores zero for that field; a **transposed digit** in the total is wrong even though it looks close; and **swapped list items** lose four fields because lists are compared by position.

## The golden cases

```python src="smart-extractor/backend/evals/cases.py" region="cases" title="backend/evals/cases.py"
```

Seven cases are documents the offline model was built for. **Three are deliberately hard**: a prose-style invoice, a message in Hinglish, and meeting notes in lower case. An eval that every case passes tells you nothing; you want some that fail, so that you can see an improvement.

## Running the eval

```python src="smart-extractor/backend/evals/run.py" region="run" title="backend/evals/run.py"
```

The runner uses the *real* pipeline (repairs, grounding and all) and the model your settings choose, and reports, per case and overall:

| Metric | Meaning | Why it matters |
|---|---|---|
| **field accuracy** | fields right out of all fields | the headline number |
| **exact match** | documents with every field right | how often nobody needs to correct anything |
| **valid rate** | answers that pass every rule (after repairs) | how often the form is not red |
| **first-try rate** | valid with **no** repair | how much you rely on the repair loop, and its cost |
| **ungrounded** | values flagged "not in the document" | a hallucination measure |

```python local verify cwd="smart-extractor/backend" title="Run the eval from Python"
import asyncio
from app.llm.mock_client import MockClient
from evals.run import print_report, run_evals

report = asyncio.run(run_evals(MockClient()))
print_report(report)
```

```output
case                      valid  tries  accuracy  ungrounded wrong fields
invoice-stationery        True   1      100%      0          
invoice-freelance         True   1      100%      0          
meeting-product-sync      True   1      100%      0          
meeting-standup           True   1      100%      0          
ticket-double-charge      True   1      100%      0          
ticket-crash              True   1      100%      0          
ticket-dark-mode          True   1      100%      0          
invoice-prose-layout      False  3      31%       0          invoice_number, invoice_date, subtotal, line_items.0.description ...
ticket-hinglish           True   1      71%       0          priority, sentiment
meeting-lowercase         True   1      78%       0          action_items.0.owner, action_items.1.owner

10 cases | field accuracy 86.8% | exact match 70% | valid 90% | right first time 90%
```

Reading the report: seven documents are perfect. `invoice-prose-layout` is **invalid after 3 tries**: the offline model finds no line items in that layout, and the repair loop cannot invent what it cannot see. `ticket-hinglish` gets the category right but misses `priority` and `sentiment`: the rules know no Hindi words. `meeting-lowercase` loses the owners because its pattern wants capital letters. Each row points at something specific to fix.

## Using it day to day

From the command line, with whatever model your settings choose:

```bash
python -m evals.run                      # print the table
python -m evals.run --fail-under 0.9     # exit with an error if field accuracy is below 90% (use it in CI)
python -m evals.run --cases mine.jsonl   # your own cases, from GET /api/export/eval-cases
```

A habit that will serve you for years: **never change a prompt, a schema or a model without running the eval before and after.** Keep a log:

| Change | Field accuracy | Exact match | Valid | Cost per document |
|---|---|---|---|---|
| baseline | | | | |
| reworded the rule about dates | | | | |
| switched to Haiku 5.5 for invoices | | | | |
| added two examples to the prompt | | | | |

Fill it in with your real numbers. Decisions such as "is the cheaper model good enough?" become a question you can *answer*: a Haiku model that scores within a point of Sonnet on invoices at a twentieth of the price is a different conversation from one that loses ten points.

:::warn Four ways evals mislead
1. **Too few cases.** Ten cases move 10 points per mistake. Start with a few dozen and add every failure you find in production.
2. **Tuning on the test.** If you read the failing cases and copy their layouts into your prompt as examples, the eval will rise and the real world will not. Keep a part of the cases **unseen**, and look only at the overall number for those.
3. **Easy cases only.** Real documents are skewed, rotated, bilingual and half-filled. Include them.
4. **Trusting the metric blindly.** 96% field accuracy with every *total* wrong is a disaster. Look at the per-field numbers, and weigh the fields that matter most (money) more than the rest.
:::

## What a person can still catch that an eval cannot

An eval says how often you are right on known cases. The **review screen** is what handles the unknown ones: the banner, the evidence highlights and the flagged fields exist so that a person can check the 5% that matter in seconds rather than the whole document in minutes. A good extraction product uses both: evals to improve, review to protect.

:::keypoints
- An eval is a fixed set of documents with correct answers and a score; it turns "feels better" into a number.
- The best test cases are people's corrections: store the model's answer and the approved one side by side, validate the corrections, and export them.
- Score per field (where is it weak?) and per document (how often is no edit needed?), and skip free-text fields.
- Track field accuracy, exact match, valid rate, first-try rate and ungrounded count, plus cost.
- Run the eval before and after every change; keep some cases unseen; start with a few dozen and add every production failure.
:::

```quiz
? Why does the scorer skip fields like a ticket's summary?
- They are too long to compare
+ The model words them differently each time, so exact match would punish correct answers
- Summaries are not saved
> Free text needs a different judge: a person, or a model asked whether two texts mean the same.
? What does "first-try rate" tell you?
- How fast the first request is
+ How often the answer is valid with no repair, which shows how much you depend on (and pay for) the repair loop
- How many users succeed on their first visit
> A low first-try rate with a high valid rate means repairs are doing a lot of work, which costs money and time.
? You copy your failing eval cases into the prompt as examples and the score rises to 98%. Is the extractor really better?
- Yes, it learned
+ Not necessarily: you tuned on the test, so keep unseen cases to measure real improvement
- No, scores can never rise
> Examples taken from the eval make the eval easy. Hold out a set of cases you never look at.
```

:::exercise Fix a failure and measure it
Make `OWNER` in `app/llm/mock_extractors.py` accept lower-case names, so `nisha to share the mockups` gets owner `nisha`. Run `python -m evals.run` before and after. Which case improves, and does any other case get worse? (If you can break an easy case with your change, you have just experienced the reason for running the *whole* eval after every edit.)
:::
