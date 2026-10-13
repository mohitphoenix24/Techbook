---
title: Model Context Protocol (MCP)
level: advanced
time: 55
summary: The open standard for connecting models to tools and data. The problem it solves, the host-client-server architecture, the three server primitives (tools, resources, prompts), JSON-RPC messages and the lifecycle, transports (stdio and streamable HTTP), building a server in Python, using MCP from the Claude API, and the security issues (tool poisoning, confused deputy, excessive scope) you must design for. Includes a runnable mini MCP-style server and client.
---

Every agent needs tools and data. Before a standard existed, connecting M applications to N tools meant **M × N custom integrations**: a GitHub connector for each IDE, a database connector for each chat app. The **Model Context Protocol (MCP)**, introduced by Anthropic in late 2024 and now widely adopted across vendors, turns that into **M + N**: write a tool server once and any MCP-capable application can use it.

:::def Model Context Protocol (MCP)
An open protocol that standardises how AI applications discover and use **tools, data and prompt templates** exposed by external **servers**. It uses JSON-RPC 2.0 messages over a transport (local process pipes or HTTP). Think "USB-C for AI integrations": one connector shape, many devices. See the [specification](https://modelcontextprotocol.io) and [introduction](https://modelcontextprotocol.io/docs/getting-started/intro).
:::

## Architecture: host, client, server

```viz algo=arch title="MCP architecture" dir=down
host  Host application | chat app, IDE, agent [client] @0,1
mdl   LLM | decides which tool to call [llm] @0,2.4
c1    MCP client 1 | one per server [gateway] @1,0
c2    MCP client 2 [gateway] @1,2
s1    MCP server: GitHub | tools + resources [service] @2,0
s2    MCP server: Postgres | tools + resources [db] @2,2
ext1  GitHub API [ext] @3,0
ext2  Database [db] @3,2
--
host -> c1
host -> c2
host <-> mdl
c1 -> s1 : JSON-RPC
c2 -> s2 : JSON-RPC
s1 -> ext1
s2 -> ext2
```

| Role | Who | Job |
|---|---|---|
| **Host** | the AI application (Claude Desktop, an IDE, your agent) | manages clients, enforces user consent and security, talks to the model |
| **Client** | a connector inside the host, **one per server** | maintains the session, speaks the protocol |
| **Server** | a program exposing capabilities (files, GitHub, a database, Slack, your internal API) | implements tools, resources, prompts |

## What a server can offer

| Primitive | Controlled by | What it is | Examples |
|---|---|---|---|
| **Tools** | the **model** | functions the model can call | `create_issue`, `run_query`, `send_message` |
| **Resources** | the **application** | read-only data the app can load into context, addressed by URI | `file:///project/README.md`, `db://orders/schema` |
| **Prompts** | the **user** | reusable, parameterised prompt templates (often shown as slash commands) | "review this PR", "summarise this thread" |

Clients can also offer servers features such as **sampling** (the server asks the host's model to generate text, with user approval), **roots** (which directories the server may see) and **elicitation** (the server asks the user for input).

## The protocol on the wire

Everything is **JSON-RPC 2.0**: requests (with ids), responses, and one-way notifications.

:::flow Session lifecycle
initialize | client sends its protocol version and capabilities; server replies with its own
initialized | client notifies that setup is complete
Discover | tools/list, resources/list, prompts/list
Use | tools/call, resources/read, prompts/get
Notify | servers can announce list changes; progress and logging notifications
Close | shut down the transport
:::

```text
→ {"jsonrpc":"2.0","id":1,"method":"tools/list"}
← {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"get_weather","description":"Current weather for a city.","inputSchema":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}]}}

→ {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_weather","arguments":{"city":"Paris"}}}
← {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"18°C, clear"}],"isError":false}}
```

The host converts discovered tools into the model API's tool definitions, relays the model's tool calls to the right server, and feeds results back: **the same tool-use loop you already know**, with discovery and transport standardised.

## A mini MCP-style server and client

To make the protocol concrete, here is a tiny in-memory implementation (not the real SDK, but the same message shapes) you can read in one sitting.

```python run title="A miniature MCP server and client speaking JSON-RPC" level=advanced
import json

class MiniServer:
    """Handles JSON-RPC requests the way an MCP server does (in memory instead of stdio/HTTP)."""
    def __init__(self):
        self.tools = {
            "get_weather": {
                "description": "Current weather for a city. Use for weather questions. Returns temperature and conditions.",
                "inputSchema": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]},
                "fn": lambda a: f"{ {'Paris': 18, 'Oslo': 9}.get(a['city'], 20) }°C, clear",
            },
            "add": {
                "description": "Add two numbers. Returns the sum.",
                "inputSchema": {"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]},
                "fn": lambda a: str(a["a"] + a["b"]),
            },
        }
    def handle(self, raw):
        req = json.loads(raw)
        rid, method, params = req.get("id"), req["method"], req.get("params", {})
        def ok(result): return json.dumps({"jsonrpc": "2.0", "id": rid, "result": result})
        def err(code, msg): return json.dumps({"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": msg}})
        if method == "initialize":
            return ok({"protocolVersion": "2025-06-18", "capabilities": {"tools": {}}, "serverInfo": {"name": "mini", "version": "0.1"}})
        if method == "notifications/initialized":
            return None                                               # notifications get no response
        if method == "tools/list":
            return ok({"tools": [{"name": n, "description": t["description"], "inputSchema": t["inputSchema"]} for n, t in self.tools.items()]})
        if method == "tools/call":
            tool = self.tools.get(params.get("name"))
            if not tool: return err(-32602, f"Unknown tool: {params.get('name')}")
            missing = [k for k in tool["inputSchema"]["required"] if k not in params.get("arguments", {})]
            if missing: return ok({"content": [{"type": "text", "text": f"Missing arguments: {missing}"}], "isError": True})   # tool errors are results
            return ok({"content": [{"type": "text", "text": tool["fn"](params["arguments"])}], "isError": False})
        return err(-32601, f"Method not found: {method}")

class MiniClient:
    def __init__(self, server):
        self.server, self.next_id = server, 0
    def request(self, method, params=None):
        self.next_id += 1
        raw = self.server.handle(json.dumps({"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params or {}}))
        return json.loads(raw)
    def notify(self, method):
        self.server.handle(json.dumps({"jsonrpc": "2.0", "method": method}))

client = MiniClient(MiniServer())
print("initialize ->", client.request("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}})["result"]["serverInfo"])
client.notify("notifications/initialized")

tools = client.request("tools/list")["result"]["tools"]
print("discovered:", [t["name"] for t in tools])

# Convert MCP tool descriptors to an LLM API's tool definitions (the host's job)
llm_tools = [{"name": t["name"], "description": t["description"], "input_schema": t["inputSchema"]} for t in tools]
print("as LLM tool spec:", json.dumps(llm_tools[0])[:100], "...")

# The model asks for a tool call; the host forwards it to the right server
print(client.request("tools/call", {"name": "get_weather", "arguments": {"city": "Paris"}})["result"]["content"][0]["text"])
print(client.request("tools/call", {"name": "add", "arguments": {"a": 2}})["result"])           # tool-level error
print(client.request("tools/call", {"name": "nope", "arguments": {}})["error"])                   # protocol-level error
print(client.request("resources/list")["error"])                                                  # capability not offered
```

Notice the two kinds of failure: a **protocol error** (unknown method, bad params: a JSON-RPC `error`) and a **tool execution error** (the call ran and failed: a normal result with `isError: true`, which the model can read and recover from).

## Transports

| Transport | Use | Notes |
|---|---|---|
| **stdio** | local servers launched by the host as subprocesses; messages over stdin/stdout | simplest; great for desktop apps and dev tools; never print logs to stdout (use stderr) |
| **Streamable HTTP** | remote servers; POST for requests, optional streaming responses (SSE) | supports multiple clients, deployment behind load balancers, OAuth-based authorisation |

## Building a server in Python

The official Python SDK makes a server a few lines using decorators ([SDK repo](https://github.com/modelcontextprotocol/python-sdk)):

```python local title="A real MCP server with FastMCP"
# pip install "mcp[cli]"
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("orders")

@mcp.tool()
def get_order_status(order_id: str) -> str:
    """Look up the shipping status of an order. Use when a customer asks where their order is.

    Args:
        order_id: Order id such as 'A-10293'.
    """
    return f"Order {order_id}: shipped, arriving Friday"

@mcp.resource("policy://refunds")
def refund_policy() -> str:
    """The current refund policy text."""
    return "Refunds are issued within 30 days of delivery."

@mcp.prompt()
def review_ticket(ticket_text: str) -> str:
    """Prompt template: review a support ticket."""
    return f"Review this support ticket for tone and policy compliance:\n\n{ticket_text}"

if __name__ == "__main__":
    mcp.run()          # stdio by default; use transport="streamable-http" for remote deployment
```

Register it with a host (for example in Claude Desktop's or an IDE's config: a command like `python server.py`), or test it with the **MCP Inspector**. There are thousands of existing servers ([official reference servers](https://github.com/modelcontextprotocol/servers), community lists): reuse before you build.

## Using MCP from the Claude API

The Claude API can connect to **remote MCP servers directly** (the MCP connector): you list servers and enable their tools; the API discovers and calls them. Two parts are required (a beta feature at the time of writing; check the docs for the current beta flag):

```python local title="MCP connector (remote servers) on the Messages API"
response = client.beta.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=2000,
    betas=["mcp-client-2025-11-20"],
    mcp_servers=[{"type": "url", "url": "https://mcp.example.com/sse", "name": "orders"}],
    tools=[{"type": "mcp_toolset", "mcp_server_name": "orders"}],        # both halves are needed
    messages=[{"role": "user", "content": "Where is order A-10293?"}],
)
```

For **local** servers or finer control, use the SDK's MCP helpers (`anthropic[mcp]`) to convert MCP tools to API tools and run them with the tool runner.

## Security: what can go wrong

MCP makes it easy to plug in powerful capabilities, which is also why it is a **new attack surface**:

| Risk | What happens | Defences |
|---|---|---|
| **Tool poisoning** | a malicious server hides instructions in a tool's **description** that the model follows (it reads descriptions as trusted) | only install **trusted** servers; review descriptions; pin versions; show full tool metadata to users |
| **"Rug pull"** | a server changes its tools after you approved it | pin and hash tool definitions; re-approve on change |
| **Prompt injection via results** | tool output (an email, an issue, a web page) contains instructions | treat all tool output as untrusted data; limit what the model may do next; approvals |
| **Confused deputy** | a server with broad credentials acts for any caller | per-user OAuth tokens, least privilege, never "token passthrough" |
| **Excessive scope** | one server can read mail, write files and call the shell | small, purpose-specific servers; scoped permissions |
| **Command / path injection in the server** | untrusted arguments reach a shell or file path | validate arguments, sandbox, no string-built commands |
| **Supply chain** | a malicious or compromised package posing as a server | vet sources, sandbox, run in containers, least privilege |
| **Data exfiltration across servers** | a model with a private-data server plus an outbound server can leak data | "lethal trifecta" thinking (module 7): avoid combining private data, untrusted content and external communication without human approval |

Host-side good practice: **per-tool user consent** with clear descriptions of arguments, allow-lists of servers, **sandboxed** local servers, logging of every call, and **separate trust levels** for local first-party versus remote third-party servers.

## When to use MCP (and when not)

| Use MCP when… | A plain function tool is fine when… |
|---|---|
| tools should work across several apps/agents and models | the tool is internal to one application |
| a vendor or community already ships a server | the function is trivial and tightly coupled to your code |
| you want users to add their own integrations | you need lowest latency and full control |
| you need standard auth, discovery and consent flows | the tool list is small and stable |

MCP also pairs with the next lesson's ideas: with many servers the tool list can bloat the context, so use **tool search**, load servers on demand, or let agents **call MCP tools through code** to keep intermediate data out of the window ([Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)).

```quiz
? What problem does MCP solve?
- Faster inference
+ Replaces M×N custom integrations with one standard way for apps to use tools and data from servers
- Model training
> Write a server once and any MCP-capable host can use it.

? Which MCP primitive is controlled by the model?
+ Tools
- Resources
- Prompts
> Tools are model-invoked; resources are app-controlled; prompts are user-controlled.

? What is the difference between a protocol error and a tool error in MCP?
+ A protocol error is a JSON-RPC error (bad method or params); a tool error is a normal result with isError true that the model can read
- They are the same
- Tool errors crash the server
> Tool execution failures are returned as results so the model can recover.

? What is tool poisoning?
+ A malicious server embeds instructions in tool descriptions or results that steer the model
- Slow tools
- A schema validation error
> Treat third-party servers as untrusted and review what they expose.
```

:::problem Your team wants to give an agent an MCP server for the company wiki and another for sending email. What are the risks and the design? {level=hard tags="mcp,security"}
Think about data flow and permissions.

:::solution Model answer
The combination of **private data (wiki)**, **untrusted content (a wiki page or inbound email can contain injected instructions)** and an **outbound channel (email)** enables data exfiltration. Design: separate the two capabilities (run them in different agents/sessions, or require **human approval** for every send), give the email server a **recipient allow-list** and draft-only mode, scope wiki access to the requesting user's permissions via **per-user OAuth** (no shared super-token), treat wiki text as data (delimit, warn), log all calls, pin and review server tool definitions, run servers in sandboxes, and red-team with injected pages. Evaluate that the agent refuses to email out wiki contents on injected instruction.
:::
:::

:::keypoints
- MCP standardises connecting AI apps to tools, data and prompts: write a server once, use it from any compatible host.
- Architecture: host (app) → one client per server → servers exposing tools (model-controlled), resources (app-controlled), prompts (user-controlled).
- JSON-RPC 2.0 over stdio (local) or streamable HTTP (remote), with initialize, discovery and call methods; tool failures are results with isError.
- Build servers with the official SDKs; reuse existing ones; the Claude API can call remote MCP servers directly.
- Security is the big concern: tool poisoning, injection through results, confused deputies, excessive scope, supply chain; use least privilege, consent, sandboxing and trust separation.
:::

:::resources
- [modelcontextprotocol.io](https://modelcontextprotocol.io) and the [introduction](https://modelcontextprotocol.io/docs/getting-started/intro) — specification and guides.
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) and [reference servers](https://github.com/modelcontextprotocol/servers) — build and learn from examples.
- [Hugging Face MCP Course](https://huggingface.co/learn/mcp-course) — a free, hands-on course.
- [Anthropic: Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol) — the announcement and motivation.
- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) — scaling to many tools.
- [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) — a community directory of servers.
:::
