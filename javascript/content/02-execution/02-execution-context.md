---
title: Execution context
level: easy
time: 25
summary: The "box" that JavaScript builds before it runs any code. Global and function execution contexts, the creation phase and the execution phase, and what lives inside a context.
---

## What is an execution context?

Don't memorise the definition yet. Think of it like this:

> "Before JavaScript runs a piece of code, it **builds a small workspace** for it. In that workspace it keeps the variables, the functions, and the value of `this`. That workspace is the **execution context**."

:::analogy Think of a desk
When you start a task, you clear a desk and put the papers for that task on it. When a smaller task comes up, you put a **new desk on top** with its own papers. When the small task is done, you remove that desk and go back to the old one. JavaScript does the same with execution contexts, and the pile of desks is the **call stack**.
:::

:::def Execution context
An internal record that holds everything needed to run one piece of code: its **variables and functions** (the environment), the value of **`this`**, and a link to the **outer** environment (the scope chain).
:::

## Two kinds you must know

| Kind | When it is created | How many |
|---|---|---|
| **Global execution context** | When the program starts | Exactly one |
| **Function execution context** | Every time a function is **called** | One per call (so a recursive function makes many) |

(There is also an `eval` context, which you should almost never use.)

Note the words **every time it is called**. A function that you call 3 times makes 3 separate contexts, each with its own fresh variables. This is why two calls to the same function do not share local variables.

```js run title="Each call gets its own context"
function addOne(start) {
  let total = start;       // new variable for every call
  total += 1;
  return total;
}

console.log(addOne(10));   // a context with total = 10, then 11
console.log(addOne(100));  // a different context with total = 100, then 101
```

## The two phases

Every execution context goes through **two phases**. This is the key to understanding hoisting.

:::flow Life of an execution context
1. Creation phase | JavaScript scans the code. It sets up memory for variables and functions, and decides what `this` is. No code runs yet.
2. Execution phase | JavaScript runs the code line by line, assigns values, and calls functions.
3. Pop | When the code ends (or the function returns), the context is removed from the call stack.
:::

In the **creation phase** (the specification calls it "instantiation"):

- Each `function` declaration is stored with its **full body**. You can call it before its line.
- Each `var` is created and set to **`undefined`**.
- Each `let`, `const` and `class` is created but left **uninitialised** (you cannot touch it yet: the *temporal dead zone*).
- `this` is decided, and the link to the outer environment is set.

```js run title="What the creation phase makes possible"
console.log(typeof greet);   // the whole function is already there
console.log(typeof price);   // var exists, but is not set yet
console.log(price);

function greet() { return "hello"; }
var price = 99;

console.log(price);          // now the assignment has run
```

You will study this in detail in the [hoisting lesson](#/l/hoisting). For now remember: **JavaScript knows all your declarations before it runs the first line.**

## What is inside a context

```viz algo=chain title="Inside a function execution context"
node ctx "Function execution context" @0,0 [hl]
  Variable environment: var, function declarations, parameters
  Lexical environment: let, const, class (block scopes)
  this binding: depends on how the function was called
  Outer reference: the environment where the function was written
node outer "Outer (parent) environment" @0,1
  note: found through the outer reference
node global "Global environment" @0,2 [dim]
  note: the end of the scope chain
link ctx -> outer : outer
link outer -> global : outer
```

Four things matter in interviews:

1. **Variable environment**: parameters, `var` variables and function declarations.
2. **Lexical environment**: `let`/`const`/`class` and the link to the outer scope.
3. **`this` binding**: set when the function is **called**, not where it is written (except arrow functions). See [module 4](#/m/this-keyword).
4. **Outer reference**: set where the function is **written**. This is what makes closures work.

## Walking through a program

```js run title="Trace the contexts"
const city = "Pune";                       // global context

function outer() {
  const street = "FC Road";                // outer's context
  function inner() {
    const house = 12;                      // inner's context
    return `${house}, ${street}, ${city}`; // finds street in outer, city in global
  }
  return inner();
}

console.log(outer());
```

When `outer()` is called, a new context is pushed. When `outer` calls `inner()`, another one is pushed. The stack is now:

```
inner()     <- running now
outer()
global
```

`inner` needs `street`: not in its own context, so it follows the outer reference to `outer`'s context. It needs `city`: not there either, so it goes one more step to the global context. This walk is the **scope chain**.

## Global context differences: browser vs Node

| | Browser (classic script) | Node.js (module) |
|---|---|---|
| Global object | `window` (also `globalThis`) | `globalThis` (`global`) |
| `var x` at top level | becomes `window.x` | stays local to the module file |
| Top-level `this` | `window` | `module.exports` in CommonJS, `undefined` in ESM |

```js run sloppy title="this at the top of a function (sloppy mode)"
function whoAmI() {
  return this === globalThis;
}
console.log(whoAmI());
```

In sloppy mode a plain function call gets `this = globalThis`. In strict mode (and in ES modules and classes) it would be `undefined`. You will see this in module 4.

:::interview What is an execution context? What happens when a function is called?
"It is the environment JavaScript creates to run code: variables and functions, `this`, and a link to the outer scope. There is one global context, and a new function context for every call. Each context has a creation phase, where declarations are set up (functions fully, `var` as `undefined`, `let`/`const` uninitialised) and `this` is decided, and an execution phase, where code runs line by line. Contexts are pushed on the call stack and popped when they finish."
:::

## More interview questions on this topic

:::qa How many execution contexts are created for a program? {level=easy}
**Say this:** "One global context, plus one new function context every time a function is called."

**In simple words:** Calling `add(1,2)` twice makes two contexts. A recursive function that goes 5 levels deep has 5 function contexts on the stack at once.
:::

:::qa What are the two phases of an execution context? {level=easy}
**Say this:** "Creation, where memory is set up for declarations and `this` is decided, and execution, where code runs line by line."

**In simple words:** The engine reads your code first, then runs it. That is why functions can be called before the line where they are written.
:::

:::qa Where does a function get its outer scope from: where it is called, or where it is written? {level=medium}
**Say this:** "Where it is written. JavaScript has lexical (static) scope."

**In simple words:** The outer link is fixed when the function is created. Calling it from somewhere else does not change which variables it can see. (But `this` is the opposite: it depends on how the function is called.)
:::

:::qa What is the difference between the variable environment and the lexical environment? {level=hard}
**Say this:** "The variable environment holds `var` and function declarations of the function. The lexical environment holds `let`, `const` and `class`, and changes for every block. Both are kept in the execution context."

**In simple words:** At the start of a function they are the same scope. Then each `{ }` block that has `let` or `const` gets its own new lexical environment, while `var` stays in the variable environment of the function.
:::

```quiz
? When is a function execution context created?
- When the function is written in the file
+ Every time the function is called
- Only the first time it is called
> Each call makes a new context with its own local variables.
? In the creation phase, what happens to a `var` variable?
- It is not known at all
+ It is created and set to undefined
- It gets its final value
> The assignment happens later, in the execution phase.
? Where does the outer reference of a function point?
- To the place where the function is called
+ To the environment where the function was written
- To the global object always
> Lexical scope: decided by the position in the source code.
```

:::keypoints
- An **execution context** is the workspace for running code: environment, `this`, outer link.
- One **global** context, and a **new function context for every call**. They live on the call stack.
- Two phases: **creation** (declarations set up) then **execution** (code runs).
- The outer link is set where the function is **written**. `this` is set by **how it is called**.
:::
