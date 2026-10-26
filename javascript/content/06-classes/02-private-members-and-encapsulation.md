---
title: Private members and encapsulation
level: intermediate
time: 25
summary: How #private fields and methods work, what makes them different from underscores and closures, the in check, WeakMap-based privacy, and how to design a class with a small, safe public surface.
---

## Why hide things?

An object is easier to use and safer to change when outsiders can touch **only a small public surface**. This is **encapsulation**: keep the data and rules inside, and expose a few clear methods.

:::analogy A vending machine
You press a button and get a snack. You cannot reach inside to take the money or change the stock. The machine can change how it works inside without you noticing, as long as the buttons work the same.
:::

## Three levels of "privacy" in JavaScript

| Approach | Truly private? | Notes |
|---|---|---|
| `_name` (underscore) | **No** | A convention only. Anyone can read or write it. |
| Closure variables | Yes | Per-object function copies, no `instanceof`/prototype methods |
| `#name` (private field/method) | **Yes, enforced by the engine** | Standard since ES2022 |

```js run title="Underscore is only a hint"
class Account {
  constructor() { this._balance = 100; }          // "please do not touch"
}
const a = new Account();
a._balance = 1_000_000;                           // nothing stops this
console.log(a._balance);
```

## `#private` fields

```js run title="Real private fields"
class Counter {
  #count = 0;                                      // private: only code inside the class body can see it

  increment() { this.#count++; return this; }
  get value() { return this.#count; }
}

const c = new Counter();
c.increment().increment();
console.log(c.value);
console.log(c.count, c["#count"]);                // undefined undefined: there is no such property
console.log(Object.keys(c), JSON.stringify(c));   // nothing visible
```

Trying to **access** a private field from outside is a **SyntaxError** (it is detected before the program runs), not just `undefined`:

```js run title="Outside access is a syntax error" expect-error
class Safe {
  #secret = 42;
}
const s = new Safe();
console.log(s.#secret);
```

## Private methods, getters and static privates

```js run title="Private methods and statics"
class PasswordChecker {
  static #minLength = 8;                           // private static
  #rules = [(p) => p.length >= PasswordChecker.#minLength, (p) => /\d/.test(p)];

  #score(p) { return this.#rules.filter((rule) => rule(p)).length; }   // private method
  get #label() { return "strength"; }                                   // private getter

  check(p) { return `${this.#label}: ${this.#score(p)}/${this.#rules.length}`; }
  static #secretStatic() { return "hidden"; }
  static reveal() { return PasswordChecker.#secretStatic(); }
}

const pc = new PasswordChecker();
console.log(pc.check("abc"), "|", pc.check("abcdefg1"), "|", PasswordChecker.reveal());
```

## Private fields are per class, not per object

Another **instance of the same class** can read your private fields. This lets you write methods like `equals`:

```js run title="Same class can see each other's privates"
class Money {
  #paise;
  constructor(rupees) { this.#paise = Math.round(rupees * 100); }
  equals(other) { return this.#paise === other.#paise; }
  plus(other) { return new Money((this.#paise + other.#paise) / 100); }
  toString() { return "₹" + (this.#paise / 100).toFixed(2); }
}

console.log(new Money(10.5).equals(new Money(10.50)), String(new Money(1.25).plus(new Money(2.5))));
```

Use `#field in obj` to check **safely** whether an object has the private field (a "brand check"):

```js run title="Brand check with #x in obj"
class Token {
  #id = Math.random();
  static isToken(o) { return typeof o === "object" && o !== null && #id in o; }   // true only for real Token instances
}

console.log(Token.isToken(new Token()), Token.isToken({ id: 1 }), Token.isToken(null));
```

## Private fields and inheritance

A subclass **cannot** see its parent's private fields, even though it inherits the instance. Each class has its own private names.

```js run title="Subclasses cannot read parent privates"
class Parent {
  #secret = "parent only";
  reveal() { return this.#secret; }               // works: this method belongs to Parent
}
class Child extends Parent {
  // tryRead() { return this.#secret; }           // SyntaxError: '#secret' is not declared in Child
}
console.log(new Child().reveal());
```

If the child needs access, the parent exposes a method, or the field is made `protected` by convention (`_x`) or through a getter. JavaScript has no `protected` keyword.

## Limits and gotchas

- You **cannot** use `delete` on private fields, nor read them with `Object.getOwnPropertyNames`.
- `this.#x` on an object that does not have the field throws a **TypeError**.
- **Proxies** break private fields: a proxy is not the real instance, so `this.#x` inside a method called on a proxy throws.
- Private fields are **not** secure against someone who can run code in the same page (they can patch your class), but they stop accidental access and make intent clear.

```js run title="Private fields and Proxy"
class Box { #v = 1; get v() { return this.#v; } }
const p = new Proxy(new Box(), {});
try { console.log(p.v); } catch (e) { console.log(e.name + ": " + e.message.slice(0, 60)); }
```

:::interview How do you implement private properties in JavaScript, and what are the trade-offs?
"The modern way is `#private` fields and methods. They are enforced by the engine: access from outside is a syntax error, they do not show up in `Object.keys` or `JSON.stringify`, and methods stay on the prototype, so they are memory efficient. Before that, I used closures, which give real privacy but copy methods per instance, or WeakMaps, or an underscore convention, which gives no protection. The caveats are that subclasses cannot see a parent's private fields, and that they do not work through Proxies."
:::

## More interview questions on this topic

:::qa What happens if you try to read `obj.#x` outside the class? {level=easy}
**Say this:** "It is a SyntaxError at parse time. The name `#x` is only valid inside the class body."

**In simple words:** The language refuses to even run the code.
:::

:::qa Is `_name` private? {level=easy}
**Say this:** "No, it is only a naming convention that says 'please do not use'. It is a normal public property."

**In simple words:** A sign on the door, not a lock.
:::

:::qa Can a subclass access a parent's `#private` field? {level=medium}
**Say this:** "No. Private names are scoped to the class that declares them. The parent can expose a protected-style accessor if needed."

**In simple words:** Each class has its own locked cupboard.
:::

:::qa Why does a private field fail on a Proxy? {level=hard}
**Say this:** "Private fields live on the real object, not on the proxy. When a method does `this.#x` with `this` being the proxy, the proxy has no such private field, so a TypeError is thrown."

**In simple words:** The proxy is a different object. It does not hold the real object's locked cupboard.
:::

```quiz
? Which one is truly private?
- this._count
+ this.#count
- this["count"]
> # names are enforced by the engine.
? What does `#x in obj` do?
- Checks for a public property x
+ Checks if obj has the private field #x
- Creates the field
> It is a brand check, usable only inside the class.
? Can a subclass use this.#secret declared in its parent?
- Yes
+ No
- Only static ones
> Private names are class-scoped.
```

:::keypoints
- **Encapsulation**: expose a small public surface, keep data and rules inside.
- `_x` is a convention. **`#x` is enforced** (syntax error outside the class). Closures are also private but copy methods.
- Private fields, methods, getters and static members exist. They are **per class**, not inherited, and do not work through **Proxy**.
- `#x in obj` is a safe brand check.
:::
