---
title: Morphology — Cleaning Binary Masks
level: easy
time: 30
summary: Erosion, dilation, opening, closing, gradient and top-hat, with structuring elements. How to remove specks, fill holes, join broken parts, count objects, and why the order of operations matters.
---

After thresholding or segmentation, a mask is rarely clean. It has tiny white specks, small black holes, thin bridges and ragged edges. **Mathematical morphology** gives a small set of tools to clean it up. They work on the **shape** of things, not on grey values.

## The structuring element

All morphology tools use a small shape called the **structuring element** (SE), such as a 3 × 3 square, a disc or a cross. Think of it as a stamp. You slide it over the mask, and at each position you ask a yes/no question about the pixels under it.

```python run title="Structuring elements" level=easy
import cv2

for name, shape in [("rectangle", cv2.MORPH_RECT), ("ellipse", cv2.MORPH_ELLIPSE), ("cross", cv2.MORPH_CROSS)]:
    print(name)
    print(cv2.getStructuringElement(shape, (5, 5)))
```

## Erosion: shrink

**Erosion** keeps a pixel white only if **the whole stamp fits inside the white area** around it. Effects:

- White shapes get **thinner** (edges move inward by the SE radius).
- Small white specks (smaller than the SE) **vanish**.
- Two blobs joined by a thin bridge get **separated**.

## Dilation: grow

**Dilation** makes a pixel white if **any part of the stamp touches white**. Effects:

- White shapes get **fatter**.
- Small black holes **fill in**.
- Nearby white pieces **merge**.

:::analogy
Erosion is like sanding the edges of a white cardboard shape: it gets smaller, and thin parts snap off. Dilation is like painting an extra border around it. Remember: they act on the **white** pixels. For black objects on white, the roles swap.
:::

```python run title="Erode and dilate a small picture" level=easy
import cv2
import numpy as np
import cvlab

mask = np.zeros((60, 60), np.uint8)
mask[10:40, 10:40] = 255
mask[20, 25] = 0                       # a tiny hole
mask[50, 50] = 255                     # a tiny speck
kernel = np.ones((3, 3), np.uint8)

eroded = cv2.erode(mask, kernel)
dilated = cv2.dilate(mask, kernel)
print("white pixels  original:", int((mask > 0).sum()), " eroded:", int((eroded > 0).sum()), " dilated:", int((dilated > 0).sum()))
print("speck survives erosion:", bool(eroded[50, 50]), "  hole survives dilation:", not bool(dilated[20, 25]))
cvlab.show(mask, "Original", eroded, "Eroded", dilated, "Dilated")
```

## Opening and closing: the two you use most

- **Opening** = erosion then dilation. **Removes small white specks** and keeps the large shapes at their original size.
- **Closing** = dilation then erosion. **Fills small black holes** and joins close white parts, again keeping the size.

Memory trick: **opening opens gaps** between things (removes thin connections and specks). **Closing closes holes**.

```python run title="Clean a noisy mask: open, then close" level=easy
import cv2
import numpy as np
import cvlab

gray = cvlab.image("coins")
_, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

rng = np.random.default_rng(0)                               # add speckles and holes, like a bad segmentation
noisy = mask.copy()
noisy[rng.random(mask.shape) < 0.01] = 255
noisy[rng.random(mask.shape) < 0.01] = 0

k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
opened = cv2.morphologyEx(noisy, cv2.MORPH_OPEN, k)          # remove white specks
clean = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, k)         # fill black holes
print("components before / after cleaning:", cv2.connectedComponents(noisy)[0] - 1, "/", cv2.connectedComponents(clean)[0] - 1)
cvlab.show(noisy, "Noisy mask", opened, "After opening", clean, "After closing")
```

Order matters. Open **first** to remove specks, then close to fill holes. If you close first, a speck next to a shape can be fused to it.

Play with all the operations and the size and shape of the stamp:

```viz algo=morph title="Erode, dilate, open, close, gradient"
```

## More tools

| Operation | Formula | What it gives |
|---|---|---|
| Gradient | dilation − erosion | The **outline** of shapes |
| Top-hat | image − opening | Small **bright** details on an uneven background |
| Black-hat | closing − image | Small **dark** details (cracks, text on paper) |
| Skeleton / thinning | repeated erosion that keeps connectivity | A 1-pixel centre line (strokes, roads, veins) |

Morphology also works on **grey** pictures (erosion = local minimum, dilation = local maximum). **Top-hat on grey images** is a great way to remove uneven lighting before thresholding. Black-hat finds dark thin defects.

