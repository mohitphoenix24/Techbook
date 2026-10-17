---
title: Chunking code by structure
level: intermediate
time: 50
summary: Cut source files where the code itself says to cut: one chunk per function, method and class, found with Python's own parser, plus README sections and a fallback for other languages. Every chunk keeps its exact line range, which is also how it will be cited. Watch fixed windows slice a function in half, then see the structural chunks of a real repository.
tags: chunking, ast, parsing, code, citations
---

Chunking is the decision that matters most in a retrieval system, because everything after it can only find what the chunker preserved. In Project 3 you cut documents into passages by size. For code that is the wrong tool, and the easiest way to see why is to try it.

## Fixed windows cut functions in half

Take `Worker._handle_failure` from the sample repository and slice `worker.py` into windows of 500 characters, the way a document chunker would. Run this and look at where the cuts fall:

```python run src="repo-chat/backend/app/rag/secrets.py,repo-chat/backend/app/rag/ingest.py,repo-chat/backend/app/rag/chunker.py" dir="repo-chat/backend/app/sample_repo" flat title="Fixed windows versus structure" level=intermediate
text = SAMPLE_FILES["jobq/worker.py"]
lines = text.splitlines()

print("=== 1. The same file in windows of 500 characters")
pos, windows = 0, []
while pos < len(text):
    windows.append((pos, text[pos:pos + 500]))
    pos += 500
target = text.index("def _handle_failure")
for n, (start, piece) in enumerate(windows, start=1):
    first = text[:start].count("\n") + 1
    last = first + piece.count("\n")
    holds = "  <-- contains the start of _handle_failure" if start <= target < start + 500 else ""
    broken = "  <-- ENDS IN THE MIDDLE OF A LINE" if not piece.endswith("\n") and start + 500 < len(text) else ""
    print(f"window {n}: lines {first}-{last}{holds}{broken}")
print("\nWhat the last lines of the window that holds the function's start look like:")
w = next(p for s, p in windows if s <= target < s + 500)
print("   ...", w[-70:].replace("\n", "\n   "))

print("\n=== 2. The same file, chunked by structure")
for c in chunk_python(SourceFile("jobq/worker.py", text)):
    calls = sorted({name.split('.')[-1] for name in c.calls})[:4]
    print(f"{c.id:<24}{c.kind:<8}{c.name:<26}{len(c.text.splitlines()):>3} lines  calls {calls}")
```

A fixed window ends wherever the character count says, which is usually in the middle of a statement, and the function you want is often split across two windows, neither of which makes sense alone. A search can only return a window; a model shown half a function will describe half a function. With structure, **each chunk is a whole function with its decorators and docstring**, and its line range is exact.

## What a chunk is

```python src="repo-chat/backend/app/rag/chunker.py" region="chunk" title="backend/app/rag/chunker.py"
```

| Field | What it is for |
|---|---|
| `id`, `start`, `end` | the **exact line range**, so a chunk *is* a citation: `jobq/worker.py:58-67` |
| `kind` | `module`, `class`, `function`, `method`, `doc` (a README section), `code` (a fallback window) |
| `name` | the qualified name, `Worker._handle_failure`: the strongest search signal there is |
| `text` | the source lines exactly as written, so what the model reads is what the viewer shows |
| `signature`, `doc` | what it takes and returns, and the first paragraph of its docstring: both are searched with extra weight |
| `calls` | the names it calls: the raw material for the call graph (lesson 5) |

## Python: let the parser tell you

Python ships its own parser, the `ast` module. It turns source into a tree whose nodes know their first and last line, so "where does this function end?" is a lookup, not a guess.

```python src="repo-chat/backend/app/rag/chunker.py" region="python" title="backend/app/rag/chunker.py"
```

The rules, in plain words:

- **Every top-level function is one chunk**, starting at its first *decorator* (a chunk that omits `@functools.cache` misleads).
- **A class is one chunk if it is short** (25 lines or fewer). **A long class is split**: a *header* chunk (the docstring and attributes) plus one chunk **per method**, named `Worker._handle_failure`. Methods are what people ask about, so they must be retrievable one by one.
- The header of a split class gets **no calls** (`calls=()`). The methods own their calls; if the header claimed all of them, the call graph would be full of false edges from the class to everything its methods use.
- **Everything outside definitions** (imports, the module docstring, constants) is gathered into `module` chunks, if there is enough of it to mean anything.
- **Code that does not parse** (a syntax error, a Python 2 file) falls back to windows: a repository is allowed to contain broken files, and the app must not crash on one.

`_calls` records the dotted name of everything called inside a chunk, such as `backoff_delay` or `self.storage.mark_failed`. The graph will decide what they refer to; the chunker only records what the code says.

## README and docs: by heading

```python src="repo-chat/backend/app/rag/chunker.py" region="markdown" title="backend/app/rag/chunker.py"
```

