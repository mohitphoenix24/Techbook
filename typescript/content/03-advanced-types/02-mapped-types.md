---
title: Mapped Types
level: advanced
time: 30
summary: Loop over the keys of a type to build a new one — { [K in keyof T]: ... }, adding and removing optional/readonly modifiers, renaming keys with as, filtering keys, and real uses like form errors, validators and API-to-UI conversions.
---

`Partial<T>` makes every property optional. How? It **loops over the keys** of `T` and builds a new object type. That loop is called a **mapped type**, and you can write your own.

:::def Mapped type
A type of the form `{ [K in Keys]: Something }` that creates one property for each key in `Keys` (often `keyof T`). It's like `Array.map`, but for the properties of a type.
:::

:::syntax
```ts
type Copy<T> = { [K in keyof T]: T[K] };            // same type
type Flags<T> = { [K in keyof T]: boolean };       // same keys, new values
type MyPartial<T> = { [K in keyof T]?: T[K] };      // add ?
type Mutable<T> = { -readonly [K in keyof T]: T[K] };   // remove readonly
type Concrete<T> = { [K in keyof T]-?: T[K] };      // remove ?
```
:::

## Same keys, new values

```ts run level=advanced
type AgentForm = { name: string; model: string; maxTokens: number; systemPrompt: string };

type FormErrors<T> = { [K in keyof T]?: string };             // an optional error message per field
type Touched<T> = { [K in keyof T]: boolean };                 // was the field edited?
type Validators<T> = { [K in keyof T]: (value: T[K]) => string | undefined };

const validators: Validators<AgentForm> = {
  name: (v) => (v.trim().length < 3 ? "At least 3 characters" : undefined),
  model: (v) => (v.startsWith("claude-") ? undefined : "Unknown model"),
  maxTokens: (v) => (v >= 256 && v <= 64_000 ? undefined : "Between 256 and 64000"),    // v is a number here
  systemPrompt: (v) => (v.length < 10 ? "Describe the agent's job" : undefined),
};

function validate<T>(values: T, rules: Validators<T>): FormErrors<T> {
  const errors: FormErrors<T> = {};
  for (const key of Object.keys(rules) as (keyof T)[]) {
    const message = rules[key](values[key]);
    if (message) errors[key] = message;
  }
  return errors;
}

console.log(validate({ name: "Bo", model: "gpt-x", maxTokens: 100, systemPrompt: "Research things carefully." }, validators));
```

Add a field to `AgentForm` and TypeScript immediately demands a validator for it — the types stay complete.

## Modifiers: `?`, `readonly`, `-?`, `-readonly`

```ts run level=advanced
type Settings = { readonly model: string; temperature?: number; maxTokens?: number };

type Resolved = { -readonly [K in keyof Settings]-?: Settings[K] };     // writable, all required
//   ^?

function resolve(s: Settings): Resolved {
  return { model: s.model, temperature: s.temperature ?? 1, maxTokens: s.maxTokens ?? 4096 };
}
const r = resolve({ model: "claude-haiku-4-5" });
r.model = "claude-sonnet-5-5";        // allowed: readonly was removed
console.log(r);
```

## Renaming keys with `as`

```ts run level=advanced
type Usage = { inputTokens: number; outputTokens: number };

// Build getter names: inputTokens → getInputTokens
type Getters<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] };
type UsageGetters = Getters<Usage>;
//   ^?

// Convert camelCase field names to the API's snake_case (for two known keys)
type SnakeKeys = { [K in keyof Usage as K extends "inputTokens" ? "input_tokens" : "output_tokens"]: Usage[K] };
//   ^?

const g: UsageGetters = { getInputTokens: () => 1200, getOutputTokens: () => 340 };
console.log(g.getInputTokens() + g.getOutputTokens());
```

## Filtering keys

Mapping a key to `never` removes it:

```ts run level=advanced
type Doc = { id: string; title: string; tokens: number; score: number; embed: () => Promise<number[]> };

type KeysOfType<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];
type NumericKeys = KeysOfType<Doc, number>;
//   ^?

type DataOnly<T> = { [K in keyof T as T[K] extends Function ? never : K]: T[K] };   // drop methods
type DocData = DataOnly<Doc>;
//   ^?

function sumBy<T>(items: T[], key: KeysOfType<T, number>): number {
  return items.reduce((t, item) => t + (item[key] as number), 0);
}

const docs: DocData[] = [{ id: "a", title: "Refunds", tokens: 120, score: 0.9 }, { id: "b", title: "Pricing", tokens: 80, score: 0.4 }];
console.log(sumBy(docs, "tokens"), sumBy(docs, "score"));
// sumBy(docs, "title")   ← error: title isn't a number key
```

:::tip The `{...}[keyof T]` trick
`{ [K in keyof T]: ... }[keyof T]` builds an object type and immediately reads **all** its values as a union. With `never` for unwanted keys, it's the standard way to compute "the keys whose values are X".
:::

## Mapping over a union of literals

The keys don't have to come from `keyof` — any union of strings works:

```ts run level=advanced
type Model = "opus" | "sonnet" | "haiku";
type Limits = { [M in Model]: { rpm: number; tpm: number } };

const limits: Limits = {
  opus: { rpm: 50, tpm: 40_000 },
  sonnet: { rpm: 100, tpm: 80_000 },
  haiku: { rpm: 200, tpm: 200_000 },
};
console.log(limits.haiku);
```

That's exactly what `Record<Model, {...}>` does under the hood: `type Record<K extends keyof any, T> = { [P in K]: T }`.

:::ai
Mapped types are perfect for keeping AI configuration complete: a `Validators<T>` for an agent config form, `Record<ToolName, ToolImpl>` so every declared tool has an implementation, or `{ [K in keyof Usage]: number }` for usage dashboards. When someone adds a tool or a field, the compiler points to every place that needs updating.
:::

## Check yourself

```quiz
? What does `{ [K in keyof T]?: T[K] }` produce?
+ T with every property optional (Partial<T>)
- T with every property required
- The keys of T
> The ? modifier is added to every mapped property.

? How do you remove `readonly` in a mapped type?
+ -readonly [K in keyof T]
- !readonly
- delete readonly
> A minus removes a modifier; + (default) adds it.

? What happens to a key when the `as` clause maps it to never?
+ It's removed from the resulting type
- It becomes optional
- It becomes type never
> Key remapping to never filters keys out.
```

:::keypoints
- `{ [K in keyof T]: ... }` loops over keys to build new object types (`Partial`, `Readonly`, `Record`…).
- Add/remove modifiers with `?`, `readonly`, `-?`, `-readonly`.
- Rename keys with `as` (+ template literal types); map to `never` to filter keys.
- `{...}[keyof T]` turns a mapped type into a union of its values.
:::
