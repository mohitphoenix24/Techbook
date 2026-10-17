---
title: When RAG goes wrong, and what to build next
level: intermediate
time: 40
summary: A debugging path from a bad answer back to its cause, the failure modes that matter in practice (permissions above all), where the time and money go, and a ladder of upgrades from re-ranking to agentic retrieval.
tags: debugging, security, permissions, cost, reranking
---

AskDocs works, and you can measure it. This lesson is about the day it gives a wrong answer to a real person: how to find out why, what usually breaks, and what to build next.

## Debugging a bad answer: walk the pipeline backwards

When an answer is wrong, do not rewrite the prompt first. Ask, in order, where the right information was *lost*:

| # | Question | How to check | If "no", the fix is in... |
|---|---|---|---|
| 1 | Is the fact **in the index**? | open the document list: is it `ready`? search the chunks for the phrase | ingestion: the file failed, was a scan, or was never uploaded |
| 2 | Is it **in one chunk, whole**? | read the chunks around it ("Open in context") | chunking: a table split, a list cut from its introduction |
| 3 | Was that chunk **retrieved** (top 20)? | `POST /api/search` and read the ranks | embedding, keywords, fusion, or the question (rewrite) |
| 4 | Was it **sent** to the model (top *k*, after the gate)? | the sources panel with "Retrieval details" | `top_k`, the thresholds |
| 5 | Did the model **use** it correctly? | compare the answer with the cited source | the prompt, or the model |
| 6 | Is the **citation** right? | click the chip | the prompt, a faithfulness check |

Most problems are found at steps 1 to 4, before the model is involved at all. That is why the interface shows you the sources, scores and the rewritten question: every one of those is a clue.

## Failure modes that matter in practice

| Failure | What it looks like | Defence |
|---|---|---|
| **Scanned PDFs** | "The document has no readable text" | OCR before ingestion, or a model that reads page images |
| **Tables and lists** | an answer with half a table, or numbers detached from their headings | chunk tables as units and repeat the header row; convert tables to text |
| **Repeated headers and footers** | every chunk matches "Confidential - Page 4" | strip boilerplate before chunking |
| **Duplicates and versions** | the answer quotes last year's policy | store a version and date, deduplicate by content hash, prefer the newest |
| **Contradicting documents** | two sources disagree and the model picks one | cite both and say so (a prompt rule), or fix the documents |
| **Vague questions** | "How much?" returns a random passage | ask a clarifying question when retrieval is weak |
| **Question outside the documents** | a confident, invented answer | the gate, the refusal rule, and measuring refusals |
| **Prompt injection in a document** | "ignore your instructions and..." | fenced sources, no tools, a human-visible source panel (below) |

### The big one: permissions

Imagine AskDocs with HR documents, finance documents and a shared handbook, used by everyone in a company. A junior employee asks "What is the CEO's salary?" and the *retrieval* finds the confidential compensation file. The model, doing exactly what it was told, answers from it.

:::warn Retrieval must respect access control
It is not enough to hide the answer afterwards. The model must **never be shown** passages the user may not read, because anything in the prompt can appear in the output, whatever your instructions say. So permissions are enforced **at retrieval time**: every passage carries metadata (its document, owner, allowed groups), and the search receives the set of documents *this user* may see and filters before ranking. The project already has the mechanism (`document_ids` restricts a search to chosen documents); a real system fills that list from the user's permissions on the **server**, never from something the browser sends.
:::

```python
# Sketch: permission-aware search. The allowed set comes from your auth system, not from the request body.
allowed = {doc.id for doc in documents if user.can_read(doc)}
hits = index.search(query, mode="hybrid", k=5, document_ids=allowed)
```

Also decide what the *refusal* reveals. "I couldn't find that in your documents" is safe. "That is in the confidential HR file, which you cannot access" leaks that the file exists.

## Where the time and money go

For one question with a real model, roughly:

| Step | Typical time | Cost |
|---|---|---|
| rewrite (only for follow-ups) | 300 to 800 ms | a few hundred tokens |
| embed the question | 5 to 150 ms (local or hosted) | negligible |
| search (keyword + vector, thousands of chunks) | 1 to 10 ms | free |
| the model call | **1 to 3 s until the first word**, then streaming | the **retrieved passages are input tokens**: 5 passages of ~150 tokens is about 750 tokens |

Levers, in the order to try them:

1. **Fewer, better passages** (`top_k`, a re-ranker): input tokens are the main variable cost.
2. **The gate:** unrelated questions cost nothing.
3. **A cheaper model** for easy questions (Haiku 5.5 reads three paragraphs and answers just fine), measured with the faithfulness eval.
4. **Prompt caching** of the system prompt (it never changes), and an **embedding cache** for repeated questions.
5. **Skip the rewrite** for standalone questions (already done by `looks_like_follow_up`).

