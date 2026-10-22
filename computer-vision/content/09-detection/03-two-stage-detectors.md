---
title: Two-Stage Detectors — R-CNN to Faster R-CNN and Mask R-CNN
level: advanced
time: 55
summary: Propose regions first, then classify and refine each one. The path from R-CNN through Fast R-CNN to Faster R-CNN, the region proposal network, RoI pooling and RoIAlign, feature pyramids (FPN), and what the torchvision implementation returns. A tested example.
---

Before YOLO, the leading idea was to split detection in two:

1. **Stage 1 — propose**: find a few hundred or thousand **regions that might contain an object** (class-agnostic).
2. **Stage 2 — classify and refine**: for each proposal, decide the class and fine-tune the box.

This **two-stage** design is slower than single-stage detectors but historically more accurate, especially for small objects and precise boxes, and it is the base for instance segmentation (Mask R-CNN).

## R-CNN (2013): the first deep detector

Girshick et al.: (1) generate about **2,000 region proposals** per image with **selective search** (a classical method that merges similar-looking regions: colour, texture, size), (2) **warp each region** to 227 × 227, (3) run a **CNN** to get features, (4) classify with **SVMs**, and (5) refine the box with a regression. It jumped mAP on PASCAL VOC from 40% to 53%, but was **extremely slow**: 2,000 CNN forward passes per image, about **47 seconds per image**, and multi-stage training.

## Fast R-CNN (2015): share the computation

Run the CNN **once on the whole image** to get one feature map. Each proposal is projected onto that map and a fixed-size feature (for example 7 × 7) is extracted by **RoI pooling**. A small head classifies and regresses the box. One forward pass of the backbone instead of 2,000: **about 100× faster to test**, and trained end to end with a multi-task loss (classification + box regression). The remaining bottleneck: selective search still takes about 2 seconds per image on a CPU.

### RoI pooling and RoIAlign

A proposal has arbitrary size, but the head needs a **fixed-size input**. **RoI pooling** splits the region into a grid (7 × 7) and takes the max of each cell, but it first **rounds** coordinates to whole feature-map cells: a quantisation that misaligns the features by up to half a cell (a stride-16 cell is 16 pixels). That hurts small objects and masks. **RoIAlign** (Mask R-CNN) removes the rounding: it samples at exact floating-point positions with **bilinear interpolation**.

```python local check title="RoIAlign samples with bilinear interpolation (torchvision.ops)"
import torch
from torchvision.ops import roi_align, roi_pool

fmap = torch.arange(0, 64, dtype=torch.float32).reshape(1, 1, 8, 8)      # a feature map whose values increase left to right and top to bottom
box = torch.tensor([[0, 1.3, 1.3, 5.6, 5.6]])                              # (batch index, x1, y1, x2, y2), in feature-map coordinates
aligned = roi_align(fmap, box, output_size=2, spatial_scale=1.0, sampling_ratio=2, aligned=True)
pooled = roi_pool(fmap, box, output_size=2, spatial_scale=1.0)
print("RoIAlign (exact, bilinear):\n", aligned[0, 0])
print("RoIPool  (rounded coordinates, max):\n", pooled[0, 0])
# the exact answer for the top-left output cell: the average of bilinearly sampled points inside the cell [0.8..3.45]
assert aligned.shape == (1, 1, 2, 2) and not torch.allclose(aligned, pooled)
```

## Faster R-CNN (2015): learn the proposals

Ren et al. replaced selective search by a small network inside the detector, the **Region Proposal Network (RPN)**, sharing the backbone features:

:::flow Faster R-CNN
Backbone | A CNN (ResNet-50/101, with an FPN) turns the image into feature maps.
RPN | A 3×3 conv slides over the feature map. At each location it looks at k anchors (for example 9) and predicts, for each: an objectness score (object or background) and box offsets.
Proposals | Keep the top ~2000 anchors by score, apply the offsets, and apply NMS (IoU 0.7). These are the region proposals.
RoIAlign | Crop a fixed-size feature (7×7) for each proposal from the feature map.
Detection head | Two fully connected layers, then a classifier (C+1 classes with background) and a class-specific box regressor.
Post-process | Score threshold, class-wise NMS (0.5), keep the top 100 detections.
:::

