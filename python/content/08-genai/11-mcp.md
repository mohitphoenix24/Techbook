---
title: MCP — Model Context Protocol
level: advanced
time: 35
summary: The open standard for plugging tools and data into AI apps. Understand hosts, clients and servers; tools, resources and prompts; see the JSON-RPC messages; build an MCP server in Python; and connect it to Claude.
---

Every AI app needs tools: search, databases, GitHub, Slack, files… Without a standard, every app must write its own integration for every tool. **MCP** fixes this: write a tool server **once**, and any MCP-compatible app — Claude Desktop, Claude Code, IDEs, your own agents — can use it.

:::def MCP (Model Context Protocol)
An open protocol, introduced by Anthropic and now widely adopted, that standardises how AI applications connect to external **tools**, **data** and **prompt templates**. Often described as "USB-C for AI applications".
:::

:::analogy
Before USB, every printer, mouse and camera had its own special cable and driver. USB made one plug work everywhere. MCP does the same for AI: one protocol, so any AI app can plug into any tool server.
:::

## The architecture

:::def Host, client, server
The **host** is the AI application the user interacts with (Claude Desktop, an IDE, your agent). Inside it, an MCP **client** keeps a connection to each MCP **server**. A server is a program that exposes capabilities — e.g. a GitHub server, a Postgres server, or your company's internal API wrapped as a server.
:::

```text
┌──────────────────────── Host (e.g. Claude Desktop / your agent) ───────────────────────┐
│   LLM  ◀──▶  MCP client ──────▶  MCP server: GitHub      (tools: create_issue, ...)   │
│              MCP client ──────▶  MCP server: Postgres    (resources: tables, ...)     │
│              MCP client ──────▶  MCP server: your API    (tools + prompts)            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### What a server can offer

| Primitive | Controlled by | What it is | Example |
|---|---|---|---|
| **Tools** | the model | functions the LLM can call | `search_tickets(query)`, `create_issue(title, body)` |
| **Resources** | the app/user | read-only data identified by a URI | `file:///docs/policy.md`, `db://customers/42` |
| **Prompts** | the user | reusable prompt templates | "summarise this PR", "draft a release note" |

:::def Transport
How client and server exchange messages: **stdio** (the host launches the server as a local subprocess and talks over stdin/stdout — great for local tools) or **Streamable HTTP** (the server runs as a web service — for remote, shared servers).
:::

## Under the hood: JSON-RPC messages

MCP messages are **JSON-RPC 2.0**: each request has a `method`, `params` and an `id`; each response carries the same `id` and a `result` (or an `error`). Here is a tiny in-process server speaking the same message shapes, so you can watch the conversation:

```python run level=intermediate
import json
import inspect

class TinyMCPServer:
    """A toy server that handles the core MCP methods (real servers use the official SDK)."""
    def __init__(self, name):
        self.name, self.tools, self.resources = name, {}, {}

    def tool(self, fn):
        params = inspect.signature(fn).parameters
        types = {int: "integer", float: "number", str: "string", bool: "boolean"}
        self.tools[fn.__name__] = {
            "fn": fn,
            "spec": {"name": fn.__name__, "description": inspect.getdoc(fn),
                     "inputSchema": {"type": "object",
                                     "properties": {n: {"type": types.get(p.annotation, "string")} for n, p in params.items()},
                                     "required": list(params)}},
        }
        return fn

    def resource(self, uri, text):
        self.resources[uri] = text

    def handle(self, message: str) -> str:
        req = json.loads(message)
        method, params = req["method"], req.get("params", {})
        if method == "initialize":
            result = {"protocolVersion": "2025-06-18", "serverInfo": {"name": self.name},
                      "capabilities": {"tools": {}, "resources": {}}}
        elif method == "tools/list":
            result = {"tools": [t["spec"] for t in self.tools.values()]}
        elif method == "tools/call":
            value = self.tools[params["name"]]["fn"](**params["arguments"])
            result = {"content": [{"type": "text", "text": str(value)}]}
        elif method == "resources/read":
            result = {"contents": [{"uri": params["uri"], "text": self.resources[params["uri"]]}]}
        else:
            return json.dumps({"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32601, "message": "method not found"}})
        return json.dumps({"jsonrpc": "2.0", "id": req["id"], "result": result})

server = TinyMCPServer("weather-demo")

@server.tool
def get_forecast(city: str, days: int) -> str:
    """Get a weather forecast for a city for the next N days."""
    return f"{city}: sunny for {days} days"

server.resource("docs://units", "Temperatures are in Celsius.")

def call(id_, method, params=None):
    msg = json.dumps({"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}})
    print("→", msg)
    reply = server.handle(msg)
    print("←", reply, "\n")
    return json.loads(reply)

call(1, "initialize", {"clientInfo": {"name": "my-agent"}})
tools = call(2, "tools/list")["result"]["tools"]
call(3, "tools/call", {"name": "get_forecast", "arguments": {"city": "Pune", "days": 3}})
call(4, "resources/read", {"uri": "docs://units"})
```

