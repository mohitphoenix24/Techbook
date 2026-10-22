---
title: Build a Coin Counter and Sizer
level: intermediate
time: 50
icon: target
cover: #f59e0b,#ef4444
tags: thresholding, morphology, distance transform, watershed, hough circles, measurement
summary: Count and measure round objects. Segment a real coin photo, then handle the hard part, touching objects, with the distance transform and watershed. Compare with the Hough circle transform, turn pixels into millimetres with a reference object, and evaluate counting and size errors on twenty random scenes with known truth.
---

Counting and measuring round things (coins, pills, bolts, bubbles, cells) is a classic vision job, and the difficulty is always the same: **touching objects glue into one blob**. In this project you will first count real coins, then build a scene generator with **known truth** so you can measure how well your counting and sizing really work, and compare two classic ways to separate touching objects.

**What you'll build:** `detect(img)` that returns the centre and radius of every disc, a pixel-to-millimetre calibration, and an evaluation on twenty scenes.

:::flow The pipeline
Photo | bright discs, uneven background
Segment | background removal, Otsu, clean
Distance transform | each disc gives a peak
Markers | one per peak
Watershed | split touching discs
Measure | centre, radius, millimetres
Evaluate | count and size error vs truth
:::

## Step 1 — A real photo: count the coins

The sample photo `coins` has 24 silver coins on a dark background with a bright haze at the top, so a plain Otsu threshold merges the top row with the background. The remedy is a **top-hat transform** (image minus its morphological opening): it keeps bright things *smaller than the structuring element* and removes the slowly changing background.

```python run shared title="Step 1 · segment the real coins"
import numpy as np
import cv2
import cvlab

gray = cvlab.image("coins", gray=True)
blur = cv2.GaussianBlur(gray, (5, 5), 0)

_, plain = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)               # plain Otsu: fooled by the bright haze
th = cv2.morphologyEx(blur, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (91, 91)))   # keep objects smaller than a 91 px disc
_, mask = cv2.threshold(th, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
filled = np.zeros_like(mask)
cv2.drawContours(filled, [c for c in contours if cv2.contourArea(c) > 150], -1, 255, -1)  # fill the coins' dark engraving holes

n, labels, stats, cent = cv2.connectedComponentsWithStats(filled)
print("plain Otsu components:", cv2.connectedComponents(plain)[0] - 1, "| after top-hat:", n - 1, "(the photo shows 24 coins)")
assert n - 1 == 24
diam = 2 * np.sqrt(stats[1:, cv2.CC_STAT_AREA] / np.pi)                                       # equivalent diameter from the area
print(f"coin diameters in pixels: smallest {diam.min():.0f}, median {np.median(diam):.0f}, largest {diam.max():.0f}")
cvlab.show(gray, "Photo", plain, "Plain Otsu (merges the top row)", filled, "Top-hat + Otsu")
```

## Step 2 — A scene generator with known truth

Real photos rarely come with the answer. A small **synthetic generator** gives us discs (or ellipses, for later) with a **known number, centre and radius**, with shading, noise and a tunable amount of **overlap** so that discs touch. This is how you debug a counting algorithm: you can finally measure its error.

```python run shared title="Step 2 · generate scenes with ground truth"
def make_scene(seed, n=10, size=(360, 280), overlap=0.12, aspect=1.0):
    """Discs (or ellipses when aspect > 1) on a dark noisy background. Returns the grey image and an array of (x, y, r) truth."""
    rng = np.random.default_rng(seed); w, h = size
    discs = []
    for _ in range(3000):
        if len(discs) == n: break
        r = rng.uniform(17, 30); x = rng.uniform(r + 4, w - r - 4); y = rng.uniform(r + 4, h - r - 4)
        if all(np.hypot(x - a, y - b) >= (r + ra) * (1 - overlap) for a, b, ra in discs):       # allow neighbours to overlap by a fraction
            discs.append((x, y, r))
    yy, xx = np.mgrid[0:h, 0:w]
    img = rng.normal(40, 5, (h, w))
    for x, y, r in discs:
        th = rng.uniform(0, np.pi) if aspect != 1.0 else 0.0
        u = (xx - x) * np.cos(th) + (yy - y) * np.sin(th); v = -(xx - x) * np.sin(th) + (yy - y) * np.cos(th)
        d = np.hypot(u / np.sqrt(aspect), v * np.sqrt(aspect))                                   # ellipse with the same area as the disc of radius r
        shade = rng.uniform(150, 215) + 25 * (1 - d / r) - 15 * (yy - y) / r                     # brightness varies per coin, with a lighting gradient
        img = np.where(d <= r, shade + rng.normal(0, 4, (h, w)), img)
    return np.clip(cv2.GaussianBlur(img, (0, 0), 1.0), 0, 255).astype(np.uint8), np.array(discs)

img, truth = make_scene(seed=3)
_, mask = cv2.threshold(cv2.GaussianBlur(img, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
blobs = cv2.connectedComponents(mask)[0] - 1
print(f"true number of discs: {len(truth)} | connected components in the mask: {blobs}  <- touching discs are counted as one object")
cvlab.show(img, "A synthetic scene", mask, "Threshold: touching discs merge")
```

