---
title: Chatting with a codebase
level: intermediate
time: 40
summary: Why retrieval for source code is a different problem from retrieval for documents, the pipeline you will build (read safely, chunk by structure, search, follow the call graph, answer with checked citations), and a tour of the sample repository you will ask questions about.
tags: RAG, code search, architecture, citations
---

You have built retrieval before. In Project 3 (AskDocs) you cut documents into passages, searched them with keywords and embeddings, and made the model cite its sources. This project uses the same idea on a different kind of text, and almost every step has to change. That is the point: **retrieval-augmented generation is a pattern, and the details depend on what you are retrieving.**

## Why code is different

| | Documents (Project 3) | Source code (this project) |
|---|---|---|
| **Natural unit** | a paragraph, a section | a function, a method, a class |
| **Cutting by size** | usually fine | **cuts functions in half** and glues unrelated code together |
| **Vocabulary** | everyday words | identifiers: `backoff_delay`, `getUserByID`, `_handle_failure` |
| **Meaning lives in** | the text | the text *and* the relationships: who calls whom |
| **A citation is** | "page 4" | a file and a **line range**, which must be exactly right |
| **Dangerous contents** | personal data | **secrets**: API keys, private keys, passwords |
| **Where it comes from** | files you upload | a ZIP: **untrusted input** (bombs, escaping paths) |

Each row is a lesson in this module.

## What you will build

![RepoChat: an answer with clickable citations on the left, and the cited lines highlighted in the file on the right](assets/img/repo-chat-answer.png)

Pick a repository (a built-in sample, or a ZIP of your own), ask a question, and get an answer that **cites `file:lines`**. Click a citation and the file opens with exactly those lines highlighted. Open "What I looked at" and see which pieces of code the model was shown, how well each matched, and *why*.

```viz algo=arch title="RepoChat" dir=right
ui    React UI | chat, tree, code viewer [browser] @0,0
api   FastAPI | upload, search, ask (SSE) [service] @1,0
ing   Safe ingest | ZIP limits, secret masking [guard] @2,0
chk   Chunker | functions, classes, sections [tool] @3,0
idx   Search index | weighted BM25 + symbols [db] @3,1.6
gr    Call graph | who calls whom [map] @4,1.6
llm   Claude | or the offline summariser [llm] @4,0
cit   Citation check | file, lines, shown? [filter] @2,1.6
--
ui -> api : question, upload
api ~> ui : retrieval, words, citations
api -> ing
ing -> chk
chk -> idx
idx -> gr
api -> llm : code excerpts + question
api -> cit : the answer
```

One question takes this path:

```viz algo=seq title="One question about the code"
participant ui Browser [browser]
participant api Server [service]
participant ix Index [db]
participant llm Claude [llm]
ui -> api : "Where is the retry delay calculated?"
api -> ix : search (names, paths, docstrings, bodies)
ix --> api : the best chunks, with scores and reasons
api -> ix : bring in what they call and what calls them
api --> ui : what I looked at
api -> llm : numbered excerpts + the question
llm --> api : the answer, streamed
api -> api : check every [file:lines]
api --> ui : words, then the verdict on each citation
```

| Stage | What it does | Lesson |
|---|---|---|
| **Read** | takes a folder or a ZIP, refuses unsafe paths and bombs, skips binaries, **masks secrets** | 2 |
| **Chunk** | one chunk per function, method, class and README section, each with its exact line range | 3 |
| **Search** | splits identifiers, weights name, path, signature, docstring and body differently, puts a named symbol first | 4 |
| **Expand** | follows the call graph to bring in the code a function depends on | 5 |
| **Answer** | shows the model numbered excerpts, demands `[path:start-end]` citations, and checks them | 6 |
| **Serve** | an API that streams retrieval, words and citations as events | 7 |
| **Show** | a file tree, a code viewer that highlights cited lines, and an evidence panel | 8 |
| **Measure** | labelled questions, held-out questions, and an ablation: each idea switched on in turn | 9 |
| **Limits** | where keyword search fails, security, and what to build next | 10 |

