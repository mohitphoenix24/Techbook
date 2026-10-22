---
title: Triangulation — From Two Rays to a 3-D Point
level: advanced
time: 40
summary: Where is the point in 3-D, given two views? Intersect the two rays. The linear (DLT) method written from scratch, cv2.triangulatePoints, the reprojection error, and why a small baseline gives a noisy depth.
---

You know how two cameras are placed (their projection matrices `P1`, `P2`), and you matched a point between the two pictures: `x1` in the first, `x2` in the second. **Triangulation** finds the 3-D point `X` that projects to both. It is the step that creates 3-D structure in stereo, SfM and SLAM.

## The idea: two rays

Each pixel defines a **ray** from its camera centre. In a perfect world the two rays **cross** at the 3-D point. With noise they **miss each other** slightly (they are skew lines). We look for the point that is the best compromise.

:::analogy
Two people in a field point at the same bird. Each pointing arm is a line. Where the two lines cross is the bird. If both are nearly pointing in the same direction (they stand close together), the crossing point is hard to locate: a tiny error in either arm moves the crossing a lot. If they stand far apart, at right angles, the crossing is sharp. That is exactly the effect of the **baseline**.
:::

## Linear triangulation (DLT)

The projection says `x ∼ P X`, which means the cross product `x × (P X) = 0`. Written out, each view gives **two linear equations** in the four unknown numbers of `X = (X, Y, Z, W)`:

:::formula Two equations per view
u\,(\mathbf p_3^{\top} X) - \mathbf p_1^{\top} X = 0, \qquad v\,(\mathbf p_3^{\top} X) - \mathbf p_2^{\top} X = 0
:::

where `p1, p2, p3` are the rows of `P`. Two views give 4 equations. Stack them into a matrix `A` (4 × 4); the solution of `A X = 0` is the right singular vector of `A` with the smallest singular value.

```python run title="Triangulation from scratch" level=advanced shared
import cv2
import numpy as np

K = np.array([[700., 0, 320], [0, 700., 240], [0, 0, 1]])
R2, _ = cv2.Rodrigues(np.array([0.0, -0.15, 0.0]))
t2 = np.array([[-0.5], [0.0], [0.05]])                              # camera 2 is 0.5 m to the side and turned a bit
P1 = K @ np.hstack([np.eye(3), np.zeros((3, 1))])
P2 = K @ np.hstack([R2, t2])

X_true = np.array([0.4, -0.2, 4.0])                                 # a point 4 m away
def project(P, X):
    x = P @ np.append(X, 1.0)
    return x[:2] / x[2]
x1, x2 = project(P1, X_true), project(P2, X_true)
print("pixel in view 1:", np.round(x1, 2), "  pixel in view 2:", np.round(x2, 2))

def triangulate_dlt(P1, P2, x1, x2):
    A = np.stack([x1[0] * P1[2] - P1[0],
                  x1[1] * P1[2] - P1[1],
                  x2[0] * P2[2] - P2[0],
                  x2[1] * P2[2] - P2[1]])
    _, _, Vt = np.linalg.svd(A)
    X = Vt[-1]
    return X[:3] / X[3]                                              # from homogeneous to ordinary coordinates

print("my triangulation  :", np.round(triangulate_dlt(P1, P2, x1, x2), 4), " (true", X_true, ")")
cv_X = cv2.triangulatePoints(P1, P2, x1.reshape(2, 1), x2.reshape(2, 1))
print("cv2.triangulatePoints:", np.round((cv_X[:3] / cv_X[3]).ravel(), 4))
```

With perfect pixels we recover the point exactly. `cv2.triangulatePoints` takes `2 × N` arrays and returns homogeneous `4 × N` points: **divide by the last row**.

## What happens with noise?

Add a half-pixel error to the pixels and measure how far the result lands from the truth, for different baselines. We repeat 500 times and report the **spread** of the estimated depth.

```python run title="Depth noise versus baseline" level=advanced shared
rng = np.random.default_rng(0)
print("baseline   angle between the rays   depth std. deviation (500 noisy trials)")
for baseline in (0.05, 0.2, 0.5, 1.0):
    t = np.array([[-baseline], [0.0], [0.0]])
    Pa = K @ np.hstack([np.eye(3), np.zeros((3, 1))])
    Pb = K @ np.hstack([np.eye(3), t])
    depths = []
    for _ in range(500):
        a = project(Pa, X_true) + rng.normal(0, 0.5, 2)
        b = project(Pb, X_true) + rng.normal(0, 0.5, 2)
        depths.append(triangulate_dlt(Pa, Pb, a, b)[2])
    angle = np.degrees(2 * np.arctan(baseline / 2 / X_true[2]))
    print(f"{baseline:6.2f} m {angle:12.2f} degrees {np.std(depths) * 100:18.1f} cm")
```

A wider baseline means a larger angle between the rays and a far more precise depth. A rule of thumb in SfM and SLAM: **triangulate only when the angle is above about 1–3 degrees**; below that the depth is unreliable. This is also why a monocular SLAM system needs the camera to **move sideways** (not just forward or rotate) to create depth.

