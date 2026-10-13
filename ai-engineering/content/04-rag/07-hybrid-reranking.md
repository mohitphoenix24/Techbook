---
title: Hybrid Search and Reranking
level: intermediate
time: 50
summary: Why vectors alone are not enough. BM25 from first principles, where keyword and semantic search each fail, fusing them with reciprocal rank fusion or weighted scores, learned sparse retrieval, and the two-stage pattern of fast retrieval followed by a precise reranker (cross-encoders, late interaction, LLM rerankers). With runnable BM25, RRF and a cross-encoder-style reranker, plus an interactive fusion explorer.
---

Embeddings capture **meaning** but are blurry about exact tokens: part numbers, error codes, names, rare terms. Keyword search nails exact tokens but misses paraphrases. Production retrieval **combines them**, then **reorders** the candidates with a more precise model. This lesson is the highest-return upgrade to most RAG systems.

## Where each method fails

| Query | Keyword (BM25) | Dense (embeddings) |
|---|---|---|
| `error E21` | ✅ exact match on "E21" | ⚠️ may return other "error" passages |
| `can I get my money back` (doc says "refund policy") | ❌ no shared words | ✅ same meaning |
| `SKU-48213` / a person's name / a function name | ✅ | ❌ rare strings embed poorly |
| `how do I remove limescale` (doc: "descale the machine") | ❌ | ✅ |
| Long natural-language question | ⚠️ | ✅ |
| Query with a negation or a number | ⚠️ | ⚠️ both struggle |

## BM25 in one page

:::def BM25
The classic ranking function behind search engines. A document scores higher when it contains the query's words **often** (term frequency, with diminishing returns), when those words are **rare across the collection** (inverse document frequency), and it adjusts for **document length** so long documents are not unfairly favoured.
:::

:::formula BM25 score of document D for query Q
\text{score}(D,Q)=\sum_{t\in Q}\text{IDF}(t)\cdot\frac{f(t,D)\,(k_1+1)}{f(t,D)+k_1\left(1-b+b\,\frac{|D|}{\text{avgdl}}\right)}
:::

`k1` (about 1.2–2.0) controls how quickly repeated terms saturate; `b` (about 0.75) controls length normalisation.

```python run title="BM25 from scratch" level=intermediate
import math, re
from collections import Counter

def tokenize(text): return re.findall(r"[a-z0-9]+", text.lower())

class BM25:
    def __init__(self, docs, k1=1.5, b=0.75):
        self.docs = [tokenize(d) for d in docs]
        self.k1, self.b = k1, b
        self.avgdl = sum(map(len, self.docs)) / len(self.docs)
        df = Counter(t for d in self.docs for t in set(d))
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
    def scores(self, query):
        out = []
        for d in self.docs:
            tf, dl, s = Counter(d), len(d), 0.0
            for t in tokenize(query):
                if t in tf:
                    s += self.idf[t] * tf[t] * (self.k1 + 1) / (tf[t] + self.k1 * (1 - self.b + self.b * dl / self.avgdl))
            out.append(s)
        return out

docs = [
    "Error E21 means the drain is blocked. Clean the filter behind the front-left panel.",
    "Error E35 means the door is not closed properly.",
    "Our refund policy: return the machine within 30 days for a full refund.",
    "The warranty lasts 2 years and covers the motor for 10 years.",
]
bm = BM25(docs)
for q in ["error E21", "refund within 30 days", "money back guarantee"]:
    s = bm.scores(q); best = max(range(len(docs)), key=s.__getitem__)
    print(f"{q!r:26} -> score {s[best]:.2f}  {docs[best][:55]!r}" if s[best] > 0 else f"{q!r:26} -> no keyword match at all")
```

Note the last query: with zero shared words BM25 returns **nothing**, while a dense model would find the refund passage.

## Fusing two ranked lists

You get one ranked list from BM25 and one from vector search. Their **scores are on different scales** (BM25 is unbounded, cosine is −1 to 1), so you cannot just add them.

### Reciprocal Rank Fusion (RRF)

Ignore the scores; use only the **ranks**. Each document gets `1 / (k + rank)` from each list, summed:

:::formula RRF
\text{RRF}(d)=\sum_{r\in \text{rankers}}\frac{1}{k+\text{rank}_r(d)},\qquad k\approx 60
:::

It needs no tuning, is robust to scale differences, and rewards documents that appear high in **either** list and especially in **both**. It is the default fusion in many engines.

### Weighted score fusion

