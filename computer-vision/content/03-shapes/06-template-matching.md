---
title: Template Matching
level: easy
time: 30
summary: Find a small picture inside a bigger one by sliding it across and scoring the match. The scoring methods (SQDIFF, CCORR, CCOEFF and their normalised forms), finding several matches, what breaks it (scale, rotation, lighting), and how to make it faster.
---

You have a small picture of the thing you look for (a **template**): a logo, a screw head, a button on a screen. You have a big picture. Where is the template in the big picture?

The simplest answer: **slide the template over every position, and at each position measure how similar the patch below it is.** That is **template matching**.

## The idea

For a template of size `w × h` and an image of size `W × H`, there are `(W − w + 1) × (H − h + 1)` positions. At each one we compute a similarity score. The result is a **score map**. Its brightest (or darkest) spot is the best match.

Note the similarity to convolution: sliding a small patch and summing products. Template matching **is** a correlation where the kernel is the template.

## Scoring methods

| Method | Formula idea | Best match is | Notes |
|---|---|---|---|
| `TM_SQDIFF` | sum of squared differences | **minimum** | Simple. Sensitive to brightness |
| `TM_CCORR` | sum of products | maximum | Bright areas score high everywhere |
| `TM_CCOEFF` | correlation after removing the mean | maximum | Ignores a constant brightness shift |
| `TM_SQDIFF_NORMED`, `TM_CCORR_NORMED` | the same, scaled | min / max | Scores between 0 and 1 |
| **`TM_CCOEFF_NORMED`** | zero-mean normalised cross-correlation | **maximum** (−1 to 1) | **The usual choice.** Robust to brightness and contrast changes |

```python run title="Find a coin with matchTemplate" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("coins")
template = img[50:100, 205:255].copy()                      # crop one coin as the template (rows 50..100, columns 205..255)
th, tw = template.shape

score = cv2.matchTemplate(img, template, cv2.TM_CCOEFF_NORMED)
print("score map shape:", score.shape, "= (H - h + 1, W - w + 1)")
_, best, _, loc = cv2.minMaxLoc(score)                       # for CCOEFF_NORMED the best is the maximum
print("best score:", round(best, 3), " top-left corner (x, y):", loc, " (we cut it at (205, 50))")

vis = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
cv2.rectangle(vis, loc, (loc[0] + tw, loc[1] + th), (255, 0, 0), 2)
cvlab.show(template, "Template", score, "Score map (bright = good match)", vis, "Best match")
```

The best score is 1.0 here, because the template was cut from the picture itself. In real use, scores of 0.8–0.95 are typical for a true match.

## Finding all the matches

Often the object appears several times (many coins, many screws). Take **all** positions with a score above a threshold. Neighbouring positions of one object all score well, so you must keep only the **local maximum** of each cluster. This is **non-maximum suppression**.

```python run title="Find every similar coin" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("coins")
template = img[50:100, 205:255].copy()
th, tw = template.shape
score = cv2.matchTemplate(img, template, cv2.TM_CCOEFF_NORMED)

ys, xs = np.where(score >= 0.55)                           # every position above the threshold
cands = sorted(zip(score[ys, xs], xs, ys), reverse=True)   # best first
picked = []
for s, x, y in cands:                                      # greedy NMS: skip a candidate near one already kept
    if all(abs(x - px) > tw // 2 or abs(y - py) > th // 2 for _, px, py in picked):
        picked.append((s, x, y))
print("candidates above 0.55:", len(cands), "-> after suppressing neighbours:", len(picked))

vis = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
for s, x, y in picked:
    cv2.rectangle(vis, (x, y), (x + tw, y + th), (255, 0, 0), 2)
cvlab.show(vis, f"{len(picked)} matches (coins of the same size and look)")
```

## What breaks template matching

The method compares raw pixels, so the template must look **the same** in the picture:

| Change | Effect | Fix |
|---|---|---|
| **Scale** (object nearer or farther) | Score drops sharply | Search at many sizes (a pyramid) |
| **Rotation** | Score drops sharply | Try many rotated templates |
| **Brightness / contrast** | SQDIFF fails; CCOEFF_NORMED copes | Use `TM_CCOEFF_NORMED` |
| **Perspective, deformation** | Fails | Use features (SIFT/ORB) or a detector |
| **Clutter, partial occlusion** | Score drops | Lower the threshold; use features |

