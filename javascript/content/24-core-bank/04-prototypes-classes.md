---
title: "Core bank: prototypes and classes"
level: medium
time: 30
summary: Fourteen answers on the prototype chain, __proto__ versus prototype, new, Object.create, class syntax, private fields, super, static members, mixins and composition.
---

## Prototypes

:::qa What is the prototype chain? {level=easy}
**Say this:** "Every object has an internal link, `[[Prototype]]`, to another object. When a property is not found on the object, the engine looks at its prototype, then the prototype's prototype, until it reaches `null`. That chain is how JavaScript shares behaviour."

**In simple words:** If you do not know the answer, you ask your parent, then your grandparent.
:::

:::qa What is the difference between `__proto__` and `prototype`? {level=medium}
**Say this:** "`prototype` is a property of **functions** (constructors): the object that will become the prototype of instances made with `new`. `__proto__` (better: `Object.getPrototypeOf`) is the actual link of any object to its prototype. So `Object.getPrototypeOf(new F()) === F.prototype`."

**In simple words:** `prototype` is the template a constructor hands out; `__proto__` is the link each object holds to it.
:::

:::qa How does property lookup and assignment work with prototypes? {level=medium}
**Say this:** "Reading walks up the chain. Writing normally creates or updates an **own** property on the object, shadowing the one on the prototype. Exceptions are setters and non-writable properties found on the chain."

**In simple words:** You can read your parent's wallet, but when you spend, you make your own entry.
:::

:::qa What does `new` do? {level=easy}
**Say this:** "Four steps: create an empty object, link its prototype to `Constructor.prototype`, run the constructor with `this` set to the object, and return the object (unless the constructor returns another object)."

**In simple words:** Make a blank, link it, fill it, hand it back.
:::

:::qa What does `Object.create(proto)` do, and when is it useful? {level=medium}
**Say this:** "It makes a new object whose prototype is `proto`, without calling a constructor. `Object.create(null)` gives an object with no prototype, which is a safe dictionary with no inherited keys like `toString`."

**In simple words:** A clean way to say 'make an object that inherits from this one'.
:::

:::qa How do you check own properties versus inherited ones? {level=easy}
**Say this:** "`Object.hasOwn(obj, key)` (or `obj.hasOwnProperty(key)`) is true only for own properties. `key in obj` also looks up the chain. `for...in` loops over inherited enumerable keys too, while `Object.keys` returns only own ones."

**In simple words:** `hasOwn` asks 'is it mine?'; `in` asks 'can I reach it?'.
:::

:::qa Why is changing `Object.prototype` or built-in prototypes dangerous? {level=medium}
**Say this:** "Every object inherits from them, so the change leaks everywhere, can break `for...in` loops and libraries, and can open prototype-pollution security bugs. Do not add methods to built-ins in production code. Polyfills do it carefully with `defineProperty` and `enumerable: false`."

**In simple words:** You would be changing the rules for every object in the app.
:::

## Classes

:::qa Are JavaScript classes real classes? {level=easy}
**Say this:** "They are syntax over prototypes. A `class` creates a constructor function, puts methods on its `prototype`, and `extends` links the prototypes. The differences from plain functions: class bodies are strict, methods are not enumerable, calling a class without `new` throws, and classes are in the TDZ."

**In simple words:** A nicer outfit on the same prototype engine.
:::

:::qa What does `super` do? {level=medium}
**Say this:** "In a constructor, `super(...)` calls the parent constructor and must run before you use `this` in a derived class, because the parent creates the object. In methods, `super.method()` calls the parent's version."

**In simple words:** `super` means 'let my parent do its part first'.
:::

:::qa What are static members and private fields? {level=easy}
**Say this:** "`static` members belong to the class itself (`Math.max` style), not to instances. Private fields and methods start with `#` and are truly private: access outside the class is a syntax error, not just a convention."

**In simple words:** Static is 'one per class'; `#` is 'only the class body may touch it'.
:::

:::qa Why do class methods lose `this` when passed as callbacks, and what are class fields with arrows for? {level=medium}
**Say this:** "Methods live on the prototype and `this` depends on the call, so `onClick={this.handle}` loses it. A class field `handle = () => {...}` creates an arrow function per instance that captures the right `this`. The cost is one function per instance and no shared prototype method."

**In simple words:** The arrow field glues the method to its instance, at the price of more memory.
:::

:::qa Inheritance or composition? {level=medium}
**Say this:** "Prefer composition: build objects from small parts and pass behaviour in. Inheritance creates tight coupling and deep hierarchies that are hard to change. Use it for a clear 'is-a' relationship with a stable base."

**In simple words:** Build with Lego bricks instead of a family tree.
:::

:::qa What is a mixin? {level=hard}
**Say this:** "A way to add behaviour from several sources to a class, since JavaScript has single inheritance. For example `const Serializable = (Base) => class extends Base { toJSON() {...} }`, then `class User extends Serializable(Person) {}`. Or `Object.assign(Target.prototype, behaviours)`."

**In simple words:** Stick extra abilities onto a class like badges.
:::

:::qa How do you make an "abstract" class in JavaScript? {level=hard}
**Say this:** "Throw in the constructor when `new.target === Base`, and make required methods throw 'not implemented'. TypeScript has `abstract`, but plain JavaScript only has this runtime convention."

**In simple words:** Let children be built, but not the base itself.
:::

:::keypoints
- **Chain**: lookup walks `[[Prototype]]` to `null`; writes create own properties.
- `F.prototype` is the template; `Object.getPrototypeOf(obj)` is the link.
- `class` = syntax over prototypes (+ strict, non-enumerable methods, TDZ, needs `new`).
- `super()` before `this`; `#private` is enforced; arrow class fields fix `this` at a cost.
- Prefer **composition**; never edit built-in prototypes.
:::
