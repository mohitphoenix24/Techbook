---
title: ResNet and Skip Connections
level: intermediate
time: 50
summary: Why very deep plain networks get worse, and the simple idea that fixed it: y = x + F(x). The residual block, the bottleneck, why gradients flow through shortcuts, ResNet-18 built from scratch and checked against torchvision, and the descendants (ResNeXt, DenseNet).
---

After VGG, people tried to go deeper. But something strange happened: a **56-layer plain network was worse than a 20-layer one**, even on the **training** data. That is not overfitting (the training error was worse!). It is an **optimisation** problem: very deep plain networks are hard to train. This is the **degradation problem**.

In 2015, He, Zhang, Ren and Sun solved it with **ResNet** and won ImageNet with 152 layers. It is the most influential architecture in vision, and its trick is simple.

## The residual block

Instead of asking a block of layers to learn the desired mapping `H(x)` directly, make it learn the **difference** from the input:

:::formula Residual block
y = x + F(x)
:::

`F` is a small stack (two 3×3 convolutions with batch norm and ReLU). The input `x` is added to the output through a **shortcut (skip) connection**. If the best thing a block can do is nothing, it only has to push `F(x)` to zero, which is easy; without the shortcut it would have to learn the identity function, which is surprisingly hard for a stack of non-linear layers.

:::analogy
Editing a document is easier than writing it from scratch. The skip connection hands each block the previous draft; the block only has to learn the **corrections**. If no correction is needed, it outputs zero and the draft passes through unchanged.
:::

## Why it trains: gradient highways

During backpropagation, `y = x + F(x)` gives `∂y/∂x = 1 + ∂F/∂x`. The "1" means the gradient has a **direct path** back through every shortcut, undamaged by the layers in between. Even in a 100-layer network, the early layers receive a strong learning signal. It is also useful to see a ResNet as an **ensemble of many shallow paths** (one for each choice of skip or pass-through at each block).

We can measure this: stack many conv-BN-ReLU blocks with and without shortcuts, and look at the gradient reaching the **first** layer at initialisation (on your computer):

```python local check title="Gradient at the first layer: plain versus residual stacks"
import torch
from torch import nn

torch.manual_seed(0)

class Block(nn.Module):
    def __init__(self, c, residual):
        super().__init__()
        self.residual = residual
        self.f = nn.Sequential(nn.Conv2d(c, c, 3, padding=1, bias=False), nn.BatchNorm2d(c), nn.ReLU(),
                               nn.Conv2d(c, c, 3, padding=1, bias=False), nn.BatchNorm2d(c))
    def forward(self, x):
        return torch.relu(x + self.f(x)) if self.residual else torch.relu(self.f(x))

def first_layer_grad(depth, residual, c=16):
    net = nn.Sequential(nn.Conv2d(3, c, 3, padding=1), *[Block(c, residual) for _ in range(depth)])
    net(torch.randn(16, 3, 16, 16)).mean().backward()
    return net[0].weight.grad.norm().item()

print("blocks   plain stack      residual stack   (gradient norm at the first layer)")
results = {}
for depth in (5, 20, 50):
    plain, res = first_layer_grad(depth, False), first_layer_grad(depth, True)
    results[depth] = (plain, res)
    print(f"{depth:6d} {plain:14.3g} {res:16.3g}")
assert results[50][0] / results[5][0] > 100 * (results[50][1] / results[5][1])        # the plain gradient changes much more with depth
```

The plain stack's gradient changes by a factor of millions between 5 and 50 blocks (here it **explodes**; in other settings it vanishes); the residual stack's stays within a factor of ten. That predictable gradient is what lets ResNets be trained at 100+ layers.

## The ResNet family

**Basic block** (ResNet-18/34): two 3×3 convolutions. **Bottleneck block** (ResNet-50/101/152): `1×1 (reduce) → 3×3 → 1×1 (expand ×4)`, so the expensive 3×3 works on fewer channels.

When the input and output shapes differ (stride 2 or more channels), the shortcut needs a **projection**: a 1×1 convolution (with stride) to match the shape.

