---
title: Objects: keys, order and the Object static methods
level: easy
time: 30
summary: Object literals and shorthand, computed keys, how keys are ordered, own vs inherited properties, and the Object.keys/values/entries/fromEntries/assign family you use every day.
---

## Objects in one picture

An object is a collection of **key → value** pairs. Keys are **strings or symbols**. (Numbers become strings: `obj[1]` is `obj["1"]`.) Values can be anything.

```js run title="Object literal features"
const id = 7;
const field = "email";

const user = {
  id,                                  // shorthand: id: id
  name: "Asha",
  "full-name": "Asha Rao",             // keys with special characters need quotes
  [field]: "asha@mail.com",            // computed key: "email"
  [`${field}Verified`]: true,          // computed from a template string
  greet() { return `Hi, I am ${this.name}`; },   // method shorthand
  address: { city: "Pune" },
};

console.log(user);
console.log(user.name, user["full-name"], user[field]);
console.log(user.greet());
```

## Reading, writing, deleting, checking

```js run title="Property operations"
const book = { title: "JS Mastery", pages: 300 };

book.author = "Meera";                   // add
book["pages"] = 320;                     // change
delete book.title;                       // remove
console.log(book);

console.log("pages" in book, "title" in book);          // in: own or inherited
console.log(Object.hasOwn(book, "pages"));              // own only
console.log(book.missing, book.missing?.deeper);        // undefined (no error until you go deeper)
```

## Key order

JavaScript objects **do** have an order, and it is not always insertion order:

1. **Integer-like keys** (`"0"`, `"1"`, `"42"`) come first, in **ascending numeric** order.
2. Then **string keys** in **insertion** order.
3. Then **symbol keys** in insertion order.

```js run title="Key order surprises"
const o = { b: 1, 2: "two", a: 2, 1: "one", [Symbol("s")]: "sym", "-1": "neg" };

console.log(Object.keys(o));
console.log(JSON.stringify(o));
```

If you need a guaranteed insertion order with any key, or non-string keys, use a **`Map`**.

## The Object static methods

| Method | Returns |
|---|---|
| `Object.keys(o)` | array of own **enumerable string** keys |
| `Object.values(o)` | array of the values |
| `Object.entries(o)` | array of `[key, value]` pairs |
| `Object.fromEntries(pairs)` | object built from `[key, value]` pairs (the reverse of `entries`) |
| `Object.assign(target, ...sources)` | copies own enumerable props **into** `target` (mutates it), returns it |
| `Object.create(proto, descriptors?)` | new object with that prototype |
| `Object.getPrototypeOf(o)` / `setPrototypeOf` | read / change the prototype |
| `Object.hasOwn(o, k)` | own property check |
| `Object.is(a, b)` | "same value" comparison |
| `Object.freeze / seal / preventExtensions` | restrict changes |
| `Object.getOwnPropertyNames(o)` | own string keys, **including non-enumerable** |
| `Object.getOwnPropertySymbols(o)` | own symbol keys |
| `Object.groupBy(items, fn)` | group an array by a key function |

```js run title="keys, values, entries, fromEntries"
const prices = { apple: 40, pear: 55, fig: 120 };

console.log(Object.keys(prices), Object.values(prices));
console.log(Object.entries(prices));

// transform an object: entries -> map -> fromEntries
const withTax = Object.fromEntries(Object.entries(prices).map(([item, p]) => [item, Math.round(p * 1.18)]));
console.log(withTax);

// filter an object
const cheap = Object.fromEntries(Object.entries(prices).filter(([, p]) => p < 100));
console.log(cheap);

// loop with destructuring
for (const [item, p] of Object.entries(prices)) console.log(`${item}: ${p}`);

// Map <-> object
const map = new Map(Object.entries(prices));
console.log(map, Object.fromEntries(map));
```

## `Object.assign` and merging

```js run title="Object.assign: copy and merge (shallow)"
const defaults = { theme: "light", lang: "en", pageSize: 10 };
const userPrefs = { theme: "dark" };

const merged = Object.assign({}, defaults, userPrefs);       // later sources win
console.log(merged);
console.log({ ...defaults, ...userPrefs });                    // spread: same result, nicer syntax

const target = { a: 1 };
const result = Object.assign(target, { b: 2 });
console.log(result === target, target);                        // assign MUTATES the first argument
```

Both are **shallow**: nested objects are shared. Also, `assign` calls **setters** on the target, but spread **defines** properties.

