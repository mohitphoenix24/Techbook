---
title: Following the call graph
level: intermediate
time: 45
summary: The answer to "what happens when a job fails?" is not in one function. A call graph, built from the names each chunk calls, brings in the code the best matches depend on and the code that depends on them. See the edges, the heuristics that keep it honest, and where it is wrong.
tags: call graph, graph RAG, retrieval, expansion, heuristics
---

Ask the sample repository: *"What happens when a handler raises an exception?"* Search finds `Worker._handle_failure`, which decides between a retry and giving up. But to explain the answer, a model also needs `should_retry` (the rule for retrying) and `backoff_delay` (how long to wait), and those two have almost nothing in common, word-for-word, with the question. Search by words finds the function that *matches*. The answer depends on the functions it *uses*.

This is the case where retrieval alone is not enough, and where **code gives you something prose does not**: relationships you can compute exactly.

## The idea

From the chunker you already have, for every chunk, the names it calls. Turn that into two lists per chunk: **who it calls** and **who calls it**. Then, after search, **expand**: for the best few hits, add their neighbours, scored a little lower than the hit they came from, each labelled with *why* it is there ("called by Worker._handle_failure").

```text
Worker.run_once  ──calls──▶  Worker._handle_failure  ──calls──▶  should_retry
                                                    └──calls──▶  backoff_delay
```

## Build the graph

```python src="repo-chat/backend/app/rag/graph.py" region="build" title="backend/app/rag/graph.py"
```

The hard part is not building edges, it is building *correct* ones. A call is recorded as a dotted name (`self.storage.mark_failed`, `backoff_delay`, `handlers.get`), and a name can refer to many things. Three rules keep the graph from filling with nonsense:

1. **`self.method()` resolves inside the same class only.** `Worker.run_once` calling `self._execute()` means `Worker._execute`, never an `_execute` somewhere else.
2. **Generic names are not followed.** `handlers.get(...)` and `items.append(...)` are calls on dictionaries and lists, but there is a method `Storage.get` in the repository. Without a rule, every dictionary lookup would create an edge to `Storage.get`. A small list of names too generic to trust (`get`, `append`, `items`, `join`, `execute`...) is ignored when the call has a receiver we cannot see.
3. **Self-edges and duplicates are dropped.**

The remaining case is a plain name like `backoff_delay` or `should_retry`, which resolves to the chunks with that name. That is a *heuristic*: it matches names, it does not understand Python. If two modules each define a function called `parse`, the graph links to both. It is a good trade: right nearly always, cheap, and every edge shows its reason.

## Expand

```python src="repo-chat/backend/app/rag/graph.py" region="expand" title="backend/app/rag/graph.py"
```

`expand` looks only at the **top three hits** (neighbours of a weak match are noise), gives each neighbour **half its parent's score**, labels it, and returns at most a few. Then the retrieval step removes neighbours that live in tests, unless the question asks about tests: tests call everything, and would otherwise be everyone's neighbour.

```python src="repo-chat/backend/app/rag/retrieve.py" region="retrieve" title="backend/app/rag/retrieve.py"
```

The model then sees the hits followed by the neighbours. The interface labels the latter **"from the call graph"**, so a reader can tell *found by search* from *brought in because of a relationship*.

## See the graph

