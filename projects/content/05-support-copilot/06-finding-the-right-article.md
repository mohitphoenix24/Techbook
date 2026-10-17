---
title: Finding the right article
level: advanced
time: 45
summary: Ground every reply in the company's own help articles. A small keyword search (BM25) over a closed set of articles, the rule's own article always included, and an honest empty result when nothing matches. See the scores, and see why keyword search beats embeddings here.
tags: retrieval, BM25, grounding, citations, knowledge base
---

A support reply that says "you can return it within 10 days" is only as good as the policy it came from. If the model writes that from memory, it may quote a *different* company's policy, last year's policy, or a plausible invention. So the reply must be built from **your** articles, and must **cite** them, so that a person can check the claim in one click.

In Project 3 you built a full retrieval system with embeddings. Here the situation is different, and a simpler tool is the better engineering.

## Why keyword search is enough here

| Project 3 (AskDocs) | This project (SupportPilot) |
|---|---|
| thousands of passages, uploaded by users | thirteen short help articles, written by the company |
| questions can be phrased any way | customers write about a handful of topics ("refund", "delivery", "password") |
| meaning matters ("holiday" ≈ "leave") | **exact words and numbers matter** ("10 days", "UPI") |
| an embedding model, a vector index | no extra model, no dependency, deterministic |

A closed, small knowledge base with distinctive vocabulary is where **BM25**, the classic keyword ranking, shines: fast, explainable ("this article ranked first because it contains *refund* and *UPI*"), and it runs in plain Python. If your knowledge base grows to hundreds of articles and customers phrase things unpredictably, that is the time to add embeddings and combine them (the hybrid search of Project 3). Use the simplest tool that works, and know the signs that it has stopped working.

## The articles

```python src="support-pilot/backend/app/kb.py" region="articles" title="backend/app/kb.py"
```

Two writing habits make a knowledge base useful to a machine and a human: each article answers **one question** with **concrete numbers** ("within 10 days", "1 to 3 working days"), and the `id` is a stable, readable slug (`refunds-timeline`) that the reply will cite as `[kb:refunds-timeline]`.

Notice that the numbers here (10 days, 30 days) match the constants in `policy.py`. Two copies of one fact will drift apart. In a real system the policy and the article would come from one source, or a test would check that they agree.

## BM25 in forty lines

```python src="support-pilot/backend/app/kb.py" region="bm25" title="backend/app/kb.py"
```

How it ranks, in plain words:

1. **Tokenise**: lower-case words, drop filler ("the", "is", "does"), and fold simple plurals so "refunds" matches "refund".
2. **Rare words count more** (`idf`). "refund" appears in several articles, "Aadhaar" in none; a word that appears in only one article is strong evidence for it.
3. **Repeated words count, with diminishing returns** (`tf` and `k1`). The tenth mention of "refund" adds far less than the first.
4. **Long articles are not unfairly favoured** (`b`): a word in a short article means more than the same word in a long one.
5. **The title counts double**, because a title is a very good summary.

And one design choice that is easy to miss: `min_score=1.0`. If no article scores at least that, the search returns **nothing**, not "the closest thing". We will see why that matters in a moment.

## Try it

```python run src="support-pilot/backend/app/kb.py" title="Search the help articles, and see the scores" level=intermediate
QUESTIONS = [
    "How long do refunds take to reach my UPI account?",
    "my package says delivered but I did not get it",
    "I was charged twice for one order",
    "can I return something I bought last week",
    "I forgot my password",
    "Does the 4L air fryer have a timer?",
]
for question in QUESTIONS:
    hits = INDEX.search(question, k=3)
    print(f"\n? {question}")
    if not hits:
        print("   (nothing scored high enough: the help articles do not cover this)")
    for article, score in hits:
        print(f"   {score:>6.2f}  [kb:{article.id}]  {article.title}")

print("\nWhat the tokeniser keeps of one question:", tokens("How long do refunds take to reach my UPI account?"))
rare = sorted(INDEX.idf.items(), key=lambda kv: -kv[1])[:6]
common = sorted(INDEX.idf.items(), key=lambda kv: kv[1])[:6]
print("Rarest words (most useful as evidence): ", [w for w, _ in rare])
print("Most common words (least useful):       ", [w for w, _ in common])
```

The last question is the important one. *"Does the air fryer have a timer?"* is a perfectly reasonable question, and **none of our articles answer it**. A search that always returns its best guess would hand the model a loosely related article (say, about warranty), and the model, trying to be helpful, would build an answer on it. By returning *nothing*, the pipeline can honestly say "I do not have this information", and the draft prompt allows exactly that.

## Retrieval in the pipeline

Retrieval does not simply call `search`. It combines it with two deterministic rules:

```python src="support-pilot/backend/app/pipeline.py" region="retrieve-stage" title="backend/app/pipeline.py"
```

- **The rule's own article goes first**, always (`decision.article`). If the policy says "window closed", the reply *must* be able to cite the returns article, whatever the search thinks.
- **Companions are added by rule**: a refund always comes with the refund-timeline article (a customer's next question is always "when?"), and a closed window comes with the damaged-items article (the way out for a faulty item).
- **Then search fills the remaining slots** (three in all) with whatever is related.

The checks of lesson 8 verify the result from the other side: every `[kb:...]` in a draft must be one of *these* articles. A model cannot cite an article it was never given.

## Tests

```python src="support-pilot/backend/tests/test_kb.py" region="kb-tests" title="backend/tests/test_kb.py"
```

Notice the test for the **uncovered question**, and the one for plurals and stop words. A retrieval test suite is a list of "this question should find that article", and every wrong result you meet in real life becomes a new row.

:::keypoints
- Ground replies in the company's own articles and cite them, so a person can verify each claim.
- For a small, closed, distinctive-vocabulary knowledge base, BM25 beats embeddings: simple, explainable, deterministic, dependency-free. Know when to graduate.
- BM25 rewards rare words, repetition with diminishing returns, and short documents; the title counts double.
- Return **nothing** below a score threshold. An honest "not covered" beats a confident answer built on the wrong article.
- The rule's own article is always included; related articles come from search; citations are checked against what was provided.
- Keep facts that appear twice (a policy constant, an article) in agreement, ideally from one source.
:::

```quiz
? Why does the search return nothing for "Does the air fryer have a timer?"
- It crashed
+ No article scores above the threshold, so the pipeline can honestly say the articles do not cover it
- The question is too short
> An honest "not covered" is better than the closest wrong article.
? Why is the policy's own article always put first, whatever the search says?
- Search is slow
+ The reply must be able to cite the article that states the rule it is applying
- It is alphabetical
> Retrieval adds related articles, but the rule's source is never optional.
? When would you add embeddings to this knowledge base?
- Always
+ When it grows to hundreds of articles and customers phrase things in ways the keywords miss
- Never
> Start simple, measure, and add complexity when the measurements ask for it.
```

:::exercise Teach it a new article
Add an article `store-credit` (what store credit is, that it never expires, and that it can be requested instead of a refund). Rebuild the index (it happens at import) and run: does "can I get store credit instead" find it first? Does adding it change the result for "How long do refunds take"? Write the test for both. What would you do if the new article made an *old* test fail?
:::
