---
title: The Agent Ecosystem — Skills, A2A, AGENTS.md and How the Pieces Fit
level: advanced
time: 40
summary: A map of the standards and building blocks around agents: tools, MCP, Agent Skills (progressive disclosure of instructions), project instruction files (AGENTS.md / CLAUDE.md), sub-agents, hooks and slash commands, and the agent-to-agent protocol (A2A). When to use each, how they relate, and a runnable skill loader and A2A task lifecycle.
---

The agent world is acquiring standard parts, much as the web acquired HTTP, HTML and cookies. Knowing **which part solves which problem** keeps you from reinventing wheels, and from using a heavy tool where a light one is enough.

## The building blocks at a glance

| Block | What it is | Solves | Loaded into context |
|---|---|---|---|
| **Tool** (function call) | a function the model can invoke | performing actions, fetching data | definition always; results on use |
| **MCP server** | tools/resources/prompts behind a standard protocol | reusing integrations across apps and models | tool definitions (can be many) |
| **Agent Skill** | a folder with instructions (and optional scripts/resources) for a capability | teaching procedures and domain knowledge without bloating the prompt | name + description always; full text **only when relevant** |
| **Project instructions file** (`AGENTS.md`, `CLAUDE.md`) | a text file of conventions, commands and facts about a repo or workspace | project-specific knowledge for coding/ops agents | loaded at session start |
| **Sub-agent** | a separate agent with its own context, prompt and tools | context isolation, specialisation, parallelism | only its brief and its condensed result |
| **Hook / middleware** | code that runs on events (before a tool call, after a response) | deterministic enforcement: formatting, blocking, logging | none (runs outside the model) |
| **Slash command / prompt template** | a saved, named prompt | repeatable user-triggered workflows | on invocation |
| **A2A (Agent2Agent)** | a protocol for agents of different vendors to talk to each other | cross-agent, cross-organisation collaboration | task messages |

## Agent Skills: progressive disclosure of expertise

A long system prompt that contains every procedure the agent might need wastes tokens and dilutes attention. **Agent Skills** ([docs](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)) package expertise as folders:

```text
pdf-processing/
  SKILL.md            # front matter: name + description. Body: instructions
  forms.md            # extra reference, loaded only if the task needs it
  scripts/extract.py  # code the agent can run instead of re-deriving it
```

```text
---
name: pdf-processing
description: Extract text and tables from PDFs, fill forms, merge and split documents. Use when the user mentions PDFs or forms.
---
# PDF processing
1. For text extraction run scripts/extract.py <file>.
2. For forms, read forms.md first.
...
```

**Progressive disclosure** is the key idea, three levels:

1. **Metadata** (name and description, about a hundred tokens per skill) is always in context, so the agent knows what skills exist.
2. **The `SKILL.md` body** is loaded **when the agent decides the skill applies**.
3. **Bundled files and scripts** are read or executed **only when needed**, and script *output* (not source) enters context.

The result: you can offer **dozens of skills** at the cost of a few thousand tokens, and each loads only when relevant. Skills are also **portable and shareable** (a folder in git), unlike prompt snippets scattered in code.

```python run title="A tiny skill registry with progressive disclosure" level=intermediate
SKILLS = {
    "pdf-processing": {
        "description": "Extract text and tables from PDFs, fill forms. Use when the user mentions PDFs or forms.",
        "body": "1. Run scripts/extract.py <file>.\n2. For forms, read forms.md first. " * 10,
        "files": {"forms.md": "Form-filling details ... " * 30},
    },
    "sql-reporting": {
        "description": "Write safe read-only SQL reports against the analytics warehouse. Use for data questions.",
        "body": "Always LIMIT 1000. Use the reporting schema. " * 10,
        "files": {},
    },
    "brand-voice": {
        "description": "Apply the company's writing style to marketing copy. Use when drafting external text.",
        "body": "Warm, concrete, no jargon. " * 10,
        "files": {},
    },
}
tokens = lambda s: len(s) // 4

def always_in_context():
    return "\n".join(f"- {n}: {s['description']}" for n, s in SKILLS.items())

def load_skill(name):                      # level 2: the agent decided this skill is relevant
    return SKILLS[name]["body"]

def load_file(name, path):                 # level 3: a bundled reference, only if needed
    return SKILLS[name]["files"][path]

print("Always in context (level 1):", tokens(always_in_context()), "tokens for", len(SKILLS), "skills\n" + always_in_context(), "\n")
everything = sum(tokens(s["body"]) + sum(tokens(f) for f in s["files"].values()) + tokens(s["description"]) for s in SKILLS.values())
print(f"If we had pasted ALL skill text into the system prompt: ~{everything} tokens, every request.")
print("For a PDF task we load:", tokens(load_skill("pdf-processing")), "tokens (body) +", tokens(load_file("pdf-processing", "forms.md")), "tokens (reference), only when needed.")
```

