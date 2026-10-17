# Pocket Chat

A streaming AI chat app: **React + TypeScript** front end, **FastAPI** back end, **Claude** (or an offline demo model) in the middle.
It is Project 1 of the ProjectLab course, and every file is explained in the lessons.

**What it does:** streams answers word by word (Server-Sent Events), keeps conversations in SQLite, trims long histories to a token budget, lets you **Stop** and **Regenerate**, switches personas (system prompts), shows tokens and cost per reply, and rate limits the chat endpoint.

## Run it

You need Python 3.11+ and Node 22.12+ (Node 24 LTS is fine). No API key is required: without one the app uses an offline demo model.

```bash
# terminal 1: the back end
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                      # optional: add ANTHROPIC_API_KEY for real Claude answers
uvicorn app.main:app --reload                             # http://localhost:8000/docs

# terminal 2: the front end
cd frontend
npm install
npm run dev                                               # http://localhost:5173
```

## Test it

```bash
cd backend && pytest -q                  # 28 tests, no network, no API key
cd frontend && npm test && npm run build # 17 unit tests, then a full type-check and production build
```

## Run it as one container

```bash
docker build -t pocket-chat .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... -v pocketchat-data:/data pocket-chat
```

## Layout

```text
backend/app/
  main.py            create_app(): settings, database, LLM client, CORS, static files
  config.py          Settings (environment variables / .env)
  llm/               base.py (the interface), anthropic_client.py, mock_client.py, factory.py
  routes/chat.py     POST /api/chat: the SSE stream (meta, delta, usage, done, error)
  routes/conversations.py   list / read / delete conversations, personas, health
  db.py              SQLite store
  context.py         token estimate and history trimming (pure)
  pricing.py         tokens to dollars (pure)
  ratelimit.py       sliding-window limiter (pure)
  personas.py  sse.py  schemas.py  deps.py
frontend/src/
  api.ts             the only file that calls fetch
  sse.ts             Server-Sent Events parser (tested)
  chatReducer.ts     all conversation state changes (tested)
  useChat.ts         streaming, Stop and Regenerate
  components/        Sidebar, MessageList, MessageBubble, Markdown, Composer
```

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `LLM_PROVIDER` | `auto` | `auto` = Claude if a key is set, else the offline mock; or `anthropic` / `mock` |
| `ANTHROPIC_API_KEY` | | your key (keep it in `.env`, never commit it) |
| `LLM_MODEL` | `claude-sonnet-5-5` | the model ID |
| `CONTEXT_BUDGET_TOKENS` | `6000` | how much history each request sends |
| `RATE_LIMIT_PER_MINUTE` | `30` | per-client limit on `/api/chat` (0 = off) |
| `DATABASE_PATH` | `pocketchat.db` | the SQLite file |
