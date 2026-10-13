---
title: Multimodal Embeddings and Search
level: advanced
time: 35
summary: One vector space for text, images and more. CLIP and SigLIP style joint embeddings, text-to-image and image-to-image search, zero-shot classification, late-interaction visual document retrieval (ColPali and MaxSim), hybrid pipelines with captions, indexing and evaluation, and where multimodal retrieval fits into RAG. With runnable cross-modal retrieval and MaxSim demos.
---

Text embeddings let you search documents by meaning. **Multimodal embeddings** put different modalities (text, images, sometimes audio, video or documents) into the **same vector space**, so a text query can retrieve images, an image can retrieve similar images, and a screenshot can be matched to its description. This is the engine behind visual search, product discovery, media libraries and visual RAG.

## Joint embedding spaces

**CLIP** ([paper](https://arxiv.org/abs/2103.00020)) trains an image encoder and a text encoder so that matching image–caption pairs have high cosine similarity (the contrastive loss from the vision-language lesson). **SigLIP** replaces the softmax contrastive loss with a pairwise sigmoid loss, which scales better and is now a very common backbone. Newer models extend the idea to more modalities, longer text, multilingual input and documents.

Once images and text live in one space you get, almost for free:

| Capability | How |
|---|---|
| **Text to image search** | embed the query text, find nearest image vectors |
| **Image to image search** | embed the query image, nearest neighbours (visual similarity) |
| **Image to text** | embed the image, nearest caption vectors |
| **Zero-shot classification** | embed class names as text ("a photo of a dog") and pick the closest to the image embedding |
| **Dedup and clustering** | near-duplicate detection, grouping visually similar items |
| **Filters and recommendations** | combine vector similarity with metadata |

```python run title="Cross-modal retrieval in a toy joint space" level=intermediate
import numpy as np

rng = np.random.default_rng(3)
concepts = ["red running shoe", "blue denim jacket", "wooden dining table", "black office chair", "green hiking backpack"]
D = 32
base = {c: rng.normal(size=D) for c in concepts}                       # each concept has a direction in the shared space
unit = lambda v: v / np.linalg.norm(v)

# "images" are noisy views of a concept, "captions" are text views of it (a stand-in for trained encoders)
images  = {f"img_{i}_{c.split()[0]}": unit(base[c] + 0.5 * rng.normal(size=D)) for i, c in enumerate(concepts)}
queries = {"shoes for running": unit(base["red running shoe"] + 0.6 * rng.normal(size=D)),
           "something to sit on at work": unit(base["black office chair"] + 0.8 * rng.normal(size=D))}

names = list(images); M = np.stack([images[n] for n in names])
for q, v in queries.items():
    sims = M @ v
    order = np.argsort(-sims)[:3]
    print(f"query {q!r}")
    for r in order:
        print(f"   {names[r]:18} cosine={sims[r]:.2f}")
print("\nreal systems replace the toy vectors with CLIP/SigLIP encoders; the retrieval code is identical")
```

```python run title="Zero-shot classification with text prompts" level=easy
import numpy as np

rng = np.random.default_rng(1)
D = 24
labels = ["cat", "dog", "bird"]
proto = {l: rng.normal(size=D) for l in labels}
unit = lambda v: v / np.linalg.norm(v)
text_emb = np.stack([unit(proto[l]) for l in labels])                  # embeddings of "a photo of a {label}"
image_emb = unit(proto["dog"] + 0.7 * rng.normal(size=D))              # an image of a dog (noisy)
scores = text_emb @ image_emb
probs = np.exp(100 * scores) / np.exp(100 * scores).sum()              # softmax with a CLIP-style temperature
for l, p in zip(labels, probs):
    print(f"{l:5} p={p:.2f}")
print("no training on these labels was needed: you just describe the classes in words")
```

### Limits of single-vector image embeddings

- They capture **global gist** ("a kitchen with a wooden table"), not exact text, small objects or counts.
- **Compositional queries** ("a red cube on top of a blue sphere") are hard; attribute binding is a known weakness.
- **Text in images** (signs, documents) is poorly captured by general CLIP embeddings; use OCR or a document-aware model.
- Embeddings from **different models are incompatible**: re-embed everything when you change model.
- **Bias and safety**: embedding models reflect training data biases; filter harmful content in search results.

## Visual document retrieval: ColPali and late interaction

For documents with tables, charts and layouts, **OCR then chunk then embed** loses information and accumulates errors. **ColPali** ([paper](https://arxiv.org/abs/2407.01449)) embeds the **page image** directly with a VLM, producing **one vector per image patch** (a "bag of patch embeddings"), and the query text into **one vector per token**. Scoring uses **late interaction (ColBERT-style MaxSim)**: for each query token take the best-matching patch and sum.

```python run title="MaxSim late interaction between query tokens and page patches" level=advanced
import numpy as np

rng = np.random.default_rng(7)
D = 16
unit = lambda m: m / np.linalg.norm(m, axis=1, keepdims=True)

def maxsim(query_vecs, page_vecs):
    sims = query_vecs @ page_vecs.T                    # (query tokens, page patches)
    return sims.max(axis=1).sum()                      # best patch for each query token, summed

# three "pages": each is a set of patch vectors; page B contains patches about both 'revenue' and 'Q3'
topic = {t: rng.normal(size=D) for t in ["revenue", "Q3", "headcount", "logo", "legal"]}
def page(topics, extra=12):
    patches = [topic[t] + 0.2 * rng.normal(size=D) for t in topics] + [rng.normal(size=D) for _ in range(extra)]
    return unit(np.array(patches))
pages = {"A: logo + legal": page(["logo", "legal"]), "B: revenue + Q3 chart": page(["revenue", "Q3"]), "C: headcount": page(["headcount"])}
query = unit(np.array([topic["revenue"] + 0.2 * rng.normal(size=D), topic["Q3"] + 0.2 * rng.normal(size=D)]))   # tokens: "revenue", "Q3"

for name, p in sorted(pages.items(), key=lambda kv: -maxsim(query, kv[1])):
    print(f"{name:24} MaxSim score = {maxsim(query, p):.2f}")
print("\neach query token finds its best patch, so a page matches when it covers every part of the query")
```

Trade-offs of late interaction: **much better fidelity** on visually rich documents, but **storage and compute grow** (hundreds of vectors per page instead of one). Mitigations: quantise vectors, pool patches, use a first-stage single-vector retriever and rerank with MaxSim, or use vector stores with multi-vector support.

## Architectures for multimodal RAG

| Pattern | How | When |
|---|---|---|
| **Caption and embed text** | describe images/tables with a VLM at ingest; index the text with your normal text pipeline | simplest; works with any stack; loses fine visual detail |
| **Joint embeddings** | CLIP/SigLIP vectors for images; text queries search images directly | product/photo/media search |
| **Visual document retrieval** | ColPali-style page embeddings (optionally plus OCR text) | slide decks, scanned reports, charts and tables |
| **Hybrid** | text index + image index + metadata filters, merged with rank fusion and reranking | most production systems |
| **Generation with images** | pass the retrieved page images to a VLM to answer | when the answer lives in a figure or layout |

Practical tips:

- Store **the image (or page) reference with the vector**, so you can show the user the source and pass it to a VLM for answering.
- Use **metadata filters** (date, category, access control) before or alongside vector search.
- Keep **text OCR as well** for exact keyword matches (SKUs, names); hybrid search beats either alone.
- **Chunking images**: for large images or slides, tile or segment so small regions are findable.
- **Access control** must apply to images and pages exactly as to text.

## Evaluating multimodal search

Build a labelled set of **queries with relevant items** (images or pages), with realistic, diverse phrasing and hard negatives (visually similar but wrong). Measure **recall@k, MRR and nDCG** (as in the retrieval lessons) per query type, and compare: caption-only, CLIP-style, and ColPali-style retrieval on your data. Check **end-to-end answer quality** when retrieved images are passed to a VLM. Include latency and index size, which differ greatly between single-vector and multi-vector approaches.

```quiz
? What makes cross-modal search possible with CLIP-style models?
+ Images and text are embedded into one shared space where matching pairs are close
- Images are converted to text by OCR first
- Each modality uses a separate index with no relation
> Cosine similarity then works across modalities.

? What does MaxSim do in late-interaction retrieval?
+ For each query token it takes the most similar document patch and sums these maxima
- It averages all patch vectors into one
- It sorts patches alphabetically
> It preserves fine-grained matches between parts of the query and parts of the page.

? Why might you choose ColPali-style retrieval over OCR plus text embeddings?
+ Charts, tables and layouts are captured directly from the page image without OCR errors
- It uses less storage
- It needs no GPU
> The cost is more vectors per page and heavier indexing.

? What is a sensible upgrade path for multimodal RAG on a limited budget?
+ Start with VLM captions plus your text pipeline, then add image or page embeddings where evals show gaps
- Re-embed everything with a new model without evaluation
- Skip metadata filters
> Measure before adding complexity.
```

:::problem An e-commerce site wants shoppers to search with text ("floral summer dress") or by uploading a photo, with filters for size and price. Design the system and its evaluation. {level=medium tags="multimodal,search"}
Mention indexing, ranking, filtering and metrics.

:::solution Model answer
Index: embed every product image (and optionally title/description) with a CLIP/SigLIP-family model into a vector index along with structured metadata (category, size availability, price, stock). Query: text queries are embedded with the text tower; photo queries with the image tower; apply **metadata pre-filters** (size, price, in-stock) and combine with **keyword/BM25 on titles** via rank fusion; rerank the top results with a cross-modal reranker or VLM for the top few and business signals (popularity, margin) where appropriate. Operations: batch re-embedding pipeline when models change, dedup of near-duplicate listings, safety filtering of uploaded images, privacy handling for user photos. Evaluation: labelled query–product relevance sets (including hard negatives like similar patterns), recall@k/nDCG offline, then online A/B tests on click-through, add-to-cart and zero-result rate; slice by query type (text vs photo, broad vs specific).
:::
:::

:::keypoints
- Multimodal embeddings (CLIP, SigLIP and successors) place text and images in one space, enabling text-to-image search, image similarity and zero-shot classification.
- Single-vector image embeddings capture gist, not exact text, counts or compositions; combine with OCR, captions and metadata.
- ColPali-style models embed page images as many patch vectors and score with MaxSim late interaction, which is strong for charts, tables and layouts at higher storage cost.
- Architectures range from caption-and-embed to joint embeddings to visual document retrieval; hybrid pipelines with filters and reranking are the norm.
- Evaluate with labelled queries, recall/nDCG and end-to-end answer quality; keep access control and source references with every vector.
:::

:::resources
- [CLIP](https://arxiv.org/abs/2103.00020) — contrastive language-image pretraining.
- [ColPali](https://arxiv.org/abs/2407.01449) — efficient document retrieval with vision language models.
- [Sentence Transformers](https://www.sbert.net) — CLIP and multimodal embedding models in a simple API.
- [Hugging Face: multimodal retrieval and search recipes](https://huggingface.co/learn/cookbook) — worked examples.
- [Qdrant docs](https://qdrant.tech/documentation/) and [pgvector](https://github.com/pgvector/pgvector) — vector stores for image and text embeddings.
- [Hugging Face blog](https://huggingface.co/blog) — search for "multimodal retrieval" and "ColPali".
:::
