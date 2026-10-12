---
title: Production Chat API with Claude
level: advanced
time: 90
icon: server
cover: #0f172a,#6366f1
tags: fastapi, claude, streaming, sqlite, docker
summary: A complete, deployable chat backend — FastAPI, streaming Claude responses over SSE, conversations stored in SQLite, history trimming, per-user rate limits and cost tracking, a minimal web UI, tests with a fake model, and a Dockerfile.
---

This project is a real application you can run, extend and deploy: the backend for a ChatGPT-style app powered by Claude. The core logic — storage, memory trimming, streaming format, rate limiting, cost tracking — runs right here in the browser against a fake model, so you can test every piece. Then you assemble the files on your computer and run the real thing.

:::flow Request flow
Browser UI | sends a message
FastAPI | auth + rate limit
Store | load conversation from SQLite
Trim history | fit the token budget
Claude stream | tokens as SSE events
Save + bill | store reply, track cost
:::

```text title="Project structure"
chat-api/
├── app/
│   ├── __init__.py
│   ├── config.py        # settings from environment variables
│   ├── store.py         # SQLite conversation storage
│   ├── memory.py        # history trimming
│   ├── limits.py        # rate limiting + cost tracking
│   ├── llm.py           # Claude client wrapper (streaming)
│   ├── service.py       # ChatService: the business logic (Step 5)
│   └── main.py          # FastAPI routes
├── static/index.html    # minimal chat UI
├── tests/test_chat.py   # tests with a fake LLM
├── requirements.txt
├── Dockerfile
└── .env                 # ANTHROPIC_API_KEY=...  (git-ignored!)
```

## Step 1 — Conversation storage (store.py)

```python run shared title="Step 1 · SQLite conversation store"
import sqlite3
import json
import time
import uuid

class ConversationStore:
    def __init__(self, path=":memory:"):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT, created REAL);
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT NOT NULL,
                role TEXT NOT NULL, content TEXT NOT NULL, tokens_in INTEGER DEFAULT 0,
                tokens_out INTEGER DEFAULT 0, created REAL);
            CREATE INDEX IF NOT EXISTS idx_msgs ON messages(conversation_id, id);
        """)

    def create(self, user_id, title="New chat"):
        cid = uuid.uuid4().hex[:12]
        self.db.execute("INSERT INTO conversations VALUES (?, ?, ?, ?)", (cid, user_id, title, time.time()))
        self.db.commit()
        return cid

    def owner(self, cid):
        row = self.db.execute("SELECT user_id FROM conversations WHERE id = ?", (cid,)).fetchone()
        return row[0] if row else None

    def add(self, cid, role, content, tokens_in=0, tokens_out=0):
        self.db.execute("INSERT INTO messages (conversation_id, role, content, tokens_in, tokens_out, created) VALUES (?, ?, ?, ?, ?, ?)",
                        (cid, role, content, tokens_in, tokens_out, time.time()))
        self.db.commit()

    def history(self, cid):
        rows = self.db.execute("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id", (cid,))
        return [{"role": r, "content": c} for r, c in rows]

    def usage(self, user_id):
        row = self.db.execute("""SELECT COALESCE(SUM(m.tokens_in), 0), COALESCE(SUM(m.tokens_out), 0)
                                 FROM messages m JOIN conversations c ON c.id = m.conversation_id
                                 WHERE c.user_id = ?""", (user_id,)).fetchone()
        return {"input_tokens": row[0], "output_tokens": row[1]}

store = ConversationStore()
cid = store.create("ada")
store.add(cid, "user", "Hi!")
store.add(cid, "assistant", "Hello! How can I help?", tokens_in=12, tokens_out=8)
print(store.history(cid))
print(store.usage("ada"), "| owner:", store.owner(cid))
```

:::tip Always use parameters in SQL
Note the `?` placeholders: values are passed separately, never pasted into the SQL string. That prevents **SQL injection** — essential when content comes from users (or from an LLM).
:::

## Step 2 — History trimming (memory.py)

