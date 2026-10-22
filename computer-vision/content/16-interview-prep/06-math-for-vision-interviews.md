---
title: The Maths You Need for Vision Interviews
level: advanced
time: 90
summary: Linear algebra (SVD, least squares, null spaces, PCA, rotations), probability and statistics (Bayes, Gaussians, Mahalanobis, bootstrap), optimisation (gradient descent, Gauss-Newton), 3-D geometry (rotations, quaternions, SE(3), camera centre) and signals, each with a runnable check and the questions interviewers actually ask.
---

You do not need a maths degree to pass a vision interview, but you do need **a small set of tools you can use fluently**: SVD and least squares, rotations, Gaussians and Bayes, gradients, and the Fourier view. Each section below states the idea in plain language, verifies it in code you can run, and ends with typical questions.

## 1. Linear algebra

**Vectors and products.** The **dot product** `a·b = |a||b|cos θ` measures alignment (cosine similarity is the dot product of unit vectors). The **cross product** `a × b` is perpendicular to both with length `|a||b| sin θ`; it can be written as a matrix, `a × b = [a]ₓ b`, with the skew-symmetric matrix `[a]ₓ`. Lines through two homogeneous points: `l = p × q`; intersection of two lines: `p = l₁ × l₂`.

**Rank, null space, inverse.** A matrix `A` (m×n) has rank r = number of independent rows/columns. The **null space** is `{x : A x = 0}`. Square matrices with full rank are invertible; **never invert explicitly**, solve `A x = b` instead (`np.linalg.solve`).

**Eigen-decomposition** (`A v = λ v`, symmetric matrices have real eigenvalues and orthogonal eigenvectors) and **SVD** (`A = U Σ Vᵀ`, any matrix; `U`, `V` orthogonal, `Σ` diagonal and non-negative) are the workhorses:

| Question | Tool |
|---|---|
| Best-fit solution of `A x ≈ b` (least squares) | `x = argmin |Ax − b|²`: normal equations `(AᵀA) x = Aᵀb`, or better QR/SVD (pseudo-inverse `A⁺ = V Σ⁺ Uᵀ`) |
| Solution of `A x = 0` with `|x| = 1` (homography, fundamental matrix, triangulation, camera centre) | the **right singular vector for the smallest singular value** of `A` |
| Best rank-k approximation, compression, denoising | truncate the SVD (Eckart-Young) |
| Principal components of data | SVD of the centred data matrix (or eigenvectors of the covariance) |
| Nearest rotation matrix to a noisy 3×3 matrix | SVD: `R = U Vᵀ` (fix `det = +1`) |
| Conditioning of a problem | ratio of largest to smallest singular value (condition number) |

