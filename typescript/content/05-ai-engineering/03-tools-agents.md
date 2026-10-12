---
title: Tool Use & Agents
level: advanced
time: 45
summary: Let Claude call your functions — define tools with Zod and betaZodTool, let the SDK's tool runner drive the loop, write the agent loop yourself with typed tool_use and tool_result blocks, send errors back to the model, and add human approval for risky actions. Includes a runnable agent with a scripted model.
---

A plain model can only produce text. With **tools**, it can look things up, calculate, call your APIs and take actions. An **agent** is a loop: the model asks for a tool, your code runs it, the result goes back to the model, and so on until it answers.

:::def Tool
A function you describe to the model with a **name**, a **description** and an **input schema** (JSON Schema). When the model wants to use it, the response contains a `tool_use` block with the tool name and arguments; you run the function and reply with a `tool_result` block.
:::

:::flow The agent loop
User question | messages[]
Model call | may return tool_use
Run tools | your code, validated input
tool_result | back to the model
Repeat | until stop_reason ≠ tool_use
:::

## Tools with Zod and the tool runner (recommended)

The SDK's **tool runner** handles the loop for you. You define each tool with a Zod schema, and the `run` function receives a **typed, validated** input:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const client = new Anthropic();

const getOrder = betaZodTool({
  name: "get_order",
  description: "Look up an order by its id. Returns status, amount and days since purchase.",
  inputSchema: z.object({
    orderId: z.string().describe("Order id such as A-1042"),
  }),
  run: async ({ orderId }) => {                       // orderId: string — inferred from the schema
    const order = { orderId, status: "delivered", amount: 49, daysSincePurchase: 12 };
    return JSON.stringify(order);
  },
});

const refundPolicy = betaZodTool({
  name: "refund_policy",
  description: "Return the company's refund policy text.",
  inputSchema: z.object({}),
  run: async () => "Refunds are available within 30 days of purchase.",
});

const finalMessage = await client.beta.messages.toolRunner({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  tools: [getOrder, refundPolicy],
  messages: [{ role: "user", content: "Can I still get a refund for order A-1042?" }],
});

for (const block of finalMessage.content) if (block.type === "text") console.log(block.text);
```

:::tip Write tool descriptions for the model
The description and each field's `.describe()` are the **only documentation the model sees**. Say what the tool does, when to use it, what it returns, and give examples of valid inputs.
:::

## Writing the loop yourself

When you need full control (custom logging, approvals, streaming UIs, budgets), write the loop. The SDK's types keep every message correct:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const tools: Anthropic.Tool[] = [
  {
    name: "get_weather",
    description: "Current weather for a city.",
    input_schema: {
      type: "object",
      properties: { city: { type: "string", description: "City name" } },
      required: ["city"],
    },
  },
];

async function runTool(name: string, input: unknown): Promise<string> {
  if (name === "get_weather") return JSON.stringify({ city: (input as { city: string }).city, tempC: 27, sky: "sunny" });
  throw new Error(`Unknown tool: ${name}`);
}

export async function agent(question: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  for (let turn = 0; turn < 10; turn++) {                       // always cap the number of turns
    const response = await client.messages.create({ model: "claude-opus-5-5", max_tokens: 16000, tools, messages });
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;           // server paused a long turn: resend to continue
    if (response.stop_reason !== "tool_use") {
      return response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        results.push({ type: "tool_result", tool_use_id: block.id, content: await runTool(block.name, block.input) });
      } catch (error) {
        // Send the error BACK to the model — it can often recover (fix arguments, try another tool)
        results.push({ type: "tool_result", tool_use_id: block.id, content: String(error), is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("Agent did not finish within 10 turns");
}
```

:::warn Steer with the prompt, not tool_choice
On the latest models (Claude Opus 5.5, Sonnet 5.5) **forcing** a specific tool with `tool_choice` returns an error — the model decides when to call tools. Describe in the prompt when a tool should be used, and if you require a call, check for a `tool_use` block and re-prompt if none came back.
:::

## A runnable agent with a scripted model

To see the whole loop run, here's an agent framework in miniature: tools defined with Zod (typed input, validated at runtime), a registry, and a **scripted fake model** that behaves like Claude would — including one bad tool call it has to recover from.