```python run shared title="Step 2 · fit history into a token budget"
def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)          # rough; use client.messages.count_tokens for exact numbers

def trim_history(messages, budget=3000):
    """Keep the most recent messages that fit the budget; never start with an assistant turn."""
    kept, used = [], 0
    for m in reversed(messages):
        cost = estimate_tokens(m["content"])
        if used + cost > budget:
            break
        kept.append(m)
        used += cost
    kept.reverse()
    while kept and kept[0]["role"] != "user":
        kept.pop(0)
    return kept

long_chat = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"message {i} " + "word " * 300} for i in range(20)]
trimmed = trim_history(long_chat, budget=2000)
print(f"{len(long_chat)} messages → {len(trimmed)} kept; first kept: {trimmed[0]['content'][:12]!r} ({trimmed[0]['role']})")
```

## Step 3 — Rate limiting and cost tracking (limits.py)

```python run shared title="Step 3 · limits"
PRICES = {"claude-opus-5-5": (4.00, 20.00), "claude-sonnet-5-5": (2.00, 10.00), "claude-haiku-4-5": (1.00, 5.00)}

class SlidingWindowLimiter:
    """At most `limit` requests per `window` seconds per user."""
    def __init__(self, limit=20, window=60.0):
        self.limit, self.window, self.calls = limit, window, {}

    def check(self, user, now=None):
        now = time.time() if now is None else now
        recent = [t for t in self.calls.get(user, []) if now - t < self.window]
        if len(recent) >= self.limit:
            retry_after = self.window - (now - recent[0])
            self.calls[user] = recent
            return False, round(retry_after, 1)
        self.calls[user] = recent + [now]
        return True, 0.0

def cost_usd(model, tokens_in, tokens_out):
    p_in, p_out = PRICES[model]
    return (tokens_in * p_in + tokens_out * p_out) / 1e6

limiter = SlidingWindowLimiter(limit=3, window=60)
for t in [0, 1, 2, 3, 61]:
    ok, retry = limiter.check("ada", now=t)
    print(f"t={t:>2}s  {'allowed' if ok else f'429 — retry in {retry}s'}")
print(f"cost of 2,000 in / 500 out on Opus 5.5: ${cost_usd('claude-opus-5-5', 2000, 500):.4f}")
```

## Step 4 — The LLM layer with a fake for testing (llm.py)

```python run shared title="Step 4 · streaming LLM interface"
import asyncio

class FakeStreamingLLM:
    """Same interface as the real Claude wrapper: an async generator of text chunks, then usage."""
    def __init__(self, delay=0.03):
        self.delay = delay
        self.last_usage = (0, 0)

    async def stream(self, system, messages):
        reply = f"You said: {messages[-1]['content']!r}. (I can see {len(messages)} message(s) of history.)"
        for word in reply.split(" "):
            await asyncio.sleep(self.delay)
            yield word + " "
        self.last_usage = (sum(estimate_tokens(m["content"]) for m in messages), estimate_tokens(reply))

def sse(event: dict) -> str:
    """Format one Server-Sent Event."""
    return f"data: {json.dumps(event)}\n\n"

async def demo():
    llm = FakeStreamingLLM()
    async for chunk in llm.stream("system", [{"role": "user", "content": "Hello"}]):
        print(sse({"type": "text", "text": chunk}), end="")
    print(sse({"type": "done", "usage": llm.last_usage}), end="")

asyncio.run(demo())
```

```python local title="app/llm.py — the real Claude wrapper"
import anthropic

class ClaudeLLM:
    def __init__(self, model: str = "claude-opus-5-5", max_tokens: int = 4096):
        self.client = anthropic.AsyncAnthropic()        # reads ANTHROPIC_API_KEY
        self.model, self.max_tokens = model, max_tokens
        self.last_usage = (0, 0)

    async def stream(self, system: str, messages: list[dict]):
        async with self.client.messages.stream(
            model=self.model, max_tokens=self.max_tokens, system=system, messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text
            final = await stream.get_final_message()
        if final.stop_reason == "refusal":
            yield "\n\n(I can't help with that request.)"
        self.last_usage = (final.usage.input_tokens, final.usage.output_tokens)
```

## Step 5 — The chat service (the heart of main.py)

All the business logic lives in one framework-independent function — easy to test, and FastAPI just wraps it.

