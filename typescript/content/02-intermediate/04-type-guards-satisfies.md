---
title: Type Guards, Assertions & satisfies
level: intermediate
time: 30
summary: Teach TypeScript about your own checks — custom type guards (x is T), assertion functions (asserts x is T), the difference between `as` casts and the safer `satisfies` operator, and how to validate unknown data from APIs by hand.
---

TypeScript understands built-in checks like `typeof` and `in`. But real checks are often more complex: "is this a valid tool call?", "is this a non-empty list of messages?". You can package such checks into functions that TypeScript **trusts** for narrowing.

## Custom type guards: `value is Type`

:::def Type guard (type predicate)
A function whose return type is `value is SomeType`. When it returns `true`, TypeScript narrows the argument to `SomeType` in that branch. You are responsible for the check being correct.
:::

```ts run level=intermediate
type ToolCall = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

function isToolCall(value: unknown): value is ToolCall {
  return (
    typeof value === "object" && value !== null &&
    (value as { type?: unknown }).type === "tool_use" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { input?: unknown }).input === "object"
  );
}

const blocks: unknown[] = JSON.parse(`[
  { "type": "text", "text": "Let me check." },
  { "type": "tool_use", "id": "toolu_1", "name": "get_order", "input": { "orderId": "A-1042" } },
  { "type": "tool_use", "name": "broken" }
]`);

for (const b of blocks) {
  if (isToolCall(b)) console.log(`call ${b.name} with`, b.input);    // b is ToolCall here
  else console.log("not a tool call:", b);
}

const calls = blocks.filter(isToolCall);       // guards work with filter too
//    ^?
console.log(calls.length, "valid tool call(s)");
```

## Inferred type predicates

Since TypeScript 5.5, simple arrow functions get a type predicate automatically:

```ts run level=intermediate
type Block = { type: "text"; text: string } | { type: "image"; url: string };
const content: Block[] = [{ type: "text", text: "Hi" }, { type: "image", url: "cat.png" }, { type: "text", text: "Bye" }];

const texts = content.filter((b) => b.type === "text");
//    ^?
console.log(texts.map((b) => b.text).join(" "));     // .text is available — no cast needed
```

## Assertion functions: `asserts value is Type`

Instead of returning a boolean, an assertion function **throws** if the check fails. After calling it, TypeScript knows the type for the rest of the code.

```ts run level=intermediate
function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${name} must be a string, got ${typeof value}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const env: Record<string, unknown> = { ANTHROPIC_MODEL: "claude-opus-5-5", MAX_TOKENS: "4096" };

const model = env.ANTHROPIC_MODEL;
assertString(model, "ANTHROPIC_MODEL");
console.log(model.toUpperCase());               // model: string from here on

const maxTokens = Number(env.MAX_TOKENS);
assert(Number.isInteger(maxTokens) && maxTokens > 0, "MAX_TOKENS must be a positive integer");
console.log(maxTokens);

try { assertString(env.TEMPERATURE, "TEMPERATURE"); } catch (e) { console.log("❌", (e as Error).message); }
```

## Type assertions with `as` — and their danger

:::def Type assertion ( as )
`value as Type` tells TypeScript "treat this as `Type`". It does **no** runtime check. It's an escape hatch, useful when you know more than the compiler — and a source of bugs when you're wrong.
:::

```ts run level=intermediate expect-error
type Message = { role: "user" | "assistant"; content: string };

const raw = JSON.parse('{ "role": "assistant", "text": "Hello" }');
const msg = raw as Message;                    // TypeScript believes you…
console.log(msg.content.toUpperCase());         // …but content doesn't exist → crash
```

:::warn Casting isn't checking
`JSON.parse(x) as Message` is the most common way bugs get into "type-safe" code. Data from outside should be **checked** (a type guard or Zod), not cast.
:::

## `satisfies`: check without changing the type

`satisfies` checks that a value matches a type, but keeps the **more precise** type TypeScript inferred. It's the best of annotations and inference.

```ts run level=intermediate
type ModelConfig = { maxOutput: number; supportsVision: boolean };
type Registry = Record<string, ModelConfig>;

// With an annotation, the specific keys are lost:
const annotated: Registry = {
  "claude-opus-5-5": { maxOutput: 128_000, supportsVision: true },
  "claude-haiku-4-5": { maxOutput: 64_000, supportsVision: true },
};
type A = keyof typeof annotated;
//   ^?

// With satisfies, the shape is checked AND the keys stay exact:
const checked = {
  "claude-opus-5-5": { maxOutput: 128_000, supportsVision: true },
  "claude-haiku-4-5": { maxOutput: 64_000, supportsVision: true },
} satisfies Registry;
type B = keyof typeof checked;
//   ^?

console.log(checked["claude-haiku-4-5"].maxOutput);
```

```ts run level=intermediate type-error
type ModelConfig = { maxOutput: number; supportsVision: boolean };

const config = {
  "claude-opus-5-5": { maxOutput: 128_000, supportsVision: true },
  "claude-haiku-4-5": { maxOutput: "64k", supportsVision: true },     // ❌ caught by satisfies
} satisfies Record<string, ModelConfig>;
```

| | Annotation `const x: T = …` | `as T` | `satisfies T` |
|---|---|---|---|
| checks the value matches T | ✅ | ❌ (mostly not) | ✅ |
| resulting type | `T` (wider) | `T` | the precise inferred type |
| safe? | ✅ | ⚠️ | ✅ |

:::tip When to use which
Use **annotations** for function parameters and public APIs. Use **`satisfies`** for config objects and lookup tables where you want both checking and precise keys. Use **`as`** rarely, with a comment explaining why it's safe.
:::

:::ai
LLM output and tool arguments arrive as `unknown`. A type guard or assertion function is the minimal safe way to use them — and Zod (Module 4) automates exactly this: `Schema.parse(data)` is an assertion function generated from a schema.
:::

## Check yourself

```quiz
? What does the return type `value is ToolCall` do?
+ When the function returns true, the argument is narrowed to ToolCall
- It converts the value to a ToolCall
- It throws if the value isn't a ToolCall
> Type predicates narrow in the true branch. asserts-functions throw instead.

? What happens at runtime with `JSON.parse(text) as Message`?
+ Nothing is checked — it's only a compile-time instruction
- The JSON is validated against Message
- It throws if fields are missing
> as is not a runtime check.

? Why use `satisfies` for a config table?
+ It checks the shape but keeps the exact keys and literal types
- It makes the object readonly
- It removes extra keys
> Annotations widen the type; satisfies keeps it precise.
```

:::keypoints
- `(x): x is T` type guards narrow in `if`/`filter`; simple arrow filters infer them automatically.
- `asserts x is T` functions throw on bad data and narrow the rest of the scope.
- `as` is an unchecked cast — don't use it on outside data.
- `satisfies T` checks a value against `T` while keeping its precise type.
:::
