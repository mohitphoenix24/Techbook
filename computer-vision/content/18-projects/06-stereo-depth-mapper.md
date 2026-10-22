---
title: Build a Stereo Depth Mapper
level: advanced
time: 55
icon: layers
cover: #2563eb,#22c55e
tags: stereo, block matching, disparity, depth, cost volume, point cloud
summary: Compute depth from two images. Write block matching from scratch with a cost volume, evaluate it against ground-truth disparity, filter with a confidence test and compare with OpenCV's block matcher and semi-global matcher, convert disparity to metric depth, see how depth error grows with the square of the distance, and turn the result into a top-down obstacle map.
---

Two cameras side by side see the same scene from slightly different positions. A point that is close shifts a lot between the two images and a distant point shifts little: that shift is the **disparity**, and `Z = f·B / d` turns it into depth (module 5). In this project you write the matcher yourself, **measure it against ground truth**, compare it with OpenCV, and build a simple obstacle map from the result.

**What you'll build:** `block_match(left, right)` with a cost volume, a confidence filter, a depth conversion, accuracy tables, and a bird's-eye obstacle map.

:::flow The pipeline
Rectified pair | left and right images, same rows
Cost volume | matching cost for every pixel and every disparity
Aggregate | sum the cost over a window
Winner takes all | the best disparity per pixel
Confidence | reject ambiguous pixels
Depth | Z = f B / d
Map | top-down obstacles
:::

:::def Rectified pair
We assume the images are **rectified** (module 5): after calibration and rotation, matching points lie on the **same row**, so the search for a match is one-dimensional along that row. A point at column `x` in the left image is at column `x − d` in the right image, where `d ≥ 0` is the disparity.
:::

## Step 1 — The stereo pair with ground truth

`cvlab.stereo_pair()` returns a left image, a right image and the **true disparity** map of a made-up scene: a ground plane that gets closer towards the bottom of the picture, a large box on the left and a round object on the right. Real datasets (Middlebury, KITTI) work the same way: the ground truth is what lets you score the algorithm.

```python run shared title="Step 1 · the pair and the true disparity"
import numpy as np
import cv2
import cvlab

left, right, true_disp = cvlab.stereo_pair(320, 240, seed=0)
gl, gr = cv2.cvtColor(left, cv2.COLOR_RGB2GRAY), cv2.cvtColor(right, cv2.COLOR_RGB2GRAY)
print("image:", left.shape, "| true disparity range:", float(true_disp.min()), "to", float(true_disp.max()), "pixels")

def colour(d, vmax=32):
    return cv2.applyColorMap((np.clip(d, 0, vmax) / vmax * 255).astype(np.uint8), cv2.COLORMAP_TURBO)[..., ::-1]
cvlab.show(left, "Left", right, "Right", colour(true_disp), "True disparity (red = near)")
```

## Step 2 — Block matching from scratch

For every candidate disparity `d` from 0 to 47 we compute, for every pixel, the **absolute difference** between the left pixel and the right pixel shifted by `d`. A single pixel difference is noisy, so we **aggregate** the cost over a small window (a `boxFilter`). The result is a **cost volume** `cost[d, y, x]`. The disparity of a pixel is the `d` with the **lowest cost** ("winner takes all"). This is exactly the idea of OpenCV's `StereoBM`, in about ten lines.

```python run shared title="Step 2 · cost volume and winner-takes-all"
def block_match(gl, gr, max_d=48, win=9):
    gl, gr = gl.astype(np.float32), gr.astype(np.float32)
    h, w = gl.shape
    cost = np.full((max_d, h, w), 1e6, np.float32)                      # large cost where no match is possible (left border)
    for d in range(max_d):
        diff = np.abs(gl[:, d:] - gr[:, :w - d])                        # left pixel x is compared with right pixel x - d
        cost[d, :, d:] = cv2.boxFilter(diff, -1, (win, win), normalize=True, borderType=cv2.BORDER_REPLICATE)     # aggregate over a window
    disp = cost.argmin(0).astype(np.float32)
    best = cost.min(0)
    second = np.partition(cost, 1, axis=0)[1]                           # the second-lowest cost
    return disp, best, second

def score(disp, truth, valid=None):
    valid = np.ones(truth.shape, bool) if valid is None else valid
    err = np.abs(disp - truth)[valid]
    return dict(bad_pct=100 * float((err > 1).mean()), rmse=float(np.sqrt((err ** 2).mean())), coverage=100 * float(valid.mean()))

disp, best, second = block_match(gl, gr)
s = score(disp, true_disp)
print(f"winner-takes-all: {s['bad_pct']:.1f}% of pixels wrong by more than 1 px, RMSE {s['rmse']:.2f} px, coverage {s['coverage']:.0f}%")
cvlab.show(colour(true_disp), "Truth", colour(disp), "My block matcher")
```

## Step 3 — Where does it fail, and how do we know?

