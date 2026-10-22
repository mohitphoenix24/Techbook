---
title: PCA, Clustering and Visualising Features
level: intermediate
time: 45
summary: Find structure without labels. PCA by SVD and what its components look like for images, compression and reconstruction, k-means clustering, k-nearest-neighbour search in a feature space, and t-SNE plots to inspect what a model has learned.
---

Not every question has labels. Sometimes you want to **compress** images, **group** similar ones, or **look at** what a network has learned. The classic tools are PCA, k-means and t-SNE. They also appear in modern work: embeddings from a neural network are explored with exactly these tools.

## PCA: the directions that matter

An 8 × 8 image has 64 numbers, but the images are not random: nearby pixels are correlated. **Principal component analysis (PCA)** finds a new set of axes, ordered by how much of the data's variation they capture. Keeping the first `k` axes gives a **compact description**: `64 numbers → k numbers`.

How: centre the data (subtract the mean image), then take the **SVD**. The right singular vectors are the **principal components** (new axes); the singular values tell how much variance each holds.

```python run title="PCA by SVD, and the 'eigen-digits'" level=intermediate shared
import numpy as np
from sklearn.datasets import load_digits
import cvlab

X, y = load_digits(return_X_y=True)
X = X / 16.0
mean = X.mean(axis=0)
U, S, Vt = np.linalg.svd(X - mean, full_matrices=False)           # rows of Vt are the principal components
var = S ** 2 / (len(X) - 1)
ratio = var / var.sum()
print("variance explained by the first 5 components:", np.round(ratio[:5], 3))
for k in (2, 5, 10, 20, 30):
    print(f"first {k:2d} components keep {ratio[:k].sum() * 100:5.1f}% of the variance")

cvlab.show(mean.reshape(8, 8), "mean image", *[Vt[i].reshape(8, 8) for i in range(5)], titles=["mean image"] + [f"component {i + 1}" for i in range(5)], width=105)
```

The mean image is the "average digit". Each component is a **pattern of change** around the mean: component 1 might contrast the centre with the edges (round digits versus thin ones). These are called **eigen-digits** (for faces: **eigenfaces**, a classic face-recognition method).

## Compress and reconstruct

Project an image onto the first `k` components (`k` numbers), then reconstruct (`k` numbers → 64 pixels). More components give a closer copy.

```python run title="Reconstruction with k components" level=intermediate shared
def reconstruct(x, k):
    coeffs = (x - mean) @ Vt[:k].T                  # the k numbers that describe the image
    return mean + coeffs @ Vt[:k]

sample = X[7]
rows, errs = [sample.reshape(8, 8)], []
for k in (2, 5, 10, 20, 40):
    r = reconstruct(sample, k)
    rows.append(np.clip(r, 0, 1).reshape(8, 8))
    errs.append(float(np.sqrt(np.mean((r - sample) ** 2))))
print("k = 2, 5, 10, 20, 40  ->  RMS error:", np.round(errs, 3))
cvlab.show(*rows, titles=["original", "k=2", "k=5", "k=10", "k=20", "k=40"], width=105)
```

At `k = 20` (a third of the size) the digit is clearly recognisable. PCA is **lossy compression**. It is also a **denoiser** (drop the small components, which hold mostly noise) and a way to make features for a classifier.

```python run title="Classify using only 10 PCA numbers" level=intermediate shared
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier

Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)
m = Xtr.mean(0)
_, _, Vt2 = np.linalg.svd(Xtr - m, full_matrices=False)           # fit PCA on the TRAINING data only (no leakage)
for k in (2, 5, 10, 30, 64):
    f = lambda a: (a - m) @ Vt2[:k].T
    acc = KNeighborsClassifier(3).fit(f(Xtr), ytr).score(f(Xte), yte)
    print(f"{k:2d} PCA features -> 3-NN accuracy {acc:.3f}")
```

Ten numbers per image are almost as good as all 64. Note: PCA is **fitted on the training set** only. Fitting it on all data is a small leak.

## k-means: grouping without labels

**k-means** (we used it on colours) finds `k` cluster centres by alternating two steps: assign each point to its nearest centre, then move each centre to the mean of its points. On digits, we expect the 10 clusters to roughly match the 10 digits, even though k-means never saw the labels.

```python run title="k-means on digit images" level=intermediate shared
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score

km = KMeans(n_clusters=10, n_init=5, random_state=0).fit(X)
print("agreement between clusters and true digits (adjusted Rand index, 1 = perfect):", round(float(adjusted_rand_score(y, km.labels_)), 3))
cvlab.show(*[c.reshape(8, 8) for c in km.cluster_centers_], titles=[f"cluster {i}" for i in range(10)], width=100)
```

The cluster centres look like average digits. Use k-means when you need to **explore** data or make **visual words** or **quantise** vectors. Its weaknesses: you must choose `k`, it assumes round clusters of similar size, and it depends on the starting point (so run it several times).

## Nearest neighbours in a feature space

