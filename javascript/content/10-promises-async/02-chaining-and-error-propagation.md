---
title: Promise chaining and error propagation
level: intermediate
time: 30
summary: How each then returns a new promise, what happens when you return a value, a promise or throw, how errors skip ahead to catch, how catch can recover, and the chain mistakes seen in code reviews.
---

## Every `then` returns a new promise

This is the key to chaining. What your callback **returns** decides what the **next** promise becomes.

| Your `then` callback... | The next promise... |
|---|---|
| returns a **value** | fulfils with that value |
| returns a **promise** | **follows** that promise (waits for it) |
| returns **nothing** | fulfils with `undefined` |
| **throws** | **rejects** with the error |

```js run title="Return values flow down the chain"
Promise.resolve(2)
  .then((n) => n * 10)                         // returns a value: 20
  .then((n) => new Promise((r) => setTimeout(() => r(n + 1), 20)))   // returns a promise: waits, then 21
  .then((n) => { console.log("got", n); })     // returns nothing
  .then((v) => console.log("next value is", v));
```

## Error propagation: errors skip to the nearest catch

If a promise is **rejected**, all the following `.then(onFulfilled)` handlers are **skipped**, until a handler for rejection (`.catch` or the second argument of `then`) is found.

```js run title="A rejection jumps to the catch"
Promise.resolve("start")
  .then((v) => { console.log("step 1:", v); throw new Error("step 2 failed"); })
  .then(() => console.log("step 3 is skipped"))
  .then(() => console.log("step 4 is skipped"))
  .catch((e) => console.log("caught:", e.message))
  .then(() => console.log("the chain continues after catch"));
```

After `.catch` returns normally, the chain is **fulfilled again**. A `catch` can **recover** by returning a fallback value:

```js run title="catch can recover with a fallback"
const fetchUser = () => Promise.reject(new Error("network down"));

fetchUser()
  .catch((e) => {
    console.log("using cached user because:", e.message);
    return { name: "cached user" };                       // recover
  })
  .then((user) => console.log("user:", user.name));
```

To **pass the error along** after logging, re-throw:

```js run title="Log and re-throw"
Promise.reject(new Error("db error"))
  .catch((e) => {
    console.log("log:", e.message);
    throw e;                                              // let the caller handle it as well
  })
  .catch((e) => console.log("caller sees:", e.message));
```

## `finally` for cleanup

```js run title="finally passes the result through"
Promise.resolve("data")
  .finally(() => console.log("cleanup runs (no argument)"))
  .then((v) => console.log("value still arrives:", v));

Promise.reject(new Error("bad"))
  .finally(() => console.log("cleanup runs on failure too"))
  .catch((e) => console.log("error still arrives:", e.message));
```

## `.then(a, b)` vs `.then(a).catch(b)`

```js run title="Where does the error go?"
Promise.resolve(1)
  .then(
    () => { throw new Error("thrown in the success handler"); },
    (e) => console.log("second argument: not called for errors thrown above")
  )
  .catch((e) => console.log("catch got:", e.message));
```

The second argument of `then` handles rejections of the **previous** promise only. Prefer a separate `.catch` at the end of the chain.

## Where errors are thrown synchronously

Inside `then`, `catch` and the executor, exceptions are turned into rejections. But **code outside** (for example, a function that throws before it returns a promise) throws normally:

```js run title="A function that returns a promise should not also throw"
function getUser(id) {
  if (typeof id !== "number") throw new TypeError("id must be a number");      // sync throw!
  return Promise.resolve({ id });
}

try {
  getUser("x").catch(() => console.log("this catch never runs"));
} catch (e) {
  console.log("caught synchronously instead:", e.message);
}

// Safer: an async function always returns a promise, even for validation errors
async function getUserSafe(id) {
  if (typeof id !== "number") throw new TypeError("id must be a number");
  return { id };
}
getUserSafe("x").catch((e) => console.log("rejected promise:", e.message));
```

## Common chain mistakes

### 1. Forgetting to `return` the inner promise

```js run title="Forgot return: the chain does not wait"
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

wait(10, "A")
  .then((a) => { wait(30, a + "B"); })                    // missing return!
  .then((b) => console.log("without return:", b));        // runs immediately with undefined

wait(10, "A")
  .then((a) => wait(30, a + "B"))                         // returned: the chain waits
  .then((b) => console.log("with return:", b));
```

