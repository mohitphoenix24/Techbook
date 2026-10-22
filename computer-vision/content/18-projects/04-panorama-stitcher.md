---
title: Build a Panorama Stitcher
level: advanced
time: 55
icon: globe
cover: #8b5cf6,#06b6d4
tags: sift, matching, ransac, homography, blending, exposure
summary: Stitch two overlapping photos into one wide picture. Detect SIFT features, match them with the ratio test, estimate the homography with RANSAC, warp both images onto a common canvas, correct the exposure difference and blend the seam. A generator with the true panorama lets you measure the homography error, the pixel error of the final result, and how everything degrades as the overlap shrinks.
---

A phone panorama is a chain of ideas you have already met: **local features → matching → RANSAC → homography → warping → blending**. The pictures of a panorama are related by a homography because the camera **only rotates** (module 3). In this project you will build the whole pipeline, and, because we generate the two photos from a **known original**, you can measure exactly how good your stitching is.

**What you'll build:** `stitch(a, b)` that returns a panorama, together with measurements of the homography error, the pixel error against the true panorama, and a sweep over the overlap.

:::flow The pipeline
Two photos | partly overlapping, different exposure
SIFT features | keypoints and descriptors in both
Ratio-test matching | keep unambiguous matches
RANSAC homography | reject the wrong matches
Canvas and warp | both images in one frame
Exposure gain | match the brightness
Blend | feather the seam
Evaluate | error versus the true panorama
:::

## Step 1 — Two photos from a known panorama

We take one photograph (the "scene") and cut two pieces from it with a chosen **overlap**. The second piece is then **re-photographed** by a slightly rotated camera (a small rotation plus a little perspective, which is a homography), made **darker**, and given sensor noise, just like a real second shot with different auto-exposure. Because we know the original and the homography, we know the **true answer**.

```python run shared title="Step 1 · a pair with known truth"
import numpy as np
import cv2
import cvlab

def make_pair(name="astronaut", overlap=0.3, angle=4.0, persp=(3e-4, 1e-4), gain=0.8, noise=3, seed=0):
    P = cvlab.image(name)
    if P.ndim == 2: P = cv2.cvtColor(P, cv2.COLOR_GRAY2RGB)
    H_, W_ = P.shape[:2]
    left_w = int(W_ * (0.5 + overlap / 2)); x0 = int(W_ * (0.5 - overlap / 2))              # the two crops overlap by `overlap` of the width
    left, right_orig = P[:, :left_w].copy(), P[:, x0:].copy()
    h, w = right_orig.shape[:2]
    c = np.array([w / 2, h / 2]); t = np.deg2rad(angle)
    R = np.array([[np.cos(t), -np.sin(t), 0], [np.sin(t), np.cos(t), 0], [0, 0, 1]])
    T1 = np.array([[1, 0, -c[0]], [0, 1, -c[1]], [0, 0, 1]], float); T2 = np.array([[1, 0, c[0]], [0, 1, c[1]], [0, 0, 1]], float)
    Hw = T2 @ np.array([[1, 0, 0], [0, 1, 0], [persp[0], persp[1], 1]], float) @ R @ T1     # how the second camera differs: rotation + perspective
    right = cv2.warpPerspective(right_orig, Hw, (w, h), borderMode=cv2.BORDER_REFLECT)
    rng = np.random.default_rng(seed)
    right = np.clip(right.astype(np.float32) * gain + rng.normal(0, noise, right.shape), 0, 255).astype(np.uint8)      # darker and noisier
    left = np.clip(left.astype(np.float32) + rng.normal(0, noise, left.shape), 0, 255).astype(np.uint8)
    H_true = np.array([[1, 0, x0], [0, 1, 0], [0, 0, 1]], float) @ np.linalg.inv(Hw)         # maps right-image pixels into the left image's frame
    return left, right, H_true, P

left, right, H_true, scene = make_pair("astronaut", overlap=0.3)
print("left", left.shape, "| right", right.shape, "| the right photo is", f"{right.mean() / left.mean():.0%} as bright as the left one")
cvlab.show(left, "Left photo", right, "Right photo (rotated, darker, noisier)")
```

## Step 2 — Features and matching

SIFT finds keypoints that survive scale, rotation and brightness changes. For each descriptor of the right image we find the **two** nearest descriptors of the left image and apply **Lowe's ratio test** (module 4): a match is kept only if it is clearly better than the runner-up. That removes the ambiguous matches (repeated texture), but wrong matches remain, which is why RANSAC comes next.

