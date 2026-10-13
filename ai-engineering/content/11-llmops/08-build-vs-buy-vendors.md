---
title: Build vs Buy and Choosing Vendors
level: intermediate
time: 30
summary: Decision frameworks for the choices every AI team faces. Prompt, RAG, fine-tune or train; API versus open weights versus self-hosting; frontier versus small models; build versus buy for gateways, vector stores, eval and observability tools; vendor lock-in and exit plans; total cost of ownership with a runnable break-even calculator; and a due-diligence checklist for providers.
---

LLM projects fail more often from **wrong scope and wrong make-or-buy choices** than from wrong models. The ecosystem changes monthly, so good decisions are about **keeping options open, measuring on your own data and spending effort where it differentiates you**.

## The ladder of approaches

Climb only as high as evals say you must:

| Rung | What | Effort | Use when |
|---|---|---|---|
| 1. **Prompting** a hosted model | instructions, examples, structured output | hours | most tasks; start here always |
| 2. **Context and retrieval (RAG)**, tools | add your knowledge and actions | days to weeks | missing/changing knowledge, citations, personalisation |
| 3. **Workflows and agents** | multi-step logic, tool loops | weeks | tasks that need planning or many steps (only if simpler options fail) |
| 4. **Fine-tuning** (SFT/LoRA/preference) | change behaviour/style/format, cut cost/latency at scale | weeks + data | persistent behavioural gaps, narrow high-volume tasks, small-model distillation |
| 5. **Pretrain or continue-pretrain** | new base capability, domain language | months, millions | almost never for application teams |

Fine-tuning teaches **behaviour**, RAG supplies **knowledge**. Using fine-tuning to inject facts is the classic mistake; using a bigger prompt to fix a stable format problem at huge scale is the opposite one.

## Model sourcing options

| Option | Strengths | Weaknesses |
|---|---|---|
| **Frontier API** (Anthropic, OpenAI, Google and others) | best quality, tools, no ops, fast iteration | per-token cost, rate limits, data leaves your boundary, vendor dependence |
| **Cloud-hosted open or partner models** (Bedrock, Vertex AI, Azure AI Foundry) | enterprise contracts, regional control, IAM, one bill | model selection and feature lag, markup |
| **Managed open-weight inference** (Together, Fireworks, Groq, Hugging Face endpoints and others) | cheap, fast, open models, no GPU ops | smaller quality ceiling; provider reliability varies |
| **Self-hosted open weights** (vLLM, SGLang, TensorRT-LLM on your GPUs) | data stays in, fixed cost at scale, full control over fine-tunes | ops burden, utilisation risk, you own security and upgrades |
| **On-device / edge** | privacy, offline, zero marginal cost | small models, device constraints |

Choose per **workload**, not per company: a gateway lets you use a frontier model for hard reasoning, a small model for classification, and embeddings from a third source.

## Self-hosting break-even

Hosted APIs charge per token; GPUs charge per hour whether you use them or not. Self-hosting wins at **high, steady utilisation**.

```python run title="API versus self-hosted GPU: where is the break-even?" level=intermediate
def api_cost_per_month(mtok_in, mtok_out, price_in, price_out):
    return mtok_in * price_in + mtok_out * price_out                    # token volumes in millions per month

def gpu_cost_per_month(gpus, dollars_per_gpu_hour, ops_overhead=0.30, hours=730):
    return gpus * dollars_per_gpu_hour * hours * (1 + ops_overhead)      # + engineering/ops overhead as a fraction

# a mid-size open model served on 2 GPUs can handle roughly this many tokens per month at 50% utilisation (assumption)
capacity_mtok = 2 * 1_500 * 3600 * 730 * 0.5 / 1e6                       # 1,500 tokens/s/GPU, in millions of tokens per month
gpu = gpu_cost_per_month(gpus=2, dollars_per_gpu_hour=3.0)
print(f"self-hosted: 2 GPUs ~= ${gpu:,.0f}/month, capacity ~ {capacity_mtok:,.0f} M tokens/month at 50% utilisation")
print(f"{'M tokens/month':>15} {'frontier API $2/$10':>20} {'hosted open API $0.5/$1.5':>26} {'self-host':>10}   cheapest")
for volume in (100, 500, 2_000, 5_000, 10_000):
    mtok_in, mtok_out = volume * 0.75, volume * 0.25                    # 3:1 input to output
    frontier = api_cost_per_month(mtok_in, mtok_out, 2.00, 10.00)
    hosted_open = api_cost_per_month(mtok_in, mtok_out, 0.50, 1.50)
    sh = gpu if volume <= capacity_mtok else gpu * (volume / capacity_mtok)
    costs = {"frontier API": frontier, "hosted open API": hosted_open, "self-host": sh}
    print(f"{volume:>15,} {frontier:>20,.0f} {hosted_open:>26,.0f} {sh:>10,.0f}   {min(costs, key=costs.get)}")
print("\nself-hosting beats the frontier API only at high volume, and a hosted open-model API usually beats self-hosting at these volumes;")
print("remember the models differ in quality, so the cheapest option is only valid if it passes your evals")
```

