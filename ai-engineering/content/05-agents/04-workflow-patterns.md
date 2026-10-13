---
title: Workflow Patterns — The Five Building Blocks
level: intermediate
time: 55
summary: Most reliable AI systems are workflows built from five patterns: prompt chaining, routing, parallelisation (sectioning and voting), orchestrator-workers and evaluator-optimiser. Each pattern explained with a diagram, when to use it, its costs, and a runnable implementation against a stand-in model, so you can compose them into larger systems.
---

Before reaching for a free-roaming agent, see how far **composition of simple patterns** gets you. These five blocks, popularised in Anthropic's *Building effective agents*, cover a large share of production needs while staying predictable, testable and cheap. Each one is an **augmented LLM** (a model with retrieval, tools and memory) arranged in a particular **control flow written in code**.

For the examples we use a tiny scripted `llm()` so everything runs here. In real life, replace it with an API call.

```python run title="The stand-in model used in this lesson" level=easy
def llm(prompt, role="assistant"):
    """A deterministic stand-in for a model call. It recognises a few instructions."""
    p = prompt.lower()
    if p.startswith("classify"):
        return "refund" if "refund" in p else "technical" if "error" in p or "crash" in p else "general"
    if p.startswith("outline"):
        return "1) intro 2) risks 3) mitigation"
    if p.startswith("write"):
        return "DRAFT: " + prompt.split(":", 1)[-1].strip()[:60]
    if p.startswith("grade"):
        return "PASS" if "refund" in p and "30 days" in p else "FAIL: mention the 30-day window"
    return "OK"

print(llm("classify: I want a refund"), "|", llm("classify: the app shows an error"), "|", llm("write: a summary of the policy"))
```

## 1. Prompt chaining

:::def Prompt chaining
Decompose a task into a **fixed sequence** of LLM calls where each step processes the previous output, with optional **gates** (programmatic checks) between steps.
:::

```viz algo=arch title="Prompt chaining" dir=down
inp  Input [user] @0,0
s1   LLM call 1 | outline [prompt] @1,0
gate Gate | check outline [filter] @2,0
s2   LLM call 2 | write sections [prompt] @3,0
out  Output [guard] @4,0
--
inp -> s1
s1 -> gate
gate -> s2 : pass
s2 -> out
```

**Use when** the task splits cleanly into ordered sub-tasks and you want higher accuracy by making each call easier (draft → translate; outline → check → write; extract → validate → format). **Trade-off:** latency grows with steps; errors can propagate, so **gate** between steps.

```python run title="Chain with a gate" level=easy
def chain(topic):
    outline = llm(f"outline: {topic}")                           # step 1
    if "risks" not in outline:                                   # gate: a deterministic check
        raise ValueError("outline missing the risks section")
    return llm(f"write: {topic} following {outline}")            # step 2

# (re-declare the stand-in so this block runs by itself)
def llm(prompt):
    return "1) intro 2) risks 3) mitigation" if prompt.startswith("outline") else "DRAFT: " + prompt[:50]
print(chain("vendor lock-in"))
```

## 2. Routing

:::def Routing
**Classify** the input, then send it to a **specialised** downstream flow, prompt, tool set or model.
:::

```viz algo=arch title="Routing" dir=down
inp  Input [user] @0,1
r    Router | classify [filter] @1,1
a    Refund flow | policy + order tools [prompt] @2,0
b    Technical flow | logs + docs [prompt] @2,1
c    General flow | FAQ [prompt] @2,2
--
inp -> r
r -> a
r -> b
r -> c
```

**Use when** distinct categories need different prompts, tools or models: separating concerns makes each branch simpler and optimisable independently. **Cost optimisation:** route easy queries to a small model and hard ones to a large one. **Risk:** a wrong classification sends the request down the wrong path, so evaluate the router and include an "unknown → human or clarify" route.

```python run title="Route to specialised handlers (and a fallback)" level=intermediate
def classify(text):                       # a small, fast model in real life
    t = text.lower()
    if "refund" in t or "money back" in t: return "refund"
    if "error" in t or "crash" in t:       return "technical"
    if "hello" in t or "thanks" in t:      return "chitchat"
    return "unknown"

HANDLERS = {
    "refund":    lambda q: "[refund flow] check order + policy, then draft a reply",
    "technical": lambda q: "[technical flow] search logs and docs, propose steps",
    "chitchat":  lambda q: "[small model] friendly one-liner",
}

def handle(q):
    route = classify(q)
    handler = HANDLERS.get(route, lambda q: "[fallback] ask a clarifying question or hand to a human")
    return route, handler(q)

for q in ["I want my money back", "The app shows an error E21", "hello!", "what's the meaning of life"]:
    print(q, "->", handle(q))
```

