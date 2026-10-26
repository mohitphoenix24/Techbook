---
title: Implement array methods (map, filter, reduce)
level: easy
time: 25
summary: Write your own map, filter, reduce, forEach and some/every the way the spec does it: thisArg, holes in sparse arrays, no initial value, and the callback arguments.
---

:::problem Implement map, filter and reduce {level=easy tags="arrays,polyfill,reduce"}
Write `myMap`, `myFilter`, `myReduce`, `myForEach`, `mySome` and `myEvery` as functions that take the array as `this` (like real methods).

They must behave like the built-ins:

- The callback gets `(value, index, array)`.
- An optional **`thisArg`** sets `this` inside the callback (not for `reduce`).
- **Holes** in sparse arrays are skipped (the callback is not called for them).
- `reduce` **without an initial value** uses the first existing element as the start, and throws a `TypeError` on an empty array.
- A non-function callback throws a `TypeError`.

```js
[1, 2, 3].myMap((x) => x * 2);                 // [2, 4, 6]
[1, 2, 3].myReduce((a, b) => a + b);           // 6
```

:::hint Hint
Loop with an index and check `i in this` to skip holes. Read `length` **once** at the start.
:::
:::

## Solution and tests

```js run title="Array polyfills, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

const need = (cb) => { if (typeof cb !== "function") throw new TypeError(String(cb) + " is not a function"); };

// We attach to a private object here so we do not change the real Array.prototype in the demo.
const mine = {
  map(cb, thisArg) {
    need(cb);
    const len = this.length;
    const out = new Array(len);                           // keep holes as holes
    for (let i = 0; i < len; i++) if (i in this) out[i] = cb.call(thisArg, this[i], i, this);
    return out;
  },
  filter(cb, thisArg) {
    need(cb);
    const out = [];
    for (let i = 0, len = this.length; i < len; i++) if (i in this && cb.call(thisArg, this[i], i, this)) out.push(this[i]);
    return out;
  },
  forEach(cb, thisArg) {
    need(cb);
    for (let i = 0, len = this.length; i < len; i++) if (i in this) cb.call(thisArg, this[i], i, this);
  },
  some(cb, thisArg) {
    need(cb);
    for (let i = 0, len = this.length; i < len; i++) if (i in this && cb.call(thisArg, this[i], i, this)) return true;
    return false;
  },
  every(cb, thisArg) {
    need(cb);
    for (let i = 0, len = this.length; i < len; i++) if (i in this && !cb.call(thisArg, this[i], i, this)) return false;
    return true;
  },
  reduce(cb, ...init) {
    need(cb);
    const len = this.length;
    let i = 0, acc;
    if (init.length) acc = init[0];                       // arguments.length, not "=== undefined": undefined is a valid start
    else {
      while (i < len && !(i in this)) i++;                // first existing element
      if (i >= len) throw new TypeError("Reduce of empty array with no initial value");
      acc = this[i++];
    }
    for (; i < len; i++) if (i in this) acc = cb(acc, this[i], i, this);
    return acc;
  },
};
const call = (name, arr, ...args) => mine[name].apply(arr, args);

// ---------------- tests ----------------
test("map gives value, index and array", () => {
  const seen = [];
  const r = call("map", [10, 20], (v, i, a) => { seen.push([v, i, a.length]); return v + i; });
  assert.deepEqual(r, [10, 21]);
  assert.deepEqual(seen, [[10, 0, 2], [20, 1, 2]]);
});

test("map skips holes and keeps them", () => {
  let calls = 0;
  const r = call("map", [1, , 3], (x) => { calls++; return x * 2; });
  assert.equal(calls, 2);
  assert.equal(r.length, 3);
  assert.equal(1 in r, false);
});

test("thisArg", () => {
  const ctx = { factor: 3 };
  assert.deepEqual(call("map", [1, 2], function (x) { return x * this.factor; }, ctx), [3, 6]);
});

test("callback must be a function", () => {
  assert.throws(() => call("map", [1], undefined), TypeError);
  assert.throws(() => call("reduce", [1], "no"), TypeError);
});

test("filter", () => assert.deepEqual(call("filter", [1, 2, 3, 4], (x) => x % 2 === 0), [2, 4]));

test("forEach returns undefined", () => {
  const seen = [];
  assert.equal(call("forEach", ["a", "b"], (x) => seen.push(x)), undefined);
  assert.deepEqual(seen, ["a", "b"]);
});

test("some and every, with empty arrays", () => {
  assert.equal(call("some", [1, 2, 3], (x) => x > 2), true);
  assert.equal(call("every", [1, 2, 3], (x) => x > 2), false);
  assert.equal(call("some", [], () => true), false);      // nothing to find
  assert.equal(call("every", [], () => false), true);     // nothing to break the rule
});

test("some stops at the first match", () => {
  let calls = 0;
  call("some", [1, 2, 3, 4], (x) => { calls++; return x === 2; });
  assert.equal(calls, 2);
});

test("reduce with and without a start value", () => {
  assert.equal(call("reduce", [1, 2, 3], (a, b) => a + b), 6);
  assert.equal(call("reduce", [1, 2, 3], (a, b) => a + b, 10), 16);
  assert.equal(call("reduce", [], (a, b) => a + b, 0), 0);
});

test("reduce with undefined as the start value is a real start value", () => {
  const seen = [];
  call("reduce", [1], (acc, x) => { seen.push(acc); return x; }, undefined);
  assert.deepEqual(seen, [undefined]);
});

test("reduce of an empty array with no start throws", () => assert.throws(() => call("reduce", [], (a, b) => a + b), TypeError));

test("reduce skips holes when picking the first value", () => assert.equal(call("reduce", [, , 5, 6], (a, b) => a + b), 11));

test("map can be built from reduce", () => {
  const mapViaReduce = (arr, f) => arr.reduce((acc, x, i) => (acc.push(f(x, i)), acc), []);
  assert.deepEqual(mapViaReduce([1, 2, 3], (x) => x * x), [1, 4, 9]);
});
```

