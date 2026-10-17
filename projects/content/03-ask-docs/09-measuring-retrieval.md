---
title: Measuring retrieval
level: intermediate
time: 50
summary: Build an eval for the part of RAG that breaks most often. Hit@k and MRR, a gate that must answer real questions and refuse unrelated ones, a chunk-size sweep, and a comparison of the built-in and a real embedding model.
tags: evals, hit@k, MRR, thresholds, experiments
---

A RAG system that "seems to work" on the five questions you tried is a system you do not understand yet. This lesson makes the quality of the **search** a number you can improve on purpose.

## Why measure retrieval on its own

The final answer can be wrong for two reasons: the model reasoned badly, or the model was **never shown the right passage**. The second is far more common, and it caps everything: no prompt can answer from text that was not retrieved. So test the two halves separately, starting with retrieval, because it is cheap (no model call), fast and exact.

## Test cases

A retrieval test case is a *question* and some way to say what a correct passage looks like. We do **not** label chunk ids, because they change whenever you change the chunk size. We label a **phrase that the right passage must contain**.

```python src="ask-docs/backend/evals/cases.py" region="cases" title="backend/evals/cases.py"
```

Two groups:

- **Answerable** questions, deliberately phrased in everyday words, not the document's. "Can I buy lunch…" for a passage that says *food allowance*; "waterproof" for *rated IPX4*; "vacation" for *leave*. Questions that copy the document's words only test whether `Ctrl+F` works.
- **Out-of-scope** questions that a good system must *refuse*. A system that answers everything is not helpful, it is dangerous.

## The metrics

For each answerable question, search and look at where the first correct passage appears.

:::def Hit@k
The share of questions whose correct passage is among the top *k* results. Hit@5 asks "did the model get to see the right passage at all?", the minimum for a correct answer. Hit@1 asks "was it the very first?", which matters when you only show or send one or two passages.
:::

:::def MRR (mean reciprocal rank)
For each question, take 1 divided by the rank of the first correct passage (1st gives 1.0, 2nd gives 0.5, 3rd gives 0.33, missing gives 0), then average. One number that rewards putting the right passage high.
:::

Play with them. This block uses the same formulas as the project. Change the ranks and watch which metric moves:

```python run title="Hit@k and MRR on a few made-up searches" level=easy
# For each question: the rank of the first correct passage (1 = first). None = not in the results at all.
ranks = {
    "annual leave days": 1,
    "unused vacation": 3,
    "earbuds waterproof": 3,
    "battery life": 4,
    "late fee": 1,
    "something unanswerable": None,
}

n = len(ranks)
def hit_at(k):
    return sum(r is not None and r <= k for r in ranks.values()) / n

print(f"hit@1 = {hit_at(1):.0%}   hit@3 = {hit_at(3):.0%}   hit@5 = {hit_at(5):.0%}")
mrr = sum(1 / r for r in ranks.values() if r) / n
print(f"MRR   = {mrr:.2f}")
print()
for question, r in ranks.items():
    print(f"  {question:<26} rank {r if r else '-':>2}   contributes {1 / r if r else 0:.2f}")
```

The two metrics answer different questions. Moving "unused vacation" from rank 3 to rank 1 barely changes hit@5 (it was already found) but lifts MRR. A question that is *missing* costs as much as a question that is last-but-one for hit@5, and far more for MRR.

## The gate needs two numbers

Remember the relevance gate from lesson 5: it decides whether a question reaches the model at all. It can fail in two opposite ways, so we measure **both**:

| Metric | Question it answers |
|---|---|
| **answers questions** | of the answerable questions, how many does the gate let through? (too strict means useful questions are refused) |
| **refuses out of scope** | of the unrelated questions, how many are stopped? (too lax means nonsense reaches the model) |

```python src="ask-docs/backend/evals/retrieval.py" region="metrics" title="backend/evals/retrieval.py"
```

## Results with the built-in embedder

The runner builds a throw-away index from the three sample documents and evaluates all three modes:

