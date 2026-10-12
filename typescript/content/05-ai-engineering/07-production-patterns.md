---
title: Production Patterns
level: advanced
time: 40
summary: What separates a demo from a dependable AI service — validated config, one wrapped client, rate limiting with token buckets, cost tracking and budgets, prompt caching, batch processing, response caching, timeouts, and structured logs for every model call.
---

A demo calls the model once and prints the result. A production service handles thousands of calls, stays within rate limits and budgets, survives failures, and lets you see what happened. Here are the patterns, in TypeScript.

## 1. Validated config, one client

```ts
// src/llm/client.ts — the ONLY place that knows about API keys and SDK options
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const Env = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  LLM_TIMEOUT_MS: z.coerce.number().int().default(120_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
});
export const env = Env.parse(process.env);           // fail fast at startup with a clear message

export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
  timeout: env.LLM_TIMEOUT_MS,
  maxRetries: env.LLM_MAX_RETRIES,                   // retries 429 / 5xx with exponential backoff
});
```

## 2. Rate limiting with a token bucket

Providers limit **requests per minute** and **tokens per minute**. A token bucket smooths your traffic so you stay under both instead of hammering the API and collecting 429s:

```ts run level=advanced
class TokenBucket {
  #tokens: number;
  #last = performance.now();
  readonly capacity: number;
  readonly refillPerSec: number;
  constructor(capacity: number, refillPerSec: number) { this.capacity = capacity; this.refillPerSec = refillPerSec; this.#tokens = capacity; }

  #refill() {
    const now = performance.now();
    this.#tokens = Math.min(this.capacity, this.#tokens + ((now - this.#last) / 1000) * this.refillPerSec);
    this.#last = now;
  }
  #queue: Promise<void> = Promise.resolve();          // first come, first served

  take(n = 1): Promise<void> {
    if (n > this.capacity) return Promise.reject(new Error(`Request of ${n} exceeds bucket capacity ${this.capacity}`));
    const turn = this.#queue.then(async () => {
      for (;;) {
        this.#refill();
        if (this.#tokens >= n) { this.#tokens -= n; return; }
        await new Promise((r) => setTimeout(r, ((n - this.#tokens) / this.refillPerSec) * 1000));
      }
    });
    this.#queue = turn;
    return turn;
  }
}

// Two limits at once: 5 requests/sec and 2,000 tokens/sec (scaled down so the demo is quick)
const requests = new TokenBucket(5, 5);
const tokens = new TokenBucket(2000, 2000);

async function limitedCall(id: number, estimatedTokens: number) {
  await requests.take(1);
  await tokens.take(estimatedTokens);
  return `call ${id} (${estimatedTokens} tok) at ${Math.round(performance.now() - t0)} ms`;
}

const t0 = performance.now();
const results = await Promise.all(Array.from({ length: 10 }, (_, i) => limitedCall(i + 1, 400)));
results.forEach((r) => console.log(r));
```

The first five calls go straight through (the bucket starts full); later ones are spread out to respect both limits.

## 3. Cost tracking and budgets

