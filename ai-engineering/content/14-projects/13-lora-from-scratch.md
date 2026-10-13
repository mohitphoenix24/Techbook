---
title: Build LoRA From Scratch
level: advanced
time: 60
icon: layers
cover: #8b5cf6,#f43f5e
tags: lora, fine-tuning, low-rank, qlora, adapters
summary: Implement low-rank adaptation (LoRA) in NumPy with hand-written gradients — freeze a pretrained network, train two tiny matrices instead of the big one, compare against full fine-tuning and head-only tuning, find the effect of rank, merge and swap adapters, and add 8-bit base weights for a QLoRA-style variant. Then see the same recipe in Hugging Face PEFT.
---

Fine-tuning a large model normally updates **every weight**, which needs the weights, their gradients and the optimiser state in GPU memory, and produces a full-size copy per task. **LoRA** (low-rank adaptation) freezes the pretrained weights and learns a small **low-rank update** instead. It is why fine-tuning large models became possible on a single GPU. Here you build it yourself and run an experiment where the right answer is known.

**What you'll build:** a tiny network with a LoRA layer, hand-derived gradients checked numerically, a comparison with other tuning methods, and adapter merge/swap.

:::flow The experiment
Pretrain | learn task A
Freeze | keep the base weights fixed
Adapt | learn a low-rank update for task B
Compare | head-only, full, LoRA ranks 1 to 8
Merge | fold the update into the weights
Swap | one base, several adapters
Quantize | 8-bit base plus LoRA
:::

:::formula
W' = W + (α / r) · B · A     where W is d_out × d_in (frozen), B is d_out × r, A is r × d_in, and the rank r is much smaller than d_out and d_in
:::

The update `B·A` has at most rank `r`, so it needs `r·(d_out + d_in)` numbers instead of `d_out·d_in`. `B` starts at **zero**, so the adapted model begins **exactly** equal to the base model.

## Step 1 — A task where we know the answer

To test LoRA fairly we construct tasks where we **know** the new task differs from the old one by a **rank-2** change in the first layer. A fixed random "teacher" network produces targets for task A. Task B uses the same teacher with a rank-2 change added to its first weight matrix.

```python run shared title="Step 1 · two tasks that differ by a rank-2 change"
import numpy as np, copy

rng = np.random.default_rng(0)
D, H, C = 32, 64, 4                                               # input size, hidden size, output size
W1t = rng.normal(0, 1 / np.sqrt(D), (H, D)); W2t = rng.normal(0, 1 / np.sqrt(H), (C, H)) * 2; b1t = rng.normal(0, 0.1, H)

u, v = rng.normal(size=(H, 2)), rng.normal(size=(2, D))
dW = u @ v                                                         # the true change between task A and task B: rank 2
dW *= 0.8 * np.linalg.norm(W1t) / np.linalg.norm(dW)
W1b = W1t + dW
print("rank of the true change between tasks:", np.linalg.matrix_rank(dW))

teacher = lambda X, W1: np.tanh(X @ W1.T + b1t) @ W2t.T
Xtr, Xte = rng.normal(size=(8000, D)), rng.normal(size=(2000, D))
YA_tr, YA_te = teacher(Xtr, W1t), teacher(Xte, W1t)
YB_tr, YB_te = teacher(Xtr, W1b), teacher(Xte, W1b)
print(f"target variance {YA_te.var():.2f} (an error near this value means 'no better than predicting the mean')")
```

## Step 2 — A network with an optional LoRA layer

We write the forward pass and the **gradients by hand**. With LoRA, the effective first-layer weight is `W + scale·B·A`; the gradient for the effective weight `dW` converts to gradients for the two small factors by the chain rule: `dB = scale · dW · Aᵀ` and `dA = scale · Bᵀ · dW`.

