---
title: "Core bank: execution, scope and hoisting"
level: medium
time: 30
summary: Fourteen answers on the execution context, call stack, hoisting, the temporal dead zone, var/let/const, the scope chain, strict mode and the usual traps.
---

Say each answer aloud before you read it. A senior answer is **short, correct and has one example**.

## Execution model

:::qa What is an execution context? {level=easy}
**Say this:** "It is the environment where a piece of code runs. It holds the variables and functions in scope, the value of `this`, and a link to the outer scope. There is a global context, one per function call, and one for `eval`."

**In simple words:** Think of it as a work desk. Each function call gets a fresh desk with its own papers (variables), and a note saying which desk is behind it (the outer scope).
:::

:::qa What are the two phases of an execution context? {level=medium}
**Say this:** "First the creation phase: the engine sets up the scope, registers declarations (`var` as `undefined`, functions with their body, `let`/`const` uninitialised) and decides `this`. Then the execution phase runs the code line by line and assigns values."

**In simple words:** First the engine reads the whole page and writes down every name. Then it starts doing the work.
:::

:::qa What is the call stack, and what is a stack overflow? {level=easy}
**Say this:** "It is the list of functions currently running. A call pushes a frame, a return pops it. JavaScript has one call stack, so one thing runs at a time. Too deep recursion fills the stack and throws `RangeError: Maximum call stack size exceeded`."

**In simple words:** It is a pile of plates. You add on top and remove from the top. If the pile gets too high, it falls.
:::

:::qa Is JavaScript single-threaded? What does that mean? {level=easy}
**Say this:** "Your JavaScript runs on one thread with one call stack, so two pieces of your code never run at the same moment. The browser or Node does I/O, timers and networking outside this thread and puts callbacks in queues for the event loop."

**In simple words:** One cook, many helpers. The cook cooks one dish at a time, while helpers (timers, network) bring ingredients.
:::

## Hoisting and the temporal dead zone

:::qa What is hoisting? {level=easy}
**Say this:** "Declarations are registered in their scope before the code runs, so they can be used earlier in the scope. Function declarations are hoisted with their body. `var` is hoisted and set to `undefined`. `let`, `const` and `class` are hoisted but not initialised, so using them early throws."

**In simple words:** Names are written on the attendance sheet before the class starts. Only functions arrive with their bag already.
:::

:::qa What will this print, and why? `console.log(a); var a = 5;` {level=easy}
**Say this:** "`undefined`. The declaration `var a` is hoisted and initialised to `undefined`; the assignment `= 5` stays where it is. With `let a` it would throw a `ReferenceError`."

**In simple words:** The box exists from the start, but the value is put in later.
:::

:::qa What is the temporal dead zone (TDZ)? {level=medium}
**Say this:** "It is the time between entering a scope and the line where a `let`, `const` or `class` is declared. Reading the name in that time throws a `ReferenceError`. Even `typeof x` throws in the TDZ."

**In simple words:** The seat is reserved with your name, but you cannot sit until the line that gives it to you.
:::

:::qa What is the difference between a function declaration and a function expression? {level=easy}
**Say this:** "A declaration (`function f() {}`) is fully hoisted, so you can call it before it appears. An expression (`const f = function () {}` or an arrow) is only as hoisted as its variable: `const`/`let` are in the TDZ, `var` is `undefined`, so calling early fails."

**In simple words:** A declaration is a printed name board; an expression is a person who arrives only when the line runs.
:::

## var, let, const and scope

:::qa Explain `var`, `let` and `const`. {level=easy}
**Say this:** "`var` is function-scoped, can be redeclared, is hoisted as `undefined`, and at the top level of a script becomes a property of the global object. `let` and `const` are block-scoped, cannot be redeclared in the same scope, and live in the TDZ before their line. `const` also forbids reassigning the binding."

**In simple words:** `var` ignores `{}` walls. `let` and `const` respect them.
:::

:::qa Does `const` make an object immutable? {level=easy}
**Say this:** "No. `const` fixes the binding, not the value. You cannot point the name to another object, but you can change the object's properties. For a shallow lock use `Object.freeze`, and deep-freeze by recursion if needed."

**In simple words:** `const` locks the label on the box, not the things inside the box.
:::

:::qa Why does `for (var i...)` with `setTimeout` print the same number, and how do you fix it? {level=medium}
**Say this:** "There is a single `i` for the whole function, and the callbacks run after the loop, when `i` has its final value. With `let` the loop makes a new binding for each iteration, so each callback sees its own value. Before `let`, an IIFE or `bind` was used."

**In simple words:** With `var`, everyone shares one counter. With `let`, everyone gets a personal counter.
:::

:::qa What is lexical scope and the scope chain? {level=medium}
**Say this:** "Scope is decided by where the code is written, not where it is called. When a name is not found in the current scope, the engine looks in the outer scope, and then the next one, up to the global scope. That chain of lookups is the scope chain."

**In simple words:** If you do not have a pen, you ask the neighbour on the left, then the next one, until the school office.
:::

:::qa What changes in strict mode? {level=medium}
**Say this:** "Assigning to an undeclared name throws instead of creating a global. `this` is `undefined` in plain function calls. Duplicate parameter names and writing to read-only properties are errors. `with` and octal literals are banned. Modules and classes are always strict."

**In simple words:** Strict mode turns silent mistakes into loud errors.
:::

:::qa What is an implicit global? {level=easy}
**Say this:** "In sloppy mode, assigning to a name that was never declared (`count = 1`) creates a property on the global object. It is a classic source of bugs, and strict mode makes it a `ReferenceError`."

**In simple words:** A typo can silently create a new variable that everybody can see.
:::

:::qa What is the difference between `undefined`, `null` and "not defined"? {level=easy}
**Say this:** "`undefined` means a declared variable has no value yet. `null` is a value meaning 'intentionally empty'. 'Not defined' is a `ReferenceError` for a name that was never declared. `typeof undeclared` is `'undefined'` without throwing."

**In simple words:** An empty box, a box with a note saying 'empty', and no box at all.
:::

:::keypoints
- Two phases: **creation** (register names) and **execution** (run).
- `var` → `undefined` early; `let`/`const`/`class` → **TDZ**; function declarations → fully hoisted.
- **Lexical scope**: lookup goes outwards through the scope chain.
- `const` locks the **binding**, not the object.
- Strict mode makes silent bugs loud.
:::
