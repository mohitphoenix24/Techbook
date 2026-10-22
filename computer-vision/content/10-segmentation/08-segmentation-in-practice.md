---
title: Refinement, Matting and Segmentation in Practice
level: advanced
time: 50
summary: Getting from a rough mask to one you can use. Post-processing (morphology, largest component, hole filling), edge refinement with the guided filter (written from scratch), alpha matting and trimaps, handling large images and class imbalance, data formats, and a deployment checklist.
---

A network's raw output is rarely the final answer. Masks are blobby, have specks and holes, and the boundary is soft. This lesson covers the steps between "the model's output" and "something a robot, a measurement or a customer can use".

## Step 1: from probabilities to a mask

The network outputs a probability map (or class scores). Convert it with:

- **Binary**: `mask = prob > threshold`. The threshold (default 0.5) is a **tunable operating point**: lower finds more (higher recall), higher is stricter. Choose it on validation data from the Dice/IoU or the cost of errors.
- **Multi-class**: `argmax` over the class channel (for multi-label problems, a threshold per class).
- **Keep the probabilities** when you can: soft maps allow later fusion, test-time augmentation averaging, and uncertainty (pixels near 0.5 are uncertain).

## Step 2: clean the mask

```python run title="Post-processing: remove specks, fill holes, keep the largest object" level=intermediate shared
import cv2
import numpy as np
import cvlab

rng = np.random.default_rng(0)
truth = np.zeros((160, 160), np.uint8)
cv2.ellipse(truth, (80, 80), (50, 38), 20, 0, 360, 1, -1)
cv2.circle(truth, (60, 75), 6, 0, -1)                                         # a real hole in the object
noisy = truth.copy()
noisy[rng.random(truth.shape) < 0.01] ^= 1                                    # salt-and-pepper errors of a weak network
noisy[10:22, 120:135] = 1                                                     # a false blob far away
noisy[75:85, 78:90] = 0                                                       # a spurious gap in the object

def clean(mask, min_area=150, keep_largest=True, fill_holes=True, open_size=3):
    m = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((open_size, open_size), np.uint8))       # remove isolated specks
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m)
    areas = stats[1:, cv2.CC_STAT_AREA]
    keep = [i + 1 for i, a in enumerate(areas) if a >= min_area]
    if keep_largest and keep:
        keep = [1 + int(np.argmax(areas))]
    out = np.isin(labels, keep).astype(np.uint8)
    if fill_holes:                                                            # fill holes by flood-filling the background from a corner
        flood = out.copy(); h, w = out.shape
        ff = np.zeros((h + 2, w + 2), np.uint8); cv2.floodFill(flood, ff, (0, 0), 1)
        out = out | (1 - flood)
    return out

iou = lambda a, b: float((a & b).sum() / ((a | b).sum() + 1e-9))
fixed = clean(noisy, fill_holes=False)
filled = clean(noisy, fill_holes=True)
print(f"IoU with the truth   raw prediction: {iou(noisy, truth):.3f}   cleaned: {iou(fixed, truth):.3f}   cleaned + holes filled: {iou(filled, truth):.3f}")
print("note: the spurious gap was a hole to fill, but the real hole (the small dark circle) was filled too; only fill holes when you know objects are solid")
cvlab.show(noisy * 255, "Raw mask", fixed * 255, "Cleaned (specks, blob removed)", filled * 255, "Holes filled too")
```

Rules: **open** removes specks; **close** joins gaps; **connected components** filter by area, or keep the largest (one object per image) or the ones overlapping a detection box; **fill holes** only if the objects are solid. Do these on the **final-resolution** mask, and check their effect with the metric: they can also hurt.

## Step 3: sharpen the boundary with a guided filter

A mask upsampled from a low-resolution prediction has a soft, blocky edge. The **guided filter** (He et al.) smooths one image **using another image as the guide**, so the result follows the **edges of the guide**: filtering a rough mask with the colour photo as the guide snaps the mask boundary to the real object edge. It is edge-preserving like the bilateral filter, but **fast (constant time per pixel)** and without gradient reversal artefacts.

For a window around each pixel it fits a **linear model** from the guide `I` to the input `p`: `q = a·I + b`, with `a = cov(I, p) / (var(I) + ε)`, `b = mean(p) − a·mean(I)`; averaging the coefficients over overlapping windows gives the output. All of it is box filters.

