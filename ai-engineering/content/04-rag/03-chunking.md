---
title: Chunking — Cutting Documents the Right Way
level: intermediate
time: 45
summary: How to split documents into passages that retrieve well. The size trade-off, overlap, fixed versus sentence versus recursive versus structure-aware versus semantic splitting, parent-child and sentence-window retrieval, attaching context to each chunk, and how to choose by measuring recall on your own questions. Includes an interactive chunking lab and runnable splitters.
---

You cannot embed a 200-page manual as one vector (the signal would be a blur) and you cannot feed the model all of it for every question. So you cut documents into **chunks**: pieces small enough to match a question precisely, and big enough to make sense on their own.

:::def Chunk
A passage of a document that is embedded, indexed and retrieved as a unit. Good chunks are **self-contained** (understandable without the rest of the document), **focused** (about one thing), and **sized to the model and the question type**.
:::

## The central trade-off

| Smaller chunks | Larger chunks |
|---|---|
| ✅ precise matches, less noise per chunk | ✅ more context, complete explanations |
| ✅ cheaper to put many in the prompt | ✅ fewer chunks, simpler index |
| ❌ may lose the surrounding meaning ("it", "this setting") | ❌ the embedding blurs several topics |
| ❌ more chunks to store and search | ❌ wasteful if only one sentence is relevant |

There is no universal best size. A reasonable **starting point** is **200–500 tokens with 10–20% overlap** for prose, then tune with an evaluation. Reference manuals with short self-contained entries want smaller chunks; legal and narrative text want larger ones.

## Play with it

Change the strategy, size and overlap, and watch where the answer to the selected question lands. If no chunk contains the whole answer, a perfect retriever still cannot help.

```viz algo=chunking title="Chunking lab"
```

## Strategies

| Strategy | How | Pros | Cons |
|---|---|---|---|
| **Fixed size** | every N characters/tokens (+ overlap) | trivial, predictable | cuts mid-sentence and mid-idea |
| **Sentence-packed** | add whole sentences until the size is reached | never splits sentences | may split a paragraph's argument |
| **Recursive** | try splitting on paragraphs, then sentences, then words until chunks fit | good default, respects natural boundaries | still ignores meaning |
| **Structure-aware** | split on headings, sections, list items, code functions, table rows | chunks match how the author organised ideas | needs good parsing |
| **Semantic** | embed sentences, split where similarity between neighbours drops | adapts to topic shifts | slower, noisier, hyperparameters |
| **LLM-assisted / agentic** | ask a model to decide boundaries or write propositions | high quality | costly |
| **Document-specific** | transcripts by speaker turn, chat by thread, code by AST, emails by message | respects the format | more engineering |

### A recursive splitter (with structure first)

