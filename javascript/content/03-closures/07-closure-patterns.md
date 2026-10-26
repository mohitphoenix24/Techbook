---
title: Useful closure patterns
level: intermediate
time: 30
summary: Six small patterns built on closures that show up in real code and in interviews: id generator, memoize, partial application, lazy value, call limiter and a mini store.
---

Closures are the building block of many small helpers. Learn these six, and you will recognise them in libraries like Lodash and Redux.

## 1. A sequence / id generator

```js run title="Each generator has its own counter"
function createIdGenerator(prefix = "id") {
  let next = 1;
  return () => `${prefix}-${next++}`;
}

const userId = createIdGenerator("user");
const orderId = createIdGenerator("order");

console.log(userId(), userId(), orderId(), userId());
```

## 2. Memoize: remember results

A **memoized** function stores the result for each input, so an expensive call is done only once per input.

```js run title="memoize(fn)"
function memoize(fn) {
  const cache = new Map();                          // private, lives in the closure
  return function (arg) {
    if (cache.has(arg)) {
      console.log(`  cache hit for ${arg}`);
      return cache.get(arg);
    }
    const result = fn(arg);
    cache.set(arg, result);
    return result;
  };
}

const slowSquare = (n) => {
  console.log(`  computing ${n} * ${n}`);
  return n * n;
};

const fastSquare = memoize(slowSquare);
console.log(fastSquare(9));
console.log(fastSquare(9));
console.log(fastSquare(12));
```

You will build a full version (many arguments, cache limit, async) in the [memoization lesson](#/l/memoization) and the challenges.

## 3. Partial application

**Partial application** fixes some arguments of a function now, and gives you a new function that waits for the rest.

```js run title="partial(fn, ...fixed)"
function partial(fn, ...fixedArgs) {
  return (...laterArgs) => fn(...fixedArgs, ...laterArgs);
}

function sendEmail(from, to, subject) {
  return `from ${from} to ${to}: ${subject}`;
}

const sendFromSupport = partial(sendEmail, "support@shop.in");
console.log(sendFromSupport("asha@mail.com", "Your order shipped"));
console.log(sendFromSupport("ravi@mail.com", "Refund done"));
```

`Function.prototype.bind` does the same, and also sets `this`.

## 4. Lazy value: compute on first use

```js run title="lazy(fn): do the work only if needed, and only once"
function lazy(factory) {
  let ready = false;
  let value;
  return () => {
    if (!ready) {
      value = factory();
      ready = true;
    }
    return value;
  };
}

const config = lazy(() => {
  console.log("  reading config...");
  return { region: "ap-south-1" };
});

console.log("before first use");
console.log(config().region);
console.log(config().region);
```

This is how many libraries delay a heavy `require` or a database connection until it is really needed.

## 5. A limiter: allow only N calls

```js run title="limit(fn, n)"
function limit(fn, max) {
  let calls = 0;
  return (...args) => {
    if (calls >= max) return `limit of ${max} reached`;
    calls++;
    return fn(...args);
  };
}

const sendOtp = limit((phone) => `OTP sent to ${phone}`, 2);
console.log(sendOtp("98xxxxxx01"));
console.log(sendOtp("98xxxxxx01"));
console.log(sendOtp("98xxxxxx01"));
```

## 6. A tiny store (the idea behind Redux)

```js run title="createStore: state + subscribers in a closure"
function createStore(reducer, initialState) {
  let state = initialState;                         // private
  const listeners = new Set();                      // private

  return {
    getState: () => state,
    dispatch(action) {
      state = reducer(state, action);
      listeners.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);            // unsubscribe closure
    },
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "add":    return { ...state, items: [...state.items, action.item] };
    case "clear":  return { ...state, items: [] };
    default:       return state;
  }
}

const store = createStore(reducer, { items: [] });
const stop = store.subscribe((s) => console.log("state changed:", s.items));

store.dispatch({ type: "add", item: "pen" });
store.dispatch({ type: "add", item: "book" });
stop();
store.dispatch({ type: "clear" });                  // no log: we unsubscribed
console.log("final:", store.getState());
```

Redux, Zustand, and many other state libraries have this same closure at the heart.

## Pattern summary

| Pattern | The closure remembers | Used for |
|---|---|---|
| Id generator | a counter | ids, sequence numbers |
| Memoize | a cache `Map` | expensive pure functions |
| Partial application | fixed arguments | pre-configured functions |
| Lazy value | a flag + the value | delayed work, singletons |
| Limiter | a call count | quotas, once, retries |
| Store | state + listeners | state management |

:::exercise Write `after(n, fn)`
Write `after(n, fn)` that returns a function. The returned function should **ignore** the first `n - 1` calls, and run `fn` from the `n`-th call onwards (this is used to "wait until all N tasks are done").
:::

:::solution
```js run title="after(n, fn)"
function after(n, fn) {
  let calls = 0;
  return (...args) => {
    calls++;
    if (calls >= n) return fn(...args);
  };
}

const allDone = after(3, () => console.log("all 3 tasks finished"));
allDone();
allDone();
allDone();
```
:::

:::interview Name a few practical uses of closures you have written.
"I use them for private state, like a counter or a small store. For memoization, where a cache `Map` lives inside the returned function. For function factories like `makeLogger(level)`. For debounce and throttle, where the timer id lives in the closure. And for partial application and once. In React, every handler and effect is a closure over the render's values, and I have fixed stale closures with functional updates and refs."
:::

## More interview questions on this topic

:::qa What is memoization and how do closures make it work? {level=medium}
**Say this:** "Memoization caches the result of a function for each input. A closure keeps the cache hidden but alive between calls, so the returned function can look up earlier results."

**In simple words:** The function carries a little notebook of answers. Next time, it checks the notebook first.
:::

:::qa What is partial application, and how is it different from currying? {level=medium}
**Say this:** "Partial application fixes some arguments now and returns a function for the rest. Currying turns a function of many arguments into a chain of functions that each take one argument."

**In simple words:** Partial: "set the first two now". Currying: "give me one at a time". You will see currying in the functions module.
:::

:::qa How does a Redux-style store use closures? {level=medium}
**Say this:** "`createStore` keeps `state` and the `listeners` in its closure. `getState`, `dispatch` and `subscribe` are the only ways in, so the state cannot be changed from outside."

**In simple words:** The store is a closure with three buttons.
:::

```quiz
? What does the returned function of `memoize(fn)` remember?
- The first argument only
+ A cache of results for the inputs it has seen
- The global scope
> The cache lives in the closure and persists between calls.
? What is the difference between `partial` and `bind`?
- Nothing at all
+ bind also lets you set `this`; partial here only fixes arguments
- partial runs the function at once
> Both pre-fill arguments, bind additionally sets the this value.
? Why does `createIdGenerator('a')` and `createIdGenerator('b')` not share counters?
- They are the same function
+ Each call creates its own environment with its own `next`
- JavaScript copies the numbers
> A new environment per call.
```

:::keypoints
- Closures give small helpers a **private memory**: counters, caches, flags, listeners.
- Six patterns: id generator, memoize, partial application, lazy value, limiter, store.
- `subscribe` that returns an **unsubscribe function** is a pattern you will meet everywhere.
- Memoize and debounce/throttle are the most common in interviews.
:::
