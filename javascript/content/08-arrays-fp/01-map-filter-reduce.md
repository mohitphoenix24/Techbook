---
title: map, filter, reduce and forEach
level: easy
time: 25
summary: The four array methods you must know cold: what each one returns, how to chain them, how to write your own versions (polyfills), and when forEach or a plain loop is better.
---

## Declarative array code

Instead of writing a loop that says **how** to do the job step by step, array methods say **what** you want.

| Method | You want... | Returns | Callback gets |
|---|---|---|---|
| `forEach(fn)` | do something for each item | `undefined` | `(item, index, array)` |
| `map(fn)` | **transform** each item | a **new array** of the same length | `(item, index, array)` |
| `filter(fn)` | **keep** some items | a **new array**, same or fewer items | `(item, index, array)` |
| `reduce(fn, init)` | **combine** all into one value | **anything** | `(acc, item, index, array)` |

```js run title="The same job: loop vs array methods"
const prices = [120, 450, 80, 999, 300];

// loop: HOW
const result1 = [];
for (let i = 0; i < prices.length; i++) {
  if (prices[i] > 100) result1.push(prices[i] * 0.9);
}

// array methods: WHAT
const result2 = prices.filter((p) => p > 100).map((p) => p * 0.9);

console.log(result1);
console.log(result2);
```

## `map`: transform every item

```js run title="map"
const names = ["asha", "ravi", "meera"];

console.log(names.map((n) => n.toUpperCase()));
console.log(names.map((n, i) => `${i + 1}. ${n}`));

const users = [{ id: 1, name: "Asha" }, { id: 2, name: "Ravi" }];
console.log(users.map((u) => u.name));
console.log(users.map((u) => ({ ...u, active: true })));       // new objects, originals untouched
```

Rules: `map` **always returns the same length**. If you do not use the returned array, use `forEach`. Do not use `map` for side effects.

## `filter`: keep what passes the test

```js run title="filter"
const nums = [1, 2, 3, 4, 5, 6];
console.log(nums.filter((n) => n % 2 === 0));

const messy = [0, 1, "", "a", null, undefined, NaN, false, [], {}];
console.log(messy.filter(Boolean));                    // removes every falsy value

const unique = [1, 2, 2, 3, 3, 3].filter((v, i, arr) => arr.indexOf(v) === i);
console.log(unique, [...new Set([1, 2, 2, 3, 3, 3])]);
```

## `reduce`: the Swiss army knife

`reduce` walks the array and carries an **accumulator**. At each step it takes `(accumulator, item)` and returns the **new accumulator**.

```js run title="reduce step by step"
const nums = [1, 2, 3, 4];

const total = nums.reduce((acc, n) => {
  console.log(`acc = ${acc}, n = ${n} -> ${acc + n}`);
  return acc + n;
}, 0);

console.log("total:", total);
```

Always give an **initial value** (the second argument). Without it, `reduce` on an **empty array throws** a `TypeError`, and the first item is used as the starting accumulator (which may have a different type than you want).

```js run title="No initial value: a trap"
console.log([5].reduce((a, b) => a + b));              // 5: the callback never runs
try {
  [].reduce((a, b) => a + b);
} catch (e) {
  console.log(e.name + ": " + e.message);
}
console.log([].reduce((a, b) => a + b, 0));            // safe
```

## Chaining

Each method returns an array (except `forEach` and `reduce`), so you can chain them:

```js run title="A realistic chain"
const orders = [
  { id: 1, status: "paid", items: 3, amount: 1500 },
  { id: 2, status: "cancelled", items: 1, amount: 400 },
  { id: 3, status: "paid", items: 2, amount: 900 },
  { id: 4, status: "paid", items: 5, amount: 2600 },
];

const revenue = orders
  .filter((o) => o.status === "paid")
  .map((o) => o.amount)
  .reduce((sum, a) => sum + a, 0);

console.log(revenue);
```

## Writing your own: `map`, `filter`, `reduce` (polyfills)

Interviewers often ask for these. They show you understand **what the callback receives** and what is returned.

