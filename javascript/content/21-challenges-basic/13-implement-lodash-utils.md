---
title: Implement lodash-style utilities
level: medium
time: 30
summary: Write get, set, pick, omit, groupBy, chunk, uniqBy, zip and range. Small helpers that interviewers use to check your handling of paths, edge cases and unsafe keys.
---

:::problem Implement lodash-style utilities {level=easy tags="objects,arrays,utilities"}
Write these helpers without a library:

| Function | Behaviour |
|---|---|
| `get(obj, path, default)` | read `"a.b[0].c"` safely; return `default` if any step is missing |
| `set(obj, path, value)` | write by path, creating objects or arrays on the way; **mutates** and returns `obj` |
| `pick(obj, keys)` / `omit(obj, keys)` | a new object with only / without the keys |
| `groupBy(arr, keyOrFn)` | `{ key: [items] }` |
| `chunk(arr, size)` | split into groups of `size` |
| `uniqBy(arr, keyOrFn)` | keep the first item for each key |
| `zip(...arrays)` | `[[a0, b0], [a1, b1], …]` up to the longest |
| `range(start, end, step)` | like Python's `range` |

```js
get({ a: { b: [{ c: 5 }] } }, "a.b[0].c");      // 5
get({}, "a.b.c", "none");                       // "none"
```

:::hint Hint
Turn a path string into an array of keys first: replace `[0]` with `.0`, split on `.`. Then `get` is a loop, and `set` is a loop that creates the missing steps.
:::
:::

## Solution and tests

```js run title="Utilities, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

const toPath = (path) =>
  Array.isArray(path) ? path : String(path).replace(/\[(\w+)\]/g, ".$1").split(".").filter((k) => k !== "");

function get(obj, path, fallback) {
  let node = obj;
  for (const key of toPath(path)) {
    if (node === null || node === undefined) return fallback;           // stop before reading a property of nothing
    node = node[key];
  }
  return node === undefined ? fallback : node;
}

const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);
function set(obj, path, value) {
  const keys = toPath(path);
  let node = obj;
  keys.forEach((key, i) => {
    if (UNSAFE.has(key)) throw new Error("unsafe path");                // prototype pollution guard
    if (i === keys.length - 1) { node[key] = value; return; }
    if (node[key] === null || typeof node[key] !== "object") node[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    node = node[key];
  });
  return obj;
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

const keyFn = (k) => (typeof k === "function" ? k : (item) => item[k]);

function groupBy(arr, by) {
  const f = keyFn(by);
  const out = Object.create(null);                                      // no prototype: a key named "constructor" is safe
  for (const item of arr) (out[f(item)] ||= []).push(item);
  return out;
}

function chunk(arr, size = 1) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive integer");
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function uniqBy(arr, by) {
  const f = keyFn(by);
  const seen = new Set();
  return arr.filter((item) => { const k = f(item); if (seen.has(k)) return false; seen.add(k); return true; });
}

const zip = (...arrays) => Array.from({ length: Math.max(0, ...arrays.map((a) => a.length)) }, (_, i) => arrays.map((a) => a[i]));

function range(start, end, step) {
  if (end === undefined) { end = start; start = 0; }                    // range(5) means 0..4
  if (step === undefined) step = start < end ? 1 : -1;
  if (step === 0) throw new RangeError("step cannot be 0");
  const out = [];
  for (let x = start; step > 0 ? x < end : x > end; x += step) out.push(x);
  return out;
}

// ---------------- tests ----------------
test("get with dots and brackets", () => {
  const o = { a: { b: [{ c: 5 }] } };
  assert.equal(get(o, "a.b[0].c"), 5);
  assert.equal(get(o, ["a", "b", "0", "c"]), 5);
});
test("get returns the default for missing steps, null steps and undefined", () => {
  assert.equal(get({}, "a.b.c", "none"), "none");
  assert.equal(get({ a: null }, "a.b", "none"), "none");
  assert.equal(get({ a: undefined }, "a", "none"), "none");
});
test("get keeps falsy values that exist", () => {
  assert.equal(get({ a: 0 }, "a", 9), 0);
  assert.equal(get({ a: "" }, "a", 9), "");
  assert.equal(get({ a: null }, "a", 9), null);
});

test("set creates objects and arrays on the way", () => {
  const o = set({}, "a.b[0].c", 7);
  assert.deepEqual(o, { a: { b: [{ c: 7 }] } });
  assert.ok(Array.isArray(o.a.b));
});
test("set overwrites and mutates", () => {
  const o = { a: { b: 1 } };
  assert.equal(set(o, "a.b", 2), o);
  assert.equal(o.a.b, 2);
});
test("set refuses prototype pollution", () => {
  assert.throws(() => set({}, "__proto__.polluted", true), /unsafe/);
  assert.equal({}.polluted, undefined);
});

test("pick and omit", () => {
  const u = { id: 1, name: "A", password: "x" };
  assert.deepEqual(pick(u, ["id", "name", "missing"]), { id: 1, name: "A" });
  assert.deepEqual(omit(u, ["password"]), { id: 1, name: "A" });
  assert.equal("password" in u, true);                                  // the original is untouched
});

test("groupBy a key and a function", () => {
  const people = [{ n: "A", city: "Pune" }, { n: "B", city: "Delhi" }, { n: "C", city: "Pune" }];
  assert.deepEqual(Object.keys(groupBy(people, "city")), ["Pune", "Delhi"]);
  assert.deepEqual(groupBy([1.2, 1.8, 2.1], Math.floor)[1], [1.2, 1.8]);
});
test("groupBy is safe for a key called constructor", () => {
  const g = groupBy([{ k: "constructor" }, { k: "constructor" }], "k");
  assert.equal(g.constructor.length, 2);
});

test("chunk", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
  assert.throws(() => chunk([1], 0), RangeError);
});

test("uniqBy keeps the first", () => assert.deepEqual(uniqBy([{ id: 1, v: "a" }, { id: 1, v: "b" }, { id: 2, v: "c" }], "id").map((x) => x.v), ["a", "c"]));

test("zip pads with undefined", () => assert.deepEqual(zip([1, 2, 3], ["a", "b"]), [[1, "a"], [2, "b"], [3, undefined]]));

test("range", () => {
  assert.deepEqual(range(4), [0, 1, 2, 3]);
  assert.deepEqual(range(1, 10, 3), [1, 4, 7]);
  assert.deepEqual(range(5, 0), [5, 4, 3, 2, 1]);
  assert.deepEqual(range(0, 1, 0.25), [0, 0.25, 0.5, 0.75]);
  assert.throws(() => range(0, 5, 0), RangeError);
});
```

