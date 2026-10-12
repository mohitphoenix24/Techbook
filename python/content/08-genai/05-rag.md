---
title: RAG — Retrieval-Augmented Generation
level: advanced
time: 50
summary: Give an LLM your own knowledge. Build a complete RAG pipeline — load, chunk, index, retrieve, prompt, cite — first from scratch in the browser, then with Claude. Plus hybrid search, reranking and the tricks that make RAG accurate.
---

LLMs don't know your company's documents, your product manuals or last week's news — and when they don't know, they may make something up. **RAG** fixes this by **looking up** relevant information first and handing it to the model as context. It's the most widely deployed Gen-AI pattern in industry.

:::def RAG (Retrieval-Augmented Generation)
A pattern where, for each question, the system **retrieves** relevant passages from a knowledge source (documents, a database, the web) and **augments** the prompt with them, so the model **generates** an answer grounded in that material — ideally with citations.
:::

:::analogy
A closed-book exam versus an open-book exam. Without RAG the model answers from memory (and may bluff). With RAG it gets to look up the right pages of the textbook before answering — and can point to the page it used.
:::

## Why RAG instead of fine-tuning?

| | RAG | Fine-tuning |
|---|---|---|
| add new / changing facts | ✅ just update the documents | ❌ retrain every time |
| cite sources | ✅ natural | ❌ hard |
| private data access control | ✅ filter what each user can retrieve | ❌ baked into weights |
| change style / format / behaviour | ⚠️ limited | ✅ strong |
| cost to start | low | higher |

Most "make the model know our stuff" problems are RAG problems. Fine-tuning is for teaching **behaviour** or **format** (covered later).

## The two pipelines

:::flow Indexing (offline, once per document)
Load | PDFs, web pages, docs
Clean | strip boilerplate, normalise
Chunk | split into passages
Embed | passage → vector
Store | vector DB + metadata
:::

:::flow Answering (online, every question)
Question | from the user
Retrieve | top-k relevant chunks
Augment | build prompt with chunks
Generate | LLM answers from context
Cite | point to the sources
:::

## Step 1: chunking

:::def Chunk
A passage of a document small enough to embed and retrieve precisely, but big enough to make sense on its own — typically a few hundred tokens, often with some **overlap** between neighbouring chunks so ideas aren't cut in half.
:::

```python run level=intermediate
import re

def chunk_by_sentences(text, max_chars=300, overlap_sentences=1):
    """Pack whole sentences into chunks of up to max_chars, overlapping by N sentences."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks, current = [], []
    for s in sentences:
        if current and len(" ".join(current + [s])) > max_chars:
            chunks.append(" ".join(current))
            current = current[-overlap_sentences:] if overlap_sentences else []
        current.append(s)
    if current:
        chunks.append(" ".join(current))
    return chunks

doc = ("The X200 washing machine has 12 programs. The Quick Wash program takes 30 minutes. "
       "The Eco program saves 40% energy but takes 3 hours. To descale, run the Clean program monthly "
       "with an empty drum. Error E21 means the drain is blocked. Clean the filter behind the front-left "
       "panel to fix E21. Error E35 means the door is not closed properly. The warranty lasts 2 years "
       "and covers the motor for 10 years.")

for i, c in enumerate(chunk_by_sentences(doc, max_chars=200)):
    print(f"[{i}] ({len(c)} chars) {c}\n")
```

| Strategy | How | Good for |
|---|---|---|
| fixed size + overlap | every N tokens, overlap M | simple baseline |
| sentence / paragraph packing | whole sentences up to a size | prose |
| structure-aware | split on headings, sections, functions | manuals, docs, code |
| semantic | split where the topic changes (embedding similarity drops) | long mixed documents |

:::tip Chunk size matters
Too small → chunks lack context ("it", "this setting"…). Too big → retrieval is fuzzy and you waste context. Start around **300–800 tokens with 10–20% overlap**, then measure. Keep **metadata** (source, page, section title) with every chunk for filtering and citations.
:::

## Step 2: retrieval — BM25 from scratch

:::def BM25
The classic keyword-ranking formula behind search engines. It scores a document higher when it contains the query's words **often**, when those words are **rare** across the collection, and adjusts for document length. Still a strong baseline — and a great partner to embeddings.
:::

