---
title: Object output puzzles
level: advanced
time: 25
summary: Ten puzzles on key order, descriptors, spread order, destructuring defaults, getters, freeze, delete and references.
---

## Puzzle 1: key order

```js run title="Puzzle 1"
const o = { z: 1, 10: "ten", a: 2, 2: "two", "-5": "neg", 1.5: "float" };
console.log(Object.keys(o));
```

:::hint Show the reason
Only non-negative **integer** keys are sorted first (`2`, `10`). Then the other strings in insertion order: `z`, `a`, `-5`, `1.5`. Output: `[ '2', '10', 'z', 'a', '-5', '1.5' ]`.
:::

## Puzzle 2: references

```js run title="Puzzle 2"
const a = { n: 1 };
const b = a;
b.n = 2;
const c = { ...a };
c.n = 3;

console.log(a.n, b.n, c.n, a === b, a === c);
```

:::hint Show the reason
`b` is the same object as `a`. `c` is a copy. Output: `2 2 3 true false`.
:::

## Puzzle 3: spread order

```js run title="Puzzle 3"
const base = { a: 1, b: 2 };
console.log({ ...base, b: 20 }, { b: 20, ...base }, { ...base, ...{ a: undefined } });
```

:::hint Show the reason
The later key wins, **even if the value is `undefined`**. Output: `{ a: 1, b: 20 } { b: 2, a: 1 } { a: undefined, b: 2 }`. (Note the order of keys in the second.)
:::

## Puzzle 4: destructuring defaults

```js run title="Puzzle 4"
const { a = 1, b = 2, c = 3, d = 4 } = { a: undefined, b: null, c: 0 };
console.log(a, b, c, d);
```

:::hint Show the reason
Defaults apply only for `undefined` (and missing). Output: `1 null 0 4`.
:::

## Puzzle 5: delete and shadowing

```js run title="Puzzle 5"
const proto = { x: "from proto" };
const o = Object.create(proto);
o.x = "own";

delete o.x;
console.log(o.x);
delete o.x;
console.log(o.x, delete proto.x, o.x);
```

:::hint Show the reason
After deleting the own property, the inherited one shows: `from proto`. A second `delete o.x` does nothing (the property is not own). Then `delete proto.x` removes the inherited one. Output: `from proto` then `from proto true undefined`.
:::

## Puzzle 6: getters and JSON

```js run title="Puzzle 6"
const o = {
  _v: 1,
  get v() { return this._v; },
  set v(x) { this._v = x * 2; },
};

o.v = 5;
console.log(o.v, JSON.stringify(o), Object.keys(o));
```

:::hint Show the reason
The setter stores `10`. `JSON.stringify` includes both the data property `_v` and the accessor `v` (its **getter value**, since accessors on the object are own enumerable properties). Output: `10 {"_v":10,"v":10} [ '_v', 'v' ]`.
:::

## Puzzle 7: frozen but not deep

```js run title="Puzzle 7"
const o = Object.freeze({ list: [1], n: 1 });
try { o.n = 2; } catch { console.log("n blocked"); }
o.list.push(2);
console.log(o, Object.isFrozen(o), Object.isFrozen(o.list));
```

:::hint Show the reason
`n` cannot be changed (strict mode throws, caught). The array inside is not frozen, so the push works. Output: `n blocked`, then `{ list: [ 1, 2 ], n: 1 } true false`.
:::

## Puzzle 8: keys that look the same

```js run title="Puzzle 8"
const o = {};
const k1 = { id: 1 };
const k2 = { id: 2 };
o[k1] = "first";
o[k2] = "second";

console.log(Object.keys(o), o[k1]);

const m = new Map([[k1, "first"], [k2, "second"]]);
console.log(m.size, m.get(k1));
```

:::hint Show the reason
Object keys are strings, so both objects become `"[object Object]"` and the second write overwrites the first. A `Map` keeps real object keys. Output: `[ '[object Object]' ] second` and `2 first`.
:::

## Puzzle 9: optional chaining and nullish

```js run title="Puzzle 9"
const o = { a: 0, b: "", c: null, d: { e: false } };

console.log(o.a || "x", o.a ?? "x");
console.log(o.b || "x", o.b ?? "x");
console.log(o.c || "x", o.c ?? "x", o.d?.e ?? "x", o.d?.f ?? "x", o.z?.y.w ?? "x");
```

:::hint Show the reason
`||` replaces `0`, `""`; `??` keeps them. `null` is replaced by both. `d.e` is `false` (kept by `??`). Missing `d.f` and the short-circuited `z?.y.w` give the default. Output: `x 0`, `x `, `x x false x x`. (The second line has two spaces: the empty string.)
:::

## Puzzle 10: Object.entries order and numbers

```js run title="Puzzle 10"
const scores = { b: 20, a: 10, 3: 5, 1: 15 };
const sorted = Object.entries(scores).sort(([, x], [, y]) => y - x);
console.log(sorted);
console.log(Object.fromEntries(sorted));
```

:::hint Show the reason
Entries sorted by value descending: `[ 'b', 20 ]`, `[ '1', 15 ]`, `[ 'a', 10 ]`, `[ '3', 5 ]`. But `fromEntries` creates a new object, and integer-like keys (`1`, `3`) come **first** again. Output: `{ '1': 15, '3': 5, b: 20, a: 10 }`. Use a `Map` or keep the array if order matters.
:::

:::keypoints
- Integer-like keys sort first; other keys keep insertion order.
- `{ ...a, b }` order matters; a later `undefined` still overrides.
- Defaults apply to `undefined` only. `??` keeps `0` and `""`.
- Object keys become **strings**: object keys collide as `"[object Object]"`. Use `Map`.
- `freeze` is shallow. `delete` removes own properties only.
:::
