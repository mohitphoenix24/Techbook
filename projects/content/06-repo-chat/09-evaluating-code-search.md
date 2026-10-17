---
title: Measuring retrieval
level: intermediate
time: 60
summary: Is the right code among what the model is shown? Labelled questions, hit rate and rank, a budget on how many lines of code are shown, an ablation that turns each idea on in turn, and a set of questions the search was never tuned on. The numbers are real, and some are not what you would hope. The whole evaluation runs in your browser.
tags: evals, hit rate, MRR, ablation, held-out set, retrieval quality
---

You have built a chunker, a weighted search, identifier splitting, a call graph and a citation check. Each felt like an improvement. **Were they?** "It seems better" is how teams fool themselves; a measurement is how they stop. This lesson measures retrieval, and the honest result is more interesting than a flattering one.

## Measure retrieval, not the answer

If the right code is not among what the model is shown, no prompt can save the answer. So the first question is separate from everything the model does: **for this question, was the code that answers it among the results?** That is cheap to measure (no model, no money, deterministic), and it tells you whether a wrong answer is a search problem or a model problem.

## Labelled questions

```python src="repo-chat/backend/evals/cases.py" region="cases" title="backend/evals/cases.py"
```

Each question lists `names`: the chunks a careful engineer would open to answer it (a function, a class, a section of a document). **Any one of them counts.** Several are listed because several are genuinely good answers ("how does a worker recover from a crash" is answered by `Storage.requeue_stale` *and* by `Worker.run_once`, which calls it). The last two have `names: []`: questions this repository cannot answer, where **finding nothing is the correct result**.

Notice the phrasing. Some questions use the code's words ("`Worker._handle_failure`"), some use ordinary ones ("what happens when a handler raises an exception?"), and some use words that are *not in the code at all* ("states" for `JobStatus`). A test set that only uses the code's own words would flatter a keyword search.

## Metrics

```python src="repo-chat/backend/evals/run.py" region="evaluate" title="backend/evals/run.py"
```

| Metric | Meaning |
|---|---|
| **hit@k** | the share of questions where a right chunk is among the first *k* results (1, 3, 5) |
| **MRR** (mean reciprocal rank) | 1 for a first-place hit, ½ for second, ⅓ for third... averaged: rewards finding it *earlier* |
| **in 120 lines** | the share where a right chunk appears within the first 120 lines of code shown: the model's attention is a budget |
| **lines shown** | the average amount of code sent to the model |
| **refused** | for the unanswerable questions, how often the search correctly found nothing |

The 120-line budget deserves a word. The baseline below sends **whole files**. Whole files are easy to *hit* (the right file is almost always in the top five of a 14-file repository), but hitting a 77-line file when the answer is 10 lines inside it is a poor result for the model, which must now find the needle. Hit@k alone would call that a win. Counting the lines shown makes the cost visible.

```python src="repo-chat/backend/evals/run.py" region="relevant" title="backend/evals/run.py"
```

For the whole-file baseline, a chunk is "relevant" if its *file* contains one of the right names. That is a **lenient** judgement, favouring the baseline, which makes the comparison harder for the chunker, so a win means something.

## Switch the ideas on one at a time

```python src="repo-chat/backend/evals/run.py" region="ablation" title="backend/evals/run.py"
```

An **ablation** runs the same questions with one more idea enabled each time, so you can attribute a change to the idea that caused it. Five configurations:

| | What is on |
|---|---|
| **A** | one chunk per whole file; plain words |
| **B** | chunk by function, method and class |
| **C** | + identifiers split into words |
| **D** | + a named symbol comes first |
| **E** | + the call graph brings in neighbours |

## Run the whole evaluation

This runs the real evaluation on the sample repository in your browser, on the questions the search was tuned against, and then on a held-out set it was not.

