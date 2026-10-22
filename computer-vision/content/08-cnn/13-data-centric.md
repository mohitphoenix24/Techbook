---
title: Data-Centric Vision — Imbalance, Noisy Labels, Active Learning
level: intermediate
time: 45
summary: In practice, data decides the result. Class imbalance (weights, resampling, focal loss), finding wrong labels with a model, active learning to label the most useful images first, annotation formats (COCO, YOLO, VOC), and a checklist for building a good data set.
---

Ask experienced vision engineers where accuracy gains come from, and they say: **the data**. Andrew Ng called it **data-centric AI**: keep the model fixed and improve the data. Better labels, more examples of failure cases, and balanced classes often beat a fancier architecture.

## Class imbalance

Most real problems are imbalanced: 1% defects, rare diseases, a few "stop" signs among thousands of other pictures. A network trained naively predicts the majority class and gets high accuracy with no value. Remedies, from simplest:

- **Better metrics** (precision, recall, PR curves) so you can see the problem.
- **Class weights** in the loss: weight rare classes more (for example inversely to frequency).
- **Resampling**: oversample the minority (with augmentation, so copies differ), or undersample the majority. A **balanced sampler** in the data loader draws classes equally.
- **Focal loss** (RetinaNet): down-weights easy examples so the many easy negatives do not dominate: `FL = −(1 − p_t)^γ · log(p_t)`.
- **Collect or synthesise more minority data**, especially **hard** cases.
- **Threshold tuning** after training, instead of 0.5, chosen on a validation set from the cost of errors.

```python run title="Class weights, resampling and focal loss" level=intermediate
import numpy as np
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import recall_score, precision_score
from sklearn.model_selection import train_test_split

X, y = load_digits(return_X_y=True)
X = X / 16
target = (y == 9).astype(int)                                           # "digit 9" is the rare positive class
keep = (target == 0) | (np.random.default_rng(0).random(len(y)) < 0.15)   # keep only 15% of the nines: strong imbalance
X, target = X[keep], target[keep]
print("positives:", int(target.sum()), "of", len(target), f"({target.mean() * 100:.1f}%)")

Xtr, Xte, ytr, yte = train_test_split(X, target, test_size=0.4, random_state=0, stratify=target)
for name, kw in [("plain", {}), ("class_weight='balanced'", {"class_weight": "balanced"})]:
    clf = LogisticRegression(max_iter=500, **kw).fit(Xtr, ytr)
    p = clf.predict(Xte)
    print(f"{name:26s} recall {recall_score(yte, p):.2f}   precision {precision_score(yte, p):.2f}")

def focal(p_true, gamma=2.0):
    return -((1 - p_true) ** gamma) * np.log(p_true)
for p in (0.95, 0.7, 0.3, 0.05):
    print(f"p(correct class) = {p:4.2f}: cross-entropy {-np.log(p):5.2f}   focal loss (gamma 2) {focal(p):6.3f}")
```

The weighted model catches more of the rare class (higher recall), usually at some cost in precision. Focal loss makes easy examples (p = 0.95) almost free (0.000 versus 0.05) while keeping hard ones (p = 0.05).

## Label noise

Real labels are wrong more often than people believe: 3–10% in famous benchmarks (ImageNet, CIFAR). Annotators disagree, instructions are vague, and tired labellers click quickly. Wrong labels hurt **training** (the network memorises them) and **evaluation** (you measure against wrong answers).

**Finding label errors with a model** (confident learning): train with cross-validation so each example is predicted by a model that did **not** see it; examples where the model confidently disagrees with the label are suspects. Review those first.

```python run title="Find mislabelled images with cross-validated predictions" level=intermediate
import numpy as np
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_predict

X, y = load_digits(return_X_y=True)
X = X / 16
rng = np.random.default_rng(0)
flip = rng.random(len(y)) < 0.08                                         # corrupt 8% of the labels
noisy = y.copy(); noisy[flip] = (y[flip] + rng.integers(1, 10, flip.sum())) % 10
print("labels flipped:", int(flip.sum()), "of", len(y))

proba = cross_val_predict(LogisticRegression(max_iter=400), X, noisy, cv=5, method="predict_proba")     # every image predicted by a model that did not see it
given_conf = proba[np.arange(len(y)), noisy]                              # the probability the model gives to the GIVEN label
order = np.argsort(given_conf)                                           # least believable labels first
for k in (50, 100, 150):
    found = flip[order[:k]].sum()
    print(f"review the {k:3d} most suspicious images: {found:3d} are really mislabelled ({found / flip.sum() * 100:.0f}% of all errors, precision {found / k:.2f})")
```

