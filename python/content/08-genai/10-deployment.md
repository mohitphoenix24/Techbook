---
title: Deploying AI Applications
level: advanced
time: 45
summary: Turn your prototype into a service — a FastAPI backend with streaming, caching (exact and semantic), rate limiting, cost budgets, background jobs, Docker, quick UIs with Streamlit/Gradio, and a production checklist.
---

A notebook that works once is a prototype. A product needs an **API** others can call, protection against abuse and runaway costs, caching for speed, monitoring, and a way to ship it. This lesson shows the standard Python stack for AI services.

## Architecture of a typical AI app

:::flow Request path
Client | web / mobile / Slack
API server | FastAPI: auth, validation
Guards | rate limit, budget, input checks
Cache | exact / semantic
AI pipeline | retrieve → LLM → tools
Response | stream back + log trace
:::

## The API server: FastAPI

:::def FastAPI
A modern Python web framework for building APIs. You declare endpoints as (async) functions with type hints; FastAPI validates requests with **Pydantic**, generates interactive docs automatically, and handles many concurrent users efficiently.
:::

```python local title="app.py — a production-shaped chat API"
# pip install fastapi uvicorn anthropic pydantic-settings
import json
import anthropic
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    model: str = "claude-opus-5-5"
    max_tokens: int = 4096
    app_api_keys: set[str] = {"dev-key"}          # keys YOUR clients use to call this API

settings = Settings()
client = anthropic.AsyncAnthropic()              # reads ANTHROPIC_API_KEY
app = FastAPI(title="Support Assistant API")

class Message(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=8000)

class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=50)

def require_api_key(x_api_key: str = Header(...)):
    if x_api_key not in settings.app_api_keys:
        raise HTTPException(status_code=401, detail="invalid API key")
    return x_api_key

SYSTEM = "You are a concise, friendly support assistant for ShopSmart."

@app.post("/chat")
async def chat(req: ChatRequest, key: str = Depends(require_api_key)):
    try:
        response = await client.messages.create(
            model=settings.model, max_tokens=settings.max_tokens, system=SYSTEM,
            messages=[m.model_dump() for m in req.messages],
        )
    except anthropic.RateLimitError:
        raise HTTPException(status_code=429, detail="busy, please retry shortly")
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail="upstream model error") from e
    if response.stop_reason == "refusal":
        return {"reply": "Sorry, I can't help with that request.", "refused": True}
    text = "".join(b.text for b in response.content if b.type == "text")
    return {"reply": text, "usage": response.usage.model_dump()}

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest, key: str = Depends(require_api_key)):
    async def events():
        async with client.messages.stream(
            model=settings.model, max_tokens=settings.max_tokens, system=SYSTEM,
            messages=[m.model_dump() for m in req.messages],
        ) as stream:
            async for text in stream.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(events(), media_type="text/event-stream")

@app.get("/health")
async def health():
    return {"status": "ok"}

# run:   uvicorn app:app --reload        docs:  http://localhost:8000/docs
```

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" -H "x-api-key: dev-key" \
  -d '{"messages": [{"role": "user", "content": "Where is my order?"}]}'
```

:::tip Async all the way
Declare endpoints with `async def` and use the **async** Anthropic client. While one request waits seconds for the model, the server handles hundreds of others. A blocking call inside an async endpoint freezes everyone.
:::

## Caching

LLM calls are slow and cost money; many questions repeat. Caching is often the biggest win.

:::def Exact cache
Store responses keyed by a hash of the **exact** request (model + prompt + settings). Identical requests return instantly at zero cost.
:::

:::def Semantic cache
Store responses with the **embedding** of the question. A new question whose embedding is very similar to a cached one (above a threshold) reuses that answer — catching paraphrases like "how do I reset my password" vs "password reset steps?".
:::

```python run level=intermediate
import hashlib
import json
import time

class ExactCache:
    def __init__(self, ttl_seconds=3600):
        self.store, self.ttl, self.hits, self.misses = {}, ttl_seconds, 0, 0

    def key(self, **request):
        return hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()

    def get_or_call(self, fn, **request):
        k = self.key(**request)
        entry = self.store.get(k)
        if entry and time.time() - entry[1] < self.ttl:
            self.hits += 1
            return entry[0]
        self.misses += 1
        value = fn(**request)
        self.store[k] = (value, time.time())
        return value

def fake_llm(model, prompt):
    return f"answer to {prompt!r}"

cache = ExactCache()
for p in ["What is RAG?", "What is RAG?", "Define RAG", "What is RAG?"]:
    cache.get_or_call(fake_llm, model="claude-opus-5-5", prompt=p)
print(f"hits={cache.hits} misses={cache.misses}  (saved {cache.hits / (cache.hits + cache.misses):.0%} of calls)")
```

```python run level=advanced
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

