---
title: Evaluating, Shipping and Maintaining Fine-Tuned Models
level: advanced
time: 40
summary: From a trained adapter to a production feature. A promotion checklist (task, regression, safety, cost and latency against the baseline), packaging (merge, quantise, GGUF), serving options (vLLM with multi-LoRA, llama.cpp/Ollama, managed endpoints), versioning and rollout, monitoring for drift, the retraining loop, and a runnable adapter registry with canary routing and rollback.
---

A fine-tuned model is not finished when training ends. It becomes an **artefact** you must evaluate, package, serve, version, monitor and eventually replace. Teams that treat it like any other production dependency avoid the common story: "we fine-tuned it once, nobody remembers how, and it is now worse than the new base model".

## Promotion checklist: is it better enough to ship?

Compare the candidate against the **current production system** (usually a prompted base model, or the previous tuned version):

| Dimension | What to check | Pass condition |
|---|---|---|
| **Task quality** | your golden set, per slice; confidence intervals | beats baseline on the metrics that matter, no critical-slice regression |
| **Format validity** | schema/parse rates | at or above baseline |
| **General capability** | a regression suite of unrelated tasks | no meaningful drop |
| **Safety and policy** | red-team set, refusals, over-refusals, injection tests | no regression; fine-tuning can weaken safety |
| **Robustness** | paraphrases, typos, long inputs, other languages, out-of-distribution | acceptable degradation |
| **Calibration and abstention** | does it still say "I don't know" appropriately? | not worse |
| **Latency and cost** | tokens, time to first token, throughput, GPU hours | meets the goal that justified tuning |
| **Behavioural diff** | read flipped cases vs baseline | explained, intended changes only |
| **Reproducibility** | data version, code, hyperparameters, seed | recorded |

Write the **model card**: base model and licence, data sources and filters, training config, evals and results, intended use, known limitations, owner.

## Packaging options

| Option | How | When |
|---|---|---|
| **Keep the adapter separate** | ship the small LoRA file; load onto the shared base at serve time | many variants; fast iteration; multi-LoRA serving |
| **Merge into the base** | `merge_and_unload()` then save; a normal model | simplest serving; no adapter overhead; a single dedicated variant |
| **Quantise** | GPTQ / AWQ / FP8 / INT4-INT8 or **GGUF** (llama.cpp formats such as Q4_K_M) | cheaper and faster inference; edge and local; always **re-evaluate after quantising** |
| **Export to other runtimes** | GGUF for llama.cpp/Ollama/LM Studio, MLX for Apple silicon, TensorRT-LLM engines | target-specific performance |

```bash
# GGUF for llama.cpp/Ollama (after merging the adapter into a standard Hugging Face model directory)
python convert_hf_to_gguf.py merged-model --outfile model-f16.gguf --outtype f16
llama-quantize model-f16.gguf model-q4_k_m.gguf Q4_K_M
# then: ollama create my-model -f Modelfile      (Modelfile:  FROM ./model-q4_k_m.gguf)
```

**Quantisation changes behaviour**: evaluate the **exact artefact you will serve**, not the full-precision one.

## Serving

```bash
# vLLM with a base model and several LoRA adapters served from one process
vllm serve Qwen/Qwen3-4B-Instruct-2507 \
  --enable-lora \
  --lora-modules support-v3=./adapters/support-v3 legal-v1=./adapters/legal-v1 \
  --max-lora-rank 32
# clients then pass the adapter name as the "model":  model="support-v3"  (OpenAI-compatible API)
```

| Approach | Strength |
|---|---|
| **vLLM / SGLang / TGI** | production throughput (continuous batching, paged KV cache), multi-LoRA, OpenAI-compatible API (next module) |
| **llama.cpp / Ollama / LM Studio** | local and edge, CPU or Apple silicon, GGUF |
| **Managed endpoints** (cloud ML platforms, GPU clouds, provider fine-tuned model hosting) | no ops; autoscaling; pay per use or per hour |
| **Serverless GPU** (Modal, Baseten, etc.) | scale to zero for spiky workloads (watch cold starts when loading weights) |

