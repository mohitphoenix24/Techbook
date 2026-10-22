---
title: Image Retrieval — Bag of Visual Words
level: intermediate
time: 35
summary: Search a big photo collection for pictures of the same place. Quantise local descriptors into visual words, describe each image by a histogram of words, rank with TF-IDF and an inverted index, verify with geometry, and see how modern embeddings replaced this.
---

Given a query photo, how do you find **the same building** in a database of a million pictures? Matching features against every picture is far too slow. In 2003, Sivic and Zisserman had a great idea: **treat an image like a text document.**

## The bag-of-words analogy

A text search engine does not read every document for every query. It keeps an **index**: for each **word**, the list of documents that contain it. A query becomes a set of words, and the engine finds documents with the most of them.

For images we need "words". We make them by **quantising** local descriptors:

:::flow Bag of visual words
1. Extract | Detect local features (SIFT) in many training images. Each gives a 128-D descriptor.
2. Cluster | Run k-means on all descriptors. Each cluster centre is a visual word. Typical vocabulary size: 10,000 to 1,000,000.
3. Quantise | For each descriptor in an image, find its nearest visual word.
4. Histogram | Count how many times each word appears in the image. This histogram is the image's description (a long sparse vector).
5. Search | Compare the query histogram with the database histograms (TF-IDF weighting, cosine similarity), using an inverted index.
:::

"A visual word" is something like "a corner with a dark bar to the left": a small recurring texture pattern. The order and position of the words are ignored, just like a text bag of words, which is why it is called a **bag**.

## TF-IDF weighting

Common words ("the") say little; rare words say a lot. **TF-IDF** (term frequency × inverse document frequency) scales each word count:

- **TF**: how often the word appears in this image (normalised).
- **IDF**: `log(N / n_w)`, where `N` is the number of images and `n_w` the number containing word `w`. Words found in almost every image get a small weight.

## Build a tiny search engine

We build a vocabulary from SIFT descriptors of a small collection, describe each image as a TF-IDF histogram, and query with a **transformed** version of one picture (rotated, shrunk, darker, noisy).

```python run title="A tiny image search engine with visual words" level=advanced
import cv2
import numpy as np
from sklearn.cluster import MiniBatchKMeans
import cvlab

names = ["coffee", "astronaut", "cat", "rocket", "retina", "brick", "grass", "gravel"]
db = {n: cvlab.image(n, size=(240, 240), gray=True) for n in names}
sift = cv2.SIFT_create(nfeatures=300)

def describe(g):
    _, d = sift.detectAndCompute(g, None)
    return d if d is not None else np.zeros((0, 128), np.float32)

all_desc = {n: describe(g) for n, g in db.items()}
print("descriptors per image:", {n: len(d) for n, d in all_desc.items()})

K = 60                                                                   # a tiny vocabulary (real systems use 10^5 or more)
kmeans = MiniBatchKMeans(n_clusters=K, random_state=0, n_init=3, batch_size=256).fit(np.vstack(list(all_desc.values())))

def histogram(d):
    h = np.bincount(kmeans.predict(d), minlength=K).astype(float) if len(d) else np.zeros(K)
    return h

H = np.array([histogram(all_desc[n]) for n in names])                    # one row per database image
df = (H > 0).sum(axis=0)                                                 # in how many images does each word occur?
idf = np.log(len(names) / (1 + df)) + 1
tfidf = lambda h: (h / (h.sum() + 1e-9)) * idf
D = np.array([tfidf(h) for h in H])
D /= np.linalg.norm(D, axis=1, keepdims=True) + 1e-9                      # unit length: dot product = cosine similarity

# the query: the coffee picture rotated, shrunk, darker and noisier
a, b, _ = cvlab.warped_pair("coffee")
query = cv2.resize(cv2.cvtColor(b, cv2.COLOR_RGB2GRAY), (240, 240))
q = tfidf(histogram(describe(query))); q /= np.linalg.norm(q) + 1e-9
scores = D @ q
order = np.argsort(-scores)
print("ranking for the transformed coffee photo:")
for r in order[:4]:
    print(f"  {names[r]:10s} cosine {scores[r]:.3f}")
cvlab.show(query, "Query", db[names[order[0]]], f"Top result: {names[order[0]]}")
```

The correct picture comes first. With a tiny vocabulary and only a few hundred descriptors per image this is a toy, but the structure is exactly that of a real system.

## The inverted index: why it is fast

A histogram has maybe 1,000,000 entries but an image uses only a few thousand of them (it is **sparse**). The **inverted index** stores, for each word, the list of images that contain it. To answer a query, you visit only the lists of the query's words, and add up scores. A search in a million images then takes milliseconds.