| Model | Blocks per stage | Parameters | GMACs | Top-1 (ImageNet) |
|---|---|---|---|---|
| ResNet-18 | 2, 2, 2, 2 (basic) | 11.7 M | 1.8 | 69.8% |
| ResNet-34 | 3, 4, 6, 3 (basic) | 21.8 M | 3.7 | 73.3% |
| ResNet-50 | 3, 4, 6, 3 (bottleneck) | 25.6 M | 4.1 | 76.1% (80.9% with modern training) |
| ResNet-101 | 3, 4, 23, 3 (bottleneck) | 44.5 M | 7.8 | 77.4% |
| ResNet-152 | 3, 8, 36, 3 (bottleneck) | 60.2 M | 11.5 | 78.3% |

Overall layout: a **7×7 stride-2 convolution + max-pool** stem (224 → 56), then **four stages** with 64, 128, 256, 512 channels (×4 for bottleneck) at resolutions 56, 28, 14, 7, with stride 2 at the start of stages 2–4, then **global average pooling** and a linear layer.

## Build ResNet-18 yourself

```python local check title="ResNet-18 from scratch matches torchvision's parameter count"
import torch
from torch import nn
from torchvision import models

class BasicBlock(nn.Module):
    def __init__(self, cin, cout, stride=1):
        super().__init__()
        self.conv1 = nn.Conv2d(cin, cout, 3, stride, 1, bias=False); self.bn1 = nn.BatchNorm2d(cout)
        self.conv2 = nn.Conv2d(cout, cout, 3, 1, 1, bias=False);    self.bn2 = nn.BatchNorm2d(cout)
        self.shortcut = nn.Identity() if stride == 1 and cin == cout else nn.Sequential(nn.Conv2d(cin, cout, 1, stride, bias=False), nn.BatchNorm2d(cout))
    def forward(self, x):
        out = torch.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return torch.relu(out + self.shortcut(x))                  # the residual connection

class ResNet18(nn.Module):
    def __init__(self, num_classes=1000):
        super().__init__()
        self.stem = nn.Sequential(nn.Conv2d(3, 64, 7, 2, 3, bias=False), nn.BatchNorm2d(64), nn.ReLU(), nn.MaxPool2d(3, 2, 1))
        cfg, layers, cin = [(64, 1), (128, 2), (256, 2), (512, 2)], [], 64
        for cout, stride in cfg:
            layers += [BasicBlock(cin, cout, stride), BasicBlock(cout, cout)]
            cin = cout
        self.stages = nn.Sequential(*layers)
        self.head = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(512, num_classes))
    def forward(self, x):
        return self.head(self.stages(self.stem(x)))

mine, ref = ResNet18(), models.resnet18(weights=None)
count = lambda m: sum(p.numel() for p in m.parameters())
print("my ResNet-18 parameters      :", count(mine))
print("torchvision resnet18 parameters:", count(ref))
assert count(mine) == count(ref)
print("output shape:", tuple(mine(torch.randn(2, 3, 224, 224)).shape))
```

The counts are identical: **11,689,512**. The whole architecture is about 25 lines.

## Details worth knowing

- **Pre-activation ResNet (ResNet-v2)**: put BN and ReLU **before** the convolutions so the shortcut path carries a perfectly clean identity: slightly better and easier to train for very deep nets.
- **Zero-init the last BN `γ`** in each block so every block starts as the identity; helps training.
- **Stochastic depth (DropPath)**: randomly skip whole residual blocks during training; regularises and speeds up very deep nets (used in modern models).
- **ResNet-D / "bag of tricks"** (better stem, downsampling in the shortcut, label smoothing, cosine schedule, mixup...) raise ResNet-50 from 76% to over 80% without changing FLOPs. **ResNet strikes back** (2021) did the same with a modern recipe: **training recipes matter as much as architecture**.
- ResNets are a **great default backbone** for detection, segmentation and as a baseline.

## Descendants

