---
title: Tool Calling — Letting the Model Act
level: intermediate
time: 55
summary: How function calling works end to end. Tool definitions and JSON Schema, the tool_use / tool_result protocol, executing calls safely, parallel calls, errors as results, tool choice (and why forcing is going away), the SDK tool runner, and security rules. Built first from scratch in a simulated loop you can run.
---

A language model can only produce text. **Tools** let that text trigger real actions: look up an order, run a calculation, search the web, send an email, query a database. Tool calling is the foundation of agents, of RAG-as-a-tool, and of nearly every serious AI product.

:::def Tool (function) calling
You describe functions to the model (name, purpose, input schema). When useful, the model replies with a **structured request to call one** (name + JSON arguments) instead of plain text. **Your code** runs the function and sends the result back; the model then continues, now knowing the result. **The model never executes anything itself.**
:::

:::analogy
A manager (the model) with a team of specialists (your functions). The manager cannot do the specialists' work, but can write a precise request slip: "Look up order 118." You carry the slip, bring back the result, and the manager decides what to do next.
:::

## The protocol

```viz algo=seq title="One tool-use round trip"
participant app Your app [client]
participant llm LLM [llm]
participant fn Your function [tool]
app -> llm : messages + tools (names, descriptions, schemas)
llm --> app : stop_reason = tool_use | tool_use{id: t1, name: get_order, input: {id: 118}}
app -> fn : get_order(118)
fn --> app : {"status": "shipped", "eta": "Friday"}
app -> llm : history + tool_use + tool_result(t1)
llm --> app : stop_reason = end_turn | "Your order shipped and arrives Friday."
```

Key points of the protocol (shapes vary slightly by provider, the logic is identical):

1. You send **tool definitions** with every request.
2. The model may reply with one or more **tool-call blocks** and a stop reason that says so (`tool_use`).
3. You append that assistant message **unchanged** to the history, run each tool, then send **tool results** back in a new `user` message, each referencing the call's **id**.
4. Repeat until the model replies with no tool calls (`end_turn`).

## A tool definition

```python local title="Defining a tool (Anthropic format)"
tools = [{
    "name": "get_order_status",
    "description": "Look up the shipping status of a customer's order. Use when the user asks where their order is. Returns status and estimated delivery date.",
    "input_schema": {
        "type": "object",
        "properties": {
            "order_id": {"type": "string", "description": "The order id, e.g. 'A-10293'"},
        },
        "required": ["order_id"],
        "additionalProperties": False,
    },
}]
```

The **description is the most important field**: it is how the model decides *when* to use the tool. Say what it does, when to use it, what it returns, and any limits.

## Build the loop from scratch

Here is the whole mechanism with a **scripted fake model**, so you can see every message.

```python run title="The tool-use loop, end to end" level=intermediate
import json

# ---- your tools (plain Python functions) -------------------------------------------------
ORDERS = {"A-100": {"status": "shipped", "eta": "Friday"}, "A-200": {"status": "processing", "eta": "Monday"}}

def get_order_status(order_id):
    if order_id not in ORDERS:
        raise KeyError(f"no such order {order_id}")
    return ORDERS[order_id]

def add(a, b):
    return a + b

REGISTRY = {"get_order_status": get_order_status, "add": add}

# ---- a scripted stand-in for the model ----------------------------------------------------
class ScriptedModel:
    """Looks at the conversation and decides: call a tool, or answer. Same shape as a real API."""
    def respond(self, messages):
        last = messages[-1]
        if last["role"] == "user" and isinstance(last["content"], str):
            q = last["content"]
            if "order" in q:
                oid = q.split()[-1]
                return {"stop_reason": "tool_use", "content": [{"type": "tool_use", "id": "toolu_1", "name": "get_order_status", "input": {"order_id": oid}}]}
            return {"stop_reason": "end_turn", "content": [{"type": "text", "text": "I can look up orders. Which order id?"}]}
        # last message holds tool results -> turn them into a final answer
        result = last["content"][0]
        if result.get("is_error"):
            return {"stop_reason": "end_turn", "content": [{"type": "text", "text": f"Sorry, I couldn't find that order ({result['content']})."}]}
        data = json.loads(result["content"])
        return {"stop_reason": "end_turn", "content": [{"type": "text", "text": f"Your order is {data['status']} and arrives {data['eta']}."}]}

def run(user_text, model, max_steps=5):
    messages = [{"role": "user", "content": user_text}]
    for step in range(max_steps):                                   # ALWAYS bound the loop
        reply = model.respond(messages)
        messages.append({"role": "assistant", "content": reply["content"]})
        if reply["stop_reason"] != "tool_use":
            return reply["content"][0]["text"], messages
        results = []
        for block in reply["content"]:
            if block["type"] != "tool_use":
                continue
            try:
                out = REGISTRY[block["name"]](**block["input"])
                results.append({"type": "tool_result", "tool_use_id": block["id"], "content": json.dumps(out)})
            except Exception as e:                                  # errors go back to the model as data
                results.append({"type": "tool_result", "tool_use_id": block["id"], "content": str(e), "is_error": True})
        messages.append({"role": "user", "content": results})       # ALL results in ONE user message
    raise RuntimeError("too many steps")

for q in ["where is my order A-100", "where is my order Z-999", "hello"]:
    answer, history = run(q, ScriptedModel())
    print(f"user: {q!r}\n  -> {answer}   ({len(history)} messages)")
```

