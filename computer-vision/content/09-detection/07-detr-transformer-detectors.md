---
title: DETR and Transformer Detectors
level: advanced
time: 55
summary: Detection as set prediction. DETR's object queries and bipartite (Hungarian) matching loss, why it needs no anchors and no NMS, its slow training and how Deformable DETR, DAB/DINO and RT-DETR fixed it. Matching written from scratch, and a transformer decoder you can run.
---

Dense detectors predict **thousands** of boxes and then clean up with NMS: hand-designed parts (anchors, assignment rules, NMS) sit between the network and the answer. In 2020 Carion et al. asked: can we treat detection as a **set prediction** problem and let a **transformer** output the final list of objects directly?

## DETR in one picture

:::flow DETR (DEtection TRansformer)
CNN backbone | A ResNet gives a feature map (for example 25×34×2048). A 1×1 conv reduces it to 256 channels.
Positional encoding | Add 2-D position information to every feature, since attention has no sense of place.
Transformer encoder | Self-attention across all feature-map positions: every location can look at every other (global context).
Object queries | N = 100 learned vectors ("slots"), each will produce one object (or "no object").
Transformer decoder | Each query attends to itself (the other queries) and to the encoder features; after 6 layers it holds an object's information.
Prediction heads | A small MLP gives a class (including a "no object" class) and a box (cx, cy, w, h) for each of the N queries.
Training loss | Match the N predictions to the true objects one-to-one with the Hungarian algorithm, then compute class and box losses on the matched pairs.
:::

Output: **exactly N predictions** per image; those predicted "no object" are discarded. There is **no NMS**, **no anchors**, no hand-made assignment.

## Bipartite matching loss

Suppose an image has 3 true objects and the model makes 100 predictions. Which prediction should be responsible for which object? DETR finds the **best one-to-one assignment** with the Hungarian algorithm, minimising a matching cost for each (prediction, truth) pair:

:::formula Matching cost
\text{cost}(i,j) = -\,\hat p_i(c_j) \;+\; \lambda_{L1}\,\lVert b_j - \hat b_i\rVert_1 \;+\; \lambda_{giou}\,\big(1-\text{GIoU}(b_j,\hat b_i)\big)
:::

The loss is then computed on the matched pairs; unmatched predictions must predict "no object". Because the matching is **one-to-one**, a second prediction near the same object is **penalised** (it is matched to "no object"), so the network **learns not to produce duplicates**: that is why NMS is no longer needed.

```python run title="Hungarian matching with class and box costs" level=advanced shared
import numpy as np
from scipy.optimize import linear_sum_assignment

def giou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    hull = (max(a[2], b[2]) - min(a[0], b[0])) * (max(a[3], b[3]) - min(a[1], b[1]))
    return inter / union - (hull - union) / hull

truth_boxes = [(20, 20, 100, 90), (150, 60, 230, 160), (60, 150, 120, 220)]
truth_cls = [0, 1, 0]
# 6 queries: some good, one duplicate of object 0, some background
pred_boxes = [(22, 18, 98, 92), (148, 62, 226, 158), (58, 148, 118, 224), (25, 25, 95, 88), (0, 0, 30, 30), (200, 200, 240, 240)]
pred_prob = np.array([[0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.7, 0.2, 0.1], [0.6, 0.3, 0.1], [0.2, 0.2, 0.6], [0.3, 0.3, 0.4]])    # class probabilities; the last column is "no object"

cost = np.zeros((len(pred_boxes), len(truth_boxes)))
for i, (pb, pp) in enumerate(zip(pred_boxes, pred_prob)):
    for j, (tb, tc) in enumerate(zip(truth_boxes, truth_cls)):
        l1 = np.abs(np.array(pb) - np.array(tb)).sum() / 100
        cost[i, j] = -pp[tc] + 1.0 * l1 + 1.0 * (1 - giou(pb, tb))
rows, cols = linear_sum_assignment(cost)
print("cost matrix (rows = 6 predictions, columns = 3 truth objects):\n", np.round(cost, 2))
for r, c in zip(rows, cols):
    print(f"prediction {r} is matched to truth object {c} (cost {cost[r, c]:.2f})")
unmatched = sorted(set(range(6)) - set(rows))
print("unmatched predictions (trained to say 'no object'):", unmatched, "  <- includes prediction 3, the duplicate of object 0")
```

