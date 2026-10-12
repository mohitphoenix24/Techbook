---
title: Structured Output & Tool Calling
level: advanced
time: 45
summary: Make LLMs return validated JSON your code can trust, and let them call your Python functions — tool definitions, the tool-use loop, parallel calls, errors, and the SDK's tool runner.
---

So far the model returns **text for humans**. Real applications need **data for code**: a JSON object to store, a category to route on, a function to call. This lesson covers the two features that turn an LLM into a programmable component: **structured outputs** and **tool calling** (also called function calling).

## Part 1 — Structured outputs

:::def Structured output
Constraining the model's response to match a **JSON Schema** you provide, so the output is guaranteed to be valid JSON with the right fields and types — no regex parsing, no "Sure! Here's your JSON:" chatter.
:::

### The Pydantic way (recommended)

```python local title="client.messages.parse with a Pydantic model"
from typing import Literal
from pydantic import BaseModel, Field
import anthropic

class Ticket(BaseModel):
    category: Literal["billing", "bug", "feature_request", "question"]
    priority: int = Field(ge=1, le=5, description="1 = low, 5 = urgent")
    summary: str = Field(description="One sentence summary of the problem")
    customer_sentiment: Literal["positive", "neutral", "negative"]

client = anthropic.Anthropic()
response = client.messages.parse(
    model="claude-opus-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Classify this ticket: 'I've been charged twice for March and nobody answers my emails!!'"}],
    output_format=Ticket,
)
ticket = response.parsed_output          # a validated Ticket instance
print(ticket.category, ticket.priority, ticket.summary)
```

### The raw JSON-Schema way

```python local title="output_config with a JSON schema"
import json
import anthropic

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Extract: John Smith (john@example.com) wants the Enterprise plan."}],
    output_config={
        "format": {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "plan": {"type": "string"},
                },
                "required": ["name", "email", "plan"],
                "additionalProperties": False,
            },
        }
    },
)
data = json.loads(response.content[0].text)
print(data)
```

### Validation is still your job (runs here)

Even with guaranteed-valid JSON, **business rules** (date in the future, IDs that exist, totals that add up) need checking. And when you can't use structured outputs, a **validate-and-repair loop** is the fallback:

```python run level=intermediate
import json
from typing import Literal
from pydantic import BaseModel, Field, ValidationError

class Ticket(BaseModel):
    category: Literal["billing", "bug", "feature_request", "question"]
    priority: int = Field(ge=1, le=5)
    summary: str = Field(max_length=100)

# A fake model that makes a mistake first, then fixes it when shown the error.
attempts = iter([
    '{"category": "Billing", "priority": 9, "summary": "Charged twice"}',
    '{"category": "billing", "priority": 5, "summary": "Customer charged twice for March"}',
])
def fake_llm(prompt):
    return next(attempts)

prompt = "Classify the ticket as JSON matching the schema:\n" + json.dumps(Ticket.model_json_schema())
for attempt in range(1, 4):
    raw = fake_llm(prompt)
    try:
        ticket = Ticket.model_validate_json(raw)
        print(f"attempt {attempt}: ✓ {ticket}")
        break
    except ValidationError as e:
        problems = "; ".join(f"{err['loc'][0]}: {err['msg']}" for err in e.errors())
        print(f"attempt {attempt}: ✗ {problems}")
        prompt += f"\n\nYour previous output was invalid ({problems}). Return corrected JSON only."
```

## Part 2 — Tool calling

:::def Tool calling (function calling)
Giving the model a list of **tools** — each with a name, a description and a JSON Schema for its inputs. When the model decides a tool would help, it replies with a **`tool_use`** block (the tool name + arguments) instead of a final answer. **Your code** runs the function and sends the result back; the model then continues.
:::

:::analogy
The model is a **smart manager who can't touch a keyboard**. It can say "please look up order #123" or "please calculate 17% of 2,340", but **you** (your code) do the actual work and report back. The model decides *what* to do; your code decides *whether* and *how* to do it.
:::