```python run shared title="Step 2 · SIFT and ratio-test matching"
def match_features(a, b, ratio=0.75):
    sift = cv2.SIFT_create(nfeatures=3000)
    ga, gb = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY), cv2.cvtColor(b, cv2.COLOR_RGB2GRAY)
    ka, da = sift.detectAndCompute(ga, None); kb, db = sift.detectAndCompute(gb, None)
    knn = cv2.BFMatcher(cv2.NORM_L2).knnMatch(db, da, k=2)                  # query: right image, train: left image
    good = [m for m, n in (p for p in knn if len(p) == 2) if m.distance < ratio * n.distance]
    src = np.float32([kb[m.queryIdx].pt for m in good])                    # points in the right image
    dst = np.float32([ka[m.trainIdx].pt for m in good])                    # their partners in the left image
    return src, dst, len(ka), len(kb)

src, dst, na, nb = match_features(left, right)
print(f"keypoints: {na} left, {nb} right | matches after the ratio test: {len(src)}")
# how many of these matches are TRULY right? (possible only because we know the true homography)
true_dst = cv2.perspectiveTransform(src[None], H_true)[0]
correct = np.linalg.norm(true_dst - dst, axis=1) < 3.0
print(f"matches that are geometrically correct: {correct.sum()} of {len(src)} ({correct.mean():.0%}); the rest are outliers")
```

## Step 3 — RANSAC homography

`cv2.findHomography(..., cv2.RANSAC, 3.0)` repeatedly fits a homography to **four random matches**, counts how many other matches agree within 3 pixels (inliers), keeps the best model and refits on its inliers (module 4). We then compare it with the **true** homography by mapping the four corners of the right image through both and measuring the largest distance.

```python run shared title="Step 3 · robust homography and its error"
def estimate_homography(src, dst, thresh=3.0):
    H, inliers = cv2.findHomography(src, dst, cv2.RANSAC, thresh)
    return H, (None if inliers is None else inliers.ravel().astype(bool))

def corner_error(H, H_ref, shape):
    h, w = shape[:2]
    corners = np.float32([[0, 0], [w, 0], [w, h], [0, h]])[None]
    return float(np.linalg.norm(cv2.perspectiveTransform(corners, H)[0] - cv2.perspectiveTransform(corners, H_ref)[0], axis=1).max())

H, inl = estimate_homography(src, dst)
print(f"RANSAC inliers: {inl.sum()} of {len(src)}")
print(f"homography error: the corners of the right photo land at most {corner_error(H, H_true, right.shape):.2f} px from the truth")
Hls, _ = cv2.findHomography(src, dst, 0)                                    # plain least squares on ALL matches, outliers included
print(f"without RANSAC (least squares on all matches): {corner_error(Hls, H_true, right.shape):.1f} px error  <- outliers ruin it")
assert corner_error(H, H_true, right.shape) < 3
```

## Step 4 — Canvas, warp and blend

Now put both images on one canvas:

1. Map the four corners of the right image through `H` and take the **bounding box** of everything to decide the canvas size (some coordinates are negative, so we add a translation).
2. **Warp** both images onto the canvas with `warpPerspective`.
3. **Exposure compensation**: in the overlap region, compare the two images and multiply the right one by a per-channel **gain** so that its brightness matches the left one.
4. **Feather blend**: in the overlap, mix the images with weights that go smoothly from 1 to 0 using the **distance to each image's border**, so the seam disappears.

```python run shared title="Step 4 · stitch(): canvas, gain, feathering"
def stitch(a, b, H, gain_comp=True, feather=True):
    ha, wa = a.shape[:2]; hb, wb = b.shape[:2]
    cb = cv2.perspectiveTransform(np.float32([[0, 0], [wb, 0], [wb, hb], [0, hb]])[None], H)[0]       # where b's corners land in a's frame
    allc = np.vstack([cb, [[0, 0], [wa, 0], [wa, ha], [0, ha]]])
    x0, y0 = np.floor(allc.min(0)).astype(int); x1, y1 = np.ceil(allc.max(0)).astype(int)
    T = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], float); size = (x1 - x0, y1 - y0)            # translate so nothing has negative coordinates
    img_a = cv2.warpPerspective(a, T, size); img_b = cv2.warpPerspective(b, T @ H, size)
    ma = cv2.warpPerspective(np.full((ha, wa), 255, np.uint8), T, size) > 0                            # where each image has pixels
    mb = cv2.erode((cv2.warpPerspective(np.full((hb, wb), 255, np.uint8), T @ H, size) > 0).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    both = ma & mb
    img_bf = img_b.astype(np.float32)
    if gain_comp and both.any():
        img_bf *= img_a[both].mean(0) / (img_b[both].mean(0) + 1e-6)                                   # per-channel gain from the overlap
    if feather:
        da, db = cv2.distanceTransform(ma.astype(np.uint8), cv2.DIST_L2, 3), cv2.distanceTransform(mb.astype(np.uint8), cv2.DIST_L2, 3)
        w_a = da / (da + db + 1e-6)                                                                    # near a's border -> trust b, and vice versa
    else:
        w_a = np.where(both, 1.0, ma.astype(np.float32))                                               # hard seam: a wins in the overlap
    out = w_a[..., None] * img_a + (1 - w_a[..., None]) * img_bf
    return np.clip(np.where((ma | mb)[..., None], out, 0), 0, 255).astype(np.uint8), (x0, y0), both

pano, offset, overlap_mask = stitch(left, right, H)
print("panorama:", pano.shape, "| canvas offset", offset, "| overlap pixels:", int(overlap_mask.sum()))
raw, _, _ = stitch(left, right, H, gain_comp=False, feather=False)
cvlab.show(raw, "No exposure fix, hard seam", pano, "Gain + feathered blend")
```

