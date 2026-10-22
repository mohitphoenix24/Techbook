---
title: What the ten projects share
level: intermediate
time: 40
summary: Behind ten different products there are about a dozen ideas, used again and again. A map from each idea to the project where it first appeared, the file to read, and what changed when it came back in a new setting, including the four small agents that each isolate one of them. Once you can see the patterns, an eleventh project is mostly assembly.
tags: patterns, review, architecture, reuse, summary
---

Ten products: a streaming chat, a document reader, a Q&A over documents, a data analyst, a support copilot, a code explorer, a to-do assistant, a weather advisor, a notes keeper and a research assistant. They look unrelated. Strip away the screens and the same ideas keep appearing, each time in a new disguise. The most useful thing you can take from the course is the ability to see those ideas, because a new project is then mostly a matter of choosing which to combine.

## The map

| Idea | First built in | Read this file | How it changed when it came back |
|---|---|---|---|
| **A provider interface, with an offline stand-in** | 1 Pocket Chat | `pocket-chat/backend/app/llm/base.py`, `mock_client.py` | each project adds the method it needs: JSON (2, 5), a tool turn (4), streaming text (5, 6). **Projects 7 to 10 drop it on purpose**: they call the real SDK from a short loop, because the model's choices are what they teach |
| **Streaming with Server-Sent Events** | 1 | `pocket-chat/backend/app/sse.py`, `frontend/src/sse.ts` | the events grew richer: words (1), steps (4), stages (5), evidence then words then verdicts (6) |
| **A reducer that folds events into state** | 1 | `pocket-chat/frontend/src/chatReducer.ts` | `askReducer` (3), `agentReducer` (4), `pipelineReducer` (5), `chatReducer` (6): same shape, new events |
| **Structured output, validated, repaired once** | 2 Smart Extractor | `smart-extractor/backend/app/extract.py` | triage in SupportPilot adds a *fail-safe fallback towards a human* |
| **Grounding: check the model's evidence in code** | 2 | `smart-extractor/backend/app/grounding.py` | order numbers must appear in the ticket (5); citations must point at shown code (6) |
| **Retrieval: keywords, vectors, fusion, a gate** | 3 AskDocs | `ask-docs/backend/app/rag/` (`bm25.py`, `fusion.py`, `gate.py`) | a small keyword search for a closed help centre (5); identifier-aware, field-weighted search for code (6) |
| **Citations the user can check** | 3 | `ask-docs/frontend/src/citations.ts` | `[kb:article]` (5); `[path:start-end]` with a verdict on each (6) |
| **A tool-use loop with a step limit** | 4 DataPilot (stripped to its core in 7 TaskPal) | `task-pal/backend/app/agent.py`, `tools.py` | parallel calls (8), a loop that only *proposes* (9), a loop that resumes paused server-tool turns (10). Not reused in SupportPilot and RepoChat: those are *pipelines*, because their steps are known in advance |
| **Tool design: description, validated input, an error the model can act on** | 7 TaskPal | `task-pal/backend/app/tools.py` | handles instead of values (8, 9), a last-resort `except` so a tool never raises (8, 9, 10), a server tool you only declare (10) |
| **Making dangerous input safe** | 4 | `data-pilot/backend/app/sqlguard.py` | layered defences for SQL (4); redaction and review (5); ZIP, secrets and regex limits (6); a path sandbox (9); a calculator that reads with `ast` instead of `eval` (10); `safeHref` for links (10) |
| **Least privilege and a human in the loop** | 9 NoteKeeper | `note-keeper/backend/app/proposals.py` | the agent has no tool that writes; a proposal is data, applied only by a click, and refused when stale. Roles and approval for a real team are in 5 |
| **Calling a service you do not control** | 8 WeatherWise | `weather-wise/backend/app/weather.py` | pure parsers on saved real responses, one function that owns every failure, live tests that skip on a hiccup. Citations of web pages (10) |
| **Guardrails on what the model writes** | 5 SupportPilot | `support-pilot/backend/app/checks.py`, `redact.py` | citations checked against what was shown (6) |
| **A gateway: limits, budget, cache, retries, fallback** | 5 (a simple limiter in 1) | `support-pilot/backend/app/gateway.py` | the missing piece of every earlier project before it is shared |
| **Traces** | 5 | `support-pilot/backend/app/tracing.py` | the evidence panel in 6 is the same idea, shown to the user |
| **Roles and an approval state machine** | 5 | `support-pilot/backend/app/workflow.py`, `auth.py` | the pattern for any action with consequences |
| **An evaluation with a number and a threshold** | every project | `*/backend/evals/` | field accuracy (2), retrieval hit rate (3, 6), execution accuracy (4), policy and guardrails (5) |

