---
title: Quantisation, Pruning and Distillation
level: advanced
time: 50
summary: Making models small and fast. How int8 quantisation works (scale, zero-point, per-channel) with a NumPy demo of outliers and bit widths, post-training quantisation versus quantisation-aware training, a checked dynamic-quantisation example, pruning and sparsity, knowledge distillation, efficient architectures, and a decision recipe.
---

A model that is accurate but too big, too slow or too hungry for the target device is not shippable. Four tools shrink it: **quantisation** (fewer bits per number), **pruning** (fewer weights), **distillation** (a small student copies a large teacher) and **efficient architecture design** (do less work to start with). They combine.

## Quantisation: fewer bits per number

Instead of 32-bit floats, store weights (and compute activations) as **8-bit integers**: **4× smaller** memory, less memory traffic, and integer arithmetic that specialised hardware (GPU tensor cores, NPUs, phone DSPs, CPU VNNI instructions) executes much faster.

The mapping uses a **scale** (and optionally a **zero-point**):

:::formula Affine quantisation
`q = clip( round( x / s + z ), −128, 127 )`   and   `x ≈ s · (q − z)`
**Symmetric**: `z = 0`, `s = max|x| / 127` (used for weights). **Asymmetric**: `s = (max − min) / 255`, `z` shifts the range (used for activations such as ReLU outputs that are never negative). The multiply-accumulate runs on integers into a 32-bit accumulator, and one rescale at the end returns to real values.
:::

The key questions are *how fine the scale is* and *what to do about outliers*:

- **Per-tensor** quantisation uses one scale for the whole tensor; **per-channel** uses one scale per output channel. A single outlier weight stretches a per-tensor scale and wastes resolution for everyone else, while per-channel isolates it.
- **Activations** have no fixed range: you measure it on **calibration data** (100-1000 representative images) using min/max, percentiles or entropy (KL) minimisation. Outliers again are the enemy (clipping a tiny share of values often helps).

```python run title="Quantisation by hand: scales, outliers, bit widths and an int8 matrix multiply" level=advanced
import numpy as np

rng = np.random.default_rng(0)

def quant_params(x, bits=8, symmetric=True, axis=None):
    qmax = 2 ** (bits - 1) - 1
    if symmetric:
        amax = np.abs(x).max(axis=axis, keepdims=axis is not None)
        scale = np.maximum(amax, 1e-12) / qmax; zero = np.zeros_like(scale)
    else:
        lo, hi = x.min(axis=axis, keepdims=axis is not None), x.max(axis=axis, keepdims=axis is not None)
        scale = np.maximum(hi - lo, 1e-12) / (2 ** bits - 1); zero = np.round(-lo / scale) - 2 ** (bits - 1)
    return scale, zero

def quantise(x, scale, zero, bits=8):
    return np.clip(np.round(x / scale + zero), -2 ** (bits - 1), 2 ** (bits - 1) - 1).astype(np.int32)
def dequantise(q, scale, zero): return (q - zero) * scale

W = rng.normal(0, 0.1, (64, 128))                                         # a weight matrix: 64 output channels
print("Weights with a normal range:")
for name, kw in [("per-tensor symmetric int8", {}), ("per-channel symmetric int8", {"axis": 1})]:
    s, z = quant_params(W, **kw); err = np.abs(dequantise(quantise(W, s, z), s, z) - W).max()
    print(f"  {name:<28} max error {err:.5f}")
W2 = W.copy(); W2[0, 0] = 3.0                                             # a single outlier weight in one channel
print("Same weights with ONE outlier (3.0 in a matrix where most values are about 0.1):")
for name, kw in [("per-tensor symmetric int8", {}), ("per-channel symmetric int8", {"axis": 1})]:
    s, z = quant_params(W2, **kw); err = np.abs(dequantise(quantise(W2, s, z), s, z) - W2)[1:].max()
    print(f"  {name:<28} max error on the OTHER rows {err:.5f}")
print("per-tensor: one outlier stretches the scale for everyone; per-channel keeps each output channel's own scale")

# an int8 matrix multiply: integer products accumulated in int32, rescaled at the end
x = rng.normal(0, 1, (4, 128))
sw, zw = quant_params(W, axis=1); sx, zx = quant_params(x, symmetric=False)
qW, qx = quantise(W, sw, zw), quantise(x, sx, zx)
acc = (qx - zx) @ (qW - zw).T                                              # int32 accumulation (this is what an int8 GPU/NPU kernel does)
approx = acc * sx * sw.T                                                   # rescale the integers back to real values
exact = x @ W.T
print(f"int8 matmul vs float32 matmul: relative error {np.linalg.norm(approx - exact) / np.linalg.norm(exact):.4f}")
print("storage: float32 weights", W.astype(np.float32).nbytes // 1024, "KB -> int8", qW.astype(np.int8).nbytes // 1024, "KB (4x smaller) plus a few scales")
for bits in (8, 6, 4, 3, 2):
    s, z = quant_params(W, bits=bits, axis=1)
    print(f"  {bits} bits: weight error {np.abs(dequantise(quantise(W, s, z, bits), s, z) - W).mean():.5f}")
```

