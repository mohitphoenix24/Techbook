---
title: Map, Set, WeakMap, WeakSet and WeakRef
level: intermediate
time: 30
summary: When to use Map and Set instead of objects and arrays, their useful methods (including the new Set operations), the weak collections for caches and private data without memory leaks, and WeakRef with FinalizationRegistry.
---

## Map: a dictionary with any key

A `Map` stores **key → value** pairs with these advantages over a plain object:

| | `Map` | Plain object |
|---|---|---|
| Key types | **any** (objects, functions, numbers stay numbers) | strings and symbols only |
| Order | **insertion order**, always | integers first, then insertion |
| Size | `map.size` | `Object.keys(o).length` |
| Iteration | directly iterable | via `Object.entries` |
| Frequent add/remove | optimised | slower |
| Inherited keys (`toString`...) | **none** | yes: collisions possible |
| JSON | not serialisable directly | yes |

```js run title="Map basics"
const map = new Map();
const keyObj = { id: 1 };
const keyFn = () => {};

map.set("name", "Asha").set(42, "number key").set(keyObj, "object key").set(keyFn, "function key");

console.log(map.get(42), map.get(keyObj), map.get({ id: 1 }));         // the last: a different object: undefined
console.log(map.has("name"), map.size, map.delete("name"), map.size);

for (const [key, value] of map) console.log(typeof key, "=>", value);
console.log([...map.keys()].length, [...map.values()]);

map.forEach((value, key) => {});
map.clear();
console.log(map.size);
```

```js run title="Map recipes"
// word frequency
const words = "to be or not to be".split(" ");
const freq = new Map();
for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
console.log(freq, [...freq].sort((a, b) => b[1] - a[1])[0]);

// group by a key (Map.groupBy, ES2024)
console.log(Map.groupBy([1, 2, 3, 4, 5], (n) => (n % 2 ? "odd" : "even")));

// an LRU-style ordering: delete and re-set moves a key to the end
const lru = new Map([["a", 1], ["b", 2], ["c", 3]]);
const value = lru.get("a"); lru.delete("a"); lru.set("a", value);
console.log([...lru.keys()]);

// convert
console.log(Object.fromEntries(new Map([["x", 1]])), new Map(Object.entries({ y: 2 })));
```

## Set: unique values

```js run title="Set basics"
const set = new Set([1, 2, 2, 3, 3, 3]);
set.add(4).add(1);                           // duplicates are ignored
console.log(set, set.size, set.has(2), set.delete(2), [...set]);

console.log([...new Set("mississippi")].join(""));          // unique characters
const unique = (arr) => [...new Set(arr)];
console.log(unique([3, 1, 3, 2, 1]));
console.log(new Set([NaN, NaN, 0, -0]).size);                // SameValueZero: NaN once, 0 and -0 equal
console.log(new Set([{}, {}]).size);                          // different objects are different
```

### Set operations

```js run title="Set algebra (ES2025 methods, with fallbacks)"
const a = new Set([1, 2, 3, 4]);
const b = new Set([3, 4, 5]);

// ES2025: built-in methods
console.log(a.union(b), a.intersection(b), a.difference(b), a.symmetricDifference(b));
console.log(new Set([1, 2]).isSubsetOf(a), a.isSupersetOf(new Set([1])), a.isDisjointFrom(new Set([9])));

// the older way
const intersection = new Set([...a].filter((x) => b.has(x)));
console.log(intersection);
```

`Set.has` is O(1) on average, so a `Set` is the right tool for "is it in this list?" checks and for removing duplicates.

## WeakMap and WeakSet: references that do not keep objects alive

In a normal `Map`, keys are **strongly held**: an object used as a key can never be garbage-collected while the `Map` exists. A **`WeakMap`** holds its keys **weakly**: if nothing else refers to the key object, it (and its value) can be **collected**.

Rules: keys must be **objects** (or non-registered symbols); **no size**, **no iteration**, no `clear()` (because contents can vanish at any time).

```js run title="WeakMap for private data and metadata"
const privateData = new WeakMap();

class Person {
  constructor(name, secret) {
    this.name = name;
    privateData.set(this, { secret });             // data attached to the instance, invisible from outside
  }
  reveal() { return privateData.get(this).secret; }
}

const p = new Person("Asha", "my-secret");
console.log(p.reveal(), Object.keys(p));
console.log(privateData.has(p), "size" in privateData, typeof privateData[Symbol.iterator]);
```

```js run title="WeakMap as a cache keyed by object"
const cache = new WeakMap();
let computeCount = 0;

function expensive(obj) {
  if (cache.has(obj)) return cache.get(obj);
  computeCount++;
  const result = Object.keys(obj).length * 100;
  cache.set(obj, result);
  return result;
}

let config = { a: 1, b: 2 };
console.log(expensive(config), expensive(config), computeCount);
config = null;                                    // when no one refers to the object, the cache entry can go away too
```

