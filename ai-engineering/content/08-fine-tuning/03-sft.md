---
title: Supervised Fine-Tuning (SFT) in Practice
level: advanced
time: 50
summary: What SFT does, the loss and the training loop, the hyperparameters that matter (learning rate, epochs, batch size, warmup and cosine schedules, sequence length, packing), reading loss curves and spotting overfitting, early stopping, avoiding catastrophic forgetting, and evaluation. Includes runnable demonstrations of learning-rate schedules, overfitting with early stopping, and gradient accumulation.
---

**Supervised fine-tuning (SFT)** continues training a pretrained model on (prompt → ideal response) examples. It is the workhorse of model adaptation: the first stage of turning a base model into an assistant, and the usual way to teach a model your format, tone and task.

## What is being optimised

The same objective as pretraining: **next-token cross-entropy**, but computed only on **response tokens** (loss masking from the previous lesson):

:::formula SFT loss
\mathcal{L}(\theta) = -\frac{1}{|R|}\sum_{t \in R} \log p_\theta\big(x_t \mid x_{<t}\big)
:::

where `R` is the set of response token positions. Minimising it makes the model assign higher probability to your example responses given their prompts. You compute gradients, and an optimiser (usually **AdamW**) updates the weights.

```viz algo=arch title="One SFT training step" dir=down
batch  Batch of examples | prompt + response tokens [docs] @0,0
fwd    Forward pass | logits for every position [llm] @1,0
loss   Cross-entropy on response tokens only [eval] @2,0
bwd    Backward pass | gradients [chart] @3,0
opt    Optimiser (AdamW) | update weights [worker] @4,0
--
batch -> fwd
fwd -> loss
loss -> bwd
bwd -> opt
opt -> fwd : next batch
```

## The hyperparameters that matter

| Hyperparameter | Typical range | Notes |
|---|---|---|
| **Learning rate** | full fine-tuning: **1e-6 – 2e-5**; LoRA: **1e-4 – 3e-4** | the most important knob; too high destroys pretrained knowledge, too low learns nothing |
| **Epochs** | **1–3** | small datasets tolerate 3–5; more risks memorisation |
| **Batch size** (effective) | 16–128 sequences | use **gradient accumulation** to reach it on small GPUs |
| **LR schedule** | linear warmup (3–10% of steps) then **cosine** or linear decay | warmup avoids early instability |
| **Weight decay** | 0.0–0.1 | mild regularisation |
| **Max sequence length** | covers your examples (512–8192+) | longer = more memory (quadratic attention without flash-attention) |
| **Packing** | pack several short examples into one sequence | big throughput gain; make sure attention is not leaking across examples if the library does not mask it |
| **Precision** | **bf16** mixed precision (fp16 needs loss scaling) | standard on modern GPUs |
| **Gradient clipping** | max-norm 1.0 | prevents rare exploding updates |
| **Dropout** (LoRA) | 0–0.1 | regularisation for small data |

Start from the **recommended defaults of the library or model card** (and the references in this module), change **one thing at a time**, and track **validation loss and task metrics**, not just training loss.

### Learning-rate schedules

```python run title="Warmup + cosine decay learning-rate schedule" level=easy
import math

def lr_at(step, total_steps, peak_lr, warmup_frac=0.05, min_ratio=0.1):
    warmup = max(1, int(total_steps * warmup_frac))
    if step < warmup:
        return peak_lr * (step + 1) / warmup                                  # linear warmup
    progress = (step - warmup) / max(1, total_steps - warmup)
    cosine = 0.5 * (1 + math.cos(math.pi * progress))                          # 1 -> 0
    return peak_lr * (min_ratio + (1 - min_ratio) * cosine)                   # decay to min_ratio * peak

total, peak = 1000, 2e-4
for s in (0, 25, 50, 250, 500, 750, 999):
    bar = "#" * int(40 * lr_at(s, total, peak) / peak)
    print(f"step {s:>4}: lr={lr_at(s, total, peak):.2e} {bar}")
```

### Gradient accumulation

Large effective batches improve stability but do not fit in memory. **Accumulate** gradients over several micro-batches before one optimiser step. The result equals one big batch (if you divide the loss correctly).

