---
title: AI Agents & Workflows
level: advanced
time: 50
summary: From single calls to systems that plan and act. Learn the workflow patterns (chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer), build a complete agent loop with tools, memory, budgets and human approval, and know when NOT to build an agent.
---

An **agent** is an LLM running in a loop, using tools to work toward a goal, deciding its own next step based on what it observes. Agents can research, write and run code, operate software and complete multi-step tasks. They are also slower, costlier and less predictable than simple calls — so knowing **when** to use one matters as much as knowing how.

:::def AI agent
A system where an LLM **dynamically directs its own process**: it decides which tools to use and in what order, observes the results, and continues until the task is done (or a limit is hit).
:::

:::def Workflow
A system where LLM calls and tools are orchestrated through **predefined code paths** that you write. More predictable and cheaper than an agent; the right choice whenever the steps are known in advance.
:::

:::analogy
A **workflow** is a recipe: "chop, then fry, then plate" — every time. An **agent** is a chef given a goal ("make dinner from what's in the fridge") who looks around, decides what to do, tastes, and adjusts. You want a chef for open-ended problems — and a recipe whenever one exists.
:::

## Should you build an agent?

Start with the **simplest** thing that works: a single well-prompted call (often with retrieval and tools) → a workflow → an agent. Only reach for an agent when **all** of these are true:

| Question | Agent only if… |
|---|---|
| **Complexity** | the task is multi-step and hard to specify in advance |
| **Value** | the outcome justifies higher cost and latency |
| **Viability** | the model is actually good at this kind of task |
| **Cost of errors** | mistakes can be caught and recovered (tests, review, undo) |

## Workflow patterns

