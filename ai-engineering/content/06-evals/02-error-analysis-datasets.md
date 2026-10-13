---
title: Error Analysis and Building Eval Datasets
level: intermediate
time: 50
summary: The highest-leverage hour in AI engineering. Read real traces, label what is wrong, group failures into a taxonomy, and turn each failure mode into eval cases. Where datasets come from (production logs, experts, synthetic generation with dimensions), how to label, split and version them, keep them free of leakage, and keep them alive. With runnable taxonomy counting, stratified sampling and synthetic case generation.
---

The most common eval mistake is starting with a metric ("let's measure helpfulness!") instead of with **the failures**. The reliable method is borrowed from qualitative research: **look at data, name what is wrong, count it, then measure it.** This lesson is that method, plus the craft of building the datasets that make it repeatable.

## Step 1: collect traces and read them

A **trace** is the full record of one interaction: user input, retrieved context, tool calls, intermediate steps, final answer, metadata. Pull **50–100 real traces** (a random sample, plus some thumbs-down and escalations). Then **read them yourself**. No dashboard replaces this.

For each trace, ask:

- Did the system do what the user needed? If not, **what went wrong, specifically?**
- At which **step** did it go wrong (retrieval, tool choice, reasoning, formatting, tone)?
- Would a smart human have handled this differently?

Write one-line notes in plain language: *"offered a refund the policy doesn't allow"*, *"answered about the wrong product"*, *"too verbose for a mobile user"*, *"never asked which order"*. Do not worry about categories yet.

## Step 2: group notes into a failure taxonomy

After ~50 notes, patterns appear. Cluster similar notes into named **failure modes**. Anthropic, Hamel Husain and others call this **open coding then axial coding**: first free-form notes, then grouping into a small set of categories.

```text
Failure mode                          Count   Example
-----------------------------------------------------------------------
Wrong policy applied                     14   "gave 60-day window; policy says 30"
Retrieved wrong product's doc            11   asked about Pro, answered from X200 manual
Did not ask a clarifying question         9   "I want a refund" (which order?)
Too verbose / ignores format              8   six paragraphs for a yes/no
Hallucinated order details                5   invented a tracking number
Tone: curt to upset customer              3
```

Prioritise by **frequency × severity**: a rare failure that causes a legal problem outranks a frequent annoyance.

```python run title="Count failure modes and prioritise by frequency x severity" level=easy
from collections import Counter

# notes from reading 60 traces: (failure mode, severity 1-5)
notes = ([("wrong policy applied", 5)] * 14 + [("wrong product retrieved", 4)] * 11 + [("no clarifying question", 3)] * 9 +
         [("too verbose", 2)] * 8 + [("hallucinated order details", 5)] * 5 + [("curt tone", 3)] * 3 + [("fine", 0)] * 10)

counts = Counter(m for m, _ in notes)
sev = {m: s for m, s in notes}
total_bad = sum(c for m, c in counts.items() if m != "fine")
print(f"{total_bad} of {len(notes)} traces had at least one problem\n")
print(f"{'failure mode':30} {'count':>5} {'severity':>8} {'priority':>9}")
for mode, c in sorted(((m, c) for m, c in counts.items() if m != "fine"), key=lambda mc: -mc[1] * sev[mc[0]]):
    print(f"{mode:30} {c:>5} {sev[mode]:>8} {c * sev[mode]:>9}")
```

## Step 3: turn each failure mode into eval cases

For every important failure mode, write:

1. **Test cases** that trigger it (inputs + the context needed).
2. A **scorer** that detects it: a code check if possible (does the answer contain "60 days"? did it cite the right document? did it ask a question?), otherwise a narrow **binary LLM-judge** question ("Does the response apply the 30-day window? yes/no").
3. A few **passing counter-examples** (cases where the behaviour is correct), so fixes do not over-correct.

Narrow, specific checks beat one vague "quality score". Each is **actionable**: when "wrong product retrieved" fails, you know it is a retrieval issue.

## Where eval data comes from

