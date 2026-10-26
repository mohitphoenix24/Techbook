---
title: What is a closure?
level: intermediate
time: 30
summary: The definition in plain words, why the variable stays alive after the outer function returns, how to spot a closure in code, and the three things every interview answer should include.
---

## The idea

Don't memorise the definition yet. Think of it like this:

> "A function **remembers the variables around it** from the place where it was **created**. Even if it is used somewhere else, much later, it can still read and change those variables."

That memory is the **closure**.

:::analogy A backpack
When a function is created, it packs a **backpack** with all the variables it can see around it. Wherever the function travels, the backpack goes with it. When it runs, it opens the backpack to find what it needs.
:::

:::def Closure
A closure is the combination of a **function** and the **lexical environment** (the surrounding variables) in which it was created. Every function in JavaScript is a closure. We usually say "closure" when the function **uses** variables from an outer function that has already finished.
:::

## The first example

```js run title="A counter: the classic closure"
function makeCounter() {
  let count = 0;                 // a local variable of makeCounter

  return function () {           // the inner function uses count
    count = count + 1;
    return count;
  };
}

const counterA = makeCounter();
console.log(counterA());         // 1
console.log(counterA());         // 2
console.log(counterA());         // 3

const counterB = makeCounter();  // a separate counter with its own count
console.log(counterB());         // 1
```

Think about what is strange here. `makeCounter` has **finished**. Normally its local variable `count` would be gone. But `counterA` still reads and changes it. Why?

## Why does `count` stay alive?

1. When `makeCounter()` runs, JavaScript creates an environment holding `count`.
2. The inner function is created **inside** that environment. The function object saves a pointer to it (`[[Environment]]`, see the [lexical environment lesson](#/l/lexical-environment)).
3. `makeCounter` returns, and its **stack frame** is popped. But the **environment** is an object on the **heap**, and `counterA` still points to it.
4. The garbage collector only frees what nothing can reach. The environment is still reachable through `counterA`, so it stays.

```viz algo=chain title="After makeCounter() has returned"
node cA "counterA (function)" @0,0 [fn]
  [[Environment]]: ->
node envA "Environment of call 1" @1,0 [hl]
  count: 3
node cB "counterB (function)" @0,1 [fn]
  [[Environment]]: ->
node envB "Environment of call 2" @1,1 [hl]
  count: 1
node mc "makeCounter's outer scope" @2,0 [dim]
  note: global / module scope
link cA -> envA : keeps alive
link cB -> envB : keeps alive
link envA -> mc : outer
link envB -> mc : outer
```

Each call of `makeCounter` made its **own** environment. So the two counters are independent.

## How to spot a closure

Ask three questions about a function:

1. Is it defined **inside another function** (or block)?
2. Does it **use a variable** from that outer scope?
3. Is it used **after** the outer code has moved on (returned, or run later)?

If yes to all three, a closure is doing real work.

```js run title="Closures are everywhere"
function greeter(greeting) {
  return (name) => `${greeting}, ${name}!`;   // remembers `greeting`
}

const hello = greeter("Hello");
const namaste = greeter("Namaste");

console.log(hello("Asha"));
console.log(namaste("Ravi"));

// A callback is also a closure: it remembers `prefix`
function logAll(items, prefix) {
  items.forEach((item) => console.log(prefix + item));
}
logAll(["x", "y"], "item: ");
```

## A closure remembers variables, not values

This is the most important detail. The closure keeps a **link to the variable**, not a copy of its value at that time. If the variable changes later, the closure sees the **new** value.

```js run title="Variables, not values"
function setup() {
  let message = "first";
  const show = () => console.log(message);
  message = "second";            // changed AFTER the function was created
  return show;
}

setup()();                       // prints "second", not "first"
```

Two closures can also **share** the same variable:

```js run title="Two closures sharing one variable"
function makeAccount(balance) {
  return {
    deposit(n) { balance += n; return balance; },
    withdraw(n) { balance -= n; return balance; },
    get() { return balance; },
  };
}

const acc = makeAccount(100);
acc.deposit(50);
acc.withdraw(30);
console.log(acc.get());          // 120: all three methods share the same `balance`
```

## What a closure can and cannot do

| A closure can | A closure cannot |
|---|---|
| Read and change outer variables | See variables of a function that **called** it (lexical scope, not dynamic) |
| Keep data private (nobody else can reach it) | Be "copied": cloning a function does not copy the environment |
| Keep an environment alive after the outer function returns | Free memory by itself: the environment lives as long as the function is reachable |

## Common uses

- **Private state** (counters, accounts, caches): next lesson.
- **Function factories**: `greeter("Hello")`, `multiplyBy(3)`.
- **Callbacks and event handlers** that remember context.
- **Partial application, currying, memoization, debounce, throttle**.
- **Module pattern** before ES modules existed.
- React **hooks** are closures over component state (and cause *stale closures* when misused).

:::interview What is a closure? Give an example and a real use.
"A closure is a function together with the environment where it was created, so it can use the variables from that outer scope even after the outer function has returned. For example, `makeCounter` returns a function that increments a `count` variable that nobody else can touch. The variable stays alive because the inner function still references it, and it lives on the heap. Real uses are private state, function factories, callbacks, and things like debounce and memoization. The thing to watch for is that a closure keeps the *variable*, not a copy of the value, and it can keep large objects in memory."
:::

## More interview questions on this topic

:::qa Do closures copy the variables they use? {level=medium}
**Say this:** "No. A closure keeps a reference to the variable in the outer environment, so it sees later changes. Two closures from the same call share the same variable."

**In simple words:** It is a live link, not a photo. If the outer variable changes, the closure sees the change.
:::

:::qa Is every function a closure? {level=hard}
**Say this:** "Technically yes, every function keeps a reference to the environment where it was created. We use the word 'closure' when it matters, that is, when the function uses variables from an outer function scope."

**In simple words:** Even a top-level function remembers the global scope. The interesting case is when it remembers a scope that has already finished.
:::

:::qa Where is a closure's data stored? {level=medium}
**Say this:** "In an environment record on the heap that the function references. It is not on the call stack, so it survives after the outer function returns."

**In simple words:** The stack is for running code. The heap is for objects that need to live longer.
:::

:::qa How do closures help with data privacy? {level=easy}
**Say this:** "Variables inside the outer function cannot be reached from outside. Only the returned functions can touch them, so they work like private fields."

**In simple words:** The caller gets buttons to press, not the machine's insides.
:::

```quiz
? Why can an inner function still use outer variables after the outer function has returned?
- Because the outer function is run again
+ Because the inner function keeps a reference to the outer environment on the heap
- Because variables are copied into the inner function
> The environment stays alive as long as something references it.
? Two functions created in the same call use the same outer `let` variable. What happens when one changes it?
- The other keeps the old value
+ The other sees the new value
- It throws an error
> They share one variable. A closure holds a reference, not a copy.
? What do two calls of `makeCounter()` produce?
- Two functions sharing one count
+ Two functions, each with its own count
- An error
> Every call creates a new environment.
```

:::keypoints
- A **closure** = a function + the environment where it was created.
- The environment lives on the **heap** and stays as long as the function is reachable.
- It keeps **variables, not values**: it sees later changes, and closures from one call share them.
- Each call of the outer function makes a **new, independent** environment.
- Uses: private state, factories, callbacks, debounce, memoize, hooks.
:::
