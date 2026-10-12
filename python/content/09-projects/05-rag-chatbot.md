---
title: RAG Chatbot with Citations
level: advanced
time: 75
icon: message
cover: #0ea5e9,#22c55e
tags: rag, claude, retrieval, chatbot, evaluation
summary: A complete documentation chatbot — structure-aware chunking, hybrid retrieval, conversation-aware query rewriting, grounded answers with citations, "I don't know" handling and an evaluation suite — runnable in the browser and ready to switch to Claude.
---

This is the project most companies actually want: **"a chatbot that answers questions about our docs — correctly, with sources, and admits when it doesn't know."** You'll build the full system with a clean, swappable design: everything runs here in the browser with a small extractive stand-in model, and one class swap turns it into a Claude-powered bot.

:::flow System design
Markdown docs | product knowledge base
Chunk by headings | + metadata
Hybrid index | BM25 + vectors
Rewrite query | resolve "it", "that"
Retrieve top-k | with RRF
Grounded answer | cite [1], or "I don't know"
:::

## Step 1 — The knowledge base

```python run shared title="Step 1 · documents"
DOCS = {
    "pricing.md": """# Pricing
## Plans
Nimbus Notes has three plans. Free includes 3 notebooks and 100 MB storage. Pro costs $8 per month and includes unlimited notebooks and 50 GB storage. Team costs $15 per user per month and adds shared workspaces and admin controls.
## Discounts
Annual billing saves 20%. Students and teachers get Pro free with a school email address.
## Refunds
Annual plans can be refunded within 14 days of purchase. Monthly plans are not refundable, but you can cancel anytime and keep access until the end of the billing period.""",
    "features.md": """# Features
## Offline mode
Pro and Team plans work offline on desktop and mobile. Changes sync automatically when you reconnect.
## AI assistant
The AI assistant can summarise notes, draft text and answer questions about your notebooks. It is available on Pro and Team plans and is powered by Claude.
## Sharing
You can share any note with a public read-only link. Team plans can share notebooks with edit permissions.""",
    "troubleshooting.md": """# Troubleshooting
## Sync problems
If notes stop syncing, check that you are signed in, then choose Settings → Sync → Force sync. Sync conflicts create a copy named 'conflicted copy'.
## Error codes
Error N401 means your session expired; sign in again. Error N507 means your storage is full; delete files or upgrade your plan.
## Deleted notes
Deleted notes stay in the Trash for 30 days. You can restore them from Trash → Restore.""",
}
print({name: len(text.split()) for name, text in DOCS.items()}, "words")
```

## Step 2 — Structure-aware chunking

Instead of cutting blindly every N characters, split on **headings** so every chunk is a coherent section, and keep the heading path as metadata (and as context inside the chunk).

```python run shared title="Step 2 · chunk by headings"
import re
from dataclasses import dataclass

@dataclass
class Chunk:
    id: str
    doc: str
    section: str
    text: str

    @property
    def indexed_text(self):          # what we search over: heading context + body
        return f"{self.section}. {self.text}"

def chunk_markdown(name, md):
    chunks, title, section, lines = [], "", "", []
    def flush():
        body = " ".join(l.strip() for l in lines if l.strip())
        if body:
            chunks.append(Chunk(f"{name}#{len(chunks)}", name, f"{title} › {section}".strip(" ›"), body))
    for line in md.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
        elif line.startswith("## "):
            flush(); lines = []
            section = line[3:].strip()
        else:
            lines.append(line)
    flush()
    return chunks

CHUNKS = [c for name, md in DOCS.items() for c in chunk_markdown(name, md)]
for c in CHUNKS[:4]:
    print(f"{c.id:<18} [{c.section}] {c.text[:60]}…")
print(len(CHUNKS), "chunks")
```

## Step 3 — Hybrid retriever