```ts run level=advanced
type ModelId = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-4-5";
type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

// Example rates in $ per million tokens — load real prices from config, they change.
const RATES: Record<ModelId, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

class BudgetExceeded extends Error { constructor(spent: number, limit: number) { super(`Budget exceeded: $${spent.toFixed(4)} of $${limit}`); this.name = "BudgetExceeded"; } }

class CostTracker {
  #spent = 0;
  readonly byFeature = new Map<string, number>();
  readonly limitUsd: number;
  constructor(limitUsd: number) { this.limitUsd = limitUsd; }

  record(feature: string, model: ModelId, u: Usage): number {
    const r = RATES[model];
    const cacheRead = u.cache_read_input_tokens ?? 0, cacheWrite = u.cache_creation_input_tokens ?? 0;
    const cost = (u.input_tokens * r.input + cacheWrite * r.input * 1.25 + cacheRead * r.input * 0.1 + u.output_tokens * r.output) / 1e6;
    this.#spent += cost;
    this.byFeature.set(feature, (this.byFeature.get(feature) ?? 0) + cost);
    return cost;
  }
  assertWithinBudget() { if (this.#spent > this.limitUsd) throw new BudgetExceeded(this.#spent, this.limitUsd); }
  get spent() { return this.#spent; }
}

const tracker = new CostTracker(0.25);
tracker.record("chat", "claude-opus-5-5", { input_tokens: 12_000, output_tokens: 900 });
tracker.record("chat", "claude-opus-5-5", { input_tokens: 800, output_tokens: 700, cache_read_input_tokens: 11_500 });   // cached prefix
tracker.record("classify", "claude-haiku-4-5", { input_tokens: 3_000, output_tokens: 20 });
tracker.record("extract", "claude-sonnet-5-5", { input_tokens: 40_000, output_tokens: 2_500 });
console.table([...tracker.byFeature].map(([feature, usd]) => ({ feature, usd: usd.toFixed(4) })));
console.log("total: $" + tracker.spent.toFixed(4));

tracker.record("extract", "claude-opus-5-5", { input_tokens: 30_000, output_tokens: 3_000 });
try { tracker.assertWithinBudget(); } catch (e) { console.log("🛑", (e as Error).message); }
```

Notice the second chat call: 11,500 input tokens came from the **cache** at a tenth of the price.

## 4. Prompt caching

When many requests share a long prefix (a big system prompt, tool definitions, a document), cache it:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const handbook = "…a long employee handbook (thousands of tokens)…";

async function ask(question: string) {
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    cache_control: { type: "ephemeral" },          // cache the longest stable prefix automatically
    system: `You answer questions about this handbook:\n\n${handbook}`,
    messages: [{ role: "user", content: question }],
  });
  const u = response.usage;
  console.log(`cache read: ${u.cache_read_input_tokens ?? 0}, written: ${u.cache_creation_input_tokens ?? 0}, uncached: ${u.input_tokens}`);
  return response;
}

await ask("How many vacation days do I get?");   // writes the cache
await ask("What's the parental leave policy?");  // reads it: much cheaper and faster
```

:::warn Keep the prefix byte-for-byte stable
Caching matches the **exact** prefix. A timestamp, a random ID, or tools listed in a different order at the start of the prompt silently disables it. Put changing content (the user's question, today's date) **after** the stable part, and check `cache_read_input_tokens` in your logs.
:::

## 5. Batches for offline work

Classifying 50,000 tickets overnight doesn't need instant answers. The Batches API processes requests asynchronously at **half price**:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const tickets = [{ id: "T-1", text: "App crashes on login" }, { id: "T-2", text: "How do I export to PDF?" }];

const batch = await client.messages.batches.create({
  requests: tickets.map((t) => ({
    custom_id: t.id,
    params: {
      model: "claude-haiku-4-5",
      max_tokens: 50,
      messages: [{ role: "user", content: `Classify as bug, question or feature request. Reply with one word.\n\n${t.text}` }],
    },
  })),
});

// …later (poll batches.retrieve until processing_status === "ended"), then:
for await (const item of await client.messages.batches.results(batch.id)) {
  if (item.result.type === "succeeded") {
    const text = item.result.message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    console.log(item.custom_id, text.trim());
  } else {
    console.log(item.custom_id, "failed:", item.result.type);
  }
}
```

## 6. Caching whole responses

For deterministic, repeated requests (classifying the same text, embedding the same chunk), cache results keyed by a hash of the request:

```ts run level=advanced
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

function cached<A extends unknown[], R>(fn: (...args: A) => Promise<R>, ttlMs: number) {
  const store = new Map<string, { value: R; expires: number }>();
  let hits = 0, misses = 0;
  const wrapped = async (...args: A): Promise<R> => {
    const key = fnv1a(JSON.stringify(args));
    const entry = store.get(key);
    if (entry && entry.expires > Date.now()) { hits++; return entry.value; }
    misses++;
    const value = await fn(...args);
    store.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  };
  return Object.assign(wrapped, { stats: () => ({ hits, misses, size: store.size }) });
}

const classify = cached(async (text: string, model: string) => {
  await new Promise((r) => setTimeout(r, 80));                   // pretend model call
  return { label: /crash|error|fail/i.test(text) ? "bug" : "question", model };
}, 60_000);

for (const t of ["App crashes on login", "How do I export?", "App crashes on login", "App crashes on login"]) {
  console.log(t.padEnd(22), await classify(t, "claude-haiku-4-5"));
}
console.log(classify.stats());
```

## 7. Log every model call

```ts run level=advanced
type LlmLog = {
  ts: string; feature: string; model: string; ms: number;
  inputTokens: number; outputTokens: number; costUsd: number;
  stopReason: string; ok: boolean; error?: string;
};

async function traced<T extends { usage: { input_tokens: number; output_tokens: number }; stop_reason: string }>(
  feature: string, model: string, call: () => Promise<T>,
): Promise<T> {
  const t0 = performance.now();
  const log = (entry: Omit<LlmLog, "ts" | "feature" | "model" | "ms">) =>
    console.log(JSON.stringify({ ts: new Date().toISOString(), feature, model, ms: Math.round(performance.now() - t0), ...entry } satisfies LlmLog));
  try {
    const res = await call();
    log({ inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, costUsd: (res.usage.input_tokens * 5 + res.usage.output_tokens * 25) / 1e6, stopReason: res.stop_reason, ok: true });
    return res;
  } catch (e) {
    log({ inputTokens: 0, outputTokens: 0, costUsd: 0, stopReason: "error", ok: false, error: (e as Error).message });
    throw e;
  }
}

const fakeCreate = async (fail = false) => {
  await new Promise((r) => setTimeout(r, 60));
  if (fail) throw new Error("529 overloaded");
  return { stop_reason: "end_turn", usage: { input_tokens: 1200, output_tokens: 180 }, content: "…" };
};

await traced("summarise", "claude-opus-5-5", () => fakeCreate());
await traced("summarise", "claude-opus-5-5", () => fakeCreate(true)).catch(() => {});
```

One JSON line per call (feature, model, latency, tokens, cost, stop reason, error) is enough to build dashboards, alerts and cost reports — the Project Lab's trace viewer reads exactly this kind of data.

:::tip The production checklist
✅ config validated at startup · ✅ one wrapped client with timeouts and retries · ✅ rate limits respected · ✅ budgets enforced · ✅ prompt caching on long stable prefixes · ✅ batches for offline jobs · ✅ every call logged with tokens, cost and latency · ✅ evals run before shipping prompt or model changes.
:::

:::ai
Most production incidents in AI apps are not "the model got dumber" — they're a cache silently disabled by a timestamp, a retry storm after a 429, a runaway agent loop, or a prompt change nobody evaluated. The patterns above, each a few typed lines, prevent all of them.
:::

## Check yourself

```quiz
? Why does a timestamp at the start of the system prompt hurt cost?
+ It changes the prefix every time, so prompt caching never gets a hit
- Timestamps use many tokens
- The model rejects timestamps
> Caching needs a byte-identical prefix.

? When should you use the Batches API?
+ For large offline jobs that don't need immediate answers — it costs half as much
- For chat
- For streaming
> Results arrive asynchronously, usually within an hour.

? What does a token bucket rate limiter do?
+ Lets bursts through up to a capacity, then spaces calls to a steady rate
- Counts tokens in a prompt
- Caches responses
> It keeps you under requests- and tokens-per-minute limits.
```

:::keypoints
- Validate config at startup; create one client with `timeout` and `maxRetries`.
- Respect rate limits with token buckets; track cost per feature and enforce budgets.
- Use prompt caching (`cache_control`) for long stable prefixes; keep them byte-identical.
- Use Batches for offline work (50% cheaper); cache deterministic results by request hash.
- Log every call as structured JSON: feature, model, latency, tokens, cost, stop reason, errors.
:::