Notice three habits baked into that loop: a **step cap**, **errors returned as results** (the model can recover, apologise or retry), and **all results of a turn in one message**.

## With the real SDK

```python local title="Manual loop with the Anthropic SDK"
import anthropic, json
client = anthropic.Anthropic()
messages = [{"role": "user", "content": "Where is my order A-100?"}]

while True:
    response = client.messages.create(model="claude-sonnet-5-5", max_tokens=2000, tools=tools, messages=messages)
    if response.stop_reason != "tool_use":
        break
    messages.append({"role": "assistant", "content": response.content})      # keep the tool_use blocks
    results = []
    for block in response.content:
        if block.type == "tool_use":
            try:
                out = REGISTRY[block.name](**block.input)
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(out)})
            except Exception as e:
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(e), "is_error": True})
    messages.append({"role": "user", "content": results})

print(next(b.text for b in response.content if b.type == "text"))
```

### The SDK's tool runner

The Python SDK can run that loop for you: decorate a typed function (the schema is generated from the signature and docstring) and hand it to the runner.

```python local title="Tool runner: no hand-written loop"
from anthropic import beta_tool

@beta_tool
def get_order_status(order_id: str) -> str:
    """Look up the shipping status of an order.

    Args:
        order_id: The order id, for example 'A-10293'.
    """
    return json.dumps(ORDERS[order_id])

runner = client.beta.messages.tool_runner(
    model="claude-sonnet-5-5", max_tokens=2000,
    tools=[get_order_status],
    messages=[{"role": "user", "content": "Where is order A-100?"}],
)
for message in runner:              # each iteration is one model response
    print(message.stop_reason)
```

## Parallel tool calls

A model can request several independent calls in **one** turn ("weather in Paris and Rome"). Run them concurrently and return all results together. Returning them in separate messages teaches the model to stop parallelising.

```python run title="Run independent tool calls concurrently" level=intermediate
import asyncio, time

async def slow_weather(city):
    await asyncio.sleep(0.3)                       # pretend this is a network call
    return {"city": city, "temp_c": {"Paris": 18, "Rome": 24, "Oslo": 9}[city]}

async def main():
    cities = ["Paris", "Rome", "Oslo"]

    t0 = time.perf_counter()
    sequential = [await slow_weather(c) for c in cities]            # one after another
    t_seq = time.perf_counter() - t0

    t0 = time.perf_counter()
    parallel = await asyncio.gather(*(slow_weather(c) for c in cities))   # all at once
    t_par = time.perf_counter() - t0

    print(parallel)
    print(f"sequential ≈ {t_seq:.1f}s, parallel ≈ {t_par:.1f}s")
    print("parallel is faster:", t_par < t_seq / 2)

asyncio.run(main())
```

## Tool choice

