---
title: Transfer Learning and Fine-Tuning
level: intermediate
time: 50
summary: Start from a network pretrained on a big data set and adapt it to your task. Feature extraction versus fine-tuning, replacing the head, freezing layers, learning rates per layer, the BatchNorm trap, how much data you need, and domain shift. PyTorch code that was run.
---

Training a CNN from scratch needs a lot of labelled data and compute. But a network trained on **ImageNet** (1.2 million images) has already learned very general visual features: edges, textures, shapes, parts. **Transfer learning** reuses them for your task, and it is **the default way to build vision systems** with limited data.

:::analogy
A person who has learned to read English does not learn Spanish from zero: they already know the alphabet, how sentences work, and what a "word" is. Learning Spanish is **fine-tuning**. A pretrained CNN already "knows how to see"; you only teach it what **your** objects look like.
:::

## What transfers, and why

Features learned by a CNN go from **general to specific** with depth:

- **Early layers**: edges, colour blobs, simple textures: useful for almost any image task.
- **Middle layers**: corners, patterns, object parts.
- **Last layers**: features specific to the original classes (the 1,000 ImageNet categories).

So the early layers can be **kept**, the late layers **adapted** or replaced. Modern **self-supervised** and **vision-language** models (DINOv2, CLIP, covered later) give even more general features than ImageNet classification.

## Two strategies

| Strategy | What you train | When it is the best choice |
|---|---|---|
| **Feature extraction** (linear probe) | Only a new final layer; the backbone is frozen | Very little data (tens to hundreds of images), a task similar to the pretraining task, or no GPU |
| **Fine-tuning** | The new head **and** (some or all) backbone layers, with a small learning rate | More data (hundreds to thousands+), or a different domain (medical, satellite, factory) |

A common recipe: first train **only the head** for a few epochs (so the random head does not damage the good backbone with large gradients), then **unfreeze** and train everything with a **low** learning rate.

## Replace the head and freeze the backbone

The block creates a ResNet-18 (random weights here, so it runs offline; to use the **pretrained** weights write `weights="DEFAULT"`, which downloads them). It shows the mechanics: new head, frozen backbone, and which parameters will actually be trained.

```python local check title="Feature extraction: new head, frozen backbone"
import torch
from torch import nn
from torchvision import models

torch.manual_seed(0)
model = models.resnet18(weights=None)                          # use weights="DEFAULT" for ImageNet-pretrained weights
for p in model.parameters():
    p.requires_grad = False                                    # freeze everything
model.fc = nn.Linear(model.fc.in_features, 3)                  # a NEW head for 3 classes (new layers are trainable by default)

trainable = [p for p in model.parameters() if p.requires_grad]
total = sum(p.numel() for p in model.parameters()); train_n = sum(p.numel() for p in trainable)
print(f"parameters: {total:,} in total, {train_n:,} trainable ({train_n / total * 100:.3f}%)")
optimizer = torch.optim.AdamW(trainable, lr=1e-2)             # give the optimiser ONLY the trainable parameters

# a toy 3-class problem: stripes, dots, plain: the frozen backbone's features are enough to separate them
def make(cls, n):
    x = torch.rand(n, 3, 64, 64) * 0.2
    xs = torch.arange(64).float()
    if cls == 0: x += (torch.sin(xs / 2)[None, None, None, :] > 0).float() * 0.6               # vertical stripes
    if cls == 1: x += ((torch.sin(xs / 3)[None, None, :, None] * torch.sin(xs / 3)[None, None, None, :]) > 0.5).float() * 0.6
    return x
X = torch.cat([make(c, 40) for c in range(3)]); Y = torch.arange(3).repeat_interleave(40)
perm = torch.randperm(120); X, Y = X[perm], Y[perm]
Xtr, Ytr, Xte, Yte = X[:90], Y[:90], X[90:], Y[90:]

model.eval()                                                   # keep BatchNorm statistics fixed (frozen backbone)
for step in range(200):
    idx = torch.randint(0, 90, (32,))
    loss = nn.functional.cross_entropy(model(Xtr[idx]), Ytr[idx])
    optimizer.zero_grad(); loss.backward(); optimizer.step()
with torch.no_grad():
    acc = (model(Xte).argmax(1) == Yte).float().mean().item()
print(f"final loss {loss.item():.3f}, test accuracy {acc:.2f}   (only {train_n:,} weights were trained)")
assert acc > 0.9
```

