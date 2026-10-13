---
title: Multi-Agent Systems — When and How
level: advanced
time: 50
summary: Several agents working together: why it can help (parallelism, specialisation, context isolation), why it often does not (cost, coordination failures), the main topologies (orchestrator with sub-agents, handoffs, supervisor trees, critics), how to write delegation instructions that work, what the research on failures says, and a runnable orchestrator with parallel sub-agents and token accounting.
---

If one agent is good, are ten better? Sometimes: a lead agent that fans out to parallel researchers can finish in minutes what a single agent would take an hour to do. Often: no. Multi-agent systems **multiply tokens, cost and failure modes**, and many "multi-agent" demos are a single well-prompted agent in a trench coat. This lesson is about telling the difference.

## Why use multiple agents

| Benefit | How it works | Example |
|---|---|---|
| **Parallelism** | independent subtasks run at the same time | research 6 sub-topics simultaneously |
| **Context isolation** | each sub-agent has its own window; only a short result returns | explore a codebase without filling the lead's context |
| **Specialisation** | each agent has a focused prompt, tools and maybe model | a SQL agent, a writer, a reviewer |
| **Separation of concerns and permissions** | different agents hold different credentials | a read-only researcher and a write-capable executor |
| **Independent checking** | a reviewer who did not do the work sees it fresh | code review, fact-checking |
| **Scale** | breadth beyond one context window | analyse 200 documents |

## Why not (the honest costs)

