---
title: What is this? The four rules
level: intermediate
time: 30
summary: this is decided by HOW a function is called, not where it is written. The four rules (default, implicit, explicit, new), their priority, and the one exception: arrow functions.
---

## The one idea to remember

Don't try to memorise lots of rules yet. Start with this single sentence:

> "**`this` is not decided when you write the function. It is decided when the function is called, by looking at HOW it is called.**"

(The only exception is the arrow function, which has no `this` of its own. We will see it soon.)

:::analogy The word "I"
When you say "I", it means a different person depending on who is speaking. The word "I" does not belong to the sentence. It belongs to the **speaker**. In the same way, `this` inside a function means whoever is "speaking": the object that called it.
:::

## The same function, three different `this`

```js run title="One function, different callers"
function introduce() {
  return "I am " + (this && this.name);
}

const asha = { name: "Asha", introduce };
const ravi = { name: "Ravi", introduce };

console.log(asha.introduce());     // called on asha
console.log(ravi.introduce());     // called on ravi
console.log(introduce());          // called on nothing (strict mode here)
```

The function body never changed. Only the **call** changed. The object before the dot (`asha.` or `ravi.`) became `this`.

## The four rules

Look at the call and ask these questions **in this order**. The first "yes" wins.

:::flow How to find this
1. Was it called with `new`? | `this` is the **new object** being created.
2. Was it called with `call`, `apply` or `bind`? | `this` is the object you **passed**.
3. Was it called as a method, `obj.method()`? | `this` is **`obj`**, the object before the dot.
4. None of the above (plain call)? | `this` is **`undefined`** in strict mode, the **global object** in sloppy mode.
:::

Arrow functions skip all four rules. They take `this` from the surrounding code where they were **written**.

### Rule 1: `new` binding

```js run title="new makes a fresh object"
function Person(name) {
  this.name = name;           // this = the new empty object
}

const p = new Person("Meera");
console.log(p);
```

### Rule 2: explicit binding (`call`, `apply`, `bind`)

```js run title="You choose this"
function greet(greeting) {
  return `${greeting}, ${this.name}`;
}

const user = { name: "Kiran" };
console.log(greet.call(user, "Hello"));
console.log(greet.apply(user, ["Namaste"]));

const bound = greet.bind(user, "Hi");
console.log(bound());
```

### Rule 3: implicit binding (method call)

```js run title="The object before the dot"
const car = {
  brand: "Tata",
  describe() { return "This is a " + this.brand; },
};

console.log(car.describe());
```

### Rule 4: default binding (plain call)

```js run title="A plain call: strict mode" 
function whoIs() {
  return this;
}
console.log(whoIs());           // strict mode: undefined
```

```js run sloppy title="A plain call: sloppy mode"
function whoIs() {
  return this === globalThis;
}
console.log(whoIs());           // sloppy mode: the global object
```

## Priority: when rules collide

If more than one rule could apply, **`new` beats explicit, explicit beats implicit, implicit beats default**.

```js run title="Priority: new > explicit > method"
const obj = { name: "obj", getName() { return this.name; } };
console.log(obj.getName());                          // implicit: obj
console.log(obj.getName.call({ name: "explicit" })); // explicit beats implicit

function Show() { this.who = "new object"; }
const other = { who: "other" };
const BoundShow = Show.bind(other);
const instance = new BoundShow();                    // new beats bind
console.log(instance.who, other.who);
```

Even though `Show` was bound to `other`, `new BoundShow()` still made a **new** object. And `bind` cannot be overridden by a later `call`:

```js run title="bind is permanent"
function who() { return this.name; }

const first = who.bind({ name: "first" });
console.log(first.call({ name: "second" }));    // still "first"
```

## What about the global object and `window`?

In sloppy mode, a plain call gets `this = globalThis` (the `window` in a browser). That is why old code could do `this.x = 5` and create a global by accident. Strict mode (and modules, and classes) sets `this` to `undefined` in this case, which gives a clear error instead of a silent bug.

## Where `this` is NOT what beginners expect

| Place | `this` is |
|---|---|
| Top level of a **module** file | `undefined` |
| Top level of a **CommonJS** file (Node) | `module.exports` |
| Top level of a **classic browser script** | `window` |
| Inside a **class method** | The instance, if called as `obj.method()` |
| Inside a **DOM event handler** (function, not arrow) | The element the handler is attached to (`event.currentTarget`) |
| Inside a **setTimeout callback** (normal function) | `globalThis` in sloppy mode, `undefined` in strict mode (in browsers: `window`) |
| Inside an **arrow function** | The `this` of the surrounding code |

:::tip The "dot rule" for quick reading
Look at the call. If you see `something.method()`, `this` is `something`. If you see just `method()`, it is `undefined` (strict) or global (sloppy). If you see `.call`, `.apply` or `.bind`, it is what was passed. If you see `new`, it is the new object.
:::

:::interview How is the value of `this` determined in JavaScript?
"It depends on how the function is called, not where it is defined. If it is called with `new`, `this` is the new object. If it is called with `call`, `apply` or `bind`, it is the object passed in. If it is called as a method, `obj.fn()`, it is the object before the dot. Otherwise it is `undefined` in strict mode, or the global object in sloppy mode. That is the priority order. Arrow functions have no `this` of their own, so they use the `this` of the enclosing scope, fixed where they are written."
:::

## More interview questions on this topic

:::qa What are the rules that decide `this`? List them in priority order. {level=easy}
**Say this:** "`new` binding, then explicit binding with call, apply or bind, then implicit binding as a method of an object, then default binding, which is undefined in strict mode or the global object in sloppy mode. Arrow functions ignore these and use lexical `this`."

**In simple words:** Ask: new? call/apply/bind? dot? Otherwise it is the default.
:::

:::qa What is `this` at the top level of a file? {level=medium}
**Say this:** "In an ES module it is `undefined`. In a CommonJS file it is `module.exports`. In a classic browser script it is `window`."

**In simple words:** It depends on the kind of file, so do not rely on top-level `this`.
:::

:::qa Is `this` the same as the scope of a function? {level=easy}
**Say this:** "No. Scope decides which variables a function can see, and is fixed where it is written. `this` is an object reference decided by how the function is called."

**In simple words:** Two different questions: "which variables?" and "which object?".
:::

:::qa Can you change `this` of a function that was created with `bind`? {level=medium}
**Say this:** "No. A bound function ignores later `call`, `apply` or `bind`. The only thing that overrides it is `new`."

**In simple words:** `bind` glues `this`. Even `call` cannot unglue it.
:::

```quiz
? What is `this` inside a normal function called as `fn()` in strict mode?
- The global object
+ undefined
- The function itself
> A plain call has no object, so strict mode gives undefined.
? Which rule has the highest priority?
- Implicit binding
- Explicit binding
+ new binding
> new > explicit > implicit > default.
? Where is `this` of an arrow function decided?
- When it is called
+ Where it is written (lexical)
- By bind
> Arrow functions have no own this: they use the one around them.
```

:::keypoints
- **`this` is decided by the call**, not by where the function is written (except arrows).
- Four rules, in priority: **new → call/apply/bind → obj.method() → default**.
- Default = `undefined` (strict) or the global object (sloppy).
- `bind` is permanent. Only `new` overrides a bound `this`.
- **Arrow functions** have no `this`; they take it from the surrounding code.
:::
