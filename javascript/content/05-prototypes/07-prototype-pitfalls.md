---
title: Prototype pitfalls and prototype pollution
level: advanced
time: 25
summary: Common bugs with prototypes (for...in, shared state, instanceof across realms, JSON), how prototype pollution works and why it is a security problem, and how to defend against it.
---

## Pitfall 1: `for...in` and inherited keys

```js run title="for...in sees inherited properties"
const base = { inherited: 1 };
const obj = Object.create(base);
obj.own = 2;

for (const k in obj) console.log("for...in:", k);
for (const k of Object.keys(obj)) console.log("Object.keys:", k);

// If you must use for...in, filter:
for (const k in obj) if (Object.hasOwn(obj, k)) console.log("filtered:", k);
```

## Pitfall 2: calling `obj.hasOwnProperty(...)` on user data

`hasOwnProperty` is itself a property that comes from `Object.prototype`. If the data has a key with that name, or has no prototype, the call breaks.

```js run title="obj.hasOwnProperty can be shadowed or missing"
const data = JSON.parse('{"hasOwnProperty": "oops"}');
try {
  data.hasOwnProperty("x");
} catch (e) {
  console.log(e.name + ": " + e.message);
}

const bare = Object.create(null);
console.log(typeof bare.hasOwnProperty);

console.log(Object.hasOwn(data, "x"), Object.hasOwn(bare, "x"));   // safe versions
```

Use `Object.hasOwn(obj, key)` (ES2022), or `Object.prototype.hasOwnProperty.call(obj, key)`.

## Pitfall 3: `instanceof` across realms

Each iframe or `vm` context has its **own** `Array`, `Object` and `Error`. An array from another realm is **not** `instanceof Array`.

```js run node title="Arrays from another realm"
const vm = require("node:vm");
const foreignArray = vm.runInNewContext("[1, 2, 3]");

console.log(foreignArray instanceof Array);       // false: different Array constructor
console.log(Array.isArray(foreignArray));         // true: works across realms
console.log(Object.prototype.toString.call(foreignArray));
```

Use `Array.isArray` and `Object.prototype.toString.call(x)` for type checks that must work across frames.

## Pitfall 4: the `constructor` check

`obj.constructor === Foo` can be fooled by a replaced prototype or `Object.create(null)`. Prefer `instanceof` for classes, and think about duck typing (check for the methods you need).

## Pitfall 5: `JSON` and prototypes

`JSON.stringify` only writes **own enumerable** properties, and `JSON.parse` returns **plain objects**. A class instance loses its prototype in a round trip.

```js run title="A round trip loses the class"
class Point {
  constructor(x, y) { this.x = x; this.y = y; }
  len() { return Math.hypot(this.x, this.y); }
}

const p = new Point(3, 4);
const copy = JSON.parse(JSON.stringify(p));

console.log(p.len(), copy instanceof Point, typeof copy.len);
const revived = Object.assign(Object.create(Point.prototype), copy);   // put the prototype back
console.log(revived.len());
```

## Prototype pollution: the security problem

If an attacker can make your code write to `Object.prototype`, **every object in the program** gets that property, because everything inherits from it.

:::analogy Poisoning the water supply
Every house gets water from the same supply (`Object.prototype`). If someone adds poison at the supply, all houses are affected, even houses that never did anything wrong.
:::

### How it happens

The classic cause is an unsafe **recursive merge** (or `set` by path) that copies keys from user input, including the special key `__proto__`.

```js run title="A vulnerable merge function"
function unsafeMerge(target, source) {
  for (const key in source) {
    if (typeof source[key] === "object" && source[key] !== null) {
      target[key] = target[key] || {};
      unsafeMerge(target[key], source[key]);     // for key "__proto__", target[key] is Object.prototype!
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const userInput = JSON.parse('{"__proto__": {"isAdmin": true}}');
console.log("before:", ({}).isAdmin);

unsafeMerge({}, userInput);

console.log("after:", ({}).isAdmin);               // EVERY new object now has isAdmin = true!
const session = {};
if (session.isAdmin) console.log("access granted to a user who is not an admin");

delete Object.prototype.isAdmin;                    // clean up the demo
```

