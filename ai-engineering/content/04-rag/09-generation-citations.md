---
title: Grounded Generation and Citations
level: intermediate
time: 45
summary: Getting the model to actually use the retrieved text. Prompt layout for sources, grounding rules and the "I don't know" path, quote-then-answer, built-in citation features versus prompted citations, verifying that every citation really supports its claim, handling conflicting or insufficient sources, and answer formatting. With a runnable citation verifier.
---

Retrieval gives the model passages. Generation decides whether the answer is **faithful** to them. A faithful answer says only what the sources support, says so when they do not, and lets the reader check. This lesson covers the prompt, the citation mechanics, and the verification that closes the loop.

## The prompt layout

A reliable arrangement:

```text
SYSTEM
You answer questions about Acme products using ONLY the documents provided.
Rules:
1. Base every claim on the documents. After each claim, cite the document ids, like [doc3].
2. If the documents do not contain the answer, reply exactly: "I couldn't find that in the documentation." Do not guess or use outside knowledge.
3. If documents conflict, say so and cite both, preferring the most recent.
4. Be concise: at most 5 sentences unless asked for detail.

USER
<documents>
  <document id="doc1" title="X200 manual" updated="2026-03-01">...text...</document>
  <document id="doc2" title="Returns policy" updated="2026-09-01">...text...</document>
</documents>

Question: How long do I have to return the X200?
```

Why it works:

- **Documents first, question last** (better use of long contexts).
- **Ids, titles, dates** give the model what it needs to cite and to resolve conflicts, and give you something to verify.
- **An explicit no-answer path** is the cheapest hallucination reducer.
- **Rules are short and numbered**, each testable in an eval.

## Make the model quote first

For high-stakes answers, ask for **evidence extraction before the answer**: "First list the exact quotes from the documents that are relevant (inside `<quotes>`), then write the answer using only those quotes." The quoting step anchors the answer to real text, and you can check each quote against the sources by string matching.

```text
<quotes>
[doc2] "Unused products may be returned within 30 days of delivery."
</quotes>
<answer>You have 30 days from delivery to return an unused X200 [doc2].</answer>
```

## Citations: two approaches

### 1. Prompted citations (works with any model)

Instruct the model to cite ids and **verify in code**. Cheap and portable, but the model can cite the wrong id or paraphrase beyond the source.

### 2. Native citation features

Some APIs return **structured citations**: spans of the source text that support each part of the answer, produced by a dedicated mechanism rather than free generation. On the Claude API you set `citations: {"enabled": true}` on each document block; the response arrives as text blocks each carrying `citations` (document index, title, cited text, and a location such as page range or character range). These are more reliable than prompted ids and make "click to see the source" easy.

```python local title="Native citations with Claude"
response = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=1000,
    messages=[{
        "role": "user",
        "content": [
            *[{"type": "document",
               "source": {"type": "text", "media_type": "text/plain", "data": c["text"]},
               "title": c["title"], "citations": {"enabled": True}} for c in top_chunks],
            {"type": "text", "text": "How long do I have to return the X200? Answer only from the documents."},
        ],
    }],
)
for block in response.content:
    if block.type == "text":
        print(block.text, end="")
        for cite in getattr(block, "citations", None) or []:
            print(f"  [{cite.document_title}: “{cite.cited_text}”]", end="")
```

Note: native citations cannot be combined in the same request with schema-constrained JSON output; do the answer first, then structure it in a second step if you need JSON.

## Verify citations in code

Never assume a citation is valid. Check that (a) the cited id exists, (b) the claim is actually supported. A cheap first check is **string/overlap matching**; a stronger check uses an NLI model or an LLM judge (lesson 11).

```python run title="Parse citations and verify them against the sources" level=intermediate
import re

sources = {
    "doc1": "The X200 has 12 programs. The Eco program saves 40% energy but takes 3 hours.",
    "doc2": "Unused products may be returned within 30 days of delivery for a full refund.",
}
answer = ("You can return an unused X200 within 30 days of delivery [doc2]. "
          "The Eco program saves 40% energy [doc1]. It also dries clothes in 10 minutes [doc1].")

def sentences(text): return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
def words(s): return set(re.findall(r"[a-z0-9%]+", s.lower()))

def verify(answer, sources, min_support=0.6):
    report = []
    for sent in sentences(answer):
        ids = re.findall(r"\[(doc\d+)\]", sent)
        claim = re.sub(r"\[doc\d+\]", "", sent)
        if not ids:
            report.append((sent, "NO CITATION")); continue
        for i in ids:
            if i not in sources:
                report.append((sent, f"UNKNOWN SOURCE {i}")); continue
            cw = words(claim)
            support = max(len(cw & words(s)) / len(cw) for s in sentences(sources[i]))   # best-matching source sentence
            report.append((sent, f"{i} support={support:.2f} -> " + ("ok" if support >= min_support else "UNSUPPORTED")))
    return report

for sent, status in verify(answer, sources):
    print(f"{status:34} | {sent}")
```

The invented claim ("dries clothes in 10 minutes") is flagged as unsupported even though it carries a citation. In production use stronger entailment checks, and decide what to do on failure: remove the sentence, regenerate, or fall back to "I couldn't verify this".

## Insufficient or conflicting evidence

