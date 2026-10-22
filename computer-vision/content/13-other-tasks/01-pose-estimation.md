---
title: Human Pose Estimation and Keypoints
level: advanced
time: 45
summary: Finding body joints (and any keypoints) in images. Top-down and bottom-up methods, heatmap regression and decoding, direct regression (RLE, RTMPose), the OKS metric and COCO keypoint AP, 3-D and object pose, and use in robots and sports.
---

**Pose estimation** finds the **keypoints** of a body (nose, shoulders, elbows, wrists, hips, knees, ankles: 17 in COCO) in an image. A **skeleton** joins them. The same machinery also finds hand keypoints (21), face landmarks (68–478), animals, and **object keypoints** (corners of a box, parts of a robot arm), so it is a general tool.

## Two ways to handle many people

| | **Top-down** | **Bottom-up** |
|---|---|---|
| Steps | 1. Detect each person with a box. 2. Crop and run a single-person pose network | 1. Detect **all** keypoints in the image. 2. **Group** them into persons |
| Examples | HRNet, SimpleBaseline, ViTPose, RTMPose, Mask R-CNN keypoints | OpenPose (part affinity fields), HigherHRNet, DEKR |
| Speed with many people | Grows with the number of people | Nearly constant |
| Accuracy | Usually higher (each person gets the full resolution) | Slightly lower, grouping errors in crowds |
| Weakness | Depends on the detector; slow in crowds | Grouping is hard when people overlap |

Single-stage designs (YOLO-pose, PETR, ED-Pose) output a person and all of its keypoints in one pass, a good compromise for real time.

## Heatmaps: the classic recipe

Instead of regressing the `(x, y)` coordinates directly (hard to learn), the network predicts one **heatmap per keypoint**: a small image that has a bright Gaussian bump at the keypoint location. Training target: a Gaussian centred on the true position (σ about 2 cells). Loss: mean squared error between predicted and target heatmaps. At test time, find the peak.

A heatmap is usually **4× smaller** than the image (stride 4), so the way you read the peak matters.

```python run title="Decoding heatmaps and the OKS metric" level=advanced
import numpy as np

rng = np.random.default_rng(0)
H, W, stride, sigma = 256, 192, 4, 2.0                              # image 256x192, heatmap 64x48 (stride 4)
gt = rng.uniform([20, 20], [W - 20, H - 20], (17, 2))               # 17 true keypoints (x, y) in image pixels

def heatmap(pt):
    ys, xs = np.mgrid[0:H // stride, 0:W // stride]
    c = pt / stride                                                  # true position in heatmap units (not an integer!)
    return np.exp(-((xs - c[0]) ** 2 + (ys - c[1]) ** 2) / (2 * sigma ** 2))

hms = np.stack([heatmap(p) for p in gt])
hms += rng.normal(0, 0.03, hms.shape)                                # the network's imperfect prediction

def argmax_decode(h):
    y, x = np.unravel_index(h.argmax(), h.shape)
    return np.array([x, y]) * stride

def quarter_offset(h):                                               # shift a quarter pixel towards the higher neighbour
    y, x = np.unravel_index(h.argmax(), h.shape)
    dx = np.sign(h[y, min(x + 1, h.shape[1] - 1)] - h[y, max(x - 1, 0)]); dy = np.sign(h[min(y + 1, h.shape[0] - 1), x] - h[max(y - 1, 0), x])
    return (np.array([x, y]) + 0.25 * np.array([dx, dy])) * stride

def soft_argmax(h, beta=50):                                         # differentiable expectation over positions
    ys, xs = np.mgrid[0:h.shape[0], 0:h.shape[1]]
    p = np.exp(beta * (h - h.max())); p /= p.sum()
    return np.array([(p * xs).sum(), (p * ys).sum()]) * stride

for name, fn in [("argmax (integer cell)", argmax_decode), ("argmax + quarter offset", quarter_offset), ("soft-argmax", soft_argmax)]:
    pred = np.array([fn(h) for h in hms])
    err = np.linalg.norm(pred - gt, axis=1)
    print(f"{name:<26} mean error {err.mean():.2f} px  (max {err.max():.2f})")
print("plain argmax can only land on multiples of 4 px (so it is off by up to 2 px); sub-cell decoding recovers much of that")

# --- OKS: the pose similarity used by COCO keypoint AP
k = np.array([.026, .025, .025, .035, .035, .079, .079, .072, .072, .062, .062, .107, .107, .087, .087, .089, .089])   # per-keypoint constants (COCO)
def oks(pred, gt, area):
    d2 = ((pred - gt) ** 2).sum(1)
    return float(np.exp(-d2 / (2 * area * (2 * k) ** 2 + 1e-9)).mean())
area = 140 * 90                                                      # person bounding-box area in pixels^2
for e in (0, 2, 5, 10, 20, 40):
    pred = gt + rng.normal(0, e / np.sqrt(2), gt.shape) if e else gt
    print(f"typical keypoint error {e:>2} px -> OKS {oks(pred, gt, area):.3f}")
print("AP is then computed by counting a person as correct when OKS > threshold, averaged over 0.50, 0.55, ..., 0.95")
```

