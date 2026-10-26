---
title: "Core bank: this, call, apply and bind"
level: medium
time: 25
summary: Twelve answers on how this is decided, the four rules and arrow functions, lost this in callbacks, call/apply/bind, new binding and the common interview traps.
---

## How `this` is decided

:::qa How is the value of `this` decided? {level=easy}
**Say this:** "By how the function is called, not where it is written. Order of rules: `new` makes a new object; `call`/`apply`/`bind` set it explicitly; a method call `obj.fn()` uses `obj`; a plain call uses `undefined` in strict mode and the global object in sloppy mode. Arrow functions ignore all of this and use the `this` of their surrounding scope."

**In simple words:** Look at the dot to the left of the call. No dot means no owner.
:::

:::qa What is `this` at the top level? {level=medium}
**Say this:** "In a browser script it is `window`. In an ES module it is `undefined`. In a Node CommonJS file it is `module.exports`, and inside a Node function that is called plainly it is `undefined` in strict mode."

**In simple words:** It depends on what kind of file you are in.
:::

:::qa Why does `const f = obj.method; f()` lose `this`? {level=easy}
**Say this:** "Taking the method out of the object removes the owner. The call `f()` has no dot, so `this` is `undefined` (or global in sloppy mode). Fix with `obj.method.bind(obj)`, an arrow wrapper, or `f.call(obj)`."

**In simple words:** The function was borrowed without its owner.
:::

:::qa How do arrow functions treat `this`? {level=easy}
**Say this:** "They have no `this` of their own. They look it up lexically, like any other variable, from the scope where they are defined. So `call`, `apply` and `bind` cannot change it, and they cannot be used with `new`."

**In simple words:** An arrow function inherits `this` from its parents and cannot be told a new one.
:::

:::qa When should you not use an arrow function? {level=medium}
**Say this:** "For object methods that need `this` to be the object, for constructors, for prototype methods, for functions that need `arguments`, and for event handlers where you want `this` to be the element. Use arrows for callbacks that should keep the outer `this`."

**In simple words:** Methods are for owners; arrows are for helpers inside.
:::

## call, apply, bind

:::qa What is the difference between `call`, `apply` and `bind`? {level=easy}
**Say this:** "`call(thisArg, a, b)` and `apply(thisArg, [a, b])` run the function now, with arguments listed or in an array. `bind(thisArg, a)` does not run; it returns a new function with `this` and some arguments fixed."

**In simple words:** Call now with a list, call now with an array, or call later.
:::

:::qa What happens if you `bind` a function twice? {level=hard}
**Say this:** "The first `bind` wins. A bound function's `this` cannot be changed by another `bind`, `call` or `apply`. Only `new` can override it, and then the bound `this` is ignored."

**In simple words:** Once glued, always glued.
:::

:::qa Why does `setTimeout(obj.method, 0)` break `this`? {level=medium}
**Say this:** "`setTimeout` receives the function value and calls it later without the object, so `this` is the global object or `undefined`. Pass an arrow `() => obj.method()` or `obj.method.bind(obj)`."

**In simple words:** The timer only gets the recipe, not the cook.
:::

:::qa What does `new` do with `this`? {level=medium}
**Say this:** "It creates an empty object linked to `Constructor.prototype`, runs the constructor with `this` set to that object, and returns it, unless the constructor returns another object."

**In simple words:** `new` hands the constructor a blank object and says 'fill this in'.
:::

:::qa Why is `this` inside a nested regular function not the outer object? {level=medium}
**Say this:** "Each regular function gets its own `this` from its own call. A callback inside a method is usually called plainly, so it does not get the method's `this`. Use an arrow function, `bind`, or save `const self = this`."

**In simple words:** The inner helper does not know who the boss is unless you tell it.
:::

:::qa What is `this` inside an event handler? {level=easy}
**Say this:** "For a regular function handler added with `addEventListener`, `this` is the element the listener is attached to (`event.currentTarget`). For an arrow function it is the outer `this`, so use `event.currentTarget` when you need the element."

**In simple words:** The browser calls it as a method of the element.
:::

:::qa How would you borrow a method from another object? {level=medium}
**Say this:** "`Array.prototype.slice.call(arguments)` or `Math.max.apply(null, arr)`. Today use spread and `Array.from`, but method borrowing still shows up in interview questions."

**In simple words:** Lend the function to an object that does not own it.
:::

:::keypoints
- `this` is set **by the call**: `new` > explicit (`call/apply/bind`) > method call > plain call.
- **Arrow functions** capture `this` lexically; nothing can change it.
- Extracted methods **lose** `this`: bind, wrap in an arrow, or use `call`.
- `bind` is permanent (except for `new`).
:::
