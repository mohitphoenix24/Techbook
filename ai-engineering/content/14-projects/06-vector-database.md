---
title: Build a Vector Database
level: advanced
time: 60
icon: database
cover: #14b8a6,#8b5cf6
tags: vector-search, ann, ivf, hnsw, quantization
summary: Build the engine inside a vector database from scratch — exact search, an IVF index with k-means, a navigable small-world graph (the idea behind HNSW), int8 quantisation, metadata filtering and save/load — and measure recall against the number of distance computations so you can see the speed-versus-accuracy trade-off every ANN index makes.
---

A vector database answers one question very fast: **which stored vectors are closest to this query vector?** Exact search compares the query with everything. At millions of vectors that is too slow, so real engines use **approximate nearest neighbour (ANN)** indexes that look at a small fraction of the data and accept a small loss in recall.

**What you'll build:** four index types behind one interface, a recall-versus-work benchmark, metadata filtering, and persistence.

:::flow The pipeline
Vectors | embeddings with ids and metadata
Flat index | exact, compares everything
IVF | k-means cells, search a few
Graph (NSW) | hop towards the query
Quantize | int8 vectors, 4x smaller
Filter | metadata before or after search
Persist | save and load
:::

:::def Recall@k
Of the true k nearest neighbours (found by exact search), what fraction did the approximate index return? Recall 0.95 means it finds 95 of the 100 true neighbours across queries. ANN tuning is always **recall versus work** (distance computations, latency, memory).
:::

## Step 1 — Data and exact search

We generate vectors with **cluster structure**, because real embeddings are clustered (documents about similar topics land together), and cluster structure is what ANN indexes exploit.

```python run shared title="Step 1 · data and the exact baseline"
import numpy as np

rng = np.random.default_rng(0)
DIM, N, N_CLUSTERS, N_QUERIES = 32, 2000, 20, 100
centers = rng.normal(0, 3, (N_CLUSTERS, DIM))
def sample(n):
    labels = rng.integers(0, N_CLUSTERS, n)
    return centers[labels] + rng.normal(0, 1, (n, DIM)), labels

vectors, labels = sample(N)
queries, _ = sample(N_QUERIES)
vectors = vectors.astype(np.float32); queries = queries.astype(np.float32)

class Counter_:
    """Counts how many vector-vector distances an operation computes: our machine-independent measure of work."""
    n = 0
work = Counter_()

def l2_to_many(q, mat):
    work.n += len(mat)
    return ((mat - q) ** 2).sum(axis=1)

def flat_search(q, k=10):
    d = l2_to_many(q, vectors)
    top = np.argpartition(d, k)[:k]
    return top[np.argsort(d[top])]

work.n = 0
truth = [flat_search(q) for q in queries]
print(f"{N} vectors x {DIM} dims | exact search computes {work.n // N_QUERIES} distances per query (all of them)")
print("nearest neighbours of query 0:", truth[0][:5])

def recall(results, truth, k=10):
    return float(np.mean([len(set(r[:k]) & set(t[:k])) / k for r, t in zip(results, truth)]))
```

## Step 2 — IVF: cluster first, search a few clusters

**IVF (inverted file)** index: run **k-means** to split the vectors into `nlist` cells. At query time, find the `nprobe` cells whose centroids are closest to the query and search only the vectors inside them.

```python run shared title="Step 2 · k-means and the IVF index"
def kmeans(x, k, iters=12, seed=0):
    r = np.random.default_rng(seed)
    cent = x[r.choice(len(x), k, replace=False)].copy()
    for _ in range(iters):
        d = ((x[:, None, :] - cent[None, :, :]) ** 2).sum(-1)               # distance of every point to every centroid
        assign = d.argmin(1)
        for j in range(k):
            members = x[assign == j]
            if len(members): cent[j] = members.mean(0)
    return cent, assign

class IVFIndex:
    def __init__(self, x, nlist=32):
        self.x = x
        self.centroids, assign = kmeans(x, nlist)
        self.lists = [np.where(assign == j)[0] for j in range(nlist)]        # cell -> ids of the vectors inside it
    def search(self, q, k=10, nprobe=4):
        cd = l2_to_many(q, self.centroids)                                   # cost: nlist distances
        cells = np.argsort(cd)[:nprobe]
        cand = np.concatenate([self.lists[c] for c in cells])
        d = l2_to_many(q, self.x[cand])                                      # cost: only the vectors in the probed cells
        top = np.argsort(d)[:k]
        return cand[top]

ivf = IVFIndex(vectors, nlist=32)
print("cell sizes (min / mean / max):", min(map(len, ivf.lists)), round(N / 32), max(map(len, ivf.lists)))
print(f"{'nprobe':>7} {'recall@10':>10} {'distances/query':>16} {'vs exact':>9}")
for nprobe in (1, 2, 4, 8, 16, 32):
    work.n = 0
    res = [ivf.search(q, 10, nprobe) for q in queries]
    print(f"{nprobe:>7} {recall(res, truth):>10.2f} {work.n / N_QUERIES:>16.0f} {work.n / N_QUERIES / N:>8.0%}")
```

