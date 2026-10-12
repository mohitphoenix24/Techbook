---
title: Calling AI APIs Safely
level: intermediate
time: 30
summary: The architecture every AI web app uses — browser → your backend → model API. Write the backend route (Node or Python), call it from React with loading, error, timeout and cancel handling, and deal with rate limits and refusals.
---

Your React app should **never** talk to a model API directly. It talks to **your backend**, and your backend talks to the model. This lesson builds that whole path.

:::def Backend (server)
Code that runs on a machine you control, not in the user's browser. It can safely hold secrets (API keys), check who the user is, limit usage, log requests and call other services.
:::

:::def API route / endpoint
A URL on your backend (like `POST /api/chat`) that your front end calls with `fetch`. It receives JSON, does the work, and sends back JSON or a stream.
:::

```text
┌─────────────┐   POST /api/chat    ┌──────────────────────┐   messages.create   ┌────────────┐
│  React app  │ ──────────────────▶ │  Your backend        │ ──────────────────▶ │ Claude API │
│  (browser)  │ ◀────────────────── │  • holds the API key │ ◀────────────────── │            │
└─────────────┘   JSON / stream     │  • auth, rate limits │                     └────────────┘
                                    │  • validation, logs  │
                                    └──────────────────────┘
```

:::warn Why not call the model from the browser?
1. **Your key would be public** — anyone can copy it from DevTools and run up your bill.
2. **No control** — you can't limit usage per user, block abuse, or log problems.
3. **Prompt tampering** — users could change your system prompt or model.
:::

## The backend route

**Node.js (Express) with the official SDK:**

```js
// server.js  —  npm install express @anthropic-ai/sdk
import express from "express";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(express.json());
const client = new Anthropic();               // reads ANTHROPIC_API_KEY from the environment

app.post("/api/ask", async (req, res) => {
  const question = String(req.body?.question ?? "").trim();
  if (!question || question.length > 4000) return res.status(400).json({ error: "Question must be 1–4000 characters." });

  try {
    const response = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      system: "You are a concise, friendly assistant.",       // decided by the server, not the browser
      messages: [{ role: "user", content: question }],
    });
    if (response.stop_reason === "refusal") return res.json({ answer: null, refused: true });
    const answer = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    res.json({ answer, usage: response.usage });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Busy — try again shortly." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.listen(3001);
```

**Python (FastAPI)** — if you did the Python course, this will look familiar:

```python
# main.py  —  pip install fastapi uvicorn anthropic
from anthropic import AsyncAnthropic
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI()
client = AsyncAnthropic()

class Ask(BaseModel):
    question: str = Field(min_length=1, max_length=4000)

@app.post("/api/ask")
async def ask(body: Ask):
    response = await client.messages.create(
        model="claude-opus-5-5",
        max_tokens=2000,
        messages=[{"role": "user", "content": body.question}],
    )
    if response.stop_reason == "refusal":
        return {"answer": None, "refused": True}
    return {"answer": "".join(b.text for b in response.content if b.type == "text")}
```

During development, Vite can forward `/api` to your backend so there are no CORS problems:

```js
// vite.config.js
export default defineConfig({ plugins: [react()], server: { proxy: { "/api": "http://localhost:3001" } } });
```

## Calling it from React

Every request has states to handle: **idle → loading → success | error**, plus **cancel**. Below, `fakeServer` stands in for the backend so you can try every case — including errors and slow answers.

```jsx run level=intermediate
import { useRef, useState } from "react";

// ---- pretend backend: same request/response shape as the real one ----------------
async function fakeServer(url, { body, signal }) {
  const { question } = JSON.parse(body);
  await new Promise((resolve, reject) => {
    const t = setTimeout(resolve, question.includes("slow") ? 4000 : 900);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); });
  });
  if (question.includes("error")) return new Response(JSON.stringify({ error: "Something went wrong." }), { status: 500 });
  if (question.includes("busy")) return new Response(JSON.stringify({ error: "Busy — try again shortly." }), { status: 429 });
  return Response.json({ answer: `You asked: "${question}". Here's a helpful answer.`, usage: { output_tokens: 12 } });
}

// ---- a small API client: one place for headers, errors and timeouts --------------
async function postJSON(url, data, { signal, timeoutMs = 3000 } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);                    // give up after N ms
  const res = await fakeServer(url, {                                 // in a real app: fetch(url, {...})
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,   // cancel OR timeout, whichever first
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { status: res.status });
  return json;
}

