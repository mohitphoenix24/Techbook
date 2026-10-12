---
title: Classification & Metrics
level: intermediate
time: 32
summary: Logistic regression from scratch and with scikit-learn, then the metrics that really matter — accuracy, precision, recall, F1, confusion matrix, ROC-AUC and thresholds. Essential for evaluating any AI system.
---

Classification answers "which category?" — spam or not, positive or negative, which of 10 digits. Evaluating classifiers properly is a skill you will use constantly, including for **LLM evaluations** ("was the answer correct?", "did the guardrail catch the bad input?").

## Logistic regression

:::def Logistic regression
A classification model: compute a weighted sum of the features (like linear regression), then squash it through the **sigmoid** function to get a probability between 0 and 1. Predict class 1 if the probability is above a threshold (usually 0.5).
:::

:::def Sigmoid
The S-shaped function `σ(z) = 1 / (1 + e^(−z))`. It turns any number into a value between 0 and 1. Big positive → close to 1; big negative → close to 0; zero → exactly 0.5.
:::

:::formula Logistic regression
p(y = 1 | x) = σ(w · x + b) = 1 / (1 + e^−(w·x + b))
:::

```python run level=easy
import numpy as np

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

for z in [-6, -2, -0.5, 0, 0.5, 2, 6]:
    print(f"z={z:>4}  ->  p={sigmoid(z):.3f}")
```

### Training it from scratch

The loss for classification is **binary cross-entropy** (log loss): it punishes confident wrong answers heavily. Its gradient has the same friendly shape as before.

```python run level=intermediate
import numpy as np

rng = np.random.default_rng(0)
n = 400
X = np.vstack([rng.normal([-1.5, -1], 1.0, (n // 2, 2)), rng.normal([1.5, 1], 1.0, (n // 2, 2))])
y = np.array([0] * (n // 2) + [1] * (n // 2))

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

w, b, lr = np.zeros(2), 0.0, 0.1
for epoch in range(300):
    p = sigmoid(X @ w + b)
    loss = -np.mean(y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12))
    grad_w = X.T @ (p - y) / n            # same shape as linear regression's gradient!
    grad_b = np.mean(p - y)
    w -= lr * grad_w
    b -= lr * grad_b
    if epoch % 75 == 0:
        print(f"epoch {epoch:3d}  log-loss {loss:.4f}")

pred = (sigmoid(X @ w + b) >= 0.5).astype(int)
print(f"weights {w.round(2)}, bias {b:.2f}, training accuracy {np.mean(pred == y):.1%}")
```

### The same in scikit-learn

```python run level=easy
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

X, y = load_breast_cancer(return_X_y=True)        # 1 = benign, 0 = malignant
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, random_state=1, stratify=y)
clf = make_pipeline(StandardScaler(), LogisticRegression()).fit(X_tr, y_tr)

print("predicted classes:      ", clf.predict(X_te[:6]))
print("probability of class 1: ", clf.predict_proba(X_te[:6])[:, 1].round(3))
print(f"accuracy: {clf.score(X_te, y_te):.3f}")
```

## Why accuracy is not enough

:::def Accuracy
The fraction of predictions that are correct. Simple — but misleading when classes are **imbalanced**.
:::

```python run level=easy
import numpy as np

# 1,000 transactions, only 10 are fraud (1%)
y_true = np.array([1] * 10 + [0] * 990)
lazy_model = np.zeros(1000, dtype=int)          # always says "not fraud"

print(f"accuracy of the lazy model: {np.mean(lazy_model == y_true):.1%}")
print("frauds caught:", int(((lazy_model == 1) & (y_true == 1)).sum()), "of 10")
```

99% accuracy — and completely useless. We need better metrics.

## The confusion matrix

:::def Confusion matrix
A table counting every combination of **actual** class and **predicted** class. For binary problems it has four cells: true positives, false positives, false negatives and true negatives.
:::

| | Predicted **positive** | Predicted **negative** |
|---|---|---|
| **Actually positive** | ✅ True Positive (TP) | ❌ False Negative (FN) — *missed it* |
| **Actually negative** | ❌ False Positive (FP) — *false alarm* | ✅ True Negative (TN) |

:::def Precision
Of everything the model flagged as positive, how much really was? `TP / (TP + FP)`. High precision = few false alarms.
:::

