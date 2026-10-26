---
title: Shallow copy vs deep copy
level: intermediate
time: 30
summary: What a shallow copy shares, the four ways to copy (spread, assign, JSON, structuredClone), what each loses, how structuredClone works and fails, and how to write a deep clone that handles circular references.
---

## The problem

```js run title="A copy that is not a copy"
const original = { name: "Asha", skills: ["JS"], address: { city: "Pune" } };
const copy = original;                       // not a copy: the same object

copy.name = "Changed";
console.log(original.name);
```

An assignment copies the **reference**. To get a **separate object**, you must copy its contents.

## Shallow copy: one level only

A **shallow copy** creates a new top-level object, but **nested objects and arrays are still shared** with the original.

```js run title="Shallow copies share nested objects"
const original = { name: "Asha", skills: ["JS"], address: { city: "Pune" } };

const copies = {
  spread: { ...original },
  assign: Object.assign({}, original),
  entries: Object.fromEntries(Object.entries(original)),
};

for (const [how, copy] of Object.entries(copies)) {
  copy.name = "X";                           // changes only the copy: top-level values are independent
  copy.skills.push("Node");                  // changes the SHARED array
  copy.address.city = "Delhi";               // changes the SHARED object
  console.log(how.padEnd(8), copy === original, copy.skills === original.skills);
}
console.log(original);
```

Array equivalents: `[...arr]`, `arr.slice()`, `Array.from(arr)`, `arr.concat()`, `arr.map((x) => x)`. All shallow.

```viz algo=chain title="A shallow copy: new top-level object, shared children"
node o "original" @0,0 [hl]
  name: "Asha"
  skills: ->
  address: ->
node c "copy" @0,1 [ok]
  name: "Asha"
  skills: ->
  address: ->
node s "skills array" @1,0 [bad]
  0: "JS"
node a "address object" @1,1 [bad]
  city: "Pune"
link o -> s : shared
link o -> a : shared
link c -> s : shared
link c -> a : shared
```

## Deep copy: everything is copied

A **deep copy** copies all levels, so nothing is shared.

### Option 1: `JSON.parse(JSON.stringify(x))`: quick but lossy

```js run title="The JSON trick and what it breaks"
const original = {
  date: new Date(Date.UTC(2024, 0, 15)),
  undef: undefined,
  fn() { return 1; },
  sym: Symbol("s"),
  nan: NaN,
  inf: Infinity,
  re: /abc/g,
  map: new Map([[1, "one"]]),
  set: new Set([1, 2]),
  big: 1,
  nested: { ok: true },
};

const copy = JSON.parse(JSON.stringify(original));
console.log(copy);
console.log(copy.date instanceof Date, typeof copy.date);
```

What `JSON` loses or changes:

| Value | Result after the JSON round trip |
|---|---|
| `Date` | turns into an **ISO string** |
| `undefined`, functions, symbols | **dropped** (in arrays: replaced by `null`) |
| `NaN`, `Infinity` | become **`null`** |
| `Map`, `Set` | become `{}` |
| `RegExp`, `Error` | become `{}` |
| `BigInt` | **throws** a TypeError |
| Circular references | **throws** a TypeError |
| Class instances | lose their prototype (plain objects) |
| Sparse arrays | holes become `null` |

Use it only for plain **JSON-like data** (numbers, strings, booleans, arrays, plain objects, null).

### Option 2: `structuredClone()`: the modern built-in

Available in Node 17+, all modern browsers and workers. It uses the **structured clone algorithm** (the one `postMessage` uses).

```js run title="structuredClone"
const original = {
  date: new Date(Date.UTC(2024, 0, 15)),
  map: new Map([[1, { deep: true }]]),
  set: new Set([1, 2]),
  re: /abc/gi,
  big: 10n,
  nan: NaN,
  undef: undefined,
  typed: new Uint8Array([1, 2, 3]),
  nested: { list: [1, [2, 3]] },
};
original.self = original;                           // a circular reference

const copy = structuredClone(original);

console.log(copy.date instanceof Date, copy.map.get(1) !== original.map.get(1), copy.set.has(2), copy.re.flags);
console.log(copy.big, copy.nan, "undef" in copy, copy.typed, copy.self === copy, copy.self !== original);
console.log(copy.nested.list[1] !== original.nested.list[1]);
```

It handles: `Date`, `RegExp`, `Map`, `Set`, `BigInt`, typed arrays, `ArrayBuffer`, `Error` objects, `NaN`/`Infinity`, `undefined`, **circular references** (kept as a circle in the copy), and sparse arrays.

What it **cannot** clone:

```js run title="What structuredClone cannot handle"
const attempts = {
  function: () => structuredClone({ fn() {} }),
  symbol: () => structuredClone({ s: Symbol("x") }),
  domNode: () => structuredClone(typeof document === "undefined" ? { n: function () {} } : { n: document.body }),
};

for (const [what, fn] of Object.entries(attempts)) {
  try { fn(); console.log(what, "ok"); } catch (e) { console.log(what.padEnd(9), "->", e.name); }
}

class User { constructor() { this.name = "Asha"; } greet() { return "hi"; } }
const clone = structuredClone(new User());
console.log(clone instanceof User, clone.constructor.name, typeof clone.greet);     // the prototype is lost
```

- **Functions** and **symbol values** throw `DataCloneError`.
- **DOM nodes** cannot be cloned.
- **Class instances** become **plain objects** (data copied, prototype and methods lost). Getters are read, and the value is copied.
- `#private` fields are not copied.

