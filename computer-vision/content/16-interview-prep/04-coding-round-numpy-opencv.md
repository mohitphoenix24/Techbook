---
title: Coding Round: Vision Algorithms in NumPy and OpenCV
level: advanced
time: 120
summary: Fourteen classic vision coding problems with tested reference solutions: IoU and NMS, convolution, resizing, histogram equalisation, Otsu, connected components, k-means, integral images, Sobel, Harris, the homography DLT, rotation by inverse warping, projection, and mAP. Each solution runs here and is checked against OpenCV or a hand-made truth.
---

Vision coding rounds ask you to implement something small **from scratch**, often with NumPy only, and to **test** it. This lesson gives fourteen problems that come up again and again. For each: read the task, **write your own solution first** (use the editor of any run block, or your own), then open the reference. Every reference solution here **checks itself** against OpenCV or a known answer, which is exactly what you should do in an interview ("let me test it on a small example").

**Reminders for every problem**: state the input shapes and dtypes, think about edge cases (empty input, one pixel, ties), prefer **vectorised** NumPy over Python loops when it stays readable, watch `uint8` overflow, and name the coordinate convention.

## 1. Pairwise IoU of boxes

:::problem Write `iou_matrix(a, b)` for boxes in `[x1, y1, x2, y2]` format: `a` has shape `(N, 4)`, `b` has shape `(M, 4)`; return an `(N, M)` array of IoU values, without Python loops. {level=easy tags="iou,broadcasting"}
Use broadcasting: expand `a` to `(N, 1, 4)` and `b` to `(1, M, 4)`. Clip negative widths and heights to zero.

:::solution Reference solution
```python run title="Vectorised IoU matrix"
import numpy as np

def iou_matrix(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    a, b = a[:, None, :], b[None, :, :]                                   # (N,1,4) and (1,M,4): broadcasting makes all pairs
    ix1, iy1 = np.maximum(a[..., 0], b[..., 0]), np.maximum(a[..., 1], b[..., 1])
    ix2, iy2 = np.minimum(a[..., 2], b[..., 2]), np.minimum(a[..., 3], b[..., 3])
    inter = np.clip(ix2 - ix1, 0, None) * np.clip(iy2 - iy1, 0, None)     # no overlap -> zero, never negative
    area_a = (a[..., 2] - a[..., 0]) * (a[..., 3] - a[..., 1])
    area_b = (b[..., 2] - b[..., 0]) * (b[..., 3] - b[..., 1])
    return inter / (area_a + area_b - inter + 1e-9)                       # epsilon guards against empty boxes

A = np.array([[0, 0, 10, 10], [5, 5, 15, 15]]); B = np.array([[0, 0, 10, 10], [20, 20, 30, 30], [5, 0, 15, 10]])
M = iou_matrix(A, B)
print(np.round(M, 3))
assert abs(M[0, 0] - 1.0) < 1e-6                   # identical boxes
assert M[0, 1] == 0                                # disjoint boxes
assert abs(M[0, 2] - 50 / 150) < 1e-6              # half overlap: intersection 50, union 150
assert abs(M[1, 0] - 25 / 175) < 1e-6
print("all checks passed; shape", M.shape)
```
Complexity: O(N·M) time and memory. For huge N and M, process in chunks.
:::
:::

## 2. Non-maximum suppression

:::problem Write `nms(boxes, scores, iou_thr)` returning the indices of the kept boxes, sorted by score. Compare your result with OpenCV. {level=medium tags="nms,detection"}
Sort by score, keep the best, drop all with IoU above the threshold, repeat.

:::solution Reference solution
```python run title="Greedy NMS"
import numpy as np
import cv2

def nms(boxes, scores, iou_thr=0.5):
    boxes = np.asarray(boxes, float); scores = np.asarray(scores, float)
    order = scores.argsort()[::-1]                                       # best first
    keep = []
    while order.size:
        i = order[0]; keep.append(int(i))
        rest = order[1:]
        xx1 = np.maximum(boxes[i, 0], boxes[rest, 0]); yy1 = np.maximum(boxes[i, 1], boxes[rest, 1])
        xx2 = np.minimum(boxes[i, 2], boxes[rest, 2]); yy2 = np.minimum(boxes[i, 3], boxes[rest, 3])
        inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
        area = lambda b: (b[..., 2] - b[..., 0]) * (b[..., 3] - b[..., 1])
        iou = inter / (area(boxes[i]) + area(boxes[rest]) - inter + 1e-9)
        order = rest[iou <= iou_thr]                                      # keep only boxes that do not overlap the winner much
    return keep

rng = np.random.default_rng(0)
base = rng.uniform(0, 200, (12, 2)); wh = rng.uniform(30, 60, (12, 2))
boxes = np.vstack([np.hstack([base, base + wh]) + rng.normal(0, 3, (12, 4)) for _ in range(3)])      # three noisy copies of each object
scores = rng.uniform(0.3, 1.0, len(boxes))
mine = nms(boxes, scores, 0.5)
xywh = np.column_stack([boxes[:, 0], boxes[:, 1], boxes[:, 2] - boxes[:, 0], boxes[:, 3] - boxes[:, 1]])
ref = cv2.dnn.NMSBoxes(xywh.tolist(), scores.tolist(), 0.0, 0.5)
ref = [int(i) for i in np.array(ref).ravel()]
print("boxes before:", len(boxes), "| kept by mine:", len(mine), "| kept by OpenCV:", len(ref))
assert sorted(mine) == sorted(ref), "different survivors"
assert all(scores[mine[k]] >= scores[mine[k + 1]] for k in range(len(mine) - 1))
print("same result as OpenCV; worst case O(n^2), typically far less because the loop shrinks fast")
```
Follow-ups: class-wise NMS (run per class, or offset boxes by class id × a large constant), Soft-NMS (decay scores instead of removing), and why NMS hurts crowded scenes.
:::
:::

