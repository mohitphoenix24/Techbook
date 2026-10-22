---
title: Metrics for Classifiers — Precision, Recall, ROC, Calibration
level: intermediate
time: 45
summary: Why accuracy lies when classes are unbalanced. The confusion matrix, precision, recall, F1, the effect of the threshold, ROC and precision-recall curves, multi-class averaging, top-k accuracy and calibration. You build them from scratch.
---

You trained a classifier. "It is 98% accurate" sounds great. But is it? The right metric depends on the problem, and picking the wrong one is a classic interview trap.

## The confusion matrix

For a yes/no problem (defect or good part), every prediction is one of four outcomes:

| | Model says "defect" | Model says "good" |
|---|---|---|
| **Really a defect** | **TP** true positive (caught it) | **FN** false negative (missed it) |
| **Really good** | **FP** false positive (false alarm) | **TN** true negative |

Everything else is computed from these four counts:

:::formula The main metrics
\text{accuracy}=\frac{TP+TN}{N},\quad \text{precision}=\frac{TP}{TP+FP},\quad \text{recall}=\frac{TP}{TP+FN},\quad F_1=\frac{2PR}{P+R}
:::

- **Precision**: of the things the model flagged, how many were really positive? (*How trustworthy is an alarm?*)
- **Recall** (sensitivity, true-positive rate): of all real positives, how many were found? (*How much do we miss?*)
- **F1**: the harmonic mean of the two; it is low if either is low.

## Why accuracy lies

Suppose 1 part in 100 is defective. A "model" that always says "good" is **99% accurate** and **completely useless** (recall 0). With imbalanced classes, use precision, recall, F1, or PR curves.

```python run title="High accuracy, zero use" level=easy
import numpy as np

rng = np.random.default_rng(0)
y_true = (rng.random(10000) < 0.01).astype(int)          # 1% defects
y_lazy = np.zeros_like(y_true)                           # always says "good"

def metrics(y, p):
    tp = int(((y == 1) & (p == 1)).sum()); fp = int(((y == 0) & (p == 1)).sum())
    fn = int(((y == 1) & (p == 0)).sum()); tn = int(((y == 0) & (p == 0)).sum())
    prec = tp / (tp + fp) if tp + fp else float("nan")
    rec = tp / (tp + fn) if tp + fn else float("nan")
    return dict(TP=tp, FP=fp, FN=fn, TN=tn, accuracy=round((tp + tn) / len(y), 4), precision=prec, recall=rec)

print("always 'good':", metrics(y_true, y_lazy))
```

## The threshold decides the trade-off

Most models output a **score** (a probability). You choose a **threshold**: above it, say "defect". A low threshold catches more defects (recall up) but raises false alarms (precision down). A high threshold does the opposite. There is no free lunch: choose by the **cost of each error**. Missing a cracked part may cost 100 times more than a false alarm.

Move the threshold and the class overlap:

```viz algo=confusion title="Threshold, confusion matrix, ROC and PR"
```

## ROC and precision-recall curves

Sweeping the threshold from high to low traces a curve:

- **ROC curve**: true-positive rate (recall) against **false-positive rate** (`FP / (FP + TN)`). The **AUC** (area under it) is 0.5 for guessing and 1.0 for perfect. ROC is insensitive to class balance, which can **hide** poor precision when positives are rare.
- **Precision-recall (PR) curve**: precision against recall. It reacts strongly to imbalance, so it is the better choice when positives are rare. Its area is the **average precision (AP)**, the same AP that object detectors report.

```python run title="ROC and PR from scratch" level=intermediate shared
import numpy as np

rng = np.random.default_rng(1)
n_pos, n_neg = 100, 9900                                        # 1% positives
scores = np.r_[rng.normal(2.0, 1.0, n_pos), rng.normal(0.0, 1.0, n_neg)]
labels = np.r_[np.ones(n_pos), np.zeros(n_neg)]

order = np.argsort(-scores)                                     # sort by score, highest first
tp = np.cumsum(labels[order]); fp = np.cumsum(1 - labels[order])
tpr, fpr = tp / n_pos, fp / n_neg
precision, recall = tp / (tp + fp), tp / n_pos
auc = np.trapezoid(tpr, fpr)
ap = np.sum(np.diff(np.r_[0, recall]) * precision)               # average precision: area under the PR curve
print("ROC AUC:", round(float(auc), 3), "  (looks great)")
print("average precision:", round(float(ap), 3), "  (the honest number when positives are rare)")
i = np.searchsorted(tpr, 0.9)
print(f"at recall 0.90 the precision is only {precision[i]:.2f}: most alarms are false")

from sklearn.metrics import roc_auc_score, average_precision_score
print("sklearn agrees:", round(roc_auc_score(labels, scores), 3), round(average_precision_score(labels, scores), 3))
```

ROC AUC around 0.92 looks excellent, yet at 90% recall most alarms are false, because there are 99 times more good parts than defects. The PR curve shows this immediately.

## Multi-class problems

With 10 classes you have a 10 × 10 confusion matrix. Read the **rows** (what really was class A, and where did it go?). To get one number:

- **Macro average**: compute the metric per class, then average. Treats rare classes equally.
- **Micro average**: pool all decisions, then compute. Dominated by common classes (equals accuracy for single-label problems).
- **Weighted average**: per-class metric weighted by class size.
- **Top-k accuracy**: the correct class is among the `k` highest-scoring ones (ImageNet reports top-1 and top-5).

