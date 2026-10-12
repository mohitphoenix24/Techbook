---
title: Clustering & Dimensionality Reduction
level: intermediate
time: 30
summary: Find structure without labels. K-means groups similar items, PCA compresses many features into a few, and both are everyday tools for exploring embeddings and documents.
---

Most data has **no labels**. Unsupervised learning finds structure anyway: groups of similar customers, topics in a pile of documents, the main directions of variation in 1,000-dimensional embeddings.

:::def Unsupervised learning
Learning patterns from data **without** labels. The two big tasks are **clustering** (grouping similar items) and **dimensionality reduction** (describing data with fewer numbers).
:::

## K-means clustering

:::def Clustering
Automatically grouping items so that items in the same group (cluster) are more similar to each other than to items in other groups.
:::

:::def K-means
A clustering algorithm: pick **k** centre points, assign every item to its nearest centre, move each centre to the average of its items, and repeat until nothing changes. You choose **k**.
:::

:::flow K-means in four steps
Pick k centres | random starting points
Assign | each point → nearest centre
Update | centre = mean of its points
Repeat | until centres stop moving
:::

### From scratch

```python run level=intermediate
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(0)
X = np.vstack([rng.normal(c, 0.6, (60, 2)) for c in [(0, 0), (4, 4), (0, 5)]])

def kmeans(X, k, steps=10, seed=0):
    rng = np.random.default_rng(seed)
    centres = X[rng.choice(len(X), k, replace=False)]
    for step in range(steps):
        dists = np.linalg.norm(X[:, None, :] - centres[None, :, :], axis=2)   # (n, k)
        labels = dists.argmin(axis=1)                                        # nearest centre
        new = np.array([X[labels == j].mean(axis=0) for j in range(k)])
        if np.allclose(new, centres):
            print(f"converged after {step} updates")
            break
        centres = new
    return labels, centres

labels, centres = kmeans(X, k=3)
fig, ax = plt.subplots(figsize=(5.5, 4.5))
ax.scatter(X[:, 0], X[:, 1], c=labels, cmap="viridis", s=18)
ax.scatter(centres[:, 0], centres[:, 1], marker="X", s=250, color="red", edgecolor="white")
ax.set_title("K-means from scratch (k = 3)")
plt.show()
```

### With scikit-learn

```python run level=intermediate
from sklearn.cluster import KMeans
from sklearn.datasets import make_blobs

X, true_groups = make_blobs(n_samples=300, centers=4, cluster_std=0.9, random_state=7)
km = KMeans(n_clusters=4, n_init=10, random_state=0).fit(X)

print("cluster sizes:", [int((km.labels_ == j).sum()) for j in range(4)])
print("centres:\n", km.cluster_centers_.round(2))
print("inertia (total squared distance to centres):", round(km.inertia_, 1))
print("new points go to clusters:", km.predict([[0, 0], [5, -5]]))
```

### Choosing k

:::def Silhouette score
A number from −1 to 1 measuring how well each point fits its own cluster compared with the next-nearest cluster. Higher is better; use it to compare different values of k.
:::

```python run level=intermediate
from sklearn.cluster import KMeans
from sklearn.datasets import make_blobs
from sklearn.metrics import silhouette_score

X, _ = make_blobs(n_samples=400, centers=4, cluster_std=0.9, random_state=7)
print(" k   inertia   silhouette")
for k in range(2, 8):
    km = KMeans(n_clusters=k, n_init=10, random_state=0).fit(X)
    print(f"{k:2d}  {km.inertia_:8.1f}    {silhouette_score(X, km.labels_):.3f}")
```

Inertia always falls as k grows (the "elbow" is where it stops falling fast); silhouette **peaks** at a good k.

## Clustering text: discover topics

The AI-flavoured version: turn documents into vectors, then cluster them. Here we use TF-IDF vectors; in production you would use embeddings from an embedding model — the code is the same.

:::def TF-IDF
"Term frequency × inverse document frequency" — a way to turn text into a vector where each word's weight is high if it appears often in **this** document but rarely in **others**. A classic, fast alternative to neural embeddings.
:::

