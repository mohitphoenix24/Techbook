---
title: DeiT, Swin, ConvNeXt and Friends
level: advanced
time: 50
summary: How the plain ViT was made practical. DeiT (training recipe, distillation), Swin (windows and shifting for a pyramid and linear cost), hierarchical and hybrid designs, ConvNeXt (a CNN modernised with transformer tricks), and how to choose a backbone.
---

The plain ViT is simple, but it has three problems: it needs huge data, its cost is quadratic, and it gives one feature map at one scale (bad for detection and segmentation, which want a **pyramid**). The follow-up models fix these one by one.

## DeiT: a better recipe, no extra data

**DeiT** (Data-efficient Image Transformer, 2020) trained a ViT on **ImageNet-1k only**, in 3 days on one machine, by using a **strong training recipe**:

- heavy **augmentation**: RandAugment, Mixup, CutMix, random erasing;
- **regularisation**: stochastic depth, label smoothing, repeated augmentation;
- AdamW with warm-up and cosine decay;
- optionally **distillation**: a second **distillation token** learns from a CNN teacher's predictions (hard labels), so the ViT inherits some CNN knowledge.

Lesson: much of the "ViT needs 300 M images" claim was really "ViT needs a good recipe". The same recipe also improved ResNets (ResNet strikes back).

## Swin: hierarchical, with windows

**Swin Transformer** (2021) rebuilt the transformer to look like a CNN backbone:

1. **Windows**: attention only inside small **non-overlapping windows** (7×7 tokens). Cost becomes **linear** in image size instead of quadratic.
2. **Shifted windows**: in alternate layers the windows are **shifted** by half a window, so tokens near a window border can talk to the neighbouring window. Information spreads across the image over layers.
3. **Patch merging**: after each stage, 2×2 neighbouring tokens are joined into one (and channels doubled), giving a **feature pyramid** with strides 4, 8, 16, 32 just like ResNet. Detection and segmentation heads (FPN, UPerNet, Mask R-CNN) plug in directly.
4. **Relative position bias** added to the attention scores.

```python run title="Why windows make attention cheap" level=advanced
import numpy as np

def global_attention_cost(h, w, d):          # number of multiply-adds for the attention parts of one layer
    n = h * w
    return 2 * n * n * d                      # QK^T and weights@V

def window_attention_cost(h, w, d, win=7):
    n = h * w
    return 2 * n * (win * win) * d            # each token attends only to the win*win tokens of its window

print("tokens on a feature map  |  global attention  |  7x7 windows  |  saving")
for side in (14, 28, 56, 112, 224):
    g, wn = global_attention_cost(side, side, 96), window_attention_cost(side, side, 96)
    print(f"{side:>3} x {side:<3} = {side * side:>6} tokens  | {g / 1e9:>10.2f} G      | {wn / 1e9:>8.3f} G    | {g / wn:>6.0f}x")
print("doubling the side quadruples the windowed cost (linear in tokens) but multiplies global attention by 16")

# shifted windows: which tokens can talk to each other?
side, win = 8, 4
def window_id(shift):
    ids = np.zeros((side, side), int)
    for y in range(side):
        for x in range(side):
            ids[y, x] = ((y + shift) // win) * 10 + (x + shift) // win                   # the window a token falls in
    return ids
a, b = window_id(0), window_id(win // 2)
pair = (3, 3), (3, 4)                         # two neighbouring tokens that sit on a window border
print("tokens (3,3) and (3,4) share a window in layer 1 (no shift)?", a[pair[0]] == a[pair[1]], "| in layer 2 (shifted by 2)?", b[pair[0]] == b[pair[1]])
```

## Other hierarchical and efficient designs

| Model | Idea |
|---|---|
| **PVT** (Pyramid ViT) | Pyramid stages; keys/values are down-sampled to cut cost |
| **MViT** | Pooling attention: down-sample queries/keys/values as you go deeper; strong for video |
| **CvT, CoAtNet** | Put convolutions inside or in front of attention (hybrid) |
| **MaxViT** | Block attention (local) + grid attention (global, dilated) |
| **EfficientViT, MobileViT, FastViT** | Light versions for phones and edge devices |
| **Neighbourhood attention (NAT/DiNAT)** | Each token attends to its sliding-window neighbours |
| **Token merging (ToMe)** | Merge similar tokens during inference to speed up a trained model without retraining |

## ConvNeXt: the CNN fights back

**ConvNeXt** (2022, "A ConvNet for the 2020s") asked: *how much of the transformers' success is the attention and how much is the training recipe and design details?* Starting from a ResNet-50, the authors changed one thing at a time:

1. Transformer **training recipe** (AdamW, long schedule, strong augmentation): already +2.7%.
2. **Macro design**: stage ratios 3:3:9:3 like Swin; a "patchify" stem (4×4 conv, stride 4).
3. **Depth-wise convolution** with a **large 7×7 kernel** (like a window of attention) instead of 3×3.
4. **Inverted bottleneck** (the MLP block of a transformer: expand 4×, then project).
5. **GELU** instead of ReLU, **fewer activations and norms**, **LayerNorm** instead of BatchNorm, separate down-sampling layers.

The result matched or beat Swin at the same size, with the speed and simplicity of a CNN. Lesson: *the recipe matters as much as the building block*. ConvNeXt V2 adds masked-autoencoder pre-training and a GRN layer.

