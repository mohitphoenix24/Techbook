---
title: Thresholding — Black and White Decisions
level: easy
time: 30
summary: Turn a grey picture into a yes/no picture. Global thresholds, Otsu's method (with a from-scratch version), adaptive thresholds for uneven light, and how to choose the right one.
---

Many vision tasks end with a yes/no question for every pixel: *is this part of the object, or is it background?* The simplest answer is a **threshold**: pick a number `t`. Pixels brighter than `t` are "yes" (white). The rest are "no" (black).

:::def Threshold
A cut-off value. `mask = img > t` makes a black-and-white picture (a **binary image** or **mask**) from a grey one.
:::

## Global threshold

```python run title="One threshold for the whole picture" level=easy
import cv2
import cvlab

img = cvlab.image("coins")                     # light coins on a dark background
for t in (60, 120, 180):
    _, mask = cv2.threshold(img, t, 255, cv2.THRESH_BINARY)
    print(f"t={t:3d}: {100 * (mask > 0).mean():5.1f}% of pixels are white")

_, m1 = cv2.threshold(img, 60, 255, cv2.THRESH_BINARY)
_, m2 = cv2.threshold(img, 120, 255, cv2.THRESH_BINARY)
_, m3 = cv2.threshold(img, 180, 255, cv2.THRESH_BINARY)
cvlab.show(img, "Photo", m1, "t = 60 (too low)", m2, "t = 120", m3, "t = 180 (too high)")
```

Too low and the background leaks in. Too high and the coins lose parts. We need a way to choose `t` without guessing.

OpenCV has five basic modes: `THRESH_BINARY` (white above `t`), `THRESH_BINARY_INV` (the opposite), `THRESH_TRUNC` (cap values at `t`), `THRESH_TOZERO` (keep values above `t`, zero the rest) and `THRESH_TOZERO_INV`.

## Otsu: let the histogram choose

Look at the histogram of the coins. It has two humps: dark background and bright coins. A good threshold sits in the valley between them. **Otsu's method** finds it automatically.

:::analogy
Imagine splitting a class into two groups by height. A good split makes each group as similar inside as possible, and the two groups as different from each other as possible. Otsu does this with pixel brightness: try every `t` from 0 to 255 and keep the one where the two groups are the most separated.
:::

Formally it picks the `t` that **maximises the variance between the two classes**, which is the same as minimising the variance inside the classes.

```python run title="Otsu from scratch, and in OpenCV" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("coins")
hist = np.bincount(img.ravel(), minlength=256).astype(float)
total = hist.sum()
levels = np.arange(256)

best_t, best_between = 0, -1.0
for t in range(1, 255):
    w0, w1 = hist[:t + 1].sum(), hist[t + 1:].sum()          # sizes of the two groups
    if w0 == 0 or w1 == 0:
        continue
    m0 = (levels[:t + 1] * hist[:t + 1]).sum() / w0           # their average brightness
    m1 = (levels[t + 1:] * hist[t + 1:]).sum() / w1
    between = w0 * w1 * (m0 - m1) ** 2                        # how far apart the groups are
    if between > best_between:
        best_t, best_between = t, between

cv_t, mask = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
print("my Otsu threshold:", best_t, "  OpenCV's:", int(cv_t))
cvlab.show(img, "Photo", mask, f"Otsu threshold = {int(cv_t)}")
```

Otsu works well when the histogram has **two clear humps**. It fails when there is only one group (no object in the picture), when the object is tiny compared with the background, or when the light is uneven.

## Uneven light: adaptive thresholding

A photo of a page, lit from one side, has a bright left and a dark right. No single `t` works. Text on the dark side is darker than the page on the bright side but may still be brighter than the cut-off.

**Adaptive thresholding** compares each pixel with the **average of its own neighbourhood**: "am I darker than the area around me?" It adapts to the light.

