---
title: Embeddings — Meaning as Geometry
level: easy
time: 40
summary: How text becomes a list of numbers such that similar meanings land close together. Dot product and cosine similarity from scratch, the king − man + woman trick, static versus contextual embeddings, a working text embedder built from character n-grams, and how embeddings power search and RAG.
---

A neural network can only do arithmetic on numbers. An **embedding** is how we turn a token, a sentence or a whole document into a list of numbers (a **vector**) in a way that **preserves meaning**: similar things end up close together.

:::def Embedding
A learned vector (typically 256–4096 numbers) representing an object such as a token, sentence, image or user. The geometry is the point: **distance or angle between vectors approximates similarity of meaning**.
:::

:::analogy
Imagine a map of a city where every word has an address. "Dog" and "puppy" live on the same street; "dog" and "carburetor" are across town. An embedding model is the cartographer that learned the map by reading millions of texts: words that appear in similar contexts get nearby addresses. Real embeddings use hundreds of dimensions instead of two, so the "map" has hundreds of compass directions.
:::

## Two jobs embeddings do in this course

1. **Inside every LLM**, the first layer maps each token ID to a learned vector (the *token embedding table*), the starting point the Transformer refines.
2. **As a standalone model** for search and RAG: a sentence-embedding model maps a whole passage to one vector, so you can find "passages similar to this question" with simple vector math.

## Similarity in three lines

:::def Cosine similarity
The cosine of the angle between two vectors: $\frac{a \cdot b}{\lVert a\rVert \, \lVert b\rVert}$. It is 1 for the same direction, 0 for unrelated (perpendicular), and −1 for opposite. It ignores vector **length** and focuses on **direction**, which is what usually carries meaning.
:::

```python run title="Dot product, norm, cosine" level=easy
import numpy as np

a = np.array([1.0, 2.0, 3.0])
b = np.array([2.0, 4.0, 6.0])     # same direction, twice as long
c = np.array([3.0, -1.0, 0.0])    # a different direction

def cosine(x, y):
    return float(x @ y / (np.linalg.norm(x) * np.linalg.norm(y)))

print("a·b =", a @ b, "  cos(a,b) =", round(cosine(a, b), 3))   # 1.0: length does not matter
print("cos(a,c) =", round(cosine(a, c), 3))

# If vectors are normalised to length 1, cosine == dot product (this is why vector DBs often store unit vectors)
an, cn = a / np.linalg.norm(a), c / np.linalg.norm(c)
print("normalised dot =", round(float(an @ cn), 3))
```

:::tip Which metric?
Cosine similarity, dot product on unit-length vectors, and Euclidean distance on unit-length vectors all give the **same ranking**. Use whichever your model's documentation recommends. If vectors are not normalised, dot product also rewards larger length, which some models intentionally use.
:::

## Explore a tiny embedding space

Click a word to see its nearest neighbours, and try the analogy mode (a − b + c).

```viz algo=embedding title="A toy word space"
```

## The famous trick: vector arithmetic

