---
title: Build a Document Scanner
level: intermediate
time: 45
icon: file
cover: #0ea5e9,#84cc16
tags: edges, contours, homography, perspective, thresholding
summary: Turn a skewed photo of a sheet of paper on a desk into a flat, clean, scanner-style page. Find the page with edges and contours, order its four corners, warp it with a homography, clean the shadows, and measure how accurately it works on ten different photos.
---

A phone scanner app does four things: **find the page**, **find its four corners**, **flatten it** with a perspective warp, and **clean it up**. Each step uses an idea from the course (Canny, contours, homography, adaptive thresholding). By the end you will have a `scan(photo)` function you can test on many images and an honest success rate.

**What you'll build:** `scan(photo) → (flat_page, corners)` plus a test that compares the corners with the truth on ten photos.

:::flow The pipeline
Photo | RGB image of a page on a desk
Edges | blur, Canny, close small gaps
Page contour | the largest 4-corner shape
Order corners | top-left, top-right, bottom-right, bottom-left
Homography | warp the quadrilateral to a rectangle
Clean | remove shadows, binarise
Evaluate | corner error on ten photos
:::

:::def Why four corners are enough
A flat sheet seen from any angle is related to the flat, front-on sheet by a **homography** (8 degrees of freedom). Four point correspondences (each gives two equations) determine it exactly, so the four corners of the paper are all you need to "un-perspective" the page.
:::

## Step 1 — The photo and its edges

`cvlab.document()` returns a synthetic but realistic photo (a page lying on a textured wooden desk with a soft shadow, at an angle, with noise) together with the **true corner positions**, which we will use only for testing.

```python run shared title="Step 1 · load the photo and find edges"
import numpy as np
import cv2
import cvlab

photo, true_corners = cvlab.document(seed=0)
print("photo:", photo.shape, photo.dtype)

def find_edges(img):
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)                         # smooth the wood grain and the sensor noise first
    edges = cv2.Canny(gray, 40, 120)                                  # thresholds: weak edge 40, strong edge 120
    return cv2.dilate(edges, np.ones((3, 3), np.uint8))               # thicken so that small gaps in the border are closed

edges = find_edges(photo)
print("edge pixels:", int((edges > 0).sum()))
cvlab.show(photo, "Photo", edges, "Edges (dilated)")
```

## Step 2 — Find the page: the biggest four-sided contour

Contours of the edge map are traced; we want the **largest** one that, after simplifying it (`approxPolyDP`, Douglas-Peucker), has **four vertices** and is a **convex** shape. If the border is broken and no clean quadrilateral exists, we fall back to the **minimum-area rectangle** around the largest contour.

```python run shared title="Step 2 · the page contour"
def find_page_quad(edges, min_area_frac=0.1):
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    h, w = edges.shape
    best = None
    for c in sorted(contours, key=cv2.contourArea, reverse=True)[:8]:
        if cv2.contourArea(c) < min_area_frac * h * w:                # ignore small things like the printed circle or desk marks
            break
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)                # simplify: tolerance = 2% of the perimeter
        if len(approx) == 4 and cv2.isContourConvex(approx):
            best = approx.reshape(4, 2).astype(np.float32); break
    if best is None and contours:                                       # fallback: rotated rectangle of the biggest contour
        c = max(contours, key=cv2.contourArea)
        best = cv2.boxPoints(cv2.minAreaRect(c)).astype(np.float32)
    return best

quad = find_page_quad(edges)
print("found corners (unordered):\n", np.round(quad, 1))
vis = photo.copy(); cv2.polylines(vis, [quad.astype(np.int32)], True, (255, 0, 0), 3)
cvlab.show(vis, "Detected page outline")
```

## Step 3 — Order the corners

The contour gives the four corners in an arbitrary order, but the homography needs a consistent order. A classic trick: the **top-left** corner has the smallest sum `x + y`, the **bottom-right** the largest sum; the **top-right** has the smallest difference `y − x`, the **bottom-left** the largest.

