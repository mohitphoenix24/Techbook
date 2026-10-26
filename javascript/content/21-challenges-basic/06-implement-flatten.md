---
title: Implement flatten
level: easy
time: 20
summary: Flatten nested arrays to any depth in three ways (recursion, a stack, generator), then flatten nested objects into dotted keys and back.
---

:::problem Implement flatten {level=easy tags="recursion,arrays,objects"}
**Part 1.** `flatten(arr, depth = Infinity)` returns a new, flat array. Do not use `Array.prototype.flat`.

```js
flatten([1, [2, [3, [4]]]]);        // [1, 2, 3, 4]
flatten([1, [2, [3, [4]]]], 1);     // [1, 2, [3, [4]]]
```

**Part 2.** `flattenObject(obj)` turns `{ a: { b: 1, c: [2, 3] } }` into `{ "a.b": 1, "a.c.0": 2, "a.c.1": 3 }`, and `unflatten` reverses it.

:::hint Hint
Part 1: for each item, if it is an array and you still have depth left, recurse; else push it. Without recursion, use your own stack and walk it in reverse. Part 2: carry a **prefix** down the recursion.
:::
:::

## Solution and tests

```js run title="flatten, flattenObject and unflatten, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

// 1. Recursive, with a depth limit
function flatten(arr, depth = Infinity) {
  const out = [];
  for (const item of arr) {
    if (Array.isArray(item) && depth > 0) out.push(...flatten(item, depth - 1));
    else out.push(item);
  }
  return out;
}

// 2. Iterative, no recursion: safe for very deep nesting (no stack overflow)
function flattenIterative(arr) {
  const stack = [...arr];
  const out = [];
  while (stack.length) {
    const item = stack.pop();
    if (Array.isArray(item)) stack.push(...item);       // put the children back to be processed
    else out.push(item);
  }
  return out.reverse();                                  // we popped from the end, so reverse
}

// 3. Generator: lazy, one item at a time
function* flattenLazy(arr) {
  for (const item of arr) {
    if (Array.isArray(item)) yield* flattenLazy(item);
    else yield item;
  }
}

// Objects
const isPlain = (v) => v !== null && typeof v === "object" && !(v instanceof Date);

function flattenObject(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlain(value) && Object.keys(value).length > 0) flattenObject(value, path, out);
    else out[path] = value;                              // leaf (or empty object/array)
  }
  return out;
}

function unflatten(flat) {
  const root = {};
  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split(".");
    let node = root;
    keys.forEach((key, i) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("unsafe key");   // prototype pollution guard
      if (i === keys.length - 1) { node[key] = value; return; }
      if (node[key] === undefined) node[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};                              // next key is a number: make an array
      node = node[key];
    });
  }
  return root;
}

// ---------------- tests ----------------
test("flat to any depth", () => assert.deepEqual(flatten([1, [2, [3, [4]]]]), [1, 2, 3, 4]));
test("depth limit", () => assert.deepEqual(flatten([1, [2, [3, [4]]]], 1), [1, 2, [3, [4]]]));
test("depth 0 copies", () => {
  const a = [1, [2]];
  const r = flatten(a, 0);
  assert.deepEqual(r, [1, [2]]);
  assert.notEqual(r, a);
});
test("empty arrays vanish, other falsy values stay", () => assert.deepEqual(flatten([0, [], [null, [undefined, ""]]]), [0, null, undefined, ""]));
test("iterative gives the same answer", () => assert.deepEqual(flattenIterative([1, [2, [3, [4]]], 5]), [1, 2, 3, 4, 5]));
test("iterative survives 100,000 levels of nesting", () => {
  let deep = [1];
  for (let i = 0; i < 100000; i++) deep = [deep];
  assert.deepEqual(flattenIterative(deep), [1]);
});
test("recursive version overflows on the same input", () => {
  let deep = [1];
  for (let i = 0; i < 100000; i++) deep = [deep];
  assert.throws(() => flatten(deep), RangeError);
});
test("lazy generator", () => assert.deepEqual([...flattenLazy([1, [2, [3]]])], [1, 2, 3]));
test("flattenObject", () => assert.deepEqual(flattenObject({ a: { b: 1, c: [2, 3] }, d: 4 }), { "a.b": 1, "a.c.0": 2, "a.c.1": 3, d: 4 }));
test("flattenObject keeps empty objects as leaves", () => assert.deepEqual(flattenObject({ a: {}, b: [] }), { a: {}, b: [] }));
test("unflatten is the reverse", () => {
  const original = { a: { b: 1, c: [2, 3] }, d: 4 };
  assert.deepEqual(unflatten(flattenObject(original)), original);
});
test("unflatten refuses __proto__ paths", () => assert.throws(() => unflatten({ "__proto__.polluted": true }), /unsafe/));
```

## Choosing a method

| Method | Good | Watch out |
|---|---|---|
| Recursion | shortest, easy to read | stack overflow on huge nesting |
| Own stack (iterative) | no overflow; fast | need to reverse the result |
| Generator | lazy; stops early | slower for small arrays |
| `Array.prototype.flat(Infinity)` | built in | not allowed here, but use it in real code |
| `reduce` + `concat` | one-liner | creates many intermediate arrays: slow |

:::qa How would you flatten with `reduce`, and what is the downside? {level=easy}
**Say this:** "`arr.reduce((acc, x) => acc.concat(Array.isArray(x) ? flatten(x) : x), [])`. It works but `concat` copies the accumulator at every step, so it is O(n²) in the worst case. Pushing into one output array is linear."

**In simple words:** Short code, but it copies a lot.
:::

:::qa Why does `unflatten` need a guard for `__proto__`? {level=hard}
**Say this:** "A key like `__proto__.polluted` would walk into `Object.prototype` and set a property on every object in the app. That is prototype pollution. Reject those keys or build with `Object.create(null)`."

**In simple words:** Never let user-controlled paths reach the prototype.
:::

:::keypoints
- `flatten`: recurse while the item is an array **and depth remains**; otherwise push.
- Use an **explicit stack** to avoid stack overflow; a **generator** for lazy output.
- `flattenObject`: carry a **path prefix**; `unflatten`: create **arrays when the next key is numeric** and **block `__proto__`**.
:::