The same principle powers **tool search** (the agent searches a catalogue of tools and loads only the definitions it needs) and **just-in-time retrieval** in context engineering.

### Skills vs MCP vs tools vs sub-agents

| If you need… | Reach for… |
|---|---|
| to let the model **do** something or fetch live data | a **tool** (or an MCP server if it should be reusable across apps) |
| to teach the agent **how** to do a recurring task or follow a procedure | a **skill** (instructions + scripts) |
| project conventions and commands always available to a coding agent | **AGENTS.md / CLAUDE.md** |
| a noisy, parallel, or specialised sub-task with its own context | a **sub-agent** |
| a rule that must **always** run (block dangerous commands, run the formatter) | a **hook** (deterministic code, not a prompt) |
| a saved prompt the **user** triggers | a **slash command / prompt template** |
| collaboration with an agent run by **another** team or vendor | **A2A** |

Prompts can suggest; **hooks and code enforce**. Use code when behaviour must be guaranteed.

## AGENTS.md and project instruction files

Coding agents start every session knowing nothing about your repo. A short instruction file fixes that. **`AGENTS.md`** ([site](https://agents.md)) is a cross-tool convention (read by many coding agents), and **`CLAUDE.md`** is Claude Code's equivalent. Good content: how to build, test and lint; architecture in a paragraph; conventions and anti-patterns; where things live; commands to avoid. Keep it **short and concrete** (it costs tokens every session), update it when the agent makes a repeated mistake, and treat it as **code under review**.

```text
# AGENTS.md
## Commands
- Install: `uv sync`   Test: `uv run pytest -q`   Lint: `uv run ruff check .`
## Architecture
- `src/api/` FastAPI routes; `src/core/` business logic (pure functions); `src/db/` SQLAlchemy models.
## Conventions
- Business logic must not import FastAPI. Every new route needs a test in `tests/api/`.
- Never edit files in `migrations/` by hand; use `uv run alembic revision --autogenerate`.
```

## A2A: agents talking to agents

MCP connects an agent to **tools and data**. **A2A (Agent2Agent)** ([spec](https://a2a-protocol.org)) connects **agents to other agents**, potentially built by different vendors and running in different organisations, without sharing their internals. Core ideas:

- **Agent Card**: a JSON description published at a well-known URL: who the agent is, its skills, endpoint, authentication requirements.
- **Tasks**: the unit of work, with a **lifecycle** (submitted → working → input-required → completed / failed / canceled).
- **Messages and artifacts**: parties exchange messages; results are artifacts (files, structured data).
- **Transport**: JSON-RPC over HTTP(S), with streaming (SSE) for long tasks and push notifications for very long ones.
- **Opacity**: agents collaborate **without exposing** their memory, tools or reasoning.

```python run title="An Agent Card and a task lifecycle" level=intermediate
import json

agent_card = {
    "name": "Travel Booking Agent",
    "description": "Finds and books flights and hotels.",
    "url": "https://agents.example.com/travel",
    "capabilities": {"streaming": True},
    "skills": [{"id": "book_flight", "description": "Search and book flights given origin, destination and dates."}],
    "authentication": {"schemes": ["oauth2"]},
}
print("Agent card:", json.dumps(agent_card)[:110], "...\n")

class Task:
    TRANSITIONS = {"submitted": {"working"}, "working": {"input-required", "completed", "failed", "canceled"},
                   "input-required": {"working", "canceled"}}
    def __init__(self, goal): self.goal, self.state, self.history = goal, "submitted", ["submitted"]
    def move(self, new):
        if new not in self.TRANSITIONS.get(self.state, set()): raise ValueError(f"illegal transition {self.state} -> {new}")
        self.state = new; self.history.append(new)

t = Task("Book a flight Dublin -> Lisbon, Oct 20-24")
t.move("working")
t.move("input-required")          # the remote agent needs a decision (e.g., which airline)
t.move("working")                 # the client agent replies; work continues
t.move("completed")
print("task lifecycle:", " -> ".join(t.history))
try:
    t.move("working")
except ValueError as e:
    print("guarded:", e)
```

When is A2A relevant? When you integrate **third-party agents as services** (a partner's logistics agent, a vendor's HR agent) or build **large organisations of agents** with separate owners. Within one application, a simple function call or a sub-agent is simpler. The standards landscape is still settling, so check the current governance (MCP and related protocols have been moving under neutral open-source foundations) and favour thin adapters.

## Hooks and enforcement

Some rules must hold **every time** regardless of what the model decides. Implement them as **hooks** or middleware around tool calls:

- Block `rm -rf` or writes outside the workspace; require approval for deployments.
- Run the formatter and linter after every edit.
- Redact secrets in tool results before they enter context.
- Log every call to an audit trail.

```python run title="A pre-tool hook that enforces rules in code" level=easy
import re

BLOCKED = [r"\brm\s+-rf\b", r"\bcurl\b.*\|\s*(sh|bash)", r"\bchmod\s+777\b"]

def pre_tool_hook(tool, args):
    if tool == "bash":
        for pat in BLOCKED:
            if re.search(pat, args["command"]):
                return {"allow": False, "reason": f"command matches a blocked pattern: {pat}"}
    if tool == "write_file" and not args["path"].startswith("/workspace/"):
        return {"allow": False, "reason": "writes are only allowed inside /workspace/"}
    return {"allow": True}

for tool, args in [("bash", {"command": "pytest -q"}), ("bash", {"command": "rm -rf /"}),
                   ("write_file", {"path": "/etc/passwd", "content": "x"}), ("write_file", {"path": "/workspace/a.py", "content": "x"})]:
    print(f"{tool:11} {str(args)[:34]:36} ->", pre_tool_hook(tool, args))
```

## Where this is going

Reasonable bets (hedged, because the field moves fast): agents will rely more on **code execution** as a universal tool (the agent writes small programs that call many tools and process data without flooding context); **skills and instruction files** will become the main way to specialise general agents; **open protocols** (MCP for tools, A2A and relatives for agents) will reduce integration cost; **identity and authorisation for agents** (delegated, scoped, auditable) will be a central engineering problem; and **evaluation of long-horizon, multi-step behaviour** will matter more than single-turn benchmarks. The habits that last: simple architectures, good tools, verification, least privilege and measurement.

```quiz
? What is "progressive disclosure" in Agent Skills?
+ Only short metadata is always in context; the full instructions and bundled files load only when relevant
- Showing the user the skill gradually
- Hiding skills from the model
> It lets you offer many skills cheaply.

? You need a rule that must hold on every tool call (for example never write outside the workspace). What do you use?
- A line in the system prompt
+ A hook or middleware enforced in code
- A skill
> Prompts suggest; code enforces.

? How do MCP and A2A differ?
+ MCP connects agents to tools and data; A2A connects agents to other agents
- They are the same protocol
- A2A is for databases
> Complementary layers of the agent stack.

? What belongs in AGENTS.md?
+ Short, concrete project facts: build/test commands, architecture, conventions and gotchas
- The entire codebase
- Secrets
> It is loaded every session, so keep it brief and useful.
```

:::problem Your coding agent keeps forgetting to run the formatter and sometimes edits generated files. Which mechanisms do you use for each? {level=medium tags="agents,hooks,instructions"}
Match the problem to the right building block.

:::solution Model answer
**Formatter**: a **hook** that runs after every edit (deterministic and guaranteed), rather than hoping the model remembers. **Generated files**: a **pre-tool hook** that blocks edits to those paths with an explanatory message, **plus** a line in **AGENTS.md** ("never edit files under `generated/`; run `make codegen` instead") so the agent plans around it instead of just being blocked. For a longer procedure like "how to add a database migration", write a **skill** with the steps and scripts. Evaluate with tasks that would tempt each mistake.
:::
:::

:::keypoints
- Tools perform actions; MCP standardises tool access; skills package procedures with progressive disclosure; AGENTS.md/CLAUDE.md give project context; sub-agents isolate context; hooks enforce rules in code; A2A connects agents across vendors.
- Progressive disclosure (metadata → body → resources) is the pattern behind skills, tool search and just-in-time context.
- Use hooks and code for guarantees, prompts and instructions for guidance.
- Keep instruction files short, concrete and under review.
- Standards are still settling: favour simple designs, thin adapters, least privilege and evaluation.
:::

:::resources
- [Claude docs: Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) — skill structure and best practices.
- [A2A protocol](https://a2a-protocol.org) — the Agent2Agent specification and examples.
- [AGENTS.md](https://agents.md) — the shared instruction-file convention.
- [Model Context Protocol](https://modelcontextprotocol.io) — the tool and data layer.
- [Claude Code docs](https://docs.claude.com/en/docs/claude-code/overview) — memory files, sub-agents, hooks and commands in one product.
- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) — agents writing code to use tools efficiently.
:::
