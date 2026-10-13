---
title: Data Pipelines and the Feedback Loop
level: intermediate
time: 35
summary: The data flywheel behind every improving LLM product. What to log, how to collect explicit and implicit feedback, turning traces into labelled eval and fine-tuning data, active sampling of failures, privacy-safe retention, synthetic data and its pitfalls, and keeping a retrieval corpus fresh. With runnable feedback-mining and dataset-splitting code.
---

The model is rented; **your data is the moat**. Teams that improve fastest build a loop: ship, observe real usage, find failures, turn them into tests and training data, fix, and ship again. This lesson covers the plumbing for that loop.

```viz algo=arch title="The LLM data flywheel" dir=right
app   Production app | users and agents [service] @0,1
log   Trace store | prompts, outputs, tool calls, metadata [db] @1,1
fb    Feedback | thumbs, edits, escalations, outcomes [bell] @1,0
mine  Mining and triage | cluster failures, sample [filter] @2,1
label Labeling | human and model review [user] @3,1
sets  Datasets | eval sets, few-shot, fine-tuning [storage] @4,1
ev    Evals and CI | regression gate [eval] @4,0
ship  Improve | prompts, retrieval, models [llm] @3,0
--
app -> log
app -> fb
log -> mine
fb -> mine
mine -> label
label -> sets
sets -> ev
ev -> ship
ship -> app
```

## What to log

For every LLM interaction record enough to **reproduce and analyse** it:

| Group | Fields |
|---|---|
| **Identity** | request/trace id, user or tenant id (pseudonymised), session id, timestamp |
| **Inputs** | user message, prompt template name and version, system prompt hash, retrieved chunk ids and scores, tool definitions version |
| **Model call** | provider, model, parameters, input/output tokens, cache hits, latency (TTFT, total), retries, finish reason |
| **Outputs** | raw model output, parsed/validated output, tool calls and results, guardrail verdicts |
| **Outcome** | user feedback, downstream success (task completed, ticket resolved, code accepted), cost |

Log **structured events** (JSON), not prose. Use OpenTelemetry-style traces so a multi-step agent run is one tree of spans. Decide **sampling and retention** up front: store everything for a short window, keep a smaller sample or aggregates longer, and keep flagged failures indefinitely if policy allows.

## Feedback signals

| Signal | Kind | Notes |
|---|---|---|
| Thumbs up/down, ratings | explicit | sparse and biased toward extremes; add a reason picker |
| Free-text comments and bug reports | explicit | rich but rare |
| **Edits** to the model's draft | implicit | gold: the edit *is* the correction |
| **Regenerate**, copy, dismiss, accept suggestion | implicit | acceptance rate is a core product metric |
| Follow-up rephrasing or "no, I meant…" | implicit | detect dissatisfaction from conversation |
| Escalation to human, ticket reopened, refund | outcome | strong, delayed ground truth |
| Task success (tests pass, record saved) | outcome | the best label when available |

Design the UI so that **feedback is a by-product of normal use** (accept/edit/reject) rather than a survey. Always capture the context needed to interpret it (which prompt version, which retrieved chunks).

## From traces to datasets

1. **Triage**: surface candidates: negative feedback, low judge scores, guardrail hits, long latencies, high cost, escalations, and **clusters of similar queries** that fail.
2. **Sample thoughtfully**: random sample for an unbiased view, plus targeted samples of failures and rare intents. Stratify by intent, language, tenant, and prompt version.
3. **Label**: humans (domain experts for hard cases), LLM judges (validated against human labels) for scale; keep guidelines and disagreement notes.
4. **Curate** into datasets with clear purposes:
   - **Regression/eval sets** (golden): fixed, versioned, never trained on.
   - **Few-shot/example banks** for prompts and dynamic example selection.
   - **Fine-tuning sets** (SFT pairs, preference pairs from edits and accept/reject).
   - **Red-team and safety sets**.
5. **Version and split**: dataset versions tracked like code; **deduplicate** and **split by user/conversation/document** so near-duplicates do not leak between train and eval.

