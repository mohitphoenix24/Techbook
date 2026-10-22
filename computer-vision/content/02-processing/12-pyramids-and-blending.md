---
title: Image Pyramids, Laplacian Pyramids and Blending
level: intermediate
time: 35
summary: Look at a picture at many sizes. Gaussian and Laplacian pyramids, exact reconstruction, seamless blending of two pictures, and the link to scale space and the Difference of Gaussians that SIFT uses.
---

Objects appear at different sizes. A face can fill the frame or be a tiny patch. A single filter size cannot find both. The classic answer is the **image pyramid**: the same picture at many sizes, from big to small.

## The Gaussian pyramid

Start with the full picture (level 0). To get the next level: **blur**, then **throw away every second row and column**. The picture is now a quarter of the area. Repeat. (You blur first to avoid aliasing, as in the resizing lesson.)

```python run title="Build a Gaussian pyramid" level=easy
import cv2
import cvlab

img = cvlab.image("astronaut")
levels = [img]
for _ in range(4):
    levels.append(cv2.pyrDown(levels[-1]))
for i, l in enumerate(levels):
    print(f"level {i}: {l.shape[1]} x {l.shape[0]}")
cvlab.show(*levels, titles=[f"level {i}" for i in range(len(levels))])
```

A pyramid costs only **1/3 extra memory** in total (1 + 1/4 + 1/16 + ... = 4/3). You can search at the small levels first (fast, coarse) and refine at the big levels. This **coarse-to-fine** idea is used in optical flow, template matching, stereo and face detection.

## The Laplacian pyramid: store only what is new

Each level of the Gaussian pyramid contains the previous level's information at lower resolution. To avoid storing it twice, we keep the **detail that was lost** between levels:

`L[i] = G[i] − upsample(G[i+1])`

Each Laplacian level is a **band** of detail of one size (a band-pass picture). The smallest Gaussian level is kept as the base. From those pieces you can **rebuild the original exactly**.

```python run title="Laplacian pyramid and perfect reconstruction" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("cat")
h, w = img.shape[:2]
img = img[:h // 8 * 8, :w // 8 * 8].astype(np.float32)           # sizes divisible by 8 keep levels aligned

gauss = [img]
for _ in range(3):
    gauss.append(cv2.pyrDown(gauss[-1]))
lap = []
for i in range(3):
    up = cv2.pyrUp(gauss[i + 1], dstsize=(gauss[i].shape[1], gauss[i].shape[0]))
    lap.append(gauss[i] - up)                                    # detail lost between level i and i+1
lap.append(gauss[3])                                             # the smallest picture is the base

# rebuild from the smallest level upwards
rebuilt = lap[3]
for i in (2, 1, 0):
    rebuilt = cv2.pyrUp(rebuilt, dstsize=(lap[i].shape[1], lap[i].shape[0])) + lap[i]
print("largest reconstruction error:", float(np.abs(rebuilt - img).max()))
show = lambda a: np.clip(a * 3 + 128, 0, 255).astype(np.uint8)
cvlab.show(show(lap[0]), "L0: finest detail", show(lap[1]), "L1: medium detail", show(lap[2]), "L2: coarse detail", lap[3].astype(np.uint8), "Base (smallest)")
```

The reconstruction is exact (error near zero), because we stored exactly what was lost. Laplacian pyramids are used for **compression**, **detail enhancement** (multiply the detail levels), and **blending**.

## Blending two pictures without a visible seam

If you paste half of picture A next to half of picture B, you see a hard line. If you blur the transition, you see ghosting. The method of Burt and Adelson (1983) blends each **frequency band** separately:

- **Fine detail** is blended over a **narrow** transition zone (so edges stay crisp).
- **Coarse shapes and colour** are blended over a **wide** zone (so colours fade smoothly).

Steps: build Laplacian pyramids of A and B, build a Gaussian pyramid of the **mask**, blend each level `L = mask·LA + (1−mask)·LB`, then collapse the pyramid.

```python run title="Seamless blend with Laplacian pyramids" level=intermediate
import cv2
import numpy as np
import cvlab

def build(img, levels):
    g = [img.astype(np.float32)]
    for _ in range(levels):
        g.append(cv2.pyrDown(g[-1]))
    lap = [g[i] - cv2.pyrUp(g[i + 1], dstsize=(g[i].shape[1], g[i].shape[0])) for i in range(levels)]
    return g, lap + [g[-1]]

def pyramid_blend(a, b, mask, levels=4):
    _, la = build(a, levels)
    _, lb = build(b, levels)
    gm, _ = build(mask, levels)
    blended = [m * x + (1 - m) * y for x, y, m in zip(la, lb, gm)]
    out = blended[-1]
    for i in range(levels - 1, -1, -1):
        out = cv2.pyrUp(out, dstsize=(blended[i].shape[1], blended[i].shape[0])) + blended[i]
    return np.clip(out, 0, 255).astype(np.uint8)

a = cvlab.image("astronaut", size=(256, 256))
b = cvlab.image("coffee", size=(256, 256))
mask = np.zeros((256, 256, 3), np.float32); mask[:, :128] = 1                 # left half from A, right half from B

hard = np.where(mask > 0, a, b).astype(np.uint8)
soft = pyramid_blend(a, b, mask)
print("hard seam jump at the middle column:", float(np.abs(hard[:, 127].astype(int) - hard[:, 128]).mean().round(1)),
      "  blended:", float(np.abs(soft[:, 127].astype(int) - soft[:, 128]).mean().round(1)))
cvlab.show(hard, "Hard seam", soft, "Laplacian pyramid blend")
```

