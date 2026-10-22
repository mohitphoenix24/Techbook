---
title: Efficient Architectures — MobileNet, EfficientNet, ConvNeXt
level: intermediate
time: 50
summary: How to get accuracy per FLOP. Depthwise-separable convolutions, MobileNet's inverted residual, squeeze-and-excitation, EfficientNet's compound scaling, RegNet, ConvNeXt (a CNN modernised with transformer ideas), and a table of measured parameters and cost.
---

ResNet-50 needs 4 billion multiply-adds per image. A phone, a drone or a camera on a robot has a small budget. The design of **efficient networks** is a major topic, and interviewers expect you to know the ideas.

## The efficiency tools

- **Depthwise-separable convolution** (MobileNet-V1): a per-channel 3×3 depthwise convolution + a 1×1 pointwise convolution; about 8–9× cheaper than a standard 3×3 convolution.
- **Inverted residual with linear bottleneck** (MobileNet-V2): classic bottlenecks go wide → narrow → wide in channels. Here the **shortcut connects the narrow ends** and the block **expands** the channels inside (×6), applies a depthwise 3×3 in the wide space, then **projects** back down with **no ReLU** (a "linear bottleneck", because ReLU destroys information in a low-dimensional space).
- **Squeeze-and-excitation (SE)**: global average pool → two small FC layers → sigmoid → rescale each channel. A cheap **channel attention**.
- **Hard-swish / SiLU** activations (MobileNet-V3, EfficientNet): smooth, slightly better than ReLU.
- **Neural architecture search (NAS)**: an algorithm searches block designs for the best accuracy under a latency budget (MnasNet, MobileNet-V3, EfficientNet-B0).
- **Channel shuffle** (ShuffleNet): after grouped convolutions, mix the channels so groups can exchange information.

```python run title="The inverted residual block, shape by shape" level=intermediate
def inverted_residual(cin, cout, expand, stride, h, w):
    mid = cin * expand
    steps = [("1x1 expand + ReLU6", cin * mid, h * w * cin * mid),
             ("3x3 depthwise    ", mid * 9, (h // stride) * (w // stride) * mid * 9),
             ("1x1 project (linear)", mid * cout, (h // stride) * (w // stride) * mid * cout)]
    params = sum(s[1] for s in steps); macs = sum(s[2] for s in steps)
    print(f"  in {cin}ch -> {mid}ch (expand x{expand}) -> {cout}ch,  stride {stride}:  {params:>8,} params, {macs / 1e6:7.2f} M MACs"
          + ("   + skip connection" if stride == 1 and cin == cout else ""))
    return params, macs

print("MobileNet-V2 style block on a 28x28 feature map:")
inverted_residual(24, 24, 6, 1, 28, 28)
inverted_residual(24, 32, 6, 2, 28, 28)
std_params, std_macs = 24 * 24 * 9, 28 * 28 * 24 * 24 * 9
print(f"  (a plain 3x3 conv 24->24 would be {std_params:,} params, {std_macs / 1e6:.2f} M MACs)")
```

## EfficientNet: scale everything together

You can make a network bigger in three ways: **deeper** (more layers), **wider** (more channels), or with **higher input resolution**. Scaling only one saturates quickly. **EfficientNet** (Tan and Le, 2019) found a base network (B0, from NAS) and then scaled all three with one coefficient `φ`:

:::formula Compound scaling
\text{depth}\propto\alpha^{\phi},\quad \text{width}\propto\beta^{\phi},\quad \text{resolution}\propto\gamma^{\phi},\qquad \alpha\beta^2\gamma^2\approx 2
:::

with `α = 1.2, β = 1.1, γ = 1.15` found by a small grid search. The constraint `αβ²γ² ≈ 2` makes **FLOPs roughly double** for each step of `φ`. This produced the family **B0 … B7** (and the faster **EfficientNetV2**), which was state of the art in accuracy per FLOP around 2019–2021.

## RegNet and ConvNeXt

- **RegNet** (Radosavovic et al., 2020): instead of searching single networks, study the **design space** and find simple rules (width grows linearly with depth); gives a family with good speed on GPUs.
- **ConvNeXt** (Liu et al., 2022): "a ConvNet for the 2020s". Take a ResNet-50 and apply, step by step, the design choices of Swin transformers: a patchify stem (4×4 stride-4 convolution), **7×7 depthwise convolutions**, an **inverted bottleneck**, **LayerNorm**, **GELU**, fewer activations and norms, separate downsampling layers, plus the modern training recipe. The result matches or beats Swin transformers at the same cost, showing that **much of a transformer's advantage came from the recipe and design, not from attention itself**.

## Measure parameters and cost

FLOPs are only a proxy for speed. Here are the real counts, measured with PyTorch's FLOP counter (on your computer):

```python local check title="Parameters and multiply-adds of common backbones at 224x224"
import torch
from torch.utils.flop_counter import FlopCounterMode
from torchvision import models

rows = []
for name in ["resnet50", "mobilenet_v2", "mobilenet_v3_large", "efficientnet_b0", "regnet_y_400mf", "shufflenet_v2_x1_0", "convnext_tiny"]:
    m = getattr(models, name)(weights=None).eval()
    params = sum(p.numel() for p in m.parameters()) / 1e6
    with FlopCounterMode(display=False) as counter, torch.no_grad():
        m(torch.zeros(1, 3, 224, 224))
    gmacs = counter.get_total_flops() / 2 / 1e9                          # FLOPs = 2 x multiply-adds
    rows.append((name, params, gmacs))
    print(f"{name:20s} {params:6.1f} M params {gmacs:6.2f} GMACs")
d = {r[0]: r for r in rows}
assert d["mobilenet_v2"][2] < d["resnet50"][2] / 10 and d["convnext_tiny"][1] > 25
```

