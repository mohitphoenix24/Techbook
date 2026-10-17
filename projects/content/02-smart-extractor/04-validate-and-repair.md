---
title: Validate and repair
level: easy
time: 40
summary: Check the model's answer against your rules, send it the exact errors when it fails, and know when to stop trying. The core loop of the project, traced step by step.
tags: validation, repair loop, retries, error messages
---

A well-formed answer can still be wrong. This lesson builds the loop that catches a wrong answer and gives the model a chance to fix it, and the discipline to give up gracefully when it cannot.

## The loop

```viz algo=seq title="Repair: the model sees its own mistake"
participant srv Pipeline [service]
participant llm Model [llm]
participant val Pydantic [guard]
srv -> llm : system + document (+ schema)
llm --> srv : JSON, but total = 4961.60
srv -> val : model_validate(json)
val --> srv : error: subtotal + tax is 4861.60 but total is 4961.60
srv -> llm : the same conversation + the bad answer + "Your JSON did not pass validation: ..."
llm --> srv : corrected JSON, total = 4861.60
srv -> val : model_validate(json)
val --> srv : ok
```

The repair turn is an ordinary multi-turn conversation: the model's own answer comes back as an `assistant` message, followed by a `user` message that lists the errors. Models are good at fixing a specific, named problem in something they just wrote.

:::def Repair loop
Validate the model's output; if it fails, send the validation errors back as the next message and ask for a corrected answer; repeat a small, fixed number of times. It turns many one-off model mistakes into successes at the price of one more call.
:::

## Step 1: turn errors into words

Pydantic's errors are structured data. We turn them into short `{path, message}` pairs that are useful to **three readers**: the model on the repair turn, the React form (which shows each message at the right field), and you in the logs.

```python src="smart-extractor/backend/app/extract.py" region="errors" title="backend/app/extract.py"
```

Two details:

- `loc` is a tuple like `("line_items", 0, "amount")`; joining it with dots gives the same path syntax the front end uses to find the field (`line_items.0.amount`).
- Our validators raise `ValueError("subtotal + tax is ...")`; Pydantic prefixes that with `Value error, `, which is noise for a reader, so we strip it.

## Step 2: the pipeline

```python src="smart-extractor/backend/app/extract.py" region="pipeline" title="backend/app/extract.py"
```

Read it for the decisions, not just the syntax:

| Decision | Why |
|---|---|
| `for attempt in range(1, max_repairs + 2)` | one first try plus `max_repairs` retries: a **hard cap**. An unbounded loop is an unbounded bill. |
| the conversation grows (`messages += [...]`) | the model needs to see its own bad answer to correct it |
| `hints` only on the first attempt | the simulated mistake happens once; the repair must be allowed to succeed |
| `usage = usage + result.usage` | repairs cost real money; the response reports the **total** across attempts |
| when out of attempts, **return** the data with `valid=False` | do not raise: the person can still fix a nearly-right result by hand, so we show it with errors flagged |
| JSON that does not parse also goes through repair | a rare but real failure; the message says "not valid JSON" |

The function returns an `Extraction` dataclass. It never raises for a *bad answer*; only a failure of the *call itself* (network, auth, refusal) raises `LLMError`, and the route turns that into an HTTP error.

## Step 3: watch it work

This block runs the real pipeline with the offline model asked to break a rule on its first attempt. A small wrapper prints each call so you can see the conversation grow.

```python local verify cwd="smart-extractor/backend" title="Trace a repair"
import asyncio, json
from app.doctypes import DOC_TYPES
from app.doctypes.samples import SAMPLES
from app.extract import extract_document
from app.llm.mock_client import MockClient

class Trace:
    """Wraps a model and prints what it is asked and what it answers."""
    name, model = "trace", "trace-1"
    def __init__(self, inner):
        self.inner, self.calls = inner, 0
    async def complete_json(self, *, system, messages, schema, max_tokens, hints=None):
        self.calls += 1
        result = await self.inner.complete_json(system=system, messages=messages, schema=schema, max_tokens=max_tokens, hints=hints)
        print(f"call {self.calls}: {len(messages)} message(s) sent, roles = {[m['role'] for m in messages]}")
        if len(messages) > 1:
            print("   last message:", messages[-1]["content"].splitlines()[1])
        print("   model answered: total =", json.loads(result.text)["total"])
        return result

async def main():
    doc = DOC_TYPES["invoice"]
    text = SAMPLES["invoice"][0]["text"]
    result = await extract_document(Trace(MockClient()), doc, text, hints={"simulate_mistake": "rule"})
    print(f"valid={result.valid} after {result.attempts} attempts, total={result.data['total']}, tokens in/out = {result.usage.input_tokens}/{result.usage.output_tokens}")

asyncio.run(main())
```