Training uses four losses: RPN objectness, RPN box regression, head classification and head box regression. About **5–17 fps** on a GPU depending on the backbone: far faster than R-CNN, and the standard accuracy baseline for years.

**Sampling during training:** the RPN samples 256 anchors per image (up to 50% positives); the head samples 512 proposals (25% positives) to control the imbalance.

## Feature Pyramid Network (FPN)

Objects appear at many sizes, but CNN features have a trade-off: deep layers are semantically strong but low resolution (bad for small objects); shallow layers are high resolution but semantically weak. **FPN** (Lin et al., 2017) builds a **pyramid of feature maps that are all semantically strong**: a **top-down path** upsamples the deep features and **adds** them to the **lateral** (1×1-convolved) shallow features. Result: maps at strides 4, 8, 16, 32 (P2–P5, plus P6 for large objects). Small objects are detected on the high-resolution levels, large ones on the coarse levels. FPN improved almost every detector and is now standard in both two- and single-stage models (and as the "neck" in segmentation).

## Mask R-CNN: add a mask branch

He et al. (2017) added a third output: a small **FCN mask head** that predicts a **binary mask for each detected box** (28 × 28 per class), using RoIAlign features. Box detection and **instance segmentation** in one network. The mask is predicted per class and independent of the others (a sigmoid per class, not a softmax), which decouples mask and class prediction.

## Cascade R-CNN and other refinements

- **Cascade R-CNN**: a sequence of heads with **increasing IoU thresholds** (0.5, 0.6, 0.7); each refines the boxes of the last. Large gains in high-IoU AP.
- **Libra R-CNN, Dynamic R-CNN, Sparse R-CNN**: balanced sampling, adaptive thresholds, learned proposals.
- **Soft-NMS, OHEM** (online hard example mining), **multi-scale training**, **deformable convolution**.

## Run it in torchvision

The block builds a small Faster R-CNN (random weights, so no download) and shows exactly what goes in and what comes out in training and in inference mode.

```python local check title="Faster R-CNN inputs and outputs in torchvision"
import torch
from torchvision.models.detection import fasterrcnn_mobilenet_v3_large_320_fpn

torch.manual_seed(0)
model = fasterrcnn_mobilenet_v3_large_320_fpn(weights=None, weights_backbone=None, num_classes=4)       # 3 object classes + background

images = [torch.rand(3, 240, 320), torch.rand(3, 200, 300)]               # a LIST of images, float 0..1, different sizes are fine
targets = [{"boxes": torch.tensor([[30., 40., 120., 150.]]), "labels": torch.tensor([1])},
           {"boxes": torch.tensor([[50., 20., 160., 100.], [10., 110., 90., 190.]]), "labels": torch.tensor([2, 3])}]

model.train()
losses = model(images, targets)                                           # in training mode with targets: returns a dict of losses
print("training mode returns losses:", {k: round(v.item(), 3) for k, v in losses.items()})
assert set(losses) == {"loss_classifier", "loss_box_reg", "loss_objectness", "loss_rpn_box_reg"}

model.eval()
with torch.no_grad():
    detections = model(images)                                            # in eval mode: a list of dicts, one per image
d = detections[0]
print("inference returns:", {k: tuple(v.shape) for k, v in d.items()})
print("boxes are (x1, y1, x2, y2) in pixels of the ORIGINAL image; labels are class ids (0 is background); scores are 0..1")
```

The four losses printed in training mode are exactly the ones above. In inference you get, per image, a dictionary with `boxes`, `labels` and `scores`.

## Strengths and weaknesses

