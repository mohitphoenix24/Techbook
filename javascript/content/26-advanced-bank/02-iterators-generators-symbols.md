---
title: "Advanced bank: iterators, generators and symbols"
level: hard
time: 25
summary: Eleven answers on the iteration protocols, generators as pausable functions, two-way communication, async generators, laziness, and symbols with their well-known uses.
---

:::qa What are the iteration protocols? {level=medium}
**Say this:** "An iterable has a `[Symbol.iterator]()` method returning an iterator. An iterator has `next()` returning `{ value, done }`. `for...of`, spread, destructuring, `Array.from`, `Map`, `Set` and `Promise.all` consume iterables."

**In simple words:** An iterable can give you a pointer; the pointer knows how to move to the next item.
:::

:::qa What is a generator? {level=easy}
**Say this:** "A function declared with `function*` that can pause at `yield` and resume later. Calling it returns a generator object, which is an iterator. The code runs only when you call `next()`."

**In simple words:** A function with a pause button.
:::

:::qa How do you write an infinite sequence safely? {level=easy}
**Say this:** "With a generator, because it is lazy: `function* ids() { let i = 1; while (true) yield i++; }`. The consumer takes only what it needs, for example with `take(5)` or by breaking out of the loop."

**In simple words:** The tap runs only when you open it.
:::

:::qa How can data flow into a generator? {level=hard}
**Say this:** "`gen.next(value)` makes the paused `yield` expression evaluate to `value`. `gen.throw(error)` throws at the paused point, and `gen.return(v)` finishes it, running `finally` blocks. That two-way flow is what the old co/redux-saga style used for async control flow."

**In simple words:** `yield` gives something out, and `next(x)` can hand something back in.
:::

:::qa What does `yield*` do? {level=medium}
**Say this:** "It delegates to another iterable or generator, yielding all its values and returning its final return value. It is how you compose generators, for example in a recursive tree traversal."

**In simple words:** 'Let that other generator speak for a while.'
:::

:::qa How do async generators and `for await` work? {level=medium}
**Say this:** "An `async function*` yields values asynchronously; consume it with `for await (const x of stream)`. Each `next()` returns a promise. They are ideal for paginated APIs, streams and event sequences, with built-in backpressure because the producer waits for the consumer."

**In simple words:** A generator whose items arrive over time.
:::

:::qa What happens to a generator when you `break` out of a `for...of` loop? {level=hard}
**Say this:** "The loop calls the iterator's `return()` method, which finishes the generator and runs its `finally` blocks. That is how resources (files, locks, connections) can be cleaned up when the consumer stops early."

**In simple words:** Leaving the loop politely tells the generator to tidy up.
:::

:::qa Give a practical use for generators. {level=medium}
**Say this:** "Lazy pipelines over big or endless data, custom iteration for data structures (trees, graphs), paginated fetching, state machines, and test helpers. Libraries like redux-saga use them for readable async flows."

**In simple words:** Whenever you want to produce values one by one, on demand.
:::

:::qa What is a `Symbol`, and why would you use one? {level=medium}
**Say this:** "A unique primitive value, optionally with a description. Use it for property keys that cannot collide (library metadata), for hidden-ish keys that do not show in `Object.keys` or `JSON.stringify`, and for customising language behaviour through well-known symbols."

**In simple words:** A key that nobody else can accidentally copy.
:::

:::qa Which well-known symbols are worth knowing? {level=hard}
**Say this:** "`Symbol.iterator` and `Symbol.asyncIterator` for loops, `Symbol.toPrimitive` for conversions, `Symbol.hasInstance` for `instanceof`, `Symbol.toStringTag` for `Object.prototype.toString`, `Symbol.species` for derived constructors, and `Symbol.for(key)` for a global shared registry."

**In simple words:** Hooks that let your objects behave like built-in ones.
:::

:::qa How do you make a class iterable? {level=easy}
**Say this:** "Add `*[Symbol.iterator]() { for (const item of this.items) yield item; }`. Now `for (const x of obj)`, `[...obj]` and `Array.from(obj)` work."

**In simple words:** Teach your class how to hand out items one at a time.
:::

:::keypoints
- **Iterable** = `[Symbol.iterator]()`; **iterator** = `next() → {value, done}`.
- **Generators** are lazy, pausable, two-way; `break` calls `return()` and runs `finally`.
- **Async generators** + `for await` = streams with backpressure.
- **Symbols**: unique keys and the hooks for language behaviour.
:::
