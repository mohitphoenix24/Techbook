---
title: Method calls and the "lost this" problem
level: intermediate
time: 30
summary: Why obj.method() works but const fn = obj.method; fn() does not, how callbacks lose this (setTimeout, forEach, event handlers), and the fixes.
---

## The question that is asked in almost every interview

```js run title="Why does this print undefined?" 
const user = {
  name: "Asha",
  sayName() {
    return "My name is " + (this && this.name);
  },
};

console.log(user.sayName());       // called as a method

const fn = user.sayName;           // copy the function out
console.log(fn());                 // called as a plain function
```

The first call prints `My name is Asha`. The second prints `My name is undefined`. Same function, different call.

## Why?

`this` is not stored in the function. It is decided **at the moment of the call**, by looking at the **call expression**.

| Call | What the engine sees | `this` |
|---|---|---|
| `user.sayName()` | a **reference with a base object**: `user` | `user` |
| `fn()` | just a function value, no object in front | `undefined` (strict) / global (sloppy) |

When you wrote `const fn = user.sayName`, you copied **only the function**. The link to `user` was **lost**. The function does not "belong" to `user`. It is just a value that `user` happens to hold.

:::analogy A phone number
The function is a phone number written on a card. If you give the card to a friend, the number still works, but the **caller identity** is whoever is making the call now, not the person who first owned the card.
:::

## The ways `this` gets lost

### 1. Assigning a method to a variable

Shown above. Also happens when you **destructure** a method:

```js run title="Destructuring loses this"
const counter = {
  count: 0,
  inc() { this.count++; return this.count; },
};

const { inc } = counter;
try {
  inc();
} catch (e) {
  console.log(e.name + ": " + e.message);
}
console.log(counter.inc());
```

### 2. Passing a method as a callback

When you pass `obj.method` to another function, that function calls it **plainly**.

```js run title="A callback is called without the object"
const timer = {
  label: "Tea",
  ring() { console.log("ring:", this && this.label); },
};

setTimeout(timer.ring, 0);               // plain call by the timer: this is not timer
setTimeout(() => timer.ring(), 0);       // a wrapper: now the dot is back
```

### 3. A nested function inside a method

```js run title="A function inside a method gets its own this"
const team = {
  name: "Core",
  members: ["Asha", "Ravi"],
  printAll() {
    this.members.forEach(function (member) {
      // this is NOT team here: forEach calls this function plainly
      console.log(member, "is in", this && this.name);
    });
  },
};

team.printAll();
```

### 4. DOM event handlers

In a browser, an event handler written as a normal function gets `this = the element`. A method passed as a handler gets the element, not your object.

```html run preview height=70 title="this in a DOM handler"
<button id="b">Click me</button>
<script>
  const widget = {
    clicks: 0,
    handler(event) {
      console.log("this is the button:", this === document.getElementById("b"));
      console.log("this is widget:", this === widget);
    },
  };
  const btn = document.getElementById("b");
  btn.addEventListener("click", widget.handler);       // the method is called with this = button
  btn.click();
</script>
```

## The fixes

### Fix 1: wrap in an arrow function (or a normal function)

```js run title="Fix 1: wrap the call"
const timer = {
  label: "Tea",
  ring() { console.log("ring:", this.label); },
};

setTimeout(() => timer.ring(), 0);
```

### Fix 2: `bind`

```js run title="Fix 2: bind"
const timer = {
  label: "Coffee",
  ring() { console.log("ring:", this.label); },
};

const ring = timer.ring.bind(timer);       // a new function with this fixed
setTimeout(ring, 0);
```

### Fix 3: use an arrow function inside the method

An arrow function does not have its own `this`. It uses the `this` of `printAll`:

```js run title="Fix 3: arrow callback inside a method"
const team = {
  name: "Core",
  members: ["Asha", "Ravi"],
  printAll() {
    this.members.forEach((member) => {
      console.log(member, "is in", this.name);     // this = team
    });
  },
};

team.printAll();
```

