---
title: Small Objects, Crowds and Other Practical Tricks
level: advanced
time: 45
summary: Why small objects are hard and what to do: higher resolution, tiling with overlap and merging (written and tested), multi-scale training and test-time augmentation, copy-paste and mosaic, hard negative mining, and weighted box fusion.
---

Most real detection problems are not the clean COCO scenes of the papers. They have **tiny objects** (a screw in a 4K image, a person far away in a drone picture, a defect), **crowds**, **rare classes** and **domain shift**. This lesson is a toolbox for those cases.

## Why small objects are hard

- **Few pixels**: a 10 × 10 pixel object has little detail; after a stride-32 backbone it is a fraction of one feature cell.
- **Downscaling kills them**: resizing a 4000-pixel picture to 640 shrinks a 20-pixel object to 3 pixels.
- **Anchors and matching**: small boxes have low IoU with anchors, so few positives (and small localisation errors cost a lot of IoU: a 2-pixel error on a 10-pixel box drops IoU to 0.67).
- **Class imbalance and clutter**: lots of small background texture look similar.
- COCO's **AP_S** is typically half of **AP_L**.

## Tools, from cheap to expensive

1. **Higher input resolution**: train and test at 960, 1280 or more. The cost grows with the number of pixels.
2. **Finer feature levels**: use the stride-4 or stride-8 map (a **P2** level in FPN; YOLO "P2" heads) with small anchors.
3. **Tiling (slicing)**: cut the large image into overlapping tiles at native resolution, detect in each, and merge. The idea of **SAHI** (Slicing Aided Hyper Inference).
4. **Multi-scale training and test-time augmentation (TTA)**.
5. **Better data**: crops from the original-resolution images, copy-paste of small objects, mosaic.
6. **Context and tracking**: use temporal consistency in video; use scene priors (cars are on roads).
7. **Super-resolution / zoom stages**: a coarse detector finds regions, then a second pass looks at them at higher resolution (two-stage zoom-in).

## Tiling with overlap and merging

Objects cut by a tile border are partly seen in two tiles. **Overlap** the tiles (20–25%) so every object is complete in at least one tile, then convert the boxes to the global frame and remove duplicates.

```python run title="Tiling a large image, detecting per tile and merging" level=advanced shared
import cv2
import numpy as np

rng = np.random.default_rng(0)
W, H = 1280, 960
img = np.full((H, W, 3), 200, np.uint8)
img = np.clip(img + rng.normal(0, 4, img.shape), 0, 255).astype(np.uint8)
truth = []
for _ in range(60):                                                  # 60 small red discs (about 12-20 px)
    r = int(rng.integers(6, 11)); cx, cy = int(rng.integers(r + 2, W - r - 2)), int(rng.integers(r + 2, H - r - 2))
    if any(abs(cx - t[0]) < 30 and abs(cy - t[1]) < 30 for t in truth):
        continue
    cv2.circle(img, (cx, cy), r, (205, 40, 40), -1, cv2.LINE_AA); truth.append((cx, cy, r))
print("objects in the image:", len(truth))

def detect_tile(tile):                                               # a stand-in "detector": finds red blobs and returns (x1, y1, x2, y2, score)
    red = (tile[..., 0] > 140) & (tile[..., 1] < 110) & (tile[..., 2] < 110)
    n, _, stats, _ = cv2.connectedComponentsWithStats(red.astype(np.uint8))
    th, tw = tile.shape[:2]
    # like a real detector, it does not trust objects that are cut by the tile border: a half disc is not recognised
    return [(x, y, x + w, y + h, 0.9) for x, y, w, h, a in stats[1:] if a >= 60 and x > 0 and y > 0 and x + w < tw and y + h < th]

def tiles(H, W, size, overlap):
    step = int(size * (1 - overlap))
    ys = list(range(0, max(1, H - size + 1), step)); xs = list(range(0, max(1, W - size + 1), step))
    if ys[-1] + size < H: ys.append(H - size)
    if xs[-1] + size < W: xs.append(W - size)
    return [(x, y) for y in ys for x in xs]

def iou_ios(a, b):                                                   # IoU and "intersection over the smaller box"
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy; area = lambda q: (q[2] - q[0]) * (q[3] - q[1])
    return inter / (area(a) + area(b) - inter + 1e-9), inter / (min(area(a), area(b)) + 1e-9)

def merge(dets, ios_thr=0.6):                                        # drop boxes mostly contained in a better/larger one (partial boxes at tile borders)
    dets = sorted(dets, key=lambda d: -(d[2] - d[0]) * (d[3] - d[1]))
    keep = []
    for d in dets:
        if all(iou_ios(d, k)[1] < ios_thr for k in keep):
            keep.append(d)
    return keep

def run(size, overlap):
    all_dets = []
    for x, y in tiles(H, W, size, overlap):
        for x1, y1, x2, y2, s in detect_tile(img[y:y + size, x:x + size]):
            all_dets.append((x1 + x, y1 + y, x2 + x, y2 + y, s))              # tile coordinates -> image coordinates
    return all_dets, merge(all_dets)

for size, overlap in [(1280, 0.0), (320, 0.0), (320, 0.25)]:
    raw, merged = run(size, overlap)
    found = sum(any(abs((d[0] + d[2]) / 2 - cx) < 6 and abs((d[1] + d[3]) / 2 - cy) < 6 for d in merged) for cx, cy, r in truth)
    print(f"tile {size:4d}, overlap {overlap:.2f}: {len(raw):3d} raw boxes -> {len(merged):3d} after merging   objects found {found:2d} of {len(truth)}")
```

