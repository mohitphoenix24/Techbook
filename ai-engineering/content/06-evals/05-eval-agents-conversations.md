---
title: Evaluating Agents and Multi-Turn Systems
level: advanced
time: 50
summary: Agents and conversations break single-turn eval habits. Outcome versus process, state-based graders, tool-call correctness, multi-turn scenarios with simulated users, handling non-determinism with repeated trials (pass^k), sandboxed environments, trajectory review, grading efficiency and safety, and a runnable harness that scores a simulated agent trajectory on outcome, process and cost.
---

Evaluating a single prompt is straightforward: input, output, score. Agents and multi-turn assistants are harder because **the thing you care about is spread across a sequence**: many decisions, tool calls and intermediate states, with randomness at each step. This lesson extends your eval toolkit to those systems.

## What to measure

| Layer | Question | Examples |
|---|---|---|
| **Outcome** | Did the task end in the right state? | refund issued once, correct amount; tests pass; the right record updated; the user's question answered |
| **Process** | Was the path sensible, efficient and policy-compliant? | verified identity before acting; used the right tools; no redundant calls; asked for missing info |
| **Efficiency** | What did it cost? | steps, tokens, dollars, latency |
| **Safety / policy** | Did it avoid forbidden actions and respect limits? | no refund above authority; no data leaked; approvals obtained |
| **Experience** (multi-turn) | Was the conversation good for the user? | clarity, tone, resolution without needless turns |
| **Robustness** | Does it hold up under variation, errors and adversaries? | tool failures, ambiguous or hostile users |

**Grade outcomes first** (they are objective), then process and efficiency. Beware of grading only the **path** ("it must call tools in this exact order"): agents often find valid alternatives, and rigid path checks punish creativity. Check **constraints** (must/must-not) rather than exact sequences.

## Outcome grading by state

The best grader for an agent that acts on a system is to **inspect the system afterwards**: query the database, read the file, run the tests. This is objective, robust to different paths, and cannot be fooled by a confident-sounding final message.

```python run title="State-based grading: check the world, not the words" level=intermediate
def final_state_checks(db):
    checks = {
        "refund created exactly once":   len([r for r in db["refunds"] if r["order"] == "A-100"]) == 1,
        "refund amount correct":         all(abs(r["amount"] - 129.00) < 0.01 for r in db["refunds"] if r["order"] == "A-100"),
        "order marked refunded":         db["orders"]["A-100"]["status"] == "refunded",
        "no other orders touched":       all(o["status"] == "delivered" for k, o in db["orders"].items() if k != "A-100"),
        "customer notified":             any(e["to"] == "c77@example.com" for e in db["emails"]),
    }
    return checks

# the world after two different agent runs
run_a = {"refunds": [{"order": "A-100", "amount": 129.00}], "orders": {"A-100": {"status": "refunded"}, "A-200": {"status": "delivered"}},
         "emails": [{"to": "c77@example.com"}]}
run_b = {"refunds": [{"order": "A-100", "amount": 129.00}, {"order": "A-100", "amount": 129.00}], "orders": {"A-100": {"status": "refunded"}, "A-200": {"status": "delivered"}},
         "emails": []}
for name, db in (("run A", run_a), ("run B (double refund, no email)", run_b)):
    res = final_state_checks(db)
    print(f"{name}: {sum(res.values())}/{len(res)} checks pass", [k for k, v in res.items() if not v] or "")
```

Run B's final message could say "All done!", yet the state shows a **double refund and no notification**. State-based grading catches what text-based grading misses.

## Tool-call evaluation

When tool use itself is the thing under test (routing, argument extraction), compare the **tool calls** to expectations:

- **Tool selection**: was the right tool (or any acceptable tool) called?
- **Argument correctness**: exact match for ids, tolerance for free text, schema validity.
- **Necessary vs redundant calls**: precision and recall over the set of expected calls.
- **Order constraints** only where order truly matters (identity check before refund).

```python run title="Score tool calls: precision, recall and order constraints" level=intermediate
def score_tool_calls(actual, expected, must_precede=()):
    """actual/expected: lists of (tool, frozenset(args.items())). must_precede: pairs (a, b): a must occur before b."""
    a_set, e_set = set(actual), set(expected)
    precision = len(a_set & e_set) / len(a_set) if a_set else 0.0
    recall = len(a_set & e_set) / len(e_set) if e_set else 1.0
    names = [t for t, _ in actual]
    order_ok = all(a in names and b in names and names.index(a) < names.index(b) for a, b in must_precede)
    return precision, recall, order_ok

call = lambda tool, **kw: (tool, frozenset(kw.items()))
expected = [call("verify_customer", id="C-77"), call("get_order", order_id="A-100"), call("issue_refund", order_id="A-100", amount=129.0)]
runs = {
    "good":      [call("verify_customer", id="C-77"), call("get_order", order_id="A-100"), call("issue_refund", order_id="A-100", amount=129.0)],
    "skip_auth": [call("get_order", order_id="A-100"), call("issue_refund", order_id="A-100", amount=129.0)],
    "wasteful":  [call("get_order", order_id="A-100"), call("get_order", order_id="A-100"), call("search_policy", q="refund"),
                  call("verify_customer", id="C-77"), call("issue_refund", order_id="A-100", amount=129.0)],
    "wrong_arg": [call("verify_customer", id="C-77"), call("get_order", order_id="A-100"), call("issue_refund", order_id="A-100", amount=12.9)],
}
for name, actual in runs.items():
    p, r, order = score_tool_calls(actual, expected, must_precede=[("verify_customer", "issue_refund")])
    print(f"{name:10} precision={p:.2f} recall={r:.2f} verify-before-refund={order}")
```

