---
title: Prompting Techniques That Move the Needle
level: intermediate
time: 50
summary: Zero-shot and few-shot prompting, dynamic example selection, chain-of-thought and when it stops helping, self-consistency (with a simulation of why voting works), prompt chaining, decomposition, self-critique, role prompting, and how reasoning models and the effort setting change the playbook.
---

Once the fundamentals are in place, a handful of named techniques account for most of the improvement you will get from prompting alone. For each one: **what it is, when it helps, and what it costs.**

## 1. Zero-shot and few-shot

:::def Zero-shot prompting
Asking the model to do a task with instructions only, no examples. Works well when the task is common and the instructions are precise.
:::

:::def Few-shot (in-context learning)
Including a few input→output **examples** in the prompt. The model infers the pattern and applies it to the new input, without any weight updates ([GPT-3 paper](https://arxiv.org/abs/2005.14165)).
:::

Guidelines: use **3–5 diverse examples**, cover edge cases, keep format identical, and vary order sensibly. Interestingly, the *format and label space* of examples matter more than whether every label is correct ([Min et al.](https://arxiv.org/abs/2202.12837)), but do not rely on wrong labels.

### Dynamic few-shot: pick examples that look like the input

With a bank of labelled examples, retrieve the most **similar** ones for each query. This often beats a fixed set, and it is the same idea as RAG applied to examples.

```python run title="Choose few-shot examples by similarity" level=intermediate
import numpy as np, re, zlib

DIM = 128
def embed(text):
    v = np.zeros(DIM)
    for w in re.findall(r"[a-z]+", text.lower()):
        for i in range(max(1, len(w) - 2)):
            h = zlib.crc32(w[i:i + 3].encode()); v[h % DIM] += 1 if (h >> 8) & 1 else -1
    n = np.linalg.norm(v); return v / n if n else v

bank = [
    ("My card was charged twice", "billing"),
    ("Refund me for the duplicate invoice", "billing"),
    ("The app crashes when I upload a photo", "bug"),
    ("Button does nothing on Safari", "bug"),
    ("Please add a dark mode", "feature_request"),
    ("Could you support exporting to CSV?", "feature_request"),
]
E = np.stack([embed(t) for t, _ in bank])

def pick_examples(query, k=2):
    sims = E @ embed(query)
    return [bank[i] for i in np.argsort(-sims)[:k]]

query = "I was billed two times this month"
shots = pick_examples(query)
prompt = "Classify each message.\n" + "\n".join(f"Message: {t}\nCategory: {c}" for t, c in shots) + f"\nMessage: {query}\nCategory:"
print(prompt)
```

## 2. Chain-of-thought (CoT)

:::def Chain-of-thought prompting
Asking the model to write out intermediate reasoning steps before the final answer ([Wei et al.](https://arxiv.org/abs/2201.11903)). Producing the reasoning tokens gives the model "working memory" it would otherwise lack, because each generated token conditions the next.
:::

```text
Q: A shop sells pens at 3 for $2. How much do 12 pens cost?
Think step by step inside <thinking> tags, then give the final answer inside <answer> tags.
```

When to use it: multi-step maths, logic, planning, multi-hop questions, tricky classification. When **not**: simple lookups or extraction (slower, costlier, no gain), and with **reasoning models** that already think internally (explicit CoT adds little and can hurt).

```python run title="Separate the reasoning from the answer" level=easy
import re

def extract_answer(text):
    m = re.search(r"<answer>(.*?)</answer>", text, re.S)
    return m.group(1).strip() if m else None

model_output = """<thinking>
12 pens is 4 groups of 3 pens. Each group costs $2. So 4 x 2 = 8.
</thinking>
<answer>$8</answer>"""

print("reasoning shown to user? no.")
print("final answer parsed:", extract_answer(model_output))
print("missing tag ->", extract_answer("The answer is $8."))
```

Always parse the final answer from a delimiter. Do not show raw reasoning to end users unless you want them to see it, and do not train downstream code on its wording.

## 3. Self-consistency: vote across samples

Sample the model several times (with some randomness), then take the **majority answer**. Reasoning paths differ but correct answers agree more often than wrong ones do ([Wang et al.](https://arxiv.org/abs/2203.11171)).

```python run title="Why majority voting improves accuracy" level=intermediate
import numpy as np

rng = np.random.default_rng(0)

def noisy_solver(p_correct, n_wrong_options=4):
    """One sampled answer: correct with prob p_correct, else one of several wrong answers."""
    if rng.random() < p_correct:
        return "right"
    return f"wrong{rng.integers(n_wrong_options)}"

def majority(answers):
    vals, counts = np.unique(answers, return_counts=True)
    return vals[counts.argmax()]

def accuracy(p, k, trials=4000):
    return np.mean([majority([noisy_solver(p) for _ in range(k)]) == "right" for _ in range(trials)])

for p in (0.4, 0.6, 0.8):
    row = "  ".join(f"k={k:>2}: {accuracy(p, k):.0%}" for k in (1, 5, 15))
    print(f"single-sample accuracy {p:.0%} -> {row}")
```

It costs **k× the tokens** and only helps when the answer is short and comparable (a number, a label), and when errors are not systematic. If the model is wrong the same way every time, voting cannot fix it.

## 4. Prompt chaining: break big tasks into steps

:::def Prompt chaining
Decomposing a task into a sequence of focused calls, where each output feeds the next, with code (not the model) in between to validate and route.
:::

:::flow Chain: customer email → reply
Classify | which topic? (small, fast model)
Retrieve | fetch the policy for that topic (code)
Draft | write the reply using the policy
Check | does it follow the policy and tone rules? (second call or code)
Send or escalate | based on the check
:::

Benefits: each step is simpler and testable, you can use cheaper models for easy steps, and you can add **gates** (checks) between steps. Cost: more latency and more places to fail (remember: errors compound), so keep chains as short as the task allows.

```python run title="A chain with a validation gate" level=intermediate
def llm_classify(text):             # stands in for a call to a small model
    return "refund" if "refund" in text.lower() else "other"

def llm_draft(topic, policy, text):  # stands in for a larger model call
    return f"Hi! About your {topic} request: per policy, {policy}. Thanks for your patience."

POLICY = {"refund": "refunds are issued within 30 days of purchase"}

def check_reply(reply, policy):
    problems = []
    if policy not in reply: problems.append("policy not quoted")
    if len(reply.split()) > 40: problems.append("too long")
    return problems

def handle(email):
    topic = llm_classify(email)                      # step 1
    if topic not in POLICY:                          # gate: unknown topic -> human
        return "ESCALATE to a human", []
    reply = llm_draft(topic, POLICY[topic], email)   # step 2
    problems = check_reply(reply, POLICY[topic])     # step 3 (deterministic check)
    return (reply if not problems else "ESCALATE to a human"), problems

for e in ["I want a refund for order 118", "My account is locked"]:
    print(e, "->", handle(e))
```

## 5. Decomposition and self-critique

- **Least-to-most / decomposition:** ask the model to list sub-questions, answer them in order, then combine. Useful for multi-hop questions.
- **Draft → critique → revise:** generate an answer, have the model (or a second prompt) critique it against explicit criteria, then rewrite. Gains are real on writing and code, but self-critique alone cannot fix errors the model cannot detect; pair it with **tests, tools or retrieval** ([Reflexion](https://arxiv.org/abs/2303.11366) adds feedback from the environment).
- **Tree of Thoughts** ([paper](https://arxiv.org/abs/2305.10601)) explores and scores several reasoning branches; powerful but expensive, mostly superseded by reasoning models for general use.

## 6. Role and persona prompting

"You are an experienced tax accountant" sets vocabulary, depth and tone. It helps style and perspective more than raw ability. A specific role plus a concrete audience ("explaining to a founder with no finance background") works better than a famous name.

## 7. Reasoning models and the effort dial

Modern reasoning models do chain-of-thought **internally** before answering. For them:

- Describe the **goal, constraints and what good looks like**, not a rigid step list.
- Use the **effort** setting as your main lever: `low` for easy or latency-sensitive work, `high` or above for hard problems. More effort = more thinking tokens = higher cost and latency, with diminishing returns.
- Do not ask for "think step by step" in the visible answer unless you want the explanation as part of the output.
- For simple tasks, high effort wastes money: measure.

```python run title="Choosing effort by task: an expected-cost sketch" level=easy
# (accuracy, cost per task in cents) per effort level: example numbers you would measure with evals
effort_table = {
    "easy task":  {"low": (0.97, 0.2), "medium": (0.98, 0.5), "high": (0.98, 1.4)},
    "hard task":  {"low": (0.55, 0.4), "medium": (0.72, 1.5), "high": (0.88, 5.0)},
}
for task, rows in effort_table.items():
    print(task)
    for effort, (acc, cents) in rows.items():
        print(f"   {effort:6} accuracy {acc:.0%}  cost {cents:>4.1f}¢  cost per correct answer {cents / acc:5.2f}¢")
```

The point: spend effort where accuracy actually moves.

## What to try, in order

1. Clear instructions + delimiters + output format (free).
2. Add 3–5 examples, or dynamic examples (cheap).
3. Give it room to think: CoT or higher effort for reasoning-heavy tasks.
4. Add a verification step (code, tests, schema, retrieval, second call).
5. Self-consistency for short answers where cost allows.
6. Chain/decompose if one prompt is doing too many jobs.
7. Only then consider fine-tuning (module 8).

```quiz
? When does self-consistency help most?
- Long creative writing
+ Short, comparable answers (numbers, labels) where errors are random rather than systematic
- Any task at no extra cost
> Majority voting needs answers that can be compared and independent errors; it costs k× tokens.

? Why can explicit "think step by step" be unnecessary on a reasoning model?
+ The model already reasons internally; effort controls how much
- Reasoning models cannot reason
- Chain-of-thought is banned
> Control depth with the effort setting instead.

? What is a good reason to chain prompts?
- It always reduces latency
+ Each step is simpler, testable, and can use a cheaper model, with deterministic gates between steps
- Chains never fail
> Chains add steps (and latency), but give control and testability.

? Few-shot examples are best chosen to be…
- identical to each other
+ diverse and realistic, including an edge case, in the exact output format
- as long as possible
> Diversity and format fidelity are what the model learns from.
```

:::problem A classification prompt is 85% accurate and you need 95%. List the experiments you would run, in order of cost. {level=medium tags="prompting,iteration"}
Think about data, prompt, model and system changes.

:::solution Model answer
(1) **Read the 15% errors** and cluster them: ambiguity in labels? missing context? format slips? (2) Fix label definitions and add an "other/unsure" route; add the confusing cases as **few-shot examples** (or dynamic few-shot). (3) Put data in tags, add short reasoning before the label if errors are logic-related. (4) Try a **stronger model or higher effort** and measure the gain vs cost. (5) **Self-consistency** or a second-pass verifier on low-confidence items. (6) Route uncertain items to a human. (7) If a stable pattern remains and you have 1–10K labelled examples, **fine-tune** a small model. Re-run the full eval after each change.
:::
:::

:::keypoints
- Few-shot examples (ideally retrieved by similarity) convey format and edge cases better than description.
- Chain-of-thought helps multi-step reasoning on non-reasoning models; parse the answer from a delimiter.
- Self-consistency votes across samples; it costs k× and needs short, comparable answers.
- Chain prompts to simplify steps and add deterministic gates; keep chains short.
- With reasoning models, state goals and tune effort instead of dictating steps.
- Escalate techniques in order of cost, and measure each on a fixed eval set.
:::

:::resources
- [Chain-of-Thought Prompting Elicits Reasoning](https://arxiv.org/abs/2201.11903), [Self-Consistency](https://arxiv.org/abs/2203.11171), [Tree of Thoughts](https://arxiv.org/abs/2305.10601), [Reflexion](https://arxiv.org/abs/2303.11366) — the core papers.
- [The Prompt Report](https://arxiv.org/abs/2406.06608) — a taxonomy of techniques with evidence.
- [Lilian Weng: Prompt Engineering](https://lilianweng.github.io/) — see her 2023 prompt-engineering post for a rigorous overview.
- [Claude docs: Prompt engineering overview](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview) — chain-of-thought, chaining, examples and extended thinking.
- [Anthropic: The "think" tool](https://www.anthropic.com/engineering/claude-think-tool) — giving agents space to reason mid-task.
- [DSPy](https://dspy.ai) — treat prompts as programs and optimise them against a metric.
:::
