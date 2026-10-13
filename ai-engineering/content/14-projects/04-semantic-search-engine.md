---
title: Build a Hybrid Search Engine
level: intermediate
time: 55
icon: search
cover: #14b8a6,#6366f1
tags: search, bm25, embeddings, hybrid, evaluation
summary: Build keyword search (BM25), a typo-tolerant vector search (hashed character n-gram embeddings) and a hybrid of both with reciprocal rank fusion, evaluate them on labelled queries by category, and see exactly where lexical methods stop working and a neural embedding model must take over.
---

Search is the heart of RAG: a language model can only use what retrieval puts in front of it. Real systems combine **keyword search** (exact terms, identifiers) with **vector search** (meaning, variants) and merge the results. In this project you build every part with NumPy and measure each one, including the queries that **all** of them get wrong.

**What you'll build:** a small `SearchEngine` with pluggable retrievers, metadata filters, rank fusion and an evaluation report.

:::flow The pipeline
Documents | help-centre articles
Tokenize | lowercase words, drop stop words
BM25 | exact term matching, ranked
Embeddings | hashed character n-grams
Fuse | reciprocal rank fusion
Evaluate | recall and MRR by query type
:::

## Step 1 — Documents and tokenisation

```python run shared title="Step 1 · a small knowledge base"
import re, math, zlib
import numpy as np
from collections import Counter

DOCS = {
    "a1": ("accounts", "To reset your password, open the sign in page and choose Forgot password. We email a link to your registered address."),
    "a2": ("accounts", "If you cannot log in, check that caps lock is off, then reset your credentials from the account recovery page."),
    "a3": ("accounts", "Enable two-factor authentication in Security settings to protect your account with a code from an authenticator app."),
    "a4": ("accounts", "To change your email address, go to Profile, enter the new address and confirm the link we send you."),
    "a5": ("accounts", "You can delete your account permanently from Privacy settings. Your personal data is erased within 30 days."),
    "a6": ("accounts", "Locked out after too many failed sign in attempts? Wait fifteen minutes or contact support to unlock your account."),
    "b1": ("billing", "Invoices are emailed on the first of every month and can be downloaded as PDF from the Billing page."),
    "b2": ("billing", "To update your credit card, open Billing, choose Payment methods and add a new card. The old card is removed automatically."),
    "b3": ("billing", "You can cancel your subscription at any time. Access continues until the end of the paid period and no refund is given for partial months."),
    "b4": ("billing", "Refunds for annual plans are available within 14 days of purchase. Contact support with your order number."),
    "b5": ("billing", "If a payment fails we retry three times over a week and then pause your plan. Update your card to resume service."),
    "b6": ("billing", "Switching from the monthly plan to the yearly plan gives a discount of two months. The change takes effect at the next renewal."),
    "s1": ("shipping", "Standard delivery takes three to five working days. Express delivery arrives the next working day for orders before noon."),
    "s2": ("shipping", "Track your parcel with the tracking number in your dispatch email. The status updates every few hours."),
    "s3": ("shipping", "If your package has not arrived after ten days, contact us and we will start an investigation with the courier."),
    "s4": ("shipping", "We ship to most countries. International orders may be charged customs duties and taxes by the destination country."),
    "s5": ("shipping", "To return an item, print the prepaid label from your order page and drop the parcel at any collection point within 30 days."),
    "s6": ("shipping", "Damaged on arrival? Send a photo of the box and the product and we will ship a replacement free of charge."),
    "t1": ("api", "The API returns error 429 when you exceed the rate limit. Wait for the retry-after header before sending the next request."),
    "t2": ("api", "Error 401 means the API key is missing or invalid. Generate a new key in Developer settings and send it in the Authorization header."),
    "t3": ("api", "Webhooks send a POST request to your endpoint when an event occurs. Verify the signature header to confirm the sender."),
    "t4": ("api", "Responses are paginated. Use the next_cursor field to fetch the following page of results."),
    "t5": ("api", "The SDK supports Python and JavaScript. Install it with pip or npm and initialise the client with your API key."),
    "t6": ("api", "Timeouts of 504 are usually temporary. Retry with exponential backoff and keep requests idempotent."),
    "p1": ("product", "Dark mode can be turned on under Appearance settings and follows your system theme by default."),
    "p2": ("product", "Export your data as CSV or JSON from the Data page. Large exports are emailed as a download link."),
    "p3": ("product", "The mobile app is available for iOS and Android and syncs automatically with your desktop account."),
    "p4": ("product", "Team plans let you invite colleagues, assign roles and share projects with fine grained permissions."),
    "p5": ("product", "Use keyboard shortcuts to work faster: press question mark anywhere to see the full list."),
    "p6": ("product", "Notifications can be customised per project. Choose email, push, or none for each type of event."),
}
STOP = set("a an the to of and or in on for with is are be it your you we our can if at by from this that as when then".split())

def tokenize(text):
    return [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP]

ids = list(DOCS)
doc_tokens = {i: tokenize(DOCS[i][1]) for i in ids}
print(len(ids), "documents,", sum(len(t) for t in doc_tokens.values()), "tokens after stop-word removal")
print("a1 ->", doc_tokens["a1"])
```

