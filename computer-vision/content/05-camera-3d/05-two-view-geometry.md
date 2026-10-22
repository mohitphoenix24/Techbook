---
title: Two-View Geometry — Epipolar Lines, F and E
level: advanced
time: 55
summary: What two pictures of the same scene tell you. The epipolar constraint, the fundamental matrix F and the essential matrix E, the eight-point algorithm (written from scratch), recovering the relative camera motion, and why translation is only known up to scale.
---

One picture loses depth. **Two pictures** of the same scene, taken from different positions, bring it back. The geometry that connects them is the base of stereo vision, structure from motion and visual SLAM. The central idea is simple and beautiful: a point in picture 1 can only be matched along a **line** in picture 2.

## The epipolar constraint

Pick a pixel `x` in picture 1. It is a **ray** from camera 1 through the scene. Somewhere along this ray is the 3-D point. Now look at that ray from **camera 2**: the ray is seen as a **line** in picture 2. The true match of `x` must lie **on this line**. It is called the **epipolar line** of `x`.

:::analogy
Close your left eye and point at a far tree with a finger. Open the left eye and close the right: the finger seems to jump sideways, not up or down. For a pair of eyes at the same height, matches differ only **horizontally**. For general camera positions, the "line where the match can lie" is just tilted.
:::

This turns the matching problem from **2-D search** into **1-D search** (very helpful for stereo), and it gives a **test for wrong matches**.

Try it. Click a point on the left, and see its epipolar line and its true match on the right:

```viz algo=epipolar title="Click a point on the left: its match lies on the line"
```

## The fundamental matrix F

The epipolar constraint is a single equation. For a pair of matching pixels `x` (in image 1) and `x'` (in image 2), written in homogeneous coordinates `(u, v, 1)`:

:::formula The epipolar constraint
x'^{\top} F\, x = 0
:::

