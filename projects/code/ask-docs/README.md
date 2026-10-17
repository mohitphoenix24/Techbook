# AskDocs

Chat with your own documents, with answers you can check. **React + TypeScript** front end, **FastAPI** back end, **Claude** (or an offline demo model) for the answers.
It is Project 3 of the ProjectLab course, and the project that teaches **retrieval-augmented generation (RAG)**.

**What it does:** you upload PDFs, text or Markdown files. They are cut into passages, turned into vectors, and indexed twice (keyword search with BM25, and vector search). A question finds the best passages with **hybrid search** (the two rankings fused with Reciprocal Rank Fusion), the model answers **only from them**, and every claim carries a citation number you can click to see the exact source. Questions the documents cannot answer are refused. An eval measures retrieval quality.

## Run it

You need Python 3.11+ and Node 22.12+. No API key is needed: without one the app answers with an offline model and uses a built-in embedder.

```bash
# terminal 1: the back end
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt                           # or requirements-semantic.txt for real semantic search
cp .env.example .env                                      # optional: ANTHROPIC_API_KEY, EMBEDDINGS_PROVIDER
uvicorn app.main:app --reload                             # http://localhost:8000/docs

# terminal 2: the front end
cd frontend
npm install
npm run dev                                               # http://localhost:5173
```

Press **Load sample documents**, then ask "How many days of annual leave do I get?". Try a follow-up ("And sick leave?"), an unrelated question ("What is the capital of France?") and the **Retrieval details** switch.

### Better search, still free

The built-in embedder matches *words*. For real semantic search ("lunch" finds "food allowance") run:

```bash
pip install -r requirements-semantic.txt                  # ~70 MB model download on first use
# in backend/.env:  EMBEDDINGS_PROVIDER=fastembed
# then press "Re-index" in the app (vectors from different models cannot be mixed)
```

## Test it, and measure it

```bash
cd backend && pytest -q                                   # 58 tests, no network, no API key
cd backend && python -m evals.retrieval                   # hit@k and MRR for keyword, vector and hybrid search
cd frontend && npm test && npm run build                  # 21 unit tests, then a type-check and production build
```

## Layout

```text
backend/app/
  rag/text.py          tokenizer and stemmer             rag/chunker.py   cut text into overlapping chunks with offsets
  rag/bm25.py          keyword ranking                   rag/fusion.py    Reciprocal Rank Fusion
  rag/embeddings.py    hash / fastembed / voyage          rag/index.py     the in-memory hybrid index
  rag/prompt.py        grounded prompt, citation check   rag/rewrite.py   follow-up questions   rag/gate.py  "is it relevant?"
  ingest.py            file -> pages -> chunks -> vectors -> database + index (background task)
  routes/documents.py  upload, samples, delete, chunk, reindex     routes/ask.py   /api/ask (SSE) and /api/search
  llm/                 base.py, anthropic_client.py, mock_client.py (extractive, cites its sources)
  samples/             three sample documents
backend/evals/         retrieval cases and the metrics (hit@k, MRR, answer gate)
frontend/src/
  askReducer.ts        conversation state (tested)       citations.ts  [1] -> clickable chip (tested)   highlight.ts (tested)
  useAsk.ts            streaming and Stop                 components/   Library, Chat, Answer, SourceCard, SourceViewer
```