:::flow The tool-use loop
Send request + tools | messages, tool definitions
Model replies tool_use | name + JSON arguments
Your code runs the tool | call the Python function
Send tool_result | matched by tool_use_id
Model answers | or asks for more tools
:::

### Defining a tool

```python
weather_tool = {
    "name": "get_weather",
    "description": "Get the current weather for a city. Use this whenever the user asks about weather conditions.",
    "input_schema": {
        "type": "object",
        "properties": {
            "city": {"type": "string", "description": "City name, e.g. 'Paris'"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "description": "Temperature unit"},
        },
        "required": ["city"],
    },
}
```

:::tip Descriptions are prompts
The model decides **when** and **how** to call a tool almost entirely from its `name` and `description`. Write them like documentation for a new colleague: what it does, when to use it, what each parameter means, and any limits.
:::

### The full loop, with a scripted model (runs here)

This simulation uses the **same message shapes** as the real API, so you can see exactly what flows back and forth.

```python run level=advanced
import json
from types import SimpleNamespace as NS

# ---------------- your tools (real Python functions) ----------------
def get_weather(city: str, unit: str = "celsius") -> dict:
    fake_db = {"paris": 18, "tokyo": 24, "pune": 31}
    temp_c = fake_db.get(city.lower())
    if temp_c is None:
        raise ValueError(f"no weather data for {city}")
    temp = temp_c if unit == "celsius" else round(temp_c * 9 / 5 + 32)
    return {"city": city, "temperature": temp, "unit": unit, "conditions": "sunny"}

TOOLS = {"get_weather": get_weather}

# ---------------- a scripted stand-in for the model ----------------
def fake_model(messages, tools):
    last = messages[-1]
    if last["role"] == "user" and isinstance(last["content"], str):
        # first turn: the model decides to call the tool twice (parallel tool use)
        return NS(stop_reason="tool_use", content=[
            NS(type="text", text="Let me check both cities."),
            NS(type="tool_use", id="toolu_01", name="get_weather", input={"city": "Paris"}),
            NS(type="tool_use", id="toolu_02", name="get_weather", input={"city": "Tokyo", "unit": "celsius"}),
        ])
    # after tool results: answer using them
    results = {r["tool_use_id"]: json.loads(r["content"]) for r in last["content"]}
    p, t = results["toolu_01"], results["toolu_02"]
    return NS(stop_reason="end_turn", content=[NS(type="text", text=(
        f"It's {p['temperature']}°C in Paris and {t['temperature']}°C in Tokyo — Tokyo is warmer by {t['temperature'] - p['temperature']}°C."))])

# ---------------- the agentic loop (same structure as with the real SDK) ----------------
messages = [{"role": "user", "content": "Is it warmer in Paris or Tokyo right now?"}]
while True:
    response = fake_model(messages, tools=list(TOOLS))
    messages.append({"role": "assistant", "content": response.content})
    if response.stop_reason != "tool_use":
        break
    tool_results = []
    for block in response.content:
        if block.type == "tool_use":
            print(f"→ model calls {block.name}({block.input})")
            try:
                output = TOOLS[block.name](**block.input)
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(output)})
            except Exception as e:
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(e), "is_error": True})
            print(f"← result: {tool_results[-1]['content']}")
    messages.append({"role": "user", "content": tool_results})     # ALL results in ONE user message

print("\nFinal answer:", "".join(b.text for b in response.content if b.type == "text"))
```

:::def tool_use_id
Every `tool_use` block has an `id`. Your `tool_result` must carry the matching `tool_use_id`, so the model knows which result belongs to which call — essential when it calls several tools at once.
:::

:::warn Return all tool results together
When the model makes several tool calls in one turn (parallel tool use), send **all** the `tool_result` blocks back in a **single** user message. For a tool that failed, still return a result with `"is_error": True` and a useful message — never silently drop it.
:::

### The same loop with the real API

