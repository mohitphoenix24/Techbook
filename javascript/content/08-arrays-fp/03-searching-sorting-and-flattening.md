---
title: find, some, every, flat, flatMap and sort
level: easy
time: 30
summary: The rest of the array toolbox: searching (find, findIndex, includes, at), testing (some, every), flattening (flat, flatMap), and sorting correctly (the default is by string!), with stable sort and the new copy methods.
---

## Searching

| Method | Returns | Use when |
|---|---|---|
| `find(fn)` | the **first item** that passes, or `undefined` | you want the item |
| `findIndex(fn)` | its **index**, or `-1` | you want the position |
| `findLast(fn)` / `findLastIndex(fn)` | the same, searching from the **end** (ES2023) | the newest match |
| `indexOf(x)` / `lastIndexOf(x)` | position of a value (uses `===`), or `-1` | simple values |
| `includes(x)` | `true`/`false` (handles `NaN`) | "is it in there?" |
| `at(i)` | item at index, **negative counts from the end** | last item: `arr.at(-1)` |

```js run title="Searching"
const users = [
  { id: 1, name: "Asha", age: 25 },
  { id: 2, name: "Ravi", age: 17 },
  { id: 3, name: "Meera", age: 32 },
];

console.log(users.find((u) => u.age > 18));
console.log(users.findIndex((u) => u.name === "Ravi"));
console.log(users.findLast((u) => u.age > 18).name);
console.log(users.find((u) => u.age > 100));

const nums = [1, 2, NaN, 4];
console.log(nums.indexOf(NaN), nums.includes(NaN));       // indexOf cannot find NaN, includes can
console.log(nums.at(-1), nums.at(0), nums.at(10));
```

## Testing every item: `some` and `every`

They **stop early**: `some` stops at the first `true`, `every` stops at the first `false`.

```js run title="some and every"
const ages = [22, 31, 17, 45];

console.log(ages.some((a) => a < 18));          // is there at least one minor?
console.log(ages.every((a) => a >= 18));        // is everyone an adult?
console.log([].some((x) => true), [].every((x) => false));   // empty array: some = false, every = true
```

`[].every(...)` is **`true`** (nothing fails), and `[].some(...)` is **`false`**. This is a common trick question.

## Flattening

```js run title="flat and flatMap"
const nested = [1, [2, [3, [4]]]];

console.log(nested.flat());              // one level
console.log(nested.flat(2));
console.log(nested.flat(Infinity));      // all levels

// flatMap = map, then flat(1): useful when each item gives 0, 1 or many results
const sentences = ["hello world", "hi"];
console.log(sentences.map((s) => s.split(" ")));
console.log(sentences.flatMap((s) => s.split(" ")));

// filter + map in one pass: return [] to drop an item
console.log([1, 2, 3, 4].flatMap((n) => (n % 2 === 0 ? [n * 10] : [])));
```

## Sorting

### The default sort is alphabetical, even for numbers

```js run title="The sort trap"
console.log([10, 9, 1, 100, 25].sort());                   // compares as STRINGS: "10" < "100" < "25" < "9"
console.log([10, 9, 1, 100, 25].sort((a, b) => a - b));    // ascending numbers
console.log([10, 9, 1, 100, 25].sort((a, b) => b - a));    // descending numbers
```

### The comparator

`sort((a, b) => ...)` returns:

- a **negative** number → `a` comes before `b`
- a **positive** number → `a` comes after `b`
- `0` → keep their order (sort is **stable** since ES2019)

```js run title="Sorting objects, strings and multiple keys"
const people = [
  { name: "Ravi", age: 30 },
  { name: "Asha", age: 25 },
  { name: "Meera", age: 30 },
  { name: "Kiran", age: 25 },
];

// by age ascending, then name A-Z
console.log(people.toSorted((a, b) => a.age - b.age || a.name.localeCompare(b.name)).map((p) => `${p.name}(${p.age})`));

// strings: use localeCompare, not < or -
const words = ["é", "z", "a", "Z", "b"];
console.log([...words].sort());                                  // by code unit: capital Z before a, é last
console.log([...words].sort((a, b) => a.localeCompare(b)));     // human order
```

### `sort` mutates. Use `toSorted` for a copy

```js run title="sort mutates, toSorted does not"
const original = [3, 1, 2];
const copy = original.toSorted((a, b) => a - b);
console.log(original, copy);

original.sort((a, b) => a - b);
console.log(original);
```