```python run title="Black-hat finds a thin dark scratch" level=intermediate
import cv2
import numpy as np
import cvlab

rng = np.random.default_rng(1)
yy, xx = np.mgrid[0:200, 0:260]
surface = 175 - 0.3 * xx + 0.1 * yy + rng.normal(0, 2.0, xx.shape)          # uneven light plus a little grain
img = np.clip(surface, 0, 255).astype(np.uint8)
cv2.line(img, (30, 50), (230, 150), int(img[100, 130]) - 15, 2)             # a faint dark scratch
img = cv2.GaussianBlur(img, (0, 0), 1.0)

_, plain = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)      # plain threshold: the light gradient wins
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
blackhat = cv2.morphologyEx(img, cv2.MORPH_BLACKHAT, k)                       # closing - image: keeps thin dark things
_, found = cv2.threshold(blackhat, 6, 255, cv2.THRESH_BINARY)
print("plain Otsu flags", int((plain > 0).sum()), "pixels (the dark side of the gradient)")
print("black-hat flags  ", int((found > 0).sum()), "pixels (the scratch)")
cvlab.show(img, "Surface with a faint scratch", plain, "Plain threshold fails", found, "Black-hat + threshold finds it")
```

## Count objects

Clean mask → count connected pieces. This is how you count coins, cells, screws, seeds.

```python run title="Count the coins" level=easy
import cv2
import numpy as np
import cvlab

gray = cvlab.image("coins")
_, mask = cv2.threshold(cv2.GaussianBlur(gray, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
n, labels, stats, centroids = cv2.connectedComponentsWithStats(mask)
areas = stats[1:, cv2.CC_STAT_AREA]
big = [i + 1 for i, a in enumerate(areas) if a > 300]
print("pieces found:", n - 1, " pieces larger than 300 pixels:", len(big))
vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
for i in big:
    cx, cy = centroids[i]
    cv2.circle(vis, (int(cx), int(cy)), 4, (255, 0, 0), -1)
cvlab.show(mask, "Mask", vis, "One dot per object")
```

Touching coins merge into one piece. To split touching objects use the **distance transform and watershed** (a later lesson).

:::interview Questions you may get
- "Difference between opening and closing?" Opening (erode then dilate) removes small white objects. Closing (dilate then erode) fills small holes.
- "How would you remove salt-and-pepper noise from a binary mask?" Opening for white specks, closing for black holes, or a median filter.
- "How do you get the outline of a mask?" Morphological gradient, or `mask − erode(mask)`.
- "How do you pick the structuring element size?" Slightly bigger than the noise you want to remove, but smaller than the features you want to keep.
:::

```quiz
? Which operation removes small white specks and keeps big shapes the same size?
- Dilation
+ Opening
- Closing
> Opening is erosion followed by dilation.

? What does dilation do to small black holes inside a white object?
+ Fills them
- Makes them bigger
- Nothing
> Dilation grows the white area into the holes.

? Which operation gives the outline of a shape?
- Top-hat
+ Morphological gradient (dilation minus erosion)
- Opening
> The difference between the grown and the shrunk shape is a thin band at the border.

? Top-hat (image − opening) is useful to find...
- Large dark regions
+ Small bright details on an uneven background
- Colours
> Black-hat does the same for small dark details.
```

:::problem After thresholding, you see two coins joined by a thin bridge, and a few small white specks. Which morphology sequence do you apply, and what could go wrong? {level=easy tags="morphology,masks"}
Think about order and size.

:::solution Model answer
Use **opening** with a structuring element a bit wider than the bridge and the specks. It removes the specks and breaks the bridge. Then optionally **closing** to fill small holes in the coins. Problems: if the element is too big, thin parts of real objects vanish or shapes get rounded; if the bridge is wider than the element, the coins stay joined (then use the distance transform and watershed). Test on several images, not one.
:::
:::

:::keypoints
- Erosion shrinks white shapes, dilation grows them. They use a structuring element.
- Opening (erode → dilate) removes specks. Closing (dilate → erode) fills holes. Open first, then close.
- Gradient = outline, top-hat/black-hat = small bright/dark details.
- Clean the mask, then count pieces with `connectedComponentsWithStats`.
:::

:::resources
- [OpenCV: morphological transformations](https://docs.opencv.org/4.x/d9/d61/tutorial_py_morphological_ops.html) — each operation with pictures.
- [HIPR2: Morphology](https://homepages.inf.ed.ac.uk/rbf/HIPR2/morops.htm) — a classic, gentle introduction.
:::
