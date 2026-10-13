---
title: RAG, End to End
level: intermediate
time: 50
summary: What retrieval-augmented generation is, when to use it, and the whole pipeline in one picture. Build a complete, working RAG system in under 60 lines (chunk, embed, retrieve, prompt, answer with sources), see the two ways RAG fails (retrieval and generation), and get a map of the rest of this module.
---

A model knows what was in its training data. It does not know **your** documents, **today's** news, or **this user's** account. **RAG** fixes that by looking up relevant information first and putting it in the prompt.

:::def RAG (Retrieval-Augmented Generation)
A pattern where, for each question, a system **retrieves** relevant passages from an external knowledge source and **augments** the prompt with them so the model **generates** an answer grounded in that material (ideally with citations). Introduced for knowledge-intensive NLP by Lewis et al. ([paper](https://arxiv.org/abs/2005.11401)); now the most widely deployed GenAI pattern in industry.
:::

:::analogy
An **open-book exam**. A closed-book student answers from memory and may bluff. An open-book student has a textbook, a good index, and the skill to find the right page fast, then write an answer that points to it. RAG gives the model a textbook and an index, and the whole craft is in building the index and finding the right page.
:::

## Why RAG

| Need | RAG | Fine-tuning | Long context |
|---|---|---|---|
| Add new or changing facts | ✅ update documents | ❌ retrain | ✅ if it fits |
| Cite sources | ✅ natural | ❌ hard | ✅ with citations |
| Private data with per-user access | ✅ filter at retrieval | ❌ baked into weights | ⚠️ must filter before sending |
| Large knowledge base (millions of docs) | ✅ | ⚠️ | ❌ cannot fit |
| Change style, format, behaviour | ⚠️ limited | ✅ | ⚠️ |
| Cost to start | low | higher | low (but costly per query) |

Rule of thumb: **RAG teaches the model *what to say* (facts); fine-tuning teaches *how to say it* (behaviour).** They combine well.

## The whole pipeline

```viz algo=arch title="Two pipelines: indexing (offline) and answering (online)" dir=down
src    Sources | PDFs, web, DBs, tickets [docs] @0,0
parse  Parse + clean | text, tables, metadata [filter] @1,0
chunk  Chunk | passages with context [list] @2,0
emb    Embed | text to vectors [embed] @3,0
idx    Index | vector + keyword + metadata [vector] @4,0
user   Question | from the user [user] @0,2
rw     Rewrite / route | query transforms [prompt] @1,2
ret    Retrieve | hybrid search, top-k [search] @2,2
rr     Rerank | precise ordering [filter] @3,2
gen    Generate | LLM with sources [llm] @4,2
ans    Answer + citations [guard] @4,3.2
--
src -> parse
parse -> chunk
chunk -> emb
emb -> idx
user -> rw
rw -> ret
ret -> rr
rr -> gen
gen -> ans
idx -> ret
--
flow Answering a question
user > rw : "What is the refund window for the X200?" arrives, possibly after rewriting using the chat history.
rw > ret : The query is embedded and also tokenised for keyword search; metadata filters apply (product = X200, user's permissions).
ret > rr : Candidate chunks come back from the index (say 50 from vector search and 50 from BM25, fused).
rr > gen : A reranker keeps the best 5–8 chunks. The prompt is assembled: instructions, labelled sources, question.
gen > ans : The model answers using only the sources, citing them; a check confirms the citations really appear in the sources.
```

- **Indexing** (offline, repeated as documents change): load → parse and clean → chunk → embed → store.
- **Answering** (online, per question): rewrite → retrieve → rerank → assemble prompt → generate → verify and cite.

## A complete RAG system you can run

Everything below uses only NumPy and the standard library, with a tiny hashed embedder and a rule-based "model" that extracts the best sentence. Swap in a real embedding model and LLM and the **structure is identical**.

```python run title="End-to-end RAG in about 60 lines" level=intermediate
import numpy as np, re, zlib

# ---------- 1. documents (normally loaded and parsed from files) ----------
DOCS = {
    "manual.pdf": ("The X200 has 12 programs. The Quick Wash program takes 30 minutes. "
                   "The Eco program saves 40% energy but takes 3 hours. To descale, run the Clean program monthly with an empty drum. "
                   "Error E21 means the drain is blocked. Clean the filter behind the front-left panel to fix E21. "
                   "Error E35 means the door is not closed properly."),
    "policy.pdf": ("Our refund policy lasts 30 days from delivery for unused products. "
                   "The warranty lasts 2 years and covers the motor for 10 years. Shipping takes three to five business days."),
}

# ---------- 2. chunk: split into sentences, group 2 per chunk ----------
def chunk(text, per_chunk=2):
    sents = re.split(r"(?<=[.!?])\s+", text.strip())
    return [" ".join(sents[i:i + per_chunk]) for i in range(0, len(sents), per_chunk)]

chunks = [{"id": f"{name}#{i}", "source": name, "text": t} for name, text in DOCS.items() for i, t in enumerate(chunk(text))]

# ---------- 3. embed (hashed character trigrams; a stand-in for a neural embedder) ----------
DIM = 256
def embed(text):
    v = np.zeros(DIM)
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        for i in range(max(1, len(w) - 2)):
            h = zlib.crc32(w[i:i + 3].encode()); v[h % DIM] += 1 if (h >> 8) & 1 else -1
    n = np.linalg.norm(v); return v / n if n else v

index = np.stack([embed(c["text"]) for c in chunks])          # (n_chunks, DIM): our "vector database"

# ---------- 4. retrieve ----------
def retrieve(question, k=2):
    scores = index @ embed(question)
    return [(chunks[i], float(scores[i])) for i in np.argsort(-scores)[:k]]

# ---------- 5. augment: build the prompt ----------
def build_prompt(question, hits):
    sources = "\n".join(f'<source id="{c["id"]}">{c["text"]}</source>' for c, _ in hits)
    return (f"Answer using ONLY the sources. Cite source ids in brackets. If the answer is not in the sources, say 'I don't know'.\n"
            f"{sources}\n\nQuestion: {question}")

# ---------- 6. generate (stand-in for an LLM: return the best-matching sentence + citation) ----------
def fake_llm(question, hits):
    q = embed(question)
    best = max(((s, c["id"]) for c, _ in hits for s in re.split(r"(?<=[.!?])\s+", c["text"])), key=lambda sc: float(embed(sc[0]) @ q))
    return f"{best[0]} [{best[1]}]"

for question in ["What does error E21 mean?", "How long is the motor warranty?", "Can I get a refund?"]:
    hits = retrieve(question)
    print("Q:", question)
    print("  retrieved:", [(c["id"], round(s, 2)) for c, s in hits])
    print("  A:", fake_llm(question, hits), "\n")

print(build_prompt("What does error E21 mean?", retrieve("What does error E21 mean?", 1)))
```

That is **naive RAG**. It works on easy questions and fails on others. Everything else in this module is how you make each step good enough for production.

## Real model, same shape

```python local title="The generation step with Claude (swap in for fake_llm)"
import anthropic
client = anthropic.Anthropic()

def answer(question, hits):
    sources = "\n".join(f'<source id="{c["id"]}">\n{c["text"]}\n</source>' for c, _ in hits)
    response = client.messages.create(
        model="claude-sonnet-5-5",
        max_tokens=800,
        system=("You answer questions using only the provided sources. Cite the source id in brackets after each claim. "
                "If the sources do not contain the answer, say you don't know. Never use outside knowledge."),
        messages=[{"role": "user", "content": f"<sources>\n{sources}\n</sources>\n\nQuestion: {question}"}],
    )
    return next(b.text for b in response.content if b.type == "text")
```

## The two ways RAG fails

:::flow Where is the bug?
Right documents retrieved? | NO → a retrieval problem (parsing, chunking, embeddings, query, ranking)
Model used them correctly? | NO → a generation problem (prompt, too much noise, conflicting sources, refusal rules)
Both fine but answer wrong | the knowledge base itself is wrong, stale or missing the fact
:::

The single most valuable debugging habit: **always look at the retrieved chunks first.** Most "the model hallucinated" reports are really "the right passage was never retrieved". Evaluate retrieval and generation **separately** (lesson 11).

## Map of this module

| Lesson | Question it answers |
|---|---|
| Ingestion and parsing | How do I turn messy files into clean text with metadata? |
| Chunking | How big should passages be and where do I split? |
| Embedding models | Which model, which dimension, what pitfalls? |
| Vector search | How do vector indexes (IVF, HNSW, PQ) trade recall for speed? |
| Vector databases | Which store, and how do filters, tenants and updates work? |
| Hybrid search and reranking | How do I combine keywords and meaning, then reorder precisely? |
| Query transformation | How do I fix bad or conversational questions? |
| Generation and citations | How do I make the model faithful and cite sources? |
| Advanced RAG | Contextual retrieval, GraphRAG, agentic RAG, multimodal |
| Evaluation | How do I measure retrieval and answers, and find regressions? |
| Production | Freshness, permissions, latency, cost, monitoring |

```quiz
? What are the two main phases of a RAG system?
- Training and inference
+ Indexing (offline: parse, chunk, embed, store) and answering (online: retrieve, augment, generate)
- Prompting and fine-tuning
> Indexing prepares the knowledge; answering uses it per question.

? A RAG answer is wrong. What should you inspect first?
- The model's temperature
+ The retrieved chunks, to see whether the right information was even available to the model
- The tokenizer
> Separate retrieval failures from generation failures.

? RAG is best for teaching a model…
+ new or changing facts and private knowledge, with citations
- a new writing style
- how to refuse politely
> Fine-tuning handles behaviour and style; RAG handles knowledge.

? Why tell the model "answer using only the sources; otherwise say you don't know"?
+ It grounds the answer and gives the model an honest way out instead of guessing
- It speeds up retrieval
- It reduces token costs
> Grounding instructions plus an escape hatch reduce hallucination.
```

:::keypoints
- RAG retrieves relevant passages at query time and puts them in the prompt so answers are grounded and citable.
- Two pipelines: indexing (parse → chunk → embed → store) and answering (rewrite → retrieve → rerank → generate → verify).
- RAG supplies knowledge; fine-tuning supplies behaviour; long context is a cached alternative for small corpora.
- Failures are either retrieval (right info not found) or generation (found but misused); always inspect retrieved chunks first.
- Naive RAG is easy; production RAG is everything else in this module.
:::

:::resources
- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401) — the original paper.
- [Retrieval-Augmented Generation for LLMs: A Survey](https://arxiv.org/abs/2312.10997) — naive, advanced and modular RAG.
- [Anthropic: Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) — a practical improvement with measured gains.
- [NirDiamant/RAG_Techniques](https://github.com/NirDiamant/RAG_Techniques) — notebooks for dozens of RAG techniques.
- [LlamaIndex docs](https://docs.llamaindex.ai) — a framework built around RAG.
- [LLM Zoomcamp](https://github.com/DataTalksClub/llm-zoomcamp) — a free course centred on RAG, search and evaluation.
:::
