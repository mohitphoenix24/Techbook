---
title: Classic Segmentation — K-means, Mean Shift, GrabCut, Superpixels
level: intermediate
time: 40
summary: Before neural networks, how did we split a picture into regions? K-means colour clustering, mean shift smoothing, GrabCut with a box, superpixels (SLIC) and flood fill. What each is good at, and why deep segmentation replaced them.
---

**Segmentation** means giving a label to every pixel: *this pixel is sky, this one is road.* Thresholding is the simplest case (two labels, from brightness). This lesson covers the classic tools for harder cases. They are quick, need no training data, and are still used for preprocessing, labelling help and small devices.

## K-means colour clustering

Treat every pixel's colour `(R, G, B)` as a point in 3-D. **K-means** finds `K` groups of similar colours: it picks `K` centres, assigns each pixel to the nearest centre, moves each centre to the average of its pixels, and repeats. At the end, each pixel gets the colour of its centre. This is called **colour quantisation**, and the cluster number is a crude segmentation.

```python run title="K-means on colours" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("coffee")
data = img.reshape(-1, 3).astype(np.float32)                  # one row per pixel

criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
outputs = []
for k in (2, 4, 8):
    _, labels, centres = cv2.kmeans(data, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    quant = centres.astype(np.uint8)[labels.ravel()].reshape(img.shape)
    outputs.append(quant)
    print(f"K={k}: cluster centres (RGB) =", centres.astype(int).tolist()[:4], "...")
cvlab.show(img, "Original", *outputs, titles=["Original", "K = 2", "K = 4", "K = 8"][1:])
```

K-means ignores where pixels are, only how they look. So two separate things with the same colour share a cluster, and a smooth gradient is cut into bands. Adding **position** `(x, y)` to the feature vector makes the clusters spatially compact. K-means is also the classic tool for finding the **dominant colours** of a picture.

## Mean shift

**Mean shift** looks for the **peaks** of the colour-and-position density. For each pixel it repeatedly moves toward the average colour of its neighbours within a radius, until it stops at a peak. Pixels that end at the same peak merge. Unlike k-means you do not choose K; you choose two **radii**: how far in space (`sp`) and how far in colour (`sr`).

```python run title="Mean-shift filtering flattens regions" level=easy
import cv2
import cvlab

img = cvlab.image("cat")
shifted = cv2.pyrMeanShiftFiltering(img, sp=15, sr=30)
colours_before = len(set(map(tuple, img.reshape(-1, 3))))
colours_after = len(set(map(tuple, shifted.reshape(-1, 3))))
print("distinct colours before:", colours_before, "  after:", colours_after)
cvlab.show(img, "Original", shifted, "Mean-shift filtered: flat regions, sharp borders")
```

The result is a "cartoon": flat colour patches with sharp borders. It is slow for big pictures but gives a good starting point for segmentation.

## GrabCut: cut out an object with a box

**GrabCut** extracts the foreground when you give it a **rough rectangle** around the object. It models the colours of foreground and background with **Gaussian mixture models (GMMs)**, then finds the best boundary with a graph cut that balances "does this pixel's colour fit the foreground model?" against "keep the boundary smooth and along edges". It repeats a few times, updating the colour models.

```python run title="GrabCut with a rectangle" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("astronaut")
bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)                    # grabCut expects an 8-bit 3-channel image
mask = np.zeros(img.shape[:2], np.uint8)
rect = (90, 5, 200, 370)                                      # x, y, width, height: a rough box around the person
bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)       # internal GMM state

cv2.grabCut(bgr, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)       # definitely or probably foreground
print("foreground fraction of the image:", round(float(fg.mean()), 2))
cut = img * fg[..., None]
vis = img.copy(); cv2.rectangle(vis, rect[:2], (rect[0] + rect[2], rect[1] + rect[3]), (255, 255, 0), 2)
cvlab.show(vis, "Input and box", fg * 255, "Mask found by GrabCut", cut, "Cut-out")
```

After a first pass you can **correct** it: mark a few pixels as sure foreground (`GC_FGD`) or sure background (`GC_BGD`) and run again with `GC_INIT_WITH_MASK`. That is how early "magic wand" and background-removal tools worked. GrabCut works best when the foreground and background colours differ.

## Superpixels (SLIC)

A **superpixel** is a small group of neighbouring, similar pixels (about 50–500 pixels). Instead of working with 100,000 pixels, you work with 500 superpixels that follow the edges. **SLIC** runs k-means in the 5-D space (L, a, b, x, y), with a limited search window so it is fast.

```python run title="SLIC superpixels" level=intermediate
import numpy as np
from skimage.segmentation import slic, mark_boundaries
import cvlab

img = cvlab.image("cat")
segments = slic(img, n_segments=150, compactness=12, start_label=0)
print("superpixels:", segments.max() + 1, "  average size:", int(img.shape[0] * img.shape[1] / (segments.max() + 1)), "pixels")
mean_colour = np.zeros_like(img)
for s in range(segments.max() + 1):
    mean_colour[segments == s] = img[segments == s].mean(axis=0)
cvlab.show(mark_boundaries(img, segments, color=(1, 1, 0)), "Superpixel boundaries", mean_colour, "Each superpixel as its mean colour")
```

