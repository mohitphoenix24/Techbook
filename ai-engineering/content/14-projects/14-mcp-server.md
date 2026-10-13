---
title: Build an MCP Server and Client
level: advanced
time: 65
icon: plug
cover: #14b8a6,#f59e0b
tags: mcp, json-rpc, tools, resources, prompts, protocol
summary: Implement the Model Context Protocol from the wire up — JSON-RPC 2.0 messages, newline-delimited framing, the initialize handshake, tools, resources and prompts, error handling (protocol errors versus tool errors), notifications, concurrent requests, input validation and a path-traversal-safe file tool — plus a client with an approval policy for destructive tools. Then see the same server in a dozen lines with the official SDK.
---

The **Model Context Protocol (MCP)** is an open standard that lets AI applications connect to tools and data through a uniform interface: build a **server** once, and any MCP-capable client can use it. Under the hood it is plain **JSON-RPC 2.0** over a transport (standard input/output for local servers, HTTP for remote ones). Implementing it yourself removes the mystery, and shows exactly where security decisions live.

**What you'll build:** an MCP-style server (tools, resources, prompts), a client, an in-memory transport, and a scripted session. The wire format and method names follow the MCP specification; production servers should use the official SDKs, which handle the full spec.

:::flow A session
Connect | transport: stdio or HTTP
Initialize | version and capabilities
Initialized | client confirms
Discover | tools/list, resources/list, prompts/list
Use | tools/call, resources/read, prompts/get
Notify | list_changed, progress
Close | transport ends
:::

## Step 1 — JSON-RPC 2.0 in thirty lines

Every MCP message is a JSON object. There are three kinds:

- **Request**: has an `id` and a `method`; expects a response with the same `id`.
- **Response**: has the `id` and either a `result` or an `error` (`code`, `message`).
- **Notification**: a `method` with **no `id`**; nothing is sent back.

```python run shared title="Step 1 · message helpers and error codes"
import asyncio, json, inspect, posixpath, re
from collections import defaultdict

PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL_ERROR = -32700, -32600, -32601, -32602, -32603

def request(id_, method, params=None):  return {"jsonrpc": "2.0", "id": id_, "method": method, **({"params": params} if params is not None else {})}
def notification(method, params=None):  return {"jsonrpc": "2.0", "method": method, **({"params": params} if params is not None else {})}
def result(id_, value):                 return {"jsonrpc": "2.0", "id": id_, "result": value}
def error(id_, code, message):          return {"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}}

class RPCError(Exception):
    def __init__(self, code, message): super().__init__(message); self.code, self.message = code, message

print(json.dumps(request(1, "tools/list")))
print(json.dumps(notification("notifications/initialized")))
print(json.dumps(error(7, METHOD_NOT_FOUND, "no such method")))
```

## Step 2 — A transport: newline-delimited JSON

MCP's stdio transport sends **one JSON message per line**. We replace the pipes with in-memory queues so everything runs in the browser, and keep a **wire log** so you can see exactly what crosses the boundary.

```python run shared title="Step 2 · in-memory transport with a wire log"
class Pipe:
    def __init__(self, wire, label): self.q, self.wire, self.label = asyncio.Queue(), wire, label
    async def write(self, line):
        self.wire.append((self.label, line)); await self.q.put(line)
    async def readline(self):
        return await self.q.get()

def make_transport():
    wire = []
    client_to_server, server_to_client = Pipe(wire, "client -> server"), Pipe(wire, "server -> client")
    return client_to_server, server_to_client, wire

print("transport ready: each message is one line of JSON")
```

## Step 3 — The server: tools, resources and prompts

An MCP server offers three kinds of capability:

- **Tools**: functions the model can call (with side effects). Model-controlled.
- **Resources**: read-only data identified by URIs (files, records). Application-controlled.
- **Prompts**: reusable templates the user can pick. User-controlled.

Tool schemas come from Python type hints, as in the agent project. Pay attention to the **two kinds of failure**: a malformed request is a **protocol error** (JSON-RPC `error`), but a tool that runs and fails is a normal **result with `isError: true`**, so the model can read the message and recover.