```js run title="Array.prototype polyfills"
Array.prototype.myMap = function (callback, thisArg) {
  const result = [];
  for (let i = 0; i < this.length; i++) {
    if (i in this) result[i] = callback.call(thisArg, this[i], i, this);   // skip holes
  }
  return result;
};

Array.prototype.myFilter = function (callback, thisArg) {
  const result = [];
  for (let i = 0; i < this.length; i++) {
    if (i in this && callback.call(thisArg, this[i], i, this)) result.push(this[i]);
  }
  return result;
};

Array.prototype.myReduce = function (callback, ...init) {
  let i = 0, acc;
  if (init.length) acc = init[0];
  else {
    while (i < this.length && !(i in this)) i++;                          // first present item
    if (i >= this.length) throw new TypeError("Reduce of empty array with no initial value");
    acc = this[i++];
  }
  for (; i < this.length; i++) if (i in this) acc = callback(acc, this[i], i, this);
  return acc;
};

const a = [1, 2, 3, 4];
console.log(a.myMap((x) => x * 2), a.myFilter((x) => x > 2), a.myReduce((s, x) => s + x, 0));
console.log(a.myReduce((s, x) => s + x), [,,5].myMap((x) => x));          // holes are skipped, and kept as holes
```

## `forEach` vs `for...of` vs `for`

| | `forEach` | `for...of` | `for (let i...)` |
|---|---|---|---|
| Can `break` / `continue` / `return` early | **No** | Yes | Yes |
| Works with `await` in order | **No** (see below) | Yes | Yes |
| Works on iterables (Map, Set, generators) | No (arrays, Maps, Sets have their own `forEach`) | **Yes** | No |
| Index available | yes (2nd argument) | via `.entries()` | yes |

```js run title="forEach cannot be stopped, for...of can"
[1, 2, 3, 4].forEach((n) => {
  if (n === 2) return;                      // only skips this callback, like continue
  console.log("forEach", n);
});

for (const n of [1, 2, 3, 4]) {
  if (n === 3) break;                       // really stops
  console.log("for...of", n);
}
```

:::warn forEach and async/await
`forEach` ignores the promise returned by an `async` callback, so it does **not wait**. Use `for...of` with `await` for sequence, or `Promise.all(array.map(async ...))` for parallel. See the [async bugs lesson](#/l/async-mistakes).
:::

:::interview What is the difference between map, filter, forEach and reduce?
"`map` transforms every item and returns a new array of the same length. `filter` returns a new array with only the items that pass the test. `forEach` just runs a function for each item and returns `undefined`, so it is for side effects. `reduce` folds the array into a single value of any type, carrying an accumulator, and I always give it an initial value so it does not throw on an empty array. `map`, `filter` and `reduce` do not mutate the original array, which makes them good for functional, immutable code."
:::

## More interview questions on this topic

:::qa What does `map` return if the callback returns nothing? {level=easy}
**Say this:** "An array of `undefined` values, with the same length as the original."

**In simple words:** Forgetting `return` in a `map` callback with braces is a classic mistake.
:::

:::qa Why should you always pass an initial value to `reduce`? {level=easy}
**Say this:** "Without it, an empty array throws a TypeError, and the first element becomes the accumulator, which may be of the wrong type."

**In simple words:** The initial value is the safe starting point and also decides the result type.
:::

:::qa How do you stop a `forEach`? {level=medium}
**Say this:** "You cannot, except by throwing an error. Use `for...of` with `break`, or `some`/`every` for early exit."

**In simple words:** Use the right tool: `for...of` or `some`.
:::

:::qa Can `map` be used to remove items? {level=easy}
**Say this:** "No, it always returns the same length. Use `filter` to remove, or `flatMap` to both transform and remove (return `[]` to drop an item)."

**In simple words:** map keeps count. filter changes count.
:::

```quiz
? What does `[1, 2, 3].map((n) => { n * 2; })` return?
- [2, 4, 6]
+ [undefined, undefined, undefined]
- undefined
> The braces make a function body with no return.
? What happens with `[].reduce((a, b) => a + b)`?
- Returns 0
- Returns undefined
+ Throws a TypeError
> Provide an initial value to avoid it.
? Which method can you stop early?
- forEach
- map
+ A for...of loop (with break)
> forEach, map and filter always visit every item.
```

:::keypoints
- `forEach` = side effects. `map` = transform (same length). `filter` = keep (fewer). `reduce` = fold into one value.
- **Always give `reduce` an initial value.**
- They do not mutate the original array. Callbacks receive `(item, index, array)`.
- `forEach` cannot be stopped and ignores promises; use `for...of`.
- Polyfills: loop, `callback.call(thisArg, item, i, this)`, skip holes.
:::