```python run title="Gradient accumulation gives the same update as a big batch" level=intermediate
import numpy as np

rng = np.random.default_rng(0)
X = rng.normal(size=(32, 5)); y = X @ np.array([1.0, -2.0, 0.5, 0.0, 3.0]) + 0.1 * rng.normal(size=32)
w = np.zeros(5)

def grad(w, Xb, yb):                                  # gradient of mean squared error
    return 2 * Xb.T @ (Xb @ w - yb) / len(Xb)

full = grad(w, X, y)                                  # one batch of 32

accum = np.zeros(5)
for i in range(4):                                    # 4 micro-batches of 8
    sl = slice(i * 8, (i + 1) * 8)
    accum += grad(w, X[sl], y[sl]) / 4                # divide by the number of accumulation steps
print("max difference between big-batch and accumulated gradient:", float(np.abs(full - accum).max()))
```

## Reading loss curves

Training loss should fall smoothly. **Validation loss** tells you about generalisation.

| Pattern | Meaning | Action |
|---|---|---|
| train ↓, val ↓ | learning | continue |
| train ↓, val ↑ (gap widens) | **overfitting** | fewer epochs, lower LR, more data, regularise, early stop |
| both high and flat | underfitting / LR too low / bad data | raise LR, check data and masking |
| loss spikes or NaN | LR too high, bad batch, fp16 overflow | lower LR, clip gradients, use bf16, inspect data |
| train loss very low (≈0) | memorising | reduce epochs; examples may be duplicated |
| loss good but outputs bad | wrong template, masking bug, eval mismatch | inspect generations, verify the template |

Remember that **lower loss does not always mean better outputs**: loss measures token likelihood, not task success. Always evaluate **generations** on your task metrics.

```python run title="Overfitting and early stopping on a tiny classifier" level=advanced
import numpy as np

rng = np.random.default_rng(3)
D, N_TRAIN, N_VAL = 300, 40, 400                    # many features, few examples: easy to overfit
w_true = np.zeros(D); w_true[:5] = [2, -2, 1.5, -1.5, 1]

def make(n, noise):
    X = rng.normal(size=(n, D))
    y = (X @ w_true + noise * rng.normal(size=n) > 0).astype(float)
    flip = rng.random(n) < 0.15                       # 15% label noise (bad data!)
    return X, np.where(flip, 1 - y, y)

Xtr, ytr = make(N_TRAIN, 0.5); Xva, yva = make(N_VAL, 0.5)

def loss_acc(w, X, y):
    p = 1 / (1 + np.exp(-(X @ w)))
    ce = -np.mean(y * np.log(p + 1e-9) + (1 - y) * np.log(1 - p + 1e-9))
    return ce, np.mean((p > 0.5) == y)

w, lr = np.zeros(D), 0.05
best = (1e9, 0, None)
print(f"{'epoch':>5} {'train loss':>11} {'val loss':>9} {'val acc':>8}")
for epoch in range(1, 401):
    p = 1 / (1 + np.exp(-(Xtr @ w)))
    w -= lr * Xtr.T @ (p - ytr) / len(ytr)           # a gradient-descent step on cross-entropy
    tl, _ = loss_acc(w, Xtr, ytr); vl, va = loss_acc(w, Xva, yva)
    if vl < best[0]: best = (vl, epoch, w.copy())
    if epoch in (1, 5, 10, 20, 40, 80, 160, 400): print(f"{epoch:>5} {tl:>11.3f} {vl:>9.3f} {va:>8.0%}")
print(f"\nbest validation loss {best[0]:.3f} at epoch {best[1]}: early stopping would keep that checkpoint")
```

Training loss keeps falling toward zero (the model memorises noisy labels) while validation loss turns upward. **Save checkpoints and keep the best by validation metric**, not the last.

## Catastrophic forgetting

Narrow tuning can erode general ability, instruction-following and **safety behaviours**. Reduce it by:

- **Lower learning rates** and fewer epochs.
- **LoRA** (the frozen base keeps most knowledge).
- **Mixing in general data** (replay) at 5–20%.
- **Regularising** towards the base (KL penalty, weight decay, LoRA rank limits).
- **Regression evals**: run a general capability suite, your own regression set, and **safety evals** before and after.

## What good SFT looks like on real tasks

- The model's outputs follow the **target format** without lengthy prompts.
- It handles **held-out inputs** of the same kind, including ones with typos and odd phrasing.
- It knows when to **stop** (end-of-sequence learned), not rambling.
- It does not **leak** training examples verbatim.
- Quality on general tasks and safety tests is **not noticeably worse**.

