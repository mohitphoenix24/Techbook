---
title: Stereo Vision — Depth from Two Cameras
level: advanced
time: 55
summary: How two cameras measure depth. Rectification, disparity, Z = f·B/d, block matching written from scratch, OpenCV's StereoBM and SGBM, comparing with ground truth, why textureless areas and occlusions fail, and the accuracy limits of stereo.
---

Humans see depth with two eyes. **Stereo vision** does the same with two cameras: a point appears at slightly different places in the left and right pictures, and **the shift tells you the distance**.

## Disparity and depth

Mount two identical cameras side by side, looking the same way, separated by a distance **B** (the **baseline**). For a point at depth `Z`, the left camera sees it at column `x_L` and the right camera at `x_R`. The difference is the **disparity**:

:::formula Stereo depth
d = x_L - x_R = \frac{f\,B}{Z} \quad\Longleftrightarrow\quad Z = \frac{f\,B}{d}
:::

`f` is the focal length in pixels. **Close** objects have **large** disparity; **far** objects have **small** disparity (a point at infinity has `d = 0`). Play with it:

```viz algo=stereo title="Disparity, depth and error"
```

## Rectification: make the search horizontal

In general, matches lie on epipolar lines (previous lesson). **Rectification** warps both pictures so that the cameras behave as if they were perfectly aligned: epipolar lines become **horizontal rows**, and a match is always on the **same row**. Then stereo matching is a 1-D search along the row. It needs calibration of the **pair**: intrinsics, distortion, and the relative `R, t`, which `cv2.stereoCalibrate` finds. Then `cv2.stereoRectify` gives rectifying rotations and projection matrices.

```python run title="Calibrate a stereo pair and rectify (with synthetic data)" level=advanced
import cv2
import numpy as np

K = np.array([[700., 0, 320], [0, 700., 240], [0, 0, 1]])
R_lr, _ = cv2.Rodrigues(np.array([0.01, -0.03, 0.005]))                          # the right camera is slightly rotated ...
T_lr = np.array([[-0.12], [0.002], [0.003]])                                     # ... and 12 cm to the right (baseline)
rng = np.random.default_rng(0)

pattern = (8, 5); sq = 0.03
obj = np.zeros((40, 3), np.float32); obj[:, :2] = np.mgrid[0:8, 0:5].T.reshape(-1, 2) * sq
obj_pts, left_pts, right_pts = [], [], []
for _ in range(12):                                                              # 12 board poses seen by both cameras
    rv = rng.uniform(-0.4, 0.4, 3); tv = np.array([rng.uniform(-0.1, 0.0), rng.uniform(-0.1, 0.0), rng.uniform(0.5, 0.9)])
    pl, _ = cv2.projectPoints(obj, rv, tv, K, None)
    Rb, _ = cv2.Rodrigues(rv)
    pr, _ = cv2.projectPoints(obj, cv2.Rodrigues(R_lr @ Rb)[0], R_lr @ tv + T_lr.ravel(), K, None)
    obj_pts.append(obj); left_pts.append((pl + rng.normal(0, 0.15, pl.shape)).astype(np.float32)); right_pts.append((pr + rng.normal(0, 0.15, pr.shape)).astype(np.float32))

rms, K1, d1, K2, d2, R, T, E, F = cv2.stereoCalibrate(obj_pts, left_pts, right_pts, K, None, K, None, (640, 480), flags=cv2.CALIB_FIX_INTRINSIC)
print("stereo calibration RMS (px):", round(rms, 3))
print("baseline: estimated", round(float(np.linalg.norm(T)) * 100, 2), "cm, true", round(float(np.linalg.norm(T_lr)) * 100, 2), "cm")

R1, R2, P1, P2, Q, _, _ = cv2.stereoRectify(K1, d1, K2, d2, (640, 480), R, T)
ul = cv2.undistortPoints(left_pts[0], K1, d1, R=R1, P=P1).reshape(-1, 2)           # corners in the RECTIFIED left picture
ur = cv2.undistortPoints(right_pts[0], K2, d2, R=R2, P=P2).reshape(-1, 2)
print("after rectification, the rows of left/right corners differ by (pixels):", round(float(np.abs(ul[:, 1] - ur[:, 1]).mean()), 3), "  (before: ",
      round(float(np.abs(left_pts[0].reshape(-1, 2)[:, 1] - right_pts[0].reshape(-1, 2)[:, 1]).mean()), 2), ")")
print("disparity of the corners:", np.round((ul[:, 0] - ur[:, 0])[:5], 1), " -> depth Z = f*B/d =", np.round(P1[0, 0] * np.linalg.norm(T) / (ul[:, 0] - ur[:, 0])[:5], 3), "m")
```

After rectification the corresponding corners lie on the same row (the vertical difference falls from over 5 pixels to under 0.2). The `Q` matrix returned by `stereoRectify` lets you turn a disparity map directly into 3-D points (`cv2.reprojectImageTo3D`).

