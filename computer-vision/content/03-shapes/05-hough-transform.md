---
title: The Hough Transform — Finding Lines and Circles by Voting
level: intermediate
time: 40
summary: How every edge point votes for all the lines it could belong to, and real lines collect the most votes. The (ρ, θ) form, the accumulator, HoughLines and HoughLinesP, circles, a lane-detection pipeline, parameter tuning and the limits of the method.
---

You have edge points from Canny. Now you want **lines**: lane markings, the edges of a table, a horizon. The edge points are separate dots, noisy and with gaps. How do you find the straight line that many of them lie on?

The **Hough transform** (Paul Hough, 1962) solves this with a lovely idea: **voting**.

:::analogy
Imagine 100 people each point to every road that passes through their house. Most roads get one or two votes. But a road that passes through **many** houses gets many votes. Count the votes, and the roads with the most votes are the real lines. Noise (a house that is on no big road) only adds scattered single votes.
:::

## Describing a line with two numbers

The usual equation `y = m·x + b` fails for vertical lines (infinite slope). Instead we describe a line by:

- **θ (theta)**: the angle of the line's *normal* (the direction at a right angle to the line).
- **ρ (rho)**: the distance from the origin to the line along that normal.

:::formula Line in (ρ, θ) form
\rho = x\cos\theta + y\sin\theta
:::

A point `(x, y)` lies on the line `(ρ, θ)` if this equation holds. **Every line is one point in the (θ, ρ) plane**, and every edge point `(x, y)` corresponds to a **curve** (a sinusoid) in that plane: all the lines that pass through it.

## The accumulator

Make a table with one cell for each `(θ, ρ)` pair (for example 180 angles × a few hundred distances). It is called the **accumulator**. For each edge point, and for each θ, compute ρ, and add **1** to that cell. At the end, cells with many votes are lines that many points agree on.

Try it. Add noise points and move the threshold. Bright spots in the accumulator are lines:

```viz algo=hough title="Every edge point votes for all lines through it"
```

Here is the whole algorithm in a few lines of NumPy:

```python run title="Hough lines from scratch" level=intermediate
import numpy as np

# 1. edge points: a line y = 0.5 x + 20 with a few gaps, plus random noise
rng = np.random.default_rng(1)
xs = np.arange(0, 120, 2)
line_pts = np.stack([xs, 0.5 * xs + 20], 1)[rng.random(len(xs)) > 0.2]
noise_pts = rng.uniform(0, 120, (40, 2))
pts = np.vstack([line_pts, noise_pts])
print("points:", len(pts), "(", len(line_pts), "on the line and", len(noise_pts), "noise )")

# 2. accumulator over (theta, rho)
thetas = np.deg2rad(np.arange(0, 180))
diag = int(np.ceil(np.hypot(120, 120)))
acc = np.zeros((len(thetas), 2 * diag + 1), int)
for x, y in pts:
    rhos = np.round(x * np.cos(thetas) + y * np.sin(thetas)).astype(int) + diag
    acc[np.arange(len(thetas)), rhos] += 1                     # each point votes once for every theta

# 3. the cell with the most votes is the line
t, r = np.unravel_index(acc.argmax(), acc.shape)
theta, rho = np.rad2deg(thetas[t]), r - diag
print(f"best line: theta = {theta:.0f} degrees, rho = {rho}  with {acc.max()} votes")
slope = -np.cos(np.deg2rad(theta)) / np.sin(np.deg2rad(theta))
print(f"its slope = {slope:.2f} (the true slope is 0.5), intercept = {rho / np.sin(np.deg2rad(theta)):.1f} (true 20)")
```

## OpenCV: HoughLines and HoughLinesP

`cv2.HoughLines(edges, rho_step, theta_step, threshold)` returns lines as `(ρ, θ)`, infinite in length. `cv2.HoughLinesP` is the **probabilistic** version: it returns **line segments** `(x1, y1, x2, y2)` and is faster and usually more useful, because it also tells you where each line starts and ends.

