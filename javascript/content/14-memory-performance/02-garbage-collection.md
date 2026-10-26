---
title: Garbage collection in V8
level: advanced
time: 25
summary: How automatic memory management works: reachability, mark-and-sweep, why reference counting fails on cycles, generational collection (young and old space), pauses, and what that means for how you write code.
---

## What the garbage collector does

JavaScript has **no `free()`**. The engine's **garbage collector (GC)** finds objects that the program can no longer reach and gives their memory back.

### Idea 1: reference counting (old, simple, flawed)

Keep a counter per object: how many references point to it. When it reaches 0, free it. Problem: **cycles**.

```js run title="A cycle: reference counting would never free these"
function makeCycle() {
  const a = {};
  const b = { a };          // b points to a
  a.b = b;                  // a points to b: each has a count of 1 forever
  return null;              // but nothing outside refers to either: they are garbage!
}
makeCycle();
console.log("modern engines free this cycle. Old IE6/7 DOM objects leaked such cycles.");
```

### Idea 2: mark and sweep (what engines use)

1. **Mark:** start from the **roots**, follow every reference, and **mark** each object you reach as alive.
2. **Sweep:** everything **not marked** is garbage: free it.

Because it asks "can I reach it from a root?" and not "does anything point to it?", **cycles are not a problem**: an unreachable cycle is simply never marked.

```viz algo=chain title="Mark and sweep: reachable from the root vs garbage"
node root "Roots (globals, stack)" @0,0 [hl]
node a "object A" @1,0 [ok]
  state: marked (alive)
node b "object B" @2,0 [ok]
  state: marked (alive)
node c "object C" @1,1 [bad]
  state: not reachable
node d "object D" @2,1 [bad]
  state: not reachable (cycle with C)
link root -> a : reaches
link a -> b : reaches
link c -> d : refers
link d -> c : refers
```

`C` and `D` point to each other, but no path from a root reaches them, so both are swept.

## Generational GC: V8's trick for speed

Studies show most objects **die young** (temporary values in a function), while some live for a long time. So V8 splits the heap:

| Space | Holds | Collector | Speed |
|---|---|---|---|
| **Young generation** ("new space", small, ~1 to 16 MB) | newly created objects | **Scavenger** (copying): copies live objects to a fresh half, drops the rest | **very fast** (about 1 to 2 ms), runs often |
| **Old generation** ("old space", large) | objects that **survived two scavenges** | **Mark-Sweep-Compact** (Major GC) | slower, runs less often |

Most garbage is cleaned cheaply in the young generation, and only long-lived objects are promoted to the old one. V8's collector is called **Orinoco**: it uses **parallel**, **incremental** (small steps) and **concurrent** (on helper threads) techniques to keep **pauses short** ("stop-the-world" time).

## What you can observe

```js run node title="Watching GC activity (Node, --trace-gc)" nondet
const { PerformanceObserver, constants } = require("node:perf_hooks");

const kinds = { [constants.NODE_PERFORMANCE_GC_MINOR]: "minor (scavenge)", [constants.NODE_PERFORMANCE_GC_MAJOR]: "major (mark-sweep)" };
const seen = new Set();
const obs = new PerformanceObserver((list) => {
  for (const e of list.getEntries()) seen.add(kinds[e.detail?.kind] ?? "other");
});
obs.observe({ entryTypes: ["gc"] });

// create lots of short-lived garbage
let keep;
for (let i = 0; i < 200000; i++) keep = { id: i, data: [i, i + 1, i + 2] };
global.gc();                                                // ask for a full collection

setTimeout(() => { console.log("kinds of GC seen:", [...seen].sort()); obs.disconnect(); }, 50);
```

Other tools: `node --trace-gc app.js` (prints every collection), `--max-old-space-size=4096` (heap limit in MB), `v8.getHeapStatistics()`, Chrome DevTools **Performance** (GC events) and **Memory**.

## Practical consequences for your code