These five patterns (described in Anthropic's *Building effective agents*) cover most real systems. Each runs here with a stand-in model so you can see the control flow.

### 1. Prompt chaining

A fixed sequence of steps, with optional checks ("gates") between them. You met it in the Prompt Engineering lesson: *outline → check outline → write → polish*.

### 2. Routing

Classify the input first, then send it to a specialised prompt, tool or model.

```python run level=intermediate
def classify(query: str) -> str:
    """Stand-in for a cheap LLM call that returns one label."""
    q = query.lower()
    if any(w in q for w in ["refund", "charge", "invoice", "price"]):
        return "billing"
    if any(w in q for w in ["error", "crash", "bug", "broken"]):
        return "technical"
    return "general"

HANDLERS = {
    "billing": lambda q: f"[billing specialist prompt, small fast model] handling: {q}",
    "technical": lambda q: f"[debugging prompt + docs search tool, strong model] handling: {q}",
    "general": lambda q: f"[general assistant prompt] handling: {q}",
}

for q in ["I was charged twice", "The app crashes on start", "Do you have a mobile app?"]:
    route = classify(q)
    print(f"{route:<10} → {HANDLERS[route](q)}")
```

:::tip Routing saves money
Routing lets you send easy queries to a **small, fast model** and only hard ones to a frontier model — often the single biggest cost optimization in production.
:::

### 3. Parallelization

Run independent LLM calls at the same time — either **sectioning** (split a task into parts) or **voting** (run the same task several times and combine).

```python run level=intermediate
import asyncio
import random

random.seed(7)

async def judge_safety(text: str, judge_id: int) -> bool:
    await asyncio.sleep(random.uniform(0.1, 0.3))       # an LLM call
    return random.random() < 0.8                         # each judge says "safe" 80% of the time

async def main():
    text = "Here is how to reset your router safely..."
    votes = await asyncio.gather(*(judge_safety(text, i) for i in range(5)))
    print("votes:", votes)
    print("decision:", "SAFE" if sum(votes) >= 3 else "NEEDS REVIEW", f"({sum(votes)}/5)")

asyncio.run(main())
```

### 4. Orchestrator-workers

A central LLM breaks the task into subtasks **at runtime**, hands them to worker calls, and combines the results. Unlike parallelization, the subtasks aren't known in advance.

```python run level=advanced
import asyncio

def orchestrator_plan(task: str) -> list[str]:
    """Stand-in for an LLM that decides the subtasks for THIS task."""
    return [f"Research: {topic}" for topic in ["pricing", "features", "reviews"]] + ["Draft comparison table"]

async def worker(subtask: str) -> str:
    await asyncio.sleep(0.2)                              # a worker LLM call (maybe a cheaper model)
    return f"<result for '{subtask}'>"

async def run(task: str) -> str:
    plan = orchestrator_plan(task)
    print("plan:", plan)
    research = await asyncio.gather(*(worker(s) for s in plan if s.startswith("Research")))
    draft = await worker("Draft comparison table using: " + "; ".join(research))
    return f"Synthesis of {len(research)} research results → {draft}"

print(asyncio.run(run("Compare the top 3 vector databases for a startup")))
```

### 5. Evaluator-optimizer

One call generates, another evaluates against criteria and gives feedback, and the loop repeats until the evaluation passes.

```python run level=intermediate
def generate(task, feedback=None):
    """Stand-in generator: improves when given feedback."""
    drafts = {None: "Our product is good.",
              "too vague": "Our product cuts report time by 60% for finance teams.",
              "missing call to action": "Our product cuts report time by 60% for finance teams. Start your free trial today."}
    return drafts[feedback]

def evaluate(text):
    """Stand-in evaluator with explicit criteria."""
    if not any(ch.isdigit() for ch in text):
        return False, "too vague"
    if "trial" not in text.lower():
        return False, "missing call to action"
    return True, "meets all criteria"

feedback = None
for round_ in range(1, 5):
    draft = generate("one-line product pitch", feedback)
    ok, feedback = evaluate(draft)
    print(f"round {round_}: {draft!r} → {'PASS' if ok else 'revise: ' + feedback}")
    if ok:
        break
```

## Building an agent

The core is a loop: **send messages + tools → if the model asks for tools, run them and append results → repeat until it answers or a limit is reached**.

:::flow The agent loop
Goal | user request + system prompt
Think & choose | model picks a tool (or answers)
Act | your code runs the tool
Observe | result appended to the conversation
Repeat or finish | until done, or budget/step limit
:::

Here is a complete, production-shaped agent harness. The "model" is a scripted policy so it runs in the browser, but every other part — tool registry, schemas, the loop, step and budget limits, error handling, human approval for risky actions, and a trace — is what you'd write around the real API.

```python run level=advanced
import json
from dataclasses import dataclass, field
from types import SimpleNamespace as NS

# ----------------------------- tools -----------------------------
ORDERS = {"A-1001": {"item": "headphones", "status": "delivered", "price": 59.0},
          "A-1002": {"item": "keyboard", "status": "in transit", "price": 89.0}}

def lookup_order(order_id: str) -> dict:
    """Look up an order by id."""
    if order_id not in ORDERS:
        raise KeyError(f"order {order_id} not found")
    return ORDERS[order_id]

def issue_refund(order_id: str, amount: float) -> dict:
    """Refund an order. RISKY: moves money."""
    return {"order_id": order_id, "refunded": amount, "status": "refund issued"}

@dataclass
class Tool:
    fn: callable
    risky: bool = False

TOOLS = {"lookup_order": Tool(lookup_order), "issue_refund": Tool(issue_refund, risky=True)}

# ------------------- scripted stand-in for the LLM -------------------
def fake_llm(messages):
    """Decides the next step from the conversation so far — the real model does this itself."""
    tool_results = [b for m in messages if m["role"] == "user" and isinstance(m["content"], list) for b in m["content"]]
    if not tool_results:
        return NS(stop_reason="tool_use", content=[NS(type="text", text="I'll check the order first."),
                                                   NS(type="tool_use", id="t1", name="lookup_order", input={"order_id": "A-1001"})])
    last = tool_results[-1]
    if last["tool_use_id"] == "t1":
        order = json.loads(last["content"])
        return NS(stop_reason="tool_use", content=[NS(type="text", text=f"The {order['item']} was delivered; refunding."),
                                                   NS(type="tool_use", id="t2", name="issue_refund", input={"order_id": "A-1001", "amount": order["price"]})])
    return NS(stop_reason="end_turn", content=[NS(type="text", text="Done — your refund of $59.00 for order A-1001 has been issued.")])

# ----------------------------- harness -----------------------------
@dataclass
class Agent:
    llm: callable
    tools: dict
    max_steps: int = 6
    approve: callable = lambda name, args: True          # human-in-the-loop hook
    trace: list = field(default_factory=list)

    def run(self, task: str) -> str:
        messages = [{"role": "user", "content": task}]
        for step in range(1, self.max_steps + 1):
            response = self.llm(messages)
            messages.append({"role": "assistant", "content": response.content})
            for b in response.content:
                if b.type == "text":
                    self.trace.append(f"step {step} 💬 {b.text}")
            if response.stop_reason != "tool_use":
                return "".join(b.text for b in response.content if b.type == "text")
            results = []
            for b in response.content:
                if b.type != "tool_use":
                    continue
                tool = self.tools.get(b.name)
                try:
                    if tool is None:
                        raise ValueError(f"unknown tool {b.name}")
                    if tool.risky and not self.approve(b.name, b.input):
                        raise PermissionError("a human reviewer declined this action")
                    output = tool.fn(**b.input)
                    results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(output)})
                    self.trace.append(f"step {step} 🔧 {b.name}({b.input}) → {output}")
                except Exception as e:
                    results.append({"type": "tool_result", "tool_use_id": b.id, "content": f"Error: {e}", "is_error": True})
                    self.trace.append(f"step {step} ⚠️ {b.name} failed: {e}")
            messages.append({"role": "user", "content": results})
        return "Stopped: step limit reached without finishing."

def console_approval(name, args):
    print(f"🛑 approval requested: {name}({args}) → approved")
    return True

agent = Agent(fake_llm, TOOLS, approve=console_approval)
answer = agent.run("Please refund my headphones order A-1001.")
print("\n".join(agent.trace))
print("\nFINAL:", answer)
```

### The real thing: Claude + the tool runner

```python local title="A support agent with Claude"
import anthropic
from anthropic import beta_tool

client = anthropic.Anthropic()
ORDERS = {"A-1001": {"item": "headphones", "status": "delivered", "price": 59.0}}

@beta_tool
def lookup_order(order_id: str) -> str:
    """Look up an order's item, delivery status and price by order id (e.g. "A-1001")."""
    return str(ORDERS.get(order_id, "order not found"))

@beta_tool
def issue_refund(order_id: str, amount: float) -> str:
    """Issue a refund for a delivered order. Only call after confirming the order exists and was delivered."""
    if input(f"Approve refund of ${amount} for {order_id}? [y/N] ").lower() != "y":   # human approval
        return "Refund declined by a human reviewer."
    return f"Refunded ${amount} for {order_id}."

runner = client.beta.messages.tool_runner(
    model="claude-opus-5-5",
    max_tokens=16000,
    system="You are a careful customer-support agent. Verify orders before acting. Be concise.",
    tools=[lookup_order, issue_refund],
    messages=[{"role": "user", "content": "Please refund my headphones, order A-1001."}],
)
for message in runner:
    for block in message.content:
        if block.type == "text":
            print(block.text)
```

## Agent design essentials

| Concern | What to do |
|---|---|
| **Tools** | few, well-named, well-described; clear errors the model can act on |
| **Instructions** | goal, constraints, when to stop, when to ask the user |
| **Limits** | max steps, token/time budgets, timeouts per tool |
| **Safety** | least privilege, sandbox code execution, human approval for irreversible actions |
| **Context** | long runs fill the context window — summarise, clear old tool results, or use memory files |
| **Observability** | log every step (trace) — you can't debug what you can't see |
| **Evaluation** | test on realistic tasks; measure success rate, steps, cost and failure modes |

:::warn Errors compound
If each step is 95% reliable, a 10-step task succeeds only about 60% of the time (0.95¹⁰). Keep agents' paths short, verify intermediate results (run the tests, check the data), and give the model feedback it can use to recover.
:::

```python run level=intermediate
for p in [0.99, 0.95, 0.90]:
    print(f"step reliability {p:.0%}: " + ", ".join(f"{n} steps → {p ** n:.0%}" for n in [1, 5, 10, 20]))
```

## Multi-agent systems and agent platforms

:::def Multi-agent system
Several LLM agents with different roles (e.g. a lead researcher that spawns sub-agents to explore sub-questions in parallel, then synthesises). Useful when work fans out naturally or one context window can't hold everything — at a significantly higher token cost.
:::

You don't always have to write the loop yourself:

| Option | What you get |
|---|---|
| **Your own loop** (as above) | full control, no extra dependencies |
| **SDK tool runner** (`client.beta.messages.tool_runner`) | the loop for your Python tools |
| **Claude Agent SDK** | the Claude Code harness as a library: file editing, bash, web search, sub-agents, permissions |
| **Claude Managed Agents** | Anthropic hosts the agent loop *and* a sandboxed workspace per session |
| **Frameworks** (LangGraph, Pydantic AI, OpenAI Agents SDK, CrewAI…) | graphs, state, integrations — learn the raw loop first |
| **MCP** | a standard way to plug tools and data sources into any agent (its own lesson) |

:::ai Where agents shine today
**Coding agents** (read a repo, edit files, run tests, iterate), **research agents** (search, read, synthesise with citations), **computer-use agents** (operate apps through screenshots and clicks), and **ops/support agents** with carefully scoped tools. In every case, the winning designs keep humans in control of irreversible actions and verify their own work.
:::

## Check yourself

```quiz
? What distinguishes an agent from a workflow?
+ In an agent, the LLM decides its own next steps and tool use; a workflow follows predefined code paths
- Agents use tools; workflows never do
- Workflows use more than one model
> Workflows are more predictable; agents are more flexible.

? Which pattern sends billing questions to a small model and coding questions to a large one?
+ Routing
- Evaluator-optimizer
- Prompt chaining
> Classify first, then dispatch.

? Each step of an agent succeeds 90% of the time. Roughly how often does a 10-step task fully succeed?
+ About 35%
- About 90%
- About 10%
> 0.9^10 ≈ 0.35 — keep paths short and verify as you go.

? Which is the most important safeguard for a tool that sends money?
+ Human approval (plus validation) before executing it
- A higher max_tokens
- Running it twice to be sure
> Irreversible actions need a human in the loop.
```

:::exercise Add a budget
Extend the `Agent` harness so it also tracks a **tool-call budget** (`max_tool_calls`, default 3). If the model requests a tool after the budget is used up, return an error `tool_result` saying the budget is exhausted. Test it by setting `max_tool_calls=1` with the same task, and print the trace.
:::

:::solution
```python run
import json
from types import SimpleNamespace as NS

def lookup_order(order_id): return {"item": "headphones", "price": 59.0}
def issue_refund(order_id, amount): return {"refunded": amount}
TOOLS = {"lookup_order": lookup_order, "issue_refund": issue_refund}

def fake_llm(messages):
    results = [b for m in messages if isinstance(m["content"], list) and m["role"] == "user" for b in m["content"]]
    if not results:
        return NS(stop_reason="tool_use", content=[NS(type="tool_use", id="t1", name="lookup_order", input={"order_id": "A-1001"})])
    if len(results) == 1:
        return NS(stop_reason="tool_use", content=[NS(type="tool_use", id="t2", name="issue_refund", input={"order_id": "A-1001", "amount": 59.0})])
    return NS(stop_reason="end_turn", content=[NS(type="text", text="I couldn't finish: " + results[-1]["content"])])

def run(task, max_steps=6, max_tool_calls=3):
    messages, calls, trace = [{"role": "user", "content": task}], 0, []
    for step in range(max_steps):
        r = fake_llm(messages)
        messages.append({"role": "assistant", "content": r.content})
        if r.stop_reason != "tool_use":
            return r.content[0].text, trace
        results = []
        for b in r.content:
            if b.type != "tool_use":
                continue
            if calls >= max_tool_calls:
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": "Error: tool budget exhausted", "is_error": True})
                trace.append(f"✋ {b.name} blocked (budget)")
                continue
            calls += 1
            out = TOOLS[b.name](**b.input)
            results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(out)})
            trace.append(f"🔧 {b.name} → {out}")
        messages.append({"role": "user", "content": results})
    return "step limit reached", trace

answer, trace = run("Refund order A-1001", max_tool_calls=1)
print("\n".join(trace)); print("FINAL:", answer)
```
:::

:::keypoints
- Prefer the simplest design: single call → **workflow** → **agent** only when the task is open-ended, valuable, viable and recoverable.
- Workflow patterns: **chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer**.
- An agent = LLM + tools in a loop, with **step/budget limits**, error feedback, a **trace**, and **human approval** for risky actions.
- Errors compound over steps — keep paths short and verify intermediate results.
- Use the SDK tool runner, the Claude Agent SDK, Managed Agents or frameworks once you understand the raw loop.
:::
