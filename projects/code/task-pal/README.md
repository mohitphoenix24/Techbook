# TaskPal

A to-do assistant you talk to. **React + TypeScript** front end, **FastAPI** back end, and a small **agent** built straight on the Anthropic SDK: Claude reads your list, works out dates, and adds, changes or removes tasks by calling tools. You see every step it takes.
It is Project 7 of the ProjectLab course, the first of four beginner agents.

**What it does:** the model gets five tools (`get_today`, `list_tasks`, `add_task`, `update_task`, `delete_task`). It decides which to call; **our code runs them** and shows the model what happened. The loop repeats until the model answers. The task board beside the chat updates after every change.

**It needs a real API key.** There is no offline mode and no fake model in this project: the agent is Claude. Get a key at <https://console.anthropic.com/>.

## Run it

You need Python 3.10+ and Node 22.12+.

```bash
# terminal 1: the back end (the SQLite file is created on first start)
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                      # then put your key in ANTHROPIC_API_KEY=
uvicorn app.main:app --reload                             # http://localhost:8000/docs

# terminal 2: the front end
cd frontend
npm install
npm run dev                                               # http://localhost:5173
```

Try: *"Add three tasks: buy milk, call mum, book train tickets"*, then *"What is due this week?"*, then *"Mark the milk task as done"*.

## Test it

```bash
cd backend && pytest -q                  # 45 tests: the store, every tool and its errors, the API, error mapping. No API key needed.
cd frontend && npm test && npm run build # 28 unit tests, then a type-check and production build
```

The tests never call the model, and there is no fake model standing in for it. They test *your* code: what each tool does with good and bad input, what the API returns with no key, how the browser folds events into a conversation. Whether Claude chooses well is checked by using the app.

## Layout

```text
backend/app/
  store.py     the to-do list: one SQLite table and five functions (no AI here)
  tools.py     five tools: description + input model + function. ToolBox.call never raises
  prompts.py   the system prompt
  agent.py     the loop: ask Claude, run its tools, show it the results, repeat
  llm.py       builds the SDK client; turns SDK errors into plain messages
  main.py      POST /api/chat (the agent's events as Server-Sent Events), GET /api/tasks, PATCH /api/tasks/{id}
frontend/src/
  chatReducer.ts  the conversation as state: steps, notes, answer (tested)      format.ts  dates, grouping (tested)
  useChat.ts      sends a message, reads the stream, refreshes the board        components/  TaskBoard, StepList, ExchangeView
```

## Docker

```bash
docker build -t task-pal .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... -v taskpal-data:/data task-pal
```