```python run title="Scale kills the match; a multi-scale search fixes it" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("coins")
template = img[50:100, 205:255].copy()
big = cv2.resize(img, None, fx=1.4, fy=1.4, interpolation=cv2.INTER_CUBIC)          # the same scene seen from nearer

plain = cv2.matchTemplate(big, template, cv2.TM_CCOEFF_NORMED).max()
print("single scale, best score on the enlarged picture:", round(float(plain), 3))

best = (0, None)
for s in np.linspace(0.8, 1.6, 17):                                                  # try the template at many sizes
    t = cv2.resize(template, None, fx=s, fy=s, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    if t.shape[0] >= big.shape[0] or t.shape[1] >= big.shape[1]:
        continue
    sc = cv2.matchTemplate(big, t, cv2.TM_CCOEFF_NORMED).max()
    if sc > best[0]:
        best = (sc, s)
print("multi-scale best score:", round(float(best[0]), 3), "at template scale", round(float(best[1]), 2), "(true scale 1.4)")
```

## Making it faster

- **Pyramids**: match at a small size first (coarse), then refine near the best positions.
- **Match on edges** (Canny of both), which is less sensitive to lighting.
- **Restrict the search area**: if the part is always near the same place, search only there. In a robot cell this is a huge saving.
- **FFT**: OpenCV already uses the frequency method for big templates.
- Use **masks** (`mask=` argument) to ignore background pixels inside the template.

## When to choose something else

Template matching is perfect when the target looks identical every time and the camera is fixed: a button on a fixed screen layout, a fiducial mark, a part on a jig, a known logo. When the appearance changes (viewpoint, size, lighting), use **local features** (the next module) or a **learned detector**.

:::interview Questions you may get
- "How does template matching work and which score would you use?" Slide the template, compute a similarity at each position; zero-mean normalised cross-correlation (`TM_CCOEFF_NORMED`) because it is robust to brightness and contrast.
- "What are its limitations?" Not invariant to scale, rotation, perspective or heavy occlusion.
- "How do you find multiple instances?" Threshold the score map and apply non-maximum suppression.
- "How would you make it scale-invariant?" Search over an image pyramid or resize the template.
:::

```quiz
? For TM_SQDIFF, which location is the best match?
+ The minimum of the score map
- The maximum
- The centre
> Squared differences are smallest where the patch matches best.

? Which method is robust to a change in overall brightness?
- TM_SQDIFF
- TM_CCORR
+ TM_CCOEFF_NORMED
> It subtracts the mean and normalises, so brightness and contrast shifts matter little.

? The target is twice as large in the new picture. What happens to a plain match?
- Nothing
+ The score drops sharply; you must search at several scales
- The score rises
> Template matching has no scale invariance.

? After thresholding the score map you get 40 hits around 4 objects. What is missing?
+ Non-maximum suppression, to keep one hit per object
- A bigger template
- More blur
> Neighbouring positions of one object all score well.
```

:::problem A robot must find a rectangular marker on a table. Which method would you choose, and when would you give up on template matching? {level=medium tags="template-matching,robotics"}
Think about how stable the setup is.

:::solution Model answer
If the camera is fixed and the marker size and rotation are the same each time, use `TM_CCOEFF_NORMED` with a pyramid and a small search window around the expected place: fast and simple. If the marker can rotate or the distance changes, add rotation and scale search or switch to a **fiducial marker** system (ArUco/AprilTag), which gives identity and full 6-D pose. If the object has texture and appears from different views, use feature matching (ORB/SIFT) with RANSAC, or a learned detector. Give up on template matching when the appearance changes more than a few percent in scale or a few degrees in rotation, or with strong lighting changes.
:::
:::

:::keypoints
- Template matching slides a patch over the picture and scores each position (`cv2.matchTemplate`).
- Use `TM_CCOEFF_NORMED` and take the maximum. For several matches, threshold and apply NMS.
- It is not invariant to scale, rotation or perspective; add a pyramid or move to features.
- Restrict the search area and match at low resolution first to be fast.
:::

:::resources
- [OpenCV: template matching](https://docs.opencv.org/4.x/d4/dc6/tutorial_py_template_matching.html) — all methods, with pictures.
- [OpenCV: matchTemplate reference](https://docs.opencv.org/4.x/df/dfb/group__imgproc__object.html) — the exact formulas.
:::
