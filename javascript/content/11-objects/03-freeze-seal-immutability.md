---
title: Object.freeze, seal and preventExtensions
level: intermediate
time: 20
summary: The three levels of locking an object, what each allows, strict-mode errors, deep freeze, frozen arrays, const vs freeze, and when immutability tools are worth it.
---

## Three levels of locking

| Method | Add new props | Delete props | Change values | Change flags |
|---|---|---|---|---|
| `Object.preventExtensions(o)` | **no** | yes | yes | yes |
| `Object.seal(o)` | **no** | **no** | yes | **no** |
| `Object.freeze(o)` | **no** | **no** | **no** | **no** |

Each is **stronger** than the one before. Check with `Object.isExtensible`, `Object.isSealed`, `Object.isFrozen`.

```js run title="What each level allows"
function tryAll(label, o) {
  const results = [];
  try { o.added = 1; results.push("add: ok"); } catch { results.push("add: blocked"); }
  try { delete o.a; results.push("delete: ok"); } catch { results.push("delete: blocked"); }
  try { o.b = "changed"; results.push("change: ok"); } catch { results.push("change: blocked"); }
  console.log(label.padEnd(18), results.join(" | "));
}

tryAll("preventExtensions", Object.preventExtensions({ a: 1, b: 2 }));
tryAll("seal", Object.seal({ a: 1, b: 2 }));
tryAll("freeze", Object.freeze({ a: 1, b: 2 }));

const o = Object.freeze({ x: 1 });
console.log(Object.isFrozen(o), Object.isSealed(o), Object.isExtensible(o));
```

In **sloppy mode** these operations **fail silently**. In **strict mode** (modules and classes) they **throw a TypeError**. Our examples use `try/catch` to show the difference.

## Freeze is shallow

```js run title="Nested objects stay mutable"
const settings = Object.freeze({
  theme: "dark",
  limits: { max: 10 },
  tags: ["a", "b"],
});

try { settings.theme = "light"; } catch (e) { console.log("blocked:", e.message); }
settings.limits.max = 99;                                      // allowed! only the top level is frozen
settings.tags.push("c");                                       // also allowed
console.log(settings);
```

## Deep freeze

```js run title="deepFreeze (with a guard for cycles)"
function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  Reflect.ownKeys(value).forEach((key) => deepFreeze(value[key], seen));    // freeze children first
  return Object.freeze(value);
}

const config = deepFreeze({ db: { host: "localhost", ports: [5432, 5433] }, debug: false });

try { config.db.host = "remote"; } catch (e) { console.log("blocked:", e.message); }
try { config.db.ports.push(1); } catch (e) { console.log("blocked:", e.message); }
console.log(Object.isFrozen(config.db.ports));
```

## `const` vs `freeze`

| | `const` | `Object.freeze` |
|---|---|---|
| Protects | the **variable binding** | the **object's properties** |
| Prevents re-assignment | yes | n/a |
| Prevents `obj.x = 1` | **no** | yes (top level) |

```js run title="Both are different tools"
const a = { n: 1 };
a.n = 2;                                   // allowed: const does not freeze
const b = Object.freeze({ n: 1 });
let c = Object.freeze({ n: 1 });
c = { n: 2 };                              // allowed: freeze does not stop re-assigning a `let`
console.log(a, b, c);
```

## Frozen arrays

```js run title="Freezing arrays"
const list = Object.freeze([3, 1, 2]);

for (const [name, fn] of Object.entries({
  push: () => list.push(4),
  sort: () => list.sort(),
  assign: () => { list[0] = 9; },
  toSorted: () => list.toSorted(),                       // returns a copy: fine
  map: () => list.map((x) => x * 2),                      // returns a copy: fine
})) {
  try { console.log(name.padEnd(8), "ok ->", fn()); } catch (e) { console.log(name.padEnd(8), "blocked:", e.constructor.name); }
}
```

## Freezing class instances and the `#private` caveat

`Object.freeze(this)` at the end of a constructor makes an **immutable value object**. Private fields (`#x`) are **not** affected by freeze (they are not properties), so a frozen object can still change its private state.

```js run title="Immutable value object"
class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    Object.freeze(this);                                  // no further changes
  }
  withX(x) { return new Point(x, this.y); }              // "change" = create a new one
  toString() { return `(${this.x}, ${this.y})`; }
}

const p = new Point(1, 2);
const q = p.withX(10);
try { p.x = 99; } catch (e) { console.log("blocked:", e.message); }
console.log(String(p), String(q));
```

## When to use these tools

- **Constants and config** that must never change: `deepFreeze` (or `as const` in TypeScript).
- **Safety in libraries**: freeze objects you hand out, so callers cannot corrupt your state.
- **Debugging**: freeze state in development to find accidental mutation (Redux Toolkit/Immer do this).
- Not for performance: frozen objects can be slightly faster in some engines, but do not rely on it.
- For large immutable data, use **structural sharing** (Immer, Immutable.js), not deep copies.

:::interview What is the difference between Object.freeze, Object.seal and Object.preventExtensions? Is freeze deep?
"`preventExtensions` stops new properties; `seal` also stops deleting and reconfiguring; `freeze` also makes values read-only, so nothing can change. In sloppy mode violations are ignored silently, in strict mode they throw a TypeError. Freeze is shallow, so nested objects and arrays stay mutable, and I use a recursive `deepFreeze` when needed. `const` only protects the binding, not the object, so they solve different problems."
:::

## More interview questions on this topic

:::qa Is `Object.freeze` deep? {level=easy}
**Say this:** "No, only the first level. Nested objects are still mutable unless you freeze them recursively."

**In simple words:** It locks the front door, not the rooms inside.
:::

:::qa What happens when you modify a frozen object? {level=easy}
**Say this:** "In sloppy mode nothing happens (silently). In strict mode a TypeError is thrown."

**In simple words:** Strict mode tells you; sloppy mode hides it.
:::

:::qa How do you check if an object is frozen? {level=easy}
**Say this:** "`Object.isFrozen(obj)`. There are also `isSealed` and `isExtensible`."

**In simple words:** Three questions, three functions.
:::

:::qa Can you "unfreeze" an object? {level=medium}
**Say this:** "No. Freezing is irreversible. You can make a mutable copy with spread or `structuredClone` (note: `structuredClone` creates unfrozen copies)."

**In simple words:** Copy it into a new, unlocked object.
:::

```quiz
? Which method prevents adding AND deleting AND changing values?
- seal
+ freeze
- preventExtensions
> freeze is the strongest.
? What does const do for `const o = {}; o.a = 1;`?
- Blocks it
+ Allows it, const only fixes the binding
- Throws a SyntaxError
> The object is still mutable.
? What does a write to a frozen object do in strict mode?
- Nothing
+ Throws a TypeError
- Creates a copy
> Silent in sloppy mode only.
```

:::keypoints
- **preventExtensions < seal < freeze**: add / delete / change.
- Violations: **silent** in sloppy mode, **TypeError** in strict mode.
- `freeze` is **shallow**: write a recursive `deepFreeze` (guard cycles).
- `const` locks the **variable**, `freeze` locks the **object**.
- `freeze` does not touch `#private` fields; freezing is irreversible.
:::
