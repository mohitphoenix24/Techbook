---
title: extends and super: how inheritance is wired
level: intermediate
time: 30
summary: What class extends sets up (two chains), how super() and super.method() work, why this is unavailable before super(), extending built-ins like Array and Error, and common mistakes.
---

## Two chains, not one

When you write `class Dog extends Animal`, JavaScript links **two** pairs of objects:

1. **Instances:** `Dog.prototype` → `Animal.prototype`. This makes **instance methods** inherited.
2. **Classes:** `Dog` → `Animal` (the class function itself). This makes **static methods** inherited.

```js run title="Both chains"
class Animal {
  static kingdom() { return "Animalia"; }
  speak() { return "..."; }
}
class Dog extends Animal {
  speak() { return "Woof"; }
}

console.log(Object.getPrototypeOf(Dog.prototype) === Animal.prototype);   // instance chain
console.log(Object.getPrototypeOf(Dog) === Animal);                        // static chain
console.log(Dog.kingdom());                                                // static inherited
console.log(new Dog().speak());
```

```viz algo=chain title="class Dog extends Animal"
node dogC "Dog (class)" @0,0 [fn]
  prototype: ->
node animC "Animal (class)" @0,1 [fn]
  kingdom: static
node dogP "Dog.prototype" @1,0 [hl]
  speak: overrides
node animP "Animal.prototype" @1,1
  speak: function
node d "d = new Dog()" @2,0
link dogC -> animC : [[Prototype]] (statics)
link dogP -> animP : [[Prototype]] (instances)
link d -> dogP : [[Prototype]]
link dogC -> dogP : .prototype
link animC -> animP : .prototype
```

## `super()`: calling the parent constructor

In a **derived class** (one with `extends`), the constructor **must call `super(...)` before it uses `this`**. Why? Because in a derived class the **parent constructor creates the object**. Until `super()` returns, there is no `this`.

```js run title="super() creates this"
class Person {
  constructor(name) {
    this.name = name;
  }
}

class Student extends Person {
  constructor(name, course) {
    super(name);                        // runs Person's constructor, creating this
    this.course = course;               // now it is safe
  }
}

console.log(new Student("Asha", "CS"));
```

If you do not write a constructor in the derived class, JavaScript adds one for you: `constructor(...args) { super(...args); }`.

## `super.method()`: calling a parent method

```js run title="Extending behaviour with super.method()"
class Logger {
  log(msg) { return `[LOG] ${msg}`; }
}

class TimeLogger extends Logger {
  log(msg) {
    return super.log(`${msg} (at 10:00)`);    // reuse the parent's version
  }
}

console.log(new TimeLogger().log("started"));
```

`super.method()` looks up `method` on the **parent's prototype**, but calls it with the **current `this`**. So the parent method works on the child instance.

## `super` in static methods and object literals

- In a **static method**, `super.x` refers to the parent **class** (`Parent.x`).
- In **object literal methods**, `super` refers to the object's prototype (with method shorthand only).

```js run title="super in statics and in object literals"
class A { static who() { return "A"; } }
class B extends A { static who() { return "B -> " + super.who(); } }
console.log(B.who());

const base = { hi() { return "base hi"; } };
const obj = { __proto__: base, hi() { return "obj + " + super.hi(); } };
console.log(obj.hi());
```

## Overriding and polymorphism

Because `this` stays the child, parent code calling `this.method()` can reach the child's override. This is **polymorphism**.

```js run title="Polymorphism"
class Shape {
  area() { return 0; }
  describe() { return `${this.constructor.name} with area ${this.area().toFixed(1)}`; }
}
class Circle extends Shape {
  constructor(r) { super(); this.r = r; }
  area() { return Math.PI * this.r ** 2; }
}
class Square extends Shape {
  constructor(s) { super(); this.s = s; }
  area() { return this.s ** 2; }
}

for (const shape of [new Circle(2), new Square(3), new Shape()]) {
  console.log(shape.describe());
}
```

## Extending built-ins

You can extend `Array`, `Error`, `Map`, `Promise` and others. This is the base for custom errors.

```js run title="Custom Error classes"
class ValidationError extends Error {
  constructor(message, field) {
    super(message);                          // sets message and the stack
    this.name = "ValidationError";           // shown in stack traces and toString
    this.field = field;
  }
}

try {
  throw new ValidationError("Email is invalid", "email");
} catch (e) {
  console.log(e instanceof ValidationError, e instanceof Error);
  console.log(e.name, "-", e.message, "- field:", e.field);
  console.log(String(e));
}
```

