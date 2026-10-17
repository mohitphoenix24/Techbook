---
title: From chat to agent: tools and the loop
level: intermediate
time: 35
summary: What makes something an agent, when you should (and should not) build one, the tool-use loop in one picture, and the architecture and event stream of DataPilot.
tags: agents, tool use, workflows, architecture
---

So far the model has only produced *text*: a reply (Project 1), a JSON form (Project 2), an answer from passages we handed it (Project 3). In every case **our code decided what happened** and the model filled in words.

An **agent** flips one part of that: the model decides **what to do next**. We give it tools (functions it may ask us to run), and it chooses which, in what order, with what arguments, and when it has enough to answer.

:::def Agent
A program in which a language model, in a loop, chooses actions (tool calls), sees their results, and continues until it decides the task is done. The model plans; your code acts.
:::

:::analogy The new analyst
Ask a new analyst "which customers matter most?" They do not answer from memory. They open the database, look at the tables, try a query, notice it failed, fix it, look at the numbers, perhaps draw a chart, and *then* answer. They chose each step based on what the last one showed. That adaptiveness is what an agent adds.
:::

## When to use one, and when not

Agents are powerful and expensive: more calls, more latency, more ways to go wrong. Reach for the simplest design that works:

| Design | The path is... | Use it when | Example |
|---|---|---|---|
| **One model call** | one step | the task fits one prompt | classify an email |
| **Workflow** | fixed by *your code* | the steps are known in advance | Project 3: rewrite, retrieve, answer |
| **Agent** | chosen by *the model* | the steps depend on what is found along the way | "why did revenue dip in March?" |

DataPilot genuinely needs an agent: for a question like "revenue by month" the model must discover the table layout, write SQL, and react if the query fails. A workflow with a fixed sequence of steps could not handle the many different questions people ask of a database.

:::tip Four questions before you build an agent
Is the task **complex** (many possible paths)? Does the result **justify the cost** (several model calls per task)? Can the model do it (try it by hand)? And can mistakes be **caught and undone** (a read-only database, yes; "send emails to customers", not without approval)? If any answer is no, use a workflow.
:::

## The tool-use loop

Tool use is a conversation with a strict shape. You describe your tools to the model. When it wants one, it **stops** and says which, with arguments. You run it. You hand back the result. It continues.

```viz algo=seq title="One question, a few turns of the loop"
participant ui Browser [browser]
participant srv Your server [service]
participant llm Claude [llm]
participant db Database [db]
ui -> srv : "Top 5 customers by revenue?"
srv -> llm : question + tool definitions
llm --> srv : stop_reason = tool_use | describe_table(orders), describe_table(order_items)
srv -> db : read the schema
db --> srv : columns and sample rows
srv -> llm : history + tool_results (both in ONE message)
llm --> srv : stop_reason = tool_use | run_sql("SELECT ... GROUP BY ... ORDER BY ...")
srv -> db : the query (read-only, with limits)
db --> srv : 5 rows
srv -> llm : history + tool_result (the rows)
llm --> srv : stop_reason = end_turn | "Your top customer is ..."
srv --> ui : the steps and the answer, streamed
```

The loop is only a handful of lines, and everything interesting about agents is in what surrounds it:

| Part | The question it answers | Lesson |
|---|---|---|
| **The data and its rules** | what can the agent see, and what do business words mean? | 2 |
| **Safe execution** | what if the model writes `DROP TABLE`? | 3 |
| **Tool design** | what should a tool return, and how should it fail? | 4 |
| **The loop itself** | messages, stop reasons, step limits, cost | 5 |
| **The model client** | streaming tool calls; an offline stand-in | 6 |
| **Streaming the steps** | how does the browser follow along? | 7 |
| **The interface** | tables, charts, a timeline of steps | 8 |
| **Evaluation** | how do we know it gets the right answer? | 9 |
| **Safety and next steps** | what could go wrong, what to build next | 10 |

## The architecture

