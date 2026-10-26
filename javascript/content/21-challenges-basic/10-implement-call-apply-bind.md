---
title: Implement call, apply and bind
level: medium
time: 25
summary: Write call, apply and bind from scratch. Use a temporary symbol key for this, support partial arguments, and make a bound function work with new.
---

:::problem Implement call, apply and bind {level=easy tags="this,functions,bind"}
Write `myCall`, `myApply` and `myBind` **without** using the real `call`, `apply` or `bind`.

- `fn.myCall(ctx, ...args)` calls `fn` with `this = ctx`.
- `fn.myApply(ctx, argsArray)` is the same with an array.
- `fn.myBind(ctx, ...preset)` returns a new function with `this` fixed and some arguments **preset**. Extra arguments are added after the preset ones.
- A bound function used with `new` **ignores** the bound `this` and still builds an instance of the original function.
- Primitive contexts (`5`, `"x"`) are boxed in sloppy mode; `null`/`undefined` become the global object. In this exercise, we use the simple rule: `null`/`undefined` ⇒ `globalThis`.

:::hint Hint
Put the function on the context object under a **unique key** (a Symbol), call it as a method (`ctx[key](...args)`), then delete the key. For `bind`, check `new.target` inside the returned function.
:::
:::

## Solution and tests

```js run title="myCall, myApply and myBind, with tests"
const assert = require("node:assert/strict");
const test = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); } };

function myCall(fn, ctx, ...args) {
  if (typeof fn !== "function") throw new TypeError("not a function");
  ctx = ctx === null || ctx === undefined ? globalThis : Object(ctx);     // box primitives
  const key = Symbol("fn");                                               // a key nobody else can clash with
  ctx[key] = fn;                                                          // now fn is a METHOD of ctx, so this === ctx
  try { return ctx[key](...args); }
  finally { delete ctx[key]; }                                            // clean up even if fn throws
}

function myApply(fn, ctx, args) {
  if (args === undefined || args === null) return myCall(fn, ctx);
  if (typeof args !== "object" && typeof args !== "function") throw new TypeError("CreateListFromArrayLike called on non-object");
  return myCall(fn, ctx, ...Array.from(args));                            // arrays and array-likes
}

function myBind(fn, ctx, ...preset) {
  if (typeof fn !== "function") throw new TypeError("Bind must be called on a function");
  function bound(...args) {
    if (new.target) return new fn(...preset, ...args);                    // called with new: ignore ctx, build an instance
    return myCall(fn, ctx, ...preset, ...args);
  }
  if (fn.prototype) bound.prototype = Object.create(fn.prototype);        // so instanceof works for both
  return bound;
}

// To use them as methods in your own code:
// Function.prototype.myCall = function (ctx, ...a) { return myCall(this, ctx, ...a); }  (and the same for the others)

// ---------------- tests ----------------
function greet(greeting, punctuation) { return `${greeting}, ${this.name}${punctuation}`; }
const asha = { name: "Asha" };

test("myCall sets this and passes arguments", () => assert.equal(myCall(greet, asha, "Hello", "!"), "Hello, Asha!"));
test("myApply takes an array", () => assert.equal(myApply(greet, asha, ["Hi", "?"]), "Hi, Asha?"));
test("myApply with no args", () => assert.equal(myApply(function () { return this.name; }, asha), "Asha"));
test("myApply accepts array-likes", () => assert.equal(myApply(Math.max, null, { length: 3, 0: 4, 1: 9, 2: 2 }), 9));

test("the temporary key is removed", () => {
  const ctx = { name: "x" };
  myCall(greet, ctx, "a", "b");
  assert.deepEqual(Reflect.ownKeys(ctx), ["name"]);
});

test("the temporary key is removed even if fn throws", () => {
  const ctx = {};
  assert.throws(() => myCall(function () { throw new Error("boom"); }, ctx), /boom/);
  assert.deepEqual(Reflect.ownKeys(ctx), []);
});

test("null context uses globalThis", () => {
  globalThis.marker = "global!";
  assert.equal(myCall(function () { return this.marker; }, null), "global!");
  delete globalThis.marker;
});

test("primitives are boxed", () => assert.equal(myCall(function () { return typeof this; }, 5), "object"));

test("myBind fixes this and presets arguments", () => {
  const hello = myBind(greet, asha, "Hello");
  assert.equal(hello("!"), "Hello, Asha!");
  assert.equal(hello("?"), "Hello, Asha?");
});

test("a bound function cannot be re-bound to another this", () => {
  const once = myBind(function () { return this.name; }, { name: "first" });
  assert.equal(myCall(once, { name: "second" }), "first");
});

test("new on a bound function ignores the bound this", () => {
  function Point(x, y) { this.x = x; this.y = y; }
  const BoundPoint = myBind(Point, { ignored: true }, 1);
  const p = new BoundPoint(2);
  assert.equal(p.x, 1);
  assert.equal(p.y, 2);
  assert.ok(p instanceof Point);
  assert.equal(p.ignored, undefined);
});

test("an arrow function ignores the context completely", () => {
  const arrow = () => typeof this;
  assert.equal(myCall(arrow, { a: 1 }), arrow());
});

test("a frozen context breaks the Symbol trick", () => {
  assert.throws(() => myCall(function () { return 1; }, Object.freeze({})), TypeError);   // cannot add the key (strict mode)
});
```

## Things to say out loud

- The whole trick: **calling a function as a method sets `this` to the object**. `ctx[key](...)` is just `ctx.fn(...)`.
- A **Symbol** key cannot collide with a real property, and `delete` in `finally` leaves no trace.
- The **frozen-object** weakness is real: the real `call` does not need to add a property. A cleaner way is `Reflect.apply(fn, ctx, args)`, but that is "cheating" in an interview that says no `call`/`apply`.
- `bind` creates a function whose `this` cannot be changed again, except through `new`.

:::qa What is the difference between `call`, `apply` and `bind`? {level=easy}
**Say this:** "`call` and `apply` run the function now; `call` takes arguments one by one, `apply` takes an array. `bind` does not run it: it returns a new function with `this` (and maybe some arguments) fixed."

**In simple words:** Call now with a list, call now with an array, or call later.
:::

:::qa Why can't an arrow function be given a different `this` with `call` or `bind`? {level=medium}
**Say this:** "An arrow function has no `this` of its own; it uses the `this` of the place where it was written. `call`, `apply` and `bind` only set the function's own `this`, which an arrow does not have, so they only pass arguments."

**In simple words:** It borrows `this` from outside and cannot be lent a new one.
:::

:::qa What happens when you use `new` on a bound function? {level=hard}
**Say this:** "The bound `this` is ignored. `new` creates a fresh object and runs the **original** function on it, with the preset arguments first. The result is an instance of the original constructor."

**In simple words:** `new` wins over `bind`.
:::

:::keypoints
- `call` = make the function a **method** of the context for one call (Symbol key, delete in `finally`).
- `apply` = same with an **array / array-like**; `bind` = a **closure** with preset arguments.
- Bound function + **`new`** ⇒ ignore the bound `this`; keep the **prototype chain**.
- Arrow functions ignore all three for `this`.
:::
