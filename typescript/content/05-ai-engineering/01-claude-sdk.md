---
title: The Claude TypeScript SDK
level: intermediate
time: 40
summary: Call Claude from TypeScript the right way — install and configure the SDK, send messages, read typed content blocks, keep conversations with MessageParam, control effort, count tokens, handle stop reasons (including refusals) and typed API errors.
---

`@anthropic-ai/sdk` is Anthropic's official TypeScript SDK. It's fully typed: every request option and every response field has a type, so your editor autocompletes the API and the compiler catches mistakes.

:::def SDK (Software Development Kit)
A library that wraps an HTTP API in functions and types. Instead of building JSON requests and parsing responses by hand, you call `client.messages.create({...})` and get a typed `Message` back.
:::

## Setup

```bash
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY="sk-ant-..."      # or put it in .env (never commit it)
```

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();   // reads ANTHROPIC_API_KEY from the environment
```

:::warn Keep keys on the server
Only create the client in **server** code (Node.js, serverless functions). Never ship an API key to a browser — anyone could copy it. Front ends call *your* API, which calls Claude.
:::

## Your first request

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const message = await client.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 2000,
  system: "You are a concise assistant. Answer in at most three sentences.",
  messages: [{ role: "user", content: "What is retrieval-augmented generation?" }],
});

for (const block of message.content) {
  if (block.type === "text") console.log(block.text);
}
console.log(message.usage.input_tokens, "in /", message.usage.output_tokens, "out");
```

| Field | Meaning |
|---|---|
| `model` | which Claude model: `claude-opus-5-5` (most capable), `claude-sonnet-5-5`, `claude-haiku-4-5` (fastest) |
| `max_tokens` | the most tokens the answer may use (a cap, not a target) |
| `system` | instructions that frame the whole conversation |
| `messages` | the conversation so far: alternating `user` / `assistant` turns |

## The response is a union of content blocks

`message.content` is an **array of blocks**, and each block is a member of a discriminated union: `text`, `tool_use`, `thinking` and more. You can't read `.text` until you've narrowed to a text block — exactly what you practised in Module 1:

```ts
import Anthropic from "@anthropic-ai/sdk";

// A helper you'll use everywhere: join all text blocks
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function toolCallsOf(message: Anthropic.Message): Anthropic.ToolUseBlock[] {
  return message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
}
```

Here's the same logic running on a response-shaped object, so you can see the narrowing in action:

```ts run level=intermediate
type TextBlock = { type: "text"; text: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
type ThinkingBlock = { type: "thinking"; thinking: string };
type Message = {
  id: string;
  content: (TextBlock | ToolUseBlock | ThinkingBlock)[];
  stop_reason: "end_turn" | "max_tokens" | "tool_use" | "refusal" | null;
  usage: { input_tokens: number; output_tokens: number };
};

const textOf = (m: Message) => m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
const toolCallsOf = (m: Message) => m.content.filter((b) => b.type === "tool_use");

const response: Message = {
  id: "msg_01",
  content: [
    { type: "thinking", thinking: "" },
    { type: "text", text: "I'll check the order status. " },
    { type: "tool_use", id: "toolu_01", name: "get_order", input: { orderId: "A-1042" } },
  ],
  stop_reason: "tool_use",
  usage: { input_tokens: 512, output_tokens: 61 },
};

console.log("text:", textOf(response));
const calls = toolCallsOf(response);
//    ^?
console.log("tool calls:", calls.map((c) => `${c.name}(${JSON.stringify(c.input)})`));
console.log("stop:", response.stop_reason);
```

## Conversations with `MessageParam`

The API is **stateless**: send the whole conversation each time. Type it with the SDK's own types instead of inventing your own:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const history: Anthropic.MessageParam[] = [];

async function chat(userText: string): Promise<string> {
  history.push({ role: "user", content: userText });
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    messages: history,
  });
  history.push({ role: "assistant", content: response.content });   // keep the full blocks
  return response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

