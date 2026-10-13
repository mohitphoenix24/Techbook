---
title: Agent Frameworks — What They Give You and When to Skip Them
level: intermediate
time: 40
summary: The agent-framework landscape (LangGraph, OpenAI Agents SDK, Claude Agent SDK, PydanticAI, Google ADK, CrewAI, AutoGen, LlamaIndex, smolagents and more), what problem each solves, what every framework is secretly doing (built here in 60 lines: tool schemas from type hints, a loop, tracing), a decision guide, and the risks of abstraction.
---

After the previous lessons you could build an agent with a plain API client and a `for` loop. So why do frameworks exist, and when should you use one? The honest answer: **frameworks save time on plumbing, and cost you transparency.** The wise approach is to know the plumbing well enough to choose.

## What frameworks typically provide

| Capability | What you would otherwise write |
|---|---|
| **Tool definition helpers** | JSON schemas from function signatures and docstrings |
| **The agent loop** | the `for` loop, dispatch, error handling, budgets |
| **State and persistence** | message history, checkpointing, resumption |
| **Orchestration** | graphs, handoffs, sub-agents, parallel steps |
| **Human-in-the-loop** | interrupts, approvals |
| **Tracing and evals** | spans, logging, replay, dataset runs |
| **Guardrails** | input/output validators |
| **Model/provider abstraction** | one interface over many model vendors |
| **Memory/RAG integrations** | connectors to vector stores, loaders |
| **Streaming and UI helpers** | event streams, chat components |
| **Deployment** | servers, queues, hosted runtimes |

## The landscape (as of late 2026; it moves quickly)

