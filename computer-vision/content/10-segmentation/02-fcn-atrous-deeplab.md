---
title: Fully Convolutional Networks and DeepLab (Atrous Convolution)
level: advanced
time: 50
summary: How a classifier became a segmenter. Convert fully connected layers to convolutions (FCN), upsample back to pixel resolution, fuse skip connections, then atrous (dilated) convolution and ASPP in DeepLab that keep resolution while growing the receptive field. Tested shapes in PyTorch.
---

A classification CNN shrinks an image to one answer. A segmenter must give an answer **per pixel**, at the **original resolution**. How do we get from one to the other?

## Fully Convolutional Networks (FCN, 2015)

Long, Shelhamer and Darrell made two simple changes:

1. **Replace the fully connected layers with convolutions** (a 1 × 1 conv with `C` output channels). The network now accepts **any image size** and produces a **spatial map of class scores** instead of a single vector. The map is small (for example 1/32 of the input size).
2. **Upsample** the coarse map back to the input size, with a learned **transposed convolution** or with bilinear interpolation.

The result of the first step alone, the **score map at stride 32**, is blocky and imprecise: all the fine detail was lost by the downsampling. So FCN adds **skip connections**: it combines the coarse prediction (semantic: *what*) with finer feature maps from earlier layers (spatial: *where*): **FCN-32s → FCN-16s → FCN-8s** (the number is the final stride). Each step upsamples the coarse score map, adds the scores from a shallower layer, and upsamples again.

:::flow FCN-8s
Backbone | A VGG/ResNet classifier without its fully connected layers. Strides 8 (pool3), 16 (pool4), 32 (pool5).
Score at stride 32 | A 1×1 convolution on pool5 gives class scores; upsample 2×.
Fuse with stride 16 | Add the 1×1-conv scores of pool4; upsample 2×.
Fuse with stride 8 | Add the 1×1-conv scores of pool3; upsample 8× to the full resolution.
Per-pixel softmax | A cross-entropy loss on every pixel.
:::

```python local check title="A fully convolutional head and upsampling (shapes)"
import torch
from torch import nn
import torch.nn.functional as F
from torchvision.models import resnet18

backbone = nn.Sequential(*list(resnet18(weights=None).children())[:-2])      # ResNet-18 without pooling and the fully connected layer
head = nn.Conv2d(512, 21, kernel_size=1)                                      # 1x1 convolution: class scores per location (21 classes)
for size in (224, 320):
    x = torch.zeros(1, 3, size, size)
    fmap = backbone(x)
    scores = head(fmap)
    up = F.interpolate(scores, size=x.shape[-2:], mode="bilinear", align_corners=False)
    print(f"input {size}x{size}: feature map {tuple(fmap.shape[-2:])} (stride 32) -> scores {tuple(scores.shape)} -> upsampled {tuple(up.shape)}")
    assert up.shape == (1, 21, size, size)
print("the same network handles any input size: it has no fully connected layer with a fixed size")

learned_up = nn.ConvTranspose2d(21, 21, kernel_size=4, stride=2, padding=1)    # a learned 2x upsampling (often initialised as bilinear)
print("transposed conv doubles the size:", tuple(learned_up(torch.zeros(1, 21, 10, 10)).shape))
```

## The resolution dilemma

A classification backbone downsamples by 32 for efficiency and to enlarge the receptive field. For segmentation we want **both**: a **large receptive field** (context: is this a road or a river?) and **high resolution** (exact boundaries). Skip connections recover some detail. **Atrous convolution** attacks the problem directly.

## Atrous (dilated) convolution

A normal 3 × 3 convolution looks at 9 neighbouring pixels. An **atrous** (or **dilated**) 3 × 3 convolution with **rate `r`** looks at 9 pixels **spaced `r` apart**, with holes (French: *à trous*) in between. It has the **same 9 weights**, but a receptive field of `3 + 2(r−1)`: r = 1 gives 3 × 3, r = 2 gives 5 × 5, r = 4 gives 9 × 9, r = 8 gives 17 × 17. We get a bigger view with **no extra parameters and no downsampling**.

