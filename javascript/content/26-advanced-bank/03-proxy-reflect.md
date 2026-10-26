---
title: "Advanced bank: Proxy, Reflect and metaprogramming"
level: hard
time: 20
summary: Ten answers on what Proxy traps can do, the role of Reflect, validation and reactivity examples, invariants, performance and the limits of proxies.
---

:::qa What is a `Proxy`? {level=medium}
**Say this:** "An object that wraps another object (the target) and intercepts operations on it, such as `get`, `set`, `has`, `deleteProperty`, `ownKeys` and function calls through a handler of traps. Operations without a trap go to the target."

**In simple words:** A receptionist who decides what to do with every request before it reaches the manager.
:::

:::qa What is `Reflect` and why is it used inside traps? {level=medium}
**Say this:** "`Reflect` has functions for the default object operations (`Reflect.get`, `set`, `has`, `ownKeys`...). In a trap, calling `Reflect.get(target, key, receiver)` performs the normal behaviour with the correct `this` (the receiver, which is the proxy), and `Reflect.set` returns a boolean as the `set` trap must."

**In simple words:** The proper way to say 'do what you normally do' from inside a trap.
:::

:::qa Give practical uses of Proxy. {level=medium}
**Say this:** "Reactivity (Vue 3 tracks reads and writes), validation on assignment, default values for missing keys, logging and debugging, negative array indices, API clients (`api.users.get()` building URLs from property names), read-only views, and lazy loading."

**In simple words:** Anything where you want to react whenever someone touches an object.
:::

:::qa How would you validate values on assignment with a Proxy? {level=medium}
**Say this:** "Use a `set` trap that checks `key` and `value`, throws (or returns `false`, which throws in strict mode) for invalid input, and otherwise calls `Reflect.set`. For example, an `age` that must be a non-negative integer."

**In simple words:** The receptionist checks the form before putting it in the file.
:::

:::qa Why must the `set` trap return `true`? {level=hard}
**Say this:** "It reports success. In strict mode, returning a falsy value makes the assignment throw a `TypeError`. Forgetting the return (`undefined`) is a common bug that makes every assignment fail."

**In simple words:** The trap must say 'done' for the write to count.
:::

:::qa What are Proxy invariants? {level=hard}
**Say this:** "Rules that stop a proxy from lying about the target's fixed facts. For example, a non-configurable, non-writable property must report its real value; `ownKeys` must include non-configurable keys; a non-extensible target cannot report new keys. Violations throw a `TypeError`."

**In simple words:** The receptionist can bend things, but cannot deny facts that are locked in.
:::

:::qa How do Proxies and arrays or classes with private fields interact? {level=hard}
**Say this:** "A proxy of an array keeps `Array.isArray` true and works with methods through its traps. A proxy around a class instance with `#private` fields breaks method calls, because private fields live on the real object, not on the proxy: `this` is the proxy when you call through it. Bind methods to the target in the `get` trap."

**In simple words:** The private room can only be opened by the real person, not the receptionist.
:::

:::qa Proxy versus `Object.defineProperty` for reactivity? {level=hard}
**Say this:** "`defineProperty` must be set on each existing property up front, so it misses new keys, deletions and array index changes (Vue 2 needed `Vue.set`). A Proxy intercepts everything on the object, including new keys, `delete`, `in` and iteration, and can wrap nested objects lazily."

**In simple words:** One catches known doors; the other watches the whole house.
:::

:::qa Is Proxy slow? {level=medium}
**Say this:** "Each intercepted operation costs more than a plain access, and engines cannot optimise through the proxy as well. It is fine for configuration, state and development tools; avoid it in tight loops over large data."

**In simple words:** The receptionist adds a little time to every request.
:::

:::qa Can you polyfill Proxy? {level=medium}
**Say this:** "Not fully. The traps for property addition, deletion and `in` cannot be emulated with older features, which is why Vue 3 dropped support for old browsers that lack Proxy."

**In simple words:** It needs help from the engine itself.
:::

:::keypoints
- **Proxy = target + handler of traps**; **Reflect** = the default behaviour inside traps.
- `set` must return **true**; respect **invariants**.
- Great for **reactivity, validation, debugging, API builders**; mind private fields and performance.
- Proxy sees **new keys and deletes**; `defineProperty` does not.
:::
