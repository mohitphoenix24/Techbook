---
title: The Agent Loop, Built from Scratch
level: intermediate
time: 55
summary: The core of every agent in about 60 lines. Observe, decide, act, repeat: the message structure, tool dispatch, stop conditions, step/token/time budgets, parallel tool calls, error handling, and how the loop looks with the real Claude API and the SDK's tool runner. Includes a step-through simulator showing context growth and a complete runnable agent with a scripted model.
---

Strip away the frameworks and every agent is the same loop:

:::flow The agent loop
Prompt | system instructions + the task
Model decides | answer, or request one or more tool calls
Act | your code executes the tools
Observe | tool results are appended to the conversation
Repeat | until the model answers, hits a limit, or asks for help
:::

Press **Next step** to walk through a real-looking run. Notice how the context grows with every step, and how many input tokens are billed in total.

```viz algo=agentloop title="Agent loop simulator" scenario=refund
```

## The loop in code

Here is a complete agent. The "model" is scripted (so the example is deterministic and runs in your browser), but the **loop, tool dispatch, budgets and error handling are exactly what you would write for a real model**.

```python run title="A complete agent loop with budgets, tools and error handling" level=intermediate
import json, time

# ---------------- tools: plain functions + JSON-schema-like specs ----------------
ORDERS = {"A-100": {"status": "delivered", "total": 129.0, "days_ago": 7}}
POLICY = "Damaged items: full refund within 30 days of delivery; no return needed under $200."

def get_order(order_id):
    if order_id not in ORDERS: raise KeyError(f"order {order_id} not found")
    return ORDERS[order_id]

def search_policy(query):
    return POLICY

def issue_refund(order_id, amount):
    return {"refund_id": "R-5521", "order_id": order_id, "amount": amount}

TOOLS = {"get_order": get_order, "search_policy": search_policy, "issue_refund": issue_refund}
NEEDS_APPROVAL = {"issue_refund"}                                  # side-effecting tool: gate it

# ---------------- a scripted stand-in for the LLM (same input/output shape as a real API) ----------------
class ScriptedModel:
    def __init__(self):
        self.turn = 0
    def respond(self, messages):
        self.turn += 1
        if self.turn == 1:      # parallel tool calls in one turn
            return {"stop_reason": "tool_use", "content": [
                {"type": "tool_use", "id": "t1", "name": "get_order", "input": {"order_id": "A-100"}},
                {"type": "tool_use", "id": "t2", "name": "search_policy", "input": {"query": "refund damaged"}}]}
        if self.turn == 2:
            return {"stop_reason": "tool_use", "content": [{"type": "tool_use", "id": "t3", "name": "issue_refund", "input": {"order_id": "A-100", "amount": 129.0}}]}
        return {"stop_reason": "end_turn", "content": [{"type": "text", "text": "Refunded $129.00 (R-5521)."}]}

# ---------------- the loop ----------------
def run_agent(task, model, max_steps=8, max_seconds=30, approve=lambda name, args: True):
    messages = [{"role": "user", "content": task}]
    start, log = time.monotonic(), []
    for step in range(1, max_steps + 1):                           # 1) a hard step budget
        if time.monotonic() - start > max_seconds:                 # 2) a wall-clock budget
            return "STOPPED: time budget exceeded", log
        reply = model.respond(messages)
        messages.append({"role": "assistant", "content": reply["content"]})
        if reply["stop_reason"] != "tool_use":                     # the model is done
            return reply["content"][0]["text"], log
        results = []
        for block in (b for b in reply["content"] if b["type"] == "tool_use"):
            name, args = block["name"], block["input"]
            if name in NEEDS_APPROVAL and not approve(name, args):   # 3) human-in-the-loop for risky actions
                out, is_err = "The user declined this action.", True
            else:
                try:
                    out, is_err = json.dumps(TOOLS[name](**args)), False
                except Exception as e:                             # 4) errors become observations, not crashes
                    out, is_err = f"{type(e).__name__}: {e}", True
            log.append((step, name, args, "ERROR" if is_err else "ok"))
            results.append({"type": "tool_result", "tool_use_id": block["id"], "content": out, "is_error": is_err})
        messages.append({"role": "user", "content": results})      # all results of the turn in ONE message
    return "STOPPED: step budget exceeded", log

answer, log = run_agent("Order A-100 arrived broken. Refund me.", ScriptedModel(), approve=lambda n, a: a["amount"] < 200)
print("ANSWER:", answer)
for step, name, args, status in log:
    print(f"  step {step}: {name}({args}) -> {status}")
```

### The five things to notice

1. **A `for` loop with a hard cap.** Never `while True`. Add a wall-clock limit and a token/cost budget too.
2. **The stop condition is the model's `stop_reason`**, not your guess about the text.
3. **Tool errors are observations.** The model can read "order not found" and fix the id, or tell the user.
4. **Approval gates sit in your code**, between the model's request and the real action.
5. **Parallel calls** arrive in one turn; return all results together.

## What the "state" of an agent really is

The loop has no hidden state: the agent **is** the message list plus the tools. That means you can **log it, replay it, resume it** from a saved list, and **edit it** (to clear old results, inject a hint, or fork). It also means *context management is the agent's memory*: what you keep in `messages` is what it remembers.

## Stopping well

| Stop condition | Why | What to return |
|---|---|---|
| Model answers (`end_turn`) | normal completion | the answer |
| **Step limit** | runaway loops | partial progress + "stopped" |
| **Token / cost budget** | runaway spend | partial progress |
| **Time limit** | latency SLO | partial progress |
| **Repeated identical calls** | stuck in a loop | break the loop and ask for help or change strategy |
| **Refusal / safety stop** | policy | explain; do not retry blindly |
| **Needs human input** | ambiguity or approval | pause (checkpoint), resume later |

