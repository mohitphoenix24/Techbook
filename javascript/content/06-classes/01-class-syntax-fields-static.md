---
title: Class syntax: fields, accessors and static members
level: intermediate
time: 25
summary: A complete tour of modern class syntax: constructor, fields, methods, getters and setters, static members and static blocks, computed names and the rules around them.
---

## A modern class at a glance

```js run title="Everything in one class"
class BankAccount {
  // static field: belongs to the class, not to instances
  static bankName = "Desi Bank";
  static #count = 0;                       // private static

  // instance fields
  owner;
  balance = 0;
  #pin;                                    // private instance field

  constructor(owner, pin) {
    this.owner = owner;
    this.#pin = pin;
    BankAccount.#count++;
  }

  // method (on the prototype)
  deposit(amount) {
    if (amount <= 0) throw new RangeError("amount must be positive");
    this.balance += amount;
    return this;
  }

  // accessor properties
  get masked() { return `${this.owner} (****${String(this.#pin).slice(-2)})`; }
  set nickname(v) { this._nick = v.trim(); }

  // private method
  #audit() { return `audit:${this.owner}:${this.balance}`; }
  report() { return this.#audit(); }

  // static method
  static get total() { return BankAccount.#count; }
  static compare(a, b) { return a.balance - b.balance; }

  // static initialisation block (ES2022)
  static {
    BankAccount.created = "static block ran once";
  }
}

const a = new BankAccount("Asha", 4321);
const b = new BankAccount("Ravi", 9876);
a.deposit(500).deposit(250);
b.deposit(100);

console.log(a.masked, a.balance, a.report());
console.log(BankAccount.total, BankAccount.bankName, BankAccount.created);
console.log([a, b].sort(BankAccount.compare).map((x) => x.owner));
console.log(a);
```

Note that `console.log(a)` does not show `#pin`: private fields are invisible from outside.

## Fields

A **class field** declares a property on every instance. It runs **before** the constructor body (in a base class) or right after `super()` (in a derived class).

```js run title="Field initialisers run per instance, in order"
let created = 0;

class Widget {
  id = ++created;                          // runs for every new object
  tags = [];                               // a NEW array each time (unlike a prototype property)
  label = `widget-${this.id}`;             // can use this and earlier fields
  onClick = () => this.label;              // arrow keeps this bound

  constructor() {
    console.log("constructor sees", this.id, this.label);
  }
}

const w1 = new Widget();
const w2 = new Widget();
w1.tags.push("a");
console.log(w1.tags, w2.tags, w1.onClick());
```

Because the initialisers run per instance, arrays and objects in fields are **not shared**, unlike properties put on the prototype.

## Getters and setters

```js run title="Accessors: computed and validated properties"
class Rectangle {
  #w = 1;
  #h = 1;

  constructor(w, h) { this.width = w; this.height = h; }   // these call the setters

  get width() { return this.#w; }
  set width(v) {
    if (!(v > 0)) throw new RangeError("width must be > 0");
    this.#w = v;
  }
  get height() { return this.#h; }
  set height(v) {
    if (!(v > 0)) throw new RangeError("height must be > 0");
    this.#h = v;
  }
  get area() { return this.#w * this.#h; }     // read-only: no setter
}

const r = new Rectangle(3, 4);
console.log(r.area);
r.width = 10;
console.log(r.area);
try { r.width = -1; } catch (e) { console.log(e.name + ": " + e.message); }
try { r.area = 5; } catch (e) { console.log(e.name + ": " + e.message); }
```

Use accessors to **validate**, to **compute** from other data, or to give a stable name while changing the storage. Do not use them just to "wrap" a field with no logic.

## Static members

Static members belong to the **class itself**. They are called as `ClassName.thing`.

```js run title="Static methods and fields"
class MathUtil {
  static PI = 3.14159;
  static circleArea(r) { return MathUtil.PI * r * r; }
  static of(...nums) { return nums.map((n) => n * 2); }
}

console.log(MathUtil.circleArea(2));
console.log(MathUtil.of(1, 2, 3));
console.log(typeof new MathUtil().circleArea);    // undefined: not available on instances
```

Typical uses: **factory methods** (`User.fromJSON(...)`), **utility functions**, **constants**, **counters**, **registries**. Static members are inherited by subclasses (the class chain, see [extends and super](#/l/extends-and-super)).

```js run title="Factory methods with static"
class Temperature {
  constructor(celsius) { this.celsius = celsius; }
  static fromFahrenheit(f) { return new this((f - 32) * 5 / 9); }   // new this: works for subclasses too
  static fromKelvin(k) { return new this(k - 273.15); }
  toString() { return `${this.celsius.toFixed(1)}°C`; }
}

console.log(String(Temperature.fromFahrenheit(212)), String(Temperature.fromKelvin(300)));
```

## Computed names and symbols

```js run title="Computed method names and well-known symbols"
const action = "start";

class Machine {
  [action]() { return "starting"; }
  static ["make" + "Default"]() { return new Machine(); }

  *[Symbol.iterator]() {                 // make instances iterable
    yield "step 1";
    yield "step 2";
  }
  get [Symbol.toStringTag]() { return "Machine"; }
}

const m = Machine.makeDefault();
console.log(m.start(), [...m], String(m));
```

## Rules to remember

| Rule | Detail |
|---|---|
| Class body is **strict** | Always, even without `"use strict"` |
| Class needs `new` | Calling without it throws |
| No commas between members | Unlike object literals |
| Methods are **non-enumerable** | Not seen by `for...in` or `Object.keys` |
| One `constructor` only | More than one is a SyntaxError |
| Class declarations are in the **TDZ** | Use after the declaration |
| `static` members are not available on instances | `instance.staticThing` is `undefined` |

:::interview What are static members and when do you use them?
"Static members belong to the class itself, not to instances: `ClassName.method()`. I use them for factory methods like `fromJSON`, utility functions that do not need instance data, constants, and class-level state such as a counter or registry. Subclasses inherit them. Inside a static method `this` is the class, so `new this()` gives a factory that works for subclasses."
:::

## More interview questions on this topic

:::qa When does a class field initialiser run? {level=medium}
**Say this:** "For each new instance: in a base class just before the constructor body, in a derived class right after `super()` returns. Each instance gets its own value."

**In simple words:** Fields are set up when the object is made, so arrays and objects in fields are not shared.
:::

:::qa What is the difference between a getter and a method? {level=easy}
**Say this:** "A getter is read like a property (`obj.area`) and runs code; a method is called with parentheses (`obj.area()`). Getters should be cheap and side-effect free."

**In simple words:** A getter looks like data but is computed.
:::

:::qa Can static methods access instance data? {level=easy}
**Say this:** "Not directly: they have no instance. They can receive an instance as a parameter. Inside a static method `this` is the class."

**In simple words:** The class itself has no `owner` or `balance`, only each object does.
:::

:::qa What is a static initialisation block? {level=hard}
**Say this:** "`static { ... }` runs once when the class is defined. It can run complex setup code that has access to private static members."

**In simple words:** A place for "run this once for the class" logic.
:::

```quiz
? Where are class fields created?
- On the prototype
+ On every instance, when it is created
- On the global object
> Field initialisers run per instance.
? What is `this` in a static method called as `Foo.make()`?
- An instance of Foo
+ The class Foo
- undefined
> The object before the dot.
? Are class methods enumerable?
- Yes
+ No
- Only static ones
> They are non-enumerable, so for...in skips them.
```

:::keypoints
- Class members: **constructor, fields, methods, accessors, static members, private (`#`) members, static blocks**.
- Fields are **per instance**; methods are **shared on the prototype**.
- Getters/setters validate or compute. Static members belong to the **class** and are inherited by subclasses.
- Class bodies are strict and non-enumerable; `new` is required.
:::
