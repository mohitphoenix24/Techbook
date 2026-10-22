---
title: Exporting Models: ONNX, TensorRT, OpenVINO and TFLite
level: advanced
time: 45
summary: Getting a trained model out of a notebook. Why export, ONNX as the common format, a checked PyTorch to ONNX to ONNX Runtime round trip (with dynamic shapes and batch-norm folding), the main runtimes (TensorRT, OpenVINO, TFLite, Core ML, ONNX Runtime), graph optimisations, and the pre- and post-processing parity traps that cause silent accuracy loss.
---

A model that works in a Jupyter notebook is not a product. A product needs the model to run **fast**, in the **right language and device** (C++ on a camera, a phone, a Jetson), with **fixed, reproducible behaviour**, and **without a Python training stack**. The step between is **export and runtime optimisation**.

## The deployment path

:::flow From training to production
Train | PyTorch (or TensorFlow/JAX) with all the flexibility of Python.
Export | Trace or script the model into a **static graph**: ONNX, TorchScript, SavedModel, ExecuTorch.
Optimise | A runtime fuses layers, folds batch-norm, chooses fast kernels, may lower precision (FP16 / INT8).
Run | An inference engine on the target: ONNX Runtime, TensorRT, OpenVINO, TFLite, Core ML, NCNN, MNN, a vendor NPU SDK.
Verify | Compare outputs, accuracy and latency against the original on real data.
:::

## ONNX: the common exchange format

**ONNX (Open Neural Network Exchange)** describes a model as a **graph of standard operators** (Conv, Relu, Gemm, ...) with weights, versioned by an **opset**. Most frameworks export to it and most runtimes read it, so it is the usual middle step. You export once, then convert to the final engine for each target.

The check below exports a small CNN, **validates** the file, runs it in **ONNX Runtime**, compares with PyTorch on two different input sizes (the **dynamic axes** make the batch and image size flexible), and shows that **batch-norm can be folded into the convolution** (the exporter already did it: notice the graph has no BatchNorm node).

```python local check title="PyTorch to ONNX to ONNX Runtime, and batch-norm folding"
import io
import numpy as np
import torch
from torch import nn
import onnx
import onnxruntime as ort

torch.manual_seed(0)
model = nn.Sequential(
    nn.Conv2d(3, 16, 3, padding=1), nn.BatchNorm2d(16), nn.ReLU(),
    nn.Conv2d(16, 32, 3, stride=2, padding=1), nn.BatchNorm2d(32), nn.ReLU(),
    nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(32, 5)).eval()
for m in model.modules():                                                   # give batch-norm non-trivial statistics so the fold below is a real test
    if isinstance(m, nn.BatchNorm2d):
        m.running_mean.normal_(0, 0.5); m.running_var.uniform_(0.5, 2.0); m.weight.data.uniform_(0.5, 1.5); m.bias.data.normal_(0, 0.2)

x = torch.randn(2, 3, 64, 64)
buf = io.BytesIO()
torch.onnx.export(model, x, buf, input_names=["image"], output_names=["logits"], dynamic_axes={"image": {0: "batch", 2: "h", 3: "w"}}, opset_version=17, dynamo=False)
proto = onnx.load_from_string(buf.getvalue())
onnx.checker.check_model(proto)
print("ONNX graph operators:", [n.op_type for n in proto.graph.node])
print("model size:", round(len(buf.getvalue()) / 1024, 1), "KB")

sess = ort.InferenceSession(buf.getvalue(), providers=["CPUExecutionProvider"])
for shape in [(2, 3, 64, 64), (5, 3, 96, 80)]:                               # the dynamic axes accept other batch sizes and image sizes
    xin = torch.randn(*shape)
    ref = model(xin).detach().numpy()
    out = sess.run(None, {"image": xin.numpy()})[0]
    print(f"input {shape}: PyTorch vs ONNX Runtime max abs difference = {np.abs(ref - out).max():.2e}")

# batch-norm folding: BN(conv(x)) == conv'(x), so the BN layer can disappear at inference time
conv, bn = model[0], model[1]
scale = bn.weight / torch.sqrt(bn.running_var + bn.eps)
fused = nn.Conv2d(3, 16, 3, padding=1)
fused.weight.data = conv.weight * scale[:, None, None, None]
fused.bias.data = (conv.bias - bn.running_mean) * scale + bn.bias
with torch.no_grad():
    print("conv+BN folded into one conv, max abs difference =", float((bn(conv(x)) - fused(x)).abs().max()))
```

