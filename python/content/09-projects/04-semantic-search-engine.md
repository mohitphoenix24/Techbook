---
title: Hybrid Semantic Search Engine
level: intermediate
time: 55
icon: search
cover: #8b5cf6,#ec4899
tags: search, bm25, embeddings, evaluation
summary: Build a search engine over a knowledge base with BM25 keyword search, LSA "semantic" vectors, Reciprocal Rank Fusion, highlighted snippets, filters — and measure it properly with recall@k and MRR.
---

Search is the backbone of RAG, support bots and documentation sites. In this project you'll build a complete **hybrid search engine** — the kind behind "search our docs" boxes — and, crucially, **evaluate** it with real metrics so you know whether each change helps.

:::flow Search engine architecture
Documents | title, body, category
Index | BM25 + dense vectors
Query | text + optional filter
Retrieve | BM25 list + vector list
Fuse | Reciprocal Rank Fusion
Present | ranked results + snippets
:::

## Step 1 — The knowledge base

```python run shared title="Step 1 · documents"
DOCS = [
    {"id": "acc-1", "category": "account", "title": "Reset your password", "body": "Open Settings, choose Security and click Reset password. We email you a link that expires in 30 minutes."},
    {"id": "acc-2", "category": "account", "title": "Enable two-factor authentication", "body": "Protect your login with an authenticator app. Go to Security and scan the QR code. Backup codes let you sign in if you lose your phone."},
    {"id": "acc-3", "category": "account", "title": "Change your email address", "body": "Update the email used for sign in and notifications from Profile settings. You must confirm the new address."},
    {"id": "acc-4", "category": "account", "title": "Delete your account", "body": "Account deletion is permanent and removes all projects. Export your data first. Deletion completes within 7 days."},
    {"id": "bil-1", "category": "billing", "title": "Refund policy", "body": "Annual plans can be refunded within 14 days of purchase. Monthly plans are not refundable but you can cancel anytime."},
    {"id": "bil-2", "category": "billing", "title": "Update payment method", "body": "Add or replace your credit card in Billing. We accept Visa, Mastercard, Amex and PayPal."},
    {"id": "bil-3", "category": "billing", "title": "Download invoices", "body": "Invoices are generated on each charge. Download PDF invoices from Billing → History, including VAT details."},
    {"id": "bil-4", "category": "billing", "title": "Cancel your subscription", "body": "Cancel from Billing at any time. You keep access until the end of the paid period; no further charges are made."},
    {"id": "dat-1", "category": "data", "title": "Export data to CSV", "body": "Use Reports → Export to download any table as CSV or Excel. Large exports are emailed when ready."},
    {"id": "dat-2", "category": "data", "title": "Import from spreadsheets", "body": "Upload CSV or XLSX files in Import. Map columns to fields; the first row must contain headers."},
    {"id": "dat-3", "category": "data", "title": "Data retention", "body": "We keep deleted items in the trash for 30 days before permanent removal. Backups are retained for 90 days."},
    {"id": "api-1", "category": "developer", "title": "API rate limits", "body": "The REST API allows 100 requests per minute per key. Exceeding the limit returns HTTP 429 with a Retry-After header."},
    {"id": "api-2", "category": "developer", "title": "Create an API key", "body": "Generate keys in Developer settings. Keys are shown once; store them securely and never commit them to git."},
    {"id": "api-3", "category": "developer", "title": "Webhooks", "body": "Webhooks send an HTTP POST to your URL when events happen, such as invoice.paid or project.deleted. Verify the signature header."},
    {"id": "api-4", "category": "developer", "title": "Error code E1042", "body": "E1042 means the request body failed validation. Check required fields and data types in the response details."},
]
print(len(DOCS), "documents in", len({d['category'] for d in DOCS}), "categories")
```

## Step 2 — A tokenizer and the BM25 index

