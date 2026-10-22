---
title: Gradients and Edges — Sobel, Scharr, Laplacian
level: easy
time: 40
summary: What an edge is, how the gradient measures it, Sobel and Scharr kernels, edge strength and direction, the Laplacian, and why you must blur first. This is the base for Canny, Hough, HOG and SIFT.
---

An **edge** is a place where the brightness changes quickly. It is where one object ends and another begins, or where a shadow falls. Edges carry most of the useful shape information in a picture, so finding them is one of the oldest and most important tasks.

## From "edge" to "derivative"

In school you learned that the **derivative** measures how fast something changes. For a picture, the "something" is brightness. In 1-D:

`change at x ≈ f(x+1) − f(x−1)` (the difference between the right and left neighbour).

That is exactly the kernel `[-1, 0, 1]`. In 2-D we measure the change separately in the two directions. The pair is called the **gradient**:

- **Gx**: how fast the brightness changes **left to right** (it responds to vertical edges).
- **Gy**: how fast it changes **top to bottom** (it responds to horizontal edges).

From these two numbers we get:

:::formula Edge strength and direction
\text{strength} = \sqrt{G_x^2 + G_y^2} \qquad \text{direction} = \arctan\frac{G_y}{G_x}
:::

The strength says **how sharp** the edge is. The direction says **which way the brightness increases**, and it is always at a right angle to the edge line.

## Sobel: derivative plus a little smoothing

A bare `[-1, 0, 1]` is very sensitive to noise. The **Sobel** kernel computes the derivative in one direction and **averages over three rows** in the other direction, so it is steadier:

```text
 Gx kernel         Gy kernel
-1  0  1          -1 -2 -1
-2  0  2           0  0  0
-1  0  1           1  2  1
```

```python run title="Sobel gradients" level=easy
import cv2
import numpy as np
import cvlab

gray = cvlab.image("coins")
gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)         # derivative in x
gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)         # derivative in y
mag = np.hypot(gx, gy)                                   # strength
ang = np.degrees(np.arctan2(gy, gx))                     # direction in degrees

print("gx range:", gx.min(), "to", gx.max())
print("strongest edge strength:", round(float(mag.max()), 1))
print("direction at the strongest pixel:", round(float(ang.flat[mag.argmax()]), 1), "degrees")

def to8(a):                                              # scale any array to 0..255 for display
    return cv2.normalize(a, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
cvlab.show(gray, "Photo", to8(gx), "Gx (grey = no change)", to8(gy), "Gy", to8(mag), "Strength")
```

:::warn Use a float (or 16-bit) output type
If you write `cv2.Sobel(gray, cv2.CV_8U, 1, 0)`, negative derivatives (dark-to-bright edges going the other way) are **cut to 0**, and you lose half the edges. Always ask for `cv2.CV_32F` (or `CV_16S`), and take the absolute value or magnitude afterwards.
:::

## See the gradient

```viz algo=gradient title="Gradient in x and y, strength and direction"
```

## Scharr, Prewitt and friends

- **Prewitt**: like Sobel but with equal weights `[-1 0 1]` in all three rows. Slightly more noise sensitive.
- **Scharr** (`cv2.Scharr`): a better 3×3 kernel `[-3 0 3; -10 0 10; -3 0 3]` with more accurate directions. Use it when the exact direction matters (HOG, orientation).
- **Roberts**: tiny 2×2 diagonal kernels. Old and noisy.

## The Laplacian: the second derivative

The gradient measures the **speed** of change. The **Laplacian** measures the **change of the speed**. It is one number per pixel (no direction): `∂²f/∂x² + ∂²f/∂y²`, and its 3×3 kernel is `[0 1 0; 1 -4 1; 0 1 0]`.

At an edge the first derivative has a peak. The second derivative goes from positive to negative there: it crosses zero. So **zero crossings of the Laplacian mark edges**. The Laplacian is very sensitive to noise (taking two derivatives doubles the damage), so it is used after blurring: **Laplacian of Gaussian (LoG)**. LoG is also a **blob detector**: it responds strongly to spots of a certain size, which leads to SIFT.

```python run title="Laplacian and Laplacian of Gaussian" level=intermediate
import cv2
import numpy as np
import cvlab

gray = cvlab.image("camera")
lap = cv2.Laplacian(gray, cv2.CV_32F, ksize=3)
log = cv2.Laplacian(cv2.GaussianBlur(gray, (0, 0), 2), cv2.CV_32F, ksize=3)
print("Laplacian std (plain):", round(float(lap.std()), 2), "  after blur:", round(float(log.std()), 2))

def show(a):
    return np.clip(a * 4 + 128, 0, 255).astype(np.uint8)
cvlab.show(show(lap), "Laplacian (noisy)", show(log * 4), "Laplacian of Gaussian")
```

