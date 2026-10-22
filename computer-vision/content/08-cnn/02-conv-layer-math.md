---
title: Convolution Layer Maths — Shapes, Parameters, FLOPs
level: intermediate
time: 45
summary: The arithmetic every vision engineer must do in their head. Output size with stride, padding and dilation, parameter counts, multiply-add cost, 1x1 convolutions, depthwise and grouped convolutions, and a calculator you can play with. Checked against PyTorch.
---

Interviewers love shape questions: "What is the output size of a 3×3 conv with stride 2 on a 56×56 input?" "How many parameters has this layer?" "How many FLOPs?" This lesson gives you the formulas and lets you test them.

## Output size

For one spatial dimension with input size `N`, kernel `k`, padding `P`, stride `S` and dilation `d`:

:::formula Output size
O = \left\lfloor \frac{N + 2P - d\,(k-1) - 1}{S} \right\rfloor + 1
:::

Common cases, with `d = 1`:

| Layer | Formula | Example |
|---|---|---|
| 3×3, stride 1, padding 1 ("same") | `O = N` | 56 → 56 |
| 3×3, stride 2, padding 1 | `O = ⌊(N−1)/2⌋ + 1` | 56 → 28 |
| 7×7, stride 2, padding 3 (ResNet stem) | `O = ⌊(N−1)/2⌋ + 1` | 224 → 112 |
| 2×2 max-pool, stride 2 | `O = ⌊N/2⌋` | 112 → 56 |
| 1×1, stride 1 | `O = N` | any |

Odd sizes round **down**, and a stride-2 layer can lose a row. Padding `P = (k−1)/2` keeps the size for odd `k`.

## Parameters and cost

For a conv layer with `C_in` input channels, `C_out` filters of size `k × k`:

- **Parameters** = `C_in · C_out · k² (+ C_out)` for the biases. Independent of the image size.
- **Multiply-adds (MACs)** = `O_h · O_w · C_in · C_out · k²`. One MAC is two floating-point operations (FLOPs), so `FLOPs ≈ 2 × MACs`. Papers often report MACs and call them "FLOPs"; always check which one they mean.
- **Activation memory** = `O_h · O_w · C_out` numbers (per image), which must be stored for backpropagation. This, not the parameters, usually limits the batch size.

Try the calculator:

```viz algo=cnnshape title="Output size, parameters and cost of one convolution"
```

## Verify with PyTorch

These formulas match what PyTorch computes. The block runs on your computer (PyTorch is not available in the browser).

```python local check title="Check the formulas against PyTorch"
import torch
from torch import nn

def out_size(n, k, s=1, p=0, d=1):
    return (n + 2 * p - d * (k - 1) - 1) // s + 1

cases = [(56, 3, 1, 1, 1), (56, 3, 2, 1, 1), (224, 7, 2, 3, 1), (32, 3, 1, 2, 2), (57, 3, 2, 0, 1)]
for n, k, s, p, d in cases:
    conv = nn.Conv2d(3, 8, k, stride=s, padding=p, dilation=d)
    out = conv(torch.zeros(1, 3, n, n))
    assert out.shape[-1] == out_size(n, k, s, p, d), (n, k, s, p, d)
    print(f"N={n:3d} k={k} stride={s} pad={p} dilation={d}: output {out.shape[-1]:3d}  (formula {out_size(n, k, s, p, d)})")

conv = nn.Conv2d(64, 128, 3, padding=1)
params = sum(p.numel() for p in conv.parameters())
assert params == 64 * 128 * 9 + 128
print("parameters of Conv2d(64, 128, 3):", params, "= 64*128*9 + 128")
macs = 56 * 56 * 64 * 128 * 9
print("multiply-adds on a 56x56 input:", f"{macs / 1e6:.1f} million  (about {2 * macs / 1e6:.0f} MFLOPs)")
```

## 1×1 convolutions

A **1 × 1 convolution** looks at one pixel at a time, but across **all channels**: it is a fully connected layer applied independently at every position. Uses:

- **Change the number of channels** cheaply (squeeze before an expensive 3×3, expand after): the "bottleneck" in ResNet and Inception.
- **Mix information across channels**, with a non-linearity, at little cost.
- Replace fully connected layers (a "fully convolutional" network accepts any image size).

## Grouped and depthwise convolutions

A standard convolution connects **every** input channel to every output channel. Expensive. Two cheaper variants:

- **Grouped convolution** (`groups=g`): split the channels into `g` groups that do not talk to each other. Parameters and cost divide by `g`. Used in ResNeXt and ShuffleNet.
- **Depthwise convolution** (`groups = C_in`): one 3 × 3 filter **per channel**, no mixing across channels. Combined with a **1 × 1 pointwise** convolution to mix channels, it forms a **depthwise-separable convolution** (MobileNet).

```python run title="Cost of standard versus depthwise-separable convolution" level=easy
def standard(cin, cout, k, h, w):
    return dict(params=cin * cout * k * k, macs=h * w * cin * cout * k * k)

def depthwise_separable(cin, cout, k, h, w):
    dw = cin * k * k                                                 # one k x k filter per channel
    pw = cin * cout                                                  # 1 x 1 convolution mixes channels
    return dict(params=dw + pw, macs=h * w * (dw + pw))

cin, cout, k, h, w = 128, 128, 3, 56, 56
s, d = standard(cin, cout, k, h, w), depthwise_separable(cin, cout, k, h, w)
print("standard 3x3 conv            :", f"{s['params']:,} params, {s['macs'] / 1e6:.1f} M MACs")
print("depthwise-separable (MobileNet):", f"{d['params']:,} params, {d['macs'] / 1e6:.1f} M MACs")
print(f"saving: {s['macs'] / d['macs']:.1f}x fewer operations   (theory: 1/C_out + 1/k^2 = {1 / cout + 1 / k ** 2:.3f})")
```

