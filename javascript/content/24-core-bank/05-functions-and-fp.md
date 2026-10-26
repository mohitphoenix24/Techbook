---
title: "Core bank: functions and functional programming"
level: medium
time: 25
summary: Twelve answers on first-class and higher-order functions, pure functions, currying, composition, recursion, default and rest parameters, arguments and arrow-versus-regular differences.
---

:::qa What does "functions are first-class" mean? {level=easy}
**Say this:** "Functions are values. You can store them in variables, pass them as arguments, return them from other functions and put them in objects and arrays."

**In simple words:** A function can travel around like a number or a string.
:::

:::qa What is a higher-order function? {level=easy}
**Say this:** "A function that takes a function as an argument, returns a function, or both. `map`, `filter`, `reduce`, `setTimeout`, and any decorator like `debounce(fn)` are examples."

**In simple words:** A function that works with other functions.
:::

:::qa What is a pure function and why do we like it? {level=easy}
**Say this:** "It returns the same output for the same input and has no side effects: no changing outside variables, no I/O, no mutation of arguments. Pure functions are easy to test, cache, reason about and run in any order."

**In simple words:** Like a calculator: same keys, same answer, nothing else changes.
:::

:::qa What is currying, and how is it different from partial application? {level=medium}
**Say this:** "Currying turns `f(a, b, c)` into `f(a)(b)(c)`: a chain of functions each taking one argument. Partial application fixes some arguments now and returns a function for the rest. Both use closures."

**In simple words:** Curry takes arguments one at a time; partial pre-fills some.
:::

:::qa What is function composition? {level=medium}
**Say this:** "Combining small functions so the output of one is the input of the next. `compose(f, g)(x)` is `f(g(x))`; `pipe(f, g)(x)` is `g(f(x))`. It builds complex behaviour from simple tested parts."

**In simple words:** An assembly line of small steps.
:::

:::qa How do default, rest and spread work? {level=easy}
**Say this:** "Default parameters (`function f(a = 1)`) apply when the argument is `undefined` (not for `null`). Rest (`...args`) collects the remaining arguments into a real array. Spread (`f(...arr)`, `[...a, ...b]`, `{...o}`) expands an iterable or object into place."

**In simple words:** Defaults fill gaps, rest gathers the leftovers, spread unpacks a bag.
:::

:::qa What is `arguments`, and why prefer rest parameters? {level=medium}
**Say this:** "`arguments` is an array-like object available in regular functions (not arrows). It is not a real array and behaves oddly in sloppy mode. Rest parameters give a real array, work in arrows, and make the signature clear."

**In simple words:** `arguments` is an old, awkward tool; rest is the clean replacement.
:::

:::qa Arrow function versus regular function: what are all the differences? {level=medium}
**Say this:** "Arrows have no own `this`, no `arguments`, no `super`, no `new.target`; cannot be used as constructors with `new`; have no `prototype`; and cannot be generators. Regular functions have all of these and are hoisted when declared."

**In simple words:** Arrows are lighter and borrow from outside; regular functions carry their own identity.
:::

:::qa How does recursion work, and what is its risk in JavaScript? {level=medium}
**Say this:** "A function calls itself with a smaller problem until a base case stops it. Each call uses a stack frame, so very deep recursion overflows the stack. JavaScript engines (except Safari) do not do tail-call optimisation, so convert deep recursion to a loop or use an explicit stack."

**In simple words:** Always know when to stop, and do not go ten thousand levels deep.
:::

:::qa What is the difference between `map`, `forEach`, `filter` and `reduce`? {level=easy}
**Say this:** "`forEach` runs a function for each item and returns nothing. `map` returns a new array of results. `filter` returns a new array of items that pass a test. `reduce` folds the array into one value. Use `map`/`filter`/`reduce` when you want a result, `forEach` for side effects."

**In simple words:** Do something, transform everything, keep some, or combine all.
:::

:::qa What is memoization? {level=easy}
**Say this:** "Caching the result of a function by its arguments so repeated calls are fast. It only works safely for pure functions, and you need a key strategy and a size limit to avoid a memory leak."

**In simple words:** Write the answer down the first time, and look it up next time.
:::

:::qa What does `fn.length` return, and what does it ignore? {level=hard}
**Say this:** "The number of declared parameters before the first default or rest parameter. So `(a, b = 1, ...c) => {}` has length 1. Currying helpers that rely on `length` break for such functions."

**In simple words:** It counts only the plain parameters at the front.
:::

:::keypoints
- **First-class + higher-order** functions are the core of JavaScript style.
- **Pure** functions → testable, cacheable.
- **Curry** (one at a time) vs **partial** (pre-fill); **compose/pipe** chain functions.
- Arrow ≠ regular: no `this`, `arguments`, `new`, `prototype`.
- Deep recursion → stack overflow; no TCO outside Safari.
:::
