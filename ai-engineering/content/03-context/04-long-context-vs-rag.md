---
title: Long Context or Retrieval? A Decision Framework
level: intermediate
time: 35
summary: With million-token windows, why bother with RAG? A framework for choosing between stuffing documents into the prompt, retrieving only what is relevant, or combining both with caching. Cost break-even math, accuracy and latency trade-offs, needle-in-a-haystack tests and why they flatter models, and when each approach wins.
---

Context windows grew from 4K tokens to 1M+. Is retrieval obsolete? No, but the answer is **"it depends"**, and the dependence is something you can calculate. This lesson gives you the framework.

## The three architectures

| Approach | What you do | Mental model |
|---|---|---|
| **Long context ("stuff it")** | put the entire corpus (or the whole document) in the prompt | give the model the whole book |
| **RAG** | retrieve the few relevant passages per question | hand the model the right pages |
| **Hybrid** | retrieve many (or whole documents), cache stable material, let the model read with a big window | the right chapters, kept on the desk |

## Strengths of long context

- **Simplicity**: no chunking, embeddings, vector database or retrieval tuning.
- **Whole-document reasoning**: summaries, cross-references, "what contradicts what", questions that need the **entire** text.
- **No retrieval misses**: nothing is hidden because a chunk was ranked 11th.
- **Great with caching**: a stable corpus becomes a cached prefix, so repeat questions are cheap and fast.

## Strengths of RAG

- **Scale**: corpora of millions of documents will never fit; even 1M tokens is only ~3,000 pages.
- **Cost and latency per query**: reading 5K relevant tokens is far cheaper and faster than reading 500K.
- **Freshness**: update an index without re-sending the corpus.
- **Access control**: retrieve only what *this user* may see.
- **Attribution**: retrieved chunks give natural citations.
- **Focus**: less noise; models use short, relevant contexts more accurately.

## Do the arithmetic

Suppose a 300K-token manual and 1,000 questions per day at Sonnet-class pricing ($2 / MTok input; cached reads at 10%; writes at 1.25×).

```python run title="Break-even: stuff and cache vs retrieve" level=intermediate
def per_day(questions, doc_tokens, rag_tokens, in_price=2.0, cache_read=0.10, cache_write=1.25, cache_hit_rate=0.9):
    M = 1e6
    # RAG: only the retrieved chunks and the question are paid each time
    rag = questions * rag_tokens * in_price / M
    # Long context without caching: the whole document each time
    stuff = questions * doc_tokens * in_price / M
    # Long context with caching: hits pay 10%, misses pay a write premium
    hits = questions * cache_hit_rate
    misses = questions - hits
    cached = (hits * doc_tokens * in_price * cache_read + misses * doc_tokens * in_price * cache_write) / M
    return rag, stuff, cached

for q in (50, 1_000, 20_000):
    rag, stuff, cached = per_day(q, doc_tokens=300_000, rag_tokens=6_000)
    print(f"{q:>6} questions/day:  RAG ${rag:>8,.2f}   stuff ${stuff:>9,.2f}   stuff+cache ${cached:>9,.2f}")
```

Even with caching, stuffing a large corpus stays roughly **10× more expensive** than retrieval in this example, and **slower** (prefill over 300K tokens). Caching narrows the gap; it does not close it. The balance flips for small corpora: a 20K-token handbook cached across a conversation is cheap and simple.

## Accuracy: needle tests flatter models

"Needle in a haystack" evaluations hide one fact in a long document and ask for it. Frontier models do very well at that. Real tasks are harder:

- **Multi-hop** questions require combining several facts scattered across the text.
- **Aggregation** ("how many contracts have clause X?") requires covering *all* of the text, not finding one needle.
- **Distractors**: similar-looking passages degrade accuracy.
- **Instruction following** deteriorates as the context fills.

Treat window size as a **maximum**, not a target. Evaluate with *your* questions at *your* context sizes.

```python run title="How much text actually fits in a window?" level=easy
WORDS_PER_TOKEN = 0.75
docs = {"10-page reports": 5_000, "80-page contracts": 40_000, "300-page books": 90_000}     # rough words per item
for window in (32_000, 200_000, 1_000_000):
    words = window * WORDS_PER_TOKEN
    fits = ", ".join(f"{words / w:,.1f} {name}" for name, w in docs.items())
    print(f"{window:>9,}-token window ≈ {words:>9,.0f} words ≈ {fits}")
print("\nA 25-million-token HR corpus needs", f"{25_000_000 / 1_000_000:.0f}", "full 1M-token windows: retrieval is not optional.")
```

## The decision tree

