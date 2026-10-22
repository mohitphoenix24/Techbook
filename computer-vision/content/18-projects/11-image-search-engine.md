---
title: Build an Image Search Engine
level: intermediate
time: 55
icon: search
cover: #0ea5e9,#f97316
tags: retrieval, histograms, hog, bag of visual words, tf-idf, recall, spatial verification
summary: Build a search engine that finds the original photo from a distorted query. Compare global descriptors (colour histogram, thumbnail, HOG) with local ORB features and a bag of visual words, evaluate with recall@k and mean average precision under cropping, rotation and noise, fuse descriptors, and re-rank the top results with RANSAC spatial verification.
---

"Find the photo this crop came from" is the oldest visual-search problem, and it is the foundation of product search, duplicate detection and place recognition (module 4 and module 13). Modern systems use learned embeddings, but the **classical pipeline teaches why**: which descriptor survives which transformation, why local features help, how to fuse evidence, and why you **verify geometry** at the end. You will build and *measure* all of it.

**What you'll build:** a gallery of 112 images (14 photos × 8 views), four descriptors, a search function, an evaluation (recall@k, mAP) under three difficulty levels, fusion, and RANSAC re-ranking.

:::flow The pipeline
Gallery | 14 photos × 8 distorted views
Descriptors | histogram, thumbnail, HOG, ORB words
Index | one normalised vector per image
Query | a new distorted view
Cosine search | rank the gallery
Fuse | combine descriptors
Verify | RANSAC inliers re-rank the top 10
Evaluate | recall@1, recall@5, mAP
:::

## Step 1 — A gallery and queries with known answers

We use the 14 sample photos of the course. For each, we make **8 gallery views** by taking a random crop (70-100% of the photo), changing the brightness and adding noise. **Queries** are *new* views of the same photos, made the same way but optionally **rotated** or **cropped smaller**, so the correct answer is known (the same photo). Everything is deterministic (fixed seeds).

```python run shared title="Step 1 · gallery, queries and ground truth"
import numpy as np
import cv2
import cvlab
from sklearn.cluster import MiniBatchKMeans
from skimage.feature import hog

NAMES = ["astronaut", "coffee", "cat", "camera", "coins", "page", "rocket", "retina", "moon", "text", "horse", "brick", "gravel", "grass"]
to_rgb = lambda a: cv2.cvtColor(a, cv2.COLOR_GRAY2RGB) if a.ndim == 2 else a
photos = {n: to_rgb(cvlab.image(n)) for n in NAMES}

def make_view(img, rng, rot=0, scale=(0.7, 1.0), bright=(0.8, 1.2), noise=3):
    h, w = img.shape[:2]
    s = rng.uniform(*scale); cw, ch = int(w * s), int(h * s)
    x, y = rng.integers(0, w - cw + 1), rng.integers(0, h - ch + 1)
    view = img[y:y + ch, x:x + cw]
    if rot:
        M = cv2.getRotationMatrix2D((cw / 2, ch / 2), rng.uniform(-rot, rot), 1.0)
        view = cv2.warpAffine(view, M, (cw, ch), borderMode=cv2.BORDER_REFLECT)
    view = cv2.resize(view, (160, 120)).astype(np.float32) * rng.uniform(*bright) + rng.normal(0, noise, (120, 160, 3))
    return np.clip(view, 0, 255).astype(np.uint8)

rng = np.random.default_rng(0)
gallery, g_labels = [], []
for i, n in enumerate(NAMES):
    for _ in range(8):
        gallery.append(make_view(photos[n], rng)); g_labels.append(i)
g_labels = np.array(g_labels)

def make_queries(seed=1, per_photo=4, **kw):
    r = np.random.default_rng(seed)
    q = [make_view(photos[n], r, **kw) for n in NAMES for _ in range(per_photo)]
    return q, np.repeat(np.arange(len(NAMES)), per_photo)

easy_q, easy_l = make_queries()
rot_q, rot_l = make_queries(rot=30)
hard_q, hard_l = make_queries(rot=30, scale=(0.5, 0.8), noise=8, bright=(0.7, 1.3))
print(f"gallery: {len(gallery)} images ({len(NAMES)} photos x 8 views) | queries per difficulty level: {len(easy_q)}")
cvlab.show(*[gallery[i] for i in (0, 1, 8, 9)], easy_q[0], rot_q[0], hard_q[0], titles=["astronaut view 1", "astronaut view 2", "coffee view 1", "coffee view 2", "easy query", "rotated query", "hard query"])
```

## Step 2 — Global descriptors