```python run title="Guided filter from scratch: snap a rough mask to the image edges" level=advanced shared
def box(x, r):
    return cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1), normalize=True, borderType=cv2.BORDER_REFLECT)

def guided_filter(guide, src, r=6, eps=1e-3):
    I, p = guide.astype(np.float32), src.astype(np.float32)
    mean_I, mean_p = box(I, r), box(p, r)
    cov_Ip = box(I * p, r) - mean_I * mean_p
    var_I = box(I * I, r) - mean_I ** 2
    a = cov_Ip / (var_I + eps)                                              # slope of the local linear fit  q = a I + b
    b = mean_p - a * mean_I
    return box(a, r) * I + box(b, r)                                        # average the coefficients, then apply them

photo = cvlab.image("coins", gray=True).astype(np.float32) / 255
_, hard = cv2.threshold(cv2.GaussianBlur((photo * 255).astype(np.uint8), (5, 5), 0), 0, 1, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
truth_mask = hard.astype(np.float32)
coarse = cv2.resize(cv2.resize(truth_mask, (40, 32), interpolation=cv2.INTER_AREA), (photo.shape[1], photo.shape[0]), interpolation=cv2.INTER_LINEAR)   # a rough mask: low resolution, upsampled
refined = guided_filter(photo, coarse, r=5, eps=1e-3)
score = lambda m: float(((m > 0.5) & (truth_mask > 0.5)).sum() / (((m > 0.5) | (truth_mask > 0.5)).sum() + 1e-9))
print(f"IoU with the sharp mask   coarse upsampled mask: {score(coarse):.3f}   after guided filter: {score(refined):.3f}")
cvlab.show((coarse * 255).astype(np.uint8), "Coarse mask (low-res, upsampled)", np.clip(refined * 255, 0, 255).astype(np.uint8), "Refined with the photo as the guide", (truth_mask * 255).astype(np.uint8), "Target")
```

Other refinement tools: **dense CRF** (older, slow), **CascadePSP**, **Mask Transfiner / PointRend** (learned), **"segment at higher resolution around the boundary"** and **alpha matting** for soft edges.

## Alpha matting: soft edges for hair, fur, glass

A mask is binary; real object edges are **partial**: a hair strand covers only part of a pixel. **Matting** estimates an **alpha** value from 0 to 1 per pixel such that the image is `I = α·F + (1 − α)·B` (foreground `F`, background `B`). It is needed for photo editing, video compositing and AR. Classic methods (**closed-form matting**, KNN matting) need a **trimap** (sure foreground, sure background, unknown band). Deep methods (Deep Image Matting, IndexNet, MODNet, **Matting Anything**, **RVM** for video) predict alpha from the image (and a trimap or a mask). A segmentation mask can be turned into a trimap by **eroding** it (sure foreground) and **dilating** it (the unknown band between).

```python run title="Make a trimap from a mask and composite with soft alpha" level=intermediate shared
mask_u8 = (truth_mask * 255).astype(np.uint8)
k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
sure_fg = cv2.erode(mask_u8, k); maybe = cv2.dilate(mask_u8, k)
trimap = np.where(sure_fg > 0, 255, np.where(maybe > 0, 128, 0)).astype(np.uint8)                # 255 foreground, 128 unknown, 0 background
print("trimap values:", np.unique(trimap).tolist(), "  unknown band pixels:", int((trimap == 128).sum()))

alpha = guided_filter(photo, (trimap / 255.0).astype(np.float32), r=4, eps=1e-4).clip(0, 1)     # a cheap soft alpha: the guided filter inside the unknown band
alpha = np.where(trimap == 255, 1.0, np.where(trimap == 0, 0.0, alpha))
fg = np.dstack([photo] * 3); bg = np.full_like(fg, 0.0); bg[..., 2] = 0.8                        # composite onto a blue background
comp = alpha[..., None] * fg + (1 - alpha[..., None]) * bg
cvlab.show(trimap, "Trimap", (alpha * 255).astype(np.uint8), "Soft alpha in the unknown band", (comp * 255).astype(np.uint8), "Composite: I = a F + (1 - a) B")
```

## Large images and class imbalance

- **Tile** big images (satellite, pathology) with overlap and **blend the logits** (a Hann window gives smooth seams), not the hard masks.
- **Train on crops** that favour the rare class (positive-biased sampling) while keeping random crops for the background.
- **Multi-scale and flip** test-time augmentation averages the probabilities.
- Handle **different resolutions** consistently: resize with **nearest neighbour for masks**, bilinear/area for images.

## Data formats and annotation pitfalls

- Masks as **PNG** with class ids (0 = background, 255 = ignore), same size as the image, never resampled with interpolation.
- COCO polygons / RLE for instances; check **holes** and **crowd** flags; **polygon winding** and **self-intersections** break some tools.
- **Label noise at boundaries** is normal (±1–2 pixels); do not expect IoU 1.0, estimate the **inter-annotator agreement** and compare.
- Colour palettes in "visualisation PNGs" are not class ids: do not train on RGB colour masks without a mapping.
- For thin structures, annotate at **full resolution** and keep the training crops at native scale.