## Step 2 — Keyword search with BM25

**BM25** scores a document for a query by summing, over query words, how **rare** the word is (idf) times how often it appears in the document (tf), with two safeguards: repeated words have **diminishing returns**, and long documents are **normalised**.

:::formula
score(q, d) = Σ over query words w of  idf(w) · tf · (k1 + 1) / ( tf + k1 · (1 − b + b · |d| / avgdl) )
:::

```python run shared title="Step 2 · BM25 from scratch"
N = len(ids)
df = Counter(w for t in doc_tokens.values() for w in set(t))
avgdl = sum(len(t) for t in doc_tokens.values()) / N

def bm25(query, k1=1.5, b=0.75):
    scores = np.zeros(N)
    for w in tokenize(query):
        if w not in df: continue                                          # unseen words contribute nothing
        idf = math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5))
        for n, i in enumerate(ids):
            tf = doc_tokens[i].count(w)
            scores[n] += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * len(doc_tokens[i]) / avgdl))
    return scores

def show(scores, k=3):
    top = np.argsort(-scores)[:k]
    return [(ids[j], round(float(scores[j]), 2)) for j in top if scores[j] > 0]

print("'error 429 rate limit'  ->", show(bm25("error 429 rate limit")))
print("'reset password'        ->", show(bm25("reset password")))
print("'pasword reset'  (typo) ->", show(bm25("pasword reset")))
print("'get my money back'     ->", show(bm25("get my money back")))
```

BM25 is superb at **exact terms** (`429`), and blind to **spelling variants** and **synonyms**: the typo only matched through the word "reset", and "money back" matches nothing at all, although document `b4` is about refunds.

## Step 3 — Vector search with hashed character n-grams

An **embedding** turns text into a vector so that similar texts are close. Neural embedding models are best, but they need a model download. Here is a classic, dependency-free alternative that already fixes typos and word forms: represent each word by its **character 3-, 4- and 5-grams**, hash them into a fixed-size vector, weight by rarity and compare with **cosine similarity**.

```python run shared title="Step 3 · character n-gram embeddings"
DIM = 1024

def ngrams(text, sizes=(3, 4, 5)):
    grams = []
    for w in tokenize(text) or ["x"]:
        w = f" {w} "                                                      # spaces mark the word boundaries
        for k in sizes:
            grams += [w[i:i + k] for i in range(max(len(w) - k + 1, 1))]
    return grams

def hash_vector(text):
    v = np.zeros(DIM)
    for g in ngrams(text):
        v[zlib.crc32(g.encode()) % DIM] += 1                              # crc32 is stable across runs (unlike hash())
    return v

raw = np.stack([hash_vector(DOCS[i][1]) for i in ids])
idf_vec = np.log((1 + N) / (1 + (raw > 0).sum(0))) + 1                    # rare n-grams count more

def embed(text):
    v = np.log1p(hash_vector(text)) * idf_vec
    n = np.linalg.norm(v)
    return v / n if n else v

doc_vecs = np.stack([embed(DOCS[i][1]) for i in ids])
def char_search(query):
    return doc_vecs @ embed(query)                                        # cosine similarity (all vectors are unit length)

print("'pasword reset'  (typo) ->", show(char_search("pasword reset")))
print("'cancelling subscriptions' ->", show(char_search("cancelling subscriptions")))
print("'get my money back'     ->", show(char_search("get my money back")))
```

