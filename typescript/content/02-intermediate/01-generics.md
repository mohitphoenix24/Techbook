---
title: Generics
level: intermediate
time: 35
summary: Write code that works for many types without losing type information — generic functions, generic types and classes, constraints with extends, default type parameters, and the generic patterns you'll meet in every AI SDK (Promise<T>, Result<T>, Cache<K, V>, Paginated<T>).
---

Imagine a function that returns the first item of a list. For a list of strings it should return a `string`; for a list of messages, a `Message`. Writing one version per type is silly, and using `any` throws the type away. **Generics** solve this.

:::def Generic
A function or type with a **type parameter** — a placeholder like `T` that is filled in when it's used. `first<T>(items: T[]): T` means "give me an array of *something*, and I'll give you back *that same something*".
:::

:::syntax
```ts
function name<T>(param: T): T { ... }       // generic function
type Box<T> = { value: T };                 // generic type
class Cache<K, V> { ... }                   // generic class
name<string>("x");                          // explicit type argument (usually inferred)
```
:::

## Your first generic function

```ts run level=intermediate
function first<T>(items: T[]): T | undefined {
  return items[0];
}

const model = first(["claude-opus-5-5", "claude-haiku-4-5"]);
//    ^?
const score = first([0.91, 0.42]);
//    ^?
const msg = first([{ role: "user" as const, content: "hi" }]);
//    ^?
console.log(model, score, msg);
```

TypeScript **infers** `T` from the argument. Compare with an `any` version — the information is lost, and the mistake on line 4 is only found when the program crashes:

```ts run level=intermediate type-error expect-error
function firstAny(items: any[]): any { return items[0]; }

const m = firstAny(["claude-opus-5-5"]);
m.toFixed(2);          // no error from TypeScript — would crash at runtime

const g = ["claude-opus-5-5"][0];
g.toFixed(2);          // ❌ with real types, TypeScript catches it
```

## Several type parameters

```ts run level=intermediate
function zip<A, B>(as: A[], bs: B[]): [A, B][] {
  return as.slice(0, Math.min(as.length, bs.length)).map((a, i) => [a, bs[i]]);
}

const pairs = zip(["refunds.md", "pricing.md"], [0.91, 0.42]);
//    ^?
console.log(pairs);

function mapValues<T, U>(obj: Record<string, T>, fn: (value: T) => U): Record<string, U> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}
const costs = mapValues({ opus: 5, sonnet: 3, haiku: 1 }, (price) => `$${price}/M`);
//    ^?
console.log(costs);
```

## Constraints: `extends`

Sometimes you need to know *something* about `T` — for example, that it has an `id` or a `score`. A **constraint** says "T can be any type, as long as it has these properties".

```ts run level=intermediate
function topK<T extends { score: number }>(items: T[], k: number): T[] {
  return items.toSorted((a, b) => b.score - a.score).slice(0, k);
}

const chunks = [
  { id: "c1", text: "Refunds within 30 days", score: 0.91, page: 3 },
  { id: "c2", text: "Pro costs $8", score: 0.42, page: 1 },
  { id: "c3", text: "Refunds via Billing", score: 0.77, page: 4 },
];
const best = topK(chunks, 2);
//    ^?
console.log(best.map((c) => `${c.id} (p.${c.page})`));   // page is still known — nothing was lost
```

```ts run level=intermediate type-error
function topK<T extends { score: number }>(items: T[], k: number): T[] {
  return items.toSorted((a, b) => b.score - a.score).slice(0, k);
}
const items = [{ id: "c1", relevance: 0.9 }];
topK(items, 1);     // ❌ these items have no score property
```

:::def Constraint
`<T extends Something>` limits what `T` can be. Inside the function you may use everything `Something` has; callers still get back their **full** type (with `id`, `page`, …), not just `Something`.
:::

## `keyof` constraints: type-safe property access

```ts run level=intermediate
function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}

const docs = [{ id: "d1", title: "Refunds", tokens: 120 }, { id: "d2", title: "Pricing", tokens: 80 }];
const titles = pluck(docs, "title");
//    ^?
const tokens = pluck(docs, "tokens");
//    ^?
console.log(titles, tokens);
```