```python run shared title="Step 3 · BM25 + vectors + RRF"
import math
import numpy as np
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer

STOP = set("a an and are as at be by can do does for from how i if in is it its me my of on or the to what when where which who why will with you your".split())
def tokens(text):
    """Lowercase words minus stopwords, with a tiny stemmer: 'plans' -> 'plan', 'costs' -> 'cost'."""
    words = [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP]
    return [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words]

class HybridRetriever:
    def __init__(self, chunks):
        self.chunks = chunks
        self.toks = [Counter(tokens(c.indexed_text)) for c in chunks]
        self.avgdl = sum(sum(t.values()) for t in self.toks) / len(self.toks)
        df = Counter(w for t in self.toks for w in t)
        self.idf = {w: math.log(1 + (len(chunks) - f + 0.5) / (f + 0.5)) for w, f in df.items()}
        self.vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
        self.X = self.vec.fit_transform([c.indexed_text.lower() for c in chunks])

    def bm25(self, query, k1=1.4, b=0.75):
        q = tokens(query)
        scores = []
        for tf in self.toks:
            dl = sum(tf.values())
            scores.append(sum(self.idf[w] * tf[w] * (k1 + 1) / (tf[w] + k1 * (1 - b + b * dl / self.avgdl)) for w in q if w in tf))
        return np.array(scores)

    def retrieve(self, query, k=3):
        lexical = self.bm25(query)
        dense = (self.X @ self.vec.transform([query.lower()]).T).toarray().ravel()
        fused = Counter()
        for scores in (lexical, dense):
            for rank, i in enumerate(np.argsort(-scores)):
                if scores[i] > 0:
                    fused[int(i)] += 1 / (60 + rank)
        return [(self.chunks[i], score) for i, score in fused.most_common(k)]

retriever = HybridRetriever(CHUNKS)
for chunk, score in retriever.retrieve("can I get a refund on a yearly subscription?"):
    print(f"{score:.4f}  {chunk.id:<18} {chunk.section}")
```

## Step 4 — Conversation-aware query rewriting

Follow-up questions like *"and how much does **it** cost?"* are useless as search queries on their own. Before retrieving, rewrite the question into a **standalone** query using the conversation so far.

```python run shared title="Step 4 · query rewriting"
REWRITE_PROMPT = """Rewrite the user's latest question as a standalone search query, resolving words like
"it", "that" or "the other one" using the conversation. Return only the query.

<conversation>
{history}
</conversation>
<latest_question>{question}</latest_question>"""

def heuristic_rewrite(history, question):
    """Stand-in for the LLM rewrite: borrow key terms from the previous user turn for vague follow-ups."""
    vague = re.search(r"\b(it|that|this|they|them|those|the other)\b", question.lower())
    previous = [m["content"] for m in history if m["role"] == "user"]
    if vague and previous:
        topic = " ".join(w for w in tokens(previous[-1]) if len(w) > 3)
        return f"{question} {topic}"
    return question

history = [{"role": "user", "content": "Does the AI assistant work on the free plan?"},
           {"role": "assistant", "content": "No — it's available on Pro and Team. [1]"}]
print(heuristic_rewrite(history, "how much does it cost then?"))
print(REWRITE_PROMPT.format(history="user: Does the AI assistant work on the free plan?", question="how much does it cost then?")[:180], "…")
```

## Step 5 — The grounded-answer prompt

```python run shared title="Step 5 · prompt builder"
SYSTEM_PROMPT = """You are the Nimbus Notes help assistant.
Answer ONLY from the numbered sources provided. Cite every factual sentence with its source number, like [1].
If the sources don't contain the answer, say: "I couldn't find that in the Nimbus Notes docs." Then suggest contacting support.
Be concise: at most 4 sentences."""

def build_user_message(question, retrieved):
    sources = "\n".join(f'<source id="{i}" section="{c.section}">\n{c.text}\n</source>'
                        for i, (c, _) in enumerate(retrieved, 1))
    return f"<sources>\n{sources}\n</sources>\n\n<question>{question}</question>"

print(build_user_message("What does error N507 mean?", retriever.retrieve("error N507"))[:400])
```

## Step 6 — Pluggable language models