| Strength | Weakness |
|---|---|
| High accuracy, precise boxes | Slower: two stages, per-proposal head (about 5–20 fps on a GPU) |
| Good for small and crowded objects with FPN | More hyper-parameters (sampling, NMS thresholds) |
| Natural extension to masks (Mask R-CNN) and keypoints | Harder to deploy than a single network |
| Strong baseline in torchvision/detectron2/MMDetection | Superseded in speed by YOLO-style models |

:::interview Questions you may get
- "Walk through Faster R-CNN." Backbone features, RPN proposes boxes from anchors (objectness + offsets), NMS and top-N proposals, RoIAlign to fixed-size features, head classifies and refines, final NMS.
- "What is RoI pooling and what problem does RoIAlign fix?" Pooling quantises coordinates to the grid, misaligning features; RoIAlign uses bilinear interpolation with no rounding.
- "What does the RPN predict?" For each anchor, whether it contains an object and four box offsets.
- "Why FPN?" It gives high-resolution maps strong semantics, so small objects are detected on fine levels and large ones on coarse levels.
- "Fast R-CNN versus R-CNN?" One backbone pass for the whole image with RoI pooling, instead of a CNN per proposal; end-to-end training.
- "What does Mask R-CNN add?" A mask branch and RoIAlign for per-instance segmentation.
:::

```quiz
? What does the RPN in Faster R-CNN output for each anchor?
+ An objectness score and box offsets
- A class label among 80 classes
- A mask
> Class-specific classification is done by the second stage.

? Why is RoIAlign better than RoI pooling for small objects?
+ It avoids rounding region coordinates, using bilinear interpolation
- It uses larger regions
- It skips the backbone
> A half-cell misalignment is a big error for small objects.

? What does FPN do?
+ Builds a top-down pyramid of feature maps that are all semantically strong
- Replaces the RPN
- Removes NMS
> Small objects use the fine levels.

? Roughly how did Fast R-CNN speed up R-CNN?
+ Share one backbone pass across all proposals
- Using a smaller image
- Removing the classifier
> R-CNN ran the CNN 2,000 times per image.
```

:::problem Your Faster R-CNN misses very small objects (10–20 pixels) in 1920×1080 images that are resized to 800 pixels wide. What do you change? {level=medium tags="two-stage,small-objects,design"}
Think about resolution, anchors and features.

:::solution Model answer
Downscaling shrinks the objects to 4–8 pixels, below what the stride-4/8 features resolve. Options: keep a larger input size or **tile** the image into overlapping crops at native resolution (and merge with NMS); add or use the high-resolution FPN level (P2) with **small anchors** (16 px, k-means-chosen) so small objects have positive anchors; train with multi-scale and copy-paste augmentation; use a stronger neck/backbone; lower the proposal IoU thresholds for positives; evaluate AP_S to measure progress.
:::
:::

:::keypoints
- Two-stage detectors propose regions, then classify and refine them. R-CNN (slow) → Fast R-CNN (shared backbone, RoI pooling) → Faster R-CNN (RPN with anchors).
- RoIAlign removes RoI pooling's quantisation; FPN builds strong multi-scale features; Mask R-CNN adds a mask branch.
- Four losses: RPN objectness and box, head class and box. Cascade R-CNN refines with increasing IoU thresholds.
- Accurate and flexible but slower than single-stage detectors; torchvision's `fasterrcnn_*` is a ready baseline.
:::

:::resources
- [Girshick et al.: Rich feature hierarchies (R-CNN)](https://arxiv.org/abs/1311.2524) — the beginning.
- [Girshick: Fast R-CNN](https://arxiv.org/abs/1504.08083) and [Ren et al.: Faster R-CNN](https://arxiv.org/abs/1506.01497).
- [Lin et al.: Feature Pyramid Networks for Object Detection](https://arxiv.org/abs/1612.03144) — FPN.
- [He et al.: Mask R-CNN](https://arxiv.org/abs/1703.06870) — RoIAlign and the mask branch.
:::