```python run shared title="Step 3 · order the corners"
def order_corners(pts):
    pts = np.asarray(pts, np.float32)
    s, d = pts.sum(1), pts[:, 1] - pts[:, 0]
    return np.array([pts[s.argmin()], pts[d.argmin()], pts[s.argmax()], pts[d.argmax()]], np.float32)     # TL, TR, BR, BL

corners = order_corners(quad)
print(np.round(corners, 1))
print("true corners:\n", np.round(true_corners, 1))
err = np.linalg.norm(corners - true_corners, axis=1)
print("corner errors in pixels:", np.round(err, 2))
assert err.max() < 8, "corner detection is too far from the truth"
```

## Step 4 — Flatten with a homography

The warp needs an output rectangle. The obvious choice takes the width and height from the **lengths of the page edges** in the photo. But perspective **shrinks the far edge and foreshortens one direction**, so the measured proportions are wrong; a real app either knows the paper size (A4, Letter) or estimates the aspect ratio from the camera geometry. Here we do both: first the naive size, to see the problem, then a `paper_aspect` argument.

`getPerspectiveTransform` computes the homography from four point pairs, and `warpPerspective` applies it (backward mapping with cubic interpolation, as in module 3).

```python run shared title="Step 4 · perspective warp, with and without a known paper size"
def flatten(img, corners, paper_aspect=None, long_side=800):
    tl, tr, br, bl = corners
    if paper_aspect is None:                                             # naive: lengths of the edges in the photo (distorted by perspective)
        width = int(round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))))
        height = int(round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))))
    else:                                                                # known paper: width / height = paper_aspect
        height, width = long_side, int(round(long_side * paper_aspect))
    target = np.float32([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]])
    H = cv2.getPerspectiveTransform(corners, target)
    return cv2.warpPerspective(img, H, (width, height), flags=cv2.INTER_CUBIC), H

naive, _ = flatten(photo, corners)
page, H = flatten(photo, corners, paper_aspect=300 / 400)                # our page is 300 x 400 units (3:4)
print(f"naive output {naive.shape[1]}x{naive.shape[0]}: width/height = {naive.shape[1] / naive.shape[0]:.3f}  (true paper: 0.750, perspective fooled the edge lengths)")
print(f"with the known paper aspect: {page.shape[1]}x{page.shape[0]}: width/height = {page.shape[1] / page.shape[0]:.3f}")
cvlab.show(naive, "Naive size (distorted proportions)", page, "Known paper aspect")
```

## Step 5 — Clean it up like a scanner

Phone photos of paper usually have **uneven light**: a hand or a lamp casts a soft shadow across the page. Our synthetic photo has only a faint one, so we add a strong diagonal shadow to the flattened page to mimic a real, difficult case. Two good tricks then remove it: **estimate the background** (a large closing removes the thin dark text and leaves the paper brightness) and **divide** the page by it, which flattens the lighting; then **adaptive thresholding** gives a crisp black-and-white result.

```python run shared title="Step 5 · remove shadows and binarise"
def clean(page, mode="bw"):
    gray = cv2.cvtColor(page, cv2.COLOR_RGB2GRAY)
    bg = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))      # closing removes the dark text, keeps the paper
    bg = cv2.GaussianBlur(bg, (0, 0), 10)
    flat = cv2.divide(gray, bg, scale=255)                              # uniform paper brightness
    if mode == "gray":
        return flat
    return cv2.adaptiveThreshold(flat, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)

h, w = page.shape[:2]
yy, xx = np.mgrid[0:h, 0:w]
shadow = 0.45 + 0.55 * np.clip(1.2 - (xx / w + yy / h) / 1.1, 0, 1)      # a strong diagonal shadow: dark at the bottom right
shaded = (page * shadow[..., None]).astype(np.uint8)

quarter_medians = lambda g: [int(np.median(g[ys, xs][g[ys, xs] > 40])) for ys in (slice(0, h // 2), slice(h // 2, None)) for xs in (slice(0, w // 2), slice(w // 2, None))]
gray_scan, bw_scan = clean(shaded, "gray"), clean(shaded, "bw")
print("paper brightness in the four quarters, shaded page:", quarter_medians(cv2.cvtColor(shaded, cv2.COLOR_RGB2GRAY)), "(uneven)")
print("after background division:                         ", quarter_medians(gray_scan), "(even)")
cvlab.show(shaded, "Page with a shadow", gray_scan, "Shadow removed", bw_scan, "Black and white scan")
```