## Multi-turn conversations: scenarios and simulated users

A conversation is an interaction between **two parties**. To evaluate it without hand-writing every turn, define **scenarios** (a goal, a persona, hidden facts, and success criteria) and drive the assistant with a **simulated user**, itself an LLM (or a script) role-playing the persona. This is the idea behind benchmarks such as τ-bench (tool-agent-user interaction with policy compliance and **pass^k** consistency).

```python run title="A scripted simulated user driving an assistant, then grading the outcome" level=advanced
class SimUser:
    """Plays a customer with a goal and a hidden fact (the order id), revealing it only when asked."""
    def __init__(self): self.turn, self.goal_met = 0, False
    def reply(self, assistant_msg):
        self.turn += 1
        if self.turn == 1: return "Hi, my blender arrived broken and I want a refund."
        if "order" in assistant_msg.lower() and "number" in assistant_msg.lower(): return "It's order A-100."
        if "refunded" in assistant_msg.lower(): self.goal_met = True; return "Great, thanks!"
        return "Can you just fix it?"

def assistant_policy(history, user_msg):
    """The system under test (a rule-based stand-in): must collect the order id before refunding."""
    text = user_msg.lower()
    if "a-100" in text: return "I've refunded order A-100 ($129). You'll see it in 3-5 days."
    if "refund" in text: return "Sorry about that! Could you share your order number?"
    return "How can I help?"

def run_scenario(max_turns=6):
    user, history, msg = SimUser(), [], ""
    for _ in range(max_turns):
        user_msg = user.reply(msg)
        msg = assistant_policy(history, user_msg)
        history.append((user_msg, msg))
        if user.goal_met: break
    return history, user.goal_met

history, success = run_scenario()
for u, a in history: print(f"user: {u}\nbot : {a}")
print("\noutcome: goal met =", success, "| turns =", len(history), "| asked for missing info =", any("order number" in a for _, a in history))
```

Tips for simulated users: give them **realistic, varied personas** (impatient, vague, hostile, non-native speakers), **hidden information** (so the assistant must ask), and **adversarial goals** (try to exceed policy). Keep the simulator model separate from the system under test. Always **read samples** of simulated conversations, since simulators can be unrealistically cooperative.

## Non-determinism: repeat and measure consistency

A single run of an agent is a **sample**. Run each task several times (k = 3–10) and report:

- **Mean success rate** per task and overall.
- **pass@k** (any of k succeeds): relevant when retries or verification are possible.
- **pass^k** (all k succeed): relevant for reliability users depend on. An agent with 80% per-attempt success has only ~33% pass^5.
- **Variance** in steps and cost.

Use **confidence intervals** (bootstrap) when comparing versions, since agent evals are noisy and expensive.

## Environments and sandboxes

Realistic agent evals need an **environment** the agent can act on without real-world consequences:

- A **simulated or snapshotted backend** (a test database, mock APIs with fixed responses, a fake email service that records messages).
- **Reset between runs** (fresh containers, database fixtures) so runs are independent.
- **Controlled failures** (inject tool errors, timeouts, rate limits, empty results) to measure **recovery**.
- **Sandboxed code execution** for coding agents (containers with tests).
- Deterministic **time and randomness** where possible.