```python run title="Page with uneven light" level=easy
import cv2
import numpy as np
import cvlab

page = cvlab.image("page")
# add a shadow that gets darker to the right, to make the problem harder
shadow = np.linspace(1.0, 0.35, page.shape[1])[None, :]
dark = (page * shadow).astype(np.uint8)

_, glob = cv2.threshold(dark, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
adap = cv2.adaptiveThreshold(dark, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 12)
cvlab.show(dark, "Page with a shadow", glob, "Global Otsu: right side lost", adap, "Adaptive: readable everywhere")
```

The two numbers after the method are the **block size** (31: the size of the neighbourhood, must be odd) and **C** (12: subtract this from the local average, so tiny wiggles in flat paper do not turn into noise). Make the block size bigger than the thickest stroke you want to keep.

Try all three methods on different pictures:

```viz algo=threshold title="Global, Otsu and adaptive thresholds"
```

## Choosing a method

:::flow Which threshold?
Is the light even and the object clearly brighter or darker? | Yes: try global with a value you set, or Otsu if the histogram has two humps.
Is the light uneven (shadows, a lamp on one side)? | Use adaptive thresholding with a large block.
Is it a colour object? | Do not use grey. Use `inRange` in HSV (colour lesson), or threshold a channel that separates well.
Still messy after thresholding? | Clean the mask with morphology (a later lesson): remove specks, fill holes.
Conditions change all the time? | Thresholds will keep breaking. Consider a learned segmentation model.
:::

:::interview Questions you may get
- "How does Otsu pick a threshold?" It tries every value and keeps the one that maximises between-class variance (equivalently minimises within-class variance).
- "When does Otsu fail?" Single-hump histograms, very unbalanced classes, strong noise, uneven light.
- "Scanning a page with a shadow. What would you do?" Adaptive threshold, or divide by a heavily blurred copy to remove the lighting, then Otsu.
- "How would you pick a threshold for a robot that sorts parts under a fixed lamp?" Calibrate on real images from the actual setup, and re-check when the lamp or camera changes.
:::

```quiz
? What does Otsu's method optimise?
- The sharpness of edges
+ The separation between the two groups of pixels (between-class variance)
- The total number of white pixels
> It searches all 256 thresholds for the best split.

? Which method suits a photo of a page with a shadow on one side?
- Global threshold
+ Adaptive threshold
- Equalisation only
> Adaptive thresholds compare each pixel with its local neighbourhood.

? In cv2.adaptiveThreshold, what is the "block size"?
+ The size of the neighbourhood used to compute the local average (odd number)
- The number of grey levels
- The size of the output image
> Make it larger than the strokes you want to keep.

? You threshold a colour photo to find a red apple. What is the better first step?
- Convert to grey and use Otsu
+ Convert to HSV and use inRange on hue (and saturation)
- Blur it
> A grey picture loses the colour difference.
```

:::problem A lab camera takes pictures of white tablets on a dark conveyor belt. Otsu works all day, then fails in the evening. What changed and what do you do? {level=medium tags="thresholding,robotics,debugging"}
Think about what Otsu assumes about the histogram.

:::solution Model answer
Otsu assumes a two-hump histogram. In the evening the light changed (or a tablet was missing), so the histogram became one hump, or the humps moved or overlapped, and the automatic threshold fell in the wrong place. Fixes: control the light (a fixed lamp or an enclosed light box is the best fix), use a fixed calibrated threshold plus monitoring, use adaptive thresholding or background subtraction, or add a quality check: reject frames where the white fraction is outside the expected range. If the setting is truly variable, use a learned segmentation model.
:::
:::

:::keypoints
- A threshold turns a grey picture into a mask: white where the pixel passes the test.
- Otsu picks the threshold automatically from a two-hump histogram.
- Adaptive thresholding compares each pixel with its neighbourhood and copes with uneven light.
- For colour objects, use HSV `inRange`. Clean masks with morphology afterwards.
- Good lighting beats clever thresholding.
:::

:::resources
- [OpenCV: image thresholding tutorial](https://docs.opencv.org/4.x/d7/d4d/tutorial_py_thresholding.html) — global, Otsu and adaptive, with pictures.
- [Otsu's method (Wikipedia)](https://en.wikipedia.org/wiki/Otsu%27s_method) — the maths and its limits.
:::
