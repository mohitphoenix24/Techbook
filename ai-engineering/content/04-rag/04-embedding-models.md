---
title: Choosing and Using Embedding Models
level: intermediate
time: 45
summary: How to pick an embedding model for retrieval and how to use it well. Quality, dimension, context length, languages, cost and licence; query versus document modes; evaluating on your own data; shrinking vectors with Matryoshka truncation and quantization (int8 and binary) and what that does to recall; fine-tuning embeddings; and the operational rules (never mix models, version your index).
---

An embedding model is the **sense organ** of your RAG system. It decides which texts look similar. A weak or mismatched model makes retrieval fail in ways that no prompt can repair. This lesson is about choosing one deliberately and using it correctly.

## What to compare

| Criterion | Why it matters | Notes |
|---|---|---|
| **Retrieval quality on *your* data** | the only metric that finally matters | public benchmarks shortlist; your eval decides |
| **Dimension** | memory, cost, search speed | 256–4096 typical; bigger is not always better |
| **Max input length** | longer chunks possible | text beyond the limit is silently truncated |
| **Languages** | multilingual corpora and queries | check cross-lingual retrieval if you need it |
| **Domain** | code, legal, biomedical, finance | domain-specific models often win in their niche |
| **Modality** | text only, or text + images | multimodal embeddings for screenshots, PDFs, product images |
| **Latency and cost** | embeddings are called per document *and* per query | API per-token price vs self-hosted GPU/CPU |
| **Licence and hosting** | commercial use, data privacy | open weights can run entirely in your network |
| **Stability** | provider can deprecate models | changing models means re-embedding everything |

## Query mode versus document mode

Retrieval is **asymmetric**: a short question should match a long passage that answers it. Many models are trained so that queries and documents go through slightly different treatment: an instruction prefix such as `query:` / `passage:` or `Represent this sentence for searching relevant passages:`, or a separate `input_type="query" | "document"` API argument. **Use the mode the model expects.** Skipping it quietly reduces quality, and it is one of the most common mistakes.

```python local title="Embedding with the right input types (API-style)"
# Pseudo-API: most providers expose an input_type or a task prefix
doc_vectors = embed_client.embed(texts=chunks, model="some-embedding-model", input_type="document")
query_vector = embed_client.embed(texts=[question], model="some-embedding-model", input_type="query")[0]
```

```python local title="Open-source: Sentence-Transformers with instruction prefixes"
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("BAAI/bge-small-en-v1.5")
docs = model.encode(chunks, normalize_embeddings=True)                                        # documents: no prefix
q = model.encode("Represent this sentence for searching relevant passages: " + question, normalize_embeddings=True)
scores = docs @ q
```

## Evaluate on your own data

1. Collect **real or realistic questions** (30–200) and mark which chunks answer them.
2. Embed the chunks and questions with each candidate model.
3. Compute **recall@k, MRR and nDCG** (see lesson 11).
4. Compare quality **against cost, latency and index size**.

The [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard) ranks models across many tasks; check the **retrieval** columns and your language, but treat it as a shortlist. Be wary of tiny gaps and of models that may have trained on benchmark data.

## Size matters: dimension, truncation and quantization

A 1,536-dimension float32 vector takes 6 KB. For 100 million chunks that is **600 GB** of vectors, before index overhead. Three tools shrink it:

### 1. Smaller dimension (Matryoshka)

