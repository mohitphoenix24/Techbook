---
title: Functions are first-class values
level: easy
time: 20
summary: What "first-class" means (assign, pass, return, store functions), functions as objects with properties, callbacks and higher-order functions, and why this makes JavaScript flexible.
---

## What does "first-class" mean?

> "A **first-class function** is a function that is treated like any other value: a number, a string or an object."

You can do with a function everything you can do with a number:

| You can... | Example |
|---|---|
| **Assign** it to a variable | `const add = function (a, b) { return a + b; }` |
| **Pass** it as an argument | `[1, 2, 3].map(double)` |
| **Return** it from a function | `function makeAdder(n) { return (x) => x + n; }` |
| **Store** it in a data structure | `{ onClick: handler }`, `[fn1, fn2]` |
| Give it **properties** | `fn.count = 0` |

This one idea explains callbacks, closures, array methods, promises, middleware, React hooks and most of modern JavaScript.

```js run title="Assign, store, pass and return functions"
// 1. assign to a variable
const square = (n) => n * n;

// 2. store in an object and an array
const operations = { square, cube: (n) => n ** 3 };
const pipeline = [square, (n) => n + 1, String];

// 3. pass as an argument
function applyTwice(fn, value) { return fn(fn(value)); }
console.log(applyTwice(square, 3));

// 4. return from a function
function multiplier(factor) { return (n) => n * factor; }
const triple = multiplier(3);
console.log(triple(5), operations.cube(2));

// run a "pipeline" of stored functions
console.log(pipeline.reduce((acc, fn) => fn(acc), 4));
```

## Functions are objects

A function is a special kind of **object**. It can have properties, and it inherits from `Function.prototype` (that is where `call`, `apply` and `bind` come from).

```js run title="Functions have properties"
function greet(name, greeting = "Hello") {
  greet.calls = (greet.calls || 0) + 1;       // storing state on the function itself
  return `${greeting}, ${name}`;
}

greet("Asha");
greet("Ravi");

console.log(greet.name);        // "greet"
console.log(greet.length);      // 1: parameters before the first default value
console.log(greet.calls);       // 2
console.log(typeof greet, greet instanceof Object);
console.log(Object.getPrototypeOf(greet) === Function.prototype);
```

`fn.length` is the number of **expected parameters** (not counting rest parameters and those from the first default value). Libraries use it to see how many arguments a callback wants (this is how some currying helpers work).

## Callbacks

A **callback** is a function you give to another function, to be called **later** (or for each item).

```js run title="Synchronous and asynchronous callbacks"
// synchronous: called during the loop
[10, 20, 30].forEach((n, i) => console.log(`item ${i} = ${n}`));

// asynchronous: called later
function fetchPrice(item, done) {
  setTimeout(() => done(item.length * 10), 20);   // pretend this is a network call
}

fetchPrice("pen", (price) => console.log("price of pen:", price));
console.log("this prints first, because the callback is later");
```

## Higher-order functions

A **higher-order function (HOF)** is a function that **takes** a function, or **returns** one (or both). `map`, `filter`, `reduce`, `setTimeout`, `addEventListener` and `Promise.then` are all higher-order.

```js run title="Writing your own higher-order functions"
// takes a function
function repeat(times, action) {
  for (let i = 0; i < times; i++) action(i);
}
repeat(3, (i) => console.log("round", i));

// returns a function
function greaterThan(limit) {
  return (n) => n > limit;
}
const isAdult = greaterThan(17);
console.log([12, 18, 30, 7].filter(isAdult));

// takes and returns a function
function once(fn) {
  let done = false, value;
  return (...args) => (done ? value : ((done = true), (value = fn(...args))));
}
const init = once(() => { console.log("setup!"); return 99; });
console.log(init(), init());
```

## Why is this powerful?

1. **Reuse:** one `filter` works with any rule.
2. **Behaviour as data:** you can store, send and choose behaviour at run time (strategy pattern, event handlers, route tables).
3. **Composition:** small functions combine into big ones (next lessons).
4. **Callbacks and async:** a function can be handed to something that will call it later.

```js run title="A route table: behaviour stored as data"
const routes = {
  "/home": () => "Home page",
  "/about": () => "About us",
  "/contact": () => "Call us",
};

function handle(path) {
  const handler = routes[path] ?? (() => "404 not found");
  return handler();
}

console.log(handle("/about"), "|", handle("/missing"));
```

## Function as an object: a few useful things

```js run title="Functions that carry data"
function counter() { return ++counter.count; }
counter.count = 0;
counter(); counter();
console.log(counter.count);

// Function constructor (avoid it: like eval, it is slow and unsafe)
const add = new Function("a", "b", "return a + b");
console.log(add(2, 3));
```

:::tip Naming
`const double = (n) => n * 2` gives the function the name `"double"` (inferred from the variable). Names help in stack traces. Anonymous inline callbacks show up as `anonymous` in error messages, so name important ones.
:::

:::interview What does it mean that functions are first-class citizens in JavaScript?
"It means functions are values like any other. I can assign them to variables, pass them as arguments, return them from other functions, store them in arrays and objects, and even attach properties to them, because a function is an object. This enables callbacks, higher-order functions like map and filter, closures, currying and composition, and patterns such as strategy or middleware, where behaviour is passed around as data."
:::

## More interview questions on this topic

:::qa What is a higher-order function? Give examples. {level=easy}
**Say this:** "A function that takes a function as an argument or returns a function. Examples: `map`, `filter`, `reduce`, `setTimeout`, `addEventListener`, and my own `once`, `debounce` and `multiplier`."

**In simple words:** It works with other functions as if they were data.
:::

:::qa What is a callback? {level=easy}
**Say this:** "A function passed to another function to be called later, either for each item (synchronous) or when something finishes (asynchronous)."

**In simple words:** "Call me back when you are ready."
:::

:::qa What does `fn.length` return? {level=medium}
**Say this:** "The number of declared parameters before the first default value or rest parameter."

**In simple words:** How many arguments the function expects at minimum.
:::

:::qa Why can a function have properties? {level=medium}
**Say this:** "Because a function is an object. It can hold properties, and it inherits `call`, `apply`, `bind` from `Function.prototype`."

**In simple words:** A function is a callable object.
:::

```quiz
? Which is NOT something you can do with a function in JavaScript?
- Pass it as an argument
- Return it from another function
+ Nothing: all of these are allowed
> Functions are first-class values.
? What does `[1, 2, 3].map((n) => n * 2)` do with the arrow function?
- Calls it once with the whole array
+ Calls it for each item: it is a callback
- Stores it in the array
> map is a higher-order function.
? What is `((a, b = 2, c) => {}).length`?
- 3
- 2
+ 1
> Only parameters before the first default value count.
```

:::keypoints
- **First-class**: functions are values: assign, pass, return, store, give properties.
- A function is an **object** (callable) inheriting from `Function.prototype`.
- **Callback** = function given to be called later. **Higher-order function** = takes or returns a function.
- This is the base of closures, composition, currying, array methods and async code.
:::