Reviewing the top 150 suspects (8% of the data) finds most of the wrong labels. This is how people clean benchmark data sets. Fixing labels often beats changing the architecture. **Noise-robust training** (label smoothing, early stopping, losses like bootstrapping, co-teaching, sample reweighting) helps when you cannot clean everything.

## Active learning: label the most useful images first

Labelling is expensive. Instead of labelling random images, train a model on what you have, find the unlabelled images it is **most unsure about**, label those, and repeat. Common selection rules: **lowest confidence**, **smallest margin** between the top two classes, **highest entropy**, and **diversity** (not ten near-identical hard images).

```python run title="Active learning versus random labelling" level=intermediate
import numpy as np
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

X, y = load_digits(return_X_y=True)
X = X / 16
Xpool, Xte, ypool, yte = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)

def run(strategy, seed, budget=200, start=20, step=20):
    rng = np.random.default_rng(seed)
    labelled = list(rng.choice(len(Xpool), start, replace=False))
    curve = []
    while len(labelled) <= budget:
        clf = LogisticRegression(max_iter=300).fit(Xpool[labelled], ypool[labelled]) if len(set(ypool[labelled])) > 1 else None
        curve.append((len(labelled), clf.score(Xte, yte)))
        rest = np.array(sorted(set(range(len(Xpool))) - set(labelled)))
        if strategy == "random":
            pick = rng.choice(rest, step, replace=False)
        else:                                                              # uncertainty sampling: smallest margin between the top two classes
            p = np.sort(clf.predict_proba(Xpool[rest]), axis=1)
            pick = rest[np.argsort(p[:, -1] - p[:, -2])[:step]]
        labelled += list(pick)
    return curve

for strategy in ("random", "uncertainty"):
    curves = np.array([[a for _, a in run(strategy, s)] for s in range(5)]).mean(0)
    print(f"{strategy:12s} accuracy after 20, 60, 100, 160, 200 labels:", np.round(curves[[0, 2, 4, 7, 9]], 3))
```

