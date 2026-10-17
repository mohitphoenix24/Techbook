---
title: Keyword search (BM25) and hybrid ranking
level: intermediate
time: 50
summary: Why vector search alone is not enough, how BM25 ranks by rare words, and how Reciprocal Rank Fusion merges the two rankings without any tuning. The complete index runs live in your browser.
tags: BM25, hybrid search, RRF, retrieval
---

Vector search understands meaning but is fuzzy: it can miss an exact product code, a person's name, or a rare technical word, because those carry little "meaning" for a model. Keyword search is the opposite: exact and blunt, brilliant at "IPX4" and "clause 14.3", blind to synonyms. **Real systems use both**, and this lesson builds the keyword half and the glue.

| Query | Keyword search | Vector search |
|---|---|---|
| "IPX4 rating" | finds the passage with that exact token | may return generic "water resistance" text |
| "Can I claim lunch on a trip?" | no passage contains "lunch": misses the food-allowance rule | finds it by meaning |
| "Who is the DPO?" (a rare acronym) | exact match | the model may not know the acronym |
| "How do I reset it?" (vague) | matches every passage with "reset" | understands the context |

## BM25: ranking by rare words

BM25 is the classic keyword formula behind most search engines for decades, and it rests on three simple ideas:

1. **Rare words matter more.** "battery" appears in one passage; "the" in all of them. A match on "battery" is strong evidence; a match on "the" is none.
2. **Repeating a word helps, with diminishing returns.** The tenth "refund" is worth much less than the first.
3. **Long passages are discounted.** A passage that mentions a word once in 10 words is a better match than one that mentions it once in 1,000.

$$\text{score}(q, d) = \sum_{t \in q} \text{IDF}(t) \cdot \frac{f(t,d)\,(k_1 + 1)}{f(t,d) + k_1 \left(1 - b + b\,\frac{|d|}{\text{avgdl}}\right)} \qquad \text{IDF}(t) = \ln\!\left(1 + \frac{N - n_t + 0.5}{n_t + 0.5}\right)$$

Here $f(t,d)$ is how often word $t$ occurs in passage $d$, $N$ the number of passages, $n_t$ how many contain $t$, $|d|$ the passage length and $\text{avgdl}$ the average length. $k_1$ (1.5) controls saturation and $b$ (0.75) controls the length penalty. The code is shorter than the formula:

```python src="ask-docs/backend/app/rag/text.py" region="tokenise" title="backend/app/rag/text.py: tokens"
```

```python src="ask-docs/backend/app/rag/bm25.py" region="bm25" title="backend/app/rag/bm25.py"
```

How it works: `add` records, for each word, which passages contain it and how often (an **inverted index**: word to passages, exactly like the index at the back of a book). `search` visits *only* the passages that contain a query word, never the whole collection, so it is fast. Words that no passage contains are ignored.

The tokenizer matters as much as the formula: it lower-cases, drops stop words ("the", "of", "is"), and applies a tiny stemmer so that **leaves**, **leaving** and **leave** match. Real systems use better stemmers and handle other languages, but this is enough to see the idea.

## Fusing two rankings

Now we have two ranked lists for one question: one from keywords, one from vectors. How do we merge them? We cannot just add the scores: a cosine similarity lives between 0 and 1, a BM25 score can be 0 to 30. Normalising them is fiddly and brittle.

**Reciprocal Rank Fusion (RRF)** sidesteps the problem by ignoring scores and using only **ranks**. A passage gets $\frac{1}{k + \text{rank}}$ from each list that contains it, and the contributions are added ($k = 60$ is the standard constant).

```python src="ask-docs/backend/app/rag/fusion.py" region="rrf" title="backend/app/rag/fusion.py"
```

A passage that is 1st in one list and 3rd in the other scores $\frac{1}{61} + \frac{1}{63} \approx 0.0322$. A passage that is 1st in one list only scores $\frac{1}{61} = 0.0164$. **Agreement between two independent methods is strong evidence**, and RRF rewards it with no tuning at all.

```python src="ask-docs/backend/tests/test_search_core.py" region="fusion-tests" title="backend/tests/test_search_core.py"
```

## The index that holds both

The `Index` keeps the vectors (a matrix), the BM25 index, and which document each passage belongs to. `search` runs whichever of the two searches the mode asks for, then fuses:

```python src="ask-docs/backend/app/rag/index.py" region="index" title="backend/app/rag/index.py"
```

Notes:

- `pool=20`: each search returns its top 20; RRF merges the two lists and we keep the top `k`. Fusing short lists loses good candidates; fusing very long ones adds noise.
- Every `Hit` records **why** it was returned (`vector_rank`, `keyword_rank`, both scores). This is not decoration: it powers the "Retrieval details" panel in the interface, and it is what you read when search misbehaves.
- A lock guards the index, because uploads are indexed in a background thread while questions are being searched.
- `document_ids` lets a question search only chosen documents (the checkboxes in the interface).

## See why hybrid wins

This block runs the **whole index** in your browser: the real tokenizer, BM25, fusion, embedder and index. To stand in for a trained semantic model we add a few hand-written synonyms to the question side only (`lunch` also means `food`, `waterproof` also means `sweat` and `rain`). It is the toy version of what a real model learns from data.

