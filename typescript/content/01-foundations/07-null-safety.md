---
title: Null Safety
level: easy
time: 20
summary: The bug TypeScript prevents most often — "Cannot read properties of undefined". Learn strict null checks, optional chaining (?.), nullish coalescing (??), safe defaults, why the non-null assertion (!) is dangerous, and noUncheckedIndexedAccess.
---

"**TypeError: Cannot read properties of undefined**" is the most common JavaScript crash. It happens when you use a value that isn't there: a missing field in an API response, an array index that's out of range, a `find()` that found nothing. TypeScript's **strict null checks** make these visible before they crash.

:::def strictNullChecks
A compiler setting (on by default in TypeScript 6+ via `strict`) where `null` and `undefined` are **not** allowed in other types. `string` means "definitely a string"; "maybe missing" must be written as `string | undefined`.
:::

## Where `undefined` sneaks in

```ts run level=easy type-error expect-error
type Doc = { id: string; title: string };
const docs: Doc[] = [{ id: "d1", title: "Refunds" }, { id: "d2", title: "Pricing" }];

const found = docs.find((d) => d.id === "d9");   // find() returns Doc | undefined
//    ^?
console.log(found.title);                         // ❌ found might be undefined (and here it is!)
```

TypeScript spotted it: `find` might return nothing. Run it to see the crash TypeScript warned you about.

## Fixing it: check, `?.`, and `??`

```ts run level=easy
type Doc = { id: string; title: string; meta?: { author?: string; tags?: string[] } };
const docs: Doc[] = [
  { id: "d1", title: "Refunds", meta: { author: "Ada", tags: ["billing"] } },
  { id: "d2", title: "Pricing" },
];

// 1. An if-check narrows away undefined
const found = docs.find((d) => d.id === "d2");
if (found) console.log("found:", found.title);

// 2. Optional chaining ?. stops and returns undefined if something is missing
console.log(docs[0].meta?.author);            // "Ada"
console.log(docs[1].meta?.author);            // undefined (no crash)
console.log(docs[1].meta?.tags?.length);      // undefined

// 3. Nullish coalescing ?? gives a default when the left side is null or undefined
const author = docs[1].meta?.author ?? "unknown";
const tagCount = docs[1].meta?.tags?.length ?? 0;
console.log(author, tagCount);
```

:::def Optional chaining ( ?. )
`a?.b` means "if `a` is null or undefined, the whole expression is `undefined`; otherwise read `a.b`". Also works for calls (`fn?.()`) and indexes (`arr?.[0]`).
:::

:::def Nullish coalescing ( ?? )
`a ?? b` means "use `a`, unless it's `null` or `undefined` — then use `b`". Unlike `||`, it keeps valid falsy values like `0`, `""` and `false`.
:::

```ts run level=easy
const settings = { temperature: 0, maxTokens: undefined as number | undefined, system: "" };

console.log("with ||:", settings.temperature || 0.7, settings.system || "(default prompt)");   // ❌ loses 0 and ""
console.log("with ??:", settings.temperature ?? 0.7, settings.system ?? "(default prompt)");   // ✅ keeps them
console.log("maxTokens:", settings.maxTokens ?? 1024);
```

:::warn || vs ??
`temperature || 0.7` turns a deliberate `0` into `0.7` — a classic AI-settings bug. Use `??` for defaults.
:::

## The non-null assertion `!` — use with care

```ts run level=intermediate expect-error
const scores = new Map<string, number>([["d1", 0.9]]);

const s1 = scores.get("d1")!;     // "trust me, it's there" — the type becomes number
console.log(s1.toFixed(2));

const s2 = scores.get("d7")!;     // you lied to the compiler…
console.log(s2.toFixed(2));        // …so it crashes at runtime
```

:::def Non-null assertion ( ! )
`value!` tells TypeScript "this is definitely not null or undefined". It removes the check **without** any runtime safety. If you're wrong, you get the very crash TypeScript was trying to prevent.
:::

Prefer a real check, a default (`?? 0`), or throwing a clear error:

```ts run level=intermediate
function getOrThrow<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing key: ${String(key)}`);
  return value;               // narrowed to V
}

const prices = new Map([["opus", 5], ["haiku", 1]]);
console.log(getOrThrow(prices, "opus"));
try { getOrThrow(prices, "gpt"); } catch (e) { console.log("caught:", (e as Error).message); }
```

## `noUncheckedIndexedAccess` — the extra-strict setting

By default, `arr[i]` is typed as the element type even if `i` is out of range. Turn on `noUncheckedIndexedAccess` in `tsconfig.json` and every index access includes `| undefined`:

```ts
// tsconfig.json: "noUncheckedIndexedAccess": true
const messages: string[] = [];
const first = messages[0];        // string | undefined  (instead of string)
const env: Record<string, string> = {};
const key = env["API_KEY"];       // string | undefined
```

:::tip Recommended for AI code
Responses, chunk lists and token arrays are often empty or shorter than expected. `noUncheckedIndexedAccess` catches `response.content[0].text` when `content` is empty. It's not part of `strict`, so add it yourself in new projects.
:::

:::ai
Model responses have many optional parts: `usage` details, `stop_details` only on refusals, tool `input` that may be partial while streaming, `content` that may be empty. Code like `response.content[0]?.type === "text" ? response.content[0].text : ""` and defaults with `??` keep your app from crashing on unusual responses.
:::

## Check yourself

```quiz
? What does `user?.profile?.name` return if `profile` is undefined?
+ undefined — it stops safely
- It throws an error
- null
> Optional chaining short-circuits to undefined.

? `const t = settings.temperature ?? 0.7` — what is t if temperature is 0?
+ 0
- 0.7
- undefined
> ?? only replaces null and undefined; || would replace 0 too.

? Why is `value!` risky?
+ It removes the type check without adding any runtime check
- It makes the value null
- It's slower
> If the value really is undefined, you crash.
```

:::keypoints
- With `strict`, "maybe missing" must be explicit: `T | undefined` / `T | null`.
- `find`, `Map.get`, optional properties and (with `noUncheckedIndexedAccess`) indexes can be `undefined`.
- Handle it with checks, `?.` (safe access) and `??` (defaults that keep `0`, `""`, `false`).
- Avoid `!`; prefer a check or a helpful error.
:::
