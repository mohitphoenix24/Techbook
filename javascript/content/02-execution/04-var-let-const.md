---
title: var, let and const
level: easy
time: 25
summary: The three ways to declare a variable, how they differ in scope, redeclaration, hoisting and global behaviour, why const does not mean "frozen", and which one to use.
---

## Why three keywords?

Before 2015 there was only `var`. It had odd rules that caused many bugs, so ES2015 added `let` and `const`. Today **`var` is for reading old code**. You write `const` by default and `let` when the value must change.

| | `var` | `let` | `const` |
|---|---|---|---|
| **Scope** | function | block | block |
| **Can be re-assigned** | yes | yes | **no** |
| **Can be redeclared in the same scope** | yes | no | no |
| **Hoisted** | yes, initialised to `undefined` | yes, but in the **TDZ** | yes, but in the **TDZ** |
| **Becomes a property of the global object** (classic scripts) | yes | no | no |
| **Needs a value when declared** | no | no | **yes** |

## Scope: function vs block

A **block** is anything inside `{ }` that is not a function body: an `if`, a `for`, a `while`, or a plain `{ }`.

`var` ignores blocks. It lives in the whole function. `let` and `const` live only in the block where they are written.

```js run title="var leaks out of a block. let does not."
function demo() {
  if (true) {
    var a = "I am var";
    let b = "I am let";
    const c = "I am const";
  }
  console.log(a);                  // works: var belongs to the whole function
  console.log(typeof b, typeof c); // not visible here
}
demo();
```

`typeof b` gives `"undefined"` here because `b` does not exist outside the block. (Using `b` directly would throw a `ReferenceError`.)

## Redeclaration and re-assignment

```js run title="Redeclare and re-assign" 
var x = 1;
var x = 2;          // allowed (no error, easy to do by mistake)
console.log(x);

let y = 1;
y = 2;              // re-assigning a let is fine
console.log(y);

const z = 1;
try {
  z = 2;            // re-assigning a const is an error
} catch (e) {
  console.log(e.name + ": " + e.message);
}
```

`let y` twice in the same scope is a **SyntaxError**, caught before any code runs, so it can only be shown in a block that fails entirely:

```js run title="Redeclaring a let is a syntax error" expect-error
let count = 1;
let count = 2;
```

## const does not freeze the value

This is a very common trap. **`const` means the variable cannot be pointed at a new thing. The thing itself can still change.**

```js run title="const protects the binding, not the object"
const user = { name: "Asha", age: 25 };
user.age = 26;                 // fine: we changed the object
user.city = "Pune";            // fine: we added to the object
console.log(user);

try {
  user = { name: "Ravi" };     // not fine: a new binding
} catch (e) {
  console.log(e.message);
}

const list = [1, 2];
list.push(3);                  // fine
console.log(list);
```

If you want the object itself to be unchangeable, use `Object.freeze` (you will see it in module 11). Freezing is shallow, so nested objects still change.

:::analogy const is a name tag on a box
`const box = {...}` glues the name tag `box` to one specific box. You cannot move the tag to another box. But you can open the box and change what is inside.
:::

## The famous loop problem

```js run title="var in a loop: all callbacks share one variable"
const fns = [];
for (var i = 0; i < 3; i++) {
  fns.push(() => i);
}
console.log(fns.map((f) => f()));
```

All three functions see the **same** `i`. When they run, the loop has finished and `i` is `3`. With `let`, each loop round gets its **own** copy of `i`:

```js run title="let in a loop: a new i for every round"
const fns = [];
for (let i = 0; i < 3; i++) {
  fns.push(() => i);
}
console.log(fns.map((f) => f()));
```

This is the single most asked question about `var` and `let`. We will go deeper in the [closures in loops lesson](#/l/closures-in-loops).

## Global object behaviour

In a classic browser script, a top-level `var` or function declaration becomes a property of `window`. A top-level `let` or `const` does not. In Node, top-level variables in a module are local to the file anyway. This is a good reason to avoid `var`: it can silently collide with browser or library globals.

```js run sloppy title="Implicit globals (sloppy mode only)"
function leak() {
  oops = 42;          // no keyword: creates a global (sloppy mode only)
}
leak();
console.log(oops, globalThis.oops);
```

In strict mode (and in modules and classes) the line `oops = 42` throws `ReferenceError: oops is not defined`. Always use strict mode (`"use strict"`, or `<script type="module">`, or Node ES modules). See [strict mode](#/l/strict-mode-and-globals).

## Which one should I use?

1. Default to **`const`**. It tells the reader "this name will not be re-assigned", which removes a lot of doubt.
2. Use **`let`** when you really need to re-assign (counters, accumulators, loop variables).
3. **Do not use `var`** in new code.

:::interview What is the difference between var, let and const?
"`var` is function-scoped, can be redeclared, and is hoisted and set to `undefined`. `let` and `const` are block-scoped, cannot be redeclared in the same scope, and are hoisted but kept in the temporal dead zone until their declaration runs. `const` cannot be re-assigned, but if it holds an object, the object can still be changed. In loops, `let` gives a new binding for every iteration, which is why it fixes the closure-in-a-loop problem. I use `const` by default, `let` when I must re-assign, and never `var`."
:::

## More interview questions on this topic

:::qa Is `const` immutable? {level=easy}
**Say this:** "No. `const` means the binding cannot be re-assigned. The value can still be changed if it is an object or array. For immutability I use `Object.freeze` (shallow) or a library, or I never mutate."

**In simple words:** The tag cannot move, but the box can change.
:::

:::qa Why does `var` in a `for` loop cause bugs with callbacks? {level=medium}
**Say this:** "`var` has one variable for the whole function, so all callbacks share it and see its final value. `let` creates a fresh binding for each iteration."

**In simple words:** With `var`, three buttons all show the number `3`. With `let`, they show `0`, `1`, `2`.
:::

:::qa Are `let` and `const` hoisted? {level=medium}
**Say this:** "Yes, they are hoisted to the top of their block, but they are not initialised. Touching them before the declaration throws a ReferenceError. That gap is the temporal dead zone."

**In simple words:** The engine knows the name exists, but it will not let you use it until the line that declares it has run.
:::

:::qa Can you declare a `const` without a value? {level=easy}
**Say this:** "No. `const x;` is a SyntaxError, because it can never be assigned later."

**In simple words:** A const must be given its value on the same line.
:::

:::qa What happens to a top-level `var` in a browser script vs in an ES module or Node? {level=hard}
**Say this:** "In a classic script it becomes a property of `window`. In an ES module or a Node module it stays local to the file."

**In simple words:** So in an old script, two files that both write `var name` can overwrite each other through `window.name`.
:::

```quiz
? What does this print? `for (var i = 0; i < 3; i++) setTimeout(() => console.log(i)); `
- 0 1 2
+ 3 3 3
- 2 2 2
> var has one shared i. After the loop it is 3, and the timers run later.
? Which statement about const is true?
- const makes objects deeply frozen
+ const prevents re-assigning the variable, not changing an object inside it
- const variables are not hoisted at all
> The binding is fixed. The contents of an object can still change.
? Which keyword creates a property on the global object in a classic browser script?
- let
- const
+ var
> Top-level var and function declarations become properties of window.
```

:::keypoints
- `var`: function scope, redeclarable, set to `undefined` on hoist. Avoid it.
- `let` / `const`: block scope, TDZ, no redeclaration. `const` also forbids re-assignment.
- **`const` protects the binding, not the object.** Use `Object.freeze` for (shallow) immutability.
- In loops, `let` makes a new variable per round. `var` shares one.
- Default to `const`, use `let` when you must change the value.
:::
