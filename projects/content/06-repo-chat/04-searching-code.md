---
title: Searching code
level: intermediate
time: 60
summary: Rank chunks with BM25 made aware of what a chunk is: identifiers split into words, separate weights for name, path, signature, docstring and body, a named symbol ranked first, tests demoted, and words that appear everywhere ignored. See the scores and the reasons, and see exactly where keyword search still fails.
tags: search, BM25, identifiers, ranking, retrieval
---

You have chunks. A question arrives: "Where is the retry delay calculated?" Which chunk should the model see first? That is search, and for code a plain keyword ranking misses three things that a person would never miss.

## Three things plain search gets wrong about code

1. **Identifiers are one strange word.** The answer is a function called `backoff_delay`. The question says "retry delay". A search that treats `backoff_delay` as a single token finds no overlap with "delay" at all.
2. **Everything in a chunk counts the same.** A function *named* `backoff_delay` is a far better answer to "backoff" than a function that merely mentions the word once in a comment. The name, the path and the docstring are summaries that a person wrote on purpose.
3. **Names are not words.** If the question says `_handle_failure`, the person is pointing at one specific function, and it should come first, with no scoring subtlety.

## Make identifiers into words

```python src="repo-chat/backend/app/rag/codetext.py" region="split" title="backend/app/rag/codetext.py"
```

```python src="repo-chat/backend/app/rag/codetext.py" region="tokens" title="backend/app/rag/codetext.py"
```

`split_identifier` breaks a name at underscores and at camelCase boundaries: `backoff_delay` becomes `backoff` and `delay`; `getUserByID` becomes `get`, `user`, `by`, `id`; `HTTPServerError` becomes `http`, `server`, `error`. `code_tokens` then also keeps the **whole identifier** (`backoffdelay`) beside its parts, so a loose question and an exact name both hit.

The same function tokenises code *and* questions, so they meet in the same vocabulary. Stop words are removed, including the words of code itself (`def`, `self`, `return`) and filler from questions ("happens", "using", "work"). A crude plural fold makes `retries` meet `retry`.

## Weight the parts of a chunk

```python src="repo-chat/backend/app/rag/index.py" region="weights" title="backend/app/rag/index.py"
```

A chunk is not a bag of words, so each field counts with its own weight. A word found once in the **name** counts three times; in the **path**, **signature** and **docstring**, twice; in the **body**, once. The index builds, for each chunk, a table of weighted term counts, and BM25 scores a question against it.

```python src="repo-chat/backend/app/rag/index.py" region="index" title="backend/app/rag/index.py"
```

BM25 recap, from Project 3: a term's score grows with how often it appears (with diminishing returns, controlled by `k1`) and with how *rare* it is (`idf`), and is adjusted for the length of the chunk (`b`).

Two settings are different from the textbook, for good reasons:

- **`b = 0.4`, not 0.75.** BM25 punishes long documents on the assumption that they say more because they are wordy. A 26-line `main` function that mentions `SIGTERM` once is not wordy: it is just big. A lower `b` stops long functions being buried (measured on the labelled questions in lesson 9: the right chunk comes first more often).
- **`MIN_IDF = 0.4`.** A word that appears in most chunks says nothing: here, `jobq` is in every path. A question like "how do I plug jobq into Django with Celery?" would otherwise match everything a little, and the repository would appear to have an answer. Ignoring ubiquitous words lets the search say *nothing found*.

## A named symbol comes first

```python src="repo-chat/backend/app/rag/index.py" region="index" title="backend/app/rag/index.py (search and named_in)"
```

When the question contains `Worker._handle_failure`, or `backoff_delay()`, `search` adds `SYMBOL_BOOST` (6.0) to that chunk, and records the reason **"named in the question"**. The rule that decides what counts as a name is the subtle part:

> "How do I schedule a **job** every five minutes?" must not boost the class `Job`.

An English word is not a symbol. So a name counts only when it is **written the way code writes it**: with an underscore or a dot (`backoff_delay`, `Worker._execute`), or with the exact capitals of a class (`Job`). The lowercase word "job" in a sentence does not. The first version of this check was case-insensitive, and it put the `Job` class first for nearly every question that contained the word "job". A test now guards it.

## Tests mention everything

Test files name every function in the code, so for almost any question some test ranks near the top: `test_a_permanent_error_is_never_retried` matches "errors never retried" word for word. But a person asking how something works wants the *code*, not its test. So tests are demoted (`TEST_PENALTY = 0.6`) unless the question itself says "test". They remain findable, and a test whose name repeats the question word for word can still win (section 5 shows exactly that), but they stop taking slots that the code, the docs and the config should have.

## Try it

