---
title: Training a CNN in PyTorch — Loop, Optimisers, Schedules
level: intermediate
time: 55
summary: The training loop in PyTorch, line by line. Datasets and loaders, SGD with momentum versus Adam and AdamW, learning-rate schedules (step, cosine, warmup), mixed precision, gradient clipping, checkpoints and evaluation. Every code block here was run.
---

PyTorch code is the lingua franca of deep-learning vision. These blocks need PyTorch, so they run **on your computer** (they are marked "Run locally"); every one of them was executed when this course was built.

## The training loop

Every PyTorch training script has the same five steps inside two loops:

:::flow One training step
Forward | pred = model(images). The network computes scores.
Loss | loss = criterion(pred, labels). One number: how wrong.
Zero the gradients | optimizer.zero_grad(). Gradients accumulate by default, so clear the old ones.
Backward | loss.backward(). Autograd fills p.grad for every parameter.
Update | optimizer.step(). Change the weights using the gradients.
:::

```python local check title="A complete training script (digits, small CNN)"
import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split

torch.manual_seed(0)
device = "cuda" if torch.cuda.is_available() else "cpu"

# 1. data: tensors in (N, C, H, W) layout, float32 in 0..1, labels as int64
X, y = load_digits(return_X_y=True)
X = torch.tensor(X / 16.0, dtype=torch.float32).reshape(-1, 1, 8, 8)
y = torch.tensor(y)
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y.numpy())
train_loader = DataLoader(TensorDataset(Xtr, ytr), batch_size=64, shuffle=True)         # shuffle the training data every epoch
test_loader = DataLoader(TensorDataset(Xte, yte), batch_size=256)

# 2. model
model = nn.Sequential(
    nn.Conv2d(1, 16, 3, padding=1), nn.BatchNorm2d(16), nn.ReLU(),
    nn.MaxPool2d(2),                                                                    # 8x8 -> 4x4
    nn.Conv2d(16, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(),
    nn.AdaptiveAvgPool2d(1), nn.Flatten(),                                              # global average pool -> 32 numbers
    nn.Linear(32, 10),
).to(device)
print("parameters:", sum(p.numel() for p in model.parameters()))

criterion = nn.CrossEntropyLoss()                                                       # takes raw logits and integer labels
optimizer = torch.optim.AdamW(model.parameters(), lr=3e-3, weight_decay=1e-2)

def evaluate(loader):
    model.eval()                                                                        # BatchNorm and dropout switch to inference mode
    correct = total = 0
    with torch.no_grad():                                                               # no gradient bookkeeping: faster, less memory
        for xb, yb in loader:
            pred = model(xb.to(device)).argmax(1).cpu()
            correct += (pred == yb).sum().item(); total += len(yb)
    return correct / total

for epoch in range(30):
    model.train()
    running = 0.0
    for xb, yb in train_loader:
        xb, yb = xb.to(device), yb.to(device)
        loss = criterion(model(xb), yb)                                                 # forward + loss
        optimizer.zero_grad()                                                           # clear old gradients
        loss.backward()                                                                 # backward
        optimizer.step()                                                                # update
        running += loss.item() * len(xb)
    if epoch in (0, 9, 29):
        print(f"epoch {epoch + 1:2d}: train loss {running / len(Xtr):.3f}   test accuracy {evaluate(test_loader):.3f}")
assert evaluate(test_loader) > 0.95
```

Four things beginners forget: `model.train()` / `model.eval()`, `zero_grad()`, moving **both** model and data to the same device, and wrapping evaluation in `torch.no_grad()`.

## Optimisers

The optimiser decides **how** to use the gradient.

- **SGD** (stochastic gradient descent): `w ← w − lr · g`. Simple. Needs a well-tuned learning rate and schedule.
- **SGD with momentum** (0.9): keeps a running average of gradients (a "velocity"), smoothing noise and speeding up along consistent directions. Still the strongest choice for many CNN classifiers when well tuned (ResNet recipes).
- **Adam**: per-parameter adaptive step sizes from running averages of the gradient and its square. Fast, forgiving; the default for transformers, detection and most research.
- **AdamW**: Adam with **decoupled weight decay** (the weights are shrunk directly rather than through the gradient), which regularises properly. Prefer AdamW to Adam with L2.

| Optimiser | Typical learning rate | Notes |
|---|---|---|
| SGD + momentum 0.9 | 0.1 (batch 256), nesterov | Needs a decay schedule; weight decay 1e-4 – 5e-4 |
| Adam / AdamW | 1e-3 – 3e-4 (fine-tuning: 1e-4 – 1e-5) | weight decay 0.01 – 0.05 for AdamW |
| LAMB / LARS | large-batch training | Scale to batch sizes of thousands |

**The learning rate is the most important hyper-parameter.** Too high: the loss explodes or oscillates. Too low: training is slow and can stall. A quick way to find a good value: the **LR range test**: raise the learning rate exponentially during a short run and choose a value somewhat below where the loss starts to rise.