`nprobe` is the **recall knob**: probing more cells costs more distance computations and finds more of the true neighbours. Probing all cells equals exact search.

## Step 3 — A navigable small-world graph

Graph indexes (HNSW is the famous one) connect each vector to some of its nearest neighbours. Search starts at an entry point and **greedily hops** to whichever neighbour is closest to the query, keeping a small **beam** of candidates (`ef`). HNSW adds multiple layers on top of this single-layer idea for a faster entry; the part that matters most for recall is **which neighbours each node keeps**.

If every node simply keeps its M closest neighbours, clusters become islands: all links stay inside the cluster and the search cannot find its way in from the entry point. HNSW's **neighbour-selection heuristic** fixes this: keep a candidate only if it is closer to the new node than to any neighbour already chosen, which favours links that point in *different directions*, including the long ones that bridge clusters.

```python run shared title="Step 3 · single-layer navigable small world, with and without the diversity heuristic"
import heapq

class NSWIndex:
    def __init__(self, x, M=8, ef_construction=40, diverse=True):
        self.x, self.M, self.diverse = x, M, diverse
        self.links = [[] for _ in range(len(x))]
        for i in range(1, len(x)):                                           # insert vectors one by one
            near = self._search(x[i], ef_construction, upto=i)               # candidates among the nodes inserted so far
            for j in self._select(i, [v for v, _ in near], M):
                self.links[i].append(j)
                self.links[j].append(i)                                      # links are bidirectional
                if len(self.links[j]) > 2 * M:                               # keep each node's degree bounded
                    self.links[j] = self._select(j, self.links[j], 2 * M)

    def _select(self, i, cands, M):
        d = ((self.x[cands] - self.x[i]) ** 2).sum(1)
        order = np.argsort(d)
        cands, d = [cands[t] for t in order], d[order]
        if not self.diverse:
            return cands[:M]                                                 # naive: just the M closest
        chosen, skipped = [], []
        for c, dc in zip(cands, d):
            if len(chosen) >= M: break
            if all(dc < ((self.x[c] - self.x[s]) ** 2).sum() for s in chosen):
                chosen.append(c)                                             # closer to the new node than to anything chosen: a new direction
            else:
                skipped.append(c)
        return (chosen + skipped)[:M]                                        # top up with the skipped ones if there is room

    def _search(self, q, ef, upto=None):
        entry = 0
        dist = lambda ids: l2_to_many(q, self.x[ids])
        visited = {entry}
        d0 = float(dist([entry])[0])
        cand, best = [(d0, entry)], [(-d0, entry)]                           # min-heap of candidates, max-heap of the best ef found
        while cand:
            d, u = heapq.heappop(cand)
            if len(best) >= ef and d > -best[0][0]: break                    # the closest unexplored candidate is worse than all we kept
            nbrs = [v for v in self.links[u] if v not in visited and (upto is None or v < upto)]
            if not nbrs: continue
            visited.update(nbrs)
            for v, dv in zip(nbrs, dist(nbrs)):
                if len(best) < ef or dv < -best[0][0]:
                    heapq.heappush(cand, (float(dv), v)); heapq.heappush(best, (-float(dv), v))
                    if len(best) > ef: heapq.heappop(best)
        return [(v, -nd) for nd, v in sorted(best, key=lambda t: -t[0])]    # (id, distance), closest first

    def search(self, q, k=10, ef=40):
        return np.array([v for v, _ in self._search(q, max(ef, k))[:k]])

graphs = {}
for diverse in (False, True):
    graphs[diverse] = NSWIndex(vectors, M=8, ef_construction=40, diverse=diverse)
print(f"{'':>26} " + " ".join(f"ef={ef:<9}" for ef in (10, 20, 40, 80)))
for diverse, g in graphs.items():
    cells = []
    for ef in (10, 20, 40, 80):
        work.n = 0
        res = [g.search(q, 10, ef) for q in queries]
        cells.append(f"{recall(res, truth):.2f} ({work.n / N_QUERIES / N:>3.0%})")
    print(f"{'diverse neighbours' if diverse else 'M closest neighbours':>26} " + " ".join(f"{c:<12}" for c in cells))
print("(each cell: recall@10, and the share of the data compared per query)")
```

