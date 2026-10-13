---
title: GenAI System Design Interviews
level: advanced
time: 60
summary: A repeatable framework for designing LLM systems on a whiteboard, plus worked case studies — enterprise RAG assistant, customer-support copilot, code assistant, document extraction at scale, voice agent, and a multi-tenant LLM gateway. Each case covers requirements, architecture, data, evals, cost and failure modes, with back-of-envelope calculators you can run.
---

GenAI system-design interviews test whether you can combine **product thinking, ML knowledge and distributed-systems judgement**. Interviewers want a structured conversation, justified trade-offs and awareness of failure modes, not a memorised diagram. This lesson gives you a framework, a toolkit of numbers, and six worked designs.

## The framework (aim for 45 minutes)

1. **Clarify** (5 min): users, use case, scale (users, requests/day, documents), latency and quality bar, data sensitivity, budget, existing stack, what "success" means.
2. **Requirements and metrics** (3 min): functional list, non-functional (latency p95, availability, cost per request), and **the one or two quality metrics** you would optimise (groundedness, task success, acceptance rate).
3. **Estimate** (3 min): QPS, tokens per request, daily cost, storage size, concurrency. Numbers drive decisions.
4. **High-level architecture** (10 min): boxes and data flow for request path and offline pipelines.
5. **Deep dives** (15 min): the hard parts, chosen with the interviewer: retrieval, orchestration, prompt design, evals, scaling, safety.
6. **Quality and evaluation** (5 min): offline evals, online metrics, feedback loop, regression gates.
7. **Failure modes, security, cost levers, roadmap** (4 min): what breaks, how you detect and degrade, how to iterate.

State assumptions out loud, and **offer alternatives with trade-offs** rather than one "right" answer.

## Numbers worth knowing

```python run title="Back-of-envelope toolkit for GenAI designs" level=intermediate
def design(users, req_per_user_day, in_tok, out_tok, price_in, price_out, peak_factor=3, avg_latency_s=6):
    req_day = users * req_per_user_day
    qps_avg = req_day / 86_400
    qps_peak = qps_avg * peak_factor
    concurrent = qps_peak * avg_latency_s                              # Little's law
    cost_day = req_day * (in_tok * price_in + out_tok * price_out) / 1e6
    return req_day, qps_avg, qps_peak, concurrent, cost_day

print(f"{'scenario':32} {'req/day':>10} {'avg qps':>8} {'peak qps':>9} {'in flight':>10} {'$/day':>9} {'$/month':>10}")
for name, args in {
    "internal copilot, 2K users":       (2_000, 10, 6_000, 500, 2.0, 10.0),
    "support bot, 50K users":            (50_000, 2, 4_000, 300, 0.50, 2.50),
    "consumer chat app, 1M DAU":         (1_000_000, 6, 3_000, 400, 0.50, 2.50),
    "code assistant, 20K devs":          (20_000, 80, 3_500, 120, 0.50, 2.50),
}.items():
    r, qa, qp, conc, cd = design(*args)
    print(f"{name:32} {r:>10,.0f} {qa:>8.1f} {qp:>9.1f} {conc:>10.0f} {cd:>9,.0f} {cd * 30:>10,.0f}")

print("\nstorage for a RAG index: 5M chunks x (1,536 dims x 4 bytes) =", f"{5e6 * 1536 * 4 / 1e9:.1f} GB raw vectors (before index overhead and replicas)")
print("with int8 quantisation:", f"{5e6 * 1536 * 1 / 1e9:.1f} GB;   with 3 replicas:", f"{3 * 5e6 * 1536 * 4 / 1e9:.1f} GB")
```

(Prices above are illustrative per-million-token numbers; always state your assumptions.)

## Case 1: Enterprise "chat with our documents"

**Prompt**: design an assistant for a 20,000-employee company over wikis, drives, tickets and chat history, with per-user permissions.

```viz algo=arch title="Enterprise RAG assistant" dir=right
ui    Chat UI | web, Slack, Teams [client] @0,1
gw    Gateway | SSO, rate limits [gateway] @1,1
orch  Orchestrator | query rewrite, routing, prompt [service] @2,1
ret   Retrieval | hybrid search + rerank + ACL filter [vector] @3,0
llm   Model gateway | answer with citations [llm] @3,1
guard Guardrails | injection, PII, groundedness [guard] @3,2
ing   Ingestion | connectors, parse, chunk, embed [worker] @2,0
src   Sources | wiki, drive, tickets [storage] @1,0
obs   Observability and evals [monitor] @2,2
--
ui -> gw
gw -> orch
orch -> ret
orch -> llm
orch -> guard
src -> ing
ing -> ret
orch -> obs
```

Key points: **ingestion connectors** with incremental sync, deletes and ACL sync; **hybrid retrieval** (BM25 + vectors) with a reranker; **permission filter in the query**, re-checked at the source; **query rewriting** using chat history; **citations** with passage-level links; **groundedness check** and "I could not find that" behaviour; **freshness** metrics; evals from real questions with expert-labelled answers; slices by source and department. Pitfalls: stale content, permission drift, giant PDFs and tables, near-duplicate documents, injection via documents, cost of re-embedding.

