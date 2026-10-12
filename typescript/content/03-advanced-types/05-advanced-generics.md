---
title: Advanced Generics & Type-Safe APIs
level: advanced
time: 40
summary: The generic techniques behind great libraries — const type parameters, NoInfer, inference from object literals, generic builders that accumulate types, typed event emitters, and a type-safe tool registry where each tool's input and output types flow automatically.
---

You know how to write `function first<T>(xs: T[]): T`. Library authors go further: APIs where **adding a tool, an event or a route automatically updates every type** that depends on it. This lesson collects the patterns you'll need to build (and understand) such APIs.

## `const` type parameters: keep literal types

```ts run level=advanced
function defineModels<T extends readonly string[]>(models: T) { return models; }
function defineModelsConst<const T extends readonly string[]>(models: T) { return models; }

const a = defineModels(["claude-opus-5-5", "claude-haiku-4-5"]);
//    ^?
const b = defineModelsConst(["claude-opus-5-5", "claude-haiku-4-5"]);
//    ^?
console.log(b);
```

:::def const type parameter
`<const T>` asks TypeScript to infer the **most specific** type for an argument, as if the caller had written `as const`. Great for "define" helpers that take config objects or lists of names.
:::

## `NoInfer`: don't let this argument decide the type

```ts run level=advanced type-error
function pickModel<M extends string>(available: M[], fallback: NoInfer<M>): M {
  return available[0] ?? fallback;
}

pickModel(["claude-opus-5-5", "claude-sonnet-5-5"], "claude-sonnet-5-5");   // ✅
pickModel(["claude-opus-5-5", "claude-sonnet-5-5"], "gpt-x");             // ❌ fallback must be one of the list
```

:::def NoInfer
`NoInfer<T>` tells TypeScript: "work out `T` from the **other** arguments; just check this one". Without it, the `"gpt-x"` argument would be added to the inferred union and the mistake would slip through.
:::

## Inferring from object literals: a typed tool registry

The goal: describe tools once, and get precise input **and** output types everywhere.

```ts run level=advanced
type ToolDef<I, O> = {
  description: string;
  run: (input: I) => O | Promise<O>;
};

// `const T` + mapped type: each key keeps its own I and O
function defineTools<const T extends Record<string, ToolDef<any, any>>>(tools: T) {
  type InputOf<K extends keyof T> = Parameters<T[K]["run"]>[0];
  type OutputOf<K extends keyof T> = Awaited<ReturnType<T[K]["run"]>>;
  return {
    tools,
    async call<K extends keyof T & string>(name: K, input: InputOf<K>): Promise<OutputOf<K>> {
      return await tools[name].run(input);
    },
  };
}

const registry = defineTools({
  getWeather: {
    description: "Current weather for a city",
    run: (input: { city: string; unit?: "C" | "F" }) => ({ city: input.city, temp: 27, unit: input.unit ?? "C" }),
  },
  searchDocs: {
    description: "Search the knowledge base",
    run: async (input: { query: string; topK: number }) => [`doc about ${input.query}`].slice(0, input.topK),
  },
});

const weather = await registry.call("getWeather", { city: "Pune" });
//    ^?
const docs = await registry.call("searchDocs", { query: "refunds", topK: 3 });
//    ^?
console.log(weather, docs);
// registry.call("getWeather", { query: "x" })    ← error: wrong input for this tool
// registry.call("sendEmail", {})                 ← error: no such tool
```

Each tool's input type is checked at the call site, and the result type is exact — with no hand-written union of tool names anywhere.

## Builders that accumulate types

A **builder** returns a new, more specific type after each call. This is how tRPC, Zod objects and many query builders work.

```ts run level=advanced type-error
class PromptBuilder<Vars extends string = never> {
  private parts: string[] = [];

  text(s: string): PromptBuilder<Vars> {
    this.parts.push(s);
    return this;
  }
  variable<Name extends string>(name: Name): PromptBuilder<Vars | Name> {
    this.parts.push(`{{${name}}}`);
    return this as PromptBuilder<Vars | Name>;
  }
  render(values: Record<Vars, string>): string {
    return this.parts.join("").replace(/\{\{(\w+)\}\}/g, (_, n: string) => (values as Record<string, string>)[n]);
  }
}

const prompt = new PromptBuilder()
  .text("Translate the following ")
  .variable("language")
  .text(" text into English:\n\n")
  .variable("text");

console.log(prompt.render({ language: "French", text: "Bonjour tout le monde" }));
prompt.render({ language: "French" });        // ❌ missing "text"
```