Multi-LoRA serving lets you host **hundreds of adapters** on one base, loading hot adapters into GPU memory on demand: ideal for per-customer or per-task variants.

## Versioning and rollout

Treat each tuned model as a **versioned, immutable artefact** with an id, linked to its **data version, code commit, config and eval report**. Route traffic through **aliases** (`support-prod` → `support-v3`), not hard-coded ids.

```python run title="An adapter registry with aliases, canary routing and instant rollback" level=advanced
import random, hashlib

class Registry:
    def __init__(self):
        self.models = {}                                    # id -> metadata (immutable once registered)
        self.alias = {}                                     # alias -> {"stable": id, "canary": id|None, "canary_pct": float}
    def register(self, mid, base, data_version, eval_score, notes=""):
        assert mid not in self.models, "model ids are immutable"
        self.models[mid] = dict(base=base, data=data_version, eval=eval_score, notes=notes)
    def promote(self, alias, mid, min_eval):
        if self.models[mid]["eval"] < min_eval:
            raise ValueError(f"{mid} eval {self.models[mid]['eval']:.2f} below gate {min_eval:.2f}")
        self.alias[alias] = {"stable": mid, "canary": None, "canary_pct": 0.0}
    def start_canary(self, alias, mid, pct): self.alias[alias].update(canary=mid, canary_pct=pct)
    def route(self, alias, user_id):
        a = self.alias[alias]
        bucket = int(hashlib.sha256(user_id.encode()).hexdigest(), 16) % 10_000 / 10_000      # sticky per user
        return a["canary"] if a["canary"] and bucket < a["canary_pct"] else a["stable"]
    def rollback(self, alias): self.alias[alias].update(canary=None, canary_pct=0.0)

reg = Registry()
reg.register("support-v2", "qwen3-4b", "data-2026-08", 0.86)
reg.register("support-v3", "qwen3-4b", "data-2026-10", 0.90, "adds refund-policy cases")
reg.register("support-v4-bad", "qwen3-4b", "data-2026-10b", 0.84)

reg.promote("support-prod", "support-v2", min_eval=0.80)
reg.start_canary("support-prod", "support-v3", pct=0.10)
users = [f"user{i}" for i in range(2000)]
share = sum(reg.route("support-prod", u) == "support-v3" for u in users) / len(users)
print(f"canary share of traffic: {share:.1%} (target 10%)")
try:
    reg.promote("support-prod", "support-v4-bad", min_eval=0.85)
except ValueError as e:
    print("blocked by the eval gate:", e)
reg.rollback("support-prod")
print("after rollback, every user gets:", {reg.route("support-prod", u) for u in users[:50]})
```

Rollout steps: **shadow** (compare silently) → **canary** (1–10%) with guardrail metrics → gradual increase → full, with the previous version warm for instant rollback.

## Monitoring and drift

A tuned model is frozen; the world is not. Watch:

- **Quality**: sampled judge scores and human review on live traffic; user feedback; task success where measurable.
- **Input drift**: new topics, languages, formats the training data did not cover (PSI on intent mix, embedding-cluster shifts).
- **Output drift**: length, refusal rate, format-validity rate, confidence.
- **Operational**: latency, errors, GPU memory, adapter load times, cost.
- **Safety**: injection attempts, policy violations, toxic output rate.

Set **retraining triggers**: quality below threshold for N days; input drift above a limit; a new base model release; a policy or product change; a pile of reviewed failures large enough to teach from.

## The retraining and upgrade loop

:::flow Keeping a tuned model healthy
Collect | log inputs, outputs, feedback; sample and label failures
Curate | add corrected examples; dedupe; rebalance; version the dataset
Retrain | from the same recipe (code, config, seed recorded)
Evaluate | same golden set + new failure cases + regression and safety
Release | shadow → canary → rollout; keep the old version for rollback
Re-baseline | compare against the newest prompted base model
:::