```python run title="SVD in action: least squares, the null space, total least squares, PCA and the nearest rotation" level=advanced
import numpy as np
from sklearn.decomposition import PCA

rng = np.random.default_rng(0)

# 1. least squares: fit y = a x + b with noise; SVD (lstsq) versus the normal equations
x = rng.uniform(0, 10, 50); y = 2.0 * x + 1.0 + rng.normal(0, 0.5, 50)
A = np.c_[x, np.ones_like(x)]
sol_lstsq = np.linalg.lstsq(A, y, rcond=None)[0]
sol_normal = np.linalg.solve(A.T @ A, A.T @ y)
print("least squares  a, b =", np.round(sol_lstsq, 3), "| normal equations:", np.round(sol_normal, 3))

# 2. null space: homogeneous system A h = 0 -> smallest right singular vector
H_true = np.array([[1.2, 0.1, 30], [-0.1, 0.9, 20], [1e-3, 2e-4, 1.0]])
src = rng.uniform(0, 500, (8, 2)); q = np.c_[src, np.ones(8)] @ H_true.T; dst = q[:, :2] / q[:, 2:3]
rows = []
for (a, b), (u, v) in zip(src, dst):
    rows += [[-a, -b, -1, 0, 0, 0, u * a, u * b, u], [0, 0, 0, -a, -b, -1, v * a, v * b, v]]
_, S, Vt = np.linalg.svd(np.array(rows))
H = Vt[-1].reshape(3, 3); H /= H[2, 2]
print("homography from the null space of A: error vs truth", float(np.abs(H - H_true).max()), "| smallest singular value", float(S[-1]))

# 3. total least squares vs ordinary least squares for a line with noise in BOTH coordinates
t = rng.uniform(0, 10, 200); px = t + rng.normal(0, 1.0, 200); py = 0.5 * t + rng.normal(0, 1.0, 200)
slope_ols = np.polyfit(px, py, 1)[0]
P = np.c_[px, py] - np.c_[px, py].mean(0); direction = np.linalg.svd(P)[2][0]
print(f"true slope 0.5 | OLS slope {slope_ols:.3f} (biased low: it assumes x is exact) | TLS slope {direction[1] / direction[0]:.3f}")

# 4. PCA through SVD equals scikit-learn's PCA
X = rng.normal(0, 1, (200, 5)) @ rng.normal(0, 1, (5, 5)); Xc = X - X.mean(0)
U, S, Vt = np.linalg.svd(Xc, full_matrices=False)
explained = S ** 2 / (S ** 2).sum()
print("explained variance ratios from SVD:", np.round(explained, 3), "| scikit-learn:", np.round(PCA().fit(X).explained_variance_ratio_, 3))

# 5. nearest rotation to a noisy matrix (Procrustes)
a = np.deg2rad(30); R_true = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
M = R_true + rng.normal(0, 0.05, (3, 3))
U, _, Vt = np.linalg.svd(M); R = U @ np.diag([1, 1, np.linalg.det(U @ Vt)]) @ Vt
print("projected matrix is a rotation: R^T R = I ->", bool(np.allclose(R.T @ R, np.eye(3))), "| det =", round(float(np.linalg.det(R)), 6), "| error vs true rotation", round(float(np.abs(R - R_true).max()), 3))
```

**Quick facts to have ready**

- `trace(A) = Σ eigenvalues`, `det(A) = Π eigenvalues`; a matrix is positive definite iff all eigenvalues > 0 (covariances are PSD).
- The singular values of `A` are the square roots of the eigenvalues of `AᵀA`.
- Orthogonal matrices preserve lengths and angles (`QᵀQ = I`); rotations have `det = +1`; reflections have `det = −1`.
- A **covariance matrix** `Σ` describes an ellipsoid whose axes are its eigenvectors and half-lengths are the square roots of its eigenvalues.

## 2. Probability and statistics

- **Gaussian** `N(μ, σ²)`: the maximum-likelihood estimates are the sample mean and variance (divide by `n`; the unbiased estimate divides by `n − 1`). Sums of Gaussians are Gaussian; the product of Gaussians is (proportional to) a Gaussian, which is why the Kalman filter works in closed form.
- **Bayes' rule**: `P(A | B) = P(B | A) P(A) / P(B)`. For classifiers: `posterior ∝ likelihood × prior`. **Base rates matter**: a 99%-accurate defect detector on a 0.1%-defect line produces mostly false alarms (below).
- **Mahalanobis distance** `d² = (x − μ)ᵀ Σ⁻¹ (x − μ)`: distance in units of standard deviations, accounting for correlations; used for tracking gates and anomaly scores.
- **Entropy, cross-entropy, KL**: `H(p) = −Σ p log p`, cross-entropy `H(p, q) = −Σ p log q = H(p) + KL(p‖q)`. Minimising cross-entropy against fixed labels = minimising KL = maximum likelihood.
- **MLE versus MAP**: MAP adds a prior; a Gaussian prior on weights = **L2 regularisation**, a Laplace prior = **L1**.
- **Bias-variance**: error = bias² + variance + noise; more data and regularisation reduce variance, a richer model reduces bias.
- **Confidence intervals**: accuracy from `n` test images has standard error `√(p(1−p)/n)`; the bootstrap resamples the test set to estimate it for any metric.

