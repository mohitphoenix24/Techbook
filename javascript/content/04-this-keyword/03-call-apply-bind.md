---
title: call, apply and bind
level: intermediate
time: 30
summary: How to choose this yourself. The differences between call, apply and bind, borrowing methods, partial application with bind, and how to write your own versions (a favourite interview task).
---

## Choosing `this` yourself

Every function has three helper methods that let you **set `this` by hand**.

| Method | What it does | How you pass arguments |
|---|---|---|
| `fn.call(thisArg, a, b)` | **Calls** `fn` now | one by one |
| `fn.apply(thisArg, [a, b])` | **Calls** `fn` now | in an **array** |
| `fn.bind(thisArg, a, b)` | **Returns a new function**, does not call yet | one by one (can be pre-filled) |

Memory trick: **A**pply takes an **A**rray. **C**all takes **C**ommas. **B**ind **B**rings back a new function.

```js run title="call, apply and bind side by side"
function describe(greeting, punctuation) {
  return `${greeting}, I am ${this.name}${punctuation}`;
}

const asha = { name: "Asha" };

console.log(describe.call(asha, "Hello", "!"));
console.log(describe.apply(asha, ["Namaste", "."]));

const boundForAsha = describe.bind(asha, "Hi");   // this and the first argument are fixed
console.log(boundForAsha("?"));                    // the second argument comes later
```

## What `bind` really gives you

```js run title="bind makes a new function. It does not change the old one"
function show() { return this && this.id; }

const bound = show.bind({ id: 7 });

console.log(bound());                    // 7
console.log(show());                     // undefined: the original is untouched
console.log(bound === show);             // false
console.log(bound.name);                 // "bound show"
```

A bound function:

- has **`this` fixed forever** (call, apply and another bind cannot change it);
- can have **leading arguments pre-filled** (partial application);
- does **not** have a `prototype` property, and works with `new` (the bound `this` is then ignored).

## Borrowing methods

You can use a method of one object on another object that has the "right shape".

```js run title="Borrow a method"
const arrayLike = { 0: "a", 1: "b", 2: "c", length: 3 };

// arrayLike has no .map or .join, but Array.prototype does
console.log(Array.prototype.map.call(arrayLike, (x) => x.toUpperCase()));
console.log(Array.prototype.join.call(arrayLike, "-"));

// Array.from is simpler today
console.log(Array.from(arrayLike));
```

Old code often wrote `Array.prototype.slice.call(arguments)` to turn `arguments` into a real array. Now you would write `[...arguments]` or use rest parameters `(...args)`.

## A classic use of `apply`

```js run title="Math.max with an array"
const marks = [67, 91, 54, 88];

console.log(Math.max.apply(null, marks));   // old style
console.log(Math.max(...marks));            // today: spread
```

`apply` was the way to spread an array into arguments before the spread operator existed. (For arrays with more than about 100,000 items, both can fail with a RangeError: use `reduce` for huge arrays.)

## `null` as thisArg

For functions that do not use `this`, pass `null` or `undefined`:

```js run title="When this does not matter"
function add(a, b) { return a + b; }
console.log(add.call(null, 2, 3));
console.log(add.apply(null, [2, 3]));
console.log(add.bind(null, 2)(3));
```

In sloppy mode, `null`/`undefined` for `this` is replaced by the global object, and primitives are **boxed** (a number becomes a `Number` object). In strict mode they stay as they are.

```js run title="Primitives as this: sloppy vs strict"
function typeOfThis() { return typeof this; }
console.log(typeOfThis.call(5));            // strict mode here: "number"
```

```js run sloppy title="Primitives as this: sloppy"
function typeOfThis() { return typeof this; }
console.log(typeOfThis.call(5));            // sloppy mode: boxed to an object
```

## Partial application with `bind`

```js run title="Pre-fill arguments"
function volume(length, width, height) {
  return length * width * height;
}

const volumeWithBase10x5 = volume.bind(null, 10, 5);
console.log(volumeWithBase10x5(2));
console.log(volumeWithBase10x5(8));
```

