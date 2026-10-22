---
title: Instance Segmentation — Mask R-CNN, YOLACT, SOLO, YOLO-seg
level: advanced
time: 50
summary: A mask for every object. Mask R-CNN's mask branch, single-stage designs (YOLACT prototypes, SOLO location-based, YOLOv8-seg), how masks are stored (polygons and COCO RLE, written from scratch), mask IoU and mask NMS, and a tested Mask R-CNN forward pass.
---

**Instance segmentation** returns, for every object, its **class, box and pixel mask**. You need it to count and measure touching cells, to pick parts that overlap in a bin, to compute areas per object, and to cut objects out. It is detection plus segmentation, so many designs extend a detector.

## Mask R-CNN (recap and details)

Mask R-CNN extends Faster R-CNN with a third head. For each **region of interest** (RoIAlign features, 14 × 14), a small FCN predicts a **28 × 28 binary mask per class**. At inference, the mask of the predicted class is selected, resized to the box, and thresholded at 0.5 to a binary mask in image coordinates.

Key design choices:

- **RoIAlign** keeps exact alignment (masks are very sensitive to the half-pixel shifts of RoIPool).
- **Decoupled mask and class prediction**: each class has its own sigmoid mask, so classes do not compete (a softmax over classes per pixel would).
- Mask loss is a **per-pixel binary cross-entropy** only for the ground-truth class.
- A **low-resolution (28×28) mask** limits boundary detail for big objects. Newer designs (PointRend, Mask Transfiner, BoundaryFormer) refine the boundaries by predicting at selected uncertain points.

Mask R-CNN is still a robust baseline (torchvision `maskrcnn_resnet50_fpn`, Detectron2), but slow for real time.

```python local check title="Mask R-CNN outputs in torchvision (shapes)"
import torch
from torchvision.models.detection import maskrcnn_resnet50_fpn

torch.manual_seed(0)
model = maskrcnn_resnet50_fpn(weights=None, weights_backbone=None, num_classes=4, min_size=128, max_size=160,
                              box_score_thresh=0.0, box_detections_per_img=5).eval()       # no score filter, so that we can see outputs from an untrained model
image = torch.rand(3, 120, 150)
with torch.no_grad():
    out = model([image])[0]
print({k: tuple(v.shape) for k, v in out.items()})
masks = out["masks"]
print("masks: (N detections, 1, H, W) with soft values in 0..1 ->", tuple(masks.shape), " range", round(masks.min().item(), 2), "to", round(masks.max().item(), 2))
binary = masks[:, 0] > 0.5                                                                  # the final binary instance masks
print("binary masks:", tuple(binary.shape), binary.dtype)
assert set(out) == {"boxes", "labels", "scores", "masks"} and masks.shape[-2:] == image.shape[-2:]
```

## Single-stage instance segmentation

Two-stage models run a mask head per proposal. Single-stage alternatives are faster:

- **YOLACT** (2019): two parallel steps. (1) A **prototype network** predicts `k` (for example 32) **mask prototypes**, full-image masks that are shared by all objects. (2) The detection head predicts, for each object, `k` **mask coefficients**. The mask of an object = a **linear combination** of the prototypes, cropped by its box: `mask = σ(P · c)`. No RoI step, so it is real-time. YOLO's segmentation models (YOLOv5/v8/11-seg) use the same prototype idea.
- **SOLO / SOLOv2** (2020): "segmenting objects by **locations**". Divide the image into an `S × S` grid; the cell containing an object's **centre** predicts that object's whole mask (and the class). Objects of different size are handled by FPN levels. SOLOv2 makes the mask kernels dynamic. No boxes at all.
- **CondInst, BlendMask**: dynamic filters or blended bases per instance.
- **Query-based** (Mask2Former and others, next lesson): each query produces one mask.

