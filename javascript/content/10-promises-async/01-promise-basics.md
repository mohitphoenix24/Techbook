---
title: Promises: states, creation and consumption
level: intermediate
time: 30
summary: What a promise is, its three states and how it settles once, how to create one with new Promise, how to consume it with then, catch and finally, and why the callbacks run as microtasks.
---

## What is a promise?

> "A **promise** is an object that stands for a value that **is not ready yet**, but will be (or will fail) in the future."

:::analogy A restaurant token
You pay and get a **token**. The token is not the food. It is a **promise of food**. Later, either your order is **ready** (fulfilled) or the kitchen says **sorry, we ran out** (rejected). While you wait, you can do other things. You can also tell the staff what to do when the food arrives: "when it is ready, call my number".
:::

## The three states

```viz algo=state title="The life of a promise"
state pending "Pending" [initial] @0,1
state fulfilled "Fulfilled" [final] @1,0
state rejected "Rejected" [final] @1,2
pending -> fulfilled : resolve(value)
pending -> rejected : reject(error) or throw
play: resolve(value)
```

- **Pending:** the work is in progress.
- **Fulfilled:** it finished with a **value**.
- **Rejected:** it failed with a **reason** (usually an `Error`).

A promise that is fulfilled or rejected is **settled**. Once settled, it **never changes again**: you cannot reject a fulfilled promise or resolve it twice. Calling `resolve` or `reject` again is ignored.

## Creating a promise

```js run title="new Promise((resolve, reject) => {...})"
const promise = new Promise((resolve, reject) => {
  console.log("executor runs immediately (synchronously)");
  setTimeout(() => {
    const ok = true;
    if (ok) resolve("pizza is ready");
    else reject(new Error("kitchen is closed"));
  }, 50);
});

console.log("promise created, state is pending:", promise);

promise.then((value) => console.log("fulfilled with:", value));
```

Notes:

- The **executor** function (the one you pass to `new Promise`) runs **synchronously and immediately**.
- Call `resolve(value)` for success, `reject(error)` for failure.
- If the executor **throws**, the promise is rejected automatically.
- Only the **first** call to `resolve`/`reject` counts.

```js run title="A promise settles once"
const p = new Promise((resolve, reject) => {
  resolve("first");
  resolve("second");                 // ignored
  reject(new Error("too late"));     // ignored
  console.log("the executor still finishes");
});

p.then((v) => console.log("value:", v));

const thrower = new Promise(() => { throw new Error("thrown inside executor"); });
thrower.catch((e) => console.log("rejected by throw:", e.message));
```

## Consuming a promise

| Method | Runs when | Returns |
|---|---|---|
| `.then(onFulfilled, onRejected?)` | fulfilled (or rejected, with the 2nd argument) | a **new promise** |
| `.catch(onRejected)` | rejected | a new promise (same as `.then(undefined, onRejected)`) |
| `.finally(onFinally)` | settled either way (no argument) | a new promise (passes the original value/error through) |

```js run title="then, catch, finally"
const wait = (ms, value, fail) => new Promise((resolve, reject) => setTimeout(() => (fail ? reject(new Error(value)) : resolve(value)), ms));

wait(20, "order #1 delivered")
  .then((v) => console.log("then:", v))
  .catch((e) => console.log("catch:", e.message))
  .finally(() => console.log("finally: close the loading spinner"));

wait(20, "order #2 failed", true)
  .then((v) => console.log("then:", v))
  .catch((e) => console.log("catch:", e.message))
  .finally(() => console.log("finally: close the loading spinner"));
```

## Callbacks always run asynchronously (microtasks)

Even for an **already resolved** promise, the `then` callback does not run immediately. It is scheduled as a **microtask**.

```js run title="then callbacks are always async"
const done = Promise.resolve("ready");

console.log("1 before then");
done.then((v) => console.log("3 then callback:", v));
console.log("2 after then (still synchronous)");
```

This guarantee is one of the main advantages over raw callbacks: you never get code that is "sometimes sync, sometimes async".

## Handy static helpers

