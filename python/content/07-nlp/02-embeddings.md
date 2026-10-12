---
title: Embeddings & Semantic Similarity
level: intermediate
time: 32
summary: Turn words and sentences into vectors that capture meaning. From one-hot and TF-IDF to learned embeddings — trained from scratch right here — and sentence embeddings for semantic search and RAG.
---

An **embedding** is a list of numbers that represents the meaning of something — a word, a sentence, an image. Texts with similar meanings get vectors that point in similar directions. Embeddings power semantic search, RAG, recommendations, clustering, deduplication and classification.

:::def Embedding
A dense vector (e.g. 384 or 1024 numbers) that represents an item's meaning, learned so that **similar items are close together** in the vector space.
:::

:::analogy
Imagine a map where every sentence is a city. "How do I reset my password?" and "I forgot my login" are neighbouring towns; "Best pizza in Naples" is on another continent. An embedding model is the **map-maker**; cosine similarity measures the **distance** between cities.
:::

## Step 1: one-hot vectors (and why they fail)

```python run level=easy
import numpy as np

vocab = ["cat", "dog", "car", "truck"]
one_hot = np.eye(len(vocab))
for w, v in zip(vocab, one_hot):
    print(f"{w:<6} {v}")

cos = lambda a, b: a @ b / (np.linalg.norm(a) * np.linalg.norm(b))
print("similarity(cat, dog)  =", cos(one_hot[0], one_hot[1]))
print("similarity(cat, truck)=", cos(one_hot[0], one_hot[3]))
```

Every word is equally different from every other word. "Cat" is no closer to "dog" than to "truck". We need vectors that **know** meaning.

## Step 2: counting — bag of words and TF-IDF

:::def Bag of words
Represent a document by **how many times each word appears**, ignoring order. Simple and surprisingly useful for search and classification.
:::

```python run level=intermediate
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import pandas as pd

docs = ["the cat chased the mouse",
        "a dog chased a cat",
        "stock prices rose sharply today",
        "the market fell as prices dropped"]

bow = CountVectorizer().fit(docs)
print(pd.DataFrame(bow.transform(docs).toarray(), columns=bow.get_feature_names_out()))

tfidf = TfidfVectorizer().fit_transform(docs)
print("\nTF-IDF cosine similarity between documents:")
print(pd.DataFrame(cosine_similarity(tfidf).round(2), index=["cat-mouse", "dog-cat", "stocks", "market"], columns=["d0", "d1", "d2", "d3"]))
```

TF-IDF finds documents sharing **the same words**. But "car" and "automobile" share no letters — so TF-IDF thinks they're unrelated. **Learned** embeddings fix that.

:::def Lexical vs semantic search
**Lexical** (keyword) search matches the same words (TF-IDF, BM25). **Semantic** search matches the same *meaning* using embeddings. Modern RAG systems often combine both ("hybrid search").
:::

## Step 3: learning embeddings from context

> "You shall know a word by the company it keeps." — J.R. Firth (1957)

:::def Distributional hypothesis
Words that appear in similar contexts tend to have similar meanings. "Coffee" and "tea" both appear near "drink", "cup", "hot", "morning" — so their embeddings end up close.
:::

Here we learn real word embeddings from a small corpus by counting co-occurrences and compressing them with SVD — a classic technique closely related to word2vec and GloVe.

```python run level=advanced
import numpy as np
from collections import Counter

corpus = """
i drink coffee every morning . i drink tea every morning . she drinks hot coffee .
he drinks hot tea . coffee and tea are drinks . i drive my car to work . she drives a car .
he drives a truck . a truck and a car are vehicles . the car needs fuel . the truck needs fuel .
the cat sleeps on the sofa . the dog sleeps on the floor . a cat and a dog are pets .
my dog likes to play . my cat likes to play . i feed the dog . i feed the cat .
""" * 5
tokens = corpus.split()
vocab = sorted(set(tokens))
idx = {w: i for i, w in enumerate(vocab)}

window = 2
co = np.zeros((len(vocab), len(vocab)))
for i, w in enumerate(tokens):
    for j in range(max(0, i - window), min(len(tokens), i + window + 1)):
        if i != j:
            co[idx[w], idx[tokens[j]]] += 1

# PPMI: how much more often two words co-occur than chance would predict
total = co.sum()
p_w = co.sum(1, keepdims=True) / total
p_c = co.sum(0, keepdims=True) / total
with np.errstate(divide="ignore"):
    ppmi = np.maximum(np.log((co / total) / (p_w * p_c)), 0)

U, S, _ = np.linalg.svd(ppmi)
emb = U[:, :8] * S[:8]                                  # 8-dimensional word embeddings
emb /= np.linalg.norm(emb, axis=1, keepdims=True)

def neighbours(word, k=3):
    sims = emb @ emb[idx[word]]
    return [(vocab[i], round(float(sims[i]), 2)) for i in np.argsort(-sims) if vocab[i] != word][:k]

for w in ["coffee", "car", "dog", "drives"]:
    print(f"{w:<7} → {neighbours(w)}")
```