```python local check title="A ConvNeXt block (depth-wise 7x7, inverted bottleneck, LayerNorm)"
import torch
from torch import nn

class ConvNeXtBlock(nn.Module):
    def __init__(self, d):
        super().__init__()
        self.dw = nn.Conv2d(d, d, 7, padding=3, groups=d)           # depth-wise 7x7: spatial mixing, one filter per channel
        self.norm = nn.LayerNorm(d)
        self.pw1, self.act, self.pw2 = nn.Linear(d, 4 * d), nn.GELU(), nn.Linear(4 * d, d)   # the transformer-style MLP (point-wise)
    def forward(self, x):                                            # x: (B, C, H, W)
        h = self.dw(x).permute(0, 2, 3, 1)                           # channels last for LayerNorm and Linear
        h = self.pw2(self.act(self.pw1(self.norm(h))))
        return x + h.permute(0, 3, 1, 2)                             # residual

blk = ConvNeXtBlock(96)
x = torch.randn(2, 96, 56, 56)
print("same shape in and out:", tuple(blk(x).shape))
print("parameters in one block:", sum(p.numel() for p in blk.parameters()), "(a plain 7x7 conv with 96 -> 96 channels would have", 96 * 96 * 49, ")")
import torchvision
print("torchvision has:", [n for n in ("convnext_tiny", "swin_t", "vit_b_16", "deit" ) if hasattr(torchvision.models, n)])
```

## How to choose a backbone

| Situation | Reasonable first choice |
|---|---|
| Small dataset, fast results | ImageNet-pre-trained ConvNeXt-T / EfficientNet / ResNet-50, fine-tuned |
| Needs a feature pyramid (detection/segmentation) | Swin, ConvNeXt, or ResNet + FPN |
| Best accuracy with big pre-training | ViT/EVA/DINOv2/SigLIP backbones |
| Edge device / real time | MobileNetV3, EfficientNet-Lite, EfficientViT, FastViT, small YOLO |
| Limited memory at high resolution | Windowed/hierarchical models or CNNs |

In an interview, say: **"I start with a pre-trained backbone, measure accuracy, latency and memory on the target hardware, and choose the smallest one that meets the requirement; the training recipe and pre-training data matter more than the architecture family."**

:::interview Questions you may get
- "How does Swin reduce the cost of attention?" Attention inside local windows (cost linear in image size) plus shifted windows in alternate layers for cross-window communication.
- "Why a hierarchical backbone for detection?" Multi-scale feature maps (strides 4–32) are needed for FPN-style heads, and small objects need high-resolution features.
- "What is DeiT?" A ViT trained on ImageNet-1k with a strong augmentation/regularisation recipe and a distillation token from a CNN teacher.
- "What did ConvNeXt show?" That with a modern recipe and design (large depth-wise kernels, inverted bottlenecks, LayerNorm, GELU), a pure CNN can match transformers.
- "Transformers or CNNs for a mobile app?" Usually an efficient CNN or hybrid; measure real latency on the device, because attention ops may not be well optimised there.
:::

```quiz
? What is the cost of window attention (fixed window size) in the number of tokens?
+ Linear
- Quadratic
- Cubic
> Each token attends to a fixed number of tokens.

? Why does Swin shift the windows in alternate layers?
+ So tokens at window borders can exchange information with neighbouring windows
- To make the model faster
- To reduce the number of parameters
> Otherwise windows would never communicate.

? What did the DeiT paper mainly show?
+ A strong training recipe lets a ViT learn well from ImageNet-1k alone
- That ViT cannot be trained on ImageNet
- That CNNs are obsolete
> Recipe matters.

? Which of these is NOT part of the ConvNeXt modernisation?
+ Replacing convolutions by self-attention
- Large 7×7 depth-wise kernels
- LayerNorm and GELU
> It stays a pure CNN.
```

:::problem You need a backbone for a Mask R-CNN style detector on 1280×720 factory images, running at 15 FPS on a Jetson. Which families do you shortlist and how do you decide? {level=medium tags="backbone,edge,latency"}
Think about pyramids, resolution and real latency.

:::solution Model answer
Shortlist hierarchical, edge-friendly backbones: ResNet-50 or ConvNeXt-T/EfficientNet-B3 with FPN, maybe Swin-T if TensorRT supports it well; and a YOLO-seg family model as a faster alternative. Plain ViT at 1280×720 would have thousands of tokens and quadratic attention. Export each candidate to TensorRT (FP16/INT8), measure latency and memory at the real resolution on the device, and measure accuracy (mask AP) on a held-out factory set. Choose the smallest model above the accuracy bar that reaches 15 FPS with margin; consider lower resolution or tiling only where small parts require it.
:::
:::

:::keypoints
- DeiT: the training recipe (augmentation, regularisation, distillation token) makes ViT work on ImageNet-1k.
- Swin: windowed attention (linear cost), shifted windows, patch merging for a feature pyramid.
- ConvNeXt: a CNN modernised with transformer-era recipe and design matches transformers.
- Pick backbones by measured accuracy, latency and memory on the target hardware; pre-training data and recipe often matter more than the family.
:::

:::resources
- [Touvron et al.: Training data-efficient image transformers & distillation through attention (DeiT)](https://arxiv.org/abs/2012.12877) — the recipe.
- [Liu et al.: Swin Transformer](https://arxiv.org/abs/2103.14030) — shifted windows.
- [Liu et al.: A ConvNet for the 2020s (ConvNeXt)](https://arxiv.org/abs/2201.03545) — modernising a CNN.
:::