## Why blur first

Differences amplify noise. A single noisy pixel looks like a strong edge. The standard recipe is therefore:

**blur (small Gaussian) → gradient → threshold**

We will see in the next lesson that Canny does this with extra care. Try the experiment: threshold the Sobel strength with and without blurring a noisy image.

```python run title="Noise makes fake edges" level=easy
import cv2
import numpy as np
import cvlab

clean = cvlab.image("camera")
noisy = cvlab.noisy(clean, sigma=15)

def edge_map(g, blur):
    if blur:
        g = cv2.GaussianBlur(g, (0, 0), 1.5)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1)
    return (np.hypot(gx, gy) > 120).astype(np.uint8) * 255

a, b = edge_map(noisy, False), edge_map(noisy, True)
print("edge pixels without blur:", int((a > 0).sum()), "  with blur:", int((b > 0).sum()))
cvlab.show(noisy, "Noisy", a, "Edges without blur: speckles", b, "Edges with blur: cleaner")
```

## Edge direction is a feature

The direction map is not only for drawing. HOG (a classic person detector) and SIFT both build their descriptions from **histograms of gradient directions**. Remember this: *gradient strength and direction are the raw material of classical vision.*

:::interview Questions you may get
- "What is an image gradient?" A vector at each pixel: how fast and in which direction brightness changes. Strength = √(Gx² + Gy²).
- "Why does Sobel smooth?" It averages three rows (columns) while differentiating, which reduces noise.
- "Why use CV_32F in `cv2.Sobel`?" 8-bit output cannot store negative values.
- "First derivative or second derivative for edges?" The first-derivative peak or the second-derivative zero crossing. Second derivatives are more noise sensitive.
- "What does the Laplacian of Gaussian detect?" Edges (zero crossings) and blobs.
:::

```quiz
? A strong vertical edge (dark left, bright right) gives a large value in...
+ Gx
- Gy
- Neither
> Gx measures change from left to right.

? Why is the output depth CV_32F recommended for Sobel?
- It is faster
+ Negative gradients must be stored; 8-bit would clip them to zero
- OpenCV forces it
> You lose half the edges with an unsigned 8-bit output.

? What is the Laplacian?
- The first derivative in x
+ The sum of the second derivatives in x and y, with one value per pixel and no direction
- A colour space
> Edges appear as zero crossings.

? What should you do before taking gradients of a noisy picture?
- Sharpen it
+ Blur it a little with a Gaussian
- Equalise it
> Derivatives amplify noise.
```

:::problem Explain how you would compute, for every pixel, the edge strength and edge orientation, and what you would use the orientation for. {level=easy tags="edges,gradients,hog"}
Use Sobel in your answer.

:::solution Model answer
Convert to grey (or take each channel), blur slightly, compute `gx` and `gy` with Sobel (or Scharr) as float, then `magnitude = hypot(gx, gy)` and `orientation = arctan2(gy, gx)`. The orientation is perpendicular to the edge line. Uses: non-maximum suppression in Canny (thin the edge along the gradient direction), voting in the Hough transform, and the gradient-orientation histograms in HOG and SIFT descriptors.
:::
:::

:::keypoints
- An edge is a fast change in brightness. The gradient (Gx, Gy) measures it: strength √(Gx²+Gy²), direction arctan(Gy/Gx).
- Sobel differentiates and smooths. Scharr is more accurate. Use float output.
- The Laplacian (second derivative) gives edges as zero crossings and detects blobs when used after a Gaussian (LoG).
- Blur before differentiating, because derivatives amplify noise.
- Gradient strength and direction feed Canny, Hough, HOG and SIFT.
:::

:::resources
- [OpenCV: Sobel derivatives](https://docs.opencv.org/4.x/d2/d2c/tutorial_sobel_derivatives.html) — the official tutorial.
- [OpenCV: Laplace operator](https://docs.opencv.org/4.x/d5/db5/tutorial_laplace_operator.html) — Laplacian and LoG.
- [Marr and Hildreth: Theory of edge detection](https://royalsocietypublishing.org/doi/10.1098/rspb.1980.0020) — the classic paper on LoG zero crossings.
:::