```python run src="repo-chat/backend/app/rag/secrets.py,repo-chat/backend/app/rag/ingest.py,repo-chat/backend/app/rag/chunker.py,repo-chat/backend/app/rag/codetext.py,repo-chat/backend/app/rag/index.py,repo-chat/backend/app/rag/graph.py,repo-chat/backend/app/rag/retrieve.py,repo-chat/backend/evals/cases.py#cases+held-out,repo-chat/backend/evals/run.py#relevant+evaluate+ablation" dir="repo-chat/backend/app/sample_repo" flat title="Ablation on the questions it was tuned on, and on held-out ones" level=advanced
files = [SourceFile(path, text) for path, text in SAMPLE_FILES.items() if path.endswith((".py", ".md"))]


def table(title, cases):
    print(f"\n{title}: {sum(1 for c in cases if c['names'])} answerable questions, {sum(1 for c in cases if not c['names'])} unanswerable")
    print(f"{'configuration':<36}{'chunks':>7}{'hit@1':>7}{'hit@3':>7}{'hit@5':>7}{'MRR':>6}{'in 120 lines':>14}{'lines shown':>13}{'refused':>9}")
    rows = ablation(files, cases)
    for r in rows:
        print(f"{r['name']:<36}{r['chunks']:>7}{r['hit_at_1']:>7.0%}{r['hit_at_3']:>7.0%}{r['hit_at_5']:>7.0%}{r['mrr']:>6.2f}{r['hit_in_budget']:>14.0%}{r['avg_lines']:>13}{r['refused_correctly']:>6}/{r['unanswerable']}")
    return rows


dev = table("1. DEV questions (the ones the search was tuned on)", CASES)
print("   still missed with everything on:", dev[-1]["missed"])
held = table("2. HELD-OUT questions (written after tuning, never used to tune)", HELD_OUT)
print("   still missed with everything on:", held[-1]["missed"] or "nothing")

print("\n3. Where does the right chunk land for each DEV question, with everything on?")
chunks = chunk_repo(files)
index, graph = CodeIndex(chunks), CallGraph(chunks)
for case in CASES:
    if not case["names"]:
        continue
    context = retrieve(index, graph, case["question"], k=5).context
    rank = next((i for i, h in enumerate(context, 1) if h.chunk.name in case["names"]), None)
    print(f"   {str(rank) if rank else '-':>2}  {case['question']}")
```

## Reading the table honestly

Look at the first table and resist the story you want. These are the numbers from the project's own run; yours may differ by a point or two if you change code.

| | Hit@1 | Hit@5 | MRR | Lines shown |
|---|---|---|---|---|
| **A.** whole files | **72%** | 94% | **0.83** | **186** |
| **E.** everything on | 50% | 94% | 0.66 | **66** |

1. **The whole-file baseline is better at finding the right *place first*.** It wins hit@1 and MRR. On a 14-file repository, the right file is easy to find, and a file is a bigger target than a function. If you had measured only hit@k you would have concluded the chunker was a mistake.
2. **It pays for that with about three times as much code.** Chunked retrieval shows the model 46 to 66 lines; whole files show 186. More code costs money, slows the answer, and (worse) buries the relevant lines. Within a 120-line budget the chunked version is **ahead on both sets** (94% versus 89% here, and 100% versus 50% on the held-out questions).
3. **Splitting identifiers helps** (B to C): hit@3 and hit@5 each rise about five points. It is the idea with the clearest effect.
4. **A named symbol first (D) changes nothing here.** Few of the 18 questions name a symbol, so there is little to gain. It would show on a set of "what does X do?" questions; do not remove it because *this* set is silent.
5. **The call graph (E) does not change the hit rate** (neighbours come *after* the hits and cannot reorder them), but on the held-out questions it takes the within-budget figure from 83% to 100%: one question is answered only by a neighbour.
6. **One question is missed by every configuration**: "what are the possible states of a job?". The class is called `JobStatus`. A person sees one idea; a keyword search sees `state` versus `status`. That miss is the argument for embeddings, and it is made by data, not opinion.

:::warn How much can 18 questions tell you?
Each answerable question is worth about **5.6 percentage points**. A difference of one question is noise; a difference of five points is *one* question moving. Treat gaps smaller than that as a tie, and do not choose between two ideas on a single question. A real evaluation set has dozens to hundreds of questions, written by people who did not build the search.
:::

## Dev and held-out

Every parameter in the search (`b = 0.4`, the test penalty, the minimum IDF, the stop words, the per-file cap) was chosen by running the dev questions and keeping what helped. That has a name: **tuning on the test set**. The risk is that you did not make the search better, you made it fit those 18 questions.