`tool_choice` controls whether the model may, must, or must not call tools. The default `auto` lets the model decide. Historically you could **force** a specific tool (`{"type": "tool", "name": ...}`) or force *any* tool; some newest models **reject forcing** (it returns a 400). The replacement: keep `auto`, **say in the prompt** which tool to use, and add `strict: true` on the tool so its arguments always match the schema. If you only wanted JSON back, use structured outputs instead of a fake tool.

## Writing tools models use well

- **One clear purpose per tool**, named like a verb phrase: `search_orders`, not `orders`.
- **Descriptions that say when and when not** to use it, with units and formats.
- **Fewer, richer tools beat many tiny ones**: tool lists cost tokens and confuse selection. Consider merging related actions, or tool-search for very large catalogues.
- **Return what the model needs and nothing more**: trim huge payloads, paginate, return human-meaningful names instead of opaque ids, and put errors in plain language that suggests the fix ("Order not found. Ask the user to check the id format A-12345").
- **Make results deterministic and idempotent** where possible.

Module 5 goes much deeper on tool design ("agent-computer interfaces").

## Security rules for tools

:::warn The arguments are untrusted input
The model's JSON came from text influenced by users and by documents it read. Treat arguments exactly like data from a web form.
:::

1. **Validate** every argument against the schema *and* business rules (does this user own this order id?).
2. **Least privilege**: give each tool only the access it needs; run with the **end user's** permissions, not a super-admin key.
3. **Confirm risky actions** with a human (send email, move money, delete data); show exactly what will happen.
4. **No raw execution** of model-written shell, SQL or code without a sandbox, allow-lists, and timeouts.
5. **Rate-limit and bound** loops, calls per turn and spend.
6. **Log every call** (who, what, arguments, result) for audit.
7. Remember **prompt injection**: text returned by a tool (a web page, an email) can contain instructions. Never let it expand the model's permissions.

```quiz
? Who actually executes a tool call?
- The model
+ Your code, which then returns the result to the model
- The provider's servers always
> The model only emits a structured request; your application runs it (except provider-hosted "server tools").

? Where do errors from a tool go?
- They crash the app
+ Back to the model as a tool_result with is_error, so it can recover or explain
- They are ignored
> The model can often fix a bad argument or tell the user what happened.

? Why return all tool results from one turn in a single message?
+ Splitting them teaches the model to stop making parallel calls and may break the protocol
- It is cheaper
- It is only a style choice
> Providers expect the results of a turn together.

? What is the most important part of a tool definition for selection?
- The function name length
+ The description: what it does, when to use it, what it returns
- The Python type hints
> The model chooses tools by reading descriptions.
```

:::problem Your agent has 60 tools and often picks the wrong one. What do you do? {level=medium tags="tools,design"}
Give concrete fixes.

:::solution Model answer
Consolidate overlapping tools and rewrite descriptions with clear "use when / don't use when" guidance; rename ambiguously named tools; reduce parameters. Use **tool search / dynamic loading** so only relevant tools are in context, or **route** by task type to sub-agents with small toolsets. Add a few examples of correct use in the system prompt. Build an eval of (request → correct tool + args) and measure selection accuracy before and after.
:::
:::

:::keypoints
- Tool calling: describe functions, the model emits a structured call, your code executes and returns results, the loop repeats until no more calls.
- Always bound the loop, return errors as results, and send all of a turn's results in one message.
- Descriptions drive tool selection; keep tools few, clear and well-scoped; return concise, useful results.
- Treat arguments as untrusted: validate, least privilege, confirm risky actions, sandbox execution, log everything.
- Prefer `auto` + prompt guidance + `strict` over forced tool choice; use structured outputs when you only need JSON.
:::

:::resources
- [Claude docs: Tool use overview](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview) — definitions, results, parallel use and best practices.
- [Anthropic: Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — how to design and evaluate tools.
- [OpenAI: Function calling guide](https://platform.openai.com/docs/guides/function-calling) — equivalent concepts and format.
- [Gemini: Function calling](https://ai.google.dev/gemini-api/docs/function-calling) — Google's version.
- [Berkeley Function-Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) — compare models on tool use.
- [Toolformer](https://arxiv.org/abs/2302.04761) and [Gorilla](https://arxiv.org/abs/2305.15334) — research on teaching models to use tools and APIs.
:::