**What to keep in mind when exporting**

- Put the model in `eval()` mode (dropout off, batch-norm uses running statistics) and use `torch.no_grad()`.
- **Dynamic axes** for batch (and sometimes height and width) if you need them; static shapes allow faster, more optimised engines (TensorRT likes fixed or ranged profiles).
- **Unsupported or exotic ops** (custom CUDA ops, some attention variants, NMS inside the graph) may fail or be slow. Options: rewrite with standard ops, export the backbone and do NMS in post-processing, or register a **custom operator / plugin**.
- **Opset version** must be supported by the target runtime.
- Keep the **pre-processing** (resize, normalise, colour order) and **post-processing** (softmax, NMS, decode boxes) either **inside the graph** or in **identical code** on both sides. This is the biggest source of silent accuracy loss (see below).
- Always run an **equivalence test** on a set of real inputs: maximum difference of the outputs, plus the final task metric (accuracy, mAP) on a validation set. A small float difference (1e-5) is normal; a different class or box is a bug.

## Which runtime for which hardware?

| Runtime | Runs on | Notes |
|---|---|---|
| **ONNX Runtime** | CPU, CUDA, TensorRT, DirectML, CoreML, OpenVINO and NNAPI "execution providers" | Portable default; Python, C++, C#, Java, JavaScript; good first choice |
| **TensorRT** (NVIDIA) | NVIDIA GPUs, Jetson | Builds an optimised **engine** for the exact GPU: layer fusion, kernel auto-tuning, FP16/INT8, dynamic shapes with profiles. The fastest on NVIDIA; engines are **not portable** between GPU types or TensorRT versions |
| **OpenVINO** (Intel) | Intel CPUs, iGPUs, NPUs | Strong CPU performance, INT8 via NNCF; works with ONNX |
| **TensorFlow Lite / LiteRT** | Phones, microcontrollers, Coral Edge TPU | Delegates (GPU, NNAPI, Hexagon, EdgeTPU); INT8 flow for Edge TPU |
| **Core ML** | Apple devices (CPU, GPU, Neural Engine) | `coremltools` from PyTorch |
| **ExecuTorch / PyTorch Mobile** | Phones and embedded | PyTorch-native edge route |
| **NCNN, MNN, MediaPipe, TVM** | Mobile / generic | Lightweight C++ engines; TVM compiles for many back-ends |
| **Vendor SDKs** (Qualcomm SNPE/QNN, Rockchip RKNN, Hailo, Ambarella, Ascend) | Specific NPUs | Often need ONNX and INT8 calibration data; operator coverage varies |
| **Triton Inference Server / TorchServe / BentoML** | Servers | Model serving: batching, versioning, metrics (next lessons) |

## What a runtime does to your graph

- **Operator fusion**: Conv + BatchNorm + ReLU become one kernel: fewer memory trips (see the roofline in the latency lesson).
- **Constant folding** and removal of no-op layers (dropout, identity).
- **Layout changes** (NCHW to NHWC) to suit the hardware, and **precision lowering** (FP16, INT8).
- **Memory planning**: reuse buffers; decide where tensors live (CPU, GPU, NPU) to avoid copies.
- **Kernel auto-tuning**: tries several implementations for each layer on your device and picks the fastest (TensorRT builder; takes minutes, so cache the engine).

## The parity traps (where accuracy silently drops)

1. **Colour order and range**: training used RGB 0-1 with mean/std normalisation; the C++ app feeds BGR 0-255. The model runs and returns plausible but worse results.
2. **Resize method and alignment**: bilinear vs area vs nearest, `align_corners`, antialiasing: OpenCV, PIL and the GPU resize all differ slightly, and the difference matters for small objects (see module 1).
3. **Letterbox padding** and coordinate mapping back to the original image (detectors).
4. **Channel layout** (HWC vs CHW) and **stride/padding** when decoding camera buffers (NV12/YUV to RGB conversion differences).
5. **Post-processing**: NMS thresholds, box decoding, softmax vs sigmoid, the same class order and label map.
6. **FP16/INT8 side effects** (overflow in attention, outliers); check the metric, not only the loss.
7. **Library versions**: a different OpenCV or decoder version can change JPEG decode slightly; pin them.