**Matryoshka representation learning** ([paper](https://arxiv.org/abs/2205.13147)) trains the model so the **first *d* dimensions** form a good embedding on their own. You can truncate 1,536 → 256 dims and renormalise, losing a little quality for a 6× smaller index. Several current models support this (check the model card).

### 2. Lower precision (quantization)

Store **int8** (4× smaller than float32) or even **binary** (1 bit per dimension, 32× smaller) vectors. Binary search uses fast Hamming distance, then **rescores** the top candidates with the full vectors.

```python run title="Shrink vectors: truncate, int8 and binary, and measure recall" level=advanced
import numpy as np

rng = np.random.default_rng(0)
N, D, Q, K = 5000, 256, 50, 10

# Synthetic "embeddings": topic signal plus noise, unit length. The scale shrinks along the dimensions,
# imitating a Matryoshka-trained model whose leading dimensions carry most of the information.
scales = 1 / np.sqrt(1 + np.arange(D) / 8)
topics = rng.normal(size=(40, D)) * scales
X = topics[rng.integers(40, size=N)] + 0.9 * rng.normal(size=(N, D)) * scales
X /= np.linalg.norm(X, axis=1, keepdims=True)
queries = X[rng.choice(N, Q, replace=False)] + 0.15 * rng.normal(size=(Q, D)) * scales
queries /= np.linalg.norm(queries, axis=1, keepdims=True)

def top_k(scores, k): return np.argsort(-scores, axis=1)[:, :k]
truth = top_k(queries @ X.T, K)

def recall(approx):                      # share of the true top-k found by the approximation
    return np.mean([len(set(a) & set(t)) / K for a, t in zip(approx, truth)])

# 1) truncation (keeps the leading dimensions, then renormalises)
for d in (128, 64, 32):
    Xt = X[:, :d] / np.linalg.norm(X[:, :d], axis=1, keepdims=True)
    qt = queries[:, :d] / np.linalg.norm(queries[:, :d], axis=1, keepdims=True)
    print(f"truncate to {d:>3} dims    size {d / D:>5.0%}   recall@{K} = {recall(top_k(qt @ Xt.T, K)):.2f}")

# 2) int8 quantization
scale = 127 / np.abs(X).max()
Xi = np.round(X * scale).astype(np.int8)
qi = np.round(queries * scale).astype(np.int8)
print(f"int8 quantized         size {1 / 4:>5.0%}   recall@{K} = {recall(top_k(qi.astype(np.int32) @ Xi.astype(np.int32).T, K)):.2f}")

# 3) binary quantization (sign bit) + rescoring of the top 100 candidates with full vectors
Xs, qs = np.where(X > 0, 1, -1), np.where(queries > 0, 1, -1)       # one bit per dimension, written as +1 / -1
ham = (D - qs @ Xs.T) / 2                                            # Hamming distance = number of differing bits
cand = np.argsort(ham, axis=1)[:, :100]
rescored = np.array([cand[i][np.argsort(-(X[cand[i]] @ queries[i]))[:K]] for i in range(Q)])
print(f"binary (no rescoring)  size {1 / 32:>5.0%}   recall@{K} = {recall(np.argsort(ham, axis=1)[:, :K]):.2f}")
print(f"binary + rescore 100   size {1 / 32:>5.0%}   recall@{K} = {recall(rescored):.2f}   (rescoring needs the full vectors somewhere cheap, e.g. on disk)")
```

The pattern to remember: **cheap, approximate first pass, then precise re-scoring of a small candidate set.** It appears again in ANN indexes (IVF, PQ) and in rerankers.

## Fine-tuning embeddings

When a general model underperforms on your domain (jargon, product codes, an unusual language), fine-tune it on **(query, relevant passage)** pairs, ideally with **hard negatives** (passages that look relevant but are not). A few thousand pairs can give double-digit recall gains. You can **synthesise pairs** by asking an LLM to write questions for each chunk, then filtering them. Libraries: Sentence-Transformers training utilities, and the open recipes in the retrieval-model literature (DPR: [paper](https://arxiv.org/abs/2004.04906)).

```python run title="Contrastive loss on a mini-batch: pull matches together, push others apart" level=advanced
import numpy as np

def info_nce(q, d, temperature=0.05):
    """q, d: (B, dim) unit vectors where d[i] is the positive for q[i]; other rows act as negatives."""
    logits = q @ d.T / temperature                                  # (B, B) similarities
    logits -= logits.max(axis=1, keepdims=True)
    log_probs = logits - np.log(np.exp(logits).sum(axis=1, keepdims=True))
    return -np.mean(np.diag(log_probs))                             # the diagonal holds the positives

rng = np.random.default_rng(1)
B, dim = 8, 32
base = rng.normal(size=(B, dim))
unit = lambda x: x / np.linalg.norm(x, axis=1, keepdims=True)

aligned_q, aligned_d = unit(base + 0.1 * rng.normal(size=(B, dim))), unit(base + 0.1 * rng.normal(size=(B, dim)))
random_q, random_d = unit(rng.normal(size=(B, dim))), unit(rng.normal(size=(B, dim)))
print("loss when pairs already match :", round(float(info_nce(aligned_q, aligned_d)), 3))
print("loss when pairs are unrelated :", round(float(info_nce(random_q, random_d)), 3))
```

Training reduces this loss: each question's vector moves toward its passage and away from the other passages in the batch.

## Operational rules

1. **Never mix embedding models** (or versions) in one index. Queries and documents must come from the same model.
2. **Store the model name, version and dimension** with the index. When you upgrade, **re-embed everything** into a new index, evaluate it, then switch traffic (blue/green).
3. **Normalise** vectors if your model/metric expects it (cosine on unit vectors = dot product).
4. **Embedding calls cost money and time**: batch requests, cache embeddings by content hash, and don't re-embed unchanged text.
5. **Mind the input limit** and truncate or chunk deliberately.
6. **Test multilingual and typo behaviour** if your users need it.
7. **Privacy**: sending text to an embedding API shares it with the provider. Self-host an open model if the data cannot leave your boundary.

```quiz
? What does "asymmetric" retrieval mean for embedding models?
- Queries and documents have different lengths and need the same prefix
+ Queries and documents may need different input modes (prefix or input_type), because a short question should match a long answering passage
- The index is asymmetric
> Using the wrong mode silently lowers retrieval quality.

? What does Matryoshka training allow?
+ Truncating vectors to fewer dimensions while keeping most of the quality
- Faster GPUs
- Training without data
> It puts the most information in the leading dimensions.

? Binary quantization followed by rescoring works because…
+ a cheap, approximate pass finds candidates and exact vectors reorder a small set
- bits are more accurate than floats
- it removes the need for an index
> Coarse recall first, precision on the shortlist.

? You switch to a better embedding model. What must you do?
- Only embed new documents with it
+ Re-embed the entire corpus into a new index and evaluate before switching
- Nothing
> Vectors from different models are not comparable.
```

:::problem Your multilingual support bot retrieves poorly for Hindi queries over English articles. What do you try? {level=medium tags="embeddings,multilingual"}
Think about the model, the pipeline and evaluation.

:::solution Model answer
(1) Check the model is **multilingual and cross-lingual** (queries in one language, documents in another); test on a labelled set of Hindi questions. (2) Switch to a stronger multilingual embedding model or add a **reranker** that handles both. (3) Consider **query translation** to English (or document translation) with a quality check. (4) Use **hybrid search** carefully: BM25 will not match across languages, so weight it by language. (5) Check tokenization/chunk size effects for the script. (6) Evaluate recall@k per language and fine-tune on in-domain cross-lingual pairs if the gap persists.
:::
:::

:::keypoints
- Pick an embedding model by quality on your data, dimension, input length, languages, domain, cost and licence.
- Use the correct query/document mode; never mix models; store model and version with the index.
- Shrink indexes with Matryoshka truncation and int8/binary quantization, then rescore a small candidate set.
- Fine-tune with (query, passage, hard-negative) pairs when a general model underperforms.
- Embeddings are an operational dependency: batch, cache, version, and re-embed deliberately.
:::

:::resources
- [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — compare embedding models across tasks and languages.
- [Sentence-Transformers docs](https://www.sbert.net) — usage, training and evaluation of embedding models.
- [Matryoshka Representation Learning](https://arxiv.org/abs/2205.13147) — nested embeddings.
- [Dense Passage Retrieval](https://arxiv.org/abs/2004.04906) — the training recipe behind many retrievers.
- [Sentence-BERT](https://arxiv.org/abs/1908.10084) — the foundation of sentence embeddings.
- [OpenAI embeddings guide](https://platform.openai.com/docs/guides/embeddings) — usage patterns and dimension trade-offs.
:::