```python run src="repo-chat/backend/app/rag/secrets.py,repo-chat/backend/app/rag/ingest.py,repo-chat/backend/app/rag/chunker.py,repo-chat/backend/app/rag/codetext.py,repo-chat/backend/app/rag/index.py" dir="repo-chat/backend/app/sample_repo" flat title="Search the sample repository" level=advanced
files = [SourceFile(path, text) for path, text in SAMPLE_FILES.items() if path.endswith((".py", ".md"))]
chunks = chunk_repo(files)
index = CodeIndex(chunks)

print("=== 1. Questions and terms")
q = "Where is the retry delay calculated?"
print("question:", q)
print("terms   :", code_tokens(q))
print("terms of the code `def backoff_delay(attempt, policy)`:", code_tokens("def backoff_delay(attempt, policy)"))


def show(question, k=4, **kw):
    print(f"\n? {question}")
    hits = index.search(question, k, **kw)
    if not hits:
        print("   (nothing scored high enough: the repository does not cover this)")
    for h in hits:
        print(f"   {h.score:6.2f}  {h.chunk.name[:40]:<42}{h.chunk.path}:{h.chunk.start}-{h.chunk.end}   {', '.join(h.reasons)}")


print("\n=== 2. Ordinary questions")
for question in ("Where is the retry delay calculated?", "How is a job claimed so that two workers never take the same one?",
                 "What happens to a job whose task has no registered handler?", "How do I schedule a job every five minutes?"):
    show(question)

print("\n=== 3. A question that names a symbol")
show("What does Worker._handle_failure do?", 3)
show("What does _execute do?", 2)

print("\n=== 4. Splitting identifiers: the same question with and without it")
question = "What is the default maximum number of attempts for a job?"
right = {"Config", "new_job", "Job", "README.md > jobq > How retries work"}            # the chunks that really answer it
print("   (a * marks a chunk that really answers the question)")
for label, idx in (("plain words", CodeIndex(chunks, split_identifiers=False)), ("split identifiers", index)):
    hits = idx.search(question, 5, symbol_boost=False)
    print(f"   {label:<18}", [("*" if h.chunk.name in right else "") + h.chunk.name for h in hits])

print("\n=== 5. Tests are demoted unless you ask about them")
show("Which errors are never retried?", 3)
show("Which tests check the retry delay?", 2)

print("\n=== 6. Questions the repository cannot answer")
show("What is the airspeed velocity of an unladen swallow?")
show("How do I plug jobq into a Django project with Celery?")

print("\n=== 7. Where keyword search still fails")
show("What are the possible states of a job?", 3)
```

Go through the sections and note the *reasons* printed beside each hit. The first-ranked chunk for "retry delay" is `backoff_delay`, matched on **retry and delay** even though those words are not in its name: the docstring supplies them. Section 3 shows the named symbol first. Section 4 shows the plain version with *no* right answer in its first five for the "attempts" question, because `max_attempts` was one strange word, while the split version has one (and it is only a keyword search: the best chunk is not first). Section 6 returns *nothing*, which is correct.

Section 7 is the honest one. The question asks for "states"; the class is called `JobStatus`. A person sees these as the same idea. A keyword search sees two different words, `state` and `status`, and finds neither. **Search by meaning is exactly what embeddings do**, and the next time you see a keyword search fail like this, you are looking at the reason people combine the two (lesson 10 returns to it).

## Variety, then retrieve

```python src="repo-chat/backend/app/rag/retrieve.py" region="retrieve" title="backend/app/rag/retrieve.py"
```

`retrieve` asks the index for four times as many candidates as needed, then keeps **at most two per file**. Without that rule, a question about retries can fill all five slots from `worker.py` and `retry.py`, and the docs and the config, which also answer it, never appear. Then it brings in the call graph's neighbours (lesson 5).

## Tests

```python src="repo-chat/backend/tests/test_index.py" region="index-tests" title="backend/tests/test_index.py"
```

```python src="repo-chat/backend/tests/test_codetext.py" region="codetext-tests" title="backend/tests/test_codetext.py"
```

:::keypoints
- Code search needs three upgrades over plain keywords: split identifiers into words, weight name, path, signature and docstring above the body, and rank a named symbol first.
- Tokenise code and questions the same way so they meet in one vocabulary; keep the whole identifier beside its parts.
- A name counts as a symbol only when written as code writes it (an underscore, a dot, a class's exact capitals), never because an English word matches.
- Lower BM25's length penalty for code; ignore words found in most chunks; return nothing below a score floor.
- Demote tests unless the question is about tests; keep variety with a per-file cap.
- Show the reasons for every hit. And know the limit: vocabulary gaps such as "states" versus `JobStatus` are what embeddings are for.
:::

```quiz
? Why keep the whole identifier (`backoffdelay`) as well as its parts (`backoff`, `delay`)?
- To make the index larger
+ A loose question matches the parts, an exact name matches the whole, and both should find the function
- Parts alone would not compile
> Both ways of asking should hit.
? "How do I schedule a job?" boosts the class Job. What is wrong?
- Nothing
+ An ordinary English word must not count as a symbol; a name counts only when written as code writes it
- Job is not a class
> Case-insensitive name matching made common words look like symbols.
? Why ignore words that appear in most chunks, like the project's own name?
- They are stop words
+ They carry no information, and ignoring them lets the search say "nothing found" instead of matching everything a little
- They are too short
> A question must match something that distinguishes one chunk from the others.
```

:::exercise Teach it a synonym
The question "What are the possible states of a job?" misses `JobStatus`. Add a tiny synonym table (`state -> status`, `delete -> remove`, `crash -> fail`) applied to *question* terms only, and run the evaluation of lesson 9 before and after. Does the hit rate go up? Does anything get worse? Why would a hand-written synonym table be the wrong long-term answer, and what would you use instead?
:::
