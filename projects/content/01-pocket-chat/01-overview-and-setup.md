---
title: What we are building, and the project skeleton
level: easy
time: 30
summary: The finished app, the architecture and the SSE contract between React and FastAPI, then a runnable skeleton: settings, the app factory, the Vite proxy, and both servers talking to each other.
tags: FastAPI, Vite, settings, proxy
---

**Pocket Chat** is a small version of ChatGPT: type a message, watch the answer appear word by word, press **Stop** if it rambles, press **Regenerate** to try again, switch personas, and see what each reply cost. Chats are saved, so a reload brings them back.

It is deliberately small (about 700 lines of Python and 600 of TypeScript), yet it contains every idea a larger chat product needs.

| Feature | Idea behind it | Lesson |
|---|---|---|
| words appear as they are written | streaming with Server-Sent Events | 3 |
| the model "remembers" | the server stores history and sends it each turn | 4 |
| long chats stay affordable | trimming history to a token budget | 4 |
| Stop and Regenerate | cancelling a stream, saving a partial answer | 3, 7 |
| personas | system prompts | 7 |
| tokens and cost per reply | `usage` and a price table | 7 |
| works with no API key | the provider interface and an offline model | 2 |

## The architecture

```viz algo=arch title="Pocket Chat" dir=right
ui    React chat UI | useChat hook, SSE reader [browser] @0,0
api   FastAPI | POST /api/chat, history, cost [service] @1,0
llm   LLM client | Claude, or the offline mock [llm] @2,0
db    SQLite | conversations, messages [db] @1,1.6
--
ui -> api : POST /api/chat (JSON)
api ~> ui : SSE: meta, delta..., usage, done
api -> llm : stream(system, messages)
llm ~> api : text pieces + usage
api <-> db : save and load
flow Sending one message
ui > api : React POSTs {conversation_id, message, persona}. The reply is a stream, not one JSON object.
api > db : FastAPI validates it, saves the user message and loads the whole conversation.
api > llm : It trims the history to the token budget and starts a streaming call with the persona's system prompt.
llm > api : Pieces of text arrive as the model writes them.
api > ui : Each piece is forwarded at once as a `delta` event. At the end: `usage` (tokens, cost) and `done`.
api > db : The finished reply is saved with its token counts. If the user pressed Stop, the partial reply is saved as "stopped".
```

## The contract: five event types

The React app and the server agree on this contract before either is written. Writing it down first is the best habit in full-stack work: both sides can be built and tested separately.

| Event | When | Payload |
|---|---|---|
| `meta` | first | `conversation_id`, `provider`, `model`, `history_dropped` |
| `delta` | many times | `text`: the next few characters |
| `usage` | once, at the end | `input_tokens`, `output_tokens`, `cost_usd`, `stop_reason` |
| `done` | last | `message_id` |
| `error` | instead of `done` if something fails | `code`, `message`, `retryable` |

Everything that can fail with an ordinary HTTP status (unknown conversation, empty message) happens **before** the stream starts and returns 404 or 422. Once the first byte of a stream is sent, the status code is already 200, so later failures travel *inside* the stream as `error` events.

## Step 1: create the back end

```bash title="From an empty folder"
mkdir pocket-chat && cd pocket-chat
mkdir -p backend/app/llm backend/app/routes backend/tests
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
```

```text src="pocket-chat/backend/requirements.txt" title="backend/requirements.txt"
```

```bash
pip install -r requirements.txt
```

Settings first. A `Settings` class reads the environment (and a `.env` file) once, with validation:

```python src="pocket-chat/backend/app/config.py" region="settings" title="backend/app/config.py"
```

Notes:

- `llm_provider: "auto"` means *use Claude if `ANTHROPIC_API_KEY` is set, otherwise the offline mock*. A beginner who has no key is never blocked.
- `Literal[...]` makes Pydantic reject a typo such as `LLM_PROVIDER=antropic` at start-up instead of at the first request.
- `context_budget_tokens` caps how much history each request sends (lesson 4).

Document every setting in `.env.example`, so nobody has to read the code to configure the app:

```bash src="pocket-chat/backend/.env.example" title="backend/.env.example"
```

