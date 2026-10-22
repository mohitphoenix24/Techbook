---
title: 3-D Object Detection and Bird's-Eye-View Perception
level: advanced
time: 55
summary: Detecting objects as 3-D boxes for driving and robots. The 3-D box and its IoU, LiDAR detectors (VoxelNet, PointPillars, CenterPoint), camera-only 3-D (monocular, lift-splat, BEVFormer), fusion (BEVFusion), tracking in 3-D, benchmarks (KITTI, nuScenes, Waymo), and two runnable examples: a BEV detector from LiDAR and the lift-splat idea.
---

A 2-D box tells you where an object is **in the picture**. A robot or a car needs **where it is in the world**: a **3-D box** with position, size and heading, so it can plan around it. That is **3-D object detection**.

## The 3-D box

A 3-D box has **7 numbers**: centre `(x, y, z)`, size `(length, width, height)` and **yaw** (rotation about the up axis). Cars and pedestrians are assumed to stand on the ground, so roll and pitch are ignored. (Add velocity for tracking: 9 numbers in nuScenes.)

**3-D IoU** is the volume overlap divided by the volume union. Because boxes are rotated, even the **bird's-eye-view (BEV) IoU** needs a polygon intersection. KITTI counts a car correct at 3-D IoU ≥ 0.7, a pedestrian or cyclist at ≥ 0.5; nuScenes uses **centre distance** thresholds (0.5, 1, 2, 4 m) instead, which are more forgiving for noisy depth.

## Bird's-eye view: why autonomous driving loves it

Most objects of interest live on a flat ground plane, and the plane seen **from above** has great properties: objects keep their **true size and shape** (no perspective shrinking), they **don't overlap** each other as they do in a camera image, and distances and headings are directly visible. So many systems convert everything (LiDAR, cameras, radar) to a **BEV feature map**, and detect and predict there.

### A small BEV detector (runnable)

LiDAR points are put into a top-down grid (like the pillars of PointPillars), the tallest point in each cell gives a height map, ground is removed, and connected blobs become oriented boxes. We then measure BEV IoU against the truth with `cv2.intersectConvexConvex`.