:::qa Why return `fallback` only for `undefined` and not for every falsy value in `get`? {level=easy}
**Say this:** "Because `0`, `""` and `false` are real values. Lodash's `get` returns the default only when the resolved value is `undefined`. Using `||` would turn a stored zero into the default."

**In simple words:** Zero is an answer, not a missing answer.
:::

:::qa What is the risk in `set(obj, userProvidedPath, value)`? {level=hard}
**Say this:** "Prototype pollution. A path like `__proto__.isAdmin` writes onto `Object.prototype`, so every object in the process gets `isAdmin = true`. Block `__proto__`, `constructor` and `prototype`, or use null-prototype objects or `Map`. Lodash had several CVEs of exactly this kind."

**In simple words:** A path from a user can reach into the shared prototype.
:::

:::qa Why does `groupBy` use `Object.create(null)` here? {level=medium}
**Say this:** "With a normal `{}`, a group named `constructor` or `toString` would find an inherited function and `.push` would fail or touch the wrong thing. A null-prototype object has no inherited keys. A `Map` is another good option."

**In simple words:** An empty object is not really empty; it inherits names.
:::

:::keypoints
- Convert paths to **key arrays** first (`a.b[0]` → `["a","b","0"]`).
- `get`: stop at `null`/`undefined`; default only when the final value is **`undefined`**.
- `set`: create **arrays when the next key is numeric**; **block unsafe keys**.
- Use **null-prototype objects** or `Map` for groups; validate `chunk` sizes and `range` steps.
:::
