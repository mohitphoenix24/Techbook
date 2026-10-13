---
title: Advanced RAG — Contextual, Graph, Agentic and Multimodal
level: advanced
time: 55
summary: What to reach for when baseline hybrid RAG plateaus. Contextual retrieval, hierarchical summaries (RAPTOR), knowledge-graph retrieval (GraphRAG, LightRAG), agentic and iterative RAG with sufficiency checks, corrective and self-reflective RAG, retrieval over structured data, and multimodal and visual document retrieval. Each with when it pays off, what it costs, and a runnable core.
---

A solid baseline (good parsing, structure-aware chunks with context, hybrid search, reranking, grounded generation) handles most question-answering over documents. When the evals show a **specific class** of failures that the baseline cannot fix, these techniques extend it. Use them like a doctor uses treatments: **diagnose first** (lesson 11), then pick the one that targets the failure.

## Diagnosis → technique

| Failure class you measure | Technique |
|---|---|
| Right doc, but the chunk lacks context to match | **Contextual retrieval** |
| Questions about themes, summaries, "what are the main risks across all documents?" | **Hierarchical summaries (RAPTOR)**, **GraphRAG** |
| Questions needing relationships between entities across documents (multi-hop) | **Knowledge graph retrieval**, **agentic multi-step retrieval** |
| One search is not enough; the question needs exploring | **Agentic RAG** (iterative, tool-based) |
| Retrieval sometimes returns junk and the model trusts it | **Corrective / self-reflective RAG** |
| Answers are in tables, SQL databases, APIs | **Structured retrieval: text-to-SQL, tools** |
| Answers are in charts, scanned pages, slides | **Multimodal / visual retrieval** |

## 1. Contextual retrieval