The bot depends on a tiny interface: `generate(system, messages) -> str`. In the browser we use an **extractive** stand-in that selects the best-supported sentences and refuses when support is weak; on your computer, `ClaudeLLM` drops in with no other changes.

```python run shared title="Step 6 · the LLM interface"
from typing import Protocol

class LLM(Protocol):
    def generate(self, system: str, messages: list[dict]) -> str: ...

class ExtractiveLLM:
    """Answers by quoting the best-matching sentences from the sources (no hallucination possible)."""
    def generate(self, system, messages):
        content = messages[-1]["content"]
        question = re.search(r"<question>(.*?)</question>", content, re.S).group(1)
        q = set(tokens(question))
        candidates = []
        for sid, section, body in re.findall(r'<source id="(\d+)" section="([^"]*)">\n(.*?)\n</source>', content, re.S):
            context = set(tokens(section))                     # a sentence inherits its section heading
            for sentence in re.split(r"(?<=[.!?])\s+", body):
                overlap = len(q & (set(tokens(sentence)) | context))
                candidates.append((overlap, sentence, sid))
        candidates.sort(key=lambda c: -c[0])
        best = [c for c in candidates if c[0] >= 2][:2]
        if not best:
            return "I couldn't find that in the Nimbus Notes docs. You can contact support@nimbus.example for help."
        return " ".join(f"{s} [{sid}]" for _, s, sid in best)

print(ExtractiveLLM().generate(SYSTEM_PROMPT, [{"role": "user", "content": build_user_message("What does error N507 mean?", retriever.retrieve("error N507"))}]))
```

```python local title="ClaudeLLM — the real model (run on your computer)"
import anthropic

class ClaudeLLM:
    def __init__(self, model="claude-opus-5-5"):
        self.client = anthropic.Anthropic()
        self.model = model

    def generate(self, system, messages):
        response = self.client.messages.create(
            model=self.model, max_tokens=1024, system=system, messages=messages,
        )
        if response.stop_reason == "refusal":
            return "Sorry, I can't help with that."
        return "".join(b.text for b in response.content if b.type == "text")

# bot = RAGBot(retriever, llm=ClaudeLLM())     # the only change needed
```

## Step 7 — The chatbot

```python run shared title="Step 7 · RAGBot"
class RAGBot:
    def __init__(self, retriever, llm, k=3, max_history=6):
        self.retriever, self.llm, self.k, self.max_history = retriever, llm, k, max_history
        self.history = []

    def ask(self, question, verbose=True):
        query = heuristic_rewrite(self.history, question)          # or: an LLM call with REWRITE_PROMPT
        retrieved = self.retriever.retrieve(query, k=self.k)
        messages = self.history[-self.max_history:] + [{"role": "user", "content": build_user_message(question, retrieved)}]
        answer = self.llm.generate(SYSTEM_PROMPT, messages)
        self.history += [{"role": "user", "content": question}, {"role": "assistant", "content": answer}]
        if verbose:
            print(f"🧑 {question}")
            if query != question:
                print(f"   (search query: {query!r})")
            print(f"🤖 {answer}")
            cited = sorted(set(re.findall(r"\[(\d+)\]", answer)))
            for n in cited:
                print(f"   [{n}] {retrieved[int(n) - 1][0].doc} › {retrieved[int(n) - 1][0].section}")
            print()
        return answer, retrieved

bot = RAGBot(retriever, ExtractiveLLM())
bot.ask("How much does the Pro plan cost?")
bot.ask("Does it work offline?")
bot.ask("What does error N401 mean?")
bot.ask("Can I get a refund on an annual plan?")
bot.ask("Do you have a dark mode?")
```

## Step 8 — Evaluate the bot