Look at the error map: most mistakes are in **occluded regions** (a part of the background is hidden from one camera, so no true match exists), at **depth edges**, and on the **left border** (where `x < d`, so there is no pixel to compare). We can also use a **confidence test** that needs no ground truth: compare the best cost with the **second-best** cost. If they are almost equal, the match is **ambiguous** and we reject the pixel. This trades **coverage** for **accuracy**.

```python run shared title="Step 3 · confidence filtering: accuracy versus coverage"
ratio = best / (second + 1e-6)                                          # near 1: ambiguous; small: a clear winner
print("confidence threshold | pixels kept | wrong by > 1 px | RMSE")
for thr in (1.01, 0.95, 0.8, 0.6):
    s = score(disp, true_disp, ratio < thr)
    print(f"{thr:>20} | {s['coverage']:>9.0f}% | {s['bad_pct']:>13.2f}% | {s['rmse']:.2f}")
valid = ratio < 0.8
err_map = np.where(valid, np.abs(disp - true_disp), 0)
cvlab.show(np.clip(err_map * 40, 0, 255).astype(np.uint8), "Error where the match is trusted (bright = wrong)", (valid * 255).astype(np.uint8), "Pixels kept (ratio < 0.8)")
```

## Step 4 — Compare with OpenCV's matchers

`StereoBM` is the classic block matcher; `StereoSGBM` (semi-global matching) adds a **smoothness penalty** that propagates information along several image directions, which fixes many ambiguities and fills occlusions better. OpenCV returns **fixed-point disparities** (multiplied by 16) and marks invalid pixels with a negative value.

```python run shared title="Step 4 · OpenCV BM and SGBM"
bm = cv2.StereoBM_create(numDisparities=48, blockSize=15)
d_bm = bm.compute(gl, gr).astype(np.float32) / 16
sgbm = cv2.StereoSGBM_create(minDisparity=0, numDisparities=48, blockSize=7, P1=8 * 49, P2=32 * 49,
                             uniquenessRatio=8, speckleWindowSize=80, speckleRange=2, disp12MaxDiff=1)
d_sg = sgbm.compute(gl, gr).astype(np.float32) / 16

print("method                         | kept | wrong by > 1 px | RMSE")
for name, d, v in [("mine, ratio < 0.8", disp, ratio < 0.8), ("OpenCV StereoBM", d_bm, d_bm > 0), ("OpenCV StereoSGBM", d_sg, d_sg > 0)]:
    s = score(d, true_disp, v)
    print(f"{name:<30} | {s['coverage']:>3.0f}% | {s['bad_pct']:>13.2f}% | {s['rmse']:.2f}")
cvlab.show(colour(d_bm), "OpenCV BM", colour(d_sg), "OpenCV SGBM")
print("every matcher trades coverage against accuracy: always report both, never accuracy alone")
```

## Step 5 — From disparity to metric depth

With focal length `f` (in pixels) and baseline `B` (in metres) we get `Z = f·B / d`. Here `f = 400 px` and `B = 0.12 m` (our assumption for the simulated camera), so a disparity of 6 px is 8 m and 30 px is 1.6 m. Since `Z = fB/d`, a small disparity error matters more for **distant** points: `ΔZ ≈ Z² Δd / (f B)`. We verify this on our own results.

```python run shared title="Step 5 · depth and how its error grows with distance"
f_px, baseline = 400.0, 0.12
def to_depth(d):
    return np.where(d > 0.5, f_px * baseline / np.maximum(d, 0.5), np.nan)

true_depth = to_depth(true_disp)
est_depth = to_depth(np.where(ratio < 0.8, disp, 0))
print("range of true depth:", f"{np.nanmin(true_depth):.1f} m to {np.nanmax(true_depth):.1f} m")
print("depth bin (true) | pixels | mean abs error | theory dZ = Z^2 * 0.5px / (f B)")
for lo, hi in [(1.5, 2.5), (2.5, 4), (4, 6), (6, 9)]:
    m = (true_depth >= lo) & (true_depth < hi) & np.isfinite(est_depth)
    if m.sum() == 0: continue
    z = true_depth[m].mean()
    print(f"{lo:>4.1f} - {hi:<4.1f} m    | {m.sum():>6} | {np.abs(est_depth[m] - true_depth[m]).mean():>10.3f} m  | {z * z * 0.5 / (f_px * baseline):.3f} m")
print("the error grows roughly with Z squared: a stereo camera is precise nearby and coarse far away; a longer baseline or higher resolution helps")
```

## Step 6 — Find the ground, then a top-down obstacle map

A robot needs to know **what sticks up from the floor**. In a stereo image the floor has a very regular signature: because the floor gets closer as you go down the image, its disparity is a **straight line in the image row** (the classic *v-disparity* idea). We estimate it from the data: take the **typical disparity of each image row** (the median of the trusted pixels; the floor is the majority) and fit a line to it. A pixel that is **clearly closer than the floor would be at its row** (more than 2 px extra disparity) is an obstacle. We then convert the obstacle pixels to metres, `X = (u − cx)·Z/f`, and drop them into a top-down grid of 10 cm cells.

