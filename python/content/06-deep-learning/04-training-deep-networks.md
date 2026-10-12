---
title: Training Deep Networks Well
level: advanced
time: 35
summary: The practical toolkit for training — optimizers (SGD, momentum, Adam, AdamW), learning-rate warmup and cosine schedules, regularization, dropout, normalization, residual connections, gradient clipping and early stopping.
---

Knowing backprop is not enough: a network can still train slowly, diverge, or overfit. This lesson covers the tricks that make modern deep learning — including LLM training — actually work. Each one is demonstrated in NumPy so you can see its effect.

## Optimizers

:::def Optimizer
The algorithm that uses the gradients to update the weights. Plain gradient descent is the simplest; **Adam/AdamW** is the default for most deep learning, including LLMs.
:::

| Optimizer | Idea |
|---|---|
| **SGD** | step = −lr × gradient |
| **Momentum** | keep a running "velocity" so you roll through small bumps and speed up on consistent slopes |
| **RMSProp** | divide each parameter's step by a running size of its gradients (adaptive step per weight) |
| **Adam** | momentum + RMSProp together, with bias correction |
| **AdamW** | Adam with weight decay applied correctly — the standard for Transformers |

```python run level=advanced
import numpy as np
import matplotlib.pyplot as plt

# A long, narrow valley: easy for Adam/momentum, hard for plain SGD
def loss(p): return 0.5 * p[0] ** 2 + 10 * p[1] ** 2
def grad(p): return np.array([p[0], 20 * p[1]])

def run(kind, steps=60, lr=0.04):
    p = np.array([-9.0, 2.5]); v = np.zeros(2); m = np.zeros(2); s = np.zeros(2); path = [p.copy()]
    for t in range(1, steps + 1):
        g = grad(p)
        if kind == "SGD":
            p = p - lr * g
        elif kind == "Momentum":
            v = 0.9 * v + g
            p = p - lr * v
        elif kind == "Adam":
            m = 0.9 * m + 0.1 * g
            s = 0.999 * s + 0.001 * g * g
            mh, sh = m / (1 - 0.9 ** t), s / (1 - 0.999 ** t)
            p = p - 0.5 * mh / (np.sqrt(sh) + 1e-8)
        path.append(p.copy())
    return np.array(path)

xx, yy = np.meshgrid(np.linspace(-10, 10, 200), np.linspace(-3, 3, 200))
fig, ax = plt.subplots(figsize=(8, 3.6))
ax.contour(xx, yy, 0.5 * xx ** 2 + 10 * yy ** 2, levels=20, cmap="Greys", linewidths=0.6)
for kind in ["SGD", "Momentum", "Adam"]:
    path = run(kind)
    ax.plot(path[:, 0], path[:, 1], marker=".", markersize=4, label=f"{kind} (final loss {loss(path[-1]):.4f})")
ax.scatter([0], [0], marker="*", s=200, color="gold", zorder=5)
ax.set(title="Optimizers racing to the minimum (★)")
ax.legend(fontsize=8)
plt.show()
```

:::formula Adam update (per weight)
m ← β₁m + (1−β₁)g          (momentum: average gradient)
v ← β₂v + (1−β₂)g²         (average squared gradient)
w ← w − lr · m̂ / (√v̂ + ε)    (m̂, v̂ = bias-corrected)
:::

## Learning-rate schedules

:::def Learning-rate schedule
Changing the learning rate during training. The modern standard for Transformers: **linear warmup** (start tiny, ramp up for the first few hundred/thousand steps) then **cosine decay** down to a small value.
:::

```python run level=intermediate
import numpy as np
import matplotlib.pyplot as plt

def warmup_cosine(step, total=10_000, warmup=500, peak=3e-4, floor=3e-5):
    if step < warmup:
        return peak * step / warmup                                   # linear warmup
    progress = (step - warmup) / (total - warmup)
    return floor + 0.5 * (peak - floor) * (1 + np.cos(np.pi * progress))   # cosine decay

steps = np.arange(10_000)
lrs = [warmup_cosine(s) for s in steps]
fig, ax = plt.subplots(figsize=(7, 3.2))
ax.plot(steps, lrs, linewidth=2)
ax.set(title="Warmup + cosine decay (used to train LLMs)", xlabel="step", ylabel="learning rate")
plt.show()
for s in [0, 250, 500, 5000, 9999]:
    print(f"step {s:5d}: lr = {warmup_cosine(s):.2e}")
```

Why warmup? At the start, weights are random and gradients are wild; big steps can wreck training. Why decay? Smaller steps at the end let the model settle into a good minimum.

## Regularization: fighting overfitting

:::def Regularization
Any technique that discourages the model from memorising the training data, so it generalizes better. Examples: weight decay, dropout, data augmentation, early stopping.
:::