```python run title="LiDAR to BEV: ground removal, blobs, oriented boxes, BEV IoU" level=advanced
import numpy as np
import cv2
import cvlab

rng = np.random.default_rng(0)
objects = [  # (x, y) centre in metres, (length, width, height), yaw in degrees
    dict(c=(14.0, 3.0), size=(4.2, 1.8, 1.5), yaw=10, name="car"),
    dict(c=(22.0, -4.0), size=(4.5, 1.9, 1.6), yaw=-35, name="car"),
    dict(c=(9.0, -6.0), size=(0.7, 0.7, 1.7), yaw=0, name="person"),
]
def box_surface_points(o, n=500):
    size = np.array(o["size"])
    p = rng.uniform(-0.5, 0.5, (n, 3)) * size
    axis = rng.integers(0, 3, n)                                       # push each point onto one face of the box: LiDAR only sees surfaces
    p[np.arange(n), axis] = rng.choice([-0.5, 0.5], n) * size[axis]
    p[:, 2] += size[2] / 2                                             # the box stands on the ground
    t = np.deg2rad(o["yaw"]); R = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
    p[:, :2] = p[:, :2] @ R.T + o["c"]
    return p
ground = np.column_stack([rng.uniform(0, 40, 6000), rng.uniform(-20, 20, 6000), rng.normal(0, 0.03, 6000)])
cloud = np.vstack([ground] + [box_surface_points(o) for o in objects])
print("LiDAR-like cloud:", cloud.shape)

# --- bird's-eye-view grid: 0.2 m cells, keep the maximum height in each cell
res, x0, y0, nx, ny = 0.2, 0.0, -20.0, 200, 200
ix = ((cloud[:, 0] - x0) / res).astype(int); iy = ((cloud[:, 1] - y0) / res).astype(int)
ok = (ix >= 0) & (ix < nx) & (iy >= 0) & (iy < ny)
height = np.full((ny, nx), -1.0)
np.maximum.at(height, (iy[ok], ix[ok]), cloud[ok, 2])
occupied = (height > 0.3).astype(np.uint8)                                                  # above the ground: an obstacle
occupied = cv2.morphologyEx(occupied, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))           # patch the holes between laser returns
n, lab, stats, _ = cv2.connectedComponentsWithStats(occupied)
dets = []
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] < 12: continue
    ys_, xs_ = np.where(lab == i)
    pts = np.column_stack([xs_, ys_]).astype(np.float32)
    (cx, cy), (w, h), ang = cv2.minAreaRect(pts)
    dets.append(dict(c=(x0 + cx * res, y0 + cy * res), size=(max(w, h) * res, min(w, h) * res), rect=((x0 + cx * res, y0 + cy * res), (w * res, h * res), ang), hmax=float(height[lab == i].max())))
print(f"found {len(dets)} obstacles in the BEV map (3 true objects)")

def true_rect(o):
    return ((o["c"][0], o["c"][1]), (o["size"][0], o["size"][1]), o["yaw"])
def bev_iou(r1, r2):
    a = cv2.boxPoints(r1).astype(np.float32); b = cv2.boxPoints(r2).astype(np.float32)
    inter, _ = cv2.intersectConvexConvex(a, b)
    return float(inter / (cv2.contourArea(a) + cv2.contourArea(b) - inter + 1e-9))
for o in objects:
    best = max(dets, key=lambda d: bev_iou(d["rect"], true_rect(o)))
    iou = bev_iou(best["rect"], true_rect(o))
    err = np.hypot(best["c"][0] - o["c"][0], best["c"][1] - o["c"][1])
    print(f"{o['name']:<7} true centre {o['c']}  -> BEV IoU {iou:.2f}, centre error {err:.2f} m, height estimate {best['hmax']:.2f} m (true {o['size'][2]})")
print("KITTI-style car AP counts a detection correct at 3-D IoU >= 0.7 (cars) or 0.5 (pedestrians/cyclists); small errors in yaw or size can already push a box below the threshold")
vis = cv2.cvtColor((np.clip(height, 0, 2) / 2 * 255).astype(np.uint8), cv2.COLOR_GRAY2RGB)
for d in dets:
    (cx, cy), (w, h), ang = d["rect"]
    corners = cv2.boxPoints((((cx - x0) / res, (cy - y0) / res), (w / res, h / res), ang)).astype(np.int32)       # back to pixel coordinates for drawing
    cv2.polylines(vis, [corners], True, (255, 60, 60), 1)
cvlab.show(np.flipud(cv2.resize(vis, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)), "BEV height map with detected boxes (x to the right, y up)")
```

Deep detectors replace the hand-written blob step with a CNN on the BEV map, which also handles **partial views, touching objects and classes**. Note the person scores a lower IoU: small objects need very precise localisation.

## LiDAR-based detectors

| Detector | Idea |
|---|---|
| **VoxelNet** (2017) | Voxelise, learn features per voxel with mini-PointNets, 3-D convolutions, region proposal head |
| **SECOND** | Sparse 3-D convolutions: much faster than dense VoxelNet |
| **PointPillars** (2018) | Voxelise into **vertical pillars** (no z resolution), a PointNet per pillar produces a **pseudo-image** (BEV), then a 2-D CNN and SSD-style head. Very fast (60 FPS) and widely deployed |
| **PointRCNN, PV-RCNN, Voxel R-CNN** | Two-stage: proposals refined with point or voxel features for higher accuracy |
| **CenterPoint** (2020) | **Anchor-free**: predicts a heat-map of object **centres** in BEV (like CenterNet) plus size, yaw, velocity; simple tracking by centre matching; strong on nuScenes and Waymo |
| **Frustum PointNets** | Use a 2-D detector box to cut a frustum of points, then segment and regress the box (camera + points, an early fusion design) |
| **Transformers: DETR3D, TransFusion, PETR, Voxel Transformer** | Object queries attend to features; no NMS |
| **LiDAR-only at long range** | Range-view / streaming models (RSN, FSD) to handle 200 m ranges |