## Step 5 — Score the panorama against the truth

Because we cut the pictures from a known scene, we can compare the stitched result with the **true panorama** (the original image, in the same frame) and report an **RMSE in grey levels**. This is the number that tells you whether exposure compensation and blending actually help.

```python run shared title="Step 5 · RMSE against the true panorama"
def rmse_vs_truth(pano, offset, scene):
    x0, y0 = offset; h, w = pano.shape[:2]; ph, pw = scene.shape[:2]
    truth = np.zeros_like(pano)
    ys, xs = slice(max(0, -y0), min(h, ph - y0)), slice(max(0, -x0), min(w, pw - x0))
    truth[ys, xs] = scene[ys.start + y0: ys.stop + y0, xs.start + x0: xs.stop + x0]                    # crop the scene into the canvas frame
    valid = (pano.sum(2) > 0) & (truth.sum(2) > 0)
    return float(np.sqrt(((pano.astype(float) - truth.astype(float)) ** 2)[valid].mean()))

print("variant                              | RMSE vs the true panorama (grey levels)")
for name, gc, fe in [("no gain, hard seam", False, False), ("gain compensation only", True, False), ("gain + feathered blend", True, True)]:
    p, off, _ = stitch(left, right, H, gc, fe)
    print(f"{name:<36} | {rmse_vs_truth(p, off, scene):5.2f}")
print("the exposure gain removes most of the error; feathering trades a tiny blur for an invisible seam (judge it by eye)")
```

## Step 6 — How much overlap do you need?

Photographers are told to overlap shots by 20-30%. Why? With less overlap there are fewer shared features, RANSAC has fewer inliers and the homography error grows quickly. We sweep the overlap on three photos and flag the runs whose corner error exceeds 3 pixels.

```python run shared title="Step 6 · overlap sweep"
print("overlap | " + " | ".join(f"{n:<14}" for n in ("astronaut", "cat", "coffee")))
for ov in (0.5, 0.3, 0.15, 0.06):
    cells = []
    for name in ("astronaut", "cat", "coffee"):
        a, b, Ht, _ = make_pair(name, overlap=ov)
        s, d, _, _ = match_features(a, b)
        if len(s) < 8:
            cells.append("fail (matches)"); continue
        Hh, inl = estimate_homography(s, d)
        if Hh is None:
            cells.append("fail (RANSAC)"); continue
        e = corner_error(Hh, Ht, b.shape)
        cells.append(f"{inl.sum():>3} in, {e:6.1f}px" + (" " if e < 3 else "!"))
    print(f"{ov:>6.0%}  | " + " | ".join(f"{c:<14}" for c in cells))
print("'!' marks a run with more than 3 px corner error: too little overlap for a reliable homography")
```

## How it works

| Piece | Purpose |
|---|---|
| SIFT | features that survive rotation, scale and exposure differences between the two shots |
| Ratio test | rejects ambiguous matches cheaply |
| RANSAC + homography | the right model for a rotating camera; rejects the remaining outliers |
| Canvas from warped corners | makes the output big enough for both images with no cut-off |
| Gain compensation | the two shots had different auto-exposure; without it a visible step appears at the seam |
| Distance-transform feathering | smooth transition across the overlap |
| Truth-based evaluation | corner error and RMSE show what really helps |

**Where it breaks**: too little overlap, **parallax** (the camera moved, not only rotated, and the scene has depth, so one homography cannot fit), moving objects in the overlap (ghosts), repetitive texture, and large lens distortion or vignetting. Real stitchers (OpenCV `Stitcher`, Hugin, phone apps) add **cylindrical or spherical warping** (to avoid stretching in wide panoramas), **bundle adjustment** over many images (module 5), **seam finding** (graph cuts) and **multi-band blending**.

:::exercise Extend it
1. Stitch **three** photos: estimate `H` for each neighbouring pair and chain them (`H_total = H_12 @ H_23`); watch the error accumulate, and say why bundle adjustment helps.
2. Replace SIFT by **ORB** and Hamming matching and compare speed and inlier count in the sweep.
3. Add a **moving object** in the overlap (paste a coloured circle at different positions in the two photos) and show the ghost; then pick one image's pixels in that region (a simple seam).
4. Implement **multi-band blending** with Laplacian pyramids (module 2) and compare the visual seam with feathering.
5. Compare your result with `cv2.Stitcher_create().stitch([left, right])`.
:::

:::keypoints
- A panorama is SIFT features, ratio-test matching, a RANSAC homography, a warp onto a common canvas, exposure compensation and blending.
- A homography is exact for a **rotating camera**; parallax and moving objects violate it.
- RANSAC is essential: least squares on all matches is destroyed by outliers.
- Exposure gain removes the biggest visible error; feathering hides the seam.
- With known ground truth you can measure homography error and RMSE, and see how quickly everything degrades with less overlap.
:::