## Post-training quantisation versus quantisation-aware training

| | **PTQ (post-training)** | **QAT (quantisation-aware training)** |
|---|---|---|
| Needs | The trained model + a small **calibration set** (no labels) | Retraining/fine-tuning (labels, a few epochs) |
| Effort | Minutes | Hours-days |
| Accuracy | Usually within about 1% for CNNs at INT8; can fall more for detectors, small models and transformers with outliers | Best: the network learns to tolerate rounding; used for INT4 and sensitive models |
| How | Insert quantise/dequantise ops, calibrate scales | **Fake-quantise** in the forward pass (round and clip, with the **straight-through estimator** for gradients) |
| Tools | TensorRT calibrator, ONNX Runtime quantisation, OpenVINO NNCF/POT, PyTorch `torch.ao.quantization`, TFLite converter | The same libraries' QAT modes |

**Practical recipe**: start with **FP16** (almost free, usually no loss). Then try **PTQ INT8** with per-channel weights and a good calibration set. If accuracy drops more than your budget, find the **sensitive layers** (first and last layers, attention softmax, depthwise convs, detection heads) and keep them in higher precision (**mixed precision**), or move to **QAT**.

```python local check title="Dynamic int8 quantisation of a trained model: size, accuracy and agreement"
import io, time
import numpy as np
import torch
from torch import nn
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split

torch.manual_seed(0)
X, y = load_digits(return_X_y=True)
Xtr, Xte, ytr, yte = train_test_split(torch.tensor(X / 16.0, dtype=torch.float32), torch.tensor(y), test_size=0.3, random_state=0)
model = nn.Sequential(nn.Linear(64, 256), nn.ReLU(), nn.Linear(256, 256), nn.ReLU(), nn.Linear(256, 10))
opt = torch.optim.Adam(model.parameters(), lr=2e-3)
for _ in range(300):
    loss = nn.functional.cross_entropy(model(Xtr), ytr); opt.zero_grad(); loss.backward(); opt.step()
model.eval()
qmodel = torch.ao.quantization.quantize_dynamic(model, {nn.Linear}, dtype=torch.qint8)     # weights stored as int8, activations quantised on the fly

def size_kb(m):
    b = io.BytesIO(); torch.save(m.state_dict(), b); return len(b.getvalue()) / 1024
acc = lambda m: float((m(Xte).argmax(1) == yte).float().mean())
print(f"float32 model: {size_kb(model):6.1f} KB, test accuracy {acc(model):.4f}")
print(f"int8 dynamic : {size_kb(qmodel):6.1f} KB, test accuracy {acc(qmodel):.4f}")
agree = float((model(Xte).argmax(1) == qmodel(Xte).argmax(1)).float().mean())
print(f"the two models give the same answer on {agree:.1%} of test images")
```

Also useful: **weight-only quantisation** (INT4/INT8 weights, FP16 activations) is standard for big transformers and VLMs (GPTQ, AWQ, bitsandbytes, SmoothQuant moves outliers from activations to weights); **FP8** on newer GPUs; **binary/ternary** networks for extreme edge.

## Pruning: removing weights

