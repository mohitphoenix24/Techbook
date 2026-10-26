---
title: "Core bank: modern JavaScript (ES6 and later)"
level: medium
time: 25
summary: Twelve answers on destructuring, template literals, modules, optional chaining, nullish coalescing, newer array and object helpers, Symbols, iterators, WeakMap and WeakRef.
---

:::qa Name the ES6 features you use daily. {level=easy}
**Say this:** "`let`/`const`, arrow functions, template literals, destructuring, default and rest parameters, spread, classes, modules, `Map`/`Set`, Promises, iterators and generators, `Symbol`, and shorthand object syntax."

**In simple words:** Less boilerplate and safer scoping.
:::

:::qa How does destructuring work, with defaults and renaming? {level=easy}
**Say this:** "`const { name, age = 18, address: { city } } = user;` pulls values out of objects by key; `const [first, , third = 0] = arr;` pulls from iterables by position. `{ a: renamed }` renames; defaults apply only for `undefined`. Destructuring `null` or `undefined` throws."

**In simple words:** Unpack a parcel into named variables in one line.
:::

:::qa What are optional chaining and nullish coalescing? {level=easy}
**Say this:** "`a?.b.c` stops and returns `undefined` if `a` is `null` or `undefined`; it also works as `a?.[key]` and `fn?.()`. `a ?? b` uses `b` only for `null` or `undefined`. Together: `user?.profile?.name ?? 'Guest'`."

**In simple words:** Ask politely before going deeper, and give a default only for 'nothing'.
:::

:::qa What are template literals and tagged templates? {level=medium}
**Say this:** "Backtick strings with `${expression}` interpolation and multi-line support. A tag function (`html`\`<p>${x}</p>\``) receives the string parts and values separately, so it can escape values, which is how styled-components and lit-html work."

**In simple words:** Strings with holes, and a hook to process the holes.
:::

:::qa ES modules versus CommonJS? {level=medium}
**Say this:** "ESM uses `import`/`export`, is static (analysable, tree-shakable), asynchronous to load, strict by default, exports live bindings and supports top-level `await`. CommonJS uses `require`/`module.exports`, is dynamic and synchronous, and exports values (copies of primitives)."

**In simple words:** ESM plans the whole trip first; CommonJS decides step by step.
:::

:::qa What is tree shaking? {level=medium}
**Say this:** "Removing unused exports from the final bundle. It works because ES module imports are static, so the bundler can see what is used. Side-effect-free code (`"sideEffects": false`) and named exports help; `require` and dynamic patterns defeat it."

**In simple words:** Shake the tree, and the dead leaves fall off.
:::

:::qa What is a `Symbol` and where is it used? {level=medium}
**Say this:** "A unique, immutable primitive, often used as a property key that cannot clash. Well-known symbols customise behaviour: `Symbol.iterator` (for-of), `Symbol.asyncIterator`, `Symbol.toPrimitive`, `Symbol.hasInstance`, `Symbol.toStringTag`."

**In simple words:** A name tag that nobody else can copy.
:::

:::qa What are iterators and iterables? {level=medium}
**Say this:** "An iterator has `next()` returning `{ value, done }`. An iterable has `[Symbol.iterator]()` returning an iterator. `for...of`, spread, destructuring and `Array.from` consume iterables. Generators are the easy way to write iterators."

**In simple words:** An iterable is a playlist; the iterator is the play button.
:::

:::qa What are `WeakMap`, `WeakSet` and `WeakRef` for? {level=hard}
**Say this:** "`WeakMap`/`WeakSet` hold their keys weakly: if nothing else references the key object, it can be garbage collected, so they are good for attaching private data or caches to objects without leaks. They are not iterable. `WeakRef` gives a reference that does not keep the object alive; use it rarely."

**In simple words:** They remember things only as long as the thing still exists elsewhere.
:::

:::qa Which newer array and object helpers are worth knowing? {level=medium}
**Say this:** "`at(-1)`, `flat`/`flatMap`, `Object.entries`/`fromEntries`, `Object.hasOwn`, `structuredClone`, `Array.prototype.findLast`, the non-mutating `toSorted`, `toReversed`, `toSpliced`, `with`, and `Object.groupBy` / `Map.groupBy` in current runtimes. Check the support table before shipping."

**In simple words:** Small helpers that remove common loops and avoid mutating the original array.
:::

:::qa What are logical assignment operators and numeric separators? {level=easy}
**Say this:** "`a ||= b`, `a &&= b` and `a ??= b` assign only when the condition holds (`a ??= 5` sets a default only if `a` is nullish). Numeric separators make literals readable: `1_000_000`."

**In simple words:** Short forms for 'set this if it is empty'.
:::

:::qa What is top-level `await`? {level=medium}
**Say this:** "In ES modules you can use `await` outside a function, so a module can wait for async setup (config, a database connection). Modules that import it wait too, so use it carefully to avoid slowing start-up."

**In simple words:** The module itself can wait, and its importers wait with it.
:::

:::keypoints
- Destructuring defaults → only for `undefined`; `?.` and `??` for safe reads and defaults.
- **ESM** is static and live; **CJS** is dynamic and synchronous.
- `Symbol.iterator` powers `for...of`, spread and destructuring.
- **Weak** collections never block garbage collection.
:::