:::flow Choosing an approach
How big is the corpus? | fits comfortably (<~100K tokens) vs larger
Does every question need the whole text? | summaries, global reasoning → long context
Is the corpus stable across questions? | yes → cache it; no → retrieve
Do users have different permissions? | yes → retrieve with filters
Are costs and latency tight at scale? | retrieve (or hybrid)
Is accuracy on scattered facts critical? | test both on your questions
:::

| Scenario | Likely winner |
|---|---|
| One 80-page contract, many questions in a session | **Long context + caching** |
| Summarise or compare a few whole documents | **Long context** |
| Company knowledge base with 50,000 documents | **RAG** |
| Per-user private data with access control | **RAG with metadata filters** |
| Codebase Q&A / agentic coding | **Hybrid**: search tools + reading whole files |
| Customer support bot over a changing help centre | **RAG**, cached instructions |
| Aggregation over thousands of records | **Not either**: use a database query or code execution, with the model writing the query |

## Hybrid patterns that work

1. **Retrieve generously, read with a big window**: fetch 20–50 chunks (or whole sections) instead of 3–5, then let the model sort it out. Reranking and larger windows relax the pressure on perfect retrieval.
2. **Whole-document retrieval**: use search to find the *right documents*, then include them in full.
3. **Cache the stable core, retrieve the long tail**: cache the handbook and policies, retrieve case-specific material.
4. **Let the agent decide**: expose search and "read file" as tools; the model searches, then reads in full where needed (just-in-time context). This is how many coding agents work.
5. **Hierarchical summaries**: store per-section summaries; retrieve summaries first, then drill down.

## Practical tips for long contexts

- Put documents **first** and the question **last**.
- **Label** each document (`<document index=... source=...>`).
- Ask the model to **quote** the relevant passage before answering (it focuses attention and gives you evidence).
- Use **citations** support if your provider has it.
- Re-test when you change models: long-context behaviour varies a lot between them.

```quiz
? A user will ask 30 questions about one 60-page contract in a session. What is a strong approach?
- RAG with a vector database
+ Put the contract in the prompt once and use prompt caching for the repeated questions
- Fine-tune a model on it
> A single moderate document in a cached prefix is simple, accurate and cheap for repeated questions.

? Which question is poorly served by either RAG or stuffing?
- What is the refund window?
+ How many of our 40,000 contracts contain an auto-renewal clause?
- Summarise this 20-page report
> Counting across a huge corpus is a database or code task: have the model write the query.

? Why do needle-in-a-haystack tests overstate real performance?
+ Real tasks need multi-hop reasoning, aggregation and resist distractors, which are harder than finding one planted fact
- They use too many tokens
- They are only for small models
> Test with your own task shapes.

? What does caching change in the long-context vs RAG trade-off?
- It makes RAG unnecessary
+ It lowers the cost and latency of repeated long prefixes, but a large corpus is still costlier than retrieval
- It makes long context free
> Cached reads are cheap, not free, and still require prefill at write time.
```

:::problem Design the approach for an internal "ask HR" bot over 4,000 policy documents (~25M tokens) with department-specific permissions. {level=medium tags="rag,long context,design"}
Choose an architecture and justify it.

:::solution Model answer
**RAG with metadata filters.** 25M tokens cannot fit in any window; the permissions require retrieving only what the user may see (filter by department/role at query time); freshness requires index updates, not re-sending a corpus. Use hybrid (BM25 + embeddings) retrieval, rerank, and give the model 8–15 chunks with **citations**. Cache the system prompt and a short global policy digest. For "summarise this one document" requests, retrieve the document id and place the **full text** in the window (long-context for that case). Evaluate retrieval recall and answer faithfulness on real HR questions.
:::
:::

:::keypoints
- Long context = simplicity and whole-document reasoning; RAG = scale, cost, freshness, access control, citations.
- Do the arithmetic: stuffing 300K tokens costs far more per query than retrieving 6K, even with caching.
- Window size is a maximum, not a target; needle tests flatter models; test multi-hop and aggregation.
- Hybrid patterns win in practice: retrieve generously, cache the stable core, let the agent search then read.
- Aggregation over many records is a database/code job, not a prompt job.
:::

:::resources
- [Lost in the Middle](https://arxiv.org/abs/2307.03172) — why position and length matter.
- [Gemini 1.5 report](https://arxiv.org/abs/2403.05530) — a long-context model and its needle results.
- [Anthropic: Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) — improving retrieval so you can use less context.
- [Claude docs: Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) — make large stable prefixes cheap.
- [Retrieval-Augmented Generation for LLMs: A Survey](https://arxiv.org/abs/2312.10997) — a map of RAG approaches.
- [Chroma research: Context Rot](https://research.trychroma.com/context-rot) — an independent study of long-context degradation.
:::