Frameworks: Inspect AI ([site](https://inspect.aisi.org.uk/)) provides tasks, solvers, scorers and sandboxes; SWE-bench harnesses; and many agent platforms offer trace-based evals.

## Reading trajectories

Metrics will not explain *why* an agent failed. Build the habit of **reading trajectories**: a sample of successes (are they succeeding for the right reasons?) and all failures. Categorise failures at the **first point of error**: misunderstood the task, wrong tool, bad arguments, misread observation, gave up early, looped, violated policy. Count categories, fix the biggest, re-run. Tools that render traces (Langfuse, LangSmith, Phoenix, Braintrust, Inspect's viewer) make this practical.

## Grading efficiency and safety

```python run title="Score a trajectory on outcome, process, efficiency and safety" level=intermediate
def grade_trajectory(t):
    """t: dict with keys outcome_ok, steps, tokens, cost, tool_errors, forbidden_actions, approvals_skipped."""
    scores = {
        "outcome":    1.0 if t["outcome_ok"] else 0.0,
        "efficiency": max(0.0, 1.0 - max(0, t["steps"] - 8) / 20),                  # budget: ~8 steps is ideal
        "robustness": max(0.0, 1.0 - 0.25 * t["tool_errors"]),
        "safety":     0.0 if (t["forbidden_actions"] or t["approvals_skipped"]) else 1.0,
    }
    scores["overall"] = 0.0 if scores["safety"] == 0 else scores["outcome"] * (0.5 * scores["efficiency"] + 0.5 * scores["robustness"])
    return scores

runs = {
    "tidy success":     dict(outcome_ok=True,  steps=7,  tokens=40_000,  cost=0.18, tool_errors=0, forbidden_actions=0, approvals_skipped=0),
    "slow success":     dict(outcome_ok=True,  steps=22, tokens=210_000, cost=0.95, tool_errors=3, forbidden_actions=0, approvals_skipped=0),
    "unsafe success":   dict(outcome_ok=True,  steps=6,  tokens=35_000,  cost=0.15, tool_errors=0, forbidden_actions=0, approvals_skipped=1),
    "failure":          dict(outcome_ok=False, steps=25, tokens=260_000, cost=1.20, tool_errors=5, forbidden_actions=0, approvals_skipped=0),
}
for name, t in runs.items():
    s = grade_trajectory(t)
    print(f"{name:15} " + "  ".join(f"{k}={v:.2f}" for k, v in s.items()))
```

Notice the design: **safety is a gate** (a violation zeroes the score regardless of outcome), outcome multiplies the rest, and efficiency/robustness shape the remainder.

## Production monitoring for agents

Offline evals are necessary, never sufficient. In production track: task completion and escalation rates, steps and cost per task, tool error rates, budget stops and loop detections, approval request and denial rates, user feedback, and **sampled judge scores on live traces**. Feed incidents back into the scenario set.

```quiz
? Why is state-based grading preferred for agents that act on systems?
+ It checks the actual outcome in the world and cannot be fooled by a confident final message
- It is cheaper than any other method
- It checks every word
> Inspect the database, files or tests after the run.

? Why should you avoid requiring an exact sequence of tool calls?
+ Valid solutions may take different paths; check constraints (must/must-not, ordering where it matters) instead
- Sequences are too short
- Tools are random
> Over-rigid path checks punish legitimate alternatives.

? What does a simulated user provide?
+ A way to run many realistic multi-turn scenarios with personas and hidden facts, without hand-writing every turn
- A replacement for all human review
- A guarantee of realism
> Always read samples; simulators can be too cooperative.

? An agent succeeds 90% of attempts. What does pass^3 measure?
+ The chance all three attempts succeed (about 73%), reflecting reliability for repeated use
- The chance at least one succeeds
- The average cost
> 0.9^3 ≈ 0.73.
```

:::problem Design the evaluation for a customer-support agent that can look up orders and issue refunds up to $100. {level=hard tags="agents,evals,design"}
Cover scenarios, graders, consistency and monitoring.

:::solution Model answer
Build a **sandboxed backend** (test DB, fake email) and 60–100 **scenarios** spanning eligible, ineligible, ambiguous, missing-info, hostile and policy-probing cases (including requests above $100 and attempts to skip verification), each with a persona and hidden facts for a **simulated user**. **Outcome graders** inspect final state (single correct refund, status updated, notification sent, no extra changes). **Process/safety graders**: must verify the customer before refunding; no refund above authority; approvals respected; tool-call precision/recall; constraints not exact sequences. **Efficiency**: steps, tokens, cost, latency. Run each scenario **5×** and report success, **pass^5**, variance and cost with bootstrap intervals. Add an **LLM judge** for tone with calibration. Read failures by first error; inject tool failures to test recovery. In production, monitor completion/escalation rates and sampled judge scores, and add every incident as a scenario.
:::
:::

:::keypoints
- Evaluate outcome (state), process (constraints, tool use), efficiency, safety and robustness; grade outcomes by inspecting the world.
- Tool-call evals use precision/recall and order constraints only where order matters.
- Multi-turn evals use scenarios and simulated users with personas, hidden facts and adversarial goals; read samples for realism.
- Run each task multiple times; report success, pass@k, pass^k, variance and confidence intervals.
- Use sandboxed, resettable environments with injected failures; read trajectories and classify first errors; monitor in production.
:::

:::resources
- [Inspect AI](https://inspect.aisi.org.uk/) — an evaluation framework with agents, tools and sandboxes.
- [SWE-bench](https://www.swebench.com) and its [paper](https://arxiv.org/abs/2310.06770) — outcome-based evaluation by tests.
- [Anthropic: Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — evaluating tools with realistic agentic tasks.
- [Berkeley Function-Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) — tool-call evaluation at scale.
- [Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/abs/2503.13657) — a failure taxonomy from annotated traces.
- [Langfuse docs](https://langfuse.com/docs) — traces, datasets and online evaluators for agent runs.
:::
