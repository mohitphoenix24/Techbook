---
title: Implement deep equal
level: medium
time: 25
summary: Write deepEqual that compares arrays, objects, Date, RegExp, Map, Set, NaN and circular structures, and explain why == and JSON.stringify are not enough.
---

:::problem Implement deepEqual {level=easy tags="recursion,equality,objects"}
Write `deepEqual(a, b)` that is `true` when two values have the **same structure and content**.

Rules:

- Primitives: use `Object.is`-like logic, but treat `+0` and `-0` as **equal** and `NaN` as equal to `NaN`.
- Arrays and objects: same keys, same values (order of keys does **not** matter).
- `Date` by time, `RegExp` by source and flags, `Map` and `Set` by content.
- Objects of **different prototypes** are not equal.
- It must not hang on **circular** structures.

```js
deepEqual({ a: [1, 2], b: NaN }, { b: NaN, a: [1, 2] });   // true
deepEqual([1, 2], { 0: 1, 1: 2, length: 2 });              // false
```

:::hint Hint
Compare cheap things first (`===`, type, prototype). Carry a `WeakMap` of **pairs already being compared**: if you meet the same pair again, assume `true` for it.
:::
:::

## Solution and tests

```js run title="deepEqual, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

function deepEqual(a, b, seen = new WeakMap()) {
  if (a === b) return true;                                            // same value or same reference (+0 === -0 too)
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  if (seen.get(a) === b) return true;                                  // this pair is already being compared: break the cycle
  seen.set(a, b);

  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags;

  if (a instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k), seen)) return false;     // keys compared by identity
    return true;
  }
  if (a instanceof Set) {
    if (a.size !== b.size) return false;
    outer: for (const x of a) {
      if (b.has(x)) continue;
      for (const y of b) if (deepEqual(x, y, seen)) continue outer;                           // object members: search for an equal one
      return false;
    }
    return true;
  }

  const keysA = Reflect.ownKeys(a), keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key], seen)) return false;
  }
  return true;
}

// ---------------- tests ----------------
test("primitives", () => {
  assert.equal(deepEqual(1, 1), true);
  assert.equal(deepEqual("a", "b"), false);
  assert.equal(deepEqual(NaN, NaN), true);
  assert.equal(deepEqual(0, -0), true);
  assert.equal(deepEqual(null, undefined), false);
  assert.equal(deepEqual(1, "1"), false);
});

test("nested objects, key order does not matter", () => {
  assert.equal(deepEqual({ a: [1, { b: 2 }], c: "x" }, { c: "x", a: [1, { b: 2 }] }), true);
  assert.equal(deepEqual({ a: 1 }, { a: 1, b: undefined }), false);          // different key count
  assert.equal(deepEqual({ a: undefined }, { b: undefined }), false);        // same count, different keys
});

test("arrays are not array-likes", () => {
  assert.equal(deepEqual([1, 2], { 0: 1, 1: 2, length: 2 }), false);
  assert.equal(deepEqual([1, 2, 3], [1, 2]), false);
  assert.equal(deepEqual([], {}), false);
});

test("Date and RegExp", () => {
  assert.equal(deepEqual(new Date(5), new Date(5)), true);
  assert.equal(deepEqual(new Date(5), new Date(6)), false);
  assert.equal(deepEqual(/a/g, /a/g), true);
  assert.equal(deepEqual(/a/g, /a/i), false);
});

test("Map and Set", () => {
  assert.equal(deepEqual(new Map([["a", { n: 1 }]]), new Map([["a", { n: 1 }]])), true);
  assert.equal(deepEqual(new Map([["a", 1]]), new Map([["a", 2]])), false);
  assert.equal(deepEqual(new Set([1, 2]), new Set([2, 1])), true);
  assert.equal(deepEqual(new Set([{ n: 1 }]), new Set([{ n: 1 }])), true);
  assert.equal(deepEqual(new Set([{ n: 1 }]), new Set([{ n: 2 }])), false);
});

test("different prototypes", () => {
  class A { constructor() { this.x = 1; } }
  class B { constructor() { this.x = 1; } }
  assert.equal(deepEqual(new A(), new B()), false);
  assert.equal(deepEqual(new A(), new A()), true);
  assert.equal(deepEqual({}, Object.create(null)), false);
});

test("circular structures", () => {
  const a = { n: 1 }; a.self = a;
  const b = { n: 1 }; b.self = b;
  assert.equal(deepEqual(a, b), true);
  const c = { n: 2 }; c.self = c;
  assert.equal(deepEqual(a, c), false);
});

test("why JSON.stringify is not a good equality check", () => {
  assert.notEqual(JSON.stringify({ a: 1, b: 2 }), JSON.stringify({ b: 2, a: 1 }));          // key order changes the text
  assert.equal(JSON.stringify({ a: undefined }), JSON.stringify({}));                       // undefined disappears
  assert.equal(JSON.stringify({ n: NaN }), JSON.stringify({ n: null }));                    // NaN becomes null
});
```

:::qa Why is `==` or `===` not enough for objects? {level=easy}
**Say this:** "They compare **references**, not content. Two separate objects with the same fields are never `===`. That is why deep equality needs a recursive walk."

**In simple words:** Same shape is not the same object.
:::

:::qa What is the cost, and what could go wrong in production? {level=medium}
**Say this:** "It is O(n) in the size of both structures, so do not call it on every render for large state. In React, prefer immutable updates and reference checks, and compare only the fields you need. Also decide how to treat `undefined` properties, `-0`, class instances and functions, and document it."

**In simple words:** It is correct but not free; choose where to use it.
:::

:::qa How does a `Set` of objects complicate equality? {level=hard}
**Say this:** "Sets have no order and no keys, so you cannot line up members. For object members you search for any equal member in the other set: O(n²) in the worst case. Primitives are checked fast with `has`."

**In simple words:** Without keys you have to look for a partner for each item.
:::

:::keypoints
- Fast paths first: `===`, `NaN`, type, **prototype**.
- Same **key count** and each key present and **deeply equal**; use `hasOwnProperty`, not just `a[key]`.
- Handle `Date`, `RegExp`, `Map`, `Set`; break **cycles** with a pair map.
- Never use `JSON.stringify(a) === JSON.stringify(b)` for real equality.
:::
