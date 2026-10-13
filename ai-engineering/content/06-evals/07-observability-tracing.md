---
title: Observability — Traces, Spans, Cost and Debugging
level: intermediate
time: 45
summary: You cannot fix what you cannot see. The anatomy of an LLM trace (traces, spans, generations, tool calls, retrievals), what to log and what to redact, OpenTelemetry's GenAI conventions, the tools (Langfuse, LangSmith, Phoenix, Braintrust), cost and latency tracking, sampling, dashboards and alerts, and a runnable tracer with span trees and cost roll-ups.
---

Traditional software observability asks: is the service up, how fast is it, where do errors happen? LLM systems need all of that **plus**: what exactly did the model see and say, which documents were retrieved, which tools were called with what arguments, how many tokens did it cost, and was the answer any good? **Observability for AI** is the foundation for debugging, evals, cost control and the improvement loop.

## The data model: traces, spans, generations

:::def Trace
The complete record of one request or user interaction, from input to final output, made of nested **spans**. Each span has a name, start and end time, attributes (inputs, outputs, metadata), a parent, and a status.
:::

| Span type | What it records |
|---|---|
| **Generation** (LLM call) | model, parameters, full prompt/messages, output, token counts (input, output, cached), latency, time to first token, cost, stop reason |
| **Retrieval** | the query, filters, returned chunk ids with scores and sources, latency |
| **Tool call** | tool name, arguments, result (or error), latency |
| **Chain / step** | a logical stage (rewrite, rerank, guardrail check) |
| **Agent run** | the root span containing many steps, with budget and outcome |
| **Evaluation / score** | a score attached to a trace or span (by a judge, code, or a user) |

```viz algo=arch title="A trace is a tree of spans" dir=down
root  Trace: answer_question | 4.2 s, $0.011 [agent] @1,0
rw    Span: rewrite_query | 0.4 s [prompt] @0,1.4
ret   Span: retrieve | 0.2 s, 8 chunks [search] @1,1.4
rr    Span: rerank | 0.3 s [filter] @2,1.4
gen   Generation: llm_answer | 3.1 s, 3.8K in / 280 out [llm] @1,2.8
guard Span: citation_check | 0.2 s [guard] @2,2.8
--
root -> rw
root -> ret
root -> rr
root -> gen
root -> guard
```

## What to capture on every request

1. **Identity and context**: trace id, session/conversation id, user or tenant id (hashed if needed), app version, **prompt version**, model and version, environment.
2. **Inputs and outputs** of each step (subject to redaction).
3. **Retrieval details**: query, filters, chunk ids and scores (both stages), final context size.
4. **Tool calls**: name, arguments, results, errors, durations.
5. **Token usage**: input, output, **cached read and write**, reasoning tokens; **cost** computed at log time with the then-current prices.
6. **Latency**: total, per span, and **time to first token**.
7. **Outcome**: stop reason, errors, retries, fallbacks used, guardrail triggers.
8. **Feedback and scores**: thumbs, edits, judge scores, attached later by id.
9. **Sampling flags**: whether this trace is in a review or eval sample.

## Privacy: log less than you could

Prompts and completions often contain **personal and confidential data**. Decide deliberately:

- **Redact or tokenise PII** (emails, phones, card numbers, names) before storing; test the redactor.
- **Retention limits**: keep full content for days or weeks; keep metrics and hashes longer.
- **Access control**: traces are as sensitive as the data they contain.
- **Opt-outs and legal holds**: honour deletion requests, including in traces.
- **Environment separation**: never mix production traces into shared dev tools without review.
- Offer **metadata-only mode** for highly sensitive tenants.

```python run title="A redactor for logs (and why you must test it)" level=easy
import re

PATTERNS = {
    "EMAIL": r"[\w.+-]+@[\w-]+\.[\w.-]+",
    "PHONE": r"\b(?:\+?\d{1,3}[ -]?)?(?:\(?\d{3}\)?[ -]?)\d{3}[ -]?\d{4}\b",
    "CARD":  r"\b(?:\d[ -]?){13,16}\b",
}

def redact(text):
    for label, pat in PATTERNS.items():
        text = re.sub(pat, f"<{label}>", text)
    return text

samples = ["Contact me at priya.sharma@example.com or 555-123-4567.",
           "My card is 4111 1111 1111 1111, please refund.",
           "Order A-100 shipped on 2026-10-05."]
for s in samples: print(redact(s))
```

## A minimal tracer

The idea behind every observability SDK: **context managers** that start and end spans, nest automatically, and record attributes.