Now the app itself, built by a **factory function**. A factory takes its dependencies as arguments, which is what lets tests pass in a fake model and a temporary database:

```python src="pocket-chat/backend/app/main.py" region="factory" title="backend/app/main.py"
```

:::tip Why a factory and `lifespan`
`create_app(settings, llm)` does nothing until it is called, so importing the module is cheap and tests can build as many independent apps as they like. The `lifespan` function runs once when the server starts: it opens the database and builds the LLM client. Both are stored on `app.state` and handed to routes with `Depends` (see `deps.py`).
:::

Run it (from `backend/`):

```bash
uvicorn app.main:app --reload
```

Open `http://localhost:8000/docs`. Even before you write the chat route, FastAPI documents the endpoints it has. Press **Try it out** on `GET /api/health`.

## Step 2: create the front end

The front end is a Vite + React + TypeScript app. Vite is the dev server and bundler; it starts instantly and reloads the page when you save.

```json src="pocket-chat/frontend/package.json" title="frontend/package.json"
```

```bash
cd ../frontend            # from backend/
npm install
```

The one piece of configuration that matters is the **proxy**:

```ts src="pocket-chat/frontend/vite.config.ts" region="proxy" title="frontend/vite.config.ts"
```

Your React code will call `fetch("/api/chat")`, a *relative* URL. During development Vite forwards everything under `/api` to FastAPI on port 8000. The browser only ever talks to one origin (`localhost:5173`), so **there are no CORS problems and no hard-coded back-end URLs**. In production the same relative URL works whether you serve both from one process or put a reverse proxy in front.

Start it:

```bash
npm run dev       # http://localhost:5173
```

## Step 3: check the whole path

Open `http://localhost:5173/api/health` in the browser. If you see `{"status":"ok"}`, the request went browser → Vite → FastAPI and back. That single check proves the proxy, the ports and the server. Do it whenever something looks wrong later.

:::warn The two-terminal habit
You need **both** servers running: `uvicorn` in one terminal and `npm run dev` in another. If the page loads but every request fails, the back end is not running (the Vite terminal will say `ECONNREFUSED`).
:::

## Where we are

You have an empty but running full-stack skeleton. The next lessons fill it in, back end first, because the contract is simplest to test there:

1. [The LLM layer](#/l/the-llm-layer): one interface, two models.
2. [The streaming endpoint](#/l/streaming-endpoint): the heart of the app.
3. [History and storage](#/l/history-and-storage).
4. Then the React side.

You can inspect the finished project at any time in [the source explorer](#/code/pocket-chat).

:::keypoints
- Agree on the event contract first: `meta`, `delta`, `usage`, `done`, `error`.
- Failures that can be a normal HTTP error happen before the stream starts; later ones travel as `error` events.
- Settings come from the environment, validated once; `"auto"` picks Claude or the offline mock.
- A factory function (`create_app`) makes the app testable.
- The Vite proxy lets React call relative `/api` URLs: no CORS, no hard-coded ports.
:::

```quiz
? Why does the front end call fetch("/api/chat") with a relative URL?
- Absolute URLs are not allowed in React
+ The dev proxy forwards /api to FastAPI, so the browser sees one origin and CORS never comes up
- Relative URLs are faster
> The Vite proxy hides the back end behind the dev server's origin, and the same relative URL still works in production behind one host.
? A stream has already started and the model call fails. How does the browser find out?
- The HTTP status changes to 500
+ The server sends an `error` event inside the stream
- The connection simply closes with no message
> The 200 status was sent with the first byte, so the failure must be reported in-band as an event.
? What is the benefit of `LLM_PROVIDER=auto`?
- It chooses the cheapest model
+ It uses Claude when a key exists and the offline mock when it does not, so nobody is blocked
- It retries failed requests
> The app runs out of the box, and adding a key upgrades it without any code change.
```

:::exercise Break it on purpose
1. Set `LLM_PROVIDER=antropic` (a typo) in a `.env` file and start the back end. Read the error. When does it appear: at start-up or at the first request?
2. Stop the back end but leave Vite running, then open `http://localhost:5173/api/health`. What do you see in each terminal?
:::