```python local title="Manual tool-use loop with Claude"
import json
import anthropic

client = anthropic.Anthropic()
tools = [{
    "name": "get_weather",
    "description": "Get the current weather for a city.",
    "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}, "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}},
        "required": ["city"],
    },
}]

def run_tool(name, args):
    if name == "get_weather":
        return {"city": args["city"], "temperature": 18, "conditions": "sunny"}   # call a real API here
    raise ValueError(f"unknown tool {name}")

messages = [{"role": "user", "content": "Is it warmer in Paris or Tokyo right now?"}]
while True:
    response = client.messages.create(model="claude-opus-5-5", max_tokens=16000, tools=tools, messages=messages)
    messages.append({"role": "assistant", "content": response.content})   # keep the full content, incl. tool_use blocks
    if response.stop_reason != "tool_use":
        break
    results = []
    for block in response.content:
        if block.type == "tool_use":
            try:
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(run_tool(block.name, block.input))})
            except Exception as e:
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(e), "is_error": True})
    messages.append({"role": "user", "content": results})

print(next(b.text for b in response.content if b.type == "text"))
```

### Even easier: the SDK's tool runner

The Anthropic SDK can run that loop for you. Decorate plain Python functions — the schema is built from the type hints and docstring:

```python local title="Tool runner with @beta_tool"
import anthropic
from anthropic import beta_tool

client = anthropic.Anthropic()

@beta_tool
def get_weather(city: str, unit: str = "celsius") -> str:
    """Get the current weather for a city.

    Args:
        city: City name, e.g. "Paris".
        unit: Either "celsius" or "fahrenheit".
    """
    return f"18 degrees {unit}, sunny, in {city}"

runner = client.beta.messages.tool_runner(
    model="claude-opus-5-5",
    max_tokens=16000,
    tools=[get_weather],
    messages=[{"role": "user", "content": "Is it warmer in Paris or Tokyo right now?"}],
)
for message in runner:                      # one message per model turn; tools run automatically
    for block in message.content:
        if block.type == "text":
            print(block.text)
```

## Tool schemas from Pydantic

Keep one source of truth: define arguments as a Pydantic model, generate the schema for the API, and validate the model's arguments before running anything.

```python run level=advanced
import json
from pydantic import BaseModel, Field, ValidationError

class SearchOrders(BaseModel):
    """Search a customer's orders. Use when the user asks about an order's status, items or delivery."""
    customer_email: str = Field(description="The customer's email address")
    status: str | None = Field(None, description="Optional filter: 'shipped', 'pending' or 'cancelled'")
    limit: int = Field(5, ge=1, le=20, description="Maximum number of orders to return")

def to_tool(model: type[BaseModel]) -> dict:
    schema = model.model_json_schema()
    return {"name": model.__name__, "description": (model.__doc__ or "").strip(), "input_schema": schema}

print(json.dumps(to_tool(SearchOrders), indent=2)[:600], "...")

# Validate what the model sends BEFORE executing anything
for model_args in [{"customer_email": "ada@example.com", "limit": 3}, {"customer_email": "ada@example.com", "limit": 500}]:
    try:
        args = SearchOrders.model_validate(model_args)
        print("✓ run search with", args.model_dump())
    except ValidationError as e:
        print("✗ reject:", e.errors()[0]["msg"], "→ send back as tool_result with is_error=True")
```

:::def strict tool use
Setting `"strict": True` on a tool definition (with `additionalProperties: false` and all fields listed in `required`) makes the API guarantee the model's arguments exactly match your schema.
:::

## Choosing how tools are used

| Setting | Effect |
|---|---|
| `tool_choice={"type": "auto"}` (default) | the model decides whether to call a tool |
| `tool_choice={"type": "none"}` | tools are visible but not called |
| clear instructions in the prompt | the way to *encourage* a specific tool on current models |

Some current models (including Claude Opus 5.5) don't support **forcing** a particular tool call; use `auto` plus a clear instruction, or structured outputs if all you need is JSON back.

