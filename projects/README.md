# ProjectLab

Ten complete full-stack generative-AI apps, taught one layer at a time. **React + TypeScript** on the front end, **FastAPI** on the back end, **Claude** as the model. Projects 1 to 6 have an offline mode, so they run and are tested without an API key; the four beginner agents (7 to 10) use the real Claude, with no mock and no offline model, and their tests cover everything around it.

| # | Project | Level | The new idea | Folder |
|---|---|---|---|---|
| 1 | **Pocket Chat**, a streaming chat | Beginner | the messages API, Server-Sent Events, conversation state | `code/pocket-chat/` |
| 2 | **Smart Extractor**, messy text into clean forms | Beginner | structured output, validation, a repair loop, grounding | `code/smart-extractor/` |
| 3 | **AskDocs**, chat with your own documents | Intermediate | RAG: chunking, hybrid search, citations, refusing to guess | `code/ask-docs/` |
| 4 | **DataPilot**, ask a database in plain English | Intermediate | tool use, the agent loop, safe SQL, streamed steps, charts | `code/data-pilot/` |
| 5 | **SupportPilot**, an AI copilot for a support team | Advanced | pipelines, a gateway, tracing, guardrails, roles, human approval | `code/support-pilot/` |
| 6 | **RepoChat**, ask a code repository questions | Intermediate | RAG for code: structural chunks, identifier-aware search, call graph, line citations, safe uploads | `code/repo-chat/` |
| 7 | **TaskPal**, a to-do assistant | Beginner | your first agent: tools, the loop, validated tool input, errors the model can act on, a board that follows the agent | `code/task-pal/` |
| 8 | **WeatherWise**, a weather advisor with live forecasts | Beginner | tools that call a real service: parsing, handles not coordinates, parallel tool calls, failure handling, forecast cards | `code/weather-wise/` |
| 9 | **NoteKeeper**, an agent that cannot write | Beginner | least privilege: a file sandbox, proposals with diffs, a human decides, stale-edit protection, prompt injection | `code/note-keeper/` |
| 10 | **ResearchBuddy**, a web research agent that cites sources | Beginner | server tools: web search, paused turns, citations, a safe calculator, safe links | `code/research-buddy/` |

Plus a *Start here* module (the architecture, FastAPI, React and the LLM API in ten minutes, and the conventions every project shares) and a closing *Shipping and what comes next* module (costs, CI, what the ten projects share, ten projects to build next).

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

The end-to-end scripts (`tools/e2e_<project>.py`) start the project's back end against a throw-away database (in offline mode for Projects 1 to 6; **with no API key at all** for 7 to 10, so they check everything that does not need Claude) and its Vite front end, then drive them with Playwright. They need `PL_PYTHON` (a Python with the project's requirements installed) and `PL_NODE_BIN` (Node 22.12 or newer).

## Tests, as of this build

| Project | pytest | vitest | browser checks | Evaluation |
|---|---|---|---|---|
| Pocket Chat | 28 | 17 | 22 | n/a |
| Smart Extractor | 58 | 15 | 36 | field accuracy |
| AskDocs | 58 | 21 | 28 | retrieval hit@k and MRR |
| DataPilot | 71 | 32 | 25 | execution accuracy |
| SupportPilot | 131 | 26 | 36 | triage, policy, guardrails, leaks, cost |
| RepoChat | 97 | 27 | 29 | retrieval ablation and held-out set |
| TaskPal | 45 | 28 | 19 | no evaluation: a checklist of real prompts (lesson 7) |
| WeatherWise | 31 (some call the live Open-Meteo, skipped offline) | 25 | 11 | a checklist of real prompts |
| NoteKeeper | 82 | 25 | 18 | safety invariants, each with a test |
| ResearchBuddy | 77 | 26 | 12 | a checklist, and a source-quality rubric |

Projects 7 to 10 were tested with every part that does not need the model. The agent loops themselves were exercised during development against a throw-away local server that speaks the Messages API (not part of the repository) and are meant to be tried with your own key, using the checklist in each project's last lesson.
## Conventions that apply everywhere

Prose is in Indian English (colour, organisation, rupees, lakh and crore); code identifiers are never changed. Every limit is a setting. Every offline model says what it is, and the projects that have no offline model say that too. Every evaluation says what it misses.
