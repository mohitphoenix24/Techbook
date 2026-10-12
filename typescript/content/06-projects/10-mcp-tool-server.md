---
title: Typed MCP Tool Server & Client
level: advanced
time: 60
icon: network
cover: #64748b,#22d3ee
tags: MCP, JSON-RPC, mapped types, generics, Zod, transports
summary: Implement the heart of the Model Context Protocol yourself — a JSON-RPC server with tools, resources and prompts, a fully typed client where every method's params and result types come from one method map, an in-memory transport, and a scripted agent that discovers and uses the tools.
---

In the MCP lesson you used the official SDK. Here you build a compact MCP-style server and client **from scratch**, to see exactly how the protocol works — and to practise one of TypeScript's most useful patterns: a **method map** that types an entire RPC API.

:::flow Protocol flow
initialize | capabilities
tools/list · resources/list · prompts/list | discovery
tools/call | validated by Zod
resources/read · prompts/get | data + templates
Agent | discovers, then calls
:::

**You'll practise:** a method map with mapped/indexed types, generic `request<M>()`, discriminated JSON-RPC responses, Zod → JSON Schema, and transports behind an interface.

## Step 1 — Typing a whole RPC API with one map

```ts run level=advanced title="Step 1 · a method map"
type Methods = {
  "tools/list": { params: {}; result: { tools: { name: string; description: string }[] } };
  "tools/call": { params: { name: string; arguments: Record<string, unknown> }; result: { content: { type: "text"; text: string }[]; isError?: boolean } };
};

declare function request<M extends keyof Methods>(method: M, params: Methods[M]["params"]): Promise<Methods[M]["result"]>;

type CallResult = Awaited<ReturnType<typeof request<"tools/call">>>;
//   ^?
console.log("One map → every method's params and result are typed. (See the type above.)");
```

## Step 2 — The complete server, client and agent

