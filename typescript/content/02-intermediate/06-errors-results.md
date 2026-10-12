---
title: Errors & Result Types
level: intermediate
time: 30
summary: Handle failure on purpose — why catch gives you unknown, custom error classes with codes and causes, mapping HTTP and SDK errors, and the Result type pattern that makes "this can fail" part of the function's type.
---

AI apps fail in many normal ways: rate limits, timeouts, refusals, invalid JSON from the model, a tool that throws. Good code treats these as **expected outcomes**, not surprises. TypeScript helps you be explicit about which errors can happen.

## `catch` gives you `unknown`

```ts run level=intermediate
function parseJson(text: string): unknown {
  return JSON.parse(text);
}

try {
  parseJson("{ not valid json");
} catch (err) {
//       ^?
  // anything can be thrown in JavaScript (even a string), so err is unknown
  if (err instanceof SyntaxError) console.log("Bad JSON:", err.message);
  else if (err instanceof Error) console.log("Other error:", err.message);
  else console.log("Something weird was thrown:", err);
}
```

:::def unknown in catch
With `strict` mode, the variable in `catch (err)` has type `unknown`, because JavaScript lets you `throw` anything. Narrow it (usually with `instanceof Error`) before reading `.message`.
:::

A tiny helper avoids repeating that check:

```ts run level=intermediate
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
}

for (const thrown of [new Error("boom"), "plain string", { code: 42 }]) {
  try { throw thrown; } catch (e) { console.log(errorMessage(e)); }
}
```

## Custom error classes

Give errors **names and data** so callers can react properly — retry a rate limit, show a refusal message, report a bug.

```ts run level=intermediate
class ModelError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, options?: { cause?: unknown }) {
    super(message, options);                       // `cause` keeps the original error for debugging
    this.name = "ModelError";
    this.status = status;
    this.retryable = status === 429 || status >= 500;
  }
}

class RefusalError extends Error {
  readonly category: string;
  constructor(category: string) {
    super(`The model declined (${category})`);
    this.name = "RefusalError";
    this.category = category;
  }
}

function handle(err: unknown): string {
  if (err instanceof RefusalError) return `Show a polite message (${err.category})`;
  if (err instanceof ModelError && err.retryable) return `Retry later (HTTP ${err.status})`;
  if (err instanceof ModelError) return `Fix the request (HTTP ${err.status}): ${err.message}`;
  return "Unexpected: " + String(err);
}

console.log(handle(new ModelError("Rate limited", 429)));
console.log(handle(new ModelError("max_tokens too large", 400)));
console.log(handle(new RefusalError("cyber")));
const wrapped = new ModelError("Upstream failed", 502, { cause: new Error("ECONNRESET") });
console.log(handle(wrapped), "| cause:", (wrapped.cause as Error).message);
```

:::tip Error codes as unions
Instead of many classes, one class with a `code: "rate_limited" | "timeout" | "invalid_output" | …` union also works well — and a `switch` on the code gets exhaustiveness checking.
:::

## The Result pattern

`throw` is invisible in a function's type: `function parse(s: string): Ticket` doesn't tell you it might throw. A **Result type** puts failure into the type, so the caller *must* handle it.

:::def Result type
A discriminated union like `{ ok: true; value: T } | { ok: false; error: E }`. Functions return it instead of throwing for **expected** failures. The caller checks `ok` and TypeScript narrows to the right branch.
:::

```ts run level=intermediate
type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

type Ticket = { title: string; priority: "low" | "medium" | "high" };
type ParseError = { kind: "invalid_json" } | { kind: "missing_field"; field: string } | { kind: "bad_priority"; got: unknown };

function parseTicket(modelOutput: string): Result<Ticket, ParseError> {
  let data: unknown;
  try { data = JSON.parse(modelOutput); } catch { return Err({ kind: "invalid_json" }); }
  if (typeof data !== "object" || data === null) return Err({ kind: "invalid_json" });
  const { title, priority } = data as { title?: unknown; priority?: unknown };
  if (typeof title !== "string") return Err({ kind: "missing_field", field: "title" });
  if (priority !== "low" && priority !== "medium" && priority !== "high") return Err({ kind: "bad_priority", got: priority });
  return Ok({ title, priority });
}

function explain(e: ParseError): string {
  switch (e.kind) {
    case "invalid_json": return "The model didn't return JSON — ask again with stricter instructions";
    case "missing_field": return `Missing "${e.field}"`;
    case "bad_priority": return `Unknown priority ${JSON.stringify(e.got)}`;
  }
}

for (const output of [
  '{"title": "Login broken on Safari", "priority": "high"}',
  "Sure! Here is the ticket:",
  '{"priority": "low"}',
  '{"title": "Typo", "priority": "urgent"}',
]) {
  const r = parseTicket(output);
  if (r.ok) console.log("✅", r.value);
  else console.log("❌", explain(r.error));
}
```

## When to throw vs return a Result

| Situation | Prefer |
|---|---|
| bugs, impossible states, misconfiguration at startup | **throw** (fail fast) |
| expected failures the caller should handle: invalid model output, not found, validation | **Result** |
| failures crossing an async boundary in a library you don't control | catch, then convert to a Result |

## Converting throwing code into Results

```ts run level=intermediate
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function tryAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, value: await fn() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e : new Error(String(e)) }; }
}

async function flakyTool(n: number) {
  await new Promise((r) => setTimeout(r, 20));
  if (n % 2) throw new Error(`tool failed for input ${n}`);
  return n * 10;
}

const results = await Promise.all([1, 2, 3, 4].map((n) => tryAsync(() => flakyTool(n))));
const values = results.filter((r) => r.ok).map((r) => r.value);
const errors = results.filter((r) => !r.ok).map((r) => r.error.message);
console.log({ values, errors });
```

:::ai
Agent loops are full of expected failures: a tool throws, the model calls an unknown tool, arguments don't validate. Convert each to a Result and send it **back to the model** as an error tool result (`is_error: true`) — the model can often fix its own mistake on the next turn. Only truly unexpected errors should crash the loop.
:::

## Check yourself

```quiz
? What is the type of `err` in `catch (err)` with strict mode?
+ unknown
- Error
- any
> Anything can be thrown, so narrow it first.

? Why return a Result instead of throwing for invalid model output?
+ The failure becomes part of the function's type, so callers must handle it
- Results are faster than exceptions
- You can't throw inside async functions
> throw is invisible in the signature; Result isn't.

? What does `new Error("msg", { cause: original })` give you?
+ An error that keeps the original error for debugging
- An error that retries automatically
- A Result type
> cause preserves the chain of errors.
```

:::keypoints
- `catch (err)` is `unknown` — narrow with `instanceof Error` (or a helper).
- Custom error classes carry names and data (`status`, `retryable`, `category`); use `cause` to chain.
- `Result<T, E>` = `{ ok: true; value } | { ok: false; error }` makes expected failures explicit.
- Throw for bugs and startup misconfiguration; return Results for expected failures.
:::