| Source | Pros | Cons | Notes |
|---|---|---|---|
| **Production logs** | real distribution, real phrasing | privacy, no labels, may be empty before launch | sample randomly *and* mine failures; scrub PII |
| **Subject-matter experts** | hard cases, correct answers | costly, small | ask them for the cases that "keep them up at night" |
| **Existing artefacts** | FAQs, support macros, past tickets with resolutions | cheap, labelled | biased toward past behaviour |
| **Synthetic generation** | scalable, covers edge cases, usable pre-launch | can be unrealistic and repetitive | generate along **dimensions**, filter, review a sample |
| **Adversarial / red-team** | exposes safety and robustness gaps | needs creativity | essential for high-risk apps |
| **Public benchmarks** | comparable | rarely match your task | sanity checks only |

### Synthetic data done well

A naive prompt ("write 100 customer questions") gives repetitive, easy cases. Better: define **dimensions** of variation, sample combinations, and have the model write one realistic case per combination.

```python run title="Synthetic cases from dimensions (tuples first, then LLM expands)" level=intermediate
import itertools, random

dimensions = {
    "persona":   ["frustrated long-time customer", "first-time buyer, non-native English speaker", "business admin in a hurry"],
    "intent":    ["refund request", "order status", "change shipping address", "ask about warranty"],
    "difficulty": ["clear and complete", "vague, missing the order number", "mixes two requests"],
    "channel":   ["email (long)", "chat (short, typos)"],
}
combos = list(itertools.product(*dimensions.values()))
random.Random(0).shuffle(combos)
print(f"{len(combos)} possible scenarios; sampling 6\n")
for persona, intent, difficulty, channel in combos[:6]:
    # in a real pipeline an LLM turns this tuple into a realistic message; here we show the specification
    print(f"- persona={persona!r}, intent={intent!r}, difficulty={difficulty!r}, channel={channel!r}")
```

Then **review** the generated cases: delete unrealistic ones, deduplicate, and make sure hard combinations are represented. Always label synthetic cases as such, and mix in real ones.

## Labelling and ground truth