## Matching along the row

Take a small **window** (say 7 × 7) around a pixel in the left picture. Slide a window along the **same row** of the right picture, over a range of possible disparities. Measure how similar the windows are, for example by the **sum of absolute differences (SAD)**. The disparity with the lowest cost wins. This is **block matching**. Doing this for every disparity at every pixel makes a **cost volume** of size `H × W × D`.

We have a stereo pair with a known true disparity (`cvlab.stereo_pair`).

```python run title="Block matching from scratch" level=advanced shared
import cv2
import numpy as np
import cvlab

left, right, gt = cvlab.stereo_pair()                              # a synthetic stereo pair with the true disparity gt (pixels)
L = cv2.cvtColor(left, cv2.COLOR_RGB2GRAY).astype(np.float32)
Rr = cv2.cvtColor(right, cv2.COLOR_RGB2GRAY).astype(np.float32)
h, w = L.shape
max_d, win = 40, 7

costs = np.full((max_d, h, w), 1e9, np.float32)
for d in range(max_d):
    shifted = np.roll(Rr, d, axis=1)                               # right picture shifted by d: compare L(x) with R(x - d)
    diff = np.abs(L - shifted)
    costs[d] = cv2.boxFilter(diff, -1, (win, win))                 # SAD over a window (the box filter averages |difference|)
disparity = costs.argmin(axis=0).astype(np.float32)               # the cheapest disparity at each pixel

valid = (gt > 0) & (np.arange(w)[None, :] > max_d)                 # ignore the left border, where there is nothing to match
err = np.abs(disparity - gt)[valid]
print("cost volume shape (disparities, rows, columns):", costs.shape)
print("mean absolute error:", round(float(err.mean()), 2), "px   pixels within 1 px of the truth:", round(float((err <= 1).mean() * 100), 1), "%")
cvlab.show(left, "Left", right, "Right", gt, "True disparity", disparity, "Block matching result")
```

A few seconds of simple code gives a decent depth map: the near objects (large disparity) are brighter. The errors are mostly at **object borders** and where the surface is **flat and without texture**.

## OpenCV's matchers: BM and SGBM

- **`StereoBM`**: the block-matching idea, optimised and with filters.
- **`StereoSGBM`** (semi-global block matching, Hirschmüller): in addition to the matching cost it adds a **smoothness penalty**, enforced along 8 or 4 directions through the picture (dynamic-programming paths). Neighbouring pixels should have similar disparity, with a bigger penalty for big jumps (`P2`) than for small steps (`P1`). Much better in weak texture than plain block matching, and the standard in many products.

```python run title="StereoBM versus StereoSGBM" level=advanced shared
Lg = cv2.cvtColor(left, cv2.COLOR_RGB2GRAY)
Rg = cv2.cvtColor(right, cv2.COLOR_RGB2GRAY)

bm = cv2.StereoBM_create(numDisparities=48, blockSize=15)
d_bm = bm.compute(Lg, Rg).astype(np.float32) / 16.0                # OpenCV returns fixed-point numbers: divide by 16

sgbm = cv2.StereoSGBM_create(minDisparity=0, numDisparities=48, blockSize=5, P1=8 * 5 * 5, P2=32 * 5 * 5,
                             uniquenessRatio=5, speckleWindowSize=80, speckleRange=2, mode=cv2.STEREO_SGBM_MODE_SGBM_3WAY)
d_sg = sgbm.compute(Lg, Rg).astype(np.float32) / 16.0

for name, d in (("StereoBM", d_bm), ("StereoSGBM", d_sg)):
    ok = (d > 0) & (gt > 0) & (np.arange(w)[None, :] > 48)
    e = np.abs(d - gt)[ok]
    print(f"{name:10s} valid pixels {ok.mean() * 100:5.1f}%   mean error {e.mean():.2f} px   within 1 px: {(e <= 1).mean() * 100:.1f}%")
cvlab.show(d_bm, "StereoBM", d_sg, "StereoSGBM: smoother, fewer holes")
```

On this clean, well-textured pair both are accurate, but SGBM fills more pixels (more are valid). On real scenes with weak texture the gap is much larger.

## Depth and its accuracy

From disparity to depth: `Z = f·B/d`. But the **error** of depth grows with distance: differentiating gives:

:::formula Depth error
\Delta Z \approx \frac{Z^2}{f\,B}\,\Delta d
:::

A matching error `Δd` of 0.5 px costs little at 1 m and a lot at 10 m: it grows with **Z²**. Design rules:

- **Larger baseline B** and **longer focal length f** improve far-range accuracy, but reduce the **overlap** and make near objects hard to match (too much disparity) and cause more occlusions.
- **Higher resolution** gives more disparity pixels (at the cost of compute).
- Sub-pixel matching (interpolating around the best disparity) is standard.