```python run title="Dilation grows the receptive field without extra weights" level=easy
import numpy as np

print("rate r   kernel taps   receptive field of one layer")
for r in (1, 2, 4, 8, 16):
    print(f"{r:6d} {9:12d} {3 + 2 * (r - 1):12d} x {3 + 2 * (r - 1)}")

# stacking rates 1, 2, 4, 8 (as in WaveNet or a DeepLab-style context module)
rf, jump = 1, 1
for r in (1, 2, 4, 8):
    rf += (3 - 1) * r * jump
print("receptive field after four 3x3 layers with rates 1, 2, 4, 8:", rf, " (with ordinary convolutions it would be 9)")

# what a dilated kernel looks like
r = 4
k = np.zeros((3 + 2 * (r - 1),) * 2, int)
k[::r, ::r] = 1
print("dilated 3x3 kernel, rate 4 (1 = tap, 0 = hole):\n", k)
```

DeepLab replaces the last strided stages of the backbone by **atrous convolutions** so the output stride is **8 or 16 instead of 32**, with a large receptive field retained.

## ASPP: look at several scales at once

Objects (and the context needed to recognise them) have different sizes. **Atrous Spatial Pyramid Pooling (ASPP)** applies several parallel convolutions with **different rates** (for example 1×1, and 3×3 with rates 6, 12, 18) on the same feature map, plus a **global average pooling** branch (image-level context), concatenates them, and mixes with a 1×1 convolution. It is a context module that sees multiple scales without losing resolution.

```python local check title="ASPP: parallel atrous branches (shapes)"
import torch
from torch import nn
import torch.nn.functional as F

class ASPP(nn.Module):
    def __init__(self, cin, cout=64, rates=(6, 12, 18)):
        super().__init__()
        self.branches = nn.ModuleList([nn.Conv2d(cin, cout, 1)] + [nn.Conv2d(cin, cout, 3, padding=r, dilation=r) for r in rates])
        self.image_pool = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Conv2d(cin, cout, 1))        # image-level context
        self.project = nn.Conv2d(cout * (len(rates) + 2), cout, 1)
    def forward(self, x):
        outs = [b(x) for b in self.branches]
        pooled = F.interpolate(self.image_pool(x), size=x.shape[-2:], mode="bilinear", align_corners=False)
        return self.project(torch.cat(outs + [pooled], dim=1))

aspp = ASPP(256)
x = torch.randn(2, 256, 33, 33)
y = aspp(x)
print("ASPP input", tuple(x.shape), "-> output", tuple(y.shape), "(same spatial size: padding = rate keeps it)")
assert y.shape == (2, 64, 33, 33)
print("parameters:", sum(p.numel() for p in aspp.parameters()))
```

## The DeepLab family

| Model | Contribution |
|---|---|
| **DeepLab v1** (2014) | Atrous convolution; a **dense CRF** post-processing step to sharpen boundaries |
| **DeepLab v2** (2016) | ASPP with parallel rates; ResNet backbone |
| **DeepLab v3** (2017) | Improved ASPP with batch norm and image pooling; no CRF needed |
| **DeepLab v3+** (2018) | Adds a simple **decoder** that fuses low-level features (stride 4) with ASPP output, for sharper boundaries; depthwise-separable convolutions |
| **PSPNet** (2016) | **Pyramid pooling**: pool the feature map at several grid sizes (1, 2, 3, 6), upsample and concatenate |
| **HRNet** (2019) | Keeps a **high-resolution branch throughout**, exchanging information with lower-resolution branches |
| **OCRNet, SegFormer, Mask2Former** | Context via object-region attention and transformers (later lessons) |

DeepLabv3+ with a ResNet or Xception backbone was the standard semantic-segmentation baseline for years. In torchvision: `deeplabv3_resnet50` and `deeplabv3_mobilenet_v3_large`.

## Training details