Many modern systems (image search, face matching, retrieval, few-shot learning) are just **nearest-neighbour search** in an embedding space: convert each image to a vector, find the closest vectors. The key quantity is the **distance**: Euclidean, or **cosine similarity** for normalised embeddings.

```python run title="k-nearest-neighbour retrieval" level=easy shared
from sklearn.neighbors import NearestNeighbors

nn = NearestNeighbors(n_neighbors=5).fit(Xtr)
query = Xte[0]
dist, idx = nn.kneighbors(query[None])
print("query is a", yte[0], "; its 5 nearest neighbours are digits", ytr[idx[0][:5]])
cvlab.show(query.reshape(8, 8), "query", *[Xtr[i].reshape(8, 8) for i in idx[0][:5]], titles=["query"] + [f"neighbour {j + 1}" for j in range(5)], width=100)
```

## t-SNE: look at high-dimensional data

You cannot plot 64 dimensions. **t-SNE** (and the newer **UMAP**) place points in 2-D so that **neighbours stay neighbours**. It is the standard way to inspect the **embeddings of a trained network**: do the classes separate? Are there odd clusters (mislabelled data, two sub-types, a camera artefact)?

```python run title="t-SNE of the digits" level=intermediate shared
import matplotlib.pyplot as plt
from sklearn.manifold import TSNE

idx = np.random.default_rng(0).choice(len(X), 700, replace=False)
emb = TSNE(n_components=2, init="pca", perplexity=30, random_state=0).fit_transform(X[idx])
fig, ax = plt.subplots(figsize=(6, 5))
sc = ax.scatter(emb[:, 0], emb[:, 1], c=y[idx], cmap="tab10", s=10)
for d in range(10):
    cx, cy = np.median(emb[y[idx] == d], axis=0)
    ax.text(cx, cy, str(d), fontsize=14, weight="bold")
ax.set_title("t-SNE: each dot is an image, colour = true digit"); ax.axis("off")
```

Ten clear islands appear. Remember what t-SNE does **not** guarantee: distances **between** clusters and cluster sizes are not meaningful, and the picture changes with the perplexity and the seed. Use it to **find** things to investigate, not as proof.

:::interview Questions you may get
- "How does PCA work?" Centre the data, find the directions of largest variance (eigenvectors of the covariance, or the SVD); project onto the top `k`.
- "How many components do you keep?" Enough to explain a chosen fraction of the variance (for example 95%), or the number that maximises validation performance.
- "k-means: strengths and weaknesses?" Simple and fast; needs `k`, assumes spherical equal-sized clusters, depends on initialisation (use k-means++ and several runs).
- "What is t-SNE for and what are its pitfalls?" 2-D visualisation preserving local neighbourhoods; global distances and cluster sizes are not meaningful; depends on perplexity and seed.
- "Why fit PCA on the training set only?" Fitting on all data leaks test information.
:::

```quiz
? What do the principal components of an image dataset represent?
+ Directions (patterns) along which the images vary the most
- The class labels
- Random noise
> They are ordered by the variance they explain.

? You reconstruct an image from fewer PCA components. What happens?
+ It becomes a smoother, less detailed copy
- It becomes sharper
- Nothing changes
> The discarded components held the fine detail (and noise).

? What does k-means need you to choose in advance?
+ The number of clusters k
- The labels
- A neural network
> You can try several values and compare.

? Can you read the distance between two far-apart clusters in a t-SNE plot as a real distance?
+ No; t-SNE preserves local neighbourhoods, not global distances
- Yes, exactly
- Only for colour images
> Use it to explore, not to measure.
```

:::problem You extract CNN embeddings of 20,000 product photos and want to find mislabelled images. How do PCA/t-SNE/k-NN help? {level=medium tags="embeddings,data-quality"}
Think about neighbours with different labels.

:::solution Model answer
For each image, find its nearest neighbours in the embedding space (after PCA to 50–100 dimensions for speed, with cosine distance). If an image's label disagrees with most of its neighbours' labels, it is a mislabel candidate; rank by the disagreement and review the top ones manually. A t-SNE/UMAP plot coloured by label shows stray points inside the wrong cluster and clusters that mix two labels (ambiguous categories). Clustering with k-means can reveal sub-types inside a class (for example front and back views). This is a cheap data-cleaning step, similar to confident-learning tools.
:::
:::

:::keypoints
- PCA = centre, SVD, keep the top-k directions: compression, denoising, features. Fit it on training data only.
- k-means groups vectors by nearest centre; choose `k`, run several times. k-NN search in embedding space powers retrieval.
- t-SNE/UMAP give 2-D pictures of embeddings: great for exploration, not for measuring distances.
- These tools are used on CNN/transformer embeddings for data cleaning, search and debugging.
:::

:::resources
- [scikit-learn: decomposing signals (PCA)](https://scikit-learn.org/stable/modules/decomposition.html#pca) — theory and options.
- [How to Use t-SNE Effectively (Distill)](https://distill.pub/2016/misread-tsne/) — what t-SNE plots do and do not mean.
- [Turk and Pentland: Eigenfaces for Recognition](https://www.face-rec.org/algorithms/PCA/jcn.pdf) — PCA for faces.
:::
