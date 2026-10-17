---
title: FastAPI essentials
level: easy
time: 35
summary: Everything about FastAPI you need for the six projects: routes, Pydantic validation, dependencies, async, streaming responses and tests. Pydantic runs live in your browser.
---

**FastAPI** is a Python framework for building web APIs. It reads your **type hints** and uses them three ways at once: to validate every request, to convert data to and from JSON, and to write interactive documentation. For AI apps it has two more strengths: it is *async* (one server can wait on many slow model calls at once) and it can *stream* responses.

:::def Endpoint
One URL plus one HTTP method, handled by one Python function. `POST /api/chat` is an endpoint. The browser calls it, your function runs, and the return value becomes the response.
:::

## Your first endpoint

```python local verify title="hello.py (run with: uvicorn hello:app --reload)"
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI(title="Hello API")

@app.get("/api/hello")
def hello(name: str = "world"):          # ?name=Asha  (a query parameter with a default)
    return {"message": f"Hello, {name}!"}

# TestClient calls the app directly, with no server and no network. We use it for every test.
client = TestClient(app)
print(client.get("/api/hello").json())
print(client.get("/api/hello", params={"name": "Asha"}).json())
```

```output
{'message': 'Hello, world!'}
{'message': 'Hello, Asha!'}
```

When you run `uvicorn hello:app --reload` and open `http://localhost:8000/docs`, FastAPI shows interactive documentation it wrote from your code. You never write it by hand.

## Where the data comes from

FastAPI decides where to read each argument from by looking at its type:

| In the function signature | Read from | Example |
|---|---|---|
| a name that appears in the path, `{id}` | the URL path | `/conversations/{id}` |
| a simple type (`str`, `int`, `bool`) | the query string | `?limit=10` |
| a **Pydantic model** | the JSON body | `{"message": "hi"}` |
| `Depends(...)` | something your code provides (a database, settings, the user) | see below |

## Pydantic: the contract for your data

A **Pydantic model** describes the shape of your data with ordinary type hints. Pydantic checks it, converts it, and tells you precisely what is wrong. Every request body and every model output in this course is a Pydantic model. These examples run in your browser:

:::def Pydantic model
A Python class whose fields have type hints. Creating an instance **validates** the data: wrong types are converted if safe (`"3"` to `3`) or rejected with a clear error. It can also export itself to JSON and to a JSON Schema, which is what we give to Claude in Project 2.
:::

```python run title="A model that validates" level=easy
from pydantic import BaseModel, Field, ValidationError

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=50)
    persona: str = "friendly"
    temperature: float = Field(default=1.0, ge=0, le=2)

good = ChatRequest(message="Hello", temperature="0.5")      # "0.5" is converted to the float 0.5
print(good)
print(good.model_dump())

for bad in ({"message": ""}, {"message": "hi", "temperature": 9}, {"persona": "x"}):
    try:
        ChatRequest(**bad)
    except ValidationError as err:
        for e in err.errors():
            print(bad, "->", e["loc"], e["msg"])
```

Try changing `max_length`, or add a field such as `stream: bool = True`, and run again. In FastAPI, a request that fails this check is rejected with **HTTP 422** before your function even starts, so your code can trust its inputs.

```python run title="Models can export a JSON Schema" level=easy
import json
from pydantic import BaseModel, Field

class Invoice(BaseModel):
    vendor: str
    total: float = Field(ge=0, description="Grand total in rupees")
    paid: bool = False

print(json.dumps(Invoice.model_json_schema(), indent=2))
```

That schema is how you will tell an LLM exactly which JSON you want back (Project 2).

## A body, a response model and errors

```python local verify title="Request body, response model, errors"
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

app = FastAPI()
NOTES: dict[int, dict] = {}

class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=200)

class NoteOut(BaseModel):          # what we promise to send back; anything else is dropped
    id: int
    text: str

@app.post("/api/notes", response_model=NoteOut, status_code=201)
def create_note(body: NoteIn):
    note = {"id": len(NOTES) + 1, "text": body.text, "secret_internal_flag": True}
    NOTES[note["id"]] = note
    return note                     # the secret field is filtered out by response_model

@app.get("/api/notes/{note_id}", response_model=NoteOut)
def get_note(note_id: int):          # note_id comes from the path and must be an int
    if note_id not in NOTES:
        raise HTTPException(status_code=404, detail="Note not found")
    return NOTES[note_id]

client = TestClient(app)
r = client.post("/api/notes", json={"text": "buy milk"})
print(r.status_code, r.json())
print(client.get("/api/notes/1").json())
print(client.get("/api/notes/99").status_code, client.get("/api/notes/99").json())
r = client.post("/api/notes", json={"text": ""})
print(r.status_code, r.json()["detail"][0]["loc"], r.json()["detail"][0]["type"])
print(client.get("/api/notes/abc").status_code)
```

```output
201 {'id': 1, 'text': 'buy milk'}
{'id': 1, 'text': 'buy milk'}
404 {'detail': 'Note not found'}
422 ['body', 'text'] string_too_short
422
```

Three things to notice:

- `response_model` is a safety net: even if your code returns extra fields (say, an internal flag or a key), they never reach the client.
- `HTTPException` turns into a proper status code and a `{"detail": ...}` body. The React side reads `detail` (you will see this in `api.ts`).
- Bad input becomes **422** automatically, with the exact location of the problem.

