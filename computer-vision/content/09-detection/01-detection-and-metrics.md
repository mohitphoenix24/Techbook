---
title: The Detection Task, IoU and mAP
level: intermediate
time: 55
summary: What object detection asks for, the box formats, intersection over union and its variants, and how detectors are scored. Precision-recall per class, average precision and mAP (VOC versus COCO), written from scratch and checked on a hand-worked example.
---

**Classification** says *what* is in the picture. **Object detection** says *what* and *where*, for **every** object: a list of boxes, each with a class label and a confidence score. It is the core task of autonomous driving, retail, security, robotics (finding things to grasp) and many apps.

## Output and box formats

A detection is `(x1, y1, x2, y2, class, score)`. Boxes appear in several formats (a classic source of bugs):

| Format | Numbers | Used by |
|---|---|---|
| `xyxy` | top-left and bottom-right corners, pixels | torchvision, many libraries |
| `xywh` | top-left corner, width, height, pixels | COCO annotations |
| `cxcywh` | centre, width, height (often normalised 0–1) | YOLO, DETR |

Always write down which one a function expects, and whether the numbers are pixels or fractions of the image.

## Intersection over Union (IoU)

How well does a predicted box match the true box? **IoU** = area of overlap ÷ area of union. It is 0 for no overlap and 1 for a perfect match. A prediction usually counts as **correct** if its IoU with a true box of the same class is at least a threshold (0.5 in Pascal VOC; 0.5 to 0.95 in COCO).

```viz algo=iou title="Drag the prediction over the truth"
```

```python run title="IoU from scratch" level=easy shared
import numpy as np

def iou(a, b):
    """a, b: boxes as (x1, y1, x2, y2)."""
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)                  # 0 if the boxes do not overlap
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0

truth = (100, 100, 200, 200)
for name, box in [("perfect", (100, 100, 200, 200)), ("shifted 20 px", (120, 100, 220, 200)), ("half size inside", (100, 100, 200, 150)),
                  ("shifted 60 px", (160, 100, 260, 200)), ("no overlap", (300, 300, 350, 350))]:
    print(f"{name:18s} IoU = {iou(truth, box):.3f}")
```

Useful numbers: a box shifted by **20%** of its width has IoU 0.67; shifted by **50%**, 0.33. An IoU of 0.5 is quite loose. COCO's strict thresholds up to 0.95 reward precise localisation.

**Beyond IoU for training:** plain IoU is 0 for non-overlapping boxes, so it gives no gradient. **GIoU** subtracts the empty part of the smallest enclosing box; **DIoU** adds the distance between centres; **CIoU** also compares aspect ratios. Modern detectors regress boxes with these (the simulator above prints them).

## Matching detections to truth

To score a detector on an image set:

1. Sort all detections of a class by **score**, highest first.
2. For each detection, find the truth box (same class, same image) with the highest IoU.
3. If IoU ≥ threshold **and that truth box is not already taken**, it is a **true positive (TP)** and the box is marked as taken. Otherwise it is a **false positive (FP)** (a duplicate of an already-found object counts as an FP).
4. Truth boxes never matched are **false negatives (FN)** (missed objects).

## Precision, recall, AP

Go down the sorted list. After each detection compute **precision** `TP/(TP+FP)` and **recall** `TP/(number of truth boxes)`. Plot precision against recall: the **PR curve**. The **average precision (AP)** is the **area under it**. A detector with a high AP has high precision at all recall levels: it finds most objects and does not litter the output with false alarms. Click detections to see how the area changes:

```viz algo=apcurve title="AP from a ranked list of detections"
```

:::formula Average precision
\text{AP} = \int_0^1 p(r)\,dr \;\approx\; \frac{1}{101}\sum_{r\in\{0,0.01,\dots,1\}} p_{\text{interp}}(r), \qquad p_{\text{interp}}(r)=\max_{r'\ge r} p(r')
:::

The **interpolated** precision at recall `r` is the best precision at any recall of `r` or more (a monotone "envelope"). Pascal VOC (2007) averaged 11 recall points; COCO uses 101.

## mAP: the standard score

**mAP (mean average precision)** is AP averaged over **classes**. COCO goes further and also averages over **IoU thresholds** 0.50, 0.55, …, 0.95:

| Metric | Meaning |
|---|---|
| **AP** (or mAP, AP@[.5:.95]) | Averaged over 10 IoU thresholds and all classes: the headline COCO number |
| **AP50** | AP at IoU 0.5 (the old VOC metric): loose localisation |
| **AP75** | AP at IoU 0.75: strict |
| **AP_S, AP_M, AP_L** | AP for small (< 32² px), medium and large objects |
| **AR@1, AR@10, AR@100** | Average recall given at most 1, 10 or 100 detections per image |

Small objects usually have the lowest AP; always look at AP_S when objects are small.

## AP from scratch

```python run title="Average precision and mAP from scratch" level=advanced shared
import cvlab

def average_precision(detections, truths, thr=0.5):
    """detections: list of (image_id, score, box). truths: dict image_id -> list of boxes. One class."""
    order = sorted(detections, key=lambda d: -d[1])
    taken = {k: [False] * len(v) for k, v in truths.items()}
    n_truth = sum(len(v) for v in truths.values())
    tp, fp = [], []
    for img, score, box in order:
        best, best_j = 0.0, -1
        for j, t in enumerate(truths.get(img, [])):
            v = iou(box, t)
            if v > best:
                best, best_j = v, j
        if best >= thr and not taken[img][best_j]:
            taken[img][best_j] = True; tp.append(1); fp.append(0)
        else:
            tp.append(0); fp.append(1)                                      # a miss, or a duplicate of an object already found
    tp, fp = np.cumsum(tp), np.cumsum(fp)
    recall, precision = tp / n_truth, tp / (tp + fp)
    envelope = np.maximum.accumulate(precision[::-1])[::-1]                  # best precision at this recall or higher
    ap = 0.0
    for r in np.linspace(0, 1, 101):                                         # 101 recall points, as in COCO
        idx = np.searchsorted(recall, r, side="left")
        ap += envelope[idx] if idx < len(envelope) else 0.0
    return ap / 101

# a hand-worked check: 2 truth boxes, 3 detections ranked as TP, FP, TP
truths = {0: [(10, 10, 50, 50), (100, 100, 140, 140)]}
dets = [(0, 0.9, (11, 11, 51, 51)), (0, 0.8, (200, 200, 240, 240)), (0, 0.7, (101, 99, 141, 139))]
# precision after each: 1/1, 1/2, 2/3 ; recall: 0.5, 0.5, 1.0 -> envelope: 1.0 up to recall 0.5, then 2/3 up to 1.0
expected = (51 * 1.0 + 50 * (2 / 3)) / 101
print("AP by hand:", round(expected, 4), "   AP from the code:", round(average_precision(dets, truths), 4))
```

The hand calculation and the code agree. Now a larger test: 30 images with known objects and a noisy "detector".

```python run title="Score a simulated detector at different IoU thresholds" level=advanced shared
rng = np.random.default_rng(0)
truths, dets = {}, []
for img in range(30):
    _, boxes = cvlab.scene(n=4, seed=img)
    truths[img] = [b[:4] for b in boxes]
    for t in truths[img]:
        if rng.random() < 0.88:                                              # the detector finds 88% of the objects ...
            jitter = rng.normal(0, 3, 4)                                     # ... with some localisation error
            dets.append((img, rng.uniform(0.5, 1.0), tuple(np.array(t) + jitter)))
    for _ in range(3):                                                       # and makes a few false alarms with lower scores
        x, y = rng.uniform(0, 250), rng.uniform(0, 180)
        dets.append((img, rng.uniform(0.05, 0.7), (x, y, x + rng.uniform(25, 70), y + rng.uniform(25, 70))))
print("detections:", len(dets), "  true objects:", sum(len(v) for v in truths.values()))
for thr in (0.5, 0.75, 0.9):
    print(f"AP at IoU {thr}: {average_precision(dets, truths, thr):.3f}")
coco_ap = np.mean([average_precision(dets, truths, t) for t in np.arange(0.5, 0.96, 0.05)])
print("COCO-style AP averaged over IoU 0.50 .. 0.95:", round(float(coco_ap), 3))
```

The same detector scores about 0.83 at IoU 0.5, 0.70 at 0.75 and almost nothing (0.04) at 0.9, because its boxes are a few pixels off. That is why "AP50 = 90" and "AP = 55" can describe the same detector.