## Decoding details

- **Plain argmax** gives integer cells; add a **quarter-pixel shift** towards the larger neighbour (the usual trick), or use **DARK** (a Taylor expansion around the peak) or **soft-argmax** (a weighted average, differentiable, used for integral regression).
- **Flip testing**: average the heatmaps of the image and its mirror (swap left and right keypoints).
- **Unbiased data processing** matters: flips, scales and the half-pixel offset in coordinate transforms are a classic source of silent error (see the OpenCV pitfalls in module 1).

## Regression-based and fast models

- **Direct regression with a likelihood loss (RLE, Residual Log-likelihood Estimation)** makes coordinate regression as accurate as heatmaps, and cheaper.
- **SimCC / RTMPose** treat each coordinate as a **classification over 1-D bins** (a vector along x and a vector along y), faster and finer than 2-D heatmaps; RTMPose runs at 400+ FPS on a GPU and 70+ FPS on a phone CPU.
- **ViTPose** uses a plain ViT backbone with a light decoder and scales to the best accuracy.
- **BlazePose / MoveNet** are mobile real-time models for fitness apps.

## The metric: OKS and AP

COCO keypoint AP uses **Object Keypoint Similarity (OKS)**, the pose version of IoU:

:::formula OKS
`OKS = mean over visible keypoints of exp( − dᵢ² / (2 s² kᵢ²) )`
`dᵢ` is the distance between predicted and true keypoint, `s²` the person's area, and `kᵢ` a per-keypoint constant (hips and wrists are harder to place than eyes, so they tolerate more error). OKS = 1 is perfect. A prediction counts as correct when OKS exceeds a threshold, and **AP is averaged over 0.50 to 0.95**, exactly like box AP.
:::

Other metrics: **PCK** (percentage of keypoints within a fraction of the head/torso size), **PCKh@0.5** (MPII), and in 3-D **MPJPE** (mean per-joint position error in millimetres).

## Beyond 2-D

- **3-D human pose**: **lifting** (a small network turns 2-D keypoints into 3-D, VideoPose3D), **mesh recovery** that fits a body model (SMPL; HMR, 4DHumans, SMPLer-X), **multi-view triangulation** with calibrated cameras (the geometry from module 5), and depth/LiDAR methods.
- **Hand pose** (MediaPipe Hands) for gestures and teleoperation; **face mesh** for AR.
- **Animal pose** (DeepLabCut, SLEAP, AP-10K) in biology labs.
- **Object pose (6-DoF)**: the position and orientation of an object. Methods: **keypoint + PnP** (predict the 2-D projections of 3-D model keypoints, then solve the Perspective-n-Point problem with `cv2.solvePnPRansac`), **PVNet**, **PoseCNN**, **FoundationPose** (model-free, uses foundation models), **depth-based** ICP refinement. This is the core of robot grasping.
- **Tracking**: link poses over time (OKS-based matching, Kalman filters, ByteTrack on skeleton boxes) and smooth with a One-Euro filter to avoid jitter.

## Robotics and industry use

