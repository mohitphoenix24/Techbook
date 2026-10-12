---
title: Mini Agent Framework with Typed Tools
level: advanced
time: 70
icon: bot
cover: #f97316,#8b5cf6
tags: agents, Zod, generics, event emitters, approvals, tracing, budgets
summary: Build a small but serious agent framework — tools defined once with Zod (typed + validated + JSON Schema), a typed tool registry, a pluggable model interface, an agent loop with step and cost budgets, human approval for risky tools, error recovery, and a typed event trace.
---

Agent frameworks look magical until you build one. The core is a loop (model → tools → model…); the value is in everything around it: **typed tools, validation, budgets, approvals and traces**. This project builds all of it in ~200 lines, with a scripted model so it runs here.

:::flow Agent run
Task | user goal
Model step | text or tool calls
Validate | Zod schema per tool
Approve? | risky tools ask a human
Execute | result or error → model
Trace | typed events for every step
:::

**You'll practise:** inference across an object of tools (`defineTools`), `z.output`, generic event emitters, discriminated unions for model output and events, async control flow with budgets.

## The complete framework

```ts run level=advanced title="Agent framework · complete"
import { z } from "zod";

// ======================= tools =======================
type ToolSpec<S extends z.ZodType = z.ZodType, R = unknown> = {
  description: string;
  input: S;
  risky?: boolean;
  run: (input: z.output<S>, ctx: { signal: AbortSignal }) => Promise<R>;
};
const tool = <S extends z.ZodType, R>(spec: ToolSpec<S, R>) => spec;

// The JSON Schema a real model would receive for each tool
function toolDefinitions(tools: Record<string, ToolSpec>) {
  return Object.entries(tools).map(([name, t]) => ({ name, description: t.description, input_schema: z.toJSONSchema(t.input) }));
}

// ======================= model interface =======================
type ToolCall = { id: string; name: string; input: unknown };
type ModelOutput = { kind: "final"; text: string } | { kind: "tools"; thought: string; calls: ToolCall[] };
type Transcript = ({ role: "user"; text: string } | { role: "assistant"; output: ModelOutput } | { role: "tool"; callId: string; ok: boolean; content: string })[];

interface Model {
  readonly name: string;
  next(transcript: Transcript, tools: ReturnType<typeof toolDefinitions>): Promise<{ output: ModelOutput; tokens: number }>;
}

// ======================= typed events =======================
type AgentEvent =
  | { type: "step"; step: number }
  | { type: "thought"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; callId: string; ok: boolean; content: string; ms: number }
  | { type: "approval"; tool: string; approved: boolean }
  | { type: "final"; text: string }
  | { type: "budget_exceeded"; reason: string };

// ======================= the agent =======================
type AgentOptions = { maxSteps: number; maxTokens: number; approve: (tool: string, input: unknown) => Promise<boolean>; onEvent: (e: AgentEvent) => void };

async function runAgent(model: Model, tools: Record<string, ToolSpec>, task: string, opts: AgentOptions): Promise<string> {
  const transcript: Transcript = [{ role: "user", text: task }];
  const defs = toolDefinitions(tools);
  const controller = new AbortController();
  let tokens = 0;

  for (let step = 1; step <= opts.maxSteps; step++) {
    opts.onEvent({ type: "step", step });
    const { output, tokens: used } = await model.next(transcript, defs);
    tokens += used;
    transcript.push({ role: "assistant", output });
    if (tokens > opts.maxTokens) { opts.onEvent({ type: "budget_exceeded", reason: `${tokens} tokens > ${opts.maxTokens}` }); controller.abort(); return "Stopped: token budget exceeded."; }

    if (output.kind === "final") { opts.onEvent({ type: "final", text: output.text }); return output.text; }

    opts.onEvent({ type: "thought", text: output.thought });
    for (const call of output.calls) {
      opts.onEvent({ type: "tool_call", call });
      const t0 = performance.now();
      const result = await execute(tools, call, opts, controller.signal);
      opts.onEvent({ type: "tool_result", callId: call.id, ...result, ms: Math.round(performance.now() - t0) });
      transcript.push({ role: "tool", callId: call.id, ...result });
    }
  }
  opts.onEvent({ type: "budget_exceeded", reason: `more than ${opts.maxSteps} steps` });
  return "Stopped: step limit reached.";
}

async function execute(tools: Record<string, ToolSpec>, call: ToolCall, opts: AgentOptions, signal: AbortSignal): Promise<{ ok: boolean; content: string }> {
  const t = tools[call.name];
  if (!t) return { ok: false, content: `Unknown tool "${call.name}". Available: ${Object.keys(tools).join(", ")}` };
  const parsed = t.input.safeParse(call.input);
  if (!parsed.success) return { ok: false, content: `Invalid input for ${call.name}:\n${z.prettifyError(parsed.error)}` };
  if (t.risky) {
    const approved = await opts.approve(call.name, parsed.data);
    opts.onEvent({ type: "approval", tool: call.name, approved });
    if (!approved) return { ok: false, content: "A human declined this action. Do not retry it; explain what you would have done." };
  }
  try { return { ok: true, content: JSON.stringify(await t.run(parsed.data, { signal })) }; }
  catch (e) { return { ok: false, content: e instanceof Error ? e.message : String(e) }; }
}

// ======================= concrete tools =======================
const ORDERS = new Map([["A-1042", { customer: "Ada", amount: 49, daysAgo: 12, status: "delivered" }], ["A-2077", { customer: "Bo", amount: 120, daysAgo: 45, status: "delivered" }]]);

const tools = {
  get_order: tool({
    description: "Look up an order by id (format A-1234).",
    input: z.object({ orderId: z.string().regex(/^A-\d{4}$/, "Order ids look like A-1234") }),
    run: async ({ orderId }) => { const o = ORDERS.get(orderId); if (!o) throw new Error(`Order ${orderId} not found`); return { orderId, ...o }; },
  }),
  refund_policy: tool({ description: "Get the refund policy.", input: z.object({}), run: async () => ({ windowDays: 30, maxAutoRefund: 100 }) }),
  issue_refund: tool({
    description: "Refund an order. Requires human approval.",
    input: z.object({ orderId: z.string(), amount: z.number().positive().max(100) }),
    risky: true,
    run: async ({ orderId, amount }) => ({ refundId: "R-" + orderId.slice(2), amount, status: "processed" }),
  }),
};
console.log("tool schemas sent to the model:", toolDefinitions(tools).map((d) => `${d.name}(${Object.keys((d.input_schema as { properties?: object }).properties ?? {}).join(", ")})`));

// ======================= a scripted model (stand-in for Claude) =======================
class ScriptedModel implements Model {
  readonly name = "scripted-support-agent";
  async next(transcript: Transcript): Promise<{ output: ModelOutput; tokens: number }> {
    const task = (transcript[0] as { text: string }).text;
    const orderId = task.match(/\b\d{4}\b/)?.[0];
    const results = transcript.filter((m) => m.role === "tool");
    const result = (id: string) => results.find((r) => r.callId === id);
    const turns = transcript.filter((m) => m.role === "assistant").length;
    const tokens = 400 + transcript.length * 150;

    if (turns === 0) return { tokens, output: { kind: "tools", thought: "I need the order and the refund policy.", calls: [
      { id: "c1", name: "get_order", input: { orderId } },                 // mistake: missing the "A-" prefix
      { id: "c2", name: "refund_policy", input: {} },
    ] } };
    if (result("c1")?.ok === false && !result("c3")) return { tokens, output: { kind: "tools", thought: "The tool says ids need the A- prefix — retrying.", calls: [{ id: "c3", name: "get_order", input: { orderId: `A-${orderId}` } }] } };

    const order = [result("c1"), result("c3")].find((r) => r?.ok);
    if (!order) return { tokens, output: { kind: "final", text: "I couldn't find that order. Could you check the order number?" } };
    const o = JSON.parse(order.content) as { orderId: string; amount: number; daysAgo: number };
    if (o.daysAgo > 30) return { tokens, output: { kind: "final", text: `Order ${o.orderId} was bought ${o.daysAgo} days ago — outside the 30-day window, so I can't refund it.` } };
    if (!result("c4")) return { tokens, output: { kind: "tools", thought: `Bought ${o.daysAgo} days ago, within the window — refunding $${o.amount}.`, calls: [{ id: "c4", name: "issue_refund", input: { orderId: o.orderId, amount: o.amount } }] } };
    const refund = result("c4")!;
    return { tokens, output: { kind: "final", text: refund.ok ? `Done! Refund details: ${refund.content}` : "I didn't issue the refund because it wasn't approved; a teammate will follow up." } };
  }
}

