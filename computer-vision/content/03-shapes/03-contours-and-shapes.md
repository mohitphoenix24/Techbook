---
title: Contours and Shape Analysis
level: easy
time: 40
summary: Turn a mask into a list of outlines, then measure them. findContours, hierarchy, area and perimeter, centroid from moments, bounding boxes, rotated rectangles, convex hull, polygon approximation, and a small shape classifier.
---

A mask tells you *which pixels* belong to an object. A **contour** tells you its **shape**: the list of points along its outline. With a contour you can ask: how big is it, where is its centre, is it round or square, which way does it point, does it have a hole?

:::def Contour
A curve joining all the continuous points along a boundary of the same colour (or brightness). In OpenCV a contour is a NumPy array of `(x, y)` points.
:::

## Find contours

OpenCV's `cv2.findContours` takes a **binary** (black and white) image. It treats **white as the object** and black as background. So threshold first, and clean the mask.

```python run title="Find contours in a clean shapes image" level=easy
import cv2
import cvlab

img = cvlab.shapes()                                          # coloured shapes on a light background
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
_, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)       # objects are darker than the background -> white

contours, hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
print("number of contours:", len(contours))
print("first contour: shape", contours[0].shape, " (N points, 1, (x, y))")

vis = img.copy()
cv2.drawContours(vis, contours, -1, (0, 0, 0), 2)              # -1 = draw all
cvlab.show(img, "Image", mask, "Mask", vis, "Contours drawn")
```

Two options you choose:

| Retrieval mode | You get |
|---|---|
| `RETR_EXTERNAL` | Only the outermost outlines (ignore holes and things inside) |
| `RETR_LIST` | All contours, no parent-child information |
| `RETR_TREE` | All contours plus the full **hierarchy** (which is inside which) |

| Approximation | You get |
|---|---|
| `CHAIN_APPROX_NONE` | Every boundary point |
| `CHAIN_APPROX_SIMPLE` | Only the corner points of straight runs. Smaller memory |

:::note OpenCV versions
In OpenCV 3.x `findContours` returned three values (image, contours, hierarchy). In 4.x it returns two (contours, hierarchy). Check your version when you copy old code.
:::

## Measure a contour

```python run title="Area, perimeter, centre, boxes" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.shapes()
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
_, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

vis = img.copy()
for i, c in enumerate(sorted(contours, key=cv2.contourArea, reverse=True)):
    area = cv2.contourArea(c)
    perim = cv2.arcLength(c, True)
    m = cv2.moments(c)
    cx, cy = m["m10"] / m["m00"], m["m01"] / m["m00"]          # centroid from the moments
    x, y, w, h = cv2.boundingRect(c)                            # upright box
    (rx, ry), (rw, rh), angle = cv2.minAreaRect(c)              # smallest rotated box
    circularity = 4 * np.pi * area / perim ** 2                 # 1.0 for a perfect circle
    print(f"#{i}: area {area:7.1f}  perimeter {perim:6.1f}  centre ({cx:5.1f}, {cy:5.1f})  box {w}x{h}  circularity {circularity:.2f}")
    cv2.rectangle(vis, (x, y), (x + w, y + h), (255, 0, 0), 1)
    box = cv2.boxPoints(((rx, ry), (rw, rh), angle)).astype(int)
    cv2.polylines(vis, [box], True, (0, 150, 0), 1)
    cv2.circle(vis, (int(cx), int(cy)), 3, (0, 0, 0), -1)
cvlab.show(vis, "Blue: upright box. Green: rotated box. Dot: centroid")
```

Useful facts:

- **Area** (`contourArea`) counts the region inside, in pixels². **Perimeter** (`arcLength`) is the length of the outline.
- **Moments** summarise the shape. `m00` is the area, `m10/m00` and `m01/m00` give the **centroid** (centre of mass). Higher moments give orientation and the **Hu moments**, which stay the same under rotation and scaling (good for matching shapes).
- **Circularity** `4π·area / perimeter²` is 1 for a circle and smaller for other shapes.
- **Rotated rectangle** (`minAreaRect`) gives the real width, height and angle of a tilted object. This is the one that robots use to decide how to orient a gripper.
- **Enclosing circle** (`minEnclosingCircle`) and **fitted ellipse** (`fitEllipse`) are also available.

## Convex hull and convexity

The **convex hull** is the tightest "rubber band" shape around a contour. The difference between a shape and its hull shows **dents** (convexity defects), which is how you can count fingers on a hand mask.

```python run title="Hull and solidity" level=intermediate
import cv2
import numpy as np
import cvlab

mask = np.zeros((200, 200), np.uint8)
pts = np.array([[20, 180], [20, 20], [70, 20], [100, 100], [130, 20], [180, 20], [180, 180]], np.int32)       # an "M" shape
cv2.fillPoly(mask, [pts], 255)
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
c = contours[0]
hull = cv2.convexHull(c)
solidity = cv2.contourArea(c) / cv2.contourArea(hull)              # 1.0 for any convex shape
defects = cv2.convexityDefects(c, cv2.convexHull(c, returnPoints=False))
deep = [float(d[0][3]) / 256 for d in defects if d[0][3] / 256 > 10]       # depth is stored as depth * 256
print("solidity:", round(float(solidity), 2), "  number of deep dents:", len(deep), " depths:", [round(d, 1) for d in deep])
vis = cv2.cvtColor(mask, cv2.COLOR_GRAY2RGB)
cv2.polylines(vis, [hull], True, (255, 0, 0), 2)
cvlab.show(vis, "Shape (white) and its convex hull (blue)")
```

## Approximate a contour with a polygon

