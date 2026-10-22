---
title: Debugging Neural Network Training
level: intermediate
time: 45
summary: A practical recipe for when a model does not learn. Check the data, the loss at initialisation, overfit a single batch, sweep the learning rate, inspect predictions, and the most common silent bugs. With PyTorch examples that were run.
---

"My model doesn't learn." It is the most common problem in practice, and a standard interview question. The key difference between beginners and experts: experts **do not guess**; they follow a checklist, from the simplest checks to the most complicated.

## Principle: start simple, add one thing at a time

Karpathy's "recipe for training neural networks" in one line: *neural net training fails silently.* The code runs, the loss goes down a little, and the result is poor with no error message. So **verify each part separately** and **build up gradually**.

:::flow The debugging recipe
1. Look at the data | Plot samples with their labels, check shapes, ranges, class counts, duplicates and leakage. The most common bugs are here.
2. Set up the full pipeline with a trivial model | Training loop, evaluation, metric. A baseline (predict the majority class) to compare with.
3. Check the loss at initialisation | For C classes it should be about ln(C). If not, something is wrong with the output layer, labels or scaling.
4. Overfit one small batch | 8 to 32 examples: the loss must go to almost zero. If not, there is a bug in the model, the loss or the labels.
5. Train on the full data, look at the curves | Training loss down? Validation loss? The gap tells you under- or overfitting.
6. Fix one problem at a time | Learning rate first, then regularisation and augmentation, then the model size.
7. Visualise predictions | Look at the errors: they show the real problem.
:::

## Step 3: the loss at initialisation

With random weights and balanced classes, the network is "uniformly unsure": every class has probability `1/C`, so the cross-entropy is `ln C` (2.30 for 10 classes, 6.91 for 1000, 0.69 for 2). A much higher value means the initial output is large and confident (bad scaling or initialisation); a much lower value suggests label leakage.

## Step 4: overfit one batch

A model that cannot memorise **8 images** is broken. This single test catches wrong labels, wrong loss, frozen layers, `requires_grad` mistakes, a learning rate far too small or large, and shape bugs.

```python local check title="Initial loss and overfitting a single batch"
import math
import torch
from torch import nn

torch.manual_seed(0)
model = nn.Sequential(nn.Conv2d(3, 16, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2), nn.Conv2d(16, 32, 3, padding=1), nn.ReLU(),
                      nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(32, 10))
x = torch.randn(16, 3, 32, 32)
y = torch.randint(0, 10, (16,))
criterion = nn.CrossEntropyLoss()

init_loss = criterion(model(x), y).item()
print(f"initial loss {init_loss:.3f}   expected ln(10) = {math.log(10):.3f}")
assert abs(init_loss - math.log(10)) < 0.5

opt = torch.optim.Adam(model.parameters(), lr=3e-3)
for step in range(300):
    loss = criterion(model(x), y)
    opt.zero_grad(); loss.backward(); opt.step()
    if step in (0, 50, 150, 299):
        print(f"step {step:3d}: loss {loss.item():.4f}")
acc = (model(x).argmax(1) == y).float().mean().item()
print("accuracy on the batch it memorised:", acc)
assert loss.item() < 0.05 and acc == 1.0
```

The loss starts at ln 10 and falls to near zero: the pipeline can learn. If it stalls, check, in this order: learning rate, labels matching the images (visualise!), loss function inputs (logits versus probabilities), `optimizer.zero_grad()` position, whether the parameters are in the optimiser, and frozen layers.

## Step 5: read the curves

| What you see | Likely cause | Try |
|---|---|---|
| Training loss does not go down | Learning rate wrong; bug; model too small; bad data/labels | Overfit one batch; learning-rate sweep |
| Loss goes **NaN / inf** | Learning rate too high; bad data (NaN/inf); `log(0)`; fp16 overflow | Lower LR, clip gradients, check data, use stable losses |
| Training loss down, validation loss up | **Overfitting** | More data/augmentation, regularisation, smaller model, early stopping |
| Both high and flat | **Underfitting** | Larger model, longer training, higher LR, fewer regularisers, better features |
| Validation much **better** than training | Dropout/augmentation active in training only; or leakage | Evaluate training data in eval mode; check the split |
| Loss oscillates wildly | LR too high; batch too small; no normalisation | Lower LR, bigger batch, warm-up |
| Validation accuracy stuck at chance | Labels shuffled/mismatched at evaluation; different preprocessing | Compare train and eval pipelines side by side |
| Works on GPU, differs on CPU or in export | Missing `eval()`, preprocessing difference, non-deterministic operations | Unit-test one image end to end |

## A learning-rate sweep

Try a range of learning rates for a short training run each; plot the final loss. The best is usually just below where training becomes unstable.

```python local check title="Learning-rate sweep"
import torch
from torch import nn

def run(lr, steps=60):
    torch.manual_seed(0)
    model = nn.Sequential(nn.Linear(20, 64), nn.ReLU(), nn.Linear(64, 3))
    x = torch.randn(256, 20); w = torch.randn(20, 3); y = (x @ w).argmax(1)
    opt = torch.optim.SGD(model.parameters(), lr=lr, momentum=0.9)
    for _ in range(steps):
        loss = nn.functional.cross_entropy(model(x), y)
        opt.zero_grad(); loss.backward(); opt.step()
    return loss.item()

print("learning rate   final loss")
results = {lr: run(lr) for lr in (1e-5, 1e-3, 1e-2, 1e-1, 0.3, 1.0, 3.0, 10.0, 100.0)}
for lr, l in results.items():
    print(f"{lr:12.0e} {l:12.4f}" + ("   (diverged)" if not (l == l) or l > 5 else ""))
best = min(results, key=lambda k: results[k] if results[k] == results[k] else 1e9)
print("best learning rate in this sweep:", best)
assert results[1e-5] > 1.0 and results[10.0] > 100 and best in (0.3, 1.0)
```

