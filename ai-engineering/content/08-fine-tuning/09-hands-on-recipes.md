---
title: Hands-On Recipes — Fine-Tune a Model This Weekend
level: advanced
time: 50
summary: A practical, end-to-end walkthrough with the standard open-source stack. Choosing the base model, preparing data, running SFT with TRL and LoRA/QLoRA, the Unsloth and Axolotl alternatives, provider-managed fine-tuning, free GPU options, reading logs and debugging (OOM, NaN, no learning), a pre-flight checklist, and a runnable training-loop skeleton with checkpoint selection. Code that needs a GPU is shown as Run locally.
---

Time to do it. This lesson gives you a **working path**: from a dataset file to a fine-tuned, evaluated adapter, using tools that are standard in 2026. The code blocks marked *Run locally* need a GPU (a free Colab T4 works for small models); the rest runs here.

## Step 0: choose the base model

| Consideration | Guidance |
|---|---|
| **Size** | start with **1–4B** to learn the loop quickly, **7–8B** for real quality; larger needs more GPU |
| **Instruct vs base** | fine-tune an **instruct/chat** model for assistant behaviour on small data; use a **base** model if you will do full post-training |
| **Family** | Llama, Qwen, Gemma, Mistral, Phi, SmolLM and others; check **licence** for commercial use |
| **Template** | use the model's own chat template |
| **Context length** | enough for your examples |
| **Ecosystem support** | best-supported families have the smoothest tooling (check Unsloth/TRL docs) |
| **Language/domain** | choose a model strong in your language (Qwen for many Asian languages, etc.) |