Without overlap, every object that falls on a tile border is **missed** (each half is cut, so the detector does not accept it). With overlap, each object is complete in some tile, but it may now be found in two tiles: the raw boxes double, and the merge step removes the duplicates. Merging uses **IoS** (intersection over the smaller box) as well as IoU, because a partial box is *contained in* the full one but has a low IoU with it.

Notes from practice: tile at the **same scale as training** (a model trained on 640-pixel crops should see 640-pixel tiles), also run one **full-image pass** at low resolution for large objects and merge, and expect **N× more compute** (the number of tiles).

## Multi-scale training and test-time augmentation

- **Multi-scale training**: each iteration resize the image randomly (for example 480–800 pixels): the model sees objects at many sizes and becomes robust.
- **TTA**: run inference on several versions (original, flipped, scaled 0.8/1.0/1.2), gather all boxes, and **fuse** them. Typically +1–2 AP at 3–6× the cost, used in competitions and offline processing.
- **Weighted box fusion (WBF)** is better than NMS for fusing: instead of discarding overlapping boxes, it **averages** the coordinates of a cluster of boxes, weighted by score.

```python run title="Weighted box fusion of several predictions" level=intermediate shared
def wbf(boxes, scores, iou_thr=0.55):
    order = np.argsort(-np.asarray(scores)); clusters = []
    for i in order:
        for c in clusters:
            fused = np.average([boxes[j] for j in c], axis=0, weights=[scores[j] for j in c])
            if iou_ios(boxes[i], fused)[0] > iou_thr:
                c.append(i); break
        else:
            clusters.append([i])
    out = []
    for c in clusters:
        out.append((np.average([boxes[j] for j in c], axis=0, weights=[scores[j] for j in c]), float(np.mean([scores[j] for j in c]))))
    return out

# the same object predicted by three augmented passes, each a little off
preds = [(100, 100, 200, 200), (104, 98, 206, 197), (97, 103, 198, 205)]
scr = [0.9, 0.8, 0.7]
fused, s = wbf(preds, scr)[0]
print("fused box:", np.round(fused, 1), " score", round(s, 2), "  (the truth is 100, 100, 200, 200)")
print("best single box:", preds[0], " -> WBF averages the errors of the three")
```

## Data tricks for small and rare objects

- **Copy-paste augmentation**: cut object instances (with masks) and paste them at random places and scales into other images. Very effective for rare and small classes.
- **Mosaic** and random scale-jitter, including zoom-**in** and zoom-**out**.
- **Crop around objects** at native resolution when training on huge images.
- **Oversample** images with rare classes; **hard negative mining**: after a first model, collect its false positives on negative images and add them as background examples.
- **Synthetic data** with domain randomisation (lighting, textures, camera) for rare defects, validated on real data.