```python run shared title="Step 3 · the server class"
TYPE_NAMES = {str: "string", int: "integer", float: "number", bool: "boolean"}
PROTOCOL_VERSION = "2025-06-18"

class MCPServer:
    def __init__(self, name, version="1.0.0"):
        self.name, self.version = name, version
        self.tools, self.resources, self.prompts = {}, {}, {}
        self.outbox = None                                   # set when serving: used to push notifications

    # ----- registration -----
    def tool(self, read_only=False, destructive=False):
        def register(fn):
            props, required = {}, []
            for pname, p in inspect.signature(fn).parameters.items():
                props[pname] = {"type": TYPE_NAMES.get(p.annotation, "string")}
                if p.default is inspect.Parameter.empty: required.append(pname)
            self.tools[fn.__name__] = {"fn": fn, "spec": {
                "name": fn.__name__, "description": inspect.getdoc(fn).split("\n")[0],
                "inputSchema": {"type": "object", "properties": props, "required": required},
                "annotations": {"readOnlyHint": read_only, "destructiveHint": destructive}}}
            return fn
        return register
    def resource(self, uri, name, mime="text/plain"):
        def register(fn): self.resources[uri] = {"fn": fn, "name": name, "mimeType": mime}; return fn
        return register
    def prompt(self, name, description, arguments):
        def register(fn): self.prompts[name] = {"fn": fn, "spec": {"name": name, "description": description, "arguments": arguments}}; return fn
        return register

    # ----- method handlers: return a result, or raise RPCError for protocol errors -----
    async def handle(self, method, params):
        params = params or {}
        if method == "initialize":
            return {"protocolVersion": PROTOCOL_VERSION, "serverInfo": {"name": self.name, "version": self.version},
                    "capabilities": {"tools": {"listChanged": True}, "resources": {}, "prompts": {}}}
        if method == "ping": return {}
        if method == "tools/list": return {"tools": [t["spec"] for t in self.tools.values()]}
        if method == "tools/call": return await self.call_tool(params.get("name"), params.get("arguments", {}))
        if method == "resources/list": return {"resources": [{"uri": u, "name": r["name"], "mimeType": r["mimeType"]} for u, r in self.resources.items()]}
        if method == "resources/read":
            r = self.resources.get(params.get("uri"))
            if r is None: raise RPCError(INVALID_PARAMS, f"unknown resource {params.get('uri')!r}")
            return {"contents": [{"uri": params["uri"], "mimeType": r["mimeType"], "text": r["fn"]()}]}
        if method == "prompts/list": return {"prompts": [p["spec"] for p in self.prompts.values()]}
        if method == "prompts/get":
            p = self.prompts.get(params.get("name"))
            if p is None: raise RPCError(INVALID_PARAMS, f"unknown prompt {params.get('name')!r}")
            return {"messages": [{"role": "user", "content": {"type": "text", "text": p["fn"](**params.get("arguments", {}))}}]}
        raise RPCError(METHOD_NOT_FOUND, f"method {method!r} not found")

    async def call_tool(self, name, args):
        if name not in self.tools: raise RPCError(INVALID_PARAMS, f"unknown tool {name!r}")      # protocol error: the request itself is wrong
        schema = self.tools[name]["spec"]["inputSchema"]
        for key in schema["required"]:
            if key not in args: raise RPCError(INVALID_PARAMS, f"missing argument {key!r}")
        for key, value in args.items():
            if key not in schema["properties"]: raise RPCError(INVALID_PARAMS, f"unexpected argument {key!r}")
            want = {"string": str, "integer": int, "number": (int, float), "boolean": bool}[schema["properties"][key]["type"]]
            if not isinstance(value, want) or (want is int and isinstance(value, bool)): raise RPCError(INVALID_PARAMS, f"argument {key!r} must be {schema['properties'][key]['type']}")
        try:
            fn = self.tools[name]["fn"]
            out = fn(**args)
            if inspect.isawaitable(out): out = await out
            return {"content": [{"type": "text", "text": str(out)}], "isError": False}
        except Exception as e:                                # the tool ran and failed: report it as a result so the model can recover
            return {"content": [{"type": "text", "text": f"{type(e).__name__}: {e}"}], "isError": True}

    # ----- the message loop -----
    async def serve(self, reader, writer):
        self.outbox = writer
        tasks = set()
        async def respond(msg):
            try:
                reply = await self.dispatch(msg)
            except Exception as e:
                reply = error(msg.get("id"), INTERNAL_ERROR, f"internal error: {type(e).__name__}")
            if reply is not None: await writer.write(json.dumps(reply))
        while True:
            line = await reader.readline()
            if line is None: break                            # transport closed
            try: msg = json.loads(line)
            except json.JSONDecodeError:
                await writer.write(json.dumps(error(None, PARSE_ERROR, "parse error"))); continue
            t = asyncio.create_task(respond(msg)); tasks.add(t); t.add_done_callback(tasks.discard)    # each request runs concurrently
        await asyncio.gather(*tasks)

    async def dispatch(self, msg):
        if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0" or "method" not in msg:
            return error(msg.get("id") if isinstance(msg, dict) else None, INVALID_REQUEST, "invalid request")
        if "id" not in msg:                                   # a notification: act on it, never reply
            return None
        try: return result(msg["id"], await self.handle(msg["method"], msg.get("params")))
        except RPCError as e: return error(msg["id"], e.code, e.message)

    async def notify_tools_changed(self):
        await self.outbox.write(json.dumps(notification("notifications/tools/list_changed")))

print("MCPServer ready")
```