## Fine-tuning details

- **Lower learning rate** for the backbone than for the head (for example 1e-5 versus 1e-3), through optimiser **parameter groups**. **Discriminative learning rates**: lower for earlier layers, higher for later ones.
- **Unfreeze gradually** (last block first) when data are very scarce.
- **Use the same preprocessing** as the pretraining (same mean/std, resize and crop). Wrong normalisation silently hurts.
- **Image size**: pretrained CNNs work at other sizes (fully convolutional + global pooling), but best near the original (224). For small defects, use a **higher** resolution and fine-tune.
- **Regularise**: strong augmentation, weight decay, and label smoothing, since a large backbone can overfit a small set quickly.

```python local check title="Different learning rates per layer group"
import torch
from torch import nn
from torchvision import models

model = models.resnet18(weights=None)
model.fc = nn.Linear(512, 5)
groups = [
    {"params": list(model.layer1.parameters()) + list(model.layer2.parameters()), "lr": 1e-5},     # early layers: general features, change little
    {"params": list(model.layer3.parameters()) + list(model.layer4.parameters()), "lr": 1e-4},     # later layers: adapt more
    {"params": model.fc.parameters(), "lr": 1e-3},                                                 # new head: learn fast
]
opt = torch.optim.AdamW(groups, weight_decay=0.01)                                                 # the stem is left out here: it stays at its initial values
for g in opt.param_groups:
    print("learning rate", g["lr"], "applies to", sum(p.numel() for p in g["params"]), "parameters")
```

## The BatchNorm trap

BatchNorm layers have **running statistics** from the pretraining data.

- If you **freeze** the backbone, also keep BN in **eval mode** (call `model.eval()` on the frozen part, or set `bn.eval()`), otherwise the running statistics will be updated by your small batches and drift.
- If you **fine-tune with a small batch** (below ~8), BN statistics are noisy: freeze BN (eval mode) or use GroupNorm.
- If your data look very different from ImageNet (medical, thermal, SAR), **update** BN statistics on your data, or fine-tune everything.

```python local check title="Frozen BatchNorm: running statistics stay fixed in eval mode"
import torch
from torch import nn

torch.manual_seed(0)
bn = nn.BatchNorm2d(4)
x = torch.randn(8, 4, 5, 5) * 3 + 2
before = bn.running_mean.clone()
bn.train(); bn(x)
changed = not torch.allclose(before, bn.running_mean)
print("train mode updates the running mean:", changed)
bn.running_mean.copy_(before)
bn.eval(); bn(x)
print("eval mode leaves it unchanged:", torch.allclose(before, bn.running_mean))
```

## How much data do you need?

Rules of thumb (they depend on the task):

- **Linear probe** on strong pretrained features: 10–50 images per class can already work for easy tasks.
- **Fine-tuning**: from a few hundred to a few thousand images per class for good results; more if the domain is far from ImageNet.
- **From scratch**: tens of thousands to millions, unless the images are simple.

More pretraining data and better pretraining (CLIP, DINOv2, large ViTs) shift all these numbers down; with such a backbone, a **linear probe or a small head** often beats fine-tuning on tiny data sets.

## Domain shift: when transfer is weak

If the target domain is very different (X-ray, microscopy, satellite, thermal, depth), ImageNet features help less, though they are still usually better than random initialisation, especially in the early layers. Options: fine-tune **all** layers; use a **domain-specific pretrained** model (for example RadImageNet, remote-sensing foundation models, DINOv2 on your unlabelled images, self-supervised pretraining on your own data); apply **domain adaptation** (styles, colour normalisation); and gather even a few labelled target images for validation.

## The practical pipeline

