---
title: The YOLO Family — From v1 to v11
level: advanced
time: 55
summary: How YOLO grew from a 2016 idea into the most used real-time detector. What changed in each generation: anchors, multi-scale heads, CSP backbones, mosaic augmentation, the decoupled anchor-free head, task-aligned assignment, DFL and CIoU, and how to train and export a model in practice.
---

YOLO is the detector most engineers meet first: fast, simple to use, and good enough for most products. Interviewers often ask "what is YOLO and how did it evolve?" This lesson gives the story and the key ideas, so you can answer at any depth.

:::note Many authors, one name
"YOLO" is not one project. Joseph Redmon made v1–v3 (and stopped). Later versions come from different groups: v4 (Bochkovskiy et al.), v5 and v8/v11 (Ultralytics), YOLOX (Megvii), v6 (Meituan), v7 and v9 (Academia Sinica), v10 (Tsinghua), and more. Names reflect lineage and marketing as much as design. Compare models by **measured accuracy and latency**, not by version number.
:::

## Generations at a glance

| Version | Year | Main ideas |
|---|---|---|
| **v1** | 2016 | One network, S×S grid, direct box regression; real time but crude |
| **v2 / YOLO9000** | 2017 | Batch norm, **anchor boxes from k-means** on the data, higher input resolution, multi-scale training, passthrough layer |
| **v3** | 2018 | **Three scales** (an FPN-like neck), Darknet-53 with residual connections, independent logistic classifiers (multi-label) |
| **v4** | 2020 | "Bag of freebies/specials": **CSPDarknet**, PANet neck, **mosaic augmentation**, CIoU loss, Mish activation |
| **v5** | 2020 | PyTorch, easy training and export, auto-anchor, model sizes n/s/m/l/x |
| **YOLOX** | 2021 | **Anchor-free**, **decoupled head**, SimOTA label assignment |
| **v6, v7** | 2022 | Re-parameterised blocks (RepVGG style), "trainable bag of freebies", extended ELAN |
| **v8** | 2023 | Anchor-free, decoupled head, **task-aligned assignment**, **DFL** (distribution focal loss); detection, segmentation, pose, classification in one framework |
| **v9, v10** | 2024 | Programmable gradient information (v9); **NMS-free** training with dual assignments (v10) |
| **v11** | 2024 | Refined blocks (C3k2, attention in the neck), efficiency gains |

Models in the family are named by size: **n**ano, **s**mall, **m**edium, **l**arge, **x**-large. For example a nano model with 2–3 million parameters runs at hundreds of fps on a GPU and a few fps to tens of fps on a phone CPU; a large one gives a few points more AP at 10× the cost.

## The anatomy of a modern YOLO

:::flow Backbone, neck, head
Backbone | A CSP-style CNN (C2f / C3k2 blocks): extracts features at strides 8, 16 and 32 (P3, P4, P5). "CSP" splits the channels into two paths to cut computation and improve gradient flow.
Neck | A PAN/FPN: a top-down path (semantics to fine maps) and a bottom-up path (localisation detail to coarse maps) so every scale gets both.
Head | At each of the three scales, per location: a class branch and a box branch (a decoupled head). Anchor-free: each location predicts the distances to the four box sides (or a distribution over them).
Training-time assignment | Decide which locations are positives for each truth box (task-aligned assignment).
Post-processing | Score threshold, then NMS (except NMS-free versions).
:::

## Key ideas, each in a few sentences

**Anchor-free prediction.** Instead of offsets from preset anchors, each location predicts the **distance to the left, top, right and bottom edges** of the object it is responsible for. Fewer hyper-parameters, simpler.

**Decoupled head.** Classification and localisation need different features; separating them into two branches (instead of one shared conv) improves accuracy and convergence.