# a semantic cache: in production, use a real embedding model instead of TF-IDF
corpus = ["how do i reset my password", "password reset steps", "how long do refunds take",
          "when will i get my refund", "do you ship to canada"]
vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5)).fit(corpus)
embed = lambda t: (lambda v: v / (np.linalg.norm(v) or 1))(vec.transform([t.lower()]).toarray()[0])

class SemanticCache:
    def __init__(self, threshold=0.55):
        self.threshold, self.keys, self.values = threshold, [], []

    def lookup(self, question):
        if not self.keys:
            return None, 0.0
        sims = np.array(self.keys) @ embed(question)
        i = int(np.argmax(sims))
        return (self.values[i], sims[i]) if sims[i] >= self.threshold else (None, sims[i])

    def add(self, question, answer):
        self.keys.append(embed(question)); self.values.append(answer)

cache = SemanticCache()
cache.add("How do I reset my password?", "Go to Settings → Security → Reset password.")
cache.add("How long do refunds take?", "Refunds take 5 business days.")
for q in ["password reset steps please", "When will I get my refund?", "Do you ship to Canada?"]:
    answer, score = cache.lookup(q)
    print(f"{q!r:<34} similarity {score:.2f} → {'HIT: ' + answer if answer else 'MISS (call the LLM)'}")
```

:::warn Cache carefully
Only cache answers that are safe to share: don't serve one user's personalised or private answer to another user, include the user/tenant in the cache key when needed, set expiry times, and invalidate when the underlying documents change. Tune the semantic threshold on real examples — too low returns wrong answers.
:::

:::tip Prompt caching is different
**Prompt caching** (a model-provider feature) reuses the model's processing of a repeated prompt **prefix** — like a long system prompt or document — cutting cost and latency of every request that shares it. Response caching (above) skips the call entirely. Use both.
:::

## Rate limiting and budgets

:::def Token bucket
A rate-limiting algorithm: a bucket refills with tokens at a steady rate up to a maximum; each request spends a token; requests are rejected (HTTP 429) when the bucket is empty. It allows short bursts while enforcing an average rate.
:::

```python run level=intermediate
import time

class TokenBucket:
    def __init__(self, rate_per_sec, capacity):
        self.rate, self.capacity = rate_per_sec, capacity
        self.tokens, self.updated = capacity, time.monotonic()

    def allow(self, cost=1):
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False

limits = {}                                   # one bucket per user
def check(user):
    bucket = limits.setdefault(user, TokenBucket(rate_per_sec=0.5, capacity=3))
    return "200 OK" if bucket.allow() else "429 Too Many Requests"

for i in range(5):
    print(f"ada request {i + 1}: {check('ada')}")
print("bob request 1:", check("bob"))         # other users are unaffected
```

```python run level=intermediate
from collections import defaultdict
from datetime import date

PRICE = {"claude-opus-5-5": (4.00, 20.00), "claude-haiku-4-5": (1.00, 5.00)}   # $ per 1M tokens

class BudgetGuard:
    """Track spend per user per day; stop before a user runs up a huge bill."""
    def __init__(self, daily_limit_usd):
        self.limit = daily_limit_usd
        self.spent = defaultdict(float)

    def charge(self, user, model, input_tokens, output_tokens):
        p_in, p_out = PRICE[model]
        cost = (input_tokens * p_in + output_tokens * p_out) / 1e6
        key = (user, date.today().isoformat())
        if self.spent[key] + cost > self.limit:
            raise RuntimeError(f"daily budget exceeded for {user} (${self.spent[key]:.3f} spent)")
        self.spent[key] += cost
        return cost

guard = BudgetGuard(daily_limit_usd=0.05)
try:
    for i in range(10):
        c = guard.charge("ada", "claude-opus-5-5", input_tokens=3000, output_tokens=500)
        print(f"call {i + 1}: ${c:.4f}")
except RuntimeError as e:
    print("blocked:", e)
```

## Background jobs and batch work

Not everything should happen inside a web request:

| Work | Approach |
|---|---|
| ingesting/embedding thousands of documents | a background worker + queue (Celery, RQ, Arq, cloud queues) |
| nightly evaluations, bulk classification | the **Message Batches API** — asynchronous and 50% cheaper |
| long agent runs (minutes) | start a job, return a job ID, stream progress or poll |

```python local title="Message Batches API for bulk jobs"
import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

client = anthropic.Anthropic()
tickets = {"t1": "I was charged twice", "t2": "App crashes on login"}