## Step 3 — Separate touching discs: distance transform + watershed

The **distance transform** gives each foreground pixel its distance to the nearest background pixel. For a disc it is a cone whose **peak is the centre** and whose **height is the radius**. Two touching discs make two peaks with a saddle (the "neck") between them. The plan:

1. **Smooth** the distance map a little so that an elongated shape still gives only one peak.
2. Take **local maxima** as markers (one per object).
3. Run the **watershed** from the markers: the flooding fronts of two discs meet exactly at the neck, which cuts the blob in two.
4. The radius estimate is the **distance value at the peak** (the largest inscribed circle).

```python run shared title="Step 3 · detect(): markers and watershed"
def detect(img):
    blur = cv2.GaussianBlur(img, (5, 5), 0)
    _, mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    sm = cv2.GaussianBlur(dist, (0, 0), 3)                                               # one peak per object, even for elongated shapes
    peak = cv2.dilate(sm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))         # a pixel is a peak if it equals the local maximum
    candidates = ((sm == peak) & (sm > 8)).astype(np.uint8)                                # ignore tiny peaks (noise)
    n, markers = cv2.connectedComponents(candidates)
    markers = np.where(markers > 0, markers + 1, 0).astype(np.int32)                       # 0 = unknown, 1 = background, 2.. = objects
    markers[mask == 0] = 1
    ws = cv2.watershed(cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), markers)
    found = []
    for k in range(2, n + 1):
        region = ws == k
        if region.sum() < 50: continue
        ys, xs = np.nonzero(region)
        found.append((xs.mean(), ys.mean(), dist[markers == k].max()))                    # centre of the region, radius = peak distance
    return np.array(found).reshape(-1, 3), ws

def match(det, truth, tol=0.5):
    """Greedy matching: a detection is correct if its centre is within tol*radius of an unused true disc. Returns (matched, radius errors)."""
    used, errs = set(), []
    for x, y, r in det:
        d = np.hypot(truth[:, 0] - x, truth[:, 1] - y); j = int(d.argmin())
        if d[j] < tol * truth[j, 2] and j not in used:
            used.add(j); errs.append(abs(r - truth[j, 2]))
    return len(used), errs

det, ws = detect(img)
tp, errs = match(det, truth)
print(f"scene 3: true {len(truth)}, detected {len(det)}, matched {tp}, mean radius error {np.mean(errs):.2f} px")
vis = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB); vis[ws == -1] = (255, 0, 0)                  # watershed lines in red
for x, y, r in det: cv2.circle(vis, (int(x), int(y)), int(r), (0, 255, 0), 1)
cvlab.show(vis, "Detected discs (green) and the watershed cuts (red)")
```

## Step 4 — Evaluate on twenty scenes

One lucky image proves nothing. Run all twenty scenes and report **exact-count accuracy** (every disc found, none invented), the **plain connected-components** baseline, and the **radius error**.

```python run shared title="Step 4 · evaluation over 20 scenes"
exact = 0; base_err = []; rad_err = []; total_true = total_tp = total_det = 0
for seed in range(20):
    img, truth = make_scene(seed)
    det, _ = detect(img)
    tp, errs = match(det, truth)
    _, m = cv2.threshold(cv2.GaussianBlur(img, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    base_err.append(abs(cv2.connectedComponents(m)[0] - 1 - len(truth)))
    exact += len(det) == len(truth) and tp == len(truth)
    rad_err += errs; total_true += len(truth); total_tp += tp; total_det += len(det)
print(f"discs: {total_true} true, {total_det} detected, {total_tp} matched")
print(f"scenes counted exactly: {exact}/20 | baseline (connected components) mean count error per scene: {np.mean(base_err):.2f}")
print(f"radius error: mean {np.mean(rad_err):.2f} px, 95th percentile {np.percentile(rad_err, 95):.2f} px")
assert exact >= 18 and np.mean(rad_err) < 1.5
```

## Step 5 — Compare with the Hough circle transform

`cv2.HoughCircles` votes for circle centres using edge gradients; it needs a **radius range** and gives the radius directly. It is excellent for perfect circles, but it assumes the object **is** a circle. We test both methods on discs and on ellipses (aspect ratio 1.6) of the same area.