- Per-pixel **cross-entropy**, ignoring void pixels (`ignore_index=255`).
- **Output stride 16** for training (cheaper), 8 for the best accuracy at test time.
- Training crops (for example 512 × 512), **random scaling 0.5–2.0**, horizontal flips, colour jitter; **poly learning-rate schedule**.
- **Auxiliary loss** on an intermediate layer helps the gradient flow (PSPNet, torchvision models).
- At test time: **multi-scale + flip** inference averages the predictions.
- For huge images (satellite, pathology slides): **sliding window with overlap**, blending the logits.

:::interview Questions you may get
- "How did FCN turn a classifier into a segmentation network?" Replace the fully connected layers with convolutions to get a spatial score map, then upsample (learned transposed convolution or bilinear), adding skip connections for detail.
- "What is atrous/dilated convolution and why use it?" A convolution with spaced taps; it enlarges the receptive field without more parameters or downsampling, keeping resolution.
- "What does ASPP do?" Applies several parallel atrous convolutions with different rates (and global pooling) to capture multi-scale context.
- "What does the DeepLabv3+ decoder add?" It fuses high-resolution low-level features with the ASPP output to sharpen boundaries.
- "Why use output stride 8 or 16 rather than 32?" Higher-resolution features give finer segmentation boundaries, at more compute.
- "Why were CRFs used and why dropped?" They refined boundaries using colour similarity; better decoders and training made them unnecessary.
:::

```quiz
? What does atrous (dilated) convolution with rate 2 do to a 3x3 kernel?
+ Spaces the taps two pixels apart: a 5x5 field of view with 9 weights
- Doubles the number of weights
- Halves the image size
> The receptive field grows without more parameters.

? Why can an FCN accept images of any size?
+ It has no fully connected layer with a fixed input size
- It resizes the image internally
- It uses only one layer
> All layers are convolutions.

? What is the purpose of the skip connections in FCN-8s?
+ Add finer spatial detail from shallow layers to the coarse semantic prediction
- Reduce the number of classes
- Speed up training only
> The deep layers know "what", the shallow layers know "where".

? What does ASPP combine?
+ Parallel atrous convolutions with different rates plus global pooling
- Several backbones
- Several loss functions
> This captures objects and context at several scales.
```

:::problem Your segmentation model finds the right regions but boundaries are blurry and thin objects (poles, wires) vanish. What do you change? {level=medium tags="segmentation,resolution,boundaries"}
Think about stride, decoders and losses.

:::solution Model answer
Output stride 32 loses thin structures. Lower the output stride (atrous convolutions at the last stages, stride 8 or 16), add a decoder that fuses stride-4 features (DeepLabv3+, U-Net-style skips), use a higher input resolution, an HRNet-like backbone that keeps a high-resolution branch, and a boundary-aware loss (extra weight on boundary pixels, or a boundary/Dice term). Make sure the training crops keep thin objects (do not downscale too far) and that evaluation uses boundary metrics. If still not enough, a refinement stage (CascadePSP, guided filter, CRF) can sharpen the mask.
:::
:::

:::keypoints
- FCN: replace FC layers by convolutions (any input size, spatial score map), upsample, fuse skip connections (FCN-32s/16s/8s).
- Atrous (dilated) convolution enlarges the receptive field without parameters or downsampling; ASPP applies several rates in parallel plus image pooling.
- DeepLab v1→v3+: atrous conv, CRF, ASPP, a decoder with low-level features. PSPNet pools at several grids; HRNet keeps a high-resolution path.
- Train with per-pixel cross-entropy, ignore void pixels, use scale augmentation, output stride 8–16, multi-scale inference.
:::

:::resources
- [Long et al.: Fully Convolutional Networks for Semantic Segmentation](https://arxiv.org/abs/1411.4038) — FCN.
- [Chen et al.: Encoder-Decoder with Atrous Separable Convolution (DeepLabv3+)](https://arxiv.org/abs/1802.02611) — the decoder and ASPP.
- [Zhao et al.: Pyramid Scene Parsing Network (PSPNet)](https://arxiv.org/abs/1612.01105) — pyramid pooling.
- [Wang et al.: Deep High-Resolution Representation Learning (HRNet)](https://arxiv.org/abs/1908.07919) — a high-resolution path.
:::