## Dependencies: how routes get shared objects

A route needs a database, settings, an LLM client. Importing them as globals makes tests painful. FastAPI's answer is **dependency injection**: declare what you need, and FastAPI provides it.

```python local verify title="Depends, and swapping a dependency in a test"
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

class RealLLM:
    def answer(self, q: str) -> str:
        raise RuntimeError("would call a paid API")

class FakeLLM:
    def answer(self, q: str) -> str:
        return f"fake answer to: {q}"

def get_llm() -> RealLLM:
    return RealLLM()

app = FastAPI()

@app.get("/api/ask")
def ask(q: str, llm: RealLLM = Depends(get_llm)):
    return {"answer": llm.answer(q)}

# In a test we replace the dependency, so no API key and no cost are needed.
app.dependency_overrides[get_llm] = lambda: FakeLLM()
print(TestClient(app).get("/api/ask", params={"q": "hi"}).json())
```

```output
{'answer': 'fake answer to: hi'}
```

This is the trick that lets every project in this course run with an offline model in tests and a real model in production, with no `if testing:` anywhere.

## `async def` or `def`?

| Write | When | Why |
|---|---|---|
| `async def` | the function **waits** on the network: model calls, HTTP requests, async database drivers | while it waits, the server serves other requests |
| `def` | it uses ordinary blocking code (plain `sqlite3`, file reads, CPU work) | FastAPI runs it in a thread pool, so it does not freeze the server |

The one rule that matters: **never call blocking code inside `async def`**. A single `time.sleep(5)` there stops *every* request on that server for five seconds. Use `await asyncio.sleep(5)`, an async client, or move the work to a plain `def`.

## Streaming responses

A `StreamingResponse` takes an **async generator** and sends each `yield` to the client as it happens, which is exactly what we need for token streaming:

```python local verify title="Streaming with an async generator"
import asyncio
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

app = FastAPI()

async def countdown():
    for n in (3, 2, 1):
        await asyncio.sleep(0)          # stands in for "waiting for the model"
        yield f"data: {n}\n\n"          # one SSE event

@app.get("/api/count")
async def count():
    return StreamingResponse(countdown(), media_type="text/event-stream")

with TestClient(app).stream("GET", "/api/count") as response:
    for line in response.iter_lines():
        if line:
            print(line)
```

```output
data: 3
data: 2
data: 1
```

Project 1 builds a full chat endpoint on this idea.

## Settings, CORS and start-up

- **Settings**: use `pydantic-settings`. A `Settings` class reads environment variables and a `.env` file, validates them once at start-up, and fails fast if something is missing.
- **CORS**: browsers block a page on one origin from calling an API on another. In development we avoid the problem by letting Vite *proxy* `/api`. In production, either serve both from one origin or allow your site's origin with `CORSMiddleware`.
- **Lifespan**: code that must run once at start-up (open the database, build the LLM client) goes in a `lifespan` function, not at import time.

:::tip Run `/docs` while you build
Open `http://localhost:8000/docs` after every change. You can call each endpoint from the page, see the exact JSON it expects and returns, and download the OpenAPI schema. It is the fastest feedback loop you will find.
:::

:::keypoints
- FastAPI reads type hints to validate input, serialise output and write docs.
- Pydantic models are the contract: bad input becomes a 422 before your code runs.
- `response_model` guarantees what you send back; `HTTPException` produces clean errors.
- `Depends` hands shared objects to routes and lets tests swap them out.
- Use `async def` for code that waits on the network, plain `def` for blocking code, and never block inside `async def`.
- `StreamingResponse` plus an async generator is the basis of token streaming.
:::

```quiz
? A client POSTs {"text": ""} to an endpoint whose model says min_length=1. What happens?
- Your function runs with an empty string
+ FastAPI answers 422 and your function never runs
- FastAPI answers 500
> Validation happens before the function is called. The 422 body lists the field and the rule that failed.
? What does `response_model` protect you from?
- Slow responses
+ Accidentally sending fields you did not mean to expose
- Cross-origin errors
> Only the fields declared in the response model are serialised, so extra internal data is dropped.
? Which of these is a bug inside an `async def` endpoint?
- await asyncio.sleep(1)
- await client.post(...) with an async HTTP client
+ time.sleep(1)
> time.sleep blocks the whole event loop, freezing every other request. Use await asyncio.sleep, or define the endpoint with plain def.
```

:::exercise Add a field
In the first Pydantic example, add `language: Literal["en", "hi"] = "en"` (import `Literal` from `typing`). Send `language="fr"` and read the error message. Then check: which HTTP status would FastAPI return for it?
:::
:::solution
`Literal` limits a field to specific values. `ChatRequest(message="x", language="fr")` raises a `ValidationError` whose error type is `literal_error`. In FastAPI the same failure is returned as **422 Unprocessable Content**.
:::

:::resources Go deeper
- [FastAPI tutorial](https://fastapi.tiangolo.com/tutorial/) is the official, very readable guide.
- [Pydantic documentation](https://docs.pydantic.dev/latest/) covers validators, settings and JSON Schema.
- [FastAPI: Testing](https://fastapi.tiangolo.com/tutorial/testing/) explains `TestClient` and dependency overrides.
:::
