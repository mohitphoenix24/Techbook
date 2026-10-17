---
title: The API and streaming
level: intermediate
time: 50
summary: The routes that make the pipeline usable: list, upload and delete repositories, read a file safely, look at retrieval on its own, and ask a question as a stream of events (retrieval first, then words, then the checked citations and the cost). An honest "nothing found" that never calls the model. The real client and reducer replay a stream in your browser.
tags: FastAPI, SSE, uploads, API design, streaming
---

The pipeline of lessons 2 to 6 is a set of functions. This lesson wraps it in an API a browser can use. Most of what is here you have seen (FastAPI routes, Server-Sent Events); what is new is what *this* product needs: uploads, a file reader that cannot be tricked, and a stream whose first event is the evidence.

## The routes

| Route | Does |
|---|---|
| `GET /api/health` | which model is in use |
| `GET /api/repos` | the repositories (the built-in sample, and any you uploaded) with their sizes |
| `POST /api/repos` | upload a ZIP: read safely, mask secrets, chunk, index |
| `GET /api/repos/{id}` | one repository's summary, including what was skipped and how many secrets were masked |
| `DELETE /api/repos/{id}` | remove an uploaded repository (the sample cannot be removed) |
| `GET /api/repos/{id}/tree` | the files, with line and chunk counts |
| `GET /api/repos/{id}/file?path=` | the lines of one file |
| `GET /api/repos/{id}/search?q=` | **retrieval on its own**: what would be shown to the model for this question, and why |
| `POST /api/repos/{id}/ask` | the answer, as a stream of events |

Repositories live **in memory**. That is a deliberate simplification for this project: it means no database to set up, and a restart forgets uploads (the sample comes back). The summary of a repository says how many files and chunks it has, so you can see what an upload turned into.

## Upload

```python src="repo-chat/backend/app/routes/repos.py" region="upload" title="backend/app/routes/repos.py"
```

The route is thin on purpose, because the careful code is in `read_zip` (lesson 2). What the route adds:

- **The extension is checked first**, with a friendly message, before anything is read.
- **`file.read(limit + 1)`**: at most one byte more than the allowed size is ever read into memory, however large the upload is. Rejecting a 10 GB upload by reading 10 GB first would be the attack succeeding.
- **A `RepoError` becomes a 400** with the message written for the uploader ("Unsafe file path in the archive...", "That is not a valid ZIP file."), in the same `{detail: {code, message}}` shape every error uses.
- **Uploading the same content twice returns the same repository.** The id is a hash of the files' paths and contents, so a repeat is free and harmless.
- **The number of uploads is capped** (`max_repos`), because each one lives in memory; remove one to add another.

## Reading a file, with no filesystem in sight

```python src="repo-chat/backend/app/routes/repos.py" region="file" title="backend/app/routes/repos.py"
```

This looks too simple to be secure, which is the reason it is. The uploaded files were never written to disk; they are values in a dictionary, keyed by their cleaned path. `read_file` looks the requested path up *in that dictionary*. `../../../etc/passwd` is not a key, so the answer is "not found". There is no path to traverse and no file to open, so the whole class of attack **cannot exist**, rather than being defended against. (A test sends four traversal attempts and expects four 404s.)

This is a recurring idea in secure design: prefer an architecture in which the dangerous operation is impossible to a layer of checks around a dangerous operation.

## Search on its own

```text
GET /api/repos/sample/search?q=What does Worker._handle_failure do?&k=3
```

This returns the same hits the model would see, with each one's score and **reasons**. It is the single most useful debugging tool in a RAG system: when an answer is wrong, the first question is "was the right code retrieved?", and this answers it without spending a token. The interface's "What I looked at" panel shows exactly this data.

## The answer, as events

```python src="repo-chat/backend/app/routes/ask.py" region="events" title="backend/app/routes/ask.py"
```

The order of the events is the design:

| Event | Sent | Why |
|---|---|---|
| `retrieval` | **first**, before any model call | the evidence appears in the interface at once: what was found, how well, and why. The reader can already see whether the right code is there |
| `delta` | many, as the model writes | the answer, word by word |
| `citations` | after the answer is complete | the verdict on each `[path:lines]`: valid, outside what the model saw, bad lines, no such file |
| `usage` | next | tokens and cost for this question |
| `done` | last | |
| `error` | instead of the above if the model fails | a provider error, with a code and whether retrying makes sense |

`citations` has to come at the end: you cannot check what has not been written. During streaming, the interface draws each citation as "unchecked" (grey), then recolours them when the verdicts arrive.

### Nothing found means no model call

```python
if not result.hits:                                  # nothing relevant: do not pay a model to improvise
    yield sse("delta", {"text": NO_ANSWER})
    yield sse("citations", {"items": [], "uncited": False})
    yield sse("done", {})
    return
```

If search finds nothing above the score floor, the route answers "I could not find anything in this repository that answers that", **without calling the model**. It is honest (a model handed no code would improvise), it is free, and it is instant. A question like "how do I deploy this to Kubernetes?" about a library with no deployment code deserves exactly this answer.

The route itself:

```python src="repo-chat/backend/app/routes/ask.py" region="route" title="backend/app/routes/ask.py"
```

## Watch the stream

The real front-end client (`askStream`, which reads the response as a stream, and the SSE parser) and the real `chatReducer` replay a recorded stream below. A fake server stands in for the API. The bytes are deliberately cut into small pieces (`chunk`), to show that **network chunks do not respect event boundaries** and the parser copes.

