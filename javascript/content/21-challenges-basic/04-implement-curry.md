---
title: Implement curry and partial
level: easy
time: 20
summary: Write curry(fn) that works with fn.length, allows several arguments per call, and add partial application with placeholders.
---

:::problem Implement curry {level=easy tags="functions,closures,currying"}
Write `curry(fn)` so that a function of N arguments can be called as `f(a)(b)(c)`, `f(a, b)(c)`, `f(a)(b, c)` or `f(a, b, c)`.

```js
const add = curry((a, b, c) => a + b + c);
add(1)(2)(3);    // 6
add(1, 2)(3);    // 6
add(1)(2, 3);    // 6
```

Then write `partial(fn, ...fixed)` that pre-fills the **first** arguments, and extend `curry` to accept a **placeholder** `_` to skip an argument: `f(_, 2)(1)` is `f(1, 2)`.

:::hint Hint
Use `fn.length` to know how many arguments are needed. Collect arguments across calls; when enough have been collected, call `fn`.
:::
:::

## Solution and tests

```js run title="curry, partial and placeholders, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

function curry(fn, arity = fn.length) {
  return function curried(...args) {
    if (args.length >= arity) return fn.apply(this, args);           // enough: run it
    return function (...more) { return curried.apply(this, [...args, ...more]); };   // not enough: wait for more
  };
}

const partial = (fn, ...fixed) => (...rest) => fn(...fixed, ...rest);

const _ = Symbol("placeholder");
function curryP(fn, arity = fn.length) {
  return function curried(...args) {
    const complete = args.length >= arity && !args.slice(0, arity).includes(_);
    if (complete) return fn.apply(this, args);
    return function (...next) {
      const merged = [...args];
      let n = 0;
      for (let i = 0; i < merged.length && n < next.length; i++) if (merged[i] === _) merged[i] = next[n++];   // fill the holes first
      return curried.apply(this, [...merged, ...next.slice(n)]);                                                  // then append the rest
    };
  };
}

// ---------------- tests ----------------
const add3 = (a, b, c) => a + b + c;

test("all call shapes give the same result", () => {
  const f = curry(add3);
  assert.equal(f(1)(2)(3), 6);
  assert.equal(f(1, 2)(3), 6);
  assert.equal(f(1)(2, 3), 6);
  assert.equal(f(1, 2, 3), 6);
});

test("partial results can be reused", () => {
  const addTen = curry(add3)(10);
  assert.equal(addTen(1)(2), 13);
  assert.equal(addTen(5, 5), 20);
});

test("keeps this", () => {
  const o = { base: 100, add: curry(function (a, b) { return this.base + a + b; }) };
  assert.equal(o.add(1)(2), 103);
});

test("explicit arity for functions with default or rest parameters", () => {
  const sum = (...nums) => nums.reduce((a, b) => a + b, 0);
  assert.equal(sum.length, 0);
  assert.equal(curry(sum, 3)(1)(2)(3), 6);
});

test("partial pre-fills the first arguments", () => {
  assert.equal(partial(add3, 1, 2)(3), 6);
  assert.equal(partial(Math.max, 5)(1, 9), 9);
});

test("placeholders skip arguments", () => {
  const f = curryP((a, b, c) => [a, b, c].join("-"));
  assert.equal(f(_, "b")("a", "c"), "a-b-c");
  assert.equal(f(_, _, "c")("a")("b"), "a-b-c");
  assert.equal(f("a")(_, "c")("b"), "a-b-c");
});

// an infinite-currying puzzle: sum(1)(2)(3)() === 6
const sum = (a) => (b) => (b === undefined ? a : sum(a + b));
test("sum(1)(2)(3)() puzzle", () => assert.equal(sum(1)(2)(3)(), 6));
```

## Interview follow-ups

:::qa Why does `curry` need `fn.length`, and when does it fail? {level=medium}
**Say this:** "It tells curry how many arguments the function wants. It does not count parameters with defaults or rest parameters, so the function would run too early; pass the arity explicitly."

**In simple words:** The function lies about how many arguments it needs.
:::

:::qa What is the difference between currying and partial application? {level=easy}
**Say this:** "Currying turns `f(a, b, c)` into a chain of unary-style calls; partial application fixes some arguments now and returns a function for the rest."

**In simple words:** Curry takes arguments one step at a time; partial pre-fills some.
:::

:::qa How would you handle `this` in a curried function? {level=hard}
**Say this:** "Forward it with `apply` in each step (`curried.apply(this, ...)`), so methods keep working when curried."

**In simple words:** Pass the context along each hop.
:::

:::keypoints
- **curry**: collect args across calls until `args.length >= fn.length`, then call `fn`; allow several args per call.
- Pass an **explicit arity** for rest/default parameters; forward **`this`**.
- **partial** = pre-fill; **placeholder** = fill the holes first, then append.
:::
