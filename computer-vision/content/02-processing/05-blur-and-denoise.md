---
title: Blur and Denoise — Box, Gaussian, Median, Bilateral
level: easy
time: 40
summary: Why we blur, and how the main filters differ. Box and Gaussian blur, the median filter for salt-and-pepper noise, the bilateral filter that keeps edges, a note on non-local means, and a table that tells you which one to pick.
---

Real pictures contain **noise**: random small errors from the sensor, from low light, from compression. Many algorithms (edges, corners) react to noise as if it were real detail. So a very common first step is to **smooth** the picture a little. But every smoothing method has a price, and the best choice depends on the kind of noise.

## Two common kinds of noise

- **Gaussian noise**: every pixel is off by a small random amount (grain). Typical of low light and high ISO.
- **Salt-and-pepper noise**: a few pixels are completely wrong, pure black or pure white (dots). Typical of faulty pixels or transmission errors.

```python run title="Make two kinds of noise" level=easy
import numpy as np
import cvlab

clean = cvlab.image("camera")
grain = cvlab.noisy(clean, sigma=25)                 # Gaussian noise, standard deviation 25
dots  = cvlab.salt_pepper(clean, amount=0.05)        # 5% of the pixels are black or white
print("grain  : mean error", np.abs(grain.astype(int) - clean).mean().round(1))
print("dots   : changed pixels", round(float((dots != clean).mean()), 3))
cvlab.show(clean, "Clean", grain, "Gaussian noise", dots, "Salt and pepper")
```

## Box blur: the plain average

Replace each pixel by the **average of its neighbours** in a square. Easy and fast. But it has two faults: it treats a far pixel the same as a near one, and it makes square-looking artefacts.

## Gaussian blur: the smart average

Give **near pixels more weight** than far ones, in the shape of a bell curve. This is the **Gaussian** filter, and it is the most used blur in vision.

:::formula Gaussian weight
G(x, y) = \frac{1}{2\pi\sigma^2} \; e^{-\frac{x^2 + y^2}{2\sigma^2}}
:::

Only one number matters: **σ (sigma)**. A small σ blurs a little. A big σ blurs a lot. The kernel must be wide enough to hold the bell: about `6σ + 1` pixels (so `±3σ`). In OpenCV you can pass `(0, 0)` as the kernel size and let it choose from σ.

```python run title="Box versus Gaussian blur" level=easy
import cv2
import cvlab

img = cvlab.image("camera")
box = cv2.blur(img, (9, 9))                             # plain 9 x 9 average
g1  = cv2.GaussianBlur(img, (0, 0), sigmaX=1.5)
g2  = cv2.GaussianBlur(img, (0, 0), sigmaX=4)
cvlab.show(img, "Original", box, "Box 9x9", g1, "Gaussian σ=1.5", g2, "Gaussian σ=4")
```

Why is the Gaussian special? (1) It is **smooth**: no sharp edges in the kernel, so no ringing. (2) It is **separable**: a 2-D blur equals one blur along rows then one along columns, which is much faster (a later lesson). (3) Blurring twice with σ gives the same as blurring once with σ√2, which makes **scale space** (the SIFT lesson) work. (4) It does not create new bright spots that were not there.

## Median filter: the cure for dots

The **median** of a list is the middle value after sorting. A median filter replaces each pixel by the median of its neighbourhood. A single black or white dot is an **extreme** value: it ends up at the very end of the sorted list and is simply ignored.

This is a **non-linear** filter: you cannot write it as a kernel. It also keeps edges quite sharp, because the median does not invent in-between values.

```python run title="Which filter removes which noise?" level=easy
import cv2
import numpy as np
import cvlab

clean = cvlab.image("camera")
grain = cvlab.noisy(clean, sigma=25)
dots  = cvlab.salt_pepper(clean, amount=0.05)

def psnr(a, b):
    mse = np.mean((a.astype(float) - b.astype(float)) ** 2)
    return 10 * np.log10(255 ** 2 / mse)

filters = {
    "no filter": lambda x: x,
    "Gaussian σ=1.5": lambda x: cv2.GaussianBlur(x, (0, 0), 1.5),
    "median 5x5": lambda x: cv2.medianBlur(x, 5),
    "bilateral": lambda x: cv2.bilateralFilter(x, 7, 50, 3),
}
print(f"{'filter':16} {'grain noise':>12} {'dots':>8}   (PSNR in dB, higher = closer to clean)")
for name, f in filters.items():
    print(f"{name:16} {psnr(f(grain), clean):12.1f} {psnr(f(dots), clean):8.1f}")
cvlab.show(cv2.medianBlur(dots, 5), "Median on the dots", cv2.GaussianBlur(dots, (0, 0), 1.5), "Gaussian on the dots (smears them)")
```

Read the table. For grain, the bilateral filter does best. For dots, the median wins. The Gaussian helps a little with both, but it smears each dot into a grey blob instead of removing it (look at the two pictures). Try the simulator and change the filter and the noise:

```viz algo=blur title="Which filter removes which noise?"
```

## Bilateral filter: smooth, but keep edges

Gaussian and box blur do not know what an edge is. They smear it. The **bilateral filter** adds a second rule: a neighbour only gets a large weight if it is **close in position AND similar in brightness**. A pixel on the other side of an edge looks very different, so it gets almost no weight. Flat areas are smoothed. Edges stay.