```python run shared title="Step 2 · network with LoRA, forward and backward"
class Net:
    def __init__(self, seed=1):
        r = np.random.default_rng(seed)
        self.W1, self.b1 = r.normal(0, 1 / np.sqrt(D), (H, D)), np.zeros(H)
        self.W2, self.b2 = r.normal(0, 1 / np.sqrt(H), (C, H)), np.zeros(C)
        self.A = self.B = None; self.scale = 1.0                       # LoRA factors, attached later
    def add_lora(self, r, scale=1.0, seed=3):
        self.A = np.random.default_rng(seed).normal(0, 1 / np.sqrt(D), (r, D))      # A: small random start
        self.B = np.zeros((H, r)); self.scale = scale                               # B: zeros, so the update starts at exactly zero
    def W1_effective(self):
        return self.W1 if self.A is None else self.W1 + self.scale * self.B @ self.A
    def forward(self, X):
        h = np.tanh(X @ self.W1_effective().T + self.b1)
        return h, h @ self.W2.T + self.b2
    def mse(self, X, Y):
        return float(((self.forward(X)[1] - Y) ** 2).mean())
    def grads(self, X, Y):
        h, out = self.forward(X); n = len(X)
        d = 2 * (out - Y) / (n * Y.shape[1])                           # derivative of the mean squared error
        g = {"W2": d.T @ h, "b2": d.sum(0)}
        dpre = (d @ self.W2) * (1 - h ** 2)                            # back through tanh
        dW1, g["b1"] = dpre.T @ X, dpre.sum(0)
        if self.A is None: g["W1"] = dW1
        else: g["B"], g["A"] = self.scale * dW1 @ self.A.T, self.scale * self.B.T @ dW1
        return g

def train(net, X, Y, keys, steps, lr, batch=64, seed=0):
    """Adam on the named parameters only; everything else stays frozen."""
    r = np.random.default_rng(seed)
    m, v = {k: 0 for k in keys}, {k: 0 for k in keys}
    for t in range(1, steps + 1):
        idx = r.integers(0, len(X), batch)
        g = net.grads(X[idx], Y[idx])
        for k in keys:
            m[k] = 0.9 * m[k] + 0.1 * g[k]; v[k] = 0.999 * v[k] + 0.001 * g[k] ** 2
            setattr(net, k, getattr(net, k) - lr * (m[k] / (1 - 0.9 ** t)) / (np.sqrt(v[k] / (1 - 0.999 ** t)) + 1e-8))
    return net

# gradient check for the LoRA factors (B starts at zero, so give it a random value first to make the check meaningful)
chk = Net(); chk.add_lora(3); chk.B = np.random.default_rng(9).normal(0, 0.1, chk.B.shape)
g = chk.grads(Xtr[:16], YB_tr[:16]); eps = 1e-6
for name, (i, j) in (("A", (1, 5)), ("B", (7, 2))):
    M = getattr(chk, name); M[i, j] += eps; lp = chk.mse(Xtr[:16], YB_tr[:16]); M[i, j] -= 2 * eps; lm = chk.mse(Xtr[:16], YB_tr[:16]); M[i, j] += eps
    print(f"gradient check on {name}[{i},{j}]: analytic {g[name][i, j]:+.6f}  numerical {(lp - lm) / (2 * eps):+.6f}")
```

## Step 3 — Pretrain the base model on task A

```python run shared title="Step 3 · pretrain on task A"
base = Net()
train(base, Xtr, YA_tr, ["W1", "b1", "W2", "b2"], steps=4000, lr=0.01, batch=128)
print(f"base model: error on task A {base.mse(Xte, YA_te):.4f} | error on task B {base.mse(Xte, YB_te):.4f}  <- it has never seen task B")

n = copy.deepcopy(base); n.add_lora(r=4)
print("LoRA starts as a no-op (B = 0): outputs identical to the base model:", bool(np.allclose(n.forward(Xte)[1], base.forward(Xte)[1])))
```

## Step 4 — Adapt to task B: LoRA versus the alternatives

We have only **300 labelled examples** of task B, which is typical for fine-tuning. Compare four ways to adapt:

- **Head only**: train just the output layer.
- **Full fine-tuning**: train every weight.
- **LoRA with rank 1, 2, 4, 8**: train only `A` and `B` on the first layer.

```python run shared title="Step 4 · adaptation methods compared"
Xs, Ys = Xtr[:300], YB_tr[:300]
rows = []
for label, kind, r in [("head only", "head", None), ("full fine-tuning", "full", None), ("LoRA rank 1", "lora", 1), ("LoRA rank 2", "lora", 2), ("LoRA rank 4", "lora", 4), ("LoRA rank 8", "lora", 8)]:
    n = copy.deepcopy(base)
    if kind == "full": keys = ["W1", "b1", "W2", "b2"]; params = n.W1.size + n.b1.size + n.W2.size + n.b2.size
    elif kind == "head": keys = ["W2", "b2"]; params = n.W2.size + n.b2.size
    else: n.add_lora(r); keys = ["A", "B"]; params = n.A.size + n.B.size
    train(n, Xs, Ys, keys, steps=1500, lr=0.02 if kind == "lora" else 0.01)
    rows.append((label, params, n.mse(Xte, YB_te)))
total = base.W1.size + base.b1.size + base.W2.size + base.b2.size
print(f"{'method':18} {'trainable params':>17} {'% of model':>11} {'test error on B':>16}")
for label, params, err in rows:
    print(f"{label:18} {params:>17,} {params / total:>10.1%} {err:>16.4f}")
```

