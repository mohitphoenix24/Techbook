---
title: Machine Learning Recap for Vision — Overfitting, Splits and Leakage
level: easy
time: 40
summary: Training, validation and test sets, what overfitting looks like, how to detect it, and the most common way vision projects fool themselves: data leakage from near-duplicate images. With experiments you can run.
---

Before CNNs, a short recap of the learning ideas that decide whether a vision project works in the real world. Most failures are not about the model. They are about **how it was evaluated**.

## Learning = finding a function from examples

We have pairs `(image, label)`. We choose a model with adjustable numbers (**parameters** or **weights**), a **loss** that says how wrong the model is on an example, and an **optimiser** (gradient descent) that nudges the weights to reduce the loss. After training, we hope the model works on **new** images it has never seen. That hope is called **generalisation**, and it is the whole point.

## Three data sets, three jobs

| Set | Used for | Rule |
|---|---|---|
| **Training** | Fitting the weights | The model may see it as often as it likes |
| **Validation** | Choosing settings (learning rate, model size, when to stop) | Looked at many times, so it slowly becomes "known" to you |
| **Test** | One final, honest score | Use it **once**, at the end, and never tune on it |

If you tune against the test set, your reported accuracy is optimistic, because you picked the settings that happened to score best on that set.

## Underfitting and overfitting

- **Underfitting**: the model is too simple or trained too little. It does badly on **both** training and validation data.
- **Overfitting**: the model **memorises** the training examples, including their noise. It does very well on training data and clearly worse on new data.

The tell-tale sign is the **gap** between training and validation scores. Here we vary the size of a decision tree on the digits dataset.

```python run title="Underfitting and overfitting" level=easy
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier

X, y = load_digits(return_X_y=True)
Xtr, Xte, ytr, yte = train_test_split(X / 16, y, test_size=0.3, random_state=0, stratify=y)
print("tree depth   train accuracy   validation accuracy   gap")
for depth in (1, 2, 3, 5, 8, 12, None):
    m = DecisionTreeClassifier(max_depth=depth, random_state=0).fit(Xtr, ytr)
    tr, te = m.score(Xtr, ytr), m.score(Xte, yte)
    print(f"{str(depth):10} {tr:14.3f} {te:20.3f} {tr - te:7.3f}")
```

Depth 1–3: both scores are low (**underfitting**). From depth 8 on, training accuracy reaches 1.0 while validation stays near 0.84: the gap grows (**overfitting**). The best model is where validation accuracy is highest, not training accuracy.

**What to do about overfitting:** more data, data augmentation, a simpler model, regularisation (weight decay, dropout), early stopping, and using a pretrained model.

## Data leakage: the silent killer

**Leakage** means information from the test set sneaks into training, so the score is too good to be true. In vision it happens constantly:

- **Near-duplicate images**: frames of one video, burst photos, or the same object photographed several times. A random split puts some into train and some into test.
- **Same subject**: the same patient, the same person, the same machine, the same shop shelf appears on both sides.
- **Augmented copies** made *before* splitting.
- **Pre-processing fitted on everything** (for example computing normalisation statistics on all data).
- **Labels hidden in the picture**: a watermark, a scanner ID, a ruler next to the lesion. The model learns the shortcut.

Here is a vivid test. We give every image a **random** label, so there is **nothing** to learn. We make six slightly noisy copies of each image (like frames of a video). Then we measure a nearest-neighbour classifier with two kinds of split.

```python run title="A random split makes a useless model look perfect" level=intermediate
import numpy as np
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split, GroupShuffleSplit
from sklearn.neighbors import KNeighborsClassifier

X, _ = load_digits(return_X_y=True)
rng = np.random.default_rng(0)
base = X[:600] / 16
labels = rng.integers(0, 10, 600)                                         # random labels: no signal at all
Xs = np.repeat(base, 6, axis=0) + rng.normal(0, 0.03, (3600, 64))          # 6 near-copies of each image, like video frames
ys = np.repeat(labels, 6)
groups = np.repeat(np.arange(600), 6)                                      # which original image each copy came from

Xa, Xb, ya, yb = train_test_split(Xs, ys, test_size=0.3, random_state=0)
print("random split of the frames : accuracy", round(KNeighborsClassifier(1).fit(Xa, ya).score(Xb, yb), 3), " (chance is 0.10)")

tr, te = next(GroupShuffleSplit(1, test_size=0.3, random_state=0).split(Xs, ys, groups))
print("split by original image    : accuracy", round(KNeighborsClassifier(1).fit(Xs[tr], ys[tr]).score(Xs[te], ys[te]), 3))
```

