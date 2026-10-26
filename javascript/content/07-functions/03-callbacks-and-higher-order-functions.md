---
title: Callbacks, callback hell and inversion of control
level: intermediate
time: 25
summary: Synchronous and asynchronous callbacks, the error-first convention in Node, why nested callbacks become "callback hell", and the trust problem (inversion of control) that promises solve.
---

## Two kinds of callbacks

A **callback** is a function passed to another function to be called later.

| Kind | Called... | Examples |
|---|---|---|
| **Synchronous** | immediately, during the call | `map`, `filter`, `forEach`, `sort(compare)`, `replace(re, fn)` |
| **Asynchronous** | later, after the current code finishes | `setTimeout`, `fs.readFile`, event handlers, `fetch().then(fn)` |

```js run title="Sync vs async callbacks"
console.log("start");

[1, 2].forEach((n) => console.log("sync callback", n));       // runs right now

setTimeout(() => console.log("async callback"), 0);            // runs later

console.log("end");
```

A function that takes a callback should be **consistent**: either always call it synchronously or always asynchronously. Mixing them is a classic source of bugs (nicknamed "releasing Zalgo").

```js run title="Zalgo: sometimes sync, sometimes async (bad)"
const cache = new Map();

function getData(key, callback) {
  if (cache.has(key)) return callback(cache.get(key));        // sync when cached!
  setTimeout(() => { cache.set(key, key.toUpperCase()); callback(cache.get(key)); }, 10);   // async otherwise
}

function run(key) {
  let order = "";
  getData(key, () => { order += "callback "; });
  order += "after ";
  return new Promise((r) => setTimeout(() => r(order), 30));
}

(async () => {
  console.log(await run("a"));       // not cached: "after callback"
  console.log(await run("a"));       // cached: "callback after": a different order!
})();
```

The fix: always make it async, for example with `queueMicrotask(() => callback(...))` or by using promises.

## The error-first convention (Node.js)

Node's older APIs call the callback with `(error, result)`. If `error` is not `null`, something failed.

```js run title="Error-first callbacks"
function divide(a, b, callback) {
  setTimeout(() => {
    if (b === 0) return callback(new Error("cannot divide by zero"));
    callback(null, a / b);
  }, 0);
}

divide(10, 2, (err, result) => {
  if (err) return console.log("error:", err.message);
  console.log("result:", result);
});

divide(1, 0, (err, result) => {
  if (err) return console.log("error:", err.message);
  console.log("result:", result);
});
```

Rules: the callback is the **last** argument; the first argument is the error; call it **once**; never throw from an async callback (the caller cannot catch it).

## Callback hell

Doing step 2 after step 1, step 3 after step 2, and so on, makes the code drift to the right: the **pyramid of doom**.

```js run title="Callback hell"
const wait = (ms, value, cb) => setTimeout(() => cb(null, value), ms);

wait(10, "user", (err, user) => {
  if (err) return console.log(err);
  wait(10, user + "-profile", (err, profile) => {
    if (err) return console.log(err);
    wait(10, profile + "-orders", (err, orders) => {
      if (err) return console.log(err);
      wait(10, orders + "-recommendations", (err, recs) => {
        if (err) return console.log(err);
        console.log("done:", recs);
      });
    });
  });
});
```

Problems: hard to read, **error handling is repeated** at every level, hard to run steps in parallel, hard to add a step, hard to return values.

### Ways out

1. **Name your functions** and keep nesting shallow.
2. **Promisify** and use **promises** and **`async/await`** (the best answer today).

```js run title="The same flow with promises and async/await"
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

async function load() {
  const user = await wait(10, "user");
  const profile = await wait(10, user + "-profile");
  const orders = await wait(10, profile + "-orders");
  const recs = await wait(10, orders + "-recommendations");
  return recs;
}

load().then((recs) => console.log("done:", recs)).catch(console.error);
```

## Inversion of control: the trust problem

When you give your callback to **someone else's code**, you give up control of **when and how often it is called**. This is the real problem with callbacks.

What could go wrong when you pass a callback to a payment library?

