---
title: The temporal dead zone
level: easy
time: 20
summary: What the TDZ is, exactly where it starts and ends, why it exists, and the surprising places it appears: typeof, default parameters, classes and shadowing.
---

## What is the temporal dead zone (TDZ)?

Don't memorise the long name. Think of it like this:

> "A `let` or `const` variable **exists** from the start of its block, but you are **not allowed to touch it** until the line that declares it has run. The time between the start of the block and that line is the **dead zone**."

"Temporal" means it is about **time** (when the code runs), not about position in the file.

```js run title="The zone, marked"
{
  // ---- TDZ for `score` starts here ----
  try {
    console.log(score);          // inside the zone: error
  } catch (e) {
    console.log(e.name + ": " + e.message);
  }
  // ---- TDZ for `score` ends on the next line ----
  let score = 50;
  console.log(score);            // fine now
}
```

:::def Temporal dead zone
The period from the **start of the scope** until the variable's declaration is **evaluated**. Reading or writing the variable in this period throws a `ReferenceError`.
:::

## Time, not position

The word "temporal" matters. A function written **above** the declaration can still be safe, if it is **called after** the declaration ran.

```js run title="Position vs time"
function show() {
  return value;                  // written before `value` in the file...
}

let value = "ready";             // ...but this line runs first

console.log(show());             // ...so the call is safe
```

And a function written below can still fail, if it is **called too early**:

```js run title="Called too early" expect-error
function early() { return later; }

console.log(early());            // runs while `later` is still in the TDZ
let later = 1;
```

## Why does the TDZ exist?

1. To **catch bugs.** With `var`, using a variable too early quietly gives `undefined`, and the program goes on and fails somewhere else. The TDZ fails **immediately and clearly**.
2. To make **`const` make sense.** A `const` that could be read as `undefined` first and then change to its real value would be strange.
3. To keep **block scoping predictable.** An inner `let x` always shadows the outer `x` for the **whole block**.

## It proves that let is hoisted

```js run title="Shadowing starts at the top of the block"
const name = "outer";

{
  try {
    console.log(name);           // if `let name` were NOT hoisted, this would print "outer"
  } catch (e) {
    console.log(e.name + ": " + e.message);
  }
  let name = "inner";
}
```

The inner `let name` is already known at the top of the block, so it **hides** the outer `name`, but it is not ready yet. This is the best proof that `let` is hoisted.

## Where else the TDZ appears

### `typeof` is not safe

```js run title="typeof in the TDZ"
console.log(typeof notDeclaredAnywhere);   // "undefined": safe, the name does not exist

try {
  console.log(typeof later);               // the name exists but is in the TDZ
} catch (e) {
  console.log(e.name);
}
let later = 1;
```

### Default parameters

Parameters are created **from left to right**. A default value can use an earlier parameter, but not a later one.

```js run title="TDZ between parameters"
function ok(a, b = a * 2) { return [a, b]; }
console.log(ok(5));

function bad(a = b, b = 2) { return [a, b]; }
try {
  bad();                                   // a needs b, but b is not ready yet
} catch (e) {
  console.log(e.name + ": " + e.message);
}
```

### Classes

```js run title="Classes have a TDZ too"
try {
  const p = new Point(1, 2);
} catch (e) {
  console.log(e.name + ": " + e.message);
}

class Point {
  constructor(x, y) { this.x = x; this.y = y; }
}
console.log(new Point(1, 2));
```

### Self reference

```js run title="A variable cannot use itself in its own initialiser"
try {
  const x = x + 1;                         // x is still in the TDZ on the right-hand side
} catch (e) {
  console.log(e.name + ": " + e.message);
}
```

## TDZ and the switch statement

A `switch` has **one block** for all cases. A `let` in one case is in the TDZ for the other cases.

```js run title="let inside switch cases" expect-error
function describe(n) {
  switch (n) {
    case 1:
      let msg = "one";
      return msg;
    case 2:
      msg = "two";                         // `msg` is in the TDZ: the line above never ran
      return msg;
  }
}
describe(2);
```

Fix: wrap each case in its own `{ }`.

:::interview What is the temporal dead zone?
"It is the time between entering a scope and the point where a `let`, `const` or `class` is initialised. The variable is already hoisted, so it shadows outer variables, but any access throws a ReferenceError. It exists to catch use-before-declare bugs, which `var` hides by returning `undefined`. It is about time, not position: a function above the declaration is fine if it is called after the declaration ran."
:::

## More interview questions on this topic

:::qa Is it correct to say that `let` and `const` are not hoisted? {level=medium}
**Say this:** "No. They are hoisted, but not initialised. The TDZ shows it: an inner `let x` hides an outer `x` from the top of the block."

**In simple words:** The engine knows about the variable from the start. It just does not let you use it yet.
:::

:::qa Does the TDZ apply to `var`? {level=easy}
**Say this:** "No. `var` is initialised to `undefined` at the start of the function, so there is no dead zone."

**In simple words:** That is why `var` hides bugs, and why people moved to `let` and `const`.
:::

:::qa Why does `typeof` throw inside the TDZ? {level=hard}
**Say this:** "`typeof` is only safe for names that do not exist. A name in the TDZ exists, so reading it, even through `typeof`, throws."

**In simple words:** The old trick `typeof x === "undefined"` works for unknown names, but not for a `let` that is declared later in the same scope.
:::

:::qa Can a function that uses a `const` be defined before the `const`? {level=medium}
**Say this:** "Yes, as long as the function is called after the `const` is initialised. The TDZ is decided at run time."

**In simple words:** Writing it above is fine. Calling it too early is the problem.
:::

```quiz
? What does this do? `{ console.log(a); let a = 1; }`
- Prints undefined
+ Throws a ReferenceError
- Prints 1
> a is in the temporal dead zone until its declaration runs.
? Why does the TDZ exist?
- To make code slower
+ To catch use-before-declaration bugs early
- To allow var to be redeclared
> With var, the bug is hidden because the value is undefined.
? A function defined above `let x = 1` reads `x`. When is that safe?
- Never
+ When the function is called after the declaration has run
- Only if x is a var
> TDZ is about time, not position in the file.
```

:::keypoints
- The **TDZ** is the time from the start of a scope until a `let` / `const` / `class` declaration runs.
- The variable exists (so it shadows outer ones) but any access throws `ReferenceError`.
- It is about **time**, not position: calling too early fails, calling after is fine.
- It also shows up in `typeof`, default parameters, classes, self-reference and `switch` cases.
- `var` has no TDZ. That is why `let` and `const` are safer.
:::
