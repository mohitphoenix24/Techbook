---
title: Scale and Blobs — Finding Things at the Right Size
level: intermediate
time: 35
summary: A feature has a size. Learn why detectors must search over scale, how the Laplacian of Gaussian responds most strongly at the matching size, how Difference of Gaussians makes it fast, and how to detect blobs and read their scale.
---

A button looks small in a wide shot and big in a close-up. A feature detector must **find the same thing at both sizes**, and say how big it is. We need **scale invariance**.

## Looking at many scales

The idea: blur the picture with increasing σ to make a **scale space** (the next level hides finer detail). A fine detail is visible only at small σ. A large shape stays visible until large σ.

To find a blob of radius `r`, apply a filter that **responds most to blobs of that size**. The **Laplacian of Gaussian (LoG)** is a "Mexican hat" filter: a positive centre with a negative ring around it. It gives a strong response when a bright (or dark) disc of the right size sits in the middle.

:::analogy
Think of a set of cookie cutters of different sizes. You press each cutter on the dough. The cutter that **fits** the shape exactly gives the cleanest cut. LoG at scale σ is a cutter for blobs of radius about `σ·√2`. Try all σ and pick the one with the strongest response: that is the blob's size.
:::

Because the response gets weaker as σ grows (more blur means smaller derivatives), we **normalise** it by multiplying by `σ²` so scales can be compared fairly.

```python run title="Scale-normalised LoG finds the size of a blob" level=intermediate
import cv2
import numpy as np

def disc(radius):
    img = np.zeros((161, 161), np.float32)
    cv2.circle(img, (80, 80), radius, 1.0, -1)
    return img

for radius in (8, 16, 28):
    img = disc(radius)
    best_sigma, best = 0, 0
    for sigma in np.linspace(3, 30, 55):
        response = (sigma ** 2) * cv2.Laplacian(cv2.GaussianBlur(img, (0, 0), sigma), cv2.CV_32F)[80, 80]
        if abs(response) > best:
            best, best_sigma = abs(response), sigma
    print(f"true radius {radius:2d}  -> best sigma {best_sigma:5.1f}  -> radius estimate sigma*sqrt(2) = {best_sigma * np.sqrt(2):5.1f}")
```

The estimate follows the true radius. That is **automatic scale selection**: the scale where the normalised response peaks tells us the size.

## Difference of Gaussians (DoG): a cheap LoG

Computing the Laplacian at many scales is slow. But the **difference of two Gaussian blurs** of nearby scales, `G(kσ) − G(σ)`, is a very good approximation of the LoG (with `k ≈ 1.4–1.6`), and each blur is needed anyway for the pyramid. This is the trick that SIFT uses. We met DoG as a band-pass filter in the pyramid lesson.

## Detect blobs with scikit-image

`skimage.feature.blob_log` and `blob_dog` search scale space for local maxima (in x, y and σ at once, a 3-D search) and return `(row, col, sigma)`.

```python run title="Detect blobs and their sizes" level=intermediate
import numpy as np
import cv2
from skimage.feature import blob_log
import cvlab

gray = cvlab.image("coins").astype(np.float32) / 255
blobs = blob_log(gray, min_sigma=10, max_sigma=30, num_sigma=11, threshold=0.08, overlap=0.5)
radii = blobs[:, 2] * np.sqrt(2)
print("blobs found:", len(blobs), "  radius range:", round(float(radii.min()), 1), "to", round(float(radii.max()), 1), "pixels")
vis = cv2.cvtColor((gray * 255).astype(np.uint8), cv2.COLOR_GRAY2RGB)
for y, x, s in blobs:
    cv2.circle(vis, (int(x), int(y)), int(s * np.sqrt(2)), (255, 0, 0), 2)
cvlab.show(vis, "Each circle is a blob; its radius is sigma x sqrt(2)")
```

Many circles sit on coins, with radii that match the coin sizes. The big coin on the right is found at a larger σ than the small ones.

## From blobs to keypoints that are invariant

A good keypoint detector combines two ideas:

1. Search **space and scale** together for a local extreme of a filter response (LoG/DoG). The location `(x, y)` and size `σ` are both **covariant** with the picture: if the object doubles in size, σ doubles.
2. Describe the neighbourhood **at that scale**, so the description is the same at any zoom.

