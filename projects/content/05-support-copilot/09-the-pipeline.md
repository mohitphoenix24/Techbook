---
title: The pipeline
level: advanced
time: 60
summary: Wire the stages into one traced, streaming pipeline: who may see which order, where it stops for a person, how errors are survived, and what is saved. Then run the whole copilot, real pipeline, real policy, real guardrails, real database, inside this page.
tags: orchestration, pipeline, streaming events, authorisation, error handling
---

You now have the parts: redaction, triage, a policy engine, retrieval, a drafting prompt and guardrails. The pipeline is the code that runs them in order, passes facts from one to the next, reports progress, and decides what happens when something goes wrong.

It is deliberately **not clever**. There is no framework and no "agent" choosing tools (that was Project 4). It is a sequence of steps with a few `if`s. For a process whose steps you know in advance, that is exactly right: easier to read, to test and to trust than a model deciding the order.

## Shape of the pipeline

```text
redact -> triage -+-> (needs a person?) -> STOP: escalate
                  |
                  +-> lookup -> decide -> retrieve -> draft -> check (-> revise once) -> save
```

It is an **async generator**. Each stage `yield`s events (`stage` start and done, `delta` for streamed words, `draft`, `error`, `done`), and the API turns each event into a Server-Sent Event for the browser (as in Projects 1 and 4). The generator is the single source of truth for "what happened".

## Who may see this order?

The lookup stage contains one of the most important security decisions in the project:

```python src="support-pilot/backend/app/pipeline.py" region="lookup" title="backend/app/pipeline.py"
```

Anyone can **type** an order number. A ticket from `mallory@example.com` that says "what is the status of AUR-1005?" is a request about *Meera's* order. If the pipeline simply loaded the order, the draft would cheerfully tell Mallory what Meera bought, when, and where it went.

So an order is used **only if it belongs to the email the ticket came from**. Otherwise the pipeline records `belongs_to_someone_else`, passes *no order* downstream, and the policy answers "we could not find an order for this customer, please share your order number". The customer learns nothing, and the trace explains why.

Two more details. If the customer named no order but has **exactly one**, we assume it (`only_order`); with several, we do not guess. And an order number that does not exist is treated like one that is not theirs: the reply must not reveal which of the two it was.

:::warn Authorisation is not the model's job
The model never decides who may see what. Access control belongs in code, *before* the model is involved, because a model that has been given the data may repeat it. Anything the model reads can end up in its output.
:::

## The process function

```python src="support-pilot/backend/app/pipeline.py" region="process" title="backend/app/pipeline.py"
```

Read it for the structure. A few things deserve attention.

**Everything is a span.** `with tracer.span("triage", ...)` wraps each stage, so the trace (lesson 11) has timings, tokens and cost for every step, nested under one `ticket` span. The stage events carry the span's duration to the browser as well.

**Stages report twice.** `_stage("triage", "start")` lets the interface show a spinner; `_stage("triage", "done", summary=..., triage=...)` gives it the result. Stages that are instant (decide, retrieve) only report when they finish.

**The escalation exit.** When `triage.needs_human` is true, nothing after it runs: no lookup, no policy, no draft. The ticket is saved as `escalated` and an audit entry says why. The rest of the function lives in the `else` branch.

**The decision is made by code, from facts.** `decide(...)` gets the category from triage, the order from lookup, and today's date and the approval limit from settings. Its result is put in a span (`sp.set(**asdict(decision))`), so the trace shows exactly which rule fired.

**Saving is the last step.** Only after the draft and its checks does the pipeline write the draft, the new status, and the audit entry. If anything raised earlier, the ticket keeps its old status.

**Errors are survived, not hidden.**

```python
except LLMError as exc:
    store.add_audit(ticket_id, user.name, user.role, "process_failed", f"{exc.code}")
    store.add_trace(ticket_id, tracer.summary(), tracer.to_list())
    yield {"type": "error", "code": exc.code, "message": exc.message, "retryable": exc.retryable}
    return
```