batch = client.messages.batches.create(requests=[
    Request(custom_id=tid, params=MessageCreateParamsNonStreaming(
        model="claude-opus-5-5", max_tokens=256,
        messages=[{"role": "user", "content": f"Classify as billing/bug/other. Reply with one word.\n\n{text}"}]))
    for tid, text in tickets.items()
])
print(batch.id, batch.processing_status)       # poll until "ended", then:
# for result in client.messages.batches.results(batch.id):
#     print(result.custom_id, result.result.type)  # results can arrive in any order — key by custom_id
```

## Containers: Docker

:::def Docker container
A packaged, isolated environment containing your app, its Python version and all dependencies, which runs the same way on your laptop and on any server or cloud.
:::

```text title="Dockerfile"
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

```bash
docker build -t support-assistant .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY support-assistant
```

Deploy the container to any platform: Cloud Run, AWS App Runner/ECS, Azure Container Apps, Fly.io, Render, Railway, or Kubernetes. Pass secrets as environment variables from the platform's secret manager — never bake them into the image.

## Quick UIs for demos

```python local title="Streamlit chat UI (streamlit run ui.py)"
import anthropic
import streamlit as st

client = anthropic.Anthropic()
st.title("💬 Support Assistant")
if "messages" not in st.session_state:
    st.session_state.messages = []

for m in st.session_state.messages:
    st.chat_message(m["role"]).write(m["content"])

if prompt := st.chat_input("Ask me anything"):
    st.session_state.messages.append({"role": "user", "content": prompt})
    st.chat_message("user").write(prompt)
    with st.chat_message("assistant"):
        with client.messages.stream(model="claude-opus-5-5", max_tokens=4096,
                                    messages=st.session_state.messages) as stream:
            reply = st.write_stream(stream.text_stream)
    st.session_state.messages.append({"role": "assistant", "content": reply})
```

```python local title="Gradio (python demo.py)"
import anthropic
import gradio as gr

client = anthropic.Anthropic()

def respond(message, history):
    msgs = [{"role": m["role"], "content": m["content"]} for m in history] + [{"role": "user", "content": message}]
    r = client.messages.create(model="claude-opus-5-5", max_tokens=2048, messages=msgs)
    return "".join(b.text for b in r.content if b.type == "text")

gr.ChatInterface(respond, type="messages", title="Support Assistant").launch()
```

For a full product UI, a React front-end calling your FastAPI backend is the common choice — see the **React track** of this site.

## Production checklist

:::keypoints
- **Secrets** in env vars / a secret manager; API keys for **your** clients; HTTPS everywhere.
- **Validate** every request with Pydantic; cap message counts and lengths.
- **Async** endpoints + async client; **stream** long answers; set timeouts.
- **Rate-limit** per user and enforce **cost budgets**; handle 429s and model errors gracefully.
- **Cache** exact and semantic answers (safely); use **prompt caching** for long fixed prefixes.
- Move bulk/slow work to **background jobs** or the **Batch API**.
- **Trace & monitor** latency, tokens, cost, errors, refusals and user feedback; run **evals** before every prompt/model change.
- Package with **Docker**; deploy to a managed container platform.
:::

## Check yourself

```quiz
? Why should FastAPI endpoints calling an LLM be `async def` with the async client?
+ So the server can handle other requests while waiting for the model
- Async makes the model generate faster
- FastAPI requires async for POST endpoints
> Waiting on the network shouldn't block every other user.

? A semantic cache returns the stored answer when…
+ The new question's embedding is similar enough (above a threshold) to a cached question
- The question text is exactly identical
- The user has asked before
> It catches paraphrases — tune the threshold carefully.

? What does a token bucket rate limiter allow?
+ Short bursts up to the bucket capacity, while enforcing an average rate
- Unlimited requests
- Exactly one request per second, no bursts
> The bucket refills steadily.

? Where should your ANTHROPIC_API_KEY live in a Docker deployment?
+ In the platform's secret manager, passed as an environment variable at runtime
- Inside the Dockerfile
- Committed in the repository
> Never bake secrets into images.
```

:::exercise Combine cache + rate limit
Write a function `serve(user, question)` that first applies a per-user `TokenBucket(rate_per_sec=1, capacity=2)`, then checks an exact cache (a dict) keyed by the lowercased, stripped question, and otherwise "calls the LLM" (returns `f"fresh answer: {question}"`) and caches it. Call it 4 times for the same user with the same question and print each result.
:::

:::solution
```python run
import time

class TokenBucket:
    def __init__(self, rate_per_sec, capacity):
        self.rate, self.capacity, self.tokens, self.updated = rate_per_sec, capacity, capacity, time.monotonic()
    def allow(self):
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False

buckets, cache = {}, {}
def serve(user, question):
    if not buckets.setdefault(user, TokenBucket(1, 2)).allow():
        return "429: slow down"
    key = question.lower().strip()
    if key in cache:
        return "cached: " + cache[key]
    cache[key] = f"fresh answer: {question}"
    return cache[key]

for _ in range(4):
    print(serve("ada", "What is RAG?"))
```
:::