// ======================= run it =======================
const print = (e: AgentEvent) => {
  switch (e.type) {
    case "step": console.log(`\n— step ${e.step}`); break;
    case "thought": console.log(`  💭 ${e.text}`); break;
    case "tool_call": console.log(`  🔧 ${e.call.name}(${JSON.stringify(e.call.input)})`); break;
    case "tool_result": console.log(`  ${e.ok ? "✅" : "❌"} ${e.content.replace(/\n/g, " ")} (${e.ms} ms)`); break;
    case "approval": console.log(`  ✋ approval for ${e.tool}: ${e.approved ? "granted" : "denied"}`); break;
    case "final": console.log(`  💬 ${e.text}`); break;
    case "budget_exceeded": console.log(`  🛑 ${e.reason}`); break;
  }
};

for (const [task, approve] of [["Please refund my order 1042", true], ["Refund order 1042 please", false], ["Can I get a refund for 2077?", true]] as const) {
  console.log(`\n=========== "${task}" (approver says ${approve ? "yes" : "no"}) ===========`);
  const result = await runAgent(new ScriptedModel(), tools, task, { maxSteps: 6, maxTokens: 10_000, approve: async () => approve, onEvent: print });
  console.log("RESULT:", result);
}
```

Three runs, three behaviours: recovering from its own invalid tool call, respecting a human's "no", and refusing an out-of-policy refund — all visible in the typed event trace.

## How it works

| Piece | Technique |
|---|---|
| tool definitions | `tool({ input: z.object(...), run })` — `run` gets `z.output<S>`; `z.toJSONSchema` makes the model-facing schema |
| model output | a union: `{ kind: "final" }` or `{ kind: "tools", calls }` |
| validation | every call is `safeParse`d; failures go back to the model as error results |
| approvals | `risky: true` tools await `approve()` before running |
| budgets | step limit + token limit; an `AbortSignal` is passed to tools for cancellation |
| observability | every action emits a typed `AgentEvent`; the UI/logger just switches on `type` |

## Making it real

Implement `Model` with Claude — the framework doesn't change:

```ts nocheck
class ClaudeModel implements Model {
  readonly name = "claude-opus-5-5";
  async next(transcript: Transcript, tools: ReturnType<typeof toolDefinitions>) {
    const response = await anthropic.messages.create({
      model: this.name, max_tokens: 16000,
      tools: tools.map((t) => ({ ...t, input_schema: t.input_schema as Anthropic.Tool.InputSchema })),
      messages: toMessageParams(transcript),                 // map your transcript to Anthropic.MessageParam[]
    });
    const calls = response.content.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input }));
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return {
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      output: calls.length ? { kind: "tools" as const, thought: text, calls } : { kind: "final" as const, text },
    };
  }
}
```

:::exercise Extend it
1. Add **parallel tool execution** for calls in the same step (`Promise.all`), keeping results in order.
2. Add **memory**: a `remember(fact)` tool that writes to a store, and include stored facts in the next run's first message.
3. Stream events to a browser with SSE (Module 4's Hono example) and render a live timeline.
4. Add a **cost budget** in dollars using the cost tracker from the Production Patterns lesson.
:::

:::keypoints
- Define each tool once with Zod: typed `run` input, runtime validation and JSON Schema for the model.
- Model output as a discriminated union; the loop runs tools until a `final` answer or a budget stops it.
- Errors, invalid input and denied approvals go **back to the model** as tool results.
- Emit typed events for every step — they power logs, UIs and debugging.
:::