Typos and word forms are now handled, because "pasword" and "password" share most of their n-grams. "Money back" still misses: **no overlap of letters means no similarity**. Only a model that has learned meaning from huge amounts of text can connect "money back" with "refund".

## Step 4 — Hybrid search with reciprocal rank fusion

Scores from different methods live on different scales, so combine **ranks** instead. **Reciprocal rank fusion (RRF)** gives each document 1/(k + rank) from every retriever and sums them; documents ranked high by several retrievers rise to the top, and nothing needs normalising.

```python run shared title="Step 4 · RRF fusion and metadata filters"
def rrf(*scorers, k=60):
    def fused(query):
        total = np.zeros(N)
        for scorer in scorers:
            s = scorer(query)
            for rank, j in enumerate(np.argsort(-s)):
                if s[j] > 0: total[j] += 1 / (k + rank + 1)
        return total
    return fused

hybrid = rrf(bm25, char_search)

def search(query, scorer=hybrid, k=3, topic=None):
    scores = scorer(query).copy()
    if topic:                                                              # metadata filter: remove other topics before ranking
        scores[[n for n, i in enumerate(ids) if DOCS[i][0] != topic]] = 0
    return [(ids[j], DOCS[ids[j]][1][:60] + "...") for j in np.argsort(-scores)[:k] if scores[j] > 0]

for hit in search("where do I find the email"): print(hit)
print("--- same query, filtered to billing ---")
for hit in search("where do I find the email", topic="billing"): print(hit)
```

## Step 5 — Evaluate by query type

Never trust a search system you have not measured. We label 16 queries with the documents that answer them and group them by what makes them hard, then compute **recall@3** (did the right document appear in the top three?) and **MRR** (how high was the first right document?).

```python run shared title="Step 5 · evaluation"
QUERIES = [
    # exact terms
    ("error 429 rate limit", {"t1"}, "exact"), ("ERR 429", {"t1"}, "exact"), ("authorization header api key", {"t2", "t5"}, "exact"),
    ("two-factor authentication", {"a3"}, "exact"), ("webhook signature", {"t3"}, "exact"),
    # typos and word forms
    ("pasword reset", {"a1", "a2"}, "typo/form"), ("cancelling subscriptions", {"b3"}, "typo/form"), ("refunded annual plan", {"b4"}, "typo/form"),
    ("tracing my parcell", {"s2"}, "typo/form"), ("notificatons per project", {"p6"}, "typo/form"), ("paginated results cursor", {"t4"}, "typo/form"),
    # pure paraphrase: no shared words with the answer
    ("get my money back", {"b4", "b3"}, "paraphrase"), ("I can't remember how to get in", {"a1", "a2"}, "paraphrase"),
    ("item came smashed", {"s6"}, "paraphrase"), ("add my teammates", {"p4"}, "paraphrase"), ("grab a copy of everything I stored", {"p2"}, "paraphrase"),
]

def evaluate(scorer, queries=QUERIES, k=3):
    by_cat = {}
    for q, relevant, cat in queries:
        order = [ids[j] for j in np.argsort(-scorer(q))]
        recall = len(set(order[:k]) & relevant) / len(relevant)
        rr = next((1 / (n + 1) for n, d in enumerate(order) if d in relevant), 0.0)
        by_cat.setdefault(cat, []).append((recall, rr))
    by_cat["ALL"] = [x for v in list(by_cat.values()) for x in v]
    return {c: (np.mean([r for r, _ in v]), np.mean([m for _, m in v])) for c, v in by_cat.items()}

systems = {"BM25": bm25, "char n-gram": char_search, "hybrid (RRF)": hybrid}
results = {name: evaluate(fn) for name, fn in systems.items()}
cats = ["exact", "typo/form", "paraphrase", "ALL"]
print(f"{'recall@3 / MRR':16}" + "".join(f"{c:>16}" for c in cats))
for name, res in results.items():
    print(f"{name:16}" + "".join(f"{res[c][0]:>9.2f} /{res[c][1]:>5.2f}" for c in cats))
```