## Camera-only 3-D

Cameras are cheap and dense but do not measure depth directly. Approaches:

- **Monocular 3-D** (FCOS3D, SMOKE, MonoDETR): from one image, predict centre depth, size and yaw per object. Depth is the weak point: 1% depth error at 50 m is 0.5 m.
- **Pseudo-LiDAR** (2018): predict a dense depth map (module 13), lift it into a point cloud, and run a LiDAR detector on it.
- **Lift-Splat-Shoot (LSS), BEVDet, BEVDepth**: for each pixel predict a **distribution over depth**, **lift** the feature along the ray weighted by that distribution, then **splat** into the BEV grid. The runnable check below demonstrates the idea.
- **BEVFormer** (and PETR, DETR3D): **learnable BEV queries** attend (deformable attention) to the multi-camera image features at the projected locations, with **temporal self-attention** to the previous BEV; no explicit depth.
- **Occupancy networks** (Tesla, Occ3D, SurroundOcc): predict a **3-D voxel grid** of free/occupied cells (plus class and flow) instead of boxes, so that arbitrary obstacles (a ladder, a fallen tree) are handled; a major trend in 2023–2025.

```python local check title="Lift-splat: spread pixel features along the camera ray, drop them into a BEV grid"
import torch

torch.manual_seed(0)
# camera: 64x48 feature map, focal length 40 px (in feature-map pixels), principal point at the centre
Wf, Hf, f = 64, 48, 40.0
cx, cy = Wf / 2, Hf / 2
depth_bins = torch.arange(2.0, 30.0, 0.5)                          # candidate depths in metres: the "lift" axis
D = len(depth_bins)

# an object 12 m ahead and 3 m to the right occupies a small patch of pixels; a depth network is (here, fake) confident about 12 m
true_depth, true_x = 12.0, 3.0
u_true = cx + f * true_x / true_depth
patch = (torch.arange(Wf)[None, :] - u_true).abs() < 2.5
patch = patch & ((torch.arange(Hf)[:, None] - cy).abs() < 3)
feat = patch.float()[None]                                          # one-channel image feature: 1 on the object, 0 elsewhere
depth_prob = torch.softmax(-((depth_bins[:, None, None] - true_depth) ** 2) / 2.0, 0).expand(D, Hf, Wf)    # (D, H, W) distribution over depth for each pixel

# LIFT: every pixel's feature is spread along its ray, weighted by the depth probability -> a frustum of features (C, D, H, W)
frustum = feat[:, None] * depth_prob[None]

# geometry: where is each (depth, pixel) in the world? (X right, Y forward)
u = torch.arange(Wf).float()[None, None, :].expand(D, Hf, Wf)
Z = depth_bins[:, None, None].expand(D, Hf, Wf)
X = (u - cx) / f * Z
Y = Z

# SPLAT: add every frustum feature into the bird's-eye-view cell below it
res, nx, ny = 0.5, 40, 60                                          # BEV cells of 0.5 m; x from -10..10, y from 0..30
bx = ((X + 10) / res).long(); by = (Y / res).long()
ok = (bx >= 0) & (bx < nx) & (by >= 0) & (by < ny)
bev = torch.zeros(ny, nx)
bev.index_put_((by[ok], bx[ok]), frustum[0][ok], accumulate=True)
iy, ix = divmod(int(bev.argmax()), nx)
print(f"BEV map {tuple(bev.shape)}; strongest cell is at x = {ix * res - 10 + res / 2:.1f} m, y = {iy * res + res / 2:.1f} m   (true object: x = {true_x} m, y = {true_depth} m)")
print("if the depth distribution were flat, the same pixels would smear along the whole ray:")
flat = torch.full((D, Hf, Wf), 1.0 / D)
bev2 = torch.zeros(ny, nx); bev2.index_put_((by[ok], bx[ok]), (feat[:, None] * flat[None])[0][ok], accumulate=True)
col = bev2[:, ix - 2: ix + 3].sum(1)
print(f"   share of the object's BEV mass within 2 m of the true depth: peaked depth {bev[int((true_depth-2)/res):int((true_depth+2)/res)].sum() / bev.sum():.2f}  vs flat depth {bev2[int((true_depth-2)/res):int((true_depth+2)/res)].sum() / bev2.sum():.2f}")
print("this is Lift-Splat-Shoot; BEVDet/BEVDepth use the same idea, BEVFormer replaces it with attention from BEV queries to image features")
```

