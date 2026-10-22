---
title: Classic CNN Architectures — LeNet, AlexNet, VGG, Inception
level: intermediate
time: 45
summary: The networks that built the field. LeNet, AlexNet (the 2012 breakthrough), VGG's small-kernel stacks, and GoogLeNet/Inception's multi-branch blocks and 1x1 bottlenecks, with parameter counts that you can verify, and the lessons each one taught.
---

Every modern vision model stands on a few classic networks. Knowing their key ideas, in order, lets you answer "how did we get here?" and recognise their parts in today's models.

## Timeline of the big ideas

| Year | Network | Key idea | ImageNet top-5 error |
|---|---|---|---|
| 1998 | **LeNet-5** | Conv + pooling + FC, trained by backprop (digits, cheques) | n/a |
| 2012 | **AlexNet** | Deep CNN on GPUs, ReLU, dropout, augmentation | 15.3% |
| 2014 | **VGG** | Very deep, only 3×3 convolutions | 7.3% |
| 2014 | **GoogLeNet / Inception** | Parallel branches, 1×1 bottlenecks, no big FC layers | 6.7% |
| 2015 | **ResNet** | Skip connections: 100+ layers train | 3.6% |
| 2016+ | DenseNet, ResNeXt, SENet | Feature reuse, groups, channel attention | ~2.3% |
| 2017+ | MobileNet, EfficientNet | Efficiency: depthwise convolutions, compound scaling | similar accuracy, 10× cheaper |
| 2020+ | ViT, Swin, ConvNeXt | Transformers and modernised CNNs | beyond 1.5% (top-5) |

(Humans score about 5% top-5 error on ImageNet, a level crossed in 2015.)

## LeNet-5 (1998)

Yann LeCun's network for reading digits on cheques: `32×32 input → conv 5×5 (6) → pool → conv 5×5 (16) → pool → FC 120 → FC 84 → FC 10`. About **60 thousand parameters**. It established the template: **alternating convolution and pooling, then fully connected layers**. It worked, but with little data and compute it did not scale to photos until 2012.

## AlexNet (2012)

Krizhevsky, Sutskever and Hinton won ImageNet with a network of **5 convolution layers and 3 fully connected layers, 61 million parameters**, trained on two GPUs for a week. The ingredients that made it work (all still used):

- **ReLU** instead of tanh/sigmoid: much faster training.
- **Dropout** (0.5) in the fully connected layers against overfitting.
- **Data augmentation** (random crops, flips, colour changes).
- **GPU training** and large data (1.2 million images).
- Early layers with large kernels (11×11, stride 4) to reduce size fast; most **parameters sat in the three fully connected layers** (about 58 million of the 61 million).

## VGG (2014)

Simonyan and Zisserman asked: what if we use **only 3×3 convolutions** and make the network deeper? VGG-16 stacks blocks of two or three 3×3 convs followed by max-pooling, doubling the channels each block (64 → 128 → 256 → 512 → 512), then three big FC layers. **138 million parameters** (again mostly in the FC layers) and **15.5 billion MACs** per image: heavy, but beautifully simple and regular.

Lessons: two 3×3 convs = the receptive field of a 5×5 with fewer parameters and more non-linearity; **depth matters**. VGG features are still used for **perceptual loss** and style transfer, but VGG is too heavy for production.

## GoogLeNet / Inception (2014)

Szegedy et al. wanted accuracy with **far fewer parameters** (6.6 million, 20× fewer than VGG) and compute. Two ideas:

- **Inception module**: run several filters **in parallel** on the same input (1×1, 3×3, 5×5 convolutions and a pooling path) and **concatenate** the results. The network can choose the right scale for each pattern.
- **1×1 bottlenecks**: before the expensive 3×3 and 5×5 convolutions, a 1×1 convolution **reduces the number of channels**. This cuts the cost by several times.
- **Global average pooling** instead of big FC layers (removing about 100 million parameters).
- Auxiliary classifiers in the middle of the network to help gradients (dropped in later versions thanks to batch norm and ResNet).

Later: **Inception-v2/v3** (factorise 5×5 into two 3×3, or n×1 and 1×n; batch norm; label smoothing), **Inception-ResNet**, **Xception** (depthwise-separable convolutions taken to the extreme).

## Count the parameters yourself

These counts can be checked in PyTorch (on your computer). Notice where the parameters are.

```python local check title="Parameters of classic networks (torchvision, random weights)"
from torch import nn
from torchvision import models

def count(m):
    return sum(p.numel() for p in m.parameters())

nets = {
    "AlexNet": models.alexnet(weights=None),
    "VGG-16": models.vgg16(weights=None),
    "GoogLeNet": models.googlenet(weights=None, aux_logits=False, init_weights=True),
    "ResNet-18": models.resnet18(weights=None),
    "ResNet-50": models.resnet50(weights=None),
}
for name, m in nets.items():
    print(f"{name:10s} {count(m) / 1e6:6.1f} M parameters")

alex = nets["AlexNet"]
fc = sum(p.numel() for p in alex.classifier.parameters()); conv = sum(p.numel() for p in alex.features.parameters())
print(f"AlexNet: {conv / 1e6:.1f} M in the convolutions, {fc / 1e6:.1f} M in the fully connected layers ({fc / count(alex) * 100:.0f}%)")
assert 60e6 < count(alex) < 62e6 and 137e6 < count(nets["VGG-16"]) < 139e6 and 6e6 < count(nets["GoogLeNet"]) < 7e6
```