A normal `Map` cache here would **leak**: it would keep every object forever. This is the classic use of `WeakMap`: **per-object data and caches**, and DOM node metadata.

`WeakSet` is a set of objects held weakly: use it to **mark** objects ("already processed", "visited" for graph walks and circular reference checks).

```js run title="WeakSet for 'seen' marks"
const visited = new WeakSet();

function hasCycle(obj) {
  if (typeof obj !== "object" || obj === null) return false;
  if (visited.has(obj)) return true;
  visited.add(obj);
  return Object.values(obj).some(hasCycle);
}

const loop = { name: "a" }; loop.self = loop;
console.log(hasCycle(loop), hasCycle({ x: { y: {} } }));
```

## WeakRef and FinalizationRegistry (advanced, rare)

A **`WeakRef`** holds a reference that **does not prevent garbage collection**. `deref()` gives the object, or `undefined` if it was collected.

```js run node title="WeakRef (output depends on the garbage collector)" nondet
let big = { data: new Array(1_000_000).fill(1) };
const ref = new WeakRef(big);

console.log("alive now:", ref.deref() !== undefined);
big = null;                                        // drop the only strong reference

setTimeout(() => {
  global.gc();                                     // available because Node runs with --expose-gc here
  console.log("alive after gc:", ref.deref() !== undefined);
}, 10);
```

```js run node title="FinalizationRegistry: a callback after collection (not guaranteed!)" nondet
const registry = new FinalizationRegistry((heldValue) => console.log("collected:", heldValue));
(function () { registry.register({ big: new Array(1e6).fill(0) }, "temporary object"); })();
setTimeout(() => global.gc(), 10);
setTimeout(() => console.log("done waiting"), 60);
```

:::warn Use WeakRef and FinalizationRegistry rarely
Garbage collection timing is **unpredictable**. The spec does not guarantee that a finaliser ever runs. Do **not** use them for essential logic (closing files, releasing locks). Use them only for **optional caches**, and prefer `WeakMap` in most cases.
:::

## Which collection should I use?

| Need | Use |
|---|---|
| Fixed shape record | object / class |
| Dynamic dictionary, any key type | `Map` |
| Unique values, fast membership | `Set` |
| Data or cache per object, without leaks | `WeakMap` |
| "Have I seen this object?" | `WeakSet` |
| Ordered list | `Array` |
| Optional cache of a large object | `WeakRef` |

:::interview Map vs Object: when do you use which? What is a WeakMap for?
"I use an object for a fixed set of known fields, JSON data and records. I use a `Map` when keys are dynamic or not strings, when I need guaranteed insertion order and `size`, or when keys come from users and could clash with inherited properties. A `Set` is for unique values and O(1) membership. A `WeakMap` holds its keys weakly: when nothing else references the key object, the entry can be garbage-collected, so it is ideal for private data, caches and metadata attached to objects without leaking memory. It cannot be iterated and has no size, since entries can disappear."
:::

## More interview questions on this topic

:::qa What is special about `WeakMap` keys? {level=medium}
**Say this:** "They must be objects, they are held weakly so the garbage collector can remove an entry when the key is unreachable, and the map is not iterable and has no size."

**In simple words:** The map does not keep the key alive.
:::

:::qa How do you remove duplicates from an array? {level=easy}
**Say this:** "`[...new Set(array)]`. For objects, use a key: `[...new Map(items.map(i => [i.id, i])).values()]`."

**In simple words:** A Set cannot hold duplicates.
:::

:::qa Why can a `Map` cause a memory leak but a `WeakMap` does not? {level=medium}
**Say this:** "A Map strongly references its keys, so any object used as a key stays alive as long as the Map does. A WeakMap does not prevent the key from being collected."

**In simple words:** The Map "holds on" to keys; the WeakMap "looks without holding".
:::

:::qa Does `Map` keep insertion order for numeric keys? {level=easy}
**Say this:** "Yes. Unlike plain objects (which sort integer-like keys first), a Map always iterates in insertion order."

**In simple words:** The order you put things in is the order you get.
:::

```quiz
? Which can use an object as a key and keep insertion order?
- Plain object
+ Map
- Array
> Map keys can be any value.
? What can't you do with a WeakMap?
- set and get
+ Iterate it or read its size
- Use objects as keys
> Entries may disappear at any time.
? What does `new Set([1, 1, 2]).size` return?
- 3
+ 2
- 1
> Duplicates are ignored.
```

:::keypoints
- **Map**: any key type, insertion order, `size`, no inherited keys. **Set**: unique values, O(1) `has`; ES2025 `union`, `intersection`, `difference`.
- **WeakMap / WeakSet**: weak object keys, not iterable, no size: for **private data**, **caches** and **marks** without leaks.
- **WeakRef / FinalizationRegistry**: advanced; GC timing is **not guaranteed**. Use for optional caches only.
- Remove duplicates: `[...new Set(arr)]`.
:::
