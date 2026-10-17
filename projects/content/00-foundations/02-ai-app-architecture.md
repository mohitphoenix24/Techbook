---
title: The anatomy of a full-stack AI app
level: easy
time: 25
summary: The three layers every AI product has (browser, server, model), why the browser must never call the model directly, and how a single chat message travels through the stack.
---

Open any AI product and you will find the same shape. Learn this shape once and every project in this course becomes "the same thing, with one more box".

```viz algo=arch title="The three layers" dir=right
web   React app | the screen people use [browser] @0,0
api   FastAPI server | rules, secrets, history [service] @1,0
llm   Claude | writes the answer [llm] @2,0
db    Database | conversations, users [db] @1,1.6
--
web -> api : HTTPS (JSON, SSE)
api -> llm : API call (secret key)
api <-> db : read / write
flow One chat message
web > api : The user presses Send. React POSTs the message to /api/chat.
api > db : The server saves the message and loads the earlier ones (the history).
api > llm : It sends the system prompt + history to the model with its secret key.
llm > api : The model streams its answer back a few words at a time.
api > web : The server forwards each piece as a Server-Sent Event, so words appear live.
```

## What each layer is for

| Layer | Job | Never do this here |
|---|---|---|
| **React (browser)** | Show things, collect input, show progress and errors | Hold an API key. Anyone can read browser code. |
| **FastAPI (server)** | Check input, add history and instructions, call the model, save results, enforce limits, keep secrets | Trust anything the browser sends. |
| **Model (Claude)** | Turn the prompt into text, a structured result, or a tool call | Be your only line of defence. It can be wrong or manipulated. |
| **Database** | Remember conversations, documents, users, traces | Store secrets in plain text. |

## Why not call the model from the browser?

It is tempting: fewer moving parts. But it breaks five things at once.

:::warn The five reasons the server is not optional
1. **Secrets.** An API key in browser code is a public key. Someone will find it and spend your money.
2. **Cost control.** The server decides who can call the model, how often, and with how many tokens.
3. **Your instructions.** The system prompt, the documents you retrieve and the tools you allow belong on the server. If the browser builds the prompt, users can rewrite it.
4. **Memory.** Models are *stateless*. The server stores the conversation and sends the right part each turn.
5. **Observability.** The server can log every call (latency, tokens, cost, failures). You cannot debug what you cannot see.
:::

## Why streaming

A long answer can take 10 to 30 seconds to finish. If the interface waits for the whole thing it feels broken. A model produces text **a few tokens at a time**, so the server can pass each piece on immediately and the user starts reading in under a second. That is **streaming**, and it shapes both halves of the app: the server must send pieces as they appear, and the browser must read them as they arrive.

We use **Server-Sent Events (SSE)**, a plain-text format over normal HTTP. It is simpler than WebSockets and works through proxies and load balancers.

:::analogy The restaurant
The browser is the **customer**, the server is the **waiter**, the model is the **kitchen**. The customer never walks into the kitchen (secrets and rules), the waiter checks the order, brings back the dishes as they are ready (streaming), and writes everything on the bill (logging and cost).
:::

## The six projects are the same picture with more boxes

```viz algo=arch title="What each project adds" dir=down
web    React UI | all projects [browser] @0,0
api    FastAPI | all projects [service] @1,0
llm    Claude | all projects [llm] @2,0
db     SQLite / SQL | 1, 3, 4, 5 [db] @2,1.4
vec    Search index | 3, 5, 6 [vector] @1,1.4
tool   Tools: SQL, orders | 4, 5 [tool] @3,1.4
guard  Guardrails | 2, 5 [guard] @0,1.4
mon    Traces and evals | 5 [monitor] @3,0
--
web -> api
api -> llm
api -> db
api -> vec
api -> tool
api -> guard
api -> mon
```

1. **Pocket Chat:** web, api, llm, db. The basic loop, plus streaming.
2. **Smart Extractor:** adds **guardrails**: validate the model's output and check it against the source.
3. **AskDocs:** adds a **vector index**: find the right passages before asking.
4. **DataPilot:** adds **tools**: the model decides to run a SQL query and reads the result.
5. **SupportPilot:** adds **everything**, plus tracing, evals, authentication and human approval.
6. **RepoChat:** adds a **search index built for code**: chunks cut along functions and classes, identifier-aware ranking, a call graph, and citations to exact lines that are checked.

## The request lifecycle, in code order

When a message arrives, a well-built server does these steps. You will write each one in Project 1:

:::flow One request, step by step
Validate | Pydantic rejects bad input with a 422
Load | read history from the database
Trim | fit the history in the token budget
Call | stream from the model
Forward | send each piece to the browser as an SSE event
Save | store the reply and its token usage
:::

:::keypoints
- Every AI app has three layers: browser, server, model. Add a database as soon as you need memory.
- The browser must never hold secrets or build the real prompt. The server does both.
- Models are stateless: the server owns the conversation and the budget.
- Streaming (SSE) makes long answers feel instant, and it affects both server and UI code.
- The six projects reuse this picture and add one new box each.
:::

```quiz
? Why can a React app not safely call the Claude API directly?
- Browsers cannot send HTTP requests to APIs
+ Any API key placed in browser code is visible to every visitor
- Claude only accepts requests from Python
> Browser code is public. The key must live on a server you control, which also gives you cost limits, logging and a trusted place to build prompts.
? What does "models are stateless" mean for your server?
- The model remembers the last conversation by itself
+ The server must send the relevant conversation history with every request
- The model never produces different answers
> The API does not remember earlier calls. Your database stores the conversation and your code sends the right part each turn.
? Which protocol do we use to push the answer to the browser word by word?
- WebSockets
- Polling every second
+ Server-Sent Events over a normal HTTP response
> SSE is one-way, text-based and works through normal HTTP infrastructure. That is all a chat answer needs.
```

:::exercise Draw it yourself
On paper, draw the three layers and the arrows for this scenario: a user asks a question, and your app should answer using the company's PDF handbook. Where does the PDF live? Which layer searches it? Which layer should *never* see the raw PDF? (Compare with Project 3.)
:::
