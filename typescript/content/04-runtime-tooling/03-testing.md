---
title: Testing TypeScript Code
level: intermediate
time: 30
summary: Tests that let you change prompts, models and code without fear — a tiny test runner you can read, Vitest for real projects, mocking fetch and model clients through interfaces, and type tests with @ts-expect-error and expectTypeOf.
---

Types catch shape mistakes; **tests** catch logic mistakes — a wrong cosine formula, a chunker that drops the last sentence, a retry loop that never stops. Together they let you refactor AI code confidently.

:::def Unit test
A small program that calls one function with known input and checks (asserts) the output: *"chunk this 1,000-character text into 300-character pieces → expect 4 chunks, none longer than 300"*.
:::

## How a test runner works

Here's a complete (tiny) one — `describe`, `it`, `expect` — so you can see there's no magic:

```ts run level=intermediate
type TestFn = () => void | Promise<void>;
const tests: { name: string; fn: TestFn }[] = [];
let prefix = "";

function describe(name: string, body: () => void) { const old = prefix; prefix += name + " › "; body(); prefix = old; }
function it(name: string, fn: TestFn) { tests.push({ name: prefix + name, fn }); }

function expect<T>(actual: T) {
  return {
    toBe(expected: T) { if (!Object.is(actual, expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
    toEqual(expected: T) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); },
    toBeCloseTo(expected: number, digits = 3) { if (Math.abs(Number(actual) - expected) > 10 ** -digits) throw new Error(`expected ≈${expected}, got ${actual}`); },
  };
}

// ---- code under test ----
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
function chunk(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

// ---- tests ----
describe("cosine", () => {
  it("is 1 for identical vectors", () => expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1));
  it("is 0 for orthogonal vectors", () => expect(cosine([1, 0], [0, 1])).toBe(0));
  it("handles zero vectors", () => expect(cosine([0, 0], [1, 1])).toBe(0));
});
describe("chunk", () => {
  it("splits into pieces of the given size", () => expect(chunk("abcdefgh", 3)).toEqual(["abc", "def", "gh"]));
  it("keeps all text", () => expect(chunk("hello world", 4).join("")).toBe("hello world"));
  it("a deliberately wrong test", () => expect(chunk("abc", 2).length).toBe(1));
});

// ---- runner ----
let passed = 0;
for (const t of tests) {
  try { await t.fn(); passed++; console.log("✅", t.name); }
  catch (e) { console.log("❌", t.name, "→", (e as Error).message); }
}
console.log(`\n${passed}/${tests.length} passed`);
```

Notice `expect<T>(actual: T)` — the expected value must have the **same type** as the actual one, so `expect(chunk(...)).toEqual(42)` would be a type error before the test even runs.

## Vitest: the standard for TypeScript projects

```bash
npm install -D vitest
```

```ts
// src/rag/cosine.test.ts
import { describe, it, expect } from "vitest";

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  a.forEach((x, i) => { const y = b[i] ?? 0; dot += x * y; na += x * x; nb += y * y; });
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

describe("cosine", () => {
  it("is 1 for identical vectors", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });
  it("is 0 when one vector is all zeros", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});
```

Run `npx vitest` (watch mode) or `npx vitest run` (CI). Vitest understands TypeScript out of the box — no build step.

## Testing code that calls a model

Never call a real model in unit tests: slow, flaky, costs money. Design code around a small **interface**, then pass a fake in tests:

```ts
// src/llm/types.ts
export interface ChatModel {
  complete(prompt: string): Promise<string>;
}

// src/summarise.ts
export async function summarise(model: ChatModel, text: string): Promise<string[]> {
  if (!text.trim()) return [];
  const raw = await model.complete(`Summarise as bullet points:\n\n${text}`);
  return raw.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
}
```