```python run title="Base rates, Mahalanobis gating and a bootstrap confidence interval" level=intermediate
import numpy as np

# Bayes: a "99% accurate" defect detector on a line where 1 part in 1000 is defective
sens, spec, prevalence = 0.99, 0.99, 0.001
p_alarm = sens * prevalence + (1 - spec) * (1 - prevalence)
ppv = sens * prevalence / p_alarm
print(f"P(defect | alarm) = {ppv:.3f}  -> only {ppv:.0%} of alarms are real defects, although sensitivity and specificity are both 99%")
for prev in (0.001, 0.01, 0.1):
    print(f"   prevalence {prev:>5}: precision {sens * prev / (sens * prev + (1 - spec) * (1 - prev)):.3f}")

# Mahalanobis distance: the same Euclidean distance means different things when the data are correlated
rng = np.random.default_rng(0)
cov = np.array([[4.0, 3.5], [3.5, 4.0]])                                  # strongly correlated: elongated along the diagonal
data = rng.multivariate_normal([0, 0], cov, 2000)
mu, S = data.mean(0), np.cov(data.T); Sinv = np.linalg.inv(S)
for name, p in [("along the main axis, (3, 3)", np.array([3.0, 3.0])), ("across it, (3, -3)", np.array([3.0, -3.0]))]:
    d = p - mu
    print(f"point {name:<28} Euclidean {np.linalg.norm(d):.2f} | Mahalanobis {np.sqrt(d @ Sinv @ d):.2f}")
print("same Euclidean distance, very different Mahalanobis distance: the second point is far outside the cloud (a tracking gate would reject it)")

# bootstrap CI for an accuracy measured on 200 test images
correct = rng.random(200) < 0.92
boots = [rng.choice(correct, 200, replace=True).mean() for _ in range(5000)]
lo, hi = np.percentile(boots, [2.5, 97.5])
print(f"measured accuracy {correct.mean():.3f}, 95% bootstrap interval [{lo:.3f}, {hi:.3f}] (formula: +/- {1.96 * np.sqrt(correct.mean() * (1 - correct.mean()) / 200):.3f})")
print("with 200 images, a 2-point difference between two models is usually NOT significant")
```

## 3. Calculus and optimisation