A good habit: keep a **golden test set** of 50-200 images with saved reference outputs from the original model; run it in CI against **every** exported artefact and every runtime change.

:::interview Questions you may get
- "How do you deploy a PyTorch model to production?" Export (ONNX/TorchScript), validate numerically, convert/optimise for the target runtime (TensorRT/OpenVINO/TFLite), match pre/post-processing, measure accuracy and latency on the device, package and monitor.
- "What is ONNX and why use it?" A framework-neutral graph format with standard operators; lets you train in one framework and run in many runtimes.
- "What does TensorRT do to speed up a model?" Fuses layers, selects tuned kernels, uses FP16/INT8 and memory planning, and builds an engine specific to the GPU.
- "Your exported model gives worse accuracy than in training. What do you check?" Preprocessing parity (colour order, normalisation, resize), eval mode, post-processing, precision (FP16/INT8), dynamic shape issues, and run a golden test set layer by layer.
- "Why fold batch-norm into the convolution?" At inference the BN is a fixed affine transform, so it can be merged into the conv weights and bias, removing a layer.
:::

```quiz
? Which step should be done before exporting a model for inference?
+ Switch to eval mode (batch-norm uses running statistics, dropout is off)
- Increase the learning rate
- Add more layers
> Otherwise outputs differ from deployment.

? What is the main reason a model exported correctly still loses accuracy in the app?
+ Different pre- or post-processing (colour order, normalisation, resize, NMS)
- ONNX always changes the weights
- The GPU is too fast
> Parity of the whole pipeline matters.

? Is a TensorRT engine portable between different GPU models?
+ No, it is tuned for a specific GPU and TensorRT version
- Yes, always
- Only between laptops
> Rebuild per target.

? What is a golden test set for?
+ Saved inputs and reference outputs to check every exported artefact
- Training the final model
- Counting parameters
> Regression test for deployment.
```

:::problem Your YOLO model gets 0.62 mAP in PyTorch but 0.51 after converting to TensorRT FP16 and running in a C++ app. How do you find the cause? {level=medium tags="deployment,debugging,parity"}
Bisect the pipeline: preprocessing, graph, precision, post-processing.

:::solution Model answer
Bisect step by step. (1) Compare the C++ preprocessed tensor with the Python one for the same image (colour order, resize, letterbox, normalisation). (2) Run the exported ONNX in ONNX Runtime FP32 and compare raw outputs with PyTorch. (3) Run TensorRT in FP32 and then FP16 and compare raw outputs and the mAP. (4) Check post-processing (decode, NMS thresholds, class mapping, box scaling back to the original image). (5) If FP16 is the problem, keep sensitive layers in FP32 or use better calibration/QAT. Fix the first stage where the difference appears and add the golden test set to CI.
:::
:::

:::keypoints
- Export a model as a static graph (ONNX), validate it numerically, then optimise it with the runtime for the target hardware.
- ONNX Runtime is the portable default; TensorRT, OpenVINO, TFLite, Core ML and vendor SDKs give the best speed on their hardware.
- Runtimes fuse layers, fold batch-norm, plan memory and lower precision; engines may be hardware-specific.
- Most deployment accuracy bugs come from pre/post-processing mismatch; keep a golden test set and compare against it at every stage.
:::

:::resources
- [ONNX documentation](https://onnx.ai) — the format and operator set.
- [ONNX Runtime documentation](https://onnxruntime.ai/docs/) — execution providers and optimisation.
- [PyTorch: Exporting a model to ONNX](https://pytorch.org/docs/stable/onnx.html) — the export API.
- [NVIDIA TensorRT documentation](https://docs.nvidia.com/deeplearning/tensorrt/) — building and tuning engines.
- [OpenVINO documentation](https://docs.openvino.ai/) — Intel inference toolkit.
- [LiteRT (TensorFlow Lite) documentation](https://ai.google.dev/edge/litert) — mobile and embedded inference.
:::
