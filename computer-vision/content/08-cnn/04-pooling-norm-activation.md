---
title: Pooling, Normalisation and Activations (BatchNorm, GroupNorm, GELU)
level: intermediate
time: 45
summary: The small layers that make deep CNNs trainable. Max and average pooling, global average pooling, BatchNorm (train versus eval!), LayerNorm and GroupNorm, ReLU, GELU and SiLU, and dropout. A NumPy BatchNorm checked against PyTorch.
---

A CNN is not only convolutions. These "small" layers decide whether a deep network trains at all.

## Pooling

**Pooling** reduces the spatial size by summarising small windows.

| Type | What it does | Notes |
|---|---|---|
| **Max pool** (2×2, stride 2) | Keeps the largest value | Keeps the strongest response; small shifts do not change it (tolerance). The classic choice |
| **Average pool** | Averages the window | Smoother; used inside networks like DenseNet transitions |
| **Global average pool (GAP)** | Averages each whole feature map to 1 number | Replaces the huge fully connected layers; works for any image size; makes "class activation maps" possible |
| **Strided convolution** | A conv with stride 2 | Learned downsampling; modern networks often prefer it to pooling |

```python run title="Pooling gives tolerance to small shifts" level=easy
import numpy as np

rng = np.random.default_rng(0)
feature_map = rng.random((8, 8)) * (rng.random((8, 8)) > 0.8)          # a sparse map of "detections"
shifted = np.roll(feature_map, 1, axis=1)                              # the same pattern moved 1 pixel

def pool(a, mode):
    blocks = a.reshape(4, 2, 4, 2)
    return blocks.max(axis=(1, 3)) if mode == "max" else blocks.mean(axis=(1, 3))

for mode in ("max", "avg"):
    same = np.mean(np.isclose(pool(feature_map, mode), pool(shifted, mode)))
    diff = np.abs(pool(feature_map, mode) - pool(shifted, mode)).mean()
    print(f"{mode} pooling: {same * 100:.0f}% of the outputs unchanged by a 1-pixel shift; mean change {diff:.3f}")
print("without pooling, the same shift changes", f"{np.mean(feature_map != shifted) * 100:.0f}% of the values")
```

After a 1-pixel shift, max pooling leaves half of its outputs exactly unchanged, while without pooling more than half of the values change: pooling absorbs part of small shifts. It also cuts computation and makes the receptive field grow. But it throws away **where** exactly the feature was, which hurts tasks needing precise location (segmentation, keypoints); those use skip connections or no pooling.

## Why normalisation?

Deep networks are hard to train because the **distribution of each layer's input keeps changing** as earlier layers learn, and activations can grow or vanish. **Normalisation layers** rescale activations to a stable range. The result: larger learning rates, faster and more reliable training, less sensitivity to initialisation.

## BatchNorm

**Batch normalisation** (Ioffe and Szegedy, 2015) normalises each **channel** using the mean and variance over the **batch and spatial positions**, then applies a learned scale `γ` and shift `β`:

:::formula Batch normalisation
\hat{x} = \frac{x - \mu_B}{\sqrt{\sigma_B^2 + \epsilon}}, \qquad y = \gamma\,\hat{x} + \beta
:::

The crucial detail is **training versus evaluation**:

- **Training**: use the statistics of the current mini-batch (`μ_B`, `σ²_B`), and keep a **running average** of them.
- **Evaluation**: use the stored **running** statistics, so the output for one image does not depend on the other images in the batch.

```python run title="BatchNorm from scratch, and the train/eval difference" level=intermediate shared
import numpy as np

class BatchNorm2d:
    def __init__(self, c, momentum=0.1, eps=1e-5):
        self.gamma, self.beta = np.ones(c), np.zeros(c)
        self.running_mean, self.running_var = np.zeros(c), np.ones(c)
        self.momentum, self.eps, self.training = momentum, eps, True
    def __call__(self, x):                                              # x: (N, C, H, W)
        if self.training:
            mean = x.mean(axis=(0, 2, 3)); var = x.var(axis=(0, 2, 3))   # statistics over batch AND spatial positions, per channel
            self.running_mean = (1 - self.momentum) * self.running_mean + self.momentum * mean
            self.running_var = (1 - self.momentum) * self.running_var + self.momentum * x.var(axis=(0, 2, 3), ddof=1)
        else:
            mean, var = self.running_mean, self.running_var
        xh = (x - mean[None, :, None, None]) / np.sqrt(var[None, :, None, None] + self.eps)
        return self.gamma[None, :, None, None] * xh + self.beta[None, :, None, None]

rng = np.random.default_rng(0)
x = rng.normal(5.0, 3.0, (32, 4, 8, 8))                                # activations with mean 5 and std 3
bn = BatchNorm2d(4)
y = bn(x)
print("training mode: output mean per channel", np.round(y.mean(axis=(0, 2, 3)), 3), " std", np.round(y.std(axis=(0, 2, 3)), 3))
for _ in range(60):                                                    # run more batches so the running statistics settle
    bn(rng.normal(5.0, 3.0, (32, 4, 8, 8)))
bn.training = False
single = rng.normal(5.0, 3.0, (1, 4, 8, 8))
print("eval mode, ONE image: output mean", np.round(single.mean(), 2), "->", np.round(bn(single).mean(), 2), "(uses the stored running statistics)")
print("running mean ~ 5, running std ~ 3:", np.round(bn.running_mean, 2), np.round(np.sqrt(bn.running_var), 2))
```

