---
title: RANSAC — Fitting a Model When Data Has Outliers
level: intermediate
time: 40
summary: How to fit a line or a homography when many of the points are wrong. Guess from a tiny random sample, count how many points agree, repeat, and keep the best. The iteration formula, a from-scratch version, cv2.findHomography with RANSAC, and its variants.
---

Even after the ratio test, a few feature matches are **wrong**. And a few wrong points can ruin a normal fit. Least squares tries to please **every** point, so one far-away point pulls the answer away.

**RANSAC** (RANdom SAmple Consensus, Fischler and Bolles, 1981) solves this with a simple, powerful idea: **don't fit to all the points. Fit to a tiny random sample, and see how many other points agree.**

:::analogy
You have 100 witness statements about where a car was. 40 are lies (random places) and 60 are honest and roughly agree. Picking the average of everyone gives nonsense. Instead: pick two statements at random and imagine they are true, then count how many other statements agree. If you pick two honest ones, many agree. If you pick a liar, few agree. Try many pairs and keep the pair that has the most support. Then use everyone who agreed to polish the answer.
:::

## The algorithm

:::flow RANSAC
1. Sample | Pick the minimum number of points needed to define the model: 2 for a line, 4 for a homography.
2. Fit | Compute the model from only those points.
3. Count | Find all points whose error is below a threshold. These are the inliers. Their number is the score.
4. Repeat | Do steps 1 to 3 many times. Remember the model with the most inliers.
5. Refit | Re-estimate the model using all the inliers of the best model (least squares). Done.
:::

Watch it work. Add outliers and see how many tries are needed:

```viz algo=ransac title="Pick two points, count the agreement"
```

## How many tries do I need?

Let `ε` (epsilon) be the fraction of outliers, and `s` the number of points in a sample. The chance that **all** `s` sampled points are inliers is `(1 − ε)^s`. We want, with probability `p` (say 99%), at least one sample of all inliers in `N` tries:

:::formula Number of RANSAC iterations
N = \frac{\log(1 - p)}{\log\!\big(1 - (1-\varepsilon)^s\big)}
:::

```python run title="Iterations needed" level=easy
import numpy as np

def iterations(outlier_fraction, sample_size, p=0.99):
    good_sample = (1 - outlier_fraction) ** sample_size
    return int(np.ceil(np.log(1 - p) / np.log(1 - good_sample)))

print("outliers   line (s=2)   homography (s=4)   fundamental matrix (s=7/8)")
for eps in (0.1, 0.3, 0.5, 0.7):
    print(f"{eps:7.0%} {iterations(eps, 2):12d} {iterations(eps, 4):18d} {iterations(eps, 8):18d}")
```

Two lessons: **fewer points per sample is much better** (the cost grows exponentially with `s`), and **many outliers** make RANSAC expensive. In practice the algorithm updates `N` while it runs, using the best inlier ratio found so far.

## RANSAC from scratch: a line

```python run title="RANSAC line fit versus least squares" level=intermediate
import numpy as np

rng = np.random.default_rng(0)
x = rng.uniform(0, 100, 80)
y = 0.5 * x + 20 + rng.normal(0, 1.5, 80)                      # 80 honest points on y = 0.5x + 20
outl = rng.random(80) < 0.4                                    # make 40% of them wild outliers
y[outl] = rng.uniform(0, 100, outl.sum())
pts = np.c_[x, y]

ls_slope, ls_icpt = np.polyfit(x, y, 1)                       # ordinary least squares
print(f"least squares : slope {ls_slope:.2f}, intercept {ls_icpt:.1f}   (truth: 0.50, 20.0)")

best_inliers, best_count = None, 0
for _ in range(100):
    i, j = rng.choice(len(pts), 2, replace=False)
    (x1, y1), (x2, y2) = pts[i], pts[j]
    if x1 == x2:
        continue
    m = (y2 - y1) / (x2 - x1)
    b = y1 - m * x1
    dist = np.abs(m * x - y + b) / np.hypot(m, 1)             # distance of each point to the line
    inliers = dist < 3.0
    if inliers.sum() > best_count:
        best_inliers, best_count = inliers, int(inliers.sum())

m, b = np.polyfit(x[best_inliers], y[best_inliers], 1)        # refit with the inliers only
print(f"RANSAC        : slope {m:.2f}, intercept {b:.1f}   inliers {best_count} of {len(pts)}  (honest points: {int((~outl).sum())})")
```

Least squares is dragged away by the outliers. RANSAC finds the true line.

## RANSAC for a homography

The same recipe with `s = 4` point pairs gives a homography. OpenCV does it all in `cv2.findHomography(src, dst, cv2.RANSAC, reprojThreshold)`. It returns the matrix and a **mask** saying which matches are inliers.

```python run title="Clean up SIFT matches with RANSAC" level=intermediate
import cv2
import numpy as np
import cvlab

a, b, H_true = cvlab.warped_pair("coffee")
ga, gb = [cv2.cvtColor(x, cv2.COLOR_RGB2GRAY) for x in (a, b)]
sift = cv2.SIFT_create()
ka, da = sift.detectAndCompute(ga, None)
kb, db = sift.detectAndCompute(gb, None)
knn = cv2.BFMatcher(cv2.NORM_L2).knnMatch(da, db, k=2)
good = [m for m, n in knn if m.distance < 0.9 * n.distance]            # a loose ratio test: some wrong matches remain on purpose

src = np.float32([ka[m.queryIdx].pt for m in good])
dst = np.float32([kb[m.trainIdx].pt for m in good])
H, mask = cv2.findHomography(src, dst, cv2.RANSAC, ransacReprojThreshold=3.0)
inl = mask.ravel().astype(bool)

true_err = np.linalg.norm(cv2.perspectiveTransform(src[None], H_true)[0] - dst, axis=1)
print("matches:", len(good), "  truly correct (hidden truth):", int((true_err < 3).sum()), "  RANSAC inliers:", int(inl.sum()))
print("wrong matches among the inliers:", int((true_err[inl] >= 3).sum()), "   correct matches thrown away:", int(((true_err < 3) & ~inl).sum()))
print("estimated H (normalised):\n", np.round(H / H[2, 2], 4))
print("true H (normalised):\n", np.round(H_true / H_true[2, 2], 4))

vis = cv2.drawMatches(a, ka, b, kb, [m for m, k in zip(good, inl) if k][:40], None, matchColor=(0, 200, 0), flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
cvlab.show(vis, "Inlier matches kept by RANSAC")
```

