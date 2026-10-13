---
title: Reasoning, Planning and Reflection in Agents
level: advanced
time: 50
summary: How agents think before and between actions. ReAct (reason and act), plan-and-execute with replanning, task lists as external planning, reflection and verification, search over alternatives, how reasoning models and interleaved thinking change the playbook, and the mistakes that make agents plan badly. With runnable ReAct parsing, plan-and-execute with replanning, and a reflect-and-retry loop.
---

An agent that acts without thinking flails; one that only thinks never finishes. This lesson covers the patterns that organise an agent's **cognition**: how it decides what to do, keeps track of a plan, notices when it is wrong and corrects course.

## ReAct: reason, act, observe

**ReAct** ([paper](https://arxiv.org/abs/2210.03629)) interleaves a short **thought** with an **action** and an **observation**:

```text
Thought: I need the CEO's birth year. Search for the CEO first.
Action: search("Acme Corp CEO")
Observation: Acme Corp's CEO is Dana Ortiz.
Thought: Now find her birth year.
Action: search("Dana Ortiz born")
Observation: Dana Ortiz (born 1978) ...
Thought: I have the answer.
Final Answer: 1978
```

Why it works: the written thought is **working memory** that conditions the next action; observations ground it in reality rather than the model's guesses. Today's models with **native tool calling and thinking** do this implicitly: the "Thought" is the model's reasoning, "Action" is a tool-use block, "Observation" is the tool result. The text format above is still the clearest way to see the pattern, and open or small models are sometimes still driven with it.

```python run title="A ReAct loop: parse Thought/Action text and run tools" level=intermediate
import re

KB = {"acme ceo": "Acme Corp's CEO is Dana Ortiz.", "dana ortiz born": "Dana Ortiz was born in 1978."}
TOOLS = {"search": lambda q: KB.get(q.lower(), "no results")}

SCRIPT = iter([   # what a model would produce, one turn at a time
    'Thought: I need the CEO first.\nAction: search("acme ceo")',
    'Thought: Now her birth year.\nAction: search("dana ortiz born")',
    'Thought: I have what I need.\nFinal Answer: 1978',
])
def model(transcript): return next(SCRIPT)

def react(question, max_steps=6):
    transcript = f"Question: {question}\n"
    for step in range(max_steps):
        out = model(transcript)
        transcript += out + "\n"
        if m := re.search(r"Final Answer:\s*(.*)", out):
            return m.group(1), transcript
        if m := re.search(r'Action:\s*(\w+)\("(.*)"\)', out):
            obs = TOOLS[m.group(1)](m.group(2))
            transcript += f"Observation: {obs}\n"
    return None, transcript

answer, transcript = react("What year was Acme Corp's CEO born?")
print(transcript)
print("=>", answer)
```

## Plan-and-execute

For longer tasks, think **once up front**, then execute step by step, re-planning when reality diverges.

:::flow Plan-and-execute
Plan | the model writes an ordered list of steps (with success criteria)
Execute step | do the next step with tools
Check | did the step achieve its criterion? is the plan still valid?
Replan | if not, revise the remaining steps (do not restart from scratch)
Finish | when all steps are done, or the goal is met earlier
:::

Benefits: a global view, fewer detours, a visible **progress record** (good for users and for debugging), and the ability to use a **stronger model to plan** and a **cheaper one to execute**. Risks: a plan made without information can be wrong (hence replanning), and rigid plans waste effort when early steps change what is needed.

```python run title="Plan-and-execute with replanning on failure" level=advanced
def make_plan(goal):
    return ["find the failing test", "locate the bug", "write the fix", "run the full test suite"]

def execute(step, world):
    """Pretend execution against a tiny simulated project."""
    if step == "write the fix" and not world.get("bug_location"):
        return False, "cannot write a fix without knowing where the bug is"
    if step == "locate the bug":
        world["bug_location"] = "tax.py:42"
        return True, "bug in tax.py:42"
    if step == "run the full test suite":
        return world.get("fixed", False), "suite passes" if world.get("fixed") else "1 test still fails"
    if step == "write the fix":
        world["fixed"] = True
        return True, "patched tax.py"
    return True, "done"

def run(goal, max_replans=2):
    world, plan, done, replans = {}, make_plan(goal), [], 0
    plan.remove("locate the bug")                       # simulate a plan that skipped a needed step
    while plan:
        step = plan.pop(0)
        ok, note = execute(step, world)
        print(f"{'✔' if ok else '✘'} {step}: {note}")
        if ok:
            done.append(step)
        elif replans < max_replans:
            replans += 1
            plan = ["locate the bug", step] + plan       # replan: insert the missing prerequisite, keep the rest
            print("  ↻ replanned:", plan)
        else:
            return "gave up"
    return "goal reached"

print(run("fix the failing test"))
```

### The plan as an external object

Do not keep the plan only in the model's head. A **task list tool** (a todo list the agent reads and updates) gives it durable memory, makes progress visible, and survives context trimming. Coding agents rely on this heavily: the list shows what is done, what is in progress, and what is next, and a human can edit it.

## Reflection and verification

Agents make mistakes; the best ones **notice**. Patterns:

- **Self-check against criteria**: after finishing, compare the result with the requirements one by one.
- **Verify with the environment**: run the tests, execute the query, open the file, check the numbers. **External feedback beats self-opinion.** ([Reflexion](https://arxiv.org/abs/2303.11366) stores verbal lessons from failed attempts and retries.)
- **Critic / reviewer step**: a second prompt (or model) reviews with a checklist.
- **Test-time retries with feedback**: when verification fails, pass the failure details into the next attempt.

```python run title="Reflect-and-retry using real feedback (a unit test)" level=intermediate
def attempt(feedback):
    """Stand-in for a model writing code, improving when it sees the test failure."""
    if feedback and "expected" in feedback:
        return "def double(x):\n    return x * 2"
    return "def double(x):\n    return x + 2"                      # first attempt has a bug

def run_tests(code):
    ns = {}
    exec(code, ns)
    cases = [(2, 4), (5, 10)]
    for arg, want in cases:
        got = ns["double"](arg)
        if got != want:
            return False, f"double({arg}) returned {got}, expected {want}"
    return True, "all tests pass"

feedback = None
for i in range(1, 4):
    code = attempt(feedback)
    ok, feedback = run_tests(code)
    print(f"attempt {i}: {'PASS' if ok else 'FAIL'}: {feedback}")
    if ok: break
```

## Search over alternatives

Some problems benefit from **exploring several approaches** and picking the best: sample multiple plans or solutions, score them (with tests, a verifier, or a judge), and continue with the best (**best-of-n**, beam search over reasoning steps, **tree-of-thoughts**, [paper](https://arxiv.org/abs/2305.10601); process reward models, [paper](https://arxiv.org/abs/2305.20050)). This trades **test-time compute** for quality ([scaling test-time compute](https://arxiv.org/abs/2408.03314)); it works best when a **reliable verifier** exists.

## Reasoning models and interleaved thinking

Models trained with reinforcement learning to reason do much of this **internally**: they plan, try, check and backtrack in a hidden chain of thought before answering. Practical consequences for agents:

- **Interleaved thinking**: the model can think *between* tool calls, reacting to each observation, which makes ReAct-style behaviour native. On current APIs you enable adaptive thinking and set an **effort** level.
- **Prompting changes**: describe the **goal, constraints and success criteria** rather than step-by-step procedures; over-specifying the path can hurt.
- **Cost**: reasoning tokens are billed as output. Use low effort for routine tool steps and higher effort for planning and hard decisions.
- **Preserve thinking blocks** when continuing a tool-use conversation if your API requires it (on current Claude models, thinking blocks must be returned unchanged on the same model so reasoning carries across tool calls).
- **Do not rely on reading the raw chain of thought** for explanations or auditing: summaries may be provided, but the raw reasoning is not guaranteed to be faithful or even available.

```python local title="Agent with adaptive thinking between tool calls (Claude)"
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    thinking={"type": "adaptive", "display": "summarized"},
    output_config={"effort": "high"},
    tools=tools,
    messages=messages,
)
# append the WHOLE response.content (including thinking blocks) back into messages before sending tool results
messages.append({"role": "assistant", "content": response.content})
```

## Common planning failures

| Failure | Symptom | Mitigation |
|---|---|---|
| **No plan** | wanders, repeats, forgets goals | task list tool; "state your plan first" |
| **Over-planning** | spends 20 steps planning a 3-step job | scale planning to task size; effort control |
| **Plan never updated** | follows a stale plan after new info | replanning triggers, checkpoints |
| **Premature stopping** | declares victory without verifying | require verification steps and criteria in the prompt |
| **Not stopping** | keeps "improving" forever | step budgets, "good enough" criteria |
| **Tool myopia** | uses the first tool that seems to fit | describe alternatives; exploration step |
| **Overconfident reading** | trusts a bad observation | cross-check key facts; cite sources |
| **Goal drift** | the original request gets lost in long runs | restate the goal in the plan/notes each turn |

```quiz
? What does the "Thought" in ReAct provide?
- Nothing, it is decoration
+ Working memory that conditions the next action and records the reasoning
- A tool
> Writing reasoning down helps the model decide the next step and gives you a trace.

? When should an agent replan?
+ When a step fails or an observation invalidates the assumptions of the remaining plan
- After every single step
- Never
> Replan on divergence, keeping completed work.

? Why does external feedback (tests, validators) beat pure self-reflection?
+ The model cannot reliably detect its own errors without ground truth, while the environment tells the truth
- Tests are faster
- Reflection is forbidden
> Verify with the world, not just with another opinion.

? How should you prompt a reasoning model for planning-heavy tasks?
+ State the goal, constraints and success criteria, and let it plan, rather than scripting each step
- Give a 50-step procedure
- Ask it to say "step by step" repeatedly
> Over-prescribing can lower quality; control depth with effort.
```

:::problem Your coding agent often declares "done" without running tests, and sometimes loops forever "improving" code. Fix both. {level=medium tags="agents,planning,verification"}
Cover prompt, tools and limits.

:::solution Model answer
**Premature completion:** put a verification requirement in the system prompt ("you are done only when the test suite passes; show the output"), provide a **run_tests tool** and make its result part of the completion criteria; add a final-answer **checklist** (tests run, files changed, summary of changes). Enforce in code: refuse to end the loop without a recent passing test run. **Endless improvement:** step and cost budgets; define "good enough" (tests pass + lint clean); detect repeated edits to the same region and stop or escalate; ask for a **plan with exit criteria** up front. Evaluate on tasks with known-passing end states.
:::
:::

:::keypoints
- ReAct interleaves thoughts, actions and observations; native thinking plus tool calling gives the same behaviour.
- Plan-and-execute: write a plan, execute, check, replan on divergence; keep the plan in an external task list.
- Reflection is strongest when grounded in real feedback (tests, validators, data), not self-opinion.
- Search (best-of-n, trees) trades test-time compute for quality when a verifier exists.
- With reasoning models, describe goals and criteria, tune effort, preserve thinking blocks as required, and verify before declaring done.
:::

:::resources
- [ReAct](https://arxiv.org/abs/2210.03629), [Reflexion](https://arxiv.org/abs/2303.11366), [Tree of Thoughts](https://arxiv.org/abs/2305.10601) — the core papers.
- [Let's Verify Step by Step](https://arxiv.org/abs/2305.20050) — process supervision for reasoning.
- [Scaling LLM Test-Time Compute Optimally](https://arxiv.org/abs/2408.03314) — when more thinking beats a bigger model.
- [Anthropic: The "think" tool](https://www.anthropic.com/engineering/claude-think-tool) — giving agents a scratchpad mid-task.
- [Lilian Weng: Why We Think](https://lilianweng.github.io/posts/2025-05-01-thinking/) — a deep survey of test-time compute and reasoning.
- [Voyager](https://arxiv.org/abs/2305.16291) — an agent that plans, writes skills and verifies in a Minecraft environment.
:::
