---
title: Non-Maximum Suppression and Anchor Boxes
level: advanced
time: 55
summary: Two ideas shared by most detectors. NMS removes duplicate boxes (hard, soft and class-wise, written in NumPy), and anchors give the network reference boxes to correct. Box encoding (tx, ty, tw, th), assignment by IoU, and a tested encode/decode round trip.
---

A dense detector looks at thousands of places and proposes boxes. One object usually produces **many overlapping boxes**. And the network needs a convenient way to predict box coordinates. Both problems have classic answers: **non-maximum suppression** and **anchor boxes**.

## Non-maximum suppression (NMS)

:::flow Greedy NMS for one class
1. Sort | Order all boxes by score, highest first.
2. Take the best | Move the highest-scoring box to the output list.
3. Suppress | Delete every remaining box whose IoU with it exceeds a threshold (typically 0.5): they are probably duplicates of the same object.
4. Repeat | Until no boxes are left.
:::

Try it. Lower the IoU threshold and see duplicates disappear, then see a real neighbouring object get deleted. Switch to Soft-NMS to compare.

```viz algo=nms title="Greedy NMS and Soft-NMS"
```

```python run title="NMS from scratch (vectorised) and the class-wise trick" level=intermediate shared
import numpy as np

def iou_one_to_many(box, boxes):
    ix1 = np.maximum(box[0], boxes[:, 0]); iy1 = np.maximum(box[1], boxes[:, 1])
    ix2 = np.minimum(box[2], boxes[:, 2]); iy2 = np.minimum(box[3], boxes[:, 3])
    inter = np.clip(ix2 - ix1, 0, None) * np.clip(iy2 - iy1, 0, None)
    area = lambda b: (b[..., 2] - b[..., 0]) * (b[..., 3] - b[..., 1])
    return inter / (area(box) + area(boxes) - inter + 1e-9)

def nms(boxes, scores, iou_thr=0.5):
    """Returns the indices of the boxes to keep."""
    order = np.argsort(-scores)
    keep = []
    while len(order):
        i = order[0]
        keep.append(int(i))
        if len(order) == 1:
            break
        ious = iou_one_to_many(boxes[i], boxes[order[1:]])
        order = order[1:][ious <= iou_thr]                           # keep only boxes that do NOT overlap the chosen one much
    return keep

boxes = np.array([[10, 10, 60, 60], [14, 12, 64, 62], [8, 8, 58, 58],              # three boxes on one object
                  [100, 100, 150, 150], [104, 98, 156, 152],                          # two on a second object
                  [30, 30, 80, 80]], float)                                           # a box that sits between the two objects
scores = np.array([0.95, 0.88, 0.60, 0.92, 0.75, 0.40])
print("kept (IoU threshold 0.5):", nms(boxes, scores, 0.5))
print("kept (IoU threshold 0.2):", nms(boxes, scores, 0.2), " (stricter: the straddling box is removed)")

# class-wise NMS: boxes of different classes must not suppress each other. The classic trick: shift boxes by a class-dependent offset
classes = np.array([0, 0, 0, 1, 1, 1])
shifted = boxes + (classes * 10000)[:, None]
print("class-wise NMS keeps:", nms(shifted, scores, 0.5))
```

The output matches the picture: 0 and 3 are the best boxes of the two objects; the box between them (index 5) survives a threshold of 0.5 and is removed at 0.2. With **class-wise** NMS (done per class, or by offsetting boxes so different classes never overlap) a "dog" box does not delete an overlapping "person" box.

## The NMS threshold dilemma, and Soft-NMS

- **Threshold too low** (0.3): deletes boxes of real, **neighbouring** objects (people in a crowd).
- **Threshold too high** (0.7): leaves **duplicates** of one object (false positives).

**Soft-NMS** does not delete overlapping boxes. It **reduces their scores** by a factor that grows with the overlap, `s ← s · exp(−IoU²/σ)`, and lets the score threshold decide later. A real neighbouring object keeps a decent score. Other variants: **DIoU-NMS** (also considers centre distance), **weighted box fusion** (average the overlapping boxes instead of picking one), and **learned NMS**. **DETR-style detectors need no NMS at all** (a later lesson).

```python run title="Soft-NMS" level=intermediate shared
def soft_nms(boxes, scores, sigma=0.5, score_thr=0.3):
    boxes, scores = boxes.copy(), scores.copy()
    idx, out = list(range(len(boxes))), []
    while idx:
        best = max(idx, key=lambda i: scores[i])
        if scores[best] < score_thr:
            break
        out.append((best, round(float(scores[best]), 2)))
        idx.remove(best)
        for i in idx:                                                # decay the neighbours' scores by their overlap
            scores[i] *= np.exp(-(iou_one_to_many(boxes[best], boxes[i:i + 1])[0] ** 2) / sigma)
    return out

print("Soft-NMS keeps (index, decayed score):", soft_nms(boxes, scores))
print("duplicates (indices 1, 2, 4) got their scores reduced below 0.3 and drop out; the straddling box 5 may stay with a lower score")
```