## Case 2: Customer-support copilot

**Prompt**: help human agents answer tickets faster; later automate simple tickets.

- **Phase 1 (assist)**: retrieve similar resolved tickets and policy articles; draft a reply with sources; agent edits and sends. Capture **edits and outcomes** as training signals.
- **Phase 2 (automate)**: classify intent and risk; auto-resolve only low-risk intents with high verifier confidence; **tool calls** for order lookup/refund limited by policy; always offer a human handoff.
- **Architecture**: ticket webhook, context assembly (customer, order, history), RAG over the knowledge base, draft generation, policy/guardrail checks (refund limits, tone, no promises), UI integration.
- **Evals**: replay historical tickets, compare drafts with agent replies via judge plus human review; track acceptance rate, edit distance, handle time, CSAT, reopen rate, and escalation correctness.
- **Risks**: wrong policy statements, leaking another customer's data, tone failures, prompt injection from customer emails.

## Case 3: Coding assistant

**Prompt**: IDE assistant with autocomplete and an agent that edits a repository.

- **Autocomplete**: latency under about 300 ms, a small fast model, **fill-in-the-middle** prompts, local context (open files, imports, recent edits), aggressive caching and cancellation on each keystroke, acceptance rate as the north-star metric.
- **Chat/agent**: **repository indexing** (code chunking by syntax tree, embeddings plus symbol/grep search), **tools** (read, search, edit, run tests, shell in a sandbox), plan-edit-test loops with budgets, **diff preview and approval**, checkpoints and undo.
- **Safety**: sandboxed execution, secrets protection, workspace trust, no unreviewed network or destructive commands, prompt injection from files and web content.
- **Evals**: execution-based benchmarks on your own repos (tests pass), acceptance and retention rates, regression suites for known tasks.

## Case 4: Document extraction at scale

**Prompt**: extract fields from 1M documents per month into a database.

Pipeline: queue-based ingestion, classification, parse (text layer or OCR and layout), extraction to a strict schema with evidence, code validation, confidence routing to human review, results stored with provenance (see the Document AI lesson). Scale: horizontal workers, batch API for backlog, per-tenant fairness, idempotent jobs, dead-letter queue. Metrics: field accuracy, straight-through rate, cost per document, review throughput. Cost levers: cascade from cheap parser to VLM only on hard pages, caching by document hash, smaller model for easy classes.

## Case 5: Real-time voice agent

**Prompt**: phone agent that books appointments.

- **Pipeline**: telephony (SIP/WebRTC), streaming ASR with VAD, LLM with tools (calendar API), streaming TTS, **barge-in** handling (see the speech lesson); a fast path using a small model for routine turns.
- **Latency budget**: aim for roughly 500 to 800 ms from end of speech to first audio; stream every stage; keep prompts short and cached; co-locate services.
- **Reliability**: fallbacks to DTMF or human transfer, confirmation of critical details (dates, names), recording consent, PII handling.
- **Evals**: scripted and synthetic call simulations, task completion, word error on names and numbers, turn latency percentiles, user satisfaction.

## Case 6: Multi-tenant LLM gateway

**Prompt**: build the internal platform through which all teams call models.

- **Responsibilities**: auth and per-team keys, **quotas and budgets**, routing and fallbacks across providers, caching, guardrails, logging and traces (redacted), usage and cost attribution, prompt/model registry, evals hooks.
- **Design**: stateless proxy tier behind a load balancer; async I/O; token-aware rate limiting (Redis or a distributed limiter); streaming pass-through with cancellation; provider adapters behind a common schema; central config with hot reload; metrics to a time-series store; audit logs to durable storage.
- **Hard parts**: fair sharing of provider limits, **failover without double-billing or double side effects**, semantic cache isolation per tenant, handling different provider features (tools, structured outputs, caching) behind one API, and keeping latency overhead small (milliseconds).

```python run title="Sizing a gateway: token-aware limits and fair shares" level=advanced
def fair_share(provider_tpm, demands):
    """max-min fair allocation of a shared tokens-per-minute limit across teams."""
    alloc, remaining, left = {}, provider_tpm, dict(demands)
    while left and remaining > 1e-9:
        share = remaining / len(left)
        satisfied = {t: d for t, d in left.items() if d <= share}
        if not satisfied:
            for t in left: alloc[t] = share
            return alloc
        for t, d in satisfied.items():
            alloc[t] = d; remaining -= d; del left[t]
    for t in left: alloc[t] = 0
    return alloc

demands = {"support-bot": 300_000, "search": 120_000, "batch-enrichment": 900_000, "copilot": 200_000}
alloc = fair_share(1_000_000, demands)
for team, d in demands.items():
    print(f"{team:18} wants {d:>9,} TPM  gets {alloc[team]:>9,.0f} TPM")
print("\nmax-min fairness protects small teams from the big batch job; add priority classes so interactive traffic wins ties")
```

## Deep-dive menu: pick what the question needs

