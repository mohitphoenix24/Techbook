---
title: What Is an Agent? Workflows vs Agents
level: intermediate
time: 40
summary: A precise definition of an AI agent, the difference between workflows (code-orchestrated) and agents (model-directed), the spectrum of autonomy, when an agent is the right tool and when a plain prompt or a workflow is better, and the real costs of autonomy. With a decision checklist you can apply to any project.
---

"Agent" is the most overloaded word in AI. Marketing uses it for anything with a chat box. Engineers need a sharper definition, because the **right architecture depends on it**, and because agents cost more, fail differently and are riskier than simpler systems.

:::def AI agent
A system where a language model **decides, step by step, what to do next** (which tool to call, what to look at, when to stop), observes the results of its actions in an **environment**, and loops until the task is done. The model directs its own process and tool usage rather than following a path fixed in code.
:::

:::analogy
A **recipe** versus a **chef**. A recipe (a workflow) lists steps in a fixed order: whisk, bake, cool. A chef (an agent) tastes, notices the sauce is too thin, decides to reduce it, and adapts. Recipes are predictable and cheap; chefs handle the unexpected but need more trust and supervision.
:::

## Workflows vs agents

Anthropic's widely cited framing ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)) separates two kinds of **agentic systems**:

| | **Workflow** | **Agent** |
|---|---|---|
| Who decides the next step? | **Your code** (a predefined path) | **The model** (dynamically) |
| Control flow | fixed graph: A → B → C, with branches you wrote | open loop: think → act → observe → repeat |
| Predictability | high | lower |
| Latency and cost | low, bounded | higher, variable |
| Handles unexpected situations | poorly (only the branches you foresaw) | well |
| Testing | easier (each step) | harder (whole trajectories) |
| Best for | well-understood, repeatable tasks | open-ended tasks where steps cannot be predicted |

```viz algo=arch title="Workflow vs agent: who holds the steering wheel" dir=down
w1  Step 1 | code calls the model [prompt] @0,0
w2  Step 2 | code calls the model [prompt] @1,0
w3  Step 3 | code calls the model [prompt] @2,0
a   Agent | the model chooses the next action [agent] @1,2
t   Tools + environment | search, files, APIs [tool] @2,3
--
w1 -> w2 : fixed path
w2 -> w3 : fixed path
a <-> t : decides, acts, observes, repeats
```

Most real products are **workflows with one or two agentic steps**, not fully autonomous agents.

## The spectrum of autonomy

Think of a dial, not a switch:

| Level | Name | Description | Example |
|---|---|---|---|
| 0 | **Single call** | one prompt in, one answer out | summarise this email |
| 1 | **Augmented call** | one call with retrieval, tools or a schema | RAG answer; function call for the weather |
| 2 | **Workflow** | several calls in a code-defined structure | classify → retrieve → draft → check |
| 3 | **Tool-using agent** | model loops over tools until done, with limits and approvals | support agent that looks up orders and issues refunds with approval |
| 4 | **Long-running autonomous agent** | works for minutes to hours, plans, delegates, recovers from errors | coding agent fixing a bug across a repository |
| 5 | **Multi-agent systems** | several agents coordinate | research systems with parallel sub-agents |

**Move up the dial only when the lower level provably fails.** Each step buys flexibility and costs predictability, money and safety.

## When an agent is the right tool