## Step 6 — Package it and test it honestly

One function that does everything, then a test on **ten different photos** (different page positions, jitter and noise). We report the corner error and the success rate. A scanner that works on one test image is a demo, not a tool.

```python run shared title="Step 6 · scan() and a ten-photo test"
def scan(photo):
    quad = find_page_quad(find_edges(photo))
    if quad is None:
        raise ValueError("no page found")
    corners = order_corners(quad)
    page, _ = flatten(photo, corners, paper_aspect=300 / 400)
    return clean(page), corners

results = []
for seed in range(10):
    img, truth = cvlab.document(seed=seed)
    try:
        out, corners = scan(img)
        e = np.linalg.norm(corners - truth, axis=1).max()
        results.append(e)
        print(f"photo {seed}: scan {out.shape[1]}x{out.shape[0]}  worst corner error {e:5.1f} px  {'OK' if e < 8 else 'BAD'}")
    except ValueError as ex:
        results.append(np.inf); print(f"photo {seed}: failed ({ex})")
ok = sum(e < 8 for e in results)
print(f"success rate: {ok}/10 within 8 px")
assert ok >= 8, "too many failures: tune the Canny thresholds or the contour tolerance"
out0, _ = scan(cvlab.document(seed=3)[0])
cvlab.show(out0, "A scan from photo 3")
```

## How it works

| Piece | Purpose |
|---|---|
| Gaussian blur before Canny | suppresses wood grain and noise so only strong borders survive |
| Dilation of the edge map | closes small gaps so the page border becomes one contour |
| `approxPolyDP` with 2% tolerance | turns a wiggly contour into straight sides and counts corners |
| Convexity check and area filter | rejects small convex clutter (the printed circle, desk marks) |
| `minAreaRect` fallback | still gives a usable rectangle when the border is broken |
| Sum/difference corner ordering | gives a consistent TL, TR, BR, BL order for the homography |
| Output size from the paper aspect | perspective distorts edge lengths, so use the known paper size (or estimate the aspect from the camera geometry) |
| Background division | removes the shadow before thresholding |

**Failure cases to know**: a page on a similar-coloured desk (low contrast edges), a page partly out of the frame, a curled or folded page (a homography assumes a plane), strong glare, and two sheets overlapping. A production scanner also lets the user **drag the corners** to fix mistakes.

:::exercise Extend it
1. Measure the **homography accuracy** in a different way: warp the true page corners with `H` and report how far they land from the rectangle corners.
2. Make `find_page_quad` robust to a low-contrast desk by also trying an **Otsu threshold on a saturation channel** and choosing the candidate with the best four-sided score.
3. Add **automatic orientation**: detect whether the text lines are horizontal (projection profile) and rotate by 90° steps if not.
4. Save a **multi-page PDF** by stacking several scans (hint: `cv2.imencode` and a tiny PDF writer, or use Pillow in your own environment).
5. Replace the contour step with a **Hough line** approach: find the four dominant lines and intersect them for sub-pixel corners.
6. **Estimate the aspect ratio** instead of assuming it: with square pixels and the principal point at the image centre, the vanishing geometry of the quadrilateral gives the page's width/height (the Zhang and He whiteboard-scanning method).
:::

:::keypoints
- A document scanner is edges → page contour → four ordered corners → homography → cleaning.
- `approxPolyDP`, convexity and area filters pick the page out of the clutter; a fallback keeps the system from failing completely.
- Corner order (sum/difference trick) matters: the homography needs consistent correspondences.
- Background division plus adaptive thresholding removes shadows better than one global threshold.
- Test on many photos and report a success rate; a single good example is not evidence.
:::
