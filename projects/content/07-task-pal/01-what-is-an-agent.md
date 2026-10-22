---
title: What an agent is, and the app you will build
level: easy
time: 30
summary: The difference between a chatbot and an agent in one sentence, the loop every agent runs, a tour of TaskPal, and how to get it running with your own Claude API key. This project has no offline mode: the agent is the real Claude.
tags: agents, tool use, the loop, API key, setup
---

So far in ProjectLab the model has *talked*. In Pocket Chat it wrote replies, in Smart Extractor it filled in a form, in AskDocs it answered from passages you handed it. In every case **your code decided what happened next**, and the model only produced text.

An **agent** flips one thing: the model decides what happens next, and your code carries it out.

:::def Agent
A program in which a language model chooses **actions** (calls to *tools* that you wrote), your code performs them, the results go back to the model, and this repeats until the model decides it is done. The model steers; your code owns the hands.
:::

That is the whole idea. Everything else in these four projects is detail: how to describe tools so the model uses them well, how to keep them safe, how to show the person what is happening, how to test it.

## A chatbot and an agent, side by side

You ask: *"Remind me to pay the electricity bill on Friday."*

| | A chatbot | An agent |
|---|---|---|
| What it knows | only what is in the conversation | can **look things up** by calling tools |
| Today's date | guesses (and is often wrong) | calls `get_today` and knows |
| Your to-do list | cannot see it | calls `list_tasks`, then `add_task` |
| The result | "Sure! I'll remind you." (nothing happened) | the task *exists*, with the right date |

The chatbot is polite and useless. The agent did something real. That is the appeal, and also the risk: a model that can *do* things can do the wrong things, which is why Project 9 is entirely about safety.

## The loop

Every agent, from this beginner project to the biggest ones, runs the same loop:

```text title="The agent loop"
            ┌──────────────────────────────────────────────┐
            ▼                                              │
 you send the conversation + the list of tools             │
            │                                              │
            ▼                                              │
   Claude replies ──── "I'm done": plain text ──► show it, stop
            │
            └── "call add_task(...)" ──► YOUR code runs add_task
                                                │
                                   result goes back to Claude ──┘
```

Read it as a conversation between two parties who cannot touch each other's world. Claude can only *ask*. You can only *answer*. Claude never runs code on your machine; it writes down "please call `add_task` with this title" and your code decides whether and how to do it. That separation is the source of all the safety you will build.

## TaskPal

TaskPal is a to-do assistant with a task board beside the chat:

- **Five tools**: `get_today`, `list_tasks`, `add_task`, `update_task`, `delete_task`.
- **A step list** under every answer, so you can see each tool Claude called, what it sent and what came back.
- **A task board** that updates the moment a tool changes something. You can also tick tasks yourself; the agent and you share one database.

![TaskPal as it first loads: the task board grouped into Overdue, Today, Upcoming, No date and Done, and the yellow banner that says an API key is needed](assets/img/task-pal-board.png)

Things worth trying once it runs:

1. *"Add three tasks: buy milk, call mum, book train tickets."* One message, three `add_task` calls.
2. *"What is due this week?"* Watch it call `get_today` first. It does not know the date.
3. *"Move my overdue tasks to tomorrow."* A multi-step job: list, work out the date, update each.
4. *"Delete the milk task"* then *"delete all my tasks"*. The second one should make it stop and ask. That is a rule in the system prompt (Lesson 4), and you will see that it is a *request*, not a guarantee.

## This project needs a real key

Pocket Chat and its siblings had an offline mode so they ran without an API key. **The four agent projects do not.** There is no pretend model and no scripted replies here: the agent *is* Claude, and the only honest way to learn how an agent behaves is to watch the real thing choose, miss, recover and surprise you.

:::note What it costs
A typical TaskPal request makes two to four model calls, each carrying the conversation and the tool descriptions (a few thousand tokens in, a few hundred out). On `claude-opus-5-5` ($4 in, $20 out per million tokens) that is roughly one to three cents per request. On `claude-sonnet-5-5` ($2 and $10) it is about half that, and it works well for this agent. The interface shows the exact cost under every answer, and `MAX_STEPS` stops a runaway loop from costing more.
:::

1. Make an account at the Anthropic Console (<https://console.anthropic.com/>), add a small amount of credit, and create an API key. Treat it like a password: never commit it, never paste it into a front-end file.
2. Put it in `backend/.env` as `ANTHROPIC_API_KEY=...`. The `.env` file is in `.gitignore`.

## Run it

You need Python 3.10 or newer and Node 22.12 or newer.

```bash title="Terminal 1: the back end"
cd projects/code/task-pal/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then edit it: ANTHROPIC_API_KEY=sk-ant-...
uvicorn app.main:app --reload   # http://localhost:8000/docs
```

```bash title="Terminal 2: the front end"
cd projects/code/task-pal/frontend
npm install
npm run dev                     # http://localhost:5173
```

You can read every file in the [source explorer](#/code/task-pal) or download the whole project as a zip from there.

If you start the server **without** a key, the page still loads and shows a yellow banner, and chatting returns a plain error. It does not invent an answer. Here is the real app, started with no key, being asked a question:

```python local verify cwd="task-pal/backend" title="Chatting with no API key"
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app

settings = Settings(anthropic_api_key=None, database_path=":memory:", frontend_dist="nope", _env_file=None)
with TestClient(create_app(settings)) as client:
    print(client.get("/api/health").json())
    print(client.post("/api/chat", json={"message": "hello"}).text.strip())
```

```output
{'status': 'ok', 'model': 'claude-opus-5-5', 'has_key': False}
event: error
data: {"code": "no_key", "message": "ANTHROPIC_API_KEY is not set. Add it to backend/.env and restart the server.", "retryable": false}
```

## The map of this project

| Lesson | You build | The new idea |
|---|---|---|
| 2 | the task store | the thing the agent acts on is ordinary, testable code |
| 3 | the five tools | a description, an input check, a function |
| 4 | the agent loop | `stop_reason`, messages, the step limit |
| 5 | the chat endpoint | streaming the agent's steps as events |
| 6 | the React interface | a reducer that turns events into a conversation |
| 7 | tests and next steps | testing an agent without calling the model |

:::keypoints
- An agent is a loop: the model picks a tool, **your code** runs it, the result goes back, repeat until the model answers.
- The model only ever *asks*. Your code decides whether and how to act. That boundary is where safety lives.
- A chatbot says it did something; an agent does it (and can therefore do it wrongly).
- This project uses the real Claude through the official SDK, with no offline or fake model. Without a key, the app says so plainly.
:::

```quiz
? In an agent, who actually runs the `add_task` function?
- Claude, on Anthropic's servers
+ Your own code, after Claude asks for it
- The browser
> Claude only writes a request ("call add_task with these inputs"). Your code performs it, or refuses.
? Why does TaskPal call a `get_today` tool instead of letting the model assume the date?
- The model is too slow to tell the time
+ A model does not know today's date; without a tool it would guess
- Dates are secret
> Models learn from text up to a cutoff. For anything about "now", give them a tool.
? What should the app do when no API key is set?
- Use a made-up answer so the page is not empty
+ Say clearly that the key is missing and not pretend
- Crash on start
> An honest error teaches more, and misleads no one, than a pretend answer.
```

:::exercise Agent or not?
For each task say whether it needs an agent or a single model call, and why: (a) turn a pasted email into a title and a summary; (b) "book the cheapest train tomorrow morning"; (c) classify 500 support tickets by topic; (d) "find out why last night's report is empty and fix it". What is the question you asked yourself each time?
:::
