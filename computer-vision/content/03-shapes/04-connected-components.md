---
title: Connected Components and Blob Analysis
level: easy
time: 30
summary: Give every separate white region its own number. How labelling works (two-pass algorithm), 4- versus 8-connectivity, stats per component, filtering by size, counting objects and measuring them with scikit-image regionprops.
---

After you threshold and clean an image, you often want to **count** and **measure** the separate objects in it. **Connected-component labelling** does exactly this: it gives every group of touching white pixels its own number (label).

## What "connected" means

Two white pixels belong to the same component if you can walk from one to the other through white pixels. But what counts as a neighbour?

- **4-connectivity**: only up, down, left, right.
- **8-connectivity**: also the four diagonals.

Two pixels that touch only at a corner are **one** object in 8-connectivity but **two** objects in 4-connectivity. The default in OpenCV is 8.

```python run title="Label the regions of a tiny mask" level=easy
import cv2
import numpy as np

mask = np.array([
    [1, 1, 0, 0, 0, 0],
    [1, 1, 0, 0, 1, 0],
    [0, 0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 1, 0, 0, 0, 1],
], np.uint8)
n8, labels8 = cv2.connectedComponents(mask, connectivity=8)
n4, labels4 = cv2.connectedComponents(mask, connectivity=4)
print("8-connectivity finds", n8 - 1, "objects:\n", labels8)
print("4-connectivity finds", n4 - 1, "objects:\n", labels4)
```

(Label 0 is the background, so subtract 1 from the count.) The diagonal pair in rows 3 and 4 is one object with 8-connectivity and two with 4-connectivity.

## How labelling works: two passes

A classic, fast algorithm scans the picture twice:

1. **First pass**: go through the pixels row by row. For each white pixel, look at the neighbours already visited (left, above). If none is labelled, give a **new** label. If some are, take the smallest label and **remember that the other labels are the same object** (an *equivalence*).
2. **Second pass**: replace each label by the smallest label in its equivalence group.

The bookkeeping uses **union-find**, a tiny data structure for merging groups. Here it is in full:

```python run title="Connected components from scratch (two-pass, union-find)" level=intermediate
import cv2
import numpy as np
import cvlab

def label(mask):
    h, w = mask.shape
    labels = np.zeros((h, w), int)
    parent = [0]                                           # union-find: parent[i] is the representative of group i

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for y in range(h):
        for x in range(w):
            if not mask[y, x]:
                continue
            neighbours = []                                # already-visited neighbours (8-connectivity)
            for dy, dx in ((0, -1), (-1, -1), (-1, 0), (-1, 1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and labels[yy, xx]:
                    neighbours.append(labels[yy, xx])
            if not neighbours:
                parent.append(len(parent))                 # a new label
                labels[y, x] = len(parent) - 1
            else:
                m = min(find(n) for n in neighbours)
                labels[y, x] = m
                for n in neighbours:
                    parent[find(n)] = m                    # merge the groups
    for y in range(h):                                     # second pass: use the group representative
        for x in range(w):
            if labels[y, x]:
                labels[y, x] = find(labels[y, x])
    uniq = {v: i for i, v in enumerate(sorted(set(labels.ravel()) - {0}), start=1)}
    return np.vectorize(lambda v: uniq.get(v, 0))(labels), len(uniq)

gray = cvlab.image("coins")
_, mask = cv2.threshold(cv2.GaussianBlur(gray, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
small = (mask[::2, ::2] > 0).astype(np.uint8)                           # smaller picture: pure Python is slow
mine, n_mine = label(small)
n_cv, ref = cv2.connectedComponents(small, connectivity=8)
print("my count:", n_mine, " OpenCV count:", n_cv - 1)
print("same partition:", len({(a, b) for a, b in zip(mine.ravel(), ref.ravel())}) == n_mine + 1)
```

## Statistics for each component

`cv2.connectedComponentsWithStats` gives, for every label, its bounding box, area and centroid. That is a one-line "blob analyser".

