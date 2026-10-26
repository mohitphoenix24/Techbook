---
title: Symbols and well-known symbols
level: intermediate
time: 25
summary: What a symbol is, why it exists (unique, collision-free keys), the global registry, symbols that are not seen by normal loops, and the well-known symbols that customise how objects behave.
---

## What is a symbol?

A **symbol** is a **primitive value that is always unique**. Even two symbols with the same description are different.

```js run title="Symbols are unique"
const a = Symbol("id");
const b = Symbol("id");

console.log(a === b, typeof a, a.toString(), a.description);
console.log(Symbol("x") === Symbol("x"));
console.log(Symbol.for("shared") === Symbol.for("shared"));      // the global registry returns the same symbol
console.log(Symbol.keyFor(Symbol.for("shared")), Symbol.keyFor(a));
```

You create one with `Symbol(description)` (no `new`). The description is only for debugging.

## Why do they exist?

**1. Collision-free property keys.** If you add a property to an object you do not own, a string key like `"id"` may clash with a property that already exists or one added later. A symbol key can never clash.

```js run title="Symbol keys cannot collide"
const user = { id: "from-the-server", name: "Asha" };

const internalId = Symbol("internalId");
user[internalId] = "my-library-secret";                // no conflict with user.id

console.log(user.id, user[internalId]);
console.log(Object.keys(user), JSON.stringify(user));            // symbol keys are not listed or serialised
for (const k in user) console.log("for...in:", k);               // ...and not looped
console.log(Object.getOwnPropertySymbols(user), Reflect.ownKeys(user));   // but they can be found
```

**2. Hidden-ish metadata.** Symbol keys are skipped by `for...in`, `Object.keys`, `Object.entries` and `JSON.stringify`. (Spread and `Object.assign` **do** copy them.) But symbols are **not truly private**: `Object.getOwnPropertySymbols` finds them. For real privacy use `#private`.

**3. Special protocols:** the language uses **well-known symbols** as hooks for customising behaviour. This is the most important use.

## Well-known symbols

| Symbol | What it customises |
|---|---|
| `Symbol.iterator` | How `for...of`, spread and destructuring iterate the object |
| `Symbol.asyncIterator` | How `for await...of` iterates |
| `Symbol.toPrimitive` | How the object converts to a primitive (`+obj`, `${obj}`) |
| `Symbol.toStringTag` | The tag in `Object.prototype.toString` → `[object Tag]` |
| `Symbol.hasInstance` | How `instanceof` works for a class |
| `Symbol.species` | Which constructor `map`/`filter`/`slice` use for results of a subclass |
| `Symbol.isConcatSpreadable` | Whether `concat` spreads the object |
| `Symbol.match`, `replace`, `search`, `split` | How string methods use an object as a "pattern" |
| `Symbol.unscopables` | Names hidden from `with` |

```js run title="Customising the language with well-known symbols"
class Temperature {
  constructor(c) { this.c = c; }

  [Symbol.toPrimitive](hint) { return hint === "string" ? `${this.c}°C` : this.c; }
  get [Symbol.toStringTag]() { return "Temperature"; }
  static [Symbol.hasInstance](value) { return typeof value === "object" && value !== null && "c" in value; }
  *[Symbol.iterator]() { yield this.c; yield this.c * 9 / 5 + 32; }
}

const t = new Temperature(100);
console.log(`${t}`, t + 1, t > 50);                          // toPrimitive
console.log(Object.prototype.toString.call(t));              // toStringTag
console.log({ c: 5 } instanceof Temperature, {} instanceof Temperature);   // hasInstance (duck typing!)
console.log([...t]);                                         // iterator

const spreadable = { length: 2, 0: "x", 1: "y", [Symbol.isConcatSpreadable]: true };
console.log(["a"].concat(spreadable));
```

```js run title="Symbol.species: keep the subclass for map()"
class Stack extends Array {
  static get [Symbol.species]() { return Array; }             // map/filter return plain Arrays, not Stacks
}
const s = Stack.from([1, 2, 3]);
console.log(s instanceof Stack, s.map((x) => x) instanceof Stack, s.map((x) => x) instanceof Array);
```

## Practical uses

### An enum with unique values

