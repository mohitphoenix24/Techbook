---
title: "Core bank: types, equality, copying and objects"
level: medium
time: 30
summary: Fourteen answers on primitives and objects, typeof, == versus ===, coercion, NaN and Object.is, shallow and deep copy, freeze, descriptors, Map and Set, and number precision.
---

## Types

:::qa What are the data types in JavaScript? {level=easy}
**Say this:** "Seven primitives: string, number, bigint, boolean, undefined, null and symbol. Everything else is an object (arrays, functions, dates, maps and so on). Primitives are immutable and compared by value; objects are compared by reference."

**In simple words:** Primitives are values you copy; objects are houses you share by address.
:::

:::qa Why is `typeof null` equal to `'object'`? {level=medium}
**Say this:** "It is a bug from the first version of JavaScript, where the type tag for `null` (the null pointer) matched the tag for objects. It was never fixed because it would break existing code. Check `value === null` explicitly."

**In simple words:** An old mistake that stayed for compatibility.
:::

:::qa How do you reliably check for an array, a plain object or `NaN`? {level=easy}
**Say this:** "`Array.isArray(x)` for arrays. For a plain object: `x !== null && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype` (or `null`). For NaN: `Number.isNaN(x)`, not `x === NaN`, which is always false."

**In simple words:** `typeof` is too blunt for these.
:::

## Equality and coercion

:::qa What is the difference between `==` and `===`? {level=easy}
**Say this:** "`===` compares type and value without conversion. `==` converts types first by a set of rules, so `0 == '0'` is true and `null == undefined` is true. Use `===` by default; `x == null` is an accepted shortcut for 'null or undefined'."

**In simple words:** `===` is strict and predictable; `==` tries to be helpful and surprises you.
:::

:::qa Why is `NaN !== NaN`, and what is `Object.is`? {level=medium}
**Say this:** "By the IEEE 754 standard, NaN is not equal to anything, even itself. `Object.is(a, b)` is 'same value' equality: it says NaN equals NaN and tells `+0` from `-0`. `Map`, `Set.has` and React's dependency comparison use similar rules."

**In simple words:** Two 'not a number' results are not necessarily the same mistake, so the standard says no.
:::

:::qa What are the falsy values? {level=easy}
**Say this:** "`false`, `0`, `-0`, `0n`, `''`, `null`, `undefined` and `NaN`. Everything else is truthy, including `'0'`, `'false'`, `[]` and `{}`."

**In simple words:** Eight values mean 'no'; the rest mean 'yes'.
:::

:::qa Explain `[] + {}`, `[] == false` and `'5' - 2`. {level=hard}
**Say this:** "`+` with a non-number operand converts both to primitives; `[]` becomes `''` and `{}` becomes `'[object Object]'`, so the result is the string `'[object Object]'`. `[] == false`: both go to numbers, `0 == 0`, true. `-` always means number, so `'5' - 2` is `3`."

**In simple words:** `+` may join text, `-` always does maths.
:::

:::qa What is the difference between `||` and `??`? {level=easy}
**Say this:** "`a || b` uses `b` for any falsy `a`, including `0` and `''`. `a ?? b` uses `b` only when `a` is `null` or `undefined`. Use `??` for defaults when `0`, `''` or `false` are valid values."

**In simple words:** `||` rejects zero; `??` only rejects 'nothing'.
:::

## Copying and objects

:::qa Shallow copy versus deep copy? {level=easy}
**Say this:** "A shallow copy (`{...o}`, `Object.assign`, `slice`, `[...a]`) copies the top level; nested objects are still shared. A deep copy duplicates everything. `structuredClone(o)` is built in; `JSON.parse(JSON.stringify(o))` is a hack that drops functions, `undefined` and symbols, breaks Dates, Maps, Sets and circular references."

**In simple words:** Shallow copy photocopies the cover only; deep copy copies every page.
:::

:::qa What can `structuredClone` not clone? {level=medium}
**Say this:** "Functions, DOM nodes, and class instances lose their prototype (they become plain objects). Getters are read and stored as values. It handles Date, RegExp, Map, Set, typed arrays and circular references."

**In simple words:** It copies data, not behaviour.
:::

:::qa `Object.freeze` versus `Object.seal` versus `const`? {level=medium}
**Say this:** "`const` stops reassigning the variable. `Object.freeze` makes an object's own properties read-only and stops adding or deleting (shallow). `Object.seal` stops adding and deleting but allows changing existing values. Freeze is shallow, so nested objects stay changeable."

**In simple words:** `const` locks the label, `freeze` locks the box, `seal` locks the shape.
:::

:::qa What are property descriptors? {level=hard}
**Say this:** "Each property has attributes: `value`, `writable`, `enumerable`, `configurable`, or `get`/`set` for accessors. `Object.defineProperty` sets them. Properties defined this way default to `false` for all flags, which is how built-in methods stay hidden from `for...in`."

**In simple words:** Hidden settings that say whether a property can be changed, listed or removed.
:::

:::qa When would you use `Map` instead of a plain object? {level=medium}
**Say this:** "When keys are not strings (objects, numbers), when you add and remove many keys, when you need the insertion order and `size`, or when keys come from users (no prototype-key clashes like `__proto__`). `WeakMap` keys do not stop garbage collection."

**In simple words:** A Map is a real dictionary; an object is a record that also works as a dictionary.
:::

:::qa Why is `0.1 + 0.2 !== 0.3`, and what is the safe integer limit? {level=medium}
**Say this:** "Numbers are 64-bit binary floats; 0.1 and 0.2 cannot be stored exactly, so the sum is `0.30000000000000004`. Compare with a tolerance (`Math.abs(a - b) < Number.EPSILON`) or use integers (paise instead of rupees). Integers are exact up to `Number.MAX_SAFE_INTEGER` (2^53 − 1); beyond that use `BigInt`."

**In simple words:** A computer cannot write one-tenth exactly in binary, just as we cannot write one-third in decimal.
:::

:::keypoints
- 7 primitives + objects; primitives by **value**, objects by **reference**.
- Use `===`, `Number.isNaN`, `Array.isArray`, `??` for defaults.
- **Shallow** copies share nested objects; `structuredClone` for deep data.
- `freeze` is shallow; `Map`/`Set` for real collections.
- Money: use **integers** (smallest unit); big IDs: **BigInt** or strings.
:::
