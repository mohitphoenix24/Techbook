---
title: Agent State, Checkpoints and Durable Execution
level: advanced
time: 45
summary: Agents that run for minutes or hours must survive crashes, deploys and human delays. Model the agent as an explicit state machine or graph, checkpoint after every step, resume exactly where you stopped, pause for human approval, make side effects idempotent, and know when to use a durable-execution engine. With a runnable checkpoint-and-resume agent that survives a simulated crash.
---

A demo agent lives in one Python process. A production agent runs for a long time, calls flaky tools, waits for humans, and gets interrupted by deploys and crashes. If all its progress lives in memory, **every interruption means starting over** (and possibly repeating side effects like sending an email twice). The cure is to treat the agent's progress as **data you can save and restore**.

## Agent state = the thing you can serialise

Earlier we saw that a simple agent is just its **message list plus tools**. Real agents add more:

| State | Examples |
|---|---|
| **Conversation / messages** | the full transcript including tool calls and results |
| **Plan and progress** | task list, current step, completed steps |
| **Working data** | files created, intermediate results, notes |
| **Control** | step counter, budgets used (tokens, cost, time), retry counts |
| **Pending actions** | tool calls waiting for human approval; the question asked of the user |
| **Identity and permissions** | who this run acts for, which scopes |

If you can **serialise** all of that (to JSON, a database row, or object storage), you can **pause, resume, fork, replay and audit** a run.

## Explicit state machines and graphs

Rather than an anonymous `while` loop, model the run as a **graph of nodes** (steps) and **edges** (transitions) over a **state object**. Frameworks such as **LangGraph** do exactly this; you can also build it yourself.

```viz algo=arch title="An agent as a graph over shared state" dir=down
start  Start [user] @0,1
plan   Plan | write a task list [prompt] @1,1
act    Act | call tools [tool] @2,1
check  Check | verify result [eval] @3,1
human  Human approval | pause for a decision [user] @3,2.2
done   Done [guard] @4,1
--
start -> plan
plan -> act
act -> check
check -> act : more steps
check -> human : risky action
human -> act : approved
check -> done : goal met
```

Advantages: each node is **testable alone**, transitions are **explicit and visible**, the run is **resumable at a node boundary**, and **human steps** are first-class states rather than hacks.

## Checkpointing

:::def Checkpoint
A saved snapshot of the agent's complete state at a step boundary, written to durable storage. After a crash, deploy or pause, the run **resumes from the latest checkpoint** instead of restarting.
:::

Rules for good checkpoints:

1. **Save after each step** (or each tool result), before doing the next thing.
2. Keep the state **serialisable and versioned** (include a schema version so old checkpoints can be migrated).
3. **Atomic writes** (write to a temp, then rename; or a database transaction) so a crash during saving cannot corrupt state.
4. Store a **run id** and a **monotonic step number**; keep a short history for debugging and "time travel" (rewind to step N and fork).
5. Keep **large artefacts** (files, documents) in object storage and store **references** in the state.

