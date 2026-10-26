---
title: Recursion, memoized recursion and trampolines
level: intermediate
time: 25
summary: How recursion works on the call stack, base and recursive cases, classic examples (factorial, fibonacci, flatten, tree walk), memoization, stack overflow and how to avoid it with loops, explicit stacks and trampolines.
---

## What is recursion?

A function that **calls itself** to solve a smaller version of the same problem. Every recursive function needs:

1. A **base case**: when to stop.
2. A **recursive case**: call yourself with a **smaller** input.

:::analogy Russian dolls
To find the smallest doll, open the doll. If you find another doll inside, repeat. If it is solid, stop: that is the base case.
:::

```js run title="factorial and sum of a list"
function factorial(n) {
  if (n <= 1) return 1;              // base case
  return n * factorial(n - 1);       // recursive case
}

function sumList([head, ...tail]) {
  if (head === undefined) return 0;  // base case: empty list
  return head + sumList(tail);
}

console.log(factorial(5), sumList([1, 2, 3, 4]));
```

## Where recursion shines: nested data

For **trees and nested structures**, recursion is the natural tool.

```js run title="Flatten a deeply nested array"
function flatten(arr) {
  const result = [];
  for (const item of arr) {
    if (Array.isArray(item)) result.push(...flatten(item));    // go deeper
    else result.push(item);
  }
  return result;
}

console.log(flatten([1, [2, [3, [4, 5]], 6], 7]));
console.log([1, [2, [3, [4, 5]], 6], 7].flat(Infinity));        // built in
```

```js run title="Walk a tree (a folder structure)"
const fs = {
  name: "root",
  children: [
    { name: "src", children: [{ name: "index.js" }, { name: "app.js" }] },
    { name: "README.md" },
  ],
};

function printTree(node, depth = 0) {
  console.log("  ".repeat(depth) + node.name);
  (node.children || []).forEach((child) => printTree(child, depth + 1));
}
printTree(fs);

const countFiles = (n) => (n.children ? n.children.reduce((s, c) => s + countFiles(c), 0) : 1);
console.log("files:", countFiles(fs));
```

## Fibonacci: the slow way and the memoized way

```js run title="Naive fibonacci is exponential"
let calls = 0;
function fib(n) {
  calls++;
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

console.log(fib(20), "calls:", calls);
calls = 0;
fib(25);
console.log("calls for fib(25):", calls);          // grows by about 1.6x for each +1
```

The same sub-problems (`fib(3)`, `fib(2)`, ...) are solved again and again. **Memoization** (remember results) turns this into **linear** time.

```js run title="Memoized fibonacci"
function memoFib() {
  const memo = new Map();
  let calls = 0;
  function fib(n) {
    calls++;
    if (n < 2) return n;
    if (memo.has(n)) return memo.get(n);
    const value = fib(n - 1) + fib(n - 2);
    memo.set(n, value);
    return value;
  }
  return { fib, calls: () => calls };
}

const m = memoFib();
console.log(m.fib(50), "calls:", m.calls());       // 50 is huge, but only ~100 calls
```

An iterative version is even simpler and uses constant memory:

```js run title="Iterative fibonacci"
function fibIter(n) {
  let [a, b] = [0, 1];
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
}
console.log(fibIter(50), fibIter(10));
```

## The cost: the call stack

Each recursive call adds a frame to the **call stack**. Very deep recursion causes **stack overflow**.

```js run title="Deep recursion overflows" expect-error
const sumTo = (n) => (n === 0 ? 0 : n + sumTo(n - 1));
console.log(sumTo(100000));
```

JavaScript engines (except Safari) do **not** optimise tail calls, even though the spec allows it. So here are your options:

### Option 1: use a loop

```js run title="Loop instead of recursion"
const sumToLoop = (n) => { let t = 0; for (let i = 1; i <= n; i++) t += i; return t; };
console.log(sumToLoop(100000));
```

### Option 2: an explicit stack (for trees and graphs)

