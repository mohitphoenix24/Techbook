---
title: MCP Servers & Clients
level: advanced
time: 40
summary: The Model Context Protocol in TypeScript — what MCP is, how its JSON-RPC messages work (with a runnable in-memory server and client), building a real server with the v2 SDK (registerTool, Zod schemas, structured output, stdio), connecting as a client, and letting Claude use remote MCP servers directly.
---

Every AI app used to wire up tools its own way. **MCP** (Model Context Protocol) is a standard so a tool server written once works with any MCP-capable host — Claude Desktop, Claude Code, IDEs, your own agents.

:::def MCP (Model Context Protocol)
An open protocol for connecting AI applications to **tools**, **resources** (readable data) and **prompts**. A **server** exposes capabilities; a **client** (inside a host app) discovers and calls them. Messages are JSON-RPC 2.0 over stdio or HTTP.
:::

| Concept | What it is | Example |
|---|---|---|
| **tool** | an action the model can call | `search_notes`, `create_ticket` |
| **resource** | data the host can read | `notes://2026-10-07`, a file, a DB row |
| **prompt** | a reusable prompt template | "summarise this repository" |
| **transport** | how messages travel | stdio (local process) or Streamable HTTP (remote) |

## How it works: JSON-RPC messages

Under the hood, client and server exchange small JSON messages: `initialize`, then `tools/list`, then `tools/call`. Here is a miniature server and client talking through an in-memory "pipe", so you can see every message:

```ts run level=advanced
import { z } from "zod";

type JsonRpcRequest = { jsonrpc: "2.0"; id: number; method: string; params?: Record<string, unknown> };
type JsonRpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { code: number; message: string } };

// ---------------- a tiny MCP-style server ----------------
type Tool<S extends z.ZodObject> = { description: string; inputSchema: S; handler: (args: z.output<S>) => Promise<string> };
const NOTES = ["Refund window is 30 days", "Pro plan costs $8/month", "Sync works offline"];

const tools: Record<string, Tool<z.ZodObject>> = {
  search_notes: {
    description: "Search the user's notes",
    inputSchema: z.object({ query: z.string().min(2) }),
    handler: async (args) => {
      const q = String(args.query).toLowerCase();
      return NOTES.filter((n) => n.toLowerCase().includes(q)).join("\n") || "No matching notes";
    },
  },
};

async function handle(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  switch (req.method) {
    case "initialize":
      return { jsonrpc: "2.0", id: req.id, result: { serverInfo: { name: "notes", version: "1.0.0" }, capabilities: { tools: {} } } };
    case "tools/list":
      return { jsonrpc: "2.0", id: req.id, result: { tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: z.toJSONSchema(t.inputSchema) })) } };
    case "tools/call": {
      const { name, arguments: args } = req.params as { name: string; arguments: unknown };
      const tool = tools[name];
      if (!tool) return { jsonrpc: "2.0", id: req.id, error: { code: -32602, message: `Unknown tool ${name}` } };
      const parsed = tool.inputSchema.safeParse(args);
      if (!parsed.success) return { jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: z.prettifyError(parsed.error) }], isError: true } };
      return { jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: await tool.handler(parsed.data) }] } };
    }
    default:
      return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
  }
}

// ---------------- an in-memory transport + client ----------------
let nextId = 1;
async function send(method: string, params?: Record<string, unknown>) {
  const request: JsonRpcRequest = { jsonrpc: "2.0", id: nextId++, method, params };
  console.log("→", JSON.stringify(request));
  const response = await handle(JSON.parse(JSON.stringify(request)));     // serialise like a real wire
  console.log("←", JSON.stringify(response).slice(0, 220));
  return response;
}

await send("initialize", { clientInfo: { name: "demo-client", version: "1.0.0" } });
await send("tools/list");
await send("tools/call", { name: "search_notes", arguments: { query: "refund" } });
await send("tools/call", { name: "search_notes", arguments: { query: "x" } });
await send("tools/call", { name: "delete_everything", arguments: {} });
```

Notice the two kinds of failure: invalid **arguments** come back as a normal result with `isError: true` (so the model can read it and retry), while an unknown **tool** is a protocol-level JSON-RPC `error`.

## A real server with the MCP TypeScript SDK (v2)

The v2 SDK splits into `@modelcontextprotocol/server` and `@modelcontextprotocol/client`. Tools take a **Zod schema** — from it the SDK derives the JSON Schema, validates arguments, and types your handler.

```bash
npm install @modelcontextprotocol/server zod
npm install -D typescript @types/node      # and "types": ["node"] in tsconfig.json
```