## Server tools

Some tools run **on Anthropic's servers** — you just declare them and the results come back in the same response: **web search**, **web fetch**, and **code execution**.

```python local title="Built-in web search"
import anthropic

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 3}],
    messages=[{"role": "user", "content": "What changed in the latest React release?"}],
)
print("".join(b.text for b in response.content if b.type == "text"))
```

## Tool safety

- **Least privilege** — give the model only the tools a task needs; prefer read-only tools.
- **Validate arguments** before executing (types, ranges, allowed values, ownership checks).
- **Confirm risky actions** (sending email, payments, deleting data) with a human.
- **Treat tool outputs as untrusted** — a fetched web page can contain prompt injections.
- **Limit loops** — cap the number of tool-use iterations so a confused model can't run forever.

:::ai What tools unlock
Tools turn a text predictor into something that can **look things up** (search, databases, RAG), **compute** (calculators, code execution), and **act** (create tickets, send messages, call APIs). Wrap tool use in a loop and you have an **agent** — the topic of a later lesson.
:::

## Check yourself

```quiz
? Who actually executes a custom tool's code?
+ Your application
- The model, on its own servers
- The user's browser automatically
> The model only requests the call; you decide whether and how to run it.

? The model returns three tool_use blocks in one turn. How do you reply?
+ One user message containing three tool_result blocks, each with the matching tool_use_id
- Three separate user messages
- Only the first result
> Sending them together keeps parallel tool use working well.

? A tool raises an exception. What should you send back?
+ A tool_result with is_error: true and a helpful error message
- Nothing
- Restart the conversation
> The model can then retry with different arguments or explain the problem.

? What decides whether the model picks your tool?
+ Mostly the tool's name and description (plus the prompt)
- The order of the tools list only
- The size of the function's code
> Write descriptions like good documentation.
```

:::exercise Add a calculator tool
Extend the simulated loop: add a `calculate(expression: str)` tool that only allows digits, spaces and `+ - * / ( ) .` (raise `ValueError` otherwise). Script the fake model to call `calculate` with `"(18 + 24) / 2"` after a user asks for the average of 18 and 24, then answer with the result.
:::

:::solution
```python run
import json
from types import SimpleNamespace as NS

def calculate(expression: str) -> float:
    if not set(expression) <= set("0123456789+-*/(). "):
        raise ValueError("unsupported characters")
    return eval(expression)

TOOLS = {"calculate": calculate}

def fake_model(messages):
    last = messages[-1]
    if isinstance(last["content"], str):
        return NS(stop_reason="tool_use", content=[NS(type="tool_use", id="t1", name="calculate", input={"expression": "(18 + 24) / 2"})])
    value = json.loads(last["content"][0]["content"])
    return NS(stop_reason="end_turn", content=[NS(type="text", text=f"The average is {value}.")])

messages = [{"role": "user", "content": "What's the average of 18 and 24?"}]
while True:
    r = fake_model(messages)
    messages.append({"role": "assistant", "content": r.content})
    if r.stop_reason != "tool_use":
        break
    results = []
    for b in r.content:
        if b.type == "tool_use":
            try:
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(TOOLS[b.name](**b.input))})
            except Exception as e:
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": str(e), "is_error": True})
    messages.append({"role": "user", "content": results})
print(r.content[0].text)
```
:::

:::keypoints
- **Structured outputs** (`messages.parse` with Pydantic, or `output_config.format`) guarantee schema-valid JSON; still validate business rules.
- **Tools** = name + description + input JSON Schema; the model replies with `tool_use`, you run it and return `tool_result`.
- The loop: call → `stop_reason == "tool_use"` → run tools → send **all** results in one message → repeat.
- Return errors with `is_error: true`; validate arguments; apply least privilege.
- The SDK's **tool runner** (`@beta_tool`) automates the loop; **server tools** (web search, code execution) run on Anthropic's side.
:::