## A typed event emitter

```ts run level=advanced
type AgentEvents = {
  step: { index: number; tool: string };
  token: string;
  done: { totalTokens: number; costUsd: number };
};

class TypedEmitter<Events extends Record<string, unknown>> {
  private handlers: { [E in keyof Events]?: ((payload: Events[E]) => void)[] } = {};

  on<E extends keyof Events>(event: E, handler: (payload: Events[E]) => void): () => void {
    (this.handlers[event] ??= []).push(handler);
    return () => { this.handlers[event] = this.handlers[event]?.filter((h) => h !== handler); };
  }
  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    this.handlers[event]?.forEach((h) => h(payload));
  }
}

const agent = new TypedEmitter<AgentEvents>();
agent.on("step", (s) => console.log(`step ${s.index}: ${s.tool}`));     // s: { index; tool }
let text = "";
const off = agent.on("token", (t) => { text += t; });                     // t: string
agent.on("done", (d) => console.log(`done — ${d.totalTokens} tokens, $${d.costUsd} | text: ${text}`));

agent.emit("step", { index: 1, tool: "search_docs" });
agent.emit("token", "Refunds are ");
agent.emit("token", "available for 30 days.");
off();
agent.emit("token", " (ignored after unsubscribe)");
agent.emit("done", { totalTokens: 812, costUsd: 0.0061 });
// agent.emit("done", { tokens: 1 })   ← error: wrong payload
```

## Variance in one minute

```ts run level=advanced type-error
type Handler<T> = (value: T) => void;

const handleAnyBlock: Handler<{ type: string }> = (b) => console.log(b.type);
const handleText: Handler<{ type: "text"; text: string }> = (b) => console.log(b.text);

let h1: Handler<{ type: "text"; text: string }> = handleAnyBlock;    // ✅ a general handler can handle text blocks
let h2: Handler<{ type: string }> = handleText;                      // ❌ a text-only handler can't handle every block
```

:::def Variance
How subtyping of `T` affects subtyping of `Box<T>`. Values you **read** (return types, arrays you only read) follow the same direction (*covariant*); values you **accept** (function parameters) go the opposite way (*contravariant*). TypeScript checks this for you — the takeaway: a function that accepts *more* can stand in for one that accepts *less*, never the other way round.
:::

:::tip Keep the complexity in one place
These patterns belong in small, well-tested **library-style** modules (`tools.ts`, `events.ts`, `prompts.ts`). Application code that uses them stays simple — and gets precise types and autocompletion for free.
:::

:::ai
The Claude SDK's tool runner uses exactly these ideas: you describe each tool with a Zod schema, and the `run` function receives the inferred input type. In the Project Lab you'll build a mini agent framework where tools, their schemas and their results are all inferred from one definition.
:::

## Check yourself

```quiz
? What does `<const T>` change about inference?
+ It infers the most specific (literal, readonly) type, like the caller wrote `as const`
- It makes T immutable at runtime
- It prevents T from being inferred
> Useful for define-style helpers.

? Why use NoInfer<M> for a fallback parameter?
+ So the fallback is checked against M instead of widening M
- To make the parameter optional
- To skip type checking
> Inference should come from the main argument, not the fallback.

? A builder method returns `PromptBuilder<Vars | Name>`. What does that achieve?
+ Each call adds a variable name to the type, so render() knows every required variable
- It copies the builder
- It removes variables
> Builders accumulate type information step by step.
```

:::keypoints
- `<const T>` keeps literal types; `NoInfer<T>` stops an argument from widening inference.
- Infer per-key input/output types from object literals with mapped types, `Parameters`, `ReturnType`, `Awaited`.
- Builders and emitters can **accumulate** and **look up** types to keep APIs exact.
- Function parameters are contravariant: a handler that accepts more can replace one that accepts less.
:::