```output
call 1: 1 message(s) sent, roles = ['user']
   model answered: total = 4961.6
call 2: 3 message(s) sent, roles = ['user', 'assistant', 'user']
   last message: - (whole document): subtotal + tax is 4861.60 but total is 4961.60
   model answered: total = 4861.6
valid=True after 2 attempts, total=4861.6, tokens in/out = 1855/254
```

Notice the token count: the second call re-sends the whole document plus the model's first answer, so a repair costs a bit more than the first attempt. That is the price, and it is usually worth it.

## When repair does not help

Repair fixes mistakes the model can see. It does **nothing** when the problem is in the document, and it can make things worse if you are careless:

:::warn Three ways a repair loop goes wrong
1. **The information is not there.** If an invoice has no total, no number of retries will produce a *true* one; the model will invent a total that satisfies the arithmetic. The "do not add information that is not in the document" line in the repair message, and the grounding check in the next lesson, are the guards.
2. **An impossible rule.** A validator that rejects correct documents makes the model contort its answer to please it. When many repairs happen, suspect the rule, not the model. The response reports `attempts`, and you should chart it.
3. **Unbounded loops.** Always cap attempts, and always count the cost. Two repairs are usually enough: if the third try is still wrong, a person is cheaper.
:::

Here is the give-up path, with a model that never gets it right (the project's own test):

```python src="smart-extractor/backend/tests/test_extract.py" region="pipeline-tests" title="backend/tests/test_extract.py"
```

Look at what each test pins down: a clean answer needs **one** call; a broken one is repaired with the right *shape* of conversation (original, bad answer, errors); after the cap we return `valid=False` **and still show what the model said**; unparseable text is repaired too; a valid-but-invented value is *not* the repair loop's business (that is grounding, next).

## What the interface learns from this

The response carries `valid`, `attempts` and `issues`, so the React form can say the right thing:

- **Right first time:** a green banner.
- **Fixed after N retries:** a green banner that says so (you want to know how often this happens).
- **Still invalid:** a red banner with the broken rules, and the model's attempt shown for a person to fix.

:::keypoints
- A repair turn is a normal conversation: original request, the model's bad answer, then a message listing path and error.
- Cap the attempts (one try plus two repairs is typical) and add up the cost of every attempt.
- Return the invalid result, flagged, instead of raising: a nearly-right answer is useful to a person.
- Error messages are for three readers: the model, the form and you. Put the path in them.
- Repair cannot create information that is not in the document; guard against inventions with an explicit instruction and a grounding check.
- Chart `attempts`: many repairs usually mean a bad rule or a bad prompt, not a bad model.
:::

```quiz
? Why is the model's own previous answer included in the repair turn?
- To make the request longer
+ So the model can see exactly what it wrote and correct the specific fields that failed
- Because the API requires an assistant message
> A repair is a fix to a concrete piece of text. The model needs to see it, along with the list of problems.
? After max_repairs attempts the answer is still invalid. What does extract_document do?
- Raises an exception
+ Returns the data with valid=False and the errors as issues, so a person can fix it
- Retries forever
> Raising would lose a nearly-correct result. Returning it flagged lets a human finish the job.
? The repair loop ran three times on most documents of one type. What should you suspect first?
- The model is broken
+ A rule that rejects legitimate documents, or a prompt that does not explain the schema well
- The network
> If correct documents fail validation, the rule is wrong. Frequent repairs point at the rule or the prompt.
```

:::exercise Cap the cost
Add a setting `max_cost_usd_per_document` (default 0.05). In `extract_document`, stop repairing when the usage so far, priced with `cost_usd`, would exceed it, and return the result with an `error` issue "Stopped: cost limit reached". Write a test with a fake model whose usage is large. Why is a cost cap better than only counting attempts when documents vary from one page to fifty?
:::
