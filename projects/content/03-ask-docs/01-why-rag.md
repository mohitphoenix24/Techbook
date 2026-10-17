---
title: Why RAG, and the whole pipeline
level: intermediate
time: 35
summary: What a model does not know, three ways to teach it, and the two pipelines (indexing and answering) behind AskDocs. Includes the architecture and the contract with the front end.
tags: RAG, retrieval, citations, architecture
---

A language model knows a lot about the world and nothing about **your** world: your company handbook, last week's contract, the PDF a customer sent this morning. Ask it about those and it will do the most dangerous thing a model can do: answer confidently anyway.

This project builds the standard fix, **retrieval-augmented generation (RAG)**: before asking the model, *look up* the relevant passages in your own documents and put them in the prompt. The model then answers from text it was just handed, and can show you which passage each claim came from.

:::analogy An open-book exam
A closed-book exam tests what the student remembers, and a student who does not know will guess. An **open-book exam** lets them look things up, and a good student writes "see page 12". RAG turns your model from the first student into the second: **find the page, read it, answer from it, point to it.**
:::

![AskDocs answering a question with a clickable citation, the five sources it retrieved, and the retrieval details of each](assets/img/ask-docs-answer.png)

## What a model does not know

| Gap | Example | Why a bigger model does not fix it |
|---|---|---|
| **Private data** | "What is our carry-over leave rule?" | it was never trained on your handbook |
| **Fresh data** | "What changed in this month's price list?" | training stopped long ago |
| **Long tail** | "What does clause 14.3 of this contract say?" | rare, specific text is exactly what models blur |
| **Provenance** | "Where does it say that?" | a model's memory has no page numbers |

## Three ways to give a model your knowledge

| Approach | How | Good for | Weakness |
|---|---|---|---|
| **Paste it all** (long context) | put every document in the prompt | a few small documents | cost and delay grow with every question; models also miss details buried in huge prompts |
| **Fine-tune** | train the model on your text | style, format, narrow skills | poor at memorising facts, expensive to update, no citations |
| **RAG** | search first, then answer from the best passages | many documents, changing data, answers that must be checkable | quality depends on the search (most of this project) |

RAG wins whenever the knowledge is large, changes, or must be cited. That is most business questions.

## The two pipelines

RAG is really two programs that share one index.

```viz algo=arch title="Indexing happens once per document; answering happens once per question" dir=down
src    Upload | PDF, text, Markdown [docs] @0,0
parse  Read pages | text with page numbers [filter] @1,0
chunk  Chunk | passages with offsets [list] @2,0
emb    Embed | passage to vector [embed] @3,0
idx    Index | vectors + keyword index + SQLite [vector] @4,0
user   Question | from the person [user] @0,2
rw     Rewrite | make follow-ups standalone [prompt] @1,2
ret    Retrieve | keyword + vector, fused [search] @2,2
gate   Gate | is anything relevant? [guard] @3,2
gen    Generate | answer from sources only [llm] @4,2
ans    Answer | with citation numbers [guard] @4,3.3
--
src -> parse
parse -> chunk
chunk -> emb
emb -> idx
user -> rw
rw -> ret
ret -> gate
gate -> gen
gen -> ans
idx -> ret
flow Answering a question
user > rw : "And sick leave?" arrives. The browser also sends the earlier turns.
rw > ret : A follow-up is rewritten into a question that stands alone, so a search engine can understand it.
ret > gate : The question is matched against every passage by keyword (BM25) and by meaning (vectors); the two rankings are fused.
gate > gen : If even the best passages look unrelated, we answer "I couldn't find that" without paying for a model call. Otherwise the passages go into the prompt.
gen > ans : The model answers using only the numbered sources and cites them. We check that every citation is real.
```

- **Indexing (offline, once per document):** read, chunk, embed, store. Slow, so it runs in the background and shows progress.
- **Answering (online, once per question):** rewrite, retrieve, gate, generate, verify. Fast, and the part users feel.

## What you will build

**AskDocs** has these parts, and each lesson builds one:

| Part | Lesson |
|---|---|
| cutting documents into passages that keep their source | 2 |
| turning text into vectors, and searching by meaning | 3 |
| keyword search, and fusing it with vector search | 4 |
| a grounded prompt, citations, and honest refusals | 5 |
| ingestion in the background, storage and restarts | 6 |
| the streaming `/api/ask` endpoint | 7 |
| the React interface with clickable citations | 8 |
| measuring retrieval, so you can improve it | 9 |
| what goes wrong, and what to build next | 10 |

## The contract with the front end

As in the earlier projects, we fix the stream before building either side. A question produces these Server-Sent Events:

| Event | Payload | Purpose |
|---|---|---|
| `rewrite` | `question`, `standalone`, `rewritten` | show what was really searched for |
| `sources` | `sources[]` (number, document, page, text, scores), `relevant` | the evidence, **before** the answer starts |
| `delta` | `text` | the answer, a few words at a time |
| `citations` | `used[]`, `invalid[]`, `refused`, `uncited` | the result of checking the answer's citations |
| `usage` | tokens and cost | what it cost (zero when the gate refused) |
| `done` | | the end |

Sending the **sources first** is a deliberate design: the person sees what the model is working from while the answer is still being written, and a citation number `[2]` always has a source card to point to.

## Setup

```bash
mkdir ask-docs && cd ask-docs
mkdir -p backend/app/{llm,rag,routes,samples} backend/tests backend/evals
cd backend
python -m venv .venv && source .venv/bin/activate
```

```text src="ask-docs/backend/requirements.txt" title="backend/requirements.txt"
```

New compared with the earlier projects: **numpy** (vector maths), **httpx** (for a hosted embeddings option) and, optionally, **fastembed** for real semantic vectors on your own machine (`requirements-semantic.txt`). The settings class collects everything this project can be tuned by:

```python src="ask-docs/backend/app/config.py" region="settings" title="backend/app/config.py"
```

Notice `embeddings_provider` and the three thresholds. Retrieval has **many dials**, and you will learn which ones matter by measuring (lesson 9).

## Three sample documents

So the app is useful immediately, it ships with three short documents in `app/samples/`: an employee handbook, a product FAQ, and broadband terms. They are chosen to overlap on purpose: all three mention *refunds*, two mention *warranty*, and the handbook and the broadband terms both talk about *days*. A retrieval system proves itself when it must choose *between* look-alike passages.

:::keypoints
- Models do not know your private, fresh or very specific data, and they answer confidently anyway.
- RAG = **retrieve** the relevant passages, then **generate** an answer from them, with citations.
- It beats pasting everything (cost, accuracy) and fine-tuning (facts, freshness, provenance) for large, changing, citable knowledge.
- Two pipelines share one index: indexing (read, chunk, embed, store) and answering (rewrite, retrieve, gate, generate, verify).
- Send the sources before the answer, so a citation always has something to point at.
:::

```quiz
? Why is fine-tuning a poor way to teach a model your handbook?
- It is impossible
+ Models memorise facts unreliably, updates require retraining, and a tuned model cannot show where an answer came from
- It only works for images
> Fine-tuning is good for behaviour and style. For facts that change and must be cited, retrieval is the better tool.
? In AskDocs, when does the (slow) embedding work happen?
- Every time a question is asked
+ Once, when a document is uploaded; a question only needs one quick embedding of the question itself
- Only at midnight
> Indexing is the expensive, once-per-document step. Answering just compares one new vector with stored ones.
? Why are the sources sent to the browser before the answer?
- To make the page heavier
+ The person can see the evidence while the answer is written, and each citation number has a card to point to
- Because the model needs them first
> It is an interface choice: evidence first builds trust and makes the citations meaningful as they appear.
```

:::exercise Where would RAG help you?
List three questions from your own life or work that a plain chat model cannot answer well. For each, say whether the missing knowledge is *private*, *fresh*, *long tail*, or about *provenance*, and what the documents would be. Which would you refuse to answer from a document at all, and why? (Keep the list: lesson 10 returns to the refusal question.)
:::
