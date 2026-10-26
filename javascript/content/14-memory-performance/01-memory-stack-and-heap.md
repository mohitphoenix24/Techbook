---
title: How JavaScript uses memory: stack and heap
level: intermediate
time: 25
summary: Where primitives, objects, closures and functions live, what the stack and the heap are, how references work, what "reachable" means, and how to look at memory use in a program.
---

## Two places to store data

| | **Call stack** | **Heap** |
|---|---|---|
| What lives there | Execution contexts: local primitives, references, return addresses | Objects, arrays, functions, closures' environments, strings (large ones) |
| Size | Small, fixed (about 1 MB in V8) | Large, grows as needed (GBs) |
| Speed | Very fast: push and pop | Slower: needs allocation and **garbage collection** |
| Lifetime | Ends when the function returns | Lives while something can **reach** it |
| Management | Automatic, by the call | The **garbage collector** frees it |

:::analogy A desk and a warehouse
The **stack** is your desk: small, tidy, and cleared when a task is done. The **heap** is a big warehouse. Your desk holds only **slips of paper with shelf numbers** (references). The goods stay in the warehouse until nobody has a slip pointing to them. Then the warehouse staff (the garbage collector) clear them away.
:::

```viz algo=chain title="const user = { name: 'Asha', tags: ['a'] }; let n = 5;"
node stack "Stack (the current function)" @0,0 [hl]
  n: 5
  user: ->
node heap1 "Heap: object" @1,0
  name: "Asha"
  tags: ->
node heap2 "Heap: array" @2,0
  0: "a"
link stack -> heap1 : reference
link heap1 -> heap2 : reference
```

## Primitives vs objects in memory

- A **primitive** (number, boolean, string, etc.) is stored **by value** where it is used. (Engines may place large strings in the heap, and numbers that are not small integers as "heap numbers", but you reason about them as values.)
- An **object** is stored on the heap. A variable holds a **reference** (pointer) to it.

```js run title="Copying a variable copies the reference, not the object"
let a = { count: 1 };
let b = a;                  // b points to the SAME heap object
b.count = 2;
console.log(a.count);

let x = 1;
let y = x;                  // y is its own copy of the value 1
y = 2;
console.log(x);

function change(obj) { obj.changed = true; obj = { replaced: true }; }   // the parameter holds a COPY of the reference
const thing = {};
change(thing);
console.log(thing);
```

## What does "reachable" mean?

The garbage collector keeps an object **alive if it can be reached** from a **root** by following references. Roots are:

- the **global object** and global variables,
- variables on the **current call stack**,
- variables captured by **closures** that are themselves reachable,
- active timers, event listeners and pending promises' callbacks (held by the runtime).

If **no path** from any root reaches an object, it is **garbage** and can be freed.

```js run title="Making an object unreachable"
let big = { data: new Array(1000).fill("x") };
const ref = new WeakRef(big);

console.log("reachable:", ref.deref() !== undefined);
big = null;                                           // the only strong reference is gone
console.log("variable is null, the object is now garbage (freed at the next GC)");
```

## Memory is not "free" just because there is a garbage collector

You can still run out of memory by **keeping** things reachable: a growing array, a cache, a listener list. That is a **memory leak** (next lessons).

## Looking at memory

```js run node title="process.memoryUsage() in Node" nondet
const mb = (n) => Math.round(n / 1024 / 1024);

function report(label) {
  global.gc();                                               // force a collection (run Node with --expose-gc)
  const { heapUsed, heapTotal, rss, external } = process.memoryUsage();
  console.log(label.padEnd(24), "heapUsed:", mb(heapUsed), "MB", "| heapTotal:", mb(heapTotal), "MB");
}

report("start");
let list = Array.from({ length: 2_000_000 }, (_, i) => ({ id: i }));     // ~100+ MB of small objects
report("after allocating 2M objects");
list = null;
report("after releasing them");
```

| Field | Meaning |
|---|---|
| `heapUsed` | bytes of the V8 heap in use by live objects |
| `heapTotal` | bytes of heap V8 has reserved |
| `rss` | the whole process in RAM (heap + code + stack + native) |
| `external` | memory of C++ objects tied to JS objects (e.g. Buffers) |
| `arrayBuffers` | memory of ArrayBuffers and Buffers |