This is how panoramas hide stitching seams and how "Apple + Orange" demos work. Modern versions (Poisson blending, learned inpainting) refine the same idea.

## Scale space and Difference of Gaussians

A pyramid changes the picture **size**. A related idea, **scale space**, keeps the size but increases the **blur** (σ). A blob of size `s` gives its strongest response at the blur level that matches `s`.

The **Difference of Gaussians (DoG)**: `DoG = G(σ₂) − G(σ₁)` is a **band-pass** filter that keeps detail between the two scales, and it closely approximates the Laplacian of Gaussian (a blob detector). **SIFT** looks for points that are extreme in this DoG scale space. This is how it can find the same corner whether it is big or small.

```python run title="Difference of Gaussians highlights details of one size" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("coins", gray=True).astype(np.float32)
blur = lambda s: cv2.GaussianBlur(img, (0, 0), s)
dog_small = blur(2) - blur(3)                  # responds to details around 2-4 pixels wide
dog_big = blur(8) - blur(12)                   # responds to details around 10-20 pixels wide (a whole coin)
show = lambda a: np.clip(a * 6 + 128, 0, 255).astype(np.uint8)
print("strongest response  small scale:", round(float(np.abs(dog_small).max()), 1), "  large scale:", round(float(np.abs(dog_big).max()), 1))
cvlab.show(img.astype(np.uint8), "Coins", show(dog_small), "DoG: small details", show(dog_big), "DoG: coin-sized details")
```

:::interview Questions you may get
- "What is an image pyramid and why use it?" The same image at several sizes; allows detection at multiple scales and coarse-to-fine algorithms cheaply.
- "Gaussian versus Laplacian pyramid?" Gaussian = blurred and shrunk copies. Laplacian = the detail lost between levels (band-pass), which allows exact reconstruction.
- "How does multiband blending avoid seams?" It blends each frequency band over a transition width matching its scale.
- "What is the Difference of Gaussians?" A band-pass filter approximating the Laplacian of Gaussian; SIFT uses it for scale-invariant keypoints.
:::

```quiz
? How much extra memory does a full Gaussian pyramid need (each level half the width and height)?
+ About one third more
- Double
- Ten times
> 1 + 1/4 + 1/16 + ... = 4/3.

? What does a Laplacian pyramid level contain?
- A blurred copy of the picture
+ The detail lost between one Gaussian level and the next (a band-pass picture)
- The edges only
> Together with the smallest level it rebuilds the original exactly.

? In multiband blending, how is the mask used for fine detail?
- With a wide blur
+ With a narrow transition
- It is not used
> Fine detail blends over a narrow zone and coarse colour over a wide one.

? Which filter approximates a Laplacian of Gaussian?
- The box filter
+ The Difference of Gaussians
- The median filter
> G(σ₂) − G(σ₁) with σ₂ about 1.6 σ₁ is a good approximation.
```

:::problem You must detect faces of unknown size in a 1920×1080 image using a detector trained on 24×24 faces. How does a pyramid help, and what scale step do you choose? {level=medium tags="pyramid,detection"}
Think about sliding a fixed-size window.

:::solution Model answer
Build a pyramid with a scale factor (for example 1.2 to 1.25 per level). At each level, slide the fixed 24×24 window over the picture. A large face in the original becomes about 24 pixels at a coarser level, where the window finds it. A smaller step (1.1) misses fewer faces but costs more; a bigger step (1.5) is fast but may skip sizes. Detections from different levels are mapped back to the original coordinates and merged with non-maximum suppression. This is exactly what OpenCV's `detectMultiScale` does with `scaleFactor`.
:::
:::

:::keypoints
- A Gaussian pyramid is blur-then-shrink, repeated. It supports multi-scale search and coarse-to-fine methods.
- A Laplacian pyramid stores the detail between levels and rebuilds the picture exactly.
- Multiband blending hides seams by blending each band at its own scale.
- DoG is a band-pass filter that approximates the Laplacian of Gaussian. SIFT builds on it.
:::

:::resources
- [Burt and Adelson: The Laplacian Pyramid as a Compact Image Code (1983)](https://doi.org/10.1109/TCOM.1983.1095851) — the original pyramid paper.
- [OpenCV: image pyramids](https://docs.opencv.org/4.x/dc/dff/tutorial_py_pyramids.html) — pyrDown, pyrUp and blending.
:::