`cv2.approxPolyDP(contour, epsilon, closed)` replaces a wiggly outline by a polygon with fewer points. `epsilon` is the allowed distance from the original curve, usually a small fraction of the perimeter. The **number of corners** is a simple shape classifier: 3 = triangle, 4 = rectangle, many = circle.

```python run title="Name the shapes by counting corners" level=easy
import cv2
import cvlab

img = cvlab.shapes()
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
_, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

vis = img.copy()
for c in contours:
    approx = cv2.approxPolyDP(c, 0.03 * cv2.arcLength(c, True), True)
    corners = len(approx)
    name = {3: "triangle", 4: "rectangle"}.get(corners, "circle/ellipse" if corners > 6 else f"{corners}-gon")
    x, y, w, h = cv2.boundingRect(c)
    print(f"{corners} corners -> {name}   (bounding box {w}x{h})")
    cv2.putText(vis, name, (x, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1, cv2.LINE_AA)
cvlab.show(vis)
```

The corner count is a rough rule. A real circle drawn with few pixels, or a rectangle with a blurry edge, can give a different count. Real masks also need cleaning first, and touching objects must be split (the watershed lesson).

## Hierarchy: holes and nested shapes

With `RETR_TREE`, each contour has four numbers: next, previous, first child, parent. A contour with a parent is a **hole** (or an object inside a hole). Example use: find a ring (a washer) as an outer contour that has one child.

```python run title="Washers have holes" level=intermediate
import cv2
import numpy as np

mask = np.zeros((120, 200), np.uint8)
cv2.circle(mask, (50, 60), 40, 255, -1); cv2.circle(mask, (50, 60), 18, 0, -1)       # a washer
cv2.circle(mask, (150, 60), 35, 255, -1)                                              # a solid disc
contours, hierarchy = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
for i, h in enumerate(hierarchy[0]):
    nxt, prv, child, parent = h
    kind = "hole" if parent != -1 else ("object with a hole" if child != -1 else "solid object")
    print(f"contour {i}: parent {parent:2d} child {child:2d}  -> {kind}  area {cv2.contourArea(contours[i]):.0f}")
```

## Matching shapes

`cv2.matchShapes(c1, c2, method, 0)` compares two contours using their Hu moments. It returns 0 for identical shapes (even if one is rotated or bigger). It is quick and works for simple, clean silhouettes. For complicated scenes, use features or a learned detector.

:::interview Questions you may get
- "How do you find the orientation of an object from a mask?" Contour → `minAreaRect` or `fitEllipse` or moments (principal axis).
- "How do you tell a circle from a square with contours?" Corner count after `approxPolyDP`, or circularity, or the ratio of area to the bounding-circle area.
- "What does `RETR_EXTERNAL` do versus `RETR_TREE`?" Only outer contours versus all with parent-child links.
- "How would you count the fingers in a hand mask?" Convex hull and convexity defects; count deep defects and add one.
- "How do you get the centre of a blob?" Moments: `(m10/m00, m01/m00)`.
:::

```quiz
? Which OpenCV function gives the centre of mass of a contour?
- cv2.arcLength
+ cv2.moments (m10/m00, m01/m00)
- cv2.convexHull
> Image moments describe a shape; the first moments give the centroid.

? What does a circularity of about 1.0 tell you?
+ The shape is close to a circle
- The shape is a square
- The shape has holes
> Circularity = 4π·area / perimeter².

? You need the real width, height and tilt of a rotated part. Which function?
- boundingRect
+ minAreaRect
- approxPolyDP
> boundingRect is always upright; minAreaRect fits the smallest rotated box.

? findContours treats which pixels as the object?
+ White (non-zero) pixels
- Black pixels
- Grey pixels
> Invert the mask when your object is dark.
```

:::problem Describe a pipeline that finds screws on a tray and reports each screw's position and orientation. {level=medium tags="contours,robotics,pipeline"}
Include the steps and the traps.

:::solution Model answer
(1) Good, even lighting and a plain background (backlight if possible). (2) Grey, small blur, threshold (Otsu or adaptive). (3) Morphological open then close to clean the mask. (4) `findContours` with `RETR_EXTERNAL`. (5) Filter by area to drop dust and tray edges. (6) For each contour: centroid from moments for position, `minAreaRect` or `fitEllipse` for the axis and angle (angle from a rotated rectangle is ambiguous by 180°, so decide the head versus the tail with a second feature such as the wider end). (7) Convert pixels to millimetres with the camera calibration. Traps: touching screws merge (use watershed), shadows, reflections, `minAreaRect` angle conventions that changed between OpenCV versions, and the (x, y) order.
:::
:::

:::keypoints
- `findContours` works on a binary mask (white = object) and returns outlines as point arrays plus a hierarchy.
- Measure with `contourArea`, `arcLength`, `moments` (centroid), `boundingRect`, `minAreaRect`, `minEnclosingCircle`.
- Convex hull and solidity show dents. `approxPolyDP` counts corners for simple shape names.
- Hierarchy tells holes and nested objects. `matchShapes` compares silhouettes using Hu moments.
:::

:::resources
- [OpenCV: contours, getting started](https://docs.opencv.org/4.x/d4/d73/tutorial_py_contours_begin.html) — the basics with pictures.
- [OpenCV: contour features](https://docs.opencv.org/4.x/dd/d49/tutorial_py_contour_features.html) — moments, area, hull, boxes.
- [OpenCV: contour hierarchy](https://docs.opencv.org/4.x/d9/d8b/tutorial_py_contours_hierarchy.html) — the four hierarchy numbers explained.
:::