```python run shared title="Step 2 · BM25 index"
import math
import re
from collections import Counter

STOPWORDS = set("a an and are as at be by can for from i in is it my of on or the to we with you your how do what does".split())

def tokenize(text):
    return [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOPWORDS]

class BM25Index:
    def __init__(self, texts, k1=1.4, b=0.75):
        self.k1, self.b = k1, b
        self.docs = [Counter(tokenize(t)) for t in texts]
        self.lengths = [sum(d.values()) for d in self.docs]
        self.avgdl = sum(self.lengths) / len(self.docs)
        df = Counter(term for d in self.docs for term in d)
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def scores(self, query):
        q = tokenize(query)
        out = []
        for tf, dl in zip(self.docs, self.lengths):
            s = 0.0
            for t in q:
                if t in tf:
                    s += self.idf[t] * tf[t] * (self.k1 + 1) / (tf[t] + self.k1 * (1 - self.b + self.b * dl / self.avgdl))
            out.append(s)
        return out

texts = [d["title"] + ". " + d["body"] for d in DOCS]
bm25 = BM25Index(texts)
s = bm25.scores("error E1042")
best = max(range(len(DOCS)), key=s.__getitem__)
print("BM25 best match for 'error E1042':", DOCS[best]["title"], round(s[best], 2))
```

## Step 3 — Dense "semantic" vectors

A real system would use a neural embedding model here. In the browser we use **LSA** (TF-IDF compressed with SVD), which captures some word associations — the interface is identical, so you can swap in real embeddings later.

```python run shared title="Step 3 · dense vector index"
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize

class DenseIndex:
    def __init__(self, texts, dims=12):
        self.tfidf = TfidfVectorizer(sublinear_tf=True, ngram_range=(1, 2), stop_words="english")
        X = self.tfidf.fit_transform(texts)
        self.svd = TruncatedSVD(n_components=dims, random_state=0)
        self.vectors = normalize(self.svd.fit_transform(X))

    def embed(self, query):
        return normalize(self.svd.transform(self.tfidf.transform([query])))[0]

    def scores(self, query):
        return (self.vectors @ self.embed(query)).tolist()

dense = DenseIndex(texts)
s = dense.scores("how do I get my money back")
for i in np.argsort(s)[::-1][:3]:
    print(f"{s[i]:+.2f}  {DOCS[i]['title']}")
```

## Step 4 — Hybrid search with Reciprocal Rank Fusion

```python run shared title="Step 4 · the search engine"
class SearchEngine:
    def __init__(self, docs):
        self.docs = docs
        texts = [d["title"] + ". " + d["body"] for d in docs]
        self.bm25, self.dense = BM25Index(texts), DenseIndex(texts)

    def search(self, query, k=5, mode="hybrid", category=None, rrf_k=60):
        allowed = [i for i, d in enumerate(self.docs) if category is None or d["category"] == category]
        rankings = []
        if mode in ("hybrid", "keyword"):
            s = self.bm25.scores(query)
            rankings.append(sorted((i for i in allowed if s[i] > 0), key=lambda i: -s[i]))
        if mode in ("hybrid", "semantic"):
            s = self.dense.scores(query)
            rankings.append(sorted((i for i in allowed if s[i] > 0.05), key=lambda i: -s[i]))
        fused = Counter()
        for ranking in rankings:
            for rank, i in enumerate(ranking):
                fused[i] += 1 / (rrf_k + rank + 1)
        return [(self.docs[i], round(score, 4)) for i, score in fused.most_common(k)]

engine = SearchEngine(DOCS)
for q in ["forgot my password", "money back on yearly plan", "429 too many requests", "E1042"]:
    print(f"\n🔎 {q}")
    for doc, score in engine.search(q, k=3):
        print(f"   {score:.4f}  [{doc['category']}] {doc['title']}")
```

## Step 5 — Snippets with highlighted terms

```python run shared title="Step 5 · result snippets"
def snippet(text, query, width=90):
    terms = set(tokenize(query))
    words = text.split()
    hits = [i for i, w in enumerate(words) if re.sub(r"\W", "", w.lower()) in terms]
    start = max(0, (hits[0] if hits else 0) - 4)
    piece = words[start:start + width // 6]
    marked = [f"**{w}**" if re.sub(r"\W", "", w.lower()) in terms else w for w in piece]
    return ("… " if start else "") + " ".join(marked) + (" …" if start + len(piece) < len(words) else "")

def show(query, **kwargs):
    print(f"\n🔎 {query!r} {kwargs or ''}")
    for rank, (doc, score) in enumerate(engine.search(query, **kwargs), 1):
        print(f" {rank}. {doc['title']}  [{doc['id']}]\n    {snippet(doc['body'], query)}")

show("export reports to excel", k=2)
show("delete", k=3, category="account")
```

## Step 6 — Evaluate: recall@k and MRR