| Parameter (HoughLinesP) | Meaning |
|---|---|
| `rho`, `theta` | Resolution of the accumulator (1 pixel, π/180) |
| `threshold` | Minimum votes for a line |
| `minLineLength` | Ignore segments shorter than this |
| `maxLineGap` | Join two pieces on the same line if the gap is smaller than this |

```python run title="Find lane lines with Canny + HoughLinesP" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.road(curve=0.0)
h, w = img.shape[:2]
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 1.4), 60, 150)

roi = np.zeros_like(edges)                                      # keep only the road area: a triangle below the horizon
cv2.fillPoly(roi, [np.array([[0, h], [w, h], [w // 2, int(h * 0.45)]])], 255)
edges_roi = cv2.bitwise_and(edges, roi)

lines = cv2.HoughLinesP(edges_roi, rho=1, theta=np.pi / 180, threshold=40, minLineLength=40, maxLineGap=20)
print("segments found:", 0 if lines is None else len(lines))
vis = img.copy()
for x1, y1, x2, y2 in (lines[:, 0] if lines is not None else []):
    cv2.line(vis, (int(x1), int(y1)), (int(x2), int(y2)), (255, 0, 0), 2)
cvlab.show(img, "Road", edges_roi, "Edges in the road area", vis, "Line segments found")
```

A complete lane detector adds: separating left and right segments by **slope sign**, averaging each side into one line, and smoothing over time. The **region of interest (ROI)** mask is an important trick: it removes edges from trees, cars and signs, so only the road remains.

```python run title="Left and right lane: average the segments" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.road(curve=0.0)
h, w = img.shape[:2]
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 1.4), 60, 150)
roi = np.zeros_like(edges); cv2.fillPoly(roi, [np.array([[0, h], [w, h], [w // 2, int(h * 0.45)]])], 255)
lines = cv2.HoughLinesP(cv2.bitwise_and(edges, roi), 1, np.pi / 180, 40, minLineLength=40, maxLineGap=20)[:, 0]

left, right = [], []
for x1, y1, x2, y2 in lines:
    if x2 == x1:
        continue
    slope = (y2 - y1) / (x2 - x1)
    intercept = y1 - slope * x1
    if not 0.3 < abs(slope) < 3:
        continue                                                # nearly horizontal or vertical (the dashed centre line): not a lane edge
    (left if slope < 0 else right).append((slope, intercept))   # image y points down: left lane has a negative slope

vis = img.copy()
y_bottom, y_top = h, int(h * 0.5)
for side, color in ((left, (255, 0, 0)), (right, (0, 200, 0))):
    if not side:
        continue
    m, b = np.mean(side, axis=0)
    cv2.line(vis, (int((y_bottom - b) / m), y_bottom), (int((y_top - b) / m), y_top), color, 4)
    print(f"{'left' if side is left else 'right'}: {len(side)} segments, slope {m:.2f}")
cvlab.show(vis, "One line for each lane edge")
```

## Hough for circles

Circles have three parameters (centre x, centre y, radius), so a 3-D accumulator would be slow. OpenCV's `HoughCircles` uses the **gradient method**: each edge point votes along its **gradient direction** (the circle centre must lie on that line), which needs only a 2-D accumulator, and then finds the best radius for each centre.

```python run title="Detect the coins as circles" level=intermediate
import cv2
import numpy as np
import cvlab

gray = cvlab.image("coins")
blur = cv2.medianBlur(gray, 5)
circles = cv2.HoughCircles(blur, cv2.HOUGH_GRADIENT, dp=1.2, minDist=30, param1=120, param2=32, minRadius=15, maxRadius=45)
found = np.round(circles[0]).astype(int) if circles is not None else []
print("circles found:", len(found))
vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
for x, y, r in found:
    cv2.circle(vis, (x, y), r, (255, 0, 0), 2)
    cv2.circle(vis, (x, y), 2, (0, 255, 0), 3)
cvlab.show(gray, "Coins", vis, "HoughCircles")
```