## Step 4 — A concrete server: a notes app

We build a small server with tools (one read-only, one destructive), resources and a prompt. The file tool is the classic place for a **path-traversal vulnerability**, so it normalises the path and refuses anything outside its sandbox.

```python run shared title="Step 4 · a notes server"
server = MCPServer("notes-server")
NOTES = {1: "Buy milk", 2: "Prepare MCP demo"}
FILES = {"/docs/readme.txt": "Welcome to the notes server.", "/docs/guide.txt": "Use add_note to save a note.", "/etc/secret.txt": "the root password is hunter2"}

@server.tool()
def add_note(text: str) -> str:
    """Save a new note and return its id."""
    new_id = max(NOTES, default=0) + 1; NOTES[new_id] = text
    return f"saved note {new_id}"

@server.tool(read_only=True)
def search_notes(query: str) -> str:
    """Find notes containing the query text."""
    hits = [f"{i}: {t}" for i, t in NOTES.items() if query.lower() in t.lower()]
    return "\n".join(hits) or "no matching notes"

@server.tool(destructive=True)
def delete_note(note_id: int) -> str:
    """Permanently delete a note by id."""
    del NOTES[note_id]                                         # a KeyError becomes a tool error result, not a crash
    return f"deleted note {note_id}"

@server.tool(read_only=True)
def read_file(path: str) -> str:
    """Read a text file from the documents folder."""
    clean = posixpath.normpath(path)                           # collapse '..' segments before checking
    if not clean.startswith("/docs/"): raise PermissionError(f"access outside /docs is not allowed: {path}")
    return FILES[clean]

@server.resource("notes://all", "All notes")
def all_notes(): return "\n".join(f"{i}: {t}" for i, t in NOTES.items())

@server.prompt("summarise_notes", "Ask the model to summarise the notes", [{"name": "style", "description": "bullet or paragraph", "required": False}])
def summarise_prompt(style="bullet"): return f"Summarise these notes as a {style} list:\n" + all_notes()

print("tools:", list(server.tools), "| resources:", list(server.resources), "| prompts:", list(server.prompts))
```

## Step 5 — The client

The client numbers its requests, keeps a table of **pending futures** keyed by id, and resolves each when the matching response arrives, in **any order**. Notifications from the server go to a separate list.

