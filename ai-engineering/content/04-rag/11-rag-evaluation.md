---
title: Evaluating RAG — Retrieval and Generation Separately
level: intermediate
time: 50
summary: How to know whether your RAG system works and which part is broken. Building a test set (real and synthetic questions with gold passages), retrieval metrics (hit rate, recall@k, precision, MRR, nDCG) computed from scratch, generation metrics (faithfulness, answer relevance, context precision and recall), LLM judges, unanswerable questions, and a debugging matrix. Includes an interactive metrics explorer.
---

"It feels better" is not an evaluation. RAG has **two components that can fail independently**, retrieval and generation, so you measure them **separately** and **together**. This is also the foundation for module 6 (evals in general).

:::flow Evaluate RAG in layers
Retrieval | did the right passages come back? (recall@k, MRR, nDCG)
Context use | did the answer rely on them? (faithfulness / groundedness)
Answer quality | is it correct, complete, relevant? (correctness, answer relevance)
Behaviour | refuses unanswerable questions? cites correctly? safe?
System | latency, cost, failures
:::

## Step 1: build a test set

A good RAG eval set has rows like:

| question | gold passage ids | reference answer | type |
|---|---|---|---|
| What is the refund window for the X200? | `policy#3` | 30 days from delivery | factual |
| Compare X200 and Pro warranties | `manual#9`, `pro#2` | X200: 2y (motor 10y); Pro: 3y | multi-hop |
| Does the X200 support Wi-Fi? | (none) | "not in the documentation" | **unanswerable** |
| refund? | `policy#3` | 30 days | short / messy |

Sources of questions, in order of value:

1. **Real user questions** (logs, support tickets, search queries). Nothing beats these.
2. **Domain experts' questions**, especially the hard and high-stakes ones.
3. **Synthetic questions**: for each chunk, have an LLM write questions it answers, then filter. Fast and cheap, but skewed toward easy, chunk-shaped questions that echo the text, so use to bootstrap, not to finish.
4. **Adversarial cases**: typos, vague wording, outdated terms, out-of-scope questions, near-duplicates.

Start with **30–50 well-chosen examples** and grow it every time you find a bug (every production failure becomes a test). Record the **gold passages**, not just answers, so retrieval can be scored without an LLM.

```python run title="Synthesise questions from chunks (and why they flatter retrieval)" level=intermediate
import re

chunks = {
    "policy#3": "Unused products may be returned within 30 days of delivery for a full refund.",
    "manual#9": "The X200 warranty lasts 2 years and covers the motor for 10 years.",
    "manual#4": "Error E21 means the drain is blocked. Clean the filter behind the front-left panel.",
}

def fake_question_writer(text):
    """Stand-in for an LLM prompted: 'Write a question that this passage answers, without copying its wording.'"""
    templates = [(r"returned within (\d+) days", "How long do customers have to send an item back?"),
                 (r"warranty lasts (\d+) years", "How long is the machine covered?"),
                 (r"Error (E\d+) means", "What should I do when the machine shows {0}?")]
    for pat, q in templates:
        m = re.search(pat, text)
        if m: return q.format(*m.groups())

testset = [{"id": f"q{i}", "question": fake_question_writer(t), "gold": [cid]} for i, (cid, t) in enumerate(chunks.items())]
for row in testset:
    print(row)
```

An LLM instructed *not* to copy the wording produces more realistic questions. Even so, review a sample by hand.

## Step 2: retrieval metrics

Given the ranked list a retriever returns and the set of **relevant** passage ids:

| Metric | Question it answers | Formula (sketch) |
|---|---|---|
| **Hit rate@k** (success@k) | Was *any* relevant passage in the top k? | 1 if hit else 0, averaged |
| **Recall@k** | What fraction of *all* relevant passages are in the top k? | \|relevant ∩ top k\| / \|relevant\| |
| **Precision@k** | What fraction of the top k are relevant? | \|relevant ∩ top k\| / k |
| **MRR** | How high is the *first* relevant result? | average of 1 / rank of first relevant |
| **nDCG@k** | Are relevant results ranked *near the top* (graded relevance)? | DCG / ideal DCG |

Which to watch: for RAG the model reads the whole top-k, so **recall@k** (is the needed evidence there?) matters most; **precision@k** tracks noise; **MRR / nDCG** matter for ordering (long contexts, rerankers).

Experiment with the metrics: click results to mark them relevant, change k, and compare two systems.

```viz algo=retrievalmetrics title="Retrieval metrics explorer"
```