```python run src="ask-docs/backend/app/rag/text.py,ask-docs/backend/app/rag/bm25.py,ask-docs/backend/app/rag/fusion.py,ask-docs/backend/app/rag/embeddings.py,ask-docs/backend/app/rag/index.py" flat title="The real index: keyword, vector and hybrid side by side" level=advanced
PASSAGES = [
    "While travelling on business you get a food allowance of ₹800 per day, so you do not need to submit meal receipts.",
    "Business expenses are reimbursed within 10 working days when you submit them in the Expenses portal.",
    "Book flights in economy class. In metro cities the hotel limit is ₹6,000 per night.",
    "The earbuds are rated IPX4, which means they survive sweat and light rain. They are not meant for swimming.",
    "If only one earbud plays sound, put both earbuds in the case and close the lid for 10 seconds.",
    "You can return the earbuds within 30 days of delivery for a full refund.",
    "If you cancel, we refund the unused part of your monthly charge, and the refund is processed in 10 to 15 working days.",
    "A late fee of 2 percent of the bill is added for each month it stays unpaid.",
]

SYNONYMS = {"lunch": "food meal allowance", "waterproof": "water sweat rain", "claim": "reimbursed receipts"}   # a toy "meaning"

class ToyMeaningEmbedder(HashEmbedder):
    def embed(self, texts, kind="document"):
        if kind == "query":
            texts = [" ".join(SYNONYMS.get(w, w) for w in t.lower().replace("?", "").split()) + " " + t for t in texts]
        return super().embed(texts, kind)

emb = ToyMeaningEmbedder()
index = Index(emb)
index.add(list(range(len(PASSAGES))), "demo", PASSAGES, emb.embed(PASSAGES))

def show(query):
    print(f"\nQUESTION: {query}")
    for mode in ("keyword", "vector", "hybrid"):
        hits = index.search(query, mode=mode, k=3)
        top = ", ".join(f"#{h.chunk_id}" for h in hits)
        best = PASSAGES[hits[0].chunk_id][:58] if hits else "(no results)"
        print(f"  {mode:<8} -> {top:<14} best: {best}...")

show("Can I buy lunch on a trip and claim it back?")      # keyword has no word in common with the answer
show("Are the earbuds waterproof?")                        # needs meaning: waterproof -> IPX4, sweat, rain
show("refund processing time in working days")             # exact words: keyword is strong
```

Read the three results:

- **lunch.** The keyword search finds *nothing*: no passage contains "lunch" or "claim". The vector side finds the food-allowance passage (#0) and so does the hybrid. This is the case keyword search can never solve.
- **waterproof.** The keyword search is **distracted**: the passage about "one earbud" repeats *earbud* three times, so it wins on the only word the question shares with anything. The vector side puts the IPX4 passage (#3) first. The hybrid lists both at the top, but with the wrong one first, by a hair: each is first in one ranking and second or third in the other, so their fused scores nearly tie.
- **refund processing time.** The words themselves are decisive, and all three methods agree.

So hybrid search is **robust, not infallible**: in none of the three cases did it lose the right passage, and it never returned nothing. It is also easy to improve once you can *measure*: weight the vector ranking more, retrieve more passages and re-rank them, or choose a better embedder. Lesson 9 shows how to decide with numbers rather than by feel.

Try your own questions, or add a passage and see where it lands.

## Why this is the default

| Mode | Strength | Weakness |
|---|---|---|
| keyword only | exact terms, codes, names; no model needed | no synonyms, no paraphrase |
| vector only | meaning, paraphrase, other wording | fuzzy on exact terms; needs an embedding model |
| **hybrid** | both; robust across question styles | a bit more machinery |

The cost of hybrid is small (a second lookup and a few lines of fusion) and it is usually the biggest single quality gain after chunking. The next lessons use it by default, and lesson 9 measures it against each half.

:::tip Where re-ranking fits
The next step up is a **re-ranker**: take the top 20 from hybrid search and let a small model read each question and passage *together* to reorder them. It is slower and more precise, and usually worth adding once hybrid search is working and measured. We stop at hybrid so the system stays small enough to understand.
:::

## Tests

```python src="ask-docs/backend/tests/test_search_core.py" region="bm25-tests" title="backend/tests/test_search_core.py"
```

```python src="ask-docs/backend/tests/test_search_core.py" region="index-tests" title="backend/tests/test_search_core.py"
```

:::keypoints
- Keyword search is exact and blind to synonyms; vector search understands meaning but blurs exact terms. Use both.
- BM25 weights rare words, saturates repeated words, and discounts long passages; an inverted index keeps it fast.
- Reciprocal Rank Fusion merges rankings using only ranks, so differently-scaled scores need no tuning.
- Record why each passage was returned (both ranks and scores): it is your debugging tool and your UI's "retrieval details".
- Hybrid is the strong default; a re-ranker is the next step once you can measure.
:::

```quiz
? Why does RRF use ranks instead of scores?
- Ranks are more accurate
+ Cosine similarities and BM25 scores are on different scales, and ranks can be combined with no normalisation
- Scores are not available
> Using only ranks makes fusion robust and parameter-free, apart from the constant k.
? A passage is 1st for keywords and not returned by the vector search. How does it compare with one that is 3rd in both?
- It always wins
+ It gets 1/61 from one list; the other gets about 1/63 + 1/63, nearly double, so agreement can beat a single first place
- They tie
> RRF rewards agreement: two moderate placements can outweigh one top placement.
? Which question is keyword search best at?
- "Can I claim lunch on a trip?"
+ "What does IPX4 mean?"
- "How do I make it work?"
> An exact, rare token is where word matching shines; synonyms and vague questions need meaning.
```

:::exercise Add a keyword boost
Some words deserve extra weight: a question containing a product code or a quoted phrase usually wants an exact match. Add a rule in `Index.search`: if the query contains a token with a digit (like `IPX4` or `14.3`), weight the keyword ranking twice in the fusion (pass `[kw, kw, vec]` rankings to `rrf`). Write a test with a passage containing `IPX4`. What could go wrong if you apply the boost to every query?
:::
