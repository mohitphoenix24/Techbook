---
title: Monocular Depth Estimation
level: advanced
time: 45
summary: Depth from a single image. Why it is possible (cues learned from data), relative versus metric depth, MiDaS, DPT and Depth Anything, scale-and-shift ambiguity with a runnable alignment demo, metrics (AbsRel, delta accuracy), and when to use stereo, LiDAR or learned depth in robotics.
---

In module 5 you measured depth with **two cameras** (stereo) using geometry. A person can also judge distance with **one eye** closed: from **cues** such as relative size, perspective lines, occlusion, texture gradient, shading and familiar object sizes. A **monocular depth network** learns these cues from millions of images.

## What is the problem, exactly?

Predict a depth value for every pixel from one RGB image. In principle it is **ambiguous**: a small near object and a big far object can look the same. Networks resolve this with learned priors ("a car is about 4 m long"), so there are two kinds of output:

| Type | Meaning | Examples |
|---|---|---|
| **Relative depth** (ordinal, affine-invariant) | Which pixels are nearer or farther; correct only up to an unknown **scale and shift** (usually in inverse depth, i.e. disparity) | MiDaS, DPT, Depth Anything (V1/V2), Marigold (diffusion) |
| **Metric depth** | Real distances in metres | ZoeDepth, Metric3D, UniDepth, Depth Pro, Depth Anything V2 metric models, Depth Anything + a few known distances |

Relative models generalise to any scene (trained on a mix of many datasets with a **scale-and-shift-invariant loss**). Metric models need **camera intrinsics** or learn scene-specific scale and generalise less.

## The scale and shift problem (runnable)

A relative model gives values like 0.111 to 0.277: **not metres**. To use them, align the output to a few known depths (a LiDAR point, an object of known size, a marker on the floor): solve a tiny **least-squares fit** `disparity_true ≈ s · prediction + t`, then convert disparity to depth `Z = 1 / disparity`.

```python run title="Align a relative depth map with a few known distances" level=advanced
import numpy as np
import cv2
import cvlab

H, W = 120, 160
ys, xs = np.mgrid[0:H, 0:W]
depth = 8.0 - 5.0 * ys / H                                              # a floor receding into the distance: far at the top (8 m), near at the bottom (3 m)
depth[(xs - 100) ** 2 + (ys - 70) ** 2 < 28 ** 2] = 2.0 + 0.01 * (xs[(xs - 100) ** 2 + (ys - 70) ** 2 < 28 ** 2] - 100) ** 2 / 28  # a round object, about 2 m
depth[20:50, 15:50] = 4.0                                              # a box 4 m away
rng = np.random.default_rng(0)

# what a relative-depth network gives: disparity (1/depth) known only up to an unknown scale and shift, plus noise
disp_true = 1.0 / depth
a_unknown, b_unknown = 0.37, 0.08
pred_rel = a_unknown * disp_true + b_unknown + rng.normal(0, 0.004, depth.shape)
print(f"raw prediction range: {pred_rel.min():.3f} .. {pred_rel.max():.3f} (not metres, not even the right scale)")

def metrics(pred, gt):
    absrel = float(np.mean(np.abs(pred - gt) / gt)); rmse = float(np.sqrt(np.mean((pred - gt) ** 2)))
    ratio = np.maximum(pred / gt, gt / pred); d1 = float(np.mean(ratio < 1.25))
    return absrel, rmse, d1

# naive: pretend the output is depth directly
print("read as raw 1/x depth  : AbsRel %.3f  RMSE %.3f  delta1 %.3f" % metrics(1.0 / np.clip(pred_rel, 1e-3, None), depth))

# scale-and-shift alignment in disparity space with a few ground-truth depths (here: 30 random pixels, like a LiDAR or a known object)
idx = rng.choice(depth.size, 30, replace=False)
A = np.stack([pred_rel.ravel()[idx], np.ones(30)], 1)
s, t = np.linalg.lstsq(A, disp_true.ravel()[idx], rcond=None)[0]
aligned_disp = s * pred_rel + t
print(f"fitted scale {s:.2f}, shift {t:.2f} (true inverse: {1 / a_unknown:.2f}, {-b_unknown / a_unknown:.2f})")
pred_depth = 1.0 / np.clip(aligned_disp, 1e-3, None)
print("after scale/shift fit  : AbsRel %.3f  RMSE %.3f  delta1 %.3f" % metrics(pred_depth, depth))
print("lesson: relative depth models give the SHAPE of the scene; you need a few known distances (or a metric model) to get metres")

norm = lambda d: ((d - d.min()) / (d.max() - d.min()) * 255).astype(np.uint8)
cvlab.show(cv2.applyColorMap(norm(depth), cv2.COLORMAP_VIRIDIS)[..., ::-1], "True depth (m)", cv2.applyColorMap(norm(-pred_rel), cv2.COLORMAP_VIRIDIS)[..., ::-1], "Raw relative prediction", cv2.applyColorMap(norm(pred_depth), cv2.COLORMAP_VIRIDIS)[..., ::-1], "After scale/shift alignment")

# stereo for comparison: depth from disparity
f, B = 700.0, 0.12                                                      # focal length in pixels and baseline in metres
for d in (80, 40, 20, 10, 5, 2):
    print(f"stereo disparity {d:>2} px -> depth {f * B / d:5.2f} m")
```