```ts run level=advanced title="MCP-style server + client · complete"
import { z } from "zod";

// ======================= protocol types =======================
type ToolInfo = { name: string; description: string; inputSchema: unknown };
type Content = { type: "text"; text: string };
type Methods = {
  "initialize": { params: { clientInfo: { name: string; version: string } }; result: { serverInfo: { name: string; version: string }; capabilities: Record<"tools" | "resources" | "prompts", boolean> } };
  "tools/list": { params: Record<string, never>; result: { tools: ToolInfo[] } };
  "tools/call": { params: { name: string; arguments: Record<string, unknown> }; result: { content: Content[]; isError?: boolean } };
  "resources/list": { params: Record<string, never>; result: { resources: { uri: string; name: string; mimeType: string }[] } };
  "resources/read": { params: { uri: string }; result: { contents: { uri: string; text: string }[] } };
  "prompts/list": { params: Record<string, never>; result: { prompts: { name: string; arguments: string[] }[] } };
  "prompts/get": { params: { name: string; arguments: Record<string, string> }; result: { messages: { role: "user"; content: Content }[] } };
};
type MethodName = keyof Methods;
type Request = { jsonrpc: "2.0"; id: number; method: string; params?: unknown };
type Response = { jsonrpc: "2.0"; id: number; result: unknown } | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

class RpcError extends Error { readonly code: number; constructor(code: number, message: string) { super(message); this.code = code; } }

// ======================= server =======================
type ToolDef<S extends z.ZodObject> = { description: string; input: S; handler: (args: z.output<S>) => Promise<string> | string };
type Handlers = { [M in MethodName]: (params: Methods[M]["params"]) => Promise<Methods[M]["result"]> | Methods[M]["result"] };

class McpLikeServer {
  #tools = new Map<string, ToolDef<z.ZodObject>>();
  #resources = new Map<string, { name: string; mimeType: string; read: () => string }>();
  #prompts = new Map<string, { arguments: string[]; template: string }>();
  readonly name: string;
  constructor(name: string) { this.name = name; }

  tool<S extends z.ZodObject>(name: string, def: ToolDef<S>) { this.#tools.set(name, def as unknown as ToolDef<z.ZodObject>); return this; }
  resource(uri: string, name: string, read: () => string, mimeType = "text/plain") { this.#resources.set(uri, { name, mimeType, read }); return this; }
  prompt(name: string, template: string) { this.#prompts.set(name, { template, arguments: [...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]) }); return this; }

  // Every method must be implemented — the mapped type `Handlers` enforces it
  #handlers: Handlers = {
    "initialize": () => ({ serverInfo: { name: this.name, version: "1.0.0" }, capabilities: { tools: this.#tools.size > 0, resources: this.#resources.size > 0, prompts: this.#prompts.size > 0 } }),
    "tools/list": () => ({ tools: [...this.#tools].map(([name, t]) => ({ name, description: t.description, inputSchema: z.toJSONSchema(t.input) })) }),
    "tools/call": async ({ name, arguments: args }) => {
      const tool = this.#tools.get(name);
      if (!tool) throw new RpcError(-32602, `Unknown tool: ${name}`);
      const parsed = tool.input.safeParse(args);
      if (!parsed.success) return { content: [{ type: "text", text: z.prettifyError(parsed.error) }], isError: true };
      try { return { content: [{ type: "text", text: await tool.handler(parsed.data) }] }; }
      catch (e) { return { content: [{ type: "text", text: (e as Error).message }], isError: true }; }
    },
    "resources/list": () => ({ resources: [...this.#resources].map(([uri, r]) => ({ uri, name: r.name, mimeType: r.mimeType })) }),
    "resources/read": ({ uri }) => {
      const r = this.#resources.get(uri);
      if (!r) throw new RpcError(-32002, `Resource not found: ${uri}`);
      return { contents: [{ uri, text: r.read() }] };
    },
    "prompts/list": () => ({ prompts: [...this.#prompts].map(([name, p]) => ({ name, arguments: p.arguments })) }),
    "prompts/get": ({ name, arguments: args }) => {
      const p = this.#prompts.get(name);
      if (!p) throw new RpcError(-32602, `Unknown prompt: ${name}`);
      const missing = p.arguments.filter((a) => !(a in args));
      if (missing.length) throw new RpcError(-32602, `Missing prompt arguments: ${missing.join(", ")}`);
      return { messages: [{ role: "user", content: { type: "text", text: p.template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => args[k]) } }] };
    },
  };

  async handle(raw: string): Promise<string> {
    const req = JSON.parse(raw) as Request;
    try {
      if (!(req.method in this.#handlers)) throw new RpcError(-32601, `Method not found: ${req.method}`);
      const handler = this.#handlers[req.method as MethodName] as (p: unknown) => unknown;
      return JSON.stringify({ jsonrpc: "2.0", id: req.id, result: await handler(req.params ?? {}) } satisfies Response);
    } catch (e) {
      const err = e instanceof RpcError ? e : new RpcError(-32603, (e as Error).message);
      return JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: err.code, message: err.message } } satisfies Response);
    }
  }
}

// ======================= transport + typed client =======================
interface Transport { send(message: string): Promise<string> }
const inMemory = (server: McpLikeServer, log = false): Transport => ({
  async send(message) { if (log) console.log("  →", message); const reply = await server.handle(message); if (log) console.log("  ←", reply.slice(0, 160)); return reply; },
});

class McpLikeClient {
  #id = 0;
  readonly transport: Transport;
  constructor(transport: Transport) { this.transport = transport; }
  async request<M extends MethodName>(method: M, params: Methods[M]["params"]): Promise<Methods[M]["result"]> {
    const res = JSON.parse(await this.transport.send(JSON.stringify({ jsonrpc: "2.0", id: ++this.#id, method, params }))) as Response;
    if ("error" in res) throw new RpcError(res.error.code, res.error.message);
    return res.result as Methods[M]["result"];
  }
}

// ======================= a notes server =======================
const notes = [
  { date: "2026-10-05", text: "Chose hybrid search (BM25 + vectors) for the docs bot." },
  { date: "2026-10-06", text: "Refund window confirmed as 30 days by the billing team." },
  { date: "2026-10-07", text: "Eval pass rate went from 82% to 91% after the new prompt." },
];

const server = new McpLikeServer("notes")
  .tool("search_notes", {
    description: "Search notes by keyword",
    input: z.object({ query: z.string().min(2), limit: z.number().int().max(10).default(3) }),
    handler: ({ query, limit }) => notes.filter((n) => n.text.toLowerCase().includes(query.toLowerCase())).slice(0, limit).map((n) => `${n.date}: ${n.text}`).join("\n") || "No notes found",
  })
  .tool("add_note", {
    description: "Add a note for a date",
    input: z.object({ date: z.iso.date(), text: z.string().min(3) }),
    handler: ({ date, text }) => { notes.push({ date, text }); return `Saved. ${notes.length} notes total.`; },
  })
  .resource("notes://all", "All notes", () => notes.map((n) => `${n.date}: ${n.text}`).join("\n"))
  .prompt("weekly_summary", "Summarise these notes for {{audience}} in {{bullets}} bullet points:\n\n{{notes}}");

// ======================= protocol walkthrough =======================
const client = new McpLikeClient(inMemory(server, true));
console.log("— handshake and discovery");
const init = await client.request("initialize", { clientInfo: { name: "demo", version: "1.0.0" } });
//    ^?
const { tools } = await client.request("tools/list", {});
console.log("tools:", tools.map((t) => t.name).join(", "));

const quiet = new McpLikeClient(inMemory(server));
console.log("\n— calls");
console.log((await quiet.request("tools/call", { name: "search_notes", arguments: { query: "refund" } })).content[0].text);
console.log((await quiet.request("tools/call", { name: "add_note", arguments: { date: "07/10/2026", text: "bad date" } })).content[0].text);
console.log((await quiet.request("tools/call", { name: "add_note", arguments: { date: "2026-10-08", text: "Shipped the eval dashboard." } })).content[0].text);
console.log((await quiet.request("resources/read", { uri: "notes://all" })).contents[0].text.split("\n").length, "lines in notes://all");
const prompt = await quiet.request("prompts/get", { name: "weekly_summary", arguments: { audience: "the team", bullets: "3", notes: "…" } });
console.log("prompt:", prompt.messages[0].content.text.split("\n")[0]);
try { await quiet.request("prompts/get", { name: "weekly_summary", arguments: { audience: "the team" } }); }
catch (e) { console.log("rpc error:", (e as RpcError).code, (e as Error).message); }

// ======================= a scripted agent using discovered tools =======================
async function agent(question: string) {
  const available = (await quiet.request("tools/list", {})).tools.map((t) => t.name);
  // A real agent passes `tools` (with inputSchema) to Claude and lets it choose; we script the choice:
  const keyword = question.toLowerCase().match(/\b(refund|search|eval|prompt)\w*/)?.[1] ?? question.split(" ")[0];
  if (!available.includes("search_notes")) return "No search tool available.";
  const result = await quiet.request("tools/call", { name: "search_notes", arguments: { query: keyword } });
  return result.isError ? `Tool failed: ${result.content[0].text}` : `From your notes:\n${result.content[0].text}`;
}
console.log("\n— agent");
console.log(await agent("What did we decide about refunds?"));
console.log(await agent("How did the eval go?"));
```

