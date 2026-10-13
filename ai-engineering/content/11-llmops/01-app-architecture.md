---
title: Reference Architecture for an LLM Application
level: intermediate
time: 35
summary: The boxes every production LLM app ends up with. Request lifecycle, the orchestration layer, prompt and config management, retrieval and tools, guardrails, caching, streaming to the client, state and sessions, async jobs, observability hooks, and how to keep the model behind an interface so you can swap it. With a runnable layered app skeleton that streams, retries and logs.
---

Calling a model is one line of code. Running an LLM feature for thousands of users is a **system**: authentication, prompt assembly, retrieval, tool execution, safety checks, caching, streaming, storage, monitoring and cost control. This lesson gives you a reference architecture to start from; the following lessons zoom in on scaling, cost, data, security and delivery.

## The request lifecycle

```viz algo=arch title="Reference architecture of an LLM feature" dir=right
user  Client | web, mobile, API consumer [client] @0,1
gw    API gateway | auth, rate limits, quotas [gateway] @1,1
app   Orchestrator | prompt assembly, routing, state [service] @2,1
guard Guardrails | input and output checks [guard] @3,0
cache Cache | exact and semantic [cache] @3,1
ret   Retrieval | search, rerank, memory [vector] @3,2
tools Tools | APIs, code, databases [tool] @4,2
llm   Model gateway | providers, fallbacks, budgets [llm] @4,1
db    State store | sessions, prompts, results [db] @2,2
obs   Observability | traces, evals, cost [monitor] @2,0
q     Job queue | long tasks, batch [queue] @1,2
--
user -> gw
gw -> app
app -> guard
app -> cache
app -> ret
ret -> tools
app -> llm
app -> db
app -> obs
gw -> q
q -> app
```

Read it left to right for one request:

1. **Gateway**: authenticate, identify the tenant, enforce rate limits and quotas, attach a request id.
2. **Orchestrator**: your application code. It loads session state, builds the prompt from versioned templates, decides which path to take (cached answer, plain call, RAG, agent loop).
3. **Guardrails**: check inputs (injection, PII, policy) and outputs (schema, safety, grounding).
4. **Retrieval and tools**: fetch context and perform actions, with the user's permissions.
5. **Model gateway**: a thin layer in front of providers (model choice, retries, fallbacks, budgets, logging).
6. **State and observability**: persist what happened and emit traces so you can debug, evaluate and bill.

You do not need every box on day one. Start with orchestrator + model gateway + logging, and add boxes when a real need appears.

## Layering the code

Keep these concerns in separate modules so each can change independently:

| Layer | Responsibility | Why separate |
|---|---|---|
| **Transport** | HTTP/WebSocket handlers, auth, streaming format | clients change without touching logic |
| **Orchestration** | workflow or agent loop, routing | the part you iterate on most |
| **Prompts and config** | versioned templates, model names, parameters, feature flags | change without redeploying code |
| **Model client** | one interface over providers: retries, timeouts, budgets, usage accounting | swap models, add fallbacks, test with fakes |
| **Retrieval and tools** | search, databases, external APIs with permission checks | security boundary |
| **Validation** | schema checks, business rules, guardrails | deterministic safety net |
| **Storage and telemetry** | sessions, results, traces, metrics | debugging and evaluation |

The most valuable single seam is the **model client interface**: the rest of the app asks for "a completion with these messages and this schema" and never touches a vendor SDK directly. Tests then use a fake client, and switching or adding providers is local.

