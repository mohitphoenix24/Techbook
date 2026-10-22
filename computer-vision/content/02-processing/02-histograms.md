---
title: Histograms, Equalisation and CLAHE
level: easy
time: 30
summary: A histogram counts how many pixels have each brightness. Learn to read one, spot a dark or washed-out picture, fix it with histogram equalisation and CLAHE, and understand why equalisation can hurt.
---

A **histogram** answers one question: *how many pixels have each brightness?* It forgets where the pixels are. It only counts them. Even so, it tells you a lot about a picture in one glance.

## Read a histogram

Draw brightness 0 (black) on the left and 255 (white) on the right. The height of a bar is the number of pixels with that brightness.

| Histogram shape | The picture is |
|---|---|
| Piled up on the left | too dark (under-exposed) |
| Piled up on the right | too bright (over-exposed) |
| A narrow hill in the middle | flat, low contrast |
| Two hills | two kinds of area, for example dark text on a light page |
| Big spikes at 0 and 255 | clipped: detail was lost |

```python run title="Plot a histogram" level=easy
import cv2
import numpy as np
import matplotlib.pyplot as plt
import cvlab

img = cvlab.image("moon")
hist = cv2.calcHist([img], [0], None, [256], [0, 256]).ravel()       # 256 counts
print("total pixels:", int(hist.sum()), "= rows x cols =", img.size)
print("most common brightness:", int(hist.argmax()))

fig, ax = plt.subplots(1, 2, figsize=(9, 3))
ax[0].imshow(img, cmap="gray", vmin=0, vmax=255); ax[0].set_title("Photo"); ax[0].axis("off")
ax[1].bar(range(256), hist, width=1.0, color="steelblue"); ax[1].set_title("Histogram"); ax[1].set_xlabel("brightness 0..255"); ax[1].set_ylabel("pixels")
plt.tight_layout()
```

For colour images, draw one histogram per channel. If the three humps do not line up, the picture has a colour cast (a tint).

## Equalisation: spread the values out

Most of the moon's pixels are in a narrow band of dark greys. **Histogram equalisation** moves the values around so that, afterwards, every brightness level is used about equally. The brightness range is stretched where there are many pixels, and squeezed where there are few.

How? Use the **cumulative histogram** (the running total). It rises steeply where many pixels live. Using it as the lookup table spreads those pixels over the whole range.

:::formula Equalisation mapping
v' = 255 \cdot \frac{\text{CDF}(v) - \text{CDF}_{\min}}{N - \text{CDF}_{\min}}
:::

Here CDF(v) is the number of pixels with brightness up to v, and N is the total number of pixels. You can write it in four lines.

```python run title="Equalisation from scratch" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("moon")
hist = np.bincount(img.ravel(), minlength=256)
cdf = hist.cumsum()
cdf_min = cdf[cdf > 0].min()
lut = np.round((cdf - cdf_min) / (img.size - cdf_min) * 255).astype(np.uint8)
mine = lut[img]

theirs = cv2.equalizeHist(img)
print("same as cv2.equalizeHist:", bool((mine == theirs).all()))
print("before: std", img.std().round(1), "  after: std", mine.std().round(1))
cvlab.show(img, "Before", mine, "After equalisation")
```

## Try it

```viz algo=histeq title="Equalise and CLAHE, with histograms"
```

## The problem with equalising the whole picture

Global equalisation uses **one** curve for the whole picture. Two problems:

1. It boosts **noise** in flat dark areas, because it stretches a few grey levels over a huge range.
2. A picture with both very dark and very bright areas (like a face lit from one side) gets a poor compromise.

## CLAHE: equalise in small tiles, with a limit

**CLAHE** stands for **C**ontrast **L**imited **A**daptive **H**istogram **E**qualisation. It does two clever things:

- **Adaptive**: it cuts the picture into tiles (for example 8 × 8) and equalises each tile separately. Local contrast improves.
- **Contrast limited**: before computing the table, it **clips** tall histogram bars and spreads the extra evenly. No grey level can be boosted too much, so noise stays under control.

Tiles are then blended smoothly so you do not see tile borders.