| Topic | What to say |
|---|---|
| **Retrieval quality** | chunking, hybrid search, reranking, query rewriting, metadata filters, evaluation (recall@k, nDCG) |
| **Prompt and context** | structure, caching, budget, ordering, few-shot selection |
| **Agents vs workflows** | start deterministic; use agents only for open-ended tasks; add budgets, guardrails, traces |
| **Evals** | golden set, LLM judge calibrated to humans, slices, online metrics, regression gating |
| **Safety** | injection, data leakage, permissions, output validation, human approval |
| **Scale and cost** | caching, routing, batching, rate limits, queues, autoscaling |
| **Latency** | streaming, parallel steps, smaller models, prefix caching |
| **Reliability** | fallbacks, circuit breakers, graceful degradation, idempotency |
| **Data flywheel** | feedback capture, labelling, dataset versioning |
| **Privacy and compliance** | residency, retention, redaction, audit |

## Common mistakes in interviews

- Jumping to a framework or model name before clarifying requirements.
- Skipping **evaluation**: the strongest signal of seniority is how you will know it works.
- Ignoring **cost and latency** numbers.
- Over-engineering with agents when a workflow suffices (or the reverse: ignoring tool use where needed).
- Forgetting **permissions, injection and privacy**.
- No **degradation plan** when the model or a dependency fails.
- Treating the model as deterministic.

```quiz
? What should you do first in a GenAI system-design interview?
+ Clarify users, scale, latency and quality requirements, and what success means
- Draw the vector database
- Pick a model
> Requirements drive every later trade-off.

? In an enterprise RAG design, where should document permissions be enforced?
+ In the retrieval query (and re-checked at source), not only in the prompt
- Only in the system prompt
- Nowhere; the model decides
> Authorisation is enforced in code.

? Why does an autocomplete feature use a small, fast model with aggressive cancellation?
+ Latency must be a few hundred milliseconds and most suggestions become stale as the user keeps typing
- Small models are always more accurate
- Cancellation increases cost
> Responsiveness drives acceptance.

? What does max-min fair sharing do in a shared gateway?
+ It ensures small consumers get what they need and large ones split the remainder, preventing starvation
- It gives the biggest team everything
- It disables rate limits
> Fairness plus priorities keeps interactive traffic healthy.
```

:::problem Design a "chat with your data" analytics assistant: users ask natural-language questions over a company data warehouse and get tables and charts. Walk through requirements, architecture, evaluation, and the main risks. {level=hard tags="system-design,text-to-sql"}
This is a common interview prompt: text-to-SQL with governance.

:::solution Model answer
Clarify: users (analysts vs executives), schema size, data sensitivity, accuracy bar (wrong numbers are costly), latency, scale. Architecture: **schema/metrics layer** (a curated semantic layer or metrics definitions, with column descriptions, join paths and example queries) retrieved per question; LLM generates **SQL (or a query over the semantic layer)**; **validation**: parse and lint SQL, allow-list tables/columns by the user's permissions, read-only role, row limits and timeouts, cost estimation via EXPLAIN; execute; the model summarises results and picks a chart spec; show the **SQL and assumptions** to the user. Add a clarification step for ambiguous terms ("revenue" definition), a **repair loop** on SQL errors with a bounded number of attempts, and caching of frequent questions. Evaluation: a labelled set of question/SQL/result triples, **execution-accuracy** (result equivalence), slice by complexity, human review of numeric answers, online feedback. Risks: wrong joins and silent misinterpretation (mitigate with a semantic layer, shown SQL, and certified metrics), data leaks (row-level security, per-user credentials), expensive queries (limits, cost guards), injection via data values, and over-trust (label as AI-generated, link to certified dashboards for key metrics).
:::
:::

:::keypoints
- Use a framework: clarify, define requirements and metrics, estimate numbers, sketch architecture, deep-dive, plan evals, then failure modes, security and cost.
- Do the back-of-envelope math (QPS, concurrency by Little's law, tokens, cost, storage); it justifies design choices.
- Case patterns: enterprise RAG (ingestion, hybrid retrieval, ACLs, citations), support copilot (assist then automate), code assistant (latency, repo indexing, sandboxed tools), document extraction (cascade and validation), voice agent (streaming budget, barge-in), gateway (quotas, fairness, failover).
- Always cover evaluation, security and permissions, cost and latency levers, and degradation paths; prefer simple workflows before agents.
- State assumptions and trade-offs; there is no single right answer.
:::

:::resources
- [Chip Huyen: Building A Generative AI Platform](https://huyenchip.com/2024/07/25/genai-platform.html) — the canonical platform walk-through.
- [Chip Huyen: Common pitfalls when building generative AI applications](https://huyenchip.com/2025/01/16/ai-engineering-pitfalls.html) — mistakes to avoid.
- [Applied LLMs](https://applied-llms.org) — tactical, operational and strategic lessons.
- [ByteByteGo: system design newsletter](https://blog.bytebytego.com) — general system-design fundamentals.
- [Eugene Yan: Patterns for Building LLM-based Systems](https://eugeneyan.com/writing/llm-patterns/) — evals, RAG, guardrails, feedback.
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — workflows versus agents.
:::
