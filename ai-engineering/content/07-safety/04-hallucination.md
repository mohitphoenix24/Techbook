---
title: Hallucination — Causes, Measurement and Mitigation
level: intermediate
time: 45
summary: Why models fabricate, the kinds of hallucination (factual, faithfulness, reasoning, citation, tool), a layered mitigation stack (grounding, abstention, verification, constrained output, tools, UX), uncertainty signals (logprobs, self-consistency, verbalised confidence), the coverage–accuracy trade-off of abstaining, and runnable demos of consistency checking and threshold-based abstention.
---

Hallucination is the most visible reliability problem of language models: fluent, confident output that is **not true** or **not supported by the source**. It cannot be driven to zero, but it can be reduced dramatically, bounded by design, and **measured**. This lesson is the practical playbook.

:::def Hallucination
Generated content that is unsupported by the input or by reality. Two useful senses: **extrinsic / factual** (contradicts or invents world facts) and **intrinsic / faithfulness** (contradicts or goes beyond the provided source documents or instructions). Many teams use "fabrication" for invented specifics such as citations, quotes, numbers, function names and API parameters.
:::

## Why it happens

1. **The objective**: the model is trained to produce plausible continuations, not verified truths; a fluent wrong answer can have high probability.
2. **Knowledge gaps**: rare facts and recent events are poorly or not at all represented, but the model still answers.
3. **No built-in "I don't know"**: training and benchmarks that score only accuracy reward guessing over abstaining, so models learn to answer even when unsure (recent research argues this incentive is a major driver of hallucination).
4. **Context problems**: missing, noisy, conflicting or very long context; the right fact exists but is not attended to.
5. **Instruction pressure**: the user demands specifics (a citation, a number) the model does not have.
6. **Sampling randomness**: tail tokens can introduce errors, especially at high temperature.
7. **Sycophancy**: accepting a false premise in the question ("Why did Einstein win the Nobel for relativity?").
8. **Compounding in long outputs and agent steps**: early errors propagate.

## Types you will meet

| Type | Example | Typical fix |
|---|---|---|
| **Factual fabrication** | invents a statistic, date or biography detail | grounding, retrieval, abstention |
| **Faithfulness failure** | summary adds claims not in the document | quote-first, grounding checks |
| **Citation fabrication** | cites a paper or legal case that does not exist | native citations; verify existence |
| **Reasoning error** | arithmetic or logic slip with fluent explanation | tools, code execution, verification, reasoning models |
| **Tool/API hallucination** | calls a function or parameter that does not exist | strict schemas, validation, tool descriptions |
| **Instruction hallucination** | claims it did something it did not ("I've sent the email") | require tool evidence; verify actions in code |
| **Entity confusion** | blends two people or products | disambiguation, retrieval with ids |
| **False premise acceptance** | answers a question built on a falsehood | prompt to check premises; abstain/correct |

## The mitigation stack

Think in layers, roughly from cheapest to most powerful:

:::flow Reducing hallucination
Ask for less | narrow the task; do not demand specifics the model cannot know
Give the facts | retrieval, tools, provided documents (grounding)
Allow "I don't know" | explicit abstention instructions and evaluation
Constrain the form | schemas, enums, quote-first, citations
Verify | check claims against sources, run code, validate entities
Calibrate and route | confidence thresholds; human review for low confidence
Design the UX | sources visible, uncertainty shown, easy correction
:::

### 1. Prompting techniques (cheap, partial)

- **Permit uncertainty**: "If you are not sure or the documents do not contain the answer, say so. Do not guess."
- **Ground in provided text**: "Answer using only the documents below."
- **Quote first, then answer** (extract exact supporting quotes, then reason from them).
- **Chain-of-thought / thinking** for reasoning tasks; verify rather than trust.
- **Ask the model to check its work** or critique, and re-read sources ("verify each claim has a supporting quote; remove any that don't").
- **Name the date and limits**: "Your knowledge may be outdated; today is ...".
- **Lower temperature** where sampling is configurable.
- **Avoid leading or false-premise questions**; ask the model to challenge the premise.

