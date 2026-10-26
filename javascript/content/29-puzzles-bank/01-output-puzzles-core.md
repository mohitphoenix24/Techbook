---
title: "Puzzles: scope, closures and types"
level: medium
time: 30
summary: Thirteen "what does this print?" puzzles on hoisting, the temporal dead zone, loops and closures, coercion, equality, sorting, object keys and references. Write your answer first, then press Run.
---

**How to use this page.** Cover the output, write your answer on paper, then press **Run**. Open the hint only after you have committed to an answer. A wrong guess teaches more than a right one.

## Puzzle 1: what is hoisted?

```js run title="Puzzle 1"
console.log(typeof hoisted, typeof notHoisted);
function hoisted() {}
var notHoisted = function () {};
```

:::hint Show the reason
Function declarations are hoisted with their body, so `typeof hoisted` is `'function'`. `var notHoisted` is hoisted as `undefined`; the function is assigned only when the line runs. Output: `function undefined`.
:::

## Puzzle 2: the temporal dead zone

```js run title="Puzzle 2"
try { console.log(a); } catch (e) { console.log(e.name); }
let a = 1;
try { console.log(typeof b); } catch (e) { console.log(e.name); }
let b = 2;
```

:::hint Show the reason
`let` variables exist from the start of the block but are uninitialised until their line (the TDZ). Reading them throws a `ReferenceError`, and even `typeof` throws. Output: `ReferenceError` twice.
:::

## Puzzle 3: closures in loops

```js run title="Puzzle 3"
const fns = [];
for (var i = 0; i < 3; i++) fns.push(() => i);
console.log(fns.map((f) => f()));

const gns = [];
for (let j = 0; j < 3; j++) gns.push(() => j);
console.log(gns.map((f) => f()));
```

:::hint Show the reason
`var i` is one variable shared by all closures; after the loop it is `3`. `let j` creates a fresh binding for every iteration, so each closure keeps its own. Output: `[ 3, 3, 3 ]` and `[ 0, 1, 2 ]`.
:::

## Puzzle 4: independent counters

```js run title="Puzzle 4"
function makeCounter() { let n = 0; return () => ++n; }
const a = makeCounter(), b = makeCounter();
console.log(a(), a(), b(), a());
```

:::hint Show the reason
Each call of `makeCounter` creates a new `n`. `a` and `b` have separate counters. Output: `1 2 1 3`.
:::

## Puzzle 5: shadowing and hoisting together

```js run title="Puzzle 5"
var x = "global";
function test() {
  console.log(x);
  var x = "local";
  console.log(x);
}
test();
```

:::hint Show the reason
Inside `test`, `var x` is hoisted to the top of the function and starts as `undefined`; it shadows the outer `x` for the whole function. The first log prints `undefined`, the second `local`.
:::

## Puzzle 6: plus and minus

```js run title="Puzzle 6"
console.log([[] + [], [] + {}, 1 + "2", "3" - 1, true + 1, null + 1, undefined + 1]);
```

:::hint Show the reason
`[] + []` is `''` (both become empty strings). `[] + {}` is `'[object Object]'`. `1 + "2"` is the string `'12'` because `+` concatenates if one side is a string. `"3" - 1` is `2` because `-` is always numeric. `true + 1` is `2`. `null + 1` is `1` (`null` becomes 0). `undefined + 1` is `NaN`.
:::

## Puzzle 7: loose equality

```js run title="Puzzle 7"
console.log(null == undefined, null === undefined, NaN == NaN, [1] == 1, "1" == 1, 0 == "", "0" == false);
```

:::hint Show the reason
`null == undefined` is `true` (special rule), `null === undefined` is `false`. `NaN` is never equal to itself. `[1] == 1`: the array becomes `'1'`, then `1`: `true`. `"1" == 1` is `true`. `0 == ""` is `true` (both become 0). `"0" == false`: `false` becomes 0, `"0"` becomes 0: `true`. Output: `true false false true true true true`.
:::

## Puzzle 8: typeof

```js run title="Puzzle 8"
console.log(typeof null, typeof undefined, typeof [], typeof function () {}, typeof NaN, typeof Symbol(), typeof 10n);
```

:::hint Show the reason
`typeof null` is `'object'` (a historical bug), arrays are `'object'`, functions are `'function'`, `NaN` is a `'number'`. Output: `object undefined object function number symbol bigint`.
:::

## Puzzle 9: sort and parseInt

```js run title="Puzzle 9"
console.log([10, 9, 1, 100].sort());
console.log(["10", "10", "10"].map(parseInt));
```

:::hint Show the reason
The default `sort` compares as strings: `'1' < '10' < '100' < '9'`, so `[ 1, 10, 100, 9 ]`. `map` passes `(value, index)`, and `parseInt(value, radix)` uses the index as the radix: `parseInt('10', 0)` is 10, `parseInt('10', 1)` is `NaN`, `parseInt('10', 2)` is 2. Output: `[ 10, NaN, 2 ]`.
:::

## Puzzle 10: object keys

```js run title="Puzzle 10"
const o = { b: 1, 2: "two", a: 2, 1: "one" };
console.log(Object.keys(o));

const key1 = {}, key2 = { x: 1 };
const map = {};
map[key1] = "a";
map[key2] = "b";
console.log(Object.keys(map), map[{}]);
```

:::hint Show the reason
Integer-like keys come first in ascending order, then string keys in insertion order: `[ '1', '2', 'b', 'a' ]`. Using objects as keys converts them to the string `'[object Object]'`, so both writes hit the same key, and `map[{}]` also reads it: `[ '[object Object]' ] 'b'`. Use a `Map` for object keys.
:::

## Puzzle 11: arguments and default parameters

```js run title="Puzzle 11"
function f(a, b = 2) { arguments[0] = 99; return [a, b, arguments.length]; }
console.log(f(1), f(1, undefined), f());
```

:::hint Show the reason
With default parameters (a non-simple parameter list) `arguments` is not linked to the parameters, so `a` stays `1`. `arguments.length` counts what was passed, even `undefined`. Defaults apply to `undefined`. Output: `[ 1, 2, 1 ] [ 1, 2, 2 ] [ undefined, 2, 0 ]`.
:::

## Puzzle 12: the chained assignment

```js run title="Puzzle 12"
let a = { n: 1 };
let b = a;
a.x = a = { n: 2 };
console.log(a.x, b.x, b.n);
```

:::hint Show the reason
In `a.x = a = {...}`, the left-hand reference `a.x` is resolved first, pointing to the **old** object. Then `a` is reassigned to the new object, and that new object is stored in the old object's `x`. So `a.x` is `undefined` (the new object has no `x`), `b.x` is `{ n: 2 }`, `b.n` is `1`.
:::

## Puzzle 13: freeze is shallow

```js run title="Puzzle 13"
const o = Object.freeze({ a: 1, inner: { b: 1 } });
try { o.a = 2; } catch (e) { console.log(e.constructor.name); }
o.inner.b = 2;
console.log(o);
```

:::hint Show the reason
In strict code, writing to a frozen property throws a `TypeError` (in sloppy mode it silently fails). `freeze` is shallow, so the nested object can still change. Output: `TypeError` then `{ a: 1, inner: { b: 2 } }`.
:::

:::keypoints
- Hoisting: **functions fully, `var` as undefined, `let/const/class` in the TDZ**.
- `var` shares one variable; `let` makes one per iteration.
- `+` may join strings; `-` is maths; use `===` and `Number.isNaN`.
- `sort()` is by string; `map(parseInt)` is a trap; integer keys come first.
- `freeze` is shallow.
:::