Normalise each score list (for example min-max to [0, 1]), then `α·dense + (1−α)·sparse`. It can beat RRF when tuned on your data, and also reacts to score magnitude (a very confident match counts more), but needs normalisation and tuning.

Try both. Pick a query type and watch which method finds the right passage and how fusion rescues each failure.

```viz algo=hybrid title="Keyword + meaning + fusion"
```

```python run title="Reciprocal rank fusion" level=easy
def rrf(rankings, k=60):
    """rankings: list of ranked lists of doc ids (best first). Returns fused ranking with scores."""
    scores = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            scores[doc] = scores.get(doc, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda kv: -kv[1])

bm25_ranking  = ["doc_e21", "doc_e35", "doc_manual", "doc_refund"]       # exact-token strength
dense_ranking = ["doc_manual", "doc_e21", "doc_refund", "doc_e35"]       # semantic strength
for doc, score in rrf([bm25_ranking, dense_ranking]):
    print(f"{doc:11} {score:.4f}")
```

`doc_e21` is rank 1 in one list and rank 2 in the other, so it comes out on top: **agreement beats a single high vote.**

## Learned sparse retrieval

Between BM25 and dense lies **learned sparse** retrieval (SPLADE and relatives): a neural model produces a sparse bag of weighted terms *including related words it adds*, so it matches paraphrases while still using an inverted index. Some engines support sparse vectors natively (Qdrant, Elasticsearch ELSER, and others), giving another component for hybrid pipelines.

## Reranking: the precision stage

First-stage retrieval must be **fast** over millions of items, so it uses cheap representations (a single vector per chunk). That limits accuracy. A **reranker** takes the **top 50–200 candidates** and scores each carefully against the query.

:::flow Two-stage retrieval
Retrieve (fast, recall-oriented) | hybrid search returns 50–200 candidates
Rerank (slow, precision-oriented) | a stronger model scores each (query, candidate) pair
Keep the top 3–10 | these go to the LLM
:::

### Types of rerankers

| Type | How it works | Quality | Cost / latency |
|---|---|---|---|
| **Bi-encoder** (the first stage) | encode query and doc separately, compare vectors | good | very fast |
| **Cross-encoder** | feed (query, doc) **together** into a transformer that outputs a relevance score; it can compare every query word with every doc word | much better | slower: one forward pass per candidate |
| **Late interaction (ColBERT)** | keep one vector per **token**, score by summing each query token's best match ([paper](https://arxiv.org/abs/2004.12832)) | near cross-encoder, precomputable | larger index |
| **LLM reranker** | prompt an LLM to score or order candidates (pointwise, listwise) | strong, flexible | most expensive and slowest |
| **Hosted rerank APIs** | Cohere, Voyage, Jina and others | strong, easy | per-request cost |

```python local title="A cross-encoder reranker (open-source)"
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("BAAI/bge-reranker-base")                       # scores (query, passage) pairs
pairs = [(question, c["text"]) for c in candidates]                      # candidates from hybrid search
scores = reranker.predict(pairs)
reranked = [c for _, c in sorted(zip(scores, candidates), key=lambda x: -x[0])][:6]
```

### Why cross-encoders beat bi-encoders

A bi-encoder compresses the whole passage into one vector *before* it sees the query, so it must guess what matters. A cross-encoder reads query and passage together and can notice that "within 30 days" answers a question about "refund window". The price is that nothing can be precomputed, so you only apply it to a shortlist.

```python run title="A tiny reranker: query-aware features beat a single vector" level=intermediate
import re, math

def tok(s): return re.findall(r"[a-z0-9]+", s.lower())

def rerank_features(query, passage):
    q, p = tok(query), tok(passage)
    qs, ps = set(q), set(p)
    coverage = len(qs & ps) / len(qs)                                  # how many query words appear
    # proximity: are matched query words close together in the passage?
    pos = [i for i, w in enumerate(p) if w in qs]
    span = (max(pos) - min(pos) + 1) if pos else 99
    proximity = len(set(w for w in p if w in qs)) / span if pos else 0
    number_match = 1.0 if (set(re.findall(r"\d+", query)) & set(re.findall(r"\d+", passage))) else 0.0
    return 0.5 * coverage + 0.35 * proximity + 0.15 * number_match

query = "refund within 30 days"
candidates = [
    "We ship within 30 days to most countries, and the shipping fee is non-refundable on international orders.",
    "Our refund policy: you may return the machine within 30 days of delivery for a full refund.",
    "Refund requests are handled by the support team. Days and times may vary.",
]
for c in sorted(candidates, key=lambda c: -rerank_features(query, c)):
    print(f"{rerank_features(query, c):.2f}  {c[:70]}")
```

