---
title: Vector Databases & Search at Scale
level: advanced
time: 40
summary: Store millions of embeddings and search them in milliseconds. Build your own vector store with filters and persistence, understand approximate nearest-neighbour indexes (IVF, HNSW, quantization), and use Chroma, FAISS, pgvector and friends.
---

For a few thousand chunks, `docs @ query` in NumPy is instant. At millions of vectors — with metadata filters, updates, persistence and many users — you need a **vector database**. This lesson shows what they do inside, so you can choose and use one well.

:::def Vector database
A system that stores vectors (embeddings) together with their **metadata** and original text, and answers **nearest-neighbour** queries ("the 10 vectors most similar to this one") quickly — usually with filters ("only documents from 2026", "only this user's files").
:::

:::def Nearest-neighbour search (k-NN)
Finding the k stored vectors closest to a query vector by some similarity (cosine, dot product) or distance (Euclidean). **Exact** search compares against every vector; **approximate** (ANN) search uses an index to check only a promising few.
:::

## Build your own vector store

```python run level=intermediate
import json
import numpy as np

class VectorStore:
    """A tiny in-memory vector store: add, search with filters, delete, save/load."""

    def __init__(self, dim):
        self.dim = dim
        self.vectors = np.zeros((0, dim), dtype=np.float32)
        self.ids, self.texts, self.metadata = [], [], []

    def add(self, ids, vectors, texts, metadata):
        v = np.asarray(vectors, dtype=np.float32)
        v /= np.linalg.norm(v, axis=1, keepdims=True)            # normalize once -> dot = cosine
        self.vectors = np.vstack([self.vectors, v])
        self.ids += list(ids); self.texts += list(texts); self.metadata += list(metadata)

    def search(self, query, k=3, where=None):
        q = np.asarray(query, dtype=np.float32)
        q /= np.linalg.norm(q)
        mask = np.array([all(m.get(key) == val for key, val in (where or {}).items()) for m in self.metadata])
        if not mask.any():
            return []
        scores = self.vectors @ q
        scores[~mask] = -np.inf                                    # metadata filter
        top = np.argsort(-scores)[:k]
        return [(self.ids[i], round(float(scores[i]), 3), self.texts[i], self.metadata[i]) for i in top if np.isfinite(scores[i])]

    def delete(self, doc_id):
        keep = [i for i, x in enumerate(self.ids) if x != doc_id]
        self.vectors = self.vectors[keep]
        self.ids = [self.ids[i] for i in keep]; self.texts = [self.texts[i] for i in keep]; self.metadata = [self.metadata[i] for i in keep]

    def save(self, path):
        np.save(path + ".npy", self.vectors)
        with open(path + ".json", "w") as f:
            json.dump({"dim": self.dim, "ids": self.ids, "texts": self.texts, "metadata": self.metadata}, f)

    @classmethod
    def load(cls, path):
        with open(path + ".json") as f:
            d = json.load(f)
        store = cls(d["dim"])
        store.vectors = np.load(path + ".npy")
        store.ids, store.texts, store.metadata = d["ids"], d["texts"], d["metadata"]
        return store

# toy 4-d "embeddings": [billing, technical, account, shipping]
store = VectorStore(dim=4)
store.add(
    ids=["kb1", "kb2", "kb3", "kb4", "kb5"],
    vectors=[[0.9, 0.1, 0.1, 0], [0.1, 0.9, 0.1, 0], [0.1, 0.2, 0.9, 0], [0.8, 0, 0.3, 0.1], [0, 0.1, 0, 0.9]],
    texts=["Refunds take 5 days.", "Reset the router to fix Wi-Fi drops.", "Change your password in Settings.",
           "Invoices are sent monthly.", "Orders ship within 48 hours."],
    metadata=[{"lang": "en", "product": "pro"}, {"lang": "en", "product": "home"}, {"lang": "en", "product": "pro"},
              {"lang": "en", "product": "home"}, {"lang": "en", "product": "pro"}],
)
query = [0.85, 0.05, 0.2, 0.05]                       # a billing-ish question
print("top-3:", *store.search(query, k=3), sep="\n  ")
print("only product=pro:", *store.search(query, k=2, where={"product": "pro"}), sep="\n  ")

store.save("kb_index")
again = VectorStore.load("kb_index")
again.delete("kb1")
print("after delete + reload:", [r[0] for r in again.search(query, k=3)])
```