```python run title="Mining production traces for failures worth labelling" level=intermediate
import random
from collections import Counter

rng = random.Random(4)
intents = ["refund", "shipping", "password", "invoice", "api-error"]
traces = []
for i in range(400):
    intent = rng.choices(intents, weights=[3, 3, 2, 1, 1])[0]
    bad_rate = {"refund": 0.08, "shipping": 0.05, "password": 0.03, "invoice": 0.25, "api-error": 0.35}[intent]
    traces.append({"id": i, "intent": intent, "thumb_down": rng.random() < bad_rate, "latency_s": round(rng.uniform(0.8, 9), 1), "cost": round(rng.uniform(0.002, 0.05), 3)})

by_intent = Counter(t["intent"] for t in traces)
bad_by_intent = Counter(t["intent"] for t in traces if t["thumb_down"])
print("intent      volume  thumbs-down  rate")
for intent in sorted(by_intent, key=lambda k: -bad_by_intent[k] / by_intent[k]):
    print(f"{intent:11} {by_intent[intent]:>5}  {bad_by_intent[intent]:>10}  {bad_by_intent[intent] / by_intent[intent]:>5.0%}")

# build a review queue: all failures from the worst intents + a random sample of the rest for an unbiased view
worst = {k for k in by_intent if bad_by_intent[k] / by_intent[k] > 0.15}
queue = [t["id"] for t in traces if t["thumb_down"] and t["intent"] in worst]
others = [t["id"] for t in traces if t["id"] not in queue]
queue += rng.sample(others, 20)
print(f"\nworst intents: {sorted(worst)}  -> review queue of {len(queue)} traces (failures there + 20 random)")
print("overall thumbs-down rate hides that invoice and api-error questions get thumbs-down many times more often than the rest")
```

## Splitting without leakage

```python run title="Split by conversation, not by message" level=advanced
import random

rng = random.Random(1)
messages = [{"id": i, "conv": f"c{rng.randint(1, 30)}"} for i in range(200)]          # many messages share a conversation

def split_by_key(rows, key, test_frac=0.2, seed=0):
    keys = sorted({r[key] for r in rows}); random.Random(seed).shuffle(keys)
    test_keys = set(keys[: int(len(keys) * test_frac)])
    return [r for r in rows if r[key] not in test_keys], [r for r in rows if r[key] in test_keys]

def leaked(train, test, key):
    return len({r[key] for r in train} & {r[key] for r in test})

shuffled = messages[:]; rng.shuffle(shuffled)
naive_train, naive_test = shuffled[:160], shuffled[160:]
safe_train, safe_test = split_by_key(messages, "conv")
print(f"naive random split : {leaked(naive_train, naive_test, 'conv')} conversations appear in BOTH train and test (leakage)")
print(f"split by conversation: {leaked(safe_train, safe_test, 'conv')} conversations in both")
print("leakage makes eval scores look better than reality; split by the unit that must generalise (user, conversation, document)")
```

## Privacy-safe logging

Logs contain whatever users type. Treat them as sensitive data:

- **Redact** PII and secrets before storage (emails, phone numbers, keys; see the safety module), or tokenise identifiers.
- Apply **retention limits** and delete on request; keep **access controls and audit trails** on the trace store.
- Respect **consent and terms** before using customer data for training or evals; offer opt-outs; keep tenant data separated (and never train a shared model on one tenant's private data without agreement).
- Check **provider data policies** (retention, training use, zero-data-retention options).
- Prefer **aggregates and sampled, redacted examples** for wide internal access.

## Synthetic data: useful and dangerous

LLMs can generate test questions, paraphrases, edge cases, adversarial examples and training pairs when real data is scarce.

Use it for: **bootstrapping evals** before launch, **expanding coverage** of rare cases, **paraphrase robustness**, and **distillation data** from a stronger model.

Be careful: synthetic data **inherits the generator's biases and blind spots**, tends to be **too clean and homogeneous**, can cause **model collapse** when models train on their own outputs repeatedly, and an eval set generated by the same model you test is **optimistic**. Mix with real data, **verify** (filters, judges, human spot checks), keep a **real-data eval** as the source of truth, and check licence terms for using one provider's outputs to train another model.

## Keeping the knowledge base fresh (RAG data pipelines)

Retrieval corpora are data pipelines too:

- **Ingestion**: connectors (docs, wikis, tickets, drives), parsers, cleaning, chunking, embedding, indexing.
- **Incremental updates**: detect changes by hash/modified time, re-embed only changed chunks, **delete** removed documents (stale answers are a real hazard).
- **Metadata**: source, owner, ACLs, version, date, language, for filters and citations.
- **Quality checks**: duplicate detection, empty/garbled parses, index size and recall monitoring with a canary query set.
- **Re-embedding**: plan for model changes (a new embedding model means re-indexing everything, ideally with a blue/green index swap).
- **Observability**: freshness lag (time from source change to searchable), ingestion failures, coverage per source.

```quiz
? Which feedback signal is often the most valuable for improving a drafting assistant?
+ The user's edits to the model's draft, since the edit is the correction
- The number of page views
- Whether the user is logged in
> Implicit signals like edits and acceptance reflect real quality.

? Why split train and test data by conversation or user instead of by random message?
+ Messages from the same conversation are near-duplicates; random splits leak and inflate eval scores
- It is faster
- It increases the dataset size
> Split by the unit that must generalise.

? What is a main risk of evaluating only on LLM-generated test data?
+ It may be too clean and share the generator's blind spots, giving optimistic scores
- It is always illegal
- It cannot be versioned
> Keep a real-data eval as ground truth.

? What must a RAG ingestion pipeline do when a source document is deleted?
+ Remove its chunks from the index so stale content is not retrieved
- Nothing; old chunks are harmless
- Re-embed the whole corpus
> Deletions and freshness need explicit handling.
```

:::problem Three months after launch your assistant's thumbs-down rate is flat at 6%, but support says complaints about one product area are rising. How would you find the problem and turn it into lasting improvement? {level=medium tags="feedback,data"}
Use slicing and the data loop.

:::solution Model answer
The aggregate hides a slice. Cluster/classify traces by intent or product area and compute **thumbs-down, edit and escalation rates per slice** plus judge scores; check retrieval (empty or low-score results) and whether the knowledge base for that area is stale or missing. Sample failures from that slice, have an expert label the correct behaviour, and diagnose the cause (missing content, bad chunking, prompt gap, tool failure). Fix the root cause (ingest new docs, adjust retrieval, update prompt), add the labelled cases to the **regression eval set** with slice-level reporting, set an **alert** on that slice's rate, and consider a feedback prompt shown only in that area. Close the loop by re-running evals in CI so the fix cannot silently regress.
:::
:::

:::keypoints
- Improvement comes from a loop: log, collect feedback, triage failures, label, curate datasets, evaluate, fix, repeat.
- Log structured, reproducible traces (prompt version, retrieval ids, tool results, cost, latency, outcome).
- Prefer implicit feedback captured by normal use (edits, accepts, escalations) over surveys; slice metrics to find hidden failures.
- Version datasets, dedupe, keep golden eval sets separate from training data, and split by conversation/user/document.
- Redact and limit retention, respect consent; use synthetic data to bootstrap but validate against real data.
- Treat RAG ingestion as a pipeline with updates, deletions, metadata, freshness and quality checks.
:::

:::resources
- [Your Product Needs Evals (Hamel Husain)](https://hamel.dev/blog/posts/evals/) — looking at data and building evals from traces.
- [Applied LLMs: Operational](https://applied-llms.org) — practical lessons on data and operations.
- [Langfuse docs](https://langfuse.com/docs) — open-source tracing, datasets and evals.
- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — a vendor-neutral trace schema.
- [Argilla](https://docs.argilla.io) — open-source tool for data labelling and feedback.
- [Model collapse (Shumailov et al.)](https://arxiv.org/abs/2305.17493) — what happens when models train on generated data.
:::
