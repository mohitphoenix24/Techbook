---
title: "Find the bug"
level: medium
time: 35
summary: Fourteen short programs that run without errors but give a wrong answer. Find the bug first, then open the hint for the cause and the fix. The kind of review question senior interviews love.
---

Each program **runs**, but it does not do what the author wanted. Say what is wrong, then open the hint.

## Bug 1: sorting numbers

```js run title="Bug 1: sort the prices from low to high"
const prices = [5, 25, 100, 1];
console.log(prices.sort());
```

:::hint Show the bug and the fix
The default `sort` compares items as **strings**, so `'100'` comes before `'25'`. Pass a comparator: `prices.sort((a, b) => a - b)` gives `[ 1, 5, 25, 100 ]`. Remember that `sort` also **mutates** the array; use `toSorted` (or copy first) when you need the original.
:::

## Bug 2: merging options

```js run title="Bug 2: use the default timeout when none is given"
const defaults = { timeout: 3000, retries: 2 };
const options = { timeout: undefined, retries: 5 };
console.log({ ...defaults, ...options });
```

:::hint Show the bug and the fix
Spread copies keys whose value is `undefined`, so it **overwrites** the default with `undefined`. Remove undefined entries first (`Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined))`), or compute each field with `options.timeout ?? defaults.timeout`.
:::

## Bug 3: shared default array

```js run title="Bug 3: every config gets its own tags"
const base = { tags: [] };
const makeConfig = (overrides) => ({ ...base, ...overrides });

makeConfig().tags.push("x");
console.log(makeConfig().tags);
```

:::hint Show the bug and the fix
The spread is **shallow**: every config shares the same `tags` array from `base`. Create the array inside the function: `({ ...base, tags: [], ...overrides })`, or use `structuredClone(base)` first.
:::

## Bug 4: converting strings

```js run title="Bug 4: turn the strings into numbers"
console.log(["1", "2", "3"].map(parseInt));
```

:::hint Show the bug and the fix
`map` passes `(value, index)`, and `parseInt(value, radix)` takes the index as the radix: radix 0 works, radix 1 is invalid, radix 2 reads only binary digits. Use `map(Number)` or `map((s) => parseInt(s, 10))`.
:::

## Bug 5: a method used as a callback

```js run title="Bug 5: scale every item"
class Cart {
  constructor() { this.items = [1, 2]; this.factor = 10; }
  scale(x) { return x * this.factor; }
  scaled() { return this.items.map(this.scale); }
}
try { console.log(new Cart().scaled()); } catch (e) { console.log(e.name); }
```

:::hint Show the bug and the fix
`this.scale` is passed as a bare function, so `map` calls it without the object: inside, `this` is `undefined` and reading `this.factor` throws a `TypeError`. Fix with an arrow function (`this.items.map((x) => this.scale(x))`), `map(this.scale, this)` or `bind`.
:::

## Bug 6: adding prices

```js run title="Bug 6: is the total exactly 0.3?"
const prices = [0.1, 0.2];
const total = prices.reduce((sum, p) => sum + p, 0);
console.log(total, total === 0.3);
```

:::hint Show the bug and the fix
Binary floating point cannot store 0.1 or 0.2 exactly. Do money in **integers** (paise: `10 + 20`, then divide for display), or compare with a tolerance (`Math.abs(total - 0.3) < Number.EPSILON`), or use a decimal library.
:::

## Bug 7: comparing dates

```js run title="Bug 7: are these the same moment?"
const a = new Date(0);
const b = new Date(0);
console.log(a === b);
```

:::hint Show the bug and the fix
`===` compares **references**, and these are two different objects. Compare the values: `a.getTime() === b.getTime()` (or `+a === +b`).
:::

## Bug 8: for...in over an array

```js run title="Bug 8: list the indexes of the array"
Array.prototype.last = function () { return this[this.length - 1]; };   // a helper added by some library

const keys = [];
for (const k in ["a", "b"]) keys.push(k);
console.log(keys);

delete Array.prototype.last;   // clean up this demo
```

:::hint Show the bug and the fix
`for...in` visits all **enumerable** properties, including inherited ones, so the added `last` method shows up. Use `for...of`, `forEach`, a plain `for` loop or `Object.keys`. And never add enumerable properties to built-in prototypes.
:::

## Bug 9: the missing await

```js run title="Bug 9: check the result of save()"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function save() { await sleep(5); return "saved"; }

async function main() {
  const result = save();
  console.log(result instanceof Promise, result === "saved");
  console.log(await result);
}
await main();
```

:::hint Show the bug and the fix
Without `await`, `result` is a **promise**, not the string, so comparisons and property reads are wrong (and a promise is always truthy, so `if (result)` would pass). Write `const result = await save();`. A linter rule (`no-floating-promises`, `require-await`) catches many of these.
:::

## Bug 10: dates after JSON

```js run title="Bug 10: send a Date through JSON and read it back"
const copy = JSON.parse(JSON.stringify({ created: new Date(0) }));
console.log(typeof copy.created, copy.created instanceof Date);
```

:::hint Show the bug and the fix
JSON has no date type: `Date` becomes an ISO **string**. Convert back explicitly, for example with a reviver: `JSON.parse(text, (key, value) => (key === 'created' ? new Date(value) : value))`, or validate and transform with a schema library.
:::

## Bug 11: a grid of arrays

```js run title="Bug 11: make a 3-row grid and add one cell to the first row"
const grid = Array(3).fill([]);
grid[0].push(1);
console.log(JSON.stringify(grid));
```

:::hint Show the bug and the fix
`fill([])` puts **the same array** in every slot. Create separate arrays: `Array.from({ length: 3 }, () => [])`.
:::

## Bug 12: checking for objects

```js run title="Bug 12: print x for every object in the list"
const items = [{ x: 1 }, null];
try {
  items.forEach((item) => { if (typeof item === "object") console.log(item.x); });
} catch (e) {
  console.log(e.name);
}
```

:::hint Show the bug and the fix
`typeof null` is `'object'`, so the check lets `null` through and `null.x` throws. Check `item !== null && typeof item === 'object'`, or use optional chaining: `item?.x`.
:::

## Bug 13: reading numbers from input

```js run title="Bug 13: treat an empty field as missing"
const fromForm = ["", "  ", "abc", "12"];
console.log(fromForm.map(Number));
```

:::hint Show the bug and the fix
`Number("")` and `Number("  ")` are `0`, not `NaN`, so a blank field looks like a valid zero. Check emptiness first: `s.trim() === '' ? undefined : Number(s)`, then validate with `Number.isFinite`.
:::

## Bug 14: async inside map

```js run title="Bug 14: double every id after loading"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = [1, 2, 3];

const doubled = ids.map(async (id) => { await sleep(5); return id * 2; });
console.log(doubled);
```

:::hint Show the bug and the fix
An async callback returns a **promise**, so `map` gives an array of promises. Wait for them: `const doubled = await Promise.all(ids.map(async (id) => ...))`. Use `for...of` with `await` if the calls must run one after another.
:::

:::keypoints
- Code that **runs** can still be **wrong**: look for **shared references**, **missing awaits**, **string comparisons** and **lost `this`**.
- Safe habits: `sort` with a comparator, `Number` or `parseInt(s, 10)`, `Array.from` for grids, `?.` and `??`, `await Promise.all`.
- Lint rules and TypeScript catch many of these before review.
:::
