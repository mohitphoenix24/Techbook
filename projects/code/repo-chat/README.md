# RepoChat

Ask a code repository questions in plain English and get answers that **cite the exact lines**. **React + TypeScript** front end, **FastAPI** back end, and **retrieval-augmented generation (RAG) built for source code**: it cuts files into functions and classes with Python's own parser, searches them with a ranking that understands identifiers, follows the call graph to bring in the code a function depends on, and checks every `[file:lines]` citation the model writes.
It is Project 6 of the ProjectLab course, an intermediate project, and the one that shows how RAG changes when the documents are code.

**What it does:** pick the built-in sample repository (a small job-queue library called *jobq*) or upload a ZIP of your own. Ask "where is the retry delay calculated?" and the answer streams in with citations such as `retry.py:20-29`. Click a citation and the file opens with exactly those lines highlighted. Open "What I looked at" to see which code the model was shown, how well each piece matched, and why. Citations to code that does not exist, or that the model was never shown, are drawn in red and counted.

## Run it

You need Python 3.11+ and Node 22.12+. No API key is needed: without one an offline summariser writes the answer from the retrieved code, with correct citations.

```bash
# terminal 1: the back end (the sample repository is indexed at start-up)
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                      # optional: add ANTHROPIC_API_KEY for a real model
uvicorn app.main:app --reload                             # http://localhost:8000/docs

# terminal 2: the front end
cd frontend
npm install
npm run dev                                               # http://localhost:5173
```

Try the suggested questions, then upload a ZIP of a small project of your own. Use **Simulate** (offline model only) to see a bad citation flagged.

## Test it, and measure it

```bash
cd backend && pytest -q                  # 97 tests: ZIP safety, secret masking, chunking, search, call graph, citations, API, the Claude adapter, evals
cd backend && python -m evals.run        # retrieval on labelled questions, with each idea switched on in turn (--held-out for unseen questions)
cd frontend && npm test && npm run build # 27 unit tests, then a type-check and production build
```

## Layout

```text
backend/app/
  rag/ingest.py     reading a repository safely: path checks, size limits, no extraction to disk, binary files skipped
  rag/secrets.py    masking API keys, tokens and private keys before indexing, without changing line numbers
  rag/chunker.py    cutting code by structure: functions, methods, classes (Python's ast), README sections, a window fallback
  rag/codetext.py   splitting identifiers (backoff_delay, getUserByID) so a loose question finds an exact name
  rag/index.py      weighted-field BM25: a match in the name counts more than one in the body; a named symbol comes first
  rag/graph.py      who calls whom, and bringing in the neighbours of the best matches
  rag/retrieve.py   search, variety (at most two chunks per file), then the call graph
  rag/prompt.py     the system prompt and the excerpts, each under the citation to use
  rag/citations.py  checking every [path:start-end]: valid, outside what the model saw, bad lines, no such file
  repos.py          repositories held in memory with their index and call graph
  llm/              base.py, anthropic_client.py (streaming), mock_client.py (the offline summariser), factory.py
  routes/           repos.py (list, upload, file, tree, search), ask.py (the answer as Server-Sent Events)
  sample_repo/      the jobq library the examples and the evals ask about (with its own passing tests)
backend/evals/      labelled questions, held-out questions, and the ablation runner
frontend/src/
  chatReducer.ts    the conversation as state (tested)          citations.ts  answer text to citation chips (tested)
  fileTree.ts       flat paths to a nested tree (tested)         ranges.ts  merging and clamping highlighted lines (tested)
  components/       RepoBar, FileTree, FileViewer, Answer, RetrievalPanel, Chat
```