```python run title="YOLACT-style masks: prototypes combined linearly" level=intermediate shared
import cv2
import numpy as np
import cvlab

H = W = 96
rng = np.random.default_rng(0)
# 3 "prototype" maps (coarse building blocks, shared by all objects)
yy, xx = np.mgrid[0:H, 0:W]
protos = np.stack([(xx / W), (yy / H), np.exp(-((xx - W / 2) ** 2 + (yy - H / 2) ** 2) / 900)])      # a ramp in x, a ramp in y and a blob
# each detected object has coefficients, one per prototype, and a box
objects = [dict(coef=np.array([-4.0, -4.0, 9.0]), box=(10, 10, 60, 60)),         # all weight on the blob: a roundish mask
           dict(coef=np.array([5.0, -3.0, 2.0]), box=(40, 30, 92, 90))]          # a mask that grows towards the right
def instance_mask(obj):
    logits = np.tensordot(obj["coef"], protos, axes=(0, 0))                      # mask = sum_k c_k * prototype_k
    m = 1 / (1 + np.exp(-(logits - np.median(logits))))                          # sigmoid (centred for this toy example)
    x1, y1, x2, y2 = obj["box"]
    crop = np.zeros_like(m); crop[y1:y2, x1:x2] = 1                              # keep only what is inside the predicted box
    return (m * crop) > 0.5
masks = [instance_mask(o) for o in objects]
print("prototypes:", protos.shape, "  coefficients per object:", len(objects[0]["coef"]), "  -> masks:", [int(m.sum()) for m in masks], "pixels")
cvlab.show(*protos, *masks, titles=["prototype 1", "prototype 2", "prototype 3", "mask of object 1", "mask of object 2"], width=120)
```

## Storing masks: polygons and RLE

Datasets store masks compactly:

- **Polygons**: lists of `(x, y)` points around the contour (COCO "segmentation" for single objects). Easy to edit by hand; get them with `cv2.findContours` and simplify with `approxPolyDP`.
- **RLE (run-length encoding)**: the mask is flattened (COCO uses **column-major** order) and stored as alternating lengths of zeros and ones. Compact for big blobs, and what COCO uses for crowd regions and most model outputs.

```python run title="Binary mask to polygon and to COCO-style RLE" level=intermediate shared
mask = masks[0].astype(np.uint8)

contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
poly = cv2.approxPolyDP(max(contours, key=cv2.contourArea), 1.5, True).reshape(-1, 2)
print("polygon with", len(poly), "points instead of", int(mask.sum()), "mask pixels")

def rle_encode(m):                                                    # COCO style: column-major order, runs start with a count of zeros
    flat = m.T.ravel()                                                # transpose then flatten = column-major
    change = np.flatnonzero(np.diff(np.r_[0, flat, 0])) 
    runs = np.diff(np.r_[0, change, len(flat)]) if len(change) else np.array([len(flat)])
    if flat[0] == 1:
        runs = np.r_[0, runs]
    return runs.tolist()

def rle_decode(runs, shape):
    flat = np.zeros(int(np.sum(runs)), np.uint8); pos, val = 0, 0
    for r in runs:
        flat[pos:pos + r] = val; pos += r; val ^= 1
    return flat.reshape(shape[::-1]).T                                # undo the column-major flatten

runs = rle_encode(mask)
print("RLE:", len(runs), "numbers  (first 8:", runs[:8], ")")
print("round trip is exact:", bool((rle_decode(runs, mask.shape) == mask).all()))
rasterised = np.zeros_like(mask); cv2.fillPoly(rasterised, [poly], 1)
print("polygon rasterised back: mask IoU with the original =", round(float((rasterised & mask).sum() / (rasterised | mask).sum()), 3))
```

## Mask IoU, mask AP and mask NMS

Everything from detection carries over, with **mask IoU** instead of box IoU: `|A ∩ B| / |A ∪ B|` over pixels. **Mask AP** (COCO) uses it. Duplicate instances are removed by **mask NMS** (suppress masks with high mask IoU); SOLOv2 uses **Matrix NMS**, a parallel soft version.

```python run title="Mask IoU matrix and mask NMS" level=intermediate shared
def mask_iou_matrix(ms):
    flat = np.array([m.ravel() for m in ms]).astype(np.float32)
    inter = flat @ flat.T
    area = flat.sum(1)
    return inter / (area[:, None] + area[None, :] - inter + 1e-9)

a, b = masks[0], masks[1]
a2 = np.roll(a, 2, axis=1)                                            # a near-duplicate of object 1
ms, scores = [a, a2, b], np.array([0.9, 0.7, 0.8])
iou_m = mask_iou_matrix(ms)
print("mask IoU matrix:\n", np.round(iou_m, 2))
keep = []
for i in np.argsort(-scores):
    if all(iou_m[i, j] < 0.7 for j in keep):
        keep.append(int(i))
print("kept after mask NMS (threshold 0.7):", keep, "(the shifted duplicate, index 1, is removed)")
```

## Choosing a model