This hand-made scorer is a toy, but it shows the principle: a second stage can use **query-specific interactions** (coverage, proximity, exact numbers) that a single embedding cannot.

## How much does each stage help?

Typical findings (including in Anthropic's [contextual retrieval](https://www.anthropic.com/news/contextual-retrieval) experiments): hybrid (embeddings + BM25) reduces retrieval failures noticeably over embeddings alone; adding **reranking** reduces them further. Numbers vary by dataset, so **measure on yours**. A reasonable default pipeline:

1. Hybrid search: ~50–150 candidates (dense + BM25, fused with RRF).
2. Cross-encoder or API reranker: keep the top 5–10.
3. Send those to the LLM with labels and citations.

## Practical notes

- **Latency budget:** reranking 100 candidates with a cross-encoder can take 100–500 ms on GPU (more on CPU). Cap the candidate count; batch; consider a small reranker or LLM reranking only for hard queries.
- **Chunk length** matters for rerankers: they have a max input length too.
- **Score thresholds:** rerankers output meaningful relevance scores; use a threshold to drop obviously irrelevant candidates (and to detect "no answer").
- **Diversity:** near-duplicate chunks waste slots. Deduplicate or use maximal marginal relevance (MMR) to balance relevance and diversity.
- **Metadata boosts:** recency, document authority, user's product: combine with relevance scores carefully.
- **Evaluate each stage:** recall@100 of first stage (is the answer in the candidates?) and precision@5 after reranking.

```quiz
? Why can't you simply add BM25 and cosine scores?
- They are the same scale
+ They are on different scales, so rank-based fusion (RRF) or normalised weighted fusion is needed
- BM25 is always larger
> RRF uses ranks only, making it robust to scale differences.

? Which query most favours keyword search over dense retrieval?
- "How do I get my money back?"
+ "Error E21" or an exact part number
- "Explain the refund philosophy"
> Exact tokens and rare strings are BM25's strength.

? What is the advantage of a cross-encoder reranker over the bi-encoder?
+ It reads query and passage together, giving more precise relevance scores
- It is faster
- It needs no model
> The cost is that it can only run over a shortlist.

? In two-stage retrieval, what should the first stage optimise?
- Precision at 1
+ Recall: make sure the right chunk is among the candidates
- Latency only
> The reranker then fixes the ordering; it cannot find what the first stage missed.
```

:::problem Your RAG answers are wrong when users search by product codes like "ZX-4410", but fine otherwise. Diagnose and fix. {level=medium tags="hybrid,retrieval"}
Explain the likely cause and the changes.

:::solution Model answer
Dense embeddings represent rare alphanumeric codes poorly (they tokenize into fragments with little semantic meaning), so the right chunk is not retrieved. Add **BM25/keyword search** and fuse (RRF); ensure the tokenizer keeps codes intact (don't split on hyphens or lowercase away meaning), and consider **exact-match boosting** or a metadata filter extracted from the query (`product_code = ZX-4410`). Verify with a small eval set of code-lookup questions: recall@10 before and after.
:::
:::

:::keypoints
- Dense search handles meaning; BM25 handles exact tokens; hybrid search uses both, fused with RRF or normalised weights.
- BM25 rewards frequent, rare, length-normalised terms; it returns nothing when no words overlap.
- Rerank a shortlist (50–200) with a cross-encoder, late-interaction model, API or LLM, and keep the top few.
- First stage optimises recall; second stage optimises precision; evaluate them separately.
- Watch latency, deduplicate near-identical chunks, and use thresholds to detect "no good answer".
:::

:::resources
- [Anthropic: Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) — measured gains from BM25 + embeddings + reranking.
- [ColBERT](https://arxiv.org/abs/2004.12832) and [RAGatouille](https://github.com/AnswerDotAI/RAGatouille) — late interaction made easy.
- [Sentence-Transformers: cross-encoders](https://www.sbert.net) — rerank with open models.
- [Qdrant documentation](https://qdrant.tech/documentation/) and [Weaviate documentation](https://weaviate.io/developers/weaviate) — hybrid search and fusion in practice.
- [Dense Passage Retrieval](https://arxiv.org/abs/2004.04906) — the dense retriever that started the wave (and its comparison with BM25).
- [NirDiamant/RAG_Techniques](https://github.com/NirDiamant/RAG_Techniques) — fusion, reranking and MMR notebooks.
:::
