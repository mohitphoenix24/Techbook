---
title: Implement deep merge, diff and patch
level: medium
time: 35
summary: Merge nested config objects without mutation, compute a list of changes between two objects, and apply it again. Includes array policies and prototype-pollution safety.
---

:::problem Implement deepMerge, diff and applyPatch {level=medium tags="objects,recursion,immutability,security"}
1. `deepMerge(...sources)` merges plain objects from left to right into a **new object** (no input is changed).
   - Nested plain objects are merged recursively.
   - **Arrays are replaced**, not merged (an option `arrays: "concat"` joins them).
   - `undefined` values in a later source are ignored; `null` **does** overwrite.
   - Keys `__proto__`, `constructor` and `prototype` are **skipped**.
2. `diff(a, b)` returns a list of changes `{ op: "add" | "remove" | "replace", path: [...], from?, to? }`.
3. `applyPatch(obj, changes)` returns a new object with the changes applied. `applyPatch(a, diff(a, b))` deep-equals `b`.

```js
deepMerge({ a: { x: 1 }, tags: [1] }, { a: { y: 2 }, tags: [2] });
// { a: { x: 1, y: 2 }, tags: [2] }
```

:::hint Hint
Write a helper `isPlainObject(v)`. For `diff`, walk both objects with a path prefix; compare arrays by index (simple version).
:::
:::

## Solution and tests

```js run title="deepMerge, diff and applyPatch, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

const isPlain = (v) => v !== null && typeof v === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);

function deepMerge(...sources) {
  return sources.reduce((acc, src) => mergeTwo(acc, src), {});
}

function mergeTwo(target, source, opts = {}) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (UNSAFE.has(key)) continue;                           // never let input reach the prototype
    const next = source[key];
    const prev = out[key];
    if (next === undefined) continue;                        // "no value" does not erase
    if (isPlain(prev) && isPlain(next)) out[key] = mergeTwo(prev, next);
    else if (isPlain(next)) out[key] = mergeTwo({}, next);   // copy, so later merges cannot change the source
    else if (Array.isArray(next)) out[key] = [...next];      // arrays are replaced (and copied)
    else out[key] = next;
  }
  return out;
}

// diff: list of changes. Arrays are compared by index.
function diff(a, b, path = []) {
  const changes = [];
  const bothContainers = (isPlain(a) && isPlain(b)) || (Array.isArray(a) && Array.isArray(b));
  if (!bothContainers) {
    if (!Object.is(a, b)) changes.push({ op: "replace", path, from: a, to: b });
    return changes;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const p = [...path, key];
    if (!(key in a)) changes.push({ op: "add", path: p, to: b[key] });
    else if (!(key in b)) changes.push({ op: "remove", path: p, from: a[key] });
    else changes.push(...diff(a[key], b[key], p));
  }
  return changes;
}

function applyPatch(obj, changes) {
  const root = structuredClone(obj);                         // never mutate the input
  const removals = [];                                       // array removals are applied last, from the end, so indexes stay valid
  for (const { op, path, to } of changes) {
    if (path.some((k) => UNSAFE.has(String(k)))) throw new Error("unsafe path");
    if (path.length === 0) return structuredClone(to);       // replacing the whole value
    let node = root;
    for (const k of path.slice(0, -1)) node = node[k];
    const last = path.at(-1);
    if (op === "remove") removals.push({ node, last });
    else node[last] = structuredClone(to);
  }
  removals.sort((x, y) => (Array.isArray(x.node) && Array.isArray(y.node) ? y.last - x.last : 0));
  for (const { node, last } of removals) Array.isArray(node) ? node.splice(Number(last), 1) : delete node[last];
  return root;
}

// ---------------- tests ----------------
test("merges nested objects, later sources win", () => {
  const r = deepMerge({ a: { x: 1, z: 0 }, name: "A" }, { a: { y: 2, z: 9 } }, { name: "C" });
  assert.deepEqual(r, { a: { x: 1, y: 2, z: 9 }, name: "C" });
});

test("arrays are replaced", () => assert.deepEqual(deepMerge({ tags: [1, 2] }, { tags: [3] }), { tags: [3] }));

test("undefined is ignored, null overwrites", () => {
  assert.deepEqual(deepMerge({ a: 1, b: 2 }, { a: undefined, b: null }), { a: 1, b: null });
});

test("inputs are not changed and results do not share nested objects", () => {
  const a = { n: { v: 1 } }, b = { n: { w: 2 }, m: { q: 1 } };
  const r = deepMerge(a, b);
  assert.deepEqual(a, { n: { v: 1 } });
  assert.deepEqual(b, { n: { w: 2 }, m: { q: 1 } });
  r.m.q = 99;
  assert.equal(b.m.q, 1);
});

test("a prototype pollution payload is ignored", () => {
  const evil = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "ok": 1}');
  const r = deepMerge({}, evil);
  assert.equal({}.polluted, undefined);
  assert.equal(r.polluted, undefined);
  assert.equal(r.ok, 1);
});

test("class instances and Dates are values, not merged", () => {
  const d = new Date(0);
  const r = deepMerge({ when: new Date(5) }, { when: d });
  assert.equal(r.when, d);
});

test("diff: add, remove, replace with paths", () => {
  const a = { name: "A", age: 30, address: { city: "Pune", pin: 1 }, tags: ["x", "y"] };
  const b = { name: "A", age: 31, address: { city: "Pune", country: "IN" }, tags: ["x"] };
  const d = diff(a, b);
  const text = d.map((c) => `${c.op} ${c.path.join(".")}`).sort();
  assert.deepEqual(text, ["add address.country", "remove address.pin", "remove tags.1", "replace age"]);
});

test("diff of equal values is empty; NaN equals NaN", () => {
  assert.deepEqual(diff({ a: [1, { b: NaN }] }, { a: [1, { b: NaN }] }), []);
});

test("diff replaces when the type changes", () => {
  assert.deepEqual(diff({ a: [1] }, { a: { 0: 1 } }), [{ op: "replace", path: ["a"], from: [1], to: { 0: 1 } }]);
});

test("applyPatch(a, diff(a, b)) equals b", () => {
  const a = { name: "A", age: 30, address: { city: "Pune", pin: 1 }, tags: ["x", "y", "z"], gone: 1 };
  const b = { name: "B", age: 30, address: { city: "Delhi", country: "IN" }, tags: ["x"], extra: { deep: [1, 2] } };
  assert.deepEqual(applyPatch(a, diff(a, b)), b);
  assert.equal(a.name, "A");                                 // input untouched
});

test("applyPatch refuses unsafe paths", () => {
  assert.throws(() => applyPatch({}, [{ op: "add", path: ["__proto__", "x"], to: 1 }]), /unsafe/);
});
```