```python run level=advanced
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
import numpy as np

docs = [
    "the striker scored a late goal to win the football match",
    "the team won the league after a tense final match",
    "fans celebrated the goal in the stadium",
    "the central bank raised interest rates to fight inflation",
    "stock markets fell as inflation data surprised investors",
    "bond yields rose after the bank's rate decision",
    "bake the bread dough for forty minutes in a hot oven",
    "whisk eggs and sugar then fold in the flour for the cake",
    "the recipe needs butter, flour and a pinch of salt",
]
vec = TfidfVectorizer(stop_words="english")
X = vec.fit_transform(docs)
km = KMeans(n_clusters=3, n_init=10, random_state=0).fit(X)

terms = np.array(vec.get_feature_names_out())
for c in range(3):
    top = terms[np.argsort(km.cluster_centers_[c])[::-1][:4]]
    print(f"\nCluster {c} — top words: {', '.join(top)}")
    for doc, label in zip(docs, km.labels_):
        if label == c:
            print("   •", doc)
```

:::ai
Clustering embeddings is a standard way to **explore** a corpus before building RAG, find **duplicate** or near-duplicate content, group **user questions** to see what people actually ask your chatbot, and pick **diverse** few-shot examples (one per cluster).
:::

## Other clustering algorithms

| Algorithm | Good when |
|---|---|
| `KMeans` | roughly round clusters of similar size; you know k |
| `DBSCAN` / `HDBSCAN` | odd-shaped clusters, unknown k, need to mark **outliers** |
| `AgglomerativeClustering` | you want a hierarchy (tree) of clusters |

```python run level=advanced
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import make_moons
from sklearn.cluster import KMeans, DBSCAN

X, _ = make_moons(n_samples=300, noise=0.06, random_state=0)
X = np.vstack([X, [[2.5, 1.5], [-1.5, -0.8]]])          # two outliers
fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
for ax, (name, model) in zip(axes, [("K-means (k=2)", KMeans(2, n_init=10, random_state=0)), ("DBSCAN", DBSCAN(eps=0.2))]):
    labels = model.fit_predict(X)
    ax.scatter(X[:, 0], X[:, 1], c=labels, cmap="coolwarm", s=14)
    if (labels == -1).any():
        ax.scatter(*X[labels == -1].T, marker="x", s=80, color="black", label="outlier")
        ax.legend()
    ax.set_title(name)
plt.show()
```

## Dimensionality reduction: PCA

:::def Dimensionality reduction
Representing data with **fewer features** while keeping as much useful information as possible — for visualisation (down to 2-D), speed, or removing noise.
:::

:::def PCA (Principal Component Analysis)
Finds the directions (**principal components**) along which the data varies the most, and projects the data onto the top few. The first component captures the most variance, the second the next most, and so on.
:::

:::analogy
Photographing a 3-D object to show it in 2-D: you pick the camera angle that shows the **most detail**. PCA picks that best angle mathematically, even for 1,000 dimensions.
:::

```python run level=intermediate
import numpy as np
from sklearn.decomposition import PCA
from sklearn.datasets import load_digits

X, y = load_digits(return_X_y=True)          # 64 features (8x8 pixels)
pca = PCA().fit(X)
cum = np.cumsum(pca.explained_variance_ratio_)
for n in [2, 10, 20, 30, 40]:
    print(f"{n:2d} components keep {cum[n - 1]:.1%} of the variance")
print("components needed for 95%:", int(np.argmax(cum >= 0.95)) + 1, "of 64")
```

### Visualising high-dimensional data

```python run level=intermediate
import matplotlib.pyplot as plt
from sklearn.decomposition import PCA
from sklearn.datasets import load_digits

X, y = load_digits(return_X_y=True)
X2 = PCA(n_components=2, random_state=0).fit_transform(X)

fig, ax = plt.subplots(figsize=(6.5, 5.5))
sc = ax.scatter(X2[:, 0], X2[:, 1], c=y, cmap="tab10", s=10, alpha=0.8)
ax.legend(*sc.legend_elements(), title="digit", fontsize=7, loc="upper right", ncols=2)
ax.set(title="64-dimensional digit images projected to 2-D with PCA", xlabel="PC 1", ylabel="PC 2")
plt.show()
```

:::tip t-SNE and UMAP
For **visualising** embeddings, non-linear methods like **t-SNE** (`sklearn.manifold.TSNE`) and **UMAP** (`umap-learn`) usually show clusters more clearly than PCA. Use them for pictures, not as model inputs — distances in their plots are not reliable.
:::

### PCA from scratch with SVD