A **global descriptor** summarises the whole image as one vector:

- **Colour histogram**: how much of each colour (HSV bins). Insensitive to position and rotation, but different photos with similar colours confuse it.
- **Thumbnail**: a 16 × 12 grey image, mean-subtracted. Captures the layout, but it is destroyed by rotation and cropping.
- **HOG** (histogram of oriented gradients, module 4): edge orientations in a grid of cells. Captures shape and layout, also layout-dependent.

All descriptors are **L2-normalised**, so the dot product is the **cosine similarity** and search is a matrix product.

```python run shared title="Step 2 · three global descriptors and a search function"
def f_hist(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
    h = cv2.calcHist([hsv], [0, 1, 2], None, [8, 4, 4], [0, 180, 0, 256, 0, 256]).ravel()
    return h / (h.sum() + 1e-9)

def f_thumb(img):
    t = cv2.resize(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY), (16, 12)).astype(np.float32).ravel()
    return t - t.mean()                                                          # remove overall brightness

def f_hog(img):
    return hog(cv2.resize(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY), (96, 72)), orientations=9, pixels_per_cell=(12, 12), cells_per_block=(2, 2))

def l2(x): return x / (np.linalg.norm(x, axis=-1, keepdims=True) + 1e-9)

def build_index(feature_fn, images): return l2(np.array([feature_fn(im) for im in images]))

def evaluate(G, Q, q_labels, ks=(1, 5)):
    sim = Q @ G.T                                                                # cosine similarity of every query with every gallery image
    order = np.argsort(-sim, axis=1)
    out = {f"recall@{k}": float(np.mean([(g_labels[o[:k]] == l).any() for o, l in zip(order, q_labels)])) for k in ks}
    aps = []                                                                     # mean average precision: how early do ALL the correct images appear?
    for o, l in zip(order, q_labels):
        rel = (g_labels[o] == l).astype(float)
        aps.append((np.cumsum(rel) / np.arange(1, len(rel) + 1) * rel).sum() / rel.sum())
    out["mAP"] = float(np.mean(aps))
    return out

global_feats = {"colour histogram": f_hist, "thumbnail": f_thumb, "HOG": f_hog}
G_global = {name: build_index(fn, gallery) for name, fn in global_feats.items()}
print("descriptor          | easy queries: recall@1  recall@5  mAP")
for name, fn in global_feats.items():
    r = evaluate(G_global[name], build_index(fn, easy_q), easy_l)
    print(f"{name:<19} | {r['recall@1']:>20.3f} {r['recall@5']:>9.3f} {r['mAP']:>6.3f}")
```

## Step 3 — Local features and a bag of visual words

Global descriptors assume the picture is **aligned**. **Local features** do not: ORB keypoints (module 4) describe small patches that look the same after rotation, scaling or cropping. To search with thousands of local descriptors we treat the image like a **text document**: cluster all gallery descriptors into **200 "visual words"** (k-means on the descriptor bits), then describe an image by a **histogram of its words**, weighted by **TF-IDF** so that common words count less. This is the classic *bag of visual words* of Sivic and Zisserman (module 4).

```python run shared title="Step 3 · ORB, a visual vocabulary and TF-IDF"
orb = cv2.ORB_create(500)

def orb_descriptors(img):
    _, d = orb.detectAndCompute(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY), None)
    return d if d is not None else np.zeros((0, 32), np.uint8)

as_bits = lambda d: np.unpackbits(d, axis=1).astype(np.float32)                  # 32 bytes -> 256 bits, so k-means (Euclidean) approximates Hamming distance
all_desc = [orb_descriptors(g) for g in gallery]
vocabulary = MiniBatchKMeans(200, random_state=0, n_init=3, batch_size=2048).fit(as_bits(np.vstack([d for d in all_desc if len(d)])))
print(f"vocabulary: {len(vocabulary.cluster_centers_)} visual words learned from {sum(len(d) for d in all_desc)} ORB descriptors")

def word_histogram(img):
    d = orb_descriptors(img)
    if len(d) == 0:
        return np.zeros(200, np.float32)
    return np.bincount(vocabulary.predict(as_bits(d)), minlength=200).astype(np.float32)

hist_gallery = np.array([word_histogram(g) for g in gallery])
idf = np.log(len(gallery) / (1 + (hist_gallery > 0).sum(0)))                      # rare words are more informative
f_bow = lambda img: word_histogram(img) * idf
G_global["ORB bag-of-words"] = build_index(f_bow, gallery)
global_feats["ORB bag-of-words"] = f_bow
r = evaluate(G_global["ORB bag-of-words"], build_index(f_bow, easy_q), easy_l)
print(f"ORB bag-of-words, easy queries: recall@1 {r['recall@1']:.3f}, recall@5 {r['recall@5']:.3f}, mAP {r['mAP']:.3f}")
```