```python run level=advanced
import math
import re
from collections import Counter

def tokenize(text):
    return re.findall(r"[a-z0-9]+", text.lower())

class BM25:
    def __init__(self, docs, k1=1.5, b=0.75):
        self.docs = [tokenize(d) for d in docs]
        self.k1, self.b = k1, b
        self.avgdl = sum(map(len, self.docs)) / len(self.docs)
        df = Counter(term for d in self.docs for term in set(d))
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def score(self, query, i):
        tf = Counter(self.docs[i])
        dl = len(self.docs[i])
        s = 0.0
        for term in tokenize(query):
            if term in tf:
                f = tf[term]
                s += self.idf[term] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * dl / self.avgdl))
        return s

    def search(self, query, k=3):
        scores = [(self.score(query, i), i) for i in range(len(self.docs))]
        return sorted(scores, reverse=True)[:k]

chunks = [
    "The Quick Wash program takes 30 minutes.",
    "The Eco program saves 40% energy but takes 3 hours.",
    "Error E21 means the drain is blocked. Clean the filter behind the front-left panel.",
    "Error E35 means the door is not closed properly.",
    "The warranty lasts 2 years and covers the motor for 10 years.",
    "To descale, run the Clean program monthly with an empty drum.",
]
bm25 = BM25(chunks)
for q in ["what does error E21 mean", "how long is the warranty on the motor", "energy saving program"]:
    print(f"\nQ: {q}")
    for score, i in bm25.search(q, k=2):
        print(f"  {score:5.2f}  {chunks[i]}")
```

## Step 3: augment the prompt

```python run level=intermediate
def build_rag_prompt(question, retrieved):
    sources = "\n".join(
        f'<source id="{i + 1}" doc="{c["doc"]}" page="{c["page"]}">\n{c["text"]}\n</source>'
        for i, c in enumerate(retrieved)
    )
    return f"""Answer the question using ONLY the sources below.
- Cite the sources you used like [1] or [2].
- If the sources don't contain the answer, say "I couldn't find that in the manual."

<sources>
{sources}
</sources>

<question>{question}</question>"""

retrieved = [
    {"doc": "X200 manual", "page": 14, "text": "Error E21 means the drain is blocked. Clean the filter behind the front-left panel."},
    {"doc": "X200 manual", "page": 15, "text": "Error E35 means the door is not closed properly."},
]
print(build_rag_prompt("My machine shows E21, what do I do?", retrieved))
```

## A complete RAG pipeline (runs here)

Everything together: chunk → index (BM25 + TF-IDF vectors) → hybrid retrieve → prompt → a stand-in "generator" that answers from the retrieved text with citations. Swap `fake_generate` for a real Claude call and it's production-shaped.

```python run level=advanced
import math
import re
import numpy as np
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer

# ---------- 1. documents ----------
DOCS = {
    "x200-manual.md": """The X200 washing machine has 12 programs. The Quick Wash program takes 30 minutes.
The Eco program saves 40% energy but takes 3 hours. Error E21 means the drain is blocked.
To fix E21, clean the filter behind the front-left panel. Error E35 means the door is not closed properly.""",
    "warranty.md": """The X200 warranty lasts 2 years from purchase. The motor is covered for 10 years.
Damage caused by limescale is not covered. Keep your receipt to make a claim.""",
    "care-guide.md": """Run the Clean program once a month with an empty drum to remove limescale and odours.
Leave the door open after washing so the drum can dry. Use a low-foam detergent.""",
}

# ---------- 2. chunk ----------
def chunk(text, max_chars=160):
    out, cur = [], ""
    for s in re.split(r"(?<=[.!?])\s+", text.strip()):
        if cur and len(cur) + len(s) > max_chars:
            out.append(cur.strip()); cur = ""
        cur += " " + s
    return out + ([cur.strip()] if cur.strip() else [])

chunks = [{"doc": name, "text": c} for name, text in DOCS.items() for c in chunk(text)]

# ---------- 3. index: lexical (BM25) + vector (TF-IDF) ----------
tok = lambda t: re.findall(r"[a-z0-9]+", t.lower())
toks = [tok(c["text"]) for c in chunks]
avgdl = sum(map(len, toks)) / len(toks)
df = Counter(t for d in toks for t in set(d))
idf = {t: math.log(1 + (len(toks) - f + 0.5) / (f + 0.5)) for t, f in df.items()}
def bm25(q, d, k1=1.5, b=0.75):
    tf = Counter(d)
    return sum(idf[t] * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * len(d) / avgdl)) for t in tok(q) if t in tf)

vec = TfidfVectorizer(sublinear_tf=True).fit([c["text"] for c in chunks])
X = vec.transform([c["text"] for c in chunks])

# ---------- 4. hybrid retrieval with Reciprocal Rank Fusion ----------
def retrieve(question, k=3):
    lexical = sorted(range(len(chunks)), key=lambda i: -bm25(question, toks[i]))
    vector = list(np.argsort(-(X @ vec.transform([question]).T).toarray().ravel()))
    rrf = Counter()
    for ranking in (lexical, vector):
        for rank, i in enumerate(ranking):
            rrf[i] += 1 / (60 + rank)          # RRF: reward items ranked high in either list
    return [chunks[i] for i, _ in rrf.most_common(k)]

# ---------- 5. generate (stand-in for the LLM) ----------
STOP = {"the", "is", "how", "what", "my", "a", "do", "i", "for", "does", "it", "in", "can", "should", "be", "by", "of", "to"}

def fake_generate(question, sources):
    """Pick the best-supported sentence from the sources; refuse if nothing matches well.
    A real LLM writes a fluent answer — but it should behave the same way: answer from sources, or say so."""
    q = set(tok(question)) - STOP
    best = (0, None, None)
    for i, src in enumerate(sources, 1):
        for sentence in re.split(r"(?<=[.!?])\s+", src["text"]):
            overlap = len(q & set(tok(sentence)))
            if overlap > best[0]:
                best = (overlap, sentence, i)
    if best[0] < 2:
        return "I couldn't find that in the documentation."
    return f"{best[1]} [{best[2]}]"

def answer(question):
    sources = retrieve(question)
    reply = fake_generate(question, sources)
    print(f"\nQ: {question}\nA: {reply}")
    for i, s in enumerate(sources, 1):
        print(f"   [{i}] {s['doc']}: {s['text'][:70]}…")

answer("What does error E21 mean?")
answer("Is the motor covered by the warranty?")
answer("How often should I run the Clean program?")
answer("Can I wash shoes in it?")
```

