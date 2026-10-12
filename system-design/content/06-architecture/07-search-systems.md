---
title: Search Systems — Inverted Indexes to Vector Search
level: advanced
time: 50
summary: How full-text search works — tokenisation, the inverted index, relevance ranking with TF-IDF and BM25 (implemented in C++ and JavaScript) — how Elasticsearch distributes it (shards, replicas, near-real-time refresh), keeping the index in sync with the database, and modern vector (semantic) search with embeddings, approximate nearest neighbours (HNSW) and hybrid ranking.
---

A database index finds rows whose column **equals** a value. Search must find documents that are **relevant** to a few words, in any order, with typos, synonyms and ranking: "wireless noise cancelling headphones under 5000". That needs different data structures. Search is a building block in e-commerce, social, chat and document products, and the core of the typeahead and AI-retrieval questions.

## From text to terms

Before indexing, text goes through an **analysis** pipeline:

1. **Tokenise**: split into words (`"Noise-Cancelling Headphones!"` → `noise`, `cancelling`, `headphones`).
2. **Normalise**: lowercase, strip accents and punctuation.
3. **Remove stop words** (optional): very common words like "the", "a".
4. **Stem / lemmatise**: reduce words to a root (`running`, `runs` → `run`), so queries match variants.
5. Optionally add **synonyms** (`tv` ↔ `television`) and **n-grams** (for partial and fuzzy matching).

The query goes through the **same** pipeline, so both sides speak the same vocabulary.

## The inverted index

:::def Inverted index
A map from each **term** to its **postings list**: the documents containing that term (with term frequencies and positions). It's "inverted" because it maps words → documents instead of documents → words, exactly like the index at the back of a book.
:::

```text
doc1: "wireless noise cancelling headphones"
doc2: "wired headphones with mic"
doc3: "noise cancelling earbuds, wireless"

headphones → [doc1, doc2]
noise      → [doc1, doc3]
wireless   → [doc1, doc3]
cancelling → [doc1, doc3]
wired      → [doc2]      mic → [doc2]      earbuds → [doc3]
```

A query for `wireless headphones` reads two short postings lists and combines them (**intersect** for AND, **union** for OR), never touching documents that contain neither word. Postings lists are sorted by document id and heavily compressed, so even a billion-document index answers in milliseconds.

## Ranking: TF-IDF and BM25

Matching isn't enough; results must be **ordered by relevance**. The classic intuition:

- **Term frequency (TF)**: a document mentioning "headphones" five times is probably more about headphones than one mentioning it once, with diminishing returns.
- **Inverse document frequency (IDF)**: rare terms carry more information than common ones. Matching "cancelling" matters more than matching "with".
- **Length normalisation**: a short title matching the query is more relevant than a 10,000-word page mentioning it once.

**BM25** combines these and is the default ranking function of Elasticsearch, OpenSearch, Solr and Lucene:

:::formula BM25 score of document D for query Q
\text{score}(D, Q) = \sum_{t \in Q} \text{IDF}(t) \cdot \frac{f(t, D)\,(k_1 + 1)}{f(t, D) + k_1\left(1 - b + b\,\frac{|D|}{\text{avgdl}}\right)}, \quad \text{IDF}(t) = \ln\!\left(1 + \frac{N - n_t + 0.5}{n_t + 0.5}\right)
:::

where $f(t, D)$ is the term's frequency in D, $|D|$ the document length, avgdl the average length, N the number of documents, $n_t$ the number containing t, and typically $k_1 \approx 1.2$, $b = 0.75$.