With the random split the model scores about 100% on meaningless labels, because the test frame has a near-identical twin in the training set. With the **group split** it falls to chance. **Always split by the unit that must not be shared: the video, the patient, the object, the site, the day.**

## Cross-validation and learning curves

With little data, one split is noisy. **k-fold cross-validation** splits the data into `k` parts, trains `k` times (each part is validation once), and reports the mean and spread. Use **grouped** or **stratified** variants where needed. A **learning curve** (score versus training-set size) tells you what to do next:

- Validation score still rising with more data → **collect more data**.
- Training and validation both low and flat → the model is too weak, or the features/labels are poor.
- A big gap that does not shrink → regularise, augment or simplify.

```python run title="A learning curve" level=intermediate
import numpy as np
from sklearn.datasets import load_digits
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import learning_curve

X, y = load_digits(return_X_y=True)
sizes, train_scores, val_scores = learning_curve(LogisticRegression(max_iter=300), X / 16, y, train_sizes=[0.05, 0.1, 0.25, 0.5, 1.0], cv=5)
print("training examples   train score   validation score")
for n, a, b in zip(sizes, train_scores.mean(1), val_scores.mean(1)):
    print(f"{n:17d} {a:12.3f} {b:18.3f}")
```

## A baseline first

Before any deep model: build a **trivial baseline** (predict the most common class; a simple threshold; a linear model on pixels; HOG + SVM). If a fancy model barely beats it, the problem is the data or the task definition. Report results **relative to the baseline** and to a **human** level if you can.

:::interview Questions you may get
- "What are train, validation and test sets for?" Fit the weights; choose hyper-parameters and stop time; one final unbiased estimate.
- "How do you detect overfitting?" A large gap between training and validation performance, and validation loss going up while training loss goes down.
- "Give an example of data leakage in a vision project." Frames from the same video, or the same patient, in both train and test; fix by splitting by video/patient.
- "Your model gets 99% in the lab and 70% in production. What do you check?" Leakage, a train/production distribution shift (cameras, lighting, preprocessing), label quality, and metric choice.
- "What does a learning curve tell you?" Whether more data or a different model will help.
:::

```quiz
? Training accuracy is 100% and validation accuracy is 80%. This suggests...
+ Overfitting
- Underfitting
- A perfect model
> The gap shows the model memorised the training data.

? Frames from the same video appear in both the training and the test set. What happens to the test score?
+ It is inflated, because near-identical frames leak across the split
- It is too low
- It is unaffected
> Split by video, not by frame.

? When may you look at the test set?
- Every epoch
+ Once, for the final report
- Whenever you change a hyper-parameter
> Tuning on it makes the score optimistic.

? Validation score is still rising as the training set grows. What is a good next step?
+ Collect more data
- Reduce the model size
- Stop training
> The model is data-limited.
```

:::problem You trained a skin-lesion classifier on 10,000 photos from 800 patients (several photos per patient). It gets 98% on a random 20% test split. Why should you distrust it, and what do you do? {level=medium tags="leakage,evaluation,medical"}
Think about how the split was made.

:::solution Model answer
Photos of the same patient (and often the same lesion) are near-duplicates, so a random split puts patient-specific features on both sides, and the model can recognise patients rather than diagnoses. Re-split **by patient** (group k-fold), keep each patient entirely in one set, and report the score on patients the model has never seen, ideally also on data from another hospital or camera (external validation). Check for shortcuts too: rulers, ink marks, clinic stamps. Expect a lower, honest score.
:::
:::

:::keypoints
- Train fits the weights, validation chooses settings, test gives one final score. Never tune on test.
- Overfitting shows as a train/validation gap; fix with more data, augmentation, regularisation, simpler models, early stopping.
- Leakage (near-duplicates, same patient/video/site) makes scores meaningless: split by the group that must not be shared.
- Use cross-validation and learning curves, and always compare against a simple baseline.
:::

:::resources
- [scikit-learn: cross-validation and model evaluation](https://scikit-learn.org/stable/modules/cross_validation.html) — k-fold, group and stratified splits.
- [Kapoor and Narayanan: Leakage and the reproducibility crisis in ML-based science](https://arxiv.org/abs/2207.07048) — how widespread leakage is.
- [Google ML crash course: generalisation](https://developers.google.com/machine-learning/crash-course/overfitting/overfitting) — a gentle recap.
:::
