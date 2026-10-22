---
title: Bundle Adjustment — Refining Cameras and Points Together
level: advanced
time: 50
summary: The optimisation at the heart of SfM and SLAM. The reprojection-error objective, why it is a non-linear least-squares problem, Gauss-Newton and Levenberg-Marquardt, the sparse structure that makes it fast, robust losses, and a bundle adjustment you can run with SciPy.
---

Triangulation, PnP and two-view geometry all give **estimates** with small errors. **Bundle adjustment (BA)** takes **all cameras and all 3-D points at once** and moves them slightly so that **every point projects as close as possible to where it was actually observed**. It is the gold-standard final step of SfM and the engine inside every SLAM system. The name comes from the "bundles" of rays from points to cameras that are adjusted to fit.

## The objective

We have `m` cameras with unknown poses `(Rⱼ, tⱼ)`, `n` 3-D points `Xᵢ` with unknown positions, and observations `xᵢⱼ` (pixel of point `i` in camera `j`). Minimise the total squared **reprojection error**:

:::formula Bundle adjustment
\min_{\{R_j, t_j\},\{X_i\}} \;\sum_{(i,j)\ \text{observed}} \big\| \pi\big(K, R_j X_i + t_j\big) - x_{ij} \big\|^2
:::

`π` is the perspective projection (including distortion if we include it). Intrinsics can be optimised too. It is a **non-linear least-squares** problem, because the projection (division by depth, rotation) is non-linear.

## How it is solved

Non-linear least squares is solved by iteration: linearise around the current guess, solve a linear problem for a small update, repeat.

- **Gauss–Newton**: solve `(JᵀJ) δ = −Jᵀ r` for the update `δ`, where `r` is the residual vector and `J` its Jacobian. Fast near the solution, but can overshoot far from it.
- **Levenberg–Marquardt (LM)**: add a **damping** term, `(JᵀJ + λ I) δ = −Jᵀ r`. A large `λ` takes a small, safe gradient-descent-like step; a small `λ` behaves like Gauss–Newton. LM raises or lowers `λ` depending on whether the last step reduced the error. It is the default choice.

:::analogy
Walking down a foggy hill to the lowest point. Gauss–Newton looks at the local slope and jumps to where it thinks the bottom is, which is great on a smooth bowl but risky on bumpy ground. Levenberg–Marquardt takes careful short steps when the ground is rough and long confident steps when it is smooth.
:::

## The sparse structure

For 1,000 cameras and 1,000,000 points, there are 6 × 1,000 + 3 × 1,000,000 ≈ 3 million unknowns. A dense solve would be impossible. But each observation involves **one camera and one point only**, so the Jacobian is **very sparse**, and `JᵀJ` has a special block structure: camera blocks, point blocks, and links between them. The **Schur complement** trick eliminates the (many, small) point blocks first, leaving a smaller **camera-only** system. Libraries (**Ceres**, **g2o**, **GTSAM**, **SciPy** with `jac_sparsity`, COLMAP) exploit this, so BA with millions of points runs in minutes.

## Robust loss

Squared error gives a wrong match **huge** influence. Use a **robust loss** (Huber, Cauchy, soft-L1) that grows slowly for big residuals, so outliers have limited effect. Also remove observations with large final errors and run BA again.

## Run a small bundle adjustment

We build a scene with 5 cameras and 80 points, then **perturb** the camera poses and points with noise to make a bad starting guess, and let SciPy's `least_squares` (LM-style trust region, with the sparsity pattern) refine them.

```python run title="Bundle adjustment with scipy.optimize.least_squares" level=advanced shared
import cv2
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix

rng = np.random.default_rng(5)
K = np.array([[800., 0, 320], [0, 800., 240], [0, 0, 1]])
m, n = 5, 80
X_true = rng.uniform([-1.5, -1.0, 4.0], [1.5, 1.0, 7.0], (n, 3))
cam_true = np.array([np.r_[np.array([0.0, np.deg2rad(6 * j), 0.0]), -cv2.Rodrigues(np.array([0.0, np.deg2rad(6 * j), 0.0]))[0] @ np.array([0.7 * j, 0, 0])] for j in range(m)])   # each row: rvec (3) + t (3)

def project(params, X):
    p, _ = cv2.projectPoints(X, params[:3], params[3:6], K, None)
    return p.reshape(-1, 2)

obs = np.array([project(c, X_true) + rng.normal(0, 0.5, (n, 2)) for c in cam_true])          # shape (m, n, 2): every point seen in every camera

def residuals(theta):
    cams = theta[:m * 6].reshape(m, 6)
    pts = theta[m * 6:].reshape(n, 3)
    return np.concatenate([(project(cams[j], pts) - obs[j]).ravel() for j in range(m)])

# a bad starting guess: noisy cameras and points. Camera 0 stays fixed to remove the freedom of the world frame (the "gauge").
cam0 = cam_true + rng.normal(0, 0.01, cam_true.shape); cam0[0] = cam_true[0]
pts0 = X_true + rng.normal(0, 0.15, X_true.shape)
theta0 = np.r_[cam0.ravel(), pts0.ravel()]

# the sparsity pattern: each residual depends on ONE camera (6 numbers) and ONE point (3 numbers)
A = lil_matrix((m * n * 2, m * 6 + n * 3), dtype=int)
for j in range(m):
    for i in range(n):
        rows = slice(j * n * 2 + i * 2, j * n * 2 + i * 2 + 2)
        A[rows, j * 6:(j + 1) * 6] = 1
        A[rows, m * 6 + i * 3:m * 6 + i * 3 + 3] = 1

rms = lambda theta: float(np.sqrt(np.mean(residuals(theta) ** 2)))
sol = least_squares(residuals, theta0, jac_sparsity=A, loss="huber", f_scale=2.0, x_scale="jac", method="trf", max_nfev=200)
print("RMS reprojection error  before:", round(rms(theta0), 3), "px   after:", round(rms(sol.x), 3), "px   (the added noise is 0.5 px)")
pts_est = sol.x[m * 6:].reshape(n, 3)
print("mean 3-D point error    before:", round(float(np.linalg.norm(pts0 - X_true, axis=1).mean()) * 100, 1), "cm   after:", round(float(np.linalg.norm(pts_est - X_true, axis=1).mean()) * 100, 1), "cm")
print("optimiser iterations (function evaluations):", sol.nfev, "  unknowns:", theta0.size, "  residuals:", len(sol.fun))
```