## Anchor boxes

How does a network predict a box? Predicting `(x1, y1, x2, y2)` directly from a feature is hard, because the numbers vary hugely. Instead, at **every location** of a feature map we place a few reference boxes called **anchors** (also called default boxes or priors), with different **sizes** and **aspect ratios** (for example 3 scales × 3 ratios = 9 anchors per location). The network predicts, for each anchor:

- a **class score** (is there an object, and which class?), and
- four **offsets** that adjust the anchor to the object's box.

This turns a hard problem ("find a box from nothing") into an easy one ("how should I nudge this nearby template?").

### Box encoding

Offsets are expressed **relative to the anchor** and are scale-free. For an anchor with centre `(xa, ya)`, size `(wa, ha)` and a truth box `(x, y, w, h)`:

:::formula Box regression targets
t_x=\frac{x-x_a}{w_a},\quad t_y=\frac{y-y_a}{h_a},\quad t_w=\ln\frac{w}{w_a},\quad t_h=\ln\frac{h}{h_a}
:::

The centre shift is measured in anchor widths, and the size change is a **log ratio**, so a 20% larger box has `t_w = 0.18` whatever its absolute size. Decoding inverts this: `x = xa + tx·wa`, `w = wa·exp(tw)`.

```python run title="Encode and decode boxes relative to an anchor" level=intermediate shared
def encode(anchor, gt):                                              # both as (cx, cy, w, h)
    xa, ya, wa, ha = anchor; x, y, w, h = gt
    return np.array([(x - xa) / wa, (y - ya) / ha, np.log(w / wa), np.log(h / ha)])

def decode(anchor, t):
    xa, ya, wa, ha = anchor
    return np.array([xa + t[0] * wa, ya + t[1] * ha, wa * np.exp(t[2]), ha * np.exp(t[3])])

anchor = np.array([100.0, 100.0, 64.0, 64.0])
gt = np.array([112.0, 96.0, 80.0, 50.0])
t = encode(anchor, gt)
print("targets (tx, ty, tw, th):", np.round(t, 3))
print("decoded back to the box :", np.round(decode(anchor, t), 3), " original:", gt)
assert np.allclose(decode(anchor, t), gt)
print("same relative change on a 4x bigger anchor gives the same targets:", np.round(encode(anchor * np.array([1, 1, 4, 4]) , gt * np.array([1, 1, 4, 4])), 3)[2:])
```

(Many implementations also divide the targets by fixed "variances" like `(0.1, 0.1, 0.2, 0.2)` to make their scale about 1.)

### Assigning anchors to objects

During training, each anchor must be told whether it is a positive, a negative or ignored:

- **IoU ≥ 0.5–0.7** with some truth box → **positive**: it must predict that object's class and offsets.
- **IoU < 0.3–0.4** with every truth box → **negative** (background).
- In between → **ignored**.
- Also make sure every truth box gets **at least its best-matching anchor** as positive.

Since almost all anchors are background, there is **massive imbalance** (maybe 100,000 negatives per 20 positives). Solutions: **hard negative mining** (SSD keeps a 3:1 ratio of the hardest negatives), **sampling** a fixed positive/negative ratio (Faster R-CNN), or **focal loss** (RetinaNet).

Place the true box, and see which anchors match it:

```viz algo=anchors title="Which anchors match this object?"
```

```python run title="Generate anchors and match them to a box" level=intermediate shared
def make_anchors(fmap_h, fmap_w, stride, scales, ratios):
    """Anchors (cx, cy, w, h) for every cell of a feature map."""
    ys, xs = np.meshgrid((np.arange(fmap_h) + 0.5) * stride, (np.arange(fmap_w) + 0.5) * stride, indexing="ij")
    out = []
    for s in scales:
        for r in ratios:
            w, h = s * np.sqrt(r), s / np.sqrt(r)                    # ratio = w / h, with area s^2
            out.append(np.stack([xs, ys, np.full_like(xs, w), np.full_like(xs, h)], -1))
    return np.stack(out, 2).reshape(-1, 4)

anchors = make_anchors(16, 16, 16, scales=[32, 64, 128], ratios=[0.5, 1, 2])         # a 256 x 256 image, stride 16
print("anchors:", len(anchors), "= 16 x 16 locations x 9 anchors per location")

to_xyxy = lambda a: np.c_[a[:, 0] - a[:, 2] / 2, a[:, 1] - a[:, 3] / 2, a[:, 0] + a[:, 2] / 2, a[:, 1] + a[:, 3] / 2]
gt = np.array([70.0, 90.0, 190.0, 170.0])                            # one truth box (x1, y1, x2, y2)
ious = iou_one_to_many(gt, to_xyxy(anchors))
for thr in (0.7, 0.5, 0.3):
    print(f"anchors with IoU >= {thr}: {int((ious >= thr).sum()):3d}")
best = int(ious.argmax())
print("best anchor (cx, cy, w, h):", anchors[best], " IoU =", round(float(ious[best]), 3))
neg = int((ious < 0.3).sum())
print(f"negatives: {neg} -> negatives outnumber positives {neg // max(1, int((ious >= 0.5).sum()))} to 1")
```