Without evaluation, you can't tell if a change helps. We write test queries **in users' words** (deliberately not copying the document wording), each with the id of the right document.

```python run shared title="Step 6 · evaluation harness"
TEST_QUERIES = [
    ("I forgot my password", "acc-1"),
    ("set up 2FA with an authenticator", "acc-2"),
    ("what does E1042 mean", "api-4"),
    ("too many requests error 429", "api-1"),
    ("download my table as a spreadsheet", "dat-1"),
    ("upload an excel file", "dat-2"),
    # harder: real users rarely use the document's words
    ("money back on my yearly plan", "bil-1"),
    ("quit paying every month", "bil-4"),
    ("get a receipt for my taxes", "bil-3"),
    ("I lost my phone and can't get in", "acc-2"),
    ("close my profile forever", "acc-4"),
    ("my secret token leaked on github", "api-2"),
]

def evaluate(mode, k=3):
    hits, rr = 0, 0.0
    for query, gold in TEST_QUERIES:
        ids = [d["id"] for d, _ in engine.search(query, k=10, mode=mode)]
        hits += gold in ids[:k]
        rr += 1 / (ids.index(gold) + 1) if gold in ids else 0
    return hits / len(TEST_QUERIES), rr / len(TEST_QUERIES)

print(f"{'mode':<10}{'recall@1':>10}{'recall@3':>10}{'MRR':>8}")
for mode in ["keyword", "semantic", "hybrid"]:
    r1, _ = evaluate(mode, k=1)
    r3, mrr = evaluate(mode, k=3)
    print(f"{mode:<10}{r1:>10.2f}{r3:>10.2f}{mrr:>8.2f}")
```

## Step 7 — Find and fix failures

The failures are all **paraphrases**: the user's words ("money back", "yearly", "github") never appear in the documents. Our toy dense index only knows the vocabulary of these 15 documents, so it can't bridge the gap — a real embedding model trained on billions of sentences knows that "money back" ≈ "refund". Here we fix it the classic way, with **query expansion**:

```python run shared title="Step 7 · failure analysis + query expansion"
def failures(mode="hybrid"):
    out = []
    for query, gold in TEST_QUERIES:
        ids = [d["id"] for d, _ in engine.search(query, k=3, mode=mode)]
        if gold not in ids:
            out.append((query, gold, ids))
    return out

for q, gold, got in failures():
    print(f"✗ {q!r}: wanted {gold}, got {got}")

# A simple fix many systems use: expand queries with synonyms (an LLM can generate these too)
SYNONYMS = {"money": ["refund"], "yearly": ["annual"], "quit": ["cancel", "subscription"],
            "receipt": ["invoice"], "taxes": ["vat"], "lost": ["lose", "backup"], "close": ["delete", "account"],
            "forever": ["permanent"], "token": ["key"], "github": ["git", "commit"], "secret": ["key"]}

original_search = SearchEngine.search
def expanded_search(self, query, **kw):
    extra = [s for w in tokenize(query) for s in SYNONYMS.get(w, [])]
    return original_search(self, query + " " + " ".join(extra), **kw)
SearchEngine.search = expanded_search

r3, mrr = evaluate("hybrid", k=3)
print(f"\nwith query expansion → recall@3 {r3:.2f}, MRR {mrr:.2f}")
SearchEngine.search = original_search                    # restore
```

:::tip In production
Swap `DenseIndex` for real embeddings (e.g. Voyage or sentence-transformers), store vectors in a vector database, add a **reranker** on the top 20 results, and let an LLM **rewrite** queries. Keep the evaluation harness — it tells you which of those changes are worth it.
:::

:::exercise Extensions
1. Add **field boosting**: count title matches twice as much as body matches in BM25.
2. Tune `rrf_k` (10, 30, 60, 100) and the SVD `dims` — which gives the best MRR?
3. Add a "did you mean" spelling suggestion using `difflib.get_close_matches` over the vocabulary.
4. On your computer, replace `DenseIndex` with `sentence-transformers` and re-run the evaluation.
:::

:::keypoints
- **BM25** nails exact terms (error codes, names); **dense vectors** catch paraphrases — **hybrid + RRF** gets both.
- Filters (category, permissions) are applied before ranking.
- Snippets with highlighted terms make results scannable.
- Evaluate with **recall@k** and **MRR** on realistic queries, read the failures, then improve (synonyms, rewriting, reranking).
:::
