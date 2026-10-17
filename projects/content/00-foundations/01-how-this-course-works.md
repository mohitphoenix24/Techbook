---
title: How this course works
level: easy
time: 15
summary: What you will build, how every project is taught, what to install, and how to run everything for free with the built-in offline model.
---

Most AI tutorials stop at a notebook. Real AI products are **applications**: a screen people use, a server that protects your secrets and your budget, and a model in the middle. This course teaches you to build that whole stack, six times, with more depth each time.

**The stack:** React and TypeScript for the front end, FastAPI (Python) for the back end, and Claude as the language model. The ideas carry over to any model and any framework.

## The six projects

| # | Project | Level | You will learn |
|---|---|---|---|
| 1 | **Pocket Chat**: a streaming chat like ChatGPT | Beginner | the messages API, streaming with Server-Sent Events, a React chat UI, conversation history, cost display |
| 2 | **Smart Extractor**: turn messy text into clean forms | Beginner | structured output, Pydantic validation, a repair loop, grounding checks against hallucination |
| 3 | **AskDocs**: chat with your own documents | Intermediate | RAG: chunking, embeddings, hybrid search, citations, refusing to guess, retrieval evals |
| 4 | **DataPilot**: ask questions of a database in plain English | Intermediate | tool use, the agent loop, safe SQL, streaming agent steps, tables and charts |
| 5 | **SupportPilot**: an AI copilot for a support team | Advanced | multi-step pipelines, an LLM gateway, tracing, guardrails, human approval, evals, auth |
| 6 | **RepoChat**: ask a code repository questions and get answers that cite exact lines | Intermediate | RAG for source code: chunking by structure, identifier-aware search, the call graph, checked line citations, safe ZIP uploads, secret masking |

Each project is a module in the sidebar, and a final module, *Shipping and what comes next*, covers costs, CI, what the six share, and ten projects to build next. The modules are in the order they were built, and each says its level, so you can start with the one that matches your experience: Projects 1 and 2 first if you are new to this, Project 3 or 6 if retrieval is what you want, Project 4 for agents, Project 5 for production concerns.

## How a project is taught

Every project is a **real, working application** with tests. You do not read pseudo-code. Each lesson:

1. explains one idea in plain English (usually with a diagram),
2. shows the real code from the project, quoted from the actual files,
3. lets you **run** a small version right here in the browser when that is possible (Python and React demos are editable),
4. ends with key points, a quick quiz and an exercise.

:::flow The loop for every layer
Idea | what problem are we solving?
Diagram | where does it sit in the system?
Real code | quoted from the tested project
Run it | edit a live example in the page
Test it | how we know it works
:::

You can build along (type the code yourself, which is the best way to learn) or read along and run the finished project. The **Source code** page in the top bar shows every file of every project, and you can download a project as a zip.

## What to install

| Tool | Version | Why |
|---|---|---|
| Python | 3.11 or newer | the FastAPI back end |
| Node.js | 22.12 or newer (24 LTS is fine) | the React front end (Vite 8 needs it) |
| A code editor | VS Code is a good choice | you will edit Python and TypeScript |
| An Anthropic API key | **optional** | real Claude answers; get one at [console.anthropic.com](https://console.anthropic.com) |

You do **not** need an API key to follow this course.

:::note Offline mode: no key, no cost
Every project includes a small **offline model** (we call it the *mock*). It is not intelligent. It recognises a handful of requests and answers from templates. What it does faithfully is *behave like a streaming API*: it sends words a few at a time, reports token usage, can fail, and can be stopped. Everything you build around it (the server, the database, the interface, the tests) works exactly the same when you later switch to Claude.

So you can finish all six projects for free, and flip one setting (`ANTHROPIC_API_KEY`) to get real answers. The lessons always say which parts need a real model.
:::

## Running a project

Every project has the same two commands, one terminal each:

```bash title="Terminal 1: the back end"
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload                            # http://localhost:8000/docs
```

```bash title="Terminal 2: the front end"
cd frontend
npm install
npm run dev                                              # http://localhost:5173
```

Open `http://localhost:5173`. The front end forwards every `/api` request to the back end (you will see how in lesson 1 of Project 1).

To use Claude instead of the offline model, create `backend/.env` containing `ANTHROPIC_API_KEY=sk-ant-...` and restart the back end. Never commit that file.

## How the browser examples work

- **Python** blocks with a ▶ Run button run in your browser (Pyodide) with Pydantic and NumPy. We use them for the *pure* parts of each project: chunking, ranking, validation, cost maths. They run the real module from the project, not a copy.
- **React** blocks show a live preview. They talk to a **fake server** that lives in the page, so you can experiment with streaming and loading states without any backend.
- Blocks labelled **Run locally** are parts of the project that need FastAPI or an API key. Copy them, or open the project's source.

:::keypoints
- You build six complete full-stack AI apps: React + FastAPI + Claude.
- Every project is real, tested code; the lessons quote it from the actual files.
- An offline model means you need no API key and spend nothing while learning.
- You can read along, build along, or download a project as a zip and run it.
:::

```quiz
? Why does every project ship an offline "mock" model?
- Because Claude cannot be used in a web app
+ So you can build and test the whole stack without an API key or any cost
- Because the mock gives better answers than a real model
> The mock behaves like a streaming API (chunks, usage, errors), so the server, UI and tests work the same when you switch to Claude. It is a development tool, not a smarter model.
? Where does the real project code in the lessons come from?
- It is written separately for each lesson and may differ from the project
+ It is quoted directly from the project's tested source files
- It is generated by the browser
> The build copies the exact lines from the real files, so what you read is what the tests run.
```

:::exercise Get ready
1. Install Python 3.11+ and Node 22.12+ and check both with `python --version` and `node --version`.
2. Open **Source code** in the top bar, pick **Pocket Chat**, and click through its folders. Which file do you think handles the `/api/chat` request?
3. Optional: create an Anthropic API key and put it somewhere safe. You will add it to a `.env` file in Project 1.
:::
