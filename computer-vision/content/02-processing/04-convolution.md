---
title: Convolution — The Core Idea of Filtering
level: easy
time: 40
summary: Slide a small table of weights over the image and add things up. Understand kernels, borders, correlation versus convolution, output size, build conv2d from scratch, and see why this is exactly what a CNN layer does.
---

If you remember only one idea from classical image processing, remember this one. **Convolution** is how we blur, sharpen, find edges, and (later) how neural networks see. It is not hard. It is a "sliding weighted sum".

## The idea in one dimension

Take a row of numbers. Make a small list of weights, called the **kernel**, for example `[1, 1, 1]` divided by 3. To get the new value at a position:

1. Put the kernel centred on that position.
2. Multiply each number under the kernel by its weight.
3. Add everything. That is the new value.
4. Slide one step right. Repeat.

```python run title="A moving average is a convolution" level=easy
import numpy as np

signal = np.array([10, 10, 10, 50, 10, 10, 10], float)      # a flat line with one spike
kernel = np.array([1, 1, 1]) / 3                             # average of three neighbours

out = []
for i in range(1, len(signal) - 1):                          # skip the ends for now
    window = signal[i - 1:i + 2]
    out.append((window * kernel).sum())
print("input :", signal)
print("output:", np.round(out, 1))
print("np.convolve agrees:", np.round(np.convolve(signal, kernel, mode="valid"), 1))
```

The spike of 50 was spread out and lowered. That is a **blur**. Change the kernel to `[-1, 0, 1]` and the output measures the **change** between neighbours, an **edge detector**.

## The idea in two dimensions

For images the kernel is a small square table, usually 3 × 3, 5 × 5 or 7 × 7. For each pixel we multiply the neighbourhood by the table and add it all up.

:::formula 2-D convolution (as OpenCV computes it)
g(x, y) = \sum_{i=-a}^{a} \sum_{j=-b}^{b} k(i, j)\, f(x + i,\; y + j)
:::

Play with it. Choose a kernel, edit the numbers, and move over the left picture to see the multiplication for one pixel.

```viz algo=convolve title="Slide a kernel over a photo"
```

## What common kernels do

| Kernel | What it does | Rule to remember |
|---|---|---|
| `[0 0 0; 0 1 0; 0 0 0]` | Nothing (identity) | Centre 1, rest 0 |
| All `1/9` | Box blur | Weights add to **1**: brightness stays the same |
| `[1 2 1; 2 4 2; 1 2 1] / 16` | Gaussian blur | Centre counts most |
| `[-1 0 1; -2 0 2; -1 0 1]` | Sobel: vertical edges | Weights add to **0**: flat areas become 0 |
| `[0 -1 0; -1 5 -1; 0 -1 0]` | Sharpen | Adds to 1: identity plus edges |
| `[0 0 0; 0 0 1; 0 0 0]` | Shift the picture | Reads a neighbour |

Two useful rules: if the weights **add up to 1**, the overall brightness is kept. If they **add up to 0**, flat areas turn black and only the changes remain.

## Correlation or convolution?

Strictly, true convolution **flips** the kernel (left–right and up–down) before sliding. What we described, sliding without flipping, is called **cross-correlation**. OpenCV's `filter2D` and deep-learning libraries do the **no-flip** version and still call it convolution. For symmetric kernels (blur) it makes no difference. For an edge kernel it flips the sign. In an interview, say: "deep learning 'convolution' is really cross-correlation; the flip does not matter because the kernel is learned."

## Borders: what is outside the picture?

At the edge of the picture the window sticks out. We must invent values. Options:

| Border mode | What it does | OpenCV flag |
|---|---|---|
| Zero padding | Outside is 0 (black) | `BORDER_CONSTANT` |
| Replicate | Repeat the edge pixel | `BORDER_REPLICATE` |
| Reflect | Mirror the picture | `BORDER_REFLECT_101` (default) |
| Wrap | Continue from the other side | `BORDER_WRAP` |

Zero padding makes a dark frame around blurred pictures. Reflect avoids it. CNNs almost always use zero padding.

## Output size

With a `k × k` kernel and **no padding** ("valid"), the output is smaller: `(H − k + 1) × (W − k + 1)`. With **padding** `(k−1)/2` on each side ("same") the output has the same size as the input. These formulas come back with CNNs.

## Write conv2d yourself

