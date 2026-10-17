---
title: Ship it, and make it yours
level: easy
time: 25
summary: Switch to real Claude, build one container that serves the whole app, understand the deployment choices, and pick from a ladder of extensions that each teach one new skill.
tags: Docker, deployment, extensions, Claude
---

Pocket Chat works on your laptop. This last lesson takes it to the world and then hands it to you.

## Switch to the real model

Nothing in the code changes. Put your key where the settings can see it:

```bash title="backend/.env"
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-5-5
```

Restart `uvicorn` and send a message. The pill in the header changes from **Offline demo mode** to the model name, replies are real, and the usage line now shows actual token counts from the API.

Things to try with a real model that the mock could not show:

- Ask for a long answer and press **Stop** half-way; check your usage in the Anthropic console afterwards.
- Switch persona to *Socratic tutor* and ask the same question twice.
- Paste a long text, keep chatting, and watch `history_dropped` appear once the budget is exceeded.
- Set `LLM_MODEL=claude-haiku-5-5` and compare speed and cost on the same questions.

:::note Choosing the model for a chat
`claude-sonnet-5-5` is a good default: fast, capable and affordable. `claude-haiku-5-5` is much cheaper for simple chat. `claude-opus-5-5` is for hard reasoning, and costs about twice as much as Sonnet per token. Make the model a **setting** (as here), never a constant buried in code.
:::

## One container for everything

Two servers are right for development. For production, one process can serve the API and the built React app, which removes CORS and a whole class of deployment mistakes. The project already supports it:

```python src="pocket-chat/backend/app/main.py" region="static" title="backend/app/main.py"
```

If the `frontend/dist` folder exists, FastAPI also serves it at `/`. It is mounted **last**, so it can never hide an API route. The `Dockerfile` builds the front end in one stage and runs the back end in another:

```dockerfile src="pocket-chat/Dockerfile" title="Dockerfile"
```

```bash
docker build -t pocket-chat .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=sk-ant-... -v pocketchat-data:/data pocket-chat
# open http://localhost:8000
```

We built this exact image while writing the lesson and checked that `/api/health`, the React page and a streamed chat all work from the container. Three details are worth copying:

- **Multi-stage build**: Node is only needed to compile the front end, so the final image contains Python and static files, not `node_modules`.
- **A volume for `/data`**: the SQLite file lives outside the container's disposable layer, so chats survive a restart.
- **The key is a run-time variable** (`-e`), never baked into the image.

## Where to host it

| Option | Good for | Remember |
|---|---|---|
| A small VM or a PaaS (Render, Railway, Fly.io) running the container | the easy first deploy | mount a persistent disk for SQLite |
| A container service (Cloud Run, ECS, Azure Container Apps) | auto-scaling | SQLite does not scale across instances: move to PostgreSQL |
| A reverse proxy (Caddy, nginx) in front | HTTPS, compression, headers | keep `X-Accel-Buffering: no` (or disable buffering for `/api/chat`) so streaming is not held back; do **not** enable gzip on the event stream |

Streaming-specific deployment gotchas:

- Some platforms and CDNs buffer responses. If the text arrives in one piece in production but streams locally, buffering is the first suspect.
- Idle timeouts (often 30 to 60 s) cut long silent streams. A periodic `: ping` comment line keeps them open (see the exercise in lesson 3).
- Serverless platforms with short function limits are a poor fit for long streams.

## Make it yours: a ladder of extensions

Each step teaches one new idea and builds on code you already have. Do them in order or pick one.

| Level | Extension | What you learn |
|---|---|---|
| ★ | Rename conversations; pin favourites | an `UPDATE` route and optimistic UI |
| ★ | A **dark/light toggle** that overrides the system setting | CSS variables and `localStorage` |
| ★★ | **Export a chat** to Markdown | turning stored data into a file download |
| ★★ | **Title generation**: after the first reply, ask the model for a 4-word title (a second, tiny call, ideally on Haiku) | multiple model calls, cheaper models for side tasks |
| ★★ | **Summarise old messages** instead of dropping them (lesson 4 exercise) | memory strategies |
| ★★★ | **Prompt caching**: mark the system prompt and old history as cacheable, and show `cache_read_input_tokens` | cost optimisation with a measurable result |
| ★★★ | **Image input**: let users attach a picture (base64 content block) | multimodal messages |
| ★★★ | **User accounts** with a login and per-user history | authentication (see Project 5) |
| ★★★★ | **Web search tool**: let the model search the web and cite the pages | tool use (see Project 4) |

:::tip Treat each extension as a mini-project
Write the test first, change one layer at a time (store, route, hook, component) and keep the five test levels green. That discipline, more than any single feature, is what this project was meant to teach.
:::

## What you have learned

You can now explain, and build, every layer of a streaming AI app:

- the **model layer** behind an interface, with an offline double and a tested Claude adapter;
- a **streaming endpoint** with a clear event contract, partial-reply saving and safe cancellation;
- **history** in SQLite, trimmed to a token budget, and **cost** per reply;
- a **React client** with a correct SSE parser, a reducer-driven hook, Stop and Regenerate;
- **tests** at five levels, **guard rails** for an expensive endpoint, and a **container** to ship it.

Project 2 keeps the same skeleton but changes what the model returns: instead of prose for a person, **structured data for a program**.

:::keypoints
- Switching to Claude is one environment variable; the model name is a setting, not a constant.
- One container can serve the API and the built React app; use a multi-stage build and a volume for the database.
- Streaming needs unbuffered proxies, no gzip on the event stream, and keep-alive pings for idle timeouts.
- Extensions are the best practice: change one layer at a time and keep every test green.
:::

```quiz
? Why is the front end mounted last in create_app?
- It loads slowest
+ So the static files cannot shadow any /api route
- FastAPI requires it
> Routes are matched in order; mounting the catch-all static app last keeps /api/... working.
? What often makes streaming "stop working" only in production?
- The model is slower
+ A proxy or CDN buffering the response (or gzip on the event stream)
- React is built differently
> Buffering collects the whole answer before releasing it. Disable buffering for the chat route.
? Why use a Docker volume for /data?
- To make the image smaller
+ So the SQLite file survives container restarts
- To speed up the model
> Containers are disposable; a volume keeps the database outside the container's own layer.
```

:::exercise Pick one and ship it
Choose an extension from the ladder, write its test first, build it, and run the full suite (`pytest`, `npm test`, `npm run build`). Then deploy the container somewhere and send a friend the link (with a rate limit on, and a spending cap set in the Anthropic console).
:::