```python run title="A layered skeleton: model interface, retries, budget, tracing" level=intermediate
import asyncio, random, time
from dataclasses import dataclass, field

@dataclass
class Result:
    text: str
    input_tokens: int
    output_tokens: int

class ModelClient:                                         # the one interface the app depends on
    async def complete(self, messages, *, max_tokens=256) -> Result: raise NotImplementedError

class FlakyFake(ModelClient):                              # a stand-in provider: sometimes fails, like the real thing
    def __init__(self, fail_first=2, seed=0): self.calls, self.fail_first, self.rng = 0, fail_first, random.Random(seed)
    async def complete(self, messages, *, max_tokens=256):
        self.calls += 1
        await asyncio.sleep(0.01)
        if self.calls <= self.fail_first: raise TimeoutError("provider timeout")
        user = messages[-1]["content"]
        return Result(f"echo: {user}", input_tokens=sum(len(m["content"]) // 4 for m in messages), output_tokens=8)

@dataclass
class Trace:
    request_id: str
    events: list = field(default_factory=list)
    def log(self, kind, **kw): self.events.append((kind, kw))

async def with_retries(fn, trace, attempts=4, base=0.01):
    for i in range(attempts):
        try:
            return await fn()
        except TimeoutError as e:
            trace.log("retry", attempt=i + 1, error=str(e))
            await asyncio.sleep(base * 2 ** i + random.random() * base)       # exponential backoff with jitter
    raise RuntimeError("model unavailable after retries")

class Budget:
    def __init__(self, max_tokens): self.left = max_tokens
    def charge(self, r: Result):
        self.left -= r.input_tokens + r.output_tokens
        if self.left < 0: raise RuntimeError("token budget exceeded")

PROMPTS = {"answer_v3": "You are a concise support assistant. Answer using only the provided context."}

async def handle(request_id, user_text, client, budget):
    trace = Trace(request_id)
    messages = [{"role": "system", "content": PROMPTS["answer_v3"]}, {"role": "user", "content": user_text}]
    trace.log("prompt", version="answer_v3", chars=sum(len(m["content"]) for m in messages))
    t0 = time.perf_counter()
    result = await with_retries(lambda: client.complete(messages), trace)
    budget.charge(result)
    trace.log("completion", ms=round((time.perf_counter() - t0) * 1000), tokens_in=result.input_tokens, tokens_out=result.output_tokens)
    return result.text, trace

text, trace = asyncio.run(handle("req-1", "How do I reset my password?", FlakyFake(), Budget(10_000)))
print(text)
for kind, kw in trace.events:
    print(f"  {kind:10}", {k: v for k, v in kw.items() if k != 'ms'})
print("retries happened:", sum(1 for k, _ in trace.events if k == "retry"))
```

## Streaming

Users judge responsiveness by **time to first token (TTFT)**, not total time. Stream tokens to the client using **Server-Sent Events** (simple, one-way, works through most proxies) or **WebSockets** (two-way, for voice or interactive tools). Practical points:

- Send **structured events**, not raw text only: `token`, `tool_call`, `citation`, `done`, `error`, so the UI can render rich states.
- **Validate before showing** when needed: for safety-critical output, stream a placeholder or stream-and-retract; for structured output, stream partial JSON carefully.
- Handle **client disconnects**: cancel the upstream request to stop paying for tokens nobody will read.
- Proxies and load balancers may **buffer** responses; disable buffering and set sensible idle timeouts for long generations.

## State, sessions and memory

LLM APIs are stateless: **you** send the history each time. Decide where conversation state lives:

| Option | Notes |
|---|---|
| **Client holds it** | simplest; client sends the history each call (watch size, trust, and tampering) |
| **Server session store** (Redis, Postgres) | authoritative, supports truncation/summarisation and audit |
| **Provider-managed state** | convenient for some APIs; check retention and portability |
| **Long-term memory store** | facts and preferences retrieved when relevant (context engineering module) |

Store enough to **reproduce** a request: prompt version, model, parameters, retrieved chunk ids, tool results. This is gold for debugging and evals.

## Sync, async and background work

- **Interactive path** (chat, autocomplete): low latency, streaming, tight timeouts.
- **Asynchronous jobs** (report generation, batch enrichment, long agent runs): accept the request, return a job id, process from a **queue**, notify on completion (webhook, polling, SSE). Retries and idempotency matter.
- **Batch/offline** (evals, backfills, embeddings of a corpus): use the provider's **batch API** or your own workers at lower priority and cost.

