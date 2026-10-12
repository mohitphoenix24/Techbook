---
title: Conditional Types & infer
level: advanced
time: 35
summary: If/else for types — conditional types (T extends U ? X : Y), how they distribute over unions, extracting parts of types with infer, and building the utility types you used in Module 2 yourself.
---

So far, types have been fixed descriptions. **Conditional types** let a type *choose* based on another type — like an `if` statement that runs while TypeScript checks your code. They power most of the clever types in libraries such as Zod, tRPC and the Claude SDK.

:::def Conditional type
`T extends U ? X : Y` — "if `T` is assignable to `U`, the result is `X`, otherwise `Y`". `extends` here means "fits into", not class inheritance.
:::

:::syntax
```ts
type IsString<T> = T extends string ? "yes" : "no";
```
:::

## A first conditional type

```ts run level=advanced
type IsString<T> = T extends string ? "yes" : "no";

type A = IsString<"hello">;
//   ^?
type B = IsString<42>;
//   ^?

// A more useful one: what does a tool return to the model?
type ToolOutput<T> = T extends string ? { type: "text"; text: T } : { type: "json"; data: T };

type O1 = ToolOutput<string>;
//   ^?
type O2 = ToolOutput<{ temp: number }>;
//   ^?

function toOutput<T>(value: T): ToolOutput<T> {
  return (typeof value === "string" ? { type: "text", text: value } : { type: "json", data: value }) as ToolOutput<T>;
}
console.log(toOutput("27°C and sunny"), toOutput({ temp: 27 }));
```

:::note Why the `as` cast?
TypeScript can't yet prove that a runtime `typeof` check matches a conditional type, so implementations of conditional return types usually need one cast. Keep it inside the function — callers get precise types.
:::

## Distribution over unions

When you pass a **union** to a conditional type, it's applied to **each member separately**, and the results are combined. This is how `Exclude` and `Extract` work:

```ts run level=advanced
type MyExclude<T, U> = T extends U ? never : T;     // never = "drop this member"
type MyExtract<T, U> = T extends U ? T : never;

type Event = "message_start" | "content_block_delta" | "message_stop" | "error" | "ping";

type Important = MyExclude<Event, "ping">;
//   ^?
type Lifecycle = MyExtract<Event, `message_${string}`>;
//   ^?
const e: Important = "error";
console.log(e);
```

:::def Distributive conditional type
A conditional type whose checked type is a bare type parameter (`T extends …`). Given a union, it runs once per member: `F<A | B>` becomes `F<A> | F<B>`. Wrap in brackets (`[T] extends [U]`) to turn distribution off.
:::

## `infer`: pull a type out of another type

:::def infer
Inside the `extends` part of a conditional type, `infer X` declares a type variable that TypeScript fills in by pattern matching. "If T looks like `Promise<something>`, call that something `X`."
:::

```ts run level=advanced
type UnwrapPromise<T> = T extends Promise<infer V> ? V : T;
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;
type FirstArg<F> = F extends (first: infer A, ...rest: any[]) => any ? A : never;
type MyReturnType<F> = F extends (...args: any[]) => infer R ? R : never;

type P = UnwrapPromise<Promise<{ text: string }>>;
//   ^?
type E = ElementOf<Array<{ id: string; score: number }>>;
//   ^?

async function createMessage(params: { model: string; maxTokens: number }) {
  return { id: "msg_1", content: [{ type: "text" as const, text: "Hi" }], stopReason: "end_turn" as const };
}
type Params = FirstArg<typeof createMessage>;
//   ^?
type Response = UnwrapPromise<MyReturnType<typeof createMessage>>;
//   ^?

console.log("types are compile-time only — nothing to print, but look at the types above ✨");
```

You just rebuilt `ReturnType`, `Parameters` (first argument), and `Awaited` (one level) from scratch.

## Practical example: typed event handlers

```ts run level=advanced
type StreamEvent =
  | { type: "message_start"; message: { id: string; model: string } }
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "message_stop"; stopReason: "end_turn" | "tool_use" | "max_tokens" };

// "Given an event type name, give me that event's shape"
type EventOf<K extends StreamEvent["type"]> = Extract<StreamEvent, { type: K }>;

type Handlers = { [K in StreamEvent["type"]]?: (event: EventOf<K>) => void };    // mapped type (next lesson)

function dispatch(events: StreamEvent[], handlers: Handlers) {
  for (const e of events) (handlers[e.type] as ((e: StreamEvent) => void) | undefined)?.(e);
}

let text = "";
dispatch(
  [
    { type: "message_start", message: { id: "msg_1", model: "claude-opus-5-5" } },
    { type: "text_delta", text: "Hello " },
    { type: "text_delta", text: "world" },
    { type: "message_stop", stopReason: "end_turn" },
  ],
  {
    message_start: (e) => console.log("start", e.message.model),      // e is exactly the start event
    text_delta: (e) => { text += e.text; },
    message_stop: (e) => console.log("stop:", e.stopReason, "| text:", text),
  },
);
```

Each handler's parameter is the exact event type — hover-check by adding a `^?` under an `e`.

## Recursive conditional types

```ts run level=advanced
type DeepAwaited<T> = T extends Promise<infer V> ? DeepAwaited<V> : T;
type Flatten<T> = T extends readonly (infer E)[] ? Flatten<E> : T;

type X = DeepAwaited<Promise<Promise<number[]>>>;
//   ^?
type Y = Flatten<string[][][]>;
//   ^?
console.log("ok");
```

:::warn Don't overdo it
Conditional types are powerful, but complex type-level code is hard to read and slows down the compiler. Use them in **library-style** helpers that many places benefit from; keep application code simple.
:::

:::ai
When you see a scary type in an SDK — like `z.infer<typeof schema>` or a tool runner that knows each tool's input type — there's usually a conditional type with `infer` inside. Being able to read `T extends Foo<infer X> ? X : never` turns those types from magic into documentation.
:::

## Check yourself

```quiz
? What is `string | number extends string ? "a" : "b"` when written as `F<string | number>` with `type F<T> = T extends string ? "a" : "b"`?
+ "a" | "b"
- "b"
- "a"
> Conditional types distribute over unions: F<string> | F<number>.

? What does `infer V` do in `T extends Promise<infer V> ? V : T`?
+ Captures the type inside the Promise so you can use it as V
- Converts T into a Promise
- Makes V optional
> infer pattern-matches and names a part of a type.

? Which built-in utility is `T extends U ? never : T`?
+ Exclude
- Extract
- Omit
> Members that match U become never and disappear.
```

:::keypoints
- `T extends U ? X : Y` chooses a type; `extends` means "is assignable to".
- Given a union, conditional types **distribute** over members (`[T] extends [U]` turns it off).
- `infer X` extracts parts of types — the basis of `ReturnType`, `Awaited`, `Parameters`.
- Combine with `Extract` and mapped types for precise, type-safe APIs (like event handlers).
:::
