---
title: Embeddings and vector search
level: intermediate
time: 45
summary: Turn text into vectors so that similar meaning means nearby numbers, search them with one matrix multiplication, and learn the difference between a built-in word-matching embedder and a real semantic model. Runs live in your browser.
tags: embeddings, cosine similarity, vector search, numpy
---

Keyword search asks "does this passage contain these words?" That fails the moment a person asks about **vacation** and the handbook says **leave**. We want search that understands *meaning*, and that is what embeddings give us.

:::def Embedding
A list of numbers (a **vector**) that represents a piece of text, produced by a model so that texts with similar meaning get vectors that point in similar directions. A typical embedding has 384 to 3,072 numbers.
:::

:::analogy A map of meaning
Imagine a huge map where every sentence is a pin. "You get 24 days of annual leave" and "How much holiday do I have?" land close together. "The earbuds play for 8 hours" lands far away. An embedding model is the machine that decides where each pin goes; vector search is "find the pins nearest to this new pin".
:::

## Measuring closeness: cosine similarity

Two vectors point in similar directions when the **angle** between them is small. The standard measure is **cosine similarity**: 1 means the same direction, 0 means unrelated, negative means opposite.

$$\cos(a, b) = \frac{a \cdot b}{\lVert a \rVert \, \lVert b \rVert}$$

There is a convenient trick. If every vector is first scaled to **length 1** (a *unit vector*), the bottom of the fraction is 1, and cosine similarity is just the **dot product** $a \cdot b$. All our embedders return unit vectors, so comparing a question with *every* passage is one matrix multiplication:

```python
scores = matrix @ query_vector            # matrix: (number of passages, dimensions)
best = np.argsort(-scores)[:5]            # the five most similar passages
```

For thousands of passages that is a few milliseconds. This is "brute-force search", and it is exactly what the project's index does; it is perfectly good up to a few hundred thousand passages.

## Three embedders, one interface

All of them implement the same two-line protocol, so the rest of the app never knows which one it has:

```python src="ask-docs/backend/app/rag/embeddings.py" region="protocol" title="backend/app/rag/embeddings.py: the protocol"
```

`kind` is `"document"` for passages being indexed and `"query"` for a question. Some models embed them differently (a question is short and asks, a passage is long and states), and some want an instruction in front of questions. `relevance_threshold` is the cosine below which a passage is probably unrelated; you will see it used by the gate in lesson 5.

### 1. The built-in embedder: hashing words

Our default embedder has **no model and no download**. It counts words and word pairs and spreads them across 1,024 slots with a hash ("feature hashing"):

```python src="ask-docs/backend/app/rag/embeddings.py" region="hash" title="backend/app/rag/embeddings.py: HashEmbedder"
```

Details worth understanding:

- `zlib.crc32` gives the same hash on every run (Python's built-in `hash()` is randomised per process, which would make stored vectors useless after a restart).
- A random **sign** (+1 or -1) per word means two different words that collide in the same slot tend to cancel instead of adding up.
- `1 + log(count)` stops a word repeated 20 times from dominating.
- Dividing by the length makes it a unit vector.

**It matches words, not meaning.** Try it. This block runs the real `text.py` and `embeddings.py` in your browser (it needs only NumPy):

```python run src="ask-docs/backend/app/rag/text.py,ask-docs/backend/app/rag/embeddings.py" flat title="Similarity with the built-in embedder" level=intermediate
import numpy as np

emb = HashEmbedder()
question = "What happens to my unused leave days?"
passages = [
    "You can carry over up to 6 unused days of annual leave into the next year.",
    "Sick leave is 8 days per year.",
    "If you cancel, we refund the unused part of your monthly charge.",
    "The earbuds play for up to 8 hours on a single charge.",
]

q = emb.embed([question], kind="query")[0]
vectors = emb.embed(passages)
print("vector length:", np.linalg.norm(q).round(3), "| dimensions:", q.shape[0])
print()
for p, v in sorted(zip(passages, vectors), key=lambda pv: -float(q @ pv[1])):
    print(f"{float(q @ v):6.2f}  {p}")

print("\nNow the same question, worded with a synonym:")
q2 = emb.embed(["What happens to my unused vacation days?"], kind="query")[0]
for p, v in sorted(zip(passages, vectors), key=lambda pv: -float(q2 @ pv[1])):
    print(f"{float(q2 @ v):6.2f}  {p}")
```

With **leave** in the question the carry-over passage wins clearly. Swap in **vacation** and the best score drops, because this embedder has never heard that vacation and leave are related. The refund passage (which also contains "unused") nearly ties with the correct one. That is the honest limit of a word-matching embedder: perfect for learning and for fast, repeatable tests, not for understanding.

### 2. A real semantic model, locally

`FastEmbedder` runs a small open-source model (BGE small, 384 dimensions) on your own computer with ONNX. It is free, offline after the first download of about 70 MB, and it understands synonyms.

```python src="ask-docs/backend/app/rag/embeddings.py" region="fastembed" title="backend/app/rag/embeddings.py: FastEmbedder"
```

Note the `"Represent this sentence for searching relevant passages: "` prefix for queries: this family of models was trained with it, and leaving it out lowers quality. Always read the model card for query and document conventions.

Same question, same passages, scored by this model (measured on the author's machine):

| Passage | built-in (words) | BGE small (meaning) |
|---|---|---|
| carry over up to 6 unused days of annual leave | 0.20 | **0.70** |
| refund the unused part of your monthly charge | 0.11 | 0.65 |
| Sick leave is 8 days per year | 0.11 | 0.56 |
| earbuds play for up to 8 hours | -0.11 | 0.44 |

The ranking is right for both, but notice the scale. BGE scores *everything* between 0.44 and 0.70, even the unrelated earbuds sentence. **Absolute cosine values mean different things for different models**, which is why each embedder carries its own `relevance_threshold` and why you should never copy a threshold from a blog post. Measure.

And semantic is not magic. For "Can I buy lunch on a business trip and claim it back?" the model scores *Business expenses are reimbursed within 10 working days* at 0.62 and the passage that really answers it, *a food allowance of ₹800 per day*, at 0.56. It is still among the top results, but not first. That is one reason we combine vectors with keyword search (next lesson).

### 3. A hosted embedder

`VoyageEmbedder` calls an embeddings API (Voyage AI is Anthropic's recommended embeddings partner; Anthropic itself offers no embeddings endpoint). It needs a key and batches requests.

```python src="ask-docs/backend/app/rag/embeddings.py" region="voyage" title="backend/app/rag/embeddings.py: VoyageEmbedder"
```

The request shape (`input`, `model`, `input_type`) and the response (`data[].embedding`) follow Voyage's documented API. We test it without a key by handing the client a fake transport (see the tests below).

| Embedder | Needs | Quality | Cost | Use it for |
|---|---|---|---|---|
| **hash** | nothing | matches words only | free | learning, tests, a first demo |
| **fastembed** | a 70 MB download | good, general English | free (your CPU) | real search with no key and no data leaving your machine |
| **voyage** (or another hosted model) | an API key | best, plus multilingual and domain models | per token | production quality, large corpora |

## Choosing is also a commitment: vectors cannot be mixed

A vector from one model means nothing to another model, and even the *dimension* differs (1,024 against 384). So every chunk stores the name of the embedder that made its vector (`embed_model`). When you change `EMBEDDINGS_PROVIDER`:

- the app loads only vectors made by the **current** embedder,
- the interface shows "N passages were embedded with a different model", and
- **Re-index** re-embeds everything with the new one.

Forgetting this is a classic production bug: a new model is deployed, the old vectors stay, and search quietly returns nonsense. Storing the model name next to every vector turns a silent bug into a visible warning. A test pins it down:

```python src="ask-docs/backend/tests/test_ingest.py" region="stale-test" title="backend/tests/test_ingest.py"
```

## Tests

```python src="ask-docs/backend/tests/test_search_core.py" region="embedding-tests" title="backend/tests/test_search_core.py"
```

The third test uses a fake HTTP transport to check exactly what we send to the hosted API (URL, header, `input_type`) and that vectors are normalised, with no key and no network. The fourth runs only if you installed `fastembed`, and checks that the model really does rank "when my father passes away" next to "bereavement leave".

:::keypoints
- An embedding turns text into a vector; similar meaning means a small angle between vectors.
- With unit vectors, cosine similarity is a dot product, so searching all passages is one matrix multiplication.
- The built-in hash embedder matches words only; fastembed adds meaning locally; a hosted model adds quality at a price.
- Query and document may need different treatment; read the model card.
- Absolute similarity scores mean different things for different models; never reuse a threshold.
- Store the embedder's name with every vector; changing the embedder means re-indexing.
:::

```quiz
? Why do all embedders return vectors of length 1?
- Because the database requires it
+ Then cosine similarity equals the dot product, so one matrix multiplication scores every passage
- Because longer vectors are less accurate
> Normalising removes the division from the cosine formula and makes search a single fast operation.
? A question uses "vacation" and the handbook says "leave". Which embedder is likely to cope?
- The built-in hash embedder
+ A semantic model such as BGE or Voyage, because it learned that the words are related
- None
> Word-matching sees no overlap; a trained model places both close together.
? You switch EMBEDDINGS_PROVIDER but do not re-index. What should happen?
- Search keeps working
+ The old vectors are ignored, the interface warns about stale passages, and Re-index fixes it
- The database is deleted
> Vectors from different models cannot be compared. Recording the model name makes the problem visible.
```

:::exercise See the difference yourself
If you have Python on your computer, install the optional model (`pip install -r requirements-semantic.txt`), set `EMBEDDINGS_PROVIDER=fastembed`, restart, press **Re-index**, and ask "Can I take time off when my father passes away?" with the **meaning only (vector)** search mode. Then switch to **words only (keyword)**. Which finds the *bereavement* passage, and why? (You will measure this properly in lesson 9.)
:::
