---
title: What class really is
level: intermediate
time: 25
summary: class is syntax over constructor functions and prototypes. See what a class turns into, how it differs from a plain function (strictness, TDZ, no call without new, non-enumerable methods), and how to write it by hand.
---

## `class` is "sugar" over prototypes

Don't think of JavaScript classes like Java classes. Think of this:

> "A `class` is a **nicer way to write** a constructor function plus prototype methods. Under the hood, it is still the prototype chain."

```js run title="A class, and what it is underneath"
class Person {
  constructor(name) { this.name = name; }
  greet() { return `Hi, I am ${this.name}`; }
  static species() { return "human"; }
}

console.log(typeof Person);                                   // "function"
console.log(Person === Person.prototype.constructor);         // true
console.log(Object.getOwnPropertyNames(Person.prototype));    // greet lives on the prototype
console.log(Object.hasOwn(Person, "species"));                // static methods live on the class itself

const p = new Person("Asha");
console.log(Object.getPrototypeOf(p) === Person.prototype);
console.log(p.greet());
```

## The same thing written by hand

```js run title="Hand-written equivalent of the class"
function Person(name) {
  if (!new.target) throw new TypeError("Class constructor Person cannot be invoked without 'new'");
  this.name = name;
}

Object.defineProperty(Person.prototype, "greet", {
  value: function () { return `Hi, I am ${this.name}`; },
  writable: true,
  configurable: true,
  enumerable: false,                        // class methods are NOT enumerable
});

Person.species = function () { return "human"; };

const p = new Person("Asha");
console.log(p.greet(), "|", Person.species());
```

## How a class differs from a plain constructor function

| | Constructor function | `class` |
|---|---|---|
| Call without `new` | Runs, with the wrong `this` | **Throws** `TypeError` |
| Hoisting | Function declarations are fully hoisted | Hoisted but in the **TDZ** (like `let`) |
| Strict mode | Only if you opt in | **Always strict** inside the body |
| Methods enumerable? | Yes if assigned with `=` | **No** (they will not show up in `for...in`) |
| `extends` support | Manual wiring | Built in (`extends`, `super`) |
| Private fields `#x` | Not possible | Supported |
| Static blocks, accessors | Manual | Built in |

```js run title="Class bodies: strict, non-enumerable, no call without new"
class Demo {
  method() {}
}

for (const key in Demo.prototype) console.log("enumerable:", key);   // prints nothing
console.log(Object.keys(Demo.prototype));

try { Demo(); } catch (e) { console.log(e.name + ": " + e.message); }

try {
  new Later();
} catch (e) {
  console.log(e.name + ": " + e.message);                  // TDZ
}
class Later {}
```

## Class declaration vs class expression

```js run title="Class expressions"
const Animal = class {                       // anonymous class expression
  speak() { return "..."; }
};

const Named = class Dog {                    // named class expression: Dog is visible only inside
  who() { return Dog.name; }
};

console.log(new Animal().speak(), "|", new Named().who(), "|", Animal.name);
```

## What a class returns

A class is a **function object**. You can pass it around, return it from functions (factories), and attach properties to it.

```js run title="Classes are values"
function makeEntity(tableName) {
  return class {
    static table = tableName;
    save() { return `INSERT INTO ${this.constructor.table}`; }
  };
}

const User = makeEntity("users");
const Order = makeEntity("orders");
console.log(new User().save(), "|", new Order().save());
```

## Instance fields vs prototype methods

```js run title="Where do fields and methods go?"
class Counter {
  count = 0;                                   // field: own property on each instance
  inc() { this.count++; }                      // method: ONE copy on the prototype
  incArrow = () => { this.count++; };          // arrow field: own property, a new function per instance
}

const a = new Counter(), b = new Counter();
console.log(Object.keys(a));                   // fields are own properties
console.log(a.inc === b.inc, a.incArrow === b.incArrow);
```

## Getters and setters in classes

```js run title="Accessors"
class Temperature {
  #celsius = 0;
  get fahrenheit() { return this.#celsius * 9 / 5 + 32; }
  set fahrenheit(f) { this.#celsius = (f - 32) * 5 / 9; }
  get celsius() { return this.#celsius; }
}

const t = new Temperature();
t.fahrenheit = 212;
console.log(t.celsius, t.fahrenheit);
console.log(Object.keys(t));                   // #celsius is private, accessors are on the prototype
```

(Private fields, static members and the rest of class features are in the [classes module](#/m/classes).)

:::interview Is a JavaScript class the same as a class in Java? What is it really?
"No. A JavaScript class is syntax over constructor functions and prototypes. `typeof` a class is `'function'`. Methods live on `Class.prototype`, shared by instances, and static methods live on the class itself. Differences from a plain function: it throws if called without `new`, it is in the temporal dead zone before its declaration, its body is always strict, and its methods are non-enumerable. Inheritance with `extends` still works by linking prototypes."
:::

## More interview questions on this topic

:::qa What is `typeof` a class? {level=easy}
**Say this:** "`'function'`. A class is a special constructor function."

**In simple words:** There is no separate class type. It is a function with extra rules.
:::

:::qa Where are class methods stored? {level=easy}
**Say this:** "On `ClassName.prototype`, so all instances share one copy. Static methods are stored on the class object itself."

**In simple words:** Instance methods: on the prototype. Static methods: on the class.
:::

:::qa Why does calling a class without `new` throw? {level=easy}
**Say this:** "The class constructor checks `new.target` and throws. Plain functions have no such check."

**In simple words:** It protects you from the "forgot new" bug.
:::

:::qa Are class declarations hoisted? {level=medium}
**Say this:** "Yes, but like `let` they are in the temporal dead zone until the declaration runs, so you cannot use the class earlier."

**In simple words:** The name exists, but it is not ready.
:::

:::qa What is the difference between a method and an arrow function field in a class? {level=medium}
**Say this:** "A method lives on the prototype and is shared. An arrow field is created per instance and keeps `this` bound. The method is lighter. The arrow field is safer as a callback."

**In simple words:** Shared tool vs a personal tool that always knows its owner.
:::

```quiz
? What does `typeof class {}` give?
- "class"
+ "function"
- "object"
> Classes are functions.
? Which is true for class methods?
- They are enumerable
+ They are non-enumerable and live on the prototype
- They are copied into each instance
> This also keeps them out of for...in loops.
? What happens when you call a class constructor without new?
- It runs with this as undefined
+ It throws a TypeError
- It returns undefined
> Class constructors require new.
```

:::keypoints
- A **class is a function**; methods are on `Class.prototype`, static members on the class.
- Differences from plain constructors: **needs `new`**, **TDZ**, **always strict**, **non-enumerable methods**.
- Fields are **own properties**; arrow fields create a function **per instance**.
- Inheritance with `extends` is still prototype linking.
:::