`F` is a 3 × 3 matrix called the **fundamental matrix**. It has rank 2 and is defined up to scale, so it has **7 degrees of freedom**. `l' = F x` is the epipolar line in image 2 for the point `x`. `F` depends on both cameras (K and K') and their relative pose. You can estimate it from **point matches alone**, with no calibration, using at least **7** (or **8**) matches.

## The essential matrix E

If the cameras are **calibrated** (we know `K`), we can use **normalised** coordinates `x̂ = K⁻¹ x` and get the simpler **essential matrix**:

:::formula Essential matrix
\hat{x}'^{\top} E\, \hat{x} = 0, \qquad E = [t]_\times R, \qquad E = K'^{\top} F\, K
:::

`E` contains **only the relative rotation `R` and translation `t`** between the cameras (`[t]×` is the 3 × 3 matrix that does a cross product with `t`). It has 5 degrees of freedom (3 rotation + 2 for the direction of `t`). From `E` we can recover `R` and the **direction** of `t`.

:::warn Scale is lost
You get the **direction** of the translation but **not its length**. A small scene seen from a short baseline and a huge scene seen from a long baseline produce identical pictures. This is the **scale ambiguity** of monocular vision. To fix scale you need something known: a known distance, a stereo pair with a known baseline, an IMU, or a depth sensor.
:::

## Eight-point algorithm from scratch

Each match gives one linear equation in the 9 numbers of `F`. With 8 matches we can solve linearly. Two details matter a lot for accuracy: **normalise** the pixel coordinates first (centre them and scale so the average distance is √2), and **force rank 2** afterwards (set the smallest singular value to 0).

```python run title="The normalised eight-point algorithm" level=advanced shared
import cv2
import numpy as np

rng = np.random.default_rng(0)
K = np.array([[700., 0, 320], [0, 700., 240], [0, 0, 1]])
X = rng.uniform([-1.2, -0.8, 3.0], [1.2, 0.8, 6.0], (80, 3))                    # 80 3-D points in front of camera 1

R_true, _ = cv2.Rodrigues(np.array([0.05, 0.20, -0.03]))                       # camera 2: turned a little and moved sideways and forward
t_true = np.array([-0.8, 0.05, 0.1])
x1, _ = cv2.projectPoints(X, np.zeros(3), np.zeros(3), K, None)
x2, _ = cv2.projectPoints(X, cv2.Rodrigues(R_true)[0], t_true, K, None)
x1 = x1.reshape(-1, 2) + rng.normal(0, 0.3, (80, 2))                            # add 0.3 pixel of noise
x2 = x2.reshape(-1, 2) + rng.normal(0, 0.3, (80, 2))

def normalise(p):
    c = p.mean(0)
    s = np.sqrt(2) / np.mean(np.linalg.norm(p - c, axis=1))
    T = np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])
    return (np.c_[p, np.ones(len(p))] @ T.T)[:, :2], T

def eight_point(p1, p2):
    n1, T1 = normalise(p1)
    n2, T2 = normalise(p2)
    u1, v1, u2, v2 = n1[:, 0], n1[:, 1], n2[:, 0], n2[:, 1]
    A = np.c_[u2 * u1, u2 * v1, u2, v2 * u1, v2 * v1, v2, u1, v1, np.ones(len(p1))]     # one row per match: x'^T F x = 0
    _, _, Vt = np.linalg.svd(A)
    F = Vt[-1].reshape(3, 3)                                                      # the null vector of A
    U, S, Vt = np.linalg.svd(F)
    F = U @ np.diag([S[0], S[1], 0]) @ Vt                                         # force rank 2
    F = T2.T @ F @ T1                                                             # undo the normalisation
    return F / np.linalg.norm(F)

F_mine = eight_point(x1, x2)
F_cv, _ = cv2.findFundamentalMat(x1, x2, cv2.FM_8POINT)

def residual(F):                                                                  # mean distance of the points to their epipolar lines (pixels)
    h1, h2 = np.c_[x1, np.ones(80)], np.c_[x2, np.ones(80)]
    lines = h1 @ F.T
    return float(np.mean(np.abs(np.sum(lines * h2, 1)) / np.hypot(lines[:, 0], lines[:, 1])))

print("rank of my F:", np.linalg.matrix_rank(F_mine), "(must be 2)")
print("mean distance to the epipolar line  mine:", round(residual(F_mine), 3), "px   OpenCV:", round(residual(F_cv / np.linalg.norm(F_cv)), 3), "px")
```

The distance of each matched point to its predicted epipolar line is a fraction of a pixel (about the noise we added). That is the test that a `F` is good.

## From F to the camera motion

Calibrated, we get `E = K'ᵀ F K`, and `cv2.recoverPose` decomposes it. `E` has **four** possible `(R, t)` solutions; the right one puts the points **in front of both cameras** (the **cheirality** check), which `recoverPose` does for you.

```python run title="Recover the relative pose from E" level=advanced shared
E, mask = cv2.findEssentialMat(x1, x2, K, method=cv2.RANSAC, prob=0.999, threshold=1.0)
n, R_est, t_est, _ = cv2.recoverPose(E, x1, x2, K)
angle_err = np.degrees(np.arccos(np.clip((np.trace(R_est.T @ R_true) - 1) / 2, -1, 1)))
t_dir_true = t_true / np.linalg.norm(t_true)
print("inliers:", int(mask.sum()), "of", len(x1))
print("rotation error:", round(float(angle_err), 3), "degrees")
print("true direction of t     :", np.round(t_dir_true, 3))
print("estimated direction of t:", np.round(t_est.ravel(), 3), "(unit length: the scale is unknown)")
print("angle between them:", round(float(np.degrees(np.arccos(np.clip(t_dir_true @ t_est.ravel(), -1, 1)))), 3), "degrees")
print("|t_est| =", round(float(np.linalg.norm(t_est)), 3), " (always 1) while |t_true| =", round(float(np.linalg.norm(t_true)), 3))
```

With only 0.3 pixels of noise, the rotation is recovered to about half a degree and the direction of the translation to about two degrees. But its length comes out as exactly 1: that is just the unit length we chose. That is the scale ambiguity again.

## Outliers: use RANSAC

Real matches contain wrong ones. Use `cv2.findFundamentalMat(..., cv2.FM_RANSAC, threshold, 0.999)` or `cv2.findEssentialMat(..., cv2.RANSAC, ...)`. The minimal samples are 7 or 8 points for F and **5 points** for E (the five-point algorithm of Nistér). Fewer points per sample means RANSAC needs far fewer iterations for E.

```python run title="Essential matrix with outliers" level=advanced shared
y1, y2 = x1.copy(), x2.copy()
bad = rng.choice(80, 24, replace=False)                                           # 30% wrong matches
y2[bad] = rng.uniform([0, 0], [640, 480], (24, 2))
E_plain, _ = cv2.findEssentialMat(y1, y2, K, method=cv2.LMEDS)
E_ransac, m = cv2.findEssentialMat(y1, y2, K, method=cv2.RANSAC, prob=0.999, threshold=1.0)
for name, EE in (("least-median", E_plain), ("RANSAC", E_ransac)):
    _, R, t, _ = cv2.recoverPose(EE, y1, y2, K)
    err = np.degrees(np.arccos(np.clip((np.trace(R.T @ R_true) - 1) / 2, -1, 1)))
    print(f"{name:13s} rotation error {err:.2f} deg   direction error {np.degrees(np.arccos(np.clip(t_dir_true @ t.ravel(), -1, 1))):.2f} deg")
print("RANSAC inliers:", int(m.sum()), "(true inliers: 56)")
```

## Special cases to know

- **Pure rotation** (camera turns about its centre, `t = 0`): `E` is zero and the relation is a **homography** (the panorama case). Epipolar geometry is **degenerate**.
- **A planar scene**: the two views are related by a homography; `F` is not uniquely determined. Check which model fits better.
- **Pure sideways translation, no rotation (rectified stereo)**: epipolar lines are **horizontal** and matches have the same row. This is what rectification produces (next lesson).
- **Forward motion** (like a car driving): the epipoles are near the image centre, and epipolar lines fan out from it. Depth estimation is harder near the direction of motion.

:::interview Questions you may get
- "What is the epipolar constraint?" A match of `x` in image 1 lies on the line `F x` in image 2: `x'ᵀ F x = 0`.
- "Difference between F and E?" F works in pixels for uncalibrated cameras (7 DOF, rank 2). E works in normalised coordinates, encodes only R and t (5 DOF) and `E = K'ᵀ F K`.
- "How many points do you need?" 8 (linear) or 7 for F; 5 for E.
- "What can you not recover from two views of a monocular camera?" The scale of the translation (and so the scene).
- "How do you choose among the four decompositions of E?" Triangulate points; the right one has positive depth in both cameras (cheirality).
- "What happens for a pure rotation?" No parallax: E degenerates; use a homography.
:::

```quiz
? A point x in image 1 can match only points on...
- A single pixel in image 2
+ The epipolar line l' = F x in image 2
- Any pixel
> That is the epipolar constraint, which reduces matching to a 1-D search.

? How many degrees of freedom does the essential matrix have?
- 3
+ 5
- 9
> Three for rotation and two for the direction of translation.

? From two views of one calibrated camera, which is unknown?
- The rotation
- The direction of the translation
+ The length (scale) of the translation
> You get the direction only; scale needs extra information.

? Why normalise pixel coordinates in the eight-point algorithm?
+ Raw pixel values make the linear system badly conditioned, giving a poor estimate
- To make the points lie on a line
- To enforce rank 2
> Centring and scaling greatly improve numerical accuracy.
```

:::problem A monocular robot camera moves 0.5 m forward and you compute the essential matrix. How do you recover the real translation, and what are your options if no other sensor exists? {level=hard tags="essential-matrix,scale,slam"}
Think about what fixes the scale.

:::solution Model answer
The essential matrix gives only the direction of the motion; its length is arbitrary (unit length by convention). To get metric scale: (a) use a **known size** in the scene (a marker, a known object, a distance) and scale the reconstruction; (b) use the **known camera height** above a flat ground plane (common for cars and robots): measure the plane from triangulated points; (c) add an **IMU** (visual-inertial odometry), whose accelerations give metric scale; (d) use a **stereo pair** with a known baseline or a depth sensor; (e) use a **learned metric depth** model as a weak prior. Without any of these, a monocular system is correct only up to an unknown global scale (and its scale drifts over time).
:::
:::

:::keypoints
- A pixel in one image maps to an epipolar line in the other: `x'ᵀ F x = 0`. This makes matching 1-D and tests matches.
- F (7 DOF, rank 2) works with pixels; E = K'ᵀ F K (5 DOF) holds only R and the direction of t.
- Eight-point: normalise, solve the null vector by SVD, force rank 2. Five-point for E. Use RANSAC with outliers.
- `recoverPose` picks the physically valid (R, t) by cheirality. The translation scale is unknowable from images alone.
:::

:::resources
- [OpenCV: epipolar geometry tutorial](https://docs.opencv.org/4.x/da/de9/tutorial_py_epipolar_geometry.html) — F and epipolar lines with pictures.
- [Hartley: In Defense of the Eight-Point Algorithm](https://www.cs.cmu.edu/~16385/s17/Slides/12.4_8Point_Algorithm.pdf) — why normalisation matters.
- [Nister: An Efficient Solution to the Five-Point Relative Pose Problem](https://ieeexplore.ieee.org/document/1288525) — the E matrix from five points.
:::