```ts nocheck
// src/summarise.test.ts
import { describe, it, expect, vi } from "vitest";
import { summarise } from "./summarise.ts";
import type { ChatModel } from "./llm/types.ts";

describe("summarise", () => {
  it("turns bullet output into a clean list", async () => {
    const model: ChatModel = { complete: vi.fn(async () => "- First point\n• Second point\n\n") };
    expect(await summarise(model, "some text")).toEqual(["First point", "Second point"]);
    expect(model.complete).toHaveBeenCalledOnce();
  });

  it("doesn't call the model for empty input", async () => {
    const model: ChatModel = { complete: vi.fn() };
    expect(await summarise(model, "   ")).toEqual([]);
    expect(model.complete).not.toHaveBeenCalled();
  });
});
```

In production, a `ClaudeModel implements ChatModel` wraps the real SDK. Your logic is tested without it.

## Mocking fetch

```ts
import { it, expect, vi, afterEach } from "vitest";

afterEach(() => { vi.restoreAllMocks(); });

it("retries once on 429", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("busy", { status: 429 }))
    .mockResolvedValueOnce(Response.json({ answer: "ok" }));

  async function ask(): Promise<string> {
    for (let i = 0; i < 2; i++) {
      const res = await fetch("https://api.example.com/ask");
      if (res.ok) return ((await res.json()) as { answer: string }).answer;
    }
    throw new Error("failed");
  }

  expect(await ask()).toBe("ok");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
```

## Type tests

Sometimes the **types** are the thing to test — a helper that infers tool input types, a schema whose `z.infer` must stay stable. Two tools:

**`@ts-expect-error`** — a comment that says "the next line must have a type error". If it doesn't, the comment itself becomes an error:

```ts run level=intermediate type-error
type Role = "user" | "assistant";
function send(role: Role, text: string) { return `${role}: ${text}`; }

// @ts-expect-error — "system" must not be accepted
send("system", "hi");

// @ts-expect-error — oops: this line is valid, so the comment is reported as unused
send("user", "hi");

console.log(send("assistant", "Hello!"));
```

Only the second comment produces an error — it's "unused" because that line is fine. That's exactly how a type test fails.

**`expectTypeOf`** from Vitest checks exact types:

```ts
import { it, expectTypeOf } from "vitest";
import { z } from "zod";

const Ticket = z.object({ title: z.string(), priority: z.enum(["low", "high"]) });

it("infers the Ticket type", () => {
  expectTypeOf<z.infer<typeof Ticket>>().toEqualTypeOf<{ title: string; priority: "low" | "high" }>();
});
```

:::tip What to test in AI code
Test the **deterministic parts** hard: parsing and validating model output, chunking, scoring, prompt building, retry/backoff logic, tool argument handling, cost calculation. Test model *quality* separately with an **eval set** (Module 5) — that's measurement, not a pass/fail unit test.
:::

:::ai
Record a few real model responses (including odd ones: refusals, truncated JSON, extra prose around JSON) and save them as fixtures. Unit tests then replay them through your parser and error handling — fast, free, and they cover exactly the cases that broke in production.
:::

## Check yourself

```quiz
? How do you test code that calls a model without calling the real API?
+ Depend on a small interface (ChatModel) and pass a fake implementation in tests
- Use a smaller model
- Skip testing that code
> Interfaces make real and fake implementations interchangeable.

? What happens if the line after `// @ts-expect-error` has no type error?
+ The comment itself is reported as an error
- Nothing
- The line is skipped
> That's what makes it useful as a type test.

? Which command runs Vitest once (for CI)?
+ npx vitest run
- npx vitest --watch
- npx tsc --test
> Plain npx vitest watches for changes.
```

:::keypoints
- A test calls code with known inputs and asserts outputs — `describe` / `it` / `expect`.
- Use **Vitest** for TypeScript projects; it runs `.ts` test files directly.
- Put models and HTTP behind interfaces; use fakes, `vi.fn()` and `vi.spyOn(globalThis, "fetch")`.
- Type tests: `@ts-expect-error` and `expectTypeOf`.
- Unit-test deterministic logic; measure model quality with evals.
:::
