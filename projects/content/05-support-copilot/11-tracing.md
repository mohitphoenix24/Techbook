---
title: Tracing
level: advanced
time: 50
summary: Record every run as a tree of timed spans with tokens and cost, without ever recording personal data. A small tracer you can read in one go, the trace one ticket really produces, and a waterfall view drawn from plain geometry, live in your browser.
tags: observability, tracing, spans, cost, debugging
---

On Monday a team lead says: "Ticket 5 took 11 seconds and the draft was odd." What do you do? Without records, you guess: was the model slow? Did a retry happen? Which article was retrieved? Was the draft rewritten? You cannot reproduce it, because the model's answer varies and the order has changed since.

With a **trace**, you open the ticket and read exactly what happened: every stage, in order, how long each took, how many tokens it used, what it cost, whether it was retried, and which check failed. Debugging an AI feature without traces is archaeology. With them it is reading.

## Logs, metrics and traces

| | Answers | Example |
|---|---|---|
| **Logs** | "what was said?" | one line per event, searchable text |
| **Metrics** | "how is the system doing?" | tickets per hour, average cost, error rate |
| **Traces** | "what happened in *this* request?" | one run as a tree of timed steps |

For an AI pipeline, traces are the most useful of the three, because the interesting failures are about **one particular run** (a strange draft, a slow answer, an unexpected cost). Metrics tell you *that* something drifted; the trace tells you *why*.

## The tracer

A trace is a **tree of spans**. A span is one piece of work: a name, a start, a duration, a status, and a few attributes. A span can contain other spans.

```python src="support-pilot/backend/app/tracing.py" region="span" title="backend/app/tracing.py"
```

```python src="support-pilot/backend/app/tracing.py" region="tracer" title="backend/app/tracing.py"
```

Notes on the design:

- **A context manager.** `with tracer.span("triage", model="x") as s:` starts the clock on entry and stops it on exit, even if an exception is raised. You cannot forget to end a span.
- **A stack gives the nesting.** A span opened while another is open becomes its child.
- **Errors are recorded and re-raised.** `__exit__` returns `False`, so the exception continues to propagate. *A trace observes; it never decides.* If it swallowed errors, adding tracing would change the program's behaviour.
- **The clock is injected** (the same `Clock` as the gateway), so tests can assert on exact durations.
- **`summary()`** adds up the numbers a person wants first: total time, total cost, tokens, error count.

## What goes in a span (and what must not)

The pipeline puts only **safe, useful** facts in attributes:

| Stage | Attributes |
|---|---|
| redact | counts of what was hidden (`{"EMAIL": 1}`), never the values |
| triage | model, tokens, cost, `cached`, `attempts`, `repaired`, `fell_back`, the category and priority |
| lookup | the order id and *how* it was found (`named`, `only_order`, `belongs_to_someone_else`) |
| decide | the whole decision (action, code, amount, needs_lead) |
| retrieve | the article ids |
| draft / revise | model, tokens, cost, attempts |
| check | the names of the checks that failed |

:::warn A trace is a log, so it is a leak waiting to happen
Anything in a span is stored, shown to whoever can open traces, and often forwarded to third-party tools. So the rule is the same as for logs: **never put raw customer text or personal data in an attribute.** Redaction (lesson 3) runs first, and the pipeline's spans carry ids, counts and numbers only. The end-to-end test asserts it: it searches the whole trace for Meera's phone number and email and fails if either is found.
:::

## See one

A tracer driven by a fake clock, mimicking one ticket. The durations are made up, but the structure is exactly what the pipeline produces:

```python run src="support-pilot/backend/app/gateway.py#imports+clock,support-pilot/backend/app/tracing.py" flat title="Build a trace and print it as a waterfall" level=intermediate
clock = FakeClock()
tracer = Tracer(clock)

with tracer.span("ticket", id=5):
    with tracer.span("redact") as s:
        clock.advance(0.003); s.set(redactions={"EMAIL": 1, "PHONE": 1})
    with tracer.span("triage", model="claude-sonnet-5-5") as s:
        clock.advance(0.640); s.set(input_tokens=420, output_tokens=60, cost_usd=0.00144, attempts=3, cached=False)
    with tracer.span("lookup") as s:
        clock.advance(0.004); s.set(order="AUR-1005", how="named")
    with tracer.span("decide") as s:
        clock.advance(0.001); s.set(action="refund", amount=12999, needs_lead=True)
    with tracer.span("draft", model="claude-sonnet-5-5") as s:
        clock.advance(2.100); s.set(input_tokens=1100, output_tokens=140, cost_usd=0.0036)
        with tracer.span("check") as c:
            clock.advance(0.002); c.set(failed=["no_overpromise"])
    with tracer.span("revise", model="claude-sonnet-5-5") as s:
        clock.advance(1.900); s.set(input_tokens=1350, output_tokens=130, cost_usd=0.004)
        with tracer.span("check") as c:
            clock.advance(0.002); c.set(failed=[])

total = tracer.summary()["duration_ms"]
print(f"{'span':<14}{'start':>8}{'took':>9}   waterfall (each # is {total / 40:.0f} ms)")
for sp in tracer.to_list():
    depth = 0
    parent = sp["parent"]
    while parent:                                   # indent by nesting
        depth, parent = depth + 1, tracer.spans[parent - 1].parent
    left, width = round(sp["start_ms"] / total * 40), max(1, round(sp["duration_ms"] / total * 40))
    print(f"{'  ' * depth + sp['name']:<14}{sp['start_ms']:>7.0f}ms{sp['duration_ms']:>7.0f}ms   {' ' * left}{'#' * width}")

print("\nSummary:", tracer.summary())
slowest = max((s for s in tracer.spans if s.parent == 1), key=lambda s: s.duration_ms)
print(f"Slowest stage: {slowest.name} ({slowest.duration_ms:.0f} ms), {slowest.duration_ms / total:.0%} of the run")
```

The shape tells a story before you read a number: two long bars (the draft and the rewrite), and a rewrite that exists because the first draft failed `no_overpromise`. The summary adds up the cost of *both* model calls, so the real price of that ticket is visible, not just the price of the first draft.

## The waterfall in the browser

The interface draws a trace as a **waterfall**: one row per span, indented by depth, with a bar positioned by time. The layout is a pure function, separate from the drawing, so it is easy to test:

```ts src="support-pilot/frontend/src/waterfall.ts" region="layout" title="frontend/src/waterfall.ts"
```

Each row's `left` and `width` are percentages of the whole trace. A very short span still gets a minimum width so it never disappears, and an orphan (a span whose parent is missing) is drawn at depth zero rather than crashing.

Here is the real `layout` function drawing three traces: a normal run, one with provider retries, and one with a revision. Pick one and hover a bar for the span's attributes.