## Evaluating the result

1. **Task metrics on the golden set** versus the **prompted baseline** (same eval, same scorers).
2. **Sampling checks**: read 50 generations across slices, including hard cases.
3. **Format validity** rate and **refusal/over-refusal** rates.
4. **General and safety regression** suites.
5. **Cost and latency** versus the baseline (the point of many fine-tunes).
6. **Robustness**: paraphrases, adversarial and out-of-distribution inputs.

A tuned model that merely ties the baseline on quality but is 10× cheaper is a success; one that wins quality but regresses safety is not.

## Failure checklist

| Symptom | First things to check |
|---|---|
| Outputs are gibberish or repeat | wrong chat template; missing EOS; LR too high; quantisation mismatch |
| Model ignores the format you trained | masking bug (trained on the wrong tokens); too few examples; LR too low |
| Great on train, poor on val | overfitting; duplicates across splits; too many epochs |
| Worse than the base on general tasks | forgetting: lower LR, LoRA, mix data |
| OOM | reduce max length, micro-batch size; gradient checkpointing; LoRA/QLoRA; flash-attention |
| Loss NaN | LR, fp16 → bf16, bad data (empty, huge sequences), gradient clipping |

```quiz
? Which learning rate range is typical for LoRA fine-tuning?
- 1e-8
+ about 1e-4 to 3e-4
- 1
> LoRA tolerates higher learning rates than full fine-tuning (about 1e-6 to 2e-5).

? Training loss keeps falling but validation loss rises. What is happening?
+ Overfitting: the model memorises the training set; stop earlier, lower LR or add data
- Underfitting
- A tokenizer bug
> Keep the checkpoint with the best validation metric.

? What does gradient accumulation do?
+ Sums gradients over several micro-batches before one optimiser step to simulate a larger batch
- Compresses the model
- Speeds up inference
> It trades time for memory.

? Why is lower loss not always better outputs?
+ Loss measures token likelihood, not task success; always evaluate generations on task metrics
- Loss is random
- Outputs are unrelated to loss
> Evaluate what you care about.
```

:::problem After SFT, your model answers your task well but has become noticeably worse at general questions and refuses less. What do you do? {level=medium tags="sft,forgetting,safety"}
Diagnose and propose changes.

:::solution Model answer
This is **forgetting plus safety regression**. Compare to the base on general and safety suites to quantify. Remedies: lower the learning rate and epochs; switch to **LoRA** (or lower rank) if you did full fine-tuning; **mix in** general instruction and safety-refusal data (5–20%); add **preference/safety tuning** after SFT if needed; use early stopping on a combined validation set; keep the best checkpoint by a metric that includes safety. Re-run the full regression suite and keep it in CI for future tuning runs.
:::
:::

:::keypoints
- SFT minimises next-token cross-entropy on response tokens with an optimiser like AdamW over (prompt → response) examples.
- The key knobs: learning rate (full 1e-6–2e-5, LoRA 1e-4–3e-4), 1–3 epochs, effective batch size via accumulation, warmup + cosine schedule, bf16, gradient clipping.
- Read train and validation curves; overfit means early stopping and best-checkpoint selection; lower loss ≠ better outputs.
- Prevent forgetting with lower LR, LoRA, data mixing and regression plus safety evals.
- Evaluate against the prompted baseline on task, general, safety, cost and latency metrics.
:::

:::resources
- [Hugging Face TRL: SFT Trainer](https://huggingface.co/docs/trl) — the reference implementation.
- [Hugging Face LLM Course](https://huggingface.co/learn/llm-course) — fine-tuning chapters.
- [Finetuned Language Models Are Zero-Shot Learners (FLAN)](https://arxiv.org/abs/2109.01652) and [Scaling Instruction-Finetuned Language Models](https://arxiv.org/abs/2210.11416) — instruction tuning at scale.
- [Sebastian Raschka: LLMs from scratch](https://github.com/rasbt/LLMs-from-scratch) — includes instruction fine-tuning code from first principles.
- [Unsloth docs](https://docs.unsloth.ai) — fast, memory-efficient fine-tuning with practical hyperparameter guidance.
- [Axolotl docs](https://docs.axolotl.ai) — config-driven fine-tuning for many models.
:::