```python run shared title="Step 5 · chat service"
SYSTEM_PROMPT = "You are a helpful, concise assistant."

class ChatService:
    def __init__(self, store, llm, limiter, model="claude-opus-5-5", budget_tokens=3000):
        self.store, self.llm, self.limiter, self.model, self.budget = store, llm, limiter, model, budget_tokens

    async def send(self, user_id, conversation_id, text):
        """Yield SSE strings for one user message."""
        if self.store.owner(conversation_id) != user_id:
            yield sse({"type": "error", "status": 404, "message": "conversation not found"})
            return
        ok, retry = self.limiter.check(user_id)
        if not ok:
            yield sse({"type": "error", "status": 429, "message": f"rate limited, retry in {retry}s"})
            return
        if not text.strip() or len(text) > 8000:
            yield sse({"type": "error", "status": 422, "message": "message must be 1–8000 characters"})
            return

        self.store.add(conversation_id, "user", text)
        context = trim_history(self.store.history(conversation_id), self.budget)
        reply = ""
        try:
            async for chunk in self.llm.stream(SYSTEM_PROMPT, context):
                reply += chunk
                yield sse({"type": "text", "text": chunk})
        except Exception:                            # upstream failure: tell the client, keep the user message
            yield sse({"type": "error", "status": 502, "message": "model error, please retry"})
            return
        tin, tout = self.llm.last_usage
        self.store.add(conversation_id, "assistant", reply.strip(), tin, tout)
        yield sse({"type": "done", "usage": {"input_tokens": tin, "output_tokens": tout,
                                             "cost_usd": round(cost_usd(self.model, tin, tout), 6)}})

async def chat_demo():
    service = ChatService(ConversationStore(), FakeStreamingLLM(delay=0.01), SlidingWindowLimiter(limit=3))
    cid = service.store.create("ada")
    for msg in ["Hello!", "What is RAG?", "Thanks", "One more?"]:
        events = [json.loads(e[6:]) async for e in service.send("ada", cid, msg)]
        text = "".join(e.get("text", "") for e in events)
        last = events[-1]
        print(f"🧑 {msg}\n🤖 {text.strip() or last.get('message')}  [{last['type']}]")
    print("\nstored messages:", len(service.store.history(cid)))
    print("other user can't read it:", [json.loads(e[6:])["status"] async for e in service.send("bob", cid, "hi")])

asyncio.run(chat_demo())
```

## Step 6 — Tests with a fake LLM

```python run shared title="Step 6 · tests"
async def collect(gen):
    return [json.loads(e[6:]) async for e in gen]

async def test_streams_and_saves():
    svc = ChatService(ConversationStore(), FakeStreamingLLM(delay=0), SlidingWindowLimiter(limit=10))
    cid = svc.store.create("u1")
    events = await collect(svc.send("u1", cid, "ping"))
    assert events[-1]["type"] == "done"
    assert [m["role"] for m in svc.store.history(cid)] == ["user", "assistant"]

async def test_rate_limit():
    svc = ChatService(ConversationStore(), FakeStreamingLLM(delay=0), SlidingWindowLimiter(limit=1))
    cid = svc.store.create("u1")
    await collect(svc.send("u1", cid, "one"))
    events = await collect(svc.send("u1", cid, "two"))
    assert events[0]["status"] == 429

async def test_validation_and_ownership():
    svc = ChatService(ConversationStore(), FakeStreamingLLM(delay=0), SlidingWindowLimiter(limit=10))
    cid = svc.store.create("u1")
    assert (await collect(svc.send("u1", cid, "   ")))[0]["status"] == 422
    assert (await collect(svc.send("intruder", cid, "hi")))[0]["status"] == 404

class BrokenLLM(FakeStreamingLLM):
    async def stream(self, system, messages):
        raise ConnectionError("upstream down")
        yield

async def test_upstream_error():
    svc = ChatService(ConversationStore(), BrokenLLM(), SlidingWindowLimiter(limit=10))
    cid = svc.store.create("u1")
    events = await collect(svc.send("u1", cid, "hello"))
    assert events[-1]["status"] == 502

async def run_tests():
    for t in [test_streams_and_saves, test_rate_limit, test_validation_and_ownership, test_upstream_error]:
        await t()
        print("PASS", t.__name__)

asyncio.run(run_tests())
```

## Step 7 — FastAPI routes (main.py, run locally)

