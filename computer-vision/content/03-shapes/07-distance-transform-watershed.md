---
title: Splitting Touching Objects — Distance Transform and Watershed
level: intermediate
time: 35
summary: When objects touch, thresholding glues them together. Use the distance transform to find each object's centre, then the watershed algorithm to flood out from those centres and draw the boundaries. Step by step on touching coins.
---

Thresholding and connected components work well when objects are separate. But coins, cells, grains and screws often **touch**, and then they become a single blob. To count and measure them, we have to **split** the blob.

## The distance transform

The **distance transform** replaces each white pixel by its **distance to the nearest black pixel**. Pixels at the edge of a shape get a small value. Pixels deep inside get a large value. So the **centre** of a round object is a **peak**.

:::analogy
Imagine the white shapes are islands and black is the sea. The distance transform tells every spot on an island how far it is from the water. The top of a hill (the highest point) is the middle of the island. Two touching round coins are two islands joined by a thin neck: the neck is low, and each coin has its own peak.
:::

```python run title="Distance transform of two touching discs" level=easy
import cv2
import numpy as np
import cvlab

mask = np.zeros((120, 220), np.uint8)
cv2.circle(mask, (65, 60), 45, 255, -1)
cv2.circle(mask, (150, 60), 40, 255, -1)                  # touching the first one
dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
print("largest distance (radius of the biggest inscribed circle):", round(float(dist.max()), 1))
n, _ = cv2.connectedComponents(mask)
print("connected components (the discs are glued):", n - 1)
cvlab.show(mask, "Two touching discs: one blob", cv2.normalize(dist, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8), "Distance transform: two peaks")
```

If we threshold the distance map at, say, half its maximum, the neck disappears and we get **two separate blobs**: one per object. Those blobs are the **markers** (seeds), one for each object.

## The watershed algorithm

**Watershed** treats a grey picture as a landscape, where brightness is height. Imagine rain falling and filling the valleys. **Put a source of water in each marker** and let the water rise. Where water from two different sources meets, build a **dam**. The dams are the boundaries between objects.

We want to flood from the object centres outward, so we use the **negative** distance map (the peaks become valleys), and the dam lands on the thin neck between the coins.

## The recipe (OpenCV style)

:::flow Watershed segmentation of touching objects
1. Threshold | Get a binary mask of all objects (Otsu), and clean it with an opening.
2. Sure background | Dilate the mask. Everything outside is surely background.
3. Sure foreground | Distance transform, then threshold at a fraction of its maximum. These are the object cores.
4. Unknown region | Sure background minus sure foreground: the border zone where we do not know yet.
5. Markers | Label each sure-foreground blob with its own number; mark the unknown region with 0; background gets a different number.
6. Watershed | `cv2.watershed(image, markers)` floods and fills the unknown region. Boundaries become −1.
:::

```python run title="Separate and count the touching coins" level=intermediate
import cv2
import numpy as np
import cvlab

gray, n_true = cvlab.discs(cols=5, rows=3)                      # 15 coin-like discs that touch each other
color = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)                  # cv2.watershed needs a 3-channel 8-bit image

_, mask = cv2.threshold(cv2.GaussianBlur(gray, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))

sure_bg = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=3)
dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
_, sure_fg = cv2.threshold(dist, 0.5 * dist.max(), 255, cv2.THRESH_BINARY)
sure_fg = sure_fg.astype(np.uint8)
unknown = cv2.subtract(sure_bg, sure_fg)

n_plain, _ = cv2.connectedComponents(mask)
n_cores, markers = cv2.connectedComponents(sure_fg)             # one label per object core: 1, 2, 3, ...
markers = markers + 1                                           # background will be 1, objects 2, 3, ...
markers[unknown == 255] = 0                                     # 0 means "to be decided by the flood"
markers = cv2.watershed(color, markers.astype(np.int32))

print("true number of discs:", n_true, "  components before splitting:", n_plain - 1, "  objects found by watershed:", n_cores - 1)
vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
vis[markers == -1] = (255, 0, 0)                                # watershed lines are -1
cvlab.show(mask, "Mask (touching coins are glued)", cv2.normalize(dist, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8), "Distance transform", vis, "Watershed boundaries (blue)")
```

The threshold of the distance map (`0.5 × max` above) is the key knob. Too high: small objects lose their markers and vanish. Too low: neighbours' markers merge again.

## The same with scikit-image (peak finding)