If the model provider is down (after the gateway's retries and fallback, lesson 10), the ticket stays as it was, the failure is in the audit log, the partial trace is saved (it is the best evidence of what failed), and the browser is told whether trying again makes sense. A support desk must never *lose* a ticket because an AI call failed.

## Run the whole copilot, in this page

Everything below is the real code: the real pipeline, the policy, the checks, the gateway (around the offline model), the tracer and a real SQLite database, running in your browser. Run it, then change `TICKET_NUMBERS` or `SIMULATE` and run again.

```python run src="support-pilot/backend/app/seed.py,support-pilot/backend/app/redact.py,support-pilot/backend/app/policy.py,support-pilot/backend/app/kb.py,support-pilot/backend/app/checks.py,support-pilot/backend/app/workflow.py,support-pilot/backend/app/pricing.py,support-pilot/backend/app/llm/base.py,support-pilot/backend/app/gateway.py,support-pilot/backend/app/tracing.py,support-pilot/backend/app/schemas.py,support-pilot/backend/app/prompts.py,support-pilot/backend/app/triage.py,support-pilot/backend/app/llm/mock_rules.py,support-pilot/backend/app/llm/mock_client.py,support-pilot/backend/app/store.py,support-pilot/backend/app/principal.py,support-pilot/backend/app/pipeline.py" flat title="The whole copilot, offline, in your browser" level=advanced
import asyncio, os, tempfile
from types import SimpleNamespace

TICKET_NUMBERS = [1, 5, 7, 17]       # 1 refund, 5 big refund (needs a lead), 7 legal threat, 17 someone else's order
SIMULATE = "none"                    # try "overpromise", "leak", "wrong_amount", "stubborn" or "flaky"

store = Store(os.path.join(tempfile.mkdtemp(), "desk.db"))
store.init(ORDERS, SAMPLE_TICKETS)
settings = SimpleNamespace(today=TODAY, refund_auto_limit_inr=5000, max_output_tokens=800)
gateway = Gateway(MockClient(0), clock=FakeClock(), per_minute=1000)
deps = Deps(store, gateway.bind("asha"), settings, Clock())
asha = Principal("Asha (agent)", "agent")


async def run(ticket_id):
    ticket = store.get_ticket(ticket_id)
    print(f"\n{'=' * 70}\n#{ticket_id}  {ticket['subject']}   <{ticket['from_email']}>")
    async for e in process_ticket(ticket, deps, asha, SIMULATE):
        kind = e["type"]
        if kind == "stage" and e["status"] == "done":
            print(f"  [{e['name']:<9}] {e.get('summary', '')}")
        elif kind == "stage" and e["name"] == "revise":
            print("  [revise   ] a blocking check failed: asking the model for one rewrite")
        elif kind == "draft":
            print("\n  DRAFT (version", e["draft"]["version"], ")\n    " + e["draft"]["text"].replace("\n", "\n    "))
            failing = [c["name"] for c in e["draft"]["checks"] if not c["ok"]]
            print("  checks failing:", failing or "none")
        elif kind == "error":
            print("  ERROR:", e["message"])
        elif kind == "done":
            t = e["trace"]
            print(f"\n  ticket is now: {e['status'].upper()}   ({t['spans']} spans, {t['tokens']} tokens, ${t['cost_usd']})")


async def main():
    for number in TICKET_NUMBERS:
        await run(number)
    print(f"\n{'=' * 70}\nAudit log of ticket 5:", [(a["action"], a["detail"][:40]) for a in store.audit(5)])
    print("Stored redactions of ticket 5 (counts only):", store.get_ticket(5)["redactions"])

asyncio.run(main())
```

Look at what each ticket did:

- **#1** goes all the way: a refund of ₹4,499, a draft with citations, every check green, status `drafted`.
- **#5** is the smart watch: a ₹12,999 refund, so the status is `needs_lead` instead (the policy said so), and its stored redactions are **counts only**.
- **#7** is escalated at triage: no lookup, no draft, a person must read it.
- **#17** is the privacy case: the lookup stage reports that the order belongs to someone else, so the reply asks for the order number and reveals nothing.

Now set `SIMULATE = "overpromise"` and run again: you will see `[revise]` appear, the first draft rewritten once, and the checks green. Set it to `"stubborn"` and the rewrite fails too: the draft is saved with failing checks, and the status machine of lesson 12 will refuse to approve it.

## The same thing through the API

In the real app, a route wraps `process_ticket` in a streaming response:

```python src="support-pilot/backend/app/routes/tickets.py" region="process-route" title="backend/app/routes/tickets.py"
```

- It checks the ticket exists and that **`process` is an allowed action** for this status and role.
- It refuses a second request while one is running for the same ticket (`busy`), so two clicks cannot create two drafts that race.
- The model is **bound to the signed-in person** (`get_pipeline_deps`): their rate limit and daily budget apply, not a shared one.
- The `finally` removes the ticket from the busy set even if the browser closes the connection.

## Tests

```python src="support-pilot/backend/tests/test_pipeline.py" region="pipeline-tests" title="backend/tests/test_pipeline.py"
```

The last test is a loop over **all 18 demo tickets**, comparing the triage and the decision with what a careful person concluded. It is the cheapest and most valuable kind of test for a pipeline: one table of real cases that runs every stage.

:::keypoints
- A pipeline is a sequence of steps with a few conditions. When you know the steps, you do not need an agent to choose them.
- Make it an async generator of events: one source of truth for what happened, streamed to the browser and recorded in the trace.
- Authorise before the model: an order number is only used if it belongs to the ticket's sender, and the reply must not reveal which kind of failure it was.
- Stop for a person when triage says so. Save only at the end. Survive provider errors without losing the ticket, and record them.
- Bind the model to the signed-in user so limits and budgets are per person, and guard against two runs at once on a ticket.
- A table-driven test over every demo ticket exercises the whole pipeline.
:::

```quiz
? Why is an order number used only if it belongs to the ticket's sender?
- To make lookups faster
+ Anyone can type an order number; using it for someone else would leak that person's order to the sender
- Order numbers are unique
> Authorisation belongs in code, before the model sees any data.
? The model provider is down after all retries. What happens to the ticket?
- It is deleted
+ It keeps its old status, the failure is audited and traced, and the browser learns whether retrying makes sense
- It is marked sent
> A support desk must never lose a ticket because an AI call failed.
? When triage says needs_human, which stages still run?
- Lookup, policy, draft
+ None: the ticket is saved as escalated and the pipeline stops
- Only the draft
> A message that needs a person is not drafted at all.
```

:::exercise Add a stage
Add a `sentiment trend` stage between lookup and decide: if the same customer has opened **three or more tickets in the last 30 days**, set a flag in the trace and have the draft's first sentence acknowledge that ("I can see this is not the first time you have written to us"). Where does the customer's history come from (the store)? Is it a fact given to the model, or a rule? Write the span, the event and the test.
:::
