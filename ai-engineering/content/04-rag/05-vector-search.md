---
title: Vector Search — From Brute Force to HNSW and PQ
level: advanced
time: 55
summary: How a vector database finds nearest neighbours among millions of vectors in milliseconds. Exact search and why it does not scale, the recall–speed–memory triangle, IVF (cluster then probe), HNSW (navigable graphs), product quantization, and the knobs that matter. Each index built from scratch in NumPy and measured, plus an interactive IVF explorer.
---

You have a query vector and 50 million document vectors. Which ones are closest? Comparing the query with all 50 million (**exact** or **brute-force** search) costs 50 million × 1,536 multiplications, about a hundred billion operations: too slow for an interactive app. **Approximate nearest neighbour (ANN)** indexes trade a **small loss in accuracy** for **huge gains in speed**.

:::def Recall (for ANN)
The fraction of the true nearest neighbours that the approximate search actually returns. If exact search says the top-10 are {a…j} and ANN returns 9 of them, recall@10 = 0.9. ANN indexes let you pick the point on the **recall ↔ speed ↔ memory** triangle that suits you.
:::

## Exact search: always the baseline

For up to roughly a few hundred thousand vectors, **brute force on a laptop or one GPU is fine and gives perfect recall**. Many small RAG systems never need anything else. Libraries like FAISS (`IndexFlatIP`) and plain NumPy matrix multiplication are extremely well optimised.

```python run title="Exact search with one matrix multiply" level=easy
import numpy as np, time

rng = np.random.default_rng(0)
N, D = 100_000, 64
X = rng.normal(size=(N, D)).astype(np.float32); X /= np.linalg.norm(X, axis=1, keepdims=True)
q = X[123] + 0.05 * rng.normal(size=D).astype(np.float32); q /= np.linalg.norm(q)

t0 = time.perf_counter()
scores = X @ q                                   # cosine similarity against every vector at once
top = np.argpartition(-scores, 10)[:10]          # fast top-10 without a full sort
top = top[np.argsort(-scores[top])]
ms = (time.perf_counter() - t0) * 1000
print(f"exact top-10 over {N:,} vectors in {ms:.1f} ms; best id = {top[0]} (expected 123)")
print("memory for the vectors:", f"{X.nbytes / 1e6:.0f} MB", "(float32)")
```

Scale that to 100 million 1,536-dim vectors and you need 600 GB of RAM and seconds per query. That is when indexes matter.

## Interactive: IVF

**IVF (inverted file index)** clusters the vectors into `nlist` cells (k-means). At query time it finds the `nprobe` cells whose centres are closest to the query and scans only those. Move the query, change the number of cells searched, and watch recall against work.

```viz algo=ann title="Exact vs IVF"
```

:::analogy
A library sorted into sections (cooking, history, travel). To find books about Italian pasta you walk straight to *cooking* and browse there instead of scanning every shelf. If the best book was mis-shelved in *travel*, you miss it: that is the lost recall. Searching two or three nearby sections (`nprobe`) recovers most of it.
:::

## IVF from scratch

```python run title="IVF: cluster, probe, rescore" level=advanced
import numpy as np

rng = np.random.default_rng(1)
N, D, NLIST, Q, K = 20_000, 32, 64, 100, 10
centers = rng.normal(size=(50, D))
X = (centers[rng.integers(50, size=N)] + 0.5 * rng.normal(size=(N, D))).astype(np.float32)
queries = X[rng.choice(N, Q, replace=False)] + 0.1 * rng.normal(size=(Q, D)).astype(np.float32)

def kmeans(X, k, iters=8):
    cents = X[rng.choice(len(X), k, replace=False)].copy()
    for _ in range(iters):
        d = (X ** 2).sum(1)[:, None] - 2 * X @ cents.T + (cents ** 2).sum(1)[None, :]
        assign = d.argmin(1)
        for j in range(k):
            m = X[assign == j]
            if len(m): cents[j] = m.mean(0)
    return cents, assign

cents, assign = kmeans(X, NLIST)
lists = [np.where(assign == j)[0] for j in range(NLIST)]                      # the "inverted lists"

def l2(a, B): return ((B - a) ** 2).sum(1)
truth = [set(np.argsort(l2(q, X))[:K]) for q in queries]                      # exact answers

def ivf_search(q, nprobe):
    cells = np.argsort(l2(q, cents))[:nprobe]                                 # closest cell centres
    cand = np.concatenate([lists[c] for c in cells])                          # only these vectors are scanned
    best = cand[np.argsort(l2(q, X[cand]))[:K]]
    return set(best), len(cand) + NLIST

print(f"{NLIST} cells over {N:,} vectors; exact search scans {N:,} vectors per query")
for nprobe in (1, 2, 4, 8, 16):
    rec, work = 0, 0
    for q, t in zip(queries, truth):
        found, w = ivf_search(q, nprobe); rec += len(found & t) / K; work += w
    print(f"nprobe={nprobe:>2}: recall@{K} = {rec / Q:.2f}   avg vectors compared = {work / Q:>7,.0f}  ({work / Q / N:5.1%} of exact)")
```