## Step 4 — Which descriptor survives which distortion?

Now the experiment that matters. We run all four descriptors on three query sets: **easy** (crops and brightness), **rotated** (±30°) and **hard** (rotation, strong crops, noise, stronger brightness changes). Predict first: which descriptors should break under rotation?

```python run shared title="Step 4 · robustness table"
query_sets = {"easy": (easy_q, easy_l), "rotated": (rot_q, rot_l), "hard": (hard_q, hard_l)}
Q_cache = {(name, qs): build_index(fn, query_sets[qs][0]) for name, fn in global_feats.items() for qs in query_sets}
print("recall@1 / mAP        |" + "".join(f" {qs:^15}|" for qs in query_sets))
for name in global_feats:
    row = ""
    for qs in query_sets:
        r = evaluate(G_global[name], Q_cache[(name, qs)], query_sets[qs][1])
        row += f" {r['recall@1']:.2f} / {r['mAP']:.2f}   |"
    print(f"{name:<21} |{row}")
print()
print("thumbnail and HOG describe the LAYOUT: rotation and cropping destroy it. The colour histogram ignores layout but cannot tell similar-coloured photos apart.")
print("local ORB words survive rotation and cropping because each patch is described on its own")
```

## Step 5 — Fuse descriptors

Different descriptors fail on different queries, so combining them helps. The simplest fusion: **concatenate** the (weighted) normalised vectors. The dot product of the concatenation is the **weighted sum of the individual cosine similarities**. We fuse the colour histogram (robust, but not discriminative) and the bag of words (discriminative, but sensitive to heavy distortion).

```python run shared title="Step 5 · fusion"
def fuse(D, weights):
    return l2(np.hstack([w * D[name] for name, w in weights.items()]))

print("fusion weights (colour, words) | recall@1 on the HARD queries | mAP")
for wc in (0.0, 0.4, 0.6, 1.0, 2.0):
    weights = {"colour histogram": wc, "ORB bag-of-words": 1.0}
    G = fuse(G_global, weights)
    Q = fuse({name: Q_cache[(name, "hard")] for name in weights}, weights)
    r = evaluate(G, Q, hard_l)
    print(f"{wc:>12.1f} : 1.0            | {r['recall@1']:>16.3f}             | {r['mAP']:.3f}")
print("a modest colour weight helps; too much makes the colour similarity dominate and brings back its confusions")
```

## Step 6 — Verify the geometry (re-ranking)

A bag of words ignores **where** the words are. Two images may share many words by accident, but only the right one has them in the **same geometric arrangement**. **Spatial verification** takes the top 10 candidates, matches ORB descriptors between the query and each one, fits a transform with **RANSAC** (module 4) and counts the **inliers**; the candidate with the most geometrically consistent matches wins. It costs more per image, so it only runs on a short list, which is the standard pipeline: *fast global filter → expensive verification*.

```python run shared title="Step 6 · RANSAC spatial verification"
def inlier_count(query_img, gallery_idx):
    kq, dq = orb.detectAndCompute(cv2.cvtColor(query_img, cv2.COLOR_RGB2GRAY), None)
    kg, dg = orb.detectAndCompute(cv2.cvtColor(gallery[gallery_idx], cv2.COLOR_RGB2GRAY), None)
    if dq is None or dg is None or len(dq) < 5 or len(dg) < 5:
        return 0
    knn = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(dq, dg, k=2)
    good = [m for m, n in (p for p in knn if len(p) == 2) if m.distance < 0.8 * n.distance]          # ratio test
    if len(good) < 5:
        return 0
    _, inl = cv2.estimateAffinePartial2D(np.float32([kq[m.queryIdx].pt for m in good]), np.float32([kg[m.trainIdx].pt for m in good]),
                                         method=cv2.RANSAC, ransacReprojThreshold=4)
    return 0 if inl is None else int(inl.sum())

weights = {"colour histogram": 0.6, "ORB bag-of-words": 1.0}
G = fuse(G_global, weights)
Q = fuse({name: Q_cache[(name, "hard")] for name in weights}, weights)
similarity = Q @ G.T
before = after = 0
rerank_examples = []
for qi, (img, label) in enumerate(zip(hard_q, hard_l)):
    top = np.argsort(-similarity[qi])[:10]
    inliers = [inlier_count(img, t) for t in top]
    best = top[int(np.argmax(inliers))]
    before += g_labels[top[0]] == label; after += g_labels[best] == label
    if g_labels[top[0]] != label and g_labels[best] == label and len(rerank_examples) < 2:
        rerank_examples.append((qi, top[0], best))
print(f"recall@1 on the hard queries: before verification {before / len(hard_q):.3f} -> after re-ranking the top 10 by RANSAC inliers {after / len(hard_q):.3f}")
for qi, wrong, fixed in rerank_examples:
    print(f"  query {qi} ({NAMES[hard_l[qi]]}): the fused score put '{NAMES[g_labels[wrong]]}' first; verification promoted '{NAMES[g_labels[fixed]]}'")
if rerank_examples:
    qi, wrong, fixed = rerank_examples[0]
    cvlab.show(hard_q[qi], "Query", gallery[wrong], "Fused ranking: first result (wrong)", gallery[fixed], "After spatial verification (correct)")
```

