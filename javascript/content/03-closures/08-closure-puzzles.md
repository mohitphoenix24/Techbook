---
title: Closure output puzzles
level: advanced
time: 30
summary: Ten classic closure and scope puzzles with answers and reasons. Predict first, then run. This is practice for the output-prediction round.
---

For each puzzle: **write your answer first**, then press Run, then read the reason. If you got it wrong, change the code and guess again.

## Puzzle 1: the counter that is not shared

```js run title="Puzzle 1"
function counter() {
  let c = 0;
  return () => ++c;
}

const a = counter();
const b = counter();
console.log(a(), a(), b(), a());
```

:::hint Show the reason
each call to `counter()` makes its own `c`. `a` and `b` do not share. `a` goes 1, 2, then 3; `b` is 1.
:::

## Puzzle 2: the shared counter

```js run title="Puzzle 2"
let c = 0;
function counter() {
  return () => ++c;
}

const a = counter();
const b = counter();
console.log(a(), a(), b(), a());
```

:::hint Show the reason
now `c` is a **global** variable. Both closures use the same one, so the numbers keep growing: 1, 2, 3, 4.
:::

## Puzzle 3: value or variable?

```js run title="Puzzle 3"
function make() {
  let x = 1;
  const get = () => x;
  x = 2;
  return get;
}
console.log(make()());
```

:::hint Show the reason
`get` holds the variable, not the value `1`. By the time it runs, `x` is `2`.
:::

## Puzzle 4: var in a loop

```js run title="Puzzle 4"
const fns = [];
for (var i = 0; i < 3; i++) {
  fns[i] = function () { return i * 10; };
}
console.log(fns[0](), fns[1](), fns[2]());
```

:::hint Show the reason
one shared `i`, final value 3: `30 30 30`.
:::

## Puzzle 5: let in a loop

```js run title="Puzzle 5"
const fns = [];
for (let i = 0; i < 3; i++) {
  fns[i] = function () { return i * 10; };
}
console.log(fns[0](), fns[1](), fns[2]());
```

:::hint Show the reason
a new `i` per round: `0 10 20`.
:::

## Puzzle 6: same name, inner wins

```js run title="Puzzle 6"
const name = "global";

function outer() {
  const name = "outer";
  function inner() {
    return name;
  }
  return inner;
}

const fn = outer();
console.log(fn());
```

:::hint Show the reason
lexical scope: `inner` was written inside `outer`, so it sees `"outer"`. It does not matter where `fn` is called.
:::

## Puzzle 7: closure over a parameter

```js run title="Puzzle 7"
function adder(x) {
  return function (y) {
    x = x + y;
    return x;
  };
}

const add5 = adder(5);
console.log(add5(1), add5(1), add5(10));
```

:::hint Show the reason
the parameter `x` is a local variable that the closure **changes**. `5+1=6`, `6+1=7`, `7+10=17`.
:::

## Puzzle 8: delayed read

```js run title="Puzzle 8"
function test() {
  let message = "A";
  setTimeout(() => console.log(message), 0);
  message = "B";
  return "done";
}

console.log(test());
```

:::hint Show the reason
`test()` returns `"done"` first (printed by the outer `console.log`), then the timer prints the **current** `message`, which is `"B"`.
:::

## Puzzle 9: IIFE keeps its own copy

```js run title="Puzzle 9"
var result = [];
for (var i = 0; i < 3; i++) {
  result.push((function (n) {
    return () => n;
  })(i));
}
console.log(result.map((f) => f()));
```

:::hint Show the reason
the IIFE gets a copy of the current `i` in its parameter `n`: `[0, 1, 2]`.
:::

## Puzzle 10: two closures, one variable, which one first?

```js run title="Puzzle 10"
function pair() {
  let value = 0;
  return {
    inc: () => { value++; return value; },
    read: () => value,
  };
}

const p = pair();
const q = pair();
p.inc(); p.inc(); q.inc();
console.log(p.read(), q.read());
```

:::hint Show the reason
`p.inc` and `p.read` share one `value`. `q` has its own. So: `2 1`.
:::

## Bonus: the one that trips seniors

```js run title="Bonus: a closure in a class field vs a method"
class Counter {
  count = 0;
  incArrow = () => { this.count++; };           // a closure over `this`, created per instance
  incMethod() { this.count++; }                 // a normal method on the prototype
}

const c = new Counter();
const { incArrow, incMethod } = c;              // detach both

incArrow();                                     // works: `this` is captured
try {
  incMethod();                                  // `this` is undefined here
} catch (e) {
  console.log(e.name + ": " + e.message);
}
console.log(c.count);
```

:::hint Show the reason
the arrow function in the class field closes over `this` (the instance), so it still works when detached. The method needs `this` from the call, and gets `undefined`. This is why React class components bind handlers in the constructor, or use arrow fields.
:::

:::keypoints
- Closures keep **variables**, not copies of values.
- One call of the outer function = one environment. Separate calls do not share.
- `var` in a loop = shared; `let` in a loop = a new variable per round.
- Lexical scope: the **written** position decides, not the place of the call.
- Arrow functions close over `this` as well.
:::