- **Unstructured pruning** zeroes individual small weights (magnitude pruning, 50-90% sparsity). It shrinks the **file** when compressed, but ordinary hardware does **not** run sparse matrices faster unless the sparsity is structured (NVIDIA's **2:4 sparsity** pattern on Ampere GPUs gives about 1.5-2× speed).
- **Structured pruning** removes whole **channels, filters, heads or layers** (L1-norm of filters, network slimming, Torch-Pruning, SparseGPT): the model really becomes smaller and faster, but accuracy needs fine-tuning to recover.
- **The lottery ticket idea**: dense networks contain small sub-networks that train as well as the full one; in practice, prune gradually during fine-tuning, not once.
- Pruning, then quantisation, then distillation is a common order for deployment.

## Knowledge distillation

Train a small **student** to copy a large **teacher**. The student matches the teacher's **soft probabilities** (the "dark knowledge": the teacher says a cat is 90% cat, 8% dog, 2% fox, which tells the student which classes are similar) with a temperature `T`:

`L = α · CE(y, student) + (1 − α) · T² · KL( softmax(teacher/T) ‖ softmax(student/T) )`

Variants: **feature distillation** (match intermediate feature maps, important for detection and segmentation), **response distillation of boxes/masks**, **self-distillation**, **data-free** or **unlabelled data** distillation (the teacher labels millions of your unlabelled images: extremely powerful when labels are scarce), and **foundation-model to small-model** distillation (SAM to MobileSAM, DINOv2 to ViT-S, GPT-4-class VLMs to small VLMs). The student can reach 95-99% of the teacher's accuracy at a fraction of the cost.

## Efficient architectures (do less work)

| Idea | Examples |
|---|---|
| Depthwise-separable convolutions, inverted bottlenecks | MobileNetV2/V3, EfficientNet |
| Re-parameterisation (train with branches, deploy as one conv) | RepVGG, RepViT, FastViT, YOLOv6/v7 |
| Hardware-aware search and scaling | MnasNet, EfficientNet compound scaling, EfficientNet-Lite |
| Light transformers and hybrids | MobileViT, EfficientViT, LeViT, Swin-tiny, DeiT-tiny |
| Small, fast detectors | YOLO-nano/small models, NanoDet, RT-DETR, RTMDet-tiny |
| Token or resolution reduction | Token merging (ToMe), lower input resolution, tiling only where needed, early exit |

Remember the lesson of the latency chapter: **FLOPs are not latency**. Depthwise layers and attention are often **memory-bound**, so **measure on the device**.

## A decision recipe

:::flow Making a model fit
Baseline | Measure accuracy, latency (p50/p95), memory and power of the FP32 model **on the target device**.
Cheap wins | Lower the input resolution if objects allow it, fuse layers, batch size 1, FP16, a runtime for the hardware (TensorRT/OpenVINO).
INT8 PTQ | Per-channel weights, 200-500 calibration images from production, compare the metric and the latency.
Fix the damage | Keep sensitive layers in FP16, improve calibration, use QAT, or distil into a smaller or better-suited architecture.
Shrink structure | Structured pruning or a smaller backbone, with fine-tuning and distillation from the original.
Verify | Test on the golden set and on slices (small objects, dark images); watch tails (p99 latency, worst-case accuracy).
:::

:::interview Questions you may get
- "Explain INT8 quantisation." Map floats to 8-bit integers with a scale (and zero-point); integer matmuls accumulate in int32; dequantise at the end; weights per-channel, activations calibrated.
- "PTQ versus QAT?" PTQ needs only calibration data and is quick; QAT trains with simulated rounding and recovers accuracy for sensitive models.
- "Why might quantisation hurt a detector more than a classifier?" Box regression needs fine precision, small objects depend on fine activations, outliers in heads/FPN; mixed precision or QAT fix it.
- "Does pruning always speed up inference?" No. Unstructured sparsity needs sparse kernels; structured pruning or hardware patterns (2:4) give real speed-ups.
- "What is knowledge distillation and when would you use it?" Train a small student on a teacher's soft outputs/features, for deployment or when labels are scarce but unlabelled data is plentiful.
- "Why can a model with fewer FLOPs be slower?" Memory-bound operations, poor hardware utilisation, unsupported kernels and overheads; measure on the target.
:::

```quiz
? What does per-channel quantisation protect against?
+ One outlier weight stretching the scale used for all channels
- Overfitting
- Slow data loading
> Each output channel has its own scale.

? What is calibration data used for in PTQ?
+ Measuring activation ranges to choose scales
- Updating the weights by gradient descent
- Augmenting the training set
> A few hundred representative images.

? Which pruning type usually gives real speed-ups on standard hardware?
+ Structured pruning (whole channels or filters)
- Random unstructured pruning
- Pruning only biases
> Smaller dense layers.

? In distillation with temperature T, what does a higher T do?
+ Softens the teacher's probabilities so more information about class similarity is visible
- Makes the student larger
- Removes the need for a student
> Dark knowledge.
```

:::problem A customer's INT8 PTQ model lost 6 mAP points on a night-time parking-lot detector. Calibration used 100 daytime images. What do you do? {level=medium tags="quantisation,calibration,detection"}
Think about what calibration represents.

:::solution Model answer
The calibration set does not represent production: night images have different activation ranges, so scales are wrong. Re-calibrate with 300-1000 images that match deployment (day and night, different cameras, small objects) and try percentile or entropy calibration. Check per-layer sensitivity (compare layer outputs FP32 vs INT8) and keep the worst layers (detection head, first conv) in FP16. If still short, use QAT with night-time data or distillation from the FP32 model. Validate on night slices separately and monitor in production.
:::
:::

:::keypoints
- Quantisation stores weights/activations as int8 (scale, zero-point), giving about 4× smaller models and faster integer maths; per-channel weights and good calibration data are crucial.
- Try FP16 first, then PTQ INT8; use mixed precision or QAT for sensitive layers or models.
- Structured pruning really shrinks models; unstructured sparsity needs special hardware; distillation transfers a teacher's soft outputs or features to a small student.
- Fewer FLOPs does not guarantee lower latency: measure on the target device and inspect the tails.
:::

:::resources
- [Jacob et al.: Quantization and Training of Neural Networks for Efficient Integer-Arithmetic-Only Inference](https://arxiv.org/abs/1712.05877) — the standard int8 scheme.
- [Han et al.: Deep Compression](https://arxiv.org/abs/1510.00149) — pruning, quantisation and coding together.
- [Hinton et al.: Distilling the Knowledge in a Neural Network](https://arxiv.org/abs/1503.02531) — the distillation paper.
- [Frankle and Carbin: The Lottery Ticket Hypothesis](https://arxiv.org/abs/1803.03635) — sparse trainable sub-networks.
- [Sandler et al.: MobileNetV2](https://arxiv.org/abs/1801.04381) — inverted residuals for mobile.
- [PyTorch quantisation documentation](https://pytorch.org/docs/stable/quantization.html) — PTQ and QAT in PyTorch.
:::