```ts run level=advanced
import { z } from "zod";

// ---------- typed tool definitions ----------
type ToolDef<S extends z.ZodType> = { description: string; schema: S; run: (input: z.output<S>) => Promise<unknown> };
const defineTool = <S extends z.ZodType>(t: ToolDef<S>) => t;

const ORDERS: Record<string, { amount: number; daysSincePurchase: number }> = { "A-1042": { amount: 49, daysSincePurchase: 12 } };

const tools = {
  get_order: defineTool({
    description: "Look up an order by id",
    schema: z.object({ orderId: z.string().regex(/^A-\d+$/, "Order ids look like A-1234") }),
    run: async ({ orderId }) => {
      const order = ORDERS[orderId];
      if (!order) throw new Error(`No order ${orderId}`);
      return { orderId, ...order };
    },
  }),
  refund_policy: defineTool({
    description: "The refund policy",
    schema: z.object({}),
    run: async () => ({ windowDays: 30 }),
  }),
};
type ToolName = keyof typeof tools;

// ---------- message types (shaped like the real API) ----------
type ToolUse = { type: "tool_use"; id: string; name: string; input: unknown };
type ToolResult = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
type ModelTurn = { stop_reason: "tool_use" | "end_turn"; content: ({ type: "text"; text: string } | ToolUse)[] };
type Msg = { role: "user"; content: string | ToolResult[] } | { role: "assistant"; content: ModelTurn["content"] };

// ---------- a scripted "model" (stands in for client.messages.create) ----------
function fakeModel(messages: Msg[]): ModelTurn {
  const last = messages.at(-1)!;
  const results = Array.isArray(last.content) ? (last.content as ToolResult[]) : [];
  const turn = messages.filter((m) => m.role === "assistant").length;
  if (turn === 0) return { stop_reason: "tool_use", content: [
    { type: "text", text: "Let me check that order and the policy." },
    { type: "tool_use", id: "t1", name: "get_order", input: { orderId: "1042" } },          // ← invalid id format
    { type: "tool_use", id: "t2", name: "refund_policy", input: {} },
  ] };
  if (turn === 1 && results.some((r) => r.is_error)) return { stop_reason: "tool_use", content: [
    { type: "tool_use", id: "t3", name: "get_order", input: { orderId: "A-1042" } },        // ← fixed after reading the error
  ] };
  return { stop_reason: "end_turn", content: [{ type: "text", text: "Yes — order A-1042 was bought 12 days ago, within the 30-day window, so you can get a $49 refund." }] };
}

// ---------- the agent loop ----------
async function runTool(call: ToolUse): Promise<ToolResult> {
  if (!(call.name in tools)) return { type: "tool_result", tool_use_id: call.id, content: `Unknown tool ${call.name}`, is_error: true };
  const tool = tools[call.name as ToolName] as ToolDef<z.ZodType>;
  const parsed = tool.schema.safeParse(call.input);
  if (!parsed.success) return { type: "tool_result", tool_use_id: call.id, content: "Invalid input:\n" + z.prettifyError(parsed.error), is_error: true };
  try {
    return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(await tool.run(parsed.data)) };
  } catch (e) {
    return { type: "tool_result", tool_use_id: call.id, content: (e as Error).message, is_error: true };
  }
}

async function agent(question: string) {
  const messages: Msg[] = [{ role: "user", content: question }];
  for (let turn = 1; turn <= 5; turn++) {
    const response = fakeModel(messages);
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "end_turn") return response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const calls = response.content.filter((b) => b.type === "tool_use");
    const results = await Promise.all(calls.map(runTool));
    for (const [i, r] of results.entries()) console.log(`turn ${turn}: ${calls[i].name}(${JSON.stringify(calls[i].input)}) → ${r.is_error ? "❌ " : "✅ "}${r.content.replace(/\n/g, " ")}`);
    messages.push({ role: "user", content: results });
  }
  throw new Error("too many turns");
}

console.log("\nAnswer:", await agent("Can I get a refund for order 1042?"));
```

Watch turn 1: the model sent `"1042"`, the Zod schema rejected it, and the **error went back as a tool result** — so on turn 2 the model fixed the id. Errors are data, not crashes.

## Human approval for risky tools

Tools that spend money, send messages or delete things should ask first. The simplest pattern: gate inside the tool.

```ts
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

declare function askHuman(question: string): Promise<boolean>;     // your UI: a dialog, a Slack button…
declare function issueRefund(orderId: string, amount: number): Promise<string>;

export const refundTool = betaZodTool({
  name: "issue_refund",
  description: "Refund an order. Requires human approval.",
  inputSchema: z.object({ orderId: z.string(), amount: z.number().positive().max(500) }),
  run: async ({ orderId, amount }) => {
    const approved = await askHuman(`Refund $${amount} for ${orderId}?`);
    if (!approved) return "The user declined this refund. Do not retry; explain to the customer that a human will follow up.";
    return `Refund issued: ${await issueRefund(orderId, amount)}`;
  },
});
```

:::tip Agent safety checklist
Cap turns and tokens · validate every tool input · return errors as `is_error` results · require approval for side effects · give tools the **least** access they need · log every call (name, input, result, duration).
:::

:::ai
Most "agent frameworks" are this loop plus conveniences. With TypeScript + Zod you get the hard part — typed, validated tool inputs — for free, and the SDK's tool runner removes the boilerplate. Start with the runner; drop to a manual loop only when you need custom control.
:::

## Check yourself

```quiz
? What should you do when a tool throws?
+ Return a tool_result with is_error: true and the message, so the model can recover
- Crash the agent
- Silently skip the tool call
> The model often fixes its own mistake when it sees the error.

? What does betaZodTool give you over a plain JSON Schema tool?
+ The run function's input is typed and validated from the Zod schema
- Faster model responses
- The tool runs on Anthropic's servers
> One schema → JSON Schema for the model + types + validation.

? Why cap the number of agent turns?
+ To avoid runaway loops and unbounded cost
- The API requires it
- Tools can only be called 10 times
> Always bound loops that call paid APIs.
```

:::keypoints
- Tools = name + description + input schema; the model returns `tool_use`, you reply with `tool_result`.
- Prefer `betaZodTool` + `client.beta.messages.toolRunner()`; inputs are inferred and validated.
- Manual loop: push assistant content, run tools, push `tool_result`s, repeat while `stop_reason === "tool_use"` (handle `pause_turn`), cap turns.
- Send tool errors back with `is_error: true`; gate risky tools behind human approval.
:::