**Always re-baseline against the latest off-the-shelf model.** New base models improve quickly; a tuned older model can be overtaken by a better base with a good prompt (and RAG), at zero maintenance cost. Re-run your original "is fine-tuning worth it?" analysis every quarter or so. If you keep tuning, port your data and recipe to the new base and re-evaluate (a recipe that is scripted and versioned makes this a few hours of work).

## Costs to track

| Item | Notes |
|---|---|
| Data creation and labelling | usually the largest |
| Training compute | small for LoRA; track per experiment |
| Evaluation compute | including LLM judges |
| Serving | GPU hours, utilisation; multi-LoRA lowers per-variant cost |
| Engineering and maintenance | retraining cycles, monitoring, on-call |

Compare **total cost of ownership** against the alternative (a larger prompted model, with caching and RAG).

```quiz
? Why must you evaluate the exact artefact you will serve?
+ Quantisation, merging or format conversion can change behaviour, so the served model must be the one that was evaluated
- Artefacts are always identical
- It is faster to skip
> Evaluate after quantising and exporting.

? What is the benefit of serving LoRA adapters separately on a shared base?
+ Many task- or customer-specific variants share one GPU-resident base, loading adapters on demand
- Adapters run faster than merged models
- It removes the need for evals
> Multi-LoRA serving reduces per-variant cost.

? Why route traffic through aliases rather than model ids?
+ You can promote, canary and roll back versions without changing client code
- Aliases are required by vLLM
- It shortens prompts
> Immutable ids plus movable aliases give safe releases.

? Why re-baseline against the newest base model periodically?
+ A better off-the-shelf model with a good prompt may now match or beat your tuned one at lower maintenance cost
- Base models never improve
- It is a legal requirement
> Fine-tunes depreciate as base models advance.
```

:::problem Two months after deploying your fine-tuned classifier, accuracy on live traffic fell from 94% to 88%. What do you do? {level=medium tags="drift,retraining"}
Describe diagnosis and response.

:::solution Model answer
Check **monitoring and traces**: has the **input distribution drifted** (new products, languages, phrasing)? use PSI and cluster analysis; sample and label recent errors to categorise them (new class, changed policy, ambiguous labels, formatting). Rule out **model/serving changes** (a quantisation or library update) and **label/policy changes**. Short term: route low-confidence cases to a larger model or humans, and add the new failure types as eval cases. Medium term: **retrain** with the new labelled examples (keeping a replay of old data), evaluate against the baseline **and the newest prompted base model**, canary, and promote with the old version ready for rollback. Add drift alerts and a scheduled retraining review.
:::
:::

:::keypoints
- Promote a tuned model only if it beats the production baseline on task metrics, format validity, general and safety regression, robustness, cost and latency, with an explained behavioural diff.
- Package as a separate adapter, a merged model, or quantised formats (including GGUF); always evaluate the exact served artefact.
- Serve with vLLM-style engines (multi-LoRA), llama.cpp/Ollama for local, or managed endpoints.
- Treat models as immutable versioned artefacts behind aliases with shadow, canary and rollback.
- Monitor quality, drift, safety and cost; retrain on triggers; re-baseline against the newest base model regularly.
:::

:::resources
- [vLLM docs](https://docs.vllm.ai) — LoRA serving, quantisation and the OpenAI-compatible server.
- [llama.cpp](https://github.com/ggml-org/llama.cpp) and [Ollama](https://ollama.com) — GGUF export, quantisation and local serving.
- [Hugging Face PEFT docs](https://huggingface.co/docs/peft) — saving, loading and merging adapters.
- [Hugging Face: GPTQ integration](https://huggingface.co/blog/gptq-integration) — post-training quantisation in practice.
- [Model Cards for Model Reporting](https://arxiv.org/abs/1810.03993) — documenting what you ship.
- [Chip Huyen: AI Engineering](https://www.oreilly.com/library/view/ai-engineering/9781098166298/) — finetuning, evaluation and deployment trade-offs.
:::
