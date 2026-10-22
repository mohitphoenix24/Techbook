---
title: Build a Lane Finder
level: intermediate
time: 45
icon: gauge
cover: #64748b,#facc15
tags: canny, hough lines, region of interest, line fitting, vanishing point
summary: Find the lane edges on a road image the classical way. Mask a region of interest, detect edges, find line segments with the probabilistic Hough transform, discard the wrong slopes, average each side, intersect to get the vanishing point and heading, then measure the error against the true lane position under noise and on curves, and see where a straight-line model breaks.
---

Lane detection was the first famous application of classical vision in cars, and it still teaches the full chain: **edges → lines → geometry**. You will build it with the tools from modules 2 and 3, **test it against known truth** at different noise levels, and then discover exactly where straight lines stop being a good model (curves), which motivates a better fit.

**What you'll build:** `find_lanes(image)` that returns the left and right lane lines, their intercepts at the bottom of the image, the vanishing point and a heading estimate, plus an evaluation under noise and curvature.

:::flow The pipeline
Road image | RGB frame from a car camera
Grey, blur, Canny | edge map
Region of interest | keep only the road area
Hough segments | probabilistic line detection
Filter by slope | left/right lanes, drop the centre dashes
Fit each side | length-weighted average line
Geometry | bottom intercepts, vanishing point, heading
Evaluate | error versus truth, noise, curves
:::

## Step 1 — The image and the edges

`cvlab.road()` renders a synthetic road with white edge lines and a yellow dashed centre line. We know the true geometry (the generator is deterministic), which is what lets us measure errors later. The edge map is computed from a **blurred grey image** with Canny; then a **trapezoid region of interest (ROI)** keeps only the road, discarding sky and grass.

```python run shared title="Step 1 · edges inside a region of interest"
import numpy as np
import cv2
import cvlab

img = cvlab.road(curve=0.0, noise=8, seed=0)
h, w = img.shape[:2]
horizon = int(h * 0.42)
print("image:", img.shape, "| horizon row:", horizon)

def edges_in_roi(img):
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 60, 150)
    roi = np.zeros_like(edges)
    trapezoid = np.array([[(0, h), (w, h), (int(w * 0.62), horizon + 12), (int(w * 0.38), horizon + 12)]], np.int32)
    cv2.fillPoly(roi, trapezoid, 255)                                  # white where we look
    return cv2.bitwise_and(edges, roi)

edges = edges_in_roi(img)
print("edge pixels after the ROI mask:", int((edges > 0).sum()))
cvlab.show(img, "Road", edges, "Edges inside the region of interest")
```

## Step 2 — Line segments with the probabilistic Hough transform

`HoughLinesP` returns **segments** `(x1, y1, x2, y2)` with endpoints. The important parameters: the vote **threshold** (minimum evidence), `minLineLength` (reject short noise) and `maxLineGap` (join the dashes of a broken line).

Then comes the key filtering idea: lane edges are **slanted** (their slope in image coordinates is about ±0.8), while the dashed centre line is nearly vertical (slope about ±10) and the horizon-parallel things (slope near 0) are not lanes. A **slope window** `0.4 < |m| < 2.5` keeps only the lane edges, and the **sign** of the slope separates left (negative, since image `y` points down) from right (positive).

```python run shared title="Step 2 · segments, slope filter, left and right"
def detect_segments(edges):
    lines = cv2.HoughLinesP(edges, rho=1, theta=np.pi / 180, threshold=25, minLineLength=30, maxLineGap=12)
    segs = {"left": [], "right": []}
    if lines is None:
        return segs
    for x1, y1, x2, y2 in lines[:, 0]:
        if x2 == x1:
            continue                                                    # vertical: slope undefined, never a lane edge
        m = (y2 - y1) / (x2 - x1)
        if not 0.4 < abs(m) < 2.5:                                      # too flat or too steep: not a lane edge (the dashed centre line is steep)
            continue
        segs["left" if m < 0 else "right"].append((x1, y1, x2, y2))
    return segs

segs = detect_segments(edges)
print(f"left segments: {len(segs['left'])}, right segments: {len(segs['right'])}")
vis = img.copy()
for side, col in (("left", (255, 0, 0)), ("right", (0, 200, 255))):
    for x1, y1, x2, y2 in segs[side]:
        cv2.line(vis, (x1, y1), (x2, y2), col, 2)
cvlab.show(vis, "Segments: left in red, right in cyan")
```

