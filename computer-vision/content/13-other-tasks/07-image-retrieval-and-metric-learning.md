---
title: Image Retrieval, Embeddings and Similarity Search
level: advanced
time: 50
summary: Finding similar images at scale. Global and local descriptors, metric learning (contrastive, triplet, ArcFace), re-identification, retrieval metrics (recall@k, mAP), approximate nearest-neighbour search (IVF, HNSW, FAISS) with a runnable demo, re-ranking, visual place recognition, and system design.
---

"Find me pictures like this one" powers visual search in shopping, duplicate detection, **place recognition** for robot relocalisation, **re-identification** of people and vehicles, and retrieval for **RAG over images**. It also joins classical and modern vision: module 4 built it with SIFT and a bag of words; today it uses **learned embeddings** and **vector search**.

## The recipe

:::flow Embedding-based retrieval
Embed | A network maps each image to a vector (128–2048 numbers), normalised to length 1.
Index | Store all database vectors in a vector index (exact for small sets, approximate for millions).
Query | Embed the query image (or the text, with CLIP/SigLIP); find the `k` nearest vectors by cosine similarity.
Re-rank | Optionally refine the top 100 with local features and geometry (RANSAC), or a cross-encoder.
Serve | Return results; log clicks to improve the model.
:::

## What embedding?

| Embedding | Notes |
|---|---|
| **Pre-trained classifier features** (ResNet pool layer) | A quick baseline; mostly category-level similarity |
| **Self-supervised** (DINOv2) | Strong for visual similarity and instance matching without labels |
| **Vision-language** (CLIP, SigLIP) | Allows text queries and cross-modal search; weak on very fine instance details |
| **Metric-learning models trained for your task** | Best for fine-grained instances (the exact product, the same person) |
| **Local features + aggregation**: SIFT/ORB with bag-of-words or VLAD (module 4), **NetVLAD**, **DELG** (global + local) | Place recognition, landmarks, geometric verification |
| **GeM pooling** of CNN features | A learned generalised mean; a strong global descriptor trick |

## Metric learning in one page

We want a space where **same-identity items are close and different ones are far**. Common losses:

- **Contrastive loss**: pull positive pairs together; push negative pairs apart beyond a margin.
- **Triplet loss**: for an anchor `a`, positive `p`, negative `n`: `max(0, d(a,p) − d(a,n) + margin)`. Quality depends on **mining**: easy triplets give no signal. **Batch-hard** (hardest positive and negative in the batch) or **semi-hard** mining works well (batches built with P identities × K images each).
- **Classification-style margin losses (ArcFace, CosFace, Proxy-Anchor, SupCon)**: use class proxies or supervised contrastive learning; usually more stable and better than triplet if you have class labels (module 13, face lesson).
- **Self-supervised contrastive** (SimCLR/MoCo/DINO) when there are no labels: positives are two augmented views.

Practical rules: normalise the embeddings; use a **temperature**/margin tuned on a validation set; sample batches with several images per identity; train with augmentations typical of the deployment (viewpoint, lighting, crops); **evaluate on classes not seen in training** (open-set), because the product catalogue changes.

```python local check title="Batch-hard triplet loss: zero for separated identities, positive for confusable ones"
import torch
from torch import nn

def batch_hard_triplet(emb, labels, margin=0.3):
    emb = nn.functional.normalize(emb, dim=1)
    d = 1 - emb @ emb.T                                               # cosine distance between every pair in the batch
    same = labels[:, None] == labels[None, :]
    pos = (d * (same & ~torch.eye(len(labels), dtype=torch.bool))).max(1).values     # hardest positive: the farthest same-identity item
    neg = (d + 10 * same).min(1).values                                               # hardest negative: the closest other-identity item
    return torch.relu(pos - neg + margin).mean(), pos.mean().item(), neg.mean().item()

torch.manual_seed(0)
labels = torch.arange(4).repeat_interleave(4)                         # 4 identities x 4 images
centres = nn.functional.normalize(torch.randn(4, 16), dim=1)
well_separated = centres[labels] + 0.05 * torch.randn(16, 16)         # tight clusters far apart
confusable = centres[labels] + 1.2 * torch.randn(16, 16)              # clusters that overlap
for name, emb in [("well separated", well_separated), ("confusable", confusable)]:
    loss, pos, neg = batch_hard_triplet(emb, labels)
    print(f"{name:<15} loss {loss.item():.3f}   hardest-positive distance {pos:.2f}   hardest-negative distance {neg:.2f}")
print("training lowers the loss by moving hard positives closer and hard negatives farther")
```

## Retrieval metrics