console.log(await chat("My name is Ada."));
console.log(await chat("What's my name?"));
```

## Thinking and effort

Claude Opus 5.5 always thinks before answering (adaptive thinking). You control **how hard** it works with `output_config.effort`:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const quick = await client.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 2000,
  output_config: { effort: "low" },          // low | medium (default) | high | xhigh | max
  messages: [{ role: "user", content: "Give me a title for a blog post about vector databases." }],
});

const careful = await client.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 32000,
  output_config: { effort: "high" },
  messages: [{ role: "user", content: "Review this migration plan and list every risk you can find: ..." }],
});
console.log(quick.usage.output_tokens, careful.usage.output_tokens);
```

:::tip Choosing effort
`low` for simple, latency-sensitive tasks (titles, classification); `medium` for most work; `high`+ for hard reasoning, code review and agents. Higher effort uses more output tokens — measure on your own tasks.
:::

## Counting tokens before you send

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const { input_tokens } = await client.messages.countTokens({
  model: "claude-opus-5-5",
  system: "You are a contract analyst.",
  messages: [{ role: "user", content: "Here is the contract: ..." }],
});
console.log(`This request will use ${input_tokens} input tokens`);
```

## Stop reasons

Always check **why** the model stopped:

```ts
import Anthropic from "@anthropic-ai/sdk";

export function explainStop(message: Anthropic.Message): string {
  switch (message.stop_reason) {
    case "end_turn": return "finished normally";
    case "max_tokens": return "hit max_tokens — the answer is cut off; raise the limit or stream";
    case "stop_sequence": return `stopped at ${JSON.stringify(message.stop_sequence)}`;
    case "tool_use": return "wants to call a tool — run it and send the result back";
    case "pause_turn": return "paused a long server-side turn — send the content back to continue";
    case "refusal": return `declined to answer${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : ""}`;
    default: return `other: ${String(message.stop_reason)}`;
  }
}
```

:::warn Handle refusals in the UI
A `refusal` stop reason means the model declined for safety reasons. Show a neutral message, don't retry the same request in a loop, and log `stop_details` for review.
:::

## Typed errors

The SDK throws error **classes**, so you can react with `instanceof` — never by matching message strings:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ maxRetries: 3, timeout: 60_000 });   // built-in retries for 429/5xx

export async function safeAsk(question: string): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  try {
    const msg = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: question }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { ok: true, text };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { ok: false, reason: "Busy — try again in a moment" };
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, reason: "Server misconfigured (API key)" };
    if (error instanceof Anthropic.BadRequestError) return { ok: false, reason: `Bad request: ${error.message}` };
    if (error instanceof Anthropic.APIError) return { ok: false, reason: `API error ${error.status}` };
    throw error;                     // not an API error: a bug — let it crash loudly
  }
}
```

:::def maxRetries
The SDK automatically retries connection errors, `429` (rate limited) and `5xx` (server) responses with exponential backoff. `maxRetries` sets how many times (default 2). You rarely need your own retry loop around SDK calls.
:::

:::ai
Wrap the SDK in **one module** of your app (`src/llm/client.ts`) with a couple of typed helpers — `textOf`, `toolCallsOf`, `explainStop`, `safeAsk`. The rest of your code talks to those helpers, so model upgrades, new block types and new options touch one file.
:::

## Check yourself

```quiz
? Why can't you write `message.content[0].text` directly?
+ content is an array of a union of block types; only text blocks have .text
- The SDK hides the text
- content is a string
> Narrow with block.type === "text" first.

? Where should `new Anthropic()` be created?
+ In server-side code, with the key from an environment variable
- In the browser bundle
- In every function call
> API keys must never reach the browser.

? How should you detect a rate-limit error from the SDK?
+ error instanceof Anthropic.RateLimitError
- error.message.includes("rate")
- error.status === "rate_limit"
> Use the typed error classes.
```

:::keypoints
- `new Anthropic()` (server-side) + `client.messages.create({ model, max_tokens, messages })`.
- `message.content` is a union of blocks — narrow by `type`; use SDK types like `Anthropic.Message`, `Anthropic.MessageParam`, `Anthropic.TextBlock`.
- Send the full history each call; control depth with `output_config.effort`; count tokens with `messages.countTokens`.
- Check `stop_reason` (incl. `max_tokens` and `refusal`); catch typed errors with `instanceof`.
:::
