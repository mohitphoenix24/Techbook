---
title: The streaming ask endpoint
level: intermediate
time: 40
summary: Put it all together in one Server-Sent Events endpoint: rewrite, search, gate, send the sources first, stream a grounded answer, check the citations, and report the true cost. Includes a script that prints a real stream.
tags: SSE, endpoint, streaming, cost, orchestration
---

Every piece now exists: chunks, vectors, keyword search, fusion, a grounded prompt, citation checks, a gate and a rewriter. The ask endpoint is the **conductor**. It does no clever work itself; it calls the pieces in the right order and tells the browser what is happening at each step.

## The request

```python src="ask-docs/backend/app/schemas.py" region="ask-request" title="backend/app/schemas.py"
```

Note what the browser sends: the question, its **own record of earlier turns** (`history`, at most 12 and each at most 4,000 characters), the search `mode`, how many passages (`top_k`) and optionally which documents to search. Keeping the conversation in the browser makes the server simpler (nothing to store) and is fine here because the history only ever influences *this user's* answer. If you needed shared conversations, audit logs, or protection against a user forging history, you would store it on the server as in Project 1.

Everything is bounded: lengths, number of turns, `top_k` between 1 and 10. Bounds on input are the cheapest defence for any endpoint that spends money.

## Turning hits into numbered sources

```python src="ask-docs/backend/app/routes/ask.py" region="sources" title="backend/app/routes/ask.py"
```

Search returns *chunk ids and scores*. `sources_for` joins them with their text, document title, page and heading, and **numbers them from 1**. Those numbers are what the model will cite, what the interface turns into chips, and what `check_citations` validates against. One place builds them, so they can never disagree.

## The event generator

```python src="ask-docs/backend/app/routes/ask.py" region="ask-events" title="backend/app/routes/ask.py"
```

Walk through the steps:

| # | Step | Event | Notes |
|---|---|---|---|
| 1 | rewrite the question if it is a follow-up | `rewrite` | free for standalone questions; the cost of a rewrite is added to the total |
| 2 | search | | `index.search(query, mode, top_k, document filter)` |
| 3 | build sources, run the gate | `sources` | **sent before any answer text**, with `relevant` |
| 4a | not relevant | `delta` with the refusal | no model call, zero cost |
| 4b | relevant | `delta` ... | the model streams; we also accumulate the full answer |
| 5 | check citations on the *complete* answer | `citations` | `used`, `invalid`, `refused`, `uncited` |
| 6 | report cost | `usage` | rewrite + answer tokens, priced |
| 7 | finish | `done` | |

Three design decisions to defend:

1. **Sources before the answer.** The person sees evidence while the answer is written, and `[2]` always has a card.
2. **The gate decides, not the model, for hopeless questions.** A question like "What is the capital of France?" never reaches the model. That saves money *and* removes the temptation to answer from memory.
3. **Cost is the sum of everything we paid for.** An easy mistake is to report only the final answer call. The rewrite and the answer are both billed; we add them.

The route itself is the same thin wrapper as in Project 1:

```python src="ask-docs/backend/app/routes/ask.py" region="ask-route" title="backend/app/routes/ask.py"
```

## See a real stream

This script uses the actual app with the offline model and the sample documents, asks three questions (one needing a rewrite, one unrelated) and prints each stream compactly.

```python local verify cwd="ask-docs/backend" title="Three questions, three streams"
import json, os, tempfile, time
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app

settings = Settings(llm_provider="mock", mock_delay_ms=0, database_path=os.path.join(tempfile.mkdtemp(), "demo.db"), frontend_dist="nope", _env_file=None)

def events(response):
    for block in response.text.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        yield fields["event"], json.loads(fields["data"])

with TestClient(create_app(settings)) as client:
    client.post("/api/documents/samples")
    while not all(d["status"] == "ready" for d in client.get("/api/documents").json()):
        time.sleep(0.05)

    def ask(question, history=()):
        print("\nQ:", question)
        answer = ""
        for name, data in events(client.post("/api/ask", json={"question": question, "history": list(history)})):
            if name == "rewrite" and data["rewritten"]:
                print("  rewrite  ->", data["standalone"])
            elif name == "sources":
                print("  sources  ->", [(s["n"], s["document"][:14], s["heading"][:18], f"v#{s['vector_rank']}", f"k#{s['keyword_rank']}") for s in data["sources"][:3]], "| relevant:", data["relevant"])
            elif name == "delta":
                answer += data["text"]
            elif name == "citations":
                print("  answer   ->", answer)
                print("  citations->", data)
            elif name == "usage":
                print("  usage    ->", data["input_tokens"], "in,", data["output_tokens"], "out, $%.5f" % data["cost_usd"])

    ask("How many days of annual leave do I get?")
    ask("And sick leave?", history=[{"role": "user", "content": "How many days of annual leave do I get?"}, {"role": "assistant", "content": "24 days [1]"}])
    ask("What is the capital of France?")
```

