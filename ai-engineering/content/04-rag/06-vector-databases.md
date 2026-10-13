---
title: Vector Databases — What They Add and How to Choose
level: intermediate
time: 40
summary: Beyond the index: what a vector database actually provides (storage, filtering, updates, scale, tenancy), the landscape (pgvector, Qdrant, Weaviate, Milvus, Pinecone, Chroma, LanceDB, search engines), metadata filtering and the post-filter trap, multi-tenancy and access control, consistency and operations, and a decision checklist. Includes a tiny vector database with filters you can run and break.
---

An ANN index finds near vectors. A **vector database** wraps that index with everything a real application needs: persistence, CRUD, metadata, filtering, hybrid search, replication, permissions and an API.

:::def Vector database
A database designed to store high-dimensional vectors together with metadata and to answer **nearest-neighbour queries** quickly, usually with filters ("only documents where `product = X200` and `language = en`"), updates and deletes, and operational features such as sharding, replication and backups.
:::

## What you actually need from one

| Capability | Why it matters |
|---|---|
| **Fast ANN search** at your scale with tunable recall | the core |
| **Metadata filtering** (equality, ranges, lists, boolean logic) | permissions, product, date, language, tenant |
| **Hybrid search** (keywords + vectors, fusion) | lesson 7: usually better than vectors alone |
| **Upserts and deletes** with consistency you understand | keeping the index fresh (lesson 12) |
| **Multi-tenancy** | isolating customers, per-user ACLs, cost per tenant |
| **Scalability and durability** | sharding, replication, snapshots, backups |
| **Multiple vectors per object** | e.g. title + body embeddings, multi-vector (ColBERT-style) |
| **Ecosystem** | client libraries, framework integrations, observability |
| **Cost and operations** | managed vs self-hosted, memory footprint, pricing model |

## The landscape (as of late 2026)