## Using the official tool

For real work use **pycocotools** (the COCO evaluation) or **torchmetrics** `MeanAveragePrecision`; they are the reference implementations, handle multiple classes, crowd regions and area ranges, and give comparable numbers. Common pitfalls when comparing with papers: different image size at test time, different NMS threshold or max detections, different score threshold, evaluating on the validation set that was used for tuning, and non-standard class mappings.

## Which detector output do you evaluate?

- Evaluate with a **low score threshold** (0.001) so that the PR curve is complete. For **deployment**, choose a score threshold from the precision/recall trade-off for your application and report precision and recall at that point as well. mAP says how good the detector's **ranking** is; it does not say which threshold to use.
- Per-class AP shows which classes are weak. Confusion between classes and localisation errors are better understood with **error analysis tools** (TIDE).

:::interview Questions you may get
- "What is IoU?" Area of overlap divided by area of union of two boxes.
- "Explain AP and mAP." AP is the area under the precision-recall curve of one class, computed by ranking detections by score and matching them to truth boxes at an IoU threshold; mAP averages over classes (COCO also over IoU 0.5–0.95).
- "AP50 versus AP75 versus COCO AP?" Increasing localisation strictness; COCO AP averages thresholds 0.5–0.95 and punishes sloppy boxes.
- "How is a duplicate detection treated?" As a false positive, since the truth box is already matched.
- "Why is IoU not a good loss function?" It is zero (no gradient) when boxes do not overlap; GIoU/DIoU/CIoU fix this.
- "mAP is high but the product misses defects. Why?" mAP averages over thresholds and classes; check recall at the operating threshold, the small-object AP, and per-class results.
:::

```quiz
? A predicted box is shifted by half its width relative to the same-size truth box. Roughly what is the IoU?
+ About 0.33
- About 0.5
- About 0.9
> Overlap 0.5, union 1.5 (in box areas): 0.5/1.5.

? How is a second detection of an already-found object counted?
+ As a false positive
- As a true positive
- It is ignored
> The truth box is already matched.

? What does COCO's primary AP metric average over?
+ Classes and IoU thresholds from 0.5 to 0.95
- Only IoU 0.5
- Only the confidence thresholds
> That rewards precise boxes.

? Which metric is usually lowest for a detector and most important for tiny defects?
+ AP_S (small objects)
- AP_L
- AP50 over large objects
> Check the size-specific APs for your use case.
```

:::problem A detector has AP50 = 92 but AP75 = 41. What does that say, and what would you try? {level=medium tags="map,localisation,debugging"}
Think about what changes between the two thresholds.

:::solution Model answer
The detector **finds** the objects (good recall and classification at a loose threshold) but its boxes are not **precise**: many predictions overlap the truth by only 0.5–0.75. Try: better box regression loss (CIoU/GIoU/DFL), higher input resolution or a stronger neck for fine features, a cascade/refinement stage (Cascade R-CNN), longer training and better augmentation, checking annotation quality (noisy boxes limit AP75), and test-time techniques such as box voting/weighted box fusion. Whether it matters depends on the application: grasping needs precise boxes, counting does not.
:::
:::

:::keypoints
- Detection outputs boxes with class and score. Know the box formats (`xyxy`, `xywh`, `cxcywh`) and whether they are normalised.
- IoU = overlap/union; GIoU, DIoU, CIoU repair its zero-gradient problem and are used as losses.
- Match detections by descending score; TP needs IoU ≥ threshold and an unmatched truth box; duplicates are FP.
- AP = area under the (monotone) precision-recall curve; mAP averages classes; COCO AP also averages IoU 0.5–0.95; read AP50, AP75 and AP_S/M/L.
:::

:::resources
- [COCO detection evaluation metrics](https://cocodataset.org/#detection-eval) — the official definitions.
- [Padilla et al.: A Comparative Analysis of Object Detection Metrics](https://www.mdpi.com/2079-9292/10/3/279) — VOC versus COCO AP, explained.
- [Rezatofighi et al.: Generalized Intersection over Union](https://arxiv.org/abs/1902.09630) — GIoU.
- [Zheng et al.: Distance-IoU Loss](https://arxiv.org/abs/1911.08287) — DIoU and CIoU.
:::
