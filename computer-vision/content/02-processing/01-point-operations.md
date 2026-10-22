---
title: Brightness, Contrast and Lookup Tables
level: easy
time: 30
summary: The simplest image operations change each pixel on its own. Brightness, contrast, gamma, negatives, normalisation, blending two pictures, and the lookup table trick that makes them all fast.
---

The easiest way to change a picture is to change **each pixel by itself**, with no help from its neighbours. These are called **point operations**. A pixel with value `v` becomes `f(v)`, where `f` is some function. That is all.

:::analogy
Imagine a volume knob for every pixel. Brightness is "turn everything up by the same amount". Contrast is "make the quiet sounds quieter and the loud sounds louder". Gamma is "turn up the quiet sounds more than the loud sounds". Same knob, different curves.
:::

## Brightness and contrast: `g = α·f + β`

Two numbers control a straight line:

- **β (beta)** shifts everything up or down. This is **brightness**.
- **α (alpha)** stretches the range around the middle. This is **contrast**. α > 1 increases contrast, α < 1 reduces it.

OpenCV has a function for this which also **clips** to 0..255 safely: `cv2.convertScaleAbs(img, alpha=α, beta=β)`.

```python run title="Brightness and contrast" level=easy
import cv2
import cvlab

img = cvlab.image("camera")

brighter   = cv2.convertScaleAbs(img, alpha=1.0, beta=60)      # add 60
more_contr = cv2.convertScaleAbs(img, alpha=1.8, beta=-60)     # stretch, then shift back
less_contr = cv2.convertScaleAbs(img, alpha=0.5, beta=60)

for name, im in [("original", img), ("brighter", brighter), ("more contrast", more_contr), ("less contrast", less_contr)]:
    print(f"{name:14} min {im.min():3d}  max {im.max():3d}  mean {im.mean():6.1f}  std {im.std():5.1f}")
cvlab.show(img, "Original", brighter, "+60 brightness", more_contr, "x1.8 contrast", less_contr, "x0.5 contrast")
```

The **standard deviation** (`std`) is a good number for contrast: a flat grey picture has `std` near 0, a picture with deep blacks and bright whites has a large `std`.

## Gamma: brighten the dark parts only

A straight line treats dark and bright pixels the same. A **gamma curve** `g = 255·(f/255)^γ` does not.

- γ < 1 lifts the dark and middle tones (the picture looks brighter, but highlights are compressed).
- γ > 1 darkens the middle tones.

```viz algo=gamma title="Gamma, gain and offset on a photo"
```

## Lookup tables (LUT): one trick for every point operation

A pixel is a number from 0 to 255. So **any** point operation has only 256 possible inputs. Instead of calculating the formula for millions of pixels, we calculate it **once for each of the 256 values**, store the answers in a table, and look each pixel up. That table is a **lookup table** (LUT).

```python run title="Gamma with a lookup table" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("moon")                               # a dark photo

gamma = 0.5
lut = np.array([255 * (v / 255) ** gamma for v in range(256)]).astype(np.uint8)   # 256 numbers
print("lut[0], lut[64], lut[128], lut[255] =", lut[0], lut[64], lut[128], lut[255])

bright = cv2.LUT(img, lut)                              # or simply: lut[img]
same = lut[img]                                         # NumPy fancy indexing does the same
print("cv2.LUT and lut[img] agree:", bool((bright == same).all()))
cvlab.show(img, "Original", bright, "Gamma 0.5 via LUT")
```

This is how camera apps apply filters in real time, and how **colour grading** works: a LUT per channel (or a 3-D LUT) maps input colours to output colours.

## Negative, threshold and posterise

Other point operations are just different tables:

| Operation | Table / formula | Result |
|---|---|---|
| Negative | `255 - v` | Black and white swap (X-ray look) |
| Threshold | `255 if v > t else 0` | A black-and-white picture |
| Posterise | `(v // 64) * 64` | Only 4 levels: poster look |
| Solarise | `v if v < 128 else 255 - v` | Partly inverted |

```python run title="Different tables, different looks" level=easy
import numpy as np
import cvlab

img = cvlab.image("astronaut")
v = np.arange(256)
negative = (255 - v).astype(np.uint8)[img]
poster   = ((v // 64) * 64).astype(np.uint8)[img]
solar    = np.where(v < 128, v, 255 - v).astype(np.uint8)[img]
cvlab.show(img, "Original", negative, "Negative", poster, "Posterised (4 levels)", solar, "Solarised")
```

## Normalise: use the whole range