:::def Hybrid search & Reciprocal Rank Fusion (RRF)
**Hybrid search** combines keyword retrieval (great for exact terms like "E21", product codes, names) with vector retrieval (great for paraphrases and meaning). **RRF** merges the two rankings by summing `1 / (60 + rank)` from each list — simple, robust, and used by many production systems.
:::

## RAG with Claude (run locally)

```python local title="rag_claude.py"
import anthropic

client = anthropic.Anthropic()

def rag_answer(question: str, retrieved: list[dict]) -> str:
    sources = "\n\n".join(
        f'<source id="{i}" title="{c["doc"]}">\n{c["text"]}\n</source>' for i, c in enumerate(retrieved, 1)
    )
    response = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=2048,
        system=("You answer questions about the X200 washing machine using only the provided sources. "
                "Cite sources like [1]. If the answer isn't in the sources, say you couldn't find it."),
        messages=[{"role": "user", "content": f"<sources>\n{sources}\n</sources>\n\n<question>{question}</question>"}],
    )
    return "".join(b.text for b in response.content if b.type == "text")
```

### Built-in citations

Claude can also cite **exact passages** for you: pass the documents as `document` content blocks with citations enabled, and the response's text blocks carry `citations` pointing to the quoted spans.

```python local title="Native citations"
import anthropic

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=2048,
    messages=[{
        "role": "user",
        "content": [
            {"type": "document", "source": {"type": "text", "media_type": "text/plain", "data": "Error E21 means the drain is blocked. Clean the filter behind the front-left panel."},
             "title": "X200 manual p.14", "citations": {"enabled": True}},
            {"type": "text", "text": "My washer shows E21. What should I do?"},
        ],
    }],
)
for block in response.content:
    if block.type == "text":
        print(block.text)
        for c in (block.citations or []):
            print(f'   ↳ "{c.cited_text}" — {c.document_title}')
```

## Making RAG accurate

Most RAG failures are **retrieval** failures: the right chunk never reached the model.

| Technique | What it does |
|---|---|
| **Hybrid search** | keyword + vector, fused with RRF |
| **Reranking** | retrieve ~50 candidates cheaply, then re-score the top ones with a stronger **cross-encoder** / reranker model and keep the best 5 |
| **Query rewriting** | have the LLM rewrite a vague or conversational question ("what about the other one?") into a standalone search query |
| **Multi-query / HyDE** | search with several rephrasings, or with a hypothetical answer, and merge results |
| **Metadata filters** | restrict by product, date, language, user permissions *before* similarity search |
| **Contextual chunks** | prepend a short description of where a chunk comes from ("From the X200 manual, troubleshooting section: …") before embedding — this alone can cut retrieval failures substantially |
| **Parent-document retrieval** | match on small chunks, but send the larger surrounding section to the model |
| **Good chunking** | respect document structure; keep tables and code intact |

```python run level=advanced
# Contextual chunk headers: give each chunk the context it lost when it was cut out of the document
chunks = [
    {"doc": "X200 Manual", "section": "Troubleshooting", "text": "If it shows this code, clean the filter."},
    {"doc": "X200 Manual", "section": "Error codes", "text": "E21: drain blocked."},
]
for c in chunks:
    contextual = f"[{c['doc']} › {c['section']}] {c['text']}"
    print(contextual)
# Embed/index the contextual text; show the original text to users.
```