### 2. Retrieval and tools (strongest for factual tasks)

Facts from **retrieval** or **tools** (search, calculators, databases, APIs) replace recall with lookup. Use citations and verification (RAG module). For numbers and code: **execute** instead of predicting.

### 3. Constrained output

Schemas with **enums**, nullable "unknown" fields, and structured **citations** reduce the space for invention. For identifiers (ids, SKUs, URLs), **validate against your database** or an allow-list; never trust a model-generated id.

### 4. Verification

- **Claim-level checks**: split output into claims; check each against sources by entailment (NLI model or LLM judge).
- **Existence checks**: do cited papers, cases, URLs and functions exist? (A citation resolver is a few lines of code.)
- **Execution checks**: run the generated code or SQL.
- **Second opinion**: another model or prompt verifies (be aware of correlated errors).

### 5. Uncertainty signals

Can the model tell you when it is likely wrong? Imperfectly, but there are signals:

- **Token log-probabilities** (where exposed): low probability on key tokens suggests uncertainty.
- **Self-consistency**: sample several answers; **disagreement** signals unreliability, while strong agreement raises confidence (not a guarantee; consistent errors exist).
- **Verbalised confidence** ("I'm 80% sure"): roughly informative for some models, poorly calibrated for others; calibrate against ground truth.
- **Retrieval signals**: low reranker scores, no relevant chunks.

```python run title="Self-consistency as a hallucination signal" level=intermediate
from collections import Counter

def consistency(answers):
    top, n = Counter(answers).most_common(1)[0]
    return top, n / len(answers)

# five sampled answers to each question (what you would get by calling the model 5 times)
samples = {
    "capital of Australia":        ["Canberra"] * 5,
    "year the CEO was born":       ["1978", "1982", "1978", "1975", "1980"],                 # inconsistent: likely guessing
    "Who proved the 1992 theorem": ["Dr. Elena Voss", "Prof. M. Rinaldi", "Dr. Elena Voss", "J. Kim", "Dr. T. Okafor"],
}
THRESHOLD = 0.6
for q, answers in samples.items():
    top, agree = consistency(answers)
    verdict = "answer" if agree >= THRESHOLD else "ABSTAIN / verify with a source"
    print(f"{q:30} top={top!r:18} agreement={agree:.0%} -> {verdict}")
```

This costs k× the tokens, so apply it to **high-stakes or low-confidence** cases.

### 6. Abstention and the coverage–accuracy trade-off

If the system can say "I don't know", you trade **coverage** (share of questions answered) for **accuracy** (correctness of those answered). Choose the operating point from the **cost of a wrong answer versus the cost of no answer**.

```python run title="Abstain below a confidence threshold: coverage vs accuracy" level=intermediate
import numpy as np

rng = np.random.default_rng(0)
n = 5000
confidence = rng.beta(5, 2, n)                                   # model confidence in [0, 1], mostly high
# a reasonably calibrated system: correct with probability close to its confidence
correct = rng.random(n) < (0.15 + 0.80 * confidence)

print(f"{'threshold':>9} {'coverage':>9} {'accuracy of answered':>21} {'wrong answers per 1000 questions':>34}")
for th in (0.0, 0.5, 0.7, 0.8, 0.9):
    answered = confidence >= th
    cov = answered.mean()
    acc = correct[answered].mean()
    wrong_per_1000 = 1000 * (answered & ~correct).mean()
    print(f"{th:>9.1f} {cov:>9.0%} {acc:>21.1%} {wrong_per_1000:>34.0f}")
```

Raising the threshold cuts wrong answers sharply while giving up some coverage. For medical, legal or financial answers choose a **high threshold** and route the rest to a human or a verified source; for a brainstorming tool choose a low one.

## Evaluating hallucination