Chunks lose their surroundings when split. **Contextual retrieval** ([Anthropic](https://www.anthropic.com/news/contextual-retrieval)) has an LLM write a 1–2 sentence description situating each chunk within its document, and prepends it before embedding **and** BM25 indexing:

```text
Original chunk:      "Revenue grew 3% over the previous quarter."
Contextualised:      "This chunk is from ACME Corp's Q2 2026 earnings report; the previous quarter's revenue was $314M.
                      Revenue grew 3% over the previous quarter."
```

Reported results: it reduces failed retrievals substantially, more so when combined with BM25 and reranking. The cost problem (one LLM call per chunk with the whole document in the prompt) is tamed by **prompt caching**: the document is cached once and each chunk's call reads it cheaply.

```python local title="Generate chunk context with prompt caching"
def contextualise(document, chunk):
    r = client.messages.create(
        model="claude-haiku-5-5", max_tokens=150,
        system=[{"type": "text", "text": f"<document>\n{document}\n</document>", "cache_control": {"type": "ephemeral"}}],   # cached across chunks
        messages=[{"role": "user", "content": f"<chunk>\n{chunk}\n</chunk>\nWrite 1-2 sentences situating this chunk within the overall document, to improve search retrieval of the chunk. Answer only with the context."}],
    )
    return r.content[0].text + "\n" + chunk
```

## 2. Hierarchical summaries (RAPTOR)

Baseline RAG retrieves local passages, so it struggles with *"What are the main themes in this 300-page report?"* **RAPTOR** ([paper](https://arxiv.org/abs/2401.18059)) builds a **tree**: cluster chunks, summarise each cluster, cluster the summaries, summarise again, up to a root. All nodes (leaves and summaries) are indexed, so a high-level question matches a high-level summary, and a detail question matches a leaf.

```python run title="Build a two-level summary tree and retrieve at the right level" level=advanced
import numpy as np, re, zlib

DIM = 192
def embed(text):
    v = np.zeros(DIM)
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        for i in range(max(1, len(w) - 2)):
            h = zlib.crc32(w[i:i + 3].encode()); v[h % DIM] += 1 if (h >> 8) & 1 else -1
    n = np.linalg.norm(v); return v / n if n else v

leaves = [
    "Risk: supplier concentration. 60% of components come from one vendor in one region.",
    "Risk: currency exposure. 40% of revenue is in euros while costs are in dollars.",
    "Growth: the enterprise segment grew 25% year over year.",
    "Growth: the self-serve segment grew 8% and churn fell to 2%.",
    "People: engineering headcount rose from 120 to 180 this year.",
    "People: attrition was 9%, below the industry average.",
]
# a stand-in summariser: a real system asks an LLM to summarise each cluster
summaries = {
    "risks":  "Summary of risks: supplier concentration and currency exposure are the main business risks.",
    "growth": "Summary of growth: enterprise grew 25% and self-serve 8% with falling churn.",
    "people": "Summary of people: headcount grew to 180 and attrition is low.",
}
cluster_of = {0: "risks", 1: "risks", 2: "growth", 3: "growth", 4: "people", 5: "people"}

nodes = [("leaf", i, t) for i, t in enumerate(leaves)] + [("summary", k, t) for k, t in summaries.items()]
E = np.stack([embed(t) for _, _, t in nodes])

def retrieve(q, k=2):
    s = E @ embed(q)
    return [(nodes[i][0], nodes[i][2][:70], round(float(s[i]), 2)) for i in np.argsort(-s)[:k]]

print("high-level question:", retrieve("what are the main risks of the business"))
print("detail question    :", retrieve("how much did the enterprise segment grow"))
```

Cost: summarisation calls at index time, and a rebuild when documents change. Worth it for **long, thematic** corpora (reports, books, transcripts).

## 3. Knowledge-graph retrieval (GraphRAG and friends)

Some questions are about **relationships**: *"Which suppliers provide components used in products affected by the recall?"* A vector index sees passages; a **graph** of entities and relations can **traverse** them.

**GraphRAG** ([Microsoft paper](https://arxiv.org/abs/2404.16130), [repo](https://github.com/microsoft/graphrag)): an LLM extracts entities and relationships from chunks into a graph, detects **communities** (clusters of tightly connected entities), and writes a summary per community. *Local* questions retrieve entity neighbourhoods; *global* questions ("What are the main themes?") use the community summaries (map-reduce over them). **LightRAG** ([paper](https://arxiv.org/abs/2410.05779)) is a lighter variant combining entity and relation retrieval at lower cost.

```python run title="Entity graph retrieval: find chunks by walking relations" level=advanced
from collections import defaultdict

# (subject, relation, object, chunk_id) triples extracted by an LLM at index time
triples = [
    ("RecallA", "affects", "ProductX", "c1"),
    ("ProductX", "contains", "Pump7", "c2"),
    ("Pump7", "supplied_by", "AcmeParts", "c3"),
    ("ProductY", "contains", "Pump9", "c4"),
    ("Pump9", "supplied_by", "BoltCo", "c5"),
]
chunks = {"c1": "Recall A affects Product X units built in 2025.", "c2": "Product X contains the Pump 7 assembly.",
          "c3": "Pump 7 is supplied by Acme Parts.", "c4": "Product Y contains Pump 9.", "c5": "Pump 9 is supplied by BoltCo."}

graph = defaultdict(list)
for s, r, o, c in triples:
    graph[s].append((r, o, c)); graph[o].append((f"~{r}", s, c))      # keep both directions

def multi_hop(start, hops=3):
    frontier, seen, evidence = {start}, {start}, []
    for _ in range(hops):
        nxt = set()
        for node in frontier:
            for rel, other, c in graph[node]:
                if other not in seen and not rel.startswith("~"):      # follow edges forward
                    seen.add(other); nxt.add(other); evidence.append((node, rel, other, c))
        frontier = nxt
    return evidence

for s, r, o, c in multi_hop("RecallA"):
    print(f"{s} --{r}--> {o}   evidence: {chunks[c]}")
```

A pure vector search for "Which suppliers are affected by Recall A?" would rarely retrieve all three linked chunks, because no single chunk mentions both the recall and the supplier. Traversal connects them.

Costs and cautions: graph extraction needs many LLM calls and quality varies; graphs go stale; entity resolution (are "Acme Parts" and "ACME" the same?) is hard. Use when relationship questions are a real share of traffic.

## 4. Agentic RAG: retrieval as a tool in a loop

Instead of a fixed pipeline, give the LLM a **search tool** and let it **plan**: search, read results, decide whether it has enough, reformulate, search again, call other tools, then answer. This handles multi-hop and exploratory questions and adapts effort to difficulty ([survey](https://arxiv.org/abs/2501.09136)). Many deep-research products work this way. The cost is **latency, tokens and variance**, plus new failure modes (loops, premature stopping). Use budgets, step caps and evals on whole trajectories.

```python run title="Iterative retrieval with a sufficiency check" level=advanced
KB = {
    "who wrote the refund policy": "The refund policy was written by Dana Ortiz (Legal).",
    "who manages dana ortiz": "Dana Ortiz reports to Priya Rao, Head of Legal.",
    "priya rao location": "Priya Rao works from the Dublin office.",
}

def search(query):
    q = set(query.lower().split())
    best = max(KB, key=lambda k: len(q & set(k.split())))
    return KB[best] if len(q & set(best.split())) >= 2 else "no result"

def fake_agent(question, max_steps=5):
    """Stands in for an LLM that plans: search, read, decide what to ask next, stop when it can answer."""
    notes, query = [], "who wrote the refund policy"
    for step in range(1, max_steps + 1):
        result = search(query)
        notes.append((query, result))
        print(f"step {step}: search {query!r} -> {result}")
        if "Dana Ortiz (Legal)" in result:      query = "who manages dana ortiz"
        elif "reports to Priya Rao" in result:  query = "priya rao location"
        else:
            break                               # sufficient (or stuck)
    return notes

_ = fake_agent("In which office does the manager of the refund policy's author work?")
```

Real agents decide the next query with an LLM; the loop structure (act, observe, decide) is exactly the agent loop of module 5. Always set a **maximum number of steps** and a **token budget**.

## 5. Corrective and self-reflective RAG

Baseline RAG blindly trusts what it retrieves. **Corrective RAG (CRAG)** adds a **retrieval evaluator**: grade each retrieved chunk (relevant / ambiguous / irrelevant); if the evidence is poor, **fall back** (rewrite the query, search the web, or answer "not found"). **Self-RAG** ([paper](https://arxiv.org/abs/2310.11511)) trains the model to emit reflection tokens deciding *whether to retrieve*, and critiquing relevance and support. You can approximate both with prompts and a grader step.

:::flow Corrective RAG
Retrieve | initial candidates
Grade | an evaluator scores each chunk's relevance
Decide | good → generate; ambiguous → rewrite query and retry; bad → fall back (web search / refuse)
Generate | with only the chunks that passed
Verify | check support before showing the answer
:::

## 6. Structured data: SQL and APIs

Not everything is prose. Questions like *"How many orders did Acme place in Q2?"* belong to **text-to-SQL** or an **API tool**: the LLM writes a query against a **known schema**, you run it with a **read-only, row-limited, allow-listed** connection, and the model explains the result. Retrieve the schema (and a few example queries) into the prompt, validate generated SQL (parse it; allow only `SELECT`; limit rows and time), and log it. Combine with document RAG through routing.

## 7. Multimodal and visual retrieval

- **Captioning approach:** describe images, charts and slides with a VLM, then index the descriptions as text (simple, lossy).
- **Multimodal embeddings:** embed images and text in one space (CLIP-style) so a text query retrieves images, and a screenshot retrieves related text.
- **Visual document retrieval (ColPali):** treat each **page as an image**, embed it with a vision-language model producing multi-vector (late-interaction) representations, and retrieve pages directly, skipping OCR and layout parsing ([paper](https://arxiv.org/abs/2407.01449)). Excellent for slide decks, scanned documents and layout-heavy PDFs, at the price of larger indexes and VLM inference.
- Pass the **retrieved page images** to a vision-capable generator, citing page numbers.

## Cost and complexity ladder

| Level | Components | Add it when |
|---|---|---|
| 0 | embeddings + generation | prototypes |
| 1 | + hybrid + rerank + good chunking + citations | **most products stop here** |
| 2 | + contextual retrieval, query rewriting, routing | recall or conversational failures remain |
| 3 | + hierarchical summaries / graph / structured tools | thematic, relational or numeric questions matter |
| 4 | + agentic loops, corrective RAG | open-ended research tasks justify latency and cost |

Each step multiplies pipeline complexity, latency, cost and ways to fail. **Earn each one with an eval.**

```quiz
? Which technique is best for "What are the main themes across this 300-page report?"
- Smaller chunks
+ Hierarchical summaries (RAPTOR) or GraphRAG community summaries
- A bigger embedding dimension
> Thematic questions need retrieval at a higher level of abstraction than single passages.

? Why does agentic RAG add cost?
+ It makes several LLM and search calls per question, with variable length and new failure modes
- It needs a different database
- It removes the need for evaluation
> Use step caps, budgets and trajectory evals.

? What does contextual retrieval add to each chunk?
+ An LLM-written description situating it in its document, before embedding and BM25 indexing
- A citation
- A bigger vector
> It restores context lost by chunking.

? How should text-to-SQL be made safe?
- Give the model admin access
+ Use a read-only, allow-listed, row- and time-limited connection with validated SELECT-only queries
- Trust the model's output
> Treat generated SQL as untrusted input.
```

:::problem Sales wants answers to "Which of our customers use the product affected by incident 4471?" over incident reports and CRM notes. Choose an approach. {level=hard tags="graphrag,multi-hop,design"}
Justify and sketch the pipeline.

:::solution Model answer
This is a **multi-hop relational** question (incident → product → customers). Baseline RAG would rarely connect all pieces. Options: (a) **knowledge graph**: extract entities (incident, product, customer) and relations from reports and CRM, store in a graph or relational tables, and answer by traversal; (b) **agentic RAG with tools**: step 1 search incident 4471 → product; step 2 call a CRM tool "customers using product X"; step 3 answer with citations. Since customers live in a **structured CRM**, prefer (b) with a SQL/API tool for the second hop, using RAG only for the incident text. Add evals on multi-hop questions, permission filtering on CRM data, and step/token budgets.
:::
:::

:::keypoints
- Diagnose failures first, then add the technique that targets them; most products need only level 1 (hybrid, rerank, good chunks, citations).
- Contextual retrieval restores chunk context; RAPTOR and GraphRAG serve thematic and relational questions.
- Agentic RAG searches iteratively with a budget; corrective/self-reflective RAG grades evidence and falls back.
- Use SQL and API tools for structured data; use visual retrieval (ColPali) for layout-heavy documents.
- Every added component costs latency, tokens and failure modes: earn it with evals.
:::

:::resources
- [Anthropic: Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) — measured improvements and the caching trick.
- [GraphRAG paper](https://arxiv.org/abs/2404.16130), [Microsoft GraphRAG](https://github.com/microsoft/graphrag), [LightRAG](https://arxiv.org/abs/2410.05779) — graph-based retrieval.
- [RAPTOR](https://arxiv.org/abs/2401.18059) — recursive abstractive processing for tree-organised retrieval.
- [Agentic RAG survey](https://arxiv.org/abs/2501.09136) and [Self-RAG](https://arxiv.org/abs/2310.11511) — agentic and reflective approaches.
- [ColPali](https://arxiv.org/abs/2407.01449) — visual document retrieval.
- [NirDiamant/RAG_Techniques](https://github.com/NirDiamant/RAG_Techniques) — runnable notebooks for most techniques above.
:::