## How it works

| Piece | Technique |
|---|---|
| one source of truth | `Methods` maps each method name to its `params` and `result` types |
| complete server | `Handlers = { [M in MethodName]: (p: Methods[M]["params"]) => … }` — forget a method and it won't compile |
| typed client | `request<M extends MethodName>(method: M, params: Methods[M]["params"]): Promise<Methods[M]["result"]>` |
| tool schemas | Zod for validation **and** `z.toJSONSchema` for discovery |
| errors | invalid tool input → `isError` result (model can retry); protocol problems → JSON-RPC `error` |
| transports | a `Transport` interface: in-memory here; stdio or HTTP in real MCP |

## Making it real

Use the official SDK for production servers — it implements the full spec (protocol versions, notifications, sessions, auth). Your server from the MCP lesson, in one line per tool:

```ts nocheck
server.registerTool("search_notes", { description: "Search notes by keyword", inputSchema: z.object({ query: z.string().min(2) }) },
  async ({ query }) => ({ content: [{ type: "text", text: searchNotes(query) }] }));
```

:::exercise Extend it
1. Add **notifications** (messages without an `id`) like `notifications/tools/list_changed`, and make the client re-list tools when it receives one.
2. Implement a stdio transport with Node.js (`process.stdin` lines → `server.handle` → `process.stdout`).
3. Replace the scripted agent with Claude: pass `tools` (name, description, `inputSchema`) and run the agent loop from Module 5.
4. Add `resources/templates/list` with URI templates like `notes://{date}`.
:::

:::keypoints
- MCP is JSON-RPC: requests with `method`/`params`, responses with `result` or `error`.
- A **method map** type gives you a typed client and forces the server to implement every method.
- Validate tool arguments with Zod; advertise them with `z.toJSONSchema`; return invalid input as `isError`.
- Hide transports behind an interface; use the official SDK for production servers.
:::