Browse and compare on the [Hugging Face Hub](https://huggingface.co/models); read the model card for licence and recommended settings.

## Step 1: data

Prepare `train.jsonl` and `eval.jsonl` in chat format (`messages` list per line; see the data lesson). Sanity-check:

```python run title="Validate a chat-format JSONL before spending GPU time" level=easy
import json

lines = [
    '{"messages": [{"role": "user", "content": "Classify: I was charged twice"}, {"role": "assistant", "content": "billing"}]}',
    '{"messages": [{"role": "user", "content": "Classify: app crashes"}, {"role": "assistant", "content": "bug"}]}',
    '{"messages": [{"role": "assistant", "content": "oops, no user turn"}]}',
    '{"messages": [{"role": "user", "content": "Classify: dark mode please"}, {"role": "assistant", "content": ""}]}',
    '{"msgs": []}',
]
problems, ok = [], 0
for i, line in enumerate(lines, 1):
    try:
        rec = json.loads(line)
        msgs = rec["messages"]
        roles = [m["role"] for m in msgs]
        assert roles[0] in ("system", "user"), "first role must be system or user"
        assert roles[-1] == "assistant", "must end with an assistant turn"
        assert all(m["content"].strip() for m in msgs), "empty content"
        ok += 1
    except Exception as e:
        problems.append((i, f"{type(e).__name__}: {e}"))
print(f"{ok}/{len(lines)} valid")
for i, why in problems: print(f"  line {i}: {why}")
```

## Step 2: SFT with TRL and LoRA

Hugging Face **TRL** ([docs](https://huggingface.co/docs/trl)) with **PEFT** is the reference stack.

```bash
pip install -U transformers trl peft datasets accelerate bitsandbytes
```

```python local title="LoRA SFT with TRL (needs a GPU)"
from datasets import load_dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

train = load_dataset("json", data_files="train.jsonl", split="train")
evalset = load_dataset("json", data_files="eval.jsonl", split="train")

trainer = SFTTrainer(
    model="Qwen/Qwen3-4B-Instruct-2507",              # any causal LM from the Hub; chat template is applied from the tokenizer
    train_dataset=train,
    eval_dataset=evalset,
    args=SFTConfig(
        output_dir="sft-out",
        num_train_epochs=2,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=8,                # effective batch size 16
        learning_rate=2e-4,                           # LoRA-typical
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        weight_decay=0.0,
        bf16=True,
        gradient_checkpointing=True,
        max_length=2048,                              # older TRL versions call this max_seq_length
        eval_strategy="steps", eval_steps=50,
        save_strategy="steps", save_steps=50, save_total_limit=3,
        load_best_model_at_end=True, metric_for_best_model="eval_loss",
        logging_steps=10,
        report_to="none",                             # or "wandb"
    ),
    peft_config=LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, target_modules="all-linear", task_type="CAUSAL_LM"),
)
trainer.train()
trainer.save_model("sft-out/final")                   # saves the LoRA adapter (small)
```

### QLoRA: when memory is tight

Load the base in 4-bit and train adapters on top. Everything else stays the same.

```python local title="Add 4-bit quantisation (QLoRA)"
import torch
from transformers import BitsAndBytesConfig

bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                         bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.bfloat16)
# pass it via SFTConfig(model_init_kwargs={"quantization_config": bnb, "torch_dtype": torch.bfloat16}, ...)
```

## Alternatives for the same job

```python local title="Unsloth: fast, memory-efficient LoRA/QLoRA (great on a free Colab GPU)"
from unsloth import FastLanguageModel
from trl import SFTTrainer, SFTConfig

model, tokenizer = FastLanguageModel.from_pretrained("unsloth/Llama-3.2-3B-Instruct", max_seq_length=2048, load_in_4bit=True)
model = FastLanguageModel.get_peft_model(
    model, r=16, lora_alpha=16, lora_dropout=0,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    use_gradient_checkpointing="unsloth",
)
# ...then train with SFTTrainer as above, passing this model and tokenizer.
# Export options: model.save_pretrained_merged(...), model.save_pretrained_gguf(...)
```

```yaml
# Axolotl: configuration-driven training (axolotl train config.yml)
base_model: Qwen/Qwen3-4B-Instruct-2507
adapter: qlora
load_in_4bit: true
lora_r: 16
lora_alpha: 32
lora_target_linear: true
datasets:
  - path: train.jsonl
    type: chat_template
    field_messages: messages
sequence_len: 2048
sample_packing: true
micro_batch_size: 2
gradient_accumulation_steps: 8
num_epochs: 2
learning_rate: 0.0002
lr_scheduler: cosine
warmup_ratio: 0.05
bf16: auto
output_dir: ./axolotl-out
```

Other tools: **torchtune** (PyTorch-native recipes), **LLaMA-Factory** (web UI and many methods), **LitGPT**, **MLX** (Apple silicon: `mlx_lm.lora`), and **Hugging Face AutoTrain** (no-code).

## Provider-managed fine-tuning

Several providers offer fine-tuning as a service: you upload JSONL, they train and host the result, billed per token. Benefits: **no GPUs**, simple. Limits: only certain models, less control, lock-in, and you cannot download weights. Check which models support it, data-retention terms, and cost versus self-hosting. Use the same dataset and eval discipline.

## Free or cheap GPUs

- **Google Colab / Kaggle notebooks**: free T4/P100-class GPUs; fine for 1–4B QLoRA with Unsloth.
- **Cloud GPU marketplaces** (RunPod, Vast.ai, Lambda, Modal, Lightning): pay by the hour for an A100/H100.
- **Local**: a 16–24 GB consumer GPU runs QLoRA on 7–8B models; Apple silicon with MLX for small ones.

## Step 3: evaluate and use the adapter

```python local title="Load the adapter, generate, and compare against the base"
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

base_id = "Qwen/Qwen3-4B-Instruct-2507"
tok = AutoTokenizer.from_pretrained(base_id)
base = AutoModelForCausalLM.from_pretrained(base_id, torch_dtype=torch.bfloat16, device_map="auto")
tuned = PeftModel.from_pretrained(base, "sft-out/final")                        # attach the adapter

def reply(model, text):
    msgs = [{"role": "user", "content": text}]
    ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt").to(model.device)
    out = model.generate(ids, max_new_tokens=64, do_sample=False)
    return tok.decode(out[0][ids.shape[1]:], skip_special_tokens=True)

for q in ["Classify: I was charged twice", "Classify: please add dark mode"]:
    print(q, "->", reply(tuned, q))

merged = tuned.merge_and_unload()                                              # fold the adapter into the weights for serving
merged.save_pretrained("merged-model"); tok.save_pretrained("merged-model")
```

Evaluate with **your eval suite** (the earlier module): task metrics on a held-out set, vs the prompted baseline; format validity; regression and safety checks; read samples.

## A training-loop skeleton

You will rarely write the loop yourself, but understanding it makes logs readable. This runnable skeleton trains a toy model with **validation, best-checkpoint selection, early stopping and a learning-rate schedule**, the same structure as `Trainer`.

```python run title="The structure behind every trainer" level=advanced
import numpy as np, math

rng = np.random.default_rng(5)
D = 40
w_true = rng.normal(size=D) * (rng.random(D) < 0.2)
def data(n):
    X = rng.normal(size=(n, D)); y = X @ w_true + 0.8 * rng.normal(size=n); return X, y
Xtr, ytr = data(60); Xva, yva = data(300)

def lr_at(step, total, peak=0.05, warmup=10):
    if step < warmup: return peak * (step + 1) / warmup
    return peak * 0.5 * (1 + math.cos(math.pi * (step - warmup) / (total - warmup)))

def mse(w, X, y): return float(np.mean((X @ w - y) ** 2))

w, best_w, best_val, bad_epochs, PATIENCE, EPOCHS = np.zeros(D), None, 1e9, 0, 8, 200
for epoch in range(EPOCHS):
    grad = 2 * Xtr.T @ (Xtr @ w - ytr) / len(ytr)
    grad = np.clip(grad, -5, 5)                                  # gradient clipping
    w -= lr_at(epoch, EPOCHS) * grad
    val = mse(w, Xva, yva)
    if val < best_val - 1e-4:                                    # checkpoint when validation improves
        best_val, best_w, bad_epochs = val, w.copy(), 0
    else:
        bad_epochs += 1
    if epoch % 20 == 0: print(f"epoch {epoch:>3}  train {mse(w, Xtr, ytr):.3f}  val {val:.3f}  best {best_val:.3f}")
    if bad_epochs >= PATIENCE:
        print(f"early stop at epoch {epoch}: no validation improvement for {PATIENCE} epochs"); break
print(f"restored best checkpoint: val MSE {mse(best_w, Xva, yva):.3f} (last-epoch weights: {mse(w, Xva, yva):.3f})")
```

## Debugging guide

| Symptom | Likely cause | Fix |
|---|---|---|
| **CUDA out of memory** | sequence too long, batch too large, no checkpointing | reduce `max_length` and micro-batch, raise accumulation, enable gradient checkpointing, QLoRA, smaller model |
| **Loss is NaN** | learning rate too high, fp16 overflow, corrupt example | lower LR, use bf16, clip gradients, inspect the batch at the failing step |
| **Loss does not decrease** | LR too low, labels all masked, wrong data column | verify masking produces trainable tokens; raise LR; print a decoded batch with labels |
| **Loss drops to ~0 fast** | duplicates, leakage, tiny dataset, memorising | dedupe, more data, fewer epochs, lower rank |
| **Good loss, bad generations** | chat template mismatch at inference; no EOS; sampling settings | use the same template; check EOS handling; greedy decoding for evals |
| **Model repeats forever** | EOS not learned (masked out or truncated) | ensure the end-of-turn token is in the labels |
| **Slower than expected** | no FlashAttention, tiny batches, data loader bottleneck, CPU offload | enable flash-attn/sdpa, pack sequences, more workers, check utilisation |
| **Adapter has no effect at inference** | loaded wrong adapter or base; merged incorrectly | confirm base model id matches; compare outputs with/without adapter |
| **Worse than base on general tasks** | forgetting | lower LR, fewer epochs, mix general data |

## Pre-flight checklist

1. Eval set and **prompted baseline numbers** exist.
2. Data validated, **deduplicated**, template applied, **loss mask verified** by decoding a batch.
3. Train/val/test split without leakage.
4. Start small: **a few hundred steps** on a subset to prove the pipeline end to end.
5. Log **train and validation loss, learning rate, tokens/s, GPU memory**; save checkpoints.
6. Plan evals: task, general regression, safety.
7. Decide the **deployment path** (merge, multi-LoRA, quantise) before you train.

```quiz
? Which learning rate is a sensible starting point for LoRA SFT?
- 1e-7
+ around 1e-4 to 2e-4 (with warmup and cosine decay)
- 1.0
> LoRA tolerates higher rates than full fine-tuning.

? Your decoded training batch shows every label as -100. What does that mean?
+ A masking bug: nothing is being learned, so loss will not decrease
- The data is perfect
- The model is frozen intentionally
> Always inspect a decoded batch with its labels.

? When would you choose QLoRA?
+ When the 16-bit base model plus adapters would not fit in GPU memory
- When you want the highest possible quality regardless of memory
- When you have no data
> It trades some speed for a much smaller memory footprint.

? What does merge_and_unload() do?
+ Folds the LoRA weights into the base model so it can be served as a normal model
- Deletes the base model
- Quantises to 4-bit automatically
> Merged weights have no adapter overhead at inference.
```

:::problem Your first LoRA run on 800 examples reaches near-zero training loss in 20 steps, but outputs are poor. What do you check? {level=medium tags="debugging,overfitting"}
List hypotheses and tests.

:::solution Model answer
Near-zero loss that fast suggests **memorisation or leakage**: check for **duplicate examples** (or examples repeated across epochs via packing), **trivial targets** (the label is derivable from the prompt text, or the response is empty or constant), and a **masking bug** that leaves only a few easy tokens trainable (decode a batch with labels). Look at validation loss (is it rising?), use a **held-out set**, reduce epochs and rank, add data diversity, and test generations on **new** inputs with the correct chat template and EOS handling. Compare with the prompted baseline.
:::
:::

:::keypoints
- Path: choose a base/instruct model, validate chat-format JSONL, train a LoRA/QLoRA with TRL (or Unsloth, Axolotl, torchtune, LLaMA-Factory), evaluate against the prompted baseline, merge or serve the adapter.
- Sensible defaults: LoRA r=16, alpha=2r (or r), all-linear targets, LR 1e-4–2e-4, cosine with 5% warmup, 1–3 epochs, effective batch ~16, bf16, gradient checkpointing.
- Free GPUs (Colab/Kaggle) and QLoRA make 1–8B experiments accessible; provider-managed tuning removes the infra but limits control.
- Trainers share one structure: validation, best-checkpoint selection, early stopping, schedules, clipping.
- Debug systematically (masking, template, EOS, LR, memory) and use a pre-flight checklist; start with a tiny end-to-end run.
:::

:::resources
- [Hugging Face TRL docs](https://huggingface.co/docs/trl) and [PEFT docs](https://huggingface.co/docs/peft) — the reference stack.
- [Unsloth docs](https://docs.unsloth.ai) — fast fine-tuning with notebooks.
- [Axolotl docs](https://docs.axolotl.ai) — YAML-driven fine-tuning.
- [torchtune](https://github.com/pytorch/torchtune) and [LLaMA-Factory](https://github.com/hiyouga/LLaMA-Factory) — alternative frameworks.
- [Hugging Face smol course](https://github.com/huggingface/smol-course) — a practical course on aligning small models.
- [Maxime Labonne: LLM course](https://github.com/mlabonne/llm-course) — fine-tuning notebooks and roadmaps.
:::