- **ResNeXt**: replaces the 3×3 with a **grouped** convolution (cardinality 32): more accuracy per FLOP.
- **DenseNet**: each layer receives the **concatenation** of all earlier feature maps: strong feature reuse, fewer parameters, but memory-hungry.
- **SE-Net (squeeze and excitation)**: a tiny **channel attention** (global pool → two FC layers → sigmoid) that reweights channels; added to many networks.
- **Highway networks** (the gated precursor), **FractalNet**, and **U-Net skip connections** (which concatenate encoder features into the decoder): the same "carry information around" idea.
- **Transformers** use the same residual pattern around every attention and MLP block: `x = x + Attention(LN(x))`. Skip connections are universal.

:::interview Questions you may get
- "What problem does ResNet solve?" The degradation problem: very deep plain networks have higher training error because they are hard to optimise.
- "Explain the residual block and why it helps." `y = x + F(x)`; the block learns a correction; the shortcut gives gradients a direct path (`∂y/∂x = 1 + ∂F/∂x`).
- "Why a bottleneck block?" `1×1 → 3×3 → 1×1` keeps the costly 3×3 on fewer channels, so deeper networks fit the same budget.
- "What do you do when shapes differ at a shortcut?" Use a 1×1 convolution with the right stride (projection) or pad with zeros.
- "ResNet versus DenseNet?" Sum versus concatenation of earlier features; DenseNet reuses features with fewer parameters but uses more memory.
- "Do transformers use residual connections?" Yes, around both the attention and the MLP in every block.
:::

```quiz
? What is the residual block computing?
+ y = x + F(x)
- y = F(F(x))
- y = x · F(x)
> The block learns the residual F(x) = H(x) − x.

? Why does the skip connection help gradients?
+ ∂y/∂x = 1 + ∂F/∂x: the "1" gives a direct path back
- It removes the activations
- It reduces the number of layers
> Gradients reach early layers without passing through every non-linearity.

? What is the order of layers in a ResNet bottleneck block?
+ 1×1 reduce → 3×3 → 1×1 expand
- 3×3 → 3×3
- 5×5 → 1×1
> The 1×1 layers shrink then restore the number of channels.

? ResNet-50 has about how many parameters?
- 2.5 million
+ 25.6 million
- 256 million
> About 25.6 M parameters and 4.1 GMACs.
```

:::problem Explain, without formulas, why a 56-layer plain network can have higher training error than a 20-layer one, and why adding shortcuts fixes it. {level=medium tags="resnet,optimisation,theory"}
Think about what a deeper network can in principle represent.

:::solution Model answer
A 56-layer network could in principle copy the 20-layer solution and make the extra 36 layers the identity, so its training error should be no worse. That it is worse shows that the optimiser **fails to find** that solution: learning an exact identity through many non-linear layers is hard, and gradients degrade with depth. With shortcuts, the identity is the **default** (the residual branch just has to output zero), so adding layers cannot easily hurt, and the gradient flows through the shortcut paths, so optimisation works at great depth.
:::
:::

:::keypoints
- Plain very deep networks degrade because they are hard to optimise; ResNet's `y = x + F(x)` makes identity the easy default and gives gradients a direct path.
- Basic blocks (two 3×3) for ResNet-18/34, bottleneck blocks (1×1, 3×3, 1×1) for ResNet-50+; projection shortcuts when shapes change.
- ResNet-18 = 11.7 M parameters, ResNet-50 = 25.6 M, 4.1 GMACs. Training recipes matter as much as architecture.
- Residual connections are everywhere: ResNeXt, DenseNet (concatenation), U-Net, and every transformer block.
:::

:::resources
- [He et al.: Deep Residual Learning for Image Recognition](https://arxiv.org/abs/1512.03385) — the ResNet paper.
- [Wightman et al.: ResNet strikes back](https://arxiv.org/abs/2110.00476) — a modern training recipe for ResNet-50.
- [Huang et al.: Densely Connected Convolutional Networks](https://arxiv.org/abs/1608.06993) — DenseNet.
:::
