---
title: Types, typeof and reliable type checks
level: easy
time: 25
summary: The seven primitive types and objects, how primitives differ from objects (copy by value, immutability, wrappers), the typeof quirks (null, functions, NaN) and the robust ways to check types.
---

## The types

JavaScript has **8 types**: **7 primitives** and **objects**.

| Type | Example | `typeof` |
|---|---|---|
| `undefined` | `let x;` | `"undefined"` |
| `null` | `null` | `"object"` (a famous bug!) |
| `boolean` | `true` | `"boolean"` |
| `number` | `42`, `3.14`, `NaN`, `Infinity` | `"number"` |
| `bigint` | `123n` | `"bigint"` |
| `string` | `"hello"` | `"string"` |
| `symbol` | `Symbol("id")` | `"symbol"` |
| **object** (arrays, functions, dates, maps...) | `{}`, `[]`, `new Date()` | `"object"` (functions: `"function"`) |

```js run title="typeof and its quirks"
console.log(typeof undefined, typeof true, typeof 42, typeof 10n, typeof "s", typeof Symbol());
console.log(typeof {}, typeof [], typeof new Date(), typeof /re/);
console.log(typeof function () {}, typeof class {});                 // "function" for both
console.log(typeof null);                                            // "object": a bug from 1995 that can never be fixed
console.log(typeof NaN);                                             // "number": NaN is a number value
console.log(typeof notDeclared);                                     // "undefined": typeof never throws for undeclared names
```

## Primitives vs objects

| | Primitives | Objects |
|---|---|---|
| Stored / copied | **by value** | **by reference** |
| Mutable? | **No**: immutable | Yes |
| Compared | by value | by reference (identity) |
| Have properties/methods? | Through temporary wrapper objects | Yes |

```js run title="Copy by value vs by reference"
let a = 10;
let b = a;
b++;
console.log(a, b);                      // primitives: independent copies

const o1 = { n: 10 };
const o2 = o1;
o2.n++;
console.log(o1.n, o2.n, o1 === o2);     // objects: both names point to one object
```

### Primitives are immutable

```js run title="You cannot change a primitive in place"
const s = "hello";
try { s[0] = "J"; } catch (e) { console.log("strict mode:", e.name); }    // no effect in sloppy mode
console.log(s, s.toUpperCase(), s);     // methods return NEW strings
```

### Wrapper objects: why `"abc".length` works

When you use a property or method on a primitive, JavaScript creates a **temporary wrapper object** (`String`, `Number`, `Boolean`) and discards it.

```js run title="Wrappers"
console.log("abc".length, (5).toFixed(2), true.toString());

const prim = "text";
const wrapped = new String("text");              // avoid: an object, not a primitive!
console.log(typeof prim, typeof wrapped);
console.log(prim === "text", wrapped === "text", wrapped == "text", wrapped.valueOf() === "text");

const flag = new Boolean(false);
console.log(flag ? "truthy!" : "falsy");         // an object is always truthy, even new Boolean(false)
```

Never use `new String`, `new Number`, `new Boolean`. Calling them **without** `new` is fine for conversion: `Number("5")`, `String(5)`, `Boolean(0)`.

## `undefined` vs `null`