Read it carefully:

- **Rank 1 is not enough**: the true change has rank 2.
- **Rank 2 matches the true structure**: it reaches a very low error with **under 10% of the parameters** of full fine-tuning.
- **Higher ranks do not help** here (and are slightly noisier): extra capacity is unused.
- **Full fine-tuning does worse** than LoRA on this small dataset: more freedom than 300 examples can pin down, so it fits noise.
- **Head-only** cannot express a change to the first layer at all.

This is the **LoRA hypothesis**: the change needed to adapt a pretrained model to a new task has **low intrinsic rank**. In this synthetic setting we made that true by construction; for real language models it holds well enough that ranks of 8 to 64 on attention and MLP matrices usually match full fine-tuning for many tasks.

## Step 5 — Merge: no inference cost

After training, fold the update into the weights: `W_merged = W + scale·B·A`. The result is an ordinary weight matrix, so **inference has no extra latency or parameters**. You can also keep the adapter separate (to swap it) or subtract it to recover the original model.

```python run shared title="Step 5 · merge and unmerge"
adapted = copy.deepcopy(base); adapted.add_lora(2)
train(adapted, Xs, Ys, ["A", "B"], steps=1500, lr=0.02)

merged = copy.deepcopy(base)
merged.W1 = base.W1 + adapted.scale * adapted.B @ adapted.A          # fold the update into the weight
print("merged model (a plain network, no adapter) gives the same outputs as base + adapter:", bool(np.allclose(merged.forward(Xte)[1], adapted.forward(Xte)[1])))
print(f"error on task B: {merged.mse(Xte, YB_te):.4f}")
print("rank of the learned update B·A:", np.linalg.matrix_rank(adapted.B @ adapted.A), "| shape of the weight it modifies:", base.W1.shape)

unmerged = copy.deepcopy(merged); unmerged.W1 = merged.W1 - adapted.scale * adapted.B @ adapted.A
print(f"subtract the update again -> back to the base model: error on task A {unmerged.mse(Xte, YA_te):.4f} (before: {base.mse(Xte, YA_te):.4f})")
```

## Step 6 — One base, many adapters

The base weights never change, so **one copy of the base can serve many tasks**, each with its own tiny adapter that is loaded per request. This is how multi-tenant fine-tuning services work (and why LoRA adapters are shared as small files).

```python run shared title="Step 6 · swapping adapters"
def make_task(seed):
    r = np.random.default_rng(seed)
    d = r.normal(size=(H, 2)) @ r.normal(size=(2, D)); d *= 0.8 * np.linalg.norm(W1t) / np.linalg.norm(d)
    return d
tasks = {"task B": W1b, "task C": W1t + make_task(11), "task D": W1t + make_task(12)}

adapters = {}
for name, W1_task in tasks.items():
    Ytr, Yte = teacher(Xtr, W1_task), teacher(Xte, W1_task)
    n = copy.deepcopy(base); n.add_lora(2)
    train(n, Xtr[:300], Ytr[:300], ["A", "B"], steps=1500, lr=0.02)
    adapters[name] = (n.A.copy(), n.B.copy(), Yte)

server = copy.deepcopy(base)                                            # ONE shared base model in memory
print(f"{'request for':12} {'error with the right adapter':>30} {'with the wrong adapter':>25}")
for name, (A, B, Yte) in adapters.items():
    server.A, server.B, server.scale = A, B, 1.0
    right = server.mse(Xte, Yte)
    other = next(k for k in adapters if k != name)
    server.A, server.B = adapters[other][0], adapters[other][1]
    print(f"{name:12} {right:>30.4f} {server.mse(Xte, Yte):>25.4f}")
adapter_params = sum(A.size + B.size for A, B, _ in adapters.values())
print(f"\nmemory for 3 tasks: three full copies = {3 * total:,} numbers | one base + three adapters = {total + adapter_params:,} numbers ({(total + adapter_params) / (3 * total):.0%})")
```

With a 7-billion-parameter model the numbers become dramatic: three full copies are about 42 GB in 16-bit; one base plus three adapters is about 14 GB plus a few tens of megabytes.

## Step 7 — QLoRA: a quantised frozen base

The frozen base is the biggest memory item, and it never needs to be updated, so it can be stored in **low precision**. **QLoRA** stores the base in 4-bit, dequantises layer by layer during the forward pass, and trains LoRA factors in higher precision on top. Here is the same idea with 8-bit weights.

