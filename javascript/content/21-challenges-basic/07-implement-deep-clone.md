---
title: Implement deep clone
level: medium
time: 30
summary: Write deepClone that handles circular references, Date, RegExp, Map, Set, symbols and prototypes, and explain exactly where JSON and structuredClone fall short.
---

:::problem Implement deepClone {level=easy tags="recursion,objects,references"}
Write `deepClone(value)` that returns a **fully independent copy**.

It must handle:

- primitives, arrays and plain objects (including **symbol keys**)
- `Date`, `RegExp`, `Map`, `Set`
- **circular references** (`a.self = a`) and **shared references** (the same inner object used twice must still be shared in the copy)
- the **prototype** of class instances
- functions: return the **same function** (they cannot be cloned)

```js
const a = { when: new Date(0), tags: new Set(["x"]) };
a.self = a;
const b = deepClone(a);     // b.self === b, b.when !== a.when
```

:::hint Hint
Keep a `WeakMap` from **original → copy**. Before cloning an object, check the map. Put the new empty copy in the map **before** you clone its children, so a circular reference finds it.
:::
:::

## Solution and tests

```js run title="deepClone, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") return value;       // primitives and functions: as they are
  if (seen.has(value)) return seen.get(value);                         // circular or shared reference

  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) { const r = new RegExp(value.source, value.flags); r.lastIndex = value.lastIndex; return r; }

  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);                                             // register BEFORE the children
    for (const [k, v] of value) copy.set(deepClone(k, seen), deepClone(v, seen));
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const v of value) copy.add(deepClone(v, seen));
    return copy;
  }

  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));   // keeps the prototype (classes)
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {                          // strings AND symbols, enumerable or not
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if ("value" in desc) desc.value = deepClone(desc.value, seen);     // data property: clone the value
    Object.defineProperty(copy, key, desc);                            // accessors are copied as they are
  }
  return copy;
}

// ---------------- tests ----------------
test("plain nested data is independent", () => {
  const a = { x: 1, nested: { list: [1, { y: 2 }] } };
  const b = deepClone(a);
  assert.deepEqual(b, a);
  b.nested.list[1].y = 99;
  assert.equal(a.nested.list[1].y, 2);
});

test("Date and RegExp", () => {
  const a = { d: new Date(86400000), r: /ab+/gi };
  const b = deepClone(a);
  assert.notEqual(b.d, a.d);
  assert.equal(b.d.getTime(), 86400000);
  assert.equal(b.r.source, "ab+");
  assert.equal(b.r.flags, "gi");
});

test("Map and Set, including object keys and values", () => {
  const key = { k: 1 };
  const a = { m: new Map([[key, { v: 1 }]]), s: new Set([{ n: 1 }]) };
  const b = deepClone(a);
  const [[bk, bv]] = [...b.m];
  assert.notEqual(bk, key);
  assert.deepEqual(bk, key);
  bv.v = 2;
  assert.equal(a.m.get(key).v, 1);
  assert.equal(b.s.size, 1);
});

test("circular reference", () => {
  const a = { name: "a" };
  a.self = a;
  const b = deepClone(a);
  assert.equal(b.self, b);
  assert.notEqual(b, a);
});

test("shared reference stays shared", () => {
  const shared = { n: 1 };
  const b = deepClone({ one: shared, two: shared });
  assert.equal(b.one, b.two);
  assert.notEqual(b.one, shared);
});

test("class instance keeps its prototype", () => {
  class Point { constructor(x) { this.x = x; } double() { return this.x * 2; } }
  const b = deepClone(new Point(4));
  assert.ok(b instanceof Point);
  assert.equal(b.double(), 8);
});

test("symbol keys are copied", () => {
  const s = Symbol("id");
  const b = deepClone({ [s]: { v: 1 } });
  assert.equal(b[s].v, 1);
});

test("functions are shared, not cloned", () => {
  const fn = () => 1;
  assert.equal(deepClone({ fn }).fn, fn);
});

test("sparse arrays and extra array props", () => {
  const a = [1, , 3];
  a.tag = "x";
  const b = deepClone(a);
  assert.equal(b.length, 3);
  assert.equal(1 in b, false);
  assert.equal(b.tag, "x");
});

test("compare with JSON.stringify trick", () => {
  const a = { d: new Date(0), u: undefined, n: NaN, m: new Map([[1, 2]]) };
  const viaJson = JSON.parse(JSON.stringify(a));
  assert.equal(typeof viaJson.d, "string");
  assert.equal("u" in viaJson, false);
  assert.equal(viaJson.n, null);
  assert.deepEqual(viaJson.m, {});
});
```

## Which clone should I use?

| Tool | Circular | Date / Map / Set | Functions | Prototype | Notes |
|---|---|---|---|---|---|
| `{ ...obj }` | n/a | n/a | kept | lost | **shallow** only |
| `JSON.parse(JSON.stringify(x))` | throws | Date → string, Map/Set → `{}` | dropped | lost | `undefined`/`NaN`/`Infinity` change |
| `structuredClone(x)` | yes | yes | **throws** | lost | built in; no class methods |
| `deepClone` above | yes | yes | shared | kept | your control |

:::qa What does `structuredClone` do that your function does not, and what does it not do? {level=medium}
**Say this:** "It also clones typed arrays, ArrayBuffers, Errors and more, and it can transfer buffers without copying. But it throws on functions and DOM nodes, drops the prototype, and ignores getters (it reads the value). I use it by default and write my own only when I need prototypes or custom rules."

**In simple words:** Use the built-in unless you need something special.
:::

:::qa Why do we register the copy in the `WeakMap` before cloning children? {level=medium}
**Say this:** "If a child points back to the parent, the recursion would find the parent not yet in the map and clone it again, forever. Registering the empty copy first means the child gets the copy that is being built."

**In simple words:** Say 'this one is mine' before you start on its children.
:::

:::qa Why `WeakMap` and not `Map`? {level=easy}
**Say this:** "Both work for one call. A WeakMap does not keep the originals alive, which is safe if the map were ever kept longer. Here the map is local, so it is a good habit more than a need."

**In simple words:** It cleans up after itself.
:::

:::keypoints
- Return primitives and functions as they are; check a **`WeakMap`** for seen objects.
- **Register the copy before the children** to survive cycles and keep shared references shared.
- Handle `Date`, `RegExp`, `Map`, `Set`; build with `Object.create(proto)`; copy **`Reflect.ownKeys`** (symbols too).
- JSON loses types; `structuredClone` loses prototypes and rejects functions.
:::
