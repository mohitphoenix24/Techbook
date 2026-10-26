---
title: "Core bank: closures"
level: medium
time: 25
summary: Twelve answers on what a closure is, what it is used for, loops, memory, private state, stale closures in React and the classic follow-up questions.
---

## The idea

:::qa What is a closure? {level=easy}
**Say this:** "A closure is a function together with the variables from the scope where it was created. The function keeps access to those variables even after the outer function has returned."

**In simple words:** A function carries a backpack with the things it needs from the place where it was born.
:::

:::qa Give a real use of closures. {level=easy}
**Say this:** "Private state, for example a counter or a cache that no outside code can touch. Others are callbacks and event handlers that remember data, `once`, `memoize`, `debounce`, currying, and the module pattern."

**In simple words:** The data lives inside the backpack, and only the returned functions can open it.
:::

:::qa Does a closure capture the value or the variable? {level=medium}
**Say this:** "The variable, not a copy of its value. If the variable changes later, the closure sees the new value. That is why all callbacks in a `var` loop print the final number."

**In simple words:** The backpack holds the actual box, not a photograph of what was inside.
:::

:::qa How do closures behave in loops? {level=medium}
**Say this:** "With `var`, all closures share one variable. With `let`, each iteration has its own binding, so each closure sees its own value. For `var` code, create a new scope per iteration (an IIFE or a helper function)."

**In simple words:** `let` gives every turn of the loop a fresh box.
:::

:::qa How do you create private variables in JavaScript? {level=easy}
**Say this:** "Three ways: a closure (a factory function returning methods), ES2022 private fields (`#count` in a class), or a `WeakMap` keyed by the instance. The `_name` convention is only a hint and gives no protection."

**In simple words:** Hide the value inside a function, or use `#` which the language itself enforces.
:::

:::qa Can closures cause memory leaks? {level=hard}
**Say this:** "A closure keeps its captured variables alive as long as the closure itself is reachable. If a long-lived object (a global, a cache, a DOM listener) holds a closure that captured something big, that big thing is never freed. Remove listeners, clear timers, and avoid capturing large objects you do not need."

**In simple words:** If someone keeps your backpack forever, everything in it stays forever.
:::

:::qa What is the "module pattern"? {level=medium}
**Say this:** "An IIFE or factory that returns a public API object while its variables stay private in the closure. ES modules replaced it: top-level variables of a module are private unless exported."

**In simple words:** Show the shop window, keep the stock room locked.
:::

## Trickier questions

:::qa What is a stale closure? Where do you see it? {level=hard}
**Say this:** "A function that kept an old value of a variable. In React, an effect or a timer created in one render closes over that render's `state`. If the dependency array is missing the variable, the callback keeps using the old value. Fix with the right dependencies, the functional form `setX(x => x + 1)`, or a ref for the latest value."

**In simple words:** The function is still reading yesterday's newspaper.
:::

:::qa Write a counter with no global variable. {level=easy}
**Say this:** "`function makeCounter() { let n = 0; return { inc: () => ++n, get: () => n }; }`. Every call of `makeCounter` makes a separate `n`, so two counters never interfere."

**In simple words:** A function that makes a small machine with its own memory.
:::

:::qa What is the difference between scope and closure? {level=medium}
**Say this:** "Scope is the rule about which variables are visible where. A closure is what you get when a function remembers its scope after the outside code has finished. Every function has a scope chain, but we talk about a closure when the inner function outlives the outer call."

**In simple words:** Scope is the map; a closure is a traveller who carries the map away.
:::

:::qa Do V8 closures keep every variable of the outer function alive? {level=hard}
**Say this:** "V8 keeps only the variables that inner functions actually use, in a shared context object. But all closures created in the same scope share that context, so if one closure uses a big variable, another closure from the same scope also keeps it alive. A direct `eval` makes the engine keep everything."

**In simple words:** The backpack is shared between all functions born in the same place.
:::

:::qa Implement `once(fn)` with a closure. {level=easy}
**Say this:** "`const once = (fn) => { let done = false, result; return (...a) => done ? result : (done = true, result = fn(...a)); };`. The flag and the result live in the closure."

**In simple words:** The function remembers that it already ran.
:::

:::keypoints
- A closure = **function + the variables it remembers**.
- It captures the **variable**, not the value; `let` per iteration fixes loop bugs.
- Uses: **private state, callbacks, once/memoize/debounce, currying, modules**.
- Leaks happen when a long-lived owner keeps the closure; **stale closures** are a React classic.
:::