## Evaluating RAG

Measure the two halves separately:

:::def Retrieval metrics: recall@k and MRR
**Recall@k**: for how many test questions did the correct chunk appear in the top-k results? **MRR** (mean reciprocal rank): on average, how high was the first correct chunk ranked (1/rank)?
:::

:::def Faithfulness (groundedness)
Whether every claim in the answer is supported by the retrieved sources. An answer can be correct but unfaithful (it came from the model's memory) or faithful but wrong (bad sources). An LLM judge or human review checks it.
:::

```python run level=advanced
# Tiny retrieval eval: questions with the id of the chunk that contains the answer
results = {                     # question -> ranked chunk ids returned by your retriever
    "what is E21": [2, 3, 0],
    "motor warranty length": [4, 1, 2],
    "eco program duration": [0, 1, 5],
    "how to descale": [5, 0, 2],
}
gold = {"what is E21": 2, "motor warranty length": 4, "eco program duration": 1, "how to descale": 5}

def recall_at_k(k):
    return sum(gold[q] in ranked[:k] for q, ranked in results.items()) / len(results)

mrr = sum(1 / (ranked.index(gold[q]) + 1) if gold[q] in ranked else 0 for q, ranked in results.items()) / len(results)
print(f"recall@1 = {recall_at_k(1):.2f}   recall@3 = {recall_at_k(3):.2f}   MRR = {mrr:.2f}")
```

:::ai RAG in the real world
Customer-support bots over help-centre articles, internal "ask our docs" assistants, legal and medical search with citations, code assistants over a repository, and chat-with-your-PDF apps are all RAG. With very large context windows you can sometimes just paste whole documents in (plus prompt caching) — but RAG still wins on cost, latency, freshness and access control when the knowledge base is large.
:::

## Check yourself

```quiz
? What problem does RAG mainly solve?
+ Giving the model access to specific, up-to-date or private knowledge it wasn't trained on
- Making the model faster
- Teaching the model a new writing style
> It retrieves facts into the prompt at question time.

? Why use overlap between chunks?
+ So ideas that span a chunk boundary still appear intact in at least one chunk
- To make the index smaller
- Because embeddings require it
> Overlap trades a little storage for fewer "cut in half" facts.

? A user searches for the exact error code "E35". Which retrieval method is most reliable?
+ Keyword search (BM25), ideally as part of hybrid search
- Pure vector search
- No retrieval
> Embeddings can blur exact codes; lexical search matches them precisely.

? Your RAG bot gives wrong answers. What should you check first?
+ Whether the right chunks were retrieved (retrieval recall)
- The model's temperature
- The font of the documents
> Most RAG failures are retrieval failures.
```

:::exercise Add a metadata filter
Using the complete pipeline above as a starting point, add a `doc_filter` argument to `retrieve()` so that only chunks whose `doc` is in the given set are considered. Test `answer`-style retrieval for "How long does it last?" with `doc_filter={"warranty.md"}` and print the top chunk.
:::

:::solution
```python run
import re
from collections import Counter

chunks = [
    {"doc": "x200-manual.md", "text": "The Eco program saves 40% energy but takes 3 hours."},
    {"doc": "x200-manual.md", "text": "The Quick Wash program takes 30 minutes."},
    {"doc": "warranty.md", "text": "The X200 warranty lasts 2 years from purchase."},
    {"doc": "warranty.md", "text": "The motor is covered for 10 years."},
]
tok = lambda t: re.findall(r"[a-z0-9]+", t.lower())

def retrieve(question, k=2, doc_filter=None):
    pool = [c for c in chunks if doc_filter is None or c["doc"] in doc_filter]
    q = Counter(tok(question))
    return sorted(pool, key=lambda c: -sum((Counter(tok(c["text"])) & q).values()))[:k]

print(retrieve("How long does it last?")[0]["text"])
print(retrieve("How long does it last?", doc_filter={"warranty.md"})[0]["text"])
```
:::

:::keypoints
- RAG = **retrieve** relevant chunks → **augment** the prompt → **generate** a grounded, cited answer.
- Indexing: load → clean → **chunk** (with overlap + metadata) → embed/index → store.
- Use **hybrid search** (BM25 + vectors, fused with RRF), **reranking**, query rewriting and metadata filters.
- Instruct the model to answer **only from sources**, cite them, and admit when the answer isn't there.
- Evaluate retrieval (**recall@k**, MRR) and generation (**faithfulness**) separately.
:::