In the **browser**, use DevTools → **Memory** tab (heap snapshots, allocation timeline) and `performance.memory` (Chrome only, approximate).

## Typical memory costs

```js run node title="How big are things?" nondet
const size = (make, n = 100000) => {
  global.gc();
  const before = process.memoryUsage().heapUsed;
  const keep = Array.from({ length: n }, make);
  global.gc();
  const after = process.memoryUsage().heapUsed;
  return Math.round((after - before) / n) + " bytes each";        // approximate, includes the array slot
};

console.log("small integer  :", size((_, i) => i));
console.log("empty object   :", size(() => ({})));
console.log("{ a, b } object:", size((_, i) => ({ a: i, b: i })));
console.log("short string   :", size((_, i) => "item-" + i));
console.log("array of 3     :", size((_, i) => [i, i, i]));
console.log("closure        :", size((_, i) => () => i));
console.log("Map entry (obj):", size((_, i) => new Map([[i, i]])));
```

Each object has a header (hidden class pointer, properties and elements pointers), so **many small objects cost more than you expect**. A million `{ x, y }` objects take tens of MB. For big numeric data use **typed arrays** (`Float64Array`): 8 bytes per number, no per-item overhead.

## Practical rules

1. **Do not keep references** you no longer need (set to `null`, remove from collections, remove listeners).
2. **Scope variables narrowly**: a variable that goes out of scope is no longer a root.
3. Prefer **typed arrays** and compact structures for large data.
4. Stream large files instead of loading them whole.
5. **Measure** before optimising.

:::interview Where do values live in memory in JavaScript? What is the heap vs the stack?
"The call stack holds execution contexts: local variables, which for objects are just references, and it is fast but small. The heap is where objects, arrays, functions and closure environments live; it is large and managed by the garbage collector. A variable holding an object stores a reference to the heap, so copying it copies the reference. An object stays alive as long as it is reachable from a root, such as globals, the current stack or live closures. Memory leaks happen when I keep objects reachable by mistake."
:::

## More interview questions on this topic

:::qa What is a reference, and what is copied when you assign an object to another variable? {level=easy}
**Say this:** "A reference is a pointer to an object on the heap. Assigning copies the pointer, so both variables refer to the same object."

**In simple words:** Two slips with the same shelf number.
:::

:::qa What is a GC root? {level=medium}
**Say this:** "A starting point from which the collector follows references: global variables, the variables on the current stack, and active handles such as timers. Anything reachable from a root is live."

**In simple words:** The things the program is still holding in its hands.
:::

:::qa Why are millions of small objects expensive? {level=medium}
**Say this:** "Each object has header and pointer overhead and the GC must trace it. For large numeric data, typed arrays are far more compact and faster to scan."

**In simple words:** Many small boxes take more space than the stuff inside them.
:::

:::qa How do you check memory usage in Node? {level=easy}
**Say this:** "`process.memoryUsage()` for heapUsed, rss and so on; `--inspect` with Chrome DevTools for heap snapshots; `v8.getHeapStatistics()`; and `--heapsnapshot-signal` to dump a snapshot of a running process."

**In simple words:** Ask the process how much it uses, and take snapshots to see what.
:::

```quiz
? Where does `const o = { a: 1 }` store the object?
- On the call stack
+ On the heap, with the variable holding a reference
- In the global object
> Objects live on the heap.
? When can the garbage collector free an object?
- When its variable name goes out of scope
+ When it is no longer reachable from any root
- After a fixed time
> Reachability decides.
? Which is more compact for a million numbers?
- An array of Number objects
+ A Float64Array
- An object with numeric keys
> 8 bytes per element, no per-item overhead.
```

:::keypoints
- **Stack**: small, fast, per-call (primitives and references). **Heap**: large, for objects, closures, arrays; managed by the **GC**.
- A variable holding an object holds a **reference**: copying copies the pointer.
- **Reachable from a root** = alive. Roots: globals, the stack, live closures, timers and listeners.
- Many small objects are costly; use **typed arrays** for big numeric data.
- Inspect with `process.memoryUsage()`, DevTools heap snapshots.
:::