```js run title="DFS with an explicit stack: no recursion limit"
function countNodes(root) {
  const stack = [root];
  let count = 0;
  while (stack.length) {
    const node = stack.pop();
    count++;
    (node.children || []).forEach((c) => stack.push(c));
  }
  return count;
}

// a very deep chain, 50,000 levels
let deep = { children: [] };
let tip = deep;
for (let i = 0; i < 50000; i++) { const next = { children: [] }; tip.children.push(next); tip = next; }

console.log(countNodes(deep));
```

### Option 3: a trampoline

A **trampoline** turns recursion into a loop. The function does **not** call itself. It **returns a thunk** (a function describing the next step), and a small loop runs those thunks one by one. So the stack never grows.

```js run title="A trampoline"
function trampoline(fn) {
  return (...args) => {
    let result = fn(...args);
    while (typeof result === "function") result = result();     // keep bouncing until a real value
    return result;
  };
}

// tail-recursive style: return a thunk instead of calling
const sumToT = (n, acc = 0) => (n === 0 ? acc : () => sumToT(n - 1, acc + n));

const safeSum = trampoline(sumToT);
console.log(safeSum(100000));
console.log(safeSum(1000000));
```

## Mutual recursion

```js run title="isEven / isOdd (and how a trampoline fixes deep cases)"
const isEven = (n) => (n === 0 ? true : isOdd(n - 1));
const isOdd = (n) => (n === 0 ? false : isEven(n - 1));
console.log(isEven(10), isOdd(7));
```

## Recursion or loop?

| Use recursion when | Use a loop (or explicit stack) when |
|---|---|
| Data is a **tree** or nested | Depth could be large (thousands) |
| The problem splits into smaller same-shape problems (divide and conquer, backtracking) | A simple counter or accumulator is enough |
| It makes the code **much clearer** | Performance matters on hot paths |

:::interview What is recursion? What problems does it have in JavaScript and how do you solve them?
"Recursion is a function calling itself on a smaller input until a base case stops it. It is natural for trees and nested data. The problems are stack overflow for deep inputs, since every call adds a stack frame and most engines do not do tail-call optimisation, and repeated work, like in naive fibonacci. I solve them by converting to a loop or an explicit stack, using a trampoline, and by memoizing overlapping sub-problems."
:::

## More interview questions on this topic

:::qa What is a base case and what happens without one? {level=easy}
**Say this:** "The condition that stops the recursion. Without it the function calls itself forever until the stack overflows with a RangeError."

**In simple words:** The "stop" sign of the recursion.
:::

:::qa What is tail call optimisation and does JavaScript support it? {level=hard}
**Say this:** "A call in tail position, `return f(x)`, can reuse the current stack frame. The ES2015 spec requires it, but only Safari implements it. V8 and Firefox do not, so I cannot rely on it."

**In simple words:** In theory, the stack would not grow. In practice, in Chrome and Node it still does.
:::

:::qa What is a trampoline? {level=hard}
**Say this:** "A helper that runs a function repeatedly: the function returns a thunk for the next step instead of calling itself, and the trampoline loop calls the thunks until a non-function value appears. It keeps the stack flat."

**In simple words:** Instead of going deeper, the function bounces back up, and the loop sends it again.
:::

:::qa How does memoization speed up recursion? {level=medium}
**Say this:** "It caches results of calls with the same arguments, so overlapping sub-problems are computed once. Fibonacci goes from exponential to linear time."

**In simple words:** Do not solve the same small problem twice.
:::

```quiz
? What is needed so a recursive function ends?
- A loop
+ A base case that does not call itself
- A closure
> Without it the stack overflows.
? Why is naive recursive fibonacci slow?
- It uses the heap
+ It recomputes the same sub-problems many times
- It uses loops
> That is exponential time.
? How does a trampoline avoid stack overflow?
- By increasing the stack size
+ By returning thunks that a loop runs, so the stack never grows
- By using promises
> The recursion becomes iteration.
```

:::keypoints
- Recursion = **base case** + **smaller recursive call**. Great for **trees** and nested data.
- Costs: **stack depth** and **repeated work**. Fix with **memoization**.
- No reliable tail-call optimisation: use a **loop**, an **explicit stack** or a **trampoline** for deep inputs.
- `flat(Infinity)` flattens nested arrays natively.
:::
