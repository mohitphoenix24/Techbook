---
title: Tool-Using Research Agent
level: advanced
time: 70
icon: bot
cover: #14b8a6,#6366f1
tags: agents, react, tools, claude
summary: Build an agent that answers multi-step questions by searching a knowledge base, calculating and converting units — with a safe calculator, a ReAct loop with traces and limits, an evaluation suite, and the full Claude tool-use version.
---

Questions like *"How many times bigger is Canada than Japan, in square miles?"* need several steps: look up two facts, divide, convert units, answer. In this project you'll build an **agent** that does this — first with the classic **ReAct** loop (Thought → Action → Observation) running in your browser, then with Claude's native tool calling.

:::def ReAct
"**Re**asoning + **Act**ing": an agent pattern where the model alternates between writing a **thought** (what to do next), choosing an **action** (a tool call), and reading the **observation** (the tool's result), until it can give a **final answer**.
:::

:::flow The ReAct loop
Question | from the user
Thought | what do I need next?
Action | call a tool
Observation | tool result
Repeat | until enough info
Final answer | with the evidence
:::

## Step 1 — The knowledge base

```python run shared title="Step 1 · facts to search"
KB = [
    "France: capital Paris; population 68.4 million; area 551,695 square kilometres; currency euro.",
    "Japan: capital Tokyo; population 123.8 million; area 377,975 square kilometres; currency yen.",
    "Canada: capital Ottawa; population 41.5 million; area 9,984,670 square kilometres; currency Canadian dollar.",
    "India: capital New Delhi; population 1,450 million; area 3,287,263 square kilometres; currency rupee.",
    "Brazil: capital Brasília; population 212.6 million; area 8,515,767 square kilometres; currency real.",
    "Mount Everest: elevation 8,849 metres; located on the border of Nepal and China.",
    "Mont Blanc: elevation 4,806 metres; highest mountain in the Alps, on the France–Italy border.",
    "The Eiffel Tower in Paris is 330 metres tall and was completed in 1889.",
    "The speed of light in vacuum is 299,792 kilometres per second.",
]
print(len(KB), "facts")
```

## Step 2 — Tools

Each tool is a plain function with a clear docstring. The **calculator** is the important one to get right: never use `eval()` on model output — parse the expression safely.

```python run shared title="Step 2 · tools"
import ast
import operator
import re
from collections import Counter
import math

STOP = {"of", "the", "in", "is", "and", "a", "on", "what", "how", "to"}

def search(query: str) -> str:
    """Search the knowledge base and return the most relevant fact."""
    words = lambda t: Counter(w for w in re.findall(r"[a-z]+", t.lower()) if w not in STOP)
    q = words(query)
    scored = sorted(KB, key=lambda fact: -sum((words(fact) & q).values()))
    best = scored[0]
    return best if sum((words(best) & q).values()) > 0 else "No results."

_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.Pow: operator.pow, ast.USub: operator.neg}

def calculator(expression: str) -> str:
    """Evaluate arithmetic like '9984670 / 377975'. Supports + - * / ** and parentheses."""
    def ev(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.left), ev(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.operand))
        raise ValueError(f"unsupported expression element: {ast.dump(node)[:40]}")
    value = ev(ast.parse(expression.replace(",", ""), mode="eval").body)
    return f"{value:.6g}"

CONVERSIONS = {("km2", "mi2"): 0.386102, ("m", "ft"): 3.28084, ("km", "mi"): 0.621371}

def convert(value: float, from_unit: str, to_unit: str) -> str:
    """Convert units: km2->mi2, m->ft, km->mi."""
    factor = CONVERSIONS.get((from_unit, to_unit))
    if factor is None:
        return f"Error: can't convert {from_unit} to {to_unit}"
    return f"{float(value) * factor:.6g} {to_unit}"

TOOLS = {"search": search, "calculator": calculator, "convert": convert}

print(search("population of Japan"))
print(calculator("9,984,670 / 377,975"))
print(convert(8849, "m", "ft"))
try:
    calculator("__import__('os').system('rm -rf /')")
except ValueError as e:
    print("blocked:", e)
```

:::warn Never `eval()` model output
An LLM (or a prompt injection hidden in a document) could produce `__import__('os').system(...)`. The `ast`-based calculator only allows numbers and arithmetic operators, so anything else is rejected.
:::

## Step 3 — The ReAct prompt and parser

With a text-based protocol, the model writes lines like `Action: search[population of Japan]`. Your code parses them.

```python run shared title="Step 3 · protocol"
REACT_SYSTEM = """Answer the question using these tools:
- search[query]: look up a fact in the knowledge base
- calculator[expression]: arithmetic, e.g. calculator[12 / 4]
- convert[value, from_unit, to_unit]: units km2->mi2, m->ft, km->mi

Use this format, one step at a time:
Thought: what you need to do next
Action: tool_name[input]
(you will then receive) Observation: the result
... repeat Thought/Action/Observation as needed ...
Thought: I now know the answer
Final Answer: the answer, with the key numbers"""

ACTION_RE = re.compile(r"^Action:\s*(\w+)\[(.*)\]\s*$", re.M)
FINAL_RE = re.compile(r"^Final Answer:\s*(.+)$", re.M | re.S)

def parse_step(text):
    if m := FINAL_RE.search(text):
        return ("final", m.group(1).strip())
    if m := ACTION_RE.search(text):
        return ("action", m.group(1), m.group(2).strip())
    return ("invalid", text)

print(parse_step("Thought: I need Japan's area.\nAction: search[area of Japan]"))
print(parse_step("Thought: done.\nFinal Answer: about 26 times bigger"))
```

## Step 4 — A stand-in "model" for the browser

On your computer, the next step comes from an LLM. Here, a small **planner** plays the model's role: it reads the question and the observations so far and decides the next action — so the agent loop below runs for real. (It only understands questions about the facts in our knowledge base.)

```python run shared title="Step 4 · stand-in planner"
ATTRS = {"population": "population", "people": "population", "area": "area", "big": "area", "bigger": "area",
         "larger": "area", "tall": "elevation", "high": "elevation", "elevation": "elevation", "height": "elevation"}
ENTITIES = ["France", "Japan", "Canada", "India", "Brazil", "Mount Everest", "Mont Blanc", "Eiffel Tower"]

def extract_number(text, attr):
    m = re.search(rf"{attr} ([\d,\.]+)", text) or re.search(r"is ([\d,\.]+) metres", text)
    return float(m.group(1).replace(",", "")) if m else None

def planner_llm(transcript: str) -> str:
    question = transcript.split("Question:", 1)[1].split("\n", 1)[0]
    attr = next((v for k, v in ATTRS.items() if k in question.lower()), None)
    entities = sorted((e for e in ENTITIES if e.lower() in question.lower()),
                      key=lambda e: question.lower().index(e.lower()))        # keep the question's order
    observations = re.findall(r"Observation: (.*)", transcript)
    if attr is None or not entities:
        return "Thought: I can't find what to look up.\nFinal Answer: I don't know."
    values = [extract_number(o, attr if attr != "elevation" else "elevation") for o in observations if not o.startswith(("Result", "Converted"))]
    values = [v for v in values if v is not None]
    if len(values) < len(entities):                                   # still need facts
        e = entities[len(values)]
        return f"Thought: I need the {attr} of {e}.\nAction: search[{attr} of {e}]"
    calc = [o for o in observations if o.startswith("Result")]
    q = question.lower()
    if len(entities) == 2 and not calc:
        op = "-" if any(w in q for w in ["difference", "how much taller", "how much higher", "minus"]) else "/"
        return f"Thought: Now compare them.\nAction: calculator[{values[0]} {op} {values[1]}]"
    if ("mile" in q or "feet" in q) and not any(o.startswith("Converted") for o in observations):
        unit = ("km2", "mi2") if attr == "area" else ("m", "ft")
        base = values[0] if len(entities) == 1 else float(calc[0].split()[-1])
        return f"Thought: Convert to the requested unit.\nAction: convert[{base}, {unit[0]}, {unit[1]}]"
    answer = (observations[-1].split(": ", 1)[-1])
    return f"Thought: I now know the answer.\nFinal Answer: {answer}"

print(planner_llm("Question: What is the population of Japan?\n"))
```

## Step 5 — The agent loop

```python run shared title="Step 5 · ReAct agent"
def run_tool(name, raw_input):
    if name not in TOOLS:
        return f"Error: unknown tool '{name}'. Available: {', '.join(TOOLS)}"
    try:
        if name == "convert":
            value, src, dst = [x.strip() for x in raw_input.split(",")]
            return "Converted: " + TOOLS[name](float(value), src, dst)
        if name == "calculator":
            return "Result: " + TOOLS[name](raw_input)
        return TOOLS[name](raw_input)
    except Exception as e:                      # errors become observations the model can react to
        return f"Error: {e}"

def react_agent(question, llm=planner_llm, max_steps=6, verbose=True):
    transcript = f"{REACT_SYSTEM}\n\nQuestion: {question}\n"
    for step in range(1, max_steps + 1):
        output = llm(transcript)
        transcript += output + "\n"
        if verbose:
            print(output)
        parsed = parse_step(output)
        if parsed[0] == "final":
            return parsed[1]
        if parsed[0] == "invalid":
            observation = "Error: use the format 'Action: tool[input]' or 'Final Answer: ...'"
        else:
            observation = run_tool(parsed[1], parsed[2])[:500]       # truncate long tool output
        transcript += f"Observation: {observation}\n"
        if verbose:
            print(f"Observation: {observation}\n")
    return "Stopped: too many steps."

answer = react_agent("How many times bigger is Canada than Japan by area?")
print("\n✅ ANSWER:", answer)
```

```python run shared title="Step 5b · more questions"
for q in ["How much taller is Mount Everest than Mont Blanc?",
          "What is the area of India in square miles?",
          "How tall is Mount Everest in feet?",
          "What is the GDP of Mars?"]:
    print("=" * 70, "\n❓", q)
    print("✅", react_agent(q, verbose=False))
```

## Step 6 — Evaluate the agent

```python run shared title="Step 6 · evaluation"
EVAL = [
    ("How many times bigger is Canada than Japan by area?", 26.42),
    ("How much taller is Mount Everest than Mont Blanc?", 4043),
    ("What is the population of India divided by the population of Brazil?", 6.82),
    ("What is the area of France in square miles?", 213011),
    ("How tall is the Eiffel Tower in feet?", 1082.68),
    ("What is the GDP of Mars?", None),                         # should say it doesn't know
]

def numbers(text):
    return [float(x.replace(",", "")) for x in re.findall(r"-?[\d,]*\.?\d+", text)]

passed = 0
for question, expected in EVAL:
    answer = react_agent(question, verbose=False)
    if expected is None:
        ok = "don't know" in answer.lower()
    else:
        ok = any(abs(n - expected) / expected < 0.01 for n in numbers(answer))
    passed += ok
    print(f"{'✅' if ok else '❌'} {question}  →  {answer}")
print(f"\n{passed}/{len(EVAL)} correct")
```

## Step 7 — The real agent with Claude (run locally)

With a real LLM you don't need a text protocol or a planner: **native tool calling** gives you structured tool requests, and the model plans by itself. The SDK's tool runner handles the loop.

```python local title="research_agent_claude.py"
import anthropic
from anthropic import beta_tool

client = anthropic.Anthropic()

@beta_tool
def search_kb(query: str) -> str:
    """Search the knowledge base of country, mountain and landmark facts. Returns the single most relevant fact."""
    return search(query)

@beta_tool
def calculate(expression: str) -> str:
    """Evaluate an arithmetic expression with + - * / ** and parentheses, e.g. '9984670 / 377975'."""
    try:
        return calculator(expression)
    except Exception as e:
        return f"Error: {e}"

@beta_tool
def convert_units(value: float, from_unit: str, to_unit: str) -> str:
    """Convert a value between units. Supported: km2->mi2, m->ft, km->mi."""
    return convert(value, from_unit, to_unit)

runner = client.beta.messages.tool_runner(
    model="claude-opus-5-5",
    max_tokens=16000,
    system=("You are a careful research assistant. Use search_kb for facts — never rely on memory for numbers. "
            "Use calculate for all arithmetic. Finish with a one-sentence answer that shows the key numbers."),
    tools=[search_kb, calculate, convert_units],
    messages=[{"role": "user", "content": "How many times bigger is Canada than Japan, and what is Canada's area in square miles?"}],
)
for message in runner:
    for block in message.content:
        if block.type == "text":
            print("💬", block.text)
        elif block.type == "tool_use":
            print(f"🔧 {block.name}({block.input})")
```

:::tip Why the real model is better
The planner above only handles question shapes we coded. Claude handles **any** phrasing, decides when it has enough information, recovers from tool errors, and can call independent tools in **parallel** (e.g. both searches at once). Your job shifts to good tool design, clear instructions, limits and evaluation.
:::

:::exercise Extensions
1. Add a `wikipedia_summary`-style tool backed by a larger local document set (reuse your search engine from Project 4).
2. Add a **step budget** and a **cost budget** to `react_agent`, and log a trace as JSON lines.
3. Add a tool that requires **human approval** (e.g. `send_report(email)`) and make the loop ask before running it.
4. On your computer, run the Claude version against the `EVAL` list and compare scores with the planner.
:::

:::keypoints
- **ReAct**: Thought → Action → Observation, repeated until a Final Answer.
- Tools are functions with clear descriptions; **validate inputs** and never `eval` model output.
- Errors become **observations** so the agent can recover; cap steps and truncate long outputs.
- **Evaluate** agents on realistic multi-step questions, including ones they should decline.
- With Claude, use **native tool calling** + the tool runner instead of parsing text.
:::