## Step 3 — One line per side

Each side has many short segments. We combine them into a single line `y = m x + b` by **averaging the slopes and intercepts, weighted by segment length** (long segments are more reliable). Then we **extrapolate** the line down to the bottom of the image and up to the horizon, and compute the **vanishing point** (the intersection of the two lane lines), which gives the **heading**: how far the vanishing point is to the left or right of the image centre.

```python run shared title="Step 3 · fit, extrapolate, vanishing point and heading"
def fit_line(side_segs):
    a = np.array(side_segs, float)
    m = (a[:, 3] - a[:, 1]) / (a[:, 2] - a[:, 0]); b = a[:, 1] - m * a[:, 0]
    length = np.hypot(a[:, 2] - a[:, 0], a[:, 3] - a[:, 1])
    return np.average(m, weights=length), np.average(b, weights=length)         # slope and intercept, long segments count more

def find_lanes(img, focal_px=500.0):
    edges = edges_in_roi(img)
    segs = detect_segments(edges)
    if not segs["left"] or not segs["right"]:
        return None                                                      # honest failure: no lane found
    (ml, bl), (mr, br) = fit_line(segs["left"]), fit_line(segs["right"])
    x_left, x_right = (h - bl) / ml, (h - br) / mr                       # where each line meets the bottom row y = h
    xv = (br - bl) / (ml - mr); yv = ml * xv + bl                        # intersection of the two lines = vanishing point
    heading = np.degrees(np.arctan((xv - w / 2) / focal_px))              # angle between the car's axis and the road direction
    return dict(left=(ml, bl), right=(mr, br), x_left=x_left, x_right=x_right, vp=(xv, yv), heading=heading, lane_px=x_right - x_left,
                centre_offset_px=(x_left + x_right) / 2 - w / 2)

res = find_lanes(img)
print(f"left line meets the bottom at x = {res['x_left']:.1f}, right line at x = {res['x_right']:.1f}  (lane width {res['lane_px']:.0f} px)")
print(f"vanishing point: ({res['vp'][0]:.1f}, {res['vp'][1]:.1f}) -> heading {res['heading']:.2f} degrees, lane centre offset {res['centre_offset_px']:.1f} px")
print(f"with a lane width of 3.7 m, one pixel is about {3.7 / res['lane_px'] * 100:.2f} cm at the bottom of the image")

vis = img.copy()
for (m, b), col in ((res["left"], (255, 0, 0)), (res["right"], (0, 200, 255))):
    y1, y2 = h, horizon + 12
    cv2.line(vis, (int((y1 - b) / m), y1), (int((y2 - b) / m), y2), col, 3)
cv2.circle(vis, (int(res["vp"][0]), int(res["vp"][1])), 6, (0, 255, 0), -1)
cvlab.show(vis, "Fitted lane lines and vanishing point")
```

## Step 4 — Measure the error, not just the picture

The synthetic road has known edge lines: at the bottom row they are at `x = w/2 ± 0.9·(0.46·w + 2)`. We compare our intercepts with these for **ten seeds at three noise levels**. A lane finder that looks fine on one frame can fail under noise; the numbers tell you.

```python run shared title="Step 4 · error versus noise"
true_left, true_right = w / 2 - 0.9 * (0.46 * w + 2), w / 2 + 0.9 * (0.46 * w + 2)
print(f"true bottom intercepts: left {true_left:.1f}, right {true_right:.1f}")
print("noise sigma | frames OK | mean intercept error | worst error")
for noise in (6, 20, 40):
    errs, failed = [], 0
    for seed in range(10):
        r = find_lanes(cvlab.road(curve=0.0, noise=noise, seed=seed))
        if r is None:
            failed += 1; continue
        errs.append(max(abs(r["x_left"] - true_left), abs(r["x_right"] - true_right)))
    print(f"{noise:>11} | {10 - failed:>9} | {np.mean(errs):>17.2f} px | {np.max(errs):>6.2f} px")
    assert failed == 0 and np.mean(errs) < 6
```

## Step 5 — Where straight lines break: curves