```python run title="Retrieval metrics from scratch" level=intermediate
import math

def recall_at_k(ranked, relevant, k):
    return len(set(ranked[:k]) & relevant) / len(relevant) if relevant else 0.0

def precision_at_k(ranked, relevant, k):
    return len(set(ranked[:k]) & relevant) / k

def hit_at_k(ranked, relevant, k):
    return 1.0 if set(ranked[:k]) & relevant else 0.0

def mrr(ranked, relevant):
    for i, d in enumerate(ranked, 1):
        if d in relevant: return 1.0 / i
    return 0.0

def ndcg_at_k(ranked, relevant, k):
    dcg = sum(1.0 / math.log2(i + 2) for i, d in enumerate(ranked[:k]) if d in relevant)
    ideal = sum(1.0 / math.log2(i + 2) for i in range(min(len(relevant), k)))
    return dcg / ideal if ideal else 0.0

# (ranked results, relevant set) for four test questions, from two retrievers
system_a = [(["p3", "p1", "p9", "p2"], {"p3"}), (["p1", "p9", "p9b", "p5"], {"p9", "p5"}), (["p7", "p8", "p2", "p3"], {"p3"}), (["p4", "p6", "p1", "p2"], {"p5"})]
system_b = [(["p3", "p9", "p1", "p2"], {"p3"}), (["p9", "p5", "p1", "p2"], {"p9", "p5"}), (["p3", "p7", "p8", "p2"], {"p3"}), (["p5", "p4", "p6", "p1"], {"p5"})]

for name, system in (("A (dense only)", system_a), ("B (hybrid + rerank)", system_b)):
    n = len(system)
    print(f"{name:20}",
          f"hit@3={sum(hit_at_k(r, s, 3) for r, s in system) / n:.2f}",
          f"recall@3={sum(recall_at_k(r, s, 3) for r, s in system) / n:.2f}",
          f"prec@3={sum(precision_at_k(r, s, 3) for r, s in system) / n:.2f}",
          f"MRR={sum(mrr(r, s) for r, s in system) / n:.2f}",
          f"nDCG@3={sum(ndcg_at_k(r, s, 3) for r, s in system) / n:.2f}")
```

## Step 3: generation metrics