### Bridging MCP tools to an LLM

An agent host lists the server's tools and hands them to the model as ordinary tool definitions. When the model calls one, the host forwards the call to the MCP server:

```python run level=intermediate
mcp_tools = [{
    "name": "get_forecast",
    "description": "Get a weather forecast for a city for the next N days.",
    "inputSchema": {"type": "object", "properties": {"city": {"type": "string"}, "days": {"type": "integer"}},
                    "required": ["city", "days"]},
}]

def mcp_to_claude_tools(tools):
    """MCP 'inputSchema' -> Claude API 'input_schema' (same JSON Schema, different key name)."""
    return [{"name": t["name"], "description": t["description"], "input_schema": t["inputSchema"]} for t in tools]

for t in mcp_to_claude_tools(mcp_tools):
    print(t)
```

## Build a real MCP server (run locally)

The official Python SDK turns type-hinted functions into tools — no JSON Schema or protocol code to write:

```bash
pip install "mcp[cli]"          # or: uv add "mcp[cli]"
```

```python local title="notes_server.py"
from mcp.server import MCPServer

mcp = MCPServer("Notes")
NOTES: dict[str, str] = {}

@mcp.tool()
def add_note(title: str, body: str) -> str:
    """Save a note under a title. Overwrites an existing note with the same title."""
    NOTES[title] = body
    return f"Saved note '{title}'."

@mcp.tool()
def search_notes(query: str) -> list[str]:
    """Return the titles of notes whose title or body contains the query (case-insensitive)."""
    q = query.lower()
    return [t for t, b in NOTES.items() if q in t.lower() or q in b.lower()]

@mcp.resource("notes://{title}")
def read_note(title: str) -> str:
    """Read the full text of a note."""
    return NOTES.get(title, "Note not found.")

@mcp.prompt()
def weekly_summary() -> str:
    """A prompt template that asks the model to summarise all notes."""
    return "Summarise my notes from this week as 5 bullet points, grouped by topic."
```

```bash
uv run mcp dev notes_server.py                                  # open the MCP Inspector to test it interactively
uv run mcp run notes_server.py --transport streamable-http      # serve it over HTTP at /mcp
```

### Calling it from a Python client

```python local title="client.py"
import asyncio
from mcp import Client

async def main():
    async with Client("http://localhost:8000/mcp") as client:
        await client.call_tool("add_note", {"title": "RAG", "body": "Chunk with overlap; use hybrid search."})
        result = await client.call_tool("search_notes", {"query": "hybrid"})
        print(result.structured_content)

asyncio.run(main())
```

## Connecting MCP servers to Claude

