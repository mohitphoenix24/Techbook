---
title: Fine-Tuning & LoRA
level: advanced
time: 45
summary: When prompting and RAG aren't enough, adapt the model itself. Learn when fine-tuning is worth it, prepare chat-format training data, understand LoRA by training a low-rank adapter from scratch, and see the Hugging Face PEFT recipe, QLoRA, DPO and distillation.
---

Prompting and RAG change **what the model sees**. Fine-tuning changes **the model itself** — its weights — so it adopts a style, format, or skill consistently without long instructions. It's powerful, but it's also the most expensive and least flexible option, so use it deliberately.

:::def Fine-tuning
Continuing to train a pretrained model on a smaller, task-specific dataset so it adapts its behaviour — e.g. always replying in a company's tone, outputting a strict format, or classifying domain-specific text.
:::

## Prompting vs RAG vs fine-tuning

| Goal | Best tool |
|---|---|
| Use private / up-to-date **knowledge** | **RAG** |
| Follow instructions, format, tone — and it works with a good prompt | **Prompting** (+ few-shot examples) |
| Consistent **style/format** at high volume, shorter prompts | **Fine-tuning** |
| A **small, cheap model** that matches a big one on a narrow task | **Fine-tuning / distillation** |
| Teach a genuinely **new skill** or language the base model lacks | **Fine-tuning** (with lots of data) |
| Data changes every week | **RAG** (fine-tuned facts go stale) |

:::tip The usual order
1. Prompt engineering → 2. add RAG and tools → 3. evaluate → 4. fine-tune **only** if a measured gap remains. Fine-tuning also needs an eval set to prove it helped.
:::

## Preparing training data

Most fine-tuning services and libraries use **chat-format JSONL**: one conversation per line, with the ideal assistant reply.

```python run level=intermediate
import json
import random

raw = [
    ("Where is my order #4471?", "Hi! Order #4471 shipped on Monday and should arrive by Thursday. 📦"),
    ("Can I change my delivery address?", "Of course! Go to Orders → Edit address. Changes are possible until the order ships."),
    ("Your app is useless.", "I'm sorry it's been frustrating! Could you tell me what went wrong? I'd love to help fix it."),
    ("Do you ship to Canada?", "Yes! We ship to Canada in 5–8 business days. Duties are included at checkout."),
    ("How do I return shoes?", "Returns are free within 30 days: Orders → Return item, then print the label. 👟"),
]
SYSTEM = "You are ShopBot: friendly, concise, solution-first, max 2 sentences, at most one emoji."

def to_example(user, assistant):
    return {"messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": user},
                         {"role": "assistant", "content": assistant}]}

examples = [to_example(u, a) for u, a in raw]
random.Random(0).shuffle(examples)
split = int(0.8 * len(examples))
for name, rows in [("train.jsonl", examples[:split]), ("val.jsonl", examples[split:])]:
    with open(name, "w", encoding="utf-8") as f:
        for ex in rows:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    print(name, len(rows), "examples")
print(open("train.jsonl", encoding="utf-8").readline()[:200], "...")
```

### Data quality checks

```python run level=intermediate
import json
from collections import Counter

def ex(user, assistant, system="You are ShopBot."):
    return {"messages": [{"role": "system", "content": system}, {"role": "user", "content": user},
                         {"role": "assistant", "content": assistant}]}

rows = [
    ex("Where is my order?", "It shipped Monday and arrives Thursday."),
    ex("Where is my order?", "It shipped Monday and arrives Thursday."),          # exact duplicate
    ex("Do you ship to Canada?", ""),                                              # empty reply
    ex("Tell me about returns", "Returns are free within 30 days. " * 12),         # far too long for the style
    {"messages": [{"role": "user", "content": "Hi"}]},                             # no assistant reply
]

problems = Counter()
for r in rows:
    msgs = r["messages"]
    if msgs[-1]["role"] != "assistant":
        problems["last message not from assistant"] += 1
        continue
    if any(not m["content"].strip() for m in msgs):
        problems["empty message"] += 1
    if len(msgs[-1]["content"].split()) > 40:
        problems["reply too long for the target style"] += 1
dupes = len(rows) - len({json.dumps(r, sort_keys=True) for r in rows})
print(f"{len(rows)} examples, {dupes} duplicate(s)")
for problem, n in problems.items():
    print(f"  ✗ {problem}: {n}")
```

:::warn Quality beats quantity
A few hundred **excellent, consistent, diverse** examples usually beat thousands of sloppy ones. The model will faithfully learn your mistakes, inconsistencies and biases too. Hold out a validation set and an eval set.
:::

