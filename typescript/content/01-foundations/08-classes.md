---
title: Classes
level: intermediate
time: 30
summary: Classes with types — fields, constructors, methods, private and readonly members, getters, static members, implementing interfaces, abstract base classes, and when plain objects and functions are the better choice.
---

A **class** bundles data and the functions that work on it. SDK clients (`new Anthropic()`), vector stores, rate limiters and agents are often classes. TypeScript adds types and visibility rules on top of JavaScript classes.

:::syntax
```ts
class Name {
  field: Type;                 // public field
  #secret: Type;               // truly private (JavaScript private field)
  readonly created = new Date();

  constructor(param: Type) { this.field = param; }
  method(arg: Type): ReturnType { ... }
}
```
:::

## A typed class

```ts run level=easy
class Conversation {
  readonly id: string;
  messages: { role: "user" | "assistant"; content: string }[] = [];

  constructor(id: string, systemPrompt?: string) {
    this.id = id;
    if (systemPrompt) this.system = systemPrompt;
  }

  system = "You are a helpful assistant.";

  add(role: "user" | "assistant", content: string): this {   // returning `this` allows chaining
    this.messages.push({ role, content });
    return this;
  }

  get turnCount(): number {                                   // a getter: used like a property
    return this.messages.filter((m) => m.role === "user").length;
  }
}

const chat = new Conversation("c_1", "Answer in one sentence.")
  .add("user", "What is an embedding?")
  .add("assistant", "A list of numbers that captures meaning.")
  .add("user", "And a vector database?");

console.log(chat.id, "| turns:", chat.turnCount, "| system:", chat.system);
console.log(chat.messages);
```

## Private state: `#private` vs `private`

```ts run level=intermediate type-error
class ApiClient {
  #apiKey: string;                  // JavaScript private: hidden even at runtime
  private requestCount = 0;         // TypeScript private: checked only by the compiler

  constructor(apiKey: string) { this.#apiKey = apiKey; }

  describe() {
    this.requestCount++;
    return `key …${this.#apiKey.slice(-4)}, ${this.requestCount} request(s)`;
  }
}

const client = new ApiClient("sk-ant-secret-9f3c");
console.log(client.describe());
console.log(client.requestCount);   // ❌ TypeScript error… but it still runs and prints 1!
// client.#apiKey                   ← JavaScript itself refuses this: it's a syntax error outside the class
```

:::def #private field
A JavaScript feature: fields whose names start with `#` can't be read from outside the class, **even at runtime**. Prefer them for secrets and internal state.
:::

:::note `private` vs `#`
The `private` keyword is checked only by TypeScript and disappears at runtime (anyone can still read it from plain JavaScript). `#field` is enforced by JavaScript itself.
:::

## Implementing an interface

An interface can describe what a class must provide. Different implementations become **swappable**:

```ts run level=intermediate
interface Embedder {
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}

class HashingEmbedder implements Embedder {      // a toy, offline embedder for tests
  readonly dimensions: number;
  constructor(dimensions = 8) { this.dimensions = dimensions; }

  async embed(text: string): Promise<number[]> {
    const v: number[] = new Array(this.dimensions).fill(0);
    for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
      let h = 0;
      for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      v[h % this.dimensions] += 1;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => Number((x / norm).toFixed(3)));
  }
}

async function indexAll(embedder: Embedder, docs: string[]) {     // works with ANY Embedder
  return Promise.all(docs.map((d) => embedder.embed(d)));
}

const vectors = await indexAll(new HashingEmbedder(), ["refund policy", "pricing plans"]);
console.log(vectors);
```

In production you'd write a `VoyageEmbedder implements Embedder` that calls a real API, and your indexing code wouldn't change at all.

## Abstract classes

```ts run level=advanced
abstract class Tool<Input, Output> {
  abstract readonly name: string;
  abstract run(input: Input): Promise<Output>;

  async call(input: Input): Promise<{ tool: string; ok: true; output: Output } | { tool: string; ok: false; error: string }> {
    try {
      return { tool: this.name, ok: true, output: await this.run(input) };
    } catch (e) {
      return { tool: this.name, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

class Calculator extends Tool<{ expression: string }, number> {
  readonly name = "calculator";
  async run({ expression }: { expression: string }) {
    if (!/^[\d\s+\-*/().]+$/.test(expression)) throw new Error("Only arithmetic is allowed");
    return Number(Function(`return (${expression})`)());
  }
}

const calc = new Calculator();
console.log(await calc.call({ expression: "(12 + 30) * 2" }));
console.log(await calc.call({ expression: "process.exit()" }));
```

:::def abstract class
A base class you can't create directly (`new Tool()` is an error). It can contain shared code (`call`) and declare `abstract` members that every subclass **must** implement (`name`, `run`).
:::

## Static members

```ts run level=easy
class TokenCounter {
  static readonly CHARS_PER_TOKEN = 4;
  static estimate(text: string): number {
    return Math.ceil(text.length / TokenCounter.CHARS_PER_TOKEN);
  }
}
console.log(TokenCounter.estimate("How many tokens is this sentence?"));
```

## Parameter properties — and why modern code avoids them

```ts
class Client {
  constructor(private readonly apiKey: string) {}   // declares AND assigns the field in one go
}
```

This shorthand works in `tsc`, but it **isn't plain JavaScript with types removed** — it generates code. Node.js's built-in TypeScript support (which just strips types) can't run it, and the `erasableSyntaxOnly` setting forbids it. Prefer declaring fields explicitly, as in the examples above.

:::def Erasable syntax
TypeScript features that disappear completely when you delete the types: annotations, interfaces, `type`. Non-erasable features (enums, namespaces, parameter properties) generate JavaScript. Modern projects increasingly stick to erasable syntax so any tool can strip types without a full compiler.
:::

:::tip Classes or functions?
Use a **class** when something has internal state and a lifecycle (a client with a connection pool, a rate limiter, a cache). Use **plain objects and functions** for data and transformations — messages, chunks and responses are better as `type`s than as classes.
:::

:::ai
The Claude SDK is a class (`new Anthropic()`), and so are things like MCP servers (`new McpServer(...)`). Your own code benefits from small interfaces — `Embedder`, `VectorStore`, `ChatModel` — so you can swap real implementations for fakes in tests and local demos (exactly what this site does to run AI examples without API keys).
:::

## Check yourself

```quiz
? Which private field is hidden even at runtime?
+ #apiKey
- private apiKey
- readonly apiKey
> # fields are enforced by JavaScript itself.

? What does `class A implements Embedder` guarantee?
+ A has every member Embedder requires, with compatible types
- A inherits Embedder's code
- A can only be used through Embedder
> implements is a compile-time check of the shape.

? Why might a project avoid constructor parameter properties?
+ They aren't erasable syntax, so type-stripping tools like Node can't run them
- They are slower
- They don't support readonly
> They generate JavaScript code, unlike annotations.
```

:::keypoints
- Classes have typed fields, constructors, methods, getters and `static` members.
- `#field` is truly private; `private`/`readonly` are compile-time checks.
- `implements Interface` lets you swap implementations (real vs fake embedders, models, stores).
- `abstract` classes share code and force subclasses to implement key members.
- Prefer erasable syntax: declare fields explicitly instead of parameter properties.
:::