:::tabs An inverted index with BM25 ranking
```js run
const docs = [
  "Wireless noise cancelling headphones with long battery life",
  "Wired headphones with microphone for gaming",
  "Noise cancelling wireless earbuds",
  "Bluetooth speaker, wireless and waterproof",
  "Studio headphones, wired, closed back, noise isolating",
];
const STOP = new Set(["with", "for", "and", "the", "a"]);
const analyse = (text) => text.toLowerCase().match(/[a-z0-9]+/g).filter((w) => !STOP.has(w));

// Build the inverted index: term → Map(docId → term frequency)
const index = new Map(), lengths = [];
docs.forEach((text, id) => {
  const terms = analyse(text);
  lengths[id] = terms.length;
  for (const t of terms) {
    if (!index.has(t)) index.set(t, new Map());
    index.get(t).set(id, (index.get(t).get(id) ?? 0) + 1);
  }
});
const N = docs.length, avgdl = lengths.reduce((a, b) => a + b, 0) / N;

function search(query, { k1 = 1.2, b = 0.75 } = {}) {
  const scores = new Map();
  for (const t of analyse(query)) {
    const postings = index.get(t);
    if (!postings) continue;                                  // only documents in the postings are touched
    const idf = Math.log(1 + (N - postings.size + 0.5) / (postings.size + 0.5));
    for (const [id, tf] of postings) {
      const norm = tf + k1 * (1 - b + b * (lengths[id] / avgdl));
      scores.set(id, (scores.get(id) ?? 0) + idf * ((tf * (k1 + 1)) / norm));
    }
  }
  return [...scores].sort((x, y) => y[1] - x[1]);
}

console.log("postings for 'headphones':", [...index.get("headphones").keys()]);
for (const q of ["wireless headphones", "noise cancelling"]) {
  console.log(`\nquery: "${q}"`);
  for (const [id, s] of search(q)) console.log(`  ${s.toFixed(3)}  doc${id}: ${docs[id]}`);
}
```
```cpp run
#include <bits/stdc++.h>
using namespace std;

vector<string> analyse(const string& text) {
    static const set<string> STOP = {"with", "for", "and", "the", "a"};
    vector<string> out;
    string cur;
    for (char ch : text + " ") {
        if (isalnum((unsigned char)ch)) cur += (char)tolower((unsigned char)ch);
        else if (!cur.empty()) { if (!STOP.count(cur)) out.push_back(cur); cur.clear(); }
    }
    return out;
}

int main() {
    vector<string> docs = {
        "Wireless noise cancelling headphones with long battery life",
        "Wired headphones with microphone for gaming",
        "Noise cancelling wireless earbuds",
        "Bluetooth speaker, wireless and waterproof",
        "Studio headphones, wired, closed back, noise isolating",
    };
    // inverted index: term -> (docId -> term frequency)
    unordered_map<string, map<int, int>> index;
    vector<int> len(docs.size());
    for (int id = 0; id < (int)docs.size(); id++) {
        auto terms = analyse(docs[id]);
        len[id] = terms.size();
        for (auto& t : terms) index[t][id]++;
    }
    double N = docs.size(), avgdl = accumulate(len.begin(), len.end(), 0.0) / N;

    auto search = [&](const string& query, double k1 = 1.2, double b = 0.75) {
        map<int, double> scores;
        for (auto& t : analyse(query)) {
            auto it = index.find(t);
            if (it == index.end()) continue;            // only documents in the postings are touched
            double n = it->second.size();
            double idf = log(1 + (N - n + 0.5) / (n + 0.5));
            for (auto [id, tf] : it->second)
                scores[id] += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * len[id] / avgdl));
        }
        vector<pair<int, double>> ranked(scores.begin(), scores.end());
        sort(ranked.begin(), ranked.end(), [](auto& x, auto& y) { return x.second > y.second; });
        return ranked;
    };

    cout << "postings for 'headphones':";
    for (auto& [id, tf] : index["headphones"]) cout << " " << id;
    cout << "\n";
    for (string q : {"wireless headphones", "noise cancelling"}) {
        cout << "\nquery: \"" << q << "\"\n";
        for (auto [id, s] : search(q)) cout << "  " << fixed << setprecision(3) << s << "  doc" << id << ": " << docs[id] << "\n";
    }
}
```
:::

Real search engines add many more ranking signals on top of text relevance: popularity, recency, personalisation, sales, ratings, and **learning-to-rank** models trained on clicks.

## Search engines at scale (Elasticsearch / OpenSearch)

- An **index** is split into **shards** (each a self-contained Lucene index), spread across nodes, each with **replicas** for availability and read throughput.
- A query is **scattered** to one copy of every shard, each returns its top results, and the coordinating node **merges** them (scatter-gather, from the sharding lesson).
- Writes go to an in-memory buffer and become searchable after a **refresh** (by default every second): **near-real-time**, not immediate.
- Segments are immutable and periodically **merged** (much like LSM compaction).

```viz algo=arch title="Keeping a search index in sync with the source of truth"
app     Product service [service]
db      PostgreSQL | source of truth [sql]
cdc     CDC connector | Debezium [worker]
bus     Kafka [stream]
idx     Indexer [worker]
es      Search cluster | shards × replicas [search]
api     Search API [service]
user    Users [users]
--
app -> db : writes
db ~> cdc : WAL changes
cdc ~> bus
bus ~> idx
idx -> es : upsert documents
user -> api : ?q=wireless headphones
api -> es
```

:::tip The search index is not the source of truth
Write to the database, then feed changes into the index asynchronously (CDC or events, never dual writes from the app). Search results may lag by a second or two, which is usually fine. Rebuild the index from the source at any time (reindex into a new index, then switch an alias with zero downtime).
:::

## Vector (semantic) search

Keyword search fails on meaning: "cheap laptop for students" won't match "budget notebook for college". **Embeddings** fix that.