Check against PyTorch (runs on your computer):

```python local check title="Our BatchNorm matches torch.nn.BatchNorm2d"
import numpy as np
import torch
from torch import nn

torch.manual_seed(0)
x = torch.randn(16, 3, 5, 5) * 2 + 1
bn = nn.BatchNorm2d(3).train()
y_torch = bn(x)
xn = x.numpy()
mean, var = xn.mean(axis=(0, 2, 3), keepdims=True), xn.var(axis=(0, 2, 3), keepdims=True)
y_np = (xn - mean) / np.sqrt(var + 1e-5)
print("max difference in training mode:", float(np.abs(y_torch.detach().numpy() - y_np).max()))
assert np.allclose(y_torch.detach().numpy(), y_np, atol=1e-5)

bn.eval()
one = x[:1]
batch_of_one_in_eval = bn(one)
print("eval mode uses running statistics (mean", bn.running_mean.numpy().round(3), ") so a single image works")
```

**BatchNorm pitfalls (frequent interview questions):**

- Forgetting `model.eval()` at test time gives **wrong, batch-dependent** results.
- With **small batches** (1–4, common in detection and segmentation with big images) the batch statistics are noisy and BN hurts. Use **GroupNorm**, SyncBN (statistics across GPUs), or freeze BN layers (detectors fine-tuned from a pretrained model usually freeze them).
- Fine-tuning on a different domain: the stored running statistics belong to the old data. Update them, or freeze them deliberately.
- BN is placed after the convolution and before the activation in ResNets (`conv → BN → ReLU`); the conv bias is then unnecessary.

## LayerNorm, GroupNorm, InstanceNorm

They differ in **which numbers share the statistics**, for a tensor of shape `(N, C, H, W)`:

| Norm | Statistics over | Batch dependent? | Typical use |
|---|---|---|---|
| **BatchNorm** | N, H, W (per channel) | Yes | CNN classifiers with large batches |
| **LayerNorm** | C, H, W (per sample) | No | Transformers (over the feature dimension), ConvNeXt |
| **GroupNorm** | Groups of channels × H, W (per sample) | No | Detection/segmentation, small batches |
| **InstanceNorm** | H, W (per sample and channel) | No | Style transfer, GANs |

```python run title="Which axes does each norm use?" level=intermediate
import numpy as np

x = np.random.default_rng(1).normal(3, 2, (8, 6, 4, 4))                # N=8, C=6, H=W=4

def normalise(a, axes):
    return (a - a.mean(axis=axes, keepdims=True)) / (a.std(axis=axes, keepdims=True) + 1e-5)

bn = normalise(x, (0, 2, 3))                                           # per channel, over the batch
ln = normalise(x, (1, 2, 3))                                           # per sample, over all channels
inn = normalise(x, (2, 3))                                             # per sample and channel
g = x.reshape(8, 2, 3, 4, 4)                                           # GroupNorm with 2 groups of 3 channels
gn = normalise(g, (2, 3, 4)).reshape(8, 6, 4, 4)
one_image = x[:1]
print("BatchNorm of image 0 changes when the batch changes:", not np.allclose(bn[0], normalise(np.concatenate([x[:1], x[4:6]]), (0, 2, 3))[0]))
print("LayerNorm of image 0 does not depend on other images:", np.allclose(ln[0], normalise(one_image, (1, 2, 3))[0]))
print("GroupNorm of image 0 does not depend on other images:", np.allclose(gn[0], normalise(one_image.reshape(1, 2, 3, 4, 4), (2, 3, 4)).reshape(1, 6, 4, 4)[0]))
```

## Activation functions in CNNs