```tsx run src="repo-chat/frontend/src/sse.ts,repo-chat/frontend/src/api.ts,repo-chat/frontend/src/chatReducer.ts" flat title="The real client reading a streamed answer" level=intermediate autoclick="Ask" wait=3500
import { useReducer, useState } from "react";

const hit = (path: string, start: number, end: number, name: string, score: number, reasons: string[], expanded = false) => ({ path, start, end, kind: "function", name, score, reasons, expanded });
const words = "The wait is computed by `backoff_delay` [jobq/retry.py:20-29]: exponential growth with a ceiling and jitter.".split(" ");

mockServer({
  "POST /api/repos/:id/ask": () => sse([
    ["retrieval", { hits: [hit("jobq/retry.py", 20, 29, "backoff_delay", 4.9, ["matches: retry, delay"]), hit("jobq/worker.py", 58, 67, "Worker._handle_failure", 4.4, ["matches: retry, delay"])], terms: ["retry", "delay"] }],
    ...words.map((w) => ["delta", { text: w + " " }] as [string, object]),
    ["citations", { items: [{ path: "jobq/retry.py", start: 20, end: 29, status: "valid" }], uncited: false }],
    ["usage", { input_tokens: 812, output_tokens: 40, cost_usd: 0.002 }],
    ["done", {}],
  ], { delay: 60, chunk: 23 }),
});

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [log, setLog] = useState<string[]>([]);

  async function ask() {
    dispatch({ type: "clear" });
    setLog([]);
    dispatch({ type: "asked", id: "q", question: "Where is the retry delay calculated?" });
    const started = performance.now();
    for await (const event of askStream("sample", { question: "Where is the retry delay calculated?", expand: true, simulate: "none" }, new AbortController().signal)) {
      dispatch({ type: "event", event });
      if (event.type !== "delta") setLog((l) => [...l, `${String(Math.round(performance.now() - started)).padStart(5)} ms  ${event.type}`]);
    }
  }

  const t = state.turns[0];
  return (
    <div className="stack">
      <div className="row"><button className="primary" onClick={ask} disabled={state.busy}>Ask</button><span className="muted">{state.busy ? "streaming…" : t ? `status: ${t.status}` : ""}</span></div>
      {t && (
        <div className="card">
          <p className="muted">found {t.hits.length} chunks: {t.hits.map((h) => h.name).join(", ") || "…"}</p>
          <p>{t.text || "…"}</p>
          <p className="muted">{t.citations ? `citations checked: ${t.citations.map((c) => `${c.path}:${c.start}-${c.end} ${c.status}`).join(", ")}` : "citations not checked yet"}{t.usage ? ` · $${t.usage.cost_usd}` : ""}</p>
        </div>
      )}
      <pre>{log.join("\n") || "(press Ask)"}</pre>
    </div>
  );
}
```

The log shows the order: `retrieval` arrives first, while the answer is still empty; the words fill in; **only at the end** do `citations`, `usage` and `done` arrive. In the card, the citation is unchecked until the verdict event lands. The reducer never needed to know about network chunks: `parseSSE` hands it whole events.

## Errors and edges

- **Validation.** A question must be 3 to 1,000 characters. Anything else is a `422` with `{detail: {code: "invalid_input", message: "question: ..."}}`. The app's own handler reshapes FastAPI's default error into the project-wide format, so the front end has one error path.
- **Unknown repository** (or one removed in another tab): `404 not_found`.
- **A model failure** is an `error` *event* inside a 200 stream, not an HTTP error: by the time the model fails, the response has already started (the `retrieval` event has been sent). The front end handles both.

## Tests

```python src="repo-chat/backend/tests/test_api.py" region="api-tests" title="backend/tests/test_api.py"
```

```python src="repo-chat/backend/tests/test_api.py" region="upload-tests" title="backend/tests/test_api.py"
```

Read the upload tests as a checklist of what can go wrong with an upload: the same content twice, a hostile path, a non-ZIP, a ZIP with no source, an oversized file, too many repositories, removing a repository, and the rule that the built-in one is permanent.

:::keypoints
- Keep routes thin; put the careful logic in tested functions (`read_zip`).
- Read at most `limit + 1` bytes of an upload, so an oversized one is rejected without being loaded.
- Serve files from an in-memory map keyed by cleaned path: path traversal then cannot exist, instead of being filtered.
- Offer retrieval as its own endpoint: "was the right code found?" is the first debugging question in any RAG system.
- Stream the evidence *first* (`retrieval`), then the words, then the checked citations, cost and end; citations come last because they cannot be checked before the answer is complete.
- When nothing relevant is found, say so without calling the model.
- A model failure mid-stream is an `error` event, not an HTTP status: the response had already begun.
:::

```quiz
? Why is the `retrieval` event sent before the model is called?
- To save bandwidth
+ The evidence appears at once, and the reader can already see whether the right code was found
- Because models are slow
> Showing the evidence first makes the answer checkable as it arrives.
? Why do the `citations` arrive at the end of the stream?
- They are optional
+ A citation cannot be checked before the answer that contains it has been written
- To make the stream longer
> Verify after generation, then correct the interface's display.
? A request asks for `../../etc/passwd`. Why can the file route not leak it?
- A filter blocks `..`
+ Files are values in a dictionary, not files on disk: that path is not a key, so it is simply not found
- The server is read-only
> Design the danger out, rather than checking for it.
```

:::exercise A "why was this not found?" endpoint
Add `GET /api/repos/{id}/explain?q=...&chunk=jobq/retry.py:20-29` that returns, for one chunk, the weighted term counts that matched the question, the score it got, the score of the chunk ranked first, and the difference. Write the test with a question where the right chunk ranks third. How would you use it to debug a missed question from lesson 9?
:::
