---
title: Resilient LLM Client
level: advanced
time: 55
icon: shield
cover: #22c55e,#0ea5e9
tags: retries, backoff, timeouts, AbortSignal, circuit breaker, fallbacks, state machines
summary: Wrap any model provider in a client that survives the real world — retries with exponential backoff and jitter, Retry-After, per-attempt timeouts combined with user cancellation, a circuit breaker modelled as a typed state machine, model fallbacks, and live statistics — tested against a chaos provider that fails on purpose.
---

Model APIs fail in ordinary ways: rate limits (429), overloads (529), slow responses, network blips. A single failing call shouldn't break your product, and a struggling provider shouldn't be hammered with retries. This project builds the wrapper that handles it all — and proves it with a provider that fails **on purpose**.

:::flow Request path
call() | prompt + options
Circuit open? | fail fast or try fallback
Attempt | timeout + user signal
Retryable error? | backoff + jitter, Retry-After
Fallback model | when the primary keeps failing
:::

**You'll practise:** interfaces for providers, custom error classes with typed fields, `AbortSignal.any` and `AbortSignal.timeout`, a discriminated-union state machine, and generic result types.

## The complete client

```ts run level=advanced title="Resilient client · complete"
// ======================= provider interface + errors =======================
type CompletionRequest = { model: string; prompt: string; signal: AbortSignal };
type Completion = { text: string; model: string; inputTokens: number; outputTokens: number };
interface Provider { complete(req: CompletionRequest): Promise<Completion> }

class ProviderError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;
  constructor(status: number, message: string, retryAfterMs?: number) { super(message); this.name = "ProviderError"; this.status = status; this.retryAfterMs = retryAfterMs; }
  get retryable() { return this.status === 429 || this.status >= 500; }
}
class CircuitOpenError extends Error { constructor(model: string) { super(`Circuit open for ${model}`); this.name = "CircuitOpenError"; } }

// ======================= a chaos provider for testing =======================
function rng(seed: number) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
class ChaosProvider implements Provider {
  #random = rng(11);
  calls = 0;
  readonly failureRate: Record<string, number>;
  constructor(failureRate: Record<string, number>) { this.failureRate = failureRate; }

  complete({ model, prompt, signal }: CompletionRequest): Promise<Completion> {
    this.calls++;
    const roll = this.#random(), rate = this.failureRate[model] ?? 0;
    const delay = roll < rate * 0.25 ? 400 : 20 + this.#random() * 30;          // some calls are very slow
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (roll < rate * 0.25) return resolve({ text: `(slow) answer to "${prompt}"`, model, inputTokens: 20, outputTokens: 40 });
        if (roll < rate * 0.6) return reject(new ProviderError(529, "overloaded"));
        if (roll < rate) return reject(new ProviderError(429, "rate limited", 50));
        resolve({ text: `answer to "${prompt}"`, model, inputTokens: 20, outputTokens: 40 });
      }, delay);
      signal.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
    });
  }
}

// ======================= circuit breaker: a typed state machine =======================
type CircuitState =
  | { kind: "closed"; failures: number }
  | { kind: "open"; until: number }
  | { kind: "half_open" };

class CircuitBreaker {
  state: CircuitState = { kind: "closed", failures: 0 };
  readonly threshold: number;
  readonly cooldownMs: number;
  constructor(threshold = 4, cooldownMs = 300) { this.threshold = threshold; this.cooldownMs = cooldownMs; }

  canRequest(now = performance.now()): boolean {
    if (this.state.kind === "open" && now >= this.state.until) this.state = { kind: "half_open" };   // try one request
    return this.state.kind !== "open";
  }
  success() { this.state = { kind: "closed", failures: 0 }; }
  failure(now = performance.now()) {
    const s = this.state;
    if (s.kind === "half_open" || (s.kind === "closed" && s.failures + 1 >= this.threshold)) this.state = { kind: "open", until: now + this.cooldownMs };
    else if (s.kind === "closed") this.state = { kind: "closed", failures: s.failures + 1 };
  }
}

// ======================= the resilient client =======================
type Options = { models: string[]; maxRetries: number; attemptTimeoutMs: number; baseDelayMs: number };
type Outcome = { ok: true; value: Completion; attempts: number; fallbackUsed: boolean } | { ok: false; error: string; attempts: number };

class ResilientClient {
  readonly stats = { requests: 0, attempts: 0, retries: 0, timeouts: 0, fallbacks: 0, circuitRejections: 0, failures: 0 };
  #breakers = new Map<string, CircuitBreaker>();
  readonly provider: Provider;
  readonly opts: Options;
  constructor(provider: Provider, opts: Options) { this.provider = provider; this.opts = opts; }

  #breaker(model: string) { let b = this.#breakers.get(model); if (!b) this.#breakers.set(model, (b = new CircuitBreaker())); return b; }
  circuit(model: string) { return this.#breaker(model).state.kind; }

  async complete(prompt: string, userSignal?: AbortSignal): Promise<Outcome> {
    this.stats.requests++;
    let attempts = 0, lastError = "no models available";
    for (const [i, model] of this.opts.models.entries()) {
      const breaker = this.#breaker(model);
      if (!breaker.canRequest()) { this.stats.circuitRejections++; lastError = new CircuitOpenError(model).message; continue; }
      if (i > 0) this.stats.fallbacks++;
      for (let retry = 0; retry <= this.opts.maxRetries; retry++) {
        attempts++; this.stats.attempts++;
        const timeout = AbortSignal.timeout(this.opts.attemptTimeoutMs);
        const signal = userSignal ? AbortSignal.any([userSignal, timeout]) : timeout;
        try {
          const value = await this.provider.complete({ model, prompt, signal });
          breaker.success();
          return { ok: true, value, attempts, fallbackUsed: i > 0 };
        } catch (e) {
          if (userSignal?.aborted) return { ok: false, error: "cancelled by user", attempts };      // never retry a user cancel
          const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
          if (isTimeout) this.stats.timeouts++;
          const retryable = isTimeout || (e instanceof ProviderError && e.retryable);
          lastError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
          breaker.failure();
          if (!retryable || retry === this.opts.maxRetries || !breaker.canRequest()) break;     // give up on this model
          this.stats.retries++;
          const backoff = this.opts.baseDelayMs * 2 ** retry;
          const wait = e instanceof ProviderError && e.retryAfterMs ? e.retryAfterMs : backoff / 2 + Math.random() * backoff / 2;   // "equal jitter"
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
    this.stats.failures++;
    return { ok: false, error: lastError, attempts };
  }
}

// ======================= run 40 requests through a flaky primary =======================
const provider = new ChaosProvider({ "primary-model": 0.55, "fallback-model": 0.1 });
const client = new ResilientClient(provider, { models: ["primary-model", "fallback-model"], maxRetries: 2, attemptTimeoutMs: 150, baseDelayMs: 20 });

const t0 = performance.now();
const outcomes: Outcome[] = [];
for (let i = 0; i < 40; i++) {
  outcomes.push(await client.complete(`question ${i + 1}`));
  if (i % 10 === 9) console.log(`after ${i + 1} requests: primary circuit is ${client.circuit("primary-model")}`);
}
const ok = outcomes.filter((o) => o.ok);
console.log(`\n${ok.length}/40 succeeded in ${Math.round(performance.now() - t0)} ms (${ok.filter((o) => o.fallbackUsed).length} via fallback)`);
console.log("stats:", client.stats);
console.log("provider calls actually made:", provider.calls);

// ======================= user cancellation is respected =======================
const controller = new AbortController();
setTimeout(() => controller.abort(), 5);
console.log("\ncancelled request →", await new ResilientClient(new ChaosProvider({}), { models: ["fallback-model"], maxRetries: 3, attemptTimeoutMs: 1000, baseDelayMs: 20 }).complete("long task", controller.signal));
```