## 3. 2-D convolution (correlation) from scratch

:::problem Implement `filter2d(img, kernel)` for a grayscale float image with `reflect` padding ("same" output size), once with explicit loops and once vectorised. Verify against `cv2.filter2D`. {level=medium tags="convolution,vectorisation"}
Pad, then for each kernel offset add `kernel[dy, dx] * shifted image`. That is a loop over the kernel (small), not over the pixels.

:::solution Reference solution
```python run title="Convolution by kernel-offset accumulation and by sliding windows"
import numpy as np
import cv2
from numpy.lib.stride_tricks import sliding_window_view

def filter2d_loops(img, k):                                              # slow, obviously correct
    kh, kw = k.shape; ph, pw = kh // 2, kw // 2
    p = np.pad(img, ((ph, ph), (pw, pw)), mode="reflect")
    out = np.zeros_like(img, dtype=float)
    for y in range(img.shape[0]):
        for x in range(img.shape[1]):
            out[y, x] = (p[y:y + kh, x:x + kw] * k).sum()                 # correlation: kernel is NOT flipped (like cv2.filter2D)
    return out

def filter2d_fast(img, k):                                               # vectorised: loop over the kernel taps only
    kh, kw = k.shape; ph, pw = kh // 2, kw // 2
    p = np.pad(img, ((ph, ph), (pw, pw)), mode="reflect")
    out = np.zeros(img.shape, float)
    for dy in range(kh):
        for dx in range(kw):
            out += k[dy, dx] * p[dy:dy + img.shape[0], dx:dx + img.shape[1]]
    return out

def filter2d_windows(img, k):                                            # one-liner with sliding_window_view (memory-heavy for large kernels)
    kh, kw = k.shape
    p = np.pad(img, ((kh // 2,) * 2, (kw // 2,) * 2), mode="reflect")
    return (sliding_window_view(p, (kh, kw)) * k).sum(axis=(-1, -2))

rng = np.random.default_rng(0)
img = rng.random((40, 50)).astype(np.float32)
k = np.array([[1, 0, -1], [2, 0, -2], [1, 0, -1]], np.float32)           # Sobel x: an asymmetric kernel, so flipping would change the answer
ref = cv2.filter2D(img, -1, k, borderType=cv2.BORDER_REFLECT_101)        # np.pad "reflect" == OpenCV's default reflect-101 border
for name, f in [("loops", filter2d_loops), ("kernel-offset", filter2d_fast), ("sliding windows", filter2d_windows)]:
    err = np.abs(f(img, k) - ref).max()
    print(f"{name:<16} max difference from cv2.filter2D: {err:.2e}")
    assert err < 1e-4
print("convolution would flip the kernel first; deep-learning 'convolution' and cv2.filter2D are correlation")
print("cost: H*W*kh*kw multiply-adds; a separable kernel (Gaussian) needs only H*W*(kh+kw)")
```
Follow-ups: separable filters, `im2col` + matrix multiply, the FFT for large kernels, border modes.
:::
:::

## 4. Bilinear resize

:::problem Implement `resize_bilinear(img, new_h, new_w)` matching OpenCV's pixel-centre convention. {level=medium tags="resize,interpolation"}
Map each destination pixel centre back to the source: `src = (dst + 0.5) * scale - 0.5`, then interpolate between the four neighbours; clamp at the borders.

