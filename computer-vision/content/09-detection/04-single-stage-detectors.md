---
title: Single-Stage Detectors — SSD, RetinaNet and the YOLO Idea
level: advanced
time: 55
summary: Predict classes and boxes in one pass, on a dense grid. SSD's multi-scale default boxes, RetinaNet's focal loss that fixed the class-imbalance problem, and the original YOLO grid, with a grid-target encoder and decoder written from scratch and tested.
---

Two-stage detectors are accurate but need two steps. **Single-stage detectors** (also called one-stage or dense detectors) skip the proposal stage: the network looks at a **dense set of locations** and predicts the class and box **directly** in one pass. They are simpler and **much faster**, which is why they dominate real-time applications.

## The dense prediction idea

Run the backbone (+ FPN) to get feature maps. A small **head** (a few convolutions) is applied at **every location** of each map. At each location it outputs, for each of `A` anchors (or one point in anchor-free versions):

- `C` class scores, and
- 4 box numbers.

An FPN level of size 40 × 40 with 9 anchors gives 14,400 predictions; with several levels, **tens of thousands per image**. Most are background. Then: score threshold → NMS → final boxes.

## SSD (2015)

The **Single Shot MultiBox Detector** (Liu et al.) predicted from **several feature maps of different resolution** (38×38, 19×19, 10×10, 5×5, 3×3, 1×1) in the same network: high-resolution maps for small objects, low-resolution maps for large ones, each with **default boxes** of suitable scales (0.1 to 0.9 of the image) and aspect ratios. A multi-box loss (cross-entropy + smooth-L1) with **hard negative mining** (3 negatives per positive). It reached 74% mAP on VOC at **59 fps**, fast and competitive. Weakness: small objects were still poor (the high-resolution maps were semantically weak: FPN fixed this).

## The problem: extreme class imbalance

In a dense detector, a typical image has maybe 20 objects but **100,000 candidate locations**, so more than 99.9% of the training examples are **easy background**. Even if each is classified well (loss 0.01), their **sum** dwarfs the few hard, informative examples, and the network learns mainly to say "background". Two-stage detectors avoid this because the RPN already filters out most of the background. One-stage detectors needed a fix. SSD used hard negative mining. RetinaNet found a more elegant one.

## RetinaNet and the focal loss (2017)

Lin et al. introduced the **focal loss**, which **reduces the weight of easy examples** so training focuses on the hard ones:

:::formula Focal loss
\text{FL}(p_t) = -\alpha_t\,(1-p_t)^{\gamma}\,\log(p_t)
:::

`p_t` is the probability the model gives to the **correct** class. The factor `(1 − p_t)^γ` (with `γ = 2`) is close to 0 when the example is easy (`p_t` near 1) and close to 1 when it is hard. `α` balances positives and negatives.

```python run title="Focal loss versus cross-entropy" level=intermediate
import numpy as np

def cross_entropy(p): return -np.log(p)
def focal(p, gamma=2.0, alpha=0.25): return -alpha * (1 - p) ** gamma * np.log(p)

print("p(correct)   cross-entropy   focal loss   focal / CE")
for p in (0.99, 0.9, 0.6, 0.3, 0.1):
    print(f"{p:9.2f} {cross_entropy(p):15.4f} {focal(p):12.5f} {focal(p) / cross_entropy(p):10.4f}")

# the imbalance: 100,000 easy background locations (p = 0.99) versus 50 hard positives (p = 0.3)
easy, hard = 100_000 * cross_entropy(0.99), 50 * cross_entropy(0.3)
print(f"\ncross-entropy total: easy background {easy:.0f} vs hard positives {hard:.0f}  (the easy ones dominate {easy / hard:.0f}:1)")
easy_f, hard_f = 100_000 * focal(0.99), 50 * focal(0.3)
print(f"focal loss total   : easy background {easy_f:.1f} vs hard positives {hard_f:.1f}  (now {easy_f / hard_f:.2f}:1)")
```

With cross-entropy, 100,000 easy background locations contribute about 1,000 to the loss and 50 hard positives about 60; with focal loss the easy ones count for much less than the hard ones. **RetinaNet** = ResNet + FPN + two small heads (class and box) + focal loss. It matched the accuracy of two-stage detectors at one-stage speed, and focal loss is now used everywhere (also in segmentation, and as "varifocal"/"quality focal" variants).