### Weight decay (L2)

:::def Weight decay
Shrinking all weights slightly toward zero at every step (equivalently, adding `λ·Σw²` to the loss). It prefers simpler models with smaller weights.
:::

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
x = np.sort(rng.uniform(-1, 1, 20)); y = np.sin(3 * x) + rng.normal(0, 0.2, 20)
x_test = np.linspace(-1, 1, 200); y_test = np.sin(3 * x_test)
feats = lambda v: np.vander(v, 12, increasing=True)        # degree-11 polynomial features: easy to overfit

for lam in [0.0, 1e-3, 1e-1]:
    A = feats(x)
    w = np.linalg.solve(A.T @ A + lam * np.eye(A.shape[1]), A.T @ y)   # ridge (L2) solution
    test_err = np.mean((feats(x_test) @ w - y_test) ** 2)
    print(f"λ={lam:<6} |w| = {np.linalg.norm(w):9.1f}   test error = {test_err:.4f}")
```

Bigger λ → smaller weights → smoother function → better test error (up to a point).

### Dropout

:::def Dropout
During training, randomly set a fraction `p` of activations to zero at each step (and scale the rest up by `1/(1−p)`). The network can't rely on any single neuron, so it learns more robust features. At inference time dropout is turned off.
:::

```python run level=intermediate
import numpy as np

def dropout(a, p, training, rng):
    if not training or p == 0:
        return a
    mask = rng.random(a.shape) >= p          # keep with probability 1-p
    return a * mask / (1 - p)                # "inverted dropout": keep the expected value the same

rng = np.random.default_rng(0)
a = np.ones((2, 8))
print("training:\n", dropout(a, 0.5, True, rng))
print("inference:\n", dropout(a, 0.5, False, rng))
print("mean preserved:", dropout(np.ones(100_000), 0.3, True, rng).mean().round(3))
```

### Early stopping

:::def Early stopping
Watch the validation loss during training and stop (keeping the best checkpoint) once it has not improved for a set number of epochs ("patience").
:::

```python run level=intermediate
val_losses = [0.92, 0.71, 0.60, 0.55, 0.53, 0.54, 0.52, 0.535, 0.55, 0.57, 0.60]
best, best_epoch, patience, waited = float("inf"), -1, 3, 0
for epoch, vl in enumerate(val_losses):
    if vl < best - 1e-4:
        best, best_epoch, waited = vl, epoch, 0
        print(f"epoch {epoch}: val {vl:.3f}  ✓ new best — save checkpoint")
    else:
        waited += 1
        print(f"epoch {epoch}: val {vl:.3f}  (no improvement {waited}/{patience})")
        if waited >= patience:
            print(f"stopping early; restoring epoch {best_epoch} (val {best:.3f})")
            break
```

## Normalization layers

:::def Batch normalization
Normalize each feature to mean 0 / std 1 **across the batch**, then apply a learned scale and shift. Speeds up and stabilizes training of CNNs.
:::

:::def Layer normalization
Normalize **across the features of each single example** (not across the batch). Works with any batch size and sequence length — so it is used in every Transformer. Many LLMs use **RMSNorm**, a simpler variant that only rescales.
:::

```python run level=advanced
import numpy as np

def layer_norm(x, gamma, beta, eps=1e-5):
    mu = x.mean(axis=-1, keepdims=True)
    var = x.var(axis=-1, keepdims=True)
    return gamma * (x - mu) / np.sqrt(var + eps) + beta

def rms_norm(x, gamma, eps=1e-6):
    return gamma * x / np.sqrt((x ** 2).mean(axis=-1, keepdims=True) + eps)

rng = np.random.default_rng(0)
tokens = rng.normal(5, 3, size=(4, 8))            # 4 tokens, 8 features, badly scaled
d = tokens.shape[-1]
ln = layer_norm(tokens, np.ones(d), np.zeros(d))
rms = rms_norm(tokens, np.ones(d))
print("before:  mean per token", tokens.mean(-1).round(2), " std", tokens.std(-1).round(2))
print("LayerNorm: mean", ln.mean(-1).round(3), " std", ln.std(-1).round(3))
print("RMSNorm:   rms ", np.sqrt((rms ** 2).mean(-1)).round(3))
```

## Residual connections

:::def Residual (skip) connection
Adding a layer's input to its output: `out = x + layer(x)`. Gradients can flow straight through the "+" back to early layers, which makes very deep networks (ResNets, Transformers) trainable.
:::

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
depth, d = 50, 64
x0 = rng.normal(size=(16, d))
Ws = [rng.normal(0, 0.5 / np.sqrt(d), (d, d)) for _ in range(depth)]

def run(residual):
    x = x0
    for W in Ws:
        h = np.tanh(x @ W)
        x = x + h if residual else h
    return x

# How much does the final output still depend on the input? (proxy for gradient flow)
eps = 1e-3
for residual in [False, True]:
    out = run(residual)
    x0_saved = x0.copy(); x0 = x0 + eps
    sensitivity = np.abs(run(residual) - out).mean() / eps
    x0 = x0_saved
    print(f"residual={residual!s:<5}  output sensitivity to input after {depth} layers: {sensitivity:.2e}")
```

