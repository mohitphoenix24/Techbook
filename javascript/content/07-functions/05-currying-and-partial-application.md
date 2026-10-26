---
title: Currying and partial application
level: intermediate
time: 25
summary: What currying is (and how it differs from partial application), how to write a generic curry function, uses in real code, and the interview traps (fn.length, placeholders).
---

## Currying in one sentence

> "**Currying** turns a function that takes **many arguments at once** into a chain of functions that take **one argument at a time**."

```js run title="add(1, 2, 3) becomes add(1)(2)(3)"
const add = (a, b, c) => a + b + c;                 // normal
const addCurried = (a) => (b) => (c) => a + b + c;  // curried

console.log(add(1, 2, 3));
console.log(addCurried(1)(2)(3));

const addTen = addCurried(10);                       // pre-fill the first argument
const addTenAndTwenty = addTen(20);                  // pre-fill the second
console.log(addTenAndTwenty(5));
```

:::analogy A coffee order, step by step
A normal function is one big order slip: "large, oat milk, no sugar". A curried function is the barista asking one question at a time: size first, then milk, then sugar. After each answer, you hold a more specific order.
:::

## Currying vs partial application

They are related and often mixed up:

| | Currying | Partial application |
|---|---|---|
| What | A function of N args becomes N nested functions of **one** arg each | Fix **some** args now, get a function for the rest |
| Result | A chain: `f(a)(b)(c)` | One function: `g(c)` after `partial(f, a, b)` |
| Args per call | Exactly one (strictly) | Any number |

```js run title="Partial application with bind and a helper"
function discount(rate, price) { return price - (price * rate) / 100; }

const tenOff = discount.bind(null, 10);             // partial application with bind
const partial = (fn, ...first) => (...rest) => fn(...first, ...rest);
const twentyOff = partial(discount, 20);

console.log(tenOff(500), twentyOff(500));
```

## A generic `curry` function (a favourite interview task)

The trick: use `fn.length` (the number of expected parameters). Collect arguments until you have enough, then call the original.

```js run title="curry(fn)"
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) {
      return fn.apply(this, args);                   // enough arguments: run it
    }
    return (...more) => curried.apply(this, [...args, ...more]);   // not yet: wait for more
  };
}

const volume = curry((l, w, h) => l * w * h);

console.log(volume(2)(3)(4));
console.log(volume(2, 3)(4));
console.log(volume(2)(3, 4));
console.log(volume(2, 3, 4));
```

This version lets you pass **several arguments at a time** (flexible currying), which is what lodash's `_.curry` does.

### The `fn.length` trap

`fn.length` does not count **default** or **rest** parameters. So currying such functions needs an explicit arity:

```js run title="Pass the arity when length is not reliable"
function curryN(fn, arity = fn.length) {
  return function curried(...args) {
    return args.length >= arity ? fn(...args) : (...more) => curried(...args, ...more);
  };
}

function sum(...nums) { return nums.reduce((a, b) => a + b, 0); }
console.log(sum.length);                              // 0: rest parameters are not counted

const sum3 = curryN(sum, 3);
console.log(sum3(1)(2)(3));
```

## Why is currying useful?

### 1. Configure once, reuse often

```js run title="Specialised functions from a general one"
const log = (level) => (module) => (message) => `[${level}] [${module}] ${message}`;

const error = log("ERROR");
const authError = error("auth");
const dbError = error("db");

console.log(authError("invalid token"));
console.log(dbError("connection lost"));
```

### 2. Fit functions into pipelines and array methods

`map` passes **one** value to your function. A curried function with the config applied first fits perfectly.

```js run title="Curried helpers with map and filter"
const greaterThan = (limit) => (n) => n > limit;
const multiplyBy = (factor) => (n) => n * factor;
const prop = (key) => (obj) => obj[key];

const users = [{ name: "Asha", age: 25 }, { name: "Ravi", age: 17 }, { name: "Meera", age: 32 }];

console.log(users.map(prop("name")));
console.log(users.map(prop("age")).filter(greaterThan(18)).map(multiplyBy(2)));
```

### 3. Reusable event and API helpers