With the heuristic, the graph reaches high recall while comparing under a tenth of the vectors. Graph indexes usually give the **best recall per distance computation**, at the price of **more memory** (the links), a **slower build**, and harder updates and deletes.

## Step 4 — Quantisation: smaller vectors, a little error

Memory is often the real limit: 1 million 1,536-dimensional float32 vectors take about 6 GB. **Scalar quantisation** stores each number as an int8 (1 byte instead of 4) using a per-dimension scale and offset.

```python run shared title="Step 4 · int8 scalar quantisation"
class Int8Quantizer:
    def fit(self, x):
        self.lo, self.hi = x.min(0), x.max(0)
        self.scale = (self.hi - self.lo) / 255 + 1e-12
        return self
    def encode(self, x):
        return np.round((x - self.lo) / self.scale).astype(np.uint8)
    def decode(self, codes):
        return codes.astype(np.float32) * self.scale + self.lo

quant = Int8Quantizer().fit(vectors)
codes = quant.encode(vectors)
approx = quant.decode(codes)
print(f"memory: float32 {vectors.nbytes / 1e3:.0f} KB -> int8 {codes.nbytes / 1e3:.0f} KB ({vectors.nbytes / codes.nbytes:.0f}x smaller)")
print("mean reconstruction error per number:", round(float(np.abs(approx - vectors).mean()), 4), "(vectors have a typical spread of about 3)")

def flat_search_on(mat, q, k=10):
    d = ((mat - q) ** 2).sum(1)
    top = np.argpartition(d, k)[:k]
    return top[np.argsort(d[top])]
res = [flat_search_on(approx, q) for q in queries]
print("recall@10 of exact search over the quantised vectors:", round(recall(res, truth), 2))
```

Recall barely moves while memory drops 4x. Real systems also use **product quantisation** (compressing sub-vectors with learned codebooks) for 16-64x savings, often combined with IVF (`IVF-PQ`), and then **re-rank** the top candidates using the original vectors.

## Step 5 — Metadata filtering: the part that bites

Real queries say "the 10 most similar documents **where tenant = acme and year ≥ 2025**". There are two strategies, and they fail differently:

- **Post-filtering**: search for the top k, then drop non-matching results. Fast, but can return **fewer than k** (or nothing) if the filter is selective.
- **Pre-filtering**: restrict the search to matching vectors first. Always returns k results (if k exist), but it needs an index that can search within a subset efficiently.

```python run shared title="Step 5 · pre-filter versus post-filter"
tenants = rng.choice(["acme", "globex", "initech", "umbrella", "hooli"], N, p=[0.5, 0.3, 0.1, 0.07, 0.03])

def post_filter_search(q, tenant, k=10, oversample=1):
    cand = flat_search(q, k * oversample)
    return [i for i in cand if tenants[i] == tenant][:k]

def pre_filter_search(q, tenant, k=10):
    ids = np.where(tenants == tenant)[0]
    d = l2_to_many(q, vectors[ids])
    return ids[np.argsort(d)[:k]]

for tenant in ("acme", "initech", "hooli"):
    share = float((tenants == tenant).mean())
    post = [len(post_filter_search(q, tenant)) for q in queries]
    post5 = [len(post_filter_search(q, tenant, oversample=5)) for q in queries]
    pre = [len(pre_filter_search(q, tenant)) for q in queries]
    print(f"tenant {tenant:8} ({share:4.0%} of data): post-filter returns on average {np.mean(post):4.1f} of 10 | oversample x5: {np.mean(post5):4.1f} | pre-filter: {np.mean(pre):4.1f}")
```

When the filter matches only a few percent of the data, **post-filtering silently returns too few results**. Production engines solve this with filtered graph traversal, per-partition indexes, or by oversampling and retrying. And **permission filters must never be post-filters applied after the model sees the data**: enforce them inside the query.