## How to add it for real

```js
if (!Array.prototype.myMap) {
  Object.defineProperty(Array.prototype, "myMap", {
    value: function (cb, thisArg) { /* same body as above */ },
    writable: true, configurable: true, enumerable: false,   // enumerable: false, or every for...in loop sees it
  });
}
```

In an interview, writing `Array.prototype.myMap = function...` is fine. Say that in real code you would use `defineProperty` with `enumerable: false`, and avoid changing built-ins in libraries.

:::qa Why `i in this` and not `this[i] !== undefined`? {level=medium}
**Say this:** "`in` tells a hole (no property) from a real `undefined` value. The built-ins skip holes but do call the callback for stored `undefined`."

**In simple words:** An empty slot and a slot holding `undefined` are different.
:::

:::qa Why does `reduce` check `arguments.length` for the initial value? {level=medium}
**Say this:** "Because `undefined` can be a valid starting value. `if (init === undefined)` would wrongly treat `reduce(fn, undefined)` as 'no initial value'. Count the arguments (rest parameter length) instead."

**In simple words:** 'Nothing passed' and 'undefined passed' are different.
:::

:::qa What changes if the callback modifies the array while we loop? {level=hard}
**Say this:** "The spec reads `length` once at the start, so elements added later are not visited, but elements changed or removed before being reached are seen as they are at that time (removed ones become holes and are skipped)."

**In simple words:** The loop count is fixed, but the values are live.
:::

:::keypoints
- Callback gets **`(value, index, array)`**; `thisArg` via `cb.call`; throw **TypeError** for non-functions.
- Skip **holes** with `i in this`; read **`length` once**.
- `reduce`: **no start value** ⇒ first existing element; **empty + no start ⇒ TypeError**; test the *argument count*.
- `some` stops early; `every([])` is `true`, `some([])` is `false`.
:::
