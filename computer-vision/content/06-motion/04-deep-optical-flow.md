---
title: Deep Optical Flow and Motion Metrics (FlowNet, RAFT)
level: advanced
time: 35
summary: How neural networks changed optical flow. The endpoint-error metric (computed here), the datasets that made learning possible, FlowNet, PWC-Net, and RAFT with its all-pairs correlation volume and recurrent updates, plus how to pick a flow method.
---

Classical flow methods assume brightness constancy and smoothness. They struggle with large motion, blur, thin structures and occlusions. Since 2015, **neural networks** trained on lots of examples have improved the accuracy a lot.

## How flow is measured

The standard metric is the **endpoint error (EPE)**: the average length of the difference between the estimated and true flow vectors, in pixels. Lower is better.

:::formula Endpoint error
\text{EPE} = \frac{1}{N}\sum_{p} \big\| (u_p, v_p) - (u^{gt}_p, v^{gt}_p) \big\|_2
:::

Also used: **Fl-all** (the percentage of pixels with error over 3 pixels and 5% of the motion, on the KITTI benchmark) and EPE split into **small, medium and large** motions.

```python run title="Measure EPE for different methods and motion sizes" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("coffee", gray=True)
h, w = img.shape
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)

print("shift (px)   Farneback EPE   DIS EPE")
for shift in (1, 4, 10, 25):
    M = np.float32([[1, 0, shift], [0, 1, shift * 0.4]])
    img2 = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REFLECT)
    gt = np.dstack([np.full((h, w), shift, np.float32), np.full((h, w), shift * 0.4, np.float32)])
    fb = cv2.calcOpticalFlowFarneback(img, img2, None, 0.5, 4, 21, 3, 7, 1.5, 0)
    ds = dis.calc(img, img2, None)
    inner = (slice(40, -40), slice(40, -40))
    epe = lambda f: float(np.linalg.norm(f - gt, axis=2)[inner].mean())
    print(f"{shift:8d}  {epe(fb):14.3f} {epe(ds):10.3f}")
```

Error grows with the size of the motion for classical methods. Learned methods mainly improve the hard cases: **large motion, blur, occlusion, and thin objects**.

## The datasets: synthetic data made learning possible

Real flow cannot be measured directly, so there are few real labelled sets. The breakthrough was **synthetic** training data with perfect flow labels:

| Dataset | What it is |
|---|---|
| **FlyingChairs**, **FlyingThings3D** | Chairs or random objects flying over backgrounds (rendered or composited): lots of data with exact flow |
| **MPI Sintel** | A rendered animated film with blur and large motion: the hard benchmark (clean and final passes) |
| **KITTI 2012/2015** | Real driving scenes with sparse flow ground truth from LiDAR |
| **Spring**, **TartanAir**, **VKITTI** | Newer synthetic sets |

Pre-train on synthetic data, then **fine-tune** on the target data (the same recipe as transfer learning).

## FlowNet and PWC-Net

- **FlowNet** (2015): the first CNN for flow. Stack two frames, an encoder-decoder (like U-Net) predicts the flow. A variant, **FlowNetC**, first computes a **correlation** layer between the features of the two frames.
- **PWC-Net** (2018): a compact network using the classical ideas inside the network: a **feature pyramid**, **warping** of the second frame's features by the current flow estimate, and a **cost volume** (correlation in a small neighbourhood) at each level. Smaller and more accurate than FlowNet, and widely used for years.

## RAFT: the modern standard

**RAFT** (Recurrent All-Pairs Field Transforms, 2020, ECCV best paper) changed the picture:

:::flow How RAFT works
1. Feature encoder | A CNN turns each frame into a feature map at 1/8 resolution.
2. All-pairs correlation volume | Compute the dot product between every pixel's feature in frame 1 and every pixel's feature in frame 2: a 4-D volume (H×W×H×W). Build a pyramid of it by pooling. This holds every possible match, including large displacements.
3. Context encoder | Another CNN encodes frame 1 to give context for the updates.
4. Recurrent update (GRU) | Start from zero flow. In each iteration, look up the correlation values around the current flow estimate, and a GRU predicts a small correction. Repeat 12–32 times. The same weights are used each iteration.
5. Upsample | A learned upsampling turns the 1/8-resolution flow into full resolution.
:::

Why it works: the **all-pairs volume** can find large motions in one go; the **iterative refinement** (like an optimiser unrolled in the network) corrects the estimate step by step. Later models extend it: **GMFlow** and **FlowFormer** (transformers), **SEA-RAFT** (faster), **MemFlow** (video memory). Flow networks also power **SLAM** (DROID-SLAM uses RAFT-like updates) and **video generation** (motion control).

Run RAFT (on your computer, with PyTorch and torchvision):