Learned embeddings contain directions that correspond to concepts. The classic example from word2vec ([paper](https://arxiv.org/abs/1301.3781)): `king − man + woman ≈ queen`. Here it is with a hand-built toy space where the first axis is "royalty", the second "gender", the third "is a person".

```python run title="king - man + woman" level=easy
import numpy as np

#                royal  male  person  animal
words = {
    "king":   [1.0,  1.0,  1.0, 0.0],
    "queen":  [1.0, -1.0,  1.0, 0.0],
    "man":    [0.0,  1.0,  1.0, 0.0],
    "woman":  [0.0, -1.0,  1.0, 0.0],
    "prince": [0.8,  1.0,  1.0, 0.0],
    "dog":    [0.0,  0.2,  0.0, 1.0],
    "puppy":  [0.0,  0.2,  0.0, 0.9],
}
V = {w: np.array(v) for w, v in words.items()}

def nearest(vec, exclude=(), k=3):
    sims = {w: float(vec @ x / (np.linalg.norm(vec) * np.linalg.norm(x))) for w, x in V.items() if w not in exclude}
    return sorted(sims.items(), key=lambda kv: -kv[1])[:k]

target = V["king"] - V["man"] + V["woman"]
print("king - man + woman ->", nearest(target, exclude={"king", "man", "woman"}))
print("nearest to dog     ->", nearest(V["dog"], exclude={"dog"}, k=2))
```

Real embeddings are learned, not hand-built, and the analogies work only approximately and for some relationships. But the lesson is deep: **meaning has directions.**

## Static versus contextual embeddings

| | Static (word2vec, GloVe) | Contextual (inside a Transformer) |
|---|---|---|
| One vector per | word type | token **in this context** |
| "bank" in "river bank" vs "bank loan" | same vector | different vectors |
| Where | a lookup table | the output of each Transformer layer |

Sentence-embedding models ([Sentence-BERT](https://arxiv.org/abs/1908.10084) and its successors) are Transformers trained with a **contrastive** objective: pull the vectors of matching pairs (question ↔ answer, paraphrases) together and push non-matching pairs apart. At the end, the text is pooled into **one vector**.

## Build a working text embedder (no neural network)

You can get a surprisingly useful embedder by hashing character n-grams into a fixed-size vector. It captures spelling overlap, not deep meaning, but it needs no model download and it is what we will use for runnable search and RAG demos in the browser.

```python run title="A hashed n-gram embedder and semantic-ish search" level=intermediate
import numpy as np, re, zlib

DIM = 256

def embed(text, n=3):
    """Hash word-bounded character n-grams into a unit vector."""
    v = np.zeros(DIM)
    for word in re.findall(r"[a-z0-9]+", text.lower()):
        w = f"<{word}>"
        for i in range(len(w) - n + 1):
            gram = w[i:i + n]
            h = zlib.crc32(gram.encode())            # stable hash (Python's hash() changes per run)
            v[h % DIM] += 1.0 if (h >> 8) & 1 else -1.0   # signed hashing reduces collision bias
    norm = np.linalg.norm(v)
    return v / norm if norm else v

docs = [
    "How do I reset my password?",
    "Steps to change your account password",
    "Our refund policy lasts 30 days",
    "Shipping takes three to five business days",
    "Delete my account permanently",
]
E = np.stack([embed(d) for d in docs])

for q in ["forgot my password", "refunds after 30 days", "how many business days is shipping", "money back guarantee"]:
    sims = E @ embed(q)
    best = int(sims.argmax())
    print(f"{q!r:26} -> {docs[best]!r}  (cos={sims[best]:.2f})")
```

It finds matches through shared letters ("password", "refund", "days"), but "money back guarantee" cannot find "refund policy" (look at its tiny score): **that** needs a learned model that knows the two phrases mean the same thing. That gap is exactly what neural embeddings close.

## Calling a real embedding model

```python local title="Get real embeddings (run on your machine)"
# pip install sentence-transformers   (open-source, runs locally on CPU)
from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer("all-MiniLM-L6-v2")            # 384-dim, small and fast
docs = ["Refunds are issued within 30 days.", "Shipping takes 3-5 days.", "Reset your password in Settings."]
E = model.encode(docs, normalize_embeddings=True)           # unit vectors
q = model.encode(["money back guarantee"], normalize_embeddings=True)[0]
scores = E @ q
print(docs[int(np.argmax(scores))], scores.round(2))
```

Hosted embedding APIs (OpenAI, Voyage, Cohere, Google and others) work the same way: send text, receive vectors. Anthropic recommends Voyage AI models for embeddings alongside Claude. Choose a model with the [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard) as a starting point, then **test on your own data**.

## Practical knobs

- **Dimension.** Bigger vectors capture more but cost more memory and search time. **Matryoshka** embeddings ([paper](https://arxiv.org/abs/2205.13147)) let you truncate to fewer dimensions with graceful quality loss.
- **Asymmetry.** Many models expect a prefix such as `query:` vs `passage:` or separate query/document modes. Using the wrong mode quietly hurts quality.
- **Max input length.** Text beyond the limit is truncated silently. This is why we **chunk** documents (RAG lessons).
- **Never mix models.** Vectors from different models live in different spaces. If you change the embedding model you must **re-embed everything**.
- **Domain shift.** A general model may be weak on legal, medical or code text; evaluate and consider a domain model or fine-tuning.

```quiz
? What does an embedding approximate?
- The grammar of a sentence
+ Meaning, by placing similar items close together in vector space
- The number of tokens in a text
> The geometry (distance or angle) approximates semantic similarity.

? Two vectors point in the same direction but one is 10× longer. What is their cosine similarity?
- 10
- 0
+ 1
> Cosine ignores length and measures only the angle.

? You switch your RAG system to a different embedding model. What must you do?
- Nothing, vectors are interchangeable
+ Re-embed all documents, because different models use different vector spaces
- Only re-embed the queries
> Mixing models makes similarity scores meaningless.

? Which is a contextual embedding?
- A word2vec lookup table
+ The vector for "bank" produced by a Transformer layer when it reads "river bank"
- A one-hot vector
> Contextual embeddings depend on surrounding tokens.
```

:::problem You search "money back guarantee" but the document says "refund policy". Which retrieval method finds it, and why? {level=easy tags="embeddings,retrieval"}
Compare keyword search with embedding search.

:::solution Model answer
Keyword search (BM25) needs shared words and finds nothing. **Embedding search** maps both phrases near each other because the model learned they are used in similar contexts. In production you usually combine both (**hybrid search**) because keyword search is better at exact identifiers (SKU codes, error numbers) and embeddings at paraphrase.
:::
:::

:::keypoints
- An embedding is a vector whose geometry encodes meaning; cosine similarity (angle) is the standard measure.
- Normalise vectors and cosine = dot product; rankings of cosine, dot (unit) and Euclidean (unit) agree.
- Static embeddings give one vector per word; contextual embeddings depend on the sentence.
- Sentence-embedding models are trained contrastively, then pooled into one vector.
- Never mix embedding models, mind max length and query/document modes, and always test on your own data.
:::

:::resources
- [The Illustrated Word2vec (Jay Alammar)](https://jalammar.github.io/illustrated-word2vec/) — the clearest visual intro.
- [Sentence-Transformers docs](https://www.sbert.net) — the standard library for open embedding models.
- [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — compare embedding models on many tasks.
- [Efficient Estimation of Word Representations (word2vec)](https://arxiv.org/abs/1301.3781) and [Sentence-BERT](https://arxiv.org/abs/1908.10084) — the two key papers.
- [Matryoshka Representation Learning](https://arxiv.org/abs/2205.13147) — flexible-dimension embeddings.
- [OpenAI embeddings guide](https://platform.openai.com/docs/guides/embeddings) — practical API patterns that apply to any provider.
:::