:::solution Reference solution
```python run title="Bilinear resize with the half-pixel convention"
import numpy as np
import cv2

def resize_bilinear(img, new_h, new_w):
    h, w = img.shape[:2]
    ys = (np.arange(new_h) + 0.5) * (h / new_h) - 0.5                    # source row of every destination row
    xs = (np.arange(new_w) + 0.5) * (w / new_w) - 0.5
    y0 = np.clip(np.floor(ys).astype(int), 0, h - 1); x0 = np.clip(np.floor(xs).astype(int), 0, w - 1)
    y1 = np.clip(y0 + 1, 0, h - 1); x1 = np.clip(x0 + 1, 0, w - 1)       # clamp: replicate the border
    wy = np.clip(ys - y0, 0, 1)[:, None]; wx = np.clip(xs - x0, 0, 1)[None, :]      # fractional parts = interpolation weights
    if img.ndim == 3: wy, wx = wy[..., None], wx[..., None]
    a, b = img[y0][:, x0], img[y0][:, x1]
    c, d = img[y1][:, x0], img[y1][:, x1]
    out = (1 - wy) * (1 - wx) * a + (1 - wy) * wx * b + wy * (1 - wx) * c + wy * wx * d
    return out

rng = np.random.default_rng(0)
img = rng.integers(0, 256, (37, 53), dtype=np.uint8)
for new_h, new_w in [(74, 106), (20, 30), (37, 53)]:                       # up, down, same size
    mine = resize_bilinear(img.astype(np.float32), new_h, new_w)
    ref = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)       # NOTE: cv2.resize takes (width, height)
    diff = np.abs(np.round(mine) - ref).max()
    print(f"{(37, 53)} -> {(new_h, new_w)}: max difference from cv2.resize = {diff}")
    assert diff <= 1
print("when SHRINKING a lot, bilinear aliases: blur first or use area interpolation (INTER_AREA)")
```
Follow-ups: nearest versus bicubic, `align_corners` in deep-learning frameworks, why antialiasing matters.
:::
:::

## 5. Histogram equalisation

:::problem Implement histogram equalisation for a `uint8` grayscale image and compare with `cv2.equalizeHist`. {level=easy tags="histogram,lut"}
Histogram, cumulative distribution, then a lookup table `255 * (cdf - cdf_min) / (N - cdf_min)`.

:::solution Reference solution
```python run title="Equalisation by lookup table"
import numpy as np
import cv2
import cvlab

def equalise(img):
    hist = np.bincount(img.ravel(), minlength=256)
    cdf = hist.cumsum()
    cdf_min = cdf[np.nonzero(cdf)[0][0]]                                  # the first non-zero value of the CDF
    lut = np.round((cdf - cdf_min) / (img.size - cdf_min) * 255).clip(0, 255).astype(np.uint8)
    return lut[img]                                                       # fancy indexing applies the table to every pixel

img = cvlab.image("moon", gray=True)
mine, ref = equalise(img), cv2.equalizeHist(img)
print("input range", img.min(), img.max(), "-> output range", mine.min(), mine.max())
print("max difference from cv2.equalizeHist:", int(np.abs(mine.astype(int) - ref.astype(int)).max()))
assert np.abs(mine.astype(int) - ref.astype(int)).max() <= 1
print("one pass over the pixels (bincount) + one table lookup: O(N + 256)")
cvlab.show(img, "Original", mine, "Equalised")
```
Follow-ups: CLAHE, why equalisation amplifies noise, colour images (equalise only the V or L channel).
:::
:::

## 6. Otsu's threshold

:::problem Implement Otsu's method for a `uint8` image (return the threshold) and compare with OpenCV. {level=medium tags="threshold,otsu"}
For each candidate threshold `t` compute the two class weights and means from the histogram; maximise the between-class variance `w0 w1 (m0 − m1)²`.

:::solution Reference solution
```python run title="Otsu from the histogram"
import numpy as np
import cv2
import cvlab

def otsu(img):
    p = np.bincount(img.ravel(), minlength=256) / img.size                # normalised histogram
    levels = np.arange(256)
    w0 = np.cumsum(p)                                                     # weight (probability) of class 0: values <= t
    m = np.cumsum(p * levels)                                             # cumulative mean mass
    mt = m[-1]                                                            # overall mean
    w1 = 1 - w0
    with np.errstate(divide="ignore", invalid="ignore"):
        between = (mt * w0 - m) ** 2 / (w0 * w1)                          # = w0 w1 (m0 - m1)^2, written without dividing the means
    between = np.nan_to_num(between)                                      # empty classes give 0/0
    return int(between.argmax())

img = cvlab.image("coins", gray=True)
t = otsu(img)
ref_t, _ = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
print("my threshold:", t, "| OpenCV Otsu threshold:", int(ref_t))
assert abs(t - int(ref_t)) <= 1
fg = (img > t)
print(f"foreground fraction {fg.mean():.1%}; O(N + 256) with a single histogram")
cvlab.show(img, "Image", (fg * 255).astype(np.uint8), f"Threshold {t}")
```
Follow-ups: when Otsu fails (uneven lighting, tiny foreground), multi-level Otsu, adaptive thresholding.
:::
:::

## 7. Connected components