Nobody told the model that coffee and tea are related, or that car and truck are — it learned it from **context alone**. Modern models do the same thing with neural networks and billions of sentences.

## Word2vec and the famous analogies

:::def Word2vec
A 2013 method that trains a small neural network to predict a word from its neighbours (or vice versa). The learned weights are excellent word embeddings, famous for analogies like `king − man + woman ≈ queen`.
:::

Static word embeddings have a limit: **one vector per word**, so "bank" (river) and "bank" (money) share a vector. Transformer models produce **contextual** embeddings — a different vector for "bank" depending on the sentence.

## Sentence embeddings

For search and RAG you embed **whole sentences or passages**. Embedding models (Transformers trained so that similar texts land close together) output one vector per text.

```python local title="Sentence embeddings with sentence-transformers"
from sentence_transformers import SentenceTransformer     # pip install sentence-transformers

model = SentenceTransformer("all-MiniLM-L6-v2")           # small, fast, 384 dimensions
sentences = ["How do I reset my password?", "I forgot my login details", "Best pizza in Naples"]
emb = model.encode(sentences, normalize_embeddings=True)
print(emb.shape)                        # (3, 384)
print((emb @ emb.T).round(2))           # cosine similarities
```

```output
(3, 384)
[[1.   0.62 0.03]
 [0.62 1.   0.05]
 [0.03 0.05 1.  ]]
```

Hosted embedding APIs (for example **Voyage AI**, which Anthropic recommends for use with Claude, or OpenAI and Cohere embeddings) work the same way: send texts, get vectors back.

```python local title="Embedding API (Voyage AI)"
import voyageai                          # pip install voyageai ; needs VOYAGE_API_KEY

vo = voyageai.Client()
docs = vo.embed(["Claude is an AI assistant.", "Paris is in France."], model="voyage-4", input_type="document").embeddings
query = vo.embed(["Who makes Claude?"], model="voyage-4", input_type="query").embeddings[0]
print(len(docs[0]))                       # vector size
```

:::tip query vs document embeddings
Many embedding models want you to say whether a text is a **query** or a **document** (`input_type`). Questions and answers look different; the model handles them better when it knows which is which.
:::

## Semantic search vs keyword search

Here is the full idea of semantic search — runnable in the browser. A real neural embedding model is too big to download into this page, so we use a **toy embedding model**: a small table saying which words share meaning. A real model **learns** this kind of mapping from billions of sentences; the search code around it is exactly what you would write in production.

```python run level=advanced
import re
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

docs = [
    "To reset your password, open Settings and click 'Forgot password'.",
    "You can change your login credentials from the account security page.",
    "Invoices are emailed on the first day of every month.",
    "Refunds are processed within five business days.",
    "Export your data as CSV from the Reports tab.",
    "Our API rate limit is 100 requests per minute.",
]

# --- a toy "embedding model": words -> meaning dimensions (a real model learns this) ---
DIMS = ["access", "money", "data", "time", "limits"]
MEANING = {
    "password": {"access": 1}, "login": {"access": 1}, "log": {"access": 1}, "credentials": {"access": 1},
    "account": {"access": 0.7}, "sign": {"access": 0.8}, "reset": {"access": 0.5}, "forgot": {"access": 0.5},
    "invoices": {"money": 1}, "refunds": {"money": 1}, "money": {"money": 1}, "charged": {"money": 1},
    "billing": {"money": 1}, "paid": {"money": 1}, "back": {"money": 0.3},
    "export": {"data": 1}, "download": {"data": 1}, "csv": {"data": 1}, "reports": {"data": 0.8}, "data": {"data": 1},
    "days": {"time": 1}, "month": {"time": 1}, "when": {"time": 0.6}, "minute": {"time": 0.4, "limits": 0.4},
    "rate": {"limits": 1}, "limit": {"limits": 1}, "requests": {"limits": 0.6}, "many": {"limits": 0.5},
}

def embed(text: str) -> np.ndarray:
    v = np.zeros(len(DIMS))
    for word in re.findall(r"[a-z]+", text.lower()):
        for dim, weight in MEANING.get(word, {}).items():
            v[DIMS.index(dim)] += weight
    norm = np.linalg.norm(v)
    return v / norm if norm else v

doc_vecs = np.array([embed(d) for d in docs])            # embed every document once
tfidf = TfidfVectorizer(stop_words="english").fit(docs)
doc_tfidf = tfidf.transform(docs)

def show(query, k=2):
    sem = doc_vecs @ embed(query)                         # cosine similarity (unit vectors)
    lex = (doc_tfidf @ tfidf.transform([query]).T).toarray().ravel()
    print(f"\nQuery: {query!r}")
    for name, scores in [("semantic", sem), ("keyword ", lex)]:
        best = np.argsort(-scores)[:k]
        hits = " | ".join(f"{scores[i]:.2f} {docs[i][:38]}…" for i in best)
        print(f"  {name}: {hits}")

show("I can't sign in to my account")
show("when do I get my money back")
show("download my reports")
show("how many requests can I make?")
```