A straight-line model assumes a straight road. On a curve the segments no longer lie on one line, so the average is a compromise and the **bottom intercept error grows** (although the intercept truth stays the same, because the curve only bends the far part of the road). A common fix is a **quadratic model** `x = a y² + b y + c` fitted to all segment endpoints of each side; it follows the bend, at the price of being more sensitive to outliers.

```python run shared title="Step 5 · curves, straight line versus quadratic"
def bottom_x_poly(side_segs):
    a = np.array(side_segs, float)
    ys = np.concatenate([a[:, 1], a[:, 3]]); xs = np.concatenate([a[:, 0], a[:, 2]])
    coeffs = np.polyfit(ys, xs, 2)                                       # x as a function of y: a parabola
    return np.polyval(coeffs, h)

print("curve | straight-line error | quadratic error   (mean over 10 frames, pixels at the bottom row)")
for curve in (0.0, 0.8, 1.5):
    e_line, e_poly = [], []
    for seed in range(10):
        im = cvlab.road(curve=curve, noise=10, seed=seed)
        s = detect_segments(edges_in_roi(im))
        if not s["left"] or not s["right"]:
            continue
        (ml, bl), (mr, br) = fit_line(s["left"]), fit_line(s["right"])
        e_line.append(max(abs((h - bl) / ml - true_left), abs((h - br) / mr - true_right)))
        e_poly.append(max(abs(bottom_x_poly(s["left"]) - true_left), abs(bottom_x_poly(s["right"]) - true_right)))
    print(f"{curve:>5} | {np.mean(e_line):>16.1f} px | {np.mean(e_poly):>10.1f} px")
im = cvlab.road(curve=1.0, noise=10, seed=2); r = find_lanes(im)
print("on a curve the straight model's vanishing point and heading are biased: heading", round(r["heading"], 2), "degrees")
cvlab.show(cvlab.road(curve=0.0, seed=1), "Straight road", im, "Curved road (curve = 1.0)")
```

## How it works

| Piece | Purpose |
|---|---|
| Gaussian blur before Canny | suppresses noise edges |
| Region of interest | removes sky, grass and the horizon band, which contain many irrelevant edges |
| `HoughLinesP` with `maxLineGap` | joins dashed or broken markings into long segments |
| Slope window and sign | separates left from right and rejects the dashed centre line and horizontal edges |
| Length-weighted average | long, reliable segments dominate; short noisy ones barely matter |
| Intersection of the two lines | the vanishing point: gives the road direction (heading) relative to the camera |
| Pixel scale from the lane width | converts pixel offsets into centimetres at one distance only |

**Real-world problems this version ignores**: shadows and wet roads (edges everywhere), worn or missing markings, other vehicles, lane changes, night, camera tilt (the horizon and ROI move: calibrate or estimate them), and curves. Production systems add **inverse perspective mapping** (a bird's-eye homography), **colour thresholds in HLS** for white and yellow, **temporal smoothing** (a Kalman filter on the lane parameters, module 6) and **learned lane segmentation** (CNNs such as LaneNet or UFLD).

:::exercise Extend it
1. Replace the Canny + grey pipeline by an **HLS threshold** that selects white and yellow pixels, and compare the results at noise level 40.
2. Warp the image to a **bird's-eye view** with `getPerspectiveTransform` (use the ROI trapezoid as the source) and fit lines there; are curves easier?
3. Add **temporal smoothing**: process 30 frames with slowly varying curve, smooth the intercepts with an exponential moving average, and plot the jitter before and after.
4. Handle a **missing line** (erase one side): estimate it from the other side using the known lane width.
5. Turn the heading and centre offset into a simple **lane-keeping controller** `steering = k1 * offset + k2 * heading` and simulate it on a few frames.
:::

:::keypoints
- Lane finding is edges, a region of interest, probabilistic Hough segments, slope filtering, a weighted line fit and the vanishing point.
- A slope window and sign separate the left and right lane edges and reject the centre dashes.
- Measure with known truth across noise levels; one good frame is not an evaluation.
- A straight-line model fails on curves; a polynomial fit or a bird's-eye view handles them better.
- Pixel-to-metre conversion from the lane width is valid at one distance only; use calibration and a homography for real geometry.
:::
