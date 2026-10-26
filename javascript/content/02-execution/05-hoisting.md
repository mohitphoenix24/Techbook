---
title: Hoisting
level: easy
time: 30
summary: What hoisting really is (a side effect of the creation phase, not code moving up), how it works for var, functions, let, const and classes, and the classic output puzzles.
---

## What is hoisting?

Don't memorise "variables move to the top". Nothing moves. Think of it like this:

> "Before running a scope, JavaScript **reads all the declarations** and creates the variables. So when your code runs, the names already exist."

That is all. The effect looks like the declarations were **lifted** to the top, which is why we call it **hoisting**.

:::analogy A teacher with the attendance list
Before the class starts, the teacher writes all the names on the register (the creation phase). Then the teacher begins the lesson (the execution phase). A student's name is on the list from the start, but the student may not have arrived yet.
:::

## Hoisting rules at a glance

| Declaration | Hoisted? | What you see before its line |
|---|---|---|
| `function f() {}` (declaration) | yes, **with the body** | You can call it. |
| `var x = 1` | yes, **only the name** | `undefined` |
| `let x = 1` / `const x = 1` | yes, but **not initialised** | `ReferenceError` (TDZ) |
| `class C {}` | yes, but not initialised | `ReferenceError` (TDZ) |
| `var f = function () {}` / `const f = () => {}` | follows the variable rule | `undefined` for var, TDZ for const/let. **Calling it fails.** |
| `import` | yes, hoisted to the top of the module | works before its line |

## var is hoisted and set to undefined

```js run title="var: the name exists, the value does not"
console.log(a);   // undefined, not an error
var a = 10;
console.log(a);   // 10
```

The engine sees this as:

```js
var a;            // creation phase: a = undefined
console.log(a);   // undefined
a = 10;           // only the assignment stays in place
console.log(a);   // 10
```

## let and const: hoisted, but you cannot touch them

```js run title="let before its declaration" expect-error
console.log(b);
let b = 10;
```

