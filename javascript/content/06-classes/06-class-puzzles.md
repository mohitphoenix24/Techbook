---
title: Class and OOP output puzzles
level: advanced
time: 25
summary: Ten puzzles on class fields, super, static inheritance, getters, private fields, instanceof and the this traps in classes.
---

Predict first, then run.

## Puzzle 1: field order and the constructor

```js run title="Puzzle 1"
class A {
  x = (console.log("field x"), 1);
  constructor() { console.log("constructor"); }
}
class B extends A {
  y = (console.log("field y"), 2);
  constructor() {
    console.log("before super");
    super();
    console.log("after super");
  }
}
new B();
```

:::hint Show the reason
`before super`, then `super()` runs A: A's field initialisers run (`field x`) and then A's constructor body (`constructor`). When `super()` returns, B's fields run (`field y`), then B's body continues (`after super`).
:::

## Puzzle 2: calling an overridden method from a parent constructor

```js run title="Puzzle 2"
class Base {
  constructor() { this.init(); }
  init() { console.log("Base.init"); }
}
class Child extends Base {
  value = 10;
  init() { console.log("Child.init, value =", this.value); }
}
new Child();
```

:::hint Show the reason
`this.init()` runs `Child.init` (polymorphism), but Child's field `value` is not set yet, because Child's fields run **after** `super()` returns. Output: `Child.init, value = undefined`. Lesson: do not call overridable methods from a constructor.
:::

## Puzzle 3: static inheritance

```js run title="Puzzle 3"
class A {
  static count = 0;
  static inc() { return ++this.count; }
}
class B extends A {}

console.log(A.inc(), A.inc(), B.inc(), B.count, A.count);
```

:::hint Show the reason
`A.inc()` twice makes `A.count` 2. `B.inc()` has `this = B`. `B.count` reads `A.count` (2, inherited), `++` writes **an own property** `B.count = 3`. Output: `1 2 3 3 2`.
:::

## Puzzle 4: getter on the prototype

```js run title="Puzzle 4"
class P {
  get v() { return 1; }
}
const p = new P();

try { p.v = 2; } catch (e) { console.log(e.name); }
console.log(p.v, Object.keys(p));
```

:::hint Show the reason
There is a getter but no setter, so assignment fails. In strict mode (class code and our wrapper) it throws a `TypeError`. Output: `TypeError`, then `1 []`.
:::

## Puzzle 5: instanceof with Object.create

```js run title="Puzzle 5"
class Animal {}
const a = Object.create(Animal.prototype);

console.log(a instanceof Animal, a.constructor === Animal, Object.keys(a));
```

:::hint Show the reason
`a` is linked to `Animal.prototype` without calling the constructor. It is an instance as far as `instanceof` is concerned: `true`. `constructor` is found on the prototype: `true`. No own keys: `[]`.
:::

## Puzzle 6: private field in a subclass

```js run title="Puzzle 6"
class A {
  #secret = "A";
  getSecret() { return this.#secret; }
}
class B extends A {
  #secret = "B";
  getOwn() { return this.#secret; }
}

const b = new B();
console.log(b.getSecret(), b.getOwn());
```

:::hint Show the reason
Private names are scoped per class. `A`'s `#secret` and `B`'s `#secret` are two different fields on the same object. Output: `A B`.
:::

## Puzzle 7: toString and template strings

```js run title="Puzzle 7"
class Money {
  constructor(v) { this.v = v; }
  toString() { return `₹${this.v}`; }
  valueOf() { return this.v; }
}
const m = new Money(50);

console.log(`${m}`, m + 10, m * 2, String(m), m > 40);
```

:::hint Show the reason
Template literals and `String()` ask for a **string** (`toString`). `+`, `*` and `>` ask for a **primitive** with the default hint (`valueOf`). Output: `₹50 60 100 ₹50 true`. (See type coercion in module 12.)
:::

## Puzzle 8: class expression names

```js run title="Puzzle 8"
const Foo = class Bar {
  static who() { return Bar.name; }
};

console.log(Foo.name, Foo.who(), typeof Bar);
```

:::hint Show the reason
The name `Bar` exists only **inside** the class body. Outside, `typeof Bar` is `"undefined"`. `Foo.name` is `"Bar"` (the class's own name). Output: `Bar Bar undefined`.
:::

## Puzzle 9: this in a detached static method

```js run title="Puzzle 9"
class Util {
  static id = 7;
  static get() { return this.id; }
}

const { get } = Util;
try { console.log(get()); } catch (e) { console.log(e.name); }
console.log(Util.get());
```

:::hint Show the reason
The detached `get()` is a plain call: `this` is `undefined` in strict code, so `this.id` throws a `TypeError`. `Util.get()` has `Util` before the dot: `7`.
:::

## Puzzle 10: method vs arrow field and super

```js run title="Puzzle 10"
class A {
  hello() { return "A.hello"; }
}
class B extends A {
  hello = () => "B.hello (arrow)";
  other() { return "B.other"; }
}

const b = new B();
console.log(b.hello(), Object.hasOwn(b, "hello"), A.prototype.hello.call(b));
```

:::hint Show the reason
The arrow **field** is an **own property** of the instance, so it shadows the prototype method. Output: `B.hello (arrow) true A.hello`. This is one reason overriding with an arrow field and then calling `super.hello()` does not work: `super` looks at the prototype chain, not at instance fields.
:::

## Class checklist (for the interview)

- Fields run **per instance**; derived-class fields run **after `super()`**.
- Do not call **overridable methods** in a constructor.
- Statics are **inherited** through the class chain, but writes create own properties.
- `#private` is **per class**; accessors need a **setter** to be assignable.
- A class **name** inside a class expression is visible only inside.
- Detached methods lose `this`; class code is strict, so it throws.

:::keypoints
- Derived class order: `super()` → parent fields and constructor → child fields → rest of child constructor.
- Never call overridable methods from a constructor: child fields are not ready.
- `Child.count++` on an inherited static creates an **own** property on `Child`.
- `toString` is used for string contexts, `valueOf` for numeric ones.
:::