AlexNet and VGG hold more than 90% of their parameters in the fully connected head; GoogLeNet and ResNet replaced it with global average pooling and a single small linear layer.

## A small LeNet and a small VGG block

```python run title="Shape tracing for LeNet and a VGG block" level=intermediate
def trace(layers, shape):
    c, h, w = shape
    total = 0
    for kind, *a in layers:
        if kind == "conv":
            co, k, s, p = a; params = c * co * k * k + co; h, w, c = (h + 2 * p - k) // s + 1, (w + 2 * p - k) // s + 1, co
            total += params; print(f"  conv {k}x{k} s{s}   -> {c:3d} x {h:3d} x {w:3d}   {params:8,d} params")
        elif kind == "pool":
            h, w = h // 2, w // 2; print(f"  pool 2x2      -> {c:3d} x {h:3d} x {w:3d}")
        elif kind == "fc":
            n_in = c * h * w if h else c; params = n_in * a[0] + a[0]; total += params; c, h, w = a[0], 0, 0; print(f"  fc {n_in} -> {a[0]}   {params:8,d} params")
    print(f"  total {total:,d} parameters")
print("LeNet-5 style:")
trace([("conv", 6, 5, 1, 0), ("pool",), ("conv", 16, 5, 1, 0), ("pool",), ("fc", 120), ("fc", 84), ("fc", 10)], (1, 32, 32))
print("one VGG block (two 3x3 convs + pool), 64 -> 128 channels on 56x56:")
trace([("conv", 128, 3, 1, 1), ("conv", 128, 3, 1, 1), ("pool",)], (64, 56, 56))
```

## What these networks teach (interview answers)

- **Deeper and thinner beats shallow and wide** (VGG).
- **Small kernels**: stack 3×3 instead of one large kernel.
- **Don't put your parameters in the FC head**: use global average pooling.
- **1×1 convolutions** reduce channels and cost (Inception, ResNet bottlenecks).
- **Multi-scale processing** in parallel (Inception) later returned as pyramids (FPN) and multi-scale attention.
- **Regularisation and augmentation** are as important as architecture (AlexNet's dropout and crops).
- **Trainability** is the real limit: very deep plain networks fail to train, which is what ResNet solved (next lesson).

:::interview Questions you may get
- "What made AlexNet succeed in 2012?" ReLU, dropout, data augmentation, GPUs and a large data set (ImageNet).
- "Why did VGG use only 3×3 convolutions?" A stack of 3×3 layers gets the same receptive field as a big kernel with fewer parameters and more non-linearities.
- "What is an Inception module and why 1×1 convolutions?" Parallel filters of different sizes concatenated; 1×1 convs reduce the channel count before expensive convolutions.
- "Where are the parameters in AlexNet and VGG?" In the fully connected layers; modern nets use global average pooling instead.
- "Which of these would you deploy on a phone?" None directly; use MobileNet/EfficientNet-style networks (efficiency lesson).
:::

```quiz
? Roughly how many of AlexNet's 61 million parameters are in the fully connected layers?
+ About 58 million (over 90%)
- About 5 million
- About half
> Global average pooling in later nets removed this waste.

? What does a 1×1 convolution do inside an Inception block?
+ Reduces the number of channels before the expensive 3×3 or 5×5 convolution
- Increases the image resolution
- Applies a pooling operation
> This cuts the compute cost.

? Which network introduced the idea of using only 3×3 convolutions throughout?
- AlexNet
+ VGG
- LeNet
> Stacks of 3×3 layers replaced large kernels.

? What did GoogLeNet replace the large fully connected layers with?
+ Global average pooling
- Max pooling
- Dropout only
> This saved over 100 million parameters.
```

:::problem Two 3×3 conv layers versus one 5×5 conv layer, both mapping C channels to C channels. Compare parameters and say why VGG prefers the stack. {level=easy tags="vgg,receptive-field,parameters"}
Show the numbers.

:::solution Model answer
Both have a 5×5 receptive field. Parameters: two 3×3 layers `2 · 9 · C² = 18C²`; one 5×5 layer `25C²`, so the stack uses 28% fewer. The stack also inserts an extra non-linearity between the layers (more expressive) and costs fewer MACs. Larger kernels are not useless: ConvNeXt and large-kernel models show that 7×7 depthwise kernels work well when combined with depthwise convolutions (the cost is low there).
:::
:::

:::keypoints
- LeNet set the template; AlexNet (ReLU, dropout, augmentation, GPUs) started the deep-learning era; VGG showed the power of depth and 3×3 kernels; Inception used parallel branches and 1×1 bottlenecks.
- AlexNet and VGG carry most parameters in the FC head; global average pooling removes that waste.
- Stacks of small kernels beat large kernels in parameters and non-linearity.
- Very deep plain networks are hard to train; ResNet solved that.
:::

:::resources
- [Krizhevsky et al.: ImageNet Classification with Deep CNNs (AlexNet)](https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html) — the 2012 paper.
- [Simonyan and Zisserman: Very Deep Convolutional Networks (VGG)](https://arxiv.org/abs/1409.1556) — the VGG paper.
- [Szegedy et al.: Going Deeper with Convolutions (GoogLeNet)](https://arxiv.org/abs/1409.4842) — Inception.
- [torchvision models](https://docs.pytorch.org/vision/stable/models.html) — all these networks, ready to use.
:::