## A ladder of upgrades

| Level | Upgrade | What it solves |
|---|---|---|
| ★★ | **Re-ranker**: retrieve 20, let a small model score each (question, passage) pair, keep the best 5 | the right passage is in the top 20 but not the top 5 |
| ★★ | **Metadata filters** (date, author, type) chosen by the user or parsed from the question | "the 2024 policy", "documents from Legal" |
| ★★ | **Deduplicate by content hash** and keep versions | stale and repeated documents |
| ★★ | **Multi-query**: ask the model for 3 rewrites of the question, search each, fuse with RRF | vague or oddly worded questions |
| ★★★ | **Parent-document retrieval**: search small chunks, send the surrounding section | precise matching *and* enough context |
| ★★★ | **Contextual chunks**: a model writes one sentence of context for every chunk before embedding | chunks that are meaningless alone |
| ★★★ | **A real vector index** (pgvector, HNSW) | millions of passages |
| ★★★ | **Faithfulness check** on every answer (a judge model or a number check) | claims the sources do not support |
| ★★★★ | **Agentic RAG**: give the model a `search_documents` *tool* and let it decide when and what to search, how often, and when it has enough | multi-part questions ("compare leave policy and notice period") |
| ★★★★ | **Tables, charts and images** with a vision-capable model | knowledge that lives in pictures |

The last row is the bridge to the next project: instead of *you* deciding to retrieve before every answer, the model gets a **tool** and decides for itself. That is what an agent is. **Project 4 builds one**, for a database instead of a document library.

## A note on long context

Claude's context window is large (a million tokens on the current models), and it is tempting to skip RAG and paste everything in. For a handful of short documents that is a fine choice. As a design for a library it loses on cost (every question pays for every document), on speed, and on attention (details in the middle of a huge prompt are easier to miss), and it cannot cite precisely or respect per-user permissions. A good rule: **long context for one big document you want read closely, RAG for a library you want searched.** Many systems combine them: retrieve generously, then let the model read a few full sections.

## What you have learned

- Why models need your data at answer time, and the two pipelines of RAG.
- **Chunking** that keeps sentences, overlap, headings and offsets.
- **Embeddings** and vector search, and why meaning needs a real model.
- **BM25 and RRF**: keyword search, and fusing rankings without tuning.
- **Grounded prompts**, citations that are checked, free refusals, and follow-up rewriting.
- **Ingestion** as a background job with status, progress and a rebuildable index.
- A streaming endpoint that sends sources first and reports the true cost.
- A React interface with polling, citation chips, highlighted sources and a context dialog.
- **Measuring retrieval** with hit@k, MRR and a two-sided gate, and running experiments.

:::keypoints
- Debug backwards: in the index? in one chunk? retrieved? sent? used? cited correctly? Most faults are before the model.
- Permissions are enforced at retrieval time, from the server's idea of who the user is, never by hiding the answer afterwards.
- Documents, versions, tables, scans and duplicates are where real projects struggle, not the prompt.
- Input tokens from retrieved passages dominate the cost; fewer, better passages and a gate are the first levers.
- Re-ranking, filters, multi-query and parent-document retrieval are the usual next steps; give the model a search tool and you have an agent.
:::

```quiz
? A user is not allowed to read the finance folder. Which design is correct?
- Retrieve everything, then ask the model not to mention finance documents
+ Filter the search to the documents the user may read, so forbidden text never enters the prompt
- Hide the sources panel
> Anything in the prompt can leak into the answer. Enforce permissions before ranking, on the server.
? The right passage is retrieved at rank 12 but you send only 5. What is the cheapest next step?
- Send all 20
+ Add a re-ranker over the top 20, so the right passage rises into the top 5
- Increase max_tokens
> Re-ranking improves precision without paying for 20 passages of input on every question.
? Why is "debug backwards from the answer" better than editing the prompt first?
- Prompts never matter
+ Most bad answers are caused by ingestion, chunking or retrieval, before the model sees anything
- The model is always right
> Check whether the right text was ever shown to the model before changing how the model is asked.
```

:::exercise Build permissions into the project
Add a `owner` column to `documents` (a string such as "hr" or "everyone") and a fake "current user" header, `X-Groups: hr,everyone`, that the **server** reads (in a real system it would come from a verified token). Make `/api/ask` and `/api/search` search only documents whose owner is in the user's groups. Write tests that prove: an `hr`-only document is found for a user in `hr`, is *not* found for a user in `everyone`, and the refusal text does not reveal that the document exists. What would break if you read the groups from the request body instead?
:::