## The sample repository

You need something to ask questions about. The project ships a small, real library, **jobq**: a background job queue backed by SQLite, about 580 lines in 14 files, with its own passing tests.

| File | What is in it |
|---|---|
| `jobq/models.py` | `Job`, `JobStatus`, `new_job` |
| `jobq/storage.py` | `Storage`: `add`, `claim_next` (two workers must never take one job), `mark_done`, `mark_failed`, `requeue_stale` |
| `jobq/retry.py` | `backoff_delay`, `should_retry`, `RetryPolicy`, `PermanentError` |
| `jobq/worker.py` | `Worker`: `run_once`, `_execute`, `_handle_failure`, `run_forever` |
| `jobq/scheduler.py` | `parse_interval`, `Scheduler` |
| `jobq/config.py`, `metrics.py`, `cli.py` | settings from the environment, counters, the command line |
| `README.md`, `docs/architecture.md` | how it is used and how it works |
| `tests/` | tests for retry and the worker |

It has what a good test repository needs: functions that call each other (so there is a call graph), docs that explain the same things as the code (so retrieval has choices), tests that mention everything (so retrieval has noise to ignore), and behaviours with plain-language names ("crash recovery", "retry") that are spelled differently in code (`requeue_stale`, `backoff_delay`).

:::note Why not index a famous open-source project?
Because you could not check the answers. With a repository this size, you can read all of it in ten minutes, so when the system says "`Worker._handle_failure` decides between a retry and giving up", you can verify it. Evaluating retrieval needs a repository where *you* know the right answer.
:::

## Setup

```bash
mkdir repo-chat && cd repo-chat
mkdir -p backend/app/{llm,routes,rag,sample_repo} backend/tests backend/evals
cd backend && python -m venv .venv && source .venv/bin/activate
```

```text src="repo-chat/backend/requirements.txt" title="backend/requirements.txt"
```

There is **no vector database and no embedding model** in this project, on purpose. Lesson 4 explains why keyword search, done properly, is a strong baseline for code, and lesson 10 says when you would add embeddings. The only new dependency compared with Project 4 is `python-multipart`, for ZIP uploads.

```python src="repo-chat/backend/app/config.py" region="settings" title="backend/app/config.py"
```

Every limit that protects the server (upload size, number of files, size per file, total size, repositories kept) is a setting.

:::keypoints
- RAG is a pattern; the details depend on what you retrieve. Code has structure (cut by function, not by size), a special vocabulary (identifiers), relationships (calls), exact citations (line ranges) and special risks (secrets, hostile ZIPs).
- The pipeline: read safely, chunk by structure, search, follow the call graph, answer with checked citations.
- A sample repository you can read in ten minutes is the best test bed, because you can verify the answers yourself.
- No vector store here: a strong keyword baseline first, embeddings when measurements ask for them.
:::

```quiz
? Why is cutting a source file into fixed-size windows a poor idea?
- It is slow
+ It cuts functions in half and joins unrelated code, so a retrieved piece may be unreadable or misleading
- Windows cannot hold identifiers
> Code has natural units (functions, classes). Use them.
? Why use a small repository you can read yourself for this project?
- It runs faster
+ You can check the answers and know what the right retrieval result is, which is what evaluating retrieval needs
- Large repositories are not allowed
> You cannot evaluate what you cannot verify.
? Which of these is a risk that documents rarely have but code often does?
- Spelling mistakes
+ Secrets such as API keys and private keys, and ZIP files that are hostile
- Long sentences
> Code repositories often contain credentials, and a ZIP upload is untrusted input.
```

:::exercise Predict before you build
Before reading further, write down three questions you would ask about *jobq* and where in the repository you expect the answer to be. Keep the list. In lesson 9 you will run labelled questions against the real system; compare your three with how it does, and note which of your questions use words that do not appear in the code at all.
:::