### Option 3: a hand-written `deepClone`

An interview classic. Handle primitives, arrays, plain objects, dates, regexps, maps, sets, **and circular references** with a `WeakMap`.

```js run title="deepClone with circular reference support"
function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") return value;          // primitives and functions: return as is
  if (seen.has(value)) return seen.get(value);                            // circular reference: reuse the clone

  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);

  if (value instanceof Map) {
    const m = new Map();
    seen.set(value, m);
    value.forEach((v, k) => m.set(deepClone(k, seen), deepClone(v, seen)));
    return m;
  }
  if (value instanceof Set) {
    const s = new Set();
    seen.set(value, s);
    value.forEach((v) => s.add(deepClone(v, seen)));
    return s;
  }

  const out = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));   // keep the prototype
  seen.set(value, out);                                                   // register BEFORE recursing
  for (const key of Reflect.ownKeys(value)) {                              // strings AND symbols
    out[key] = deepClone(value[key], seen);
  }
  return out;
}

class Point { constructor(x, y) { this.x = x; this.y = y; } sum() { return this.x + this.y; } }
const original = { p: new Point(1, 2), d: new Date(0), list: [1, { a: 2 }], m: new Map([["k", { v: 1 }]]), [Symbol.for("s")]: 1 };
original.me = original;

const copy = deepClone(original);
console.log(copy.p instanceof Point, copy.p.sum(), copy.d !== original.d, copy.list[1] !== original.list[1]);
console.log(copy.m.get("k") !== original.m.get("k"), copy.me === copy, copy[Symbol.for("s")]);
```

## Which one to use?

| Need | Use |
|---|---|
| Top-level copy, nested data not changed | spread `{ ...obj }` / `[...arr]` |
| Immutable update of a nested value | spread **along the path** (structural sharing) |
| Plain JSON-like data only, quick | `structuredClone` (preferred) or JSON trick |
| `Date`, `Map`, `Set`, cycles, BigInt, typed arrays | `structuredClone` |
| Class instances with methods, functions | custom clone (or give the class a `clone()` method), lodash `cloneDeep` |
| Large data, frequent updates | **Immer** or Immutable.js (structural sharing, no full copies) |

A deep copy is **expensive**. Often you do not need one: copy only the path you change.

```js run title="Update one nested value without a deep clone"
const state = { user: { name: "Asha", prefs: { theme: "light" } }, items: [1, 2, 3] };

const next = { ...state, user: { ...state.user, prefs: { ...state.user.prefs, theme: "dark" } } };
console.log(state.user.prefs.theme, next.user.prefs.theme);
console.log(state.items === next.items);                       // untouched parts are shared on purpose
```

:::interview What is the difference between a shallow and a deep copy? How do you deep clone an object?
"A shallow copy creates a new top-level object but nested objects are still shared by reference, for example spread, `Object.assign` or `slice`. A deep copy copies every level. `JSON.parse(JSON.stringify(x))` works for plain JSON data but loses dates, undefined, functions, NaN, maps and sets, and fails on BigInt and circular references. The modern answer is `structuredClone`, which supports dates, maps, sets, typed arrays, BigInt and circular references, but not functions, symbols, DOM nodes, and it drops class prototypes. For class instances I write a custom clone with a WeakMap to handle cycles, or use lodash `cloneDeep`. Often I avoid deep copies by updating immutably along only the changed path."
:::

## More interview questions on this topic

:::qa Is spread (`{ ...obj }`) a deep copy? {level=easy}
**Say this:** "No. It copies the top-level own enumerable properties; nested objects and arrays remain shared references."

**In simple words:** The outside is copied, the inside is shared.
:::

:::qa Name three limits of `JSON.parse(JSON.stringify(obj))`. {level=easy}
**Say this:** "Dates become strings, `undefined`/functions/symbols are dropped, `NaN`/`Infinity` become null, Map/Set become empty objects, and BigInt or circular data throws."

**In simple words:** It only understands plain JSON data.
:::

:::qa What does `structuredClone` not support? {level=medium}
**Say this:** "Functions, symbols as values, DOM nodes, and it does not keep class prototypes or private fields, so instances become plain objects."

**In simple words:** It copies data, not behaviour.
:::

:::qa How do you handle circular references in a custom deep clone? {level=hard}
**Say this:** "Keep a `WeakMap` from original to clone. Before recursing, register the new object. If you meet an object already in the map, return its clone, which recreates the cycle."

**In simple words:** Remember what you have already copied, so you do not loop forever.
:::

```quiz
? Which copies nested objects as separate objects?
- { ...obj }
- Object.assign({}, obj)
+ structuredClone(obj)
> Spread and assign are shallow.
? What happens to a Date after JSON.parse(JSON.stringify(...))?
- Stays a Date
+ Becomes an ISO string
- Is dropped
> JSON has no date type.
? Which can structuredClone NOT copy?
- Map
- Date
+ A function
> Functions throw DataCloneError.
```

:::keypoints
- **Shallow**: new top-level, **shared children** (`{...o}`, `assign`, `slice`, `[...a]`).
- **JSON trick** loses Date, undefined, functions, NaN, Map/Set, BigInt, cycles, prototypes.
- **`structuredClone`**: handles Date, Map, Set, RegExp, typed arrays, BigInt, **cycles**; not functions, symbols, DOM, prototypes.
- Custom `deepClone`: `WeakMap` for cycles, copy `Reflect.ownKeys`, keep prototypes.
- Prefer **immutable updates along the changed path** over full deep copies.
:::