```python run title="Confusion matrix and averages for 10 classes" level=intermediate shared
import numpy as np
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, classification_report
from sklearn.model_selection import train_test_split

X, y = load_digits(return_X_y=True)
Xtr, Xte, ytr, yte = train_test_split(X / 16, y, test_size=0.3, random_state=0, stratify=y)
clf = LogisticRegression(max_iter=500).fit(Xtr, ytr)
pred = clf.predict(Xte)
cm = confusion_matrix(yte, pred)
print("confusion matrix (rows = true digit, columns = predicted digit):\n", cm)
off = cm.copy(); np.fill_diagonal(off, 0)
i, j = np.unravel_index(off.argmax(), off.shape)
print(f"most common mistake: true {i} predicted as {j} ({off[i, j]} times)")
proba = clf.predict_proba(Xte)
top2 = np.mean([yte[k] in np.argsort(-proba[k])[:2] for k in range(len(yte))])
print("top-1 accuracy:", round(float((pred == yte).mean()), 3), "  top-2 accuracy:", round(float(top2), 3))
```

## Calibration: can you trust the probability?

A model that says "90% sure" should be right 90% of the time. Modern neural networks are often **over-confident**. **Calibration** measures this: group predictions by confidence, and compare the average confidence with the actual accuracy in each group. The **expected calibration error (ECE)** is the weighted average gap. Calibration matters whenever the probability is used for decisions (should the robot pick? should a human review?). Fixes: **temperature scaling** (divide logits by a learned `T`), label smoothing, ensembles.

```python run title="Reliability: confidence versus accuracy" level=intermediate shared
conf = proba.max(1); correct = (proba.argmax(1) == yte)
edges = np.linspace(0.3, 1.0, 8)
ece = 0
print("confidence bin   share of data   mean confidence   accuracy")
for lo, hi in zip(edges[:-1], edges[1:]):
    m = (conf >= lo) & (conf < hi + (hi == 1.0) * 1e-9)
    if m.sum():
        ece += m.mean() * abs(conf[m].mean() - correct[m].mean())
        print(f"{lo:.1f} - {hi:.1f} {m.mean():14.2f} {conf[m].mean():17.2f} {correct[m].mean():10.2f}")
print("expected calibration error (ECE):", round(float(ece), 3))
```

## Choosing the metric: a short guide

| Situation | Look at |
|---|---|
| Balanced classes, equal costs | Accuracy, macro-F1 |
| Rare positives, missing is costly (defects, disease) | Recall at an acceptable precision; PR curve; cost-weighted error |
| Alarms are costly (human review) | Precision at a fixed recall |
| Ranking quality | ROC AUC, average precision, top-k |
| Probabilities are used | Log-loss, calibration (ECE), Brier score |
| Detection / segmentation | mAP, IoU (coming modules) |

:::interview Questions you may get
- "Why is accuracy a bad metric for imbalanced data?" A model that always predicts the majority class gets high accuracy with no value; use precision, recall, F1, PR curves.
- "Precision versus recall, and how does the threshold affect them?" Lowering the threshold raises recall and lowers precision; choose by the cost of FP versus FN.
- "ROC versus PR curves?" ROC is insensitive to class imbalance and can look optimistic with rare positives; PR shows precision directly.
- "Macro versus micro averaging?" Macro averages per-class scores equally; micro pools all examples, so frequent classes dominate.
- "What is calibration?" Whether predicted probabilities match observed frequencies; measured by reliability diagrams and ECE; fixed with temperature scaling.
:::

```quiz
? 1% of parts are defective. A model always predicts "good". Its accuracy is...
+ 99%, while recall is 0
- 1%
- 50%
> Accuracy hides that it never finds a defect.

? You lower the decision threshold. What generally happens?
+ Recall goes up and precision goes down
- Recall goes down and precision goes up
- Both go up
> More items are flagged: more catches, more false alarms.

? When positives are very rare, which curve is more informative?
- ROC
+ Precision-recall
- A histogram of pixels
> ROC can look excellent while precision is poor.

? A network says "95% confident" but is right only 80% of the time at that confidence. It is...
+ Over-confident (poorly calibrated)
- Well calibrated
- Under-confident
> Temperature scaling can fix this.
```

:::problem A cracked-part detector has 90% recall and 20% precision at its default threshold on a line with 0.5% defects. The plant manager is unhappy. How do you explain it and what do you propose? {level=medium tags="precision-recall,threshold,production"}
Use the numbers.

:::solution Model answer
At 0.5% prevalence, even a small false-positive rate produces many false alarms compared with the few real defects: 80% of the flagged parts are good. The model may be fine (high recall), but precision is low because positives are rare. Options: raise the threshold to trade some recall for precision (choose the point on the PR curve from the cost of a missed crack versus a false reject); add a second-stage check (a bigger model or human review of flagged parts); improve the model with more hard negatives; and report precision/recall at the working point with confidence intervals, not accuracy. Estimate the real cost per error to pick the threshold.
:::
:::

:::keypoints
- Confusion matrix: TP, FP, FN, TN. Precision = TP/(TP+FP), recall = TP/(TP+FN), F1 combines them.
- Accuracy misleads with imbalanced classes. The threshold trades precision against recall; choose it from error costs.
- ROC AUC can hide poor precision when positives are rare; use PR curves and average precision.
- Multi-class: macro, micro, weighted averages, top-k. Check calibration (ECE) when probabilities matter.
:::

:::resources
- [scikit-learn: metrics and scoring](https://scikit-learn.org/stable/modules/model_evaluation.html) — every metric in this lesson.
- [Davis and Goadrich: The Relationship Between Precision-Recall and ROC Curves](https://www.biostat.wisc.edu/~page/rocpr.pdf) — why they differ.
- [Guo et al.: On Calibration of Modern Neural Networks](https://arxiv.org/abs/1706.04599) — over-confidence and temperature scaling.
:::