```python run shared title="Step 8 · evaluation suite"
EVAL = [
    {"q": "What does the Free plan include?", "facts": ["3 notebooks", "100 mb"], "source": "pricing.md"},
    {"q": "How long do deleted notes stay in the trash?", "facts": ["30 days"], "source": "troubleshooting.md"},
    {"q": "Is the AI assistant available on the Free plan?", "facts": ["pro and team"], "source": "features.md"},
    {"q": "How do I fix sync problems?", "facts": ["force sync"], "source": "troubleshooting.md"},
    {"q": "Do students get a discount?", "facts": ["free"], "source": "pricing.md"},
    {"q": "What does error N507 mean?", "facts": ["storage is full"], "source": "troubleshooting.md"},
    {"q": "Can I use Nimbus on my smartwatch?", "facts": [], "source": None},          # not in the docs
    {"q": "Who is the CEO of Nimbus?", "facts": [], "source": None},                    # not in the docs
]

def run_eval(make_bot):
    rows = []
    for case in EVAL:
        bot = make_bot()
        answer, retrieved = bot.ask(case["q"], verbose=False)
        a = answer.lower()
        refused = "couldn't find" in a
        if case["source"] is None:
            ok = refused
        else:
            ok = (not refused) and all(f in a for f in case["facts"]) and bool(re.search(r"\[\d\]", answer))
        hit = case["source"] is None or any(c.doc == case["source"] for c, _ in retrieved)
        rows.append((case["q"], ok, hit))
    return rows

rows = run_eval(lambda: RAGBot(retriever, ExtractiveLLM()))
for q, ok, hit in rows:
    print(f"{'✅' if ok else '❌'} answer  {'✅' if hit else '❌'} retrieval  {q}")
print(f"\nanswer accuracy {sum(r[1] for r in rows) / len(rows):.0%} | retrieval hit rate {sum(r[2] for r in rows) / len(rows):.0%}")
```

The evaluation tells you what to improve next: retrieval misses → better chunking, synonyms or a reranker; answer misses with good retrieval → better prompting or a stronger model.

## Step 9 — The Claude version, complete (run locally)

```python local title="rag_bot_claude.py — streaming answers with Claude"
# pip install anthropic scikit-learn numpy
import anthropic

client = anthropic.Anthropic()

def stream_answer(bot: "RAGBot", question: str):
    query = heuristic_rewrite(bot.history, question)          # or use Claude with REWRITE_PROMPT
    retrieved = bot.retriever.retrieve(query, k=4)
    messages = bot.history[-6:] + [{"role": "user", "content": build_user_message(question, retrieved)}]
    answer = ""
    with client.messages.stream(model="claude-opus-5-5", max_tokens=2048,
                                system=SYSTEM_PROMPT, messages=messages) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
            answer += text
    print()
    bot.history += [{"role": "user", "content": question}, {"role": "assistant", "content": answer}]
    for n in sorted(set(re.findall(r"\[(\d+)\]", answer))):
        c = retrieved[int(n) - 1][0]
        print(f"  [{n}] {c.doc} › {c.section}")

bot = RAGBot(retriever, llm=None)
while (q := input("\nYou: ").strip()):
    stream_answer(bot, q)
```

:::tip Production upgrades
- Replace the char-TF-IDF vectors with a real **embedding model** and a **vector database**.
- Add a **reranker** over the top ~20 chunks.
- Use Claude's **citations** feature (document blocks) for exact quoted spans.
- Use **prompt caching** for a long, fixed system prompt.
- Log every question, retrieved chunk IDs and answer; turn 👎 feedback into new eval cases.
:::

:::exercise Extensions
1. Add a `min_score` to the retriever and make the bot refuse when the best fused score is below it — re-run the eval.
2. Add a fourth document (`security.md`) and three eval cases for it.
3. Implement a **semantic cache**: if a new question is very similar to a previous one, reuse the answer.
4. On your computer, swap in `ClaudeLLM` and compare its eval score with the extractive stand-in.
:::

:::keypoints
- Chunk by **document structure** and keep section metadata; search over heading + body.
- **Hybrid retrieval** (BM25 + vectors with RRF) finds both exact codes and paraphrases.
- **Rewrite** follow-up questions into standalone queries before retrieving.
- Prompt for **grounded answers with citations** and an explicit "I couldn't find that" path.
- Design around a small `LLM` interface so models are swappable — and **evaluate** answers, refusals and retrieval separately.
:::