| | `undefined` | `null` |
|---|---|---|
| Meaning | "no value assigned" (JavaScript's default) | "deliberately empty" (set by you) |
| Examples | uninitialised variable, missing property, missing argument, function with no `return` | "no user found", clearing a value |
| `typeof` | `"undefined"` | `"object"` |
| In JSON | dropped | kept as `null` |
| `==` | `null == undefined` is **true** | `null === undefined` is **false** |

```js run title="Where undefined comes from"
let declared;
const obj = {};
function noReturn() {}
function takesTwo(a, b) { return b; }

console.log(declared, obj.missing, noReturn(), takesTwo(1), [1, , 3][1], void 0);
console.log(null == undefined, null === undefined, null == 0, null >= 0, undefined == 0);
```

## Reliable type checks

`typeof` is too weak for objects. Use the right check for each case:

| Question | Use |
|---|---|
| Is it a string / number / boolean / function / symbol / bigint? | `typeof x === "string"` etc. |
| Is it `null`? | `x === null` |
| Is it `undefined`? | `x === undefined` (or `typeof x === "undefined"` for possibly undeclared names) |
| Is it **null or undefined**? | `x == null` (the one good use of `==`) or `x ?? ...` |
| Is it an **array**? | `Array.isArray(x)` |
| Is it a **plain object**? | `x !== null && typeof x === "object" && !Array.isArray(x)` or check the prototype |
| Is it a **NaN**? | `Number.isNaN(x)` (not `x === NaN`, and not global `isNaN`) |
| Is it a finite number? | `Number.isFinite(x)` |
| Is it an integer / safe integer? | `Number.isInteger(x)` / `Number.isSafeInteger(x)` |
| What exact built-in type? | `Object.prototype.toString.call(x)` |
| Is it an instance of a class? | `x instanceof Class` (same realm only) |

```js run title="A robust typeOf helper"
const typeOf = (x) => Object.prototype.toString.call(x).slice(8, -1).toLowerCase();

const samples = [null, undefined, 1, "s", true, 10n, Symbol("x"), [], {}, () => {}, new Date(), /re/, new Map(), new Set(), new Error("e"), Promise.resolve(), NaN];
console.log(samples.map(typeOf).join(", "));

const isPlainObject = (x) => x !== null && typeof x === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(x));
console.log(isPlainObject({}), isPlainObject([]), isPlainObject(new Date()), isPlainObject(Object.create(null)));

console.log(Number.isNaN("abc"), isNaN("abc"));                     // global isNaN coerces first: a trap
console.log(Number.isInteger(5.0), Number.isInteger(5.5), Number.isSafeInteger(2 ** 53));
```

You can customise the result of `Object.prototype.toString` with `Symbol.toStringTag`:

```js run title="Symbol.toStringTag"
class Money { get [Symbol.toStringTag]() { return "Money"; } }
console.log(Object.prototype.toString.call(new Money()), String(new Money()));
```

## Truthy and falsy

**Falsy values** (everything else is truthy): `false`, `0`, `-0`, `0n`, `""`, `null`, `undefined`, `NaN`.

```js run title="Truthiness"
const values = [false, 0, -0, 0n, "", null, undefined, NaN, "0", "false", [], {}, () => {}, " "];
const label = (v) => (Object.is(v, -0) ? "-0" : typeof v === "string" ? JSON.stringify(v) : typeof v === "bigint" ? v + "n" : typeof v === "function" ? "function" : Array.isArray(v) ? "[]" : v !== null && typeof v === "object" ? "{}" : String(v));
for (const v of values) console.log(label(v).padEnd(10), Boolean(v));
```

Traps: `"0"` and `"false"` are truthy (non-empty strings), and `[]` and `{}` are truthy (objects).

:::interview What are the data types in JavaScript? What is the difference between primitives and objects?
"Seven primitives: undefined, null, boolean, number, bigint, string and symbol, plus objects, which include arrays, functions, dates and so on. Primitives are immutable and copied and compared by value; objects are mutable and copied and compared by reference. Methods on primitives work through temporary wrapper objects. `typeof null` is 'object', a historical bug, and functions give 'function'. For reliable checks I use `Array.isArray`, `Number.isNaN`, `x == null` for null or undefined, and `Object.prototype.toString.call` for built-in types."
:::

## More interview questions on this topic

:::qa Why is `typeof null` "object"? {level=easy}
**Say this:** "A bug in the first JavaScript engine, where the type tag for objects was 0 and null was the null pointer, also 0. It was never fixed, to avoid breaking the web."

**In simple words:** Old mistake, kept forever. Check `x === null`.
:::

:::qa What is the difference between `null` and `undefined`? {level=easy}
**Say this:** "`undefined` means a value was never assigned. `null` is an intentional empty value that you set. They are loosely equal (`==`) but not strictly equal."

**In simple words:** undefined = "nothing was put there". null = "I put 'nothing' there".
:::

:::qa How do you check if a value is an array? A NaN? {level=easy}
**Say this:** "`Array.isArray(x)` and `Number.isNaN(x)`. `typeof []` is 'object' and `NaN === NaN` is false."

**In simple words:** Use the dedicated functions.
:::

:::qa Why does `new Boolean(false)` behave as true? {level=medium}
**Say this:** "It is an object, and all objects are truthy. Use the primitive `false` or `Boolean(x)` without `new`."

**In simple words:** The wrapper is a box. A box is "something", even if it contains false.
:::

```quiz
? What does `typeof NaN` return?
- "NaN"
+ "number"
- "undefined"
> NaN is a numeric value (not-a-number).
? Which is the safest array check?
- typeof x === "array"
+ Array.isArray(x)
- x instanceof Object
> typeof returns "object" for arrays.
? Which value is truthy?
- 0
- ""
+ "0"
> A non-empty string is truthy.
```

:::keypoints
- **7 primitives + objects.** Primitives: immutable, by value. Objects: mutable, by reference.
- `typeof null === "object"` (bug), `typeof function === "function"`, `typeof NaN === "number"`, `typeof undeclared === "undefined"`.
- Reliable checks: `Array.isArray`, `Number.isNaN`, `x == null`, `Object.prototype.toString.call`.
- **Falsy:** `false, 0, -0, 0n, "", null, undefined, NaN`. Everything else is truthy (even `"0"`, `[]`, `{}`).
- Never use `new String/Number/Boolean`.
:::