## Choosing anchors

Anchors should cover the **sizes and shapes of your objects**. Defaults (COCO) are wrong for, say, very long thin parts or tiny objects. Run **k-means clustering on the training boxes** (with IoU as the distance) to pick anchor shapes (YOLOv2 introduced this), and check that every training box has some anchor with an IoU above the positive threshold. Anchors are also a **hyper-parameter burden**, which motivated **anchor-free** detectors (later lesson).

:::interview Questions you may get
- "Explain NMS." Sort boxes by score, keep the best, remove boxes overlapping it above an IoU threshold, repeat.
- "What are the failure modes of NMS?" A low threshold removes boxes of neighbouring real objects (crowds); a high threshold leaves duplicates; Soft-NMS reduces scores instead.
- "What is an anchor box?" A reference box at each feature-map location with a preset scale and aspect ratio; the network predicts class scores and offsets relative to it.
- "How are the box offsets parametrised?" `tx=(x−xa)/wa`, `ty=(y−ya)/ha`, `tw=ln(w/wa)`, `th=ln(h/ha)`.
- "How do you choose anchor sizes?" K-means on the training boxes with IoU distance; verify coverage.
- "How do you cope with the foreground/background imbalance?" Hard negative mining, sampling, focal loss.
:::

```quiz
? NMS with a very low IoU threshold (0.1) will most likely...
+ Delete boxes of different, overlapping real objects
- Leave many duplicates
- Increase the scores
> Anything overlapping the best box even slightly is removed.

? Why is tw = ln(w / wa) a good regression target?
+ It is scale-independent and symmetric for enlarging and shrinking
- It is always positive
- It avoids the use of anchors
> A 20% larger box gives the same tw whatever the size.

? What does Soft-NMS do differently from hard NMS?
+ Decays the scores of overlapping boxes instead of removing them
- Removes more boxes
- Needs no scores
> Real neighbouring objects keep a usable score.

? With anchors, most of them are...
+ Negatives (background), so imbalance must be handled
- Positives
- Ignored forever
> Hence hard negative mining or focal loss.
```

:::problem Detections of people in a crowded scene keep disappearing after NMS. Why, and what options do you have? {level=medium tags="nms,crowds,debugging"}
Think about overlap between real objects.

:::solution Model answer
People in crowds genuinely overlap (IoU above the 0.5 NMS threshold), so greedy NMS deletes the true neighbour. Options: raise the NMS threshold (0.6–0.7) and accept some duplicates; use Soft-NMS or DIoU-NMS (the distance between centres lets nearby but distinct objects survive); use a detector trained for crowds (a head that predicts several boxes per proposal, "CrowdDet"), or an NMS-free set-prediction detector (DETR-family); use visible-part boxes plus full-body boxes; improve the score calibration. Tune the threshold on crowded validation scenes and measure recall.
:::
:::

:::keypoints
- NMS: sort by score, keep the best, drop boxes overlapping it above an IoU threshold (class-wise). Soft-NMS decays scores; DETR needs none.
- Anchors are reference boxes per location; the network predicts class scores and offsets `(tx, ty, tw, th)` relative to them.
- Assign anchors by IoU (positive ≥ 0.5–0.7, negative < 0.3–0.4); handle imbalance with hard negative mining, sampling or focal loss.
- Choose anchor shapes by k-means on your boxes; anchor hyper-parameters motivate anchor-free methods.
:::

:::resources
- [Bodla et al.: Soft-NMS](https://arxiv.org/abs/1704.04503) — improving object detection with one line of code.
- [Ren et al.: Faster R-CNN](https://arxiv.org/abs/1506.01497) — anchors and the region proposal network.
- [Liu et al.: SSD: Single Shot MultiBox Detector](https://arxiv.org/abs/1512.02325) — default boxes and hard negative mining.
:::