```python run level=advanced
import numpy as np
from sklearn.decomposition import PCA

rng = np.random.default_rng(0)
X = rng.normal(size=(200, 5)) @ rng.normal(size=(5, 5))     # correlated features

Xc = X - X.mean(axis=0)                                      # 1. centre the data
U, S, Vt = np.linalg.svd(Xc, full_matrices=False)            # 2. SVD
components = Vt[:2]                                          # 3. top-2 directions
X_proj = Xc @ components.T                                   # 4. project
explained = S ** 2 / np.sum(S ** 2)

sk = PCA(n_components=2).fit(X)
print("our explained variance:    ", explained[:2].round(4))
print("sklearn explained variance:", sk.explained_variance_ratio_.round(4))
print("same projection (up to sign):", np.allclose(np.abs(X_proj), np.abs(sk.transform(X))))
```

### Compressing embeddings

Embedding vectors can be big (1,024+ dimensions). PCA can shrink them to save storage and speed up search — measure how much retrieval quality you lose:

```python run level=advanced
import numpy as np
from sklearn.decomposition import PCA

rng = np.random.default_rng(1)
latent = rng.normal(size=(2000, 32))                       # data that truly lives in ~32 dims
emb = latent @ rng.normal(size=(32, 384)) + 0.05 * rng.normal(size=(2000, 384))
emb /= np.linalg.norm(emb, axis=1, keepdims=True)
queries, docs = emb[:50], emb[50:]
true_top = np.argmax(queries @ docs.T, axis=1)

for dims in [8, 16, 32, 64]:
    pca = PCA(n_components=dims).fit(docs)
    d, q = pca.transform(docs), pca.transform(queries)
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    q /= np.linalg.norm(q, axis=1, keepdims=True)
    agree = np.mean(np.argmax(q @ d.T, axis=1) == true_top)
    print(f"{dims:3d} dims ({dims / 384:5.1%} of size): top-1 result unchanged for {agree:.0%} of queries")
```

## Anomaly detection

```python run level=advanced
import numpy as np
from sklearn.ensemble import IsolationForest

rng = np.random.default_rng(0)
normal = rng.normal([300, 1200], [60, 300], size=(300, 2))      # latency ms, tokens
weird = np.array([[2500, 1100], [310, 30000], [2900, 45000]])     # suspicious requests
X = np.vstack([normal, weird])

iso = IsolationForest(contamination=0.01, random_state=0).fit(X)
flags = iso.predict(X)                     # -1 = anomaly
print("flagged rows:", np.where(flags == -1)[0])
print(X[flags == -1].round(0))
```

:::ai
Anomaly detection on LLM traffic catches **runaway agents** (huge token counts), **abuse** (unusual request patterns) and **outages** (latency spikes).
:::

## Check yourself

```quiz
? What do you have to choose in advance for K-means?
+ The number of clusters k
- The labels
- The cluster shapes
> DBSCAN is an alternative that doesn't need k.

? PCA's first principal component is…
+ The direction along which the data varies the most
- The first column of the data
- The most important label
> Each following component captures the most remaining variance.

? Why use DBSCAN instead of K-means?
+ For odd-shaped clusters, unknown k, or when you need to mark outliers
- It is always faster
- It works without any parameters
> DBSCAN uses a density radius (eps) instead of k.

? You want a 2-D picture of 768-D sentence embeddings. Good tools?
+ PCA, t-SNE or UMAP
- Linear regression
- A confusion matrix
> These are dimensionality-reduction methods.
```

:::exercise Cluster questions from users
Cluster these chatbot questions into 3 groups with TF-IDF + KMeans and print each cluster's questions. (They are about billing, passwords and exporting data.)

```python
qs = ["how do I reset my password", "forgot password help", "change my login password",
      "why was I charged twice", "refund for my last invoice", "update my credit card billing",
      "export my data to csv", "download all my files", "how to export reports"]
```
:::

:::solution
```python run
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans

qs = ["how do I reset my password", "forgot password help", "change my login password",
      "why was I charged twice", "refund for my last invoice", "update my credit card billing",
      "export my data to csv", "download all my files", "how to export reports"]
X = TfidfVectorizer(stop_words="english").fit_transform(qs)
labels = KMeans(n_clusters=3, n_init=20, random_state=0).fit_predict(X)
for c in range(3):
    print(f"cluster {c}:", [q for q, l in zip(qs, labels) if l == c])
```
:::

:::keypoints
- **Clustering** groups similar items without labels: K-means (choose k), DBSCAN (density, finds outliers).
- Pick k with the **silhouette score** or the elbow of inertia.
- **PCA** keeps the directions of greatest variance — for visualisation, compression and denoising.
- Text clustering = vectors (TF-IDF or embeddings) + a clustering algorithm.
- **IsolationForest** flags anomalies — useful for monitoring AI traffic.
:::