That's honestly most of what a simple vector store does. Real ones add **ANN indexes** for speed, concurrency, durability, replication and a query API.

## Why exact search stops scaling

```python run level=intermediate
import time
import numpy as np

rng = np.random.default_rng(0)
dim = 384
for n in [10_000, 30_000, 60_000]:
    db = rng.standard_normal((n, dim), dtype=np.float32)
    q = rng.standard_normal(dim, dtype=np.float32)
    t = time.perf_counter()
    for _ in range(5):
        top = np.argpartition(-(db @ q), 10)[:10]
    ms = (time.perf_counter() - t) / 5 * 1000
    print(f"{n:>8,} vectors: {ms:7.1f} ms per query  ({db.nbytes / 1e6:6.0f} MB)")
print("…so 60 million vectors would be ~1000x slower per query and need ~90 GB of RAM.")
```

## Approximate nearest neighbours (ANN)

:::def ANN index
A data structure that finds **almost** the closest vectors while examining only a small fraction of them. You trade a little **recall** (sometimes missing a true top result) for huge speed-ups.
:::

### IVF: cluster first, then search nearby clusters

:::def IVF (inverted file index)
Cluster all vectors with k-means. At query time, find the few clusters whose centres are nearest to the query (`nprobe`) and search **only inside them**. More probes = better recall, slower search.
:::

```python run level=advanced
import time
import numpy as np
from sklearn.cluster import KMeans

rng = np.random.default_rng(0)
n, dim, n_clusters = 40_000, 64, 200
centers = rng.normal(size=(400, dim))
db = (centers[rng.integers(0, 400, n)] + 0.3 * rng.normal(size=(n, dim))).astype(np.float32)
queries = (db[rng.integers(0, n, 50)] + 0.1 * rng.normal(size=(50, dim))).astype(np.float32)

# exact answers for evaluation
t = time.perf_counter()
exact = [set(np.argsort(-(db @ q))[:10]) for q in queries]
exact_ms = (time.perf_counter() - t) / len(queries) * 1000

# build the IVF index
km = KMeans(n_clusters=n_clusters, n_init=1, max_iter=20, random_state=0).fit(db[:10_000])
assign = km.predict(db)
lists = [np.where(assign == c)[0] for c in range(n_clusters)]

def ivf_search(q, nprobe):
    nearest_clusters = np.argsort(-(km.cluster_centers_ @ q))[:nprobe]
    candidates = np.concatenate([lists[c] for c in nearest_clusters])
    return set(candidates[np.argsort(-(db[candidates] @ q))[:10]]), len(candidates)

print(f"exact search: {exact_ms:.2f} ms/query, checks {n:,} vectors")
for nprobe in [1, 4, 16]:
    t = time.perf_counter()
    out = [ivf_search(q, nprobe) for q in queries]
    ms = (time.perf_counter() - t) / len(queries) * 1000
    recall = np.mean([len(found & ex) / 10 for (found, _), ex in zip(out, exact)])
    checked = np.mean([c for _, c in out])
    print(f"IVF nprobe={nprobe:>2}: {ms:5.2f} ms/query, checks {checked:7,.0f} vectors, recall@10 = {recall:.2f}")
```

### HNSW: a navigable graph

:::def HNSW (Hierarchical Navigable Small World)
The most popular ANN index. Vectors are nodes in a multi-layer graph where each node links to its near neighbours. A search starts at the top (sparse, long-range links), greedily hops toward the query, and descends to denser layers for precision. Very fast with high recall; uses more memory.
:::