## Reprojection error and cheirality

To check a triangulated point, project it back into each view and compare with the observed pixels: the **reprojection error**. A point with a large error is probably a wrong match: **reject it**. Also check that the depth is **positive in both cameras** (the point must be in front of them: the **cheirality** test).

```python run title="Check a triangulated point" level=advanced shared
def reprojection_error(P, X, x):
    return float(np.linalg.norm(project(P, X) - x))

a = project(P1, X_true) + rng.normal(0, 0.4, 2)
b = project(P2, X_true) + rng.normal(0, 0.4, 2)
X_est = triangulate_dlt(P1, P2, a, b)
print("good match: reprojection errors:", round(reprojection_error(P1, X_est, a), 2), round(reprojection_error(P2, X_est, b), 2), "px")

b_wrong = b + np.array([25.0, 18.0])                                 # a wrong match
X_bad = triangulate_dlt(P1, P2, a, b_wrong)
print("wrong match: reprojection errors:", round(reprojection_error(P1, X_bad, a), 2), round(reprojection_error(P2, X_bad, b_wrong), 2), "px   -> reject")
z1 = X_est[2]; z2 = (np.hstack([R2, t2]) @ np.append(X_est, 1))[2]
print("depth in camera 1 / camera 2 (both must be positive):", round(float(z1), 2), "/", round(float(z2), 2))
```

## Better than DLT

The linear method minimises an algebraic error, not the pixel error. Improvements:

- **Non-linear refinement**: minimise the actual reprojection error (the **optimal** two-view triangulation of Hartley and Sturm).
- **Many views**: a point seen in `n` cameras gives `2n` equations. The same SVD works with a taller matrix. More views, much better accuracy.
- **Midpoint method**: the middle of the shortest segment between the two rays. Simple and intuitive, but biased.
- In **bundle adjustment** (two lessons ahead) all points and cameras are refined together.

:::interview Questions you may get
- "How do you triangulate a 3-D point from two views?" Build the 4×4 system from `u·p₃ − p₁` and `v·p₃ − p₂` for each view and solve `A X = 0` by SVD (DLT), then refine by minimising reprojection error.
- "Why does a small baseline give bad depth?" The rays are almost parallel, so a small pixel error moves the intersection a lot (depth error grows like `Z²/(fB)`).
- "How do you filter bad triangulations?" Reprojection error, positive depth in all views (cheirality), and a minimum triangulation angle.
- "Why can a rotating-only camera not triangulate?" With no translation there is no parallax, so the rays share the same origin and never give depth.
:::

```quiz
? OpenCV's triangulatePoints returns homogeneous points. What do you do next?
- Nothing, they are ready
+ Divide the first three rows by the fourth
- Multiply by K
> The result is (X, Y, Z, W); the 3-D point is (X/W, Y/W, Z/W).

? Which setup gives the most accurate depth for a point 4 m away?
- A baseline of 5 cm
+ A baseline of 1 m
- No baseline
> A larger baseline gives a bigger angle between the rays.

? What does a large reprojection error of a triangulated point suggest?
+ The match is probably wrong (or the calibration is off)
- The point is very far away
- The baseline is too long
> Reproject and reject outliers.

? Why can a camera that only rotates not triangulate?
+ There is no translation, so no parallax between the rays
- The rotation is too small
- K is unknown
> You need different viewpoints.
```

:::problem In a monocular SLAM system, a new point is first seen in frame 10 and again in frame 11, 2 cm apart from the first. Should you triangulate it? What do you do instead? {level=medium tags="triangulation,slam"}
Think about the triangulation angle.

:::solution Model answer
With a 2 cm baseline at a typical depth of several metres, the triangulation angle is a fraction of a degree, so the depth would be extremely uncertain. Do not trust a point triangulated from the first pair. Instead keep it as an **immature** point or a depth hypothesis with a large uncertainty (an inverse-depth parameter with a prior, as in DSO or in the feature-initialisation of MonoSLAM) and keep tracking it. Update it as the camera moves, and only promote it to a map point when the parallax angle (for example above 1–3 degrees) and the reprojection error say it is well determined. ORB-SLAM uses keyframes with enough baseline for the same reason.
:::
:::

:::keypoints
- Triangulation intersects the two viewing rays. DLT solves `A X = 0` with SVD; `cv2.triangulatePoints` does it (divide by the last row).
- Accuracy depends on the angle between the rays: a bigger baseline gives better depth.
- Check points with reprojection error, positive depth in all views and a minimum parallax angle.
- More views and non-linear refinement improve accuracy; bundle adjustment refines everything together.
:::

:::resources
- [OpenCV: triangulatePoints](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html) — the function reference.
- [Hartley and Sturm: Triangulation (1997)](https://www.sciencedirect.com/science/article/pii/S1077314297905476) — the optimal two-view method.
- [Multiple View Geometry, chapter 12: Structure computation](https://www.robots.ox.ac.uk/~vgg/hzbook/) — triangulation in depth.
:::