## Step 6 — A tiny database facade with save and load

```python run shared title="Step 6 · VectorDB with ids, metadata, filters and persistence"
import io, json

class VectorDB:
    def __init__(self, dim):
        self.dim, self.vecs, self.ids, self.meta = dim, np.zeros((0, dim), np.float32), [], []
        self.index = None
    def add(self, id_, vector, **metadata):
        self.vecs = np.vstack([self.vecs, np.asarray(vector, np.float32)[None]])
        self.ids.append(id_); self.meta.append(metadata); self.index = None      # invalidate the index after changes
    def build(self, nlist=16):
        self.index = IVFIndex(self.vecs, nlist=min(nlist, len(self.vecs)))
    def search(self, q, k=3, nprobe=4, where=None):
        q = np.asarray(q, np.float32)
        if where is not None:                                                   # pre-filter on metadata, then exact search in the subset
            ok = [n for n, m in enumerate(self.meta) if all(m.get(f) == v for f, v in where.items())]
            d = ((self.vecs[ok] - q) ** 2).sum(1)
            return [(self.ids[ok[j]], round(float(d[j]), 1)) for j in np.argsort(d)[:k]]
        if self.index is None: self.build()
        cand = self.index.search(q, k, nprobe)
        return [(self.ids[j], round(float(((self.vecs[j] - q) ** 2).sum()), 1)) for j in cand]
    def save(self):
        buf = io.BytesIO()
        np.save(buf, self.vecs)
        return buf.getvalue(), json.dumps({"ids": self.ids, "meta": self.meta})
    @classmethod
    def load(cls, blob, meta_json):
        vecs = np.load(io.BytesIO(blob))
        db = cls(vecs.shape[1]); db.vecs = vecs
        m = json.loads(meta_json); db.ids, db.meta = m["ids"], m["meta"]
        return db

db = VectorDB(DIM)
for i in range(300):
    db.add(f"doc{i}", vectors[i], tenant=str(tenants[i]), cluster=int(labels[i]))
q = vectors[7]
print("nearest to doc7        :", db.search(q))
print("only tenant 'globex'   :", db.search(q, where={"tenant": "globex"}))
blob, meta = db.save()
restored = VectorDB.load(blob, meta)
print("save/load identical    :", restored.search(q) == db.search(q), f"| {len(blob) / 1e3:.0f} KB of vectors + {len(meta) / 1e3:.0f} KB of metadata")
```

## How it works

| Index | Idea | Recall knob | Strength | Cost |
|---|---|---|---|---|
| Flat | compare with everything | none (exact) | perfect recall, simple | work grows linearly with data |
| IVF | cluster, search the nearest cells | `nprobe` | easy, memory-light, good with PQ | recall drops at cell borders |
| Graph (HNSW family) | hop along neighbour links | `ef` | best recall per distance computation | memory for links, slow build, harder updates and deletes |
| Quantisation | store fewer bits | bits, re-ranking | 4-64x less memory | small accuracy loss |

Choosing in practice: **under about 100,000 vectors, use exact search** (it is fast enough and simple); at millions, use HNSW if memory allows, or IVF-PQ when memory is the constraint; always benchmark **recall at your latency target on your own data**.

:::exercise Extend it
1. Plot (or print) the recall-versus-distances curve for IVF and the graph on the same axes; which wins at 90% recall?
2. Add **re-ranking**: search the int8 vectors for 50 candidates, then re-score them with the original float vectors.
3. Implement **delete** in the VectorDB (tombstones) and see what happens to graph links.
4. Add a second layer to the graph with every 10th node to get an HNSW-style entry point instead of always starting at node 0.
5. Use cosine similarity instead of L2 by normalising vectors, and check that the results match.
:::

:::keypoints
- Exact (flat) search is the baseline: perfect recall, work linear in data. Use it until it is too slow.
- IVF reduces work by clustering and probing only the nearest cells; `nprobe` trades recall for speed.
- Graph indexes (HNSW family) hop along neighbour links and typically give the best recall per distance computation, at the cost of memory and slower builds.
- Quantisation shrinks memory (int8 is 4x, product quantisation more) with small recall loss, often paired with re-ranking.
- Metadata filters need care: post-filtering can return too few results; enforce access control inside the query.
- Always measure recall@k against exact search on your own data at your latency target.
:::