```python run title="Global equalisation versus CLAHE" level=easy
import cv2
import cvlab

img = cvlab.image("camera")
eq = cv2.equalizeHist(img)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
cl = clahe.apply(img)
cvlab.show(img, "Original", eq, "equalizeHist (global)", cl, "CLAHE")
```

CLAHE is a very common first step for medical images, microscope pictures, and pictures from cameras in poor light.

## Colour images: equalise brightness only

If you equalise R, G and B separately, the colours shift. Instead, convert to a space with a separate brightness channel (Lab, YCrCb or HSV), equalise that channel, and convert back.

```python run title="CLAHE on colour, the safe way" level=easy
import cv2
import cvlab

img = cvlab.image("coffee")
lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)
l, a, b = cv2.split(lab)
l2 = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(l)
out = cv2.cvtColor(cv2.merge([l2, a, b]), cv2.COLOR_LAB2RGB)

naive = cv2.merge([cv2.equalizeHist(img[..., i]) for i in range(3)])          # per channel: colours shift
cvlab.show(img, "Original", naive, "Per-channel (colours shift)", out, "CLAHE on L only")
```

## Histogram matching and comparison (short note)

- **Histogram matching** changes one picture so its histogram looks like another's. Used to make two photos look alike.
- **Comparing histograms** (`cv2.compareHist`) is a quick, crude way to say "are these two pictures similar?". Before deep learning it powered simple image search, using colour histograms as features.

:::interview Questions you may get
- "What does a histogram tell you, and what does it not tell you?" It tells how many pixels have each brightness. It says nothing about where they are, so very different pictures can share a histogram.
- "How does histogram equalisation work?" Use the cumulative histogram as a lookup table.
- "Why CLAHE?" Global equalisation amplifies noise and ignores local contrast. CLAHE works per tile and clips the histogram.
- "How do you equalise a colour image?" Convert to Lab/YCrCb/HSV, process the lightness channel only, convert back.
:::

```quiz
? A histogram with a big pile on the far left means the picture is...
+ too dark
- too bright
- very colourful
> Left means low brightness values.

? What is the lookup table used in histogram equalisation?
- A Gaussian curve
+ The cumulative histogram (CDF), scaled to 0..255
- The gradient of the image
> Pixels crowded in a range get spread out because the CDF rises fast there.

? What does the "clip limit" in CLAHE do?
- Cuts the picture into tiles
+ Caps how tall a histogram bar can be, which limits how much noise is amplified
- Chooses the colour space
> The clipped excess is spread evenly over all levels.

? Why not equalise R, G and B channels separately?
+ It changes the balance between channels and shifts the colours
- It is too slow
- OpenCV does not allow it
> Equalise only the lightness channel (L in Lab, Y in YCrCb).
```

:::problem Two very different pictures have the same histogram. How is that possible, and what does it mean for using histograms as features? {level=easy tags="histogram,features"}
Think about what a histogram throws away.

:::solution Model answer
A histogram counts brightness values and discards position. Shuffle the pixels of a picture randomly and you get noise with the identical histogram. So a histogram cannot tell a face from noise that has the same pixel counts. As features, histograms are weak: they are good for simple jobs (is this scene mostly dark? same colour palette?), but not for recognising shapes. Later methods keep spatial information (HOG, SIFT, CNNs).
:::
:::

:::keypoints
- A histogram counts pixels per brightness. Read it to see under-exposure, low contrast and clipping.
- Equalisation uses the cumulative histogram as a lookup table, spreading values over 0..255.
- It can amplify noise. CLAHE equalises per tile with a clip limit.
- For colour, process only the lightness channel.
- Histograms ignore position, so they are weak features.
:::

:::resources
- [OpenCV: histogram equalisation](https://docs.opencv.org/4.x/d5/daf/tutorial_py_histogram_equalization.html) — global and CLAHE with pictures.
- [OpenCV: calcHist and histogram basics](https://docs.opencv.org/4.x/d1/db7/tutorial_py_histogram_begins.html) — how to plot histograms.
- [Zuiderveld, Contrast Limited Adaptive Histogram Equalization (Graphics Gems IV)](https://en.wikipedia.org/wiki/Adaptive_histogram_equalization#Contrast_Limited_AHE) — the idea behind CLAHE.
:::