## Fusion

LiDAR gives accurate geometry but is sparse and colourless at range; cameras give texture and semantics. **BEVFusion** converts camera features (by LSS) and LiDAR features into **the same BEV grid**, concatenates them and runs shared BEV heads; it also gives a graceful degradation when one sensor fails. Other designs: point decoration (**PointPainting** adds image segmentation scores to each point), proposal-level fusion (MV3D, AVOD), transformer fusion (TransFusion, DeepInteraction). **Radar** adds velocity and weather robustness (CRN, RCBEV).

## From detection to tracking and prediction

- **3-D tracking**: associate detections over time using centre distance, the Kalman filter and the Hungarian algorithm (**AB3DMOT**; CenterPoint's velocity-based matching), the same ideas as in module 6.
- **Prediction**: forecast trajectories of tracked agents (motion forecasting with VectorNet, Wayformer, MTR) for the planner.
- **End-to-end driving** (UniAD, VAD, UniAD-style stacks, and VLA-based models) trains perception, prediction and planning jointly.

## Benchmarks and metrics

- **KITTI** (2012; 64-beam LiDAR + stereo; AP with 3-D IoU 0.7 for cars, divided into easy / moderate / hard), **nuScenes** (6 cameras, LiDAR, radar; **mAP** from centre distance and **NDS** = nuScenes detection score, which also counts translation, scale, orientation, velocity and attribute errors), **Waymo Open Dataset** (LiDAR + 5 cameras; APH = AP weighted by heading accuracy), **Argoverse 2**, **ONCE**.
- Always break results down by **distance range** (0–20, 20–40, 40+ m), **occlusion level**, **class** and **weather/time of day**.

## For robots, not only cars

- **Warehouses and AMRs**: 3-D boxes for pallets and people from LiDAR or depth cameras; **ground plane fitting + clustering** (Euclidean clustering of obstacle points, RANSAC planes) is a robust classical baseline and a good safety fallback.
- **Manipulation**: object **6-D poses** instead of boxes (next lessons); 3-D boxes for pick zones.
- **Mobile robots on rough terrain**: **elevation maps / traversability** from depth and LiDAR rather than object boxes.
- **Safety**: perception errors are random; a deterministic rule-based safety layer (protective fields from certified LiDAR) should not depend on a learned detector.

:::interview Questions you may get
- "Why use bird's-eye view?" Objects keep true scale and do not occlude each other in the plane; it is a natural space to fuse sensors, detect, track and plan.
- "How does PointPillars work?" Points are grouped into vertical pillars; a small PointNet makes a feature per pillar, scattered into a 2-D pseudo-image; a 2-D CNN and SSD-style head predict oriented boxes.
- "How do camera-only 3-D detectors handle missing depth?" Predict depth distributions and lift features (LSS/BEVDepth), use transformers with BEV queries (BEVFormer), or use monocular depth/pseudo-LiDAR; errors grow with distance.
- "What is CenterPoint's advantage?" Anchor-free centre heat-maps in BEV, simple and accurate, with velocity regression for tracking.
- "What are the nuScenes metrics?" mAP using centre-distance matching, and NDS combining mAP with true-positive errors (translation, scale, orientation, velocity, attributes).
- "How do you evaluate by range and why?" Far objects have few points/pixels; global mAP hides long-range failures, which matter for stopping distances.
- "What is occupancy prediction?" A 3-D grid of free/occupied voxels (with semantics), so unknown shapes are represented without relying on a class list.
:::

```quiz
? What does a 3-D box contain (for a car on the road)?
+ Centre (x, y, z), size (l, w, h) and yaw
- Only a 2-D rectangle
- Colour and brightness
> Seven numbers; add velocity for tracking.

? What does the "lift" in lift-splat-shoot mean?
+ Spreading a pixel's feature along its camera ray according to a depth distribution
- Increasing the image brightness
- Moving the camera
> Then splat the 3-D points into BEV.

? Why is BEV helpful for planning?
+ True metric sizes and no perspective overlap, in the plane where the vehicle moves
- It is always more accurate than 3-D
- It removes the need for sensors
> It is a convenient common space for fusion.

? What does CenterPoint predict in BEV?
+ A heat-map of object centres plus size, yaw and velocity
- A depth map
- Image captions
> Anchor-free detection.
```

:::problem Your warehouse AMR uses a PointPillars model trained on a public dataset, and it misses pallets seen from low heights. How do you diagnose and fix it? {level=medium tags="3d-detection,domain-shift,warehouse"}
Think about sensor mounting, data distribution and baselines.

:::solution Model answer
Check the sensor setup: a low-mounted LiDAR sees pallets at grazing angles with a different point distribution than a roof-mounted driving LiDAR; the public dataset has no pallet class and a different height/range distribution. Collect and label pallet data from the robot's own sensor (3-D boxes), fine-tune with the correct point cloud range, pillar size and anchors/centre heads, add augmentation (ground-truth sampling of pallets, rotation, dropout), and evaluate by distance and viewing angle. Keep a classical fallback (ground-plane removal + clustering, size gating) and measure recall at the safety distance; consider adding a 2-D detector or depth camera fusion for low-height objects.
:::
:::

:::keypoints
- A 3-D box = centre, size, yaw; BEV IoU needs polygon intersection; KITTI uses IoU thresholds, nuScenes uses centre distance and NDS.
- LiDAR detectors: VoxelNet, SECOND (sparse conv), PointPillars (fast BEV pseudo-image), CenterPoint (anchor-free centres), two-stage and transformer variants.
- Camera 3-D: monocular, lift-splat depth distributions (LSS, BEVDepth), BEV queries with attention (BEVFormer), occupancy networks; BEVFusion fuses LiDAR and camera in one BEV space.
- Report results by range, occlusion and class; use classical clustering and certified sensors as safety fallbacks.
:::

:::resources
- [Lang et al.: PointPillars](https://arxiv.org/abs/1812.05784) — fast LiDAR detection.
- [Yin et al.: Center-based 3D Object Detection and Tracking (CenterPoint)](https://arxiv.org/abs/2006.11275) — anchor-free 3-D detection.
- [Philion and Fidler: Lift, Splat, Shoot](https://arxiv.org/abs/2008.05711) — camera features to BEV.
- [Li et al.: BEVFormer](https://arxiv.org/abs/2203.17270) — transformer BEV perception.
- [Liu et al.: BEVFusion](https://arxiv.org/abs/2205.13542) — unified LiDAR-camera BEV.
- [Caesar et al.: nuScenes](https://arxiv.org/abs/1903.11027) — the multimodal dataset and metrics.
- [Sun et al.: Waymo Open Dataset](https://arxiv.org/abs/1912.04838) — large-scale driving benchmark.
:::
