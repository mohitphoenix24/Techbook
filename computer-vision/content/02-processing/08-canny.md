---
title: Canny Edge Detector, Step by Step
level: easy
time: 35
summary: The most famous edge detector, explained in four steps: blur, gradient, thin the ridges (non-maximum suppression) and hysteresis thresholds. You see each step, learn how to choose the two thresholds, and know the common failures.
---

Sobel gives a *map of edge strength*. It is thick and fuzzy: an edge is several pixels wide, and strength is a smooth number. For many jobs we want **thin, clean lines** of 1 pixel width. In 1986 John Canny designed a method that gives exactly that, and it is still the first thing people try.

Canny had three goals: **find real edges** (few misses, few false ones), **place them correctly**, and give **one line per edge**.

## The four steps

:::flow Canny edge detection
1. Blur | A Gaussian blur removes noise so that noise does not look like edges.
2. Gradient | Sobel gives strength and direction at every pixel.
3. Non-maximum suppression | Thin the fuzzy edge: along the gradient direction keep only the pixel with the highest strength. All others become 0.
4. Hysteresis thresholds | Two limits. Above the high limit: sure edge. Below the low limit: not an edge. In between: keep only if it touches a sure edge.
:::

**Why hysteresis?** With one threshold, a long edge whose strength wobbles around the limit breaks into dashes. With two thresholds, a pixel with medium strength is kept if it is connected to a strong one, so edges stay unbroken, while isolated medium noise is dropped.

Step through it:

```viz algo=canny title="Canny, one step at a time"
```

## Use it

```python run title="cv2.Canny" level=easy
import cv2
import cvlab

gray = cvlab.image("coins")
blur = cv2.GaussianBlur(gray, (5, 5), 1.4)
edges = cv2.Canny(blur, threshold1=50, threshold2=150)      # low, high
print("edge pixels:", int((edges > 0).sum()), "of", edges.size, "(edges are 0 or 255)")
cvlab.show(gray, "Photo", edges, "Canny 50 / 150")
```

Note that OpenCV's `Canny` does **not** blur for you: you do it first. (The `5, 5` and `1.4` are a typical choice.)

## Choosing the thresholds

- **Rule of thumb**: high = 2 to 3 times the low. For example 50 and 150.
- **Lower both** to see more edges (and more noise). **Raise both** for only the strong ones.
- If strong edges break into pieces, lower `low`. If you see too much texture, raise `high`.
- **Automatic**: derive them from the picture's median brightness, a well-known trick that adapts to exposure.

```python run title="Automatic Canny thresholds from the median" level=intermediate
import cv2
import numpy as np
import cvlab

def auto_canny(gray, sigma=0.33):
    v = np.median(gray)
    lower = int(max(0, (1.0 - sigma) * v))
    upper = int(min(255, (1.0 + sigma) * v))
    return cv2.Canny(gray, lower, upper), lower, upper

for name in ("camera", "coins", "moon"):
    img = cv2.GaussianBlur(cvlab.image(name), (5, 5), 1.2)
    edges, lo, hi = auto_canny(img)
    print(f"{name:7} median {int(np.median(img)):3d} -> thresholds {lo:3d}/{hi:3d}  edge pixels {int((edges > 0).sum())}")
a, _, _ = auto_canny(cv2.GaussianBlur(cvlab.image("camera"), (5, 5), 1.2))
cvlab.show(a, "Auto thresholds")
```

## Canny versus a plain threshold of Sobel

```python run title="Why Canny beats 'threshold the gradient'" level=easy
import cv2
import numpy as np
import cvlab

gray = cv2.GaussianBlur(cvlab.image("camera"), (0, 0), 1.4)
gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0)
gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1)
simple = (np.hypot(gx, gy) > 100).astype(np.uint8) * 255
canny = cv2.Canny(gray, 50, 120)
print("thick Sobel edge pixels:", int((simple > 0).sum()), "  thin Canny edge pixels:", int((canny > 0).sum()))
cvlab.show(simple, "Threshold of Sobel: thick", canny, "Canny: thin and connected")
```

## Where it fails

- **Texture**: grass, brick or fur gives thousands of small edges. Blur more or raise the thresholds.
- **Weak edges**: low contrast outlines disappear. Use CLAHE first or lower the thresholds.
- **Gaps at corners and junctions**: non-maximum suppression thins the strongest direction and can leave small gaps.
- **No meaning**: Canny knows nothing about objects. Edges from a shadow, a reflection and a real boundary all look the same. Deep networks (HED, and today's segmentation models) learn which edges matter.

## What people do with the edge map

Edge maps are the **input** to many other tools: contour finding (the shape of an object), Hough transform (lines and circles), template matching on edges, lane detection, and document scanners. Each of these gets its own lesson soon.

:::interview Questions you may get
- "Explain the Canny algorithm." Gaussian blur, Sobel gradient, non-maximum suppression along the gradient direction, double threshold with hysteresis.
- "What does non-maximum suppression do?" Thins wide ridges to one pixel by keeping only local maxima along the gradient direction.
- "Why two thresholds?" Hysteresis: keep weak pixels only when connected to strong ones, so edges are continuous but noise is rejected.
- "How do you set the thresholds?" Ratio about 1:2 or 1:3, tune by eye, or take them from the median brightness.
- "What are the limitations of Canny?" Texture and noise, parameter sensitivity, no semantic understanding.
:::

```quiz
? Which step makes Canny edges one pixel thin?
- The Gaussian blur
- Hysteresis
+ Non-maximum suppression
> It keeps only the strongest pixel across the edge.

? What does hysteresis thresholding keep?
- Only pixels above the high threshold
+ Pixels above the high threshold, plus weaker pixels that connect to them
- Pixels below the low threshold
> This keeps edges unbroken but drops isolated noise.

? You get a lot of tiny edges on a grassy lawn. What do you try?
+ Blur more and raise both thresholds
- Lower both thresholds
- Convert to HSV
> Texture creates many small gradients.

? Does cv2.Canny blur the image for you?
- Yes, with a 5x5 Gaussian
+ No, you must blur first
- Only for colour images
> You normally apply cv2.GaussianBlur before calling it.
```

:::problem Your Canny output has broken, dashed outlines. Which parameter do you change and why? {level=easy tags="canny,debugging"}
Think about hysteresis.

:::solution Model answer
Lower the **low** threshold (and keep the high one). Weak pixels along the edge are then kept as long as they connect to a strong pixel, so the dashes join up. If this adds noise, increase the blur a little instead. Also check that the picture has enough contrast (try CLAHE first).
:::
:::

:::keypoints
- Canny = Gaussian blur → Sobel gradient → non-maximum suppression → double threshold with hysteresis.
- It produces thin, connected edges. Set high ≈ 2–3 × low, or derive them from the median.
- It does not blur for you. It cannot tell meaningful edges from texture.
- Edge maps feed contours, Hough, lane detection and scanners.
:::

:::resources
- [OpenCV: Canny edge detection](https://docs.opencv.org/4.x/da/d22/tutorial_py_canny.html) — theory and code.
- [Canny: A Computational Approach to Edge Detection (1986)](https://ieeexplore.ieee.org/document/4767851) — the original paper.
:::