Notice the **keyword** search scoring 0.00 on "when do I get my money back" — the document says "Refunds", which shares no words with the query. The **semantic** search finds it because "money" and "refunds" share a meaning dimension. That gap is exactly why RAG systems use embeddings — and why many add keyword search too (**hybrid search**) to catch exact names, codes and IDs that embeddings can blur.

:::ai Embeddings everywhere
| Use | How |
|---|---|
| **RAG retrieval** | embed chunks once; embed the question; take the nearest chunks |
| **Semantic caching** | if a new question's embedding is very close to an old one, reuse the answer |
| **Classification** | train logistic regression on embeddings |
| **Clustering / topic discovery** | K-means on embeddings |
| **Deduplication** | near-identical embeddings = near-duplicate texts |
| **Recommendations** | find items near what a user liked |
:::

## Practical embedding tips

- **Normalize** vectors and use **cosine similarity** (or dot product on unit vectors).
- Use the **same model** for documents and queries — vectors from different models are not comparable.
- Store vectors as **float32** (or quantized) to save memory; dimensions of 256–1024 are typical.
- **Chunk** long documents before embedding (one vector can't hold a whole book).
- Re-embed everything if you switch embedding models.

## Check yourself

```quiz
? Why are one-hot vectors bad embeddings?
+ Every word is equally far from every other word, so they carry no meaning
- They are too short
- They can't be stored in NumPy
> All pairs have cosine similarity 0.

? What is the distributional hypothesis?
+ Words in similar contexts tend to have similar meanings
- Words are distributed uniformly in text
- Embeddings must be normally distributed
> It's the principle behind word2vec, GloVe and LLM embeddings.

? What advantage do contextual embeddings (from Transformers) have over word2vec?
+ The same word gets different vectors in different contexts ("river bank" vs "bank account")
- They are smaller
- They don't need training
> Static embeddings have one vector per word, regardless of context.

? Lexical search would MISS which match?
+ query "automobile" vs document "car"
- query "car" vs document "car"
- query "red car" vs document "car"
> No shared words — only semantic search connects synonyms.
```

:::exercise Find the duplicates
Using TF-IDF (`TfidfVectorizer`) and `cosine_similarity`, find every pair of sentences below with similarity above 0.5 and print them with their score.

```python
sents = ["How do I cancel my subscription?", "How can I cancel my subscription plan?",
         "What is your refund policy?", "Tell me about refunds and your policy",
         "Where is your office located?"]
```
:::

:::solution
```python run
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

sents = ["How do I cancel my subscription?", "How can I cancel my subscription plan?",
         "What is your refund policy?", "Tell me about refunds and your policy",
         "Where is your office located?"]
sim = cosine_similarity(TfidfVectorizer().fit_transform(sents))
for i in range(len(sents)):
    for j in range(i + 1, len(sents)):
        if sim[i, j] > 0.5:
            print(f"{sim[i, j]:.2f}  {sents[i]!r}  ~  {sents[j]!r}")
```
:::

:::keypoints
- An **embedding** is a vector of meaning; similar texts → nearby vectors (cosine similarity).
- One-hot has no meaning; bag-of-words/TF-IDF match **words**; learned embeddings match **meaning**.
- Embeddings are learned from **context** (distributional hypothesis) — you trained some yourself with co-occurrence + SVD.
- **Sentence embeddings** power semantic search, RAG, clustering, dedup and classification.
- Normalize, use one model for queries and docs, and chunk long texts.
:::