```ts
// src/server.ts
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const notes = new Map<string, string>([
  ["2026-10-06", "Decided to use hybrid search for the docs bot."],
  ["2026-10-07", "Refund window confirmed: 30 days."],
]);

serveStdio(() => {
  const server = new McpServer({ name: "notes", version: "1.0.0" });

  server.registerTool(
    "search_notes",
    {
      description: "Search the user's notes by keyword. Returns matching notes with their dates.",
      inputSchema: z.object({
        query: z.string().min(2).describe("Words to look for"),
        limit: z.number().int().max(20).optional(),
      }),
    },
    async ({ query, limit }) => {                       // typed from the schema
      const hits = [...notes].filter(([, text]) => text.toLowerCase().includes(query.toLowerCase()));
      const text = hits.slice(0, limit ?? 5).map(([date, t]) => `${date}: ${t}`).join("\n");
      return { content: [{ type: "text", text: text || "No matching notes" }] };
    },
  );

  server.registerTool(
    "add_note",
    {
      title: "Add a note",
      description: "Save a note for today's date.",
      inputSchema: z.object({ text: z.string().min(1) }),
      outputSchema: z.object({ date: z.string(), total: z.number() }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ text }) => {
      const date = new Date().toISOString().slice(0, 10);
      notes.set(date, text);
      const output = { date, total: notes.size };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  return server;
});

console.error("notes MCP server running on stdio");     // log to stderr — stdout is the protocol channel
```

:::warn Never console.log in a stdio server
With the stdio transport, **stdout carries the JSON-RPC messages**. A stray `console.log` corrupts the stream. Log with `console.error` (stderr) instead.
:::

Try it with the MCP Inspector, which launches your server and lets you call its tools from a browser:

```bash
npx @modelcontextprotocol/inspector node src/server.ts
```

## Connecting as a client — and handing the tools to Claude

```ts
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const mcp = new Client({ name: "my-agent", version: "1.0.0" });
await mcp.connect(new StdioClientTransport({ command: "node", args: ["src/server.ts"] }));

const { tools } = await mcp.listTools();
console.log(tools.map((t) => t.name));

// MCP tool definitions map directly onto Claude tool definitions
const claudeTools: Anthropic.Tool[] = tools.map((t) => ({
  name: t.name,
  description: t.description ?? "",
  input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
}));

const anthropic = new Anthropic();
const response = await anthropic.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 4000,
  tools: claudeTools,
  messages: [{ role: "user", content: "What did we decide about search?" }],
});

for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  const result = await mcp.callTool({ name: block.name, arguments: block.input as Record<string, unknown> });
  console.log(block.name, "→", JSON.stringify(result.content));
  // …send it back as a tool_result, exactly like the agent loop in the Tools lesson
}

await mcp.close();
```

## Remote MCP servers via the Claude API

For MCP servers reachable over HTTPS, Claude can connect **itself** — no client code. Name the server in `mcp_servers` and reference it from an `mcp_toolset` tool:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.beta.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 4000,
  betas: ["mcp-client-2025-11-20"],
  mcp_servers: [{ type: "url", url: "https://mcp.example.com/mcp", name: "docs", authorization_token: process.env.DOCS_MCP_TOKEN }],
  tools: [{ type: "mcp_toolset", mcp_server_name: "docs" }],
  messages: [{ role: "user", content: "Find our latest guidance on refunds." }],
});

for (const block of response.content) {
  if (block.type === "mcp_tool_use") console.log("called", block.server_name, block.name);
  if (block.type === "text") console.log(block.text);
}
```

:::tip Which way to connect?
**Local** tools (files, your machine, a dev database) → stdio server + your own client. **Remote** shared tools (company knowledge, SaaS APIs) → Streamable HTTP server, and let Claude connect with `mcp_servers`. The same `McpServer` code can serve both transports.
:::

:::ai
Building one MCP server for your company's data (tickets, docs, metrics) makes it available to every MCP host your team uses — Claude Desktop, Claude Code, IDE assistants and your own agents — without writing a separate integration for each. Type-safe Zod schemas make those tools reliable for every client at once.
:::

## Check yourself

```quiz
? What format do MCP messages use?
+ JSON-RPC 2.0 (requests with method and params, responses with result or error)
- GraphQL
- Protocol Buffers
> initialize, tools/list and tools/call are JSON-RPC methods.

? Why must a stdio MCP server log with console.error?
+ stdout carries the protocol messages; extra output would corrupt them
- console.log is slower
- console.error is required by TypeScript
> stderr is safe for logs.

? What does registerTool's Zod inputSchema give you?
+ The advertised JSON Schema, argument validation, and typed handler arguments
- Faster tool execution
- Automatic authentication
> One schema, three uses — the same idea as Claude's tool helpers.
```

:::keypoints
- MCP standardises tools, resources and prompts between **servers** and **clients** over JSON-RPC.
- v2 SDK: `new McpServer(...)`, `server.registerTool(name, { description, inputSchema: z.object(...) }, handler)`, `serveStdio(factory)`.
- Invalid arguments return `isError: true` results; log to stderr in stdio servers.
- Client: `new Client(...)`, `connect(new StdioClientTransport(...))`, `listTools`, `callTool` — map tools to `Anthropic.Tool`.
- Remote servers: `client.beta.messages.create({ betas: ["mcp-client-2025-11-20"], mcp_servers, tools: [{ type: "mcp_toolset", ... }] })`.
:::
