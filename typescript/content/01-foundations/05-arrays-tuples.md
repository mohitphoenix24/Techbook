---
title: Arrays, Tuples, Maps & Sets
level: easy
time: 25
summary: Typed collections — arrays and readonly arrays, typed array methods (map, filter, reduce, sort), tuples for fixed-size data like embeddings pairs and scores, and Map and Set with type parameters.
---

AI code is full of lists: messages, chunks, scores, embeddings, tool calls. TypeScript tracks what's **inside** each collection, so every `map`, `filter` and loop knows the element type.

## Arrays

:::syntax
```ts
let names: string[] = [];             // array of strings
let scores: Array<number> = [];       // same thing, generic form
let matrix: number[][] = [[1, 2], [3, 4]];
```
:::

```ts run level=easy
type Chunk = { id: string; text: string; score: number };

const chunks: Chunk[] = [
  { id: "c1", text: "Refunds are available for 30 days.", score: 0.91 },
  { id: "c2", text: "Pro plan costs $8 per month.", score: 0.42 },
  { id: "c3", text: "Refund requests go through Billing.", score: 0.77 },
];

const relevant = chunks.filter((c) => c.score > 0.5);     // Chunk[]
const texts = relevant.map((c) => c.text);                 // string[]
//    ^?
const best = chunks.reduce((a, b) => (b.score > a.score ? b : a));
//    ^?
const total = chunks.reduce((sum, c) => sum + c.score, 0);

console.log(texts);
console.log("best:", best.id, "| avg score:", (total / chunks.length).toFixed(2));
```

Every callback parameter (`c`, `a`, `b`) gets its type automatically from the array.

:::warn Empty arrays need a type
`const ids = []` has type `any[]`-ish behaviour that grows as you push. Give empty arrays a type: `const ids: string[] = []`.
:::

## Sorting safely

```ts run level=easy
const results = [
  { doc: "pricing.md", score: 0.42 },
  { doc: "refunds.md", score: 0.91 },
  { doc: "billing.md", score: 0.77 },
];

const ranked = results.toSorted((a, b) => b.score - a.score);   // returns a NEW array
console.log(ranked.map((r) => `${r.doc} ${r.score}`));
console.log("original untouched:", results[0].doc);
```

:::tip toSorted, toReversed, with
`sort()` and `reverse()` **change** the original array. The newer `toSorted()`, `toReversed()`, `toSpliced()` and `with(index, value)` return a copy — safer, especially in UI state.
:::

## Readonly arrays

```ts run level=easy type-error
function topK(scores: readonly number[], k: number): number[] {
  scores.push(1.0);                                      // ❌ can't change a readonly array
  return scores.toSorted((a, b) => b - a).slice(0, k);  // ✅ toSorted() makes a copy
}
console.log(topK([0.2, 0.9, 0.5], 2));
```

:::def readonly array
`readonly T[]` (or `ReadonlyArray<T>`) is an array you can read but not change: no `push`, `pop`, `sort` or assigning to indexes. Use it for parameters to promise "I won't modify your data".
:::

## Filtering out missing values

```ts run level=intermediate
const maybeScores = [0.9, undefined, 0.4, undefined, 0.7];
//    ^?
const scores = maybeScores.filter((s) => s !== undefined);
//    ^?
console.log(scores.map((s) => s.toFixed(1)));
```

TypeScript understands that the `filter` callback removes `undefined`, so the result is `number[]` — no extra casting needed.

## Tuples: fixed-length arrays

:::def Tuple
An array with a **fixed number of elements**, where each position has its own type: `[string, number]` is "a string, then a number". Great for pairs and small records.
:::

```ts run level=easy
type ScoredDoc = [docId: string, score: number];       // labelled elements (labels are just documentation)

const hits: ScoredDoc[] = [["refunds.md", 0.91], ["billing.md", 0.77]];
for (const [docId, score] of hits) {
  console.log(`${docId.padEnd(12)} ${score}`);
}

// Functions can return tuples, like React's useState
function splitTokens(text: string, maxTokens: number): [kept: string, droppedCount: number] {
  const words = text.split(" ");
  return [words.slice(0, maxTokens).join(" "), Math.max(0, words.length - maxTokens)];
}
const [kept, dropped] = splitTokens("one two three four five six", 4);
//     ^?
console.log(kept, "| dropped:", dropped);
```

```ts run level=easy type-error
const pair: [string, number] = ["opus", 5];
const bad: [string, number] = [5, "opus"];      // ❌ wrong order
const third = pair[2];                           // ❌ there is no index 2
```

## `as const` — freezing literal values

```ts run level=intermediate
const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"] as const;
//    ^?
type Model = (typeof MODELS)[number];     // turn the array's values into a union type
//   ^?

function pick(m: Model) { return `using ${m}`; }
console.log(pick("claude-haiku-4-5"));
console.log(MODELS.length, "models");
```

:::def as const
Tells TypeScript "this value will never change": arrays become `readonly` tuples and strings keep their exact literal types. `typeof MODELS[number]` then gives you a union of the values — one list, used both at runtime and as a type.
:::

## Map and Set

```ts run level=easy
// Map<Key, Value>: a dictionary with any key type and fast lookups
const cache = new Map<string, number[]>();
cache.set("refund policy", [0.12, 0.88, 0.31]);
cache.set("pricing", [0.55, 0.12, 0.70]);

const hit = cache.get("refund policy");
//    ^?
if (hit) console.log("cached embedding:", hit);
console.log("has 'shipping'?", cache.has("shipping"), "| size:", cache.size);

// Set<T>: unique values
const seenDocs = new Set<string>();
for (const id of ["d1", "d2", "d1", "d3", "d2"]) seenDocs.add(id);
console.log([...seenDocs]);
```

:::tip Map.get can return undefined
`map.get(key)` returns `V | undefined` because the key might be missing — TypeScript makes you check. That's exactly the bug you want caught.
:::

:::ai
Embeddings are just `number[]` (or `Float32Array` for speed), retrieval results are often `[id, score]` tuples, and caches of embeddings or responses are `Map`s keyed by text or a hash. Typing them precisely prevents mixing up "a list of scores" with "a list of vectors".
:::

## Check yourself

```quiz
? What is the type of `[1, 2, 3].map((n) => String(n))`?
+ string[]
- number[]
- any[]
> map's return type comes from the callback.

? How do you type a pair of (document id, score)?
+ [string, number]
- string | number
- Array<string, number>
> A tuple has a fixed length and a type per position.

? What does `cache.get("x")` return for `Map<string, number[]>`?
+ number[] | undefined
- number[]
- null
> The key might not exist.
```

:::keypoints
- Arrays: `T[]` or `Array<T>`; callbacks in `map`/`filter`/`reduce` are typed automatically.
- Give empty arrays a type; prefer `toSorted()` over `sort()` to avoid mutation.
- `readonly T[]` promises not to change an array; `filter(x => x !== undefined)` narrows the element type.
- Tuples like `[id: string, score: number]` describe fixed positions.
- `as const` + `(typeof X)[number]` turns a list of values into a union type.
- `Map<K, V>` and `Set<T>` take type parameters; `get` returns `V | undefined`.
:::