`param1` is the Canny high threshold, `param2` is the accumulator threshold (**smaller means more circles, including false ones**), and `minDist` stops multiple circles around one centre.

## Strengths and weaknesses

| Strength | Weakness |
|---|---|
| Robust to gaps and noise (voting) | Needs good edges first (Canny tuning) |
| Finds several lines at once | Parameters need tuning for each scene |
| Simple and well understood | Cost grows fast with more parameters (ellipses, general shapes) |
| Works with partial lines | Can give many near-duplicate lines |

**Alternatives**: **RANSAC** line fitting (repeatedly pick two points, count inliers) is simpler to extend to other models. The **Line Segment Detector (LSD)** finds segments directly from the gradient. Modern lane detectors use deep networks. Still, Hough remains a classic interview topic because the **voting idea** is so general: the same idea underlies the Generalised Hough Transform and Hough voting in some 3-D detectors.

:::interview Questions you may get
- "Explain the Hough transform for lines." Each edge point votes for all (ρ, θ) cells it could lie on; lines are peaks in the accumulator.
- "Why (ρ, θ) instead of (m, b)?" Slope is unbounded for vertical lines.
- "What is the cost?" About (number of edge points) × (number of θ values) votes. Fewer edges (a good ROI) make it faster.
- "Difference between `HoughLines` and `HoughLinesP`?" Infinite lines in (ρ, θ) versus finite segments, probabilistic and faster.
- "How would you handle curved lanes?" Fit polynomials (RANSAC or least squares) to the lane pixels in a bird's-eye view, or use a learned model.
:::

```quiz
? What is a line in the Hough accumulator?
- A row of cells
+ A single cell (peak) at its (θ, ρ)
- A curve
> Each edge point gives a curve; real lines are where many curves cross.

? Why does the Hough transform use the (ρ, θ) form?
+ Vertical lines have an infinite slope in y = mx + b
- It is faster to draw
- It needs fewer points
> (ρ, θ) represents every line with two bounded numbers.

? You lower the accumulator threshold in HoughCircles (param2). What happens?
- Fewer circles
+ More circles, including false ones
- Faster processing
> A smaller threshold accepts weaker evidence.

? Which trick removes edges from trees and signs before the Hough step?
+ A region-of-interest mask
- More blur
- A larger accumulator
> Mask out areas where lines cannot be lane markings.
```

:::problem A Hough lane detector works on a sunny day but finds many wrong lines at night in the rain. List causes and improvements. {level=medium tags="hough,lanes,robustness"}
Think about edges, thresholds and alternatives.

:::solution Model answer
Rain and headlights create strong edges (reflections, wipers), and low contrast makes lane edges weak, so fixed Canny and Hough thresholds fail. Improvements: adapt thresholds (auto-Canny from the median), apply CLAHE or work on a colour channel where the paint stands out (yellow and white filters in HLS), use a tighter ROI or a bird's-eye warp, require lines to be consistent in slope with the previous frame (temporal tracking, Kalman filter), fit curves with RANSAC, and finally switch to a learned lane model trained on night and rain data. Evaluate on a labelled night set, not on the demo video.
:::
:::

:::keypoints
- Hough voting: each edge point votes for all lines (ρ, θ) through it. Peaks in the accumulator are lines.
- `HoughLinesP` returns segments; use `minLineLength` and `maxLineGap`. An ROI mask removes distractions.
- `HoughCircles` votes along gradient directions to find centres, then radii.
- It is robust to gaps but sensitive to edge quality and parameters. RANSAC and learned models are alternatives.
:::

:::resources
- [OpenCV: Hough line transform](https://docs.opencv.org/4.x/d6/d10/tutorial_py_houghlines.html) — lines with pictures.
- [OpenCV: Hough circle transform](https://docs.opencv.org/4.x/da/d53/tutorial_py_houghcircles.html) — the circle version.
- [Duda and Hart (1972): Use of the Hough transformation to detect lines and curves in pictures](https://dl.acm.org/doi/10.1145/361237.361242) — the (ρ, θ) formulation.
:::