Do not forget the **hidden self-hosting costs**: on-call engineering, upgrades and security patches, autoscaling, redundancy (two nodes minimum for availability), evals for each new open model, and idle GPUs overnight. Many teams discover that **a cheaper hosted open-model API** captures most of the savings without ops.

## Build versus buy for the surrounding stack

| Component | Build when | Buy / adopt when |
|---|---|---|
| **Model gateway / router** | simple needs (one or two providers) | many providers, budgets, caching, guardrails: adopt an open-source gateway (LiteLLM, Portkey, Helicone and others) |
| **Vector store** | tiny corpora (pgvector in your existing Postgres) | large scale, hybrid search, filters: managed or dedicated engines (Qdrant, Weaviate, Pinecone, Elasticsearch/OpenSearch and others) |
| **Orchestration framework** | most apps: plain code is clear and debuggable | complex graphs, durable execution, team conventions (LangGraph and others) |
| **Evals and observability** | start with scripts and a spreadsheet | adopt tooling when volume, team size and dashboards demand it (Langfuse, LangSmith, Braintrust, Phoenix, promptfoo) |
| **Guardrails** | business rules and schema checks | managed classifiers and policy engines for content safety and PII |
| **Document parsing** | text PDFs | complex layouts at scale: parsers and document AI services |
| **Whole product category** (support bot, coding assistant, meeting notes) | it is your core differentiator | commodity capability: buy and integrate |

**Rule of thumb**: build what **differentiates** you (domain data, workflows, evals, UX); buy or adopt **commodity plumbing**, with thin adapters so you can swap it.

## Lock-in and exit plans

Lock-in is not only the provider: it is **prompts tuned to one model, proprietary SDK features, fine-tunes you cannot export, embeddings in one vendor's space, and data in a closed tool**.

Reduce it with:

- A **model-client interface** and a gateway; keep provider-specific features behind adapters.
- **Portable assets**: prompts in your repo, eval sets you own, datasets in open formats, embeddings reproducible from stored source text.
- **Regular multi-model evals**: know your second-best option and what the switch would cost.
- Contract terms: data portability, notice periods, price protection, deprecation windows.

But do not over-engineer: abstracting everything for hypothetical swaps slows you down. Abstract **the model call and the data**, and accept some coupling elsewhere.

## Total cost of ownership

Count more than tokens:

- **Engineering time** to build and maintain (usually the biggest line).
- **Evaluation and labelling** (human review time).
- **Infrastructure** (vector DB, queues, observability, GPUs).
- **Incident and risk costs** (security, compliance, brand).
- **Opportunity cost** of what the team did not build.

Compare options on **cost per successful task** at your expected volume and growth, with sensitivity analysis for price changes (model prices have generally fallen quickly, which favours flexibility over long commitments).

## Vendor due-diligence checklist