Fitting in **disparity** (inverse depth) space is how MiDaS-style models are evaluated, because their outputs are roughly linear in 1/Z.

## Architectures

- **Early CNN encoder–decoders** (Eigen et al., Laina et al.) trained with supervised depth from RGB-D sensors, and **self-supervised** methods (Monodepth, Monodepth2) trained on video with **photometric reprojection loss** (predict depth and camera motion, warp a neighbouring frame, compare) with no depth labels. The geometry here is the same as in module 5.
- **MiDaS** (2019–2022): mixes many datasets, scale-shift-invariant loss; a strong zero-shot generalist.
- **DPT (Dense Prediction Transformer)**: a ViT encoder, with multi-scale features reassembled into a pyramid and fused by a convolutional decoder. Also used for segmentation.
- **Depth Anything V1/V2**: a DINOv2 encoder with a DPT decoder; V1 trained on **62 M unlabelled images** with a teacher's pseudo-labels; **V2** trains the teacher on precise **synthetic** data and distils to students (small to giant), giving sharper, more reliable depth; fine-tuned metric versions exist.
- **Marigold**: repurposes a Stable Diffusion model to produce depth (and normals); sharp but slow.
- **Depth Pro (Apple)**: sharp **metric** depth without camera intrinsics, in about 0.3 s.
- **Video depth** (Video Depth Anything, DepthCrafter): consistent depth over time.

## Metrics

With ground truth depth `d` and prediction `d̂` over valid pixels:

- **AbsRel** = mean of `|d̂ − d| / d` (lower is better).
- **RMSE** (m), **log RMSE**, **SILog** (scale-invariant).
- **δ < 1.25 accuracy**: the share of pixels where `max(d̂/d, d/d̂) < 1.25` (higher is better; also δ < 1.25² and δ < 1.25³).
- Datasets: **NYU Depth v2** (indoor), **KITTI** (driving), **DIODE**, **ETH3D**, **Sintel**, **ScanNet**; for sharp edges: **Booster**, **Middlebury** and boundary metrics.

## Why predicted depth can mislead

- **Scale drift** between frames or images unless anchored; the shift matters at long range.
- **Mirrors, glass, water and shiny surfaces**: the network sees the reflected scene's depth.
- **Textureless walls, sky and thin structures** (wires, fences) are blurred or wrong.
- **Out-of-domain scenes** (underwater, microscopy, aerial) break the priors.
- Relative depth is **not safe for collision avoidance** by itself.

## When to use which depth source

| Source | Strength | Weakness |
|---|---|---|
| **Stereo** (module 5; also learned stereo: RAFT-Stereo, FoundationStereo) | Metric from geometry, dense, cheap | Needs texture, baseline sets the range, calibration |
| **Active IR / structured light / ToF (RealSense, Kinect)** | Dense, works on textureless surfaces | Short range, sunlight and reflective-surface problems |
| **LiDAR** | Accurate, long range | Sparse, expensive, no colour |
| **Monocular learned depth** | One camera, dense, works at any range, great for relative ordering and 3-D effects | Scale ambiguity, domain errors |
| **Fusion** | Learned depth completion: sparse LiDAR/stereo + RGB gives dense metric depth | More engineering |

**Robotics use**: a single RGB camera + Depth Anything for **obstacle ordering**, bin-picking pre-segmentation, **depth-aware** grasp selection (combine with SAM masks: median depth inside the mask), **3-D effects** (portrait blur), AR occlusion, and as the **depth input for SLAM** when no depth sensor exists (then anchor the scale with IMU, wheel odometry or known sizes).