**Knobs:** more `nlist` = smaller cells, faster scans but a higher chance the answer is in a neighbouring cell; more `nprobe` = better recall, slower. A typical rule is `nlist ≈ √N` to `4√N`, and tuning `nprobe` for your recall target.

## HNSW: a graph you can navigate

**HNSW (Hierarchical Navigable Small World)** ([paper](https://arxiv.org/abs/1603.09320)) is the most popular index for in-memory ANN. Idea:

1. Connect each vector to a handful of **near neighbours**, forming a graph.
2. To search, start at an entry point and **greedily walk** toward the query: at each step move to the neighbour closest to the query.
3. A greedy walk on a flat graph can be slow to cross long distances, so HNSW builds **several layers**: a sparse top layer with long-range links (like highways) and denser lower layers (like streets). Search descends from the top layer, using each layer to get close and the bottom layer to refine.

```viz algo=arch title="HNSW search: descend through layers" dir=down
l2 Layer 2 | few nodes, long jumps [vector] @0,0
l1 Layer 1 | more nodes [vector] @1,0
l0 Layer 0 | all nodes, short links [vector] @2,0
res Top-k result | refined with ef candidates [search] @3,0
--
l2 -> l1 : enter nearest node
l1 -> l0 : continue greedy walk
l0 -> res : beam search (efSearch)
```

Parameters:

- **M**: links per node. Higher = better recall, more memory.
- **efConstruction**: effort while building. Higher = better graph, slower indexing.
- **efSearch** (or `ef`): size of the candidate list during search. Higher = better recall, slower queries. **This is your main runtime knob.**

```python run title="Greedy graph search with a beam (the heart of HNSW)" level=advanced
import numpy as np, heapq

rng = np.random.default_rng(2)
N, D, M, K, Q = 8000, 32, 12, 10, 60
centers = rng.normal(size=(40, D))
X = (centers[rng.integers(40, size=N)] + 0.6 * rng.normal(size=(N, D))).astype(np.float32)

# build a k-nearest-neighbour graph (brute force; real HNSW builds it incrementally, in layers)
sq = (X ** 2).sum(1)
neighbors = np.empty((N, M), dtype=np.int32)
for i in range(0, N, 500):
    d = sq[i:i + 500, None] - 2 * X[i:i + 500] @ X.T + sq[None, :]
    d[np.arange(len(d)), np.arange(i, i + len(d))] = np.inf
    neighbors[i:i + 500] = np.argpartition(d, M, axis=1)[:, :M]

hubs = rng.choice(N, 300, replace=False)          # a stand-in for HNSW's sparse upper layer: random "hub" nodes

def beam_search(q, ef):
    dist = lambda i: float(((X[i] - q) ** 2).sum())
    entry = int(hubs[np.argmin(((X[hubs] - q) ** 2).sum(1))])      # "upper layer": jump to the closest hub
    visited = {entry}; evals = 1 + len(hubs)
    cand = [(dist(entry), entry)]                 # min-heap of nodes to expand
    best = [(-cand[0][0], entry)]                 # max-heap (negated) of the ef best found
    while cand:
        d, i = heapq.heappop(cand)
        if len(best) >= ef and d > -best[0][0]:
            break                                  # the closest unexplored node is worse than our worst result
        for j in neighbors[i]:
            j = int(j)
            if j in visited: continue
            visited.add(j); dj = dist(j); evals += 1
            if len(best) < ef or dj < -best[0][0]:
                heapq.heappush(cand, (dj, j)); heapq.heappush(best, (-dj, j))
                if len(best) > ef: heapq.heappop(best)
    return [i for _, i in sorted((-nd, i) for nd, i in best)[:K]], evals

queries = X[rng.choice(N, Q, replace=False)] + 0.1 * rng.normal(size=(Q, D)).astype(np.float32)
truth = [set(np.argsort(((X - q) ** 2).sum(1))[:K]) for q in queries]
print(f"{N:,} vectors, graph degree {M}; exact search compares all {N:,}  (evaluations include scanning the {len(hubs)} hubs)")
for ef in (10, 20, 40, 80, 160):
    rec = ev = 0
    for q, t in zip(queries, truth):
        found, e = beam_search(q, ef); rec += len(set(found) & t) / K; ev += e
    print(f"ef={ef:>3}: recall@{K} = {rec / Q:.2f}   distance evaluations = {ev / Q:>6,.0f}  ({ev / Q / N:5.1%} of exact)")
```

Without the hub "upper layer" the greedy walk starts in an arbitrary place and, because the vectors form clusters, can get stuck far from the answer (try `entry = 0` to see recall collapse). That is exactly the problem the hierarchy solves. HNSW gives excellent recall at tiny work, but it is **memory-hungry** (the whole graph and vectors live in RAM), slower to build, and handles deletions awkwardly (marking tombstones).

## Compression: product quantization (PQ)

**Product quantization** compresses vectors by splitting each into `m` sub-vectors and replacing each sub-vector with the **id of its nearest centroid** from a small learned codebook. A 64-dim float32 vector (256 bytes) becomes `m = 16` codes of one byte each: **16 bytes, 16× smaller** (real systems often reach 32× or more with larger `m` choices and 4-bit codes). Distances are estimated with small lookup tables.

```python run title="Product quantization: 16x smaller, how much recall?" level=advanced
import numpy as np

rng = np.random.default_rng(3)
N, D, M, KC, Q, K = 6000, 64, 16, 64, 40, 10         # M sub-vectors, KC centroids per sub-space (64 -> 6 bits)
centers = rng.normal(size=(30, D))
X = (centers[rng.integers(30, size=N)] + 0.7 * rng.normal(size=(N, D))).astype(np.float32)
sub = D // M

def kmeans(P, k, iters=8):
    c = P[rng.choice(len(P), k, replace=False)].copy()
    for _ in range(iters):
        a = ((P[:, None, :] - c[None]) ** 2).sum(2).argmin(1)
        for j in range(k):
            if (a == j).any(): c[j] = P[a == j].mean(0)
    return c

codebooks = [kmeans(X[:, m * sub:(m + 1) * sub], KC) for m in range(M)]
codes = np.stack([((X[:, m * sub:(m + 1) * sub][:, None, :] - codebooks[m][None]) ** 2).sum(2).argmin(1) for m in range(M)], axis=1).astype(np.uint8)

def pq_search(q, rescore=0):
    # asymmetric distance: per sub-space, distance from the query piece to every centroid, then sum by code lookup
    tables = np.stack([((codebooks[m] - q[m * sub:(m + 1) * sub]) ** 2).sum(1) for m in range(M)])      # (M, KC)
    d = tables[np.arange(M), codes].sum(1)                                                            # (N,)
    if not rescore:
        return np.argsort(d)[:K]
    cand = np.argsort(d)[:rescore]                                                                    # shortlist from the codes...
    return cand[np.argsort(((X[cand] - q) ** 2).sum(1))[:K]]                                          # ...re-ranked with full vectors

queries = X[rng.choice(N, Q, replace=False)] + 0.1 * rng.normal(size=(Q, D)).astype(np.float32)
truth = [set(np.argsort(((X - q) ** 2).sum(1))[:K]) for q in queries]
print(f"original: {D * 4} bytes/vector   PQ: {M} bytes/vector   compression: {D * 4 / M:.0f}x")
for rs in (0, 50, 200):
    rec = np.mean([len(set(pq_search(q, rs)) & t) / K for q, t in zip(queries, truth)])
    print(f"recall@{K} {'using ONLY the compressed codes' if not rs else f'after rescoring the top {rs} with full vectors'}: {rec:.2f}")
```

In practice PQ is combined with IVF (**IVF-PQ**) and a final **rescoring** with full-precision vectors, as in FAISS. It is how billion-scale indexes fit in memory.

## The index zoo

| Index | Idea | Best when | Trade-off |
|---|---|---|---|
| **Flat (brute force)** | compare with everything | up to ~100K–1M vectors, or GPU | exact, slow at scale |
| **IVF** | cluster, probe a few cells | big corpora, moderate RAM | needs training; recall depends on `nprobe` |
| **HNSW** | navigable graph | in-memory, low latency, high recall | memory-heavy, build time, deletes |
| **PQ / IVF-PQ** | compress vectors into codes | huge corpora, tight RAM | lossy; needs rescoring |
| **LSH** | hash similar vectors together | simple, streaming | usually lower recall than graph/IVF |
| **DiskANN / SPANN** | graph on SSD with compressed copies in RAM | billion-scale with limited RAM | more complex |
| **ScaNN** | anisotropic quantization + partitioning | Google-scale | library-specific |

Benchmarks across implementations: [ANN-Benchmarks](https://ann-benchmarks.com/). **Always measure recall against exact search on a sample** of your own vectors before trusting an index configuration.

## Practical guidance

1. **Start flat.** Under a few hundred thousand vectors, brute force with metadata filtering is simple and exact.
2. When you need an index, **default to HNSW** (best recall/latency in RAM). Move to IVF-PQ or DiskANN when memory or cost forces you.
3. **Tune for recall@k against exact search**, then for latency percentiles (p95/p99), not the mean.
4. **Filters change everything**: pre-filtering vs post-filtering interacts badly with some indexes (next lesson).
5. **Updates and deletes**: know how your index handles them; plan periodic rebuilds.
6. ANN recall is a **ceiling on your RAG recall**: 95% ANN recall means 5% of the "right" chunks can never be retrieved, even with a perfect embedding.

```quiz
? What does recall@10 = 0.9 mean for an ANN index?
- 90% of queries are fast
+ On average, 9 of the true top-10 neighbours are returned
- The index uses 90% of memory
> Recall compares the approximate result with exact search.

? In IVF, what does increasing nprobe do?
+ Searches more cells, raising recall and latency
- Adds more clusters
- Shrinks vectors
> nprobe is the main runtime recall/speed knob for IVF.

? Why does HNSW use multiple layers?
- To store more vectors
+ Sparse upper layers give long jumps toward the right region quickly; lower layers refine locally
- To encrypt vectors
> The hierarchy makes greedy search fast across large graphs.

? What does product quantization trade?
+ Memory (up to ~32× smaller codes) for some accuracy, often fixed by rescoring
- Accuracy for latency only
- Nothing
> PQ compresses vectors into short codes; rescoring top candidates recovers precision.
```

:::problem You have 20 million 1,024-dim vectors and 64 GB of RAM per node. Propose an indexing strategy. {level=hard tags="vector search,capacity"}
Compute the memory and choose.

:::solution Model answer
Raw float32: 20M × 1,024 × 4 B = **82 GB**: too big for one 64 GB node with index overhead. Options: **quantize** to int8 (20 GB) or binary (2.6 GB) with rescoring from disk; **IVF-PQ** (e.g. 64–128 bytes per vector → 1.3–2.6 GB) with an IVF coarse quantizer, plus full vectors on SSD for rescoring top-100; or **HNSW over int8/binary vectors** (graph overhead adds ~M×4–8 bytes per vector, e.g. ~1.5 GB for M=16); or **shard** across 2–3 nodes. Reduce dimension with Matryoshka truncation (e.g. 256 dims → 20 GB float32). Validate recall@10/ recall@100 against exact search on a sample and test p99 latency under filters.
:::
:::

:::keypoints
- Exact search is perfect and fine up to roughly a few hundred thousand vectors; beyond that use ANN indexes.
- ANN trades recall for speed and memory; measure recall against exact search on your own data.
- IVF: cluster then probe `nprobe` cells. HNSW: layered navigable graph tuned by M, efConstruction and efSearch. PQ: compress vectors into short codes, then rescore.
- HNSW is the usual in-memory default; IVF-PQ and DiskANN serve very large corpora.
- ANN recall caps RAG recall; combine with filters, hybrid search and reranking.
:::

:::resources
- [Efficient and robust ANN search using HNSW](https://arxiv.org/abs/1603.09320) — the HNSW paper.
- [FAISS](https://github.com/facebookresearch/faiss) — Meta's library: flat, IVF, PQ, HNSW and GPU indexes.
- [ANN-Benchmarks](https://ann-benchmarks.com/) — recall-versus-speed curves for many libraries.
- [Qdrant docs](https://qdrant.tech/documentation/) and [pgvector](https://github.com/pgvector/pgvector) — practical notes on HNSW/IVF parameters in real systems.
- [Pinecone learning centre: Faiss tutorial](https://docs.pinecone.io) — readable walk-throughs of index types.
- [LanceDB docs](https://lancedb.github.io/lancedb/) — disk-based vector search with IVF-PQ.
:::
