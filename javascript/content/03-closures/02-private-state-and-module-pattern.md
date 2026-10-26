---
title: Private state, factories and the module pattern
level: intermediate
time: 25
summary: How closures hide data, build function factories and implement the module pattern, and how that compares with class private fields (#) and WeakMap.
---

## Private data without classes

JavaScript objects have no `private` keyword in the old style: every property can be read from outside. Closures give **real privacy**: a variable inside a function simply cannot be reached from the outside.

```js run title="A bank account with a truly private balance"
function createAccount(opening) {
  let balance = opening;                       // private: only these functions can touch it

  function record(label, amount) {             // private helper
    console.log(`${label} ${amount}, balance now ${balance}`);
  }

  return {
    deposit(amount) {
      if (amount <= 0) throw new RangeError("amount must be positive");
      balance += amount;
      record("deposit", amount);
    },
    withdraw(amount) {
      if (amount > balance) throw new RangeError("not enough money");
      balance -= amount;
      record("withdraw", amount);
    },
    get balance() { return balance; },         // read-only view
  };
}

const acc = createAccount(500);
acc.deposit(200);
acc.withdraw(100);
console.log(acc.balance);

try {
  acc.balance = 1_000_000;                     // there is no setter, so strict mode refuses
} catch (e) {
  console.log(e.name + ": " + e.message);
}
console.log(acc.balance);                      // still 600
console.log(Object.keys(acc));                 // `balance` here is only the getter; the variable itself is unreachable
```

Nobody can write `acc.balance = 1000000` and change the real balance (strict mode throws, sloppy mode ignores it), and there is no way to reach the `balance` variable from outside. The rules (no negative deposit, no overdraft) are enforced in **one place**.

## Function factories

A **factory** is a function that returns another function, set up with some remembered values.

```js run title="Factories: one recipe, many functions"
function multiplyBy(factor) {
  return (n) => n * factor;
}

const double = multiplyBy(2);
const triple = multiplyBy(3);

console.log(double(7), triple(7));
console.log([1, 2, 3].map(multiplyBy(10)));

function makeLogger(level) {
  return (message) => console.log(`[${level.toUpperCase()}] ${message}`);
}

const info = makeLogger("info");
const error = makeLogger("error");
info("server started");
error("disk almost full");
```

## once, and other "remember something" helpers

Closures are perfect for helpers that keep a small piece of state between calls.

```js run title="once(fn): run only the first time"
function once(fn) {
  let called = false;
  let result;
  return function (...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}

const init = once(() => {
  console.log("expensive setup runs");
  return 42;
});

console.log(init());
console.log(init());
console.log(init());
```

## The module pattern (IIFE)

Before ES modules (2015), people used an **IIFE** (Immediately Invoked Function Expression) to make a private scope and return a public API. You will still see it in old code and in interviews.

```js run title="The module pattern"
const CartModule = (function () {
  const items = [];                            // private

  function total() {                           // private
    return items.reduce((sum, i) => sum + i.price * i.qty, 0);
  }

  return {                                     // public API
    add(name, price, qty = 1) { items.push({ name, price, qty }); },
    count() { return items.length; },
    summary() { return `${items.length} items, total ${total()}`; },
  };
})();

CartModule.add("pen", 10, 3);
CartModule.add("book", 250);
console.log(CartModule.summary());
console.log(CartModule.items);                 // undefined: private
```

Today, an **ES module file** gives you the same thing for free: anything not `export`ed stays private to the file.

## Closures vs `#private` fields vs WeakMap

Three ways to get privacy in modern JavaScript:

| | Closure | `#private` class field | WeakMap |
|---|---|---|---|
| Truly private | yes | yes (engine-enforced) | yes (if the map is hidden) |
| Works on class instances | each instance carries its own function copies | one shared method, per-instance data | one shared method, per-instance data |
| Memory per instance | higher (new functions per object) | low | low |
| `instanceof` and inheritance | not natural for plain factories | works | works |
| Can be inspected in debugger | harder | shown | harder |

```js run title="The same counter in three styles"
// 1. closure
function counterClosure() {
  let n = 0;
  return { inc: () => ++n, get: () => n };
}

// 2. class with a private field
class CounterClass {
  #n = 0;
  inc() { return ++this.#n; }
  get() { return this.#n; }
}

// 3. WeakMap
const store = new WeakMap();
class CounterWeak {
  constructor() { store.set(this, { n: 0 }); }
  inc() { return ++store.get(this).n; }
  get() { return store.get(this).n; }
}

for (const c of [counterClosure(), new CounterClass(), new CounterWeak()]) {
  c.inc(); c.inc();
  console.log(c.get());
}
```

:::tip Which one to use?
Use a **class with `#private`** when you have many instances and want inheritance. Use a **closure factory** for single objects, small utilities and modules. Both are fine. The interview point is to show that you understand **why** privacy works.
:::

:::warn Memory cost of closure objects
A factory that creates methods inside (like `createAccount`) makes **new function objects for every account**. A million accounts means millions of small functions. Class methods live once on the prototype and are shared. Prefer classes for large numbers of objects.
:::

:::interview How do you create private variables in JavaScript?
"Three ways. The classic one is a closure: keep the variable inside a function and return only the methods that use it, so it cannot be reached from outside. Since ES2022 I can use `#private` class fields, which are enforced by the engine and shared via the prototype, so they are cheaper for many instances. A WeakMap keyed by the instance also works. A leading underscore is only a convention and gives no real privacy."
:::

## More interview questions on this topic

:::qa What is the module pattern, and what replaced it? {level=medium}
**Say this:** "An IIFE that keeps variables private and returns an object with the public methods. ES modules replaced it: a file has its own scope, and only `export`ed names are public."

**In simple words:** The IIFE makes a small private room. The returned object is the door.
:::

:::qa What is an IIFE and why was it used? {level=easy}
**Say this:** "An Immediately Invoked Function Expression, `(function () { ... })();`. It creates a new scope at once, so variables do not leak into the global scope."

**In simple words:** Before `let`, `const` and modules, a function was the only way to get a private scope.
:::

:::qa How is a closure-based object different from a class instance for privacy? {level=medium}
**Say this:** "Closure data is unreachable from outside, but every object gets its own copy of the methods. `#private` fields are also unreachable, and methods are shared, which saves memory."

**In simple words:** Closures are great for one-off objects. Classes are better when you create many.
:::

:::qa Can you read a closure's variable from outside, for example in a test? {level=hard}
**Say this:** "Not directly. You test the public behaviour, or expose a small read-only getter. Debugger tools can show the closure scope, but code cannot."

**In simple words:** If you need to test internals, that is a sign you may want a smaller function that you can export.
:::

```quiz
? How does a closure make a variable private?
- By marking it private with a keyword
+ By keeping it inside a function scope that only the returned functions can reach
- By freezing the object
> No outside code can name a variable inside another function's scope.
? What is a downside of creating methods inside a factory function for many objects?
- They cannot access the variable
+ Every object gets its own copy of the functions, which uses more memory
- They run slower than all other code in every case
> Class methods are shared on the prototype.
? What does an IIFE do?
- Runs a function when the page is idle
+ Creates a function and calls it immediately, giving a private scope
- Defines a function without running it
> It was the module system before ES modules.
```

:::keypoints
- Closures give **real privacy**: variables inside a function are unreachable from outside.
- A **factory** returns functions configured with remembered values.
- **IIFE + returned object** = module pattern (now replaced by ES modules).
- `#private` fields and WeakMap are modern alternatives. Classes share methods, closures copy them.
- Underscore names are a convention, not privacy.
:::