:::def Embedding
A list of numbers (a vector, typically 384–3,072 dimensions) produced by a machine-learning model, such that texts (or images) with similar **meaning** have vectors that point in similar directions. Similarity is measured with **cosine similarity** or dot product.
:::

```js run title="Semantic similarity with (toy) embeddings"
// Real embeddings come from a model and have hundreds of dimensions; these 4-d toy vectors
// use the axes [price-budget, computer, education, audio] to show the idea.
const items = {
  "budget notebook for college":      [0.9, 0.9, 0.8, 0.0],
  "gaming laptop RTX 4090":           [-0.8, 0.95, 0.0, 0.1],
  "wireless headphones":              [0.1, 0.1, 0.0, 0.95],
  "affordable chromebook for school": [0.85, 0.8, 0.85, 0.0],
};
const query = { text: "cheap laptop for students", vec: [0.9, 0.85, 0.75, 0.0] };

const cosine = (a, b) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return dot / (norm(a) * norm(b));
};
console.log(`query: "${query.text}" (no words in common with the top results!)`);
Object.entries(items)
  .map(([text, vec]) => [cosine(query.vec, vec), text])
  .sort((a, b) => b[0] - a[0])
  .forEach(([sim, text]) => console.log(`  ${sim.toFixed(3)}  ${text}`));
```

Comparing the query vector against **every** stored vector is exact but O(N), too slow for millions of items. Vector databases use **approximate nearest neighbour (ANN)** indexes that trade a little recall for orders-of-magnitude speed:

- **HNSW** (Hierarchical Navigable Small World): a multi-layer graph where each vector links to its near neighbours; a search greedily hops through the graph toward the query, from coarse upper layers to the dense bottom layer. Very fast and accurate; memory-hungry. The default in most vector stores.
- **IVF** (inverted file): cluster the vectors (k-means), search only the few clusters closest to the query. Often combined with **product quantisation** (compressing vectors) for billion-scale indexes (FAISS).

Vector stores: pgvector (Postgres), Elasticsearch/OpenSearch k-NN, Pinecone, Weaviate, Milvus, Qdrant, FAISS.

### Hybrid search and RAG

Keyword search excels at exact terms (product codes, names, rare words); vector search excels at meaning. **Hybrid search** runs both and merges the rankings, often with **reciprocal rank fusion** (score = Σ 1 / (60 + rank in each list)), then optionally **re-ranks** the top results with a more expensive model. This is also the retrieval step of **RAG** (retrieval-augmented generation): find the most relevant chunks of your documents, then give them to an LLM to answer the question. The LLM-serving case study builds on this.

:::interview Search in a design
*"Products live in Postgres; changes stream through CDC into an Elasticsearch index (3 shards × 2 replicas), so search is near-real-time and the index can be rebuilt any time. Ranking is BM25 plus popularity and personalisation boosts. For natural-language queries we add an embedding index (HNSW) and merge both with reciprocal rank fusion."*
:::

```quiz
? What does an inverted index map?
+ Each term to the list of documents containing it
- Each document to its primary key
- Each user to their search history
> Term → postings list, so a query reads only the lists for its terms.

? Why does BM25 weight rare terms more heavily than common ones?
+ Through IDF: a term appearing in few documents is more informative about relevance
- Rare terms are longer
- It doesn't; all terms are equal
> Matching "cancelling" says more about a document than matching "with".

? Why shouldn't the application write to the database and to Elasticsearch directly in the same request?
- Elasticsearch can't accept writes
+ It's a dual write: a failure between the two leaves them inconsistent. Feed the index from the database's changes (CDC/outbox) instead
- It makes searches slower
> The database is the source of truth; the index is derived from it asynchronously.

? "Budget notebook" doesn't match the query "cheap laptop" in keyword search. What finds it?
+ Vector (semantic) search with embeddings, since the meanings are close
- A bigger inverted index
- Stemming
> Embeddings capture meaning; ANN indexes like HNSW make that search fast at scale.
```

:::keypoints
- Text is **analysed** (tokenise, normalise, stop words, stemming, synonyms) the same way at index and query time.
- The **inverted index** maps terms to postings lists; queries intersect/union short lists.
- **BM25** ranks by term frequency (saturating), **IDF** (rarity) and length normalisation; production ranking adds popularity, recency, personalisation and learned models.
- Elasticsearch: **shards + replicas**, scatter-gather queries, **near-real-time** refresh. Feed it from the source of truth via **CDC/events**, and reindex behind an alias.
- **Vector search**: embeddings + **ANN** (HNSW, IVF) find meaning, not words. **Hybrid search** (BM25 + vectors, fused) is the modern default and powers **RAG** retrieval.
:::