```python local verify cwd="ask-docs/backend" title="python -m evals.retrieval"
from app.config import Settings
from evals.cases import ANSWERABLE, OUT_OF_SCOPE
from evals.retrieval import build, evaluate

settings = Settings(_env_file=None)                # the default: the built-in word-matching embedder
store, index, embedder = build(settings)
print(f"embedder: {embedder.name} | {len(ANSWERABLE)} answerable and {len(OUT_OF_SCOPE)} out-of-scope questions\n")
print(f"{'mode':<9}{'hit@1':>7}{'hit@3':>7}{'hit@5':>7}{'MRR':>7}{'answers':>9}{'refuses':>9}")
for mode in ("keyword", "vector", "hybrid"):
    r = evaluate(store, index, embedder, settings, mode)
    print(f"{mode:<9}{r['hit@1']:>7.0%}{r['hit@3']:>7.0%}{r['hit@5']:>7.0%}{r['mrr']:>7.2f}{r['answers_questions']:>9.0%}{r['refuses_out_of_scope']:>9.0%}")
```

```output
embedder: hash-1024 | 18 answerable and 5 out-of-scope questions

mode       hit@1  hit@3  hit@5    MRR  answers  refuses
keyword      83%    94%   100%   0.88     100%     100%
vector       78%    94%   100%   0.86      44%     100%
hybrid       83%    94%   100%   0.88     100%     100%
```

Read it row by row:

- **Everything finds the right passage in the top five (hit@5 = 100%)**, so a model would always see the answer. That is a good start, and also a warning about the *test*: with only three short documents the search has little to be confused by. Real collections of hundreds of documents are much harder. Add yours.
- **Hit@1 is only 83% for keyword and hybrid.** Three questions put the right passage second to fourth (vacation, battery, waterproof): exactly the ones where the built-in embedder cannot help, because it matches words.
- **Vector-only "answers" 44% of real questions.** The gate cannot trust the built-in vectors to say "this is relevant" (lesson 3: unrelated questions score up to 0.17 by chance and real ones as low as 0.06). Hybrid mode gates on BM25 as well and reaches 100% with no loss on refusals. *This is why the gate looks at both signals.*

## The same eval with a real embedding model

Switch to the local semantic model (`pip install -r requirements-semantic.txt`, `EMBEDDINGS_PROVIDER=fastembed`) and run the same command. Measured on the author's machine:

| mode | hit@1 | hit@3 | hit@5 | MRR | answers | refuses |
|---|---|---|---|---|---|---|
| keyword | 83% | 94% | 100% | 0.88 | 100% | 100% |
| vector | 89% | 100% | 100% | 0.94 | 100% | 100% |
| **hybrid** | **94%** | **100%** | **100%** | **0.97** | 100% | 100% |

Now the story is the one we promised: meaning beats words (vector 0.94 against keyword 0.88), and **the combination beats both** (0.97). The only question not ranked first by hybrid is the vacation one, which now sits second. The gate is perfect too: with a model whose scores are spread out, the 0.55 threshold separates real questions from nonsense.

## Experiment: what chunk size is best?

This is the kind of question you can now answer instead of argue about. The sweep rebuilds the index at several chunk sizes and re-runs the eval:

```python src="ask-docs/backend/evals/retrieval.py" region="sweep" title="backend/evals/retrieval.py"
```

```python local verify cwd="ask-docs/backend" title="Chunk size sweep (hybrid, built-in embedder)"
from evals.retrieval import sweep

print(f"{'size':>6} {'chunks':>7} {'hit@1':>7} {'hit@3':>7} {'MRR':>6}")
for row in sweep([200, 350, 700, 2500]):
    print(f"{row['size']:>6} {row['chunks']:>7} {row['hit@1']:>7.0%} {row['hit@3']:>7.0%} {row['mrr']:>6.2f}")
```

```output
  size  chunks   hit@1   hit@3    MRR
   200      51     78%     94%   0.86
   350      28     83%     94%   0.88
   700      22     83%     94%   0.88
  2500      22     83%     94%   0.88
```

