---
title: Detection in Practice — Train, Evaluate, Analyse Errors, Deploy
level: advanced
time: 55
summary: A full workflow. Prepare data, fine-tune a detector (a tiny Faster R-CNN is trained and checked here), choose thresholds, take apart the errors (classification, localisation, duplicates, background, misses), compare models by accuracy and latency, and a deployment checklist.
---

You now know the parts. This lesson puts them into a workflow, and shows how to learn from the model's mistakes.

## 1. Data first

- **Define the classes** and what counts as an object (is a half-visible box one? a pile of 10 screws? what minimum size?). Write it down with example pictures.
- **Collect from the real setup**: the real camera, angles, lighting and backgrounds. Include **negative images** (no objects) and hard look-alikes.
- **Split by session/site**, never by frame. Keep a **locked test set**.
- Check box formats, look at **label statistics**: number of objects per image, box sizes, aspect ratios, class counts. These numbers choose the input size, anchors and the strategy for small objects.

```python run title="Look at the label statistics before training" level=easy shared
import cvlab
import numpy as np

boxes = []
for seed in range(200):
    _, bs = cvlab.scene(n=4, seed=seed)
    boxes += [b for b in bs]
w = np.array([b[2] - b[0] for b in boxes]); h = np.array([b[3] - b[1] for b in boxes]); cls = np.array([b[4] for b in boxes])
print("objects:", len(boxes), " per image:", len(boxes) / 200)
print("width  min/median/max:", w.min(), int(np.median(w)), w.max(), "   height min/median/max:", h.min(), int(np.median(h)), h.max())
print("aspect ratio w/h  10th/50th/90th percentile:", np.round(np.percentile(w / h, [10, 50, 90]), 2))
print("class counts:", {c: int((cls == c).sum()) for c in sorted(set(cls))})
print("share of objects smaller than 40 px:", round(float((np.maximum(w, h) < 40).mean()), 3))
```

## 2. Train a baseline

Start from a **pretrained** detector and the default recipe, train, and see the numbers **before** changing anything. The block trains a tiny Faster R-CNN on synthetic scenes of boxes, balls and cones, and measures it on held-out scenes. (Runs on your computer; random initial weights, so it is only a demonstration of the pipeline, but it learns the task in about 300 steps.)

```python local check title="Train and evaluate a small detector end to end"
import numpy as np
import torch
import cvlab
from torchvision.models.detection import fasterrcnn_mobilenet_v3_large_320_fpn
from torchvision.ops import box_iou

torch.manual_seed(0); np.random.seed(0)
CLASSES = {"box": 1, "ball": 2, "cone": 3}                               # 0 is reserved for background

def sample(seed):
    img, boxes = cvlab.scene(n=3, seed=seed)
    image = torch.tensor(img).permute(2, 0, 1).float() / 255                 # (3, H, W), floats 0..1
    target = {"boxes": torch.tensor([b[:4] for b in boxes], dtype=torch.float32), "labels": torch.tensor([CLASSES[b[4]] for b in boxes])}
    return image, target

data = [sample(i) for i in range(80)]
train, test = data[:60], data[60:]
device = "cuda" if torch.cuda.is_available() else "cpu"
model = fasterrcnn_mobilenet_v3_large_320_fpn(weights=None, weights_backbone=None, num_classes=4, min_size=240, max_size=320).to(device)
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)

model.train()
for step in range(300):
    idx = np.random.randint(0, len(train), 4)
    images = [train[i][0].to(device) for i in idx]
    targets = [{k: v.to(device) for k, v in train[i][1].items()} for i in idx]
    loss = sum(model(images, targets).values())                              # the four detection losses
    optimizer.zero_grad(); loss.backward(); optimizer.step()

model.eval()
tp = fp = fn = 0
with torch.no_grad():
    for image, target in test:
        out = model([image.to(device)])[0]
        keep = out["scores"] > 0.5                                           # the operating threshold
        pb, pl = out["boxes"][keep].cpu(), out["labels"][keep].cpu()
        gb, gl = target["boxes"], target["labels"]
        matched = set()
        if len(pb):
            ious = box_iou(pb, gb)
            for p in range(len(pb)):
                j = int(ious[p].argmax())
                if ious[p, j] > 0.5 and pl[p] == gl[j] and j not in matched:
                    tp += 1; matched.add(j)
                else:
                    fp += 1
        fn += len(gb) - len(matched)
precision, recall = tp / max(tp + fp, 1), tp / max(tp + fn, 1)
print(f"held-out scenes: TP {tp}, FP {fp}, FN {fn}  ->  precision {precision:.2f}, recall {recall:.2f}")
assert precision > 0.8 and recall > 0.8
```