export default function App() {
  const [question, setQuestion] = useState("What is an embedding?");
  const [state, setState] = useState({ status: "idle" });
  const controllerRef = useRef(null);

  async function ask(e) {
    e.preventDefault();
    controllerRef.current?.abort();                                   // cancel any previous request
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading" });
    try {
      const data = await postJSON("/api/ask", { question }, { signal: controller.signal });
      setState({ status: "success", answer: data.answer });
    } catch (err) {
      if (err.name === "AbortError" && controller.signal.aborted) return setState({ status: "idle", note: "Cancelled." });
      if (err.name === "AbortError" || err.name === "TimeoutError") return setState({ status: "error", message: "Timed out — the server took too long." });
      setState({ status: "error", message: err.status === 429 ? "Rate limited. Wait a moment and retry." : err.message });
    }
  }

  return (
    <form onSubmit={ask} className="stack" style={{ maxWidth: 440 }}>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Question" />
      <div className="row">
        <button className="primary" disabled={state.status === "loading"}>{state.status === "loading" ? "Thinking…" : "Ask"}</button>
        {state.status === "loading" && <button type="button" onClick={() => controllerRef.current.abort()}>Cancel</button>}
      </div>
      <span className="muted">Try a question containing “error”, “busy” or “slow”.</span>
      {state.status === "success" && <div className="card">{state.answer}</div>}
      {state.status === "error" && <p role="alert" className="error">⚠ {state.message} <button type="button" onClick={ask}>Retry</button></p>}
      {state.note && <p className="muted">{state.note}</p>}
    </form>
  );
}
```

:::def AbortController
A browser object that lets you **cancel** a `fetch`. Pass `controller.signal` to `fetch`, then call `controller.abort()` — the request stops and the promise rejects with an `AbortError`. `AbortSignal.timeout(ms)` makes a signal that aborts by itself.
:::

## Status codes you'll meet

| Status | Meaning | What the UI should do |
|---|---|---|
| `400` | bad input (validation failed) | show the message next to the field |
| `401` / `403` | not signed in / not allowed | redirect to login / explain |
| `413` | request too large (big file, long prompt) | tell the user the limit |
| `429` | rate limited | "Busy — retry in a moment"; retry with backoff |
| `500` / `529` | server or model overloaded | friendly error + Retry button |
| `200` + `refused: true` | the model declined | show a neutral message, suggest rephrasing |

### Retry with exponential backoff

```js run level=advanced
async function withRetry(fn, { retries = 3, baseMs = 300 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err.status === 429 || err.status >= 500;
      if (!retryable || attempt >= retries) throw err;
      const wait = baseMs * 2 ** attempt + Math.random() * 100;        // 300, 600, 1200… plus jitter
      console.log(`attempt ${attempt + 1} failed (${err.status}); retrying in ${Math.round(wait)} ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// a flaky fake API that fails twice, then succeeds
let calls = 0;
const flaky = async () => {
  calls++;
  if (calls < 3) throw Object.assign(new Error("overloaded"), { status: 529 });
  return "✅ success on call " + calls;
};

console.log(await withRetry(flaky));
```

:::tip Only retry safe things
Retry **reads** and idempotent requests freely. Be careful retrying actions that change data (like "send email") — you might do them twice.
:::

:::ai
Put a **thin, typed API client** (like `postJSON`) in `src/lib/api.ts` and use it from TanStack Query or your hooks — never scatter raw `fetch` calls around components. The backend decides the **model, system prompt and limits**; the browser only sends the user's input and conversation id.
:::

## Check yourself

```quiz
? Where should your Anthropic API key live?
+ Only on your backend, in an environment variable
- In a VITE_ variable
- In localStorage after the user logs in
> Anything in the browser is public.

? How do you let a user cancel a slow request?
+ Pass an AbortController's signal to fetch and call abort()
- Reload the page
- Set state to idle and ignore the response
> Aborting actually stops the network request.

? The server returns 429. What's the best response?
+ Show "busy" and retry later with exponential backoff
- Retry immediately in a tight loop
- Treat it as a success
> 429 means rate limited — slow down.
```

:::keypoints
- Browser → **your backend** (holds key, validates, limits, logs) → model API. Never expose keys.
- Handle **idle / loading / success / error** and **cancel** for every request; use `AbortController` and `AbortSignal.timeout`.
- Check `res.ok` — `fetch` doesn't throw on HTTP errors.
- Map status codes to helpful messages; retry 429/5xx with exponential backoff; handle refusals gracefully.
:::
