---
title: To Fine-Tune or Not to Fine-Tune
level: intermediate
time: 40
summary: The decision framework for adapting a model. The escalation ladder (prompting, RAG, tools, fine-tuning), what fine-tuning is genuinely good at (behaviour, format, style, cheap specialists, latency, distillation) and what it is bad at (new facts), the approaches (full, parameter-efficient, API-based, preference tuning), data and cost requirements, risks, and a break-even calculator.
---

Fine-tuning is the most over-chosen and most under-measured technique in applied AI. Teams reach for it because it sounds like "teaching the model our stuff", then discover that it is expensive, brittle, and often unnecessary. Other teams avoid it past the point where it would pay off massively. The skill is **knowing when**.

:::def Fine-tuning
Continuing the training of a pretrained model on a **smaller, task-specific dataset**, so its **weights change** to produce the behaviour you want. Variants: **full fine-tuning** (all weights), **parameter-efficient fine-tuning** (small added or selected parameters, such as LoRA), **supervised** (learn from example outputs), **preference-based** (learn from comparisons or rewards), and **API-managed** fine-tuning offered by providers.
:::

## The escalation ladder

Always climb in this order, and stop when evals say you are done:

:::flow Adapting a model
Better prompts | instructions, examples, structure, reasoning effort (hours; free)
Retrieval (RAG) | give it the facts it lacks (days)
Tools and workflows | let it look up, compute and act; add checks (days)
Better or different model | a stronger model, or a cheaper one that is good enough (hours)
Fine-tuning | change the weights for behaviour, format, cost or latency (days to weeks)
Pretraining / continued pretraining | new domain at scale (rare; large teams)
:::

Rule of thumb from practitioners: **prompt and evaluate first; if the failures are about missing knowledge, use RAG; if they are about behaviour, consistency, format, tone or cost at scale, consider fine-tuning.**

## What fine-tuning is good at

| Goal | Why fine-tuning helps | Example |
|---|---|---|
| **Consistent format and style** | the behaviour becomes the default, with no long instructions | always output a specific JSON dialect; brand voice |
| **Reliable behaviour on a narrow task** | many examples teach nuance prompts cannot | classification with subtle labels; routing; extraction in a messy domain |
| **Domain language and conventions** | learn jargon, notation, house style | clinical shorthand, legal phrasing, internal codebase idioms |
| **Cost and latency** | a small tuned model can match a big prompted one on a narrow task | replace a frontier model on a high-volume classifier |
| **Shorter prompts** | behaviour moves from prompt to weights | removing 3,000 tokens of instructions and examples |
| **Tool-use patterns** | teach when and how to call your tools | an agent for your API |
| **Distillation** | transfer a strong model's behaviour into a cheaper one | teacher-generated data → student |
| **Safety/behavioural tuning** | refusal style, guideline adherence | preference tuning |
| **Privacy / on-prem requirements** | a small open model you host | regulated environments |

## What it is bad at

- **Adding new facts**: fine-tuning on documents makes models **mimic** the style and sometimes memorise, but it is an unreliable, hard-to-update way to store knowledge, can **increase hallucination** on facts it only half-learned, and cannot cite or be corrected by editing a document. Use RAG.
- **Fixing missing capabilities**: a small model cannot be tuned into a frontier reasoner with a few thousand examples.
- **Quick iteration**: each experiment costs a training run; prompts change in seconds.
- **Anything you cannot evaluate**: without a good eval you cannot tell improvement from damage.

## Risks and costs

| Risk | Detail |
|---|---|
| **Catastrophic forgetting** | tuning narrows or degrades general abilities and safety behaviours |
| **Overfitting / memorisation** | the model parrots training examples; leaks training data |
| **Data quality** | garbage examples teach garbage; label noise is amplified |
| **Distribution shift** | tuned on yesterday's data; behaviour drifts as the world changes |
| **Maintenance burden** | every base-model upgrade means re-tuning and re-evaluating |
| **Lock-in** | a tuned model is tied to a base model and provider |
| **Safety regression** | fine-tuning can weaken safety training; re-run safety evals |
| **Cost** | data creation and labelling (usually the biggest part), compute, evaluation, serving |

## Approaches compared