Check the formula against torchvision's implementation (on your computer):

```python local check title="Focal loss in torchvision matches our formula"
import torch
from torchvision.ops import sigmoid_focal_loss

logits = torch.tensor([3.0, -2.0, 0.5, -0.1])
targets = torch.tensor([1.0, 0.0, 1.0, 1.0])
ours = []
for z, y in zip(logits, targets):
    p = torch.sigmoid(z)
    pt = p if y == 1 else 1 - p
    alpha_t = 0.25 if y == 1 else 0.75
    ours.append(-alpha_t * (1 - pt) ** 2 * torch.log(pt))
tv = sigmoid_focal_loss(logits, targets, alpha=0.25, gamma=2.0, reduction="none")
print("ours       :", torch.stack(ours).numpy().round(5))
print("torchvision:", tv.numpy().round(5))
assert torch.allclose(torch.stack(ours), tv, atol=1e-6)
```

Another important RetinaNet trick: initialise the class bias so that the **initial probability of "object" is about 0.01**, so the huge number of background anchors does not produce a giant initial loss (similar to the "initial loss should be ln C" check).

## YOLO v1: a grid and one regression

Redmon et al. (2016): *You Only Look Once*. Divide the image into an `S × S` grid (7 × 7). Each cell predicts `B` boxes (2) with `(x, y, w, h, confidence)` and `C` class probabilities. The cell that contains the **centre** of an object is responsible for it. Output tensor: `S × S × (B·5 + C)` = 7 × 7 × 30. One network, one pass, trained with a sum-squared-error loss. It ran at **45 fps** (real time!) but struggled with small objects close together (each cell has only 2 boxes and one class) and had worse localisation than two-stage detectors. Its descendants (v2 to v11) fixed these; the next lesson covers them.

## The YOLO v1 target encoding, written out

Here is how a ground-truth box becomes a training target on the grid, and how a prediction is decoded back. It shows exactly what "the cell responsible for the object" means.

```python run title="Encode boxes into a YOLO-style grid target and decode them" level=advanced
import numpy as np

S, C, IMG = 7, 3, 448                                                 # 7 x 7 grid, 3 classes, 448-pixel image

def encode(boxes):
    """boxes: list of (x1, y1, x2, y2, class). Returns an (S, S, 5 + C) target: x, y, w, h, objectness, one-hot class."""
    target = np.zeros((S, S, 5 + C))
    for x1, y1, x2, y2, cls in boxes:
        cx, cy, w, h = (x1 + x2) / 2 / IMG, (y1 + y2) / 2 / IMG, (x2 - x1) / IMG, (y2 - y1) / IMG    # normalised 0..1
        col, row = min(int(cx * S), S - 1), min(int(cy * S), S - 1)        # the cell containing the box centre is responsible
        target[row, col, :4] = [cx * S - col, cy * S - row, w, h]          # x, y relative to the cell (0..1); w, h relative to the image
        target[row, col, 4] = 1.0                                          # objectness
        target[row, col, 5 + int(cls)] = 1.0
    return target

def decode(grid, conf_thr=0.5):
    out = []
    for row in range(S):
        for col in range(S):
            x, y, w, h, obj = grid[row, col, :5]
            if obj >= conf_thr:
                cx, cy = (col + x) / S * IMG, (row + y) / S * IMG
                out.append((cx - w * IMG / 2, cy - h * IMG / 2, cx + w * IMG / 2, cy + h * IMG / 2, int(grid[row, col, 5:].argmax())))
    return out

truth = [(40, 60, 200, 250, 0), (300, 100, 420, 200, 1), (150, 330, 260, 440, 2)]
target = encode(truth)
print("target shape:", target.shape, " cells with an object:", [tuple(int(v) for v in rc) for rc in np.argwhere(target[..., 4] > 0)])
back = decode(target)
for t, b in zip(truth, back):
    print("truth", t, "-> decoded", tuple(round(v, 1) for v in b))
assert all(np.allclose(t[:4], b[:4], atol=1e-6) and t[4] == b[4] for t, b in zip(sorted(truth), sorted(back)))
two = encode([(100, 100, 130, 130, 0), (105, 110, 140, 135, 1)])        # two objects whose centres fall into the same cell
print("two objects in one cell -> objects stored:", int(two[..., 4].sum()), "(the second overwrote the first: a YOLOv1 limitation)")
```

