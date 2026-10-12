---
title: Vector Search Engine
level: advanced
time: 55
icon: database
cover: #14b8a6,#3b82f6
tags: Float32Array, generics, k-means, approximate search, recall, benchmarks
summary: Build the core of a vector database — a generic, typed store over Float32Array vectors with metadata filters, exact (brute-force) search, an approximate IVF index built with k-means, and a benchmark that measures speed against recall@k.
---

Vector databases (pgvector, Qdrant, Pinecone…) answer one question fast: **which stored vectors are closest to this one?** This project builds a small one, so you understand the trade-off they all make: exact search is simple but slow; **approximate** search is fast but sometimes misses a result.

:::def Approximate nearest neighbour (ANN) search
Finding vectors that are *probably* the closest, by searching only a promising part of the data instead of all of it. Measured by **recall@k**: what fraction of the true top-k results the fast search found.
:::

:::flow IVF index
Vectors | normalised Float32Array
k-means | group into clusters
Index | each vector → nearest centroid
Query | search only the closest clusters
Measure | recall@k vs speed
:::

**You'll practise:** generic classes (`VectorIndex<M>`), typed arrays, interfaces with multiple implementations, a seeded random generator, and benchmarking.

## Step 1 — Vectors and similarity

```ts run level=intermediate title="Step 1 · Float32Array math"
function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

const a = normalize(Float32Array.from([1, 2, 3]));
const b = normalize(Float32Array.from([2, 4, 6.5]));
const c = normalize(Float32Array.from([-3, 0, 1]));
console.log("a·b =", dot(a, b).toFixed(4), "(nearly the same direction)");
console.log("a·c =", dot(a, c).toFixed(4), "(different direction)");
console.log("bytes for 1M × 1024-dim vectors:", (1_000_000 * 1024 * 4 / 1e9).toFixed(1), "GB as Float32Array (twice that as number[])");
```

## Step 2 — The complete engine

(It builds two indexes over 10,000 vectors, so give it a second or two.)