`K extends keyof T` means "K must be one of T's property names", and `T[K]` is "the type of that property". You'll study `keyof` in detail in the next lessons.

## Generic types

```ts run level=intermediate
type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
  total: number;
};

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

type Conversation = { id: string; title: string };

const page: Paginated<Conversation> = {
  items: [{ id: "c1", title: "RAG design" }, { id: "c2", title: "Eval plan" }],
  nextCursor: "c2",
  total: 14,
};

function unwrap<T>(r: ApiResult<T>): T {
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.error}`);
  return r.data;
}

console.log(unwrap({ ok: true, data: page }).items.map((c) => c.title));
try { unwrap<Paginated<Conversation>>({ ok: false, error: "Rate limited", status: 429 }); }
catch (e) { console.log((e as Error).message); }
```

## Generic classes

```ts run level=intermediate
class LRUCache<K, V> {
  #map = new Map<K, V>();
  readonly maxSize: number;
  constructor(maxSize: number) { this.maxSize = maxSize; }

  get(key: K): V | undefined {
    const value = this.#map.get(key);
    if (value !== undefined) { this.#map.delete(key); this.#map.set(key, value); }  // mark as recently used
    return value;
  }
  set(key: K, value: V): void {
    this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size > this.maxSize) this.#map.delete(this.#map.keys().next().value!);   // evict the oldest
  }
  get keys(): K[] { return [...this.#map.keys()]; }
}

const embeddings = new LRUCache<string, number[]>(2);
embeddings.set("refund policy", [0.1, 0.9]);
embeddings.set("pricing", [0.7, 0.2]);
embeddings.get("refund policy");                 // used again → most recent
embeddings.set("shipping", [0.4, 0.4]);           // evicts "pricing"
console.log(embeddings.keys);
const v = embeddings.get("pricing");
//    ^?
console.log(v);
```

## Default type parameters

```ts run level=intermediate
type ChatEvent<TMeta = Record<string, never>> = { type: string; at: number; meta: TMeta };

const plain: ChatEvent = { type: "message_start", at: Date.now(), meta: {} };
const rich: ChatEvent<{ model: string }> = { type: "message_start", at: Date.now(), meta: { model: "claude-opus-5-5" } };
console.log(plain.type, rich.meta.model);
```

:::tip Naming type parameters
Single letters are fine for simple cases (`T`, `K`, `V`, `U`). For complex APIs, descriptive names help: `TInput`, `TOutput`, `TContext`.
:::

:::ai
You use generics constantly with AI SDKs, even without writing them: `Promise<Message>`, `Array<ContentBlock>`, `Map<string, Float32Array>`. And when you write helpers — a typed `withRetry<T>(fn: () => Promise<T>): Promise<T>`, a `Cache<K, V>` for embeddings, a `Tool<TInput, TOutput>` — generics keep the types flowing end to end so the caller always knows exactly what comes back.
:::

## Check yourself

```quiz
? What does `function first<T>(items: T[]): T` return for `first(["a", "b"])`?
+ string
- T
- any
> T is inferred as string from the argument.

? What does `<T extends { id: string }>` mean?
+ T can be any type that has an id: string property
- T must be exactly { id: string }
- T is a subclass of a class called id
> Constraints set a minimum shape; extra properties are kept.

? Why prefer a generic over `any` for `withRetry(fn)`?
+ The caller gets back the exact result type of fn
- Generics run faster
- any isn't allowed in strict mode
> Generics preserve type information; any discards it.
```

:::keypoints
- Generics are **type parameters** (`<T>`) filled in at each use — usually inferred.
- Constraints (`T extends {...}`) let you use known properties while keeping the full caller type.
- `K extends keyof T` and `T[K]` give type-safe property access.
- Generic types and classes (`Paginated<T>`, `ApiResult<T>`, `LRUCache<K, V>`) model reusable shapes.
- Prefer generics over `any` whenever the output type depends on the input.
:::