It has two settings: `sigmaSpace` (how far to look) and `sigmaColor` (how different a brightness can be and still count). It is slower than Gaussian (it cannot be separated), and it can give a cartoon-like look at strong settings.

```python run title="Bilateral keeps the edge" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("astronaut")
noisy = cvlab.noisy(img, sigma=12)
g = cv2.GaussianBlur(noisy, (0, 0), 3)
b = cv2.bilateralFilter(noisy, d=9, sigmaColor=40, sigmaSpace=5)

# measure edge sharpness along a column that crosses the flag/background boundary
def edge_strength(x):
    gray = cv2.cvtColor(x, cv2.COLOR_RGB2GRAY).astype(float)
    return float(np.abs(np.diff(gray, axis=1)).max())
print("sharpest horizontal jump  gaussian :", round(edge_strength(g), 1))
print("sharpest horizontal jump  bilateral:", round(edge_strength(b), 1))
cvlab.show(noisy, "Noisy", g, "Gaussian (edges smeared)", b, "Bilateral (edges kept)")
```

## Non-local means and beyond

**Non-local means** (`cv2.fastNlMeansDenoising`) goes one step further. To clean a pixel, it looks for **similar-looking small patches anywhere in the picture** and averages them. Repeating textures (brick, grass) help a lot. It is much better than the filters above and much slower. **BM3D** is a famous improvement. Today, **neural-network denoisers** (DnCNN, Restormer, NAFNet) are the best, and phones use them on raw data.

## Which one should I use?

| Situation | Choice | Reason |
|---|---|---|
| A little blur before edges or corners | Gaussian | Fast, smooth, separable |
| Salt-and-pepper dots | Median | Ignores extremes |
| Remove grain but keep sharp edges | Bilateral or non-local means | Edge-aware |
| Strong noise, quality matters | Non-local means or a neural denoiser | Uses much more information |
| Real-time, tiny device | Box or small Gaussian | Cheapest |
| Reduce size and aliasing | Gaussian, then subsample (or `INTER_AREA`) | Low-pass first |

:::tip Blur is a trade
Every blur removes noise **and** detail together. If the thing you search for is thin (a hair, a scratch, a barcode line), a strong blur removes it too. Use the smallest blur that works, and look at the picture after.
:::

:::interview Questions you may get
- "Why Gaussian and not a box filter?" Smooth weights (no ringing or blockiness), separable, and repeated Gaussian blurs stay Gaussian (scale space).
- "Which filter for salt-and-pepper noise?" Median. A linear filter just smears the outliers.
- "How does a bilateral filter keep edges?" Its weight depends on both distance and intensity difference.
- "How do you choose the Gaussian kernel size from σ?" About `2·ceil(3σ) + 1`.
- "Is the median filter linear?" No. You cannot write it as a convolution.
:::

```quiz
? Which filter is best against salt-and-pepper noise?
- Gaussian blur
- Box blur
+ Median filter
> The median ignores extreme values instead of averaging them in.

? What does the bilateral filter use to decide a neighbour's weight?
- Only its distance
+ Its distance and how similar its brightness is
- Only its colour
> That is why it preserves edges.

? You double σ of a Gaussian blur. The kernel needs to be about...
+ twice as wide
- the same
- half as wide
> The width is about 6σ + 1.

? Why is non-local means slower than Gaussian blur?
- It uses a bigger kernel
+ For each pixel it compares patches across a large search area
- It works on colour only
> It trades time for better results on repeating textures.
```

:::problem A factory camera image has random white dots (dead pixels) and a thin dark scratch you must detect. Which denoising do you choose, and what do you avoid? {level=medium tags="denoising,inspection"}
Think about both goals at the same time.

:::solution Model answer
Dead pixels are salt noise, so a small **median** filter (3×3) removes them. A strong Gaussian would smear the dots and also blur the thin scratch, lowering its contrast. Better still, map and mask the **fixed** dead pixels (they are in the same place every frame) and replace them from neighbours, with no blur at all. Keep every other filter small. Check the contrast of a test scratch before and after, and tune on real defects. Avoid heavy denoising, because the defect looks like noise to the filter.
:::
:::

:::keypoints
- Smoothing reduces noise but also detail. Pick the weakest filter that works.
- Gaussian blur: smooth, separable, one parameter σ (kernel about 6σ+1 wide).
- Median filter: non-linear, removes salt-and-pepper dots, keeps edges.
- Bilateral filter weights by distance and brightness similarity, so edges survive.
- Non-local means and neural denoisers are better but slower.
:::

:::resources
- [OpenCV: smoothing images](https://docs.opencv.org/4.x/d4/d13/tutorial_py_filtering.html) — all four filters with pictures.
- [OpenCV: image denoising (fastNlMeansDenoising)](https://docs.opencv.org/4.x/d5/d69/tutorial_py_non_local_means.html) — non-local means in code.
- [Tomasi and Manduchi: Bilateral Filtering for Gray and Color Images](https://homepages.inf.ed.ac.uk/rbf/CVonline/LOCAL_COPIES/MANDUCHI1/Bilateral_Filtering.html) — the original idea in a readable form.
:::
