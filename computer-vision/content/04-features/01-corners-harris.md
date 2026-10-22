---
title: Corners and Interest Points — Harris, Shi-Tomasi, FAST
level: intermediate
time: 40
summary: Which points of a picture are easy to find again in another picture? Corners. Learn the window-shift idea, the structure tensor, the Harris and Shi-Tomasi scores, the FAST test, and why corners alone are not scale invariant.
---

Suppose you take two photos of the same building from slightly different places. To line them up, you need to find **the same points** in both photos. Which points should you pick?

Not a point on a flat wall: it looks the same as every neighbour, so you cannot say *which* neighbour it matches. Not a point on a straight edge: you can slide along the edge and it still looks the same. The best points are **corners**, where the picture changes in **every direction**.

:::def Interest point (keypoint, feature point)
A pixel position that is easy to find again in another picture of the same scene. Good keypoints are **repeatable** (found again after the picture changes), **distinctive**, and fast to find.
:::

## The three cases

Look at a small window (a patch) and ask: *if I move this window a little, how much does what it sees change?*

| Where the window sits | Moving it... | Change |
|---|---|---|
| On a **flat** area | in any direction | almost no change |
| On an **edge** | along the edge | no change; across the edge: big change |
| On a **corner** | in any direction | **big change** |

So a corner is a spot where **moving the window in every direction changes the picture a lot**.

## The Harris corner detector

Chris Harris and Mike Stephens turned this idea into a formula (1988). For each pixel, look at the gradients `Ix` and `Iy` in the window around it, and build a small 2 × 2 matrix called the **structure tensor**:

:::formula Structure tensor
M = \sum_{(x,y)\in \text{window}} \begin{pmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{pmatrix}
:::

The two **eigenvalues** `λ1`, `λ2` of `M` tell us the story:

- both small → **flat**
- one large, one small → **edge** (only one direction has strong gradients)
- both large → **corner** (strong gradients in two different directions)

To avoid computing eigenvalues, Harris uses a score:

:::formula Harris response
R = \det(M) - k\,\big(\operatorname{trace}(M)\big)^2 = \lambda_1\lambda_2 - k(\lambda_1+\lambda_2)^2
:::

`R` is large and positive at corners, negative at edges and near zero on flat areas. `k` is a constant, about 0.04 to 0.06. **Shi–Tomasi** (1994) uses a simpler score, `min(λ1, λ2)`: a point is good if even its *smaller* eigenvalue is large. OpenCV's `goodFeaturesToTrack` uses it.

Move the sliders and watch corners appear:

```viz algo=harris title="Harris corners on a photo"
```

```python run title="Harris corners from scratch" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.checkerboard(rows=4, cols=5, square=40, border=30)
gray = img.astype(np.float32)
Ix = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
Iy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)

# the structure tensor entries, summed over a Gaussian window
Sxx = cv2.GaussianBlur(Ix * Ix, (0, 0), 1.5)
Syy = cv2.GaussianBlur(Iy * Iy, (0, 0), 1.5)
Sxy = cv2.GaussianBlur(Ix * Iy, (0, 0), 1.5)
k = 0.05
R = (Sxx * Syy - Sxy ** 2) - k * (Sxx + Syy) ** 2

strong = (R > 0.2 * R.max()).astype(np.uint8)                   # many neighbouring pixels pass the threshold...
n, _, _, centres = cv2.connectedComponentsWithStats(strong)       # ...so we take the centre of each blob of strong pixels
print("response is positive at corners:", bool(R.max() > 0), " negative at edges:", bool(R.min() < 0))
print("corners found:", n - 1, " (the board has 30 grid points; a few on the outer edge are not real corners)")

vis = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
for x, y in centres[1:]:
    cv2.circle(vis, (int(x), int(y)), 5, (255, 0, 0), 2)
cvlab.show(img, "Chessboard", vis, "Harris corners", np.clip(R / R.max(), -0.3, 1) , "Response R (edges negative)")
```

OpenCV has `cv2.cornerHarris` and `cv2.goodFeaturesToTrack` ready for use:

```python run title="goodFeaturesToTrack (Shi-Tomasi)" level=easy
import cv2
import cvlab

gray = cvlab.image("coins")
pts = cv2.goodFeaturesToTrack(gray, maxCorners=60, qualityLevel=0.05, minDistance=12)       # shape (N, 1, 2)
print("corners:", len(pts), " first three (x, y):", pts[:3, 0].round(1).tolist())
vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
for (x, y) in pts[:, 0]:
    cv2.circle(vis, (int(x), int(y)), 4, (255, 0, 0), 1)
cvlab.show(vis, "Shi-Tomasi corners")
```

`qualityLevel` keeps only corners with a score above that fraction of the best one. `minDistance` makes sure corners are spread out. For **very accurate** positions (camera calibration), `cv2.cornerSubPix` refines a corner to a fraction of a pixel.

## FAST: a very quick corner test

Harris needs gradients and window sums at every pixel. **FAST** (Features from Accelerated Segment Test) is much simpler and quicker. Take a pixel `p` and look at 16 pixels on a **circle** of radius 3 around it. If **at least 12 in a row** are all brighter than `p + t` or all darker than `p − t`, then `p` is a corner. A quick pre-check of 4 pixels rejects most points at once. FAST is used inside **ORB** and in real-time tracking.

```python run title="FAST detector" level=easy
import cv2
import cvlab

gray = cvlab.image("camera")
fast = cv2.FastFeatureDetector_create(threshold=25, nonmaxSuppression=True)
kps = fast.detect(gray, None)
print("FAST corners:", len(kps))
vis = cv2.drawKeypoints(cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB), kps, None, color=(255, 0, 0))
cvlab.show(vis, "FAST keypoints")
```

## What corners can and cannot do

Good: Harris corners are **rotation invariant** (the eigenvalues do not change when you rotate the picture) and fairly stable under small brightness changes.

Bad: they are **not scale invariant**. A corner at one zoom level looks like a smooth curve when you zoom in, and the corner may disappear or turn into several. Look at the next test: we detect Harris corners in a picture and in the same picture shrunk by half, and check how many corners are found again.

```python run title="Repeatability: rotation yes, scale no" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("coffee", gray=True)
h, w = img.shape

def corners(g):
    p = cv2.goodFeaturesToTrack(g, 150, 0.01, 8, useHarrisDetector=True, k=0.04)
    return p[:, 0]

def repeatability(M, size):
    a = corners(img)
    b = corners(cv2.warpAffine(img, M, size))
    mapped = (np.c_[a, np.ones(len(a))] @ M.T)                  # where the corners of `a` should be in the new picture
    ok = 0
    for p in mapped:
        if 0 <= p[0] < size[0] and 0 <= p[1] < size[1] and np.min(np.linalg.norm(b - p, axis=1)) < 2.5:
            ok += 1
    return ok / len(a)

rot = cv2.getRotationMatrix2D((w / 2, h / 2), 30, 1.0)
half = cv2.getRotationMatrix2D((w / 2, h / 2), 0, 0.5)
print("corners found again after a 30 degree rotation:", round(repeatability(rot, (w, h)), 2))
print("corners found again after shrinking to half   :", round(repeatability(half, (w, h)), 2))
```

That is why the next lessons talk about **scale**: we need keypoints that are found at the **right size** too.

:::interview Questions you may get
- "What makes a good keypoint?" Repeatable under viewpoint and lighting changes, distinctive (unique neighbourhood), localised (precise), and cheap to compute.
- "Explain Harris corner detection." Structure tensor of gradients in a window; the response `det − k·trace²` is large when both eigenvalues are large.
- "How do flat, edge and corner regions differ in terms of eigenvalues?" Both small, one large, both large.
- "Is Harris scale invariant?" No. It is rotation invariant only.
- "What is FAST?" A circle test: 12 contiguous pixels all brighter or darker than the centre by a threshold.
:::

```quiz
? At an edge, the eigenvalues of the structure tensor are...
- Both large
- Both small
+ One large and one small
> Only the direction across the edge has a strong gradient.

? Which property does the Harris detector NOT have?
- Rotation invariance
+ Scale invariance
- Reasonable robustness to brightness changes
> A corner at one scale can look like a curve at another.

? How does the FAST test decide a pixel is a corner?
+ A long run (about 12) of pixels on a circle are all brighter or all darker than the centre by a threshold
- It computes eigenvalues
- It uses colour
> It is a simple comparison test, which makes it very fast.

? Why does goodFeaturesToTrack have a minDistance parameter?
- To save memory
+ To spread the corners out, so they do not cluster in one textured spot
- To avoid noise
> Evenly spread features give a better estimate of motion or geometry.
```

:::problem Why are corners better matching points than points on a long straight edge or in a flat area? Relate the answer to eigenvalues. {level=easy tags="harris,keypoints"}
Think about sliding a window.

:::solution Model answer
On a flat area the window can move in any direction without changing much, so the position is not determined (both eigenvalues small). On a straight edge it can slide along the edge without change, so the position is ambiguous in one direction (the aperture problem; one eigenvalue small). At a corner any move changes the window content, so the location is determined in both directions (both eigenvalues large). A matcher needs a well-determined position, so it uses corners.
:::
:::

:::keypoints
- Good keypoints are repeatable, distinctive and well localised: corners, not flat areas or straight edges.
- Harris scores the structure tensor: `R = det(M) − k·trace(M)²`. Shi–Tomasi uses the smaller eigenvalue.
- FAST checks a circle of 16 pixels. It is very quick and used in ORB.
- Corners are rotation invariant but not scale invariant. Scale comes next.
:::

:::resources
- [OpenCV: Harris corner detection](https://docs.opencv.org/4.x/dc/d0d/tutorial_py_features_harris.html) — the theory and code.
- [OpenCV: Shi-Tomasi corner detector](https://docs.opencv.org/4.x/d4/d8c/tutorial_py_shi_tomasi.html) — goodFeaturesToTrack.
- [OpenCV: FAST algorithm](https://docs.opencv.org/4.x/df/d0c/tutorial_py_fast.html) — the circle test explained.
:::
