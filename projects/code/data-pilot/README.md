# DataPilot

Ask a database questions in plain English. **React + TypeScript** front end, **FastAPI** back end, and a **tool-using agent** (Claude, or an offline planner) that looks at the tables, writes SQL, runs it **safely**, and explains the result with a table and a chart.
It is Project 4 of the ProjectLab course, and the project that teaches **agents**: the tool-use loop, tool design, guardrails and agent evals.

**What it does:** the model gets four tools (`list_tables`, `describe_table`, `run_sql`, `show_chart`). It decides which to call; **our code runs them** and shows the model what happened. The loop repeats until the model answers. Every step streams to the browser as an event, so you can watch the agent work, and see it recover from a bad query or be stopped from running a `DELETE`.

## Run it

You need Python 3.11+ and Node 22.12+. No API key is needed: without one an offline planner follows question templates and runs the *real* tools against the *real* database.

```bash
# terminal 1: the back end (the sample shop database is created on first start)
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

Try the example questions, then use **Simulate a mistake** (offline model only): *Wrong column* shows the agent reading an error and fixing its query; *Tries to DELETE* shows the guard blocking it.

## Test it, and measure it

```bash
cd backend && pytest -q                  # 71 tests: SQL guard, tools, the agent loop, the API, the Claude adapter, evals
cd backend && python -m evals.run        # execution accuracy on 14 golden questions (--fail-under 0.8 for CI)
cd frontend && npm test && npm run build # 32 unit tests, then a type-check and production build
```

## Layout

```text
backend/app/
  seed.py          the sample shop (customers, products, orders, order_items), generated from a seed
  sqlguard.py      SQL safety: text check, read-only connection, authoriser, time and row limits
  tools.py         the four tools and their JSON schemas; table_for_model keeps results compact
  agent.py         the loop: ask the model, run its tools, show it the results, repeat
  prompts.py       the system prompt (business rules included)
  llm/             base.py (one turn), anthropic_client.py (streaming tool use), mock_planner.py, mock_client.py
  routes/ask.py    POST /api/ask: the agent's events as Server-Sent Events      routes/data.py  schema, /api/sql
backend/evals/     golden questions and the execution-accuracy runner
frontend/src/
  agentReducer.ts  conversation state: steps, notes, answer (tested)     chart.ts  chart geometry (tested)
  format.ts        Indian grouping, CSV, sorting (tested)                  sqlHighlight.ts (tested)
  components/      TurnView, StepCard, ResultTable (sortable), Chart (SVG), Sql, SchemaPanel
```