Without skip connections the signal (and hence the gradient) from the input has all but vanished after 50 layers. With them it survives.

## Gradient clipping

:::def Gradient clipping
If the overall size (norm) of the gradient exceeds a limit, scale it down to that limit before the update. Prevents one bad batch from blowing up training. LLM training typically clips at a norm of 1.0.
:::

```python run level=intermediate
import numpy as np

def clip_by_global_norm(grads, max_norm=1.0):
    total = np.sqrt(sum((g ** 2).sum() for g in grads))
    scale = min(1.0, max_norm / (total + 1e-6))
    return [g * scale for g in grads], total

grads = [np.array([3.0, 4.0]), np.array([[12.0]])]          # global norm = 13
clipped, norm_before = clip_by_global_norm(grads)
print("norm before:", norm_before)
print("norm after: ", np.sqrt(sum((g ** 2).sum() for g in clipped)).round(4))
print("direction preserved:", (clipped[0] / np.linalg.norm(clipped[0])).round(3))
```

## Putting it all together: a recipe

| Setting | Sensible default |
|---|---|
| optimizer | AdamW, lr 1e-3 (small nets) / 1e-4–3e-4 (Transformers), weight decay 0.01–0.1 |
| schedule | linear warmup (~1–5% of steps) + cosine decay |
| batch size | as large as fits in memory; scale lr with it |
| normalization | LayerNorm/RMSNorm (Transformers), BatchNorm (CNNs) |
| regularization | dropout 0.1, weight decay, data augmentation, early stopping |
| stability | gradient clipping at 1.0, bf16 mixed precision |
| debugging | first **overfit a tiny batch** — if you can't, there's a bug |

:::tip Overfit one batch first
Before a long training run, train on a single small batch. The loss should drop to near zero within a few hundred steps. If it doesn't, your model, loss or data pipeline has a bug — and you've found it in 30 seconds instead of 3 hours.
:::

```python local title="These tricks in PyTorch"
import torch
from torch import nn

model = nn.Sequential(nn.Linear(128, 256), nn.LayerNorm(256), nn.GELU(), nn.Dropout(0.1), nn.Linear(256, 10))
optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=0.05)
total_steps = 10_000
scheduler = torch.optim.lr_scheduler.OneCycleLR(optimizer, max_lr=3e-4, total_steps=total_steps, pct_start=0.05, anneal_strategy="cos")

for step, (xb, yb) in zip(range(total_steps), train_loader):
    loss = nn.functional.cross_entropy(model(xb), yb)
    optimizer.zero_grad()
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)   # gradient clipping
    optimizer.step()
    scheduler.step()                                                   # update the learning rate
```

:::ai The LLM training recipe
Large language models are trained with exactly these ingredients: **AdamW**, **warmup + cosine decay**, **gradient clipping at 1.0**, **RMSNorm/LayerNorm**, **residual connections** in every block, little or no dropout (there is so much data), and **bf16** mixed precision — over thousands of GPUs.
:::

## Check yourself

```quiz
? Which optimizer is the standard choice for training Transformers?
+ AdamW
- Plain SGD with no momentum
- Newton's method
> Adam with decoupled weight decay.

? Why use learning-rate warmup?
+ Early gradients are unstable; small initial steps prevent training from blowing up
- To make training last longer
- To increase final accuracy by itself
> Then the lr ramps up to its peak and later decays.

? What does dropout do at inference time?
+ Nothing — it is turned off
- It drops 50% of neurons
- It doubles the activations
> Inverted dropout scales during training so inference needs no change.

? Why do Transformers use LayerNorm rather than BatchNorm?
+ LayerNorm normalizes each example on its own, independent of batch size and sequence length
- BatchNorm is too slow
- LayerNorm has no parameters
> BatchNorm depends on batch statistics, which is awkward for variable-length sequences.
```

:::keypoints
- **AdamW** + **warmup + cosine decay** is the modern default.
- Fight overfitting with **weight decay**, **dropout**, **data augmentation** and **early stopping**.
- **LayerNorm/RMSNorm** and **residual connections** make deep networks trainable.
- **Gradient clipping** keeps training stable.
- Debug by **overfitting a tiny batch** first.
:::