```python run title="Build a tiny tracer with nested spans and cost roll-up" level=advanced
import time, itertools
from contextlib import contextmanager

class Tracer:
    def __init__(self):
        self.spans, self.stack, self.ids = [], [], itertools.count(1)
        self.clock = 0.0                          # a fake clock so output is deterministic
    @contextmanager
    def span(self, name, kind="step", **attrs):
        s = {"id": next(self.ids), "parent": self.stack[-1]["id"] if self.stack else None, "name": name, "kind": kind,
             "start": self.clock, "attrs": dict(attrs), "children_cost": 0.0}
        self.stack.append(s)
        try:
            yield s
        except Exception as e:
            s["error"] = f"{type(e).__name__}: {e}"; raise
        finally:
            s["end"] = self.clock
            self.stack.pop(); self.spans.append(s)
    def advance(self, seconds): self.clock += seconds

PRICE_IN, PRICE_OUT = 2.0, 10.0                    # $ per million tokens (example)

def llm_call(tr, name, tokens_in, tokens_out, seconds):
    with tr.span(name, kind="generation", tokens_in=tokens_in, tokens_out=tokens_out) as s:
        tr.advance(seconds)
        s["attrs"]["cost"] = (tokens_in * PRICE_IN + tokens_out * PRICE_OUT) / 1e6

tr = Tracer()
with tr.span("answer_question", kind="agent"):
    with tr.span("rewrite_query", kind="chain"):
        llm_call(tr, "llm_rewrite", 600, 40, 0.4)
    with tr.span("retrieve", kind="retrieval", k=8):
        tr.advance(0.2)
    with tr.span("rerank", kind="chain"):
        tr.advance(0.3)
    llm_call(tr, "llm_answer", 3800, 280, 3.1)
    with tr.span("citation_check", kind="chain"):
        tr.advance(0.2)

def render(spans):
    by_parent = {}
    for s in spans: by_parent.setdefault(s["parent"], []).append(s)
    def total_cost(s): return s["attrs"].get("cost", 0.0) + sum(total_cost(c) for c in by_parent.get(s["id"], []))
    def walk(parent, depth):
        for s in sorted(by_parent.get(parent, []), key=lambda x: x["start"]):
            dur = s["end"] - s["start"]
            cost = total_cost(s)
            print(f"{'  ' * depth}{s['name']:<18} {dur:>5.1f}s" + (f"  ${cost:.4f}" if cost else ""))
            walk(s["id"], depth + 1)
    walk(None, 0)

render(tr.spans)
```

Real SDKs add **automatic instrumentation** (patching the Anthropic/OpenAI clients and frameworks so every call becomes a span), **async context propagation**, batching/export to a backend, and sampling.

## Standards and tools