```python run title="Count and measure objects" level=easy
import cv2
import numpy as np
import cvlab

gray = cvlab.image("coins")
_, mask = cv2.threshold(cv2.GaussianBlur(gray, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))

n, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
rows = []
for i in range(1, n):                                         # skip label 0 (background)
    x, y, w, h, area = stats[i]
    rows.append((area, i))
areas = np.array([a for a, _ in rows])
print("objects:", n - 1, "  median area:", int(np.median(areas)), "  smallest / largest:", areas.min(), "/", areas.max())

keep = [i for a, i in rows if 0.5 * np.median(areas) < a < 3 * np.median(areas)]      # drop tiny specks and huge merged regions
vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
for i in keep:
    x, y, w, h, area = stats[i]
    cv2.rectangle(vis, (x, y), (x + w, y + h), (255, 0, 0), 1)
    cv2.putText(vis, str(i), (x, y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 0), 1)
print("kept after size filtering:", len(keep))
# give every object a random colour
palette = np.random.default_rng(0).integers(60, 255, (n, 3)).astype(np.uint8); palette[0] = 0
cvlab.show(palette[labels], "Labels as colours", vis, "Boxes and ids")
```

Filtering by **area** is the most common cleanup: very small pieces are noise, very large ones are merged objects.

## Richer measurements with scikit-image

`skimage.measure.regionprops` computes many properties for each label: area, centroid, eccentricity, orientation, solidity, mean intensity inside, and more. It is the tool of choice for lab data (cells, particles).

```python run title="regionprops: shape numbers for each object" level=intermediate
import cv2
import numpy as np
from skimage.measure import label, regionprops
import cvlab

gray = cvlab.image("coins")
_, mask = cv2.threshold(cv2.GaussianBlur(gray, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
lab = label(mask > 0)
props = regionprops(lab, intensity_image=gray)
props = [p for p in props if p.area > 400]
print(f"{len(props)} objects")
for p in props[:5]:
    print(f"label {p.label:2d}: area {p.area:5.0f}  centroid (row {p.centroid[0]:5.1f}, col {p.centroid[1]:5.1f})  eccentricity {p.eccentricity:.2f}  mean brightness {p.mean_intensity:5.1f}")
print("most elongated object has eccentricity", round(max(p.eccentricity for p in props), 2))
```

`eccentricity` is 0 for a circle and near 1 for a line. Note scikit-image uses `(row, col)` order, while OpenCV uses `(x, y)`.

## SimpleBlobDetector

OpenCV also has `cv2.SimpleBlobDetector`, which does thresholding at several levels, finds connected regions, and filters them by area, circularity, convexity and inertia. It returns blob centres and sizes directly. Good for dots and circles (calibration patterns, particles).

:::interview Questions you may get
- "How would you count objects in an image?" Threshold, clean with morphology, connected components, filter by area, count.
- "4-connectivity or 8-connectivity?" 8 joins diagonal neighbours. The choice changes counts for thin or diagonal shapes.
- "How does the two-pass labelling algorithm work?" First pass assigns provisional labels and records equivalences; the second pass resolves them (union-find).
- "What if objects touch?" Components merge. Split them with the distance transform and watershed, or use a detector that outputs instances.
:::

```quiz
? Two white pixels touch only at a corner. With 4-connectivity they are...
+ Two separate components
- One component
- Background
> 8-connectivity would join them.

? What does connectedComponents return as label 0?
- The largest object
+ The background
- The first white pixel
> So the number of objects is n − 1.

? You count 24 components but expect 12 coins. A good first check?
+ Look at the area distribution; many tiny areas are noise to filter out
- Convert to HSV
- Use a bigger image
> Filtering by area removes specks and splits.

? Which is a good tool for per-object shape numbers such as eccentricity?
- cv2.LUT
+ skimage.measure.regionprops
- cv2.Canny
> It gives dozens of region properties.
```

:::problem You count cells in a microscope image. Two cells often touch and are counted as one. Give two ways to correct the count. {level=medium tags="blobs,counting"}
Think about size and shape.

:::solution Model answer
(1) **Split** them: distance transform plus watershed (the centres of touching round cells show up as separate peaks). (2) **Correct by area**: estimate the area of a single cell (median of isolated cells) and count a component as `round(area / single_area)` cells. Combine with a solidity check (merged cells have dents). Validate against manual counts on a few images. If the images are crowded, use a learned instance segmentation model (Cellpose, StarDist).
:::
:::

:::keypoints
- Connected-component labelling numbers each separate white region (4- or 8-connected). The count is n − 1.
- Two passes with union-find is the classic algorithm.
- `connectedComponentsWithStats` gives area, box and centroid. Filter by area to remove noise.
- `regionprops` gives rich shape and intensity measures. Touching objects need watershed or instance segmentation.
:::

:::resources
- [OpenCV: connectedComponentsWithStats](https://docs.opencv.org/4.x/d3/dc0/group__imgproc__shape.html) — the function reference.
- [scikit-image: regionprops](https://scikit-image.org/docs/stable/api/skimage.measure.html#skimage.measure.regionprops) — all the properties.
:::