| Framework | Philosophy | Good at |
|---|---|---|
| **LangGraph** ([docs](https://langchain-ai.github.io/langgraph/)) | agents as **graphs over explicit state**, with persistence and interrupts | controllable, long-running, human-in-the-loop workflows |
| **OpenAI Agents SDK** ([docs](https://openai.github.io/openai-agents-python/)) | minimal primitives: agents, tools, **handoffs**, guardrails, tracing | simple multi-agent routing, quick start |
| **Claude Agent SDK** ([docs](https://docs.claude.com/en/api/agent-sdk/overview)) | Claude Code's agent loop and built-in tools (files, bash, search, MCP, sub-agents) as a library | coding and file-based agents, batteries included |
| **PydanticAI** ([docs](https://ai.pydantic.dev)) | type-safe agents with Pydantic validation and dependency injection | structured outputs, testability, Python-native feel |
| **Google ADK** ([docs](https://google.github.io/adk-docs/)) | an Agent Development Kit with multi-agent composition, evaluation and deployment paths | Gemini/Vertex ecosystems |
| **CrewAI** ([docs](https://docs.crewai.com)) | role-based "crews" of agents with tasks | quick multi-agent prototypes with a team metaphor |
| **AutoGen / AG2** ([docs](https://microsoft.github.io/autogen/)) | conversational multi-agent frameworks | research and experimentation with agent conversations |
| **LlamaIndex agents** ([docs](https://docs.llamaindex.ai)) | agents over data and RAG pipelines | document-centric agents |
| **Haystack** ([site](https://haystack.deepset.ai)) | pipelines of components | search and RAG pipelines in production |
| **smolagents** ([docs](https://huggingface.co/docs/smolagents)) | tiny library; agents that write **code** as actions | learning, open models, minimal footprint |
| **Semantic Kernel** ([repo](https://github.com/microsoft/semantic-kernel)) | enterprise SDK (C#, Python, Java) with plugins | Microsoft-stack applications |
| **DSPy** ([docs](https://dspy.ai)) | programs of LLM modules optimised against metrics | prompt/program optimisation, not an agent runtime per se |

## What every framework is doing: a 60-line version

The magic is smaller than it looks. Here is a miniature framework: a `@tool` decorator that builds a JSON schema from the function signature and docstring, an `Agent` class running the loop with budgets, and **tracing** of every step.

```python run title="A miniature agent framework" level=advanced
import inspect, json, re, time

PY2JSON = {int: "integer", float: "number", str: "string", bool: "boolean"}

def tool(fn):
    """Turn a typed, documented function into a tool: name, description, JSON schema, and the callable."""
    sig, doc = inspect.signature(fn), inspect.getdoc(fn) or ""
    props, required = {}, []
    for name, p in sig.parameters.items():
        arg_doc = re.search(rf"^\s*{name}:\s*(.+)$", doc, re.M)
        props[name] = {"type": PY2JSON.get(p.annotation, "string"), "description": arg_doc.group(1) if arg_doc else ""}
        if p.default is inspect.Parameter.empty: required.append(name)
    fn.spec = {"name": fn.__name__, "description": doc.split("\n\n")[0],
               "input_schema": {"type": "object", "properties": props, "required": required, "additionalProperties": False}}
    return fn

class Agent:
    def __init__(self, model, tools, instructions="", max_steps=6):
        self.model, self.tools, self.instructions, self.max_steps = model, {t.__name__: t for t in tools}, instructions, max_steps
        self.trace = []                                              # tracing: every step recorded
    def run(self, task):
        messages = [{"role": "user", "content": task}]
        for step in range(self.max_steps):
            t0 = time.perf_counter()
            reply = self.model(messages, [t.spec for t in self.tools.values()])
            self.trace.append({"step": step, "type": "model", "stop": reply["stop"], "ms": round((time.perf_counter() - t0) * 1000, 2)})
            messages.append({"role": "assistant", "content": reply["content"]})
            if reply["stop"] != "tool_use":
                return reply["content"][0]["text"]
            results = []
            for b in reply["content"]:
                if b["type"] != "tool_use": continue
                try: out = str(self.tools[b["name"]](**b["input"])); err = False
                except Exception as e: out, err = f"{type(e).__name__}: {e}", True
                self.trace.append({"step": step, "type": "tool", "name": b["name"], "args": b["input"], "error": err})
                results.append({"type": "tool_result", "tool_use_id": b["id"], "content": out, "is_error": err})
            messages.append({"role": "user", "content": results})
        return "stopped: step budget exceeded"

# ---- using it ----
@tool
def get_weather(city: str, unit: str = "celsius") -> str:
    """Get the current weather for a city.

    city: City name, for example Paris.
    unit: celsius or fahrenheit.
    """
    return f"18 degrees {unit} and clear in {city}"

def scripted_model(messages, tool_specs):                            # stands in for the LLM
    if len(messages) == 1:
        return {"stop": "tool_use", "content": [{"type": "tool_use", "id": "t1", "name": "get_weather", "input": {"city": "Paris"}}]}
    return {"stop": "end_turn", "content": [{"type": "text", "text": "It is clear and 18 degrees in Paris."}]}

print(json.dumps(get_weather.spec, indent=2)[:420], "...\n")
agent = Agent(scripted_model, [get_weather], instructions="Be concise.")
print("answer:", agent.run("What's the weather in Paris?"))
for event in agent.trace:
    print("  trace:", event)
```

That is the core of the OpenAI Agents SDK's `@function_tool`, PydanticAI's `@agent.tool`, and the Anthropic SDK's `@beta_tool`. Everything else (graphs, handoffs, persistence, UIs) is **more of the same plumbing** with opinions.

## The same agent in four frameworks (sketches)

```python local title="OpenAI Agents SDK"
from agents import Agent, Runner, function_tool

@function_tool
def get_weather(city: str) -> str:
    """Return the current weather for a city."""
    return f"18°C and clear in {city}"

agent = Agent(name="Assistant", instructions="Be concise.", tools=[get_weather])
result = Runner.run_sync(agent, "What's the weather in Paris?")
print(result.final_output)
```

```python local title="PydanticAI"
from pydantic_ai import Agent

agent = Agent("anthropic:claude-sonnet-5-5", system_prompt="Be concise.")

@agent.tool_plain
def get_weather(city: str) -> str:
    """Return the current weather for a city."""
    return f"18°C and clear in {city}"

result = agent.run_sync("What's the weather in Paris?")
print(result.output)
```

```python local title="LangGraph: explicit state and edges"
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    question: str
    answer: str

def answer_node(state: State) -> dict:
    return {"answer": call_llm(state["question"])}          # your own model call

graph = StateGraph(State)
graph.add_node("answer", answer_node)
graph.add_edge(START, "answer")
graph.add_edge("answer", END)
app = graph.compile()
print(app.invoke({"question": "What's the weather in Paris?"}))
```

```python local title="Claude Agent SDK: Claude Code's loop as a library"
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    options = ClaudeAgentOptions(allowed_tools=["Read", "Grep", "Edit", "Bash"], permission_mode="acceptEdits")
    async for message in query(prompt="Find the failing test in this repo and fix it", options=options):
        print(message)

asyncio.run(main())
```

(Package names and parameters evolve quickly: check each project's current docs before copying.)

## How to choose

:::flow Framework decision
Is it a single call or a short chain? | use the plain provider SDK: no framework
Do you need long-running, resumable, human-in-the-loop flows? | LangGraph or a durable-execution engine
Do you need coding/file/shell agents quickly? | Claude Agent SDK (or an equivalent coding-agent SDK)
Do you want typed, testable Python agents? | PydanticAI
Mostly handoffs between a few specialists? | OpenAI Agents SDK
Heavily document-centric? | LlamaIndex / Haystack
Learning or minimal footprint? | smolagents or your own 60 lines
:::

Criteria beyond features:

- **Transparency**: can you see exactly what prompt is sent and what comes back? (Essential for debugging.)
- **Control**: can you override defaults, the system prompt, the loop, retries?
- **Model neutrality**: does it lock you to one provider, and do you care?
- **Stability and maintenance**: release cadence, breaking changes, community, licence.
- **Observability**: built-in tracing, and compatibility with your tooling (OpenTelemetry).
- **Testing**: can you run it with a fake model and assert on behaviour?
- **Deployment fit**: serverless, long-lived workers, your language and runtime.

## The costs of abstraction

Anthropic's advice in *Building effective agents*: **start by using LLM APIs directly**; many patterns take a few lines of code, and frameworks can **hide the underlying prompts and responses, making systems harder to debug**, and tempt you to add complexity you do not need. If you do use a framework, make sure you **understand what it does under the hood**.

Risks to watch:

- **Hidden prompts** you never reviewed (and cannot version).
- **Leaky abstractions**: when something breaks you debug the framework, not your logic.
- **Version churn**: fast-moving APIs break code and tutorials; pin versions.
- **Lock-in** to one mental model (graphs, crews, conversations).
- **Over-engineering**: a five-agent crew for a three-step chain.

Mitigations: wrap the framework behind **your own thin interface**, keep **prompts in your repo**, log the **raw requests and responses**, and write **tests with a stub model**.

```quiz
? What is the core thing every agent framework implements?
+ Tool schemas from functions, the model-tool loop with budgets, and state/tracing around it
- A new kind of neural network
- A replacement for the LLM
> The magic is plumbing: you can write the essential parts in a page.

? When is a plain SDK usually the better choice?
+ Single calls, short chains and simple tool loops, where transparency and control matter
- Always avoid SDKs
- Only for toy projects
> Add a framework when its specific features (graphs, persistence, handoffs) earn their keep.

? Which framework style models agents as explicit graphs over state with persistence and interrupts?
- CrewAI
+ LangGraph
- smolagents
> LangGraph's central abstraction is the state graph.

? What is a mitigation for framework lock-in?
+ Wrap the framework behind your own interface, keep prompts in your repo and log raw requests
- Use more frameworks at once
- Avoid tests
> Isolation and transparency keep options open.
```

:::problem Your team debates adopting a multi-agent framework for a three-step support workflow. What do you recommend? {level=easy tags="frameworks,architecture"}
Give a short recommendation with reasons.

:::solution Model answer
Do **not** adopt a multi-agent framework. A three-step workflow (classify, retrieve, draft + check) is a **chain**; implement it with the provider SDK, a few functions, structured outputs and an eval set. Adding a framework adds hidden prompts, dependencies and churn without benefit. Revisit if requirements grow: persistence and human approval (consider LangGraph or a workflow engine), real handoffs between specialists (consider the OpenAI Agents SDK pattern), or coding/file agents (Claude Agent SDK). Keep a thin internal interface so switching later is cheap.
:::
:::

:::keypoints
- Frameworks provide plumbing: tool schemas, the loop, state, orchestration, tracing, guardrails, deployment.
- Core mechanics are small enough to build yourself (schemas from type hints, a bounded loop, tracing).
- Choose by need: plain SDK for simple flows; LangGraph for stateful graphs; Claude Agent SDK for coding/file agents; PydanticAI for typed agents; OpenAI Agents SDK for handoffs; LlamaIndex/Haystack for document pipelines.
- Weigh transparency, control, stability, observability and testability; beware hidden prompts and version churn.
- Start with direct API calls; add a framework when a concrete feature earns it.
:::

:::resources
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — the case for starting simple.
- [LangGraph docs](https://langchain-ai.github.io/langgraph/) and [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) — two contrasting designs.
- [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) and [claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python) — the Claude Code harness as a library.
- [PydanticAI](https://ai.pydantic.dev) and [Google ADK](https://google.github.io/adk-docs/) — typed and cloud-integrated approaches.
- [Hugging Face smolagents](https://huggingface.co/docs/smolagents) — a minimal library you can read in an afternoon.
- [Hugging Face Agents Course](https://huggingface.co/learn/agents-course) — builds agents with several frameworks.
:::
