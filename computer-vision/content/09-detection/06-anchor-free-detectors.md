---
title: Anchor-Free Detectors — CenterNet, FCOS, CornerNet
level: advanced
time: 50
summary: Detect without anchors. Objects as points (CenterNet) with a heatmap, a size regression and peak picking that replaces NMS, FCOS's per-pixel box distances and centerness, CornerNet's keypoint pairs, and label assignment strategies. Heatmap targets and decoding written from scratch.
---

Anchors work, but they add many hyper-parameters (scales, ratios, IoU thresholds), many predictions (most of them negatives), and they fit oddly shaped objects poorly. **Anchor-free** detectors remove the preset boxes. There are two main flavours: **point-based** detectors (find the object's centre) and **dense distance** detectors (each pixel inside an object predicts the box around it).

## CenterNet: objects as points

Zhou et al. (2019): an object is **its centre point**. The network outputs, at a stride-4 resolution:

- a **heatmap** per class, `H × W × C`: a peak at each object centre (a "keypoint"),
- a **size** map: the box width and height at each location,
- an **offset** map: the sub-pixel correction lost to the stride.

To detect: find the **local maxima** of the heatmap (a 3 × 3 max-pooling replaces NMS!), read the size and offset there, and output the box. The same idea gives **keypoints** (pose) and **3-D boxes** by adding other output maps.

### Heatmap targets

The ground-truth heatmap has a **Gaussian bump** at each object centre, whose radius depends on the box size (bigger objects, wider bump). Training uses a **focal-loss** variant (penalty-reduced), so locations near the centre are not punished as hard negatives.

```python run title="CenterNet targets and decoding" level=advanced shared
import numpy as np

H = W = 64                                                           # output resolution (the image is 256 and the stride is 4)
stride, C = 4, 2

def gaussian_peak(heat, cx, cy, sigma):
    ys, xs = np.ogrid[:heat.shape[0], :heat.shape[1]]
    g = np.exp(-((xs - cx) ** 2 + (ys - cy) ** 2) / (2 * sigma ** 2))
    np.maximum(heat, g, out=heat)                                      # overlapping objects keep the larger value

boxes = [(30, 40, 130, 120, 0), (150, 60, 220, 200, 1), (60, 150, 100, 190, 0)]        # (x1, y1, x2, y2, class) in image pixels
heat = np.zeros((C, H, W)); size = np.zeros((2, H, W)); offset = np.zeros((2, H, W)); mask = np.zeros((H, W), bool)
for x1, y1, x2, y2, cls in boxes:
    cx, cy = (x1 + x2) / 2 / stride, (y1 + y2) / 2 / stride            # the centre on the output map (a float)
    ix, iy = int(cx), int(cy)
    sigma = max(1.0, ((x2 - x1) + (y2 - y1)) / stride / 12)            # bigger objects get a wider bump
    gaussian_peak(heat[cls], ix, iy, sigma)
    size[:, iy, ix] = [x2 - x1, y2 - y1]                               # the regression targets exist only at the centre cell
    offset[:, iy, ix] = [cx - ix, cy - iy]
    mask[iy, ix] = True
print("heatmap shape:", heat.shape, " peaks at the centres:", [tuple(np.unravel_index(heat[c].argmax(), heat[c].shape)) for c in range(C)][:2])

def decode(heat, size, offset, thr=0.3, k=10):
    """3x3 max-pool 'NMS' on the heatmap, then read size and offset at the surviving peaks."""
    out = []
    for c in range(heat.shape[0]):
        h = heat[c]
        padded = np.pad(h, 1, constant_values=-1)
        local_max = np.max([padded[dy:dy + H, dx:dx + W] for dy in range(3) for dx in range(3)], axis=0)
        ys, xs = np.where((h == local_max) & (h >= thr))               # peaks: equal to the max of their 3x3 neighbourhood
        for y, x in zip(ys, xs):
            w_, h_ = size[:, y, x]; ox, oy = offset[:, y, x]
            cx, cy = (x + ox) * stride, (y + oy) * stride
            out.append((cx - w_ / 2, cy - h_ / 2, cx + w_ / 2, cy + h_ / 2, c, float(h[y, x])))
    return sorted(out, key=lambda d: -d[5])[:k]

for d in decode(heat, size, offset):
    print("decoded box:", tuple(round(v, 1) for v in d[:4]), "class", d[4], "score", round(d[5], 2))
assert len(decode(heat, size, offset)) == 3
```

The three objects are recovered **without anchors and without NMS**: peaks are the detections. Its limits: two objects with exactly the same centre collide; large objects have weak centre evidence; and keypoint-based post-processing (decoding) needs care.

## FCOS: every pixel predicts a box

Tian et al. (2019), **Fully Convolutional One-Stage** detection. Every location `(x, y)` on a feature map that lies **inside** a ground-truth box is a positive sample. It regresses four distances `(l, t, r, b)` from that location to the box sides, and a class. Two extras fix the problems of "every pixel":

- **Multi-level assignment by size**: each FPN level handles a range of box sizes (small objects on fine levels), which also resolves most overlaps.
- **Centerness**: pixels near the **edge** of a box give poor predictions. A branch predicts how central the location is, and the final score is `class score × centerness`, so NMS prefers central locations:

:::formula Centerness
\text{centerness}=\sqrt{\frac{\min(l,r)}{\max(l,r)}\cdot\frac{\min(t,b)}{\max(t,b)}}
:::

```python run title="FCOS targets: distances and centerness" level=intermediate shared
box = (40, 60, 200, 140)                                              # x1, y1, x2, y2
print("location (x, y)  ->  (l, t, r, b)           centerness")
for (x, y) in [(120, 100), (60, 70), (190, 135), (45, 100), (300, 300)]:
    l, t, r, b = x - box[0], y - box[1], box[2] - x, box[3] - y
    if min(l, t, r, b) <= 0:
        print(f"({x:3d}, {y:3d})          outside the box: not a positive sample")
        continue
    ctr = np.sqrt(min(l, r) / max(l, r) * min(t, b) / max(t, b))
    print(f"({x:3d}, {y:3d})          ({l:3d}, {t:3d}, {r:3d}, {b:3d})   {ctr:10.2f}")
```

The centre of the box has centerness 1.0; near an edge it falls towards 0, so those predictions are down-weighted.

## CornerNet and keypoint-style detectors

**CornerNet** (2018) detects each box as a **pair of corner keypoints** (top-left and bottom-right) with heatmaps, and groups corners into boxes by **embedding vectors** (corners of the same object get similar embeddings). It introduced **corner pooling** (a pooling that looks along rows and columns to find a corner). **CenterNet (Duan et al.)** and **ExtremeNet** are variants. These are less used now, but the idea of **grouping keypoints with embeddings** returns in multi-person pose estimation.

## Label assignment: the quiet key

With dense predictions, the hard question is: **which locations are positives for which object?** Hand-made rules (the centre cell; all pixels in the box; IoU with anchors) were replaced by **adaptive** strategies:

| Strategy | Idea |
|---|---|
| **ATSS** (adaptive training sample selection) | Per object, take the top-k anchors by centre distance on each level, set the IoU threshold from their mean + std |
| **OTA / SimOTA** | Treat assignment as an optimal-transport problem: choose positives that minimise a cost combining class and box loss |
| **Task-aligned (TOOD, YOLOv8)** | Rank by `score^α · IoU^β` |
| **Dynamic k** | The number of positives per object depends on how many good candidates exist |

Better assignment often improves AP by 1–3 points with no change in the architecture, and anchor-free or anchor-based detectors then differ little: **assignment matters more than anchors**.

## Pros and cons

| | Anchor-free | Anchor-based |
|---|---|---|
| Hyper-parameters | Fewer (no anchor shapes) | Scales, ratios, IoU thresholds |
| Odd-shaped objects | Handled naturally | Need suitable anchors |
| Predictions | Fewer candidates | Many anchors |
| Duplicates | CenterNet: peaks replace NMS; others still use NMS | NMS |
| Training stability | Needs good assignment | Mature recipes |

:::interview Questions you may get
- "How does CenterNet detect objects?" A heatmap peak at each centre, plus size and offset maps; peaks found by 3×3 max pooling (no NMS).
- "What is centerness in FCOS and why is it needed?" A score that is 1 at the box centre and falls towards the edges; it suppresses low-quality predictions from edge pixels.
- "Advantages of anchor-free detectors?" Fewer hyper-parameters, no anchor design, better for odd aspect ratios.
- "What is label assignment and why does it matter?" Deciding which predictions are trained as positives for each object; adaptive strategies (ATSS, SimOTA, task-aligned) give large gains.
- "How does CornerNet group corners into boxes?" With learned embeddings: corners of the same object have similar embeddings.
:::

```quiz
? How does CenterNet remove duplicate detections?
+ It keeps only heatmap peaks that are maxima of their 3×3 neighbourhood
- With 0.5-IoU NMS
- By sorting boxes
> A max-pooling peak extraction acts as a cheap NMS.

? What does FCOS predict at each positive location?
+ Distances to the four sides of the box, class scores and a centerness
- An anchor index
- Only the class
> Locations inside the box are positives.

? What problem does centerness solve?
+ Pixels near box edges give poor boxes; it down-weights them
- Missing classes
- Slow training
> The final score multiplies it with the class score.

? What matters more than anchors versus no anchors, according to ATSS?
+ How positive and negative samples are assigned
- The backbone depth
- The input colour space
> Adaptive assignment closed most of the gap.
```

:::problem You detect people with CenterNet and two people standing exactly behind each other are detected as one. Why does it happen and what would you change? {level=medium tags="centernet,occlusion,limitations"}
Think about the representation.

:::solution Model answer
A point-based detector represents each object by one centre. If two centres fall on the same location (or within the same heatmap peak at stride 4), the peaks merge and one of them is lost. Mitigations: predict at a higher resolution (stride 2), use multiple points or part-based representations, add the visible-part box or head box as a second keypoint, use a detector with set prediction (DETR-style) or dense per-pixel predictors with multi-level assignment (FCOS), or include a depth cue. Measure on crowded data with recall at fixed IoU.
:::
:::

:::keypoints
- CenterNet: objects as centre points; heatmap + size + offset; 3×3 max-pool peak picking replaces NMS.
- FCOS: every pixel inside a box regresses `(l, t, r, b)` and a class; FPN levels by size; centerness suppresses edge pixels.
- CornerNet groups corner keypoints with embeddings. Anchor-free removes anchor hyper-parameters.
- Label assignment (ATSS, SimOTA, task-aligned) is the key design choice for dense detectors.
:::

:::resources
- [Zhou et al.: Objects as Points (CenterNet)](https://arxiv.org/abs/1904.07850) — the point-based detector.
- [Tian et al.: FCOS: Fully Convolutional One-Stage Object Detection](https://arxiv.org/abs/1904.01355) — dense per-pixel detection.
- [Law and Deng: CornerNet](https://arxiv.org/abs/1808.01244) — corner keypoints.
- [Zhang et al.: ATSS](https://arxiv.org/abs/1912.02424) — adaptive sample selection.
:::
