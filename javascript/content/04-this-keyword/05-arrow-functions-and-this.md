---
title: Arrow functions and lexical this
level: intermediate
time: 25
summary: How arrow functions differ from normal functions (no own this, arguments, prototype or new), when to use each, and the trap of arrow methods and arrow functions in prototypes.
---

## An arrow function has no `this` of its own

> "A normal function asks, 'who called me?' to find its `this`. An arrow function does not ask. It simply uses the `this` of the **place where it was written**."

This is called **lexical `this`** (lexical = decided by the written position, like scope).

```js run title="Arrow functions use the surrounding this"
const team = {
  name: "Core",
  members: ["Asha", "Ravi"],

  listNormal() {
    return this.members.map(function (m) {
      return m + " @ " + (this && this.name);       // normal function: this is lost
    });
  },

  listArrow() {
    return this.members.map((m) => m + " @ " + this.name);   // arrow: this = team
  },
};

console.log(team.listNormal());
console.log(team.listArrow());
```

The arrow function inside `listArrow` has no `this`, so JavaScript looks outwards, like for any variable, and finds the `this` of `listArrow`, which is `team`.

## What else is missing from arrow functions

| Feature | Normal function | Arrow function |
|---|---|---|
| Own `this` | yes (set by the call) | **no** (lexical) |
| `call` / `apply` / `bind` can change `this` | yes | **no** (ignored) |
| Own `arguments` object | yes | **no** (use `...args`) |
| Can be used with `new` | yes | **no** |
| Has a `prototype` property | yes | **no** |
| Can be a generator (`function*`) | yes | **no** |
| Implicit return with `=>` and no braces | no | yes |

```js run title="call/bind cannot change an arrow's this" sloppy
const arrow = () => this === globalThis;      // sloppy: the outer this is globalThis here
console.log(arrow.call({ x: 1 }));
console.log(arrow.bind({ x: 1 })());
```

```js run title="No arguments object in an arrow"
function normal() { return arguments.length; }
const arrow = (...args) => args.length;

console.log(normal(1, 2, 3));
console.log(arrow(1, 2, 3));

function outer() {
  const inner = () => arguments[0];           // an arrow uses the arguments of outer
  return inner("ignored");
}
console.log(outer("from outer"));
```

## When to use which

**Use an arrow function for:**

- Callbacks that should keep the outer `this` (`map`, `forEach`, `setTimeout`, promise handlers).
- Short one-line functions: `(a, b) => a + b`.
- Class fields that need a bound handler (`handleClick = () => {...}`).

**Use a normal function (or method shorthand) for:**

- **Object methods** that use `this` for the object.
- **Prototype methods** assigned with `Constructor.prototype.method = function () {}`.
- **Constructors** (anything used with `new`).
- Functions that need their own `arguments` or must be **hoisted**.
- Event handlers where you want `this` to be the element (usually `event.currentTarget` is better and works with arrows).
- Functions where `call`/`apply` must set `this` (for example, when writing a library).

## Traps

### 1. Arrow function as an object method

```js run sloppy title="Arrow as an object method"
const user = {
  owner: "Asha",
  arrowHello: () => "Hello " + this.owner,       // this is NOT user
  normalHello() { return "Hello " + this.owner; },
};
console.log(user.arrowHello());
console.log(user.normalHello());
```

### 2. Arrow function on a prototype

```js run sloppy title="Arrow on a prototype"
function Dog(owner) { this.owner = owner; }

Dog.prototype.bad = () => "I am " + this.owner;               // this is the outer this
Dog.prototype.good = function () { return "I am " + this.owner; };

const d = new Dog("Bruno");
console.log(d.bad());
console.log(d.good());
```

### 3. Returning an object literal

Braces after `=>` start a **function body**, not an object. Wrap the object in parentheses.

```js run title="Return an object from an arrow"
const wrong = () => { id: 1 };           // a block with a label: returns undefined
const right = () => ({ id: 1 });          // parentheses make it an object

console.log(wrong());
console.log(right());
```

### 4. Using `this` in a top-level arrow

At the top of a module, `this` is `undefined`. In CommonJS it is `module.exports`. So an arrow at the top level does not refer to anything useful.

## Class fields with arrows: a fix for lost this

```js run title="An arrow class field keeps this bound"
class Button {
  label = "Save";
  clickNormal() { return this.label; }           // loses this when detached
  clickArrow = () => this.label;                 // created per instance: always bound
}

const b = new Button();
const { clickNormal, clickArrow } = b;

console.log(clickArrow());
try { console.log(clickNormal()); } catch (e) { console.log(e.name); }
```

The cost: an arrow class field creates a new function **for every instance**, instead of sharing one method on the prototype. For thousands of instances, prefer `bind` in the constructor or call-site wrappers.

:::interview How do arrow functions differ from regular functions?
"Arrow functions do not have their own `this`, `arguments` or `prototype`, and they cannot be used with `new`. Their `this` is taken from the surrounding scope where they are written, and `call`, `apply` or `bind` cannot change it. So they are great for callbacks that need the outer `this`, but wrong for object methods, prototype methods and constructors. They also allow short syntax with an implicit return."
:::

## More interview questions on this topic

:::qa What does "lexical this" mean? {level=easy}
**Say this:** "The arrow function's `this` is decided by where it is written, from the enclosing function or module, not by how it is called."

**In simple words:** An arrow function borrows `this` from the code around it.
:::

:::qa Can `bind` change the `this` of an arrow function? {level=medium}
**Say this:** "No. The call is accepted but `this` is ignored. You can still bind arguments."

**In simple words:** There is no own `this` to replace.
:::

:::qa Why shouldn't you use an arrow function as a method on a prototype? {level=medium}
**Say this:** "Its `this` will not be the instance. It will be the outer `this`, often the module or global object."

**In simple words:** The method would not be able to read the object's own data.
:::

:::qa Do arrow functions have an `arguments` object? {level=easy}
**Say this:** "No. Use rest parameters `(...args)`. An arrow inside a normal function sees that function's `arguments`."

**In simple words:** Rest parameters are cleaner anyway.
:::

```quiz
? Which feature does an arrow function NOT have?
- Parameters
+ Its own this
- Return values
> It uses the surrounding this.
? What does `const f = () => { value: 1 };` return when called?
- { value: 1 }
+ undefined
- A SyntaxError
> The braces are a function body with a label. Use ({ value: 1 }).
? Where should you avoid arrow functions?
- In array callbacks
+ As object methods that use this, and as constructors
- In promise handlers
> Both need a this based on the call or the new object.
```

:::keypoints
- Arrow functions have **no `this`, `arguments`, `prototype`**, and cannot be used with `new`.
- Their `this` is **lexical**: from where they are written. `call`/`apply`/`bind` cannot change it.
- Great for **callbacks**; avoid for **methods**, **prototype methods** and **constructors**.
- `() => ({ ... })` to return an object literal.
- Arrow class fields keep `this` bound but make one function per instance.
:::