```python run level=advanced
import heapq
import numpy as np

rng = np.random.default_rng(1)
pts = rng.normal(size=(2000, 16)).astype(np.float32)
links = 16
sims = pts @ pts.T
np.fill_diagonal(sims, -np.inf)
graph = np.argsort(-sims, axis=1)[:, :links]       # each point links to its 16 nearest neighbours

def graph_search(q, ef, start):
    """Best-first search over the graph, keeping the `ef` best candidates found so far."""
    visited = {start}
    candidates = [(-float(pts[start] @ q), start)]  # max-heap of nodes still to expand
    best = [(float(pts[start] @ q), start)]         # min-heap of the ef best results
    while candidates:
        neg_score, node = heapq.heappop(candidates)
        if len(best) >= ef and -neg_score < best[0][0]:
            break                                   # nothing left can improve our results
        for nb in map(int, graph[node]):
            if nb in visited:
                continue
            visited.add(nb)
            score = float(pts[nb] @ q)
            if len(best) < ef or score > best[0][0]:
                heapq.heappush(candidates, (-score, nb))
                heapq.heappush(best, (score, nb))
                if len(best) > ef:
                    heapq.heappop(best)
    return max(best)[1], len(visited)

qrng = np.random.default_rng(5)
queries = [(qrng.normal(size=16).astype(np.float32), int(qrng.integers(0, 2000))) for _ in range(200)]
for ef in [1, 8, 32]:
    found = [graph_search(q, ef, start) for q, start in queries]
    recall = np.mean([f == int(np.argmax(pts @ q)) for (f, _), (q, _) in zip(found, queries)])
    print(f"ef={ef:>2}: found the true nearest neighbour {recall:.0%} of the time, visiting ~{np.mean([v for _, v in found]):.0f} of 2000 points")
```

### Quantization: compress the vectors

:::def Vector quantization
Storing vectors with fewer bits to save memory and speed up comparisons: **scalar** quantization (float32 → int8, 4× smaller), **binary** quantization (1 bit per dimension, 32× smaller), or **product quantization** (PQ — split vectors into pieces and store a code per piece). Usually combined with re-scoring the top candidates at full precision.
:::

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
topics = rng.normal(size=(300, 256)).astype(np.float32)                 # real embeddings cluster by topic
db = topics[rng.integers(0, 300, 20_000)] + 0.6 * rng.standard_normal((20_000, 256), dtype=np.float32)
db /= np.linalg.norm(db, axis=1, keepdims=True)

scale = 127 / np.abs(db).max()
db_i8 = np.round(db * scale).astype(np.int8)                            # int8: 4x smaller
db_bits = np.packbits(db > 0, axis=1)                                   # binary: 32x smaller

r_i8, r_bin = [], []
for qi in rng.integers(0, 20_000, 20):
    q = db[qi] + 0.05 * rng.standard_normal(256, dtype=np.float32)
    exact = set(np.argsort(-(db @ q))[:10])
    i8 = set(np.argsort(-(db_i8.astype(np.int32) @ np.round(q * scale).astype(np.int32)))[:10])
    hamming = np.unpackbits(db_bits ^ np.packbits(q > 0), axis=1).sum(axis=1)
    shortlist = np.argsort(hamming)[:200]                               # cheap binary pass…
    rescored = set(shortlist[np.argsort(-(db[shortlist] @ q))][:10])    # …then rescore 200 at full precision
    r_i8.append(len(i8 & exact) / 10); r_bin.append(len(rescored & exact) / 10)

print(f"float32: {db.nbytes / 1e6:5.1f} MB | int8: {db_i8.nbytes / 1e6:5.1f} MB | binary: {db_bits.nbytes / 1e6:5.2f} MB")
print(f"recall@10  int8: {np.mean(r_i8):.2f}   binary + rescore top-200: {np.mean(r_bin):.2f}")
```

## Popular vector databases and libraries

| Tool | Type | Good for |
|---|---|---|
| **Chroma** | embedded / server | prototypes, local apps — easiest start |
| **FAISS** | library (Meta) | fast in-process search, research, custom pipelines |
| **pgvector** | Postgres extension | you already use Postgres; SQL + vectors + filters together |
| **Qdrant**, **Weaviate**, **Milvus** | dedicated servers | production scale, rich filtering, hybrid search |
| **Pinecone**, managed cloud offerings | fully managed | no infrastructure to run |
| **Elasticsearch / OpenSearch** | search engines | hybrid keyword + vector at scale |
| **LanceDB** | embedded, on-disk | large local datasets, multimodal |

```python local title="Chroma — the quickest start"
import chromadb                              # pip install chromadb