The error is `ReferenceError: Cannot access 'b' before initialization`. This is the **temporal dead zone**. You will study it in the [next lesson](#/l/temporal-dead-zone).

## Function declarations are hoisted completely

```js run title="Call a function before its declaration"
sayHello();                       // works

function sayHello() {
  console.log("hello from a hoisted function");
}
```

This is a useful style: put the main code at the top and the helper functions below.

## Function expressions are not

A function **expression** is just a value assigned to a variable, so only the variable name is hoisted.

```js run title="A function expression is not available early"
try {
  early();                        // early is undefined at this point
} catch (e) {
  console.log(e.name + ": " + e.message);
}

var early = function () { return "now it exists"; };
console.log(early());

try {
  lateArrow();                    // a const: still in the TDZ
} catch (e) {
  console.log(e.name + ": " + e.message);
}
const lateArrow = () => "arrow";
console.log(lateArrow());
```

Notice the two different messages. For `var`, the variable is `undefined`, so calling it says "early is not a function". For `const`, the variable is in the TDZ, so JavaScript says "Cannot access ... before initialization".

## Function beats var (when the names are the same)

If a function and a `var` have the same name, the function declaration is hoisted first, and the `var` does not overwrite it **until its assignment runs**.

```js run title="Same name: function declaration vs var"
console.log(typeof item);       // the function won

var item = "a string now";
function item() {}

console.log(typeof item);       // now the assignment has run
```

## The classic puzzles

Predict the output of each, then run.

```js run title="Puzzle 1: hoisting in a function"
var x = "outer";

function test() {
  console.log(x);                // what is x here?
  var x = "inner";
  console.log(x);
}

test();
```

Inside `test`, the local `var x` is hoisted to the top of `test`. So the first `console.log` sees the **local** `x`, which is `undefined`, and not `"outer"`. This surprises many people.

```js run title="Puzzle 2: two functions with the same name"
function foo() {
  return "first";
}

var result = foo();

function foo() {
  return "second";
}

console.log(result);
```

Both declarations of `foo` are hoisted, and the **later** one wins. So `foo()` returns `"second"`.

```js run title="Puzzle 3: typeof is not always safe"
console.log(typeof neverDeclared);   // "undefined": safe for names that do not exist

try {
  console.log(typeof inTheZone);     // this name exists, but it is in the TDZ
} catch (e) {
  console.log(e.name + ": " + e.message);
}

let inTheZone = 1;
```

`typeof` is usually safe on names that do not exist. But it is **not** safe for a `let` or `const` that is declared later in the same scope. That name exists, and it is in the TDZ.

## Hoisting in classes

Classes are hoisted like `let`: the name exists but is in the TDZ.

```js run title="Classes are in the TDZ before their declaration"
try {
  new Animal();
} catch (e) {
  console.log(e.name + ": " + e.message);
}

class Animal {}
console.log(typeof Animal);
```

## Common mistakes and good habits

:::warn Common mistakes
- Believing "the code moves to the top". It does not. Only the **creation phase** sets up the names.
- Calling a function expression or arrow function before its line.
- Reusing a `var` name inside a function and shadowing an outer variable by accident (puzzle 1).
:::

- Declare variables at the top of their scope and **before use**.
- Use `const` and `let`, and let the TDZ catch your mistakes early.
- Use function declarations for helpers if you like top-down reading, but still be careful with order for classes and `const`.

:::interview What is hoisting? Does it work the same for var, let, const and functions?
"Hoisting is the effect of the creation phase: before running a scope, JavaScript registers all declarations, so the names exist before their line. A function declaration is hoisted with its body, so I can call it early. `var` is hoisted and set to `undefined`. `let`, `const` and `class` are also hoisted, but they stay uninitialised in the temporal dead zone, so using them early throws a ReferenceError. Function expressions and arrow functions follow the rules of the variable they are assigned to."
:::

## More interview questions on this topic

:::qa What is the output of `console.log(a); var a = 5;`? {level=easy}
**Say this:** "`undefined`. The declaration `var a` is hoisted and initialised with `undefined`. The assignment stays where it is."

**In simple words:** The name exists from the start. The value `5` arrives only when that line runs.
:::

:::qa Why does `typeof x` throw for a `let` in the TDZ but not for an undeclared name? {level=hard}
**Say this:** "For a name that does not exist, `typeof` returns `'undefined'` for safety. But a `let` in the TDZ does exist. Touching it, even with `typeof`, throws a ReferenceError."

**In simple words:** The engine knows the name is reserved but not ready. It refuses any access.
:::

:::qa If `let` and `const` are hoisted, why do people say they are "not hoisted"? {level=medium}
**Say this:** "Because you cannot use them before the declaration. But they are hoisted: an inner `let` shadows an outer variable of the same name for the whole block, even before the declaration line."

**In simple words:** Proof: if `let x` was not hoisted, the code before it would use the outer `x`. Instead it throws, which shows that the inner `x` already exists.
:::

:::qa What happens if a function declaration and a `var` have the same name? {level=hard}
**Say this:** "Both are hoisted, and the function wins at first. A later assignment to the `var` replaces the function when it runs."

**In simple words:** Before the assignment line, you see the function. After it, you see the new value.
:::

```quiz
? What does this print? `console.log(typeof fn); var fn = function () {};`
- "function"
+ "undefined"
- It throws
> The var is hoisted as undefined. The function is assigned only when the line runs.
? Which of these can you call before its declaration line?
+ A function declaration
- An arrow function stored in a const
- A class
> Only function declarations are hoisted together with their body.
? Which error do you get when you read a `const` before its line?
- TypeError
+ ReferenceError
- SyntaxError
> It is in the temporal dead zone: ReferenceError.
```

:::keypoints
- Hoisting is a **side effect of the creation phase**. Nothing physically moves.
- Function declarations: fully hoisted. `var`: name only, value `undefined`. `let`/`const`/`class`: in the TDZ.
- Function expressions and arrows depend on the variable that holds them.
- A local `var` can **shadow** an outer variable from the very top of the function.
- Declare before use, and prefer `const` / `let`.
:::