- **Gradient** = vector of partial derivatives (direction of steepest increase); **Jacobian** = matrix of partials of a vector function; **chain rule** = multiply Jacobians (backpropagation is the chain rule applied efficiently, from the output backwards).
- **Gradient descent** `θ ← θ − η ∇L(θ)`: the learning rate η controls stability. For a quadratic with curvature `λ_max`, it diverges when `η > 2/λ_max`.
- **Momentum / Adam** smooth and rescale the gradient. **Convex** problems have one global minimum; neural-network losses are non-convex but trainable.
- **Gauss-Newton / Levenberg-Marquardt** (geometry's favourite): for non-linear least squares `min Σ rᵢ(θ)²` linearise the residuals, `r(θ + δ) ≈ r + J δ`, and solve `(JᵀJ) δ = −Jᵀr`. **LM** adds a damping `λI` to blend with gradient descent when far from the solution. This is what PnP refinement, calibration and bundle adjustment run.

```python run title="Gauss-Newton and Levenberg-Marquardt on a circle fit, learning-rate stability, and a gradient check" level=advanced
import numpy as np
from scipy.optimize import least_squares

rng = np.random.default_rng(0)
theta = rng.uniform(0, 2 * np.pi, 60)
pts = np.c_[5 + 3 * np.cos(theta), -2 + 3 * np.sin(theta)] + rng.normal(0, 0.1, (60, 2))       # noisy points on a circle: centre (5, -2), radius 3

def residuals(p):                                                          # p = (cx, cy, r): distance to the circle minus radius
    return np.hypot(pts[:, 0] - p[0], pts[:, 1] - p[1]) - p[2]
def jacobian(p):
    d = np.hypot(pts[:, 0] - p[0], pts[:, 1] - p[1])
    return np.c_[-(pts[:, 0] - p[0]) / d, -(pts[:, 1] - p[1]) / d, -np.ones(len(pts))]

def gauss_newton(p0, iters=8, damping=0.0, verbose=False):
    p = np.array(p0, float); lam = damping; cost = np.sum(residuals(p) ** 2)
    for it in range(iters):
        r, J = residuals(p), jacobian(p)
        step = np.linalg.solve(J.T @ J + lam * np.eye(3), -J.T @ r)       # (J^T J + lambda I) step = -J^T r : lambda = 0 is plain Gauss-Newton
        new_cost = np.sum(residuals(p + step) ** 2)
        if damping and new_cost > cost: lam *= 10; continue              # Levenberg-Marquardt: a worse step -> more damping (more like gradient descent)
        if damping: lam = max(lam / 10, 1e-6)
        p, cost = p + step, new_cost
        if verbose: print(f"  iteration {it + 1}: cost {cost:.5f}  parameters {np.round(p, 3)}")
    return p, cost

centroid_start = [pts[:, 0].mean(), pts[:, 1].mean(), 2.0]                  # a sensible start: the centroid and a guessed radius
print("plain Gauss-Newton from a sensible start:")
p, c = gauss_newton(centroid_start, 6, verbose=True)
bad = [0.0, 0.0, 1.0]
p_gn, c_gn = gauss_newton(bad, 8)
p_lm, c_lm = gauss_newton(bad, 40, damping=1.0)
print(f"from a poor start (0, 0, 1): plain Gauss-Newton ends with cost {c_gn:.1f} (it overshoots and wanders), Levenberg-Marquardt with cost {c_lm:.5f} -> {np.round(p_lm, 3)}")
ref = least_squares(residuals, bad, method="lm")
print("scipy Levenberg-Marquardt:", np.round(ref.x, 3), "| true circle: [5, -2, 3]")

# learning-rate stability on f(x) = 0.5 * lam * x^2 (curvature lam = 10): converges only for lr < 2 / lam = 0.2
lam = 10.0
for lr in (0.05, 0.19, 0.21):
    x = 1.0
    for _ in range(50): x -= lr * lam * x
    print(f"learning rate {lr:>4}: |x| after 50 steps = {abs(x):.3e}  ({'converges' if abs(x) < 1 else 'diverges'})")

# numerical gradient check of an analytic gradient
f = lambda w: np.sum(np.log1p(np.exp(-(w @ np.array([[1.0, 2.0], [-1.0, 0.5]]).T)))) # a logistic-like loss
w0 = np.array([0.3, -0.7]); eps = 1e-6
num = np.array([(f(w0 + eps * e) - f(w0 - eps * e)) / (2 * eps) for e in np.eye(2)])
Xd = np.array([[1.0, 2.0], [-1.0, 0.5]]); z = Xd @ w0
ana = (-(Xd.T * (1 / (1 + np.exp(z)))).sum(1))
print("numerical vs analytic gradient:", np.round(num, 6), np.round(ana, 6))
```

## 4. 3-D geometry

- **Rotations** are 3×3 orthogonal matrices with `det = +1` (the group SO(3)): 3 degrees of freedom. Compose by multiplication (**order matters**: `R₂R₁` applies `R₁` first); the inverse is the transpose.
- **Axis-angle** (rotation vector `r = θ·n`) ↔ matrix by **Rodrigues**: `R = I + sin θ [n]ₓ + (1 − cos θ)[n]ₓ²`.
- **Quaternions** `q = (w, x, y, z)`, unit norm: `w = cos(θ/2)`, `(x, y, z) = n sin(θ/2)`; composition by the Hamilton product; `q` and `−q` are the same rotation; SLERP interpolates; no gimbal lock.
- **Rigid transform (SE(3))**: `T = [R t; 0 1]`; the inverse is `[Rᵀ, −Rᵀt; 0, 1]` (not `[Rᵀ, −t]`!); compose by multiplication.
- **Camera centre** from `P = [M | p₄]` is `C = −M⁻¹ p₄` (the null space of `P`). The principal ray direction is the third row of `M`.
- **Vanishing points**: images of parallel 3-D lines meet at a point `v = K d` for direction `d`; the horizon is the line through the vanishing points of the ground-plane directions.
- **Reprojection error** = pixel distance between a measured point and the projection of its estimated 3-D point; the quantity minimised in calibration, PnP and BA.

```python run title="Rotations, quaternions, SE(3) and the camera centre" level=advanced
import numpy as np
import cv2
from scipy.spatial.transform import Rotation as Rot

rng = np.random.default_rng(1)
rvec = rng.normal(0, 0.6, 3)
R_cv = cv2.Rodrigues(rvec)[0]
R_sp = Rot.from_rotvec(rvec).as_matrix()
print("Rodrigues (OpenCV) equals SciPy's rotation vector conversion:", bool(np.allclose(R_cv, R_sp)))
print("R^T R = I:", bool(np.allclose(R_cv.T @ R_cv, np.eye(3))), "| det R =", round(float(np.linalg.det(R_cv)), 6))

# composition order matters
Rx = Rot.from_euler("x", 90, degrees=True).as_matrix(); Rz = Rot.from_euler("z", 90, degrees=True).as_matrix()
p = np.array([1.0, 0, 0])
print("Rz then Rx applied to (1,0,0):", np.round(Rx @ Rz @ p, 3), "| Rx then Rz:", np.round(Rz @ Rx @ p, 3), " <- different")

# quaternion: Hamilton product versus matrix product
def qmul(a, b):
    w1, x1, y1, z1 = a; w2, x2, y2, z2 = b
    return np.array([w1*w2 - x1*x2 - y1*y2 - z1*z2, w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2])
r1, r2 = Rot.from_rotvec([0.3, -0.2, 0.5]), Rot.from_rotvec([-0.4, 0.1, 0.2])
q1 = np.r_[r1.as_quat()[3], r1.as_quat()[:3]]; q2 = np.r_[r2.as_quat()[3], r2.as_quat()[:3]]                  # SciPy stores (x, y, z, w); here we use (w, x, y, z)
q12 = qmul(q1, q2)
R12 = Rot.from_quat(np.r_[q12[1:], q12[0]]).as_matrix()
print("quaternion product equals the matrix product R1 @ R2:", bool(np.allclose(R12, r1.as_matrix() @ r2.as_matrix())))

# SE(3): the inverse of a rigid transform
t = np.array([0.5, -1.0, 2.0]); T = np.eye(4); T[:3, :3], T[:3, 3] = R_cv, t
Tinv = np.eye(4); Tinv[:3, :3], Tinv[:3, 3] = R_cv.T, -R_cv.T @ t
print("T @ T_inv = I:", bool(np.allclose(T @ Tinv, np.eye(4))), "| wrong inverse [R^T, -t] gives I:", bool(np.allclose(T @ np.block([[R_cv.T, -t[:, None]], [np.zeros((1, 3)), np.ones((1, 1))]]), np.eye(4))))

# camera centre from the projection matrix P = K [R | t]  ->  C = -R^T t = -M^-1 p4
K = np.array([[800, 0, 320], [0, 800, 240], [0, 0, 1.0]])
P = K @ np.c_[R_cv, t]
C = -np.linalg.inv(P[:, :3]) @ P[:, 3]
print("camera centre from P:", np.round(C, 4), "| -R^T t:", np.round(-R_cv.T @ t, 4), "| P @ [C, 1] = 0:", bool(np.allclose(P @ np.r_[C, 1], 0)))
_, _, Vt = np.linalg.svd(P); C_svd = Vt[-1][:3] / Vt[-1][3]
print("same centre as the null space of P (SVD):", bool(np.allclose(C_svd, C)))
```

## 5. Signals and sampling

- **Fourier transform**: represents a signal as sinusoids; **convolution in space = multiplication in frequency**. A Gaussian's transform is a Gaussian (a Gaussian blur is a low-pass filter; wide in space = narrow in frequency).
- **Sampling theorem**: sample at ≥ 2× the highest frequency to avoid aliasing (Nyquist); otherwise high frequencies fold onto low ones.
- **Separability**: a 2-D filter that is an outer product of two 1-D filters can be applied as two 1-D passes: cost `k` instead of `k²` per pixel.
- **Noise**: averaging `N` independent measurements reduces the standard deviation by `√N` (why stacking frames works); sensor noise has a signal-dependent (shot) and a constant (read) part.

```python run title="Convolution theorem, separability and the sqrt(N) law" level=intermediate
import numpy as np
import cv2

rng = np.random.default_rng(0)
img = rng.random((64, 64)).astype(np.float32)
g = cv2.getGaussianKernel(9, 1.5).astype(np.float32)                           # a 1-D Gaussian
k2 = g @ g.T                                                                    # its outer product is the 2-D Gaussian

# separable: two 1-D passes equal one 2-D convolution
two_pass = cv2.sepFilter2D(img, -1, g, g, borderType=cv2.BORDER_REFLECT_101)
direct = cv2.filter2D(img, -1, k2, borderType=cv2.BORDER_REFLECT_101)
print("separable filter equals the 2-D filter: max difference", float(np.abs(two_pass - direct).max()), "| multiplications per pixel 18 vs 81")

# convolution theorem: circular convolution = pointwise product in the Fourier domain
kpad = np.zeros_like(img); kpad[:9, :9] = k2; kpad = np.roll(kpad, (-4, -4), (0, 1))          # centre the kernel at the origin
via_fft = np.real(np.fft.ifft2(np.fft.fft2(img) * np.fft.fft2(kpad)))
circ = cv2.filter2D(np.pad(img, 4, mode="wrap"), -1, k2)[4:-4, 4:-4]                 # wrap-around padding = circular convolution
print("FFT product equals (circular) convolution: max difference", float(np.abs(via_fft - circ).max()))

# averaging N noisy frames reduces noise by sqrt(N)
truth = np.full((100, 100), 100.0)
for n in (1, 4, 16, 64):
    frames = truth + rng.normal(0, 10, (n, 100, 100))
    print(f"{n:>3} frames averaged: noise std {frames.mean(0).std():.2f} (theory {10 / np.sqrt(n):.2f})")
```

## Cheat sheet

| Topic | Formula |
|---|---|
| Pinhole projection | `x ∼ K [R\|t] X`, `u = fx X/Z + cx` |
| Stereo depth | `Z = f B / d`, `ΔZ ≈ Z² Δd / (f B)` |
| Homography DoF / min points | 8 DoF / 4 points |
| Fundamental / essential | `x'ᵀ F x = 0`, `E = Kᵀ F K`, 7 / 5 DoF |
| RANSAC iterations | `N = log(1 − p) / log(1 − w^s)` |
| Convolution output size | `⌊(N + 2P − K)/S⌋ + 1` |
| IoU | `|A∩B| / |A∪B|`; Dice = `2|A∩B| / (|A| + |B|)` |
| Softmax cross-entropy gradient | `∂L/∂z = softmax(z) − y` |
| Kalman gain | `K = P⁻ Hᵀ (H P⁻ Hᵀ + R)⁻¹` |
| Bayes | `P(A\|B) = P(B\|A) P(A) / P(B)` |
| Gaussian blur σ vs kernel size | size ≈ 6σ + 1 |
| Noise averaging | `σ / √N` |

:::interview Questions you may get
- "How do you solve `A x = 0` with the constraint `|x| = 1`?" SVD; take the right singular vector for the smallest singular value (homography, fundamental matrix, triangulation).
- "Why SVD instead of the normal equations for least squares?" The normal equations square the condition number (`AᵀA`), losing precision; SVD/QR are numerically stable and handle rank-deficient problems (pseudo-inverse).
- "How does PCA relate to SVD?" Centre the data; the right singular vectors are the principal directions and `σᵢ²/(n−1)` the variances.
- "A detector has 99% sensitivity and 99% specificity. A positive occurs in a 1-in-1000 defect rate: what is the precision?" About 9%; the base rate dominates (Bayes).
- "What is the Mahalanobis distance and when do you use it?" Distance scaled by the covariance, used for gating in tracking and for anomaly/OOD scores.
- "Why do we use Gauss-Newton or LM in bundle adjustment?" The residuals are non-linear in the parameters; linearise and solve sparse normal equations, with damping for robustness.
- "Why is the inverse of `[R t; 0 1]` not `[Rᵀ, −t; 0 1]`?" Because the translation must be rotated too: `−Rᵀ t`.
- "Why do quaternions avoid gimbal lock?" They are a smooth, singularity-free parameterisation of rotations (a double cover of SO(3)); Euler angles are singular when two axes align.
:::

```quiz
? Which vector solves `A x = 0` with `|x| = 1` in the least-squares sense?
+ The right singular vector of A with the smallest singular value
- The first principal component
- The pseudo-inverse of A
> The standard DLT solution.

? A rotation matrix R satisfies…
+ RᵀR = I and det(R) = +1
- R = Rᵀ and det(R) = 0
- det(R) = −1
> Orthogonal with determinant +1.

? What is the inverse of the rigid transform [R t; 0 1]?
+ [Rᵀ, −Rᵀ t; 0 1]
- [Rᵀ, −t; 0 1]
- [R, −t; 0 1]
> The translation is rotated back too.

? Averaging 16 independent noisy frames reduces the noise standard deviation by about…
+ 4 times
- 16 times
- 2 times
> σ/√N.
```

:::problem Show that the least-squares estimate of a line `y = a x + b` is biased when `x` is also noisy, and explain how total least squares fixes it. When would you use RANSAC instead? {level=hard tags="least-squares,tls,ransac"}
The run block above fits the same data both ways.

:::solution Model answer
Ordinary least squares minimises vertical errors and assumes `x` is exact. With noise in `x` (errors-in-variables) the slope is attenuated towards zero (regression dilution: factor `var(x_true) / (var(x_true) + var(noise))`). **Total least squares** minimises perpendicular distances: centre the data and take the direction of the first right singular vector (the principal direction). If there are **outliers** (wrong matches, other objects), both are skewed; use **RANSAC** (sample two points, count inliers) or robust losses (Huber, Cauchy, IRLS), then refit TLS on the inliers.
:::
:::

:::keypoints
- SVD is the single most useful tool: least squares, null spaces (homography, F, camera centre), PCA, nearest rotation, conditioning.
- Probability: Bayes with base rates, Gaussians (MLE, Mahalanobis), cross-entropy = KL + entropy, MAP = regularisation, bootstrap intervals; small test sets cannot separate close models.
- Optimisation: gradients and the chain rule (backprop), learning-rate stability `η < 2/λ_max`, Gauss-Newton/LM for geometric least squares.
- Geometry: rotation properties and composition order, Rodrigues, quaternions, SE(3) inverse `[Rᵀ, −Rᵀt]`, camera centre `−R⁻¹t`.
- Signals: convolution theorem, separability, Nyquist, noise averaging with `√N`.
:::

:::resources
- [Strang: Linear Algebra and Learning from Data / MIT 18.06 lectures](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/) — the best free linear-algebra course.
- [Deisenroth, Faisal, Ong: Mathematics for Machine Learning (free PDF)](https://mml-book.github.io) — the maths behind ML in one book.
- [Solà et al.: A micro Lie theory for state estimation in robotics](https://arxiv.org/abs/1812.01537) — rotations and rigid transforms for robotics.
- [3Blue1Brown: Essence of Linear Algebra](https://www.3blue1brown.com/topics/linear-algebra) — visual intuition.
:::