```python run title="An agent that survives a crash: checkpoint after every step, then resume" level=advanced
import json, copy

STORE = {}                                   # a stand-in for a database: run_id -> list of checkpoints

def save(run_id, state):
    STORE.setdefault(run_id, []).append(json.dumps(state))        # append-only history, one JSON per step

def load_latest(run_id):
    return json.loads(STORE[run_id][-1]) if STORE.get(run_id) else None

SIDE_EFFECTS = []                              # what the outside world actually saw

def send_email(to, key):
    if key in {e[1] for e in SIDE_EFFECTS}:    # idempotency: the same key must never send twice
        return "skipped duplicate"
    SIDE_EFFECTS.append((to, key))
    return "sent"

PLAN = ["lookup order", "draft reply", "send email", "close ticket"]

def step(state):
    name = PLAN[state["i"]]
    if name == "lookup order":  state["data"]["order"] = {"id": "A-100", "status": "delivered"}
    if name == "draft reply":   state["data"]["draft"] = "Your order A-100 was delivered."
    if name == "send email":    state["data"]["email"] = send_email("c@x.com", key=f"{state['run_id']}:send_email")
    if name == "close ticket":  state["data"]["closed"] = True
    state["i"] += 1
    return name

def run(run_id, crash_after=None):
    state = load_latest(run_id) or {"run_id": run_id, "i": 0, "data": {}, "version": 1}   # resume if a checkpoint exists
    while state["i"] < len(PLAN):
        name = step(state)
        save(run_id, state)                                      # checkpoint AFTER the step
        print(f"  step {state['i']}/{len(PLAN)}: {name}")
        if crash_after == name:
            raise RuntimeError("process crashed!")
    return state

print("first attempt:")
try:
    run("run-42", crash_after="send email")
except RuntimeError as e:
    print("  ", e)

print("after restart (resumes from the checkpoint):")
final = run("run-42")
print("final data:", final["data"])
print("emails actually sent:", len(SIDE_EFFECTS))
```

Look at the subtle part: the crash happened **right after** sending the email but arguably **before** the checkpoint in a real system. With the idempotency key, even if the step were re-run, the second send would be skipped. **Checkpoints alone are not enough; side effects need idempotency.**

## Side effects, idempotency and the outbox

The dangerous window is between *doing* an action and *recording* that it was done. Strategies:

- **Idempotency keys**: derive a stable key per logical action (`run_id:step:action`) and have the target system (or your tool layer) ignore duplicates.
- **Record intent first**: write "about to send email X (key K)" to the state, perform it, record the result. On resume, if intent exists without a result, **check the outside world** (was it sent?) before repeating.
- **Transactional outbox**: write the intended action to a table in the same transaction as the state update; a separate worker performs and acknowledges it.
- **Compensating actions** (undo) for steps that cannot be idempotent (cancel the booking), as in the saga pattern.

## Human-in-the-loop: pause and resume

Human approval is just a **durable pause**: the agent writes its state with `status = waiting_for_approval` and the pending action, then **stops running** (no compute is consumed while waiting for hours). When the human approves or edits, a new process **loads the checkpoint and continues**.

```python run title="Pause for approval, resume later" level=intermediate
import json

def agent_step(state, human_decision=None):
    if state["status"] == "running":
        state["pending"] = {"tool": "issue_refund", "args": {"order": "A-100", "amount": 129.0}}
        state["status"] = "waiting_for_approval"                     # stop here: nothing runs while we wait
        return state
    if state["status"] == "waiting_for_approval":
        if human_decision is None:
            return state                                             # still waiting
        if human_decision["approve"]:
            args = {**state["pending"]["args"], **human_decision.get("edits", {})}   # the human may edit arguments
            state["result"] = f"refund {args['amount']} issued for {args['order']}"
        else:
            state["result"] = "declined by supervisor"
        state["status"], state["pending"] = "done", None
    return state

state = {"status": "running", "pending": None, "result": None}
state = agent_step(state)
saved = json.dumps(state)                                             # persisted; the process can exit here
print("paused:", saved)

state = json.loads(saved)                                             # hours later, possibly another machine
state = agent_step(state, human_decision={"approve": True, "edits": {"amount": 100.0}})
print("resumed:", state)
```

Show the human **exactly what will happen** (tool, arguments, why), let them **approve, edit or reject**, and record who decided and when (audit).

## Durable execution engines

If your agents are long-running business processes, you may not want to hand-roll checkpointing. **Durable execution** platforms (Temporal, Restate, Inngest, AWS Step Functions, Azure Durable Functions, Cloudflare Workflows, and frameworks such as LangGraph with persistence) record every step's result and **replay deterministic workflow code** after failures, giving you retries, timers, sleeping for days, and exactly-once-style semantics. The LLM and tool calls become **activities** whose results are recorded, so a replay does not call the model again.