At 200 characters the sections are cut into 51 tiny pieces and hit@1 drops. From 350 upwards the hit and MRR numbers are **identical**, and from 700 upwards even the chunk count stops falling, at 22. Why? Each of our documents is already split by headings, and a new heading always starts a new chunk, so the *sections* decide the boundaries, not the size limit. A 2,500-character limit simply never triggers. On a long document without headings, size would matter a great deal.

That is a real finding, and it is the point: **a number you measured on your own data beats any rule of thumb**, including the ones in this course.

## Tuning the thresholds

The two thresholds are chosen the same way. Look at the *scores* of each group and put the line in the gap:

| | Lowest / highest BM25 score | Built-in vector score |
|---|---|---|
| answerable questions (best passage) | lowest **2.32** | between 0.06 and 0.38 |
| out-of-scope questions | highest **0** | up to 0.17 |

BM25 separates them cleanly (2.32 against 0), so `keyword_threshold = 2.0` sits in the gap. The vector scores *overlap*, so no vector threshold can separate them, which is exactly why the built-in embedder's `relevance_threshold` is set high (0.20) and leaves the job to BM25. For every other embedder, run this analysis again: **never copy a threshold from another system.**

```python src="ask-docs/backend/tests/test_evals.py" region="eval-test" title="backend/tests/test_evals.py"
```

The test is a safety net: if someone changes the chunker, the tokenizer or a threshold and retrieval gets worse, it fails. The second test documents a *known weakness* (vector-only gating with the built-in embedder) so it cannot be forgotten.

## Beyond retrieval

When retrieval is good, measure the rest, with a model or a person as the judge:

| Question | Metric |
|---|---|
| Is every claim supported by the cited passage? | **faithfulness** (the biggest one) |
| Does the answer actually address the question? | answer relevance |
| Did we retrieve everything needed, and little that is not? | context recall and precision |
| Does the system refuse when it should, and only then? | refusal accuracy (we measure the gate; measure the model too) |

And in production, watch the signals your users give you for free: the share of questions that end in "not found" (a spike means documents are missing), thumbs up and down, and which sources get clicked.

:::keypoints
- Measure retrieval separately from generation: a model cannot answer from a passage it was never shown.
- Label the *phrase* a correct passage contains, not chunk ids; include out-of-scope questions that must be refused.
- Hit@k asks "was it found?", MRR asks "how high?"; measure the gate in both directions (answers real questions, refuses unrelated ones).
- Real results here: hybrid search beats keyword and vector alone, and a real embedder lifts MRR from 0.88 to 0.97.
- Run experiments (such as chunk size) instead of trusting rules of thumb, and read what the number does and does not say.
- Choose thresholds from the score distributions of your own data and re-check them whenever the embedder changes.
:::

```quiz
? Why label test cases with a phrase instead of a chunk id?
- Phrases are shorter
+ Chunk ids change whenever the chunking changes; a phrase stays true, so the eval survives experiments
- Ids are not stored
> A good test must not break when you improve the system you are testing.
? Hit@5 is 100% but hit@1 is 83%. What does it mean for the final answers?
- Nothing
+ The right passage always reaches the model, but sometimes not first; fine for 5 passages, a problem if you only send 1
- The embedder is broken
> Hit@k matters relative to how many passages you send; MRR shows how high the right one sits.
? The built-in vector-only mode answers only 44% of real questions. What is the fix in this project?
- Use a bigger chunk size
+ Gate on keyword (BM25) evidence as well, or switch to a semantic embedder
- Lower max_tokens
> A word-matching vector cannot judge relevance reliably, so the gate uses BM25 too; a real embedder also fixes it.
```

:::exercise Add ten questions of your own
Load your own documents, write ten answerable questions in everyday words (not the document's), plus three out-of-scope ones, and add them to `evals/cases.py` with the phrase that answers each. Run `python -m evals.retrieval` in all three modes. Which question does hybrid still miss? Is it a chunking problem (read the chunks!), a vocabulary problem (try a semantic embedder) or a missing-document problem? Write one sentence about what you would change, change it, and measure again.
:::