1. **Allocation is cheap, but not free.** Creating many short-lived objects in a hot loop makes the young generation fill up and triggers more scavenges. In hot paths, **reuse objects** (object pools, preallocated buffers).
2. **Long-lived garbage is expensive.** Objects that survive get promoted to the old space and need a major GC to be removed.
3. **GC pauses cause jank.** A 50 ms major GC pause drops frames. Keep the heap small, avoid giant arrays of objects, prefer typed arrays and streaming.
4. **You cannot control GC**, only influence it by what you keep reachable. `global.gc()` exists only with `--expose-gc` (for tests and demos). Do not call it in production.
5. **A leak is just reachable garbage**: the GC is working correctly; your code still holds the reference.
6. **Weak references** (`WeakMap`, `WeakSet`, `WeakRef`) let you refer to objects without keeping them alive.

```js run node title="Allocation in a hot loop: new objects vs reuse (relative cost)" nondet
function withAllocation(n) {
  let sum = 0;
  for (let i = 0; i < n; i++) { const p = { x: i, y: i * 2 }; sum += p.x + p.y; }   // a new object per iteration (often optimised away by V8!)
  return sum;
}
function withoutAllocation(n) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += i + i * 2;
  return sum;
}
console.log(withAllocation(5e6) === withoutAllocation(5e6));
console.log("V8's escape analysis may remove the allocation: always measure with a real benchmark.");
```

## GC and Node: the heap limit

V8 limits the old space (the default depends on the machine, often ~2 to 4 GB on 64-bit). When exceeded, Node crashes with `FATAL ERROR: ... JavaScript heap out of memory`.

```bash
node --max-old-space-size=4096 server.js     # raise the limit to 4 GB (a stopgap: find the leak!)
node --max-semi-space-size=64 server.js       # a larger young generation can reduce scavenge frequency
```

:::interview How does garbage collection work in JavaScript? What is generational GC?
"Engines use reachability-based collection, mark and sweep: starting from roots such as globals and the current stack, they mark every reachable object and free the rest, so cycles are not a problem, unlike simple reference counting. V8 is generational: new objects go to a small young generation cleaned by a fast copying scavenger, since most objects die young; objects that survive are promoted to the old generation, which is cleaned by a mark-sweep-compact collector that runs incrementally, concurrently and in parallel to keep pauses short. I cannot control GC, only what I keep reachable, so I avoid leaks, large long-lived structures and needless allocation in hot paths."
:::

## More interview questions on this topic

:::qa Why doesn't a circular reference cause a memory leak in modern JavaScript? {level=medium}
**Say this:** "Collectors use reachability from roots (mark and sweep), not reference counts. An isolated cycle is not reachable, so it is collected."

**In simple words:** The GC asks "can I get to it from the program?", not "does something point to it?".
:::

:::qa What is the difference between a minor and a major GC? {level=medium}
**Say this:** "A minor GC (scavenge) cleans the small young generation by copying survivors, and is quick and frequent. A major GC (mark-sweep-compact) cleans the old generation, and is slower, so V8 does much of it incrementally and concurrently."

**In simple words:** Quick tidy of the new things vs a full clean-up of the old things.
:::

:::qa Can you force garbage collection? Should you? {level=easy}
**Say this:** "Only with `--expose-gc` and `global.gc()`, which is for testing and debugging. In production you should not: let the engine schedule it."

**In simple words:** You can ask, but you should not.
:::

:::qa What does "heap out of memory" mean and what do you do? {level=medium}
**Say this:** "The old generation reached its limit. I first look for a leak with a heap snapshot comparison, reduce the data held, stream instead of loading, and only as a stopgap raise `--max-old-space-size`."

**In simple words:** Find why it grows before buying a bigger box.
:::

```quiz
? Why does mark-and-sweep handle cycles?
- It counts references
+ It frees whatever is not reachable from the roots
- It breaks the cycle manually
> An unreachable cycle is never marked.
? What does the young generation hold?
- Long-lived objects
+ Newly created objects, cleaned by a fast scavenger
- Only strings
> Most objects die young.
? Which flag exposes global.gc() in Node?
- --force-gc
+ --expose-gc
- --gc
> Used for experiments only.
```

:::keypoints
- **Mark-and-sweep**: mark everything reachable from the **roots**, free the rest. Cycles are no problem.
- **Generational**: young space (fast **scavenge**), old space (**mark-sweep-compact**, incremental/concurrent/parallel).
- You cannot control the GC. You control **what stays reachable**.
- Reuse objects in hot paths, keep the heap small, avoid long-lived garbage. Tools: `--trace-gc`, `PerformanceObserver("gc")`, heap snapshots.
- Heap limit: `--max-old-space-size` (a stopgap, not a fix).
:::
