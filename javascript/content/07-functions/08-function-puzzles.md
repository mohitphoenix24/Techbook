---
title: Function output puzzles
level: advanced
time: 25
summary: Ten puzzles on hoisting of functions, default parameters, arguments, closures in callbacks, currying and the parseInt trap. Predict, run, read the reason.
---

## Puzzle 1: two functions, same name

```js run sloppy title="Puzzle 1"
function f() { return "first"; }
console.log(f());
function f() { return "second"; }
```

:::hint Show the reason
Both declarations are hoisted and the **later** one wins, before any line runs. Output: `second`.
:::

## Puzzle 2: function expression vs declaration

```js run title="Puzzle 2"
console.log(typeof a, typeof b);

function a() {}
var b = function () {};
```

:::hint Show the reason
`a` is hoisted with its body: `function`. `b` is a `var`, hoisted as `undefined`: `undefined`. Output: `function undefined`.
:::

## Puzzle 3: default parameter order

```js run title="Puzzle 3"
function f(a, b = a + 1, c = b + 1) { return [a, b, c]; }

console.log(f(1), f(1, 5), f(1, undefined, 0), f(1, null));
```

:::hint Show the reason
Defaults apply for `undefined` only, left to right. `f(1)` → `[1, 2, 3]`. `f(1, 5)` → `[1, 5, 6]`. `f(1, undefined, 0)` → `[1, 2, 0]`. `f(1, null)` → b is `null`, so `c = null + 1 = 1` → `[1, null, 1]`.
:::

## Puzzle 4: arguments length

```js run title="Puzzle 4"
function f(a, b, c) {}
function g(a, b = 2, c) {}
function h(...args) {}

console.log(f.length, g.length, h.length);
console.log((function () { return arguments.length; })(1, 2, 3, 4));
```

:::hint Show the reason
`length` counts parameters before the first default or rest: `3 1 0`. `arguments.length` counts what was **passed**: `4`.
:::

## Puzzle 5: mutating an argument

```js run title="Puzzle 5"
function update(obj, arr, str) {
  obj.a = 2;
  arr.push(4);
  str += "!";
  obj = { a: 100 };
}

const o = { a: 1 }, a = [1, 2, 3], s = "hi";
update(o, a, s);
console.log(o, a, s);
```

:::hint Show the reason
The object and the array are mutated (shared references). The string is a primitive: `str += "!"` changes only the local copy. Re-assigning `obj` inside does not affect the caller's variable. Output: `{ a: 2 } [ 1, 2, 3, 4 ] hi`.
:::

## Puzzle 6: the parseInt trap

```js run title="Puzzle 6"
console.log(["10", "10", "10"].map(parseInt));
console.log(["1", "2", "3"].map(Number));
```

:::hint Show the reason
`map` passes `(value, index)`, so `parseInt("10", 0)` → 10, `parseInt("10", 1)` → NaN (radix 1 is invalid), `parseInt("10", 2)` → 2. Output: `[ 10, NaN, 2 ]` and `[ 1, 2, 3 ]`.
:::

## Puzzle 7: IIFE and var

```js run sloppy title="Puzzle 7"
var x = 1;
(function () {
  console.log(x);
  var x = 2;
})();
console.log(x);
```

:::hint Show the reason
Inside the IIFE, `var x` is hoisted and shadows the outer `x`, so the first log sees `undefined`. The outer `x` is untouched: `1`. Output: `undefined` then `1`.
:::

## Puzzle 8: closures in a map callback

```js run title="Puzzle 8"
const fns = [1, 2, 3].map((n) => () => n * 10);
console.log(fns.map((f) => f()));

function makeAdders() {
  var adders = [];
  for (var i = 0; i < 3; i++) adders.push((x) => x + i);
  return adders;
}
console.log(makeAdders().map((add) => add(10)));
```

:::hint Show the reason
The first: every `n` is a separate parameter: `[ 10, 20, 30 ]`. The second: one shared `var i`, final value 3: `[ 13, 13, 13 ]`.
:::

## Puzzle 9: curry

```js run title="Puzzle 9"
const curry = (fn) => function c(...a) { return a.length >= fn.length ? fn(...a) : (...b) => c(...a, ...b); };

const add3 = (x, y, z) => x + y + z;
const add3c = curry(add3);

console.log(add3c(1)(2)(3), add3c(1, 2)(3), add3c(1)(2, 3), typeof add3c(1, 2));
```

:::hint Show the reason
Every form collects three numbers and runs `add3`: `6 6 6`. With only two arguments, it returns a function: `function`.
:::

## Puzzle 10: function name and name inference

```js run title="Puzzle 10"
const a = function () {};
const b = function named() {};
const obj = { method() {}, arrow: () => {}, ["comp" + "uted"]: function () {} };

console.log(a.name, b.name, obj.method.name, obj.arrow.name, obj.computed.name);
console.log((() => {}).name === "", (function () {}).name === "");
```

:::hint Show the reason
Names are inferred from the variable or property name when a function is assigned: `a`, `named`, `method`, `arrow`, `computed`. An anonymous function not assigned to anything has name `""`: `true true`.
:::

:::keypoints
- Function **declarations** are hoisted with their body; later duplicates win.
- Defaults apply on `undefined` only. `fn.length` skips defaults and rest. `arguments.length` counts passed arguments.
- Objects and arrays are shared through parameters; **re-assigning** the parameter is local.
- `map(parseInt)` passes the index as radix: `map(Number)` is safe.
- A `var` in a loop shares one variable; a `map` callback parameter does not.
:::
