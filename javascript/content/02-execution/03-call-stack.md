---
title: The call stack
level: easy
time: 25
summary: How the stack of execution contexts grows and shrinks as functions are called, how to read a stack trace, what causes "Maximum call stack size exceeded", and how to avoid it.
---

## A stack of plates

A **stack** is like a pile of plates. You can only put a plate on top or take one off the top. The last plate you put is the first you take (**LIFO**: last in, first out).

The **call stack** is a pile of execution contexts.

- When a function is **called**, its context is pushed on top.
- When the function **returns**, its context is popped.
- The function on top is the one that is running **now**.

```js run title="Watch the stack grow and shrink"
function third()  { console.log("  third  runs"); }
function second() { console.log(" second starts"); third(); console.log(" second ends"); }
function first()  { console.log("first starts"); second(); console.log("first ends"); }

first();
```

At the deepest point, the stack looks like this (bottom to top):

```
third()
second()
first()
global
```

When `third` returns, it is popped, then `second` continues, and so on.

## Step by step

Use this simulator to see every push and pop. The code is the same as above.

```viz algo=eventloop title="The call stack for first() -> second() -> third()"
label stack: Call stack
step | stack: global | note: The program starts. The **global context** is on the stack.
step | stack: global, first() | print: first starts | note: `first()` is called. Its context is pushed, and it prints.
step | stack: global, first(), second() | print: second starts | note: `first` calls `second()`. Another context goes on top.
step | stack: global, first(), second(), third() | print: third runs | note: `second` calls `third()`. Now four contexts are on the stack.
step | stack: global, first(), second() | note: `third` has finished. Its context is **popped**. `second` continues.
step | stack: global, first() | print: second ends | note: `second` finishes and is popped.
step | stack: global | print: first ends | note: `first` finishes and is popped. Only the global context is left.
step | stack: - | note: The program ends. The stack is empty.
```

## Stack overflow

The stack has a **limited size**. If functions keep calling without returning, it fills up, and JavaScript throws a `RangeError`.

```js run title="Infinite recursion" expect-error
function forever() {
  return forever();      // no base case: never returns
}

forever();
```

The message is `Maximum call stack size exceeded`. In Chrome and Node the limit is roughly 10,000 to 12,000 calls for a small function, but it depends on how big each frame is.

You can catch it, which is useful for a demo, and then measure the depth:

```js run title="Measure the depth (the exact number depends on the machine)"
let depth = 0;
function dive() { depth++; dive(); }

try {
  dive();
} catch (e) {
  console.log(e instanceof RangeError, e.message);
  console.log("depth is more than 5000:", depth > 5000);
}
```

:::warn Where real stack overflows come from
Not only from silly infinite recursion. Common real causes: recursion on a very long list or a deep tree, two functions that call each other, a `toString` or getter that uses itself, and `JSON.stringify` on a circular structure. Prefer a loop or an explicit stack for deep work.
:::

## A correct recursion needs a base case

```js run title="Recursion with a base case"
function sumTo(n) {
  if (n === 0) return 0;          // base case: stops the calls
  return n + sumTo(n - 1);        // each call waits for the next one
}

console.log(sumTo(5));
```

Here `sumTo(5)` waits for `sumTo(4)`, which waits for `sumTo(3)`, and so on, down to `sumTo(0)`. Then the answers come back up as each context is popped. For `n = 100000` this would overflow. A loop does not have this problem:

```js run title="The same thing with a loop: no deep stack"
function sumToLoop(n) {
  let total = 0;
  for (let i = 1; i <= n; i++) total += i;
  return total;
}

console.log(sumToLoop(5));
console.log(sumToLoop(1_000_000));
```

## Reading a stack trace

When an error is thrown, its `stack` property tells you **which functions were on the stack**, from the top (where it happened) to the bottom.

```js run title="A stack trace shows the call chain"
function level3() { throw new Error("something broke"); }
function level2() { level3(); }
function level1() { level2(); }

try {
  level1();
} catch (e) {
  // keep only the function names, not file paths
  const names = e.stack.split("\n").slice(1, 4).map((l) => l.trim().split(" ")[1]);
  console.log(e.message);
  console.log(names);
}
```

Read it from the top: the error was created in `level3`, which was called by `level2`, which was called by `level1`. This is the first thing to do when debugging a crash.

## The stack and async code

When you use `setTimeout` or `await`, the current function **returns** and its context is popped. Later, a **new** context is created for the callback. That is why the stack trace of an async error can look short: the original callers are gone from the stack. (Modern V8 adds "async stack traces" to help, but the idea stays.)

```js run title="The stack is empty when the timer fires"
function work() {
  console.log("work called");
  setTimeout(() => console.log("callback runs with a fresh, almost empty stack"), 0);
  console.log("work returns, so its context is popped");
}

work();
console.log("global code ends");
```

:::interview What is the call stack? What is a stack overflow?
"The call stack is where the engine keeps the execution contexts of the functions that are running. A call pushes a context, a return pops it, and the top one is the running function. It is last-in first-out. A stack overflow happens when too many calls pile up without returning, usually infinite or very deep recursion, and JavaScript throws a RangeError. I would fix it with a base case, a loop, or an explicit stack, and for deep tail-style work I can use trampolining."
:::

## More interview questions on this topic

:::qa What happens to the call stack when you use `setTimeout`? {level=easy}
**Say this:** "The `setTimeout` call finishes quickly and is popped. The callback goes to the task queue and gets a fresh stack frame when the stack is empty."

**In simple words:** The timer does not keep your function on the stack while it waits. The waiting is done outside, by the browser or Node.
:::

:::qa How can you avoid a stack overflow in deep recursion? {level=medium}
**Say this:** "Use a loop or an explicit stack, make the recursion shallower, or use trampolining. JavaScript engines do not reliably do tail-call optimisation."

**In simple words:** Turn the recursion into a loop that keeps its own array as the stack. This uses the heap, which is much bigger than the call stack.
:::

:::qa Does JavaScript have tail call optimisation? {level=hard}
**Say this:** "It is in the ES2015 spec, but only Safari (JavaScriptCore) implements it. V8 and SpiderMonkey do not, so I cannot rely on it."

**In simple words:** A tail call is a call that is the last thing a function does, like `return f(x)`. In theory the engine could reuse the same frame. In practice, Chrome and Node do not, so deep recursion still overflows.
:::

:::qa What is in a stack trace and how do you use it? {level=easy}
**Say this:** "The chain of function calls, top to bottom, at the moment the error was created, with file and line numbers. I start at the top frame that is in my own code."

**In simple words:** It answers "how did we get here?". The first line is where the error happened. The lines below are the callers.
:::

```quiz
? What is the order in which the call stack removes functions?
- First in, first out
+ Last in, first out
- Random
> The function that was called last is on top, and it must finish first.
? What causes "RangeError: Maximum call stack size exceeded"?
- Using too much heap memory
+ Too many nested calls without returning
- A very long string
> The stack frames fill up the limited call stack, usually from recursion without a base case.
? A `setTimeout` callback runs. How full is the call stack at that moment?
- It still contains the function that called setTimeout
+ It is empty except for the callback's own context
- It is full
> The timer callback waits in the queue until the stack is empty.
```

:::keypoints
- The **call stack** holds the contexts of running functions: push on call, pop on return, last in first out.
- Only the **top** function runs. Everything below it is waiting.
- Too many nested calls cause a **stack overflow** (`RangeError`). Fix with a base case, a loop or an explicit stack.
- Read a **stack trace** from the top: where it happened, then who called it.
- Async callbacks start on a **fresh, empty stack**.
:::