The most common default in frameworks (LangChain's `RecursiveCharacterTextSplitter`) is easy to write:

```python run title="Recursive splitting on natural boundaries" level=intermediate
def recursive_split(text, max_chars=200, separators=("\n\n", "\n", ". ", " ")):
    if len(text) <= max_chars:
        return [text.strip()] if text.strip() else []
    for sep in separators:
        if sep in text:
            parts = text.split(sep)
            chunks, cur = [], ""
            for p in parts:
                piece = p + (sep if sep != " " else " ")
                if len(cur) + len(piece) <= max_chars:
                    cur += piece
                else:
                    if cur.strip(): chunks.append(cur.strip())
                    if len(piece) > max_chars:                       # still too big: recurse with finer separators
                        chunks += recursive_split(piece, max_chars, separators[separators.index(sep) + 1:])
                        cur = ""
                    else:
                        cur = piece
            if cur.strip(): chunks.append(cur.strip())
            return chunks
    return [text[i:i + max_chars] for i in range(0, len(text), max_chars)]    # last resort: hard cut

doc = """# Errors

Error E21 means the drain is blocked. Switch the machine off, open the filter behind the front-left panel, remove lint or coins, and close it firmly.

Error E35 means the door is not closed properly. Open it, check the seal, and close it until it clicks.

# Warranty

The warranty lasts 2 years and covers the motor for 10 years."""
import re
sections = re.split(r"\n(?=# )", doc)                       # structure first: split at headings
chunks = [c for sec in sections for c in recursive_split(sec, 150)]
merged = []                                                  # keep a heading with the text under it
for c in chunks:
    if merged and merged[-1].startswith("#") and len(merged[-1]) < 20:
        merged[-1] = merged[-1] + "\n" + c
    else:
        merged.append(c)
for i, c in enumerate(merged):
    print(f"[{i}] ({len(c)} chars) {c!r}")
```

### Overlap

**Overlap** repeats the end of one chunk at the start of the next, so a sentence near the boundary is whole in at least one chunk. 10–20% is typical. Too much overlap inflates the index and returns near-duplicate chunks in the results; consider deduplicating retrieved results.

### Chunk by tokens, not characters

Embedding models and LLMs limit **tokens**. Measure chunk size with the embedding model's tokenizer when possible (or a rough characters ÷ 4). Check your embedding model's maximum input: text beyond it is silently truncated.

## Give each chunk context

A chunk like *"It lasts 2 years."* is useless on its own. Make chunks **self-contained**:

1. **Prepend a header** with the document title and section path: `Warranty > Motor: The warranty covers…`. Cheap and effective, and the header also helps the *embedding*.
2. **Store metadata** (source, page, date) for citations and filters.
3. **Contextual retrieval** (Anthropic): ask an LLM to write a one or two sentence situating description for each chunk ("This chunk is from the X200 manual's warranty section...") and prepend it before embedding and BM25 indexing. This substantially reduced retrieval failures in Anthropic's tests ([post](https://www.anthropic.com/news/contextual-retrieval)). With prompt caching, generating these for a whole corpus is affordable.

```python run title="Prepend breadcrumbs so chunks stand alone" level=easy
doc = {"title": "X200 User Guide", "sections": [
    ("Programs > Eco", "It saves 40% energy but takes 3 hours."),
    ("Warranty > Motor", "It lasts 2 years for the machine and 10 years for the motor."),
]}
for path, text in doc["sections"]:
    contextual = f"{doc['title']} > {path}\n{text}"
    print(repr(text))
    print("  becomes:", repr(contextual), "\n")
```

## Small-to-big: retrieve small, read big

Precision likes small chunks; comprehension likes big ones. Do both:

- **Parent-child (small-to-big):** index small *child* chunks (a sentence or two), but when one matches, return its larger *parent* (the section or page) to the model.
- **Sentence-window:** embed single sentences, then return the matched sentence plus a window of neighbours.

```python run title="Parent-child retrieval: match small, return big" level=intermediate
import numpy as np, re, zlib

DIM = 192
def embed(text):
    v = np.zeros(DIM)
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        for i in range(max(1, len(w) - 2)):
            h = zlib.crc32(w[i:i + 3].encode()); v[h % DIM] += 1 if (h >> 8) & 1 else -1
    n = np.linalg.norm(v); return v / n if n else v

parents = {
    "errors": "Error E21 means the drain is blocked. Switch the machine off, open the filter behind the front-left panel, remove lint, and close it. Error E35 means the door is not closed properly.",
    "warranty": "The warranty lasts 2 years and covers the motor for 10 years. Misuse and limescale damage are not covered. Keep your receipt.",
}
children = [(pid, s.strip()) for pid, text in parents.items() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
E = np.stack([embed(s) for _, s in children])

def retrieve_parent(q):
    best = int(np.argmax(E @ embed(q)))
    pid, child = children[best]
    return child, parents[pid]

child, parent = retrieve_parent("how do I clear a blocked drain")
print("matched child:", child)
print("returned parent:", parent)
```

## Pitfalls

- **Splitting tables and code** mid-way. Keep a table (or at least a row with its header) together; split code at function boundaries.
- **Chunks that mix topics** because a heading was lost during parsing.
- **Very short chunks** (a heading alone, a one-line list item) that match queries but carry no answer. Merge them into the next chunk.
- **Inconsistent chunking between indexing and the eval set**: if you change chunking, re-index and re-evaluate.
- **Not testing**: chunking is the highest-impact parameter in many systems and the least often measured.

## Choose by measurement

Build a set of 30–100 real questions with the document passage that answers each. For each candidate configuration (strategy × size × overlap) compute **recall@k**: the share of questions where a chunk containing the answer is in the top k. Pick the best configuration, then check cost (index size, tokens per prompt).

```python run title="Compare chunk sizes by recall@k" level=advanced
import numpy as np, re, zlib

DIM = 256
def embed(text):
    v = np.zeros(DIM)
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        for i in range(max(1, len(w) - 2)):
            h = zlib.crc32(w[i:i + 3].encode()); v[h % DIM] += 1 if (h >> 8) & 1 else -1
    n = np.linalg.norm(v); return v / n if n else v

SENTS = [
    "The X200 has 12 programs.", "The Quick Wash program takes 30 minutes.", "The Eco program saves 40% energy but takes 3 hours.",
    "To descale, run the Clean program monthly with an empty drum.", "Wipe the door seal after each wash.",
    "Error E21 means the drain is blocked.", "Clean the filter behind the front-left panel to fix E21.",
    "Error E35 means the door is not closed properly.", "The warranty lasts 2 years.", "The motor warranty lasts 10 years.",
    "Keep your receipt as proof of purchase.", "Shipping takes three to five business days.",
]
# (question, the sentence indices that together answer it)
QA = [("how long is the quick wash", [1]), ("energy saving program duration", [2]), ("how to fix error E21", [5, 6]),
      ("what does E35 mean", [7]), ("how long is the motor warranty", [9]), ("how do I descale", [3])]

def evaluate(per_chunk, k=2):
    chunks = [(list(range(i, min(i + per_chunk, len(SENTS)))), " ".join(SENTS[i:i + per_chunk])) for i in range(0, len(SENTS), per_chunk)]
    E = np.stack([embed(t) for _, t in chunks])
    hits = whole = 0
    for q, gold in QA:
        top = np.argsort(-(E @ embed(q)))[:k]
        got = set(j for i in top for j in chunks[i][0])
        hits += any(g in got for g in gold)                   # at least part of the answer retrieved
        whole += all(g in got for g in gold)                  # the entire answer retrieved
    return len(chunks), hits / len(QA), whole / len(QA)

for per in (1, 2, 3, 4, 6):
    n, partial, full = evaluate(per)
    print(f"{per} sentence(s) per chunk -> {n:>2} chunks   answer found {partial:.0%}   complete answer in top-2 {full:.0%}")
```

The point is the method, not the numbers from this toy corpus: **define a metric, sweep the parameter, pick with evidence.**

```quiz
? What is the main downside of very large chunks?
- They cost nothing
+ The embedding blurs multiple topics and much of the retrieved text is irrelevant
- They cannot be stored
> Large chunks reduce precision and waste prompt tokens.

? What does parent-child (small-to-big) retrieval do?
- Retrieves only parents
+ Matches small chunks for precision but returns their larger parent for context
- Splits tables
> It combines precise matching with comprehensible context.

? Why prepend a title and section path to a chunk?
+ It makes the chunk self-contained and improves both embedding and keyword matching
- It reduces tokens
- It is required by the API
> "It lasts 2 years" means little without "Warranty > Motor".

? How should you choose chunk size?
- Always 1,000 tokens
+ Evaluate recall on your own questions across several sizes and strategies
- Use the default of the framework without testing
> Chunking is high-impact and data-dependent: measure.
```

:::problem Retrieval returns the right section but the answer needs a table that was split across two chunks. How do you fix it? {level=medium tags="chunking,tables"}
Give two or three fixes.

:::solution Model answer
Keep tables **atomic**: detect table boundaries at parse time and make the whole table (or each row with its header and caption) its own chunk, even if larger than the target size. Alternatively convert rows to self-contained sentences. Use **small-to-big retrieval** so a matching row returns the full table as the parent. Add the table title and column headers to each chunk's header. Re-run the eval set to confirm the fix.
:::
:::

:::keypoints
- Chunks must be focused, self-contained and sized to the task; start at ~200–500 tokens with 10–20% overlap and tune.
- Prefer recursive or structure-aware splitting to naive fixed-size; keep tables and code intact.
- Add context to each chunk: breadcrumb headers, metadata, or LLM-written situating context (contextual retrieval).
- Small-to-big (parent-child, sentence-window) combines precision with readable context.
- Choose strategy and size by measuring recall on your own questions.
:::

:::resources
- [Anthropic: Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) — measured gains from contextual chunk headers + BM25.
- [Dense X Retrieval: What Retrieval Granularity Should We Use?](https://arxiv.org/abs/2312.06648) — propositions as retrieval units.
- [RAPTOR](https://arxiv.org/abs/2401.18059) — recursive summarisation trees over chunks.
- [NirDiamant/RAG_Techniques](https://github.com/NirDiamant/RAG_Techniques) — notebooks for semantic chunking, sentence windows, and more.
- [LlamaIndex docs](https://docs.llamaindex.ai) — node parsers for many chunking strategies.
- [Pinecone-style chunking guides](https://docs.pinecone.io) — practical notes in the learning centre.
:::
