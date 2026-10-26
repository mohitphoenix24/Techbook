---
title: "Advanced bank: memory and performance"
level: hard
time: 30
summary: Thirteen answers on the stack and heap, garbage collection, common leaks, WeakMap, how to find leaks, V8 optimisation hints, debounce and throttle, layout thrashing and measuring performance.
---

## Memory

:::qa Where does JavaScript store data: stack or heap? {level=medium}
**Say this:** "Local primitives and references live in stack frames (engines may optimise this further). Objects, arrays, functions and closures live on the heap, and variables hold references to them. The call stack frames are freed when the function returns; the heap is cleaned by the garbage collector."

**In simple words:** The stack is a notepad for the current job; the heap is the warehouse where bigger things are kept.
:::

:::qa How does garbage collection work? {level=medium}
**Say this:** "Engines use reachability: starting from roots (globals, the current stack, active closures) they mark everything reachable, and free the rest (mark-and-sweep). V8 is generational: new objects go to a young generation that is collected often and cheaply (scavenge), survivors move to the old generation, which is collected less often and incrementally or concurrently to avoid long pauses."

**In simple words:** If you can still reach it from somewhere, it stays. If not, it is thrown away.
:::

:::qa Why does reference counting not work for JavaScript? {level=hard}
**Say this:** "Circular references keep each other's count above zero even when nothing else can reach them, so they would leak. Old Internet Explorer had such leaks between DOM objects and JavaScript objects. Mark-and-sweep handles cycles correctly."

**In simple words:** Two people holding each other's hands in an empty room still look 'held'.
:::

:::qa What are the common causes of memory leaks in JavaScript? {level=medium}
**Say this:** "Accidental globals, forgotten timers and intervals, event listeners never removed, closures that capture large objects, caches that grow without a limit, detached DOM nodes still referenced from JavaScript, and subscriptions in components that never unsubscribe."

**In simple words:** Something long-lived keeps holding something that is no longer needed.
:::

:::qa How do you find a memory leak? {level=medium}
**Say this:** "In Chrome DevTools, take heap snapshots before and after repeating an action, compare them, and look at objects that keep growing, with their retainer paths. The Performance monitor shows the heap size over time; in Node use `--inspect` with the same tools, or `heapdump`. Fix by removing the reference that retains the object."

**In simple words:** Take two photos of memory and see what grew, then find who is holding it.
:::

:::qa When do you use `WeakMap`, `WeakSet` and `WeakRef`/`FinalizationRegistry`? {level=hard}
**Say this:** "`WeakMap` to attach data to objects you do not own (metadata, private state, caches keyed by object) without preventing their collection. `WeakRef` for optional caches of big objects. `FinalizationRegistry` for cleanup callbacks, but timing is not guaranteed, so never rely on it for correctness."

**In simple words:** Remember things about objects only as long as the objects live.
:::

## Performance

:::qa How do you make JavaScript code fast? {level=medium}
**Say this:** "First measure, then fix the hot spots. Choose better algorithms and data structures (a `Map` or `Set` instead of repeated array searches), avoid work in loops and repeated DOM access, keep object shapes stable, avoid blocking the main thread, and ship less code (splitting, tree shaking)."

**In simple words:** Find the slow part with a tool before guessing.
:::

:::qa What are hidden classes (shapes) and inline caches in V8? {level=hard}
**Say this:** "V8 gives objects with the same properties added in the same order the same hidden class, so property access can be compiled to a fast offset lookup, remembered by an inline cache. Adding properties in different orders, deleting properties, or changing types makes code polymorphic or megamorphic and slower."

**In simple words:** Objects that look the same are handled the same fast way; odd ones are slower.
:::

:::qa Debounce versus throttle: when do you use which? {level=easy}
**Say this:** "Debounce waits until activity stops, then runs once: search input, window resize end, autosave. Throttle runs at most once per interval during continuous activity: scroll or mouse-move handlers, rate-limited API calls. For animation use `requestAnimationFrame`."

**In simple words:** Debounce: 'tell me when you stop'. Throttle: 'tell me every second while you continue'.
:::

:::qa What is layout thrashing? {level=hard}
**Say this:** "Alternating DOM reads that need layout (`offsetHeight`, `getBoundingClientRect`) with writes (style changes) in a loop forces the browser to recalculate layout every time. Batch all reads first and then all writes, or use `requestAnimationFrame`, `ResizeObserver`, and CSS transforms."

**In simple words:** Asking 'how big is it?' after every change makes the browser measure again and again.
:::

:::qa Which array operations are accidentally quadratic? {level=medium}
**Say this:** "`includes` or `indexOf` inside a loop (O(n²)), `shift` or `unshift` in a loop, spreading an accumulator in `reduce` (`[...acc, x]`), repeated `concat`, and sorting inside a loop. Use a `Set`/`Map` for lookups, push into one array, and sort once."

**In simple words:** Searching the whole list again for each item is slow when the list is big.
:::

:::qa How do you measure performance? {level=easy}
**Say this:** "In the browser: Lighthouse, the Performance panel, Web Vitals (LCP, INP, CLS), `performance.now()` and `performance.mark/measure`. In Node: `--cpu-prof`, `perf_hooks`, benchmarks with warm-up and many runs. Always measure real devices and production builds."

**In simple words:** Use a stopwatch and a profiler, not a feeling.
:::

:::qa Why can `console.log` or `JSON.stringify` slow an app? {level=medium}
**Say this:** "`console.log` of big objects keeps them alive in the DevTools and formats them, and `JSON.stringify` is synchronous CPU work proportional to the data size, blocking the loop. Avoid them in hot paths and in production code for large payloads."

**In simple words:** Even small helpers cost time when used a million times.
:::

:::keypoints
- **Reachability** decides what is freed; **generational GC** makes short-lived objects cheap.
- Leaks: **listeners, timers, closures, caches, detached DOM, subscriptions**.
- Find leaks with **heap snapshots**; use **WeakMap** for metadata.
- Keep **object shapes stable**; avoid **layout thrashing** and **quadratic loops**.
- **Measure first.**
:::
