---
title: Ingestion in the background, and storing the index
level: intermediate
time: 45
summary: Accept uploads instantly, process them in the background with visible progress, keep every chunk and vector in SQLite, rebuild the search index on restart without re-embedding, and re-index safely when the embedder changes.
tags: background tasks, SQLite, status, progress, restart
---

Embedding a 200-page PDF takes real time. If the upload request waits for it, the browser shows a spinner for a minute and the request may time out. The right shape is the one every job-processing system uses: **accept now, work later, report progress.**

## The life of a document

:::flow A document's status
queued | the file was accepted; a background task is scheduled
parsing | pages are read and cut into chunks
embedding | vectors are made, in batches, with a progress value
ready | chunks and vectors are saved; searchable immediately
:::

Or it ends in **failed**, with the reason stored on the document. The browser simply polls the document list and draws whatever status it sees (lesson 8).

## Storage: documents, chunks, vectors

```python src="ask-docs/backend/app/db.py" region="schema" title="backend/app/db.py"
```

- A **document** has a status and a progress value. These two columns are the whole "job system".
- A **chunk** stores its text, page and offsets, the heading, **the vector as raw float32 bytes** in a `BLOB`, and **`embed_model`**, the name of the embedder that produced the vector (lesson 3's warning, now in the schema).
- `ON DELETE CASCADE` removes a document's chunks automatically.

Storing vectors in SQLite is perfectly fine at this scale. A 384-dimension vector is 1.5 KB, so 100,000 chunks is about 150 MB. Beyond that you move to a vector database (pgvector, Qdrant, Weaviate, and so on) for approximate nearest-neighbour search; the rest of the design stays the same.

## The upload route

```python src="ask-docs/backend/app/routes/documents.py" region="upload" title="backend/app/routes/documents.py"
```

What happens, in order:

1. Each file is **validated immediately**: too big gives `413`, an unreadable or unsupported file gives `415`. Failing fast, with a clear message, beats failing minutes later in the background.
2. A document row is created with status `queued`, and a **background task** is scheduled with FastAPI's `BackgroundTasks`.
3. The route returns `202 Accepted` with the new documents. `202` means "I have accepted this and will process it", the honest status for asynchronous work.

:::note What BackgroundTasks is, and is not
`BackgroundTasks` runs the function **after the response is sent**, in the same process (a plain `def` runs in a thread pool, so it does not block other requests). It is perfect for learning and small deployments. It is **not** a durable queue: if the server restarts mid-job, the job is lost and the document stays `embedding` forever. Production systems use a real queue (Celery, RQ, arq, a cloud queue) with retries and a separate worker. Project 5 builds a small version of that.
:::

## The ingest function

```python src="ask-docs/backend/app/ingest.py" region="ingest" title="backend/app/ingest.py"
```

Read it for the decisions:

- **Every failure is recorded on the document** (`status="failed"`, `error=...`) instead of vanishing inside a background thread where no one can see it. The broad `except Exception` is deliberate here, and the only place in the project where it is the right choice.
- **Embedding runs in batches of 32**, updating `progress` after each. That is what moves the bar in the interface.
- The order matters: write chunks to SQLite, **then** add them to the in-memory index, **then** mark `ready`. A document is never `ready` unless it is saved *and* searchable.
- The chunks of an empty document (no text) raise a clear error: "The document has no readable text."

Pages come from a small function that supports text, Markdown and text-based PDFs:

```python src="ask-docs/backend/app/ingest.py" region="pages" title="backend/app/ingest.py"
```

## Restarting without re-embedding

The in-memory index is just a cache of what is in SQLite. At start-up `build_index` reads the stored vectors back (`np.frombuffer`, no model involved) and rebuilds both the vector matrix and the BM25 index:

```python src="ask-docs/backend/app/ingest.py" region="rebuild" title="backend/app/ingest.py"
```

Only chunks whose `embed_model` matches the **current** embedder are loaded, and only from documents that are `ready`. The rest wait in the database.

Watch the whole thing work. This script ingests the sample handbook, prints the progress reports and the stored chunks, then rebuilds the index as if the server had restarted:

```python local verify cwd="ask-docs/backend" title="Ingest a document, then rebuild the index"
import os, tempfile
from app.config import Settings
from app.db import Store
from app.ingest import build_index, ingest_document
from app.rag.embeddings import HashEmbedder
from app.rag.index import Index
from app.routes.documents import SAMPLES

settings = Settings(database_path=os.path.join(tempfile.mkdtemp(), "demo.db"), _env_file=None)
store, embedder = Store(settings.database_path), HashEmbedder()
index = Index(embedder)

text = (SAMPLES / "handbook.md").read_text(encoding="utf-8")
doc_id = store.create_document("Employee Handbook", "handbook.md", "text")
print("before:", store.get_document(doc_id)["status"])

progress = []
ingest_document(store, index, embedder, settings, doc_id, [text], on_progress=progress.append)
doc = store.get_document(doc_id)
print(f"after:  status={doc['status']}, chunks={doc['n_chunks']}, progress={doc['progress']}, reports={progress}")

for chunk in list(store.chunks_by_ids(index.ids).values())[:3]:
    print(f"  #{chunk['ordinal']} page {chunk['page']} [{chunk['heading']}] {len(chunk['text'])} chars: {chunk['text'][:48]}...")

rebuilt = build_index(store, embedder)          # what start-up does: read vectors back, embed nothing
print("rebuilt index:", len(rebuilt.ids), "chunks, identical ids:", rebuilt.ids == index.ids)
print("search after restart:", store.chunks_by_ids([rebuilt.search("sick leave doctor's note")[0].chunk_id]).popitem()[1]["heading"])
```

```output
before: queued
after:  status=ready, chunks=8, progress=1.0, reports=[1.0]
  #0 page 1 [Nayan Traders Employee Handbook] 197 chars: Welcome to Nayan Traders. This handbook explains...
  #1 page 1 [Working hours and remote work] 412 chars: Our core hours are 10:00 to 16:00, Monday to Fri...
  #2 page 1 [Leave] 661 chars: Every full-time employee gets 24 days of paid an...
rebuilt index: 8 chunks, identical ids: True
search after restart: Leave
```

## Changing the embedder

When you change `EMBEDDINGS_PROVIDER`, existing vectors belong to the old model. The app reports it and offers a fix:

```python src="ask-docs/backend/app/routes/documents.py" region="reindex" title="backend/app/routes/documents.py"
```

`/api/health` reports `stale_chunks` (chunks whose `embed_model` differs from the current embedder), the interface shows a notice with a **Re-index** button, and `reindex_all` re-embeds exactly those chunks in batches and then rebuilds the index. Nothing is searchable from the old model in the meantime, which is the safe behaviour: mixed vectors would return nonsense.

The project's tests describe the behaviour precisely:

```python src="ask-docs/backend/tests/test_ingest.py" region="ingest-tests" title="backend/tests/test_ingest.py"
```

```python src="ask-docs/backend/tests/test_api.py" region="restart-test" title="backend/tests/test_api.py"
```

The restart test is the most important: it counts how many *documents* the new embedder is asked to embed after a restart, and asserts the number is zero. It guards the property that matters most for cost, because re-embedding a large library on every deploy would be slow and, with a hosted embedder, expensive.

:::keypoints
- Accept uploads at once (`202`), validate early, and process in the background with a visible status and progress.
- Keep chunks, text, page, offsets, heading, vectors and the embedder's name in SQLite; the in-memory index is a rebuildable cache.
- Record every background failure on the document; never let it disappear.
- Write to the database, then to the index, then mark `ready`.
- Restart without re-embedding; re-embed only when the embedder changes, and say so in the interface.
- `BackgroundTasks` is not a durable queue: production needs a real one.
:::

```quiz
? Why does the upload route return 202 instead of 200?
- 202 is faster
+ The work is accepted but not finished; 202 says "being processed"
- 200 is not allowed for POST
> 202 Accepted is the honest status for asynchronous work: the client should check back for the result.
? The server restarts while a document is "embedding". What happens with BackgroundTasks?
- The job resumes automatically
+ The job is lost and the document stays stuck; a real queue would retry it
- The document becomes ready
> BackgroundTasks lives inside the process. Durable queues exist for exactly this reason.
? Why is it important that start-up does not re-embed documents?
- It saves disk space
+ Re-embedding is slow and, with a hosted embedder, costs money on every restart
- Because vectors cannot be recomputed
> Vectors are stored, so rebuilding the index only needs to read them back.
```

:::exercise Make failures visible and retryable
Add `POST /api/documents/{id}/retry` that re-runs ingestion for a `failed` document. You will need the original pages, which are not stored. Decide: store the original file's text in the database (simple, uses space) or keep the uploaded file on disk? Write a test that fails the first ingestion (use an embedder that raises once) and succeeds on retry. Which choice makes a "re-chunk everything with a new chunk size" feature easier?
:::