```js run title="Extending Array"
class Stack extends Array {
  peek() { return this[this.length - 1]; }
}

const s = new Stack();
s.push(1, 2, 3);
console.log(s.peek(), s.length, s instanceof Array, Array.isArray(s));

const mapped = s.map((x) => x * 2);           // map returns a Stack too (Symbol.species)
console.log(mapped instanceof Stack, mapped.peek());
```

Methods like `map`, `filter` and `slice` create their result with the **constructor of the instance** (controlled by `Symbol.species`), so subclasses of `Array` get subclass results.

## Calling a parent that is not a class

`extends` accepts **any constructor**, including an old-style function, or even an expression:

```js run title="extends works with constructor functions"
function OldAnimal(name) { this.name = name; }
OldAnimal.prototype.hello = function () { return "hello from " + this.name; };

class NewDog extends OldAnimal {
  constructor(name) { super(name); }
}

console.log(new NewDog("Bruno").hello());
```

## `new.target` in inheritance

`new.target` is the class that was **actually** used with `new`, even inside a parent's constructor. It is how you build **abstract classes**:

```js run title="An abstract base class"
class Shape {
  constructor() {
    if (new.target === Shape) throw new TypeError("Shape is abstract: extend it");
    if (typeof this.area !== "function") throw new TypeError(`${new.target.name} must implement area()`);
  }
}
class Circle extends Shape { area() { return 3; } }
class Broken extends Shape {}

console.log(new Circle() instanceof Shape);
for (const C of [Shape, Broken]) {
  try { new C(); } catch (e) { console.log(e.message); }
}
```

## Common mistakes

:::warn Mistakes with extends
- Using `this` **before** `super()` → `ReferenceError`.
- Forgetting `super()` entirely → `ReferenceError: Must call super constructor...`.
- Returning a non-object from a derived constructor → `TypeError`.
- Not setting `this.name` in custom errors (the `name` is then `"Error"`).
- Deep inheritance trees. If a hierarchy has more than 2 or 3 levels, think about **composition**.
:::

:::interview What does `super` do? What happens if you forget `super()` in a derived constructor?
"In a constructor, `super(...)` calls the parent constructor, which creates the object, so it must run before `this` can be used. `super.method()` calls the parent's method with the current `this`. In static methods, `super` refers to the parent class. If a derived constructor never calls `super()`, accessing `this` or returning throws a ReferenceError. `extends` links two chains: the prototypes for instance methods and the classes themselves for static methods."
:::

## More interview questions on this topic

:::qa Why can't you use `this` before calling `super()`? {level=medium}
**Say this:** "In a derived class, the object is created by the base constructor. `super()` runs it. Before that, `this` is uninitialised, so touching it is a ReferenceError."

**In simple words:** The child gets its body from the parent. No parent call, no body.
:::

:::qa Are static methods inherited? {level=easy}
**Say this:** "Yes. `extends` also sets `Child.__proto__ = Parent`, so `Child.staticMethod()` finds the parent's static method."

**In simple words:** The class functions are linked too, not just the instances.
:::

:::qa How do you create a custom error class correctly? {level=medium}
**Say this:** "Extend `Error`, call `super(message)`, set `this.name`, and add any extra fields. Optionally pass `{ cause }` as the second argument to `super`."

**In simple words:** Keep the standard error behaviour, add your own details.
:::

:::qa How can you build an abstract class in JavaScript? {level=hard}
**Say this:** "Check `new.target` in the constructor and throw if it equals the abstract class itself, and optionally check that required methods exist."

**In simple words:** JavaScript has no `abstract` keyword, so you enforce it with a runtime check.
:::

```quiz
? What does `class B extends A` link?
- Only B.prototype to A.prototype
+ B.prototype to A.prototype and B to A (statics)
- B to A.prototype
> Both chains are wired.
? When must `super()` be called in a derived constructor?
- After using this
+ Before using this
- Never, it is optional
> The parent constructor creates the object.
? Inside a parent constructor, what is `new.target` when you run `new Child()`?
- Parent
+ Child
- undefined
> It is the class used with new.
```

:::keypoints
- `extends` links **instances** (`Child.prototype → Parent.prototype`) and **statics** (`Child → Parent`).
- In a derived constructor, call **`super()` first**; it creates `this`.
- `super.method()` runs the parent's method with the **current `this`**.
- Extend `Error` for custom errors: `super(message)` + `this.name`.
- `new.target` helps build **abstract** classes. Prefer **composition** to deep hierarchies.
:::