Different detectors differ in the filter used:

| Detector | Response | Note |
|---|---|---|
| **Harris-Laplace** | Harris corners, scale from LoG | Corner-like points with scale |
| **LoG / DoG (SIFT)** | Blob-like extrema | Robust, general |
| **SURF** | Hessian determinant with box filters and integral images | Faster, patented |
| **FAST + pyramid (ORB)** | FAST on each pyramid level | Very fast |
| **MSER** | Stable regions across thresholds | Good for text and wide-baseline matching |

A related idea is the **affine** version: keypoints that stay stable under viewpoint changes by fitting an ellipse (Hessian-affine, MSER). Today, learned detectors (SuperPoint, DISK) do much of this.

## Try MSER

**MSER** (Maximally Stable Extremal Regions) thresholds the picture at many levels and keeps regions whose area changes little over a range of thresholds. It finds blob-like regions of any size, and it is quick. It is good for text, signs and uniform-coloured regions.

```python run title="MSER regions" level=intermediate
import cv2
import cvlab

gray = cvlab.image("text")
mser = cv2.MSER_create(delta=5, min_area=30, max_area=800)
regions, boxes = mser.detectRegions(gray)
print("stable regions:", len(regions))
vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
for x, y, w, h in boxes:
    cv2.rectangle(vis, (x, y), (x + w, y + h), (255, 0, 0), 1)
cvlab.show(vis, "MSER boxes (letters and parts of letters)")
```

:::interview Questions you may get
- "Why do we need scale-invariant keypoints?" The same object appears at different sizes with distance or zoom; a fixed-size detector would miss it.
- "What is automatic scale selection?" Pick the scale where the normalised LoG (or DoG) response has a local maximum; that scale matches the blob size.
- "Why DoG instead of LoG?" It approximates LoG with two blurs already available from the pyramid, so it is cheap.
- "Why multiply the LoG by σ²?" Derivatives shrink with blur; the factor makes responses at different scales comparable.
:::

```quiz
? A scale-normalised LoG response peaks at σ = 10 for a blob. What is the blob's approximate radius?
- 10
+ About 14 (σ × √2)
- 5
> The LoG is best matched to a disc of radius about σ√2.

? Why does SIFT use a Difference of Gaussians?
+ It approximates the Laplacian of Gaussian cheaply, reusing the blurred pyramid
- It gives colour
- It is rotation invariant by itself
> Two nearby Gaussian blurs subtracted give a band-pass filter close to LoG.

? A keypoint's scale value should do what when the object doubles in size?
- Stay the same
+ Roughly double
- Halve
> The detector is covariant with scale: it reports the object's size.

? Which detector is a good choice for finding stable text-like regions?
- FAST
+ MSER
- Harris
> It tracks regions that stay stable across thresholds.
```

:::problem Explain how a detector can report the same physical point at two zoom levels with different pixel coordinates, and how a matcher can still match them. {level=medium tags="scale,sift,keypoints"}
Think about what the descriptor is computed from.

:::solution Model answer
The detector finds the point as an extremum in (x, y, σ) space. At 2× zoom the point is at coordinates 2× larger and its best σ is about 2× larger. The descriptor is then computed from a patch whose size is proportional to σ (and rotated to the dominant orientation), so the patch content after resampling to a fixed grid is the same in both pictures. The matcher compares only descriptors, which are the same up to noise, not the pixel coordinates or sizes. The ratio of the two σ values even gives the relative scale.
:::
:::

:::keypoints
- A feature has a size. Search scale space and pick local extrema of the scale-normalised LoG.
- LoG responds best to a blob of radius σ√2. DoG approximates it cheaply.
- `blob_log`, `blob_dog` and MSER find blobs with their size.
- Describing a patch at its own scale gives scale-invariant features. That is SIFT, next.
:::

:::resources
- [Lindeberg: Feature Detection with Automatic Scale Selection (1998)](https://doi.org/10.1023/A:1008045108935) — the theory of scale selection.
- [scikit-image: blob detection](https://scikit-image.org/docs/stable/auto_examples/features_detection/plot_blob.html) — LoG, DoG and DoH compared.
- [OpenCV: MSER](https://docs.opencv.org/4.x/d3/d28/classcv_1_1MSER.html) — the class reference.
:::
