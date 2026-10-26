---
title: Closures and memory
level: advanced
time: 25
summary: What a closure keeps alive, how closures cause memory leaks (big captured data, forgotten listeners and timers), how V8 decides what to keep, and how to release memory.
---

## A closure keeps its environment alive

A closure is useful because it keeps variables alive. That is also its danger. **Anything the closure can reach stays in memory as long as the closure itself is reachable.**

```js run node nondet title="A closure keeps a large array alive" 
function makeReader() {
  const big = new Array(5_000_000).fill(1);        // about 40 MB
  return () => big.length;                         // uses `big`, so big stays alive
}

function makeLeanReader() {
  const big = new Array(5_000_000).fill(1);
  const size = big.length;                         // copy only what we need
  return () => size;                               // `big` is not used, so it can be freed
}

const mb = (n) => Math.round(n / 1024 / 1024);
function heap() { global.gc(); return process.memoryUsage().heapUsed; }

const base = heap();
const keep = makeReader();
const afterReader = heap();
const lean = makeLeanReader();
const afterLean = heap();

console.log("closure that uses the array holds it:", mb(afterReader - base) > 20);
console.log("closure that copied only the size holds it:", mb(afterLean - afterReader) > 20);
console.log(keep(), lean());
```

(Run Node with `--expose-gc` to call `global.gc()`. This example is recorded from Node; the numbers vary, the true/false results do not.)

The first closure uses `big`, so the environment keeps the 40 MB array. The second copies `size` first, so the array has no references and can be collected.

## What exactly is kept?

Modern engines are clever. V8 puts into the closure's **context** only the variables that **some inner function actually uses**. So in `makeLeanReader`, `big` is not in the context at all.

But there is a catch: all inner closures from the same call **share one context**. If **one** inner function uses `big`, then **all** of them keep it alive, even those that never touch it.

```js run node nondet title="One closure that uses a big variable keeps it for all"
function setup() {
  const big = new Array(3_000_000).fill(7);
  const getLength = () => big.length;              // uses big
  const sayHi = () => "hi";                        // does not use big, but shares the context
  return sayHi;                                    // we return only the harmless one
}

function heap() { global.gc(); return process.memoryUsage().heapUsed; }
const before = heap();
const hi = setup();
const after = heap();

console.log(hi());
console.log("big array still alive:", (after - before) / 1024 / 1024 > 15);
```

Even though the caller only holds `sayHi`, the shared context (which has `big`, because `getLength` uses it) is kept alive. Eval and `with` make engines keep everything, so avoid them.

## Common leaks through closures

### 1. Timers that are never cleared

```js
function startPolling(bigData) {
  setInterval(() => {
    console.log(bigData.length);     // bigData is kept alive forever
  }, 1000);                          // nobody calls clearInterval
}
```

Always keep the timer id and clear it when the work is finished (for example, in a React cleanup function or on server shutdown).

### 2. Event listeners that are never removed

```js
function mount(element, bigState) {
  element.addEventListener("click", () => use(bigState));   // no removeEventListener
}
```

If the element is removed from the page but the listener is held elsewhere (a global array, an event bus), the closure and everything it captured stay alive. Remove listeners when you are done, or use `{ once: true }` or an `AbortController` signal.

### 3. Caches that grow forever

```js
const cache = new Map();
function lookup(key) {
  if (!cache.has(key)) cache.set(key, expensive(key));      // grows with every new key
  return cache.get(key);
}
```

Limit the size (LRU) or use a `WeakMap` when the key is an object.

### 4. Capturing a big object when you need one field

Capture the **field**, not the whole object.

```js run title="Capture only what you need"
function track(response) {
  const id = response.id;                           // keep a tiny value
  return () => console.log("tracking", id);         // instead of closing over the whole response
}

const heavy = { id: 7, body: "x".repeat(1000) };
const t = track(heavy);
t();
```

## How to check for leaks (a first look)

1. **Chrome DevTools → Memory → Heap snapshot**, take two snapshots and compare. Look for "(closure)" and "Detached DOM tree".
2. **Allocation timeline** shows what is allocated and never freed.
3. In Node: `node --inspect`, then open `chrome://inspect`; or log `process.memoryUsage().heapUsed` over time.

You will do this in detail in the [memory leaks lesson](#/l/memory-leaks).

:::interview Can closures cause memory leaks? How do you prevent them?
"Yes. A closure keeps everything it references alive as long as the closure is reachable. Leaks happen when a long-lived closure, such as a timer, a listener or a cache entry, holds a large object that is no longer needed. In V8 all closures created in the same call share one context, so one closure that uses a big variable keeps it alive for the others too. To prevent leaks I clear timers, remove listeners (or use AbortController), bound my caches, avoid capturing whole big objects when I need one field, and set references to `null` when the work is done."
:::

## More interview questions on this topic

:::qa When is memory held by a closure freed? {level=medium}
**Say this:** "When the closure itself becomes unreachable, so nothing references the function. Then the environment it held can be collected too."

**In simple words:** The backpack is thrown away when nobody holds the function any more.
:::

:::qa Do closures always cause leaks? {level=easy}
**Say this:** "No. They only keep what they use, and only while they are reachable. Most closures are small and short-lived. The risk is in long-lived closures that hold large data."

**In simple words:** A closure is like a rented locker: fine, as long as you return the key.
:::

:::qa How do you stop a closure from holding a big variable? {level=medium}
**Say this:** "Copy out only the small value I need, or set the big variable to null when I am done, or restructure so the inner function does not reference it."

**In simple words:** Do not put the big thing in the backpack in the first place.
:::

:::qa Why can one closure keep another's variables alive? {level=hard}
**Say this:** "Closures made in the same call share one context object. If any of them uses a variable, that variable lives in the shared context, so every closure keeps it alive."

**In simple words:** They share one big backpack, not one each.
:::

```quiz
? What decides if a closure keeps a big array alive?
- The size of the array only
+ Whether the closure (or a sibling in the same scope) references it and is itself reachable
- Whether the array is const
> References decide. Reachable closures keep what their context holds.
? Which is a common closure-related leak?
- Using const
+ A setInterval that is never cleared and captures a large object
- Calling a function twice
> The timer holds the callback, the callback holds the data, and the timer is held by the runtime.
? What is a good way to avoid capturing a whole object in a callback?
- Make the object global
+ Read the small value you need into a local const first
- Use var instead of let
> Then only the small value is in the closure.
```

:::keypoints
- A closure keeps what it references alive while the closure is reachable.
- V8 stores only the variables inner functions use, but sibling closures **share one context**.
- Leaks: uncleared timers, unremoved listeners, unbounded caches, capturing big objects.
- Prevent: clear timers, remove listeners (or `AbortController`), bound caches, capture only what you need.
:::