## Crowds and occlusion

- Use **Soft-NMS / DIoU-NMS**, or NMS-free models.
- **Crowd-specific losses** (repulsion loss pushes predictions away from other objects), and annotating **visible parts** plus full bodies.
- Higher resolution and more queries/anchors; check recall at **crowd density** buckets.

## Long-tail and rare classes

- Class-balanced sampling, repeat-factor sampling (LVIS), **equalisation loss**, and large pretrained **vision-language** models that handle rare classes zero-shot (next lesson).

:::interview Questions you may get
- "Your detector fails on tiny objects in 4K images. What do you do?" Avoid downscaling: tile with overlap, higher resolution, a finer feature level with small anchors, multi-scale training, copy-paste of small objects; evaluate AP_S.
- "How do you merge detections from tiles?" Convert to global coordinates, then NMS or WBF; for objects cut at the borders use overlap and IoS-based suppression.
- "Weighted box fusion versus NMS?" NMS keeps one box and discards the others; WBF averages the cluster for a more accurate box.
- "How do you reduce false positives on background?" Add hard negative images, calibrate/raise thresholds, use context or temporal filtering.
- "What is copy-paste augmentation?" Pasting object instances into other images to increase the number and variety of (rare) objects.
:::

```quiz
? A 20-pixel object is downscaled by 6.25x (4000 to 640 pixels). Its size becomes about...
+ 3 pixels
- 20 pixels
- 12 pixels
> That is why resizing destroys small objects.

? Why overlap tiles when slicing a large image?
+ So that objects on tile borders appear complete in at least one tile
- To make inference faster
- To reduce memory
> Merge the duplicates afterwards.

? Why use IoS (intersection over the smaller box) when merging tile detections?
+ A partial box is contained in the full box but has a low IoU with it
- It is cheaper to compute
- It removes class labels
> IoS detects containment.

? What does weighted box fusion do?
+ Averages the coordinates of overlapping boxes weighted by score
- Deletes the lower-scoring boxes
- Adds anchors
> Often more accurate than picking one box.
```

:::problem A drone-survey detector must find 8-pixel-wide solar-panel defects in 20-megapixel images, on a laptop, in 30 seconds per image. Outline your approach. {level=hard tags="small-objects,tiling,design"}
Think about compute budget and the two-stage idea.

:::solution Model answer
Tile at native resolution with 20% overlap (a 20 MP image gives about 50–80 tiles of 640 pixels); a small fast model (YOLO-n/s at 640, TensorRT FP16) runs in 10–20 ms per tile, so about 1–2 seconds per image: within budget even with batching. Train on native-resolution crops with copy-paste of defects and hard negatives (panel edges, shadows, dirt); include a P2 head or use higher stride features with a small-anchor/anchor-free head; merge with IoS/IoU suppression or WBF; optionally run a **coarse pass** to find panel regions (to skip empty tiles), then the fine pass only there. Evaluate recall at a fixed false-alarm rate per image on held-out flights.
:::
:::

:::keypoints
- Small objects are hard (few pixels, downscaling, low anchor IoU). Keep resolution: higher input size, finer feature levels, tiling.
- Tiling: overlapping tiles at native scale, global coordinates, merge with NMS/IoS/WBF.
- Multi-scale training, TTA with weighted box fusion, copy-paste/mosaic augmentation, hard negative mining for rare and small objects.
- Crowds need Soft/DIoU-NMS or NMS-free detectors; rare classes need balanced sampling and pretrained vision-language models.
:::

:::resources
- [Akyon et al.: Slicing Aided Hyper Inference (SAHI)](https://arxiv.org/abs/2202.06934) — tiling for small objects.
- [Solovyev et al.: Weighted Boxes Fusion](https://arxiv.org/abs/1910.13302) — averaging instead of suppressing.
- [Ghiasi et al.: Simple Copy-Paste is a Strong Data Augmentation Method](https://arxiv.org/abs/2012.07177) — copy-paste for detection and segmentation.
:::