Check all four (a useful checklist from Anthropic's own guidance):

1. **Complexity**: is the task multi-step and hard to specify in advance? (If you can draw the flowchart, write a workflow.)
2. **Value**: does the outcome justify more cost and latency? (A research task worth hours of human time: yes. A routine tag lookup: no.)
3. **Viability**: can the model actually do this kind of task, with the tools you can give it?
4. **Cost of error**: can mistakes be **detected and recovered** (tests, review, rollback, human approval)? If errors are irreversible and invisible, do not give an agent free rein.

```python run title="Workflow, agent or single call? A scoring helper" level=easy
def recommend(steps_known_in_advance, value_per_task_usd, can_verify_result, errors_reversible, needs_tools):
    if not needs_tools and steps_known_in_advance:
        return "Single call (maybe with retrieval or a schema)"
    if steps_known_in_advance:
        return "Workflow: write the steps in code"
    if value_per_task_usd < 0.5:
        return "Workflow or single call: an agent's cost/latency is not justified"
    if not can_verify_result or not errors_reversible:
        return "Agent only with human approval gates and tight tool permissions"
    return "Agent: open-ended, valuable, and errors are recoverable"

cases = {
    "summarise a support email":              dict(steps_known_in_advance=True,  value_per_task_usd=0.05, can_verify_result=False, errors_reversible=True,  needs_tools=False),
    "answer from the help centre":            dict(steps_known_in_advance=True,  value_per_task_usd=0.2,  can_verify_result=True,  errors_reversible=True,  needs_tools=True),
    "triage then draft a reply":              dict(steps_known_in_advance=True,  value_per_task_usd=1,    can_verify_result=True,  errors_reversible=True,  needs_tools=True),
    "fix a failing test in a large repo":     dict(steps_known_in_advance=False, value_per_task_usd=40,   can_verify_result=True,  errors_reversible=True,  needs_tools=True),
    "move money between customer accounts":   dict(steps_known_in_advance=False, value_per_task_usd=5,    can_verify_result=False, errors_reversible=False, needs_tools=True),
}
for name, kw in cases.items():
    print(f"{name:40} -> {recommend(**kw)}")
```

## What agents cost

- **Tokens and money:** every loop iteration resends the growing context. Agents typically use several times the tokens of a chat; multi-agent systems more again. Budget per task, not per call.
- **Latency:** many sequential model calls and tool calls: seconds to minutes (or hours).
- **Reliability:** errors **compound** across steps (the earlier lesson): 95% per step is only 36% over 20 steps. Verification and recovery are essential.
- **Evaluation:** you must test **trajectories** (sequences of actions), not just final answers.
- **Safety:** an agent with tools can *do* things: delete, send, spend. Permissions, sandboxes and approvals are part of the design.

```viz algo=errorcompound title="Why long autonomous chains fail" p=0.95 steps=20
```

## What makes agents work now

Agents were a research toy in 2023 and a product category by 2025. The ingredients:

1. **Better models**: stronger reasoning, longer coherent horizons, and reliable **tool calling**.
2. **Reasoning and thinking modes** that plan before acting and reflect on results.
3. **Large context and caching**, so long histories are affordable.
4. **Standards for tools** (MCP) and practices for context management.
5. **Environments with fast feedback**: code with tests, browsers, shells, spreadsheets, where the agent can *check* its work. Agents shine where "did it work?" can be answered automatically.

## Examples to anchor the idea

| Agent | Environment | Feedback signal |
|---|---|---|
| **Coding agent** (Claude Code, Codex, Cursor agents) | repository, shell, tests | tests pass/fail, compiler errors |
| **Research agent** | web search, document readers | coverage and source quality (harder) |
| **Support agent** | CRM, order system, knowledge base | resolution, customer satisfaction, policy checks |
| **Data analyst agent** | database, notebooks, plotting | query results, sanity checks |
| **Computer-use agent** | a screen, mouse and keyboard | what the screen shows next |
| **Operations agent** | cloud APIs, runbooks | health checks, alerts |

## Design principles to carry forward

1. **Start simple**: find the simplest solution and add complexity only when it earns its keep. Many "agents" should have been a single well-prompted call or a three-step workflow.
2. **Make it observable**: log every step, tool call and result.
3. **Give it good tools** and a clean way to verify work.
4. **Bound it**: step limits, token/cost budgets, timeouts, permission scopes.
5. **Keep a human in the loop** for consequential actions, at first by default.
6. **Evaluate on real tasks**, end to end.

```quiz
? What distinguishes an agent from a workflow?
- Agents use bigger models
+ In an agent the model decides the next steps dynamically; in a workflow your code defines the path
- Agents never use tools
> The control flow is the difference.

? Which task is a good candidate for an autonomous agent?
- Formatting a date
+ Fixing a failing test in a large codebase, where tests give automatic feedback and changes can be reverted
- Wiring money with no way to verify or undo
> Open-ended, valuable, verifiable and recoverable.

? If each step succeeds 95% of the time, roughly how likely is a 20-step task to succeed with no checks?
- 95%
+ about 36%
- 80%
> 0.95^20 ≈ 0.36: this is why verification and recovery matter.

? When should you NOT build an agent?
+ When you can write the steps as a fixed workflow, or the cost of an error is high and unrecoverable
- When the model is strong
- When you use tools
> Prefer the simplest architecture that works.
```

:::problem A startup wants "an AI agent that handles all customer emails". Push back constructively and propose a plan. {level=medium tags="agents,scoping"}
Use the workflow/agent distinction and the risk checklist.

:::solution Model answer
Reframe as levels. Start with **Level 1–2**: classify emails (small model), retrieve policy (RAG), draft a reply for **human approval**, measure acceptance rate. Identify high-volume safe categories (order status, how-to) and automate those with a **workflow** that calls order/KB tools. Only for open-ended or multi-system cases (refund exceptions, complex complaints) introduce a **tool-using agent** with scoped permissions, spending limits, approval for money-moving actions, and trajectory evals. Define success metrics (resolution rate, edits per draft, escalation rate, CSAT), log everything, and expand autonomy as evidence accumulates.
:::
:::

:::keypoints
- An agent is a model that directs its own steps with tools in a loop; a workflow is code-orchestrated model calls.
- Autonomy is a dial from single calls to multi-agent systems; climb only when simpler designs fail.
- Use agents for complex, valuable, viable, recoverable tasks; prefer environments with automatic feedback.
- Costs: tokens, latency, compounding errors, harder evaluation, safety exposure.
- Start simple, observe everything, bound the agent, keep humans in the loop for consequential actions.
:::

:::resources
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — the essential read: workflows vs agents and the core patterns.
- [OpenAI: A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) — a complementary, implementation-oriented view.
- [Chip Huyen: Agents](https://huyenchip.com/2025/01/07/agents.html) — tools, planning, failure modes and evaluation.
- [Lilian Weng: LLM Powered Autonomous Agents](https://lilianweng.github.io/posts/2023-06-23-agent/) — planning, memory, tools: the foundational survey.
- [Hugging Face Agents Course](https://huggingface.co/learn/agents-course) — a free course with hands-on frameworks.
- [Microsoft: AI agents for beginners](https://github.com/microsoft/ai-agents-for-beginners) — lessons and notebooks.
:::