## Full fine-tuning vs parameter-efficient fine-tuning

:::def Full fine-tuning
Updating **all** of the model's weights. Best quality ceiling, but for a 7B-parameter model you need memory for the weights, gradients and optimizer state — often 100+ GB — and you get a full-size copy of the model per task.
:::

:::def PEFT (Parameter-Efficient Fine-Tuning)
Freezing the original weights and training only a **small number of extra parameters**. Far less memory, tiny files per task (megabytes), and you can swap tasks by swapping adapters. **LoRA** is the most popular method.
:::

## LoRA: Low-Rank Adaptation

:::def LoRA
Instead of changing a big weight matrix `W` (d × k) directly, learn a **low-rank update** `ΔW = B · A`, where `B` is d × r and `A` is r × k with a small rank `r` (like 8 or 16). The layer computes `W x + (α/r) · B A x`. Only `A` and `B` are trained; `W` stays frozen.
:::

:::formula LoRA
h = W₀x + ΔWx = W₀x + (α / r) · B(Ax)        W₀ frozen;  B ∈ ℝ^(d×r), A ∈ ℝ^(r×k),  r ≪ min(d, k)
:::

:::analogy
The pretrained model is a huge, finished painting. Full fine-tuning repaints the whole canvas. LoRA lays a thin **transparent overlay** on top with just a few strokes — far cheaper, easy to remove, and you can keep different overlays for different jobs.
:::

### Why low-rank works — parameter savings

```python run level=intermediate
def lora_params(d, k, r):
    return d * r + r * k

d = k = 4096                     # one attention projection in a 7B-class model
full = d * k
for r in [4, 8, 16, 64]:
    p = lora_params(d, k, r)
    print(f"rank {r:>2}: {p:>9,} trainable params vs {full:,} full  ({p / full:.2%})")
```

### Train a LoRA adapter from scratch

Here a "pretrained" linear layer `W₀` is frozen. The new task needs a weight change that happens to be (nearly) low-rank — as research suggests fine-tuning updates often are. We learn it with a rank-4 adapter:

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
d_in, d_out, r, alpha = 64, 64, 4, 8

W0 = rng.normal(0, 1 / np.sqrt(d_in), (d_out, d_in))                 # frozen "pretrained" weights
true_delta = rng.normal(size=(d_out, 3)) @ rng.normal(size=(3, d_in)) * 0.1   # the new task's change (rank 3)
X = rng.normal(size=(2000, d_in))
Y = X @ (W0 + true_delta).T                                          # targets for the new task

A = rng.normal(0, 0.01, (r, d_in))       # LoRA init: A small random,
B = np.zeros((d_out, r))                 # B zeros -> the adapter starts as a no-op
scale, lr = alpha / r, 0.05

def loss_fn():
    pred = X @ W0.T + scale * (X @ A.T) @ B.T
    return np.mean((pred - Y) ** 2)

print(f"before training: loss {loss_fn():.5f}  (W0 alone)")
for step in range(1, 801):
    idx = rng.integers(0, len(X), 128)
    xb, yb = X[idx], Y[idx]
    xa = xb @ A.T                                    # (batch, r)
    pred = xb @ W0.T + scale * xa @ B.T
    g = 2 * (pred - yb) / len(idx)                   # dL/dpred
    grad_B = scale * g.T @ xa                        # only A and B get gradients — W0 is frozen
    grad_A = scale * (g @ B).T @ xb
    B -= lr * grad_B
    A -= lr * grad_A
    if step % 200 == 0:
        print(f"step {step}: loss {loss_fn():.6f}")

print(f"\ntrainable LoRA params: {A.size + B.size:,}   frozen params: {W0.size:,}")
merged = W0 + scale * B @ A                          # merge the adapter for zero-overhead inference
print("merged weights reproduce the adapter:", np.allclose(X[:5] @ merged.T, X[:5] @ W0.T + scale * (X[:5] @ A.T) @ B.T))
```

:::def Merging an adapter
After training, `W = W₀ + (α/r)·BA` can be computed once and saved as a normal weight matrix — so inference has **no extra cost**. Or keep adapters separate to switch tasks on one base model.
:::

## QLoRA

:::def QLoRA
LoRA on top of a base model **quantized to 4-bit**. The frozen weights take ~4× less memory, so you can fine-tune a 7–8B model on a single consumer GPU (or a free Colab GPU), with quality close to 16-bit LoRA.
:::

## The Hugging Face recipe (run locally)

```python local title="LoRA fine-tuning with TRL + PEFT"
# pip install transformers datasets peft trl accelerate bitsandbytes
from datasets import load_dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