## Learning-rate schedules

A fixed learning rate is rarely best. Lower it over time, so the model first explores and then settles. Common schedules:

- **Step decay**: multiply by 0.1 every N epochs (classic ResNet).
- **Cosine annealing**: follow half a cosine from the start value to near zero. Smooth and very popular.
- **Warm-up**: start with a tiny rate and rise linearly for the first few hundred steps. Needed for Adam with transformers and for large batches, since early gradients are unreliable.
- **One-cycle**: warm up to a high rate and then anneal down; allows fast "super-convergence".
- **Reduce on plateau**: lower when the validation metric stops improving.

```python run title="Learning-rate schedules" level=easy
import numpy as np
import matplotlib.pyplot as plt

steps = np.arange(1000)
base = 0.1
step_decay = base * 0.1 ** (steps // 300)
cosine = 0.5 * base * (1 + np.cos(np.pi * steps / 1000))
warmup_cosine = np.where(steps < 100, base * steps / 100, 0.5 * base * (1 + np.cos(np.pi * (steps - 100) / 900)))
one_cycle = np.interp(steps, [0, 300, 1000], [base / 10, base, base / 1000])

fig, ax = plt.subplots(figsize=(6.5, 3.6))
for name, v in [("step decay", step_decay), ("cosine", cosine), ("warm-up + cosine", warmup_cosine), ("one-cycle (linear)", one_cycle)]:
    ax.plot(steps, v, label=name)
ax.set_xlabel("training step"); ax.set_ylabel("learning rate"); ax.legend(); ax.set_title("Learning-rate schedules")
print("cosine at step 0, 500, 999:", np.round(cosine[[0, 500, 999]], 4))
```

```python local check title="Schedules in PyTorch"
import torch
from torch import nn

model = nn.Linear(4, 2)
opt = torch.optim.SGD(model.parameters(), lr=0.1, momentum=0.9, nesterov=True, weight_decay=5e-4)
warmup = torch.optim.lr_scheduler.LinearLR(opt, start_factor=0.01, total_iters=10)                  # first 10 steps: warm up
cosine = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=90)                                   # then 90 steps of cosine decay
sched = torch.optim.lr_scheduler.SequentialLR(opt, [warmup, cosine], milestones=[10])
lrs = []
for step in range(100):
    opt.step()                                                                                       # (a real loop calls zero_grad, backward first)
    lrs.append(opt.param_groups[0]["lr"])
    sched.step()                                                                                     # call the scheduler after each step (or epoch)
print("lr at steps 0, 5, 10, 50, 99:", [round(lrs[i], 4) for i in (0, 5, 10, 50, 99)])
assert lrs[10] > lrs[0] and lrs[99] < lrs[50] < lrs[10]
```

## Mixed precision, clipping, checkpoints

- **Mixed precision** (`torch.autocast` with `float16` or `bfloat16`): does most arithmetic in 16 bits: about 2× faster and half the memory on modern GPUs. With `float16` you need a **GradScaler** to avoid tiny gradients underflowing; `bfloat16` does not.
- **Gradient clipping** (`clip_grad_norm_`): rescale the gradient if its norm exceeds a limit (often 1.0). Prevents rare huge steps from ruining training.
- **Gradient accumulation**: add up the gradients of several small batches before one `optimizer.step()`, to simulate a big batch on small memory.
- **Checkpointing**: save `model.state_dict()`, the optimiser state and the epoch, so you can resume and keep the best model by validation score.
- **Reproducibility**: seed everything; note that some GPU operations are non-deterministic.

```python local check title="Mixed precision, clipping, accumulation and checkpoints"
import io
import torch
from torch import nn

torch.manual_seed(0)
device = "cuda" if torch.cuda.is_available() else "cpu"
model = nn.Sequential(nn.Conv2d(3, 8, 3, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(8, 5)).to(device)
opt = torch.optim.AdamW(model.parameters(), lr=1e-3)
use_amp = device == "cuda"
scaler = torch.amp.GradScaler(enabled=use_amp)                                           # scales the loss so float16 gradients do not underflow
accum = 4                                                                                # accumulate 4 small batches = one big batch of 32

for step in range(8):
    x = torch.randn(8, 3, 32, 32, device=device); y = torch.randint(0, 5, (8,), device=device)
    with torch.autocast(device_type=device, dtype=torch.float16 if use_amp else torch.bfloat16, enabled=True):
        loss = nn.functional.cross_entropy(model(x), y) / accum
    scaler.scale(loss).backward()                                                         # gradients accumulate across the small batches
    if (step + 1) % accum == 0:
        scaler.unscale_(opt)                                                              # restore the true gradient scale before clipping
        grad_norm = nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        scaler.step(opt); scaler.update(); opt.zero_grad()
        print(f"update at step {step + 1}: gradient norm before clipping {grad_norm:.3f}")

buffer = io.BytesIO()                                                                    # a checkpoint (here in memory; normally a .pt file)
torch.save({"model": model.state_dict(), "opt": opt.state_dict(), "step": 8}, buffer)
buffer.seek(0)
state = torch.load(buffer, map_location="cpu")
model.load_state_dict(state["model"])
print("checkpoint keys:", list(state), " mixed precision on GPU:", use_amp)
```