```python run shared title="Step 5 · the client"
class MCPClient:
    def __init__(self, reader, writer):
        self.reader, self.writer, self.next_id, self.pending, self.notifications = reader, writer, 0, {}, []
        self.reader_task = None
    def start(self): self.reader_task = asyncio.create_task(self._read_loop())
    async def _read_loop(self):
        while True:
            line = await self.reader.readline()
            if line is None: break
            msg = json.loads(line)
            if "id" in msg and msg["id"] in self.pending:
                fut = self.pending.pop(msg["id"])
                if "error" in msg: fut.set_exception(RPCError(msg["error"]["code"], msg["error"]["message"]))
                else: fut.set_result(msg["result"])
            elif "method" in msg and "id" not in msg: self.notifications.append(msg["method"])
    async def request(self, method, params=None, timeout=1.0):
        self.next_id += 1; fut = asyncio.get_running_loop().create_future(); self.pending[self.next_id] = fut
        await self.writer.write(json.dumps(request(self.next_id, method, params)))
        return await asyncio.wait_for(fut, timeout)
    async def notify(self, method, params=None): await self.writer.write(json.dumps(notification(method, params)))
    async def initialize(self):
        info = await self.request("initialize", {"protocolVersion": PROTOCOL_VERSION, "capabilities": {}, "clientInfo": {"name": "demo-client", "version": "0.1"}})
        await self.notify("notifications/initialized")
        return info
    async def list_tools(self): return (await self.request("tools/list"))["tools"]
    async def call_tool(self, name, **arguments): return await self.request("tools/call", {"name": name, "arguments": arguments})

print("MCPClient ready")
```

## Step 6 — A full session

We connect a client to the server, do the handshake, discover tools and use them. Then we print the **wire log**, the actual JSON that crossed the transport.

```python run shared title="Step 6 · handshake, discovery and calls"
async def session():
    c2s, s2c, wire = make_transport()
    server_task = asyncio.create_task(server.serve(c2s, s2c))
    client = MCPClient(s2c, c2s); client.start()

    info = await client.initialize()
    print("server:", info["serverInfo"]["name"], "| protocol", info["protocolVersion"], "| capabilities", list(info["capabilities"]))
    tools = await client.list_tools()
    print("tools:", [(t["name"], "read-only" if t["annotations"]["readOnlyHint"] else "destructive" if t["annotations"]["destructiveHint"] else "writes") for t in tools])
    print("call add_note   ->", (await client.call_tool("add_note", text="Ship the MCP project"))["content"][0]["text"])
    print("call search     ->", (await client.call_tool("search_notes", query="mcp"))["content"][0]["text"].replace("\n", " | "))
    print("resource        ->", (await client.request("resources/read", {"uri": "notes://all"}))["contents"][0]["text"].replace("\n", " | "))
    print("prompt          ->", (await client.request("prompts/get", {"name": "summarise_notes", "arguments": {"style": "bullet"}}))["messages"][0]["content"]["text"][:60].replace("\n", " | "), "...")

    await c2s.write(None); await server_task                        # close the transport
    return wire

wire = asyncio.run(session())
print(f"\n--- the first 6 of {len(wire)} wire messages ---")
for direction, line in wire[:6]:
    print(f"{direction:16} {str(line)[:110]}")
```

You have just seen the entire protocol: an `initialize` request, an `initialized` notification, then ordinary `tools/list` and `tools/call` requests. Everything an MCP client does is built from these.

## Step 7 — Errors: protocol errors versus tool errors

```python run shared title="Step 7 · the two kinds of failure"
async def errors():
    c2s, s2c, wire = make_transport()
    task = asyncio.create_task(server.serve(c2s, s2c)); client = MCPClient(s2c, c2s); client.start(); await client.initialize()

    async def attempt(label, coro):
        try:
            r = await coro
            text = r["content"][0]["text"] if isinstance(r, dict) and "content" in r else r
            print(f"{label:34} -> result{' (isError)' if isinstance(r, dict) and r.get('isError') else ''}: {text}")
        except RPCError as e:
            print(f"{label:34} -> JSON-RPC error {e.code}: {e.message}")

    await attempt("unknown method", client.request("tools/destroy"))
    await attempt("unknown tool", client.call_tool("format_disk"))
    await attempt("missing argument", client.request("tools/call", {"name": "add_note", "arguments": {}}))
    await attempt("wrong type", client.call_tool("delete_note", note_id="two"))
    await attempt("tool fails: no such note", client.call_tool("delete_note", note_id=999))
    await attempt("read_file in /docs", client.call_tool("read_file", path="/docs/readme.txt"))
    await attempt("path traversal attempt", client.call_tool("read_file", path="/docs/../etc/secret.txt"))
    await c2s.write("this is not json"); await asyncio.sleep(0)       # a malformed line
    await asyncio.sleep(0); await asyncio.sleep(0)
    print("raw parse error on the wire        ->", [l for d, l in wire if d.startswith("server") and "-32700" in str(l)])
    await c2s.write(None); await task

asyncio.run(errors())
```

