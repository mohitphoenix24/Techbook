---
title: Constructor functions and shared methods
level: intermediate
time: 25
summary: How to build "classes" the old way with constructor functions and prototypes, why methods go on the prototype, and how to add to built-in prototypes safely (or not at all).
---

## The pre-class way to make many similar objects

Before `class` (2015), objects of the same kind were made with a **constructor function** plus methods on its **prototype**. Classes are now the nicer syntax over this exact machinery, so it is important to know both.

```js run title="Constructor function + prototype methods"
function Product(name, price) {
  this.name = name;                            // data: one copy per object
  this.price = price;
}

Product.prototype.describe = function () {     // behaviour: ONE copy, shared
  return `${this.name} costs ₹${this.price}`;
};

Product.prototype.discount = function (percent) {
  return Math.round(this.price * (100 - percent) / 100);
};

const pen = new Product("Pen", 10);
const bag = new Product("Bag", 500);

console.log(pen.describe());
console.log(bag.describe(), "| after 20% off:", bag.discount(20));
console.log(pen.describe === bag.describe);    // shared: the same function object
console.log(Object.keys(pen));                 // only data is own; methods are on the prototype
```

## Why put methods on the prototype?

If you write the method **inside** the constructor, a **new function** is created for every object.

```js run title="Methods inside the constructor are copied per object"
function Wasteful(n) {
  this.n = n;
  this.show = function () { return this.n; };  // new function object each time
}
function Efficient(n) { this.n = n; }
Efficient.prototype.show = function () { return this.n; };

const w1 = new Wasteful(1), w2 = new Wasteful(2);
const e1 = new Efficient(1), e2 = new Efficient(2);

console.log("Wasteful shares show:", w1.show === w2.show);
console.log("Efficient shares show:", e1.show === e2.show);
```

For 100,000 objects, the wasteful style creates 100,000 extra function objects. Methods on the prototype cost nothing extra per object.

## Data on the object, methods on the prototype

A very common rule:

- Put **per-object data** in the constructor (`this.x = ...`).
- Put **shared behaviour** on the prototype.
- Be careful with **shared mutable data** on the prototype:

```js run title="A shared array on the prototype is shared by all"
function Cart() {}
Cart.prototype.items = [];                 // one array for ALL carts: a bug!

const c1 = new Cart();
const c2 = new Cart();
c1.items.push("pen");                      // mutates the shared array

console.log(c2.items);                     // c2 sees the pen too
```

The fix: create the array **per object** in the constructor: `this.items = [];`.

## Checking where things live

```js run title="Own, shared and chain checks"
function User(name) { this.name = name; }
User.prototype.hello = function () { return "hi " + this.name; };

const u = new User("Asha");

console.log(Object.hasOwn(u, "name"), Object.hasOwn(u, "hello"));
console.log("hello" in u);
console.log(User.prototype.isPrototypeOf(u));
console.log(Object.getOwnPropertyNames(User.prototype));
```

## Changing the prototype later affects existing objects

Because objects only hold a **link**, adding to the prototype later gives new abilities to objects that **already exist**.

```js run title="Live link"
function Box() {}
const b = new Box();

console.log(typeof b.open);
Box.prototype.open = function () { return "opened"; };
console.log(b.open());
```

But **replacing** the whole `Box.prototype` only affects objects created **afterwards** (see the [previous lesson](#/l/prototype-vs-proto)).

## Built-in prototypes: should you extend them?

You can add methods to `Array.prototype`, `String.prototype`, and so on. It is called **monkey patching**. Be very careful.

```js run title="Extending a built-in (a demo, not a recommendation)"
if (!Array.prototype.last) {
  Object.defineProperty(Array.prototype, "last", {
    value() { return this[this.length - 1]; },
    enumerable: false,                       // keep it out of for...in
    configurable: true,
    writable: true,
  });
}

console.log([1, 2, 3].last());
```

Why it is risky:

1. **Name clashes.** The language may later add its own method with the same name but different behaviour (this is why `flatten` became `flat`: an old library had broken the web).
2. **Enumerable properties** appear in `for...in` loops of every array, breaking old code. Use `Object.defineProperty` with `enumerable: false`.
3. **Libraries** that patch the same method conflict.

The accepted exception is a **polyfill**: adding a standard method that an old browser lacks, **only if it is missing**, with the standard behaviour.

## Inheritance with constructor functions (preview)

To make `Student` inherit from `Person`, you need to link the prototypes **and** call the parent constructor. You will do this in the [Object.create lesson](#/l/object-create-and-inheritance). This is exactly what `class Student extends Person` automates.

:::interview Why should methods be defined on the prototype and not inside the constructor?
"A method defined inside the constructor is created again for every instance, which wastes memory and breaks equality between methods. A method on the prototype exists once and is shared by all instances through the chain, with `this` set by the call. I keep per-instance data in the constructor and shared behaviour on the prototype. `class` syntax does this automatically."
:::

## More interview questions on this topic

:::qa What is wrong with `Foo.prototype.items = []`? {level=medium}
**Say this:** "The array is shared by all instances, so a mutation through one instance is visible to all. Create mutable data per instance in the constructor."

**In simple words:** The prototype is a shared room. Do not leave your personal things there.
:::

:::qa How do you check if a property is an own property or inherited? {level=easy}
**Say this:** "Use `Object.hasOwn(obj, key)`. `key in obj` also returns true for inherited ones."

**In simple words:** `hasOwn` asks only the object. `in` asks the whole chain.
:::

:::qa Is it a good idea to add methods to `Array.prototype`? {level=medium}
**Say this:** "Generally no. It can clash with future standard methods or other libraries, and an enumerable property breaks `for...in`. A polyfill is acceptable if it is guarded and standards-compliant. Otherwise write a normal helper function."

**In simple words:** You do not own the language's objects, so avoid changing them.
:::

:::qa If you add a method to the prototype after creating instances, do they get it? {level=easy}
**Say this:** "Yes. Instances hold a link to the prototype, so they see later additions. Replacing the prototype object does not update old instances."

**In simple words:** Adding to the shared room helps everybody. Building a new room helps only the new people.
:::

```quiz
? Where should shared methods go in a constructor-function design?
- Inside the constructor with this.method = ...
+ On Constructor.prototype
- On the global object
> One copy, shared by all instances.
? What goes wrong with `Cart.prototype.items = []`?
- Nothing
+ All carts share one array
- It throws an error
> Mutable data on a prototype is shared.
? What is a polyfill?
- A faster loop
+ Code that adds a missing standard feature, only if it is missing
- A copy of a library
> Guarded and standards-compliant.
```

:::keypoints
- Constructor function = **data per object** (`this.x`) + **methods on the prototype** (shared).
- Methods in the constructor are copied per instance: wasteful.
- Never put **mutable** shared data on a prototype.
- Prototype additions are seen by **existing** instances (live link).
- Do not modify built-in prototypes, except for guarded **polyfills**.
:::