About **8–9 times fewer operations**, at a small cost in accuracy. This is the base of mobile networks. (Caution: depthwise convolutions have **low arithmetic intensity**, so on GPUs they can be slower than the FLOP count suggests, because they are limited by memory traffic.)

## Transposed convolution (upsampling)

Segmentation, generation and detection necks must **increase** the spatial size. A **transposed convolution** (sometimes called "deconvolution") does this with learned weights: output size `O = (N − 1)·S − 2P + d(k − 1) + 1`. It can leave **checkerboard artefacts**; many models instead use **bilinear upsampling followed by a normal convolution**, or **pixel shuffle**.

```python local check title="Transposed convolution doubles the size"
import torch
from torch import nn

up = nn.ConvTranspose2d(16, 8, kernel_size=2, stride=2)          # exactly doubles height and width
print("input (1,16,14,14) ->", tuple(up(torch.zeros(1, 16, 14, 14)).shape))
up2 = nn.Sequential(nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False), nn.Conv2d(16, 8, 3, padding=1))
print("bilinear upsample + conv ->", tuple(up2(torch.zeros(1, 16, 14, 14)).shape))
```

## Tracing a whole network by hand

```python run title="Shape, parameters and cost through a small CNN" level=intermediate
layers = [("conv", 3, 32, 3, 1, 1), ("conv", 32, 64, 3, 2, 1), ("conv", 64, 64, 3, 1, 1), ("conv", 64, 128, 3, 2, 1), ("conv", 128, 256, 3, 2, 1)]
h = w = 64
total_params = total_macs = 0
print("layer        output shape        params      MACs")
for i, (_, cin, cout, k, s, p) in enumerate(layers, 1):
    h = (h + 2 * p - k) // s + 1; w = (w + 2 * p - k) // s + 1
    params = cin * cout * k * k + cout; macs = h * w * cin * cout * k * k
    total_params += params; total_macs += macs
    print(f"conv{i} {k}x{k}/{s}  {cout:3d} x {h:2d} x {w:2d}  {params:10,d} {macs:12,d}")
print(f"total: {total_params:,} parameters, {total_macs / 1e6:.1f} M MACs for a 64x64 input")
```

Notice that early layers (large images, few channels) dominate the **compute**, and late layers (many channels) dominate the **parameters**. That is typical.

:::interview Questions you may get
- "Output size of a 3×3 conv, stride 2, padding 1 on 56×56?" 28.
- "How many parameters has a 3×3 conv from 64 to 128 channels?" 64·128·9 + 128 = 73,856.
- "FLOPs of that layer on a 56×56 map?" MACs = 56·56·64·128·9 ≈ 231 M; FLOPs ≈ 462 M.
- "What does a 1×1 convolution do?" Mixes channels at each pixel; changes channel count cheaply.
- "Depthwise-separable versus standard convolution?" About `1/C_out + 1/k²` of the cost (8–9× cheaper for 3×3), at a small accuracy cost.
- "What limits the batch size?" Activation memory (output sizes stored for backprop), not parameters.
:::

```quiz
? What is the output size of a 3x3 convolution, stride 1, padding 0, on a 32x32 input?
- 32
+ 30
- 28
> (32 − 3)/1 + 1 = 30.

? How many parameters does Conv2d(16, 32, kernel_size=3) have, with bias?
+ 4,640
- 4,608
- 512
> 16·32·9 + 32 = 4,640.

? What is a depthwise convolution?
+ A separate k×k filter for each input channel, with no mixing across channels
- A convolution along the depth of a 3D volume
- A very deep network
> It is usually followed by a 1×1 pointwise convolution.

? One multiply-add (MAC) corresponds to how many FLOPs?
+ 2
- 1
- 4
> A multiplication and an addition.
```

:::problem A ResNet-style stem uses a 7×7 convolution with 64 filters, stride 2, on a 224×224×3 image. Give the output shape, parameters and MACs. {level=easy tags="shapes,flops,resnet"}
Show the arithmetic.

:::solution Model answer
Padding 3: `O = ⌊(224 + 6 − 6 − 1)/2⌋ + 1 = 112`, so the output is 64 × 112 × 112. Parameters: `3·64·49 = 9,408` (+64 biases). MACs: `112·112·3·64·49 = 118,013,952 ≈ 118 M` (about 236 MFLOPs). This single layer is about 3% of ResNet-50's 4.1 GMACs.
:::
:::

:::keypoints
- Output size `⌊(N + 2P − d(k−1) − 1)/S⌋ + 1`. Parameters `C_in·C_out·k²`. MACs `O_h·O_w·C_in·C_out·k²`; FLOPs ≈ 2×MACs.
- 1×1 convolutions mix channels; grouped and depthwise convolutions cut cost (depthwise-separable is about 8–9× cheaper for 3×3).
- Early layers dominate compute; late layers dominate parameters; activation memory limits the batch size.
- Transposed conv or bilinear upsampling + conv increases the size.
:::

:::resources
- [PyTorch: Conv2d documentation](https://docs.pytorch.org/docs/stable/generated/torch.nn.Conv2d.html) — the output-shape formula and all parameters.
- [Dumoulin and Visin: A guide to convolution arithmetic for deep learning](https://arxiv.org/abs/1603.07285) — the definitive reference with animations.
- [Howard et al.: MobileNets](https://arxiv.org/abs/1704.04861) — depthwise-separable convolutions.
:::