With the same labelling budget, choosing the uncertain images gives a better model. In practice the gain depends on the data; combine uncertainty with diversity, and watch for **sampling bias** (the model's blind spots stay unlabelled).

## Annotation formats

| Task | Format | Notes |
|---|---|---|
| Boxes | **COCO JSON**: `bbox = [x, y, width, height]` in pixels, category ids, one big file | The most common standard; also stores masks and keypoints |
| Boxes | **YOLO txt**: one file per image, lines `class cx cy w h`, **normalised** to 0–1 | Easy but loses image size info |
| Boxes | **Pascal VOC XML**: `xmin, ymin, xmax, ymax` per object | Older, still widespread |
| Masks | Instance masks as polygons or RLE (COCO); semantic masks as **PNG** images with class ids | Never save masks as JPEG |
| Keypoints | COCO keypoints: `(x, y, visibility)` triples | |
| Classes | Folder per class, or a CSV `filename,label` | |

```python run title="Convert between box formats" level=easy
import numpy as np

def coco_to_xyxy(b):  x, y, w, h = b; return [x, y, x + w, y + h]
def xyxy_to_yolo(b, W, H):  x1, y1, x2, y2 = b; return [(x1 + x2) / 2 / W, (y1 + y2) / 2 / H, (x2 - x1) / W, (y2 - y1) / H]
def yolo_to_xyxy(b, W, H):  cx, cy, w, h = b; return [(cx - w / 2) * W, (cy - h / 2) * H, (cx + w / 2) * W, (cy + h / 2) * H]

W, H = 640, 480
coco = [100, 120, 200, 150]                                              # x, y, width, height
xyxy = coco_to_xyxy(coco)
yolo = xyxy_to_yolo(xyxy, W, H)
print("COCO [x,y,w,h]  :", coco)
print("corners x1y1x2y2 :", xyxy)
print("YOLO normalised :", np.round(yolo, 4))
print("back to corners :", np.round(yolo_to_xyxy(yolo, W, H), 1))
```

Wrong box-format conversions (width versus x2, pixel versus normalised, `(x, y)` order) are one of the most common causes of "my detector trains but the boxes are in the wrong place".

## Building a good data set: a checklist

- **Define the task and the labels precisely** with examples and edge cases in written **guidelines**. Ambiguous classes give noisy labels.
- **Cover the real distribution**: lighting, cameras, backgrounds, seasons, sites, object variety, **and the rare failure cases** (night, rain, occlusion, motion blur).
- **Split correctly**: by scene/patient/site, never by frame; keep a **locked test set** that matches production, and a "hard cases" slice.
- **Measure annotator agreement** (double-label a sample; compute Cohen's kappa or IoU between annotators). It limits the achievable accuracy.
- **Quality control**: review samples, use consensus or expert review for hard cases, and re-check after model errors.
- **Version your data** (DVC, or dataset versions in your tool) and record where each image came from; keep a data card.
- **Privacy and consent**: faces, number plates, medical data need anonymisation and legal basis.
- **Close the loop in production**: log low-confidence and wrong predictions, label them, retrain (the **data flywheel**).
- **Synthetic data** (renderings, copy-paste, generative models, domain randomisation) can fill rare cases, but validate on **real** data.

:::interview Questions you may get
- "How do you handle a 1:1000 class imbalance?" Right metrics (PR, recall at precision), class weights or balanced sampling, focal loss, more minority data and augmentation, threshold tuning on validation.
- "How would you find wrong labels in a big data set?" Cross-validated predictions; review examples where the model confidently disagrees with the label; check the annotator agreement.
- "What is active learning?" Iteratively training a model and labelling the unlabelled examples it is most uncertain about (with diversity), to reach accuracy with fewer labels.
- "COCO versus YOLO box format?" COCO: `[x, y, w, h]` in pixels (top-left corner); YOLO: `[cx, cy, w, h]` normalised by image size.
- "What improves a model most: architecture or data?" Usually data quality and coverage; fix labels and add failure cases first.
:::

```quiz
? With 0.5% positives, which loss modification reduces the dominance of easy negatives?
+ Focal loss
- A larger batch size
- Dropout
> It down-weights well-classified examples.

? How do you find likely mislabelled images with a model?
+ Get cross-validated predictions and review images where the model strongly disagrees with the given label
- Look at the largest images
- Look at the training loss only
> Each image must be predicted by a model that did not train on it.

? What does uncertainty sampling in active learning choose to label?
+ The unlabelled images the current model is least sure about
- Random images
- The easiest images
> Hard, informative examples improve the model fastest.

? A YOLO label line is "2 0.5 0.4 0.2 0.1". What are the numbers?
+ class 2, then centre x, centre y, width, height, all normalised to 0-1
- Pixel corners
- Four class ids
> Convert with the image width and height.
```

:::problem A defect detector's accuracy plateaus at 93%, and your manager wants a bigger model. What data-centric steps do you try first? {level=medium tags="data-centric,debugging,labels"}
Think about what the errors look like.

:::solution Model answer
Look at the errors: build a grid of false positives and false negatives. Check for label noise (review the images where the model disagrees confidently; measure annotator agreement); ambiguous classes (merge or define clearer guidelines); missing situations (add examples of failure cases: lighting, angles, rare defects); imbalance (class weights, balanced sampling, thresholds); and leakage or a mismatched validation set. Slice the metric by line, shift, camera and defect type to find where it fails. Fix the data, retrain with the same model, and compare. Only after the data issues are solved is a bigger model worth trying.
:::
:::

:::keypoints
- Imbalance: right metrics, class weights, balanced sampling, focal loss, more minority data, tuned thresholds.
- Label noise is common (3–10%): find it with cross-validated predictions, clean the data, and measure annotator agreement.
- Active learning labels the most informative images first (uncertainty plus diversity).
- Know the annotation formats (COCO `[x,y,w,h]`, YOLO normalised centre format, VOC corners) and build data sets with guidelines, correct splits, versioning and a feedback loop.
:::

:::resources
- [Northcutt et al.: Confident Learning: Estimating Uncertainty in Dataset Labels](https://arxiv.org/abs/1911.00068) — the method behind label-error finding (cleanlab).
- [Andrew Ng: A Chat with Andrew on MLOps: From Model-centric to Data-centric AI](https://www.youtube.com/watch?v=06-AZXmwHjo) — the data-centric idea.
- [COCO dataset format](https://cocodataset.org/#format-data) — the annotation specification.
- [Lin et al.: Focal Loss for Dense Object Detection](https://arxiv.org/abs/1708.02002) — focal loss.
:::