:::flow Fine-tuning a pretrained model
Choose a pretrained backbone | ResNet/EfficientNet/ConvNeXt, or a ViT/DINOv2 for stronger features. Match the pretraining preprocessing.
Replace the head | New linear layer with your number of classes.
Train the head only | Few epochs, higher learning rate, backbone frozen (BN in eval mode).
Unfreeze and fine-tune | Lower learning rate (often 10-100x smaller), warm-up, cosine decay, augmentation.
Validate honestly | Group splits, metrics that match the task, a baseline linear probe to compare.
Iterate on data | Look at errors, fix labels, add examples of failure cases.
:::

:::interview Questions you may get
- "What is transfer learning and why does it work?" Reuse features from a model pretrained on a large data set; early layers learn general features (edges, textures) that apply to most images.
- "Feature extraction versus fine-tuning?" Feature extraction trains only a new head on frozen features (little data); fine-tuning also adapts backbone weights with a small learning rate (more data or a different domain).
- "How would you fine-tune with only 200 images?" Pretrained backbone, train the head first, then lightly fine-tune the last blocks with strong augmentation and a low learning rate, or use a linear probe on strong features; validate with cross-validation.
- "What is the BatchNorm issue when fine-tuning?" Running statistics from the old data; with frozen layers keep BN in eval mode; small batches give noisy statistics.
- "Why use a lower learning rate for the backbone?" Large updates would destroy the pretrained features before the new head is useful.
:::

```quiz
? You freeze a backbone but forget model.eval(). What happens to BatchNorm layers?
+ Their running statistics are updated by your batches, silently changing the "frozen" backbone
- Nothing
- They crash
> Put frozen BN layers in eval mode.

? Which layers of an ImageNet CNN are the most general (transfer best)?
+ The early layers (edges, textures)
- The final classification layer
- Only the last block
> Features get more task-specific with depth.

? Why train the new head first before unfreezing the backbone?
+ A random head produces large, noisy gradients that could damage good pretrained features
- It saves disk space
- Backbones cannot be trained
> It is a standard two-stage recipe.

? You have 50 images per class from a very different domain (microscopy). A reasonable start?
+ Fine-tune a pretrained model (or a domain-specific one) with strong augmentation, and compare with a linear probe
- Train a ResNet-152 from scratch
- Use no validation set
> Even a distant pretraining usually beats random initialisation.
```

:::problem After fine-tuning, your model reaches 99% on validation images but 70% on new factory images. List what you investigate. {level=medium tags="transfer-learning,domain-shift,debugging"}
Think about differences between data sources.

:::solution Model answer
Check for leakage in the validation split (same sessions or parts across train and validation); a difference between validation and deployment data (camera, lighting, background, resolution, JPEG, preprocessing, crops); label noise; and class balance differences. Run the model on a sample of the factory images and look at the errors in a grid. Verify identical preprocessing (normalisation, RGB order, resize) and `model.eval()`. If the domain shift is real, collect and label factory images (even a few hundred), add augmentation covering that variation, fine-tune on a mix, and keep a **factory-only** validation set to measure progress.
:::
:::

:::keypoints
- Pretrained features are general (edges → parts → objects); reuse them. Feature extraction (frozen backbone + new head) for little data; fine-tuning (low learning rate) for more data or other domains.
- Train the head first, then unfreeze; use discriminative learning rates and the same preprocessing as pretraining.
- Frozen BatchNorm layers must stay in eval mode; small batches make BN statistics noisy.
- Stronger pretraining (self-supervised, CLIP, DINOv2) needs even less labelled data; domain shift needs target-domain data.
:::

:::resources
- [Yosinski et al.: How transferable are features in deep neural networks?](https://arxiv.org/abs/1411.1792) — which layers transfer.
- [PyTorch transfer learning tutorial](https://docs.pytorch.org/tutorials/beginner/transfer_learning_tutorial.html) — fine-tuning and feature extraction in code.
- [Kornblith et al.: Do Better ImageNet Models Transfer Better?](https://arxiv.org/abs/1805.08974) — how pretraining quality affects transfer.
:::