The reprojection error falls from about 20 px to about the noise level (0.5 px), and the 3-D points move from about 20 cm to about 3 cm from the truth. Note the details that every BA implementation needs:

- **Gauge freedom**: the world frame (6 numbers) plus scale are free: moving and scaling everything gives the same reprojections. We **fix camera 0** (and in monocular BA one more distance) to remove this.
- **Good initialisation**: BA only finds a **local** minimum. Start from decent estimates (from PnP and triangulation).
- **Rotation parametrisation**: use rotation vectors (3 numbers) or a local update on the manifold, not a 3 × 3 matrix with 9 numbers.
- **Outlier handling**: robust losses and pruning.

## Variants you will meet

- **Motion-only BA**: refine only the camera pose with the points fixed (that is `solvePnP` refinement).
- **Structure-only BA**: refine points only (multi-view triangulation).
- **Local BA** in SLAM: only recent keyframes and their points, to run in real time.
- **Global BA** after a loop closure or at the end of SfM.
- **Self-calibrating BA**: include focal length and distortion as unknowns.
- **Inertial BA**: add IMU residuals (preintegration factors).
- **Photometric BA**: pixel-intensity residuals (DSO).
- **Factor graphs** (GTSAM): a general framework in which BA is one special case.

:::interview Questions you may get
- "What does bundle adjustment minimise?" The sum of squared reprojection errors over all observations, over all camera poses (and possibly intrinsics) and 3-D points.
- "Why Levenberg–Marquardt instead of plain Gauss–Newton?" Damping makes it stable far from the solution; it interpolates between gradient descent and Gauss–Newton.
- "Why is BA feasible for millions of points?" The Jacobian is sparse and the normal equations have a block structure; the Schur complement eliminates points first.
- "What is the gauge freedom?" A global similarity transform of the world does not change the reprojections, so the problem has 7 free dimensions (6 for a stereo or inertial setup with scale known) which must be fixed.
- "How do you deal with outliers?" Robust loss functions, careful initialisation, and removing high-error observations.
:::

```quiz
? What residual does bundle adjustment use?
- The difference between 3-D points and a CAD model
+ The pixel difference between observed and projected image points
- The depth difference
> It is the reprojection error.

? What does the Levenberg-Marquardt damping term do?
+ Makes steps smaller and safer when the linear model is poor
- Removes the Jacobian
- Fixes the gauge
> A large λ gives gradient-descent-like steps; a small λ gives Gauss-Newton.

? What is the gauge freedom in monocular BA?
- The choice of K
+ A global rotation, translation and scale of the whole reconstruction leaves the error unchanged
- The number of cameras
> Fix some parameters (for example camera 0) to remove it.

? Which structure makes large-scale BA fast?
+ Sparsity of the Jacobian and the Schur complement trick
- A faster camera
- Using integers
> Each observation involves only one camera and one point.
```

:::problem Your bundle adjustment diverges or ends in a bad solution even though the data are good. List what you check. {level=hard tags="bundle-adjustment,debugging"}
Think about the problem formulation, not only the optimiser.

:::solution Model answer
(1) **Initialisation**: BA is non-convex; check the starting poses and points (reprojection error before BA), and use a coarse-to-fine or incremental schedule. (2) **Outliers**: wrong matches dominate the squared loss; use a robust loss and prune by residual, run BA twice. (3) **Gauge and scale**: fix a camera and a scale; otherwise the system is rank-deficient. (4) **Parametrisation**: use rotation vectors or manifold updates. (5) **Units and scaling** of variables (use `x_scale`), poorly scaled problems slow LM. (6) **Points with little parallax** (nearly at infinity) make the problem ill-conditioned: use inverse depth or drop them. (7) **Wrong intrinsics or distortion** make a consistent fit impossible: self-calibrate or fix them. (8) **Derivatives**: check the Jacobian numerically or use analytic Jacobians.
:::
:::

:::keypoints
- BA minimises the total reprojection error over all poses and points: a sparse non-linear least-squares problem.
- Solve with Levenberg–Marquardt; the Schur complement and sparsity make it scale. Use robust losses.
- Fix the gauge (world frame and scale), start from a good initial guess, and parametrise rotations properly.
- It is the last step of SfM, the core of SLAM back-ends (local and global), and the way to include intrinsics, IMU or photometric terms.
:::

:::resources
- [Triggs et al.: Bundle Adjustment — A Modern Synthesis](https://link.springer.com/chapter/10.1007/3-540-44480-7_21) — the classic reference.
- [SciPy: Large-scale bundle adjustment cookbook](https://scipy-cookbook.readthedocs.io/items/bundle_adjustment.html) — the example this lesson is based on.
- [Ceres Solver tutorial: bundle adjustment](http://ceres-solver.org/nnls_tutorial.html#bundle-adjustment) — a production-grade solver.
:::