### 2. Nesting instead of chaining (the "promise pyramid")

```js run title="Flat is better than nested"
const step = (n) => Promise.resolve(n + 1);

// nested (callback hell again)
step(0).then((a) => step(a).then((b) => step(b).then((c) => console.log("nested:", c))));

// flat
step(0).then(step).then(step).then((c) => console.log("flat:", c));
```

### 3. Not returning from `catch`, then using the value

```js run title="After catch, the value is whatever catch returned"
Promise.reject(new Error("x"))
  .catch((e) => { console.log("handled"); })              // returns undefined
  .then((v) => console.log("value after catch:", v));
```

### 4. The "explicit construction" anti-pattern

Do not wrap something that is already a promise in `new Promise`:

```js run title="Needless new Promise"
const getData = () => Promise.resolve("data");

// BAD: pointless wrapper, and errors can be lost
const bad = () => new Promise((resolve) => getData().then(resolve));

// GOOD
const good = () => getData();

bad().then((v) => console.log("bad:", v));
good().then((v) => console.log("good:", v));
```

## Unhandled rejections

A rejected promise with **no handler** is an **unhandled rejection**. In browsers it fires `unhandledrejection` on `window`. In **Node 15+** it **crashes the process** by default (exit code 1). Always end a chain with a `.catch`, or use `try/catch` with `await`.

```js run node title="Node: an unhandled rejection can be observed" 
process.on("unhandledRejection", (reason) => console.log("unhandled rejection:", reason.message));

Promise.reject(new Error("nobody caught me"));
setTimeout(() => console.log("process still alive because we added a handler"), 10);
```

:::interview How does error handling work in a promise chain? What does catch return?
"If a promise rejects, all `.then(onFulfilled)` handlers are skipped until a rejection handler is found. An exception thrown inside any `then` callback also turns into a rejection of the next promise. `.catch` is just `.then(undefined, onRejected)` and returns a new promise: if it returns normally, the chain recovers and continues in the fulfilled state with that value; if it re-throws, the rejection continues. I put one `.catch` at the end of the chain, and I always `return` inner promises so the chain waits for them. Unhandled rejections crash Node by default."
:::

## More interview questions on this topic

:::qa What happens if you throw inside a `.then` callback? {level=easy}
**Say this:** "The promise returned by that `.then` is rejected with the error, and the chain jumps to the next rejection handler."

**In simple words:** `throw` inside a `then` is the same as returning a rejected promise.
:::

:::qa How does a `.then` callback that returns a promise affect the chain? {level=easy}
**Say this:** "The next promise adopts the returned promise: it waits for it and takes its value or error."

**In simple words:** The chain "pauses" until the inner promise is done.
:::

:::qa What happens after `.catch` returns a value? {level=medium}
**Say this:** "The chain continues in the fulfilled state with that value. `catch` handles the error, so later `.then` callbacks run."

**In simple words:** A catch is a recovery point.
:::

:::qa What is an unhandled promise rejection and what does Node do? {level=medium}
**Say this:** "A rejected promise that nothing handles. Since Node 15 it terminates the process with an error by default. Browsers fire an `unhandledrejection` event."

**In simple words:** Nobody was watching when the promise failed.
:::

```quiz
? What does the next promise in a chain receive if a then callback returns a promise?
- The promise object
+ The value (or error) of that returned promise
- undefined
> The chain waits for it.
? What happens to `.then(onSuccess)` handlers after a rejection?
- They run with undefined
+ They are skipped until a catch handler
- They run twice
> Rejection propagates down the chain.
? What is the problem with `.then(() => { saveUser(); })`, if saveUser returns a promise?
- Nothing
+ The chain does not wait for saveUser: the promise is not returned
- It runs twice
> Missing return (or use an arrow expression without braces).
```

:::keypoints
- Each `then` returns a **new promise**. Returned **value** → fulfil; returned **promise** → follow; **throw** → reject.
- Errors **skip** to the next `catch`. A `catch` that returns normally **recovers** the chain; re-throw to continue failing.
- Always **return** inner promises. Prefer a **flat chain** and one final `.catch`.
- `finally` is for cleanup and passes results through.
- **Unhandled rejections** crash Node (v15+).
:::