```python run title="Depth error versus distance" level=easy
f, B, dd = 700.0, 0.12, 0.5                                        # focal length (px), baseline (m), matching error (px)
print("depth   disparity   depth error from 0.5 px")
for Z in (0.5, 1, 2, 4, 8):
    d = f * B / Z
    print(f"{Z:4.1f} m {d:8.1f} px {Z * Z / (f * B) * dd * 100:10.1f} cm")
```

## Where stereo fails

| Problem | Why |
|---|---|
| **Textureless surfaces** (white wall, sky, a plain box) | All windows look alike, so the match is ambiguous. Fix: project a **texture pattern** (active stereo; Intel RealSense does this with an infrared projector) |
| **Occlusions** | A part visible to one camera only has no match. Use a **left-right consistency check** and fill holes |
| **Repetitive patterns** (fences, tiles) | Several equally good matches |
| **Reflective / transparent / shiny** objects | The appearance differs between the cameras |
| **Different exposure** between cameras | Matching costs mismatch; use synchronised cameras with the same settings (and cost functions like Census, which are robust to brightness changes) |
| **Bad calibration or synchronisation** | Rows do not line up, and moving objects shift. Check rectification quality |

**Left-right consistency check**: compute the disparity from left to right and from right to left. A pixel whose two answers disagree is probably occluded or wrong, and is marked invalid.

## Modern stereo

Deep networks (PSMNet, GA-Net, RAFT-Stereo, CREStereo, and stereo foundation models) build a cost volume from **learned features** and regularise it with 3-D convolutions or iterative updates, giving far better results in textureless and reflective regions. They run in real time on GPUs and edge chips. Classical SGBM is still used when compute is tight or when the result must be explainable.

:::interview Questions you may get
- "Derive depth from disparity." By similar triangles `d = f·B/Z`, so `Z = f·B/d`.
- "Why does depth accuracy fall with distance?" `ΔZ = Z²/(fB) Δd`: a fixed disparity error is worth more and more depth at long range.
- "What is rectification and why do it?" Warp both images so that epipolar lines are rows; matching becomes a 1-D search.
- "How does SGBM improve on block matching?" It adds a smoothness penalty aggregated along several directions across the image.
- "How would you improve stereo on a white wall?" Use active illumination with a texture pattern, or use a learned model.
- "How do you detect occlusion errors?" A left-right consistency check.
:::

```quiz
? A point has a disparity of 10 pixels with f = 800 px and B = 0.1 m. What is the depth?
- 0.8 m
+ 8 m
- 80 m
> Z = f·B/d = 800 × 0.1 / 10 = 8 m.

? You double the baseline. What happens to the depth error at a given distance?
+ It is roughly halved
- It doubles
- No change
> ΔZ = Z² Δd / (f B).

? What is the purpose of rectification?
+ To make epipolar lines horizontal so that matches share the same row
- To remove noise
- To increase resolution
> It reduces stereo matching to a search along rows.

? Why do textureless walls fail in stereo?
+ Many windows look the same, so the best match is ambiguous
- The cameras cannot see them
- The disparity is always zero
> Active stereo projects a pattern to give the surface texture.
```

:::problem A robot arm uses a stereo camera 40 cm from the table, but depth is noisy and has holes on a white box. What do you change? {level=medium tags="stereo,robotics,depth"}
Think about texture, baseline and the matcher.

:::solution Model answer
Plain white faces have no texture: add an active texture projector (IR pattern) or a printed/structured light, or switch to a learned stereo network that uses context. Check the baseline and focal length for the working distance (at 40 cm a short baseline with a wide lens gives disparity range that is easy to match, but the depth error `Z²/(fB)·Δd` must be below the tolerance). Use SGBM with a suitable `numDisparities` for the near range, a left-right consistency check, speckle filtering, and fill small holes. Verify the calibration and synchronisation. Consider a ToF or structured-light depth camera if the surface is very uniform or shiny.
:::
:::

:::keypoints
- Stereo depth: `Z = f·B/d`. Near = large disparity, far = small.
- Rectify the pair so epipolar lines are rows; then match windows along rows (block matching, a cost volume).
- SGBM adds a smoothness penalty and is much better than BM. Check with left-right consistency.
- Depth error grows as `Z²/(fB)`. Textureless, occluded and shiny regions fail; active illumination and learned stereo help.
:::

:::resources
- [OpenCV: depth map from stereo images](https://docs.opencv.org/4.x/dd/d53/tutorial_py_depthmap.html) — StereoBM in a short tutorial.
- [Hirschmuller: Stereo Processing by Semiglobal Matching and Mutual Information](https://elib.dlr.de/55784/) — the SGM paper.
- [RAFT-Stereo: Multilevel Recurrent Field Transforms for Stereo Matching](https://arxiv.org/abs/2109.07547) — a modern learned stereo method.
:::