A well-behaved agent that cannot finish returns **what it learned and what remains**, not silence.

## Detect loops

```python run title="Spot an agent repeating itself" level=easy
from collections import Counter

def is_looping(history, window=6, threshold=3):
    """history: list of (tool_name, json-able args). Looping = the same call repeated several times recently."""
    recent = [(n, str(sorted(a.items()))) for n, a in history[-window:]]
    return any(c >= threshold for c in Counter(recent).values())

hist = [("search", {"q": "refund policy"}), ("read", {"url": "a"}), ("search", {"q": "refund policy"}),
        ("search", {"q": "refund policy"}), ("search", {"q": "refund policy"})]
print("looping:", is_looping(hist))
print("looping:", is_looping(hist[:3]))
```

When you detect a loop, do not just stop: inject a note ("You have called this tool three times with the same arguments. Try a different approach or report what is blocking you.") or escalate.

## The same loop with the real API

```python local title="Manual agent loop with the Anthropic SDK"
import anthropic, json
client = anthropic.Anthropic()

tools = [
    {"name": "get_order", "description": "Look up an order by id. Returns status, total and delivery date.",
     "input_schema": {"type": "object", "properties": {"order_id": {"type": "string"}}, "required": ["order_id"], "additionalProperties": False}},
]

def run(task, max_steps=10):
    messages = [{"role": "user", "content": task}]
    for _ in range(max_steps):
        response = client.messages.create(model="claude-sonnet-5-5", max_tokens=4000, tools=tools, messages=messages)
        messages.append({"role": "assistant", "content": response.content})          # keep tool_use blocks intact
        if response.stop_reason != "tool_use":
            return next((b.text for b in response.content if b.type == "text"), "")
        results = []
        for block in response.content:
            if block.type == "tool_use":
                try:
                    out = json.dumps(TOOLS[block.name](**block.input)); err = False
                except Exception as e:
                    out, err = str(e), True
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": out, "is_error": err})
        messages.append({"role": "user", "content": results})
    return "step budget exceeded"
```

Or let the SDK run the loop with the **tool runner**, keeping your tools as typed functions:

```python local title="The SDK tool runner"
from anthropic import beta_tool

@beta_tool
def get_order(order_id: str) -> str:
    """Look up an order by id.

    Args:
        order_id: The order id, for example 'A-100'.
    """
    return json.dumps(ORDERS[order_id])

runner = client.beta.messages.tool_runner(
    model="claude-sonnet-5-5", max_tokens=4000, tools=[get_order],
    messages=[{"role": "user", "content": "Where is order A-100?"}],
)
for message in runner:               # one iteration per model response; the runner executes the tools
    print(message.stop_reason)
```

Even without a framework you still decide: the **system prompt** (role, rules, when to stop, when to ask), the **tools**, the **limits**, and the **approval policy**.

## Writing the system prompt for an agent

A good agent prompt covers:

- **Goal and role**: who it is helping and what "done" means.
- **Process guidance**: investigate before acting; check results; prefer small reversible steps.
- **Tool policy**: which tool for which situation, which require approval.
- **Boundaries**: what it must never do; what to do when unsure (**ask**, do not guess).
- **Output**: what the final message should contain (summary, what was changed, what remains).
- **Persistence**: keep going until the task is done or truly blocked, rather than stopping early to ask permission for routine steps.

```quiz
? Why must an agent loop have a maximum number of steps?
- To save disk space
+ To prevent runaway loops that burn money and time if the model never finishes
- Models require it
> Always bound loops by steps, time and cost.

? How should a tool error be handled?
- Crash the agent
+ Return it to the model as a tool_result with is_error so it can recover or explain
- Ignore it
> Errors are observations the model can act on.

? Where should human approval for risky actions be enforced?
- In the system prompt only
+ In your code, between the model's tool request and the actual execution
- Inside the model
> Prompts can be bypassed; code-level gates cannot.

? What is the "state" of a simple agent?
+ The message history plus the tools: log it, replay it, resume it
- A hidden variable in the model
- The temperature
> There is no hidden state: context management is the agent's memory.
```

:::problem Your agent sometimes keeps calling the same search tool with slightly different queries for 40 steps. List fixes. {level=medium tags="agents,loops"}
Cover prompt, loop and tool-level changes.

:::solution Model answer
**Loop:** step and cost budgets; detect repeated or near-duplicate calls (normalised arguments, similarity) and inject a nudge or stop; require progress (a new fact recorded) every N steps. **Prompt:** tell it when to stop searching ("if two searches don't help, report what you found and what's missing"); give it a notes tool to record findings so it doesn't re-search. **Tools:** return deduplicated, ranked, concise results with "no further results" signals; make "not found" explicit; paginate. **Evals:** add a stuck-in-loop test case and track steps per task.
:::
:::

:::keypoints
- The agent loop: send messages → model returns an answer or tool calls → execute → append results → repeat; the model's stop reason ends it.
- The agent's state is the message list; log, replay, resume and edit it.
- Always bound steps, time and spend; detect loops; return errors as observations; gate risky actions in code.
- Return all tool results of a turn together and keep the assistant's tool-use blocks intact.
- The SDK tool runner removes the boilerplate; you still own the prompt, tools, limits and approvals.
:::

:::resources
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — the augmented LLM and the agent loop.
- [Claude docs: Tool use overview](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview) — the protocol the loop implements.
- [Claude docs: Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) — packaging instructions agents load on demand.
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) — a lightweight loop with handoffs, guardrails and tracing.
- [ReAct: Synergizing Reasoning and Acting](https://arxiv.org/abs/2210.03629) — the paper behind the think-act-observe loop.
- [Hugging Face smolagents](https://huggingface.co/docs/smolagents) — a minimal agent library worth reading.
:::