The distinction matters to the model: a **protocol error** means "your request was malformed" (fix the call), while an **`isError` result** means "the tool ran and this is what went wrong" (reason about it and maybe try something else). The path-traversal attempt was stopped by normalising the path **before** checking the prefix, the standard defence.

## Step 8 — Concurrency and notifications

Because the server handles each request in its own task, a slow tool does not block a fast one, and responses can arrive **out of order**. The `id` ties each response to its request. Servers can also push **notifications**, for example when the list of tools changes.

```python run shared title="Step 8 · out-of-order responses and list_changed"
@server.tool(read_only=True)
async def slow_report(seconds: int) -> str:
    """Generate a report (takes a while)."""
    for _ in range(seconds * 5): await asyncio.sleep(0)       # simulated work: yields control to other requests
    return f"report finished after {seconds} units"

async def concurrency():
    c2s, s2c, wire = make_transport()
    task = asyncio.create_task(server.serve(c2s, s2c)); client = MCPClient(s2c, c2s); client.start(); await client.initialize()
    order = []
    async def timed(label, coro): r = await coro; order.append(label); return r
    await asyncio.gather(timed("slow call (id 2)", client.call_tool("slow_report", seconds=3)),
                         timed("fast call (id 3)", client.call_tool("search_notes", query="milk")))
    print("completion order:", order, "<- the fast call finished first even though it was sent second")

    @server.tool()
    def shout(text: str) -> str:
        """Return the text in capitals."""
        return text.upper()
    await server.notify_tools_changed(); await asyncio.sleep(0); await asyncio.sleep(0)
    print("notifications received by the client:", client.notifications)
    print("tools after the change:", [t["name"] for t in await client.list_tools()][-2:])
    await c2s.write(None); await task

asyncio.run(concurrency())
```

## Step 9 — The client's job: approvals and trust

MCP does not make a tool safe; it makes tools **discoverable**. Safety decisions belong to the **host application**: it decides which servers to connect, which tools the model may use, and when a human must approve. Tool **annotations** (`readOnlyHint`, `destructiveHint`) are only **hints from the server**, which may be wrong or malicious, so treat them as UX signals, never as a security guarantee.

```python run shared title="Step 9 · a client with an approval policy"
class PolicyClient(MCPClient):
    def __init__(self, *a, approve=lambda tool, args: False, allow_servers_tools=None):
        super().__init__(*a); self.approve, self.hints, self.allow = approve, {}, allow_servers_tools
    async def list_tools(self):
        tools = await super().list_tools()
        self.hints = {t["name"]: t["annotations"] for t in tools}
        return [t for t in tools if self.allow is None or t["name"] in self.allow]          # only expose allow-listed tools to the model
    async def call_tool(self, name, **arguments):
        if self.allow is not None and name not in self.allow: raise PermissionError(f"tool {name!r} is not enabled")
        hint = self.hints.get(name, {})
        if not hint.get("readOnlyHint", False) and not self.approve(name, arguments):        # anything that is not clearly read-only needs approval
            raise PermissionError(f"human approval required for {name}({arguments})")
        return await super().call_tool(name, **arguments)

async def policy_demo():
    c2s, s2c, _ = make_transport()
    task = asyncio.create_task(server.serve(c2s, s2c))
    client = PolicyClient(s2c, c2s, approve=lambda tool, args: tool == "add_note", allow_servers_tools={"search_notes", "add_note", "delete_note"}); client.start()
    await client.initialize(); await client.list_tools()
    for name, args in [("search_notes", {"query": "milk"}), ("add_note", {"text": "approved write"}), ("delete_note", {"note_id": 1}), ("read_file", {"path": "/docs/readme.txt"})]:
        try: r = await client.call_tool(name, **args); print(f"{name:13} allowed ->", r["content"][0]["text"])
        except PermissionError as e: print(f"{name:13} BLOCKED  ->", e)
    await c2s.write(None); await task

asyncio.run(policy_demo())
```