```python run title="Common activations" level=easy
import numpy as np
import matplotlib.pyplot as plt

z = np.linspace(-4, 4, 400)
erf = np.vectorize(__import__("math").erf)
acts = {
    "ReLU": np.maximum(0, z),
    "Leaky ReLU": np.where(z > 0, z, 0.1 * z),
    "GELU": 0.5 * z * (1 + erf(z / np.sqrt(2))),
    "SiLU (Swish)": z / (1 + np.exp(-z)),
    "Sigmoid": 1 / (1 + np.exp(-z)),
}
fig, ax = plt.subplots(figsize=(6.5, 3.8))
for name, v in acts.items():
    ax.plot(z, v, label=name)
ax.set_ylim(-1, 4); ax.legend(); ax.set_title("Activation functions"); ax.grid(alpha=.3)
```

- **ReLU**: the standard in ResNet. Dead units possible.
- **GELU / SiLU**: smooth, non-zero for small negative inputs; used in transformers, EfficientNet and ConvNeXt; slightly better accuracy for a small compute cost.
- **Sigmoid / softmax**: only at outputs.

## Dropout

**Dropout** randomly sets a fraction `p` of activations to zero during training (and scales the rest by `1/(1−p)`), which stops units from relying on each other and acts as regularisation. It is switched **off** at test time. In CNNs it is used on the final layers (for example `p = 0.2–0.5`), less in convolutional layers (spatial neighbours are correlated, so use **DropBlock** or stochastic depth instead). Modern CNNs with BN and heavy augmentation often use little dropout.

:::interview Questions you may get
- "How does BatchNorm work, and how does it differ between training and inference?" It normalises each channel with batch statistics in training and uses running averages at inference, then applies learned scale and shift.
- "Why does BatchNorm fail with small batches and what do you use instead?" Noisy statistics; use GroupNorm/LayerNorm, SyncBN or frozen BN.
- "What is the difference between BN, LN, GN and IN?" Which axes the mean and variance are computed over.
- "What is global average pooling and why use it?" Averages each feature map; removes huge FC layers, allows any input size, fewer parameters.
- "What happens if you forget `model.eval()`?" BN uses batch statistics and dropout stays on: noisy, batch-dependent predictions.
- "Why is bias unnecessary before BatchNorm?" BN subtracts the mean, removing any constant offset.
:::

```quiz
? Which norm layer does NOT depend on the other images in the batch?
- BatchNorm in training mode
+ GroupNorm
- None of them
> LayerNorm, GroupNorm and InstanceNorm use per-sample statistics.

? What does BatchNorm use at inference time?
+ Running averages of the mean and variance collected during training
- The statistics of the test batch
- No statistics
> This is why model.eval() matters.

? Your detector trains with batch size 2 and BatchNorm gets unstable. A good fix?
+ GroupNorm, or freezing the BN layers
- A higher learning rate
- Removing normalisation entirely
> Per-sample statistics avoid noisy batch estimates.

? What is the main job of global average pooling at the end of a classifier?
+ Turn each feature map into one number, independent of image size
- Increase resolution
- Add noise
> It replaces large fully connected layers.
```

:::problem A model scores 95% in validation during training but only 60% when you run it on single images in production. Name two likely causes related to the layers in this lesson. {level=medium tags="batchnorm,eval,debugging"}
Think about train versus eval behaviour.

:::solution Model answer
(1) The production code never called `model.eval()`, so BatchNorm uses the statistics of a batch of one image (very noisy) and dropout stays active. (2) The running statistics of BN are stale or mismatched to the production data (different preprocessing, resolution or brightness), so the normalisation is wrong. Also check the preprocessing (mean/std, RGB order, resize method) and that the same model weights are loaded. Fix: `model.eval()` plus `torch.no_grad()`, recompute BN statistics on representative production data if the domain differs, and unit-test that batch-of-one output equals the same image inside a batch.
:::
:::

:::keypoints
- Pooling shrinks maps and adds shift tolerance; global average pooling replaces big FC layers; strided convs are learned downsampling.
- BatchNorm: per-channel batch statistics in training, running statistics in eval. It speeds and stabilises training but needs reasonable batch sizes.
- LayerNorm, GroupNorm, InstanceNorm use per-sample statistics. Choose GN for small batches.
- ReLU is the default; GELU/SiLU in modern models; dropout only in training. Always `model.eval()` for inference.
:::

:::resources
- [Ioffe and Szegedy: Batch Normalization](https://arxiv.org/abs/1502.03167) — the original paper.
- [Wu and He: Group Normalization](https://arxiv.org/abs/1803.08494) — normalisation for small batches.
- [Ba et al.: Layer Normalization](https://arxiv.org/abs/1607.06450) — LayerNorm.
:::