| Need | Hand-rolled checkpoints | Durable execution engine |
|---|---|---|
| Short runs, few failures | ✅ enough | overkill |
| Runs of hours/days, human waits, timers | harder | ✅ built in |
| Strong retry/timeout semantics per step | you build it | ✅ |
| Operational visibility (UI, history) | you build it | ✅ |
| Simplicity, fewer dependencies | ✅ | ❌ |

## Long-running agents across context windows

When a task outlives a single context window (a multi-hour coding job), state must live **outside** the window: a **progress file**, a **task list**, test results, git commits. Each new window starts by reading that state and ends by updating it. This is the same checkpoint idea applied to the model's own working memory.

## Observability of state

Persisted state doubles as an **audit log and debugging tool**: you can inspect any run at any step, **replay** it against a new prompt or model, **fork** from step N to try an alternative, and build **evals from real runs**. Include trace ids that link checkpoints to logs and traces.

## Checklist

1. Define the **state schema** (and version it).
2. Checkpoint **after every step**, atomically.
3. Make every side-effecting tool **idempotent** (keys) or compensatable.
4. Design **human pauses** as durable states.
5. Put budgets and counters **in the state** so resumed runs respect limits.
6. Test **crash recovery**: kill the process at every step in a test and verify the final result and side effects are correct.
7. Choose **hand-rolled vs durable engine** by run length and failure tolerance.

```quiz
? What is the purpose of a checkpoint?
- To speed up the model
+ To save the agent's state at a step boundary so it can resume after a crash or pause instead of restarting
- To compress prompts
> Durable state makes agents resumable.

? Why are checkpoints alone not enough for agents with side effects?
- They are too large
+ A crash between performing an action and recording it can cause the action to be repeated; use idempotency keys or intent records
- Side effects cannot be saved
> Make actions idempotent.

? How does human-in-the-loop fit durable agents?
+ As a durable paused state: save, stop running, and resume when the human decides
- By keeping the process alive for days
- By asking the model to wait
> No compute is held while waiting; the checkpoint carries the pending action.

? When is a durable execution engine worth it?
+ Long-running or business-critical agents needing timers, retries, human waits and operational visibility
- For one-shot chatbots
- Never
> Short, simple agents can use plain checkpoints.
```

:::problem Your agent sends a customer email, then the server crashes before it records that. After restart it sends the email again. Fix it. {level=medium tags="idempotency,reliability"}
Give at least three mechanisms.

:::solution Model answer
(1) **Idempotency key** per logical email (`run_id:step`) honoured by your email service/tool layer, so a repeat is ignored. (2) **Record intent before acting** and check the outbox/provider's sent log on resume when intent exists without a result. (3) **Transactional outbox**: write the email request and the state update in one DB transaction; a separate sender delivers it exactly once and marks it sent. (4) Make the send step a **durable activity** in a workflow engine that records completion atomically. (5) Test by crashing at every step.
:::
:::

:::keypoints
- Treat agent progress as serialisable state: messages, plan, working data, budgets, pending actions.
- Model runs as explicit graphs or state machines; checkpoint after every step, atomically and versioned.
- Side effects need idempotency keys, intent records or an outbox; checkpoints alone can still repeat actions.
- Human approval is a durable pause, not a held process.
- Use durable-execution engines for long, critical runs; test recovery by crashing at every step.
:::

:::resources
- [LangGraph: persistence and human-in-the-loop](https://langchain-ai.github.io/langgraph/) — checkpointers, interrupts and time travel.
- [Temporal docs](https://docs.temporal.io) — durable execution concepts (workflows, activities, retries).
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — state across context windows.
- [Chip Huyen: Agents](https://huyenchip.com/2025/01/07/agents.html) — failure modes and recovery.
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) — sessions, handoffs, tracing.
- [AWS Builders' Library: Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) — the idempotency pattern in depth.
:::