`compactness` trades colour similarity against shape regularity: higher gives squarer superpixels. Superpixels were a standard first step in many pre-deep-learning pipelines and are still used for labelling tools and fast approximate processing.

## Flood fill

`cv2.floodFill` starts at a **seed** pixel and spreads to neighbours whose colour is within a tolerance, like the "paint bucket" tool. Good for selecting a flat-coloured region quickly.

```python run title="Flood fill from a seed" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("rocket").copy()
h, w = img.shape[:2]
mask = np.zeros((h + 2, w + 2), np.uint8)                                  # floodFill wants a mask 2 pixels larger
seed = (5, 5)                                                              # (x, y) in the sky
cv2.floodFill(img, mask, seed, (255, 0, 0), loDiff=(25, 25, 25), upDiff=(25, 25, 25), flags=4 | cv2.FLOODFILL_FIXED_RANGE)
print("the fill reached", round(float(mask[1:-1, 1:-1].mean() * 100), 1), "% of the picture (raise the tolerance to reach more)")
cvlab.show(img, "Flood filled from the top-left corner")
```

## Comparing the classic methods

| Method | Needs from you | Good for | Weak at |
|---|---|---|---|
| Threshold / Otsu | A grey level | Simple, high-contrast scenes | Uneven light, colour |
| K-means | K | Dominant colours, quantisation | Position ignored, K must be chosen |
| Mean shift | Two radii | Smooth, edge-keeping clustering | Slow |
| GrabCut | A box (and corrections) | One object on a distinguishable background | Similar colours, many objects |
| Watershed | Markers | Touching blobs | Over-segmentation |
| SLIC | Number of superpixels | Preprocessing, labelling tools | Not semantic: no object names |
| Flood fill | A seed, tolerance | Flat regions | Gradients and texture |

## Why deep learning replaced them

All of these use **colour and position only**. None of them knows what a "person" or a "road" is. They fail when the object has two colours (a person in a red shirt and blue jeans) or when different objects share a colour (a grey cat on a grey sofa). Deep segmentation networks learn **meaning** from millions of labelled examples. We start those in the segmentation module. But note that the classic tools live on: GrabCut-style graph cuts refine neural masks, superpixels speed up annotation, and k-means clusters features of neural networks.

:::interview Questions you may get
- "How does K-means segmentation work and what are its limits?" Cluster pixel colours; ignores position and meaning; K must be chosen; sensitive to initialisation.
- "What is GrabCut?" Interactive foreground extraction: GMM colour models and a graph cut, iterated, started from a box.
- "What is a superpixel and why use it?" A small group of similar neighbouring pixels; reduces the number of elements and respects boundaries.
- "When would you still use classical segmentation today?" Small devices, controlled scenes, labelling help, post-processing, when no training data exists.
:::

```quiz
? What does K-means use as features when you cluster the pixels of an image by colour?
+ The (R, G, B) values of each pixel
- The positions of pixels
- Edges
> Position is ignored unless you add (x, y) to the features.

? What do you give GrabCut to start?
- A set of labels
+ A rough rectangle around the object
- Nothing
> It then models foreground and background colours and cuts a boundary.

? Which method gives you many small regions that follow edges, as a preprocessing step?
- Otsu
+ SLIC superpixels
- Hough transform
> Superpixels reduce the number of units to reason about.

? Why do classic segmentation methods fail on "a person in a red shirt and blue jeans"?
+ They group by colour and position and do not know the object
- They are too slow
- They need depth
> Learned segmentation understands objects, not just colours.
```

:::problem You must remove the background from product photos taken on a plain white table. Which classic method would you start with and why? What would make you switch to a neural network? {level=easy tags="segmentation,grabcut,product"}
Think about contrast and failure cases.

:::solution Model answer
With a plain, evenly lit white background: threshold (or Otsu) the difference from white, clean with morphology, and take the largest contour. Refine soft edges with GrabCut initialised from that mask, or alpha-matting. Switch to a neural network (U²-Net, SAM, rembg) when products are white or transparent, have fine structures (hair, mesh), cast strong shadows, or the background varies. Measure with IoU against hand-labelled masks.
:::
:::

:::keypoints
- K-means groups pixel colours; mean shift finds colour peaks with two radii; GrabCut cuts out an object from a box; SLIC makes superpixels; flood fill grows a region from a seed.
- They use colour and position only. They know nothing about objects.
- They are fast, need no training data and are still used in preprocessing and labelling tools.
- Deep segmentation networks replaced them for understanding scenes.
:::

:::resources
- [OpenCV: K-means clustering](https://docs.opencv.org/4.x/d1/d5c/tutorial_py_kmeans_opencv.html) — colour quantisation example.
- [OpenCV: foreground extraction using GrabCut](https://docs.opencv.org/4.x/d8/d83/tutorial_py_grabcut.html) — with the correction step.
- [SLIC Superpixels Compared to State-of-the-art (paper)](https://infoscience.epfl.ch/record/149300) — the original SLIC paper.
:::