`JSON.parse` creates `__proto__` as a **normal own key**. But `target["__proto__"]` **reads** the prototype (an object), so the merge goes into `Object.prototype`. Real libraries (lodash, jQuery, minimist and many more) have had CVEs from this.

### How to defend

```js run title="A safe merge"
function safeMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;   // block dangerous keys
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!Object.hasOwn(target, key)) target[key] = {};
      safeMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

safeMerge({}, JSON.parse('{"__proto__": {"isAdmin": true}, "name": "x"}'));
console.log(({}).isAdmin);                           // undefined: safe
```

More defences:

1. **Validate input** with a schema (Zod, Ajv): reject unknown keys.
2. Use **`Map`** or **`Object.create(null)`** for objects with user-controlled keys.
3. **`Object.freeze(Object.prototype)`** at start-up (can break some libraries).
4. In Node, run with **`--disable-proto=delete`** to remove the `__proto__` accessor.
5. Keep dependencies **updated** and run `npm audit`.

(There is more in the [security module](#/l/prototype-pollution-security).)

:::interview What is prototype pollution and how do you prevent it?
"Prototype pollution is when an attacker can add or change properties on `Object.prototype`, usually through an unsafe recursive merge or path-set function that accepts the key `__proto__` or `constructor.prototype`. Since every object inherits from it, the injected property appears on all objects, which can bypass checks like `if (user.isAdmin)` or lead to remote code execution. To prevent it, I skip the keys `__proto__`, `constructor` and `prototype`, validate input with a schema that rejects unknown keys, use `Map` or `Object.create(null)` for user-keyed data, freeze the prototype if possible, and keep libraries updated."
:::

## More interview questions on this topic

:::qa Why is `Object.hasOwn` preferred over `obj.hasOwnProperty`? {level=medium}
**Say this:** "`hasOwnProperty` can be shadowed by data or missing on objects created with `Object.create(null)`. `Object.hasOwn` is a static function that always works on any object."

**In simple words:** It cannot be broken by the data you are checking.
:::

:::qa Why does `[] instanceof Array` sometimes fail? {level=hard}
**Say this:** "Different realms (iframes, vm contexts) have different `Array` constructors. An array from another realm has another prototype. Use `Array.isArray`."

**In simple words:** The array came from a different "world" with its own copy of `Array`.
:::

:::qa How does `JSON.parse('{"__proto__": {...}}')` relate to pollution? {level=hard}
**Say this:** "`JSON.parse` creates an own property named `__proto__`, which is harmless by itself. The danger is when later code treats that key like a normal key during a merge or assignment, which reads the real prototype."

**In simple words:** The key looks like data, but the assignment code treats it as a door to the prototype.
:::

```quiz
? Which function check is safe on objects without a prototype?
- obj.hasOwnProperty(k)
+ Object.hasOwn(obj, k)
- k in obj
> hasOwn is static, so it does not depend on the object's chain.
? What does prototype pollution change?
- Only one object
+ Properties inherited by all objects
- Only the global variables
> Everything inherits from Object.prototype.
? Which of these is a good defence?
- Using for...in for merging
+ Skipping the keys __proto__, constructor and prototype, and validating input
- Using var
> Block the dangerous keys and validate.
```

:::keypoints
- `for...in` includes inherited keys. Prefer `Object.keys` / `Object.entries`.
- Use **`Object.hasOwn`**, not `obj.hasOwnProperty`.
- `instanceof` fails across realms. Use **`Array.isArray`**.
- `JSON` round trips drop prototypes.
- **Prototype pollution**: unsafe merges write to `Object.prototype` via `__proto__`. Block the keys, validate input, use `Map`.
:::