:::def Recall (sensitivity)
Of all the real positives, how many did the model catch? `TP / (TP + FN)`. High recall = few misses.
:::

:::def F1 score
The harmonic mean of precision and recall: `2 · P · R / (P + R)`. One number that is only high when **both** are high.
:::

:::analogy
A spam filter with **high precision** rarely puts real email in spam. One with **high recall** catches nearly all spam. A fishing net with tiny holes (high recall) also catches boots and seaweed (low precision).
:::

```python run level=intermediate
import numpy as np

y_true = np.array([1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0])
y_pred = np.array([1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0])

tp = int(((y_pred == 1) & (y_true == 1)).sum())
fp = int(((y_pred == 1) & (y_true == 0)).sum())
fn = int(((y_pred == 0) & (y_true == 1)).sum())
tn = int(((y_pred == 0) & (y_true == 0)).sum())
precision = tp / (tp + fp)
recall = tp / (tp + fn)
f1 = 2 * precision * recall / (precision + recall)

print(f"TP={tp} FP={fp} FN={fn} TN={tn}")
print(f"accuracy  {(tp + tn) / len(y_true):.3f}")
print(f"precision {precision:.3f}")
print(f"recall    {recall:.3f}")
print(f"F1        {f1:.3f}")
```

### With scikit-learn

```python run level=intermediate
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, classification_report

X, y = load_breast_cancer(return_X_y=True)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, random_state=1, stratify=y)
clf = make_pipeline(StandardScaler(), LogisticRegression()).fit(X_tr, y_tr)
pred = clf.predict(X_te)

print(confusion_matrix(y_te, pred))
print(classification_report(y_te, pred, target_names=["malignant", "benign"], digits=3))
```

:::def Macro vs weighted average
For several classes, **macro** averages each class's score equally (rare classes count as much as common ones). **Weighted** averages by how many examples each class has.
:::

## Thresholds: trading precision for recall

The model outputs a **probability**. Where you put the cut-off changes everything:

```python run level=intermediate
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_score, recall_score

X, y = load_breast_cancer(return_X_y=True)
y = 1 - y                                   # make 1 = malignant (the thing we must not miss)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, random_state=1, stratify=y)
clf = make_pipeline(StandardScaler(), LogisticRegression()).fit(X_tr, y_tr)
proba = clf.predict_proba(X_te)[:, 1]

print("threshold  precision  recall  flagged")
for t in [0.1, 0.3, 0.5, 0.7, 0.9]:
    pred = (proba >= t).astype(int)
    print(f"   {t:.1f}       {precision_score(y_te, pred):.3f}     {recall_score(y_te, pred):.3f}    {pred.sum():3d}")
```

:::tip Choose the threshold for the cost of mistakes
- **Cancer screening, fraud, safety filters**: missing a positive is very costly → lower threshold, favour **recall**.
- **Spam folder, auto-actions**: false alarms annoy users → higher threshold, favour **precision**.
:::

## ROC curve and AUC

:::def ROC-AUC
The ROC curve plots true-positive rate against false-positive rate for **every** threshold. **AUC** (area under it) summarises ranking quality in one number: 1.0 = perfect, 0.5 = random guessing. It does not depend on choosing a threshold.
:::

```python run level=advanced
import matplotlib.pyplot as plt
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import roc_curve, roc_auc_score

X, y = load_breast_cancer(return_X_y=True)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, random_state=1, stratify=y)

fig, ax = plt.subplots(figsize=(5.5, 5))
for name, model in [("logistic regression", make_pipeline(StandardScaler(), LogisticRegression())),
                    ("shallow tree", DecisionTreeClassifier(max_depth=2, random_state=0))]:
    proba = model.fit(X_tr, y_tr).predict_proba(X_te)[:, 1]
    fpr, tpr, _ = roc_curve(y_te, proba)
    ax.plot(fpr, tpr, linewidth=2, label=f"{name} (AUC = {roc_auc_score(y_te, proba):.3f})")
ax.plot([0, 1], [0, 1], "--", color="gray", label="random (AUC = 0.5)")
ax.set(xlabel="false positive rate", ylabel="true positive rate (recall)", title="ROC curves")
ax.legend(loc="lower right")
plt.show()
```

## Multi-class classification