## Writing your own `call`, `apply` and `bind`

This is a very common interview task. The trick: **put the function on the object as a temporary method, call it with the dot, and remove it.** The dot rule gives `this = obj`.

```js run title="myCall and myApply"
Function.prototype.myCall = function (context, ...args) {
  context = context === null || context === undefined ? globalThis : Object(context);
  const key = Symbol("fn");                 // a unique key, so we never clash with real properties
  context[key] = this;                      // `this` here is the function we are calling
  const result = context[key](...args);     // called as a method: this = context
  delete context[key];
  return result;
};

Function.prototype.myApply = function (context, args = []) {
  return this.myCall(context, ...args);
};

function sum(a, b) { return this.base + a + b; }
console.log(sum.myCall({ base: 100 }, 1, 2));
console.log(sum.myApply({ base: 200 }, [3, 4]));
```

```js run title="myBind (with partial arguments and new support)"
Function.prototype.myBind = function (context, ...boundArgs) {
  const fn = this;
  function bound(...callArgs) {
    // when called with `new`, this is an instance of bound: ignore the bound context
    const self = this instanceof bound ? this : context;
    return fn.apply(self, [...boundArgs, ...callArgs]);
  }
  bound.prototype = Object.create(fn.prototype);   // so `new bound()` is still an instance of fn
  return bound;
};

function Point(x, y) { this.x = x; this.y = y; }

const YAxisPoint = Point.myBind(null, 0);
const p = new YAxisPoint(5);
console.log(p, p instanceof Point);

function hello(greeting) { return greeting + ", " + this.name; }
console.log(hello.myBind({ name: "Meera" }, "Hello")());
```

You will meet these again in the [coding challenges](#/problems) with more edge cases.

:::interview What is the difference between call, apply and bind?
"All three set `this` explicitly. `call` invokes the function immediately with arguments passed one by one. `apply` invokes it immediately with the arguments as an array. `bind` does not invoke: it returns a new function with `this` fixed permanently and optionally some leading arguments pre-filled. A bound function ignores later call, apply or bind, but `new` still overrides it."
:::

## More interview questions on this topic

:::qa Which of call, apply and bind runs the function immediately? {level=easy}
**Say this:** "`call` and `apply` run it now. `bind` returns a new function to run later."

**In simple words:** Call and apply "do it". Bind "prepares it".
:::

:::qa Can you bind a function twice, or call a bound function with another this? {level=medium}
**Say this:** "No. The first bind wins. Later `bind`, `call` and `apply` cannot change the bound `this`."

**In simple words:** The first glue is permanent.
:::

:::qa How do you implement bind? {level=medium}
**Say this:** "Return a function that calls the original with `apply`, using the saved context and the pre-filled arguments followed by the new ones. For `new`, check `this instanceof bound` and use the new object instead."

**In simple words:** A closure that remembers the function, the object and the first arguments.
:::

:::qa Why use `Symbol` as the temporary key when writing call? {level=hard}
**Say this:** "A symbol is unique, so the temporary property cannot overwrite or clash with an existing property on the context object."

**In simple words:** If you used a string like "fn", you might replace a real property that has that name.
:::

```quiz
? Which method returns a new function instead of calling the original?
- call
- apply
+ bind
> bind prepares a function with a fixed this.
? How do you pass arguments to apply?
- One by one
+ As a single array
- You cannot pass arguments
> apply takes an array (or array-like) of arguments.
? What does `Math.max.apply(null, [1, 5, 3])` return?
- 3
+ 5
- NaN
> It spreads the array as arguments: Math.max(1, 5, 3).
```

:::keypoints
- `call(this, a, b)` and `apply(this, [a, b])` **invoke now**. `bind(this, a)` **returns** a new function.
- A bound function's `this` is **permanent**; only `new` overrides it.
- `bind` also does **partial application**.
- Borrow array methods for array-likes with `Array.prototype.x.call(...)`.
- To write `call`: put the function on the object under a unique key, call it as a method, delete the key.
:::