:::problem Label the 8-connected components of a binary image without using OpenCV, and return the number of components. Verify with `cv2.connectedComponents`. {level=medium tags="components,bfs,union-find"}
Scan the pixels; start a flood fill (BFS with a queue, not recursion: Python's recursion limit) from each unlabelled foreground pixel.

:::solution Reference solution
```python run title="Connected components by breadth-first flood fill"
import numpy as np
import cv2
from collections import deque

def label_components(mask, connectivity=8):
    h, w = mask.shape
    labels = np.zeros((h, w), np.int32); n = 0
    nbrs = [(-1, 0), (1, 0), (0, -1), (0, 1)] + ([(-1, -1), (-1, 1), (1, -1), (1, 1)] if connectivity == 8 else [])
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not labels[y, x]:
                n += 1; labels[y, x] = n; q = deque([(y, x)])             # BFS with an explicit queue (no recursion limit)
                while q:
                    cy, cx = q.popleft()
                    for dy, dx in nbrs:
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                            labels[ny, nx] = n; q.append((ny, nx))
    return labels, n

rng = np.random.default_rng(1)
mask = (cv2.GaussianBlur(rng.random((60, 80)).astype(np.float32), (0, 0), 2.5) > 0.5).astype(np.uint8)
for conn in (4, 8):
    labels, n = label_components(mask, conn)
    ref_n, ref = cv2.connectedComponents(mask, connectivity=conn)
    print(f"{conn}-connectivity: mine {n} components, OpenCV {ref_n - 1} (OpenCV counts the background as label 0)")
    assert n == ref_n - 1
    # same partition (labels may be numbered differently): every pixel pair has the same relationship
    pairs = set(zip(labels.ravel().tolist(), ref.ravel().tolist()))
    assert len(pairs) == len(set(l for l, _ in pairs)) == len(set(r for _, r in pairs)), "partitions differ"
print("O(H*W) time, O(H*W) memory; a union-find two-pass version does the same with less memory traffic")
```
Follow-ups: 4- versus 8-connectivity (and why the foreground and background should use opposite ones), union-find, "count islands", area filtering.
:::
:::

## 8. k-means (colour quantisation)

:::problem Implement k-means with k-means++ initialisation on an `(N, D)` array. Use it to reduce an image to 6 colours, and compare the inertia with scikit-learn. {level=medium tags="kmeans,clustering"}
Assign each point to its nearest centre (distance matrix), recompute centres as means, repeat until assignments stop changing. Handle empty clusters.

:::solution Reference solution
```python run title="k-means with k-means++ seeding"
import numpy as np
from sklearn.cluster import KMeans
import cvlab

def kmeans(X, k, iters=50, seed=0):
    rng = np.random.default_rng(seed)
    centres = [X[rng.integers(len(X))]]                                   # k-means++: pick far-apart seeds
    for _ in range(k - 1):
        d2 = np.min(((X[:, None, :] - np.array(centres)[None]) ** 2).sum(-1), axis=1)
        centres.append(X[rng.choice(len(X), p=d2 / d2.sum())])           # probability proportional to squared distance
    centres = np.array(centres, float)
    labels = np.full(len(X), -1)
    for _ in range(iters):
        d = ((X[:, None, :] - centres[None]) ** 2).sum(-1)                # (N, k) squared distances
        new = d.argmin(1)
        if (new == labels).all(): break
        labels = new
        for j in range(k):
            pts = X[labels == j]
            centres[j] = pts.mean(0) if len(pts) else X[rng.integers(len(X))]       # re-seed an empty cluster
    inertia = ((X - centres[labels]) ** 2).sum()
    return centres, labels, inertia

img = cvlab.image("coffee", size=(120, 90))
X = img.reshape(-1, 3).astype(float)
centres, labels, inertia = kmeans(X, 6)
ref = KMeans(6, n_init=5, random_state=0).fit(X)
print(f"inertia mine {inertia:.3e} | scikit-learn {ref.inertia_:.3e} | ratio {inertia / ref.inertia_:.3f}")
assert inertia < 1.15 * ref.inertia_
quant = centres[labels].reshape(img.shape).clip(0, 255).astype(np.uint8)      # every pixel replaced by its cluster centre
print("palette (RGB):", np.round(centres).astype(int).tolist())
cvlab.show(img, "Original", quant, "6 colours")
print("each iteration costs O(N*k*D); k-means finds a LOCAL optimum, so use several seeds and k-means++")
```
Follow-ups: choosing k (elbow, silhouette), Lab colour space, mini-batch k-means, GMM versus k-means.
:::
:::

## 9. Integral image and a box filter

:::problem Build an integral image (summed-area table) and use it to compute the mean over a `(2r+1) × (2r+1)` window at every pixel in O(1) per pixel. Compare with `cv2.boxFilter`. {level=medium tags="integral-image,box-filter"}
`S[y, x]` = sum of everything above and to the left. The sum over a rectangle is `S[y2,x2] − S[y1,x2] − S[y2,x1] + S[y1,x1]`.

:::solution Reference solution
```python run title="Summed-area table"
import numpy as np
import cv2

def box_mean(img, r):
    h, w = img.shape
    p = np.pad(img.astype(np.float64), r, mode="reflect")                 # pad so every pixel has a full window
    S = np.zeros((p.shape[0] + 1, p.shape[1] + 1)); S[1:, 1:] = p.cumsum(0).cumsum(1)       # extra zero row/column simplifies the corners
    k = 2 * r + 1
    window_sum = S[k:k + h, k:k + w] - S[0:h, k:k + w] - S[k:k + h, 0:w] + S[0:h, 0:w]        # four lookups per pixel, independent of r
    return window_sum / (k * k)

rng = np.random.default_rng(0)
img = rng.integers(0, 256, (45, 60)).astype(np.float32)
for r in (1, 3, 8):
    mine = box_mean(img, r)
    ref = cv2.boxFilter(img, -1, (2 * r + 1, 2 * r + 1), normalize=True, borderType=cv2.BORDER_REFLECT_101)
    print(f"radius {r}: max difference from cv2.boxFilter {np.abs(mine - ref).max():.2e}")
    assert np.abs(mine - ref).max() < 1e-3
print("the cost does not depend on the window size: the idea behind Viola-Jones features, SURF, the guided filter and fast local statistics")
```
Follow-ups: local variance with two integral images (`x` and `x²`), adaptive thresholding, floating-point drift for very large images (use float64 or integers).
:::
:::

## 10. Sobel gradients and edge direction

:::problem Compute the gradient magnitude and direction with Sobel kernels (your own convolution), and non-maximum suppress to thin the edges along the gradient direction. Check the gradients against `cv2.Sobel`. {level=medium tags="sobel,gradient,nms"}
Two 3×3 kernels; magnitude `hypot(gx, gy)`; direction `arctan2(gy, gx)`, quantised to four directions for NMS.

:::solution Reference solution
```python run title="Sobel, magnitude, direction and thinning"
import numpy as np
import cv2
import cvlab

def sobel(img):
    p = np.pad(img.astype(np.float32), 1, mode="reflect")
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], np.float32); ky = kx.T
    gx = np.zeros(img.shape, np.float32); gy = np.zeros(img.shape, np.float32)
    for dy in range(3):
        for dx in range(3):
            win = p[dy:dy + img.shape[0], dx:dx + img.shape[1]]
            gx += kx[dy, dx] * win; gy += ky[dy, dx] * win
    return gx, gy

def thin(mag, gx, gy):
    angle = (np.rad2deg(np.arctan2(gy, gx)) + 180) % 180                  # 0..180
    q = np.zeros(mag.shape, int)                                          # quantise to 4 directions: 0 horizontal, 1 diagonal, 2 vertical, 3 anti-diagonal
    q[(angle >= 22.5) & (angle < 67.5)] = 1; q[(angle >= 67.5) & (angle < 112.5)] = 2; q[(angle >= 112.5) & (angle < 157.5)] = 3
    pm = np.pad(mag, 1)
    H, W = mag.shape
    offs = {0: ((0, 1), (0, -1)), 1: ((1, 1), (-1, -1)), 2: ((1, 0), (-1, 0)), 3: ((1, -1), (-1, 1))}      # (dy, dx) of the two neighbours along the gradient
    keep = np.zeros(mag.shape, bool)
    for d, ((ay, ax), (by, bx)) in offs.items():
        n1 = pm[1 + ay:1 + ay + H, 1 + ax:1 + ax + W]; n2 = pm[1 + by:1 + by + H, 1 + bx:1 + bx + W]
        keep |= (q == d) & (mag >= n1) & (mag >= n2)
    return np.where(keep, mag, 0)

img = cvlab.image("camera", gray=True)
gx, gy = sobel(img)
rx, ry = cv2.Sobel(img.astype(np.float32), cv2.CV_32F, 1, 0, borderType=cv2.BORDER_REFLECT_101), cv2.Sobel(img.astype(np.float32), cv2.CV_32F, 0, 1, borderType=cv2.BORDER_REFLECT_101)
print("max difference from cv2.Sobel: gx", float(np.abs(gx - rx).max()), "gy", float(np.abs(gy - ry).max()))
assert np.abs(gx - rx).max() < 1e-3 and np.abs(gy - ry).max() < 1e-3
mag = np.hypot(gx, gy)
edges = thin(mag, gx, gy)
print(f"pixels with a gradient above 100: {(mag > 100).sum()}, after thinning: {((edges > 100)).sum()} (edges become 1 pixel wide)")
cvlab.show(img, "Image", np.clip(mag / mag.max() * 255 * 3, 0, 255).astype(np.uint8), "Gradient magnitude", (edges > 100).astype(np.uint8) * 255, "Thinned edges (> 100)")
```
Follow-ups: this is the heart of Canny (add Gaussian smoothing before and hysteresis after); why the direction is perpendicular to the edge.
:::
:::

## 11. Harris corner response

:::problem Implement the Harris response `R = det(M) − k·trace(M)²` from image gradients with a Gaussian window, and check that it fires on the corners of a checkerboard. {level=hard tags="harris,corners"}
`M` is built from `Ix²`, `Iy²`, `IxIy`, each smoothed by a Gaussian. Detect local maxima above a fraction of the maximum.

:::solution Reference solution
```python run title="Harris corners from scratch"
import numpy as np
import cv2
import cvlab

def harris(gray, sigma=1.5, k=0.05):
    g = gray.astype(np.float32)
    ix = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3) / 8; iy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3) / 8
    sxx = cv2.GaussianBlur(ix * ix, (0, 0), sigma); syy = cv2.GaussianBlur(iy * iy, (0, 0), sigma); sxy = cv2.GaussianBlur(ix * iy, (0, 0), sigma)
    det = sxx * syy - sxy ** 2
    tr = sxx + syy
    return det - k * tr ** 2

def corners(R, frac=0.1):
    n, _, _, cen = cv2.connectedComponentsWithStats((R > frac * R.max()).astype(np.uint8))      # each corner is one blob of high response
    return cen[1:]                                                       # centroids (x, y); label 0 is the background

board = cvlab.checkerboard(rows=6, cols=9, square=40, border=40)           # a chessboard with a white border: grid points at multiples of 40
gray = cv2.cvtColor(board, cv2.COLOR_RGB2GRAY) if board.ndim == 3 else board
R = harris(gray)
pts = corners(R)
print("detected corner blobs:", len(pts), "| the board has", 10 * 7, "grid vertices (40 inner X-corners + 30 on its outline)")
inner = np.array([[40 + 40 * i, 40 + 40 * j] for i in range(1, 9) for j in range(1, 6)])
miss = np.min(np.linalg.norm(inner[:, None, :] - pts[None], axis=2), axis=1)      # distance from each true inner corner to the nearest detection
print(f"every one of the 40 inner corners is found; the worst localisation error is {miss.max():.2f} px")
assert miss.max() < 2 and 60 <= len(pts) <= 72
ref = cv2.cornerHarris(gray.astype(np.float32), 3, 3, 0.05)
print("OpenCV cornerHarris also peaks at the corners (response max", float(ref.max()), ")")
vis = board.copy() if board.ndim == 3 else cv2.cvtColor(board, cv2.COLOR_GRAY2RGB)
for x, y in pts: cv2.circle(vis, (int(round(x)), int(round(y))), 4, (255, 0, 0), 2)
cvlab.show(vis, "Harris corners")
```
Follow-ups: why eigenvalues (flat / edge / corner), why Harris is not scale invariant, sub-pixel refinement (`cornerSubPix`).
:::
:::

## 12. Homography by the DLT

:::problem Estimate a homography from four or more point correspondences using the direct linear transform with Hartley normalisation. Check it on synthetic noisy data and against `cv2.findHomography`. {level=hard tags="homography,dlt,svd"}
Each correspondence gives two rows of a matrix `A`; the solution is the right singular vector of `A` for the smallest singular value. Normalise the points first.

:::solution Reference solution
```python run title="Homography DLT"
import numpy as np
import cv2

def normalise(pts):
    c = pts.mean(0); s = np.sqrt(2) / np.linalg.norm(pts - c, axis=1).mean()     # centre at the origin, mean distance sqrt(2)
    T = np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])
    return (np.c_[pts, np.ones(len(pts))] @ T.T)[:, :2], T

def dlt_homography(src, dst):
    ps, Ts = normalise(src); pd, Td = normalise(dst)
    A = []
    for (x, y), (u, v) in zip(ps, pd):
        A.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    _, _, Vt = np.linalg.svd(np.array(A))
    Hn = Vt[-1].reshape(3, 3)                                            # null-space direction = smallest singular value
    H = np.linalg.inv(Td) @ Hn @ Ts                                      # undo the normalisation
    return H / H[2, 2]

def apply(H, pts):
    q = np.c_[pts, np.ones(len(pts))] @ H.T
    return q[:, :2] / q[:, 2:3]

rng = np.random.default_rng(0)
H_true = np.array([[1.1, 0.2, 40], [-0.1, 0.95, 25], [2e-4, 1e-4, 1]])
src = rng.uniform(0, 640, (30, 2)); dst = apply(H_true, src) + rng.normal(0, 0.5, (30, 2))      # half a pixel of noise
H = dlt_homography(src, dst)
err = np.linalg.norm(apply(H, src) - apply(H_true, src), axis=1)
print(f"mean reprojection error against the noise-free truth: {err.mean():.3f} px")
assert err.mean() < 1.0
Hcv, _ = cv2.findHomography(src, dst, 0)
print(f"OpenCV (least squares): {np.linalg.norm(apply(Hcv, src) - apply(H_true, src), axis=1).mean():.3f} px")
# exactly 4 points, no noise: must be recovered exactly
s4 = np.array([[0, 0], [100, 0], [100, 100], [0, 100]], float); d4 = apply(H_true, s4)
assert np.abs(dlt_homography(s4, d4) - H_true / H_true[2, 2]).max() < 1e-6
print("4 exact correspondences recover H exactly; with outliers you need RANSAC around this solver")
```
Follow-ups: why normalise (conditioning of `A`), degenerate configurations (three collinear points), RANSAC, refinement by minimising reprojection error.
:::
:::

## 13. Rotate an image by inverse warping

:::problem Rotate an image by an angle about its centre using **inverse mapping** with bilinear sampling, without OpenCV warping. Compare with `cv2.warpAffine`. {level=hard tags="warping,affine,interpolation"}
For every output pixel compute where it came from (apply the inverse rotation), then sample there. Pixels that map outside the source stay black.

:::solution Reference solution
```python run title="Rotation by backward mapping"
import numpy as np
import cv2
import cvlab

def rotate(img, angle_deg):
    h, w = img.shape
    c = np.array([(w - 1) / 2, (h - 1) / 2]); t = np.deg2rad(-angle_deg)          # image y points DOWN, so a counter-clockwise turn is a negative angle here
    R = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    dst = np.stack([xs - c[0], ys - c[1]], -1)                           # output coordinates relative to the centre
    src = dst @ R + c                                                    # inverse mapping: multiply by R^T (written as dst @ R) and shift back
    sx, sy = src[..., 0], src[..., 1]
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
    valid = (x0 >= 0) & (y0 >= 0) & (x0 < w - 1) & (y0 < h - 1)         # fully inside the source (the 2x2 neighbourhood exists)
    x0c, y0c = np.clip(x0, 0, w - 2), np.clip(y0, 0, h - 2)
    fx, fy = sx - x0c, sy - y0c
    a, b, c_, d = img[y0c, x0c], img[y0c, x0c + 1], img[y0c + 1, x0c], img[y0c + 1, x0c + 1]
    out = (1 - fy) * ((1 - fx) * a + fx * b) + fy * ((1 - fx) * c_ + fx * d)
    return np.where(valid, out, 0)

img = cvlab.image("camera", gray=True).astype(np.float32)
h, w = img.shape
for angle in (30, -75):
    mine = rotate(img, angle)
    M = cv2.getRotationMatrix2D(((w - 1) / 2, (h - 1) / 2), angle, 1.0)         # OpenCV's angle is counter-clockwise on the image
    ref = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
    inner = (slice(40, h - 40), slice(40, w - 40))
    err = np.abs(mine - ref)[inner].mean()
    print(f"angle {angle:>4}: mean difference to cv2.warpAffine in the central area {err:.3f} grey levels")
    assert err < 2.0
cvlab.show(img.astype(np.uint8), "Original", np.clip(rotate(img, 30), 0, 255).astype(np.uint8), "Rotated 30 degrees (mine)")
print("forward mapping would leave holes; backward mapping gives every output pixel exactly one value")
```
Follow-ups: the direction convention (clockwise vs counter-clockwise, image y points down), expanding the canvas so corners are not cut, the 3×3 version for perspective warps.
:::
:::

## 14. Projecting 3-D points and computing mAP

:::problem (a) Project 3-D world points to pixels with intrinsics `K` and pose `(R, t)` and check against `cv2.projectPoints`. (b) Compute average precision at IoU 0.5 for one class from a list of scored detections and ground-truth boxes. {level=medium tags="projection,map,metrics"}
(a) `x = K (R X + t)` then divide by the last coordinate. (b) Sort by score, mark true/false positives (each ground-truth box can be matched once), build precision/recall, integrate the monotone envelope.

:::solution Reference solution
```python run title="Projection and average precision"
import numpy as np
import cv2

# ---- (a) pinhole projection
def project(X, K, R, t):
    cam = X @ R.T + t                                                    # world -> camera frame
    assert (cam[:, 2] > 0).all(), "points behind the camera"
    uv = cam @ K.T
    return uv[:, :2] / uv[:, 2:3]                                        # perspective division

K = np.array([[800., 0, 320], [0, 800., 240], [0, 0, 1]])
rvec = np.array([0.1, -0.2, 0.05]); R = cv2.Rodrigues(rvec)[0]; t = np.array([0.1, -0.05, 4.0])
X = np.random.default_rng(0).uniform(-1, 1, (20, 3))
mine = project(X, K, R, t)
ref = cv2.projectPoints(X, rvec, t, K, None)[0].reshape(-1, 2)
print("projection: max difference from cv2.projectPoints:", float(np.abs(mine - ref).max()))
assert np.abs(mine - ref).max() < 1e-6

# ---- (b) average precision at IoU 0.5
def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1])); i = ix * iy
    return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i)

def average_precision(dets, gts, thr=0.5):
    """dets: list of (image_id, score, box); gts: dict image_id -> list of boxes."""
    dets = sorted(dets, key=lambda d: -d[1])                              # most confident first
    used = {k: [False] * len(v) for k, v in gts.items()}
    n_gt = sum(len(v) for v in gts.values())
    tp = np.zeros(len(dets)); fp = np.zeros(len(dets))
    for i, (img_id, score, box) in enumerate(dets):
        cands = [(iou(box, g), j) for j, g in enumerate(gts.get(img_id, [])) if not used[img_id][j]]
        best = max(cands, default=(0, -1))
        if best[0] >= thr: tp[i] = 1; used[img_id][best[1]] = True          # a ground-truth box can be matched only once
        else: fp[i] = 1                                                    # duplicate or wrong detection
    tp, fp = np.cumsum(tp), np.cumsum(fp)
    recall = tp / n_gt; precision = tp / (tp + fp)
    mrec = np.concatenate([[0], recall, [1]]); mpre = np.concatenate([[0], precision, [0]])
    for k in range(len(mpre) - 2, -1, -1): mpre[k] = max(mpre[k], mpre[k + 1])      # monotone precision envelope
    idx = np.nonzero(mrec[1:] != mrec[:-1])[0]
    return float(((mrec[idx + 1] - mrec[idx]) * mpre[idx + 1]).sum())

gts = {"a": [[0, 0, 10, 10], [20, 20, 30, 30]], "b": [[0, 0, 10, 10]]}            # 3 ground-truth objects
dets = [("a", 0.9, [0, 0, 10, 10]), ("a", 0.8, [0, 1, 10, 11]),                    # a correct box and a duplicate of it (false positive)
        ("b", 0.7, [50, 50, 60, 60]), ("a", 0.6, [20, 20, 30, 30]), ("b", 0.5, [0, 0, 10, 10])]
ap = average_precision(dets, gts)
print("AP@0.5 =", round(ap, 4))
# by hand: ranked TP/FP = T F F T T -> precision 1, .5, .33, .5, .6 ; recall .33, .33, .33, .67, 1.0 ; envelope areas: .333*1 + .333*.6 + .333*.6
assert abs(ap - (1 / 3 + 1 / 3 * 0.6 + 1 / 3 * 0.6)) < 1e-9
print("perfect detections would give 1.0; COCO averages this over IoU 0.5..0.95 and over classes")
```
Follow-ups: COCO's 101-point interpolation, per-class vs mean, why duplicates are false positives, what mAP hides (calibration, operating threshold).
:::
:::

## What to do if you get stuck

1. Say the **brute-force** version aloud, then speed it up.
2. Work a **tiny example** by hand (2×2 image, two boxes).
3. Check **shapes and dtypes** at each line (`print(x.shape, x.dtype)`).
4. Compare with a library call on random data: that is allowed and shows good engineering.
5. Mention the **complexity** and what would break at scale.

:::interview Questions you may get
- "Implement IoU / NMS / convolution / bilinear resize / histogram equalisation / k-means / connected components on the whiteboard." The reference solutions above, in 10-15 minutes each.
- "How do you test an image-processing function?" Small hand-computed examples, comparison with a trusted library on random inputs, property checks (identity kernel returns the input; rotation by 0° and 360° returns the input), edge cases (1×1 images, borders).
- "Why is the loop version slow and how do you fix it?" Python-level loops over pixels are about 100× slower than vectorised NumPy; vectorise over images or loop over small dimensions (the kernel), use integral images, or move to C++/GPU.
- "What are common bugs in image code?" `uint8` overflow, `(x, y)` versus `(row, col)`, BGR versus RGB, mixed float and integer ranges (0-1 versus 0-255), off-by-half-pixel conventions, modifying a view instead of a copy.
:::

```quiz
? Which is true about the cost of a box filter computed with an integral image?
+ It is constant per pixel, independent of the window size
- It grows with the square of the window size
- It needs the FFT
> Four lookups per pixel.

? In NMS, which boxes are removed after choosing the highest-scoring box?
+ The remaining boxes whose IoU with it exceeds the threshold
- All boxes of the other classes
- The lowest-scoring box only
> Greedy suppression.

? Why does backward (inverse) warping avoid holes?
+ Every output pixel looks up exactly one location in the source
- It interpolates twice
- It uses less memory
> Forward warping can leave gaps.

? What does Hartley normalisation improve in the DLT?
+ The numerical conditioning of the system
- The speed of RANSAC
- The number of correspondences
> Points are centred and scaled before the SVD.
```

:::keypoints
- Practise the fourteen classics until you can write them in 10-15 minutes: IoU, NMS, convolution, bilinear resize, equalisation, Otsu, connected components, k-means, integral image, Sobel + thinning, Harris, homography DLT, rotation by inverse warping, projection and AP.
- Always test against a trusted library or a hand-computed example, and say out loud what you check.
- Mention complexity, vectorisation and the usual traps: dtype overflow, coordinate order, channel order, border handling, half-pixel conventions.
:::

:::resources
- [NumPy documentation: broadcasting](https://numpy.org/doc/stable/user/basics.broadcasting.html) — the tool behind vectorised solutions.
- [OpenCV documentation: image filtering](https://docs.opencv.org/4.x/d4/d86/group__imgproc__filter.html) — reference behaviour for borders and kernels.
- [COCO: detection evaluation metrics](https://cocodataset.org/#detection-eval) — the official definition of AP.
:::