scikit-image does the marker step with `peak_local_max`, which finds the local maxima of the distance map. This copes better with objects of **different sizes**.

```python run title="Markers from local maxima of the distance map" level=intermediate
import cv2
import numpy as np
from scipy import ndimage as ndi
from skimage.feature import peak_local_max
from skimage.segmentation import watershed
import cvlab

gray, n_true = cvlab.discs(cols=5, rows=3)
_, mask = cv2.threshold(cv2.GaussianBlur(gray, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0

dist = ndi.distance_transform_edt(mask)
peaks = peak_local_max(dist, min_distance=12, labels=mask.astype(int))      # one peak per object centre
markers = np.zeros(mask.shape, int)
markers[tuple(peaks.T)] = np.arange(1, len(peaks) + 1)
labels = watershed(-dist, markers, mask=mask)                               # flood from the peaks of the distance map
print("true number of discs:", n_true, "  objects found:", labels.max())
palette = np.random.default_rng(1).integers(60, 255, (labels.max() + 1, 3)).astype(np.uint8); palette[0] = 0
cvlab.show(palette[labels], "Each coin has its own colour")
```

## Watershed on the gradient

You can also flood the **gradient** image (edges are ridges, objects are basins) from user-chosen or automatically found markers. This lets you segment objects with clear edges without a binary mask. Interactive tools use this: you scribble inside objects, and watershed finds the boundaries.

## Pitfalls

- **Over-segmentation**: with too many markers (noise gives many tiny peaks), you get many tiny regions. Fix: smooth the distance map, raise the marker threshold, or use `min_distance`.
- **Under-segmentation**: markers too large or too few, so objects stay merged.
- **Non-round objects**: the distance transform makes one peak for a round object but several for an elongated one.
- It needs a **good mask** first. Garbage mask, garbage split.
- For crowded cells and complex shapes, trained instance segmentation (Cellpose, StarDist, Mask R-CNN) is far better.

:::interview Questions you may get
- "Two touching coins are one blob after thresholding. How do you separate them?" Distance transform, threshold or find its peaks as markers, then watershed.
- "Explain watershed in one sentence." Flood a landscape from markers, and put dams where floods from different markers meet.
- "Why is it often over-segmenting?" Every local minimum becomes a basin, so noise creates many regions; control the markers.
- "What does the distance transform of a binary image give?" The distance of each foreground pixel to the nearest background pixel.
:::

```quiz
? What is a good marker for a round object after the distance transform?
- The border pixels
+ The peak of the distance map, near the centre of the object
- The darkest pixel
> The centre of a round object is farthest from the background.

? You see hundreds of tiny regions after watershed. What happened?
+ Over-segmentation from too many markers (noise peaks)
- The image is too large
- The mask is empty
> Smooth the distance map or require a minimum distance between markers.

? In cv2.watershed, what does a marker value of 0 mean?
- Background
+ An unknown pixel that the flood will assign
- A boundary
> Known regions get positive labels; boundaries come out as −1.

? Which alternative is better for dense, irregular cells?
- A bigger kernel
+ A learned instance segmentation model (for example Cellpose or StarDist)
- Hough circles
> Classic watershed assumes simple convex shapes.
```

:::problem Your watershed splits large coins correctly but misses small coins in the same photo. Why, and how do you fix it? {level=medium tags="watershed,segmentation,debugging"}
Think about the marker threshold.

:::solution Model answer
The sure-foreground threshold is a fixed fraction of the **global** maximum of the distance map, set by the biggest coin. Small coins never reach that height, so they get no marker and vanish. Fix: use `peak_local_max` (local maxima, `min_distance` about the smallest radius), or threshold the distance map per component (relative to each component's own maximum), or use an h-maxima transform. Check with a picture of the markers on top of the image.
:::
:::

:::keypoints
- The distance transform gives each foreground pixel its distance to the background; round objects have a peak at the centre.
- Watershed floods from markers and builds dams where floods meet.
- Recipe: mask → sure background and sure foreground (distance threshold) → markers → `cv2.watershed`.
- Local-maxima markers handle objects of different sizes. Control markers to avoid over- and under-segmentation.
:::

:::resources
- [OpenCV: image segmentation with watershed](https://docs.opencv.org/4.x/d3/db4/tutorial_py_watershed.html) — the coin example in detail.
- [scikit-image: watershed segmentation gallery](https://scikit-image.org/docs/stable/auto_examples/segmentation/plot_watershed.html) — splitting overlapping objects.
:::