With retrieval measured, ask whether the **answer** is good. The influential decomposition from the RAGAS paper ([paper](https://arxiv.org/abs/2309.15217)):

| Metric | Asks | How measured |
|---|---|---|
| **Faithfulness / groundedness** | Is every claim in the answer supported by the retrieved context? | split the answer into claims; check each against the context (NLI model or LLM judge) |
| **Answer relevance** | Does the answer address the question (not off-topic or incomplete)? | LLM judge, or embedding similarity to generated questions |
| **Context precision** | Are the retrieved chunks relevant (ranked well)? | LLM judge per chunk |
| **Context recall** | Does the retrieved context contain what is needed for the reference answer? | LLM compares to the reference answer |
| **Answer correctness** | Does it match the reference answer? | exact/fuzzy match for short answers, LLM judge for long ones |
| **Citation accuracy** | Do citations point at supporting passages? | verify in code (lesson 9) |
| **Refusal correctness** | Declines unanswerable questions; answers answerable ones? | labelled by the question type |

```python run title="A cheap faithfulness proxy (claim support by word overlap)" level=intermediate
import re

def claims(answer): return [s.strip() for s in re.split(r"(?<=[.!?])\s+", answer) if s.strip()]
def words(s): return set(re.findall(r"[a-z0-9%]+", s.lower())) - {"the", "a", "an", "of", "is", "are", "to", "and", "in", "for", "it", "you"}

def faithfulness(answer, context):
    ctx = words(context)
    supported = []
    for c in claims(answer):
        w = words(c)
        supported.append(len(w & ctx) / len(w) >= 0.7 if w else True)
    return sum(supported) / len(supported), supported

context = "Unused products may be returned within 30 days of delivery for a full refund. Shipping takes three to five days."
good = "Unused products can be returned within 30 days of delivery."
bad  = "Products can be returned within 30 days. Returns are free for premium members."
for name, ans in (("faithful", good), ("hallucinated", bad)):
    score, flags = faithfulness(ans, context)
    print(f"{name:13} faithfulness={score:.2f} per-claim={flags}")
```

Word overlap is a **crude proxy**; production uses an LLM judge or an NLI model for entailment (module 6 covers judge design and its biases). The structure is the same: **decompose into claims, check each against evidence.**

## Step 4: LLM-as-judge for RAG

A judge prompt compares answer, context and (optionally) a reference:

```text
You are grading a RAG answer. Use only the CONTEXT.
1. List each factual claim in the ANSWER.
2. For each claim, say SUPPORTED, CONTRADICTED or NOT_FOUND in CONTEXT, quoting evidence.
3. Output JSON: {"claims": [{"text": ..., "verdict": ..., "evidence": ...}], "faithfulness": <supported/total>}
```

Calibrate the judge: have humans grade ~50 examples, measure **agreement**, fix the prompt, and re-check periodically. Frameworks: **Ragas** ([docs](https://docs.ragas.io)), **DeepEval** ([site](https://deepeval.com)), **TruLens**, **promptfoo** ([docs](https://www.promptfoo.dev/docs/intro)), Langfuse and Phoenix evaluators.

## Step 5: diagnose with the matrix

Combine the metrics to find the broken part:

| Retrieval recall | Faithfulness | Answer correct | Diagnosis | Fix |
|---|---|---|---|---|
| low | n/a | low | **Retrieval failure** | parsing, chunking, embeddings, hybrid, rewrite, rerank |
| high | low | low | **Generation ignores/contradicts context** | prompt rules, fewer/cleaner chunks, stronger model, quote-first |
| high | high | low | **Context is wrong, stale or conflicting** | fix the knowledge base, versions, authority |
| high | high | high | healthy | monitor |
| low | high | high | answers from model memory (risky: not grounded) | tighten grounding; check for cutoff-date drift |

## Unanswerable and adversarial questions

Include 10–20% questions whose answer is **not in the corpus**, plus near-miss questions (a different product's warranty). Measure that the system **declines** rather than inventing. Track **false refusals** (declining answerable questions) as well; the two trade off against each other through your retrieval-confidence threshold.

## Run it as a regression test

1. Freeze the eval set and the scoring code in your repo.
2. Run it on **every change** to prompts, chunking, embeddings, retrieval parameters and models (the CI lesson in module 6).
3. Track metrics **per question type** and diff failures (what newly broke?).
4. Add every production bug to the set.
5. Keep a **held-out** subset you do not tune on, to detect overfitting.

```quiz
? Which retrieval metric best tells you whether the needed evidence reached the model?
- MRR
+ Recall@k
- Latency
> If the gold passage is in the top-k the model can use it; recall measures that directly.

? Retrieval recall is high but answers are wrong and faithfulness is low. What is the problem?
- Retrieval
+ Generation: the model is ignoring or contradicting the provided context
- The embedding dimension
> Fix prompt rules, context noise, or the model; the evidence was there.

? Why include unanswerable questions in the eval set?
+ To check the system declines instead of hallucinating
- To make the set larger
- They are easier
> Refusal behaviour is a core quality of a grounded system.

? What is a weakness of purely synthetic test questions?
+ They are biased toward easy, chunk-shaped questions that echo the source wording
- They cost too much
- LLMs cannot write questions
> Mix in real user questions and adversarial cases.
```

:::problem Your RAG demo impressed everyone but support says the bot is often wrong. Plan the evaluation in one week. {level=medium tags="evaluation,planning"}
Be concrete about data, metrics and decisions.

:::solution Model answer
Day 1–2: collect **100 real questions** from tickets/logs, have an expert mark gold passages and reference answers; add 15 unanswerable and 15 adversarial. Day 3: implement retrieval metrics (recall@5/10, MRR) and run the current system; read the failures. Day 4: add generation metrics: faithfulness and correctness via a **calibrated LLM judge** (check against 40 human labels), citation checks, refusal accuracy. Day 5: produce the **diagnosis matrix** by question type; pick the top two fixes (for example hybrid search + reranker if recall is low; stricter grounding if faithfulness is low). Re-run, show before/after, and wire the set into CI. Report numbers with confidence caveats (small sample).
:::
:::

:::keypoints
- Evaluate retrieval and generation separately, then end to end; always log retrieved chunks.
- Build the test set from real questions first; add synthetic, adversarial and unanswerable cases; store gold passages.
- Retrieval: hit rate, recall@k (most important for RAG), precision@k, MRR, nDCG.
- Generation: faithfulness, answer relevance, context precision/recall, correctness, citation accuracy, refusal behaviour, judged by calibrated LLM judges or NLI.
- Use the diagnosis matrix to decide whether to fix retrieval, generation or the knowledge base; run evals on every change.
:::

:::resources
- [Ragas docs](https://docs.ragas.io) and the [Ragas paper](https://arxiv.org/abs/2309.15217) — reference-free RAG metrics.
- [Hamel Husain: Your AI product needs evals](https://hamel.dev/blog/posts/evals/) and [Evals FAQ](https://hamel.dev/blog/posts/evals-faq/) — practical, data-first evaluation.
- [DeepEval](https://deepeval.com) and [promptfoo](https://www.promptfoo.dev/docs/intro) — test frameworks for LLM apps.
- [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685) — judge strengths and biases.
- [Langfuse docs](https://langfuse.com/docs) and [Arize Phoenix](https://docs.arize.com/phoenix) — tracing plus evals for RAG.
- [LLM Zoomcamp](https://github.com/DataTalksClub/llm-zoomcamp) — a module on RAG evaluation with code.
:::