```python run shared title="Step 6 · ground model, obstacle mask and a bird's-eye map"
h, w = gl.shape
trusted = ratio < 0.8
rows = np.arange(h)
row_median = np.array([np.median(disp[r][trusted[r]]) if trusted[r].sum() > 20 else np.nan for r in rows])
ok = np.isfinite(row_median)
slope, intercept = np.polyfit(rows[ok], row_median[ok], 1)              # ground disparity = slope * row + intercept
ground_disp = (slope * rows + intercept)[:, None] * np.ones((1, w))
obstacle = trusted & (disp > ground_disp + 2.0)                         # clearly closer than the floor at this row

# score against the truth (the simulator's floor ramp is known: 6 + 10 * row / h)
truth_obstacle = true_disp > (6 + 10 * rows[:, None] / h) + 1.5
inter, union = (obstacle & truth_obstacle).sum(), (obstacle | truth_obstacle).sum()
print(f"ground model: disparity = {slope:.3f} * row + {intercept:.2f}")
print(f"obstacle mask versus the truth: IoU {inter / union:.2f}, precision {inter / obstacle.sum():.2f}, recall {inter / truth_obstacle.sum():.2f}")

Z = f_px * baseline / np.maximum(disp, 0.5)
X = (np.meshgrid(np.arange(w), np.arange(h))[0] - w / 2) * Z / f_px
cell = 0.1                                                              # 10 cm grid cells
gx = ((X[obstacle] + 2.0) / cell).astype(int); gz = (Z[obstacle] / cell).astype(int)
grid = np.zeros((40, 40), np.int32)                                     # 4 m wide (x from -2 to 2) and 4 m deep
inside = (gx >= 0) & (gx < 40) & (gz >= 0) & (gz < 40)
np.add.at(grid, (gz[inside], gx[inside]), 1)
occupied = (grid >= 3)                                                  # a cell is an obstacle if at least 3 points fall in it
ys_, xs_ = np.nonzero(occupied)
print(f"occupied cells: {len(ys_)} | obstacles between {ys_.min() * cell:.1f} m and {(ys_.max() + 1) * cell:.1f} m ahead, x from {xs_.min() * cell - 2:.1f} to {(xs_.max() + 1) * cell - 2:.1f} m")
topdown = cv2.cvtColor(np.flipud(occupied.astype(np.uint8) * 255), cv2.COLOR_GRAY2RGB)
topdown = cv2.resize(topdown, None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST)
cv2.drawMarker(topdown, (topdown.shape[1] // 2, topdown.shape[0] - 6), (255, 0, 0), cv2.MARKER_TRIANGLE_UP, 14, 2)     # the camera
cvlab.show(left, "Left image", (obstacle * 255).astype(np.uint8), "Obstacle pixels", topdown, "Top-down map (camera at the bottom)")
```

## How it works

| Piece | Purpose |
|---|---|
| Cost volume `cost[d, y, x]` | the matching evidence for every pixel at every disparity |
| Window aggregation | one pixel is noisy; a window of costs is robust (but blurs depth edges) |
| Winner takes all | simplest decision rule; semi-global matching replaces it by an optimisation with smoothness |
| Best/second-best ratio | a label-free confidence measure: ambiguous pixels are rejected |
| `Z = f B / d` | converts disparity to depth; the error grows as `Z²` |
| v-disparity ground model + grid | the floor is a line in (row, disparity); what lies above it becomes an obstacle map a planner can use |

**Where stereo fails**: textureless walls and sky (nothing to match), repeated patterns, reflective or transparent surfaces, occlusions, thin objects, wrong rectification (a one-pixel vertical error ruins matching), and distance beyond `f·B / 1 px` (disparity below one pixel). Learned stereo networks (RAFT-Stereo, cost-volume CNNs) fix many of these, and active sensors (structured light, time-of-flight) cover textureless surfaces.

:::exercise Extend it
1. Replace the absolute difference by the **census transform** cost (compare each pixel with its neighbours as a bit string, Hamming distance); test with a **brightness change** between the two images.
2. Add a **left-right consistency check**: compute the right-to-left disparity too and reject pixels where the two maps disagree by more than 1 px.
3. Implement **sub-pixel refinement** by fitting a parabola to the three costs around the minimum and measure the RMSE gain.
4. Fill rejected pixels by **interpolation** along the row (or a bilateral/guided filter with the left image) and compare the filled map with the truth.
5. Implement a simple **scanline dynamic programming** smoothness term (a one-direction version of SGM) and compare with winner-takes-all.
:::

:::keypoints
- Stereo matching builds a cost volume over disparities, aggregates it over a window and picks the minimum; depth is `Z = f B / d`.
- Evaluate against ground truth with both accuracy (bad pixels, RMSE) and coverage; a confidence test trades one for the other.
- OpenCV's `StereoBM` and `StereoSGBM` are the practical baselines; SGBM's smoothness term handles ambiguity and occlusions better.
- Depth error grows with the square of the distance, so baseline, focal length and resolution set the useful range.
- The floor is a straight line in (row, disparity) space; pixels closer than that line are obstacles, which a top-down grid turns into a map for navigation.
:::
