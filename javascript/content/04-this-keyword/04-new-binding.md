---
title: The new keyword and constructor functions
level: intermediate
time: 25
summary: What new does in four steps, how a constructor function sets up an object, what happens when you forget new, what a constructor can return, new.target, and how to write your own new.
---

## What does `new` do?

When you call a function with `new`, JavaScript does **four things** for you:

:::flow The four steps of new
1. Create an empty object | `const obj = {}`
2. Link its prototype | `obj.[[Prototype]] = Constructor.prototype`, so it can use shared methods
3. Run the constructor with `this = obj` | the constructor fills in the properties
4. Return the object | unless the constructor returns another **object**
:::

```js run title="A constructor function"
function Person(name, age) {
  this.name = name;                        // 3. this is the new object
  this.age = age;
}

Person.prototype.greet = function () {     // shared by all persons
  return `Hi, I am ${this.name}`;
};

const asha = new Person("Asha", 25);
console.log(asha);
console.log(asha.greet());
console.log(Object.getPrototypeOf(asha) === Person.prototype);
```

By convention, constructor functions start with a **capital letter**.

## Writing `new` yourself

Interviewers love this because it shows you understand all four steps.

```js run title="myNew(Constructor, ...args)"
function myNew(Constructor, ...args) {
  const obj = Object.create(Constructor.prototype);     // steps 1 and 2
  const result = Constructor.apply(obj, args);          // step 3
  const returnedAnObject = result !== null && (typeof result === "object" || typeof result === "function");
  return returnedAnObject ? result : obj;               // step 4
}

function Car(brand) { this.brand = brand; }
Car.prototype.honk = function () { return this.brand + " goes beep"; };

const c = myNew(Car, "Tata");
console.log(c, c.honk(), c instanceof Car);
```

## What a constructor can return

- Nothing, or a **primitive** (number, string...): the new object is used. The return value is **ignored**.
- An **object** (including arrays and functions): that object is returned, and the new one is **thrown away**.

```js run title="Return rules"
function ReturnsPrimitive() { this.a = 1; return 42; }
function ReturnsObject() { this.a = 1; return { other: true }; }

console.log(new ReturnsPrimitive());
console.log(new ReturnsObject());
```

## Forgetting `new`

If you call a constructor **without** `new`, `this` is `undefined` (strict) or the **global object** (sloppy): in sloppy mode you set globals by accident.

```js run sloppy title="Forgetting new in sloppy mode"
function User(name) { this.name = name; }

const u = User("Asha");                // forgot new
console.log(u);                        // undefined: no return
console.log(globalThis.name);          // the global got polluted
```

Protect your constructor with `new.target`:

```js run title="new.target tells you how the function was called"
function Safe(name) {
  if (!new.target) return new Safe(name);        // called without new: fix it
  this.name = name;
}

console.log(Safe("Asha"));
console.log(new Safe("Ravi"));
```

`class` constructors **always** throw if called without `new`, which is one more reason to use classes:

```js run title="Classes refuse to run without new" 
class Box {
  constructor(v) { this.v = v; }
}

try {
  Box(1);
} catch (e) {
  console.log(e.name + ": " + e.message);
}
```

## Which things can be used with `new`?

| Callable | `new` works? |
|---|---|
| `function` declaration / expression | yes (unless it is a method shorthand or async/generator) |
| `class` | yes (required) |
| Arrow function | **no**: `TypeError: ... is not a constructor` |
| Method shorthand `{ m() {} }` | no |
| `async function`, generator | no |
| Built-ins like `Date`, `Map`, `Promise` | yes; `Symbol` and `BigInt` throw |

```js run title="An arrow function is not a constructor"
const Arrow = () => {};
try {
  new Arrow();
} catch (e) {
  console.log(e.name + ": " + e.message);
}
```

## `new` and `bind`

A function created by `bind` can still be used with `new`. The bound `this` is **ignored**, but bound arguments are used. You saw this in the [call, apply and bind lesson](#/l/call-apply-bind).

:::interview What does the new keyword do?
"It creates a new empty object, links its prototype to `Constructor.prototype`, runs the constructor with `this` set to that object, and returns it. If the constructor returns its own object, that object is returned instead. Arrow functions and methods cannot be used with `new`, and `class` constructors throw if you forget it. `new.target` lets a function check how it was called."
:::

## More interview questions on this topic

:::qa What happens if a constructor returns an object? A primitive? {level=medium}
**Say this:** "If it returns an object, `new` gives you that object. If it returns a primitive or nothing, `new` gives you the new instance and ignores the return value."

**In simple words:** An explicit object return overrides the new object. Primitives do not.
:::

:::qa How do you stop a constructor from being called without `new`? {level=medium}
**Say this:** "Check `new.target`, or use a `class`, which throws automatically."

**In simple words:** `new.target` is `undefined` for a plain call, and the constructor function for a `new` call.
:::

:::qa Why can't you use `new` with an arrow function? {level=medium}
**Say this:** "Arrow functions have no `this` and no `prototype`, and no internal [[Construct]] method, so they cannot be constructors."

**In simple words:** `new` needs to make an object and bind `this` to it. Arrows cannot take a `this`.
:::

:::qa Write a function that behaves like `new`. {level=medium}
**Say this:** "Create `Object.create(Constructor.prototype)`, call the constructor with that object as `this`, and return the result if it is an object, otherwise the new object."

**In simple words:** Four steps, as in the `myNew` example above.
:::

```quiz
? What is the first thing `new` does?
- Runs the constructor
+ Creates a new empty object
- Returns the object
> Then it links the prototype, runs the constructor, and returns.
? A constructor returns `{ a: 1 }`. What does `new` give back?
- The new instance
+ The returned object `{ a: 1 }`
- undefined
> Returning an object overrides the new instance.
? What is `new.target` inside a function called without new?
- The function
+ undefined
- The global object
> It is only set when new is used.
```

:::keypoints
- `new` = create object → link prototype → run constructor with `this` → return it (unless an **object** is returned).
- **Arrow functions** cannot be constructors. **Class** constructors require `new`.
- Use `new.target` to detect a call without `new`.
- Constructors put **data** on `this`; shared **methods** go on the prototype.
:::