Prediction 3 overlaps object 0 nearly as well as prediction 0, but only one of them can be matched. The other is told to predict "no object", which is how the model learns to suppress duplicates.

## A transformer decoder you can run

On your computer, a minimal DETR-like head: flattened image features go into a transformer decoder with 20 learned object queries; a linear layer gives the class logits and a 3-layer MLP the boxes.

```python local check title="Object queries, a decoder and the prediction heads (shapes)"
import torch
from torch import nn
from torchvision.ops import generalized_box_iou, box_convert

torch.manual_seed(0)
d_model, n_queries, n_classes = 64, 20, 5
features = torch.randn(2, 100, d_model)                           # (batch, 10x10 = 100 flattened positions, channels): backbone + encoder output
memory = features
queries = nn.Parameter(torch.randn(n_queries, d_model))           # the learned object queries
decoder = nn.TransformerDecoder(nn.TransformerDecoderLayer(d_model, nhead=4, dim_feedforward=128, batch_first=True), num_layers=2)
class_head = nn.Linear(d_model, n_classes + 1)                    # +1 for "no object"
box_head = nn.Sequential(nn.Linear(d_model, d_model), nn.ReLU(), nn.Linear(d_model, 4), nn.Sigmoid())     # (cx, cy, w, h) normalised to 0..1

hs = decoder(queries.unsqueeze(0).expand(2, -1, -1), memory)      # each query attends to the image features
logits, boxes = class_head(hs), box_head(hs)
print("decoder output:", tuple(hs.shape), "-> class logits", tuple(logits.shape), " boxes", tuple(boxes.shape))
assert logits.shape == (2, 20, 6) and boxes.shape == (2, 20, 4)

pred = box_convert(boxes[0], "cxcywh", "xyxy")
truth = box_convert(torch.tensor([[0.3, 0.3, 0.2, 0.2], [0.7, 0.6, 0.3, 0.2]]), "cxcywh", "xyxy")
print("GIoU matrix between 20 predictions and 2 truths:", tuple(generalized_box_iou(pred, truth).shape))
```

## The weaknesses of the original DETR

- **Slow convergence**: 500 epochs of training (versus ~36 for Faster R-CNN). Cross-attention starts uniform and takes long to learn to focus.
- **Poor on small objects**: it uses a single low-resolution (stride-32) feature map, with global attention that is quadratic in the number of positions.
- Object queries have no clear spatial meaning.

## The fixes (what to know)

| Model | Fix |
|---|---|
| **Deformable DETR** (2020) | Each query attends to only a **few sampling points** around a reference point (**deformable attention**), across **multi-scale** features. 10× faster training, much better on small objects |
| **Conditional DETR, Anchor-DETR, DAB-DETR** | Queries are **anchor boxes** (positional queries with explicit x, y, w, h that are refined layer by layer) |
| **DN-DETR** | **Denoising training**: also feed noisy ground-truth boxes as queries to learn to reconstruct them; stabilises matching, speeds convergence |
| **DINO** (DETR with improved denoising anchor boxes) | Contrastive denoising, mixed query selection, look-forward-twice; state of the art on COCO at the time (Swin/ViT backbones) |
| **RT-DETR** (2023) | A **real-time** DETR: efficient hybrid encoder (attention only on the coarsest map), query selection from the encoder, no NMS; competitive with YOLO on speed and accuracy |
| **Group DETR, H-DETR** | One-to-many auxiliary assignments during training to give more positive signal, one-to-one at inference |
| **Co-DETR** and large ViT backbones | Top of the leaderboards |

Notice the trend: **dense detectors** borrow DETR's one-to-one matching to drop NMS (YOLOv10), while **DETR variants** borrow dense detectors' multi-scale features and denoising to train faster. The two families converge.

## DETR versus the others

