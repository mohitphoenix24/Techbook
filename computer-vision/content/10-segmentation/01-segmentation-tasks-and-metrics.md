---
title: Segmentation Tasks and Metrics — mIoU, Dice, Panoptic Quality
level: intermediate
time: 45
summary: What each kind of segmentation asks for (semantic, instance, panoptic), and how they are scored. The confusion matrix, pixel accuracy, per-class IoU and mIoU, Dice/F1, boundary measures and panoptic quality, all computed from scratch on a made-up scene.
---

Detection gives a **box**. **Segmentation** gives the exact **pixels** of each thing, which is what you need to measure an area, cut an object out, steer a car between road edges, or locate the exact shape of a part to grasp.

## Three kinds of segmentation

| Task | Output | Treats "things" separately? | Example |
|---|---|---|---|
| **Semantic** | A class label for every pixel (road, car, sky, person) | No: all cars share one label | Road/lane maps, tissue types, land cover |
| **Instance** | A mask for each **object** with its class (car #1, car #2) | Yes, but only for countable "things" | Counting cells, picking parts |
| **Panoptic** | Both: every pixel gets a class, and "thing" pixels also get an instance id | Yes (things), and "stuff" (sky, road) as regions | Full scene understanding in driving |

**Things** are countable objects (people, cars). **Stuff** is amorphous regions (sky, grass, road).

## Representing a segmentation

- A **label map**: an `H × W` integer array, one class id per pixel (`0` = background). Saved as **PNG** (never JPEG).
- **One-hot / probability maps**: `C × H × W`, from the network (softmax over classes per pixel).
- **Binary masks** per instance: `N × H × W` booleans.
- **Polygons** and **RLE** (run-length encoding) in annotation files (COCO).

## The metrics

Everything starts with the **confusion matrix** over pixels: rows = true class, columns = predicted class.

```python run title="A made-up scene and a noisy prediction" level=easy shared
import cv2
import numpy as np
import cvlab

H = W = 160
truth = np.zeros((H, W), np.uint8)                                   # 0 background, 1 disc, 2 rectangle, 3 triangle
cv2.circle(truth, (50, 55), 32, 1, -1)
cv2.rectangle(truth, (95, 25), (145, 80), 2, -1)
cv2.fillConvexPoly(truth, np.array([[30, 140], [75, 85], [120, 140]]), 3)

rng = np.random.default_rng(0)
pred = truth.copy()
pred = cv2.erode(pred, np.ones((5, 5), np.uint8))                    # the network's masks are a bit too small ...
pred[rng.random((H, W)) < 0.01] = 2                                  # ... with some random wrong pixels ...
pred[100:125, 110:150] = 1                                           # ... and one wrong region
palette = np.array([[240, 240, 240], [220, 60, 60], [60, 120, 220], [60, 180, 90]], np.uint8)
cvlab.show(palette[truth], "Ground truth", palette[pred], "Prediction", (pred != truth).astype(np.uint8) * 255, "Errors (white)")
```

```python run title="Confusion matrix, pixel accuracy, IoU, mIoU and Dice" level=intermediate shared
C = 4
def confusion(truth, pred, C):
    idx = truth.astype(int).ravel() * C + pred.astype(int).ravel()
    return np.bincount(idx, minlength=C * C).reshape(C, C)           # rows: true class, columns: predicted class

cm = confusion(truth, pred, C)
tp = np.diag(cm); fp = cm.sum(0) - tp; fn = cm.sum(1) - tp

pixel_acc = tp.sum() / cm.sum()
iou = tp / (tp + fp + fn)                                            # per-class IoU = TP / (TP + FP + FN)
dice = 2 * tp / (2 * tp + fp + fn)                                   # per-class Dice = F1 = 2TP / (2TP + FP + FN)
names = ["background", "disc", "rectangle", "triangle"]
print("confusion matrix (rows: truth, columns: prediction):\n", cm)
print(f"pixel accuracy: {pixel_acc:.3f}   <- looks excellent because background dominates")
for n, i, d in zip(names, iou, dice):
    print(f"{n:11s} IoU {i:.3f}   Dice {d:.3f}")
print(f"mean IoU (mIoU): {iou.mean():.3f}   mean Dice: {dice.mean():.3f}")
print("relation: Dice = 2*IoU / (1 + IoU) ->", np.round(2 * iou / (1 + iou), 3))
```

What to remember:

- **Pixel accuracy** is dominated by big classes (background). A model that labels everything "background" scores high. Do not use it alone.
- **IoU (Jaccard)** per class = `TP / (TP + FP + FN)`; **mIoU** averages over classes: the standard semantic-segmentation score (Cityscapes, ADE20K, Pascal VOC).
- **Dice** (F1) = `2TP / (2TP + FP + FN)`; common in medical imaging and as a loss. Dice is always ≥ IoU and `Dice = 2·IoU/(1+IoU)`.
- Compute IoU **over the whole data set** (accumulate TP, FP, FN across images), not as an average of per-image scores, otherwise small classes appearing in few images are over-weighted or give 0/0.
- **Ignore label**: datasets mark "void" pixels (255) that must be excluded from the metric.

## Boundary-aware metrics

IoU is dominated by the **interior**. For thin structures, surgical margins or cutting tasks, the boundary matters: **boundary IoU** (IoU computed on a thin band around the contour), **boundary F-score** (precision/recall of boundary pixels within a tolerance), and the **Hausdorff distance** (the worst boundary error).

```python run title="A boundary F-score with a tolerance" level=advanced shared
def boundary(mask):
    m = mask.astype(np.uint8)
    return cv2.morphologyEx(m, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0

def boundary_f(truth_mask, pred_mask, tol=3):
    bt, bp = boundary(truth_mask), boundary(pred_mask)
    dt = cv2.distanceTransform((~bt).astype(np.uint8), cv2.DIST_L2, 3)      # distance of every pixel to the nearest true boundary pixel
    dp = cv2.distanceTransform((~bp).astype(np.uint8), cv2.DIST_L2, 3)
    precision = (dt[bp] <= tol).mean() if bp.any() else 0.0                  # predicted boundary pixels that are close to a true one
    recall = (dp[bt] <= tol).mean() if bt.any() else 0.0
    return 2 * precision * recall / (precision + recall + 1e-9)

disc_t, disc_p = truth == 1, pred == 1
print("disc: region IoU", round(float(iou[1]), 3), "   boundary F-score within 1 px:", round(float(boundary_f(disc_t, disc_p, 1)), 3), "  within 4 px:", round(float(boundary_f(disc_t, disc_p, 4)), 3))
```

## Instance and panoptic metrics

- **Instance segmentation** uses **mask AP** (COCO): like box AP, but the match uses **mask IoU** between predicted and true instance masks.
- **Panoptic quality (PQ)** (Kirillov et al.): match predicted and true segments with IoU > 0.5 (a one-to-one match is then guaranteed); then

:::formula Panoptic quality
\text{PQ} = \underbrace{\frac{\sum_{(p,g)\in TP}\text{IoU}(p,g)}{|TP|}}_{\text{segmentation quality (SQ)}} \times \underbrace{\frac{|TP|}{|TP| + \tfrac12|FP| + \tfrac12|FN|}}_{\text{recognition quality (RQ)}}
:::

SQ says how well the matched masks fit; RQ is an F1 score for finding the segments. PQ is reported separately for things and stuff (PQ_th, PQ_st).

```python run title="Panoptic quality for a few segments" level=advanced shared
def mask_iou(a, b):
    return (a & b).sum() / ((a | b).sum() + 1e-9)

truth_inst = [truth == 1, truth == 2, truth == 3]
pred_inst = [pred == 1, pred == 2, pred == 3]
matched_ious, used = [], set()
for t in truth_inst:
    best = max(range(len(pred_inst)), key=lambda j: mask_iou(t, pred_inst[j]))
    v = mask_iou(t, pred_inst[best])
    if v > 0.5 and best not in used:                                # IoU > 0.5 makes the match unique
        matched_ious.append(v); used.add(best)
tp_n = len(matched_ious); fp_n = len(pred_inst) - tp_n; fn_n = len(truth_inst) - tp_n
sq = sum(matched_ious) / tp_n; rq = tp_n / (tp_n + 0.5 * fp_n + 0.5 * fn_n)
print(f"matched segments {tp_n}, false positives {fp_n}, misses {fn_n}")
print(f"SQ (how well matched masks fit) {sq:.3f}   RQ (found them) {rq:.3f}   PQ = SQ x RQ = {sq * rq:.3f}")
```

## Choosing the metric

| Situation | Use |
|---|---|
| General semantic segmentation | mIoU (dataset-level), per-class IoU to see weak classes |
| Medical, small structures | Dice (and Hausdorff / boundary measures), per-case values and their spread |
| Very imbalanced (a thin crack on a big surface) | IoU/Dice of the **defect** class, not accuracy; also precision/recall at the pixel and at the **object** level |
| Instance tasks | Mask AP; also count error |
| Whole-scene tasks | Panoptic quality |
| Robot grasping from masks | Boundary accuracy and the error of the derived quantity (centre, orientation) |

:::interview Questions you may get
- "Semantic versus instance versus panoptic segmentation?" Class per pixel; separate masks per object; both (things with instance ids, stuff as regions).
- "Why is pixel accuracy a poor metric?" Dominated by large classes; a trivial all-background prediction can score high.
- "Relation between Dice and IoU?" `Dice = 2·IoU / (1 + IoU)`.
- "How do you compute mIoU properly?" Accumulate the confusion matrix over the whole dataset, then per-class IoU, then average over classes; ignore void pixels.
- "What does panoptic quality measure?" Segmentation quality of matched segments times recognition quality (an F1 over segments).
- "Which metric for a thin crack?" Defect-class IoU/Dice, boundary/object-level precision and recall; not accuracy.
:::

```quiz
? A model predicts "background" for all pixels in an image that is 98% background. Pixel accuracy is...
+ 98% (but the model is useless)
- 0%
- 50%
> Use IoU or Dice for the foreground classes.

? Per-class IoU is computed as...
+ TP / (TP + FP + FN)
- TP / (TP + TN)
- (TP + TN) / all pixels
> The same as Jaccard similarity.

? If a class has IoU 0.5, its Dice is about...
+ 0.67
- 0.5
- 0.25
> 2×0.5 / (1 + 0.5) = 0.667.

? What is the "stuff" in panoptic segmentation?
+ Amorphous regions such as sky, road and grass
- Countable objects such as people
- Background noise
> Things are countable objects; stuff is not.
```

:::problem A defect segmentation model reports mIoU 0.94 on a data set where defects cover 0.3% of the pixels. The plant says it misses real defects. Explain and propose better metrics. {level=medium tags="metrics,imbalance,defects"}
Think about what mIoU averages.

:::solution Model answer
mIoU averages the IoU of background (about 0.998) and defect classes; if there are only two classes, a poor defect IoU still gets pulled up by the background. Report the **defect-class IoU/Dice** separately, and judge by **object-level** measures: for each real defect, was any predicted region overlapping it (recall), and how many predicted regions have no real defect (false alarms per image)? Also look at the size distribution (tiny defects dominate the misses), compute the metrics per defect type and per size, and choose the operating threshold from the object-level PR curve and the cost of misses.
:::
:::

:::keypoints
- Semantic: class per pixel; instance: a mask per object; panoptic: both, with things and stuff.
- Confusion matrix → per-class IoU = TP/(TP+FP+FN), mIoU, Dice = 2TP/(2TP+FP+FN) = 2IoU/(1+IoU). Accumulate over the whole data set; ignore void pixels.
- Pixel accuracy misleads with imbalance; use boundary metrics for thin structures; mask AP for instances; PQ = SQ × RQ for panoptic.
- Match the metric to the use: defect IoU and object-level recall, not average accuracy.
:::

:::resources
- [Cityscapes benchmark: metrics](https://www.cityscapes-dataset.com/benchmarks/) — mIoU and instance AP definitions.
- [Kirillov et al.: Panoptic Segmentation](https://arxiv.org/abs/1801.00868) — panoptic quality.
- [Cheng et al.: Boundary IoU](https://arxiv.org/abs/2103.16562) — a boundary-sensitive metric.
:::