```python
# Typical use with Hugging Face transformers (needs a model download; not run in this course)
from transformers import pipeline
from PIL import Image
pipe = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf")
result = pipe(Image.open("room.jpg"))
relative_depth = result["predicted_depth"]        # a tensor; larger = nearer for most relative models: check the documentation
```

:::interview Questions you may get
- "How can a network estimate depth from one image?" By learning cues: perspective, relative size, occlusion, texture gradient, familiar object sizes, from large datasets; or by self-supervision with view synthesis on video.
- "What is the difference between relative and metric depth?" Relative is correct only up to scale and shift (in inverse depth); metric gives real distances but needs more constraints (intrinsics, scene priors, scale cues).
- "How do you convert a relative depth map to metres?" Fit a scale and shift in disparity against a few known depths (LiDAR, marker, object of known size), then invert.
- "How does self-supervised monocular depth work?" Predict depth and relative pose, warp the neighbouring frame into the current view and minimise the photometric difference, with smoothness and masking terms.
- "When would you prefer stereo or LiDAR over a depth network?" When metric accuracy and safety matter: collision avoidance, grasp planning, measurements.
- "Name the standard depth metrics." AbsRel, RMSE, δ<1.25.
:::

```quiz
? A relative depth network gives output in arbitrary units. What do you need to get metres?
+ A few known distances to fit scale and shift (or a metric model)
- A larger image
- Nothing; it is already in metres
> Solve a small least-squares problem in disparity space.

? What does the δ < 1.25 metric report?
+ The fraction of pixels with max(pred/true, true/pred) below 1.25
- The average depth
- The frame rate
> Higher is better.

? How does self-supervised monocular depth get its training signal?
+ Photometric consistency after warping neighbouring video frames using predicted depth and pose
- Hand-labelled depth maps
- Text captions
> It needs no depth labels.

? Which surface type often fools monocular depth?
+ Mirrors and glass
- Brick walls
- Grass
> It predicts the depth of the reflection.
```

:::problem A warehouse robot has one RGB camera and must stop 0.5 m before pallets. A teammate suggests Depth Anything for this. What is your assessment and design? {level=medium tags="depth,safety,robotics"}
Think about metric accuracy, safety and sensor fusion.

:::solution Model answer
Relative monocular depth alone is not safe for a hard stopping distance: scale ambiguity, errors on shiny wrap and thin pallet edges, and domain shift. Better: use a depth sensor (stereo/ToF/LiDAR) as the safety-rated source; use the neural depth to add detail or to fill holes (depth completion), anchored to the metric sensor. If only RGB is available: use a metric model (Depth Pro/UniDepth/Metric3D with known intrinsics), calibrate scale with floor-plane geometry and the known camera height (a homography/plane fit), check against pallets of known size, validate error versus distance on recorded runs, and keep a conservative margin with a certified bumper/LiDAR for safety.
:::
:::

:::keypoints
- Monocular depth is learned from cues or from video self-supervision; models give relative (scale/shift-ambiguous) or metric depth.
- Fit scale and shift in disparity with a few known depths to get metres; metrics: AbsRel, RMSE, δ<1.25.
- MiDaS, DPT and Depth Anything (V2) are the standard relative models; Depth Pro/ZoeDepth/Metric3D/UniDepth provide metric depth.
- Use stereo, ToF or LiDAR for safety-critical metric needs; use learned depth for dense relative structure, completion and RGB-only systems.
:::

:::resources
- [Ranftl et al.: Towards Robust Monocular Depth Estimation (MiDaS)](https://arxiv.org/abs/1907.01341) — mixing datasets, scale-shift-invariant loss.
- [Ranftl et al.: Vision Transformers for Dense Prediction (DPT)](https://arxiv.org/abs/2103.13413) — ViT for dense tasks.
- [Yang et al.: Depth Anything V2](https://arxiv.org/abs/2406.09414) — synthetic teacher, distilled students.
- [Bochkovskii et al.: Depth Pro: Sharp Monocular Metric Depth in Less Than a Second](https://arxiv.org/abs/2410.02073) — metric depth without intrinsics.
- [Godard et al.: Digging Into Self-Supervised Monocular Depth Estimation (Monodepth2)](https://arxiv.org/abs/1806.01260) — self-supervised depth.
:::