On real data, expect more: pretrained weights, 50–300 epochs, careful augmentation, and a threshold chosen from the PR curve.

## 3. Choose the threshold from the use case

The detector gives a score per box. The **operating point** (score threshold) decides precision and recall. Choose it from the cost of errors: a missed defect versus a false alarm. Use the validation PR curve and pick, for example, "the highest threshold with recall ≥ 95%" or "the highest recall with precision ≥ 90%". Report precision and recall **at that point**, not only mAP.

## 4. Error analysis: what kind of mistakes?

mAP is one number. To improve the model you need to know **which kinds of errors** dominate. The classic breakdown (from the TIDE toolbox):

| Error type | Meaning |
|---|---|
| **Classification** | Right place (IoU ≥ 0.5), wrong class |
| **Localisation** | Right class, box overlaps the truth but IoU between 0.1 and 0.5 |
| **Both** | Wrong class and poor box |
| **Duplicate** | A second detection of an already-found object |
| **Background** | A detection on nothing (false alarm) |
| **Missed** | A truth object with no detection |

The block below classifies the false positives of a simulated detector. Each category suggests a different fix.

```python run title="Break the errors down by type" level=advanced shared
import cvlab
import numpy as np

def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy; u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / u

rng = np.random.default_rng(1)
classes = ["box", "ball", "cone"]
counts = dict(correct=0, classification=0, localisation=0, duplicate=0, background=0, missed=0)
for img in range(60):
    _, truth = cvlab.scene(n=4, seed=img)
    dets = []
    for t in truth:
        r = rng.random()
        if r < 0.08: continue                                                       # a missed object
        box = np.array(t[:4]) + rng.normal(0, 3 if r < 0.7 else 14, 4)              # most boxes are accurate, some are sloppy
        cls = t[4] if rng.random() > 0.1 else rng.choice(classes)                   # 10% wrong class
        dets.append((box, cls, rng.uniform(0.5, 1)))
        if rng.random() < 0.1: dets.append((box + rng.normal(0, 2, 4), cls, rng.uniform(0.4, 0.8)))      # a duplicate
    for _ in range(int(rng.integers(0, 3))):                                         # false alarms on the background
        x, y = rng.uniform(0, 250), rng.uniform(0, 180); dets.append((np.array([x, y, x + 40, y + 40]), rng.choice(classes), rng.uniform(0.3, 0.7)))
    taken = set()
    for box, cls, score in sorted(dets, key=lambda d: -d[2]):
        ious = [iou(box, t[:4]) for t in truth]; j = int(np.argmax(ious)); best = ious[j]
        if best >= 0.5 and truth[j][4] == cls and j not in taken: counts["correct"] += 1; taken.add(j)
        elif best >= 0.5 and truth[j][4] == cls: counts["duplicate"] += 1
        elif best >= 0.5: counts["classification"] += 1
        elif best >= 0.1: counts["localisation"] += 1
        else: counts["background"] += 1
    counts["missed"] += len(truth) - len(taken)
total_err = sum(v for k, v in counts.items() if k != "correct")
for k, v in counts.items():
    print(f"{k:15s} {v:4d}" + (f"   ({v / total_err * 100:4.1f}% of all errors)" if k != "correct" else ""))
```

How to read the result: many **classification** errors → better class definitions, more data of confusing classes, a stronger backbone; **localisation** → better box loss, higher resolution, a refinement stage, cleaner annotations; **duplicates** → tune NMS or switch to an NMS-free model; **background** → add hard negatives and background images, raise the threshold; **missed** → more data for those cases, a lower threshold, smaller-object techniques, check labels. Fix the **largest bucket** first, and look at example images from each.

## 5. Compare models fairly: accuracy versus latency

Pick the model by the **trade-off**, measured on **your hardware**. Typical orders of magnitude on COCO (approximate numbers from the model cards; they depend on settings): a YOLO nano model has about 37–40 mAP at 1–2 ms on a good GPU; a small one about 45; a large one about 53 at 6–10 ms; RT-DETR-L about 53 at 10 ms; two-stage ResNet-50 Faster R-CNN about 37–42 at 30–60 ms. Always measure:

- **End-to-end latency** (including pre- and post-processing, NMS, and the data transfer), not only the network.
- **Throughput** with batching, if relevant.
- **Memory** and **power**.
- Accuracy on **your validation set**, not COCO.

## 6. Deployment checklist

- **Export**: ONNX → TensorRT / OpenVINO / Core ML / TFLite; check the outputs against the PyTorch model on a set of images (numerical differences, NMS inside or outside the graph).
- **Precision**: FP16 (almost free), INT8 with **calibration** on representative data (check accuracy: small objects suffer most).
- **Pre-processing parity**: the same resize/letterbox, colour order, normalisation as in training; decode boxes back to original coordinates.
- **Input resolution** and **batch size** fixed for speed; warm-up before timing.
- **Thresholds** (score, NMS IoU, max detections) in a config file.
- **Tracking** between frames to smooth and fill gaps (the multi-object-tracking lesson).
- **Monitoring**: log scores, counts and a sample of images; watch for drift (new lighting, new objects); a feedback loop to label failures and retrain.
- **Fail-safe behaviour**: what does the robot or system do when no object is found or the score is low?

:::interview Questions you may get
- "Walk me through building an object detector for a new product." Define classes, collect and label real data with proper splits, baseline from a pretrained model, error analysis, thresholds from the PR curve, optimise and benchmark on target hardware, monitor in production.
- "How do you analyse a detector's errors?" Categorise false positives and misses (classification, localisation, duplicate, background, missed) and fix the largest category with targeted data or model changes.
- "mAP improved but the customer is unhappy. Why?" mAP averages over thresholds and classes; check precision/recall at the operating point, the important classes, small objects and latency.
- "How do you pick a model for an edge device?" Fix the latency/power budget, benchmark candidate models on the device with the real runtime and quantisation, choose the best accuracy within the budget.
- "What can go wrong when exporting to TensorRT/INT8?" Numerical differences, unsupported operators, NMS placement, calibration data that is not representative, accuracy loss on small objects.
:::

```quiz
? A detector has many errors where the box overlaps the truth with IoU 0.3 and the right class. This is a...
+ Localisation error
- Classification error
- Background error
> Better box regression or higher resolution may help.

? How should you choose the score threshold for deployment?
+ From the validation precision-recall curve, using the cost of misses versus false alarms
- Always 0.5
- Always the value that maximises mAP
> mAP does not tell you the operating point.

? Which dataset should you use to compare models for your product?
+ Your own validation/test set from the real setup
- Only COCO
- Only the training set
> COCO numbers do not predict performance in your domain.

? What is a sensible fix for many false detections on empty backgrounds?
+ Add background images and hard negatives, and tune the threshold
- Use a larger learning rate
- Remove the classifier
> False alarms mean the model has not seen enough "nothing" or look-alikes.
```

:::problem After deployment, a pick-and-place detector works in the morning but its precision falls in the afternoon. Describe how you would investigate. {level=hard tags="deployment,drift,debugging"}
Think about what changes during the day.

:::solution Model answer
Compare images from morning and afternoon: sunlight direction, shadows, glare on parts, white balance or auto-exposure drift, camera temperature or focus change, different operators/parts. Log the scores, detection counts and sample images with timestamps; inspect the false positives (are they shadows? reflections?). Check camera settings (lock exposure and white balance). Fix: add afternoon images (and shadow/glare augmentation) to the training data and retrain, add a light shield or controlled lighting, and monitor input statistics (brightness, sharpness) with an alert. Keep a hard-negative set from production for regression tests.
:::
:::

:::keypoints
- Workflow: define and collect data (correct splits), pretrained baseline, thresholds from the PR curve, error analysis, model choice by measured accuracy and latency, export and deploy, monitor.
- Break errors into classification, localisation, duplicates, background and misses; fix the biggest bucket with targeted data or changes.
- Compare models on your own validation set and hardware, including pre- and post-processing time.
- Export carefully (ONNX/TensorRT, FP16/INT8 with calibration), keep preprocessing parity, and monitor drift in production.
:::

:::resources
- [Bolya et al.: TIDE: A General Toolbox for Identifying Object Detection Errors](https://arxiv.org/abs/2008.08115) — the error breakdown used here.
- [TorchVision detection reference scripts](https://github.com/pytorch/vision/tree/main/references/detection) — training recipes for Faster/RetinaNet/SSD.
- [MMDetection](https://github.com/open-mmlab/mmdetection) and [Detectron2](https://github.com/facebookresearch/detectron2) — the two big detection toolboxes.
:::