- **OpenTelemetry GenAI semantic conventions** ([spec](https://opentelemetry.io/docs/specs/semconv/gen-ai/)) define standard attribute names (`gen_ai.request.model`, `gen_ai.usage.input_tokens`, ...), so traces from different libraries look the same and flow into any OTel backend.
- **Platforms** (many open source or self-hostable): **Langfuse** ([docs](https://langfuse.com/docs)), **Arize Phoenix** ([docs](https://docs.arize.com/phoenix)), **LangSmith** ([docs](https://docs.smith.langchain.com)), **Braintrust** ([docs](https://www.braintrust.dev/docs)), plus general APM vendors adding LLM views. Common features: trace viewer, prompt management, datasets and experiments, evaluators on traces, cost and latency dashboards.
- **AI gateways** (LiteLLM, Portkey, and cloud gateways) log every call centrally, enforce budgets, and cache.

Choose by: self-hosting needs, OTel support, evaluation features, cost, integration with your frameworks, and data-residency rules.

## Cost and latency analytics

Aggregate from traces:

- **Cost per request, per user, per tenant, per feature, per prompt version, per model.**
- **Tokens by component** (system prompt, retrieved context, history, output): finds the fat to trim.
- **Cache hit rate** (cache read tokens ÷ input tokens).
- **Latency percentiles** (p50/p95/p99) overall and per span; **time to first token**.
- **Retry, fallback and error rates**.

Set **budgets and alerts**: daily spend per feature, cost per request above a threshold, sudden jumps in input tokens (a prompt change or a retrieval bug), and abnormally long agent runs.

```python run title="Roll up cost by component and find the fat" level=easy
requests = [  # tokens by component for sampled requests
    {"system": 1800, "tools": 2400, "history": 900,  "retrieved": 4200, "question": 40, "output": 320},
    {"system": 1800, "tools": 2400, "history": 3100, "retrieved": 3900, "question": 55, "output": 410},
    {"system": 1800, "tools": 2400, "history": 6200, "retrieved": 4600, "question": 30, "output": 290},
]
price_in, price_out = 2.0, 10.0
totals = {k: sum(r[k] for r in requests) for k in requests[0]}
cost = {k: (v * (price_out if k == "output" else price_in)) / 1e6 for k, v in totals.items()}
grand = sum(cost.values())
for k, c in sorted(cost.items(), key=lambda kv: -kv[1]):
    print(f"{k:10} {totals[k]:>7,} tokens  ${c:.4f}  {c / grand:5.0%}")
```

The breakdown immediately suggests levers: cache the static system+tools prefix, trim retrieved chunks, summarise history.

## Dashboards, alerts and review rituals

- **Dashboards**: volume, error and fallback rates, latency percentiles, cost, token mix, cache hits; **quality** (judge scores on a sample, thumbs-down rate, escalation rate); per prompt version and model.
- **Alerts**: error-rate spikes, latency regressions, cost anomalies, a drop in judge scores, spike in guardrail triggers or refusals.
- **Rituals**: a weekly **trace review** (read 20–50 traces, sampled plus all thumbs-down); promote findings into eval cases; **replay** failing traces against a new prompt or model before shipping.

## Sampling

Logging everything is expensive. Common policy: store **100% of traces for errors, thumbs-down, low judge scores and escalations**, **a random sample** (for example 5–10%) of the rest for review and evals, and **metrics for everything**. Make sampling **deterministic by trace id** so related spans are kept together.

```quiz
? What is a trace in LLM observability?
+ The record of one request as a tree of spans (LLM calls, retrievals, tool calls) with inputs, outputs, timings and costs
- A log line
- A model checkpoint
> Traces let you see exactly what happened in a request.

? Why compute cost at log time?
+ Prices change; storing the cost with the trace keeps historical analysis accurate
- It is faster
- Providers require it
> Record tokens and the then-current price.

? Which should you log with care?
+ Prompts and outputs, which may contain personal or confidential data: redact, limit retention and control access
- Latency numbers
- Model names
> Treat traces as sensitive data.

? What does sampling policy typically keep at 100%?
+ Errors, thumbs-down, low-scoring and escalated traces
- Every successful trace
- Nothing
> Keep the interesting traces; sample the rest.
```

:::problem Monthly LLM spend doubled and nobody knows why. How does observability help you find out? {level=medium tags="cost,observability"}
Describe the investigation.

:::solution Model answer
Query traces for cost by **feature, model, prompt version, tenant and day**: find when the jump started and what changed (deploy, prompt version, new customer, model switch). Break tokens down **by component** (system, tools, history, retrieved context, output) to see which grew. Check **cache hit rate** (did a change invalidate the prefix?), **retry and fallback rates**, **agent step counts** (loops), and **top users/tenants** (abuse or a big new customer). Compare a trace before and after the change, fix the cause (revert a prompt, restore cache-friendly layout, cap retrieval size, add budgets), and add a **cost-per-request alert** and regression eval.
:::
:::

:::keypoints
- A trace is a tree of spans: generations (LLM calls), retrievals, tool calls and steps, each with inputs, outputs, timing, tokens and cost.
- Log identity, versions, retrieval details, tool calls, tokens (including cached), latency, outcomes and feedback; redact PII and limit retention.
- Use OpenTelemetry GenAI conventions and platforms like Langfuse, Phoenix, LangSmith or Braintrust; gateways centralise logging and budgets.
- Aggregate cost and latency by feature, model, prompt version and component; alert on anomalies.
- Review traces weekly, sample wisely, replay failures, and turn findings into eval cases.
:::

:::resources
- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — the standard attribute vocabulary.
- [Langfuse docs](https://langfuse.com/docs) and [Langfuse on GitHub](https://github.com/langfuse/langfuse) — open-source tracing, prompts, datasets and evals.
- [Arize Phoenix](https://docs.arize.com/phoenix) — open-source observability and evaluation.
- [LangSmith docs](https://docs.smith.langchain.com) and [Braintrust docs](https://www.braintrust.dev/docs) — commercial platforms with evals.
- [Hamel Husain: A field guide to rapidly improving AI products](https://hamel.dev/blog/posts/field-guide/) — look at your traces.
- [Chip Huyen: Building a GenAI platform](https://huyenchip.com/2024/07/25/genai-platform.html) — observability in the platform stack.
:::