- **Faithfulness evals** for grounded tasks (RAG lesson): decompose answers into claims and verify them against the context.
- **Factuality evals** for closed-book answers: compare with ground truth (SimpleQA-style short-answer sets) and measure **correct, incorrect, and not-attempted** separately. An honest system trades some correct answers for far fewer incorrect ones.
- **Unanswerable and false-premise questions**: does it abstain or correct the premise?
- **Citation verification rate**: share of citations that exist and support the claim.
- **Production sampling** with calibrated judges plus human review of the riskiest categories.

Report **three numbers**, not one: *answered correctly*, *answered incorrectly (hallucinated)*, *declined*.

## Design for the residual error

You will not reach 0%. Plan for it:

1. **Show sources** and make them one click away.
2. **Signal uncertainty** appropriately (hedging language only where warranted; avoid blanket disclaimers that train users to ignore them).
3. **Keep humans in the loop** where errors are costly; make review efficient (highlight claims and their evidence).
4. **Constrain the domain**: a narrow assistant with good sources hallucinates less than a general one.
5. **Make corrections cheap**: thumbs-down, "report an error", and feed them into evals.
6. **Match the UX to the risk**: a recipe chatbot and a drug-interaction checker need very different safeguards.

```quiz
? Which is the most effective mitigation for factual questions about your own data?
- A higher temperature
+ Grounding the answer in retrieved or tool-provided facts, with citations and verification
- A longer system prompt
> Replace recall with lookup, then verify.

? What does low agreement across several sampled answers suggest?
+ The model is likely guessing, so abstain or verify
- The model is creative
- The temperature is too low
> Self-consistency is a useful uncertainty signal (though consistent errors exist).

? Why report correct, incorrect and declined separately?
+ A system can reduce harmful wrong answers by abstaining, which accuracy alone hides
- It is a legal requirement
- Declined answers are always bad
> Honest abstention is valuable when wrong answers are costly.

? An agent says "I've sent the email" but no tool call occurred. What type of hallucination is this?
+ Instruction/action hallucination: claiming an action that did not happen
- A tokenization error
- A caching issue
> Verify claimed actions against tool-call records in code.
```

:::problem Your legal-research assistant produced a brief citing a case that does not exist. Describe the fix at the system level. {level=hard tags="hallucination,citations,legal"}
Include prevention, detection and process.

:::solution Model answer
**Prevention:** retrieve from a trusted legal database and require the model to cite only retrieved authorities (native citations with ids), forbid citing from memory, and give an "unable to find authority" path. **Detection:** a **citation resolver** that checks every cited case exists (database lookup by citation) and that quoted text appears in the source; automatic claim-to-source verification; block output with unverified citations. **Process:** mandatory **human attorney review** with a UI that highlights each cite and its quoted support; logging; evals with unanswerable and fake-case traps measuring fabricated-citation rate; incident review and monitoring in production.
:::
:::

:::keypoints
- Hallucination arises from the plausible-continuation objective, knowledge gaps, missing abstention, bad context and instruction pressure; types include factual, faithfulness, citation, reasoning, tool and action hallucinations.
- Mitigation stack: ask for less, ground with retrieval/tools, permit "I don't know", constrain the form, verify claims and entities, calibrate and route, and design the UX.
- Uncertainty signals: logprobs, self-consistency, verbalised confidence (calibrate), retrieval scores.
- Abstention trades coverage for accuracy; choose the threshold by the cost of wrong answers.
- Evaluate correct/incorrect/declined separately, test unanswerable and false-premise questions, and design for the residual error.
:::

:::resources
- [Claude docs: Reduce hallucinations](https://docs.claude.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) — practical techniques.
- [Self-RAG](https://arxiv.org/abs/2310.11511) and [Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401) — grounding approaches.
- [Self-Consistency Improves Chain of Thought Reasoning](https://arxiv.org/abs/2203.11171) — agreement as a signal.
- [Ragas docs](https://docs.ragas.io) — faithfulness metrics.
- [Chip Huyen: Common pitfalls when building generative AI applications](https://huyenchip.com/blog/) — hallucination in context.
- [Eugene Yan: Patterns for Building LLM-based Systems & Products](https://eugeneyan.com/writing/llm-patterns/) — guardrails and evals for factuality.
:::