Read the stats: retries absorb most transient failures; slow calls are cut off by the per-attempt timeout; when the primary keeps failing its **circuit opens**, so later requests skip it immediately and go to the fallback (look at `circuitRejections`) instead of piling more load on a struggling service.

## How it works

| Piece | Technique |
|---|---|
| retry policy | only 429/5xx/timeouts are retryable; never retry user cancellation or 4xx |
| backoff | exponential with "equal jitter", or the server's `Retry-After` when given |
| timeouts | `AbortSignal.timeout(ms)` per attempt, merged with the caller's signal via `AbortSignal.any` |
| circuit breaker | a union `closed | open | half_open`; opens after N failures, probes once after a cooldown |
| fallbacks | an ordered model list; open circuits are skipped |
| observability | counters for attempts, retries, timeouts, fallbacks and rejections |

:::tip With the Claude SDK
The SDK already retries 429/5xx (`maxRetries`) and supports `timeout` — so wrap it with the **parts it doesn't do**: circuit breaking, model fallbacks, budgets, and metrics. For refusals on Claude Fable 5.1 there's also a server-side `fallbacks` option.
:::

## Making it real

```ts nocheck
class AnthropicProvider implements Provider {
  async complete({ model, prompt, signal }: CompletionRequest): Promise<Completion> {
    try {
      const msg = await anthropic.messages.create(
        { model, max_tokens: 2000, messages: [{ role: "user", content: prompt }] },
        { signal, maxRetries: 0 },                       // our wrapper owns retries
      );
      return { model, text: msg.content.map((b) => (b.type === "text" ? b.text : "")).join(""), inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
    } catch (e) {
      if (e instanceof Anthropic.APIError) throw new ProviderError(e.status ?? 0, e.message);
      throw e;
    }
  }
}
```

:::exercise Extend it
1. Add a **retry budget**: at most 10% of requests per minute may be retries (prevents retry storms).
2. Add **hedged requests**: if the first attempt is slower than the 95th percentile, start a second one and take whichever finishes first.
3. Expose stats as Prometheus metrics or log them as JSON every minute.
4. Unit-test the circuit breaker's transitions with Vitest and fake timers.
:::

:::keypoints
- Retry only what's transient (429, 5xx, timeouts) with exponential backoff + jitter; honour Retry-After.
- Give each attempt a timeout and always respect the user's cancellation (`AbortSignal.any`).
- A circuit breaker (a small typed state machine) stops hammering a failing model; fallbacks keep users served.
- Measure everything — retries and circuit openings are early warnings.
:::