```python local title="app/main.py"
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field

from .store import ConversationStore
from .limits import SlidingWindowLimiter
from .llm import ClaudeLLM
from .service import ChatService          # Steps 2, 3 and 5 live in memory.py, limits.py and service.py

app = FastAPI(title="Claude Chat API")
service = ChatService(ConversationStore("chat.db"), ClaudeLLM(), SlidingWindowLimiter(limit=20, window=60))

def current_user(x_user_id: str = Header(...)) -> str:
    # Replace with real authentication (JWT/session) in production.
    return x_user_id

class NewMessage(BaseModel):
    text: str = Field(min_length=1, max_length=8000)

@app.post("/conversations")
def create_conversation(user: str = Depends(current_user)):
    return {"id": service.store.create(user)}

@app.get("/conversations/{cid}")
def get_conversation(cid: str, user: str = Depends(current_user)):
    if service.store.owner(cid) != user:
        raise HTTPException(404, "conversation not found")
    return {"messages": service.store.history(cid)}

@app.post("/conversations/{cid}/messages")
async def send_message(cid: str, body: NewMessage, user: str = Depends(current_user)):
    return StreamingResponse(service.send(user, cid, body.text), media_type="text/event-stream")

@app.get("/usage")
def usage(user: str = Depends(current_user)):
    return service.store.usage(user)

@app.get("/")
def ui():
    return FileResponse("static/index.html")
```

## Step 8 — A minimal chat UI (static/index.html)

```html title="static/index.html"
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Claude Chat</title>
<style>
  body { font-family: system-ui; max-width: 720px; margin: 40px auto; padding: 0 16px; }
  #log div { margin: 10px 0; white-space: pre-wrap; } .me { color: #4f46e5; } .bot { color: #111; }
  form { display: flex; gap: 8px; } input { flex: 1; padding: 10px; } button { padding: 10px 16px; }
</style></head>
<body>
  <h1>💬 Claude Chat</h1>
  <div id="log"></div>
  <form id="f"><input id="q" placeholder="Ask anything…" autocomplete="off"><button>Send</button></form>
<script>
const headers = { "Content-Type": "application/json", "x-user-id": "demo-user" };
let cid;
async function ensureConversation() {
  if (!cid) cid = (await (await fetch("/conversations", { method: "POST", headers })).json()).id;
}
document.getElementById("f").onsubmit = async (e) => {
  e.preventDefault();
  const q = document.getElementById("q"), text = q.value; q.value = "";
  await ensureConversation();
  const log = document.getElementById("log");
  log.insertAdjacentHTML("beforeend", `<div class="me"><b>You:</b> ${text.replace(/</g, "&lt;")}</div>`);
  const bot = document.createElement("div"); bot.className = "bot"; bot.textContent = "Claude: "; log.append(bot);
  const res = await fetch(`/conversations/${cid}/messages`, { method: "POST", headers, body: JSON.stringify({ text }) });
  const reader = res.body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n"); buffer = events.pop();
    for (const ev of events) {
      const data = JSON.parse(ev.replace(/^data: /, ""));
      if (data.type === "text") bot.textContent += data.text;
      if (data.type === "error") bot.textContent += `⚠️ ${data.message}`;
    }
  }
};
</script>
</body>
</html>
```

## Step 9 — Run and deploy

```text title="requirements.txt"
fastapi>=0.115
uvicorn[standard]>=0.30
anthropic>=1.0
pydantic>=2.8
```

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
uvicorn app.main:app --reload            # open http://localhost:8000
```

```text title="Dockerfile"
FROM python:3.13-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY static ./static
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t claude-chat .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY claude-chat
```

:::warn Before real users
Add proper **authentication** (the `x-user-id` header is a placeholder), HTTPS, a persistent database (Postgres) instead of a local SQLite file when you run several replicas, request logging/tracing, and a monthly **budget cap** per user. Keep the API key only on the server — never in browser code.
:::

:::exercise Extensions
1. Add `GET /conversations` listing a user's conversations with an auto-generated title (ask a small model to title the chat after the first message).
2. Add a daily cost cap per user using `store.usage()` and `cost_usd()`.
3. Add **prompt caching** to the system prompt and log `cache_read_input_tokens`.
4. Build the frontend in React using the React track of this site.
:::

:::keypoints
- Keep business logic (storage, trimming, limits, streaming) in **framework-independent** code; FastAPI is a thin layer.
- Store conversations in a database; **trim** history to a token budget per request.
- Stream with **SSE**; send typed events (`text`, `error`, `done` with usage and cost).
- Enforce **ownership**, **validation** and **rate limits**; handle upstream errors gracefully.
- Test everything with a **fake LLM**; ship with Docker and keep secrets server-side.
:::
