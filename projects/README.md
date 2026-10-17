# ProjectLab

Six complete full-stack generative-AI apps, taught one layer at a time. **React + TypeScript** on the front end, **FastAPI** on the back end, **Claude** as the model, with an offline mode so every project runs and is tested without an API key.

| # | Project | Level | The new idea | Folder |
|---|---|---|---|---|
| 1 | **Pocket Chat**, a streaming chat | Beginner | the messages API, Server-Sent Events, conversation state | `code/pocket-chat/` |
| 2 | **Smart Extractor**, messy text into clean forms | Beginner | structured output, validation, a repair loop, grounding | `code/smart-extractor/` |
| 3 | **AskDocs**, chat with your own documents | Intermediate | RAG: chunking, hybrid search, citations, refusing to guess | `code/ask-docs/` |
| 4 | **DataPilot**, ask a database in plain English | Intermediate | tool use, the agent loop, safe SQL, streamed steps, charts | `code/data-pilot/` |
| 5 | **SupportPilot**, an AI copilot for a support team | Advanced | pipelines, a gateway, tracing, guardrails, roles, human approval | `code/support-pilot/` |
| 6 | **RepoChat**, ask a code repository questions | Intermediate | RAG for code: structural chunks, identifier-aware search, call graph, line citations, safe uploads | `code/repo-chat/` |

Plus a *Start here* module (the architecture, FastAPI, React and the LLM API in ten minutes, and the conventions every project shares) and a closing *Shipping and what comes next* module (costs, CI, what the six projects share, ten projects to build next).

## How it is built

* `content/<NN>-<module>/` holds the lessons (Markdown). A module's `_module.md` names its project.
* `code/<project>/` holds the real application: `backend/` (FastAPI, pytest), `frontend/` (Vite, React 19, vitest) and a `Dockerfile`. **Lessons quote these files**: a fence such as ` ```python src="repo-chat/backend/app/rag/chunker.py" region="python" ` is replaced at build time by the real code between `# region: python` and `# endregion` markers, so what you read is what is tested.
* Runnable blocks execute in the browser: Python in Pyodide, React in a sandboxed preview (with a `mockServer` that fakes the API). `flat` joins several real source files into one script, and `dir="slug/path"` hands a block a folder of real files as `SAMPLE_FILES`.
* `python local verify` blocks are run by the build with the real interpreter, and the output printed in the lesson must match.

## Build and test

```bash
python3 projects/build.py                 # bundle lessons and code, verify every lesson block, write assets/js/ and downloads/
python3 projects/build.py --no-verify     # the same, without running the lesson blocks (fast)
python3 projects/build.py --verify-code   # also run every project's pytest, type-check, production build and unit tests

python3 -m http.server 8766               # from the repository root, then in another terminal:
python3 projects/tools/browser_test.py all                 # run every lesson's code in a real browser (needs Playwright and Chrome)
python3 projects/tools/browser_test.py module:repo-chat    # one module
python3 projects/tools/e2e_repo_chat.py                    # a project's end-to-end test: real browser, real API, real Vite
```

The end-to-end scripts (`tools/e2e_<project>.py`) start the project's back end in offline mode against a throw-away database and its Vite front end, then drive them with Playwright. They need `PL_PYTHON` (a Python with the project's requirements installed) and `PL_NODE_BIN` (Node 22.12 or newer).

## Tests, as of this build

| Project | pytest | vitest | browser checks | Evaluation |
|---|---|---|---|---|
| Pocket Chat | 28 | 17 | 22 | n/a |
| Smart Extractor | 58 | 15 | 36 | field accuracy |
| AskDocs | 58 | 21 | 28 | retrieval hit@k and MRR |
| DataPilot | 71 | 32 | 25 | execution accuracy |
| SupportPilot | 131 | 26 | 36 | triage, policy, guardrails, leaks, cost |
| RepoChat | 97 | 27 | 29 | retrieval ablation and held-out set |

## Conventions that apply everywhere

Prose is in Indian English (colour, organisation, rupees, lakh and crore); code identifiers are never changed. Every limit is a setting. Every offline model says what it is. Every evaluation says what it misses.