## Geometric verification (re-ranking)

Bag of words ignores position, so it can return pictures that share many words but are not the same place. The standard fix: take the **top 20–100 results** and verify each with a **geometric check**: match local features between the query and the candidate, fit a homography or fundamental matrix with **RANSAC**, and count the inliers. A candidate with many consistent inliers is a true match. Re-rank by inlier count. This two-stage design (fast, approximate, then precise) is everywhere in retrieval and recognition.

## Related compact descriptions

- **VLAD** (Vector of Locally Aggregated Descriptors): for each visual word, sum the **residuals** (descriptor minus centre). More information in a small vector.
- **Fisher vectors**: a soft, statistical version using Gaussian mixture models.
- **NetVLAD**: VLAD with the clustering learned inside a CNN for place recognition ([paper](https://arxiv.org/abs/1511.07247)).

## What replaced it

Today most image search uses **one global embedding vector per image** from a neural network (a CNN or a Vision Transformer, or CLIP for text-to-image search), with **approximate nearest neighbour** search (FAISS, HNSW, ScaNN) in place of the inverted index. These embeddings capture meaning, not just local appearance. Visual-word ideas still appear in **loop closure detection** in SLAM (DBoW2, DBoW3 libraries), where a compact, fast, hand-built vocabulary is handy: when a robot revisits a place, the bag-of-words match tells it quickly.

:::interview Questions you may get
- "Explain bag of visual words." Cluster local descriptors into a vocabulary; each image becomes a histogram of word counts; compare histograms (TF-IDF, cosine).
- "What is an inverted index?" A map from each visual word to the images that contain it; makes queries fast.
- "Why add geometric verification?" The bag ignores layout; RANSAC on local matches removes false positives.
- "How would you build image search today?" Embeddings from a pretrained vision model (CLIP/DINOv2), an ANN index like FAISS, optional re-ranking.
- "Where is BoW still used?" Loop closure in visual SLAM (DBoW2).
:::

```quiz
? What is a "visual word"?
- A caption of the image
+ The centre of a cluster of local descriptors
- A keypoint position
> A vocabulary is learned with k-means on many descriptors.

? Why is TF-IDF useful?
+ It down-weights words that appear in many images, so rare, distinctive words count more
- It reduces image size
- It finds keypoints
> Frequent words carry little information.

? What makes a bag-of-words search fast?
- GPU only
+ An inverted index that visits only the lists of the query's words
- A smaller image
> Sparse histograms plus an index avoid comparing with every image.

? What do you do with the top results to remove false positives?
+ Geometric verification with RANSAC on local feature matches
- Increase the vocabulary
- Resize them
> Consistent geometry confirms a real match.
```

:::problem Design an image search for 5 million product photos with queries by photo and by text. Compare a bag-of-words design with an embedding design. {level=medium tags="retrieval,design,embeddings"}
Think about quality, cost and text queries.

:::solution Model answer
Bag of words: SIFT features, a large vocabulary, an inverted index. It is good for near-duplicate and same-object search (instance retrieval), needs no training data, and adds geometric verification, but it cannot answer text queries and it struggles with category-level similarity ("a similar-looking chair"). Embedding design: a pretrained image encoder (CLIP, SigLIP or DINOv2), one vector per image (512–1024 numbers, optionally quantised), an ANN index (FAISS IVF-PQ or HNSW). It supports text-to-image search with the CLIP text encoder, handles category-level similarity, and scales well. Fine-tune with product pairs if instance-level accuracy matters, and re-rank the top results with a stronger model or local-feature verification. Evaluate with recall@K on labelled queries.
:::
:::

:::keypoints
- Bag of visual words: cluster descriptors into a vocabulary, describe each image by a histogram of words, rank with TF-IDF.
- An inverted index makes search fast; geometric verification with RANSAC removes false positives.
- VLAD and Fisher vectors compress more information. NetVLAD learns it.
- Modern search uses global embeddings plus ANN indexes; bag of words survives in SLAM loop closure.
:::

:::resources
- [Sivic and Zisserman: Video Google (2003)](https://www.robots.ox.ac.uk/~vgg/publications/2003/Sivic03/sivic03.pdf) — the paper that introduced bag of visual words for retrieval.
- [NetVLAD: CNN architecture for weakly supervised place recognition](https://arxiv.org/abs/1511.07247) — the learned version.
- [FAISS library](https://github.com/facebookresearch/faiss) — fast nearest neighbour search for embeddings.
:::
