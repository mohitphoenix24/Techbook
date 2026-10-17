---
title: Conventions every project shares
level: easy
time: 30
summary: The folder layout, settings, provider interface, offline model, test strategy and security habits that all six projects use, so each new project feels familiar.
---

Six projects would be exhausting if each had its own structure. They share a small set of conventions. Learn them here once; every later lesson becomes easier to read.

## Folder layout

```text title="Every project"
project-name/
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py            # builds the FastAPI app (create_app)
│   │   ├── config.py          # Settings: environment variables, validated
│   │   ├── schemas.py         # Pydantic request and response models
│   │   ├── deps.py            # Depends(...) helpers
│   │   ├── routes/            # one file per area of the API
│   │   ├── llm/               # base.py (the interface), anthropic_client.py, mock_client.py
│   │   └── ...                # project-specific modules (db, rag, tools, ...)
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example           # documents every setting, contains no secrets
└── frontend/
    ├── src/
    │   ├── api.ts             # the only file that calls fetch
    │   ├── types.ts           # shapes shared by the components
    │   ├── components/
    │   └── styles.css
    ├── vite.config.ts         # dev proxy: /api -> the back end
    └── package.json
```

:::tip Why `api.ts` is the only place that calls `fetch`
When the back end changes (a new header, a base URL, auth), you edit one file. Components just call functions such as `listConversations()`. It also gives you one place to turn error responses into messages.
:::

## Settings come from the environment

Configuration (the model name, the database path, the API key) is not code. Each project has a `Settings` class that reads environment variables and a `.env` file and validates them at start-up. `.env.example` lists every setting; you copy it to `.env` and fill in what you need. `.env` is in `.gitignore`.

## One interface, two providers

The rest of the app depends on a small **interface** (a Python `Protocol`) and never on a vendor SDK. Two classes implement it: the real `AnthropicClient` and the offline `MockClient`. A factory picks one at start-up. This is why the whole stack can run, and be tested, with no key.

```python run title="Two providers, one interface" level=intermediate
import asyncio
from collections.abc import AsyncIterator
from typing import Protocol


class LLM(Protocol):
    def stream(self, prompt: str) -> AsyncIterator[str]: ...


class Shouty:                                   # stands in for the offline mock
    async def stream(self, prompt):
        for word in prompt.upper().split():
            yield word + " "


class Polite:                                   # stands in for the real provider
    async def stream(self, prompt):
        for word in ("Certainly! ", "You ", "said: ", prompt):
            yield word


async def run(llm: LLM, prompt: str) -> str:   # this function cannot tell which one it got
    return "".join([piece async for piece in llm.stream(prompt)])


async def main():
    for llm in (Shouty(), Polite()):
        print(type(llm).__name__, "->", await run(llm, "hello world"))

asyncio.run(main())
```

Because `run` only knows the interface, you can swap the implementation without touching it: that is the whole trick.

## The offline model, honestly

The `MockClient` is a **test double**, not a smaller model. It recognises a few kinds of request (a greeting, "write code", "make a table") and answers from templates, or, in later projects, applies simple rules to the real data. It is deliberately predictable so that tests can assert exact results. What it copies faithfully is the *behaviour of the API*: streaming in small pieces, token usage, stopping, failing. The chat UI, the database and the tests do not know the difference.

Every lesson tells you which behaviours need a real model. If you want real answers, add a key and restart; nothing else changes.

## Pure core, impure shell

The easiest code to test and to reuse has no side effects: it takes values and returns values. Keep the decision-making in such functions (trimming history, chunking text, ranking results, validating SQL) and keep input and output (HTTP, the database, the model) in a thin outer layer.

```python run src="pocket-chat/backend/app/sse.py" region="imports,format" title="A pure function: events in, text out" level=easy
print(repr(sse("delta", {"text": "Hello"})))
print(sse("done", {}).splitlines())
print(sse("delta", {"text": "नमस्ते"}))
```

`sse()` knows nothing about FastAPI or the browser, so a test is one line and the browser lesson can run the very same code. Look for this shape throughout the projects: pure modules the lessons run in your browser, wrapped by routes and clients that need a server.

## How we test

| Layer | How | Example |
|---|---|---|
| Pure functions | plain `pytest`, no setup | `trim_history`, chunking, SQL guard |
| API routes | `TestClient` + the offline model | send a chat, parse the SSE events |
| The Claude adapter | the real SDK against a tiny **fake Anthropic server** in the tests | proves we parse a real stream and map errors |
| React state | `vitest` on reducers and the SSE parser | chunks split mid-event |
| Whole app | a browser script (Playwright) driving React + FastAPI together | type, send, stop, reload |

Every project ships with its tests, and the lessons say what each test protects against. A project is "done" when all of them pass.

## Security habits

:::warn Five habits, from day one
1. **Secrets stay on the server**, in `.env`, never committed, never logged.
2. **Validate everything** that comes in, with Pydantic. Put limits on sizes (a message of 8,000 characters at most).
3. **Escape what you show.** Render model output as Markdown through a library that never injects raw HTML (we use `react-markdown`).
4. **Least power for tools.** A model can be talked into odd requests; give it read-only access unless a human approves.
5. **Do not leak errors.** Turn provider failures into friendly messages; log the details on the server.
:::

## When something does not work

| Symptom | Likely cause |
|---|---|
| The browser console shows a CORS error | you called the back end directly; call `/api/...` and let Vite proxy it |
| `404` on `/api/...` in the browser | the back end is not running, or the proxy target port is wrong |
| `ECONNREFUSED` in the Vite terminal | start the back end first (`uvicorn app.main:app --reload`) |
| The reply appears all at once, not word by word | something between buffers the stream (a proxy, `gzip`); keep `X-Accel-Buffering: no` |
| `422 Unprocessable Content` | the JSON you sent does not match the Pydantic model; the response says which field |
| `Address already in use` | another process holds port 8000 or 5173; stop it or pick another port |
| `ModuleNotFoundError: app` | run `uvicorn` and `pytest` from the `backend/` folder |

:::keypoints
- Every project has the same layout: `backend/app`, `backend/tests`, `frontend/src`, with `api.ts` as the only network caller.
- Settings come from the environment; `.env.example` documents them; `.env` is never committed.
- Code depends on an interface; the offline mock and Claude both implement it.
- Keep decisions in pure functions and I/O in a thin shell: it is what makes testing and reuse easy.
- Tests at five levels, from pure functions up to a real browser.
:::

```quiz
? Why does the app depend on an LLMClient interface instead of calling the Anthropic SDK everywhere?
- To make the code longer
+ So the offline mock, the real client and test fakes can be swapped without touching the rest of the code
- Because the SDK only works inside one file
> One interface, several implementations. Tests, offline development and production just pick a different one.
? Where should the Anthropic API key live?
- In the React code, in a constant
- In a file committed to the repository
+ In an environment variable or .env file read by the back end
> Anything in the browser or the repository can leak. Environment variables read by the server stay private.
? What is the offline MockClient?
- A smaller version of Claude
+ A deterministic test double that behaves like a streaming API
- A caching layer
> It answers from templates or simple rules so that development and tests are free and repeatable.
```

:::exercise Read a project
Open **Source** in the top bar, choose Pocket Chat and find: the file that defines `Settings`; the interface the app depends on; the two classes that implement it; the only file in the front end that calls `fetch`. You will build each of them in the next module.
:::