- **Recall@K**: the share of queries for which at least one correct item is in the top K. **Precision@K** and **mAP** (mean over queries of the average precision of the ranked list; Oxford/Paris, Revisited benchmarks).
- **CMC / Rank-1** and **mAP** for re-identification (Market-1501, DukeMTMC, MSMT17, VeRi for vehicles).
- **NDCG** when relevance has grades; **latency (p50/p99)** and **QPS** as system metrics; **recall of the approximate index against exact search** (shown below).
- Always report the **gallery size**: results degrade as the database grows.

## Searching millions of vectors: approximate nearest neighbours

Exact search compares the query with every vector: `O(N·D)`. For 100 M vectors this is too slow, so we use **approximate nearest-neighbour (ANN)** indexes that trade a bit of recall for large speed-ups:

- **IVF (inverted file)**: cluster the database with k-means; at query time scan only the `nprobe` nearest clusters.
- **HNSW** (hierarchical navigable small world graph): walk a layered graph towards the query; best recall/speed for in-memory search, larger memory.
- **PQ (product quantisation)**: compress each vector into a few bytes (split into sub-vectors, each snapped to a codebook entry) so billions fit in RAM; often combined as **IVF-PQ**.
- **ScaNN, DiskANN, Annoy, hnswlib**; **FAISS** (Meta) implements most of these on CPU and GPU. Vector databases (Milvus, Qdrant, Weaviate, pgvector, Elasticsearch) add filters, persistence and updates.

```python run title="IVF in 25 lines: speed versus recall" level=advanced
import numpy as np
from sklearn.cluster import MiniBatchKMeans

rng = np.random.default_rng(0)
N, D, topics = 20000, 64, 100
centres = rng.normal(0, 1, (topics, D))
db = centres[rng.integers(0, topics, N)] + 0.6 * rng.normal(0, 1, (N, D))        # a database of embeddings that form groups (like similar-looking products)
db /= np.linalg.norm(db, axis=1, keepdims=True)
queries = db[rng.choice(N, 200, replace=False)] + 0.2 * rng.normal(0, 1, (200, D))
queries /= np.linalg.norm(queries, axis=1, keepdims=True)
K = 10

exact = np.argsort(-(queries @ db.T), axis=1)[:, :K]                             # brute force: compare with all 20,000 vectors
print(f"brute force: every query is compared with all {N} vectors")

# IVF (inverted file): cluster the database; at query time only scan the nearest few clusters
nlist = 100
km = MiniBatchKMeans(nlist, random_state=0, n_init=3, batch_size=2048).fit(db)
assign = km.labels_
members = [np.where(assign == c)[0] for c in range(nlist)]
cent = km.cluster_centers_ / np.linalg.norm(km.cluster_centers_, axis=1, keepdims=True)
print("nprobe | recall@10 vs exact | share of the database scanned")
for nprobe in (1, 2, 5, 10, 25):
    hits, scanned = 0, 0
    for qi, q in enumerate(queries):
        cl = np.argsort(-(cent @ q))[:nprobe]
        cand = np.concatenate([members[c] for c in cl])
        top = cand[np.argsort(-(db[cand] @ q))[:K]]
        hits += len(set(top) & set(exact[qi])); scanned += len(cand)
    print(f"{nprobe:>6} | {hits / (K * len(queries)):.3f}              | {scanned / (len(queries) * N):.1%}")
print("scan a few percent of the data and still find most true neighbours; this speed/recall trade-off is what FAISS, HNSW and ScaNN manage")
```

Rule of thumb: pick the **smallest `nprobe`/`efSearch`** that gives ≥ 95–99% recall of exact search, then measure end-to-end accuracy (not only ANN recall).

## Re-ranking and geometric verification

Global embeddings are fast but coarse. For **instance-level** retrieval (the same building, the same product), re-rank the top 50–200 results with **local features** (SuperPoint + LightGlue, SIFT, DELG local branch) and **RANSAC** (module 4) counting geometrically consistent inliers. Add **query expansion** (average the query with its top results and search again) and **diffusion** for extra recall.

## Re-identification (ReID) and place recognition

- **Person/vehicle ReID**: match the same identity across cameras with non-overlapping views; embeddings trained with ID classification plus triplet loss (BoT baseline), using part-based features (PCB), transformers (TransReID) and CLIP-ReID. Challenges: viewpoint, clothing change, occlusion, lighting, and **domain shift** between camera networks. Used in tracking across cameras, retail analytics (with privacy care).
- **Visual place recognition (VPR)**: recognise a place from an image for **loop closure in SLAM** and robot relocalisation: NetVLAD, CosPlace, MixVPR, **AnyLoc/DINOv2-based** descriptors, followed by geometric verification. Must handle day/night, season and viewpoint change.
- **Product and duplicate search**, **near-duplicate detection** (perceptual hashes: pHash/dHash for exact-ish copies, embeddings for semantic similarity) and **image provenance**.

## System design checklist (a favourite interview question)