```python run shared title="Step 5 · watershed versus Hough"
def hough_detect(img):
    c = cv2.HoughCircles(cv2.medianBlur(img, 5), cv2.HOUGH_GRADIENT, dp=1.2, minDist=22, param1=100, param2=22, minRadius=14, maxRadius=34)
    return np.zeros((0, 3)) if c is None else c[0]

print("object shape | method    | detected / true | scenes exactly right")
for aspect, label in [(1.0, "discs"), (1.6, "ellipses")]:
    for name, fn in [("watershed", lambda im: detect(im)[0]), ("Hough", hough_detect)]:
        dd = tt = ex = 0
        for seed in range(20):
            im, tr = make_scene(seed, aspect=aspect, overlap=0.12 if aspect == 1.0 else 0.0)
            det = fn(im); dd += len(det); tt += len(tr); ex += len(det) == len(tr)
        print(f"{label:<12} | {name:<9} | {dd:>4} / {tt:<4}     | {ex}/20")
print("Hough is as good as watershed on perfect discs, but collapses on ellipses; watershed only needs 'blobs with a width'")
```

## Step 6 — From pixels to millimetres

A camera measures **pixels**; people want **millimetres**. The simplest calibration uses a **reference object of known size** lying in the **same plane** as the things you measure: `mm_per_px = known_size_mm / measured_size_px`. Here one disc is a reference (a coin of 24 mm diameter); the true scale of our scene is 0.4 mm per pixel, so we can check the measurement errors.

```python run shared title="Step 6 · calibrate with a reference coin"
errors_mm = []
for seed in range(20):
    img, truth = make_scene(seed)
    det, _ = detect(img)
    ref_true = truth[truth[:, 2].argmax()]                                  # the largest disc plays the 24 mm reference coin
    d = np.hypot(det[:, 0] - ref_true[0], det[:, 1] - ref_true[1]); ref = det[d.argmin()]
    scale_est = 24.0 / (2 * ref[2])                                         # calibration: mm per pixel from the reference's MEASURED diameter
    scale_true = 24.0 / (2 * ref_true[2])                                   # the real scale of this scene (known only because we made it)
    for x, y, r in det:
        dj = np.hypot(truth[:, 0] - x, truth[:, 1] - y); j = int(dj.argmin())
        if dj[j] < 0.5 * truth[j, 2]:
            errors_mm.append(abs(2 * r * scale_est - 2 * truth[j, 2] * scale_true))     # measured diameter (mm) minus true diameter (mm)
print(f"diameter error in mm over all discs: mean {np.mean(errors_mm):.2f}, worst {np.max(errors_mm):.2f}")
img, truth = make_scene(7); det, _ = detect(img)
ref_r = det[:, 2].max()
print("example diameters (mm) measured with the largest disc as the 24 mm reference:", np.round(2 * det[:6, 2] * 24.0 / (2 * ref_r), 1).tolist())
print("a 1-pixel error in the radius is about", round(2 * 1 * 24.0 / (2 * 30), 2), "mm for a reference of 30 px radius: pixels per millimetre limit the accuracy")
```

## How it works

| Piece | Purpose |
|---|---|
| Top-hat transform (Step 1) | removes slowly varying bright background so a global threshold works |
| Contour filling | fills dark engravings inside coins so each coin is a solid blob |
| Distance transform | converts "touching blob" into "two cones": peaks mark centres, heights mark radii |
| Gaussian smoothing of the distance map | prevents several peaks on one elongated object (over-splitting) |
| Markers + watershed | splits the blob along the neck between peaks |
| Greedy matching with truth | lets you compute precision/recall and size errors, not just a count |
| Reference-object calibration | `mm per px` valid **only in the plane of the reference** |

**Where it breaks**: heavy overlap (a hidden disc), non-uniform lighting that cuts discs in half, coins with reflective rims, tiny discs near the noise level, and perspective (the scale changes across the image; use a homography to a top-down view, module 3, or calibrate the camera, module 5).

:::exercise Extend it
1. Add **overlap = 0.3** (heavily overlapping discs) to `make_scene` and see when the count breaks. Which parameter would you change first?
2. Use the **centre colour or size** to classify each coin into denominations (for example by diameter in mm) and report the total value.
3. Replace the Otsu step by **adaptive thresholding** and test on a scene with a strong lighting gradient.
4. Compute the **precision and recall** of detections (not just the count) across all scenes, and plot them against the overlap fraction.
5. Add **perspective**: warp the scene with a homography, and rectify it back using four known points before measuring.
:::

:::keypoints
- Touching objects are the core difficulty of counting; the distance transform turns them into peaks and the watershed cuts along the necks.
- A top-hat transform removes uneven background that fools a global threshold.
- A generator with known truth lets you measure exact-count accuracy and size error instead of eyeballing a picture.
- Hough circles are great for perfect circles with a known radius range; watershed works for any blob shape.
- Pixel-to-millimetre conversion needs a reference in the same plane; the accuracy is limited by pixels per millimetre.
:::