- It might call your callback **twice** (you charge the customer twice).
- It might **never** call it.
- It might call it **too early** or **too late**.
- It might swallow errors, or pass the wrong arguments.

```js run title="A badly behaved library calls your callback twice"
function untrustedCharge(amount, onSuccess) {
  onSuccess(`charged ${amount}`);
  onSuccess(`charged ${amount}`);        // a bug in a library you do not control
}

let charges = 0;
untrustedCharge(500, () => { charges++; });
console.log("charges made:", charges);
```

**Promises fix this.** A promise can be settled **only once**, its callbacks run **asynchronously and always**, and errors are passed on in a standard way. You will see this in module 10.

## Making a callback function safe

If you must write callback-taking code, you can protect yourself:

```js run title="A once() guard"
function once(fn) {
  let called = false;
  return (...args) => {
    if (called) return;
    called = true;
    return fn(...args);
  };
}

let charges = 0;
const safe = once(() => { charges++; });
safe(); safe();
console.log("charges made:", charges);
```

## Promisify: wrapping a callback API in a promise

```js run title="util.promisify and a hand-made version"
const { promisify } = require("node:util");

function legacyAdd(a, b, callback) {
  setTimeout(() => callback(null, a + b), 5);
}

// built in
const addAsync = promisify(legacyAdd);

// by hand
function promisifyByHand(fn) {
  return (...args) => new Promise((resolve, reject) => {
    fn(...args, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

(async () => {
  console.log(await addAsync(2, 3), await promisifyByHand(legacyAdd)(4, 5));
})();
```

:::interview What is callback hell and how do you avoid it? What is inversion of control?
"Callback hell is deeply nested callbacks for sequential async steps: the code drifts right, error handling is repeated at every level, and it is hard to read, extend or parallelise. I avoid it with promises and async/await, small named functions, and promisify for old APIs. Inversion of control is the deeper problem: by passing a callback to third-party code I give up control of when, how many times, or whether it is called. Promises restore trust because they settle once and always call handlers asynchronously."
:::

## More interview questions on this topic

:::qa What is the error-first callback pattern? {level=easy}
**Say this:** "The callback's first parameter is an error (or `null`) and the following parameters are results: `callback(err, data)`. It is the convention in older Node APIs."

**In simple words:** Check the first argument before using the result.
:::

:::qa Why shouldn't a function call its callback sometimes synchronously and sometimes asynchronously? {level=hard}
**Say this:** "The order of operations becomes unpredictable: code after the call may run before or after the callback depending on a cache or a condition. Be consistently async, with `queueMicrotask` or promises."

**In simple words:** The caller cannot rely on what runs first.
:::

:::qa How do you convert a callback-based function to a promise? {level=medium}
**Say this:** "Wrap it in `new Promise`, call the function with a callback that calls `reject` on error or `resolve` with the result. In Node I can use `util.promisify` for error-first callbacks."

**In simple words:** Turn "call me back" into "give me a promise".
:::

:::qa Why are promises more trustworthy than callbacks? {level=medium}
**Say this:** "A promise settles once, its `.then` handlers are always called asynchronously, and errors flow along the chain. With a callback I trust the other code to call it correctly."

**In simple words:** The promise is the referee. It guarantees the rules.
:::

```quiz
? What is the first argument of an error-first callback?
- The result
+ The error or null
- The callback itself
> Check it first.
? What is inversion of control with callbacks?
- Running callbacks in reverse
+ Handing control of when and how often your code runs to third-party code
- Using callbacks inside classes
> You trust someone else to call your function properly.
? Which tool turns an error-first callback API into a promise API in Node?
- util.inspect
+ util.promisify
- fs.watch
> It wraps the callback in a promise.
```

:::keypoints
- Callbacks can be **synchronous** (`map`) or **asynchronous** (`setTimeout`). Be consistent, never mixed.
- Node's **error-first** convention: `callback(err, result)`.
- **Callback hell** = deep nesting, repeated error handling. Fix with **promises/async-await**, naming, `promisify`.
- **Inversion of control**: callbacks hand control to others (may be called twice, never or late). Promises restore trust.
:::
