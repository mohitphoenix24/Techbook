---
title: The Classic Recognition Pipeline (and Why Deep Learning Won)
level: intermediate
time: 35
summary: Hand-made features plus a classifier. Train an SVM on raw pixels, on HOG and on a simple descriptor, see what feature engineering buys you, then understand the 2012 turning point and the lessons the old pipeline still teaches.
---

Before 2012, building an image classifier looked like this:

> **Hand-design a feature** (HOG, SIFT bag of words, colour histogram) → **train a classifier** (SVM, random forest, k-NN) on those features.

The human did the "seeing" (feature design). The machine only did the last step. This lesson builds that pipeline so you understand what deep learning changed.

## A small, real dataset

scikit-learn ships the **digits** dataset: 1,797 small 8×8 pictures of handwritten digits 0–9. It is small, but it is real data, runs fast in the browser, and shows the principles.

```python run title="Look at the data" level=easy
import numpy as np
from sklearn.datasets import load_digits
import cvlab

digits = load_digits()
X, y = digits.images, digits.target
print("images:", X.shape, " pixel range:", X.min(), "to", X.max(), " classes:", np.unique(y))
print("class counts:", np.bincount(y))
cvlab.show(np.hstack([X[i] for i in range(10)]) / 16.0, "The first ten digits: 8 x 8 pixels each")
```

## Baseline: SVM on raw pixels

The simplest classifier flattens the picture into a vector of 64 numbers and feeds it to an SVM.

```python run title="Raw pixels + SVM" level=easy
import numpy as np
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.svm import SVC

digits = load_digits()
X = digits.images.reshape(len(digits.images), -1) / 16.0          # flatten: 64 numbers per image, scaled to 0..1
y = digits.target
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)

clf = SVC(kernel="rbf", gamma=0.02, C=10).fit(Xtr, ytr)
print("raw pixels + RBF-SVM test accuracy:", round(clf.score(Xte, yte), 3))
```

It already works very well, because digits are centred and clean. Real photographs are much harder: objects shift, change size and lighting, and backgrounds are messy.

## Make the task harder: shifted digits

In real pictures the object is **not** perfectly centred. Let us shift each test picture by one or two pixels and see how raw pixels cope compared to gradient-based features.

```python run title="Raw pixels versus HOG when the digit moves" level=intermediate
import numpy as np
from scipy.ndimage import shift, zoom
from skimage.feature import hog
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.svm import SVC

digits = load_digits()
imgs, y = digits.images / 16.0, digits.target
Xtr_i, Xte_i, ytr, yte = train_test_split(imgs, y, test_size=0.3, random_state=0, stratify=y)

rng = np.random.default_rng(0)
shifted_te = np.array([shift(im, rng.integers(-1, 2, 2), order=0, mode="constant") for im in Xte_i])     # move each test digit by up to 1 pixel

def hog_feats(images):                                            # HOG needs some room: enlarge to 16 x 16 first
    return np.array([hog(zoom(im, 2, order=1), orientations=9, pixels_per_cell=(4, 4), cells_per_block=(2, 2)) for im in images])

raw = lambda a: a.reshape(len(a), -1)
for name, f, gamma in [("raw pixels", raw, 0.02), ("HOG", hog_feats, "scale")]:
    clf = SVC(kernel="rbf", gamma=gamma, C=10).fit(f(Xtr_i), ytr)
    print(f"{name:11s} accuracy on centred test digits: {clf.score(f(Xte_i), yte):.3f}   on digits moved by 1 pixel: {clf.score(f(shifted_te), yte):.3f}")
```

Both are excellent on centred digits. But a shift of **one pixel** is enough to break raw pixels (accuracy falls from about 0.99 to about 0.4), because it changes almost every number in the vector. HOG pools gradients over cells, so it is more tolerant (about 0.7), though it also suffers. (Training with shifted examples, called augmentation, would help both: a later lesson.) **That is what feature engineering bought: invariance to nuisance changes.** A CNN learns such invariances by itself (convolution plus pooling).

## What goes in the "hand-made feature" box

| Feature | Captures | Used for |
|---|---|---|
| Colour histogram | Colour distribution | Scene colour, simple retrieval |
| HOG | Shape from edge directions | Pedestrians, rigid objects |
| SIFT bag of words | Local appearance patterns | Object categories, retrieval |
| LBP (local binary patterns) | Texture | Texture classes, faces |
| Gabor filters | Texture at scales and angles | Texture, fingerprints, early face recognition |
| Spatial pyramid (SPM) | Where the words are, coarsely | Scene categories |

Many of them were combined, with a lot of tuning, to win benchmarks like **PASCAL VOC**. Each new project meant new feature engineering.

## The 2012 turning point

In 2012 the **ImageNet** challenge (1.2 million training images, 1000 classes) had the best classical systems at about **26% top-5 error**. **AlexNet**, a deep convolutional network trained on two GPUs, achieved about **15.3%**. A drop of ten points in one step shocked the field. Three ingredients came together:

1. **Data**: ImageNet gave millions of labelled examples.
2. **Compute**: GPUs made training large networks possible.
3. **Better training tricks**: ReLU, dropout, data augmentation.

A year later, a CNN pipeline won every classical competition. Deep networks learn **both** the features and the classifier **together, end to end**, so they find features better suited to the task than people could design.

```python run title="The same pipeline, but the features are learned" level=intermediate
import numpy as np
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier

digits = load_digits()
X = digits.images.reshape(len(digits.images), -1) / 16.0
y = digits.target
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)

mlp = MLPClassifier(hidden_layer_sizes=(64,), max_iter=400, random_state=0).fit(Xtr, ytr)
print("a small neural network on raw pixels, test accuracy:", round(mlp.score(Xte, yte), 3))
print("the hidden layer learned", mlp.coefs_[0].shape[1], "feature detectors, each with", mlp.coefs_[0].shape[0], "weights")
```

A neural network learns its own "features" (the hidden units). A **convolutional** network adds the knowledge that image features are local and repeated across the picture, which is what the CNN module builds.

## What the classic pipeline still teaches

- **Train / validation / test splits**, cross-validation, and honest evaluation (next module).
- **Features matter**: a better representation beats a cleverer classifier. Today the "feature" is a pretrained network's embedding, and a simple linear classifier on top is a strong baseline (linear probing).
- **Invariance and augmentation**: shift, scale, rotation and lighting must not change the answer. We now teach this with data augmentation.
- **Small data or tiny devices**: HOG + SVM can still be the right tool when you have 200 images and a microcontroller.
- **Debuggability**: you can look at HOG pictures and SIFT matches. Interviewers like candidates who can reason about why a classifier fails.

:::interview Questions you may get
- "How did people do image classification before deep learning?" Hand-crafted features (SIFT bag of words, HOG, colour histograms), then an SVM or random forest.
- "Why did CNNs beat them?" End-to-end learning of features at scale, with large data (ImageNet) and GPU compute.
- "When would you still use HOG + SVM?" Tiny data, tight compute or power budget, need for interpretability.
- "What does feature engineering give you?" Invariances and a compact, informative representation, so a simple classifier works.
:::

```quiz
? In which year did AlexNet win ImageNet with a large margin?
- 2005
+ 2012
- 2018
> It cut the top-5 error from about 26% to about 15%.

? Why does a raw-pixel classifier do badly when a digit is shifted?
+ A small shift changes almost every number in the pixel vector
- Shifted digits are bigger
- Pixels cannot be flattened
> Features like HOG pool gradients over cells, so they are more tolerant.

? What is the key difference of the deep-learning pipeline?
+ The features and the classifier are learned together, end to end
- It uses colour
- It needs no data
> Hand-designed features are replaced by learned ones.

? Which situation still favours HOG + SVM?
- A million labelled images and a GPU
+ A few hundred images and a very small embedded processor
- Text generation
> Small data and tight compute can make the classic approach sensible.
```

:::problem A colleague says "deep learning makes everything before it obsolete." Give a balanced answer with three concrete cases where classical methods are still the right choice. {level=easy tags="history,classical-vs-deep"}
Think about data, compute and geometry.

:::solution Model answer
Deep learning dominates when there is plenty of labelled data and compute, and the task is about recognition. Classical methods remain right when: (1) the problem is **geometric and well defined** (camera calibration, stereo, pose from known markers, SLAM back-end optimisation), where mathematics is exact and needs no data; (2) **data or compute is tiny** (an embedded sensor, 200 labelled images), where a simple feature + classifier trains in seconds and can be validated; (3) the **environment is controlled** (fixed camera, lighting, a conveyor), where thresholding, morphology and template matching are fast, deterministic and easy to certify. Often the best system **combines** both: classical pre-processing and geometry around a learned model.
:::
:::

:::keypoints
- The old pipeline: hand-made features (HOG, SIFT bag of words) plus a classifier (SVM). Features bring invariance.
- AlexNet (2012) won ImageNet by learning features and classifier end to end, with big data and GPUs.
- Feature engineering lessons live on: honest evaluation, invariance, augmentation, strong baselines (linear probes).
- Classical methods still win in geometry, tiny-data, and controlled-environment tasks.
:::

:::resources
- [ImageNet Classification with Deep Convolutional Neural Networks (AlexNet)](https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html) — the 2012 paper.
- [Bag of Tricks and the road to ImageNet: Russakovsky et al., ImageNet Large Scale Visual Recognition Challenge](https://arxiv.org/abs/1409.0575) — how the contest evolved.
- [scikit-learn: digits dataset](https://scikit-learn.org/stable/auto_examples/datasets/plot_digits_last_image.html) — the dataset used here.
:::