| | Anchor-based / dense (YOLO, RetinaNet) | DETR family |
|---|---|---|
| Hand-designed parts | Anchors, assignment, NMS | Only the matching loss |
| Duplicates | NMS removes them | One-to-one matching trains them away |
| Training | Fast, mature | Slower (improved in later versions) |
| Small objects | Good with FPN | Needs multi-scale/deformable attention |
| Crowded scenes | NMS can delete real boxes | No NMS: better in principle |
| Extension | Masks via separate heads | Natural for panoptic (queries to masks: MaskFormer, Mask2Former) |
| Latency | Very low | Higher, but RT-DETR is real-time |

DETR's **object-query / set-prediction** idea became a general design: **Mask2Former** (segmentation), **SAM**'s mask decoder, **Q-Former** in vision-language models, **MOTR** (tracking by queries), and many 3-D detectors all use learned queries.

:::interview Questions you may get
- "How does DETR work?" CNN backbone + transformer encoder, a decoder with N learned object queries, heads for class and box; trained with a Hungarian matching loss; no anchors or NMS.
- "Why does DETR not need NMS?" One-to-one matching in training penalises duplicates, so the model learns to output one prediction per object.
- "What is the bipartite matching cost?" Class probability term, L1 box distance and GIoU between each prediction and each truth.
- "Why did DETR train slowly and how was it fixed?" Global attention starts diffuse; deformable attention with multi-scale features, denoising queries and anchor-based queries speed it up.
- "What are object queries?" Learned embeddings, each responsible for finding at most one object; they interact via self- and cross-attention.
- "RT-DETR versus YOLO?" RT-DETR is end-to-end (no NMS) with a hybrid encoder; YOLO is lighter and well supported; compare on your hardware.
:::

```quiz
? What replaces NMS in DETR?
+ One-to-one Hungarian matching during training
- A larger backbone
- Anchor boxes
> Duplicates are matched to "no object" and so learned away.

? How many predictions does DETR output for each image?
+ A fixed number N (for example 100), most of them "no object"
- One per anchor
- One per pixel
> Predicted "no object" slots are discarded.

? What problem does deformable attention address?
+ Slow convergence and poor small-object detection from global attention on one coarse map
- Over-confident predictions
- Colour constancy
> Each query samples a few points across multiple scales.

? What does the Hungarian algorithm compute here?
+ The minimum-cost one-to-one assignment between predictions and truth objects
- The IoU of two boxes
- The class probabilities
> It decides which query is responsible for which object.
```

:::problem Compare how a YOLO-style detector and a DETR-style detector deal with a scene of 30 overlapping people. {level=hard tags="detr,crowds,nms"}
Think about duplicates and overlaps.

:::solution Model answer
YOLO-style: dense predictions, many boxes per person; NMS must remove duplicates while keeping overlapping neighbours: a trade-off (a low IoU threshold deletes real people, a high one keeps duplicates); Soft-NMS or crowd-specific heads help. DETR-style: each query is trained, via one-to-one matching, to claim one person; overlapping people are separate queries with different content, so there is no suppression step that can delete a real person; this can be better in dense scenes, provided the model is trained well (enough queries, denoising/deformable improvements, high resolution). Practical choice: measure recall and duplicates on crowded data; RT-DETR or an NMS-free YOLO are good options.
:::
:::

:::keypoints
- DETR frames detection as set prediction: backbone + transformer, N object queries, class and box heads, Hungarian matching loss; no anchors, no NMS.
- One-to-one matching teaches the model not to produce duplicates.
- Original DETR trains slowly and is weak on small objects; Deformable DETR, DN/DINO and RT-DETR fix this with multi-scale deformable attention, denoising and efficient encoders.
- Learned queries became a general tool (Mask2Former, Q-Former, MOTR); dense detectors now borrow one-to-one matching (YOLOv10).
:::

:::resources
- [Carion et al.: End-to-End Object Detection with Transformers (DETR)](https://arxiv.org/abs/2005.12872) — the paper.
- [Zhu et al.: Deformable DETR](https://arxiv.org/abs/2010.04159) — faster convergence and small objects.
- [Zhang et al.: DINO: DETR with Improved DeNoising Anchor Boxes](https://arxiv.org/abs/2203.03605) — the strong variant.
- [Zhao et al.: DETRs Beat YOLOs on Real-time Object Detection (RT-DETR)](https://arxiv.org/abs/2304.08069) — real-time DETR.
:::