| Where | How |
|---|---|
| **Claude Desktop / claude.ai** | add the server as a connector (local stdio servers via the desktop app's config; remote servers by URL) |
| **Claude Code** | `claude mcp add` to register a server; its tools become available in your coding sessions |
| **Claude API (MCP connector)** | pass remote server URLs in the request; Claude calls the tools directly |
| **Your own agent** | run an MCP client, list tools, convert them to tool definitions, forward calls (as in the bridge above) |

```python local title="Claude API with a remote MCP server (MCP connector)"
import anthropic

client = anthropic.Anthropic()
response = client.beta.messages.create(
    model="claude-opus-5-5",
    max_tokens=4096,
    betas=["mcp-client-2025-11-20"],
    mcp_servers=[{"type": "url", "url": "https://notes.example.com/mcp", "name": "notes"}],
    tools=[{"type": "mcp_toolset", "mcp_server_name": "notes"}],     # expose that server's tools
    messages=[{"role": "user", "content": "Find my notes about hybrid search and summarise them."}],
)
print("".join(b.text for b in response.content if b.type == "text"))
```

## Security considerations

:::warn Treat MCP servers like any third-party code
An MCP server can read data and take actions with **your** credentials. Only install servers you trust, review the permissions and tools they expose, prefer read-only tools, require confirmation for destructive actions, and remember that data returned by a server (web pages, issues, emails) can contain **prompt injections**.
:::

- **Least privilege**: scoped API tokens; separate servers for read vs write.
- **Authentication**: remote servers should use OAuth or API keys, never be open to the internet.
- **Audit**: log tool calls and arguments.
- **Pin versions** of community servers; review updates.

:::ai Why MCP matters
MCP separates **capabilities** from **applications**: your team can expose an internal system once as an MCP server, and every AI tool your company uses — chat assistants, coding agents, custom agents — can use it immediately. Thousands of community servers already exist for GitHub, Slack, databases, browsers, file systems and SaaS products.
:::

## Check yourself

```quiz
? In MCP, which component does the LLM-powered application run?
+ The host, which contains MCP clients that connect to servers
- The server
- The transport
> Hosts (Claude Desktop, IDEs, agents) run clients; servers expose capabilities.

? Which MCP primitive is meant to be called by the model?
+ Tools
- Resources
- Prompts
> Resources are data the app attaches; prompts are templates the user picks.

? Which transport would you use for a server shared by a whole team?
+ Streamable HTTP
- stdio
- Email
> stdio is for local subprocesses on one machine.

? What message format does MCP use?
+ JSON-RPC 2.0
- GraphQL
- XML-RPC
> Requests carry a method, params and id; responses carry result or error.
```

:::exercise Add an error response
Extend `TinyMCPServer.handle` so that calling `tools/call` with an unknown tool name returns a JSON-RPC **error** (`code: -32602`, message `"unknown tool: <name>"`) instead of crashing. Test it with a call to `"get_stock_price"`.
:::

:::solution
```python run
import json

class Server:
    def __init__(self):
        self.tools = {"echo": lambda text: text}

    def handle(self, message):
        req = json.loads(message)
        if req["method"] == "tools/call":
            name = req["params"]["name"]
            if name not in self.tools:
                return json.dumps({"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32602, "message": f"unknown tool: {name}"}})
            out = self.tools[name](**req["params"]["arguments"])
            return json.dumps({"jsonrpc": "2.0", "id": req["id"], "result": {"content": [{"type": "text", "text": out}]}})
        return json.dumps({"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32601, "message": "method not found"}})

s = Server()
print(s.handle(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "echo", "arguments": {"text": "hi"}}})))
print(s.handle(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_stock_price", "arguments": {}}})))
```
:::

:::keypoints
- **MCP** standardises how AI apps connect to tools and data: build a server once, use it everywhere.
- **Hosts** run **clients** that connect to **servers**; servers expose **tools** (model-called), **resources** (data) and **prompts** (templates).
- Messages are **JSON-RPC 2.0** over **stdio** (local) or **Streamable HTTP** (remote).
- The Python SDK (`MCPServer` + `@mcp.tool()`) turns typed functions into tools; `mcp dev` opens the Inspector.
- Connect servers to Claude Desktop/Code or the API's MCP connector — and treat servers as trusted code with least privilege.
:::