```python local check title="RAFT with torchvision (shapes only: random weights, runs on CPU)"
import torch
from torchvision.models.optical_flow import raft_small

model = raft_small(weights=None).eval()                      # pass weights=Raft_Small_Weights.DEFAULT to use pretrained weights (downloads a file)
frame1 = torch.rand(1, 3, 128, 160) * 2 - 1                  # RAFT expects images scaled to [-1, 1], with sizes divisible by 8
frame2 = torch.rand(1, 3, 128, 160) * 2 - 1
with torch.no_grad():
    flows = model(frame1, frame2, num_flow_updates=6)        # a list: one flow estimate per refinement iteration
print("number of refinement steps returned:", len(flows))
print("final flow shape:", tuple(flows[-1].shape), "= (batch, 2, H, W): (u, v) per pixel")
print("parameters:", sum(p.numel() for p in model.parameters()) // 1000, "thousand")
```

## Choosing a flow method

| Need | Choice |
|---|---|
| Track a few corners fast on a CPU | Pyramidal Lucas-Kanade (KLT) |
| Dense flow on a CPU, real time | DIS or Farneback |
| Best accuracy, large motion, GPU available | RAFT or newer (GMFlow, FlowFormer, SEA-RAFT) |
| Mobile or embedded | A small RAFT or PWC variant, quantised |
| Long-term point tracking (many frames) | Point trackers (PIPs, TAP-Vid methods: TAPIR, CoTracker) rather than frame-to-frame flow |
| Flow plus occlusion and uncertainty | Models that output a confidence or occlusion mask |

**Long-term tracking** is the modern successor: **Tracking Any Point** methods (TAPIR, CoTracker) follow any pixel through a whole video, handling occlusion. They are used in robotics, video editing and as a base for video models.

:::interview Questions you may get
- "What is EPE?" Average Euclidean distance between predicted and ground-truth flow vectors.
- "Why was synthetic data important for deep flow?" Real flow ground truth is hard to get; rendered datasets provide millions of exact labels.
- "How does RAFT work?" Features, an all-pairs correlation volume, and a recurrent GRU update that repeatedly looks up correlations around the current estimate.
- "Why is RAFT better with large motion than coarse-to-fine pyramids?" The all-pairs volume holds all possible matches, so large displacements are available immediately, and iterations refine the answer.
- "When would you still choose a classical method?" CPU-only, real-time, tracking sparse corners, or when no GPU or training data is available.
:::

```quiz
? What does a lower EPE mean?
+ The estimated flow is closer to the true flow
- The video is shorter
- The motion is smaller
> EPE is an error measure.

? What is the all-pairs correlation volume in RAFT?
+ The similarity between every pixel of frame 1 and every pixel of frame 2
- A histogram of flow directions
- A list of keypoints
> It lets the network find large displacements.

? Why were rendered datasets like FlyingChairs important?
+ They provide large amounts of perfect flow labels that real data cannot
- They look more realistic
- They are smaller
> Models were pre-trained on them and fine-tuned on real data.

? What is a modern alternative to frame-to-frame flow for following a point through a long video?
+ Tracking-any-point methods such as TAPIR or CoTracker
- Template matching
- Histogram equalisation
> They handle long sequences and occlusions.
```

:::problem A RAFT model trained on Sintel works poorly on night-time drone video. What do you try? {level=medium tags="deep-flow,domain-shift,robustness"}
Think about the training data and the problem differences.

:::solution Model answer
The domain differs: low light, noise, blur, different motion statistics. Options: fine-tune on in-domain data (even with pseudo-labels from a good teacher or self-supervised photometric loss), add augmentations that mimic the target (noise, blur, brightness, gamma, compression), pre-process (denoise, equalise) carefully, use a model trained on more varied data, test intermediate models (a bigger backbone, a different resolution), evaluate with a small labelled sample or with proxy checks (forward-backward consistency, warping error), and consider event or IMU cues for fast motion at night.
:::
:::

:::keypoints
- EPE (average vector error) is the standard flow metric; KITTI also reports Fl-all.
- Synthetic datasets (FlyingChairs/Things, Sintel) enabled FlowNet and PWC-Net; fine-tune on target data.
- RAFT: feature maps → all-pairs correlation volume → recurrent GRU updates → upsample. It handles large motion well.
- Pick by need: KLT, DIS/Farneback on CPU; RAFT and newer on GPU; point trackers for long-term tracking.
:::

:::resources
- [RAFT: Recurrent All-Pairs Field Transforms for Optical Flow](https://arxiv.org/abs/2003.12039) — the model.
- [FlowNet: Learning Optical Flow with Convolutional Networks](https://arxiv.org/abs/1504.06852) — the first CNN for flow.
- [PWC-Net: CNNs for Optical Flow Using Pyramid, Warping, and Cost Volume](https://arxiv.org/abs/1709.02371) — the compact classic.
- [torchvision: optical flow models](https://docs.pytorch.org/vision/main/models/raft.html) — RAFT in PyTorch.
:::