| Option | Type | Notes |
|---|---|---|
| **pgvector** ([repo](https://github.com/pgvector/pgvector)) | extension for PostgreSQL | vectors next to your relational data, ACID, SQL joins and filters; HNSW and IVFFlat indexes. The pragmatic default if you already run Postgres |
| **Qdrant** ([docs](https://qdrant.tech/documentation/)) | dedicated, open source (Rust) | strong filtering, quantization, hybrid and sparse vectors, easy to self-host or use as a cloud |
| **Weaviate** ([docs](https://weaviate.io/developers/weaviate)) | dedicated, open source | built-in hybrid search, modules, multi-tenancy |
| **Milvus** ([repo](https://github.com/milvus-io/milvus)) | dedicated, open source, distributed | built for very large scale; many index types |
| **Pinecone** ([docs](https://docs.pinecone.io)) | managed service | serverless, minimal operations |
| **Chroma** ([docs](https://docs.trychroma.com)) | open source, developer-friendly | great for prototypes and local apps |
| **LanceDB** ([docs](https://lancedb.github.io/lancedb/)) | embedded, columnar, disk-based | runs in-process, cheap storage, multimodal data |
| **Elasticsearch / OpenSearch** | search engines with vector fields | strong keyword + vector hybrid, existing infrastructure |
| **Redis, MongoDB Atlas, others** | general databases adding vectors | convenient when already in your stack |
| **FAISS** ([repo](https://github.com/facebookresearch/faiss)) | a library, not a database | embed in your own service; you build persistence and filtering |

**A sensible approach:** under ~1–5 million chunks, a **pgvector** table (or an embedded option like LanceDB/Chroma) is usually enough and keeps your system simple. Move to a dedicated engine when you need its filtering performance, scale or operational features, or when vector load would hurt your main database.

## Metadata filtering and the post-filter trap

Almost every real query has a filter: *"answer from documents the user may read"*, *"only the latest policy"*, *"English only"*. How the database applies the filter matters:

| Approach | How | Problem |
|---|---|---|
| **Post-filtering** | run ANN for top-k, then drop results that fail the filter | with a selective filter you may be left with **fewer than k, or zero** results |
| **Pre-filtering** | find the allowed ids first, then search only among them | exact but can be slow if the allowed set is big and the index cannot use it |
| **Filtered ANN** (in-index) | the index traversal itself respects the filter (e.g. filterable HNSW) | the best behaviour, supported in good engines; check recall under filters |

```python run title="The post-filter trap: filtered search that silently loses results" level=intermediate
import numpy as np

rng = np.random.default_rng(0)
N, D, K = 20_000, 32, 5
X = rng.normal(size=(N, D)).astype(np.float32); X /= np.linalg.norm(X, axis=1, keepdims=True)
tenant = rng.integers(0, 200, size=N)                 # 200 tenants: each owns ~0.5% of the vectors
q = X[7] + 0.1 * rng.normal(size=D).astype(np.float32); q /= np.linalg.norm(q)
me = tenant[7]
scores = X @ q

# pre-filter: restrict to my tenant, then take top-K
mine = np.where(tenant == me)[0]
pre = mine[np.argsort(-scores[mine])[:K]]

# post-filter: take the global top-K (or top-100) first, then keep only my tenant's results
for fetch in (K, 100, 1000):
    top = np.argsort(-scores)[:fetch]
    post = [i for i in top if tenant[i] == me][:K]
    print(f"post-filter, fetch top-{fetch:<4} -> {len(post)} of {K} results returned")
print(f"pre-filter                  -> {len(pre)} of {K} results returned")
```

Practical rules: use an engine with **filter-aware ANN**; **over-fetch** if you must post-filter; test **recall under your most selective filters**; for strict tenant isolation use per-tenant partitions or collections.

## A vector database in 40 lines

This toy has what a real one has: upsert, delete, metadata filters, search, and persistence.

```python run title="A tiny vector database" level=advanced
import numpy as np, json, re, zlib

DIM = 128
def embed(text):
    v = np.zeros(DIM)
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        for i in range(max(1, len(w) - 2)):
            h = zlib.crc32(w[i:i + 3].encode()); v[h % DIM] += 1 if (h >> 8) & 1 else -1
    n = np.linalg.norm(v); return v / n if n else v

class TinyVectorDB:
    def __init__(self):
        self.ids, self.vecs, self.meta, self.text = [], [], {}, {}
    def upsert(self, id, text, **meta):
        if id in self.meta: self.delete(id)                   # replace atomically
        self.ids.append(id); self.vecs.append(embed(text)); self.meta[id] = meta; self.text[id] = text
    def delete(self, id):
        i = self.ids.index(id); self.ids.pop(i); self.vecs.pop(i); del self.meta[id]; del self.text[id]
    def search(self, query, k=3, where=None):
        where = where or {}
        keep = [i for i, id in enumerate(self.ids)
                if all(v(self.meta[id].get(f)) if callable(v) else self.meta[id].get(f) == v for f, v in where.items())]
        if not keep: return []
        scores = np.stack([self.vecs[i] for i in keep]) @ embed(query)       # pre-filtering: exact over the allowed set
        return [(self.ids[keep[j]], round(float(scores[j]), 2), self.text[self.ids[keep[j]]]) for j in np.argsort(-scores)[:k]]
    def dump(self):                                            # persistence: JSON snapshot
        return json.dumps({"ids": self.ids, "meta": self.meta, "text": self.text})

db = TinyVectorDB()
db.upsert("a1", "Refunds are issued within 30 days of delivery.", product="X200", lang="en", acl=["support", "sales"])
db.upsert("a2", "Les remboursements sont émis sous 30 jours.", product="X200", lang="fr", acl=["support"])
db.upsert("b1", "The Pro plan includes 5 seats and priority support.", product="Pro", lang="en", acl=["sales"])
db.upsert("c1", "Internal: refund fraud thresholds are reviewed monthly.", product="X200", lang="en", acl=["finance"])

print("no filter       :", [r[0] for r in db.search("how do refunds work")])
print("english only    :", [r[0] for r in db.search("how do refunds work", where={"lang": "en"})])
print("user in 'sales' :", [r[0] for r in db.search("how do refunds work", where={"acl": lambda groups: "sales" in groups})])
db.upsert("a1", "Refunds are issued within 14 days of delivery.", product="X200", lang="en", acl=["support", "sales"])   # update
print("after update    :", db.search("refund window", k=1, where={"lang": "en", "product": "X200"})[0][2])
print("snapshot bytes  :", len(db.dump()))
```

A real database gives you a filter language (equals, in, contains, ranges, and/or/not) so you never hand-write this logic: hand-rolled permission filters are a classic source of data leaks.

## SQL with pgvector

If you use Postgres, vectors are just another column type:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunks (
  id        bigserial PRIMARY KEY,
  doc_id    text NOT NULL,
  tenant_id int  NOT NULL,
  content   text NOT NULL,
  embedding vector(1024),
  updated   timestamptz DEFAULT now()
);

-- an HNSW index for cosine distance
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ON chunks (tenant_id);

-- query: nearest chunks, filtered by tenant
SET hnsw.ef_search = 80;
SELECT id, doc_id, content, 1 - (embedding <=> $1) AS similarity
FROM chunks
WHERE tenant_id = $2
ORDER BY embedding <=> $1
LIMIT 8;
```

Advantages: **one system**, transactions (update the document and its chunks atomically), SQL joins with your business data, mature backups. Watch for filter-vs-index interactions (check `EXPLAIN` and recall) and for load on your primary database.

```python local title="A dedicated engine: Qdrant (client sketch)"
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333")
client.create_collection("chunks", vectors_config=models.VectorParams(size=1024, distance=models.Distance.COSINE))
client.upsert("chunks", points=[models.PointStruct(id=1, vector=vec, payload={"tenant": "acme", "lang": "en", "text": "..."})])
hits = client.query_points(
    "chunks", query=query_vec, limit=8,
    query_filter=models.Filter(must=[models.FieldCondition(key="tenant", match=models.MatchValue(value="acme"))]),
).points
```

## Multi-tenancy and access control

Pick the isolation model deliberately:

| Model | How | Use when |
|---|---|---|
| **Filter by `tenant_id`** in one collection | simplest; every query must include the filter | many small tenants; strong code review on filters |
| **Namespace / partition per tenant** | the engine isolates data | stronger isolation, per-tenant deletion, noisy-neighbour control |
| **Collection / database per tenant** | separate physical indexes | few large tenants, strict compliance |

For **user-level permissions** (documents shared with groups), store an ACL list on each chunk and filter at query time, or filter by document ids from your authorisation service. **Never** rely on the prompt to hide documents: retrieval must not return what the user may not see.

## Operations checklist

- **Consistency:** after an upsert, how long until it is searchable (immediately, or eventually)? Does delete remove it everywhere (including replicas, caches)?
- **Backups and re-indexing**: can you rebuild from your source of truth? (You should be able to.)
- **Capacity**: memory ≈ vectors × dimension × bytes per number + graph overhead; plan for growth, quantization and replicas.
- **Observability**: query latency percentiles, recall spot-checks, index build status, memory.
- **Upgrades**: index parameters and versions can change recall; re-run your eval after upgrades.
- **Cost**: managed pricing models differ (per vector stored, per query, per compute unit); estimate from your real volumes.

## Decision checklist

:::flow Choose a store
How many vectors? | <1–5M: pgvector or embedded. Tens of millions and up: a dedicated engine
Already on Postgres? | yes → start with pgvector
Need heavy filtering / tenants? | engines with filtered-ANN and partitions
Need hybrid keyword + vector? | Elasticsearch/OpenSearch, Weaviate, Qdrant, or Postgres full-text + pgvector
Operations capacity? | none → managed service; plenty → self-host
Data residency rules? | self-host or a region-pinned managed option
:::

```quiz
? What is the post-filter trap?
- Filters are slow
+ Running ANN first and then dropping results that fail the filter can leave fewer than k (or zero) results
- Filters change the embeddings
> Use filter-aware ANN or over-fetch, and test recall under selective filters.

? Why might pgvector be a good first choice?
+ Vectors live beside your relational data with transactions, SQL filters and familiar operations
- It is always the fastest at billions of vectors
- It needs no index
> It keeps the stack simple until scale demands otherwise.

? Which is the safest way to enforce document permissions in RAG?
- Tell the model not to reveal restricted documents
+ Filter at retrieval so unauthorised chunks are never returned or sent to the model
- Hash the filenames
> Prompts are not access control.

? After a document is updated, what should happen to its old chunks?
+ They should be deleted or replaced atomically so queries never see mixed versions
- Nothing, old chunks help
- They should be hidden in the prompt
> Stale chunks cause contradictory answers.
```

:::keypoints
- A vector database adds persistence, filtering, hybrid search, updates, tenancy and scale around an ANN index.
- Start simple: pgvector or an embedded store for small/medium corpora; dedicated engines for scale, heavy filtering or special features.
- Filters and ANN interact: prefer filter-aware indexes, avoid naive post-filtering, test recall under selective filters.
- Enforce permissions and tenancy in retrieval, never in the prompt; plan the isolation model.
- Know your consistency, backup, capacity and cost story, and be able to rebuild the index from source.
:::

:::resources
- [pgvector](https://github.com/pgvector/pgvector) — vector search in PostgreSQL.
- [Qdrant documentation](https://qdrant.tech/documentation/) — filtering, quantization and hybrid search.
- [Weaviate documentation](https://weaviate.io/developers/weaviate) — hybrid search and multi-tenancy.
- [Milvus](https://github.com/milvus-io/milvus) and [Pinecone docs](https://docs.pinecone.io) — distributed and managed options.
- [Chroma docs](https://docs.trychroma.com) and [LanceDB docs](https://lancedb.github.io/lancedb/) — embedded, developer-friendly stores.
- [ANN-Benchmarks](https://ann-benchmarks.com/) — compare index performance (note: mostly unfiltered).
:::