If a picture only uses brightness values from 80 to 160, it looks flat. **Min-max normalisation** stretches that range to 0..255. It is the first thing to try on a washed-out image, and a common step before showing float data.

```python run title="Stretch a dull picture" level=easy
import cv2
import numpy as np
import cvlab

img = cvlab.image("camera")
dull = (80 + 0.35 * img).astype(np.uint8)               # squeeze all values into about 80..169
fixed = cv2.normalize(dull, None, 0, 255, cv2.NORM_MINMAX)
print("dull  range:", dull.min(), "to", dull.max())
print("fixed range:", fixed.min(), "to", fixed.max())
cvlab.show(dull, "Dull", fixed, "Normalised to 0..255")
```

A weakness: one very bright or dark pixel (a hot pixel, a reflection) ruins the range. A safer version uses **percentiles**: map the 1st percentile to 0 and the 99th to 255.

## Blending two pictures: `addWeighted`

`dst = α·img1 + β·img2 + γ`. With α + β = 1 you get a cross-fade. This is how you draw semi-transparent masks and overlays on a photo.

```python run title="Cross-fade and overlay" level=easy
import cv2
import cvlab

a = cvlab.image("astronaut", size=(320, 320))
b = cvlab.image("cat", size=(320, 320))
mix = cv2.addWeighted(a, 0.6, b, 0.4, 0)
cvlab.show(a, "A", b, "B", mix, "0.6 A + 0.4 B")
```

## What point operations cannot do

A point operation only knows one pixel. It cannot blur, find edges or remove noise, because those need the **neighbours**. For that we need **filters**, which start in the lesson on convolution. But first, we look at one more point-based tool: the histogram.

:::interview Questions you may get
- "How do you increase contrast in an image?" Multiply by α > 1 around the mean (and clip), or equalise the histogram, or use CLAHE.
- "What is a lookup table and why is it fast?" A table of the 256 possible outputs. Cost per pixel is one memory read, however complex the formula.
- "Your image looks washed out. What do you try first?" Check the histogram. Normalise (maybe with percentiles), then gamma, then CLAHE.
:::

```quiz
? Which operation brightens dark areas more than bright areas?
- Adding a constant
+ Gamma correction with γ < 1
- Multiplying by 1.0
> A gamma curve with γ < 1 is steep near zero, so dark values rise a lot.

? Why use a lookup table?
- It blurs the picture
+ A uint8 pixel has only 256 possible values, so we compute the formula 256 times, not millions of times
- It works on colour only
> This is why LUTs are the standard way to apply point operations fast.

? An image only has pixel values between 100 and 150. What does min-max normalisation do?
+ Maps 100 to 0 and 150 to 255, stretching the contrast
- Makes the image darker
- Removes noise
> Be careful with outliers: percentiles are safer.

? Can a point operation sharpen an image?
- Yes, with a steep curve
+ No, sharpening needs information from neighbouring pixels
- Yes, with gamma
> Point operations change values, not spatial detail.
```

:::problem Write a function that stretches contrast using the 1st and 99th percentiles. Why is that better than min-max? {level=easy tags="contrast,numpy,point-ops"}
Think about outliers.

:::solution Model answer
```python
import numpy as np
def stretch(img, lo=1, hi=99):
    a, b = np.percentile(img, [lo, hi])
    out = (img.astype(np.float32) - a) / max(b - a, 1e-6)
    return np.clip(out * 255, 0, 255).astype(np.uint8)
```
Min-max uses the single darkest and brightest pixel, so one hot pixel or reflection compresses everything else. Percentiles ignore the extreme 1% on each side, so the bulk of the picture is stretched. Clipping then saturates only those few pixels.
:::
:::

:::keypoints
- A point operation changes each pixel alone: `g = f(v)`. Brightness is `+β`, contrast is `×α`, gamma is a power curve.
- `cv2.convertScaleAbs`, `cv2.normalize` and `cv2.addWeighted` clip safely.
- A LUT stores the 256 answers once. `cv2.LUT(img, lut)` applies them quickly.
- Normalise with percentiles to ignore outliers.
- Point operations cannot blur or find edges. That needs neighbours (filters).
:::

:::resources
- [OpenCV: changing the contrast and brightness of an image](https://docs.opencv.org/4.x/d3/dc1/tutorial_basic_linear_transform.html) — the α and β tutorial with gamma.
- [OpenCV: cv2.LUT](https://docs.opencv.org/4.x/d2/de8/group__core__array.html) — the function reference.
:::