## Own enumerable vs everything else

```js run title="Which properties does each method see?"
class Base { inherited() {} }
const o = Object.create(new Base(), {
  hidden: { value: 1, enumerable: false },
  visible: { value: 2, enumerable: true },
});
o[Symbol("tag")] = "x";

console.log("keys:", Object.keys(o));                        // enumerable own strings
console.log("names:", Object.getOwnPropertyNames(o));        // + non-enumerable
console.log("symbols:", Object.getOwnPropertySymbols(o).length);
console.log("Reflect.ownKeys:", Reflect.ownKeys(o));         // everything own: strings + symbols
const seen = [];
for (const k in o) seen.push(k);                              // enumerable, own + inherited (strings)
console.log("for...in:", seen);
console.log("spread copies:", Object.keys({ ...o }));
```

## Comparing objects

Objects are compared by **reference**:

```js run title="Reference equality"
const a = { x: 1 };
const b = { x: 1 };
const c = a;

console.log(a === b, a === c);
console.log(JSON.stringify(a) === JSON.stringify(b));          // quick, but order-sensitive and lossy
```

(A real deep-equal function is in the challenges.)

## Property access tips

```js run title="Dynamic keys and counting"
const text = "to be or not to be";
const count = {};
for (const w of text.split(" ")) count[w] = (count[w] || 0) + 1;
console.log(count);

// prototype-free dictionary avoids clashes with built-in keys like "constructor"
const safe = Object.create(null);
for (const w of ["constructor", "toString", "x"]) safe[w] = 1;
console.log(Object.keys(safe));

const bad = {};
console.log(bad["constructor"] === Object, bad["toString"] !== undefined);   // inherited keys appear present!
```

:::interview How are object keys ordered? When would you use a Map instead of an object?
"Integer-like keys come first in ascending numeric order, then string keys in insertion order, then symbols. I use a `Map` when I need arbitrary key types (objects, numbers kept as numbers), guaranteed insertion order for all keys, frequent adds and deletes, an easy `size`, or when keys come from user input and could clash with `__proto__` or inherited names. Plain objects are better for fixed, known shapes, JSON data and record-like data."
:::

## More interview questions on this topic

:::qa What is the difference between `Object.keys`, `Object.getOwnPropertyNames` and `for...in`? {level=medium}
**Say this:** "`Object.keys` returns own enumerable string keys. `getOwnPropertyNames` also includes non-enumerable ones. `for...in` loops over enumerable string keys, own and inherited."

**In simple words:** keys = visible own keys. getOwnPropertyNames = all own string keys. for...in = also the parents' keys.
:::

:::qa How do you transform the values of an object? {level=easy}
**Say this:** "`Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, f(v)]))`."

**In simple words:** Turn into pairs, change, turn back.
:::

:::qa What does `Object.assign` do? Is it a deep copy? {level=easy}
**Say this:** "It copies own enumerable properties from sources into the target and returns the target. It mutates the target and is shallow: nested objects are shared."

**In simple words:** A shallow merge into the first object.
:::

:::qa Why does `{}["constructor"]` not give `undefined`? {level=medium}
**Say this:** "The key is found through the prototype chain: `Object.prototype.constructor`. Using plain objects as dictionaries with user keys can therefore collide with inherited names. Use `Map` or `Object.create(null)`."

**In simple words:** Plain objects come with built-in keys.
:::

```quiz
? What order does Object.keys give for { b: 1, 2: 'x', a: 2, 1: 'y' }?
- ['b', '2', 'a', '1']
+ ['1', '2', 'b', 'a']
- ['1', '2', 'a', 'b']
> Integer keys first (ascending), then strings in insertion order.
? What does Object.fromEntries do?
- Splits an object into pairs
+ Builds an object from [key, value] pairs
- Copies an object
> The reverse of Object.entries.
? Is `Object.assign({}, a)` a deep copy?
- Yes
+ No, it is shallow
- Only for arrays
> Nested objects are shared.
```

:::keypoints
- Keys are strings or symbols. Order: **integer keys ascending → strings by insertion → symbols**.
- `Object.keys/values/entries/fromEntries` transform objects; `assign` and spread merge **shallowly**.
- `hasOwn` = own; `in` = own + inherited; `for...in` = enumerable, inherited too; `Reflect.ownKeys` = everything own.
- Objects compare by **reference**. Use `Map` for arbitrary keys and stable order.
:::