```python run title="conv2d from scratch, checked against OpenCV" level=intermediate
import cv2
import numpy as np
import cvlab

def conv2d(img, kernel):
    """'same' output, reflect border, no kernel flip (like cv2.filter2D)."""
    kh, kw = kernel.shape
    ph, pw = kh // 2, kw // 2
    padded = np.pad(img.astype(np.float32), ((ph, ph), (pw, pw)), mode="reflect")
    out = np.zeros(img.shape, np.float32)
    for y in range(img.shape[0]):
        for x in range(img.shape[1]):
            out[y, x] = (padded[y:y + kh, x:x + kw] * kernel).sum()
    return out

img = cvlab.image("camera", size=(120, 120), gray=True)
sobel_x = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], np.float32)

mine = conv2d(img, sobel_x)
cv = cv2.filter2D(img.astype(np.float32), -1, sobel_x, borderType=cv2.BORDER_REFLECT_101)
print("largest difference to OpenCV:", float(np.abs(mine - cv).max()))
cvlab.show(img, "Input", np.abs(mine), "|Sobel x| from scratch")
```

The two nested loops are slow in Python. NumPy can do the same with no Python loops, by making a "view" of all the windows at once:

```python run title="conv2d without loops" level=intermediate
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
import cvlab

img = cvlab.image("camera", size=(120, 120), gray=True).astype(np.float32)
k = np.ones((5, 5), np.float32) / 25                         # box blur

padded = np.pad(img, 2, mode="reflect")
windows = sliding_window_view(padded, (5, 5))                # shape (120, 120, 5, 5): every 5x5 window
out = (windows * k).sum(axis=(2, 3))                         # one weighted sum per window
print("windows shape:", windows.shape, " output shape:", out.shape)
```

Cost to remember: a `k × k` kernel on an `H × W` picture needs about `H·W·k²` multiply-adds. Double the kernel width and the cost is four times higher. (A later lesson shows how to cut this.)

## Why this matters for deep learning

A convolutional layer in a neural network is **exactly this**: small kernels slid over the image. The only difference is that nobody writes the numbers. The network **learns** them from data. The first layer of a trained CNN has learned kernels that look like edge and colour detectors. That is the bridge between classical and modern vision, and we will cross it in the CNN module.

:::interview Questions you may get
- "What is convolution?" A sliding weighted sum. Each output pixel is the sum of the neighbourhood multiplied by the kernel weights.
- "Convolution versus correlation?" Convolution flips the kernel; deep learning layers do not (cross-correlation). Same for symmetric kernels.
- "What happens at the borders?" You must choose padding: zero, replicate, reflect.
- "How many operations for a 3×3 filter on a 1080p image?" About 1920 × 1080 × 9 ≈ 18.7 million multiply-adds per channel.
- "Why must a blur kernel add to 1?" So that brightness does not change.
:::

```quiz
? A 3x3 kernel has weights that add up to 0. What do flat areas become?
- White
+ Black (zero)
- They stay the same
> The response is zero when all pixels under the kernel are equal.

? Which is true about deep-learning "convolution"?
- It flips the kernel before sliding
+ It slides the kernel without flipping (cross-correlation)
- It uses only 1 x 1 kernels
> The kernel is learned, so a flip would not matter.

? A 5x5 kernel is applied with no padding to a 100x100 image. What is the output size?
- 100 x 100
+ 96 x 96
- 95 x 95
> (100 - 5 + 1) = 96.

? What does zero padding do to a blurred photo?
+ Creates a dark border, because black is mixed in at the edges
- Nothing
- Makes it sharper
> Reflect or replicate borders avoid this.
```

:::problem Compute by hand: the image row is [10, 20, 30, 40, 50], the kernel is [-1, 0, 1]. What is the output at the middle, and what does it measure? {level=easy tags="convolution,basics"}
Use the sliding weighted sum, without flipping.

:::solution Model answer
At the middle (30) the window is [20, 30, 40]. The sum is (−1)(20) + 0(30) + (1)(40) = 20. It measures the **change** from left to right (the slope). The row is a smooth ramp, so the slope is the same everywhere: 20. On a flat row it would be 0. This is a derivative filter, the basis of edge detection.
:::
:::

:::keypoints
- Convolution is a sliding weighted sum: multiply the neighbourhood by a kernel and add.
- Weights adding to 1 keep brightness. Weights adding to 0 keep only the changes.
- Deep learning "convolution" is cross-correlation (no flip). Borders need a padding choice.
- Output size is `H − k + 1` (valid) or `H` (same). Cost is about `H·W·k²`.
- A CNN layer is convolution with learned kernels.
:::

:::resources
- [OpenCV: making your own linear filters (filter2D)](https://docs.opencv.org/4.x/d4/dbd/tutorial_filter_2d.html) — the official tutorial.
- [Setosa: Image Kernels explained visually](https://setosa.io/ev/image-kernels/) — an interactive page with the same idea.
- [3Blue1Brown: But what is a convolution?](https://www.youtube.com/watch?v=KuXjwB4LzSA) — a very clear video.
:::