The pattern to remember:

- **Exact terms**: every method is fine; BM25 never misses an identifier.
- **Typos and word forms**: BM25 falls behind; character n-grams recover them, and the hybrid keeps the gain.
- **Paraphrases**: everything collapses. This is the gap that **neural embedding models** exist to close, and it is why production systems use hybrid search with a learned embedder.

## Step 6 — Package it, and plug in a real embedding model

```python run shared title="Step 6 · the SearchEngine class"
class SearchEngine:
    def __init__(self, docs):
        self.ids = list(docs); self.docs = docs
        self.retrievers = {}
    def add_retriever(self, name, fn):
        self.retrievers[name] = fn                                     # fn(query) -> one score per document, in self.ids order
    def search(self, query, k=3, topic=None, use=None):
        names = use or list(self.retrievers)
        fused = np.zeros(len(self.ids))
        for name in names:
            s = self.retrievers[name](query)
            for rank, j in enumerate(np.argsort(-s)):
                if s[j] > 0: fused[j] += 1 / (60 + rank + 1)
        if topic:
            for n, i in enumerate(self.ids):
                if self.docs[i][0] != topic: fused[n] = 0
        return [(self.ids[j], round(float(fused[j]), 4)) for j in np.argsort(-fused)[:k] if fused[j] > 0]

engine = SearchEngine(DOCS)
engine.add_retriever("bm25", bm25)
engine.add_retriever("char", char_search)
print(engine.search("where do I download my invoices"))
print(engine.search("rate limit exceeded", use=["bm25"]), "<- BM25 only")
```

To close the paraphrase gap, add a **neural retriever** behind the same interface. This needs a model download, so it is shown for your own machine:

```python local
# pip install sentence-transformers
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("BAAI/bge-small-en-v1.5")                       # a small open embedding model
doc_matrix = model.encode([DOCS[i][1] for i in ids], normalize_embeddings=True)

def dense(query):
    return doc_matrix @ model.encode(query, normalize_embeddings=True)       # cosine similarity

engine.add_retriever("dense", dense)
print(evaluate(dense)["paraphrase"])      # compare with the paraphrase column above, then evaluate the three-way hybrid
```

Because every retriever is just `query -> scores`, the evaluation code does not change. That is the point: **change one component, rerun the same eval, read the table.**

## How it works

| Piece | Purpose | Weakness |
|---|---|---|
| BM25 | exact term matching, interpretable, fast | no synonyms, no typo tolerance |
| Hashed n-gram vectors | tolerates typos and word forms without a model | no real meaning |
| Neural embeddings (local snippet) | match meaning and paraphrases | model cost, can miss exact IDs |
| RRF fusion | combines rankings without normalising scores | needs at least two good retrievers |
| Metadata filter | restrict to a topic, tenant or date before ranking | filters must be enforced in code |
| Evaluation by category | shows where each method wins and loses | needs labelled queries |

:::exercise Extend it
1. Add a **stemmer** (strip `ing`, `ed`, `s`) to the BM25 tokenizer and re-run the evaluation. How much of the typo/form gap does it close?
2. Add a **reranker**: take the top 5 hybrid results and re-score them with word overlap plus a bonus for title matches.
3. Write 10 more queries of your own, including negatives (queries with no good answer), and check what the engine returns for them.
4. Implement **MMR** (maximal marginal relevance) to diversify the top-k results.
5. Add `filter_fn` support so a caller can pass any metadata predicate, not just a topic.
:::

:::keypoints
- BM25 wins on exact terms and identifiers; it cannot see synonyms or typos.
- Vector search matches by similarity: character n-gram hashing handles typos and word forms, neural embeddings handle meaning.
- Reciprocal rank fusion merges rankings from different retrievers without normalising scores.
- Evaluate by query category with recall@k and MRR; averages hide the failure modes.
- Keep every retriever behind the same `query -> scores` interface so you can swap components and re-run the same eval.
:::