- **Insufficient:** use the no-answer path; offer next steps ("I couldn't find the Pro plan's warranty. Would you like me to connect you to support?"). Detect it *before* generation too: if the best reranker score is below a threshold, skip the LLM call and answer with the fallback.
- **Conflicting:** prefer the **newest** or highest-authority source, state the conflict, and cite both. Provide `updated` dates and source types in the prompt so the model can decide.
- **Partial:** answer the supported part and say what is missing.

```python run title="Retrieval-confidence gate: answer, or refuse politely" level=easy
def decide(reranked, threshold=0.45):
    """reranked: list of (score, text). Decide whether there is enough evidence to answer."""
    if not reranked or reranked[0][0] < threshold:
        return "REFUSE", "I couldn't find that in the documentation. Would you like to contact support?"
    return "ANSWER", [t for s, t in reranked if s >= threshold][:5]

print(decide([(0.82, "Refunds within 30 days."), (0.51, "Shipping takes 3-5 days."), (0.2, "Unrelated.")]))
print(decide([(0.31, "Shipping takes 3-5 days."), (0.2, "Unrelated.")]))
```

## Reduce hallucination: a checklist

1. **Ground**: "use only the documents", with an escape hatch.
2. **Quote first**, then answer; verify quotes.
3. **Constrain scope**: set the role to a documentation assistant; refuse out-of-scope.
4. **Lower the noise**: fewer, better chunks (reranked) beat many weak ones.
5. **Mark provenance** with ids, titles and dates.
6. **Verify**: citation checking, groundedness judge, or a second-pass critic.
7. **Evaluate refusals**: include unanswerable questions in your eval set and measure that the system declines.
8. **Show the sources** to users so they can check.

## Formatting and UX

- Cite **inline** (`[1]`) with a source list; make citations clickable to the passage, page or section.
- Keep answers **short and structured**; offer "show more".
- Show **uncertainty** honestly, and expose a feedback control (thumbs, "wrong source") that feeds your eval set.
- For regulated domains, add **disclaimers** and require human review.
- Stream the answer, then attach the citations when they are verified.

## Generation settings that help faithfulness

- Lower **effort / thinking** is often enough for lookup-style questions; raise it for synthesis across many sources.
- On models where you can set it, a **low temperature** reduces drift from sources.
- **Cap** the answer length so the model does not pad with speculation.
- Use a **structured output** with fields `answer`, `citations[]`, `confidence` or `answerable: bool` when downstream code needs to branch (but remember the incompatibility with native citations).

```quiz
? Why include an explicit "I don't know" instruction and an escape path?
- It makes answers longer
+ Without it the model tends to guess when sources are insufficient
- It is required for citations
> Giving permission to decline reduces fabricated answers.

? What does verifying citations in code catch?
+ Cited ids that do not exist, and claims the cited source does not actually support
- Slow retrieval
- Typos in the question
> A citation is a claim about the source: check it.

? What should the system do when sources conflict?
- Pick one at random
+ State the conflict, cite both, and prefer the most recent or authoritative source
- Ignore both
> Provide dates and source types so the model can reason about conflicts.

? Why quote first and then answer?
+ Quotes anchor the answer to real text and can be string-matched against sources
- Quotes are shorter
- It saves tokens
> Evidence extraction improves faithfulness and checkability.
```

:::problem Your RAG bot sometimes answers confidently with facts that are not in the documents. Describe a layered fix. {level=medium tags="hallucination,faithfulness"}
Include prompt, system and evaluation changes.

:::solution Model answer
Prompt: strict grounding rules, the exact refusal phrase, quote-then-answer, labelled sources with dates. System: **retrieval-confidence gate** (skip generation and refuse when the top reranker score is low), fewer/higher-quality chunks, **citation verification** (string/NLI/LLM-judge) with regenerate-or-strip on failure, and native citations if available. Model: use a model/effort adequate for synthesis; keep temperature low where supported. Evaluation: add unanswerable and adversarial questions, measure faithfulness (claims supported by sources) and refusal rate, monitor in production with sampled LLM-judge scoring and user feedback, and review failures weekly.
:::
:::

:::keypoints
- Layout: rules in the system prompt, labelled documents first, question last, explicit no-answer path.
- Quote first, then answer; prefer native citations where available, otherwise prompted ids plus code verification.
- Verify every citation (exists, supports the claim) and decide what to do on failure.
- Gate on retrieval confidence; handle insufficient, partial and conflicting evidence explicitly.
- Evaluate refusals and faithfulness, show sources to users, and capture feedback.
:::

:::resources
- [Claude docs: Citations](https://docs.claude.com/en/docs/build-with-claude/citations) — native, structured, document-grounded citations.
- [Claude docs: Reduce hallucinations](https://docs.claude.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) — allow "I don't know", quotes first, verification.
- [Self-RAG](https://arxiv.org/abs/2310.11511) — learning to retrieve, generate and critique with reflection tokens.
- [Ragas](https://docs.ragas.io) — faithfulness and answer-relevance metrics.
- [Lost in the Middle](https://arxiv.org/abs/2307.03172) — why where you place sources matters.
- [Eugene Yan: Patterns for building LLM-based systems — guardrails](https://eugeneyan.com/writing/llm-patterns/) — verification patterns.
:::