**Task-aligned assignment (TAL).** Which locations should be positives for an object? Not just "the centre cell". TAL ranks candidate locations by an **alignment metric** `t = s^α · u^β`, where `s` is the predicted class score for the true class and `u` is the IoU of the predicted box. It picks the top-k locations, so that **locations that are good at both classification and localisation** are trained as positives, and the score of a detection then agrees with its box quality. SimOTA (YOLOX) is a similar dynamic assignment.

**Box loss: CIoU and DFL.** Boxes are trained with **CIoU** (overlap + centre distance + aspect ratio). **Distribution focal loss (DFL)** predicts each edge distance as a **discrete distribution** (over, say, 16 bins) and takes the expected value, which handles ambiguous boundaries (blur, occlusion) better.

**Mosaic and strong augmentation.** Four training images are stitched into one (random scale and crop), so each batch contains many objects at many scales and contexts; plus mixup, HSV colour jitter, random affine, flips, and copy-paste. Mosaic is switched **off for the last ~10 epochs** so the model sees realistic images before finishing.

**Multi-scale, EMA, long schedules.** Exponential moving average of the weights, cosine learning-rate decay, 100–300 epochs from pretrained weights.

## Using YOLO with Ultralytics

The `ultralytics` package wraps training, validation, prediction and export in a few lines. (This snippet is from its documentation; it needs `pip install ultralytics`, which downloads pretrained weights.)

```python
# pip install ultralytics   (not run in this course: it needs a download and a GPU for training)
from ultralytics import YOLO

model = YOLO("yolo11n.pt")                                       # a small model pretrained on COCO
results = model("street.jpg")                                    # predict on one image
for r in results:
    print(r.boxes.xyxy, r.boxes.conf, r.boxes.cls)               # boxes in pixels, scores and class ids

# fine-tune on your own data
model.train(data="my_data.yaml", epochs=100, imgsz=640, batch=16)   # the YAML lists train/val folders and class names
metrics = model.val()                                            # mAP50, mAP50-95, precision, recall
model.export(format="onnx")                                      # also: engine (TensorRT), openvino, coreml, tflite
```

The dataset folder layout is one `images/` and one `labels/` folder per split, with one `.txt` per image in the **YOLO format** from the data lesson: `class cx cy w h`, normalised. The YAML:

```text
path: datasets/parts
train: images/train
val: images/val
names:
  0: scratch
  1: dent
  2: missing_screw
```

## Practical recipe

1. Start from a **pretrained** small/medium model; train 50–100 epochs at 640 px.
2. Check the **label format and a few augmented training images** (the trainer saves previews).
3. Look at the **PR curve and confusion matrix** (`val` outputs them). Pick the **confidence threshold** from the F1 or precision-recall curve for your application.
4. If small objects fail: raise `imgsz` (960/1280), tile, or use a model with a P2 head.
5. If there are many false positives on backgrounds: add **background images** (images with no objects and empty label files) and check for missing labels.
6. Export, then **benchmark on the target device** with the real runtime and precision (FP16/INT8).

## What to say about YOLO in an interview

- It is a **dense one-stage detector**: backbone + neck + head, one forward pass, NMS afterwards.
- Evolution: **anchors → anchor-free**, coupled → **decoupled head**, static → **dynamic assignment**, plus better losses (CIoU/DFL) and heavy augmentation (mosaic).
- Trade-off: speed and simplicity versus the very best accuracy on small or crowded objects; recently, **transformer detectors (RT-DETR)** and **NMS-free** YOLOs challenge it.
- Always mention **evaluation on your own data** and **deployment benchmarking**.