## Choices to explain

| Question | Common answer |
|---|---|
| Merge arrays? | **Replace** by default (config files); concat or merge-by-id only when asked |
| `null` vs `undefined` | `undefined` = "not provided"; `null` = "set to empty" |
| Which objects count as plain? | prototype is `Object.prototype` or `null`; **Date, Map, class instances** are treated as values |
| Mutation | return a **new** object; share nothing between input and output |
| Real libraries | `lodash.merge`, `deepmerge`, `immer` (patches), `fast-json-patch` (RFC 6902) |

:::qa Why did lodash have security advisories for `merge`? {level=hard}
**Say this:** "A merge that walks `__proto__` or `constructor.prototype` from untrusted JSON writes onto `Object.prototype`, so every object gets the attacker's property (prototype pollution). It can bypass checks like `if (user.isAdmin)`. The fix is to skip those keys, use `Object.create(null)` or `Map`, and validate input."

**In simple words:** A merge must not follow a path into the shared prototype.
:::

:::qa How would you diff arrays smartly (insertions in the middle)? {level=hard}
**Say this:** "Index-by-index diff reports every later item as changed after an insert. Better: use a keyed diff (items with ids) or a longest-common-subsequence algorithm, like React's keyed reconciliation or `git diff`."

**In simple words:** Match items by identity, not by position.
:::

:::qa Why return a new object instead of mutating? {level=easy}
**Say this:** "Callers can keep the old value, change detection by reference works (React, Redux), and there are no surprise side effects on shared config. The cost is copying, which structural sharing (Immer) reduces."

**In simple words:** Do not change what you were given.
:::

:::keypoints
- `deepMerge`: recurse only for **plain objects**; **replace arrays**; skip `undefined`; **block `__proto__`, `constructor`, `prototype`**.
- Return **new objects**; copy nested values so output and input do not share references.
- `diff` = add/remove/replace with **paths**; `applyPatch` must apply array **removals from the end**.
- Index-based array diff is simple but weak; use **keys** for real lists.
:::
