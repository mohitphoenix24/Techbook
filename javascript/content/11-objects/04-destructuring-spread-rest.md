---
title: Destructuring, spread and rest
level: easy
time: 30
summary: Unpack arrays and objects in one line, give defaults and new names, use rest to collect the remaining, spread to copy and merge, in function parameters too, and know the pitfalls (shallow copies, null errors, order of merging).
---

## Destructuring: unpack values into variables

### Arrays: by position

```js run title="Array destructuring"
const [first, second] = ["red", "green", "blue"];
console.log(first, second);

const [, , third] = ["red", "green", "blue"];            // skip with commas
console.log(third);

const [a, b = "default", c = "also default"] = [1, undefined];     // defaults when undefined
console.log(a, b, c);

let x = 1, y = 2;
[x, y] = [y, x];                                          // swap without a temp variable
console.log(x, y);

const [head, ...tail] = [10, 20, 30, 40];                 // rest: the remaining items
console.log(head, tail);
```

Works with **any iterable** (strings, Sets, Maps, generators):

```js run title="Destructuring any iterable"
const [ch1, ch2] = "hello";
const [firstOfSet] = new Set(["x", "y"]);
const [[k, v]] = new Map([["key", "value"]]);
function* gen() { yield 1; yield 2; yield 3; }
const [g1, g2] = gen();
console.log(ch1, ch2, firstOfSet, k, v, g1, g2);
```

### Objects: by name

```js run title="Object destructuring"
const user = { id: 7, name: "Asha", address: { city: "Pune", pin: "411001" }, tags: ["admin", "dev"] };

const { name, id } = user;                                  // by property name
const { name: userName, role = "guest" } = user;            // rename, and a default
const { address: { city } } = user;                         // nested
const { tags: [firstTag] } = user;                          // nested array
const { id: _ignore, ...rest } = user;                      // rest: everything else (a shallow copy)

console.log(name, id, userName, role, city, firstTag);
console.log(rest);
```

Note: `{ address: { city } }` creates only `city`, **not** `address`.

### Computed keys, existing variables, and the parentheses trap

```js run title="Assign to existing variables, computed keys"
const key = "name";
const { [key]: value } = { name: "Asha" };
console.log(value);

let a, b;
({ a, b } = { a: 1, b: 2 });                                 // parentheses needed: a statement cannot start with {
console.log(a, b);
```

## In function parameters

This is the most useful place: **named arguments** with **defaults**.

```js run title="Destructured parameters"
function createServer({ host = "localhost", port = 3000, secure = false } = {}) {
  return `${secure ? "https" : "http"}://${host}:${port}`;
}

console.log(createServer());
console.log(createServer({ port: 8080 }));
console.log(createServer({ host: "example.com", secure: true }));

const points = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
console.log(points.map(({ x, y }) => x + y));

for (const [i, { x }] of points.entries()) console.log(i, x);
```

The `= {}` at the end lets you call the function with **no argument**. Without it, `createServer()` would throw `Cannot destructure property 'host' of undefined`.

## Rest and spread: the same `...`, two jobs

- **Rest** (in a **pattern**: parameters or destructuring) **collects** into an array/object.
- **Spread** (in an **expression**: calls, array literals, object literals) **expands** an iterable/object.

```js run title="Rest vs spread"
function sum(...nums) { return nums.reduce((a, b) => a + b, 0); }     // REST: collect arguments
console.log(sum(1, 2, 3));

const numbers = [4, 5, 6];
console.log(Math.max(...numbers));                                     // SPREAD: expand into arguments
console.log([0, ...numbers, 7]);                                       // SPREAD: into an array literal
console.log([..."hey"]);                                               // any iterable
```

## Spread for copying and merging

```js run title="Copy and merge (shallow!)"
const base = { a: 1, b: { c: 2 } };

const copy = { ...base };                                  // shallow copy
copy.a = 100;
copy.b.c = 999;                                            // the nested object is SHARED
console.log(base);

