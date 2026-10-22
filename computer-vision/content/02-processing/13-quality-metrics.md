---
title: Measuring Image Quality — PSNR, SSIM, Sharpness
level: easy
time: 30
summary: How to put a number on "how good is this picture?". MSE and PSNR, why they can mislead, SSIM, a sharpness (focus) measure with the variance of the Laplacian, and how to find the sharpest frame in a set.
---

"This looks better" is not a measurement. In research, in camera tuning and in production monitoring we need numbers. This lesson covers the common ones and their limits.

## MSE and PSNR: the simple pair

**Mean squared error (MSE)** averages the squared difference between two pictures. **PSNR** turns it into decibels:

:::formula PSNR
\text{PSNR} = 10 \log_{10}\!\left(\frac{255^2}{\text{MSE}}\right)
:::

Higher is better. Rough meaning for 8-bit pictures: above 40 dB is very close, 30–40 dB is good, below 25 dB shows clear damage. PSNR needs a **reference** (the clean picture).

PSNR is easy, but it treats every pixel difference equally. It does not know that people care about **structure**, not about a small shift in brightness.

## SSIM: compare structure

**SSIM** (structural similarity) compares small windows of two pictures on three things: **brightness**, **contrast** and **structure** (the pattern of ups and downs). It gives a number from −1 to 1, where 1 means identical. It agrees with human opinion more often than PSNR.

```python run title="PSNR can be fooled, SSIM less so" level=intermediate
import cv2
import numpy as np
from skimage.metrics import structural_similarity, peak_signal_noise_ratio
import cvlab

ref = cvlab.image("camera")
shifted_bright = np.clip(ref.astype(int) + 20, 0, 255).astype(np.uint8)      # same picture, a bit brighter
blurred = cv2.GaussianBlur(ref, (0, 0), 2.5)                                  # structure destroyed
noisy = cvlab.noisy(ref, 20)

print(f"{'version':20} {'PSNR':>6}  {'SSIM':>6}")
for name, im in [("brighter by 20", shifted_bright), ("blurred", blurred), ("Gaussian noise", noisy)]:
    p = peak_signal_noise_ratio(ref, im, data_range=255)
    s = structural_similarity(ref, im, data_range=255)
    print(f"{name:20} {p:6.1f}  {s:6.3f}")
cvlab.show(shifted_bright, "Brighter: looks fine", blurred, "Blurred: looks bad", noisy, "Noisy")
```

Look at the numbers: the plain brightness shift gets a middling PSNR but **very high** SSIM (the structure is intact and it looks fine to a human), and the blurred picture can get a PSNR similar to the shifted one. The numbers disagree because they measure different things.

Newer metrics follow human judgement even better: **LPIPS** and **DISTS** compare deep-network features. For generated images, **FID** compares whole sets of images (generative lessons later). Use **several metrics** and **look at the pictures**.

## Sharpness: the variance of the Laplacian

Often you have **no reference**. You just want to know: *is this picture in focus?* A sharp picture has strong edges and a lot of fast change. The Laplacian responds to fast change. So the **variance of the Laplacian** is a quick sharpness score: **high = sharp, low = blurry.**

```python run title="Sharpness score with the Laplacian" level=easy
import cv2
import numpy as np
import cvlab

def sharpness(gray):
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())

img = cvlab.image("camera")
rows = []
for sigma in (0, 1, 2, 4, 8):
    out = img if sigma == 0 else cv2.GaussianBlur(img, (0, 0), sigma)
    rows.append((sigma, sharpness(out)))
    print(f"blur σ={sigma}: sharpness {rows[-1][1]:9.1f}")
cvlab.show(img, "σ = 0", cv2.GaussianBlur(img, (0, 0), 2), "σ = 2", cv2.GaussianBlur(img, (0, 0), 8), "σ = 8")
```

The score falls quickly as blur grows. To use it:

- **Pick the best frame** from a burst or a video (take the highest score).
- **Autofocus**: move the lens to maximise it.
- **Reject bad images** in a pipeline (set a threshold that you calibrate on your own camera and scene).