## Evaluating and monitoring

- Plot **training and validation loss** every epoch: the gap shows overfitting.
- Track the **metric you care about** (accuracy, mAP, F1), not only the loss.
- Keep the **best checkpoint** by validation metric, and apply **early stopping** if it stops improving.
- Log hyper-parameters and seeds (Weights & Biases, MLflow, TensorBoard) so you can reproduce a run.

## Hyper-parameter checklist

| Setting | Starting point |
|---|---|
| Batch size | As large as memory allows (32–256); scale the learning rate with it |
| Optimiser | AdamW 1e-3 from scratch; 1e-4 fine-tuning; SGD+momentum for CNN classification recipes |
| Schedule | Warm-up + cosine |
| Weight decay | 1e-4 (SGD), 0.01–0.05 (AdamW) |
| Epochs | Until validation stops improving (30–300 from scratch; 5–20 fine-tuning) |
| Augmentation | Flip, random crop, colour jitter at minimum (next lesson) |
| Mixed precision | On, if you have a modern GPU |

:::interview Questions you may get
- "What are the steps of a PyTorch training iteration?" Forward, loss, zero gradients, backward, optimiser step.
- "SGD with momentum versus Adam?" Momentum smooths and speeds SGD; Adam adapts a step size per parameter and is forgiving; SGD+momentum can generalise slightly better on CNN classifiers when tuned.
- "Why AdamW rather than Adam with L2?" In Adam, L2 interacts with the adaptive scaling; AdamW decouples weight decay so it acts as intended.
- "Why warm-up?" Early gradients and Adam statistics are unreliable; a small start prevents divergence, especially with large batches or transformers.
- "What does `torch.no_grad()` do?" Disables gradient tracking: less memory and faster inference.
- "How do you train with a bigger batch than fits in memory?" Gradient accumulation.
:::

```quiz
? What does optimizer.zero_grad() do and why is it needed?
+ Clears the gradients from the previous step, because PyTorch accumulates them by default
- Resets the weights to zero
- Stops training
> Without it, gradients from different steps add up.

? Which optimiser decouples weight decay from the gradient update?
- SGD
- Adam
+ AdamW
> This makes weight decay behave as true regularisation with adaptive optimisers.

? Why do we use a learning-rate warm-up?
+ Early updates are unreliable; starting small avoids divergence
- To make training slower
- To reduce the model size
> It matters especially with Adam, large batches and transformers.

? Why must you call model.eval() before validation?
+ BatchNorm and dropout behave differently in eval mode
- It speeds up the data loader
- It freezes the weights
> Add torch.no_grad() to save memory too.
```

:::problem Your training loss is NaN after a few hundred steps. List what you check. {level=medium tags="training,debugging,nan"}
Think about the learning rate, data and numerics.

:::solution Model answer
Learning rate too high (try 10× lower, add warm-up and gradient clipping); bad data (NaN or inf values, empty images, labels out of range; check with `torch.isfinite`); exploding activations from missing normalisation or poor initialisation; mixed-precision overflow in `float16` (use the GradScaler or `bfloat16`); a loss that can produce `log(0)` or division by zero (use `eps`, use logits-based losses like `CrossEntropyLoss` instead of manual softmax+log); and custom layers with unstable operations. Find the first step where it appears (anomaly detection `torch.autograd.set_detect_anomaly(True)`), and check by overfitting a single small batch.
:::
:::

:::keypoints
- Training step: forward → loss → `zero_grad` → `backward` → `step`. Use `train()`/`eval()` and `no_grad()` correctly.
- SGD + momentum (tuned) or AdamW (forgiving); learning rate is the key hyper-parameter; use warm-up + cosine decay.
- Mixed precision, gradient clipping, accumulation and checkpoints make training faster, stabler and resumable.
- Monitor train and validation curves and the real metric; keep the best checkpoint; log everything.
:::

:::resources
- [PyTorch: training a classifier tutorial](https://docs.pytorch.org/tutorials/beginner/blitz/cifar10_tutorial.html) — the official walkthrough.
- [Loshchilov and Hutter: Decoupled Weight Decay Regularization (AdamW)](https://arxiv.org/abs/1711.05101) — why AdamW.
- [Smith: Cyclical Learning Rates and the LR range test](https://arxiv.org/abs/1506.01186) — finding a good learning rate.
- [Goyal et al.: Accurate, Large Minibatch SGD](https://arxiv.org/abs/1706.02677) — warm-up and linear scaling for big batches.
:::