```viz algo=arch title="DataPilot" dir=right
ui    React UI | steps, table, chart [browser] @0,0
api   FastAPI | POST /api/ask (SSE) [service] @1,0
agent Agent loop | decide, run tool, repeat [agent] @2,0
llm   Claude | or the offline planner [llm] @3,0
tools Tools | describe, run_sql, chart [tool] @2,1.6
guard SQL guard | read-only, limits [guard] @3,1.6
db    SQLite shop | customers, orders... [db] @4,1.6
--
ui -> api : question
api ~> ui : turn, delta, tool_call, tool_result, usage, done
api -> agent
agent -> llm : messages + tools
llm ~> agent : text + tool calls
agent -> tools : run what the model asked
tools -> guard : any SQL
guard -> db : read-only
```

![DataPilot after a question: the steps it took, the answer, a chart and a table](assets/img/data-pilot-answer.png)

## The event stream

One question produces a stream of events. They describe the *process*, not only the result, because watching an agent work is how people learn to trust (or correct) it.

| Event | Meaning |
|---|---|
| `turn` | the model is being called again (turn 0, 1, 2…) |
| `delta` | a few words of text from the model, tagged with its turn |
| `tool_call` | the model asked for a tool: name and arguments |
| `tool_result` | the tool finished: success or error, a one-line summary, and data for the interface (a table, a chart) |
| `usage` | total tokens and cost across **all** turns |
| `done` | the final answer, and the SQL used |
| `error` | something stopped the run (a provider error, or the step limit) |

Text appears in two roles. Words from a turn that **also calls tools** are the model "thinking aloud" ("Let me look at the tables first"); words from the **final** turn are the answer. The interface tells them apart by the turn number.

## Setup

```bash
mkdir data-pilot && cd data-pilot
mkdir -p backend/app/{llm,routes} backend/tests backend/evals
cd backend && python -m venv .venv && source .venv/bin/activate
```

```text src="data-pilot/backend/requirements.txt" title="backend/requirements.txt"
```

No new packages beyond the earlier projects: the database is SQLite from Python's standard library. The settings add three limits that every agent needs:

```python src="data-pilot/backend/app/config.py" region="settings" title="backend/app/config.py"
```

`max_steps` bounds how many times one question may call the model. `query_timeout_seconds` and `max_rows` bound what one tool call may cost. **An agent without limits is a loop without a brake.**

:::keypoints
- An agent lets the model choose the next action; your code runs the actions and shows the model the results.
- Prefer a single call, then a workflow; use an agent when the path depends on what is discovered, the value justifies the cost, and mistakes can be caught.
- The loop: send messages and tool definitions, the model answers with `tool_use` or finishes with `end_turn`, you run the tools and return **all** results in one message.
- Everything around the loop matters more than the loop: data and rules, safe execution, tool design, limits, streaming, evals.
- Stream the process (calls and results) as well as the answer; watching builds trust.
- Always set limits: steps, time, rows.
:::

```quiz
? Who runs a tool when Claude decides to call one?
- Claude runs it on Anthropic's servers
+ Your code runs it, then sends the result back to the model
- The browser runs it
> Client-side tools are only *requested* by the model. You decide whether and how to run them, which is where safety lives.
? Which is a better fit for a workflow rather than an agent?
- "Why did revenue fall in March?" (open-ended investigation)
+ "Summarise each support email and file it under one of five categories" (fixed steps)
- "Explore this database and tell me anything unusual"
> If you know the steps in advance, write them in code. Agents are for paths that depend on what is found.
? What stops an agent from looping forever?
- The model decides to stop
+ A hard limit on the number of model turns, enforced by your code
- Nothing needs to
> Models can keep calling tools. A step limit (and cost limits) are part of the design, not an afterthought.
```

:::exercise Agent or workflow?
For each task, choose one call, workflow or agent, and say why: (1) turn a meeting transcript into action items; (2) answer "how many of our customers in Bengaluru bought something last month?" from a database; (3) read a bug report, find the relevant code, and propose a fix; (4) translate a menu into Hindi. Then pick one and list the tools its agent would need, and the worst thing each tool could do if the model misused it.
:::