dataset = load_dataset("json", data_files={"train": "train.jsonl", "validation": "val.jsonl"})

peft_config = LoraConfig(
    r=16,                         # rank
    lora_alpha=32,                # scaling (alpha / r)
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],   # which layers get adapters
    task_type="CAUSAL_LM",
)

trainer = SFTTrainer(
    model="Qwen/Qwen2.5-1.5B-Instruct",       # any chat model from the Hub that fits your GPU
    train_dataset=dataset["train"],
    eval_dataset=dataset["validation"],
    peft_config=peft_config,
    args=SFTConfig(
        output_dir="shopbot-lora",
        num_train_epochs=3,
        per_device_train_batch_size=4,
        gradient_accumulation_steps=4,        # effective batch size 16
        learning_rate=2e-4,                   # LoRA tolerates higher lr than full fine-tuning
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        logging_steps=10,
        eval_strategy="epoch",
        bf16=True,
    ),
)
trainer.train()
trainer.save_model("shopbot-lora")            # saves only the adapter (a few MB)
```

The trainer applies the chat template, masks the loss so only **assistant** tokens are learned (in its default chat-data handling), and runs the training loop you know: forward → cross-entropy → backward → AdamW step.

| Hyperparameter | Typical starting point |
|---|---|
| rank `r` | 8–32 |
| `lora_alpha` | 1–2 × r |
| learning rate | 1e-4 – 2e-4 (LoRA) |
| epochs | 1–3 (watch validation loss for overfitting) |
| target modules | attention projections; add MLP layers for harder tasks |

## Beyond supervised fine-tuning

:::def Preference tuning (DPO)
Training on **pairs** of responses — a preferred ("chosen") and a worse ("rejected") answer to the same prompt — so the model learns to prefer the better kind. **DPO** (Direct Preference Optimization) does this directly with a simple loss, without training a separate reward model as RLHF does.
:::

```python run level=intermediate
import json

preference_pair = {
    "prompt": "Explain recursion to a beginner.",
    "chosen": "Recursion is when a function solves a problem by calling itself on a smaller version of it — like Russian dolls, each containing a smaller one, until the smallest.",
    "rejected": "Recursion is a method where the solution depends on solutions to smaller instances of the same problem, per the formal definition in computability theory.",
}
print(json.dumps(preference_pair, indent=2))
```

:::def Distillation
Training a **small "student"** model to imitate a **large "teacher"** model's outputs on your task. Generate high-quality answers with the big model, filter them, and fine-tune the small model on them — getting much of the quality at a fraction of the cost and latency.
:::

## Fine-tuning hosted models

Some providers let you fine-tune their hosted models by uploading JSONL; availability and supported models vary by provider and change over time — check current documentation. For frontier models like Claude, most teams get the same benefits from **strong system prompts, few-shot examples, prompt caching and RAG**, and fine-tune smaller open models when they need a specialised, cheap model.

:::ai Evaluate before and after
Always run your eval set on (1) the base model with your best prompt and (2) the fine-tuned model. Fine-tuning can quietly hurt general abilities ("catastrophic forgetting") or overfit to your examples' quirks. Ship it only if it clearly wins on the metrics you care about.
:::

## Check yourself

```quiz
? Your support bot must answer from a product catalogue that changes daily. Best approach?
+ RAG over the catalogue
- Fine-tune weekly on the catalogue
- A longer system prompt with every product
> Facts that change belong in retrieval, not in weights.

? In LoRA, which parameters are trained?
+ Only the small low-rank matrices A and B
- All of the model's weights
- Only the embeddings
> W₀ is frozen; the update is ΔW = B·A.

? Why is B initialised to zeros in LoRA?
+ So the adapter starts as a no-op and training begins from the original model's behaviour
- To save memory
- Because A must be zero too
> B·A = 0 at the start.

? What makes QLoRA possible on a single consumer GPU?
+ The frozen base model is quantized to 4-bit, cutting memory roughly 4×
- It trains fewer epochs
- It doesn't use gradients
> Only the adapters are trained in higher precision.
```

:::keypoints
- Try **prompting → RAG/tools → evals** first; fine-tune to close a measured gap in style, format, cost or narrow skill.
- Training data = consistent, high-quality **chat-format JSONL**, with train/validation splits.
- **LoRA** trains a low-rank update `ΔW = BA` (tiny, swappable, mergeable); **QLoRA** adds a 4-bit base for single-GPU training.
- TRL's `SFTTrainer` + PEFT's `LoraConfig` is the standard open-source recipe.
- **DPO** learns from preference pairs; **distillation** transfers a big model's skill to a small one. Evaluate before and after.
:::