```tsx run src="support-pilot/frontend/src/waterfall.ts" title="The real waterfall layout on three traces" level=intermediate autoclick="With a revision"
import { useState } from "react";

const sp = (id: number, parent: number | null, name: string, start_ms: number, duration_ms: number, attrs: Record<string, unknown> = {}, status: "ok" | "error" = "ok"): Span => ({ id, parent, name, start_ms, duration_ms, status, attrs });

const TRACES: Record<string, Span[]> = {
  "Normal": [sp(1, null, "ticket", 0, 2300), sp(2, 1, "redact", 0, 3), sp(3, 1, "triage", 3, 610, { model: "claude-sonnet-5-5", cost_usd: 0.0014 }), sp(4, 1, "lookup", 613, 4), sp(5, 1, "decide", 617, 1),
             sp(6, 1, "retrieve", 618, 2), sp(7, 1, "draft", 620, 1680, { model: "claude-sonnet-5-5", cost_usd: 0.0036 }), sp(8, 7, "check", 2298, 2)],
  "With retries": [sp(1, null, "ticket", 0, 3400), sp(2, 1, "redact", 0, 3), sp(3, 1, "triage", 3, 1500, { model: "claude-sonnet-5-5", attempts: 3, note: "two provider errors, then success" }),
                   sp(4, 1, "lookup", 1503, 4), sp(5, 1, "decide", 1507, 1), sp(6, 1, "draft", 1510, 1880, { model: "claude-sonnet-5-5" }), sp(7, 6, "check", 3388, 2)],
  "With a revision": [sp(1, null, "ticket", 0, 4800), sp(2, 1, "redact", 0, 3), sp(3, 1, "triage", 3, 600), sp(4, 1, "decide", 603, 1), sp(5, 1, "draft", 604, 1700, { cost_usd: 0.0036 }),
                      sp(6, 5, "check", 2302, 2, { failed: ["no_overpromise"] }, "error"), sp(7, 1, "revise", 2304, 2490, { cost_usd: 0.004 }), sp(8, 7, "check", 4792, 2, { failed: [] })],
};

export default function App() {
  const [which, setWhich] = useState("Normal");
  const rows = layout(TRACES[which]);
  return (
    <div className="stack">
      <style>{`.w{display:grid;grid-template-columns:120px 1fr 64px;gap:8px;align-items:center;font-size:13px;margin:3px 0}.lane{position:relative;height:14px;background:var(--card);border-radius:7px}.bar{position:absolute;top:0;height:100%;border-radius:7px;background:var(--accent)}.bar.error{background:var(--danger)}`}</style>
      <div className="row">{Object.keys(TRACES).map((k) => <button key={k} className={k === which ? "primary" : ""} onClick={() => setWhich(k)}>{k}</button>)}</div>
      <div className="card">
        {rows.map(({ span, depth, left, width }) => (
          <div className="w" key={span.id}>
            <span style={{ paddingLeft: depth * 14 }}>{span.name}</span>
            <span className="lane"><span className={`bar ${span.status}`} style={{ left: `${left}%`, width: `${width}%` }} title={JSON.stringify(span.attrs)} /></span>
            <span className="muted">{formatMs(span.duration_ms)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Switch between the three. A retry shows up as one *fat* triage bar, a rewrite as a second long bar after a red `check`. Nobody has to be told the story: the picture is the story.

## What to do with traces

| Use | How |
|---|---|
| **debugging one ticket** | open its trace beside the draft (the app's "Trace: how this draft was made") |
| **finding what is slow** | look at which stage takes the largest share, across many traces |
| **finding what is costly** | sum `cost_usd` by stage: usually the draft, and every *revise* doubles it |
| **proving a rule fired** | the `decide` span holds the decision code |
| **an incident** | "provider errors started at 14:05": count `attempts > 1` over time |

In a bigger system you would send spans to an observability tool. **OpenTelemetry** is the standard format for this, and the fields here (a name, start, duration, status, attributes, a parent) map directly onto it, so moving later is a translation, not a redesign.

Two policies to settle before launch: **retention** (traces are data; keep them for a defined time, then delete them) and **access** (who may open traces, given they describe customers' tickets even without personal data).

## Tests

```python src="support-pilot/backend/tests/test_tracing.py" region="tracing-tests" title="backend/tests/test_tracing.py"
```

```ts src="support-pilot/frontend/src/waterfall.test.ts" title="frontend/src/waterfall.test.ts"
```

:::keypoints
- A trace answers "what happened in this run?": a tree of timed spans with tokens, cost and status. Debugging an AI feature without one is guesswork.
- Use a context manager so a span always ends, record errors but re-raise them (a trace observes, it never decides), and inject the clock for exact tests.
- Put only safe facts in attributes: ids, counts, numbers, names of failed checks. Never raw customer text or personal data.
- Record retries, cache hits, repairs and revisions as attributes: they explain slowness and cost.
- Keep layout (numbers to positions) separate from drawing, so it is a testable pure function.
- Decide retention and access for traces before launch.
:::

```quiz
? Why does the span's context manager return False from `__exit__`?
- To mark the span as failed
+ So an exception is not swallowed: tracing must observe behaviour, not change it
- To stop the clock
> If tracing hid errors, adding it would change how the program fails.
? Which attribute is safe to put in a span?
- The customer's message
+ The names of the checks that failed
- The customer's phone number
> Ids, counts, numbers and names are safe; raw text and personal data are not.
? A trace shows two long bars after the triage. What is the most likely story?
- A slow database
+ The first draft failed a blocking check and was rewritten: two model calls, so twice the time and cost
- The browser was slow
> Revisions are visible in the waterfall, and in the summed cost.
```

:::exercise Find the slow stage
Process all 18 demo tickets in the running app (or in the lesson 9 block), collect each trace's `summary` and the duration of each stage span, and compute the average per stage. Which stage dominates with the offline model? With a real model, which would you expect to dominate, and what *one* change would save the most money or time? Where would you add a span you are missing (for example around the database writes)?
:::