Two patterns do not appear as files, but they run through everything.

**Deterministic code around a small model call.** In every project the model does one thing that needs language (write a reply, extract fields, answer from excerpts, plan a query) and ordinary code does everything else: validate, decide, limit, check, route. SupportPilot is the extreme case, with two model calls in eight stages. When a design feels fragile, ask whether a step that needs *no* language has crept into a prompt.

**Honest limits.** Every offline model in the course is labelled as what it is (a template, a set of rules, a summariser). Every evaluation reports what it misses. Every lesson says what a check *cannot* prove. A system that knows and shows its limits is easier to trust, to improve, and to hand to someone else.

## The same problem in ten places

Take one recurring question, *"how do we know the model's answer is not made up?"*, and see how each project answered it:

| Project | The answer |
|---|---|
| Pocket Chat | it does not: a chat is allowed to be wrong, and shows its cost and a Stop button |
| Smart Extractor | every field must come with the **quote** it was read from, and the quote is searched for in the document |
| AskDocs | every claim cites a passage; citations to passages that were not retrieved are flagged; a gate refuses when nothing matches |
| DataPilot | the numbers come from a **query result**, the model may only describe them, and the SQL is shown |
| SupportPilot | the model never decides money; every draft is checked against the decision and the facts; a person approves |
| RepoChat | every claim cites `file:lines`; a check says whether the model was actually shown those lines |
| TaskPal | the task board is drawn from the database, not from the model's words, and the step list shows every tool call |
| WeatherWise | forecast cards are drawn from the fetched data; the model must name the place it chose; it may not invent numbers when the service fails |
| NoteKeeper | answers name the note they came from, the steps are visible, and the agent *cannot* claim a change that a person has not approved |
| ResearchBuddy | every fact carries a numbered citation with the quoted passage and the domain; arithmetic goes through a calculator |

The answers get stricter as the stakes rise, and they share one move: **make the model show its evidence, then check the evidence with code that does not trust the model.**

## Reading order, if you build something new

1. **Write the evaluation first**, even ten labelled examples. Everything else is decided by it.
2. **Start with the offline model**, behind an interface, so the system can be built and tested for free.
3. **Draw the pipeline**: which steps need language, which are rules? Put rules in code.
4. **Decide what the model may never decide**, and where a person is in the loop.
5. **Make the evidence visible**: citations, steps, traces, scores.
6. **Limit everything**: input size, steps, tokens, rows, files, time, money, retries.
7. **Then** polish the prompt, and measure whether it helped.

Notice how late the prompt comes. Beginners start there. Almost all of the engineering above it is what makes the prompt *safe* to rely on.

:::keypoints
- Ten products share a dozen ideas: a provider interface with an offline stand-in (until you want the real model's behaviour), SSE, reducers, validated structured output, grounding, retrieval and citations, a tool loop, tool design, safe handling of dangerous input, least privilege, guardrails, a gateway, traces, roles and state machines, and evaluations.
- Each idea changes shape when it returns to a new setting; recognise it by its job, not its code.
- Use a model for the step that needs language and ordinary code for everything else.
- "How do we know the answer is not made up?" has one answer in ten forms: make the model show evidence, and check the evidence with code that does not trust the model.
- Build in this order: evaluation, offline model, pipeline, what the model may not decide, visible evidence, limits, and last the prompt.
:::

```quiz
? Which two projects are *pipelines* rather than agents, and why?
- AskDocs and Pocket Chat
+ SupportPilot and RepoChat: their steps are known in advance, so code runs them in order and the model is used only where language is needed
- DataPilot and SupportPilot
> An agent chooses its own next step. When you already know the steps, a pipeline is simpler, cheaper and easier to test.
? What do the ten answers to "is it made up?" have in common?
- They all use the same model
+ The model must show evidence, and code that does not trust the model checks it
- They all refuse to answer
> Make the evidence visible, then verify it independently.
? Why is the prompt the *last* thing to polish?
- Prompts do not matter
+ The surrounding engineering (evaluation, limits, checks, a human) is what makes the prompt safe to rely on, and the evaluation tells you whether a prompt change helped
- Models ignore prompts
> Start with what can be tested and bounded.
```

:::exercise Trace one idea through all ten
Pick **one** idea from the map (for example "a reducer that folds events into state", or "an evaluation with a threshold"). Open the file in each project where it appears and write, in three lines per project, what is the same and what had to change for that project's events or metrics. What would you have to change to reuse it in an *eleventh* project that you invent?
:::
