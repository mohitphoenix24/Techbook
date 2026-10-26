---
title: prototype vs __proto__ vs [[Prototype]]
level: intermediate
time: 30
summary: Three names that confuse everyone. Which one lives on functions, which one is the hidden link on objects, how constructor fits in, and the picture that makes it all clear.
---

## The confusion

You will see three names:

- **`prototype`**, a normal property that **only functions** have.
- **`[[Prototype]]`**, the **hidden link** every object has (the spec's name).
- **`__proto__`**, an old, readable name for `[[Prototype]]`.

Don't try to memorise them. Learn this one sentence:

> "**`F.prototype`** is the object that will become the `[[Prototype]]` (the `__proto__`) of every object created with **`new F()`**."

So `prototype` is a **plan**: "objects made by this constructor should link to this object". And `[[Prototype]]` is the **actual link** on a made object.

## One picture for everything

```viz algo=chain title="Person, Person.prototype and an instance"
node Person "Person (function)" @0,0 [fn]
  prototype: ->
node PP "Person.prototype" @1,0 [hl]
  constructor: Person
  greet: function
node asha "asha (instance)" @2,0
  name: "Asha"
node OP "Object.prototype" @1,1
  toString: function
node FP "Function.prototype" @0,1
  call, apply, bind
link Person -> PP : .prototype
link asha -> PP : [[Prototype]]
link PP -> OP : [[Prototype]]
link Person -> FP : [[Prototype]]
link FP -> OP : [[Prototype]]
```

Read the arrows:

1. The function `Person` has a property `prototype` pointing to a special object, `Person.prototype`.
2. `Person.prototype` has a `constructor` property that points **back** to `Person`.
3. `new Person()` creates `asha`, and sets `asha`'s hidden `[[Prototype]]` to `Person.prototype`.
4. `Person.prototype` is a plain object, so its own `[[Prototype]]` is `Object.prototype`.
5. `Person` is itself a function, so its `[[Prototype]]` is `Function.prototype`.

```js run title="Check the picture with code"
function Person(name) { this.name = name; }
Person.prototype.greet = function () { return "Hi, I am " + this.name; };

const asha = new Person("Asha");

console.log(Object.getPrototypeOf(asha) === Person.prototype);        // the new link
console.log(Person.prototype.constructor === Person);                  // the back-reference
console.log(Object.getPrototypeOf(Person.prototype) === Object.prototype);
console.log(Object.getPrototypeOf(Person) === Function.prototype);     // Person is a function
console.log(asha.greet());
```

## Reading and setting the link

| Way | Notes |
|---|---|
| `Object.getPrototypeOf(obj)` | **The standard way to read it.** |
| `Object.setPrototypeOf(obj, proto)` | Standard, but **slow** and discouraged: it can de-optimise the engine. Prefer `Object.create`. |
| `Object.create(proto)` | Create a new object with the link set from the start. Best. |
| `obj.__proto__` | A legacy getter/setter on `Object.prototype`. Works everywhere, but avoid in new code. |
| `new F()` | Sets the link to `F.prototype`. |
| `class A extends B` | Sets up the links for you. |

```js run title="Ways to set the link"
const base = { kind: "base" };

const a = Object.create(base);               // best
const b = { __proto__: base };               // object literal form: fine and fast
const c = {};
Object.setPrototypeOf(c, base);              // works, but changes an existing object

console.log([a, b, c].every((o) => Object.getPrototypeOf(o) === base));
```

:::warn Why avoid `__proto__` as a property?
It is an accessor on `Object.prototype`. If your data has a key named `"__proto__"` (for example from JSON), setting it can **change the prototype** instead of creating a key, which is a security risk (prototype pollution). Use `Object.create(null)` or `Map` for user-controlled keys, and `Object.getPrototypeOf` to read.
:::

## The famous mind-benders

```js run title="Who is the prototype of whom?"
function Foo() {}
const f = new Foo();

console.log(f.__proto__ === Foo.prototype);                     // true
console.log(Foo.__proto__ === Function.prototype);              // true: Foo is a function
console.log(Foo.prototype.__proto__ === Object.prototype);      // true
console.log(Function.prototype.__proto__ === Object.prototype); // true
console.log(Object.__proto__ === Function.prototype);           // true: Object is a function too!
console.log(Function.__proto__ === Function.prototype);         // true: Function is its own...
console.log(Object.prototype.__proto__);                        // null: the top
```

`Object` and `Function` are both **functions** (so they link to `Function.prototype`), and their `prototype` objects both end in `Object.prototype`. It looks circular, but it is only two chains that meet at `Object.prototype`.

## `constructor` is just a property

`constructor` is a normal property that sits on the prototype object. Objects find it through the chain. It is **not** magic, and it can be wrong if you replace the prototype.

```js run title="constructor can be lost"
function Cat() {}
const c1 = new Cat();
console.log(c1.constructor === Cat);

Cat.prototype = { meow() { return "meow"; } };       // replaced the whole prototype
const c2 = new Cat();
console.log(c2.constructor === Cat);                 // false! now it comes from Object.prototype
console.log(c2.constructor === Object);
console.log(c1 instanceof Cat, c2 instanceof Cat);   // c1 was created before the replacement
```

Notice that `c1` was linked to the **old** prototype, so `c1 instanceof Cat` is now `false`. If you replace a prototype, set `constructor` back:

```js run title="Fix constructor when replacing a prototype"
function Cat() {}
Cat.prototype = {
  constructor: Cat,                                  // restore it
  meow() { return "meow"; },
};
console.log(new Cat().constructor === Cat);
```

(Better: add methods one at a time, or use `class`.)

## How `instanceof` works

`obj instanceof F` asks: "is `F.prototype` somewhere in `obj`'s chain?"

```js run title="instanceof walks the chain"
function Animal() {}
function Dog() {}
Dog.prototype = Object.create(Animal.prototype);     // Dog's prototype links to Animal's

const d = new Dog();
console.log(d instanceof Dog, d instanceof Animal, d instanceof Object);

// roughly what instanceof does:
function myInstanceOf(obj, F) {
  let p = Object.getPrototypeOf(obj);
  while (p !== null) {
    if (p === F.prototype) return true;
    p = Object.getPrototypeOf(p);
  }
  return false;
}
console.log(myInstanceOf(d, Animal), myInstanceOf(d, Array));
```

You can customise it with `static [Symbol.hasInstance]`, but you rarely need to.

:::interview What is the difference between `prototype` and `__proto__`?
"`prototype` is a property that only functions have. It is the object that becomes the prototype of instances created with `new`. `__proto__` is the legacy accessor to an object's internal `[[Prototype]]` link, the actual object that is searched when a property is missing. So `new F().__proto__ === F.prototype`. For reading I use `Object.getPrototypeOf`, and for creating with a chosen prototype I use `Object.create`."
:::

## More interview questions on this topic

:::qa What is `[[Prototype]]`? {level=easy}
**Say this:** "The internal link of every object to its prototype. Read it with `Object.getPrototypeOf`. `__proto__` is an old way to access it."

**In simple words:** The hidden "ask my parent" arrow.
:::

:::qa Does an arrow function have a `prototype` property? {level=medium}
**Say this:** "No. Arrow functions are not constructors, so they have no `prototype`. Normal functions and classes do."

**In simple words:** No `new`, no need for a plan for instances.
:::

:::qa What does `Foo.prototype.constructor` point to, and why does it matter? {level=medium}
**Say this:** "It points back to `Foo`. Instances inherit it, so `obj.constructor` gives the constructor. If you replace `Foo.prototype` with a new object, you should restore `constructor`."

**In simple words:** It is a back link to where the object came from.
:::

:::qa Why is `Object.setPrototypeOf` discouraged? {level=hard}
**Say this:** "Changing the prototype of an existing object breaks the engine's assumptions and optimisations (hidden classes and inline caches), so it can slow down code that uses that object. I use `Object.create`, classes or object literals with `__proto__` instead."

**In simple words:** The engine likes objects whose shape does not change.
:::

```quiz
? What is true for `const d = new Dog();`?
- d.prototype === Dog.prototype
+ Object.getPrototypeOf(d) === Dog.prototype
- Dog.__proto__ === d
> Instances do not have a prototype property; they have a hidden link to Dog.prototype.
? Which objects have a `prototype` property?
- Every object
+ Normal functions and classes (constructors)
- Only arrays
> Arrow functions and methods have none.
? What does `obj instanceof F` check?
- Whether obj was created by F with new, exactly
+ Whether F.prototype is in obj's prototype chain
- Whether obj has the same properties as F
> It walks the chain looking for F.prototype.
```

:::keypoints
- **`F.prototype`**: a property on functions: "the prototype that instances will get".
- **`[[Prototype]]` / `__proto__`**: the actual hidden link on every object. Read with **`Object.getPrototypeOf`**.
- `new F().__proto__ === F.prototype`; `F.prototype.constructor === F`.
- Create with a chosen link using **`Object.create`**; avoid `setPrototypeOf` and `__proto__`.
- `instanceof` = "is `F.prototype` in the chain?".
:::