Separating these workloads prevents a big batch job from starving interactive users.

## Configuration, prompts and feature flags

Treat prompts and model settings as **versioned configuration**: stored in files or a registry, referenced by name and version, rolled out with flags, and recorded in every trace. This enables fast rollback, A/B tests and per-tenant overrides (see the CI/CD lesson).

## Failure modes to design for

| Failure | Design response |
|---|---|
| Provider timeout, 429, 5xx | retries with backoff and jitter, circuit breaker, fallback model/provider, graceful degraded answer |
| Slow responses | streaming, timeouts per stage, smaller model for simple requests |
| Invalid or unsafe output | validation, bounded repair retries, safe fallback message |
| Tool failure | structured error returned to the model; limit retries; escalate to a human |
| Runaway cost (loops, long contexts) | per-request and per-user token budgets, step limits, alerts |
| Prompt or model regression | evals in CI, canary releases, quick rollback |
| Dependency outage (vector DB, tool API) | degrade without retrieval, cache, clear status to the user |

```quiz
? Why put the model behind your own client interface?
+ You can swap or add providers, add retries and budgets in one place, and test with fakes
- It makes the model faster
- It removes the need for prompts
> This is the most valuable seam in an LLM codebase.

? What should you do when the client disconnects mid-stream?
+ Cancel the upstream model request to stop generating (and paying for) unread tokens
- Keep generating to finish the answer
- Retry the request
> Propagate cancellation all the way to the provider call.

? Which workload belongs on a job queue rather than the interactive path?
+ Long report generation or large batch enrichment
- A short chat reply
- Autocomplete
> Queues give retries, backpressure and isolation from interactive traffic.

? What should every trace record to make a request reproducible?
+ Prompt version, model and parameters, retrieved chunk ids and tool results
- Only the final answer
- Only the user id
> Reproducibility turns incidents into regression tests.
```

:::problem You are asked to add an "ask our docs" assistant to an existing SaaS product used by thousands of tenants. Sketch the architecture and name the three decisions most likely to hurt later if made carelessly. {level=medium tags="architecture,design"}
Think tenancy, state and swapping models.

:::solution Model answer
Architecture: existing gateway handles auth and tenant id; a new orchestrator service builds prompts from versioned templates, retrieves from a **tenant-filtered** index (permissions applied in the query), calls a model gateway (retries, fallback, budgets), validates output (citations present, schema), streams to the UI via SSE, and writes traces plus feedback events. Indexing runs as background jobs. Risky decisions: (1) **tenant isolation and access control** in retrieval and caches (leaks are the worst failure); (2) **no abstraction over the model/provider and prompts hard-coded** (painful to swap, version or roll back); (3) **no tracing/eval data captured from day one** (you cannot debug, improve, or prove quality later). Also: unbounded token use per tenant and missing cancellation on disconnect.
:::
:::

:::keypoints
- A production LLM app is a system: gateway, orchestrator, guardrails, retrieval and tools, model gateway, state, and observability.
- Keep layers separate; the model-client interface is the most valuable seam (swap providers, retries, budgets, fakes in tests).
- Stream with structured events, optimise TTFT, and cancel upstream on disconnect.
- Decide where state lives; log everything needed to reproduce a request.
- Separate interactive, async and batch workloads, and design explicitly for provider, tool and cost failures.
:::

:::resources
- [Building effective agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents) — simple composable patterns over heavy frameworks.
- [Claude docs: Streaming messages](https://docs.claude.com/en/docs/build-with-claude/streaming) — streaming events and handling.
- [Applied LLMs (Yan et al.)](https://applied-llms.org) — what practitioners learned shipping LLM products.
- [FastAPI docs](https://fastapi.tiangolo.com) — a popular Python framework for async APIs and streaming.
- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — standard names for LLM traces.
- [Chip Huyen: Building A Generative AI Platform](https://huyenchip.com/2024/07/25/genai-platform.html) — a reference platform walk-through.
:::