## Evaluation beyond mIoU

Report: per-class IoU/Dice (not only the mean), **object-level** precision/recall (did we find each instance?), **boundary** F-score, **area/length error** for measurement tasks, and performance on **slices** (rare classes, small objects, lighting conditions). For production, also the **failure rate** (images with no mask when there should be one, or masks when there should be none).

## Deployment checklist

- **Export** (ONNX/TensorRT); check the output against PyTorch on a set of images; keep **pre- and post-processing** identical (resize, normalisation, argmax, upsampling method).
- **Latency**: segmentation outputs are large; the **upsampling to full resolution and the argmax** can dominate on small devices: do them on the GPU or at lower resolution; consider a lower output stride only where needed.
- **Memory**: high-resolution inputs use a lot of activation memory; use tiling or smaller crops.
- **Quantisation (INT8)** can hurt thin structures: validate on small objects and boundaries.
- **Confidence and uncertainty**: expose probabilities; flag low-confidence regions for human review.
- **Monitoring**: log mask area statistics and sample images; alert on drift (the mean mask area or class distribution changes).

:::interview Questions you may get
- "How would you improve a rough segmentation mask at the boundaries?" Higher resolution/decoder features, guided filter or CRF, boundary-aware loss, refinement networks, or matting for soft edges.
- "What is the guided filter?" An edge-preserving, constant-time filter that smooths an image using a guide image's edges, by fitting local linear models `q = a·I + b` with box filters.
- "What is alpha matting and when is it needed?" Estimating per-pixel opacity for soft edges (hair, glass) so that `I = αF + (1−α)B`; needed for compositing and editing.
- "What post-processing would you apply to a segmentation mask?" Threshold tuning, morphological opening/closing, remove small components, keep the largest or detection-overlapping component, fill holes (if appropriate); verify with the metric.
- "How do you segment a 10,000 × 10,000 image?" Tile with overlap, blend logits, train on balanced crops.
:::

```quiz
? A binary mask is made by thresholding probabilities at 0.5. What is a good way to choose the threshold?
+ Tune it on validation data for the metric or cost you care about
- Always use 0.5
- Use the mean pixel value
> It is an operating point.

? What does the guided filter use to preserve edges?
+ A guide image, with local linear models q = a I + b
- A larger kernel
- Random noise
> The output follows the guide's edges.

? What does alpha matting estimate?
+ A per-pixel opacity between 0 and 1, so that I = αF + (1 − α)B
- The class of every pixel
- The image depth
> It handles hair and semi-transparent edges.

? Why use nearest-neighbour interpolation when resizing a mask?
+ It never creates in-between values that are not valid labels
- It is the sharpest
- It is the slowest
> Bilinear would blend class ids.
```

:::problem A model segments solar panels in drone images. Masks are good in the middle but ragged at the edges, with a few false blobs on roofs, and the customer needs panel areas within 2%. How do you proceed? {level=medium tags="post-processing,measurement,boundaries"}
Think about measurement accuracy, not only IoU.

:::solution Model answer
Define the metric as area error per panel (and per image), not mIoU. Improve the model at the boundary: higher-resolution input or a decoder with stride-4 features, boundary-aware loss, and train/test on native-resolution tiles. Post-process: threshold tuning on area error, remove small components and components not overlapping a detected panel, keep convex/rectangular constraints (fit a rotated rectangle or polygon to each panel and use its area), and refine edges with a guided filter or edge snapping using the image. Calibrate pixels to metres with the camera altitude/GSD and use ground-truth surveyed panels to estimate bias; add a confidence flag when the mask is uncertain. Validate on held-out sites.
:::
:::

:::keypoints
- Convert probabilities with a tuned threshold (or argmax), keep soft maps when useful, then clean the mask: open/close, component filtering, optional hole filling; check the effect on the metric.
- The guided filter snaps masks to image edges in constant time using local linear models; matting (with a trimap) gives soft alpha for hair and glass.
- Tile large images with overlap and blend logits; sample crops to favour rare classes; resize masks with nearest neighbour.
- Evaluate per class, object level, boundary and measurement error; deploy with parity of pre/post-processing, latency checks on upsampling, careful INT8, and drift monitoring.
:::

:::resources
- [He et al.: Guided Image Filtering](https://doi.org/10.1109/TPAMI.2012.213) — the guided filter paper.
- [Levin et al.: A Closed-Form Solution to Natural Image Matting](https://people.csail.mit.edu/alevin/papers/Matting-Levin-Lischinski-Weiss-CVPR06.pdf) — classic matting.
- [Lin et al.: Robust High-Resolution Video Matting with Temporal Guidance (RVM)](https://arxiv.org/abs/2108.11515) — learned video matting.
:::