```js run title="Promise.resolve, Promise.reject, Promise.withResolvers"
Promise.resolve(42).then((v) => console.log("resolved:", v));
Promise.reject(new Error("no")).catch((e) => console.log("rejected:", e.message));

// If you pass a promise to Promise.resolve, you get the SAME promise back
const p = Promise.resolve(1);
console.log(Promise.resolve(p) === p);

// ES2024: expose resolve/reject without the executor wrapper (useful for events and queues)
const { promise, resolve } = Promise.withResolvers();
setTimeout(() => resolve("from the outside"), 10);
promise.then(console.log);
```

## Thenables

Any object with a `then` method is a **thenable**. `Promise.resolve(thenable)` and `await thenable` will call its `then`. This is how different promise libraries work together.

```js run title="A thenable can be awaited"
const thenable = {
  then(resolve) {
    setTimeout(() => resolve("I am not a real Promise"), 10);
  },
};

(async () => {
  const value = await thenable;
  console.log(value);
})();
```

## Making callback code into a promise (promisify)

```js run title="Wrap a callback API"
function readConfig(callback) {            // an old-style API
  setTimeout(() => callback(null, { port: 3000 }), 10);
}

const readConfigAsync = () => new Promise((resolve, reject) => {
  readConfig((err, data) => (err ? reject(err) : resolve(data)));
});

readConfigAsync().then((cfg) => console.log("port:", cfg.port));
```

## Why promises are better than raw callbacks

| Problem with callbacks | How promises help |
|---|---|
| Can be called twice, or never | A promise **settles once** |
| Sometimes sync, sometimes async | Handlers are **always async** |
| Nested pyramid | **Chaining** is flat |
| Error handling at every level | One **`.catch`** at the end handles errors from the whole chain |
| Hard to combine | `Promise.all`, `race`, `any`, `allSettled` |
| Hard to pass around | A promise is a **value** you can store and return |

:::interview What is a Promise? What are its states and what does it guarantee?
"A promise represents the eventual result of an asynchronous operation. It starts pending, and settles once to either fulfilled with a value or rejected with a reason; after that it never changes. `.then`, `.catch` and `.finally` return new promises, and their callbacks always run asynchronously as microtasks, even if the promise is already settled. The executor passed to `new Promise` runs synchronously. Compared with callbacks, promises settle once, are consistent about timing, chain flatly, and propagate errors along the chain."
:::

## More interview questions on this topic

:::qa Does the Promise executor run synchronously? {level=easy}
**Say this:** "Yes. The function passed to `new Promise` runs immediately. Only the `.then`/`.catch`/`.finally` callbacks are asynchronous."

**In simple words:** Creating the promise starts the work at once; reacting to the result is later.
:::

:::qa What happens if you call `resolve` twice or `resolve` then `reject`? {level=easy}
**Say this:** "Only the first call has an effect. A promise can be settled only once."

**In simple words:** The first answer is final.
:::

:::qa What is the difference between `.then(a, b)` and `.then(a).catch(b)`? {level=medium}
**Say this:** "In `.then(a, b)`, `b` handles only rejections of the original promise, not errors thrown inside `a`. In `.then(a).catch(b)`, `b` also catches errors thrown by `a`."

**In simple words:** The second form covers more mistakes.
:::

:::qa What does `finally` do with its return value? {level=medium}
**Say this:** "Nothing: the original value or error passes through. If `finally` throws or returns a rejected promise, that error replaces the result."

**In simple words:** It is for cleanup, not for changing the result.
:::

```quiz
? When does the executor function of `new Promise` run?
- After the promise is resolved
+ Immediately, synchronously
- In the next microtask
> The executor is called during construction.
? A promise is already fulfilled. When does a new `.then` callback run?
- At once, synchronously
+ Later, as a microtask
- Never
> then callbacks are always async.
? What happens if you call resolve("a") and then reject(err) in the executor?
- Both run
+ Only the first call counts
- An error is thrown
> Promises settle once.
```

:::keypoints
- A promise is **pending → fulfilled** or **rejected**, and it **settles only once**.
- The **executor runs synchronously**; `then`/`catch`/`finally` callbacks run as **microtasks**.
- `then`, `catch`, `finally` return **new promises**, so they chain.
- Throwing in the executor rejects the promise. `Promise.withResolvers()` exposes resolve/reject.
- Promises fix callback problems: settle once, consistent timing, flat chains, error propagation.
:::