(`toSorted`, `toReversed`, `toSpliced` and `with` arrived in ES2023. Older code uses `[...arr].sort()`.)

### Common comparator mistakes

```js run title="Wrong comparators"
// returns a boolean: true/false become 1/0, never negative: broken
console.log([3, 1, 2].sort((a, b) => a > b));         // not reliable (modern engines leave it in a weak order)

// correct versions
console.log([3, 1, 2].sort((a, b) => a - b));
console.log([3, 1, 2].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));

// undefined values always go last, without calling the comparator
console.log([3, undefined, 1, 2].sort((a, b) => a - b));
```

## Other useful methods

```js run title="Handy methods"
const a = [1, 2, 3, 4, 5];

console.log(a.slice(1, 3), a.slice(-2));               // copy a part (end is exclusive)
console.log(Array.from({ length: 5 }, (_, i) => i * i));  // generate: [0,1,4,9,16]
console.log(Array.from("abc"), Array.of(7), [..."hi"]);
console.log([1, 2, 3].fill(0), new Array(3).fill("x"));
console.log([..."hello"].reverse().join(""));
console.log([1, 2, 3].join(" | "), [[1, 2], [3]].toString());
console.log(Array.isArray([]), Array.isArray({ length: 0 }));
console.log([...a.entries()].map(([i, v]) => `${i}:${v}`).join(" "));
```

## Choosing the right method

| I want to... | Use |
|---|---|
| change every item | `map` |
| keep some items | `filter` |
| get one item | `find` |
| know **if** something matches | `some` / `includes` |
| know if **all** match | `every` |
| turn into one value | `reduce` |
| loop for side effects | `for...of` / `forEach` |
| remove duplicates | `[...new Set(arr)]` |
| order items | `toSorted(comparator)` |

:::interview Why does `[10, 9, 1].sort()` give a surprising result? How do you sort numbers?
"The default comparator converts items to strings and compares them by UTF-16 code units, so `10` comes before `9` because `'1' < '9'`. For numbers I pass a comparator, `(a, b) => a - b` for ascending. `sort` mutates the array and has been stable since ES2019. For a new array without mutating, I use `toSorted`, or copy first with spread. For strings I use `localeCompare`."
:::

## More interview questions on this topic

:::qa What do `every` and `some` return for an empty array? {level=medium}
**Say this:** "`every` returns `true` and `some` returns `false`. There is no item that fails the test, and no item that passes it."

**In simple words:** "All of nothing" is true. "Any of nothing" is false.
:::

:::qa Is JavaScript's sort stable? {level=medium}
**Say this:** "Yes, since ES2019 (V8 7.0). Items that compare as equal keep their original order. This lets you sort by one key and then by another."

**In simple words:** Equal items do not shuffle.
:::

:::qa Difference between `find` and `filter`? {level=easy}
**Say this:** "`find` returns the first matching item or `undefined`, and stops. `filter` returns an array of all matching items."

**In simple words:** One item vs a list.
:::

:::qa What is the difference between `indexOf` and `includes` for `NaN`? {level=hard}
**Say this:** "`indexOf` uses strict equality, so it never finds `NaN` (it returns -1). `includes` uses SameValueZero, so it finds `NaN`."

**In simple words:** `NaN === NaN` is false, but `includes` knows better.
:::

```quiz
? What does `[1, 10, 2].sort()` give?
- [1, 2, 10]
+ [1, 10, 2]
- [10, 2, 1]
> Default sorting compares strings: "1" < "10" < "2".
? What does `[].every(() => false)` return?
- false
+ true
- undefined
> No item can fail.
? Which copy method sorts without changing the original?
- sort
+ toSorted
- reverse
> toSorted (ES2023) returns a new array.
```

:::keypoints
- Search: `find`, `findIndex`, `findLast`, `includes`, `indexOf`, `at(-1)`. Test: `some`, `every` (stop early).
- `flat(depth)` flattens; `flatMap` = map + flat(1), also filters by returning `[]`.
- **Default `sort` is lexicographic.** Use `(a, b) => a - b`, `localeCompare` for strings. Sort is **stable** and **mutating**; use `toSorted`.
- `[].every` is `true`, `[].some` is `false`. `includes` finds `NaN`, `indexOf` does not.
:::