```python run shared title="Step 7 · int8 base weights plus LoRA"
def quantize_int8(M):
    scale = np.abs(M).max() / 127
    return np.round(M / scale).astype(np.int8), scale
def dequantize(q, scale):
    return q.astype(np.float64) * scale

q1, s1 = quantize_int8(base.W1); q2, s2 = quantize_int8(base.W2)
qbase = copy.deepcopy(base)
qbase.W1, qbase.W2 = dequantize(q1, s1), dequantize(q2, s2)             # the base only ever exists as int8 plus a scale
print(f"base weights: {(base.W1.size + base.W2.size) * 8} bytes as float64 -> {q1.size + q2.size} bytes as int8")
print(f"error on task A: float base {base.mse(Xte, YA_te):.4f} | int8 base {qbase.mse(Xte, YA_te):.4f}")

n = copy.deepcopy(qbase); n.add_lora(2)
train(n, Xs, Ys, ["A", "B"], steps=1500, lr=0.02)
print(f"LoRA rank 2 on the int8 base: error on task B {n.mse(Xte, YB_te):.4f} (float base: {adapted.mse(Xte, YB_te):.4f})")
```

The adapted error stays close to the float-base result (a tiny rounding error in the frozen weights barely matters, and the adapter can absorb part of it), which is why QLoRA reaches close to 16-bit LoRA quality in practice while cutting memory roughly 4x.

## Step 8 — The same recipe with Hugging Face PEFT

On a real model you do not write any of this. The library attaches LoRA factors to chosen layers and trains only those. This needs a GPU and a model download, so it is shown for your own machine.

```python local
# pip install transformers peft trl bitsandbytes datasets
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model
from trl import SFTTrainer, SFTConfig

name = "Qwen/Qwen2.5-0.5B-Instruct"                                       # any small causal LM
quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16)   # QLoRA: 4-bit frozen base
model = AutoModelForCausalLM.from_pretrained(name, quantization_config=quant, device_map="auto")

config = LoraConfig(
    r=16,                                    # rank: capacity of the update
    lora_alpha=32,                           # scaling: the update is multiplied by alpha / r
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05, task_type="CAUSAL_LM",
)
model = get_peft_model(model, config)
model.print_trainable_parameters()           # typically well under 1% of the model

# trainer = SFTTrainer(model=model, train_dataset=your_dataset, args=SFTConfig(output_dir="out", num_train_epochs=2, learning_rate=2e-4))
# trainer.train(); model.save_pretrained("my-adapter")        # saves only the adapter (megabytes)
# merged = model.merge_and_unload()                            # fold the adapter into the weights for deployment
```

## How it works

| Idea | What it gives you |
|---|---|
| Freeze `W`, train `B` and `A` | 10-1000x fewer trainable parameters, far less optimiser memory |
| `B = 0` at the start | the model begins as exactly the base model; training is stable |
| Rank `r` | capacity of the update; too low underfits, too high wastes parameters and can overfit |
| Scale `α / r` | how strongly the update is applied; a common starting point is `α = 2r` |
| Merge `W + (α/r)·B·A` | zero inference overhead |
| Separate adapters | one base serves many tasks or tenants; adapters are megabytes |
| Quantised base (QLoRA) | roughly 4x less memory for the frozen weights at similar quality |

Practical guidance: apply LoRA to **all linear layers** (attention and MLP) rather than only the query and value projections, start with `r` between 8 and 32, use a **higher learning rate than full fine-tuning** (often 1e-4 to 3e-4), keep a **validation set**, and evaluate on your real task before and after, since LoRA teaches **behaviour and format** better than it teaches new knowledge.

:::exercise Extend it
1. Apply LoRA to **both** weight matrices (`W1` and `W2`) and check the gradients numerically.
2. Plot error against rank for 50, 100 and 300 training examples. When does a smaller rank win?
3. Change the true difference between the tasks to rank 5 and find the smallest sufficient LoRA rank.
4. Add **dropout** on the LoRA path and see if it helps with only 100 examples.
5. Implement **weight decay** on `A` and `B` and compare to no regularisation.
:::

:::keypoints
- LoRA freezes the pretrained weights and learns a low-rank update `(α/r)·B·A`, with `B` initialised to zero so training starts from the base model exactly.
- It trains a small fraction of the parameters yet matches or beats full fine-tuning when the needed change has low intrinsic rank, especially on small datasets.
- Rank sets capacity: too low cannot express the change, too high gives no benefit.
- Merge the update for zero-cost inference, or keep adapters separate to serve many tasks from one base.
- QLoRA stores the frozen base in low precision and trains LoRA factors on top, cutting memory about 4x.
:::
