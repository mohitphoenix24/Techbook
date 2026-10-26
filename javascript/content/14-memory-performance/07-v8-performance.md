---
title: How V8 makes JavaScript fast (and how to avoid slowing it down)
level: advanced
time: 30
summary: Hidden classes (shapes), inline caches, monomorphic vs megamorphic code, array element kinds, de-optimisation, and a short list of practical rules. Also how to benchmark correctly.
---

## First: measure, then optimise

Most JavaScript is fast enough. The rule for senior engineers: **find the bottleneck with a profiler, then fix that one**. Do not apply micro-optimisations everywhere. That said, you should know **how the engine thinks**, because it explains real slowdowns and common interview questions.

## Hidden classes (shapes)

JavaScript objects are dynamic: you can add properties any time. To make property access fast anyway, V8 gives each object a **hidden class** (also called **shape** or **map**) that describes its layout (which properties, in which order). Objects with the **same properties added in the same order** share a hidden class, so V8 can look up `obj.x` at a **fixed offset**, like a C struct.

```js run title="Same shape or different shape?"
function Point(x, y) { this.x = x; this.y = y; }

const a = new Point(1, 2);
const b = new Point(3, 4);              // same constructor, same order: SAME shape as a (fast)

const c = { x: 1, y: 2 };
const d = { y: 2, x: 1 };               // same properties, DIFFERENT order: a different shape

const e = new Point(5, 6);
e.z = 7;                                // adding a property later: a transition to a new shape

console.log(Object.keys(a).join(), Object.keys(c).join(), Object.keys(d).join(), Object.keys(e).join());
```

(You can inspect shapes in Node with `node --allow-natives-syntax` and `%HaveSameMap(a, b)`.)

## Inline caches (ICs) and the three states

At every property access (`obj.x`), V8 remembers **which shapes it has seen** there:

| State | Shapes seen at this site | Speed |
|---|---|---|
| **Monomorphic** | 1 | **fastest** (direct offset, can be inlined) |
| **Polymorphic** | 2 to 4 | fast (a few checks) |
| **Megamorphic** | 5+ | **slow** (a global hash lookup) |

```js run title="Keep call sites monomorphic" nondet
function getX(o) { return o.x; }

const monomorphic = Array.from({ length: 1e6 }, (_, i) => ({ x: i, y: i }));                  // all the same shape
const megamorphic = Array.from({ length: 1e6 }, (_, i) => {
  const o = { x: i };
  o["p" + (i % 8)] = i;                                                                         // 8 different shapes
  return o;
});

function time(list) {
  let sum = 0;
  const t0 = performance.now();
  for (let r = 0; r < 5; r++) for (let i = 0; i < list.length; i++) sum += getX(list[i]);
  return Math.round(performance.now() - t0);
}

time(monomorphic); time(megamorphic);                                                          // warm up
console.log("monomorphic:", time(monomorphic), "ms | megamorphic:", time(megamorphic), "ms");   // usually the second is slower
```

**Rule:** create objects of the same kind **with the same property order**, ideally in a **constructor or class** (or one object-literal factory). Initialise all properties up front, even if the value is `null`.

## The JIT pipeline and de-optimisation

```viz algo=state title="A function's life in V8"
state cold "Ignition (bytecode)" [initial] @0,1
state warm "Sparkplug (baseline)" @1,1
state hot "TurboFan (optimised)" @2,1
cold -> warm : called often
warm -> hot : very hot
hot -> cold : deopt (a guess was wrong)
play: called often, very hot, deopt, called often
```

TurboFan optimises code based on **assumptions** from what it has seen ("this argument is always a small integer", "this object always has this shape"). When an assumption fails, V8 **de-optimises** back to the interpreter, which costs time. Examples that cause it:

- a function called with **different types** in the same position (number, then string);
- **changing an object's shape** in a hot path (adding or deleting properties);
- integer arithmetic that overflows into doubles;
- `try/catch` used to be a problem; modern V8 handles it, but still keep hot loops simple.

```js title="Type stability (a sketch, not a benchmark)"
function add(a, b) { return a + b; }

add(1, 2);  add(3, 4);  add(5, 6);        // always small integers: V8 compiles a fast integer addition
add("a", "b");                              // a string appears: the integer assumption fails, so V8 de-optimises
                                            // and falls back to a general (slower) version of add
```

## Arrays: element kinds

V8 stores arrays in the **most specific representation** that fits, and it can only go **down** (more general), never back:

| Kind | Holds | Speed |
|---|---|---|
| `PACKED_SMI_ELEMENTS` | small integers, no holes | fastest |
| `PACKED_DOUBLE_ELEMENTS` | numbers | fast |
| `PACKED_ELEMENTS` | anything | good |
| `HOLEY_*` | any, with **holes** | slower (extra checks) |

```js run title="Holes: how arrays end up holey"
const packed = [1, 2, 3];                       // PACKED_SMI_ELEMENTS
const holey = [1, , 3];                          // HOLEY_SMI_ELEMENTS (a literal hole)
const created = new Array(3);                    // starts with 3 holes: HOLEY
const filled = new Array(3).fill(0);             // still HOLEY (a kind never goes back to packed)
const better = Array.from({ length: 3 }, () => 0);    // PACKED
const deleted = [1, 2, 3]; delete deleted[1];    // creates a hole: HOLEY

for (const [name, arr] of Object.entries({ packed, holey, created, filled, better, deleted })) {
  const holes = Array.from({ length: arr.length }, (_, i) => (i in arr ? 0 : 1)).reduce((a, b) => a + b, 0);
  console.log(name.padEnd(8), "holes:", holes);
}
```