Too small: barely moves (1e-5). Too large: the loss explodes (10) or becomes NaN (100). In between there is a broad good region (here about 0.1 to 3). On this easy toy problem even a learning rate of 1 works; real networks usually prefer much smaller values. (Adam's good range is lower than SGD's.)

## The silent bugs list

These cause "it runs but is bad". Check them all at least once:

- **Labels not aligned with images** after shuffling (shuffle the pair together!), or off by one; class IDs not matching names. *Plot images with labels.*
- **Wrong preprocessing**: no 0–1 scaling, no mean/std normalisation, BGR instead of RGB, HWC instead of CHW, different normalisation in train and test.
- **Forgetting `model.eval()`** at test time; or forgetting `model.train()` after evaluating.
- **`softmax` before `CrossEntropyLoss`**: that loss expects **raw logits** (applying softmax twice flattens the gradients).
- **Wrong loss for the task**: sigmoid + BCE for multi-label, softmax + CE for single-label.
- **`zero_grad()` missing**, or called between `backward()` and `step()`.
- **Frozen parameters by accident** (`requires_grad=False`, `.detach()` in the graph, `torch.no_grad()` around the training forward pass).
- **Data loader bugs**: the same augmentation seed in all workers; non-shuffled training data; test images in the training folder.
- **Learning-rate schedule** that decays to zero too early or never warms up.
- **Class imbalance** unaddressed, so the model predicts the majority class.
- **Batch size 1 with BatchNorm** in train mode.
- **Numerical issues** in custom losses (`log(0)`, division by zero, large exponentials).

## Tools

- Visualise inputs after augmentation and after normalisation (undo it to view).
- Monitor **gradient norms** and the **ratio of update size to weight size** (about 1e-3 is healthy).
- Log per-class metrics and a **confusion matrix**; look at the **hardest errors**.
- TensorBoard or Weights & Biases for curves and image panels; `torch.autograd.set_detect_anomaly(True)` to locate NaNs.
- Fix **seeds**, then change one thing at a time. Write small **unit tests** for the data pipeline (shapes, ranges, label alignment).

:::interview Questions you may get
- "Your model's training loss isn't decreasing. What do you do?" Check the data and labels visually, the initial loss versus ln C, overfit one batch, sweep the learning rate, check that gradients flow and parameters are in the optimiser, and simplify the model.
- "What should the initial loss be for 10 classes?" About ln(10) ≈ 2.3.
- "Training accuracy is 99%, validation 70%." Overfitting (or a validation set from a different distribution); add augmentation, regularisation, data; check for a split problem.
- "Loss becomes NaN." Learning rate too high, bad inputs, invalid operations (log of zero), mixed-precision overflow; clip gradients and find the first bad step.
- "Why not apply softmax before CrossEntropyLoss in PyTorch?" The loss applies log-softmax itself and expects logits; a second softmax squashes the signal.
:::

```quiz
? A 10-class model starts training with a loss of 12. What is the most likely issue?
+ Over-confident initial outputs (bad scaling or initialisation, or labels not matching)
- A perfectly normal start
- Underfitting
> The loss should start near ln(10) = 2.3.

? A model cannot overfit a batch of 16 images. What does that tell you?
+ There is a bug in the model, loss, labels or optimiser setup
- The data set is too small
- It generalises well
> A working pipeline can always memorise a tiny batch.

? Validation loss rises while training loss keeps falling. This is...
+ Overfitting
- Underfitting
- A learning-rate warm-up
> Add regularisation, augmentation or stop early.

? CrossEntropyLoss in PyTorch expects what as input?
+ Raw logits (no softmax)
- Probabilities
- One-hot vectors only
> It combines log-softmax and negative log-likelihood.
```

:::problem A segmentation model trains to 0.95 Dice on the training set, and on the validation set 0.3. A colleague blames the architecture. What would you check first? {level=medium tags="debugging,validation,segmentation"}
Think about data and evaluation differences before changing the model.

:::solution Model answer
First data and evaluation, since the huge gap is suspicious: Are train and validation images pre-processed the same way (same normalisation, size, resize interpolation for masks: nearest neighbour)? Are validation masks aligned and correctly encoded (class IDs, 0/255 versus 0/1)? Is the validation set from a different distribution (other scanner, site, season)? Is dropout/BN in eval mode during validation? Is there leakage in the training set (the model memorised near-duplicates) that makes training look better than it is? Overlay predictions on validation images to look at them. Only if the data and pipeline are sound, address overfitting with augmentation, regularisation and more data.
:::
:::

:::keypoints
- Training fails silently: debug from simple to complex: data → loss at init (≈ ln C) → overfit one batch → learning-rate sweep → curves → predictions.
- Read the curves: no decrease (bug/LR), NaN (LR/data/numerics), train/val gap (overfitting), both high (underfitting).
- Common silent bugs: label misalignment, wrong preprocessing, missing `eval()`/`zero_grad()`, softmax before CrossEntropyLoss, frozen parameters.
- Make small, single changes with fixed seeds, and look at the data, the predictions and the hardest errors.
:::

:::resources
- [Karpathy: A Recipe for Training Neural Networks](https://karpathy.github.io/2019/04/25/recipe/) — the classic checklist.
- [Google: Deep Learning Tuning Playbook](https://github.com/google-research/tuning_playbook) — a practical guide to hyper-parameters and debugging.
- [PyTorch: autograd anomaly detection](https://docs.pytorch.org/docs/stable/autograd.html#anomaly-detection) — find where NaNs start.
:::