The big MCP risks are about **trust**: a malicious server can put instructions in a tool **description** (tool poisoning) or in a tool **result** (prompt injection), can change its tools after you approved it ("rug pull", hence `list_changed`), and can combine with other servers to exfiltrate data. Mitigate by **vetting and pinning servers**, **showing users the tool descriptions and arguments**, **least-privilege credentials**, **approval for side effects**, and the injection defences from the firewall project.

## Step 10 — The same server with the official SDK

Real servers use the SDK, which implements the whole specification (transports, auth, cancellation, progress). Our server in a dozen lines, using the Python SDK's `FastMCP` (runs on your machine):

```python local
# pip install mcp
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("notes-server")
NOTES = {1: "Buy milk", 2: "Prepare MCP demo"}

@mcp.tool()
def add_note(text: str) -> str:
    """Save a new note and return its id."""
    new_id = max(NOTES, default=0) + 1; NOTES[new_id] = text
    return f"saved note {new_id}"

@mcp.tool()
def search_notes(query: str) -> str:
    """Find notes containing the query text."""
    return "\n".join(f"{i}: {t}" for i, t in NOTES.items() if query.lower() in t.lower()) or "no matching notes"

@mcp.resource("notes://all")
def all_notes() -> str:
    """Every note."""
    return "\n".join(f"{i}: {t}" for i, t in NOTES.items())

if __name__ == "__main__":
    mcp.run()          # speaks MCP over stdin/stdout
```

Connect it to Claude Code with `claude mcp add notes -- python server.py`, or inspect it interactively with the MCP Inspector (`npx @modelcontextprotocol/inspector python server.py`). The type hints and docstrings become the tool schemas and descriptions, exactly as in Step 3.

## How it works

| Piece | What it does |
|---|---|
| JSON-RPC 2.0 | requests (id + method), responses (result or error), notifications (no id) |
| Framing | one JSON message per line on stdio; HTTP transports carry the same messages |
| `initialize` and `notifications/initialized` | version and capability negotiation before anything else |
| `tools/list`, `tools/call` | discover and invoke model-controlled functions; schemas in `inputSchema` |
| `resources/*` | read-only, URI-addressed data for the application to attach |
| `prompts/*` | parameterised templates the user selects |
| Protocol error vs `isError` result | malformed request vs tool that ran and failed |
| Concurrency by request id | slow calls do not block fast ones |
| Notifications (`list_changed`) | the server tells clients its capabilities changed |
| Host policy | approvals, allow-lists and vetting: the actual security layer |

:::exercise Extend it
1. Add **progress notifications**: a long tool sends `notifications/progress` with a token the client supplied, and the client prints a progress bar.
2. Add **cancellation**: the client sends `notifications/cancelled` for a request id and the server stops that task.
3. Implement **resource templates** (`notes://{id}`) and **subscriptions** with `notifications/resources/updated`.
4. Add **authentication** to a simple HTTP-style transport (a bearer token checked before dispatch).
5. Connect your `MCPClient` to the agent framework project: convert `tools/list` results to the Claude API `tools` format (`inputSchema` becomes `input_schema`) and run the agent loop against your server.
:::

:::keypoints
- MCP is JSON-RPC 2.0 with a defined lifecycle: `initialize`, `notifications/initialized`, then `tools/*`, `resources/*` and `prompts/*`; stdio framing is one JSON message per line.
- Tools are model-controlled, resources application-controlled, prompts user-controlled.
- Distinguish protocol errors (malformed request, JSON-RPC error) from tool errors (`isError: true` result the model can read).
- Request ids make concurrent calls and out-of-order responses safe; notifications such as `list_changed` keep clients in sync.
- Security lives in the host: vet and pin servers, show tool descriptions, enforce approvals and allow-lists, normalise paths, validate inputs, and treat tool descriptions and results as untrusted.
- Use the official SDKs in production; building the protocol once makes everything they do understandable.
:::