(`created` and `deleted` have real holes. `filled` has none now, but V8 remembers that it was created holey. You can see element kinds with `node --allow-natives-syntax` and `%DebugPrint(array)`.)

Practical rules: **avoid holes** (`new Array(n)`, `delete arr[i]`, writing past the end), do not mix types in hot numeric arrays, and use **typed arrays** (`Float64Array`, `Uint8Array`) for numeric work.

## A short list of practical rules

1. **Profile first** (Chrome Performance tab, `node --prof`, `--cpu-prof`, `clinic flame`).
2. **Same shape:** initialise all properties in the constructor, in the same order; do not add or delete properties later (`delete obj.x` is slow: set it to `undefined` or `null`, or use a `Map`).
3. **Stable types:** keep a variable or argument to one type in hot code.
4. **Avoid holes** in arrays, and avoid sparse "dictionary-mode" arrays (`a[1000000] = 1`).
5. **Use the right data structure:** `Set`/`Map` for lookups (not `array.includes` in a loop), typed arrays for numbers.
6. **Reduce allocation in hot loops:** reuse objects, avoid creating closures or arrays per iteration.
7. **Strings:** `+=` in a loop is fine in V8 (ropes); use `array.join` only if you measured a need.
8. **Do less work:** avoid recomputation (memoize), do not touch the DOM in loops (batch reads and writes), use `for` loops on hot paths instead of long method chains if you measured it matters.
9. **Do not use `arguments`, `with`, `eval`, or `Function` in hot code.**
10. **Check the algorithm first:** an O(n²) loop is slower than any micro-optimisation can fix.

## Benchmarking correctly

Naive benchmarks lie:

```js run title="Pitfalls in micro-benchmarks" nondet
// 1. Dead code elimination: V8 can remove work whose result is not used
function bad() {
  const t0 = performance.now();
  for (let i = 0; i < 1e8; i++) Math.sqrt(i);          // result unused: may be optimised away
  return performance.now() - t0;
}

// 2. Use the result, warm up, repeat, and compare medians
function good(fn, runs = 7) {
  let sink = 0;
  for (let i = 0; i < 3; i++) sink += fn();             // warm up
  const times = [];
  for (let r = 0; r < runs; r++) { const t0 = performance.now(); sink += fn(); times.push(performance.now() - t0); }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(runs / 2)], sink };
}

console.log("bad measured something:", bad() >= 0);
console.log("good measured something:", good(() => { let s = 0; for (let i = 0; i < 1e6; i++) s += Math.sqrt(i); return s; }).median >= 0);
```

Use a proper tool: **`tinybench`**, **`benchmark.js`**, `console.time`, or `performance.mark/measure`. In the browser use **Lighthouse** and the **Performance** panel; for the whole app, use **Core Web Vitals** (LCP, INP, CLS).

:::interview What are hidden classes and inline caches? How do you write V8-friendly code?
"V8 gives objects a hidden class that describes their layout, so property access can use a fixed offset. Objects created with the same properties in the same order share a hidden class. Inline caches at each access site remember the shapes seen: monomorphic (one shape) is fastest, polymorphic is OK, megamorphic is slow. TurboFan optimises hot code based on assumptions about types and shapes and de-optimises when they break. So I initialise all properties in the constructor in a consistent order, avoid adding or deleting properties later, keep types stable in hot functions, avoid holey arrays and use typed arrays for numeric data. But I profile first, because most code does not need this."
:::

## More interview questions on this topic

:::qa Why is `delete obj.prop` considered slow? {level=medium}
**Say this:** "It changes the object's shape and can switch it to a slower dictionary mode, making property access slower for that object. Setting the property to `undefined` or using a Map keeps the shape stable."

**In simple words:** The engine loses its fast map of the object.
:::

:::qa What is the difference between monomorphic and megamorphic? {level=medium}
**Say this:** "At a given property access, monomorphic means one object shape was seen (fastest), megamorphic means many shapes (slowest, uses a generic lookup)."

**In simple words:** One kind of thing passes through, or very many kinds.
:::

:::qa What is de-optimisation? {level=medium}
**Say this:** "When an assumption TurboFan made about types or shapes turns out false, V8 throws away the optimised machine code and returns to the interpreter, then may re-optimise later."

**In simple words:** The fast path was a bet, and the bet lost.
:::

:::qa Why are typed arrays faster than normal arrays for numbers? {level=medium}
**Say this:** "They store raw numbers contiguously with a fixed type, with no per-element tagging or holes, so access is predictable and memory is compact."

**In simple words:** A plain list of 8-byte numbers, no wrapping.
:::

```quiz
? Which creates objects that share a hidden class?
- { a: 1, b: 2 } and { b: 2, a: 1 }
+ Two objects built by the same constructor with the same property order
- Objects with properties added later in random order
> Same properties, same order.
? What is a megamorphic call site?
- One that sees one shape
+ One that has seen many different shapes, so it is slow
- One that is async
> Avoid mixing shapes in hot code.
? What should you do before optimising code?
- Rewrite it with loops
+ Profile to find the real bottleneck
- Add memoize everywhere
> Measure first.
```

:::keypoints
- **Hidden classes (shapes)** describe object layout. Same properties in the same order = same shape = fast access.
- **Inline caches**: monomorphic (fast) → polymorphic → **megamorphic** (slow).
- **JIT + de-opt**: optimised code relies on assumptions about types and shapes. Keep them stable.
- **Arrays**: avoid holes and mixed types; use **typed arrays** for numeric data. Do not `delete` properties.
- **Profile first**, benchmark properly (warm up, use results, repeat). Check the **algorithm** before micro-optimising.
:::