| Area | Questions |
|---|---|
| **Quality** | evaluated on *your* data? sliced results? reproducible? |
| **Reliability** | SLA, rate limits, historical uptime, status transparency, support responsiveness |
| **Security and compliance** | SOC 2 / ISO 27001, HIPAA BAA, GDPR DPA, sub-processors, penetration tests |
| **Data** | retention, training on your data (default off?), zero-data-retention options, residency, deletion |
| **Portability** | export of data, fine-tunes, embeddings; open standards (MCP, OpenTelemetry, OpenAI-compatible APIs where relevant) |
| **Commercial** | pricing model and trend, commitments, overage, price protection, deprecation policy |
| **Roadmap and viability** | model release cadence, financial stability, acquisition risk |
| **Integration** | SDK quality, docs, streaming/tool/structured-output support, observability hooks |

Run a **time-boxed bake-off** (one to two weeks) on a golden set with identical prompts, then tuned prompts, measuring quality, latency, cost and failure modes, before signing anything long-term.

```quiz
? When is fine-tuning the right tool compared with RAG?
+ To change behaviour, style or format, or to distil a narrow task into a cheaper model, not to inject changing facts
- To add up-to-date knowledge
- To avoid writing evals
> RAG supplies knowledge; fine-tuning shapes behaviour.

? Self-hosting an open model tends to beat an API when:
+ Volume is high and steady so GPUs stay well utilised, and you can staff the operations
- Traffic is tiny and spiky
- You have no engineers
> Idle GPUs cost money; utilisation drives the break-even.

? What should you build yourself rather than buy?
+ What differentiates you: domain data, workflows, evals and user experience
- Every commodity component
- Nothing
> Buy commodity plumbing with thin adapters.

? Which is the best way to reduce vendor lock-in?
+ Keep prompts, evals and data portable and put the model call behind your own interface
- Use one provider's proprietary features everywhere
- Avoid evals
> Portability comes from owning your assets and abstractions.
```

:::problem A regional bank wants an internal document-QA assistant. Legal says customer data cannot leave the country. Compare options and recommend an approach. {level=medium tags="build-vs-buy,compliance"}
Weigh residency, quality, cost and operations.

:::solution Model answer
Options: (1) a frontier model through a **regional cloud endpoint** with residency and zero-retention contracts (best quality, least ops, check legal sign-off on sub-processors); (2) **managed open-weight inference inside the bank's cloud tenant/VPC** (more control, moderate quality); (3) **self-hosted open models on-premises** (maximum control, highest ops and likely lower quality ceiling). Recommend starting with (1) if the contract and region satisfy legal, since quality and speed to value dominate, with the architecture (gateway, redaction, tenant filters, audit logs) designed so (2) or (3) can replace it. Validate each on a golden set built from real (anonymised) bank documents; pilot with a limited user group; keep data-flow documentation and a DPA. If legal rejects external processing entirely, choose (2) or (3) and size GPUs for steady internal usage, accepting a smaller model and investing more in retrieval quality and evals.
:::
:::

:::keypoints
- Climb the ladder only as needed: prompt, then RAG and tools, then workflows/agents, then fine-tuning; pretraining is almost never right for app teams.
- Source models per workload: frontier API, cloud-hosted, managed open weights, self-hosted or on-device; self-hosting pays off only with high steady utilisation and ops capacity.
- Build what differentiates you (data, workflows, evals, UX); adopt commodity plumbing behind thin adapters.
- Manage lock-in by owning prompts, evals and data, and abstracting the model call; do not over-abstract.
- Compare total cost of ownership per successful task, and run a time-boxed bake-off on your own data with a due-diligence checklist.
:::

:::resources
- [Building effective agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents) — start simple, add complexity only when it earns its keep.
- [vLLM docs](https://docs.vllm.ai) — the most common open-source serving engine for self-hosting.
- [Artificial Analysis](https://artificialanalysis.ai) — independent quality, price and speed comparisons of models and providers.
- [LMArena](https://lmarena.ai) — crowd-sourced model comparisons.
- [Open LLM Leaderboard (Hugging Face)](https://huggingface.co/open-llm-leaderboard) — comparing open models.
- [Chip Huyen: AI Engineering (book)](https://www.oreilly.com/library/view/ai-engineering/9781098166298/) — decision frameworks for AI applications.
:::