const defaults = { theme: "light", size: "m" };
console.log({ ...defaults, theme: "dark" });               // later keys win: override
console.log({ theme: "dark", ...defaults });               // here defaults override: order matters!

const arr1 = [1, 2], arr2 = [3];
console.log([...arr1, ...arr2], arr1.concat(arr2));

const withoutB = (({ b, ...others }) => others)(base);     // omit a key
console.log(withoutB);
```

## Pitfalls

```js run title="Pitfalls"
// 1. Destructuring null or undefined throws
try { const { x } = null; } catch (e) { console.log(e.name + ": " + e.message); }
const { y } = null ?? {};                                  // guard
console.log(y);

// 2. Defaults only apply for undefined, not null
const { p = "default" } = { p: null };
console.log(p);

// 3. Spread of a non-iterable in an array is an error; in an object it is fine
try { console.log([...{ a: 1 }]); } catch (e) { console.log(e.name); }
console.log({ ...null, ...undefined, ..."ab", ...[9] });   // null/undefined ignored; strings/arrays spread by index

// 4. Spread only copies OWN ENUMERABLE properties (no prototype, no getters as getters)
class P { constructor() { this.own = 1; } method() {} }
console.log({ ...new P() });
```

## Quick reference

| Task | Code |
|---|---|
| Swap | `[a, b] = [b, a]` |
| First and rest | `const [first, ...rest] = arr` |
| Rename | `const { name: n } = obj` |
| Default | `const { x = 5 } = obj` |
| Omit a key | `const { skip, ...others } = obj` |
| Copy object / array | `{ ...obj }` / `[...arr]` |
| Merge (right wins) | `{ ...a, ...b }` |
| Pass array as arguments | `fn(...args)` |
| Rest parameters | `function f(...args) {}` |

:::interview What is the difference between rest and spread? What are the pitfalls of using spread to copy?
"They use the same `...`. Rest is in a pattern, a parameter list or a destructuring pattern, and collects the remaining values into an array or object. Spread is in an expression, such as a call, an array literal or an object literal, and expands an iterable or an object's own enumerable properties. Spread copies are shallow, so nested objects are shared; the order matters for merges because later keys win; and spread loses prototypes and getters. For deep copies I use `structuredClone`."
:::

## More interview questions on this topic

:::qa How do you swap two variables without a temporary variable? {level=easy}
**Say this:** "Array destructuring: `[a, b] = [b, a]`."

**In simple words:** The right side is built first, then unpacked.
:::

:::qa What happens when you destructure `null` or `undefined`? {level=easy}
**Say this:** "It throws a TypeError. Guard with a default `= {}` in the parameter or `?? {}`."

**In simple words:** There is nothing to unpack.
:::

:::qa Does a default value apply for `null`? {level=medium}
**Say this:** "No. Defaults apply only when the value is `undefined`. `null` is a real value."

**In simple words:** `null` means "I set it to nothing". `undefined` means "not provided".
:::

:::qa How do you omit a property from an object immutably? {level=medium}
**Say this:** "Destructure it out with rest: `const { skip, ...others } = obj;`. `others` is a shallow copy without `skip`."

**In simple words:** Take the one you do not want out, keep the rest.
:::

```quiz
? What does `const [a, , b] = [1, 2, 3]` give?
- a = 1, b = 2
+ a = 1, b = 3
- a = 2, b = 3
> The comma skips the middle item.
? In `{ ...{ a: 1 }, ...{ a: 2 } }`, what is a?
- 1
+ 2
- [1, 2]
> Later properties win.
? Is `{ ...obj }` a deep copy?
- Yes
+ No, nested objects are shared
- Only in modules
> Use structuredClone for deep copies.
```

:::keypoints
- **Destructuring**: arrays by position, objects by name; supports defaults, rename, nesting, skipping and **rest**.
- Best use: **function parameters** with defaults and `= {}`.
- **Rest** collects (patterns); **spread** expands (expressions). Same `...`.
- Spread copies are **shallow**; later keys **override**; null/undefined spread is ignored in objects.
- Destructuring `null`/`undefined` throws; defaults apply only to `undefined`.
:::
