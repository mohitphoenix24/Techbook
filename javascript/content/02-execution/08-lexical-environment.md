---
title: Lexical environments, the engine's view of scope
level: intermediate
time: 25
summary: How the specification models scope with environment records and outer references, how a new environment is made for each function call and block, and why for-let loops get a fresh variable per round.
---

You have seen that scope is a chain. This lesson shows what the chain is **made of**. It is the "under the hood" version that senior interviews like, and it makes closures easy to understand.

## The idea in one picture

> "A **lexical environment** is a small table of names and values (the **environment record**) plus a link to the **outer** environment."

That is all. The scope chain is a linked list of such tables.

```viz algo=chain title="Lexical environments for one function call"
node fn "Environment of add(2)" @0,0 [hl]
  record: { x: 2, y: 10 }
  outer: ->
node mod "Environment of the file (module)" @1,0
  record: { base: 10, add: fn }
  outer: ->
node glob "Global environment" @2,0 [dim]
  record: { console, Math, Promise, ... }
  outer: null
link fn -> mod : outer
link mod -> glob : outer
```

```js run title="The code behind the picture"
const base = 10;

function add(x) {
  const y = base;          // base is not in add's record, so look outwards
  return x + y;
}

console.log(add(2));
```

When `add(2)` is called, the engine creates a new environment with `x` and `y`, and sets its **outer** link to the environment in which `add` was **created**. That link is saved inside the function object when it is created (the spec calls it `[[Environment]]`).

## Where do new environments come from?

| When | What is created |
|---|---|
| The program (or module) starts | A global (or module) environment |
| A function is called | A new function environment, with parameters and `var`s |
| A block `{ }` with `let`/`const`/`class` runs | A new block environment |
| A `for (let ...)` loop starts | One environment for the loop head, and **a fresh copy for each iteration** |
| A `catch (e)` clause runs | An environment holding `e` |

A **block without** `let`, `const` or `class` does not need a new environment.

## Why `for (let ...)` fixes the loop problem

With `let` in the loop head, the engine makes a **new environment for each round**. It copies the current value of `i` into it. So each closure created inside the round keeps its own `i`.

```viz algo=chain title="for (let i = 0; i < 3; i++): one environment per iteration"
node loop "Loop environment" @0,0 [dim]
  i: (copied each round)
node r0 "Round 0" @1,0
  i: 0
node r1 "Round 1" @1,1
  i: 1
node r2 "Round 2" @1,2
  i: 2
link r0 -> loop : outer
link r1 -> loop : outer
link r2 -> loop : outer
```

```js run title="Each round has its own i"
const getters = [];

for (let i = 0; i < 3; i++) {
  getters.push(() => i);          // each arrow function remembers the environment of its round
}

console.log(getters.map((g) => g()));
```

With `var`, there is no per-round environment. All the closures share the single `i` in the function's environment.

## Closures in one sentence

A closure is simply a **function object whose `[[Environment]]` still points to an environment that would otherwise be finished**. As long as the function is reachable, its environment is kept alive by the garbage collector.

```js run title="The environment survives after the function returns"
function makeCounter() {
  let count = 0;                  // lives in makeCounter's environment
  return function () {            // [[Environment]] points to that environment
    count++;
    return count;
  };
}

const next = makeCounter();       // makeCounter has finished, its stack frame is gone...
console.log(next(), next(), next());   // ...but its environment is still alive
```

The **stack frame** of `makeCounter` was popped. But the **environment record** that holds `count` is an object on the **heap**, and `next` still points to it. You will see this in depth in [module 3](#/m/closures).

## Global environment: two parts

The global environment has two records:

1. An **object record** tied to the global object (`window` / `globalThis`). Top-level `var` and function declarations (in a classic script) go here, so they become properties of `window`.
2. A **declarative record** for top-level `let`, `const` and `class`. These are **not** properties of `window`.

```js run node title="Global environment: var vs let in a classic script"
// Node's vm module can run code as a classic script with a real global object.
const vm = require("node:vm");
const ctx = vm.createContext({ console });

vm.runInContext(`
  var a = 1;
  let b = 2;
  function f() {}
  console.log("var a on global:", typeof globalThis.a);
  console.log("let b on global:", typeof globalThis.b);
  console.log("function f on global:", typeof globalThis.f);
`, ctx);
```

That is the reason `var` at the top of an old script can clash with browser globals.

## Variable environment vs lexical environment

Inside one function the spec keeps two pointers:

- **VariableEnvironment**: holds the function's parameters, `var` and function declarations. It is set when the function starts and never changes.
- **LexicalEnvironment**: starts as the same environment, but **changes** as blocks are entered and left, so each block's `let` and `const` live in their own environment.

In everyday terms: `var` belongs to the function. `let` and `const` belong to the nearest block.

:::interview What is a lexical environment, and how does it relate to closures?
"A lexical environment is an environment record, the names and values in a scope, plus a reference to its outer environment. The scope chain is these records linked by their outer references. A function remembers the environment in which it was created. When it runs, a new environment is created for the call whose outer link is that saved environment. A closure is a function that still holds onto an outer environment after the code that created it has finished, so the variables stay alive on the heap."
:::

## More interview questions on this topic

:::qa What is an environment record? {level=hard}
**Say this:** "It is the internal table that maps variable names to values for one scope. Each environment has one, and a pointer to its outer environment."

**In simple words:** Think of a dictionary for one room, with a note saying "if you do not find it here, look in the next room".
:::

:::qa Why does each `for (let ...)` iteration get its own binding? {level=hard}
**Say this:** "The spec says that for `let` loops the engine creates a new environment per iteration and copies the loop variables into it, so closures capture the value from that iteration."

**In simple words:** Each round makes a fresh copy of `i`. So callbacks created in different rounds do not share one variable.
:::

:::qa The stack frame of a function is gone after it returns. How can a closure still use its variables? {level=medium}
**Say this:** "Variables that closures use live in an environment object on the heap, not only on the stack. The closure keeps a reference to it, so the garbage collector does not free it."

**In simple words:** The stack frame is just the running part. The notebook with the values is kept on the heap, and the inner function holds it.
:::

```quiz
? What does the outer link of a function's environment point to?
- The environment of the caller
+ The environment where the function was created
- The global environment always
> That is lexical scoping, and it is what closures keep alive.
? How many environments does `for (let i = 0; i < 3; i++) { ... }` create for its body?
- One for the whole loop
+ One per iteration (a fresh copy of i each time)
- None
> This is why closures in a let loop see different values.
? Where do top-level `let` and `const` live in a classic browser script?
- On the window object
+ In a declarative record, not on window
- In localStorage
> Only var and function declarations become properties of the global object.
```

:::keypoints
- A **lexical environment** = environment record (names and values) + **outer** reference.
- The **scope chain** is a linked list of these environments.
- Every **function call** and every **block with let/const** makes a new environment. A `for (let…)` loop makes **one per iteration**.
- A **closure** is a function that keeps its creation environment alive on the **heap**.
- Global environment: an object record (`var`, functions) and a declarative record (`let`, `const`, `class`).
:::