```python run title="Pick the sharpest frame from a burst" level=easy
import cv2
import numpy as np
import cvlab

base = cvlab.image("coffee", gray=True)
truth = [2.0, 0.5, 1.0, 3.5, 0.0, 1.5]                      # the true blur (σ) of six frames from a "burst"
frames = [base if s == 0 else cv2.GaussianBlur(base, (0, 0), s) for s in truth]
scores = [cv2.Laplacian(f, cv2.CV_64F).var() for f in frames]
best = int(np.argmax(scores))
print("true blur of each frame:", truth)
print("sharpness scores       :", [round(s) for s in scores])
print("chosen frame:", best, "with true blur", truth[best], "(lowest blur is the sharpest)")
```

:::warn The score depends on the scene
Variance of the Laplacian also depends on **what is in the picture**. A plain wall always scores low, even if perfectly focused. A brick wall always scores high. Compare **frames of the same scene**, or calibrate a threshold per setup. Noise raises the score too, so denoise lightly first.
:::

## Other quick statistics

| Question | Measurement |
|---|---|
| Too dark / too bright? | Mean brightness, share of pixels near 0 or 255 |
| Low contrast? | Standard deviation, or 5th–95th percentile range |
| Over-exposed? | Percentage of saturated pixels (255) |
| Noisy? | Standard deviation in a flat patch; median-based noise estimates |
| Colour cast? | Mean of each channel (should be close for neutral scenes) |
| Blurred or sharp? | Variance of the Laplacian, or the high-frequency share of the FFT |

These checks are cheap and useful as **input monitoring**: a robot camera that is dirty, out of focus or lit wrongly can be caught before the model fails.

:::interview Questions you may get
- "What does PSNR measure and what is wrong with it?" Pixel-wise error in dB. It ignores structure and human perception.
- "What does SSIM compare?" Local brightness, contrast and structure.
- "How would you detect blurry images automatically?" Variance of the Laplacian (or an FFT high-frequency ratio), with a threshold calibrated on your data.
- "Name metrics beyond PSNR/SSIM for generated or enhanced images." LPIPS, DISTS, FID (sets), human ratings.
:::

```quiz
? What does a low variance of the Laplacian suggest?
+ The picture is blurry (few strong edges)
- The picture is too bright
- The picture is colourful
> Sharp pictures have many strong second derivatives.

? Which statement about PSNR is true?
- It measures structure
+ It treats every pixel error equally and can disagree with human opinion
- It needs no reference
> SSIM and learned metrics track perception better.

? A plain white wall gets a low sharpness score even when in focus. Why?
+ The score depends on the scene content; there are few edges to measure
- The camera is broken
- The Laplacian does not work on walls
> Compare frames of the same scene.

? You need to judge generated images without a pixel-wise reference. Which is suitable?
- PSNR
+ FID or a human study
- Variance of Laplacian
> FID compares distributions of features of real and generated sets.
```

:::problem Your inspection camera slowly gets dirty. How do you detect it automatically before defect detection fails? {level=medium tags="monitoring,quality"}
Think about cheap statistics on a fixed scene.

:::solution Model answer
Keep a reference image (or running statistics) of a fixed part of the scene, such as a clean calibration target or the empty conveyor. Track the sharpness score (variance of the Laplacian), mean brightness, contrast and local dark-blob counts over time. Raise an alert when they drift beyond calibrated limits, for example sharpness drops by 30%. Also log SSIM against a reference frame of the static background. Add hysteresis to avoid flickering alarms, and schedule cleaning. This is input monitoring, separate from model monitoring.
:::
:::

:::keypoints
- MSE and PSNR are simple pixel-wise measures. SSIM compares structure and agrees better with people.
- Learned metrics (LPIPS, DISTS) and FID are used for generated and enhanced images.
- Variance of the Laplacian is a quick no-reference sharpness score; calibrate it per scene.
- Cheap input statistics (brightness, contrast, saturation, noise, sharpness) catch camera problems early.
:::

:::resources
- [Wang et al.: Image Quality Assessment: From Error Visibility to Structural Similarity (SSIM)](https://www.cns.nyu.edu/pub/eero/wang03-reprint.pdf) — the SSIM paper.
- [Zhang et al.: The Unreasonable Effectiveness of Deep Features as a Perceptual Metric (LPIPS)](https://arxiv.org/abs/1801.03924) — learned perceptual distance.
- [PyImageSearch: Blur detection with OpenCV](https://pyimagesearch.com/2015/09/07/blur-detection-with-opencv/) — the variance-of-Laplacian recipe.
:::