## Step 7 — The search function and where it fails

Wrap it in one function and look at **failure cases**: which queries are still wrong after everything, and why? A retrieval system you cannot debug is one you cannot improve.

```python run shared title="Step 7 · search() and the remaining errors"
def search(img, k=5, verify=True):
    q = fuse({name: l2(global_feats[name](img)) for name in weights}, weights)
    top = np.argsort(-(G @ q))[:10]                                                   # similarity of the query with every gallery vector
    if verify:
        top = top[np.argsort([-inlier_count(img, t) for t in top], kind="stable")]
    return top[:k]

wrong = []
for qi, (img, label) in enumerate(zip(hard_q, hard_l)):
    if g_labels[search(img, 1)[0]] != label:
        wrong.append((qi, label, g_labels[search(img, 1)[0]]))
print(f"remaining errors on the hard queries: {len(wrong)} of {len(hard_q)}")
for qi, true, got in wrong[:5]:
    print(f"  query {qi}: should be '{NAMES[true]}', returned '{NAMES[got]}'")
print("typical causes: a crop of a nearly featureless region (the moon has almost no keypoints), very similar textures (gravel versus grass), strong blur or noise")
print("learned embeddings (module 11) reduce these errors a lot, and approximate nearest-neighbour indexes (module 13) make the search fast at millions of images")
if wrong:
    qi, true, got = wrong[0]
    cvlab.show(hard_q[qi], f"Query (truth: {NAMES[true]})", gallery[int(np.where(g_labels == got)[0][0])], f"Returned: {NAMES[got]}")
```

## How it works

| Piece | Purpose |
|---|---|
| L2-normalised vectors | cosine similarity is a dot product, so search is one matrix product |
| Colour histogram | position- and rotation-free, cheap, weakly discriminative |
| Thumbnail and HOG | describe layout; fail under rotation and strong cropping |
| ORB bag of words + TF-IDF | local features survive geometric changes; TF-IDF down-weights common words |
| Fusion by concatenation | combines the strengths of different descriptors |
| RANSAC verification | checks the geometric consistency of matches among the top candidates |
| recall@k and mAP | recall@1 = was the top hit right; mAP = are all correct images ranked early |

**Scaling up** (module 13): replace the vectors by **learned embeddings** (DINOv2, CLIP) for better semantic and instance matching, search with an **approximate index** (IVF, HNSW), and keep the *verification* idea as a re-ranking stage for exact-instance retrieval.

:::exercise Extend it
1. Add a **scale** experiment: queries cropped to 20-30% of the photo. Which descriptor survives?
2. Try **SIFT** instead of ORB (`cv2.SIFT_create()` and Euclidean distance) for the bag of words and compare accuracy and speed.
3. Replace the TF-IDF histogram by a **VLAD** descriptor (sum of residuals to the nearest centroid) and compare.
4. Add **query expansion**: average the query vector with its top-3 results and search again.
5. Add 500 **distractor images** (crops of photos not in your 14) and see how recall falls with the gallery size.
6. Implement an **inverted index** for the bag of words (word to image list) and measure the speed-up over scanning all vectors.
:::

:::keypoints
- Visual search = a descriptor per image, normalised vectors, cosine ranking, evaluated with recall@k and mAP on queries with known answers.
- Global descriptors describe layout and break under rotation and cropping; local features with a bag of visual words survive them.
- Fusing complementary descriptors beats any single one.
- RANSAC spatial verification of a short list fixes errors that ignore geometry.
- Always inspect failures: textureless crops and similar textures are the usual causes, and they motivate learned embeddings.
:::