```ts run level=advanced title="Vector search engine · complete"
// ================= utilities =================
function rng(seed: number) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
function normalize(v: Float32Array): Float32Array { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i] /= n; return v; }
function dot(a: Float32Array, b: Float32Array): number { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

type Hit<M> = { id: number; score: number; meta: M };

interface VectorIndex<M> {
  readonly name: string;
  add(vector: Float32Array, meta: M): number;
  build?(): void;
  search(query: Float32Array, k: number, filter?: (meta: M) => boolean): Hit<M>[];
}

// keep the k best hits without sorting everything
function topK<M>(hits: Iterable<Hit<M>>, k: number): Hit<M>[] {
  const best: Hit<M>[] = [];
  for (const h of hits) {
    if (best.length < k) { best.push(h); best.sort((x, y) => y.score - x.score); }
    else if (h.score > best[k - 1].score) { best[k - 1] = h; best.sort((x, y) => y.score - x.score); }
  }
  return best;
}

// ================= exact search =================
class FlatIndex<M> implements VectorIndex<M> {
  readonly name: string = "flat (exact)";
  protected vectors: Float32Array[] = [];
  protected metas: M[] = [];
  readonly dims: number;
  constructor(dims: number) { this.dims = dims; }

  add(vector: Float32Array, meta: M): number {
    if (vector.length !== this.dims) throw new Error(`Expected ${this.dims} dimensions, got ${vector.length}`);
    this.vectors.push(normalize(Float32Array.from(vector)));
    this.metas.push(meta);
    return this.vectors.length - 1;
  }
  search(query: Float32Array, k: number, filter?: (meta: M) => boolean): Hit<M>[] {
    const q = normalize(Float32Array.from(query));
    const self = this;
    return topK((function* () {
      for (let i = 0; i < self.vectors.length; i++) if (!filter || filter(self.metas[i])) yield { id: i, score: dot(q, self.vectors[i]), meta: self.metas[i] };
    })(), k);
  }
}

// ================= approximate search: IVF (inverted file) with k-means =================
class IVFIndex<M> extends FlatIndex<M> {
  override readonly name: string;
  #centroids: Float32Array[] = [];
  #lists: number[][] = [];
  readonly nlist: number;
  readonly nprobe: number;
  constructor(dims: number, nlist: number, nprobe: number) { super(dims); this.nlist = nlist; this.nprobe = nprobe; this.name = `IVF (${nlist} clusters, probe ${nprobe})`; }

  build(iterations = 8): void {
    const random = rng(7);
    this.#centroids = Array.from({ length: this.nlist }, () => Float32Array.from(this.vectors[Math.floor(random() * this.vectors.length)]));
    let assignment = new Array<number>(this.vectors.length).fill(0);
    for (let it = 0; it < iterations; it++) {
      assignment = this.vectors.map((v) => this.#nearestCentroids(v, 1)[0]);
      const sums = this.#centroids.map(() => new Float32Array(this.dims));
      assignment.forEach((c, i) => { const s = sums[c]; const v = this.vectors[i]; for (let d = 0; d < this.dims; d++) s[d] += v[d]; });
      this.#centroids = sums.map((s, c) => (s.some((x) => x !== 0) ? normalize(s) : this.#centroids[c]));
    }
    this.#lists = this.#centroids.map(() => []);
    assignment.forEach((c, i) => this.#lists[c].push(i));
  }

  #nearestCentroids(v: Float32Array, n: number): number[] {
    return this.#centroids.map((c, i) => [i, dot(v, c)] as const).toSorted((a, b) => b[1] - a[1]).slice(0, n).map(([i]) => i);
  }

  override search(query: Float32Array, k: number, filter?: (meta: M) => boolean): Hit<M>[] {
    if (!this.#lists.length) throw new Error("Call build() before searching");
    const q = normalize(Float32Array.from(query));
    const self = this;
    return topK((function* () {
      for (const c of self.#nearestCentroids(q, self.nprobe))
        for (const i of self.#lists[c]) if (!filter || filter(self.metas[i])) yield { id: i, score: dot(q, self.vectors[i]), meta: self.metas[i] };
    })(), k);
  }
}

// ================= synthetic data: 10,000 "documents" in 48 dims, grouped by topic =================
type DocMeta = { topic: "billing" | "sync" | "ai" | "security"; lang: "en" | "de" };
const DIMS = 48, N = 10_000, random = rng(42);
const topicCenters = Array.from({ length: 40 }, () => normalize(Float32Array.from({ length: DIMS }, () => random() * 2 - 1)));
const topics: DocMeta["topic"][] = ["billing", "sync", "ai", "security"];

const flat = new FlatIndex<DocMeta>(DIMS);
const ivfFast = new IVFIndex<DocMeta>(DIMS, 64, 2);
const ivfBalanced = new IVFIndex<DocMeta>(DIMS, 64, 8);
for (let i = 0; i < N; i++) {
  const center = topicCenters[i % topicCenters.length];
  const v = Float32Array.from(center, (x) => x + (random() - 0.5) * 0.6);
  const meta: DocMeta = { topic: topics[i % 4], lang: random() < 0.8 ? "en" : "de" };
  for (const index of [flat, ivfFast, ivfBalanced]) index.add(v, meta);
}
console.time("build IVF indexes");
ivfFast.build(); ivfBalanced.build();
console.timeEnd("build IVF indexes");

// ================= benchmark: speed vs recall@10 =================
const queries = Array.from({ length: 50 }, (_, i) => Float32Array.from(topicCenters[(i * 7) % topicCenters.length], (x) => x + (random() - 0.5) * 0.6));
const truth = queries.map((q) => new Set(flat.search(q, 10).map((h) => h.id)));

for (const index of [flat, ivfFast, ivfBalanced] as VectorIndex<DocMeta>[]) {
  const t0 = performance.now();
  let found = 0;
  queries.forEach((q, qi) => { for (const h of index.search(q, 10)) if (truth[qi].has(h.id)) found++; });
  const ms = (performance.now() - t0) / queries.length;
  console.log(`${index.name.padEnd(28)} ${ms.toFixed(2).padStart(6)} ms/query   recall@10 = ${(found / (queries.length * 10)).toFixed(2)}`);
}

// ================= metadata filters =================
const hits = flat.search(queries[0], 3, (m) => m.lang === "de" && m.topic === "ai");
console.log("\nfiltered (German, topic ai):", hits.map((h) => ({ id: h.id, score: h.score.toFixed(3), ...h.meta })));
```

Read the benchmark: the IVF index searches only a few clusters, so it's several times faster than brute force. With too few clusters probed it misses some true neighbours (lower recall); probing more clusters recovers recall at some cost in speed. Real vector databases expose exactly this dial (`nprobe`, `ef_search`…).

## How it works

| Part | Technique |
|---|---|
| storage | normalised `Float32Array`s, so cosine similarity = dot product |
| one interface, many indexes | `VectorIndex<M>` implemented by `FlatIndex` and `IVFIndex` (which `extends` it with `override`) |
| top-k without full sort | keep a small sorted buffer of the k best |
| IVF | k-means centroids; each vector stored in its nearest cluster's list; queries probe `nprobe` clusters |
| filters | a typed predicate `(meta: M) => boolean` |
| measurement | recall@10 against exact search, and ms/query |

## Making it real

```sql
-- Postgres + pgvector: the same ideas in a database
CREATE TABLE chunks (id bigserial PRIMARY KEY, doc_id text, lang text, embedding vector(1024));
CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1000);
SET ivfflat.probes = 10;
SELECT id, doc_id, 1 - (embedding <=> $1) AS score FROM chunks WHERE lang = 'en' ORDER BY embedding <=> $1 LIMIT 10;
```

:::exercise Extend it
1. Add **product quantization**: store each vector as 8-bit codes and measure memory saved vs recall lost.
2. Implement an **HNSW**-style graph index and compare it with IVF at equal recall.
3. Add `delete(id)` and `update(id, vector)` without rebuilding everything.
4. Persist the index to JSON (centroids + lists) and validate it on load with Zod.
:::

:::keypoints
- Store normalised `Float32Array` vectors; similarity is a dot product.
- Exact search scans everything; IVF searches only the closest clusters (k-means).
- Approximate search trades **recall** for **speed** — always measure recall@k against exact results.
- A generic `VectorIndex<M>` interface keeps metadata typed and implementations swappable.
:::