So a **held-out** set was written afterwards and never used to tune. Seven questions here, one of them unanswerable. If the held-out numbers were much *worse* than the dev ones, the tuning would be suspect. They are not: the chunked configurations are better than whole files at hit@1 (67% versus 50%) and in the line budget, and the unanswerable question is refused. That is reassuring, and modest: seven questions is a small sample, which is exactly why this is a *check*, not a proof.

## A bigger repository

The project's own runner can pad the sample with unrelated code to see how search copes (`python -m evals.run --distractors some/folder`). Adding 21 files from another project in this course (about 160 chunks instead of 67) gave:

| Configuration | Hit@5 | Lines shown | Unanswerable refused |
|---|---|---|---|
| A. whole files | 94% | 254 | 1 of 2 |
| E. everything on | 89% | 79 | 1 of 2 |

With 30 files from a different project: 94% and 280 lines for whole files, 83% and 79 for everything on, **0 of 2** refused. Two honest lessons. First, the chunked search loses a little hit rate as unrelated code is added, while whole files keep it, at three times the lines. Second, **the refusal discipline weakens**: with more code in the index, more ordinary words match *something*, and "nothing found" becomes rarer. A real system adds a second line of defence (the model is told to say so when the excerpts do not answer) and measures refusal as its own metric, exactly as done here.

## What to do when a question is missed

A missed question is a gift: it shows precisely what to improve. The method is always the same:

1. Run the question through the **search endpoint** (lesson 7) and read the ranked results with their reasons.
2. Is the right chunk anywhere in the list? Where, and what outranked it?
3. Decide: is it a **vocabulary gap** (the question says "states", the code says `Status`), a **chunking problem** (the answer is split across chunks), a **weighting problem** (a test or a README outranked the code), or a **truly absent** answer?
4. Fix the cause, not the question. Add the question to the set so it can never silently regress.

## Tests

```python src="repo-chat/backend/tests/test_evals.py" region="eval-tests" title="backend/tests/test_evals.py"
```

The evaluation is tested like any code: every label points at a chunk that exists (a typo in a name would silently count as a miss), the chunked search reaches sensible thresholds, **the held-out set agrees**, and chunking really does show the model far fewer lines.

:::keypoints
- Measure retrieval separately from the answer: if the right code is not retrieved, no prompt can fix it, and the measurement is cheap and deterministic.
- Label questions with every chunk that answers them, include words that are not in the code, and include unanswerable questions where finding nothing is right.
- Report hit@k, MRR, **and the amount of code shown**: whole files "hit" easily, and cost three times the lines.
- An ablation (one idea switched on at a time) attributes each change to its cause; some ideas show nothing on a small set, which is not proof they are useless.
- With 18 questions, one question is 5.6 points: treat smaller gaps as ties.
- Keep a held-out set that you never tune on; it checks that you improved the search rather than fitted the questions.
- Added unrelated code erodes both hit rate and the search's ability to say "nothing found". Measure refusal.
- A missed question tells you which kind of problem it is (vocabulary, chunking, weighting, absence): fix the cause, then add the question to the set.
:::

```quiz
? The whole-file baseline has a better hit@1 than the chunked search. Does that make it better?
- Yes: higher hit rate wins
+ Not on its own: it shows about three times as much code, which costs money and buries the answer; within a line budget the chunked version wins
- No: hit@1 is meaningless
> Report the cost of a hit, not only the hit.
? Why keep a held-out set that is never used to tune the search?
- Tests must be secret
+ Tuning on the same questions you report on can fit those questions instead of improving the search; the held-out set checks that
- It makes the evaluation larger
> A score on questions you tuned against is partly a measure of the tuning.
? One question moves hit@5 from 89% to 94% on 18 questions. What should you conclude?
- The idea is a clear success
+ Very little: one question is about 5.6 points, which is within noise
- The idea is a failure
> Small sets make small differences meaningless.
```

:::exercise Write your own held-out questions
Write six new questions about *jobq*, in your own words and without looking at `cases.py`, with the chunk names that answer them (read the repository to decide). Run them with `python -m evals.run`-style code or in the block above. Compare the hit rate with the dev set. Which of your questions used words that do not appear in the code? Did those fail more often? That gap is the size of the opportunity for embeddings.
:::