## 3. Parallelisation

Run LLM calls **at the same time** and combine the results. Two flavours:

- **Sectioning:** split a task into **independent subtasks** run in parallel (analyse each document; check different guardrails at once; review a contract's clauses separately).
- **Voting:** run the **same task several times** and aggregate (majority vote, or any-fails) for confidence (security review by three prompts; self-consistency).

```viz algo=arch title="Parallelisation" dir=down
inp  Input [user] @0,1
a    LLM A [llm] @1,0
b    LLM B [llm] @1,1
c    LLM C [llm] @1,2
agg  Aggregate | merge or vote [filter] @2,1
--
inp -> a
inp -> b
inp -> c
a -> agg
b -> agg
c -> agg
```

**Use when** subtasks are independent (speed) or when multiple perspectives raise confidence. **Cost:** tokens multiply; latency is the slowest branch, not the sum.

```python run title="Sectioning with asyncio, and voting" level=intermediate
import asyncio, collections

async def analyse(doc):
    await asyncio.sleep(0.05)                         # a model call
    return f"{doc}: {len(doc)} chars, risk={'high' if 'penalty' in doc else 'low'}"

async def vote(prompt, n=5):
    await asyncio.sleep(0.05)
    answers = ["unsafe", "safe", "unsafe", "unsafe", "safe"][:n]      # five independent judgements
    top, count = collections.Counter(answers).most_common(1)[0]
    return top, f"{count}/{n} agree"

async def main():
    docs = ["clause: late payment penalty applies", "clause: governing law is Ireland", "clause: notice period 30 days"]
    results = await asyncio.gather(*(analyse(d) for d in docs))        # sectioning: all at once
    for r in results: print(r)
    print("vote:", await vote("is this code snippet safe?"))

asyncio.run(main())
```

## 4. Orchestrator-workers

:::def Orchestrator-workers
A **central LLM** (the orchestrator) **dynamically decides** what subtasks are needed, delegates each to **worker** LLMs, and **synthesises** their results. Unlike parallelisation, the subtasks are **not predefined**: the orchestrator plans them for each input.
:::

```viz algo=arch title="Orchestrator-workers" dir=down
inp  Task [user] @0,1
orc  Orchestrator | plans subtasks [agent] @1,1
w1   Worker 1 [llm] @2,0
w2   Worker 2 [llm] @2,1
w3   Worker 3 [llm] @2,2
syn  Synthesiser [prompt] @3,1
--
inp -> orc
orc -> w1
orc -> w2
orc -> w3
w1 -> syn
w2 -> syn
w3 -> syn
```

**Use when** you cannot predict the subtasks in advance: changes spanning an unknown number of files, searching multiple sources, writing a report whose sections depend on the question. This is the backbone of many coding agents and research systems. **Cost:** an extra planning step and synthesis; ensure workers get **complete, self-contained instructions** (they do not share the orchestrator's context).

```python run title="Plan dynamically, run workers, synthesise" level=intermediate
import asyncio

def orchestrator_plan(task):
    """In reality an LLM returns a JSON list of subtasks tailored to the task."""
    if "migrate" in task:
        return [f"update imports in {f}" for f in ["api.py", "models.py", "utils.py"]] + ["update the README"]
    return [task]

async def worker(subtask):
    await asyncio.sleep(0.05)
    return f"done: {subtask}"

async def run(task):
    plan = orchestrator_plan(task)                                    # subtasks are DECIDED at run time
    results = await asyncio.gather(*(worker(s) for s in plan))
    return f"{len(plan)} subtasks completed:\n" + "\n".join("  " + r for r in results)

print(asyncio.run(run("migrate the codebase from requests to httpx")))
```

## 5. Evaluator-optimiser

:::def Evaluator-optimiser
One LLM **generates** a response; another **evaluates** it against criteria and gives feedback; the generator **revises**, in a loop until the evaluator is satisfied or a limit is reached.
:::

```viz algo=arch title="Evaluator-optimiser loop" dir=down
inp  Task [user] @0,0
gen  Generator | drafts or revises [llm] @1,0
ev   Evaluator | grades against criteria [eval] @2,0
out  Accepted output [guard] @3,0
--
inp -> gen
gen -> ev : draft
ev -> gen : feedback
ev -> out : pass
```

**Use when** you have **clear evaluation criteria** and iteration measurably helps: literary translation with nuance, code that must pass tests, search that needs multiple rounds. It works best when the evaluator has **ground truth** (tests, a validator, a policy checklist) rather than just another opinion. **Always cap the rounds.**

```python run title="Generate, evaluate, revise (bounded)" level=intermediate
def generate(task, feedback=None):
    draft = "You can return the item for a refund."
    if feedback and "30-day" in feedback:
        draft = "You can return the item within 30 days for a full refund."
    return draft

def evaluate(draft):
    problems = []
    if "30 days" not in draft: problems.append("state the 30-day window")
    if len(draft.split()) > 40: problems.append("too long")
    return ("PASS", []) if not problems else ("REVISE", problems)

def optimise(task, max_rounds=3):
    feedback = None
    for round_ in range(1, max_rounds + 1):
        draft = generate(task, feedback)
        verdict, problems = evaluate(draft)
        print(f"round {round_}: {draft!r} -> {verdict} {problems}")
        if verdict == "PASS":
            return draft
        feedback = "; ".join(problems)
    return draft + "  [best effort after max rounds]"

print(optimise("explain the refund policy"))
```

## Combining patterns

Real systems compose these blocks:

```viz algo=arch title="A composed workflow: support assistant" dir=down
in    Message [user] @0,1
rt    Route | refund / technical / general [filter] @1,1
rf    Refund chain | lookup → policy → draft [prompt] @2,0
tc    Technical agent | tools + loop [agent] @2,1
gn    Small-model FAQ [llm] @2,2
ev    Evaluator | policy + tone check [eval] @3,0
out   Reply [guard] @4,1
--
in -> rt
rt -> rf
rt -> tc
rt -> gn
rf -> ev
ev -> out
tc -> out
gn -> out
```

Notice: a **router** at the front, a **chain** for a well-understood flow, an **agent** only for the open-ended branch, and an **evaluator** guarding the high-risk branch. This is typical and far more reliable than one giant agent.

## Choosing a pattern

| If the task… | Use |
|---|---|
| splits into fixed ordered steps | chaining |
| has distinct categories needing different handling | routing |
| has independent parts, or benefits from multiple opinions | parallelisation |
| needs subtasks that depend on the input | orchestrator-workers |
| has clear quality criteria and benefits from revision | evaluator-optimiser |
| cannot be decomposed ahead of time and needs open-ended exploration | a true agent (previous lessons) |

```quiz
? What distinguishes orchestrator-workers from simple parallelisation?
- Workers run slower
+ The orchestrator decides the subtasks dynamically for each input, rather than a predefined split
- It uses fewer tokens
> Dynamic planning is the key difference.

? Why gate between steps of a chain?
+ A cheap programmatic check stops errors from propagating to later calls
- Gates speed up the chain
- Chains do not work without gates
> Verification between steps limits compounding errors.

? When does evaluator-optimiser work best?
- When criteria are vague
+ When there are clear criteria, ideally checkable (tests, schemas, policy lists), and revision measurably improves results
- For single-word answers
> Ground-truth evaluation beats opinion; and cap the rounds.

? What is a cost benefit of routing?
+ Send easy queries to small, cheap models and reserve large models for hard ones
- It removes the need for evaluation
- It guarantees accuracy
> Routing lets you match model size to difficulty (but the router must be evaluated).
```

:::problem Design a workflow for "turn a customer's bug report into a triaged ticket with a suggested owner". {level=medium tags="workflows,design"}
Name the patterns and the gates.

:::solution Model answer
**Chain**: (1) extract structured fields (product, version, steps, severity) with a schema; **gate**: validate required fields, ask the user for missing ones. (2) **Route** by component (small classifier) to component-specific prompts with relevant docs. (3) Retrieve similar existing tickets (**RAG**) to deduplicate. (4) Suggest an owner via a deterministic rule/lookup table, not an LLM guess. (5) **Evaluator** checks the draft ticket against the template (reproduction steps present, severity justified); one revision allowed. Parallelise duplicate search and severity assessment. Human review for severity-1. Log each step and evaluate field accuracy on labelled tickets.
:::
:::

:::keypoints
- Five building blocks: prompt chaining, routing, parallelisation (sectioning, voting), orchestrator-workers, evaluator-optimiser.
- Workflows are predictable, testable and cheap: use them whenever you can describe the steps; add agents only for genuinely open-ended branches.
- Gate between steps, evaluate routers, cap evaluator loops, give workers self-contained instructions.
- Compose patterns: router + chain + agent + evaluator is a typical production shape.
:::

:::resources
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — the source of these five patterns, with guidance on each.
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — orchestrator-workers at scale.
- [LangGraph docs](https://langchain-ai.github.io/langgraph/) — express chains, routers and loops as graphs.
- [OpenAI: A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) — orchestration patterns and guardrails.
- [Eugene Yan: Patterns for Building LLM-based Systems & Products](https://eugeneyan.com/writing/llm-patterns/) — evals, RAG, guardrails, feedback.
- [Chip Huyen: Agents](https://huyenchip.com/2025/01/07/agents.html) — control flow patterns and planning.
:::