The estimated matrix is almost the true one, although the matches contained wrong ones. This step is why feature-based alignment is so reliable.

## Choosing the threshold

The inlier threshold is the key parameter. For a homography it is in **pixels of reprojection error**: 1–5 pixels is typical. Too low: good matches are rejected (noise). Too high: wrong matches sneak in and the model is poor. The threshold should match your measurement noise, which is usually a pixel or two.

## Variants you may hear about

| Variant | Idea |
|---|---|
| **MSAC / MLESAC** | Score inliers by their error (smooth) instead of just counting; better estimates |
| **PROSAC** | Sample from the best matches first (sorted by descriptor quality); much faster |
| **LO-RANSAC** | Run a local optimisation on promising models |
| **MAGSAC / MAGSAC++** | No fixed threshold; average over many thresholds (OpenCV: `cv2.USAC_MAGSAC`) |
| **Preemptive / adaptive RANSAC** | Stop early when the best model is good enough |
| **RANSAC for planes (3 points)** | Fit a plane to a 3-D point cloud: floors, tables, walls |
| **Fundamental matrix (7 or 8 points)** | Two-view geometry (the camera lessons) |

RANSAC is **not** only for homographies: lines, circles, planes, vanishing points, camera pose (PnP), the fundamental matrix, point-cloud registration. Whenever you must fit a model to data with outliers, think RANSAC.

## When RANSAC fails

- **Too many outliers** (over about 80–90%): too many tries are needed.
- **Degenerate samples**: all sampled points on a line (for a homography) or on a plane (for a fundamental matrix) give an unstable model. Real implementations check for this.
- **A threshold that is wrong**, or **several valid models** (two planes in the scene: RANSAC finds one; find the next by removing its inliers and running again).
- **Randomness**: results differ between runs unless you fix the seed.

:::interview Questions you may get
- "Explain RANSAC." Repeatedly fit a model to a minimal random sample, count inliers within a threshold, keep the best, and refit using all its inliers.
- "How many iterations?" `N = log(1−p) / log(1−(1−ε)^s)`; it grows quickly with the outlier ratio ε and the sample size s.
- "Why not just least squares?" Least squares is not robust: a single large outlier can move the answer arbitrarily.
- "What is the minimal sample size for a line? A homography? A plane in 3-D?" 2, 4, 3.
- "What are the weaknesses?" Needs a threshold, many outliers need many iterations, non-deterministic, assumes one dominant model.
:::

```quiz
? What is the minimal number of point pairs RANSAC samples to estimate a homography?
- 2
- 3
+ 4
> Each pair gives 2 equations; a homography has 8 unknowns.

? With 50% outliers and a sample of 2 points, what is the chance that one sample is all inliers?
+ 25%
- 50%
- 75%
> (1 − 0.5)² = 0.25.

? What does the final refit step use?
- Only the 4 sampled points
+ All inliers of the best model
- All points including outliers
> Using all inliers gives a more accurate estimate.

? Why is RANSAC more robust than least squares?
+ Outliers are excluded by the inlier test instead of pulling the fit
- It uses more points
- It is deterministic
> The model is judged by the points that agree with it.
```

:::problem You estimate a homography with RANSAC and get a clearly wrong result on one image pair. List the checks you would do. {level=medium tags="ransac,debugging,homography"}
Think about data, threshold and geometry.

:::solution Model answer
(1) Look at the matches: are there enough (at least 15–20) and spread over the image, or clustered? Repeated patterns can give consistent but wrong matches. (2) Check the inlier ratio: if below about 20%, tighten the ratio test or fix the features. (3) Check the threshold in pixels against the image size and noise. (4) Check whether the scene is **planar**: a homography is only valid for a plane or a pure rotation; for a 3-D scene use the fundamental or essential matrix instead. (5) Check degeneracy (collinear inliers). (6) Fix the random seed to see if the result is stable; increase iterations or use USAC/MAGSAC. (7) Draw the inlier matches and the warped result to verify visually.
:::
:::

:::keypoints
- RANSAC fits a model from minimal random samples and keeps the model with the most inliers, then refits on those inliers.
- Iterations: `N = log(1−p) / log(1−(1−ε)^s)`. Small samples and few outliers keep it cheap.
- `cv2.findHomography(src, dst, cv2.RANSAC, thr)` returns the matrix and an inlier mask.
- Variants (MSAC, PROSAC, LO-RANSAC, MAGSAC++) improve accuracy and speed. It fails with too many outliers or degenerate data.
:::

:::resources
- [Fischler and Bolles: Random Sample Consensus (1981)](https://dl.acm.org/doi/10.1145/358669.358692) — the original paper.
- [OpenCV: findHomography](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html) — RANSAC, LMEDS, RHO and USAC flags.
- [MAGSAC++: a fast, reliable and accurate robust estimator](https://arxiv.org/abs/1912.05909) — a modern variant.
:::