Typical results (ImageNet top-1, with each paper's recipe): ResNet-50 76–81%, MobileNet-V2 72%, MobileNet-V3-Large 75%, EfficientNet-B0 77%, ConvNeXt-Tiny 82%. A 10–20× cheaper network loses only a few points of accuracy.

## FLOPs are not latency

Two networks with the same FLOPs can differ greatly in real speed:

- **Memory access** often dominates: depthwise convolutions and many small layers have low arithmetic intensity (few operations per byte moved) and run poorly on GPUs.
- **Parallelism**: wide, regular layers use hardware better than many narrow branches.
- **Operators**: SE blocks, hard-swish, large kernels, and unusual operations may be slow or unsupported on some accelerators.
- **Hardware**: a phone NPU, a Jetson GPU, a CPU with SIMD and a data-centre GPU favour different designs.

So always **benchmark on the target device**, with the real runtime (TensorRT, Core ML, TFLite, ONNX Runtime), batch size, precision (FP16/INT8) and input size. The deployment module covers this. RepVGG-style **re-parameterisation** (train with extra branches, then fuse them into a single 3×3 convolution for inference) is one example of making a model fast at test time.

## Choosing a backbone

| Situation | Reasonable first choice |
|---|---|
| Server, accuracy first | ConvNeXt, EfficientNetV2, a ViT/Swin (later modules) |
| General default, robust and simple | ResNet-50 (with a modern recipe) |
| Phone / embedded CPU | MobileNet-V3, EfficientNet-Lite, ShuffleNet |
| GPU-latency critical (Jetson) | RegNet, ResNet-18/34, RepVGG, EfficientNet with TensorRT |
| Tiny microcontroller | MCUNet, MobileNet with a small width multiplier and INT8 |
| Dense tasks (detection, segmentation) | ResNet/ConvNeXt/Swin backbone with a feature pyramid |

:::interview Questions you may get
- "Why is a depthwise-separable convolution cheaper?" It splits spatial filtering (per channel) from channel mixing (1×1): cost `k² + C_out` per input channel instead of `k²·C_out`.
- "What is an inverted residual block?" Expand channels with a 1×1, depthwise 3×3 in the wide space, project back with a linear 1×1; the skip connects the narrow ends.
- "What is EfficientNet's compound scaling?" Scale depth, width and resolution together with fixed ratios `α, β, γ` set by a single coefficient `φ`.
- "Why is a network with fewer FLOPs not always faster?" Memory-bound operations, poor parallelism and unsupported or slow operators; measure latency on the target hardware.
- "What did ConvNeXt show?" A plain ResNet modernised with transformer-era design choices and training recipe matches transformers: many gains came from the recipe, not attention.
:::

```quiz
? In MobileNet-V2, why is there no ReLU after the final 1×1 projection?
+ ReLU destroys information in a low-dimensional (narrow) representation
- ReLU is too slow
- The projection has no weights
> This is the "linear bottleneck".

? What does EfficientNet scale together?
+ Depth, width and input resolution
- Only depth
- Only the number of classes
> One coefficient φ with fixed ratios keeps the scaling balanced.

? Why can a low-FLOP model run slowly on a GPU?
+ Memory-bound layers (like depthwise convolutions) and poor parallelism
- FLOPs are always proportional to time
- GPUs cannot run convolutions
> Benchmark on the target device.

? What is squeeze-and-excitation?
+ A small channel-attention module that rescales each channel
- A compression format
- A type of pooling layer
> Global pool, two FC layers and a sigmoid produce per-channel weights.
```

:::problem You must run a classifier on a battery-powered camera with 1 GB of RAM and a small CPU at 10 fps. What is your process for choosing and shrinking a model? {level=medium tags="efficiency,edge,design"}
Think about measurement before design.

:::solution Model answer
Fix the budget first (latency about 100 ms per frame, memory, power). Pick a few candidates (MobileNet-V3-Small/Large, EfficientNet-Lite0, ShuffleNet) with a pretrained start, fine-tune on your data, and **benchmark on the real device** using its runtime (TFLite/ONNX Runtime/NCNN), with the real input size and INT8 quantisation. Reduce the input resolution (the cost scales with pixels) and the width multiplier until the latency fits; compare accuracy and choose the best trade-off. Further: pruning, distillation from a big teacher, quantisation-aware training, and running the model only when a cheap motion trigger fires. Validate accuracy on production-like data after each compression step.
:::
:::

:::keypoints
- Efficiency tools: depthwise-separable convolutions, inverted residual with linear bottleneck, squeeze-and-excitation, hard-swish, NAS, channel shuffle.
- EfficientNet scales depth, width and resolution together (compound scaling); RegNet studies design spaces; ConvNeXt modernises ResNet with transformer-era choices.
- FLOPs are a proxy: memory traffic, parallelism and operator support decide latency, so benchmark on the target device.
- 10–20× cheaper networks usually lose only a few accuracy points.
:::

:::resources
- [Sandler et al.: MobileNetV2: Inverted Residuals and Linear Bottlenecks](https://arxiv.org/abs/1801.04381) — the inverted residual.
- [Tan and Le: EfficientNet](https://arxiv.org/abs/1905.11946) — compound scaling.
- [Liu et al.: A ConvNet for the 2020s (ConvNeXt)](https://arxiv.org/abs/2201.03545) — the modernised ResNet.
- [Hu et al.: Squeeze-and-Excitation Networks](https://arxiv.org/abs/1709.01507) — channel attention.
:::