- **Human–robot safety and collaboration**: keep people's joints out of the robot workspace; recognise handover gestures; ergonomics assessment on assembly lines (REBA/RULA scores from joint angles).
- **Teleoperation and imitation learning**: human hand pose retargeted to a robot hand.
- **Sports, fitness, physiotherapy**: joint angles, rep counting, gait.
- **Calibration check**: pose in a multi-camera cell, verified by reprojecting triangulated keypoints.
- **Common failures**: occlusion, unusual poses, motion blur, loose clothing, top-down detector misses, left/right swaps.

:::interview Questions you may get
- "Top-down vs bottom-up pose estimation?" Top-down detects persons then estimates each pose (accurate, scales with person count); bottom-up detects all keypoints then groups them (constant cost, grouping errors).
- "How does heatmap-based keypoint detection work and what is its weakness?" One Gaussian heatmap per keypoint, decoded by the peak; quantisation from low resolution, large memory; fix with sub-pixel decoding, DARK, SimCC or RLE.
- "What is OKS?" The keypoint similarity score used as the IoU analogue for COCO keypoint AP, normalised by object scale and per-keypoint tolerances.
- "How do you get a 6-D object pose from a single RGB image?" Predict 2-D projections of known 3-D keypoints (or dense correspondences) and solve PnP with RANSAC; refine with ICP if depth exists.
- "How would you reduce jitter in video pose?" Temporal filtering (One-Euro, Kalman), multi-frame models, bounding-box smoothing.
:::

```quiz
? Why do many pose networks predict heatmaps rather than raw coordinates?
+ A spatial map with a Gaussian peak is easier to learn than a direct coordinate regression
- Heatmaps use fewer parameters
- Coordinates cannot be negative
> Peaks are translation-equivariant.

? What does OKS normalise the keypoint error by?
+ The person's scale (area) and a per-keypoint constant
- The image width
- The number of people
> It is scale-aware.

? Which approach has nearly constant cost regardless of how many people are in the image?
+ Bottom-up
- Top-down
- Neither
> Detect all keypoints once, then group.

? Which algorithm turns predicted 2-D projections of known 3-D points into an object pose?
+ Perspective-n-Point (PnP)
- Non-maximum suppression
- Canny
> Often with RANSAC.
```

:::problem You need real-time joint angles of workers on an assembly line (30 FPS, 6 cameras, occlusions by machines). Describe a pipeline and how you would validate it. {level=hard tags="pose,multi-view,validation"}
Think about calibration, models, fusion, and ground truth.

:::solution Model answer
Calibrate the six cameras (intrinsics and extrinsics, module 5). Run a fast top-down model (RTMPose or YOLO-pose) per camera with person tracking; use confidence scores per keypoint. Triangulate 3-D joints from the views where the keypoint is confident (robust DLT with RANSAC / weighted least squares), apply a skeleton prior (fixed bone lengths) and temporal smoothing (One-Euro or Kalman), then compute joint angles. Occlusions are handled by the redundancy of views and by temporal interpolation with flagged confidence. Validate against a small motion-capture or marker-based session: report MPJPE and angle error in degrees per joint, plus failure rate under occlusion; check latency on the target hardware.
:::
:::

:::keypoints
- Pose estimation finds keypoints; top-down (detect, then pose) is more accurate, bottom-up (find all, then group) is constant-cost; single-stage models are fast.
- Heatmaps with sub-pixel decoding, or SimCC/RLE regression, give the coordinates; ViTPose and RTMPose are strong modern choices.
- COCO keypoint AP uses OKS, a scale-aware keypoint similarity; 3-D uses MPJPE.
- Object 6-D pose is usually keypoints + PnP (+ ICP); multi-view triangulation gives 3-D joints; smooth over time.
:::

:::resources
- [Cao et al.: Realtime Multi-Person 2D Pose Estimation using Part Affinity Fields (OpenPose)](https://arxiv.org/abs/1611.08050) — bottom-up.
- [Sun et al.: Deep High-Resolution Representation Learning (HRNet)](https://arxiv.org/abs/1902.09212) — high-resolution maintained features.
- [Xu et al.: ViTPose](https://arxiv.org/abs/2204.12484) — plain ViT for pose.
- [Jiang et al.: RTMPose](https://arxiv.org/abs/2303.07399) — real-time multi-person pose.
- [MediaPipe Pose and Hands documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) — mobile-ready solutions.
:::