```python run level=intermediate
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, accuracy_score

X, y = load_digits(return_X_y=True)                     # 8x8 images of handwritten digits 0–9
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)
clf = LogisticRegression(max_iter=3000).fit(X_tr / 16, y_tr)
pred = clf.predict(X_te / 16)
print(f"accuracy: {accuracy_score(y_te, pred):.3f}")
cm = confusion_matrix(y_te, pred)
print(cm)
off = cm.copy()
off[range(10), range(10)] = 0
i, j = divmod(off.argmax(), 10)
print(f"most common mistake: true {i} predicted as {j} ({off[i, j]} times)")
```

For many classes, the model uses **softmax** over one score per class — exactly what an LLM does over its vocabulary.

## Metrics for LLM and Gen-AI evaluation

The same ideas evaluate AI systems:

```python run level=advanced
# A guardrail that flags harmful prompts — evaluated like any classifier
cases = [
    # (prompt, actually_harmful, flagged_by_guardrail)
    ("how do I bake bread", False, False),
    ("write malware to steal passwords", True, True),
    ("summarize this article", False, False),
    ("how to make a dangerous weapon", True, True),
    ("history of chemical weapons in WW1", False, True),     # false positive (over-refusal)
    ("bypass the login of my neighbour's wifi", True, False), # false negative (missed)
    ("explain photosynthesis", False, False),
    ("phishing email to trick bank customers", True, True),
]
tp = sum(a and f for _, a, f in cases)
fp = sum((not a) and f for _, a, f in cases)
fn = sum(a and not f for _, a, f in cases)
precision, recall = tp / (tp + fp), tp / (tp + fn)
print(f"guardrail precision {precision:.2f} (how often a block was justified)")
print(f"guardrail recall    {recall:.2f} (how much harmful content it caught)")
print("false positives = annoying over-refusals; false negatives = safety failures")
```

:::ai
- **RAG retrieval** is judged with precision@k and recall@k: of the top-k retrieved chunks, how many were relevant, and how many of the relevant ones were found?
- **LLM-as-judge** labels are checked against human labels with accuracy / agreement.
- **Classifiers on embeddings** (intent, topic, toxicity) use exactly these metrics.
:::

## Check yourself

```quiz
? A model flags 100 emails as spam; 90 really are spam. What is its precision?
+ 0.90
- 0.10
- Cannot know without recall
> Precision = TP / (TP + FP) = 90 / 100.

? There are 50 real fraud cases and the model catches 40. Recall?
+ 0.80
- 0.40
- 0.50
> Recall = TP / (TP + FN) = 40 / 50.

? For a cancer screening model, which matters most?
+ High recall — don't miss real cases
- High precision
- High accuracy
> A missed cancer (false negative) is far worse than a follow-up test.

? A ROC-AUC of 0.5 means…
+ No better than random guessing
- Perfect classification
- 50% accuracy at threshold 0.5
> AUC measures ranking quality across all thresholds.
```

:::exercise Pick a threshold
Using the breast-cancer data with `y = 1 - y` (1 = malignant), train the logistic-regression pipeline and find the **highest** threshold that still gives **recall ≥ 0.98** on the test set. Print that threshold, its precision and recall.
:::

:::solution
```python run
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_score, recall_score

X, y = load_breast_cancer(return_X_y=True)
y = 1 - y
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, random_state=1, stratify=y)
proba = make_pipeline(StandardScaler(), LogisticRegression()).fit(X_tr, y_tr).predict_proba(X_te)[:, 1]

best = None
for t in np.arange(0.01, 1.0, 0.01):
    pred = (proba >= t).astype(int)
    if recall_score(y_te, pred) >= 0.98:
        best = (t, precision_score(y_te, pred), recall_score(y_te, pred))
t, p, r = best
print(f"threshold {t:.2f}: precision {p:.3f}, recall {r:.3f}")
```
:::

:::keypoints
- Logistic regression = linear score → **sigmoid** → probability; trained with cross-entropy.
- **Accuracy** misleads on imbalanced data; use the **confusion matrix**.
- **Precision** = few false alarms; **recall** = few misses; **F1** balances both.
- Move the **threshold** to trade precision vs recall based on the cost of mistakes.
- **ROC-AUC** measures ranking quality independent of threshold. The same metrics evaluate guardrails, retrieval and LLM judges.
:::