| Approach | What changes | Compute | When |
|---|---|---|---|
| **Full fine-tuning** | all parameters | high (see the infra lesson) | large datasets, big behaviour change, you control the stack |
| **LoRA / QLoRA (PEFT)** | small low-rank adapters on top of frozen weights | low to moderate | the default for most teams; swap adapters per task |
| **Provider-managed fine-tuning** | the provider trains and hosts it | pay per token; no GPUs | simplest path where available (check supported models) |
| **Preference tuning (DPO/RLHF)** | behaviour toward preferred outputs | moderate | style, helpfulness, safety, ranking quality |
| **Reinforcement learning with verifiable rewards** | reasoning and task success | high | maths, code, tasks with checkers |
| **Distillation** | a student learns from a teacher | moderate | cheaper deployment |
| **Continued pretraining** | knowledge/language at scale | very high | new language or domain corpora, rare |

## How much data?

| Task | Typical size to see an effect |
|---|---|
| Format and style | 50–500 high-quality examples |
| Narrow classification/extraction | 500–10,000 labelled examples |
| Broad instruction-following in a domain | 1,000–50,000 |
| Distillation of a general assistant | 10,000–1,000,000+ |
| Preference tuning | 5,000–100,000 pairs |

Quality dominates quantity: **LIMA** ([paper](https://arxiv.org/abs/2305.11206)) showed that ~1,000 carefully curated examples can give strong instruction-following on a good base model. If you do not already have a well-evaluated task and at least a few hundred good examples, you are not ready to fine-tune.

## A break-even calculator

Fine-tuning is often justified by **cost at scale**: pay once for data and training, then serve a cheaper model.

```python run title="When does a fine-tuned small model beat a prompted large model?" level=intermediate
def monthly_cost_prompted(requests, in_tokens, out_tokens, price_in, price_out):
    return requests * (in_tokens * price_in + out_tokens * price_out) / 1e6

def monthly_cost_tuned(requests, in_tokens, out_tokens, price_in, price_out, hosting=0.0):
    return hosting + requests * (in_tokens * price_in + out_tokens * price_out) / 1e6

# a classification task: the big prompted model needs a long prompt with examples; the tuned small model needs a short one
big = dict(in_tokens=2500, out_tokens=20, price_in=2.0, price_out=10.0)        # $ per million tokens (example)
small = dict(in_tokens=250, out_tokens=20, price_in=0.4, price_out=1.6)

one_time = 12_000 + 4_000 + 3_000          # data labelling + training experiments + evaluation work (USD, illustrative)
print(f"{'requests/month':>15} {'prompted big':>13} {'tuned small':>12} {'monthly saving':>15} {'payback (months)':>17}")
for requests in (50_000, 500_000, 5_000_000, 50_000_000):
    a = monthly_cost_prompted(requests, **big)
    b = monthly_cost_tuned(requests, **small, hosting=300)
    saving = a - b
    payback = one_time / saving if saving > 0 else float("inf")
    print(f"{requests:>15,} {a:>12,.0f}$ {b:>11,.0f}$ {saving:>14,.0f}$ {payback:>17.1f}")
```

At low volume, prompting wins (and iterates faster). At high volume on a **stable narrow task**, fine-tuning pays back quickly. Remember the hidden costs (maintenance, re-tuning, evaluation) and that **prompt caching and a cheaper off-the-shelf model** may close much of the gap without any training.

## A decision function

```python run title="Should we fine-tune? A checklist as code" level=easy
def should_fine_tune(c):
    reasons, blockers = [], []
    if not c["has_eval"]:                     blockers.append("no eval set: you cannot tell whether tuning helped")
    if c["failure_is_missing_knowledge"]:     blockers.append("failures are missing facts: use RAG instead")
    if c["good_examples"] < 200:              blockers.append(f"only {c['good_examples']} good examples")
    if c["prompting_tried"] is False:         blockers.append("strong prompting/few-shot not tried yet")
    if c["needs_consistent_format"]:          reasons.append("consistent format/style at scale")
    if c["monthly_requests"] > 1_000_000 and c["task_is_narrow"]: reasons.append("high volume on a narrow task: cost/latency win")
    if c["must_self_host"]:                   reasons.append("must run a small model on your own infrastructure")
    if blockers: return "NOT YET", blockers
    return ("FINE-TUNE" if reasons else "PROBABLY NOT NEEDED"), reasons

cases = {
    "support bot with outdated answers": dict(has_eval=True, failure_is_missing_knowledge=True, good_examples=900, prompting_tried=True, needs_consistent_format=False, monthly_requests=200_000, task_is_narrow=False, must_self_host=False),
    "ticket router, 5M/month, strict labels": dict(has_eval=True, failure_is_missing_knowledge=False, good_examples=6000, prompting_tried=True, needs_consistent_format=True, monthly_requests=5_000_000, task_is_narrow=True, must_self_host=False),
    "startup, no eval yet": dict(has_eval=False, failure_is_missing_knowledge=False, good_examples=50, prompting_tried=False, needs_consistent_format=True, monthly_requests=10_000, task_is_narrow=True, must_self_host=False),
}
for name, c in cases.items():
    verdict, why = should_fine_tune(c)
    print(f"{name}: {verdict}\n   - " + "\n   - ".join(why))
```

## A sensible workflow

1. Build the **eval** and a strong **prompted baseline** (and measure cost and latency).
2. Analyse failures: knowledge, behaviour, format, capability?
3. Try **RAG, tools, better prompts, a different model**.
4. If behaviour/cost/latency remains the issue: assemble **data** (next lesson), start with a **small LoRA experiment**.
5. Compare the tuned model with the baseline on your eval **and** on general and **safety** regression tests.
6. Deploy behind a flag; monitor; plan the **re-tuning** cycle.

```quiz
? Which problem is fine-tuning poorly suited to?
- Enforcing a consistent output style
+ Teaching the model new, changing facts about your company
- Distilling a big model into a small one
> Use retrieval for facts: it is updatable, citable and auditable.

? When does fine-tuning often pay for itself?
+ High-volume, stable, narrow tasks where a small tuned model replaces a large prompted one
- Low-volume exploratory tasks
- Tasks without evals
> Cost and latency at scale are the classic wins.

? What is "catastrophic forgetting"?
+ Tuning degrades abilities (including safety behaviours) the model had before
- Forgetting your API key
- Losing a checkpoint
> Mitigate with LoRA, lower learning rates, mixed data and regression evals.

? What must exist before you fine-tune?
+ An evaluation set and a strong prompted baseline to beat
- A GPU cluster
- A new tokenizer
> Without them you cannot tell if tuning helped.
```

:::problem A company wants to fine-tune a model on its 10,000-page product manuals so it "knows" the products. Advise them. {level=easy tags="fine-tuning,rag"}
Give a recommendation with reasons.

:::solution Model answer
Do **RAG**, not fine-tuning, for product knowledge: manuals change, answers need citations, and fine-tuning is unreliable at storing facts (and risks hallucinating confidently). Build ingestion, hybrid search, reranking and grounded generation with evals. Consider **fine-tuning later** for behaviour: consistent tone, structured answer format, or tool-use patterns, using curated question-answer examples, and possibly a small model for cost, once the RAG system's evals show behavioural (not knowledge) failures.
:::
:::

:::keypoints
- Climb the ladder: prompts → RAG → tools/workflows → model choice → fine-tuning; evaluate at every rung.
- Fine-tune for behaviour, format, style, narrow-task consistency, latency/cost and distillation; do not fine-tune to add facts.
- Approaches: full, LoRA/QLoRA, provider-managed, preference tuning, RL with verifiable rewards, distillation, continued pretraining.
- Data quality beats quantity; hundreds to thousands of excellent examples often suffice for style and narrow tasks.
- Count the risks and hidden costs (forgetting, safety regressions, maintenance, lock-in) and use break-even maths and evals to decide.
:::

:::resources
- [OpenAI: Fine-tuning guide](https://platform.openai.com/docs/guides/fine-tuning) — when and how, with an excellent decision discussion.
- [LIMA: Less Is More for Alignment](https://arxiv.org/abs/2305.11206) — quality over quantity.
- [Hugging Face LLM Course](https://huggingface.co/learn/llm-course) — fine-tuning chapters with Transformers and Datasets.
- [Maxime Labonne: LLM course](https://github.com/mlabonne/llm-course) — a roadmap including fine-tuning, quantization and merging.
- [Chip Huyen: AI Engineering](https://www.oreilly.com/library/view/ai-engineering/9781098166298/) — the finetuning chapter's decision framework.
- [Eugene Yan: Patterns for Building LLM-based Systems & Products](https://eugeneyan.com/writing/llm-patterns/) — fine-tuning vs RAG vs prompting.
:::