| Need | Choice |
|---|---|
| Best accuracy, offline, masks and keypoints | Mask R-CNN / Cascade Mask R-CNN with a strong backbone; Mask2Former |
| Real time on GPU or edge | YOLOv8/11-seg, YOLACT-style, RTMDet-Ins |
| Boundary quality matters | PointRend, Mask Transfiner, or refinement (CascadePSP) |
| No labels, any object | SAM (promptable), Grounded SAM (text) |
| Touching round objects (cells, nuclei) | Cellpose / StarDist (specialised), or watershed on a distance map |

## From masks to measurements

Once you have an instance mask: **area** (pixels × (mm per pixel)²), **centroid** and **orientation** (moments or `minAreaRect`), **bounding box**, **perimeter**, **solidity**, **holes**, **count**; for robotics, a **grasp point** from the mask's principal axes or its distance-transform maximum. Convert masks to polygons or contours for the robot's planner. Check mask quality on **thin** and **occluded** objects.

:::interview Questions you may get
- "How does Mask R-CNN produce masks?" A mask head (small FCN) on RoIAlign features predicts a 28×28 binary mask per class; the mask for the predicted class is resized into the box.
- "Why RoIAlign for masks?" Quantisation errors of RoIPool misalign masks.
- "How does YOLACT work?" Prototype masks shared by all instances plus per-instance coefficients; mask = linear combination, cropped by the box.
- "What is SOLO?" Predicts instance masks directly by grid location: the cell containing an object's centre predicts its mask; no boxes.
- "RLE versus polygon?" RLE stores the exact pixel mask compactly as run lengths (column-major in COCO); polygons are an approximate vector outline.
- "How do you handle duplicate masks?" Mask NMS (mask IoU) or Matrix NMS.
:::

```quiz
? In YOLACT, how is an instance mask formed?
+ A linear combination of shared prototype masks using per-instance coefficients
- By cropping the box only
- By running a separate network per object
> That avoids the per-region mask head.

? What does COCO's RLE store?
+ Alternating run lengths of zeros and ones over the column-major flattened mask
- The polygon vertices
- The bounding box
> It is exact and compact for blobby masks.

? Mask R-CNN predicts one mask per...
+ class (the mask of the predicted class is used)
- image
- pixel
> Masks of different classes do not compete.

? Which design predicts masks by image location without boxes?
+ SOLO
- Faster R-CNN
- RetinaNet
> The grid cell holding the object's centre predicts its mask.
```

:::problem You must count and measure touching screws in a bin photo. Compare watershed, Mask R-CNN-style instance segmentation and SAM. {level=medium tags="instance-segmentation,design"}
Think about overlap, data needs and speed.

:::solution Model answer
Watershed (distance transform) works for well-separated or just-touching convex objects, needs no training, and is very fast, but fails with heavy overlap and shiny, textured screws. An instance model (Mask R-CNN or YOLO-seg) handles overlap and varied poses, gives masks and classes (screw type), but needs labelled masks (a few hundred to thousands) and training. SAM gives masks for any object without training (promptable or automatic mask generation), but is heavy, may over/under-segment, and gives no class (combine with a classifier or Grounded SAM). A practical path: start with SAM to **auto-label**, correct a small set, train a compact instance model (YOLO-seg) for speed, and measure count error and mask quality against manual counts.
:::
:::

:::keypoints
- Instance segmentation gives class, box and mask per object. Mask R-CNN adds a per-class 28×28 mask head on RoIAlign features.
- Single-stage: YOLACT/YOLO-seg (prototypes × coefficients), SOLO (masks by grid location), CondInst; query-based models come next.
- Masks are stored as polygons or COCO RLE (column-major). Use mask IoU for AP and mask/Matrix NMS for duplicates.
- Derive measurements (area, centre, orientation, grasp point) from masks; choose models by accuracy, speed and label cost; SAM can bootstrap labels.
:::

:::resources
- [He et al.: Mask R-CNN](https://arxiv.org/abs/1703.06870) — the baseline.
- [Bolya et al.: YOLACT: Real-time Instance Segmentation](https://arxiv.org/abs/1904.02689) — prototype masks.
- [Wang et al.: SOLO: Segmenting Objects by Locations](https://arxiv.org/abs/1912.04488) — location-based masks.
- [Kirillov et al.: PointRend](https://arxiv.org/abs/1912.08193) — sharper mask boundaries.
:::