Documentation has structure too, in headings. Each section becomes a chunk named by its **heading path**, `README.md > jobq > How retries work`, which is a good title for a search to match. Two details: `#` lines inside a fenced code block are not headings (a shell comment would otherwise split a section), and a heading with nothing under it is not worth a chunk.

## Other languages: a careful fallback

```python src="repo-chat/backend/app/rag/chunker.py" region="lines" title="backend/app/rag/chunker.py"
```

For JavaScript, Go, SQL and the rest, this project uses windows of about 40 lines, **cut at a blank line** when one is close (a blank line is usually a boundary between functions). It is much better than cutting by characters, and still worse than parsing.

:::tip The real fix for other languages
Production tools use **tree-sitter**, a parser library with grammars for dozens of languages, to find function and class boundaries the way `ast` does for Python. Swapping it in changes only this one module: every later stage works with `Chunk` objects and does not care how they were made. That is the benefit of keeping the chunker behind a small interface.
:::

## See the chunks of a real repository

```python run src="repo-chat/backend/app/rag/secrets.py,repo-chat/backend/app/rag/ingest.py,repo-chat/backend/app/rag/chunker.py" dir="repo-chat/backend/app/sample_repo" flat title="Chunk the whole sample repository" level=intermediate
files = [SourceFile(path, text) for path, text in SAMPLE_FILES.items() if path.endswith((".py", ".md"))]
chunks = chunk_repo(files)
print(f"{len(files)} files -> {len(chunks)} chunks\n")

by_kind = {}
for c in chunks:
    by_kind[c.kind] = by_kind.get(c.kind, 0) + 1
print("by kind:", by_kind)

print("\n=== storage.py and the README")
for c in chunks:
    if c.path in ("jobq/storage.py", "README.md"):
        print(f"{c.id:<26}{c.kind:<9}{c.name[:46]:<48}{c.end - c.start + 1:>3} lines")

print("\n=== One chunk, in full: its text is exactly the lines from the file")
failure = next(c for c in chunks if c.name == "Worker._handle_failure")
print(f"signature: {failure.signature}")
print(f"doc:       {failure.doc}")
print(f"calls:     {failure.calls}\n")
print(failure.text)

print("\n=== Invariants that must always hold")
source = {f.path: f.text.splitlines() for f in files}
exact = all(c.text == "\n".join(source[c.path][c.start - 1:c.end]) for c in chunks)
overlap = [(a.id, b.id) for path in source for a, b in zip([c for c in chunks if c.path == path], [c for c in chunks if c.path == path][1:]) if a.end >= b.start]
print("every chunk's text equals its lines in the file:", exact)
print("chunks within a file never overlap:             ", not overlap)
```

Read the invariants at the bottom: every chunk's text is **exactly** the lines it claims, and no two chunks in a file overlap. Those two properties are what make citations trustworthy later: a chunk's id *is* a line range, and the text the model read is the text the viewer will highlight. They are also tested.

## Tests

```python src="repo-chat/backend/tests/test_chunker.py" region="chunker-tests" title="backend/tests/test_chunker.py"
```

:::keypoints
- Chunking decides what retrieval can ever find. For code, cut at function, method and class boundaries, not by size.
- Python's `ast` gives exact line ranges, including decorators; split long classes into a header plus one chunk per method, and give each method its own calls.
- A chunk's id is a line range, and its text is exactly those lines: a chunk *is* a citation.
- Name document chunks by heading path; ignore `#` inside code fences; skip empty sections.
- Always have a fallback (windows cut at blank lines) so broken or unfamiliar files are searchable and never crash the app.
- Keep the chunker behind a small interface: swapping in tree-sitter for other languages should change one module.
:::

```quiz
? Why is a long class split into a header and one chunk per method?
- To make the index smaller
+ Methods are what people ask about, so each must be retrievable on its own
- Classes cannot be indexed
> Retrieval works at the granularity of your chunks.
? The header chunk of a split class has no calls recorded. Why?
- A mistake
+ Its methods own their calls; otherwise the call graph would link the class to everything its methods use
- Headers do not contain code
> Attribute the relationships to the code that actually makes them.
? Why must a chunk's text be exactly the lines in the file?
- It saves memory
+ So what the model read is what the viewer highlights, and a citation can be trusted
- Python requires it
> Citations are only meaningful if chunks and files agree.
```

:::exercise Chunk a new language
Write `chunk_js` for JavaScript using a simple rule: a chunk starts at a line beginning with `function `, `async function `, `export function `, `class ` or `const name = (` and ends just before the next such line (or the end of the file). Register it in `chunk_file` for `.js` and `.ts`, and write three tests: a file with two functions, a file with a class, and a file with none of them (which should fall back to windows). What does your simple rule get wrong that tree-sitter would not?
:::