```js run title="A curried handler factory"
const handle = (action) => (id) => (event) => `${action} on item ${id} via ${event}`;

const deleteHandler = handle("delete");
console.log(deleteHandler(7)("click"));
console.log(deleteHandler(9)("keypress"));
```

In React you see this as `onClick={handleClick(id)}` returning a function.

## Placeholders (a more advanced curry)

Some libraries allow skipping arguments using a placeholder `_`.

```js run title="curry with a placeholder"
const _ = Symbol("placeholder");

function curryWithPlaceholder(fn, arity = fn.length) {
  return function curried(...args) {
    const filled = args.slice(0, arity);
    if (filled.length >= arity && !filled.includes(_)) return fn(...filled);
    return (...next) => {
      const merged = [];
      let n = 0;
      for (const a of args) merged.push(a === _ && n < next.length ? next[n++] : a);   // fill holes first
      return curried(...merged, ...next.slice(n));
    };
  };
}

const divide = curryWithPlaceholder((a, b) => a / b);
const tenOver = divide(10);
const overTwo = divide(_, 2);

console.log(tenOver(2), overTwo(10));
```

## Infinite currying: `sum(1)(2)(3)()`

A popular puzzle: a function that keeps collecting until you call it with no arguments.

```js run title="sum(1)(2)(3)() = 6"
function sum(a) {
  return function next(b) {
    return b === undefined ? a : sum(a + b);
  };
}
console.log(sum(1)(2)(3)(4)());
```

A version that uses `valueOf` so it can be used like a number:

```js run title="A curried sum that converts to a number"
function add(a) {
  const next = (b) => add(a + b);
  next.valueOf = () => a;
  next.toString = () => String(a);
  return next;
}

console.log(+add(1)(2)(3), `${add(10)(5)}`, add(1)(2) + 3);
```

:::interview What is currying? How is it different from partial application? Write a curry function.
"Currying converts a function of several arguments into a sequence of functions that each take one argument, so `f(a, b, c)` becomes `f(a)(b)(c)`. Partial application fixes some arguments now and returns a function that takes the rest, in any number of arguments. A generic `curry` collects arguments until `args.length >= fn.length`, then calls the original function. The `fn.length` approach does not count default and rest parameters, so for those I pass the arity explicitly. Currying is useful for configuring functions once and for fitting them into pipelines and `map`/`filter` callbacks."
:::

## More interview questions on this topic

:::qa What is the difference between currying and partial application? {level=medium}
**Say this:** "Currying makes a chain of single-argument functions. Partial application pre-fills any number of arguments and gives a function for the rest."

**In simple words:** Curry: one at a time, always. Partial: "some now, the rest later".
:::

:::qa How does a generic `curry` know when to stop collecting arguments? {level=medium}
**Say this:** "It compares the number of collected arguments with `fn.length`, the declared parameter count. When enough have arrived, it calls the original function."

**In simple words:** It counts how many the function wants.
:::

:::qa Why does currying fail with default or rest parameters? {level=hard}
**Say this:** "`fn.length` excludes parameters from the first default value and excludes rest parameters, so the curried function would run too early. Pass the arity explicitly."

**In simple words:** The function lies about how many it needs, so we must tell it.
:::

:::qa Give a practical use of currying. {level=easy}
**Say this:** "Creating specialised helpers like a logger with a fixed level, or `prop('name')` to use with `map`, or event handlers that remember an id."

**In simple words:** Set up once, use many times.
:::

```quiz
? What does `curry((a, b, c) => a + b + c)(1)(2)(3)` return?
- A function
+ 6
- NaN
> After three arguments the original function runs.
? What is `((a, b = 1) => {}).length`?
- 2
+ 1
- 0
> Parameters from the first default value are not counted.
? Which gives one function with some arguments fixed?
- Currying
+ Partial application
- Memoization
> bind does partial application.
```

:::keypoints
- **Currying**: `f(a, b, c)` → `f(a)(b)(c)`. **Partial application**: fix some arguments now.
- Generic `curry`: collect until `args.length >= fn.length`.
- `fn.length` ignores defaults and rest: pass an explicit arity.
- Useful for configured helpers and for fitting `map`/`filter`/pipelines.
- Classic puzzle: `sum(1)(2)(3)()` and `valueOf` tricks.
:::