```python run src="repo-chat/backend/app/rag/secrets.py,repo-chat/backend/app/rag/ingest.py,repo-chat/backend/app/rag/chunker.py,repo-chat/backend/app/rag/codetext.py,repo-chat/backend/app/rag/index.py,repo-chat/backend/app/rag/graph.py,repo-chat/backend/app/rag/retrieve.py" dir="repo-chat/backend/app/sample_repo" flat title="Edges, expansion, and a wrong guess" level=advanced
files = [SourceFile(path, text) for path, text in SAMPLE_FILES.items() if path.endswith((".py", ".md"))]
chunks = chunk_repo(files)
index, graph = CodeIndex(chunks), CallGraph(chunks)
name = {c.id: c.name or c.path for c in chunks}

print("=== 1. Who calls whom (a few functions from worker.py)")
for c in chunks:
    if c.path == "jobq/worker.py" and c.kind == "method" and graph.calls[c.id]:
        print(f"{c.name:<24}calls  {', '.join(name[i] for i in graph.calls[c.id])}")

print("\n=== 2. The same edges, the other way round: who depends on backoff_delay?")
target = next(c for c in chunks if c.name == "backoff_delay")
print("backoff_delay is called by:", [name[i] for i in graph.called_by[target.id]])

print("\n=== 3. Search alone, then search plus the graph")
question = "What does Worker._handle_failure do?"
for expand in (False, True):
    r = retrieve(index, graph, question, k=3, expand=expand)
    print(f"\nexpand={expand}")
    for h in r.context:
        tag = "graph " if h.expanded else "search"
        print(f"   [{tag}] {h.score:6.2f}  {h.chunk.name[:36]:<38}{', '.join(h.reasons)}")

print("\n=== 4. The generic-name rule, on a tiny made-up repository")
tiny = [
    Chunk("a.py:1-3", "a.py", "function", "caller", 1, 3, "x", calls=("handlers.get", "items.append", "compute")),
    Chunk("b.py:1-3", "b.py", "method", "Storage.get", 1, 3, "x"),
    Chunk("b.py:5-7", "b.py", "function", "append", 5, 7, "x"),
    Chunk("c.py:1-3", "c.py", "function", "compute", 1, 3, "x"),
    Chunk("c.py:5-7", "c.py", "function", "compute", 5, 7, "x"),
]
g = CallGraph(tiny)
print("caller's edges:", [f"{tiny[[c.id for c in tiny].index(i)].path}:{i.split(':')[1]}" for i in g.calls["a.py:1-3"]])
print("  `handlers.get` and `items.append` were ignored (too generic)")
print("  `compute` matched BOTH functions with that name: the graph guesses by name, so it can over-link")
```

Section 1 shows the graph `Worker.run_once` really has in the code (`_execute`, `_handle_failure`, `claim_next`, `requeue_stale`...). Section 3 is the point of the lesson: with expansion off, the answer shows the function and its neighbours in the same file; with expansion on, `should_retry` and `backoff_delay` appear, labelled "called by Worker._handle_failure", with a score of half the hit that brought them. Section 4 shows both the guard (generic names ignored) and its price (two functions named `compute` are both linked).

## When it helps, and when it does not

| Situation | Effect |
|---|---|
| "What does X do?" where X delegates to helpers | big help: the helpers are the answer |
| "Where is X?" (one function) | none, neutral |
| A question about a *concept*, not a function | little: search must find the starting point first |
| A repository with many same-named functions | noise: more false neighbours |

The honest measure of whether this is worth keeping is lesson 9. A teaser: on the labelled questions, adding the call graph does **not** change how often the right chunk is among the first five *hits* (it adds neighbours after the hits, so it cannot reorder them). What it changes is what the model is *shown*: on the held-out questions, one is answered only by a neighbour that search alone did not rank. That is why you must measure the right thing.

## Tests

```python src="repo-chat/backend/tests/test_graph.py" region="graph-tests" title="backend/tests/test_graph.py"
```

:::keypoints
- Search finds what matches the question; the answer often depends on what the matches *use*. Code gives you those relationships exactly.
- From each chunk's recorded calls, build "calls" and "called by" lists, then expand the best few hits with their neighbours at a lower score, each labelled with why.
- Resolve `self.method()` inside the same class only; ignore generic names such as `get` and `append`; drop self-edges.
- Name-based resolution is a heuristic and can over-link: say so, and show the reason on every edge.
- Keep tests out of the neighbours unless the question is about tests.
- Expansion does not reorder hits, so hit@k cannot show its value: measure what the model is shown, not only where the first hit lands.
:::

```quiz
? Why does `handlers.get(task)` not create an edge to `Storage.get`?
- A bug
+ `get` is too generic to trust: it is a dictionary call, and linking it would connect unrelated code
- Dictionaries cannot be called
> A name rule keeps the graph from filling with false edges.
? Neighbours get half their parent's score. Why not the full score?
- To save memory
+ A neighbour is relevant because of a relationship, not because it matches the question, so it ranks below real matches
- Scores cannot be equal
> The graph supports the answer; it should not outrank the evidence.
? Where does the call graph come from?
- The model
+ The names each chunk calls, recorded by the chunker from Python's own parse tree
- A running program
> It is computed statically: cheap, exact about what the code says, and blind to dynamic behaviour.
```

:::exercise Go two steps
Change `expand` to follow edges **two** steps (neighbours of neighbours, with a score quartered at the second step). Run the lesson 9 evaluation before and after. Does the model get more *useful* code or just more code? Count the lines shown (the evaluation reports it) and decide what a good limit is. What kind of repository would make two steps explode?
:::