client = chromadb.PersistentClient(path="./chroma_db")
col = client.get_or_create_collection("manuals", metadata={"hnsw:space": "cosine"})

col.add(
    ids=["c1", "c2", "c3"],
    documents=["Error E21 means the drain is blocked.", "The warranty lasts 2 years.", "Run the Clean program monthly."],
    metadatas=[{"doc": "manual"}, {"doc": "warranty"}, {"doc": "care"}],
)   # Chroma embeds documents with a default model; pass embeddings=... to use your own

res = col.query(query_texts=["what does E21 mean?"], n_results=2, where={"doc": "manual"})
print(res["documents"], res["distances"])
```

```python local title="FAISS — fast in-process index"
import faiss                                 # pip install faiss-cpu
import numpy as np

d = 384
vectors = np.random.rand(100_000, d).astype("float32")
faiss.normalize_L2(vectors)

index = faiss.IndexHNSWFlat(d, 32, faiss.METRIC_INNER_PRODUCT)   # HNSW graph, 32 links per node
index.add(vectors)

query = vectors[:1].copy()
scores, ids = index.search(query, 5)
print(ids, scores)
faiss.write_index(index, "my.index")
```

```python local title="pgvector — vectors inside Postgres"
import psycopg                               # pip install "psycopg[binary]" pgvector

with psycopg.connect("postgresql://localhost/rag") as conn:
    conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    conn.execute("""CREATE TABLE IF NOT EXISTS chunks (
        id bigserial PRIMARY KEY, doc text, content text, embedding vector(384))""")
    conn.execute("CREATE INDEX IF NOT EXISTS chunks_hnsw ON chunks USING hnsw (embedding vector_cosine_ops)")
    rows = conn.execute(
        "SELECT content, 1 - (embedding <=> %s::vector) AS similarity FROM chunks WHERE doc = %s "
        "ORDER BY embedding <=> %s::vector LIMIT 5",
        (query_vec, "manual", query_vec),         # query_vec: a list of 384 floats, e.g. str(list(vec))
    ).fetchall()
```

## Choosing and operating a vector store

- **Start simple**: NumPy or Chroma for prototypes; pgvector if you already run Postgres.
- **Filter early**: metadata filters (tenant, permissions, language, date) are as important as similarity — never let one user retrieve another user's documents.
- **Store the text and metadata** alongside vectors so results are directly usable and citable.
- **Version your embeddings**: changing the embedding model means re-embedding everything; keep the model name in metadata.
- **Measure recall** of your ANN settings against exact search on a sample, and tune (`nprobe`, `ef_search`) for your latency budget.

:::ai
In a production RAG system, the vector database sits between your ingestion pipeline (which writes chunks + embeddings + metadata) and your answering service (which embeds the question, filters, retrieves top-k, optionally reranks, then calls the LLM). It's also used for semantic caches, long-term agent memory, recommendations and deduplication.
:::

## Check yourself

```quiz
? What does an ANN index trade away to gain speed?
+ A little recall — it may occasionally miss a true nearest neighbour
- Accuracy of the embeddings
- The ability to store metadata
> You tune the trade-off with parameters like nprobe or ef_search.

? In an IVF index, what does increasing nprobe do?
+ Searches more clusters: higher recall, slower queries
- Uses fewer clusters
- Compresses the vectors
> nprobe = how many nearest clusters to scan.

? Why are metadata filters critical in multi-user RAG?
+ To make sure users only retrieve documents they are allowed to see
- To make embeddings smaller
- They are only cosmetic
> Access control must happen at retrieval time.

? You switch to a new embedding model. What must you do?
+ Re-embed all documents with the new model
- Nothing — vectors are compatible
- Only re-embed new documents
> Vectors from different models live in different spaces.
```

:::keypoints
- A vector DB stores vectors + text + metadata and answers fast (filtered) nearest-neighbour queries.
- Exact search is O(n); **ANN** indexes — **IVF** (clusters), **HNSW** (graphs), **quantization** — trade a little recall for big speed and memory wins.
- Start with NumPy/Chroma/pgvector; graduate to Qdrant/Weaviate/Milvus/managed services at scale.
- Filter by metadata (especially permissions), store text with vectors, and version your embeddings.
:::