1. **Define similarity**: same instance, same category, or same style? This decides the embedding and the labels.
2. **Data**: collect pairs/identities; hard negatives from real confusions; keep a separate unseen-identity test set.
3. **Model**: start with DINOv2/CLIP embeddings as a baseline; fine-tune with metric learning if fine-grained.
4. **Index**: pick exact for < 100 k vectors, IVF/HNSW for millions, IVF-PQ for billions; plan updates (add/delete), sharding and filters (category, price).
5. **Pipeline**: detect and crop the object first (so the background does not dominate), embed, search, re-rank.
6. **Evaluate**: recall@K, mAP, latency, memory, and A/B tests with users.
7. **Monitor and update**: embedding versions (re-embed the database when the model changes), drift, feedback loop with clicks.

:::interview Questions you may get
- "How would you build a visual search system for 10 million products?" Crop with a detector, embed with a fine-tuned or foundation model, index with IVF-PQ/HNSW in FAISS or a vector DB, re-rank, evaluate recall@K and latency, plan re-embedding.
- "Explain triplet loss and mining." Anchor/positive/negative with a margin; mining hard or semi-hard triplets provides gradient; easy triplets give none.
- "How does ANN search work and what is the trade-off?" Cluster or graph structures limit comparisons; more probes/ef gives higher recall and higher latency.
- "How would you evaluate a retrieval model?" Recall@K, mAP on identities not seen in training, plus latency, memory, and online metrics.
- "Global versus local descriptors?" Global: compact, fast, good for category/near-duplicates; local with geometric verification: precise for the same instance and robust to partial views, but slower.
- "How do you handle domain shift in ReID?" Domain adaptation, unsupervised fine-tuning on target cameras, camera-aware losses, and re-ranking.
:::

```quiz
? What is recall@10 in retrieval?
+ The share of queries with at least one correct result in the top 10
- The number of results returned
- The average embedding size
> Higher is better.

? Why does HNSW or IVF help at scale?
+ It avoids comparing the query with every database vector
- It makes embeddings more accurate
- It removes the need for embeddings
> Approximate search.

? What is batch-hard mining?
+ For each anchor, use the farthest positive and the closest negative in the batch
- Choosing random triplets
- Removing hard images from training
> It provides informative gradients.

? When should you add geometric verification (RANSAC) after retrieval?
+ When you need the exact same instance or place and want to reject look-alikes
- When you want category-level similarity only
- Never
> Count consistent local matches.
```

:::problem A fashion shop has 2 million product photos and wants "shop the look": users upload a street photo and see matching products. Describe your design and how you would test it. {level=hard tags="retrieval,system-design"}
Think about cropping, domain gap and evaluation.

:::solution Model answer
Detect clothing items in the user photo (detector or segmenter) and crop each; embed with a model fine-tuned by metric learning on street-to-shop pairs (the domain gap between street photos and clean catalogue shots is the main difficulty), using a baseline of CLIP/DINOv2 first. Index the catalogue with HNSW or IVF-PQ in a vector database with attribute filters (category, gender, availability). Re-rank the top candidates with a finer model or attributes (colour, pattern), and diversify results. Evaluate offline with recall@K and mAP on a held-out set of street/shop pairs with unseen products, then online with click-through and add-to-cart A/B tests; monitor latency and update embeddings when the catalogue or model changes.
:::
:::

:::keypoints
- Retrieval = embed, index, search, re-rank; choose the embedding for the similarity you need (category, instance, text-to-image).
- Metric learning (triplet with hard mining, ArcFace/SupCon proxies, contrastive) shapes the space; evaluate on unseen classes.
- ANN indexes (IVF, HNSW, PQ; FAISS) give 10–1000× speed-ups at small recall loss; tune `nprobe`/`ef` for ≥ 95–99% recall of exact search.
- Re-rank with local features and RANSAC for instance retrieval; ReID and place recognition are the same idea in other settings.
:::

:::resources
- [Hermans et al.: In Defense of the Triplet Loss for Person Re-Identification](https://arxiv.org/abs/1703.07737) — batch-hard triplet mining.
- [Johnson et al.: Billion-scale similarity search with GPUs (FAISS)](https://arxiv.org/abs/1702.08734) — the library's design.
- [Malkov and Yashunin: Efficient and robust approximate nearest neighbor search using HNSW](https://arxiv.org/abs/1603.09320) — the graph index.
- [Arandjelovic et al.: NetVLAD](https://arxiv.org/abs/1511.07247) — place recognition.
- [Radenovic et al.: Revisiting Oxford and Paris](https://arxiv.org/abs/1803.11285) — retrieval benchmarks and evaluation.
- [FAISS wiki on GitHub](https://github.com/facebookresearch/faiss/wiki) — practical index guide.
:::