- **Tokens**: Anthropic reported that agents use several times the tokens of a chat, and multi-agent research systems several times more again (an order of magnitude overall for their system). It only pays off when the **task value is high enough**.
- **Coordination overhead**: briefing agents, waiting, merging results, reconciling conflicts.
- **Failure modes multiply**: agents duplicate work, contradict each other, or misunderstand a delegated task. A study of failure modes in multi-agent LLM systems ([paper](https://arxiv.org/abs/2503.13657)) groups them into **specification and design problems**, **inter-agent misalignment** (information not shared, instructions ignored, reasoning-action mismatch) and **task verification problems** (stopping too early, no or weak checking).
- **Harder to debug and evaluate**: non-deterministic interactions; you must trace across agents.
- **Poor fit for tightly coupled work**: tasks where all agents need the same shared context at every step (many coding changes in one file) get worse when split.

:::tip A sound default
Start with **one agent with good tools**. Add sub-agents only for (1) breadth-first, parallelisable exploration, (2) context isolation of noisy work, or (3) clean separation of permissions or review. Measure the gain against the extra cost.
:::

## Topologies

```viz algo=arch title="Common multi-agent topologies" dir=down
lead  Lead agent | plans, delegates, synthesises [agent] @1,0
w1    Worker A [agent] @0,1.5
w2    Worker B [agent] @1,1.5
w3    Worker C [agent] @2,1.5
tri   Triage agent [agent] @0,3
sp1   Billing specialist [agent] @0,4.5
sp2   Tech specialist [agent] @1,4.5
rev   Reviewer / critic [eval] @2,3
--
lead -> w1 : subtask
lead -> w2 : subtask
lead -> w3 : subtask
tri -> sp1 : handoff
tri -> sp2 : handoff
w3 -> rev : result
rev -> w3 : feedback
```

| Topology | Description | Good for | Watch out |
|---|---|---|---|
| **Orchestrator with sub-agents** (hub and spoke) | a lead plans and delegates; sub-agents return condensed results | research, codebase exploration, report writing | lead is a bottleneck; delegation quality is everything |
| **Handoffs** (routing between peers) | an agent transfers the conversation to a specialist and steps out | support triage → billing / technical | context transfer; ping-pong loops |
| **Supervisor tree** (hierarchy) | managers delegate to sub-managers and workers | very large tasks | latency, cost, information loss up the tree |
| **Peer collaboration / group chat** | agents converse (planner, coder, critic) | open-ended creative or exploratory tasks | rambling, no convergence; hard to control |
| **Pipeline of specialists** | fixed chain of agents (a workflow with agent steps) | well-understood processes | rigid; errors propagate |
| **Debate / critic-generator** | one proposes, another challenges | high-stakes reasoning, review | cost; sycophantic agreement |
| **Blackboard / shared memory** | agents read and write a shared workspace | long collaborative tasks | consistency, concurrent edits |

## Writing delegation instructions

The most common failure in orchestrated systems is **vague delegation**: the lead says "research the semiconductor shortage" and three sub-agents do overlapping work. A sub-agent knows **nothing** except what you tell it. Each delegation should include:

1. **Objective**: precisely what to find or do, and **why** (how the result will be used).
2. **Output format**: what to return, how long, what structure (and "return only the findings, not your process").
3. **Boundaries**: what is out of scope, what other agents are covering, what sources/tools to use.
4. **Effort guidance**: how much search or reasoning is warranted ("this is a simple fact-check: 3 tool calls; do not over-research").
5. **Success criteria and stopping rule**.

Also **scale effort to complexity** in the lead's prompt (a simple question needs one agent and a few calls; a broad comparison needs several sub-agents), because without guidance agents tend to over-invest.

```python run title="A delegation brief that works vs one that doesn't" level=easy
def lint_brief(brief):
    checks = {
        "has an objective":        any(w in brief.lower() for w in ("find", "determine", "identify", "compare", "check")),
        "states the output format": any(w in brief.lower() for w in ("return", "format", "list", "bullet", "json")),
        "sets boundaries":          any(w in brief.lower() for w in ("do not", "out of scope", "only", "other agents")),
        "gives effort guidance":    any(w in brief.lower() for w in ("at most", "no more than", "tool calls", "quick", "thorough")),
    }
    return checks

vague = "Research the chip shortage."
clear = ("Find the three largest causes of the 2021-2023 automotive chip shortage and the evidence for each. "
         "Return a JSON list [{cause, evidence_url, one_sentence_summary}]. Only use primary sources or major outlets. "
         "Another agent covers the economic impact, so do not discuss it. Use at most 8 tool calls.")
for name, brief in (("vague", vague), ("clear", clear)):
    r = lint_brief(brief)
    print(f"{name:6} score {sum(r.values())}/4  ->", [k for k, v in r.items() if not v] or "complete")
```

## An orchestrator with parallel sub-agents

Below: a lead that plans subtasks, fans out to sub-agents **concurrently**, and synthesises. The "model" is stubbed; the structure and the **token accounting** are real, and they show why multi-agent is expensive.

```python run title="Orchestrator + parallel sub-agents, with token accounting" level=advanced
import asyncio

class Ledger:
    def __init__(self): self.rows = []
    def add(self, who, tokens_in, tokens_out): self.rows.append((who, tokens_in, tokens_out))
    def total(self): return sum(i + o for _, i, o in self.rows)

async def sub_agent(name, subtask, ledger):
    steps = 4                                            # a sub-agent loops several times in its OWN context
    ctx, billed = 1500, 0                                # its system prompt + brief
    for _ in range(steps):
        billed += ctx                                    # each step re-sends its context
        ctx += 2500                                      # tool results grow it
        await asyncio.sleep(0.01)
    ledger.add(name, billed, 1200)
    return f"[{name}] findings on '{subtask}' (400 tokens)"

async def lead(task, ledger):
    subtasks = [f"{task} - angle {i}" for i in range(1, 5)]       # the plan (an LLM call in reality)
    ledger.add("lead:plan", 2000, 600)
    results = await asyncio.gather(*(sub_agent(f"sub{i}", s, ledger) for i, s in enumerate(subtasks, 1)))
    synth_in = 2000 + sum(400 for _ in results)                    # only condensed findings come back
    ledger.add("lead:synthesise", synth_in, 900)
    return results

ledger = Ledger()
asyncio.run(lead("market analysis", ledger))
multi = ledger.total()

# the same job done by ONE agent doing all four angles sequentially in one growing context
ctx, billed = 3500, 0
for _ in range(16):                                      # 4 angles x 4 steps
    billed += ctx; ctx += 2500
single = billed + 2000
print(f"multi-agent total tokens  : {multi:>9,}")
print(f"single-agent total tokens : {single:>9,}")
print(f"final single-agent context: {ctx:>9,}  (vs ~10K per sub-agent; the lead only ever held ~5K)")
```

Interesting: in this stylised example the multi-agent system can even use **fewer** total tokens than one agent dragging an ever-growing context (each step resends everything), while finishing in a fraction of the wall-clock time. Real systems vary: if sub-agents duplicate work or are over-eager, the total explodes. **Measure tokens and quality both ways** for your task.

## Handoffs and shared state

With **handoffs**, one agent passes control (and relevant context) to another and stops. Design the handoff payload: the user's goal, what has been learned, what remains, and any state or ids. Guard against **ping-pong** (two agents repeatedly passing the task back).

```python run title="A handoff with an explicit payload and a loop guard" level=intermediate
def triage(msg):
    if "invoice" in msg or "charge" in msg: return "billing"
    if "crash" in msg or "error" in msg:    return "tech"
    return "general"

AGENTS = {
    "billing": lambda s: ("done", f"billing agent resolved: {s['summary']}") if s["facts"].get("order") else ("handoff", "general"),
    "tech":    lambda s: ("done", f"tech agent resolved: {s['summary']}"),
    "general": lambda s: ("done", "general agent answered"),
}

def run(message):
    state = {"summary": message, "facts": {}, "hops": [], "max_hops": 3}        # the payload that travels with the task
    current = triage(message)
    while True:
        state["hops"].append(current)
        if len(state["hops"]) > state["max_hops"]:
            return "STOP: too many handoffs (possible ping-pong)", state["hops"]
        status, out = AGENTS[current](state)
        if status == "done":
            return out, state["hops"]
        current = out                                                          # hand off to the named agent

print(run("I was charged twice on invoice 118"))
print(run("the app shows an error on login"))
```

## Evaluating multi-agent systems

- **End-to-end task success** first; then per-agent quality (did each sub-agent return what the lead needed?).
- **Trajectory review**: read the traces, look for duplicated work, ignored instructions, early stopping.
- **Cost and latency per task**, with and without multi-agent.
- Use **LLM-judges with rubrics** (accuracy, completeness, source quality, efficiency), plus human review of a sample. Anthropic notes that small evaluation sets (even ~20 real queries) reveal large effects early.
- **Test delegation**: unit-test the lead's briefs (as above) and sub-agent contracts (schemas for returned results).

## Production concerns

- **Tracing across agents** with a shared run id; log each agent's context size, tools and tokens.
- **State and recovery** (previous lesson): a long multi-agent run must resume after a failure without redoing finished sub-tasks.
- **Rate limits and concurrency**: parallel agents hit limits fast; queue and back off.
- **Rainbow deployments**: avoid breaking running agents when you deploy new prompts or tools mid-run.
- **Permissions per agent**, least privilege, and approvals for risky actions.
- **Budgets per run** (tokens, cost, time) enforced centrally.

```quiz
? What is a strong reason to use sub-agents?
- To make the system look advanced
+ Parallel, breadth-first work or isolating noisy exploration in separate contexts so the lead stays focused
- To avoid writing prompts
> Use them for parallelism, isolation, specialisation or independent review.

? What is the biggest cause of failure in orchestrated systems?
+ Vague delegation: sub-agents lack objective, format, boundaries and effort guidance
- Too much logging
- Using Python
> A sub-agent knows only what the brief says.

? Why are tightly coupled tasks (many edits to one file) a poor fit for multi-agent splits?
+ Agents need the same shared context at every step, so coordination and conflicts dominate
- They are too small
- They need tools
> Parallelism helps independent work, not tightly coupled work.

? In a handoff, what should travel with the task?
- Nothing, the next agent starts fresh
+ The goal, what was learned, what remains, and relevant state or ids; plus a hop limit to prevent ping-pong
- The whole company wiki
> Explicit handoff payloads and loop guards keep control flow sane.
```

:::problem A team proposes a 6-agent system (planner, researcher, coder, tester, reviewer, writer) for generating internal reports. How do you evaluate the proposal? {level=hard tags="multi-agent,design"}
Give criteria and a plan.

:::solution Model answer
First build the **single-agent baseline** (one agent with search and code tools plus a checklist) and measure quality, cost and latency on ~20 real report requests with a rubric. Then justify each extra agent by a concrete benefit: parallel research (breadth), context isolation (large reading), independent review (quality). Collapse roles that are just prompts (planner/writer can be steps of the lead). Check delegation briefs, output schemas, and failure handling (what if the researcher returns nothing?). Compare end-to-end quality and total tokens/time; keep multi-agent only if it wins on value per cost. Add tracing and a per-run budget before shipping.
:::
:::

:::keypoints
- Multi-agent systems help with parallelism, context isolation, specialisation, independent review and permission separation; they cost tokens, coordination effort and debuggability.
- Start with a single good agent; add sub-agents only where they measurably win.
- Topologies: orchestrator-workers, handoffs, supervisor trees, peers/group chat, pipelines, critics, shared blackboards.
- Delegation briefs must include objective, output format, boundaries, effort guidance and stopping rules.
- Known failure modes: specification gaps, inter-agent misalignment, weak verification; trace, budget and evaluate end to end.
:::

:::resources
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — lessons on delegation, effort scaling, evals and production.
- [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657) — a taxonomy of failure modes from real traces.
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — when not to add complexity.
- [OpenAI Agents SDK: handoffs](https://openai.github.io/openai-agents-python/) — a clean handoff primitive.
- [LangGraph docs](https://langchain-ai.github.io/langgraph/) — supervisor and swarm patterns as graphs.
- [Microsoft AutoGen](https://microsoft.github.io/autogen/) and [CrewAI](https://docs.crewai.com) — multi-agent frameworks with different philosophies.
:::