```python run title="Task-aligned assignment: the alignment metric" level=intermediate
import numpy as np

# five candidate locations for one object: (predicted class score for the true class, IoU of the predicted box with the truth)
cands = {"A": (0.90, 0.30), "B": (0.60, 0.80), "C": (0.85, 0.75), "D": (0.20, 0.90), "E": (0.50, 0.50)}
alpha, beta = 1.0, 6.0                                            # YOLOv8 defaults: localisation counts a lot
print("location  cls score  IoU    alignment t = s^a * u^b")
scores = {k: s ** alpha * u ** beta for k, (s, u) in cands.items()}
for k, (s, u) in cands.items():
    print(f"{k:8s} {s:9.2f} {u:5.2f} {scores[k]:20.4f}")
top = sorted(scores, key=scores.get, reverse=True)[:2]
print("positives chosen (top-2 by alignment):", top, "  (A has the best class score but a poor box: it is not chosen)")
```

:::interview Questions you may get
- "What are the main parts of YOLOv8?" CSP backbone, PAN-FPN neck, a decoupled anchor-free head; trained with task-aligned assignment, CIoU and DFL, with mosaic augmentation.
- "How does an anchor-free head predict a box?" Each location regresses the distances to the four sides of its object (or a distribution over them).
- "What is mosaic augmentation and why turn it off at the end?" Combining four images in one for diversity; it is unrealistic, so the last epochs use normal images to match the test distribution.
- "How is a positive sample chosen in YOLOv8?" Task-aligned assignment: rank candidates by `s^α·u^β` and take the top-k.
- "When would you choose RT-DETR over YOLO?" When you want NMS-free end-to-end inference and strong accuracy with a GPU, accepting a larger model.
- "What do the n/s/m/l/x suffixes mean?" Model width and depth scaling, trading accuracy for speed.
:::

```quiz
? What does the decoupled head in modern YOLO do?
+ Uses separate branches for classification and box regression
- Separates the backbone from the neck
- Splits the image into two parts
> Different tasks need different features.

? Why is mosaic augmentation switched off for the last epochs?
+ So the model finishes on realistic images that match the test distribution
- Because it is slow
- Because it removes labels
> Mosaic images have artificial seams and scales.

? What does an anchor-free head predict at each location?
+ The distances to the four sides of the object box (or a distribution over them)
- Offsets from nine anchors
- A mask
> No preset anchor shapes are needed.

? In task-aligned assignment, a location with a high class score but a poor box is...
+ Less likely to be chosen as a positive
- Always chosen
- Ignored by the loss
> The metric multiplies classification quality and IoU.
```

:::problem Your YOLO model has good validation mAP but produces many false detections on empty background in production. What do you do? {level=medium tags="yolo,false-positives,data"}
Think about what the training data did not contain.

:::solution Model answer
Training images may contain objects almost everywhere, so the model rarely saw "nothing" or confusing backgrounds. Add **background images** (including hard negatives like patterns that resemble the object) with empty labels, usually 0–10% of the dataset; check for **missing annotations** that make real objects look like false positives; raise the confidence threshold using the PR curve; use test-time filtering (size, region of interest, temporal consistency over several frames); mine hard negatives from production logs and retrain; and verify that the production preprocessing (resize/letterbox, colour order) matches training.
:::
:::

:::keypoints
- YOLO: dense one-stage detector with backbone, neck (PAN-FPN) and head; versions differ by authors and ideas, so compare measured speed and accuracy.
- Evolution: grid → anchors (k-means) → multi-scale → CSP/mosaic/CIoU → anchor-free decoupled heads with task-aligned assignment and DFL → NMS-free and attention.
- Practical recipe: pretrained small model, check labels and augmentations, pick the confidence threshold from the PR curve, add background images, export and benchmark on the device.
:::

:::resources
- [Redmon and Farhadi: YOLOv3: An Incremental Improvement](https://arxiv.org/abs/1804.02767) — a very readable technical report.
- [Bochkovskiy et al.: YOLOv4](https://arxiv.org/abs/2004.10934) — the bag of freebies and specials.
- [Ge et al.: YOLOX: Exceeding YOLO Series in 2021](https://arxiv.org/abs/2107.08430) — anchor-free, decoupled head, SimOTA.
- [Ultralytics documentation](https://docs.ultralytics.com) — training, export and tasks for YOLOv8/v11.
:::