```output

Q: How many days of annual leave do I get?
  sources  -> [(1, 'Nayan Traders ', 'Leave', 'v#1', 'k#1'), (2, 'HomeFiber broa', 'Cancelling and ref', 'v#2', 'k#3'), (3, 'HomeFiber broa', 'Billing', 'v#3', 'k#5')] | relevant: True
  answer   -> Every full-time employee gets 24 days of paid annual leave per year. [1]
  citations-> {'used': [1], 'invalid': [], 'refused': False, 'uncited': False}
  usage    -> 789 in, 18 out, $0.00176

Q: And sick leave?
  rewrite  -> How many days of annual leave do I get And sick leave?
  sources  -> [(1, 'Nayan Traders ', 'Leave', 'v#1', 'k#1'), (2, 'HomeFiber broa', 'Cancelling and ref', 'v#3', 'k#3'), (3, 'HomeFiber broa', 'Billing', 'v#2', 'k#5')] | relevant: True
  answer   -> Sick leave is 8 days per year. [1]
  citations-> {'used': [1], 'invalid': [], 'refused': False, 'uncited': False}
  usage    -> 886 in, 23 out, $0.00200

Q: What is the capital of France?
  sources  -> [] | relevant: False
  answer   -> I couldn't find that in your documents.
  citations-> {'used': [], 'invalid': [], 'refused': True, 'uncited': False}
  usage    -> 0 in, 0 out, $0.00000
```

Look at the third question: no sources, a refusal, and a cost of exactly zero.

## What happens when the person presses Stop

The browser aborts the request, the connection closes, and Starlette cancels this generator at its current `await`. There is nothing to save (unlike a chat transcript in Project 1) and nothing to clean up, so no `finally` block is needed. If the generator were holding a database transaction or a lock, you would need one.

## Tests

```python src="ask-docs/backend/tests/test_api.py" region="ask-tests" title="backend/tests/test_api.py"
```

The tests check behaviour that users care about: the **order** of the stream, that the cited source really contains the fact, that unrelated questions are refused **for free**, that a follow-up is rewritten and counted, and that document filters work.

:::keypoints
- The endpoint orchestrates; the logic lives in small, separately tested pieces.
- Stream order: rewrite, sources, answer, citations, usage, done. Sources come first.
- Number sources in one place, so prompt, interface and citation check always agree.
- A relevance gate turns hopeless questions into free refusals and removes the temptation to answer from memory.
- Report the true cost: rewrite plus answer.
- Bound every input (lengths, turns, `top_k`): an endpoint that spends money must not trust its caller.
:::

```quiz
? Why are the sources sent before the first word of the answer?
- The model needs them in that order
+ The person can see the evidence while the answer is written, and each citation has a card to point to
- Because SSE requires it
> Evidence first builds trust and makes the citations meaningful as they appear.
? An unrelated question is refused by the gate. What does the usage event report?
- The cost of the model call
+ Zero tokens and zero cost: the model was never called
- An error
> A free refusal is one of the benefits of a relevance gate.
? Why does the browser send the conversation history in this project?
- The server cannot store anything
+ It keeps the server simple, and it is safe here because the history only influences that user's own answer
- Because FastAPI forbids sessions
> A trade-off: client-held history is simple but untrusted. For shared or audited conversations, store it on the server.
```

:::exercise Stream the retrieval progress
Searching is fast here, but with a hosted embedder a question can take half a second just to embed. Add an event `searching` at the very start of the stream (before the rewrite) so the interface can show "Searching your documents…" immediately, and a `timing` event at the end with `{rewrite_ms, search_ms, answer_ms}` measured with `time.perf_counter()`. Which of the three do you expect to dominate with a real model, and which is the first to optimise?
:::