The last line shows the v1 limit: two nearby objects in one cell cannot both be represented. Later YOLOs predict at three scales with several anchors per cell.

## One-stage versus two-stage today

The gap closed. Today, single-stage detectors (YOLOv8/v11, RT-DETR, RTMDet, YOLOX) are the default for real-time applications and often match or beat the older two-stage models. Two-stage designs survive where **instance masks, keypoints and very high precision** are needed (Mask R-CNN-style), and as the conceptual base for cascades and transformers.

:::interview Questions you may get
- "Why were one-stage detectors less accurate than two-stage ones at first?" Extreme foreground/background imbalance: the loss was swamped by easy negatives.
- "Explain the focal loss." Cross-entropy scaled by `(1 − p_t)^γ` so well-classified examples contribute little and the loss focuses on hard ones; `α` balances classes.
- "How does SSD detect objects of different sizes?" It predicts from several feature maps of different resolutions, each with default boxes of suitable scale.
- "How does YOLO v1 assign an object to a prediction?" The grid cell containing the box centre is responsible; each cell predicts B boxes with confidences and one class distribution.
- "What was YOLO v1's main weakness?" Few boxes per cell: nearby small objects, and imprecise localisation.
- "Why initialise the final class bias to a prior of 0.01 in RetinaNet?" Avoids a huge initial loss from the many background anchors, stabilising early training.
:::

```quiz
? What does the (1 − p_t)^γ factor do in focal loss?
+ Down-weights examples the model already classifies confidently
- Increases the loss for easy examples
- Normalises the box coordinates
> Easy examples get weights near 0, hard ones near 1.

? Why do single-stage detectors face a severe class imbalance?
+ They score tens of thousands of locations per image, almost all of which are background
- They have too few classes
- They have no backbone
> Two-stage detectors filter most background with the RPN.

? In YOLO v1, which cell is responsible for an object?
+ The cell containing the center of the object's box
- All cells overlapping the box
- The top-left cell
> That cell predicts the box and the class.

? What does SSD's use of multiple feature maps provide?
+ Detection at several scales: fine maps for small objects, coarse maps for large ones
- Higher classification accuracy only
- A smaller model
> Later, FPN made the fine maps semantically stronger.
```

:::problem Your one-stage detector trains but predicts almost nothing: confidence scores are all below 0.05. Which causes do you check? {level=medium tags="one-stage,debugging,imbalance"}
Think about the imbalance and the loss.

:::solution Model answer
The background dominates the loss, so the network learned to output "no object" everywhere: check the loss balancing (focal loss with sensible α/γ, or hard negative mining, or class/positive weighting), the bias initialisation of the class head (prior 0.01), the anchor assignment (too few positives if the IoU threshold is too high or anchors do not fit your objects: check the number of positives per image), the label format (box format and normalisation, class ids), the learning rate, and whether training has simply not run long enough. Visualise the matched positive anchors on a few training images. Also check that the evaluation score threshold is low enough (for example 0.001 for mAP).
:::
:::

:::keypoints
- Single-stage detectors predict class and box densely in one pass (SSD multi-scale default boxes; RetinaNet with FPN; YOLO grid).
- Extreme foreground/background imbalance is the core difficulty; focal loss `−α(1−p_t)^γ log p_t` (or hard negative mining) solves it.
- YOLO v1: S×S grid, cell with the object centre is responsible, tensor `S×S×(5B+C)`; limited by few boxes per cell.
- Today single-stage detectors lead in speed and match two-stage accuracy; two-stage remains for masks and top precision.
:::

:::resources
- [Redmon et al.: You Only Look Once](https://arxiv.org/abs/1506.02640) — YOLO v1.
- [Lin et al.: Focal Loss for Dense Object Detection (RetinaNet)](https://arxiv.org/abs/1708.02002) — the focal loss paper.
- [Liu et al.: SSD](https://arxiv.org/abs/1512.02325) — multi-scale default boxes.
:::