### Fix 4: pass `thisArg` (some array methods allow it)

```js run title="Fix 4: thisArg of forEach / map"
const team = {
  name: "Core",
  members: ["Asha", "Ravi"],
  printAll() {
    this.members.forEach(function (member) {
      console.log(member, "is in", this.name);
    }, this);                                      // second argument = this for the callback
  },
};

team.printAll();
```

### Fix 5 (old style): save `this` in a variable

```js run title="Fix 5: const self = this (older code)"
const team = {
  name: "Core",
  members: ["Asha"],
  printAll() {
    const self = this;                             // a closure over self
    this.members.forEach(function (member) {
      console.log(member, "is in", self.name);
    });
  },
};

team.printAll();
```

You will still meet `self = this` and `that = this` in old code. Today use arrow functions.

## Object literal arrow functions are a trap

```js run sloppy title="Do not use an arrow as an object method"
const wrong = {
  owner: "Asha",
  hello: () => "Hello, " + this.owner,  // this is the outer this (global object here), not `wrong`
};

console.log(wrong.hello());
```

An arrow function used as a **method** does not get the object as `this`. It uses the `this` of the code around the object literal, which is usually the module or the global object. Use method shorthand `hello() { ... }` for methods.

:::interview `const fn = obj.method; fn()` gives undefined for this. Why?
"`this` depends on the call, not where the function is defined. `obj.method()` has `obj` before the dot, so `this` is `obj`. When I copy the function to `fn` and call `fn()`, there is no object in front, so it is a plain call: `this` is `undefined` in strict mode or the global object in sloppy mode. Passing a method as a callback does the same. I fix it by calling through the object, wrapping in an arrow function, using `bind`, or defining the callback as an arrow function so it uses the surrounding `this`."
:::

## More interview questions on this topic

:::qa Why does `setTimeout(obj.method, 100)` lose `this`? {level=easy}
**Say this:** "`setTimeout` receives only the function, and calls it later as a plain function, so there is no object before the dot."

**In simple words:** The timer has no idea which object the function came from. Wrap it or bind it.
:::

:::qa How can you keep `this` inside a callback? List three ways. {level=easy}
**Say this:** "Use an arrow function, use `bind`, or pass `thisArg` where supported. The old way is `const self = this`."

**In simple words:** All of them either capture the right `this` or fix it for later.
:::

:::qa Why is it a bad idea to define object methods with arrow functions? {level=medium}
**Say this:** "Arrow functions do not get `this` from the call. They use the outer `this`, so `this.name` will not refer to the object."

**In simple words:** For methods that need the object, use the method shorthand `name() {}`.
:::

:::qa What is `this` inside an event handler? {level=medium}
**Say this:** "For a normal function, it is the element the listener is attached to, the same as `event.currentTarget`. For an arrow function, it is the outer `this`."

**In simple words:** The browser calls your handler with the element as `this`.
:::

```quiz
? What is `this` in `const f = obj.method; f();` (strict mode)?
- obj
+ undefined
- window
> A plain call has no base object.
? Which of these keeps `this` as `team` inside the callback?
- `this.members.forEach(function (m) { this.name })`
+ `this.members.forEach((m) => { this.name })`
- `this.members.forEach(console.log)`
> An arrow function uses the this of printAll.
? What does `bind` return?
- It calls the function at once
+ A new function with this (and optionally arguments) fixed
- The same function, changed
> The original function is not modified.
```

:::keypoints
- `obj.method()` → `this` is `obj`. `const f = obj.method; f()` → the link is **lost**.
- Methods lose `this` when **copied**, **destructured**, **passed as callbacks** or used in **nested functions**.
- Fixes: arrow function wrapper, `bind`, `thisArg`, arrow callback inside the method, `self = this` (old).
- Never use an **arrow function** as an object method that needs `this`.
:::