- Write **labelling guidelines** with examples of each label; ambiguity is the enemy.
- Have **two people** label an overlapping sample and measure agreement (Cohen's kappa, next-next lesson). Low agreement means the task definition is unclear, not that people are careless.
- Prefer **binary or low-cardinality** judgements (acceptable / not) over 1–10 scales.
- Keep **reasons** with labels: they become the rubric and few-shot examples for judges.
- For open-ended outputs, define **properties** rather than a single reference answer: "mentions the 30-day window", "does not promise a refund", "asks for the order number".

## Splits, leakage and hygiene

```python run title="Stratified dev/test split with a leakage check" level=intermediate
import random
from collections import defaultdict

cases = [{"id": i, "category": c, "text": f"{c} case {i}"} for i, c in enumerate(["billing"] * 30 + ["bug"] * 20 + ["feature"] * 10)]
cases.append({"id": 999, "category": "billing", "text": "billing case 3"})      # an accidental near-duplicate of case 3

def stratified_split(cases, test_frac=0.3, seed=1):
    by_cat = defaultdict(list)
    for c in cases: by_cat[c["category"]].append(c)
    rng, dev, test = random.Random(seed), [], []
    for cat, items in by_cat.items():
        rng.shuffle(items)
        k = max(1, round(len(items) * test_frac))
        test += items[:k]; dev += items[k:]
    return dev, test

dev, test = stratified_split(cases)
print(f"dev {len(dev)}, test {len(test)}; test categories:", {c: sum(x['category'] == c for x in test) for c in ('billing', 'bug', 'feature')})

# leakage: identical text appearing in both splits
dev_texts = {c["text"] for c in dev}
leaks = [c for c in test if c["text"] in dev_texts]
print("leaked cases (same text in dev and test):", [c["id"] for c in leaks] or "none")
```

Good hygiene:

- **Dev vs test**: tune prompts against dev; look at test **rarely** (before releases), so it stays an honest estimate. With small sets, use cross-validation or simply be disciplined and add fresh cases.
- **Deduplicate** and check near-duplicates across splits.
- **No leakage**: do not put eval cases into few-shot examples or fine-tuning data. Keep prompts from containing eval answers.
- **Version** datasets (a file in git plus a changelog) so scores are comparable over time. When you change the dataset, record the baseline again.
- **Protect privacy**: scrub PII from logs before they become test data; restrict access.
- **Cover the distribution and the tails**: typical cases (to measure average quality) and hard/rare ones (to catch the failures that matter).

## Keep it alive

- Every production **bug, escalation and thumbs-down** becomes a candidate case.
- **Review** the dataset quarterly: remove obsolete cases (policies changed), rebalance categories to match current traffic.
- Track **coverage**: which failure modes and user segments have no tests?
- **Version the labels** too: when the policy changes, the expected answers change.

## Size guide

| Goal | Rough size |
|---|---|
| First useful signal | 20–50 cases |
| Compare prompt/model changes with moderate confidence | 100–300 |
| Per-slice analysis; fine differences | several hundred to thousands |
| Safety-critical or regulated | as many as risk demands, plus ongoing monitoring |

```quiz
? What should you do before choosing metrics for a new AI feature?
- Pick a standard benchmark
+ Read 50–100 real traces and write down what goes wrong, then group failures into a taxonomy
- Ask the model what is wrong
> Error analysis tells you what to measure.

? Why generate synthetic cases along dimensions (persona, intent, difficulty, channel)?
+ To get diverse, hard and realistic cases instead of repetitive easy ones
- To avoid reviewing them
- Because LLMs cannot write single cases
> Dimension sampling covers the space systematically.

? Why keep a held-out test split that you rarely look at?
+ So it remains an honest estimate and you do not overfit prompts to it
- Because dev sets are illegal
- To save disk
> Tuning against the test set inflates scores.

? Low agreement between two human labellers usually means…
+ The task or labelling guidelines are ambiguous
- One of them is careless
- The model is wrong
> Clarify the definition and examples before trusting labels.
```

:::problem You launch a legal-research assistant next month with no users yet. How do you build an eval set? {level=medium tags="datasets,synthetic"}
Be concrete about sources and quality control.

:::solution Model answer
Interview 3–5 lawyers for **realistic questions** and the hard ones, and collect past research memos with their sources as ground truth. Define **dimensions** (jurisdiction, practice area, question type: lookup / issue-spotting / comparison, difficulty, ambiguity), generate synthetic questions per combination with an LLM, then have a lawyer **review a sample** and delete unrealistic ones. For each case record the **required authorities** and key points (properties, not just text). Add adversarial cases (non-existent cases, wrong jurisdiction, outdated law) to test refusal and citation verification. Split dev/test, label with guidelines and double-label 20% to measure agreement. After launch, add logged questions and every reported error.
:::
:::

:::keypoints
- Start from data: read 50–100 traces, write notes, group them into a failure taxonomy, prioritise by frequency × severity.
- Turn each failure mode into cases and a narrow scorer (code check or binary judge) plus passing counter-examples.
- Sources: production logs, experts, existing artefacts, dimension-based synthetic data, adversarial cases.
- Label with guidelines, measure agreement, prefer binary properties to scales, keep reasons.
- Split dev/test, deduplicate, avoid leakage, version the dataset, scrub PII, and feed every production failure back in.
:::

:::resources
- [Hamel Husain: A field guide to rapidly improving AI products](https://hamel.dev/blog/posts/field-guide/) — error analysis and the data-first loop.
- [Hamel Husain: Evals FAQ](https://hamel.dev/blog/posts/evals-faq/) — how many examples, synthetic data, labelling.
- [Eugene Yan: Patterns for Building LLM-based Systems & Products](https://eugeneyan.com/writing/llm-patterns/) — evals and datasets.
- [Anthropic docs: Create strong empirical evaluations](https://docs.claude.com/en/docs/test-and-evaluate/develop-tests) — principles for eval design.
- [Langfuse docs](https://langfuse.com/docs) — datasets and experiments linked to traces.
- [Self-Instruct](https://arxiv.org/abs/2212.10560) — the idea of bootstrapping instruction data from a model.
:::