```js run title="Symbol-based enum"
const Status = Object.freeze({
  PENDING: Symbol("pending"),
  DONE: Symbol("done"),
});

const task = { status: Status.PENDING };
console.log(task.status === Status.PENDING, task.status === "pending");
console.log(task.status.description, String(task.status));
```

### Private-ish "protocol" keys for libraries

Libraries use symbols for keys such as `Symbol.for("nodejs.util.inspect.custom")` (customise `console.log` in Node), `Symbol.for("react.element")` (React elements).

```js run node title="Customise how Node prints your object"
const util = require("node:util");

class Secret {
  constructor(value) { this.value = value; }
  [util.inspect.custom]() { return "Secret { value: [hidden] }"; }     // Symbol.for("nodejs.util.inspect.custom")
}
console.log(new Secret("password123"));
```

## Symbols and conversions

```js run title="Symbols do not convert implicitly"
const s = Symbol("demo");

console.log(String(s), s.toString());                          // explicit: fine
try { console.log(s + ""); } catch (e) { console.log(e.name + ": " + e.message); }     // implicit string: TypeError
try { console.log(+s); } catch (e) { console.log(e.name); }
console.log(Boolean(s), !!s);                                  // always truthy
console.log(JSON.stringify({ [s]: 1, key: s }));               // symbol keys and values are dropped
```

:::interview What are Symbols and why were they added?
"A Symbol is a unique, immutable primitive created with `Symbol(description)`. Two symbols are never equal, even with the same description. They were added to create property keys that cannot collide with existing or future string keys, and to define hooks into the language through well-known symbols such as `Symbol.iterator`, `Symbol.toPrimitive`, `Symbol.hasInstance` and `Symbol.toStringTag`. Symbol-keyed properties are skipped by `for...in`, `Object.keys` and JSON, but they are not truly private: `Object.getOwnPropertySymbols` and `Reflect.ownKeys` reveal them. `Symbol.for(key)` uses a global registry so the same key returns the same symbol across realms."
:::

## More interview questions on this topic

:::qa Is a symbol property private? {level=medium}
**Say this:** "No. It is hidden from common loops and JSON, but `Object.getOwnPropertySymbols` and `Reflect.ownKeys` expose it. For real privacy use `#private` fields."

**In simple words:** A symbol key is "less visible", not "locked".
:::

:::qa What is the difference between `Symbol("a")` and `Symbol.for("a")`? {level=medium}
**Say this:** "`Symbol('a')` always creates a new unique symbol. `Symbol.for('a')` looks up or creates a symbol in the global registry, so the same key gives the same symbol everywhere, even across iframes."

**In simple words:** One is a fresh ticket each time. The other is a shared ticket you can look up by name.
:::

:::qa Name three well-known symbols and what they do. {level=medium}
**Say this:** "`Symbol.iterator` defines iteration; `Symbol.toPrimitive` defines conversion to primitives; `Symbol.toStringTag` changes the `[object X]` tag. Others: `hasInstance`, `species`, `isConcatSpreadable`, `asyncIterator`."

**In simple words:** They are the "plug-in points" of the language.
:::

:::qa Why does `JSON.stringify` ignore symbol keys? {level=easy}
**Say this:** "JSON only supports string keys. Symbol keys and symbol values are skipped."

**In simple words:** JSON has no concept of symbols.
:::

```quiz
? Are `Symbol("x") === Symbol("x")`?
- true
+ false
- It depends on the engine
> Every symbol is unique.
? Does Object.keys() list symbol keys?
- Yes
+ No, use Object.getOwnPropertySymbols or Reflect.ownKeys
- Only in strict mode
> Symbol keys are not enumerated by normal methods.
? Which symbol makes an object work with for...of?
- Symbol.toPrimitive
+ Symbol.iterator
- Symbol.species
> The iteration protocol hook.
```

:::keypoints
- A **Symbol** is a unique primitive: `Symbol("desc") !== Symbol("desc")`. `Symbol.for` shares by key.
- Use as **collision-free keys** and as **protocol hooks** (well-known symbols).
- Hidden from `for...in`, `Object.keys`, JSON — but **not private** (`getOwnPropertySymbols`, `Reflect.ownKeys`).
- Key well-known symbols: `iterator`, `asyncIterator`, `toPrimitive`, `toStringTag`, `hasInstance`, `species`.
- No implicit string/number conversion: `symbol + ""` throws.
:::
