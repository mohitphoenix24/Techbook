---
title: Query Transformation — Fixing the Question Before Searching
level: intermediate
time: 40
summary: Users do not write good search queries. Rewrite conversational follow-ups into standalone questions, expand with multiple queries, generate hypothetical answers (HyDE), take a step back, decompose multi-part questions, extract metadata filters, and route to the right index or tool. With runnable rewriting, multi-query fusion and decomposition on a simulated model.
---

The retriever answers the query it receives, not the question in the user's head. Real queries are short ("refund?"), conversational ("and for the other model?"), ambiguous, multi-part, or phrased in the user's vocabulary rather than your documents'. **Query transformation** puts a small, cheap model step between the user and the index to turn what was typed into what should be searched.

## The toolbox

| Technique | What it does | Fixes |
|---|---|---|
| **Conversational rewrite** | merge chat history into a standalone question | "and what about the Pro plan?" |
| **Multi-query expansion** | generate several rephrasings, search all, fuse | vocabulary mismatch; recall |
| **HyDE** | write a *hypothetical answer* and search with its embedding ([paper](https://arxiv.org/abs/2212.10496)) | short or abstract queries |
| **Step-back** | ask a more general question first | very specific queries missing context |
| **Decomposition** | split a multi-part question into sub-questions | comparisons, multi-hop questions |
| **Metadata / filter extraction** ("self-query") | parse filters from the text | "2025 invoices for Acme" |
| **Routing / classification** | choose the index, tool, or no retrieval at all | chit-chat, SQL-answerable, multiple knowledge bases |
| **Keyword extraction** | produce a BM25-friendly query | exact-term matching |

Each costs an LLM call (use a **small, fast model**) and adds latency, so apply them where evaluation shows gains, and skip them for easy queries.

## 1. Rewrite follow-ups into standalone queries

Embedding "and for the Pro plan?" retrieves garbage. Combine it with history:

```text
Conversation:
User: What is the refund window for the X200?
Assistant: 30 days from delivery.
User: and for the Pro plan?

Rewrite the last user message as a standalone question, using the conversation for context.
Return only the question.
→ "What is the refund window for the Pro plan?"
```

```python run title="Standalone-question rewriting (with a stand-in model)" level=easy
def rewrite_prompt(history, followup):
    turns = "\n".join(f"{r}: {t}" for r, t in history)
    return (f"Conversation:\n{turns}\nUser: {followup}\n\n"
            "Rewrite the last user message as a standalone search question. Keep names and numbers. Return only the question.")

def fake_rewriter(history, followup):
    """A stand-in LLM: resolves 'and for X?' using the last topic mentioned in the history."""
    last_user = [t for r, t in history if r == "User"][-1]
    base = last_user.rstrip("?")
    if followup.lower().startswith("and for "):
        subject = followup[8:].rstrip("?")
        return f"{base.rsplit(' for ', 1)[0]} for {subject}?"
    return followup

history = [("User", "What is the refund window for the X200?"), ("Assistant", "30 days from delivery.")]
print(rewrite_prompt(history, "and for the Pro plan?"))
print("\nrewritten ->", fake_rewriter(history, "and for the Pro plan?"))
```

Keep the **original question too** in what you show the final model, so nuance is not lost.

## 2. Multi-query: cast a wider net

Ask the model for 3–5 alternative phrasings (synonyms, different levels of detail), run retrieval for each, and fuse the results with RRF. This raises recall when users and documents use different words.

```python run title="Multi-query retrieval with fusion" level=intermediate
import numpy as np, re, zlib

DIM = 192
def embed(text):
    v = np.zeros(DIM)
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        for i in range(max(1, len(w) - 2)):
            h = zlib.crc32(w[i:i + 3].encode()); v[h % DIM] += 1 if (h >> 8) & 1 else -1
    n = np.linalg.norm(v); return v / n if n else v

docs = ["Our refund policy lasts 30 days from delivery.",
        "To return an item, print the prepaid return label from your order page.",
        "Shipping takes three to five business days.",
        "Money-back guarantee: return unused products for a full reimbursement.",
        "The warranty lasts 2 years and covers the motor for 10 years."]
E = np.stack([embed(d) for d in docs])

def search(q, k=3): return list(np.argsort(-(E @ embed(q)))[:k])

def rrf(lists, k=60):
    s = {}
    for lst in lists:
        for r, d in enumerate(lst, 1): s[d] = s.get(d, 0) + 1 / (k + r)
    return [d for d, _ in sorted(s.items(), key=lambda kv: -kv[1])]

original = "how do I get my money back"
variants = [original, "refund policy", "return an item for reimbursement", "money-back guarantee conditions"]   # what an LLM would produce
print("single query :", [docs[i][:40] for i in search(original, 2)])
print("multi-query  :", [docs[i][:40] for i in rrf([search(v) for v in variants])[:2]])
```

## 3. HyDE: search with a hypothetical answer

Questions and answers look different in embedding space: "What is the refund window?" is not very close to "Refunds are accepted within 30 days." **HyDE** ([paper](https://arxiv.org/abs/2212.10496)) asks the LLM to *write a plausible answer* (it may be wrong in details) and embeds **that** to search. The answer shares vocabulary and style with real answers, so it lands nearer to the real passage. Works well for short or abstract queries; costs an LLM call; and can mislead if the hypothetical answer is off-topic, so evaluate.

```python local title="HyDE with an LLM call"
hypo = client.messages.create(
    model="claude-haiku-5-5", max_tokens=200,
    messages=[{"role": "user", "content": f"Write a short passage from a user manual that would answer this question. Be specific even if you must guess.\n\nQuestion: {question}"}],
).content[0].text
hits = vector_search(embed(hypo), k=20)          # search with the passage embedding instead of the question
```

## 4. Step-back and decomposition

- **Step-back:** for "Why does E21 appear after the Eco program?" first ask "What causes E21?" (more general), retrieve for both, and answer from the union.
- **Decomposition:** a question like *"Compare the warranty and refund terms of the X200 and the Pro"* becomes four sub-queries. Retrieve for each, then answer with all results. Multi-hop questions (*"Who manages the author of the refund policy?"*) require **sequential** sub-questions where the answer to one becomes part of the next.

```python run title="Decompose a comparison question and retrieve per part" level=intermediate
def decompose(question):
    """A stand-in for an LLM that returns sub-queries as JSON."""
    if "compare" in question.lower():
        products = ["X200", "Pro"]
        topics = ["warranty", "refund policy"]
        return [f"{t} for the {p}" for p in products for t in topics]
    return [question]

KB = {
    "warranty for the X200": "X200 warranty: 2 years, motor 10 years.",
    "refund policy for the X200": "X200 refunds: 30 days from delivery.",
    "warranty for the Pro": "Pro warranty: 3 years, parts and labour.",
    "refund policy for the Pro": "Pro refunds: 14 days, restocking fee 10%.",
}
q = "Compare the warranty and refund terms of the X200 and the Pro"
subs = decompose(q)
print("sub-queries:", subs)
context = [KB[s] for s in subs]
print("\n".join("  " + c for c in context))
```

## 5. Extract filters ("self-query")

Users mix semantic needs with structured constraints: *"unpaid invoices from Acme in 2025"*. Ask the model to output a **semantic query + a filter**, validated against your schema, then apply the filter in the vector database (never trust it blindly: validate field names and values).

```python run title="Query to (semantic part, metadata filter)" level=intermediate
import json, re

SCHEMA = {"customer": "str", "year": "int", "status": ["paid", "unpaid", "overdue"]}

def fake_parse(query):                       # stand-in for an LLM with structured output
    f = {}
    m = re.search(r"\b(20\d\d)\b", query)
    if m: f["year"] = int(m.group(1))
    for s in SCHEMA["status"]:
        if s in query.lower(): f["status"] = s
    m = re.search(r"from ([A-Z][a-z]+)", query)
    if m: f["customer"] = m.group(1)
    semantic = re.sub(r"\b(unpaid|paid|overdue|from [A-Z][a-z]+|in 20\d\d)\b", "", query).strip()
    return {"semantic_query": re.sub(r"\s+", " ", semantic), "filter": f}

def validate(filter_):
    return {k: v for k, v in filter_.items() if k in SCHEMA and (not isinstance(SCHEMA[k], list) or v in SCHEMA[k])}

parsed = fake_parse("unpaid invoices from Acme in 2025")
parsed["filter"] = validate(parsed["filter"])
print(json.dumps(parsed, indent=2))
```

## 6. Route the query

Not every query needs the same treatment:

```text
Classify the user message:
- "chitchat": greetings, thanks, no retrieval needed
- "faq": product/policy questions → search the help-centre index
- "account": questions about THEIR orders → call the order tool, no vector search
- "analytics": counting or summing records → generate SQL
- "unclear": ask a clarifying question
```

Routing saves cost and avoids pointless retrieval (and wrong answers built from irrelevant chunks). It can be a small classifier model, an LLM with a tight prompt, or a rules + embedding-similarity router.

## When to use what

| Problem you observe | Try |
|---|---|
| Follow-ups fail in chat | conversational rewrite |
| Right docs exist but use different vocabulary | multi-query, HyDE, hybrid search |
| Multi-part or comparison questions | decomposition |
| Questions with structured constraints | filter extraction |
| Wasted retrieval on non-knowledge queries | routing |
| Very short queries | HyDE, clarifying question |

:::warn Transformations can hurt
A rewrite can change meaning; a hypothetical answer can invent facts that steer retrieval wrongly; decomposition multiplies cost and latency. Log original and transformed queries, A/B them on your eval set, and keep the **original query** as one of the searches.
:::

```quiz
? Why rewrite a follow-up like "and for the Pro plan?" before retrieval?
- To shorten it
+ On its own it lacks context; a standalone question retrieves the right passages
- Search engines require full sentences
> Conversation history must be folded into the query.

? What does HyDE embed?
- The user's question
+ A hypothetical answer written by an LLM, which resembles real answer passages
- The document titles
> The hypothetical answer shares style and vocabulary with the target passages.

? A question compares two products on two attributes. Which technique helps most?
+ Decomposition into per-product, per-attribute sub-queries
- Higher temperature
- Bigger chunks
> Each sub-query retrieves precisely the needed facts.

? Why validate model-extracted metadata filters?
+ Invented field names or values could cause errors or, worse, leak data via a wrong filter
- They are always correct
- Validation speeds up search
> Treat LLM output as untrusted input to your query layer.
```

:::problem Design the query pipeline for a support chatbot with multi-turn chats, an FAQ index, a live order-status API, and an SQL analytics database. {level=medium tags="query,routing,design"}
Describe the steps and where an LLM is (not) needed.

:::solution Model answer
1) **Rewrite** the last message into a standalone question using the history (small model). 2) **Route** with a small classifier or LLM: chit-chat (no retrieval), FAQ (vector+BM25 over help-centre), account/order (call order-status tool with validated arguments), analytics (text-to-SQL with a read-only role and schema), unclear (ask). 3) For FAQ: optional **multi-query**, hybrid search, rerank, answer with citations. 4) For comparisons, **decompose**. 5) Extract filters (product, region) and validate. 6) Log original vs rewritten query and route decision; evaluate routing accuracy and end-to-end answers. Skip transformations for short, clear queries to save latency.
:::
:::

:::keypoints
- Transform the query to match how documents are written: rewrite follow-ups, expand, HyDE, step-back, decompose, extract filters, route.
- Use a small fast model; apply techniques only where evals show gains; keep the original query as one search.
- Multi-query plus RRF raises recall; decomposition handles comparisons and multi-hop questions.
- Always validate LLM-produced filters and tool arguments before use.
- Routing avoids unnecessary retrieval and sends questions to the right data source or tool.
:::

:::resources
- [HyDE: Precise Zero-Shot Dense Retrieval without Relevance Labels](https://arxiv.org/abs/2212.10496) — hypothetical document embeddings.
- [NirDiamant/RAG_Techniques](https://github.com/NirDiamant/RAG_Techniques) — notebooks for query rewriting, HyDE, decomposition and routing.
- [LlamaIndex docs](https://docs.llamaindex.ai) — query engines, routers and sub-question engines.
- [Retrieval-Augmented Generation for LLMs: A Survey](https://arxiv.org/abs/2312.10997) — the query-optimisation section.
- [Self-RAG](https://arxiv.org/abs/2310.11511) — letting the model decide when to retrieve and critique results.
- [LangGraph docs](https://langchain-ai.github.io/langgraph/) — build routing and rewriting as explicit graphs.
:::
